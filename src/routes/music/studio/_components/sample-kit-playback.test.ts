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
    const sound = { loadDrumKit: vi.fn(async () => undefined), playDrum: vi.fn() };
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
});
