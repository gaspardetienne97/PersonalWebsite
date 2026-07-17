import { monotonicMs, unixMs } from "@repo/music-core/domain";
import type { MediaUsage } from "@repo/music-core/engines/media-library";
import type { AudioTakeRow } from "@repo/music-core/engines/store";
import { RecordingSession } from "@repo/music-core/engines/recording";
import { AudioTakeRecorder } from "@repo/music-core/engines/audio-recording";
import { afterEach, beforeEach, describe, expect, test, vi } from "vite-plus/test";
import { render } from "vitest-browser-svelte";
import { tick } from "svelte";

import { MusicRuntime } from "../../_runtime.svelte";
import Panel from "./RecorderPanel.svelte";

function button(match: string): HTMLButtonElement | undefined {
  return [...document.querySelectorAll<HTMLButtonElement>("button")].find((candidate) =>
    candidate.textContent?.includes(match),
  );
}

class ReviewAudio {
  volume = 1;
  onended: ((event: Event) => void) | null = null;
  onerror: ((event: Event) => void) | null = null;
  readonly play = vi.fn(async () => undefined);
  readonly pause = vi.fn();
}

beforeEach(() => {
  vi.spyOn(MusicRuntime.prototype, "ensurePlaybackVoice").mockResolvedValue(true);
  vi.spyOn(MusicRuntime.prototype, "beginPerformance").mockResolvedValue({
    status: "started",
    downbeat: monotonicMs(0),
  });
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("RecorderPanel", () => {
  test("renders takes, compare, and capture surfaces", () => {
    render(Panel);
    expect(document.body.textContent).toContain("Recording & Self-Review");
    expect(document.body.textContent).toContain("Takes");
    expect(document.body.textContent).toContain("No takes yet");
    expect(
      document.querySelector('[role="group"][aria-label="On-screen keyboard"]'),
    ).not.toBeNull();
  });

  test("records an on-screen take and lists it", async () => {
    render(Panel);
    button("New recording")?.click();
    await vi.waitFor(() => expect(button("Stop")).not.toBeUndefined());

    const c4 = [...document.querySelectorAll<HTMLButtonElement>("button")].find(
      (candidate) => candidate.textContent?.trim() === "C4",
    );
    c4?.click();
    await vi.waitFor(() => expect(button("Stop · 1")).not.toBeUndefined());

    button("Stop")?.click();
    await vi.waitFor(() => expect(document.body.textContent).toContain("Take 1"));
    expect(document.body.textContent).toContain("1 notes");
  });

  test("starts MIDI-only recording only after the shared downbeat", async () => {
    const runtime = new MusicRuntime();
    let resolve!: (result: Awaited<ReturnType<MusicRuntime["beginPerformance"]>>) => void;
    vi.spyOn(runtime, "beginPerformance").mockReturnValue(
      new Promise((settle) => {
        resolve = settle;
      }),
    );
    const start = vi.spyOn(RecordingSession.prototype, "start");
    const audioStart = vi.spyOn(AudioTakeRecorder.prototype, "start");
    render(Panel, { runtime });

    button("New recording")?.click();
    await vi.waitFor(() => expect(runtime.beginPerformance).toHaveBeenCalledOnce());
    expect(start).not.toHaveBeenCalled();

    resolve({ status: "started", downbeat: monotonicMs(1_234) });
    await vi.waitFor(() => expect(start).toHaveBeenCalledWith(1_234));
    expect(audioStart).not.toHaveBeenCalled();
    expect(button("Stop")).not.toBeUndefined();
  });

  test("retains a pending microphone request until audio and MIDI can start together", async () => {
    const runtime = new MusicRuntime();
    const register = vi.spyOn(runtime, "registerPracticeContext");
    let resolvePrepare!: () => void;
    vi.spyOn(AudioTakeRecorder.prototype, "prepare").mockReturnValue(
      new Promise((resolve) => {
        resolvePrepare = resolve;
      }),
    );
    const audioStart = vi.spyOn(AudioTakeRecorder.prototype, "start").mockImplementation(() => {});
    const midiStart = vi.spyOn(RecordingSession.prototype, "start");
    render(Panel, { runtime });

    document.querySelector<HTMLButtonElement>('[aria-label="Arm microphone"]')?.click();
    await vi.waitFor(() => expect(AudioTakeRecorder.prototype.prepare).toHaveBeenCalledOnce());
    button("New recording")?.click();
    await Promise.resolve();

    expect(runtime.beginPerformance).not.toHaveBeenCalled();
    expect(audioStart).not.toHaveBeenCalled();
    expect(midiStart).not.toHaveBeenCalled();

    resolvePrepare();
    await vi.waitFor(() => expect(audioStart).toHaveBeenCalledOnce());
    expect(midiStart).toHaveBeenCalledOnce();
    expect(register).toHaveBeenCalledWith(
      expect.objectContaining({ variantKey: "v1:recording:piano:midi-audio" }),
    );
  });

  test("starts MIDI and audio while microphone device labels are still refreshing", async () => {
    const runtime = new MusicRuntime();
    let resolvePrepare!: () => void;
    let resolveDevices!: (devices: MediaDeviceInfo[]) => void;
    vi.spyOn(AudioTakeRecorder.prototype, "devices").mockReturnValue(
      new Promise((resolve) => {
        resolveDevices = resolve;
      }),
    );
    vi.spyOn(AudioTakeRecorder.prototype, "prepare").mockReturnValue(
      new Promise((resolve) => {
        resolvePrepare = resolve;
      }),
    );
    const audioStart = vi.spyOn(AudioTakeRecorder.prototype, "start").mockImplementation(() => {});
    const midiStart = vi.spyOn(RecordingSession.prototype, "start");
    render(Panel, { runtime });

    document.querySelector<HTMLButtonElement>('[aria-label="Arm microphone"]')?.click();
    await vi.waitFor(() => expect(AudioTakeRecorder.prototype.prepare).toHaveBeenCalledOnce());
    button("New recording")?.click();
    resolvePrepare();

    await vi.waitFor(() => expect(runtime.beginPerformance).toHaveBeenCalledOnce());
    expect(audioStart).toHaveBeenCalledOnce();
    expect(midiStart).toHaveBeenCalledOnce();
    resolveDevices([]);
  });

  test("keeps microphone capture ready when the device-label refresh fails", async () => {
    const runtime = new MusicRuntime();
    vi.spyOn(AudioTakeRecorder.prototype, "devices").mockRejectedValue(
      new Error("Device labels unavailable."),
    );
    vi.spyOn(AudioTakeRecorder.prototype, "prepare").mockResolvedValue();
    const audioStart = vi.spyOn(AudioTakeRecorder.prototype, "start").mockImplementation(() => {});
    const midiStart = vi.spyOn(RecordingSession.prototype, "start");
    render(Panel, { runtime });

    document.querySelector<HTMLButtonElement>('[aria-label="Arm microphone"]')?.click();
    await vi.waitFor(() =>
      expect(document.querySelector('[aria-label="Disarm microphone"]')).not.toBeNull(),
    );
    button("New recording")?.click();

    await vi.waitFor(() => expect(audioStart).toHaveBeenCalledOnce());
    expect(midiStart).toHaveBeenCalledOnce();
    expect(document.body.textContent).not.toContain("Device labels unavailable.");
  });

  test("unwinds MIDI and the practice clock when requested audio cannot start", async () => {
    const runtime = new MusicRuntime();
    const endPerformance = vi.spyOn(runtime, "endPerformance");
    const midiStart = vi.spyOn(RecordingSession.prototype, "start");
    const midiStop = vi.spyOn(RecordingSession.prototype, "stop");
    vi.spyOn(AudioTakeRecorder.prototype, "prepare").mockResolvedValue();
    vi.spyOn(AudioTakeRecorder.prototype, "start").mockImplementation(() => {
      throw new Error("Audio recorder could not start.");
    });
    const writeLocalState = vi.spyOn(runtime, "writeLocalState");
    render(Panel, { runtime });

    document.querySelector<HTMLButtonElement>('[aria-label="Arm microphone"]')?.click();
    await vi.waitFor(() =>
      expect(document.querySelector('[aria-label="Disarm microphone"]')).not.toBeNull(),
    );
    button("New recording")?.click();

    await vi.waitFor(() =>
      expect(document.body.textContent).toContain("Audio recorder could not start."),
    );
    expect(midiStart).not.toHaveBeenCalled();
    expect(midiStop).not.toHaveBeenCalled();
    expect(endPerformance).toHaveBeenCalled();
    expect(writeLocalState).not.toHaveBeenCalledWith(
      "music.recording.midi-takes",
      expect.anything(),
    );
    expect(document.querySelector('[aria-label="Arm microphone"]')).not.toBeNull();
    expect(button("New recording")).not.toBeUndefined();
  });

  test("keeps recorder setup when playback voice activation fails", async () => {
    const runtime = new MusicRuntime();
    runtime.audioMessage = "Playback voice unavailable.";
    vi.spyOn(runtime, "ensurePlaybackVoice").mockResolvedValue(false);
    const beginPerformance = vi.spyOn(runtime, "beginPerformance");
    const start = vi.spyOn(RecordingSession.prototype, "start");
    render(Panel, { runtime });

    button("New recording")?.click();

    await vi.waitFor(() =>
      expect(document.body.textContent).toContain("Playback voice unavailable."),
    );
    expect(beginPerformance).not.toHaveBeenCalled();
    expect(start).not.toHaveBeenCalled();
    expect(button("New recording")).not.toBeUndefined();
  });

  test("exports a recorded take as a MIDI download", async () => {
    const createSpy = vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:take");
    const revokeSpy = vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => undefined);
    const clickSpy = vi
      .spyOn(HTMLAnchorElement.prototype, "click")
      .mockImplementation(() => undefined);
    render(Panel);

    button("New recording")?.click();
    await vi.waitFor(() => expect(button("Stop")).not.toBeUndefined());
    [...document.querySelectorAll<HTMLButtonElement>("button")]
      .find((candidate) => candidate.textContent?.trim() === "C4")
      ?.click();
    await vi.waitFor(() => expect(button("Stop · 1")).not.toBeUndefined());
    button("Stop")?.click();
    await vi.waitFor(() => expect(button("MIDI")).not.toBeUndefined());

    button("MIDI")?.click();
    expect(createSpy).toHaveBeenCalledTimes(1);
    const blob = createSpy.mock.calls[0]?.[0] as Blob;
    expect(blob.type).toBe("audio/midi");
    expect(clickSpy).toHaveBeenCalledTimes(1);

    createSpy.mockRestore();
    revokeSpy.mockRestore();
    clickSpy.mockRestore();
  });

  test("restores persisted MIDI takes once storage is attached", async () => {
    const runtime = new MusicRuntime();
    vi.spyOn(runtime, "readLocalState").mockImplementation(async (id) =>
      id === "music.recording.midi-takes"
        ? ([
            {
              id: "take-7",
              name: "Saved riff",
              source: "midi",
              notes: [{ midi: 60, atMs: 0, velocity: 0.8 }],
              durationMs: 500,
            },
          ] as never)
        : (undefined as never),
    );
    // The load effect waits for storage (runtime.media) to be attached.
    runtime.media = {
      listTakes: vi.fn().mockResolvedValue([]),
      usage: vi.fn().mockResolvedValue({
        backingBytes: 0,
        takeBytes: 0,
        totalBytes: 0,
        effectiveBudgetBytes: 256_000,
        remainingBytes: 256_000,
      }),
    } as unknown as MusicRuntime["media"];

    render(Panel, { runtime });
    await vi.waitFor(() => expect(document.body.textContent).toContain("Saved riff"));
  });

  test("plays, pauses, completes, and tears down MIDI-only take playback locally", async () => {
    const runtime = new MusicRuntime();
    vi.spyOn(runtime, "readLocalState").mockImplementation(async (id) =>
      id === "music.recording.midi-takes" ? ([midiTake()] as never) : (undefined as never),
    );
    runtime.media = {
      listTakes: vi.fn().mockResolvedValue([]),
      usage: vi.fn().mockResolvedValue(undefined),
    } as unknown as MusicRuntime["media"];
    const playPattern = vi.spyOn(runtime.sound, "playPattern");
    const stopPattern = vi.spyOn(runtime.sound, "stopPattern");
    const view = render(Panel, { runtime });
    await vi.waitFor(() => expect(document.body.textContent).toContain("Saved riff"));

    button("Play")?.click();
    await vi.waitFor(() => expect(playPattern).toHaveBeenCalledOnce());
    expect(button("Pause")).not.toBeUndefined();

    button("Pause")?.click();
    await vi.waitFor(() => expect(button("Play")).not.toBeUndefined());
    expect(stopPattern).toHaveBeenCalled();

    vi.useFakeTimers();
    button("Play")?.click();
    await tick();
    expect(button("Pause")).not.toBeUndefined();
    vi.advanceTimersByTime(2_000);
    await tick();
    expect(button("Play")).not.toBeUndefined();

    button("Play")?.click();
    await tick();
    const stopsBeforeUnmount = stopPattern.mock.calls.length;
    view.unmount();
    expect(stopPattern.mock.calls.length).toBeGreaterThan(stopsBeforeUnmount);
    vi.useRealTimers();
  });

  test("persists MIDI takes when a take is recorded", async () => {
    const runtime = new MusicRuntime();
    vi.spyOn(runtime, "readLocalState").mockResolvedValue(undefined as never);
    const writeSpy = vi.spyOn(runtime, "writeLocalState").mockResolvedValue(undefined);

    render(Panel, { runtime });
    button("New recording")?.click();
    await vi.waitFor(() => expect(button("Stop")).not.toBeUndefined());
    [...document.querySelectorAll<HTMLButtonElement>("button")]
      .find((candidate) => candidate.textContent?.trim() === "C4")
      ?.click();
    await vi.waitFor(() => expect(button("Stop · 1")).not.toBeUndefined());
    button("Stop")?.click();

    await vi.waitFor(() =>
      expect(writeSpy).toHaveBeenCalledWith(
        "music.recording.midi-takes",
        expect.arrayContaining([expect.objectContaining({ notes: expect.any(Array) })]),
      ),
    );
  });

  test("sends a recorded MIDI take to the Piano Roll import flow", async () => {
    const runtime = new MusicRuntime();
    const navigateToCreate = vi.fn();
    vi.spyOn(runtime, "readLocalState").mockResolvedValue(undefined as never);
    const writeSpy = vi.spyOn(runtime, "writeLocalState").mockResolvedValue(undefined);

    render(Panel, { runtime, navigateToCreate });

    button("New recording")?.click();
    await vi.waitFor(() => expect(button("Stop")).not.toBeUndefined());
    [...document.querySelectorAll<HTMLButtonElement>("button")]
      .find((candidate) => candidate.textContent?.trim() === "C4")
      ?.click();
    await vi.waitFor(() => expect(button("Stop · 1")).not.toBeUndefined());
    button("Stop")?.click();

    await vi.waitFor(() => expect(button("Open in Piano Roll")).not.toBeUndefined());
    button("Open in Piano Roll")?.click();

    await vi.waitFor(() => {
      expect(writeSpy).toHaveBeenCalledWith(
        "music.piano-roll.pending-take-import",
        expect.objectContaining({
          bpm: runtime.transportBpm,
          take: expect.objectContaining({
            name: "Take 1",
            notes: [expect.objectContaining({ midi: 60 })],
          }),
        }),
      );
      expect(navigateToCreate).toHaveBeenCalledWith(
        "/music/create?mode=piano-roll&source=recorder-take",
      );
    });
  });

  test("saves a recorded MIDI take to Song Studio", async () => {
    const runtime = new MusicRuntime();
    vi.spyOn(runtime, "readLocalState").mockResolvedValue(undefined as never);
    const library = {
      saveScore: vi.fn(async (score: unknown) => {
        expect(score).toEqual(
          expect.objectContaining({
            title: "Take 1",
            origin: "midi",
            tempoMap: [{ atBeat: 0, bpm: runtime.transportBpm }],
            notes: [expect.objectContaining({ midiNote: 60, voiceId: "onscreen" })],
          }),
        );
        return { id: "song-recorder-take", title: "Take 1" };
      }),
    };

    render(Panel, { runtime, library });

    button("New recording")?.click();
    await vi.waitFor(() => expect(button("Stop")).not.toBeUndefined());
    [...document.querySelectorAll<HTMLButtonElement>("button")]
      .find((candidate) => candidate.textContent?.trim() === "C4")
      ?.click();
    await vi.waitFor(() => expect(button("Stop · 1")).not.toBeUndefined());
    button("Stop")?.click();

    await vi.waitFor(() => expect(button("Save to Song Studio")).not.toBeUndefined());
    button("Save to Song Studio")?.click();

    await vi.waitFor(() => expect(library.saveScore).toHaveBeenCalledTimes(1));
    await vi.waitFor(() => expect(document.body.textContent).toContain("Saved to Song Studio."));
    expect(document.querySelector('a[href="/music/songs/song-recorder-take"]')).not.toBeNull();
  });

  test("loads saved audio takes from the media library", async () => {
    const runtime = new MusicRuntime();
    const take: AudioTakeRow = {
      id: "audio-take-1",
      name: "Practice Lab take.webm",
      mimeType: "audio/webm",
      size: 16_384,
      durationMs: 32_000,
      createdAt: unixMs(2_000),
      instrument: "piano",
      backingKind: "generated",
      backingOffsetMs: 0,
      generatedBacking: {
        progressionId: "ii-v-i",
        bpm: 96,
        loop: true,
      },
    };
    const usage: MediaUsage = {
      backingBytes: 0,
      takeBytes: take.size,
      totalBytes: take.size,
      effectiveBudgetBytes: 256_000,
      remainingBytes: 256_000 - take.size,
    };
    runtime.media = {
      listTakes: vi.fn().mockResolvedValue([take]),
      usage: vi.fn().mockResolvedValue(usage),
      takeBlob: vi.fn().mockResolvedValue(new Blob(["audio"], { type: "audio/webm" })),
      deleteTake: vi.fn().mockResolvedValue(undefined),
    } as unknown as MusicRuntime["media"];

    render(Panel, { runtime });

    await vi.waitFor(() => expect(document.body.textContent).toContain("Practice Lab take.webm"));
    expect(document.body.textContent).toContain("Audio takes");
    expect(document.querySelector('[aria-label="Play synchronized take"]')).not.toBeNull();
  });

  test("applies media volume to review audio across updates, replacement, failure, and teardown", async () => {
    const originalAudio = globalThis.Audio;
    const created: ReviewAudio[] = [];
    vi.stubGlobal(
      "Audio",
      class extends ReviewAudio {
        constructor() {
          super();
          created.push(this);
        }
      },
    );
    const createUrl = vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:take");
    const revokeUrl = vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => undefined);
    const runtime = new MusicRuntime();
    runtime.audioEnabled = true;
    runtime.playbackLevel = 0.5;
    runtime.masterLevel = 0.8;
    const takes = [audioTake("take-1", "First take"), audioTake("take-2", "Second take")];
    runtime.media = {
      listTakes: vi.fn().mockResolvedValue(takes),
      usage: vi.fn().mockResolvedValue(undefined),
      takeBlob: vi.fn().mockResolvedValue(new Blob(["audio"])),
    } as unknown as MusicRuntime["media"];

    const view = render(Panel, { runtime });
    await vi.waitFor(() => expect(document.body.textContent).toContain("First take"));
    button("Play take")?.click();
    await vi.waitFor(() => expect(created).toHaveLength(1));
    expect(created[0]!.volume).toBeCloseTo(0.4);
    await vi.waitFor(() => expect(button("Pause take")).not.toBeUndefined());

    runtime.playbackLevel = 0.25;
    await vi.waitFor(() => expect(created[0]!.volume).toBeCloseTo(0.2));
    created[0]!.onended?.(new Event("ended"));
    await vi.waitFor(() => expect(button("Play take")).not.toBeUndefined());

    document.querySelector<HTMLButtonElement>('[aria-label="Select take Second take"]')?.click();
    button("Play take")?.click();
    await vi.waitFor(() => expect(created).toHaveLength(2));
    expect(created[1]!.volume).toBeCloseTo(0.2);

    runtime.masterMuted = true;
    await vi.waitFor(() => expect(created[1]!.volume).toBe(0));
    created[1]!.onerror?.(new Event("error"));
    await vi.waitFor(() =>
      expect(document.body.textContent).toContain("Recorded take playback failed."),
    );
    expect(button("Play take")).not.toBeUndefined();

    runtime.masterMuted = false;
    button("Play take")?.click();
    await vi.waitFor(() => expect(created).toHaveLength(3));
    view.unmount();
    expect(created[2]!.pause).toHaveBeenCalled();

    vi.stubGlobal("Audio", originalAudio);
    createUrl.mockRestore();
    revokeUrl.mockRestore();
  });
});

function audioTake(id: string, name: string): AudioTakeRow {
  return {
    id,
    name,
    mimeType: "audio/webm",
    size: 1_024,
    durationMs: 2_000,
    createdAt: unixMs(2_000),
    instrument: "piano",
    backingOffsetMs: 0,
  };
}

function midiTake() {
  return {
    id: "take-7",
    name: "Saved riff",
    source: "midi" as const,
    notes: [{ midi: 60, atMs: 0, velocity: 0.8 }],
    durationMs: 1_000,
  };
}
