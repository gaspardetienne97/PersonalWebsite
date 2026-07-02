import { describe, expect, test, vi } from "vite-plus/test";
import { render } from "vitest-browser-svelte";

import type { MusicRuntime } from "../../_runtime.svelte";
import { SampleKitPlaybackController } from "../../studio/_components/sample-kit-playback";
import Panel from "./StudioPanel.svelte";

function padAsset(midi: number) {
  return {
    id: `s${midi}`,
    fileName: `p${midi}.wav`,
    displayName: `P${midi}`,
    mimeType: "audio/wav",
    size: 1,
    binaryKey: `k/s${midi}`,
  };
}

function fakeSampleKits(pads: number[]) {
  const kit = {
    id: "k",
    name: "Kit",
    createdAt: 1,
    updatedAt: 1,
    samples: pads.map(padAsset),
    assignments: pads.map((midi) => ({ midiNote: midi, sampleId: `s${midi}`, label: `P${midi}` })),
  };
  const resolved = {
    kit,
    samples: kit.samples.map((asset) => ({
      asset,
      blob: new Blob(["x"], { type: "audio/wav" }),
      status: "available" as const,
    })),
  };
  return {
    load: async () => [kit],
    create: async () => kit,
    rename: async () => kit,
    importFiles: async () => kit,
    assign: async () => kit,
    unassign: async () => kit,
    deleteSample: async () => kit,
    deleteKit: async () => undefined,
    resolvePlayback: async () => resolved,
  };
}

function makeStudioRuntime(pads: number[]) {
  const sound = {
    playNote: vi.fn(),
    startPatternLoop: vi.fn(),
    stopPatternLoop: vi.fn(),
    startDrumPatternLoop: vi.fn(),
    stopDrumPatternLoop: vi.fn(),
    loadDrumKit: vi.fn(async () => undefined),
    playDrum: vi.fn(),
  };
  const playbackSources: Array<{ play: () => Promise<void> | void; stop?: () => void }> = [];
  const listeners: Array<(event: { type: string; midiNote: number; velocity: number }) => void> =
    [];
  const routerUnsubscribe = vi.fn();
  const runtime = {
    audioEnabled: true,
    transportBpm: 96,
    enableAudio: vi.fn(async () => true),
    readLocalState: vi.fn(async () => undefined),
    writeLocalState: vi.fn(async () => undefined),
    setPlaybackSource: vi.fn((source?: { play: () => Promise<void> | void; stop?: () => void }) => {
      if (source) playbackSources.push(source);
    }),
    sound,
    sampleKits: fakeSampleKits(pads),
    router: {
      subscribe: (listener: (typeof listeners)[number]) => (
        listeners.push(listener),
        routerUnsubscribe
      ),
    },
  };
  const playback = new SampleKitPlaybackController({
    sound,
    createObjectURL: () => "blob:x",
    revokeObjectURL: () => undefined,
    canDecode: async () => true,
  });
  return { runtime, sound, playback, playbackSources, listeners, routerUnsubscribe };
}

function studioButton(label: string): HTMLButtonElement | undefined {
  return [...document.querySelectorAll<HTMLButtonElement>("button")].find(
    (candidate) => candidate.textContent?.trim() === label,
  );
}

describe("StudioPanel", () => {
  test("renders the sequencer grid and pad bank", () => {
    render(Panel);
    expect(document.body.textContent).toContain("Studio");
    expect(document.body.textContent).toContain("Sequencer");
    expect(document.body.textContent).toContain("Pad bank");
    // 6 rows x 16 steps of step buttons
    expect(document.querySelectorAll('button[aria-label^="Kick step"]').length).toBe(16);
  });

  test("exports the pattern as a MIDI download", () => {
    const createSpy = vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:midi");
    const revokeSpy = vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => undefined);
    const clickSpy = vi
      .spyOn(HTMLAnchorElement.prototype, "click")
      .mockImplementation(() => undefined);
    render(Panel);

    studioButton("Export MIDI")!.click();
    expect(createSpy).toHaveBeenCalledTimes(1);
    expect(clickSpy).toHaveBeenCalledTimes(1);

    createSpy.mockRestore();
    revokeSpy.mockRestore();
    clickSpy.mockRestore();
  });

  test("exports the pattern as a WAV download", async () => {
    const createSpy = vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:wav");
    const revokeSpy = vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => undefined);
    const clickSpy = vi
      .spyOn(HTMLAnchorElement.prototype, "click")
      .mockImplementation(() => undefined);
    render(Panel);

    studioButton("Export WAV")!.click();
    await vi.waitFor(() => expect(clickSpy).toHaveBeenCalledTimes(1));
    const downloaded = createSpy.mock.calls.at(-1)?.[0] as Blob;
    expect(downloaded.type).toBe("audio/wav");
    expect(downloaded.size).toBeGreaterThan(44);

    createSpy.mockRestore();
    revokeSpy.mockRestore();
    clickSpy.mockRestore();
  });

  test("saves the beat-grid pattern to Song Studio", async () => {
    const savedScores: unknown[] = [];
    const library = {
      saveScore: vi.fn(async (score: unknown) => {
        savedScores.push(score);
        return { id: "song-beat", title: "Studio Pattern" };
      }),
    };
    const harness = makeStudioRuntime([]);

    render(Panel, {
      runtime: harness.runtime as unknown as MusicRuntime,
      playback: harness.playback,
      library,
    });

    studioButton("Save to Song Studio")?.click();

    await vi.waitFor(() => expect(document.body.textContent).toContain("Saved to Song Studio."));
    expect(library.saveScore).toHaveBeenCalledTimes(1);
    expect(savedScores[0]).toEqual(
      expect.objectContaining({
        title: "Studio Pattern",
        origin: "generated",
        sections: [{ id: "loop", name: "Beat loop", startBeat: 0, endBeat: 4 }],
        notes: expect.arrayContaining([
          expect.objectContaining({
            midiNote: 36,
            startBeat: 0,
            durationBeats: 0.25,
            voiceId: "kick",
          }),
        ]),
      }),
    );
    expect(
      document.querySelector<HTMLAnchorElement>('a[href="/music/songs/song-beat"]')?.textContent,
    ).toContain("Open Song Studio");
  });

  test("toggles a step cell", async () => {
    render(Panel);
    const cell = document.querySelector<HTMLButtonElement>('button[aria-label="Snare step 1"]');
    expect(cell).not.toBeNull();
    const before = cell?.getAttribute("aria-pressed");
    cell?.click();
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(cell?.getAttribute("aria-pressed")).not.toBe(before);
  });

  test("registers the sequencer pattern with the shared transport", async () => {
    const playbackSources: Array<{
      label: string;
      play: () => Promise<void> | void;
      stop?: () => void;
    }> = [];
    const runtime = {
      audioEnabled: true,
      playbackPlaying: false,
      transportBpm: 96,
      enableAudio: vi.fn(async () => true),
      readLocalState: vi.fn(async () => undefined),
      writeLocalState: vi.fn(async () => undefined),
      setPlaybackSource: vi.fn((source) => {
        if (source) playbackSources.push(source);
      }),
      sound: {
        playNote: vi.fn(),
        startPatternLoop: vi.fn(),
        stopPatternLoop: vi.fn(),
        startDrumPatternLoop: vi.fn(),
        stopDrumPatternLoop: vi.fn(),
        loadDrumKit: vi.fn(async () => undefined),
        playDrum: vi.fn(),
      },
    };

    render(Panel, { runtime: runtime as unknown as MusicRuntime });

    await vi.waitFor(() => expect(playbackSources).toHaveLength(1));
    await playbackSources[0]!.play();

    expect(runtime.enableAudio).toHaveBeenCalled();
    const [steps, durationSec] = runtime.sound.startPatternLoop.mock.calls[0]!;
    expect(steps).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          midiNotes: expect.arrayContaining([36]),
          offsetSeconds: 0,
        }),
      ]),
    );
    expect(durationSec).toBeGreaterThan(0);

    playbackSources[0]!.stop?.();
    expect(runtime.sound.stopPatternLoop).toHaveBeenCalled();
  });

  test("loads and saves the Studio pattern through runtime local state", async () => {
    const savedPattern = {
      steps: 16,
      rows: [{ id: "snare", steps: [0] }],
    };
    const runtime = {
      audioEnabled: true,
      playbackPlaying: false,
      transportBpm: 96,
      enableAudio: vi.fn(async () => true),
      readLocalState: vi.fn(async () => savedPattern),
      writeLocalState: vi.fn(async () => undefined),
      setPlaybackSource: vi.fn(),
      sound: {
        playNote: vi.fn(),
        startPatternLoop: vi.fn(),
        stopPatternLoop: vi.fn(),
        startDrumPatternLoop: vi.fn(),
        stopDrumPatternLoop: vi.fn(),
        loadDrumKit: vi.fn(async () => undefined),
        playDrum: vi.fn(),
      },
    };

    render(Panel, { runtime: runtime as unknown as MusicRuntime });

    const snareStep1 = document.querySelector<HTMLButtonElement>(
      'button[aria-label="Snare step 1"]',
    );
    const snareStep2 = document.querySelector<HTMLButtonElement>(
      'button[aria-label="Snare step 2"]',
    );
    const kickStep1 = document.querySelector<HTMLButtonElement>('button[aria-label="Kick step 1"]');

    await vi.waitFor(() => expect(snareStep1).toHaveAttribute("aria-pressed", "true"));
    expect(kickStep1).toHaveAttribute("aria-pressed", "false");

    snareStep2?.click();

    await vi.waitFor(() =>
      expect(runtime.writeLocalState).toHaveBeenCalledWith(
        "music.studio.boom-bap",
        expect.objectContaining({
          steps: 16,
          rows: expect.arrayContaining([
            expect.objectContaining({
              id: "snare",
              steps: [0, 1],
            }),
          ]),
        }),
      ),
    );
  });

  test("auditions assigned MPC notes and ignores unrelated notes", async () => {
    const harness = makeStudioRuntime([36]);
    render(Panel, {
      runtime: harness.runtime as unknown as MusicRuntime,
      playback: harness.playback,
    });

    await vi.waitFor(() => expect(studioButton("Activate kit")).not.toBeUndefined());
    studioButton("Activate kit")!.click();
    await vi.waitFor(() => expect(harness.sound.loadDrumKit).toHaveBeenCalled());

    harness.listeners[0]!({ type: "noteOn", midiNote: 36, velocity: 0.65 });
    harness.listeners[0]!({ type: "noteOn", midiNote: 60, velocity: 0.65 });

    expect(harness.sound.playDrum).toHaveBeenCalledWith("pad-36", undefined, 0.65);
    expect(harness.sound.playNote).not.toHaveBeenCalled();
  });

  test("loops assigned rows as samples and unassigned rows as synth fallback", async () => {
    const harness = makeStudioRuntime([36, 38]);
    render(Panel, {
      runtime: harness.runtime as unknown as MusicRuntime,
      playback: harness.playback,
    });

    await vi.waitFor(() => expect(studioButton("Activate kit")).not.toBeUndefined());
    studioButton("Activate kit")!.click();
    await vi.waitFor(() => expect(harness.sound.loadDrumKit).toHaveBeenCalled());

    await harness.playbackSources[0]!.play();

    expect(harness.sound.startDrumPatternLoop).toHaveBeenCalledWith(
      expect.arrayContaining([expect.objectContaining({ padIds: ["pad-36"], offsetSeconds: 0 })]),
      expect.any(Number),
      0.9,
    );
    expect(harness.sound.startPatternLoop).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({ midiNotes: expect.arrayContaining([42]) }),
      ]),
      expect.any(Number),
      0.9,
    );
  });

  test("stops both playback paths and disposes sample URLs on route teardown", () => {
    const harness = makeStudioRuntime([36]);
    const disposeSpy = vi.spyOn(harness.playback, "dispose");
    const { unmount } = render(Panel, {
      runtime: harness.runtime as unknown as MusicRuntime,
      playback: harness.playback,
    });

    unmount();
    expect(harness.sound.stopDrumPatternLoop).toHaveBeenCalled();
    expect(harness.sound.stopPatternLoop).toHaveBeenCalled();
    expect(disposeSpy).toHaveBeenCalled();
    expect(harness.routerUnsubscribe).toHaveBeenCalled();
  });
});
