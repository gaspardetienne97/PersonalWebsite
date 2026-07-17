import { describe, expect, test, vi } from "vitest";

import type { ResolvedSampleKit } from "@repo/music-core/engines/sample-kit";

import { SampleKitPlaybackController } from "./sample-kit-playback";

interface Entry {
  midi: number;
  sampleId: string;
  blob?: Blob;
  status: "available" | "missing";
}

function available(midi: number, sampleId: string, text: string): Entry {
  return { midi, sampleId, blob: new Blob([text]), status: "available" };
}

function missing(midi: number, sampleId: string): Entry {
  return { midi, sampleId, status: "missing" };
}

function asset(id: string) {
  return {
    id,
    fileName: `${id}.wav`,
    displayName: id,
    mimeType: "audio/wav",
    size: 1,
    binaryKey: `k/${id}`,
  };
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((settle) => {
    resolve = settle;
  });
  return { promise, resolve };
}

function resolvedKit(entries: Entry[]): ResolvedSampleKit {
  return {
    kit: {
      id: "k",
      name: "Kit",
      createdAt: 1,
      updatedAt: 1,
      samples: entries.map((entry) => asset(entry.sampleId)),
      assignments: entries.map((entry) => ({
        midiNote: entry.midi as never,
        sampleId: entry.sampleId,
        label: entry.sampleId,
      })),
    },
    samples: entries.map((entry) => ({
      asset: asset(entry.sampleId),
      blob: entry.blob,
      status: entry.status,
    })),
  };
}

describe("SampleKitPlaybackController", () => {
  test("loads only playable pads and revokes the previous kit after replacement", async () => {
    const sound = {
      loadDrumKit: vi.fn(async () => undefined),
      playDrum: vi.fn(),
      stopDrum: vi.fn(),
    };
    const urls: string[] = [];
    const revoked: string[] = [];
    const controller = new SampleKitPlaybackController({
      sound,
      createObjectURL: () => {
        const url = `blob:${urls.length + 1}`;
        urls.push(url);
        return url;
      },
      revokeObjectURL: (url) => revoked.push(url),
      canDecode: async (blob) => (await blob.text()) !== "bad",
    });

    const active = await controller.activate(
      resolvedKit([
        available(36, "kick", "good"),
        available(38, "snare", "bad"),
        missing(42, "hat"),
      ]),
    );
    expect(active.pads.map(({ status }) => status)).toEqual(["playable", "export-only", "missing"]);
    expect(sound.loadDrumKit).toHaveBeenCalledWith([
      expect.objectContaining({ padId: "pad-36", midiNote: 36 }),
    ]);
    expect(controller.playMidi(36, 0.7)).toBe(true);
    expect(sound.playDrum).toHaveBeenCalledWith("pad-36", undefined, 0.7);
    expect(controller.playMidi(38, 0.7)).toBe(false);
    expect(controller.padIdForMidi(36)).toBe("pad-36");
    expect(controller.padIdForMidi(38)).toBeUndefined();

    await controller.activate(resolvedKit([available(39, "clap", "good")]));
    expect(revoked).toHaveLength(1);
    controller.dispose();
    expect(revoked).toHaveLength(2);
  });

  test("keeps the prior kit and revokes only new urls when loading fails", async () => {
    const sound = {
      loadDrumKit: vi
        .fn()
        .mockResolvedValueOnce(undefined)
        .mockRejectedValueOnce(new Error("decode failed")),
      playDrum: vi.fn(),
      stopDrum: vi.fn(),
    };
    const revoked: string[] = [];
    let counter = 0;
    const controller = new SampleKitPlaybackController({
      sound,
      createObjectURL: () => `blob:${(counter += 1)}`,
      revokeObjectURL: (url) => revoked.push(url),
      canDecode: async () => true,
    });

    await controller.activate(resolvedKit([available(36, "kick", "good")]));
    await expect(
      controller.activate(resolvedKit([available(38, "snare", "good")])),
    ).rejects.toThrow("decode failed");

    // the failed load revoked only its own new url; the prior kit stays active
    expect(revoked).toEqual(["blob:2"]);
    expect(controller.playMidi(36, 0.8)).toBe(true);
  });

  test("keeps only the latest activation when drum loads resolve in reverse order", async () => {
    const firstLoad = deferred<void>();
    const secondLoad = deferred<void>();
    const sound = {
      loadDrumKit: vi
        .fn()
        .mockReturnValueOnce(firstLoad.promise)
        .mockReturnValueOnce(secondLoad.promise),
      playDrum: vi.fn(),
      stopDrum: vi.fn(),
    };
    const revoked: string[] = [];
    let counter = 0;
    const controller = new SampleKitPlaybackController({
      sound,
      createObjectURL: () => `blob:${(counter += 1)}`,
      revokeObjectURL: (url) => revoked.push(url),
      canDecode: async () => true,
    });

    const first = controller.activate(resolvedKit([available(36, "kick", "kick")]));
    await vi.waitFor(() => expect(sound.loadDrumKit).toHaveBeenCalledTimes(1));
    const second = controller.activate(resolvedKit([available(38, "snare", "snare")]));
    await vi.waitFor(() => expect(sound.loadDrumKit).toHaveBeenCalledTimes(2));

    secondLoad.resolve();
    await second;
    firstLoad.resolve();
    await expect(first).rejects.toThrow(/cancelled/i);

    expect(revoked).toEqual(["blob:1"]);
    expect(controller.playMidi(36, 0.8)).toBe(false);
    expect(controller.playMidi(38, 0.8)).toBe(true);
  });

  test("revokes staged urls when disposal wins a pending activation", async () => {
    const loading = deferred<void>();
    const sound = {
      loadDrumKit: vi.fn(() => loading.promise),
      playDrum: vi.fn(),
      stopDrum: vi.fn(),
    };
    const revoked: string[] = [];
    const controller = new SampleKitPlaybackController({
      sound,
      createObjectURL: () => "blob:staged",
      revokeObjectURL: (url) => revoked.push(url),
      canDecode: async () => true,
    });

    const activation = controller.activate(resolvedKit([available(36, "kick", "kick")]));
    await vi.waitFor(() => expect(sound.loadDrumKit).toHaveBeenCalledOnce());
    controller.dispose();
    loading.resolve();
    await expect(activation).rejects.toThrow(/cancelled/i);

    expect(revoked).toEqual(["blob:staged"]);
    expect(controller.playMidi(36, 0.8)).toBe(false);
  });

  test("loads velocity layers and chooses the layer from hit velocity", async () => {
    const sound = {
      loadDrumKit: vi.fn(async () => undefined),
      playDrum: vi.fn(),
      stopDrum: vi.fn(),
    };
    const controller = new SampleKitPlaybackController({
      sound,
      createObjectURL: (blob) => `blob:${blob.size}`,
      revokeObjectURL: vi.fn(),
      canDecode: async () => true,
    });
    const resolved = resolvedKit([available(36, "soft", "s"), available(37, "hard", "hard")]);
    resolved.kit.assignments = [
      {
        midiNote: 36,
        sampleId: "soft",
        label: "Kick",
        velocityLayers: [
          { sampleId: "soft", label: "Soft", minVelocity: 0, maxVelocity: 0.49 },
          { sampleId: "hard", label: "Hard", minVelocity: 0.5, maxVelocity: 1 },
        ],
      },
    ];

    const active = await controller.activate(resolved);

    expect(active.pads[0]?.layers).toEqual([
      expect.objectContaining({ sampleId: "soft", status: "playable" }),
      expect.objectContaining({ sampleId: "hard", status: "playable" }),
    ]);
    expect(sound.loadDrumKit).toHaveBeenCalledWith([
      expect.objectContaining({ padId: "pad-36-layer-1", midiNote: 36 }),
      expect.objectContaining({ padId: "pad-36-layer-2", midiNote: 36 }),
    ]);
    expect(controller.playMidi(36, 0.2)).toBe(true);
    expect(sound.playDrum).toHaveBeenLastCalledWith("pad-36-layer-1", undefined, 0.2);
    expect(controller.playMidi(36, 0.9)).toBe(true);
    expect(sound.playDrum).toHaveBeenLastCalledWith("pad-36-layer-2", undefined, 0.9);
  });

  test("stops other playable pads in the same choke group before playing", async () => {
    const sound = {
      loadDrumKit: vi.fn(async () => undefined),
      playDrum: vi.fn(),
      stopDrum: vi.fn(),
    };
    const controller = new SampleKitPlaybackController({
      sound,
      createObjectURL: (blob) => `blob:${blob.size}`,
      revokeObjectURL: vi.fn(),
      canDecode: async () => true,
    });
    const resolved = resolvedKit([
      available(42, "closed", "closed"),
      available(46, "open", "open"),
      available(49, "crash", "crash"),
    ]);
    resolved.kit.assignments[0]!.chokeGroup = 1;
    resolved.kit.assignments[1]!.chokeGroup = 1;

    await controller.activate(resolved);
    expect(controller.playMidi(46, 0.8)).toBe(true);

    expect(sound.stopDrum).toHaveBeenCalledWith("pad-42", undefined);
    expect(sound.stopDrum).not.toHaveBeenCalledWith("pad-49", undefined);
    expect(sound.playDrum).toHaveBeenCalledWith("pad-46", undefined, 0.8);
  });
});
