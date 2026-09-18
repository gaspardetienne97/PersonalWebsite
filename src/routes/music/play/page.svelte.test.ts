import { monotonicMs } from "@repo/music-core/domain";
import { AudioTakeRecorder } from "@repo/music-core/engines/audio-recording";
import { RecordingSession } from "@repo/music-core/engines/recording";
import { afterEach, describe, expect, test, vi } from "vite-plus/test";
import { render } from "vitest-browser-svelte";

import { MusicRuntime } from "../_runtime.svelte";
import { setTestUrl } from "../_components/test-url";

import Page from "./+page.svelte";

class PracticeReviewAudio {
  src = "";
  currentTime = 0;
  duration = 0;
  loop = false;
  volume = 1;
  onended: ((event: Event) => void) | null = null;
  onerror: ((event: Event) => void) | null = null;
  readonly play = vi.fn(async () => undefined);
  readonly pause = vi.fn();
  readonly load = vi.fn();
  addEventListener(): void {}
  removeEventListener(): void {}
}

/** Take names are inline-editable inputs, so they are not page text. */
function takeNameField(name: string): HTMLInputElement | null {
  return document.querySelector<HTMLInputElement>(`[aria-label="Take name for ${name}"]`);
}

function button(name: string): HTMLButtonElement | undefined {
  return [...document.querySelectorAll<HTMLButtonElement>("button")].find(
    (candidate) =>
      candidate.textContent?.trim() === name ||
      candidate.getAttribute("aria-label") === name ||
      candidate.textContent?.includes(name),
  );
}

function renderLab(
  options: {
    runtime?: MusicRuntime;
    navigateToCreate?: (href: string) => void | Promise<void>;
  } = {},
) {
  const runtime = options.runtime ?? new MusicRuntime();
  runtime.audioEnabled = true;
  runtime.setCountIn(0);
  vi.spyOn(runtime, "ensurePlaybackVoice").mockResolvedValue(true);
  vi.spyOn(runtime, "beginPerformance").mockResolvedValue({
    status: "started",
    downbeat: monotonicMs(0),
  });
  const registerPracticeContext = vi.spyOn(runtime, "registerPracticeContext");
  const recordPractice = vi.spyOn(runtime, "recordPractice").mockResolvedValue();
  const view = render(Page, { runtime, navigateToCreate: options.navigateToCreate });
  return { runtime, recordPractice, registerPracticeContext, view };
}

async function flush(): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, 0));
}

async function startLab(): Promise<void> {
  button("Start recording")?.click();
  await vi.waitFor(() => expect(button("Stop recording")).toBeDefined());
}

afterEach(() => {
  setTestUrl("/");
  vi.restoreAllMocks();
});

describe("/music/play/+page.svelte", () => {
  test("loads backing tracks and takes when media attaches after mount without reloading on selection", async () => {
    const runtime = new MusicRuntime();
    render(Page, { runtime });
    await flush();
    const listBackings = vi.fn().mockResolvedValue([importedBacking()]);
    const listTakes = vi
      .fn()
      .mockResolvedValue([
        practiceTake("restored-1", "Restored first take"),
        practiceTake("restored-2", "Restored second take"),
      ]);
    const usage = vi.fn().mockResolvedValue(undefined);
    runtime.media = { listBackings, listTakes, usage } as unknown as MusicRuntime["media"];

    await vi.waitFor(() => expect(takeNameField("Restored first take")).not.toBeNull());
    button("Imported backing")?.click();
    await vi.waitFor(() => expect(document.body.textContent).toContain("Backing loop.wav"));
    button("Select take Restored second take")?.click();
    await flush();
    expect(listBackings).toHaveBeenCalledOnce();
    expect(listTakes).toHaveBeenCalledOnce();
    expect(usage).toHaveBeenCalledOnce();
  });

  test("renames a saved take through the media library and refreshes just that card", async () => {
    const runtime = new MusicRuntime();
    const updateTake = vi
      .fn()
      .mockResolvedValue({ ...practiceTake("take-1", "Morning warmup"), gainDb: undefined });
    const listTakes = vi.fn().mockResolvedValue([practiceTake("take-1", "Practice take")]);
    runtime.media = {
      listBackings: vi.fn().mockResolvedValue([]),
      listTakes,
      usage: vi.fn().mockResolvedValue(undefined),
      updateTake,
    } as unknown as MusicRuntime["media"];
    render(Page, { runtime });

    await vi.waitFor(() => expect(takeNameField("Practice take")).not.toBeNull());
    const field = takeNameField("Practice take")!;
    field.value = "Morning warmup";
    field.dispatchEvent(new Event("change", { bubbles: true }));

    await vi.waitFor(() => expect(takeNameField("Morning warmup")).not.toBeNull());
    expect(updateTake).toHaveBeenCalledWith("take-1", { name: "Morning warmup" });
    expect(listTakes).toHaveBeenCalledOnce(); // the returned row refreshes the card, no reload
  });

  test("gates generated backing before publishing playing state and reports activation failure", async () => {
    const runtime = new MusicRuntime();
    runtime.audioMessage = "Playback voice unavailable.";
    const ensureVoice = vi.spyOn(runtime, "ensurePlaybackVoice").mockResolvedValue(false);
    const playPattern = vi.spyOn(runtime.sound, "playPattern");
    render(Page, { runtime });

    button("Generated backing")?.click();
    await vi.waitFor(() =>
      expect(
        document.querySelector<HTMLButtonElement>('[aria-label="Play backing"]'),
      ).not.toBeDisabled(),
    );
    document.querySelector<HTMLButtonElement>('[aria-label="Play backing"]')?.click();

    await vi.waitFor(() =>
      expect(document.body.textContent).toContain("Playback voice unavailable."),
    );
    expect(ensureVoice).toHaveBeenCalledOnce();
    expect(playPattern).not.toHaveBeenCalled();
    expect(document.querySelector('[aria-label="Pause backing"]')).toBeNull();

    ensureVoice.mockResolvedValue(true);
    document.querySelector<HTMLButtonElement>('[aria-label="Play backing"]')?.click();

    await vi.waitFor(() => expect(playPattern).toHaveBeenCalledOnce());
    expect(document.querySelector('[aria-label="Pause backing"]')).not.toBeNull();
  });

  test("gates imported backing through audio enablement before media play", async () => {
    const originalAudio = globalThis.Audio;
    const created: PracticeReviewAudio[] = [];
    vi.stubGlobal(
      "Audio",
      class extends PracticeReviewAudio {
        constructor() {
          super();
          created.push(this);
        }
      },
    );
    const createUrl = vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:backing");
    const revokeUrl = vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => undefined);
    const runtime = new MusicRuntime();
    runtime.audioMessage = "Audio unlock failed.";
    const enableAudio = vi.spyOn(runtime, "enableAudio").mockResolvedValue(false);
    const listBackings = vi.fn().mockResolvedValue([importedBacking()]);
    runtime.media = {
      listBackings,
      listTakes: vi.fn().mockResolvedValue([]),
      usage: vi.fn().mockResolvedValue(undefined),
      backingBlob: vi.fn().mockResolvedValue(new Blob(["audio"])),
    } as unknown as MusicRuntime["media"];
    render(Page, { runtime });

    await vi.waitFor(() => expect(listBackings).toHaveBeenCalledOnce());
    button("Imported backing")?.click();
    await vi.waitFor(() => expect(document.body.textContent).toContain("Backing loop.wav"));
    button("Use imported backing Backing loop.wav")?.click();
    await vi.waitFor(() =>
      expect(
        document.querySelector<HTMLButtonElement>('[aria-label="Play backing"]'),
      ).not.toBeDisabled(),
    );
    document.querySelector<HTMLButtonElement>('[aria-label="Play backing"]')?.click();

    await vi.waitFor(() => expect(document.body.textContent).toContain("Audio unlock failed."));
    expect(enableAudio).toHaveBeenCalledOnce();
    expect(created[0]?.play).not.toHaveBeenCalled();
    expect(document.querySelector('[aria-label="Pause backing"]')).toBeNull();

    enableAudio.mockResolvedValue(true);
    document.querySelector<HTMLButtonElement>('[aria-label="Play backing"]')?.click();
    await vi.waitFor(() => expect(created[0]?.play).toHaveBeenCalledOnce());
    expect(document.querySelector('[aria-label="Pause backing"]')).not.toBeNull();

    vi.stubGlobal("Audio", originalAudio);
    createUrl.mockRestore();
    revokeUrl.mockRestore();
  });

  test("does not start generated backing when Stop invalidates pending activation", async () => {
    const runtime = new MusicRuntime();
    let resolveVoice!: (enabled: boolean) => void;
    const ensureVoice = vi.spyOn(runtime, "ensurePlaybackVoice").mockReturnValue(
      new Promise((resolve) => {
        resolveVoice = resolve;
      }),
    );
    const playPattern = vi.spyOn(runtime.sound, "playPattern");
    render(Page, { runtime });

    button("Generated backing")?.click();
    await vi.waitFor(() => expect(button("Play backing")).not.toBeDisabled());
    button("Play backing")?.click();
    await vi.waitFor(() => expect(ensureVoice).toHaveBeenCalledOnce());
    button("Stop")?.click();
    resolveVoice(true);
    await flush();

    expect(playPattern).not.toHaveBeenCalled();
  });

  test("does not start a replacement selection when activation was for an older snapshot", async () => {
    const runtime = new MusicRuntime();
    let resolveVoice!: (enabled: boolean) => void;
    vi.spyOn(runtime, "ensurePlaybackVoice").mockReturnValue(
      new Promise((resolve) => {
        resolveVoice = resolve;
      }),
    );
    const playPattern = vi.spyOn(runtime.sound, "playPattern");
    render(Page, { runtime });

    button("Generated backing")?.click();
    await vi.waitFor(() => expect(button("Play backing")).not.toBeDisabled());
    button("Play backing")?.click();
    const bpm = document.querySelector<HTMLInputElement>('input[type="number"]');
    if (!bpm) throw new Error("Generated backing BPM missing");
    bpm.value = "120";
    bpm.dispatchEvent(new Event("input", { bubbles: true }));
    resolveVoice(true);
    await flush();

    expect(playPattern).not.toHaveBeenCalled();
  });

  test("does not start backing when pending activation settles after teardown", async () => {
    const runtime = new MusicRuntime();
    let resolveVoice!: (enabled: boolean) => void;
    vi.spyOn(runtime, "ensurePlaybackVoice").mockReturnValue(
      new Promise((resolve) => {
        resolveVoice = resolve;
      }),
    );
    const playPattern = vi.spyOn(runtime.sound, "playPattern");
    const view = render(Page, { runtime });

    button("Generated backing")?.click();
    await vi.waitFor(() => expect(button("Play backing")).not.toBeDisabled());
    button("Play backing")?.click();
    view.unmount();
    resolveVoice(true);
    await flush();

    expect(playPattern).not.toHaveBeenCalled();
  });

  test("does not restart backing when recording ends during pending activation", async () => {
    const runtime = new MusicRuntime();
    const ensureVoice = vi.spyOn(runtime, "ensurePlaybackVoice").mockResolvedValue(true);
    vi.spyOn(runtime, "beginPerformance").mockResolvedValue({
      status: "started",
      downbeat: monotonicMs(0),
    });
    vi.spyOn(runtime, "recordPractice").mockResolvedValue();
    const playPattern = vi.spyOn(runtime.sound, "playPattern");
    render(Page, { runtime });

    button("Generated backing")?.click();
    await startLab();
    await vi.waitFor(() => expect(playPattern).toHaveBeenCalledOnce());
    button("Pause backing")?.click();
    await vi.waitFor(() => expect(button("Play backing")).toBeDefined());

    let resolveVoice!: (enabled: boolean) => void;
    ensureVoice.mockReturnValueOnce(
      new Promise((resolve) => {
        resolveVoice = resolve;
      }),
    );
    button("Play backing")?.click();
    await vi.waitFor(() => expect(ensureVoice).toHaveBeenCalledTimes(2));
    button("Stop recording")?.click();
    resolveVoice(true);
    await flush();

    expect(playPattern).toHaveBeenCalledOnce();
  });

  test("renders the Practice Lab workspace and retains tool links", () => {
    renderLab();

    expect(document.getElementById("practice-lab")).not.toBeNull();
    expect(button("Start recording")).toBeDefined();
    expect(button("Monitor")).toHaveAttribute("aria-pressed", "true");
    expect(document.querySelector('a[href="/music/play/scales"]')?.textContent).toContain(
      "Scales & Technique",
    );
    expect(document.querySelector('a[href="/music/play/mpc"]')?.textContent).toContain(
      "MPC Rudiments",
    );
    expect(document.querySelector('a[href="/music/play/spider"]')?.textContent).toContain(
      "Spider Drill",
    );
    expect(document.querySelector('a[href="/music/library?tab=songs"]')?.textContent).toContain(
      "Song Library",
    );
  });

  test("records MIDI notes into a free-practice journal capture", async () => {
    const { runtime, recordPractice } = renderLab();

    await startLab();
    runtime.router.noteOn(60, "midi", "piano");

    await vi.waitFor(() => expect(document.body.textContent).toContain("1 note"));
    button("Stop recording")?.click();

    await vi.waitFor(() =>
      expect(recordPractice).toHaveBeenCalledWith(
        expect.objectContaining({
          source: "free-practice",
          instrument: "piano",
          startedAt: expect.any(Number),
          endedAt: expect.any(Number),
        }),
      ),
    );
  });

  test("adds recorded MIDI notes to the shared take review panel", async () => {
    const { runtime } = renderLab();

    await startLab();
    runtime.router.noteOn(60, "midi", "piano");
    runtime.router.noteOn(64, "midi", "piano");
    await vi.waitFor(() => expect(document.body.textContent).toContain("2 notes"));

    button("Stop recording")?.click();

    await vi.waitFor(() => expect(document.body.textContent).toContain("MIDI takes"));
    expect(document.body.textContent).toContain("Practice Lab take 1");
    expect(document.querySelectorAll("[data-density-bucket]")).toHaveLength(16);
  });

  test("owns MIDI take playback through pause, completion, delete, other playback, and teardown", async () => {
    const { runtime, view } = renderLab();
    const playPattern = vi.spyOn(runtime.sound, "playPattern");
    const stopPattern = vi.spyOn(runtime.sound, "stopPattern");

    await startLab();
    runtime.router.noteOn(60, "midi", "piano");
    button("Stop recording")?.click();
    await vi.waitFor(() =>
      expect(document.querySelector('[aria-label="Play Practice Lab take 1"]')).not.toBeNull(),
    );

    document.querySelector<HTMLButtonElement>('[aria-label="Play Practice Lab take 1"]')?.click();
    await vi.waitFor(() => expect(playPattern).toHaveBeenCalledOnce());
    await vi.waitFor(() =>
      expect(
        [...document.querySelectorAll<HTMLButtonElement>("button")].map((candidate) =>
          candidate.getAttribute("aria-label"),
        ),
      ).toContain("Pause Practice Lab take 1"),
    );
    document.querySelector<HTMLButtonElement>('[aria-label="Pause Practice Lab take 1"]')?.click();
    await vi.waitFor(() =>
      expect(document.querySelector('[aria-label="Play Practice Lab take 1"]')).not.toBeNull(),
    );

    vi.useFakeTimers();
    document.querySelector<HTMLButtonElement>('[aria-label="Play Practice Lab take 1"]')?.click();
    await vi.advanceTimersByTimeAsync(0);
    expect(document.querySelector('[aria-label="Pause Practice Lab take 1"]')).not.toBeNull();
    await vi.advanceTimersByTimeAsync(60_000);
    expect(document.querySelector('[aria-label="Play Practice Lab take 1"]')).not.toBeNull();
    vi.useRealTimers();

    await startLab();
    runtime.router.noteOn(64, "midi", "piano");
    button("Stop recording")?.click();
    await vi.waitFor(() =>
      expect(document.querySelector('[aria-label="Play Practice Lab take 2"]')).not.toBeNull(),
    );
    document.querySelector<HTMLButtonElement>('[aria-label="Play Practice Lab take 2"]')?.click();
    await vi.waitFor(() =>
      expect(document.querySelector('[aria-label="Pause Practice Lab take 2"]')).not.toBeNull(),
    );
    document
      .querySelector<HTMLButtonElement>('[aria-label="Select MIDI take Practice Lab take 1"]')
      ?.click();
    await vi.waitFor(() =>
      expect(document.querySelector('[aria-label="Play Practice Lab take 1"]')).not.toBeNull(),
    );

    document.querySelector<HTMLButtonElement>('[aria-label="Play Practice Lab take 1"]')?.click();
    await vi.waitFor(() =>
      expect(document.querySelector('[aria-label="Pause Practice Lab take 1"]')).not.toBeNull(),
    );
    button("Generated backing")?.click();
    await vi.waitFor(() => expect(button("Play backing")).not.toBeDisabled());
    button("Play backing")?.click();
    await vi.waitFor(() =>
      expect(document.querySelector('[aria-label="Play Practice Lab take 1"]')).not.toBeNull(),
    );

    document.querySelector<HTMLButtonElement>('[aria-label="Play Practice Lab take 1"]')?.click();
    await vi.waitFor(() =>
      expect(document.querySelector('[aria-label="Pause Practice Lab take 1"]')).not.toBeNull(),
    );
    document.querySelector<HTMLButtonElement>('[aria-label="Delete MIDI take"]')?.click();
    await vi.waitFor(() => expect(stopPattern).toHaveBeenCalled());

    document.querySelector<HTMLButtonElement>('[aria-label="Play Practice Lab take 2"]')?.click();
    await vi.waitFor(() =>
      expect(document.querySelector('[aria-label="Pause Practice Lab take 2"]')).not.toBeNull(),
    );
    const stopsBeforeUnmount = stopPattern.mock.calls.length;
    view.unmount();
    expect(stopPattern.mock.calls.length).toBeGreaterThan(stopsBeforeUnmount);
  });

  test("announces MIDI take activation failure in the neutral shared error alert", async () => {
    const runtime = new MusicRuntime();
    runtime.audioMessage = "Playback voice unavailable.";
    const ensureVoice = vi.spyOn(runtime, "ensurePlaybackVoice").mockResolvedValue(true);
    vi.spyOn(runtime, "beginPerformance").mockResolvedValue({
      status: "started",
      downbeat: monotonicMs(0),
    });
    const view = render(Page, { runtime });

    await startLab();
    runtime.router.noteOn(60, "midi", "piano");
    button("Stop recording")?.click();
    await vi.waitFor(() =>
      expect(document.querySelector('[aria-label="Play Practice Lab take 1"]')).not.toBeNull(),
    );
    ensureVoice.mockResolvedValue(false);
    document.querySelector<HTMLButtonElement>('[aria-label="Play Practice Lab take 1"]')?.click();

    await vi.waitFor(() => {
      const alert = document.querySelector('[role="alert"][aria-live="assertive"]');
      expect(alert?.textContent).toContain("Practice needs attention");
      expect(alert?.textContent).toContain("Playback voice unavailable.");
    });
    expect(document.querySelector('[aria-label="Pause Practice Lab take 1"]')).toBeNull();
    view.unmount();
  });

  test("sends a recorded MIDI take to the Create piano roll", async () => {
    const navigateToCreate = vi.fn();
    const { runtime } = renderLab({ navigateToCreate });
    const writeLocalState = vi.spyOn(runtime, "writeLocalState").mockResolvedValue();

    await startLab();
    runtime.router.noteOn(60, "midi", "piano");
    runtime.router.noteOn(64, "midi", "piano");
    await vi.waitFor(() => expect(document.body.textContent).toContain("2 notes"));
    button("Stop recording")?.click();

    await vi.waitFor(() => expect(button("Open in Piano Roll")).not.toBeUndefined());
    button("Open in Piano Roll")?.click();

    await vi.waitFor(() => {
      expect(writeLocalState).toHaveBeenCalledWith(
        "music.piano-roll.pending-take-import",
        expect.objectContaining({
          bpm: runtime.transportBpm,
          take: expect.objectContaining({
            name: "Practice Lab take 1",
            notes: [expect.objectContaining({ midi: 60 }), expect.objectContaining({ midi: 64 })],
          }),
        }),
      );
      expect(navigateToCreate).toHaveBeenCalledWith(
        "/music/create?mode=piano-roll&source=practice-lab-take",
      );
    });
  });

  test("captures on-screen input through the same router subscription", async () => {
    const { recordPractice } = renderLab();

    await startLab();
    button("C4")?.click();

    await vi.waitFor(() => expect(document.body.textContent).toContain("1 note"));
    button("Stop recording")?.click();

    await vi.waitFor(() => expect(recordPractice).toHaveBeenCalledOnce());
  });

  test("monitor off prevents note preview playback", async () => {
    const { runtime } = renderLab();
    const playNote = vi.spyOn(runtime.sound, "playNote");

    button("Monitor")?.click();
    runtime.router.noteOn(60, "midi", "piano");
    await flush();

    expect(playNote).not.toHaveBeenCalled();
  });

  test("does not save an empty recording without audio", async () => {
    const { recordPractice } = renderLab();

    await startLab();
    button("Stop recording")?.click();
    await flush();

    expect(recordPractice).not.toHaveBeenCalled();
  });

  test("shows retry save when journal persistence fails", async () => {
    const runtime = new MusicRuntime();
    runtime.audioEnabled = true;
    runtime.setCountIn(0);
    vi.spyOn(runtime, "recordPractice").mockRejectedValue(new Error("Persistence unavailable"));
    vi.spyOn(runtime, "ensurePlaybackVoice").mockResolvedValue(true);
    vi.spyOn(runtime, "beginPerformance").mockResolvedValue({
      status: "started",
      downbeat: monotonicMs(0),
    });
    render(Page, { runtime });

    await startLab();
    runtime.router.noteOn(60, "midi", "piano");
    await vi.waitFor(() => expect(document.body.textContent).toContain("1 note"));
    button("Stop recording")?.click();

    await vi.waitFor(() =>
      expect(document.querySelector('[aria-label="Retry save"]')).not.toBeNull(),
    );
    expect(document.body.textContent).toContain("Persistence unavailable");
  });

  test("registers exact MIDI and MIDI-audio contexts and keeps the runtime instrument synchronized", async () => {
    const { runtime, registerPracticeContext: register } = renderLab();

    await vi.waitFor(() =>
      expect(register).toHaveBeenCalledWith(
        expect.objectContaining({
          variantKey: "v1:recording:piano:midi",
          meter: { numerator: 4, denominator: 4 },
        }),
      ),
    );

    const instrument = document.querySelector<HTMLSelectElement>("select");
    if (!instrument) throw new Error("Instrument selector missing");
    instrument.value = "guitar";
    instrument.dispatchEvent(new Event("change", { bubbles: true }));
    await vi.waitFor(() => {
      expect(runtime.activeInstrument).toBe("guitar");
      expect(runtime.router.state.activeInstrument).toBe("guitar");
      expect(register).toHaveBeenCalledWith(
        expect.objectContaining({ variantKey: "v1:recording:guitar:midi" }),
      );
    });

    vi.spyOn(AudioTakeRecorder.prototype, "prepare").mockResolvedValue();
    button("Arm microphone")?.click();
    await vi.waitFor(() =>
      expect(register).toHaveBeenCalledWith(
        expect.objectContaining({ variantKey: "v1:recording:guitar:midi-audio" }),
      ),
    );
  });

  test("uses URL BPM before persisted exact-variant BPM", async () => {
    setTestUrl("/music/play?bpm=132");
    const runtime = new MusicRuntime();
    await runtime.attachStorage(
      settingsRepository({
        "v1:recording:piano:midi": 118,
      }),
    );

    const { registerPracticeContext } = renderLab({ runtime });

    await vi.waitFor(() => expect(runtime.practiceBpm).toBe(132));
    expect(registerPracticeContext).toHaveBeenCalledWith(
      expect.objectContaining({
        initialUrlBpm: 132,
        variantKey: "v1:recording:piano:midi",
        onBpmChange: expect.any(Function),
      }),
    );
  });

  test("uses persisted exact-variant BPM before the Practice Lab default", async () => {
    setTestUrl("/music/play");
    const runtime = new MusicRuntime();
    await runtime.attachStorage(
      settingsRepository({
        "v1:recording:piano:midi": 118,
      }),
    );

    renderLab({ runtime });

    await vi.waitFor(() => expect(runtime.practiceBpm).toBe(118));
  });

  test("uses the Practice Lab default and writes bar BPM changes to the URL", async () => {
    setTestUrl("/music/play");
    const { runtime, registerPracticeContext } = renderLab();
    await vi.waitFor(() => expect(registerPracticeContext).toHaveBeenCalledOnce());
    await vi.waitFor(() => expect(window.location.search).toContain("bpm=96"));

    runtime.setPracticeBpm(144);

    await vi.waitFor(() => expect(window.location.search).toContain("bpm=144"));
  });

  test("starts MIDI and audio capture only after the shared downbeat", async () => {
    const runtime = new MusicRuntime();
    runtime.audioEnabled = true;
    vi.spyOn(runtime, "ensurePlaybackVoice").mockResolvedValue(true);
    vi.spyOn(AudioTakeRecorder.prototype, "prepare").mockResolvedValue();
    const audioStart = vi.spyOn(AudioTakeRecorder.prototype, "start").mockImplementation(() => {});
    const midiStart = vi.spyOn(RecordingSession.prototype, "start");
    let resolve!: (result: Awaited<ReturnType<MusicRuntime["beginPerformance"]>>) => void;
    vi.spyOn(runtime, "beginPerformance").mockReturnValue(
      new Promise((settle) => {
        resolve = settle;
      }),
    );
    render(Page, { runtime });

    button("Arm microphone")?.click();
    await vi.waitFor(() => expect(button("Disarm microphone")).toBeDefined());
    button("Start recording")?.click();
    await vi.waitFor(() => expect(runtime.beginPerformance).toHaveBeenCalledOnce());
    expect(midiStart).not.toHaveBeenCalled();
    expect(audioStart).not.toHaveBeenCalled();

    resolve({ status: "started", downbeat: monotonicMs(1_234) });
    await vi.waitFor(() => expect(midiStart).toHaveBeenCalledWith(1_234));
    expect(audioStart).toHaveBeenCalledWith(expect.objectContaining({ startedAtMonotonic: 1_234 }));
  });

  test("retains Arm-then-Start intent until microphone preparation settles", async () => {
    let resolvePrepare!: () => void;
    vi.spyOn(AudioTakeRecorder.prototype, "prepare").mockReturnValue(
      new Promise((resolve) => {
        resolvePrepare = resolve;
      }),
    );
    const audioStart = vi.spyOn(AudioTakeRecorder.prototype, "start").mockImplementation(() => {});
    const midiStart = vi.spyOn(RecordingSession.prototype, "start");
    const { runtime, registerPracticeContext } = renderLab();

    button("Arm microphone")?.click();
    await vi.waitFor(() => expect(AudioTakeRecorder.prototype.prepare).toHaveBeenCalledOnce());
    button("Start recording")?.click();
    await Promise.resolve();

    expect(runtime.beginPerformance).not.toHaveBeenCalled();
    expect(audioStart).not.toHaveBeenCalled();
    expect(midiStart).not.toHaveBeenCalled();

    resolvePrepare();
    await vi.waitFor(() => expect(audioStart).toHaveBeenCalledOnce());
    expect(midiStart).toHaveBeenCalledOnce();
    expect(registerPracticeContext).toHaveBeenCalledWith(
      expect.objectContaining({ variantKey: "v1:recording:piano:midi-audio" }),
    );
  });

  test("starts MIDI and audio while microphone device labels are still refreshing", async () => {
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
    const { runtime } = renderLab();

    button("Arm microphone")?.click();
    await vi.waitFor(() => expect(AudioTakeRecorder.prototype.prepare).toHaveBeenCalledOnce());
    button("Start recording")?.click();
    resolvePrepare();

    await vi.waitFor(() => expect(runtime.beginPerformance).toHaveBeenCalledOnce());
    expect(audioStart).toHaveBeenCalledOnce();
    expect(midiStart).toHaveBeenCalledOnce();
    resolveDevices([]);
  });

  test("keeps microphone capture ready when the device-label refresh fails", async () => {
    vi.spyOn(AudioTakeRecorder.prototype, "devices").mockRejectedValue(
      new Error("Device labels unavailable."),
    );
    vi.spyOn(AudioTakeRecorder.prototype, "prepare").mockResolvedValue();
    const audioStart = vi.spyOn(AudioTakeRecorder.prototype, "start").mockImplementation(() => {});
    const midiStart = vi.spyOn(RecordingSession.prototype, "start");
    renderLab();

    button("Arm microphone")?.click();
    await vi.waitFor(() => expect(button("Disarm microphone")).toBeDefined());
    button("Start recording")?.click();

    await vi.waitFor(() => expect(audioStart).toHaveBeenCalledOnce());
    expect(midiStart).toHaveBeenCalledOnce();
    expect(document.body.textContent).not.toContain("Device labels unavailable.");
  });

  test("keeps setup and starts no recorder when the shared clock fails", async () => {
    const runtime = new MusicRuntime();
    vi.spyOn(runtime, "ensurePlaybackVoice").mockResolvedValue(true);
    vi.spyOn(runtime, "beginPerformance").mockResolvedValue({
      status: "failed",
      message: "Practice clock unavailable.",
    });
    const midiStart = vi.spyOn(RecordingSession.prototype, "start");
    const audioStart = vi.spyOn(AudioTakeRecorder.prototype, "start");
    render(Page, { runtime });

    button("Start recording")?.click();
    await vi.waitFor(() =>
      expect(document.body.textContent).toContain("Practice clock unavailable."),
    );
    expect(midiStart).not.toHaveBeenCalled();
    expect(audioStart).not.toHaveBeenCalled();
    expect(button("Start recording")).toBeDefined();
  });

  test("starts no recorder when the shared clock is cancelled", async () => {
    const runtime = new MusicRuntime();
    vi.spyOn(runtime, "ensurePlaybackVoice").mockResolvedValue(true);
    vi.spyOn(runtime, "beginPerformance").mockResolvedValue({ status: "cancelled" });
    const midiStart = vi.spyOn(RecordingSession.prototype, "start");
    render(Page, { runtime });

    button("Start recording")?.click();
    await vi.waitFor(() => expect(runtime.beginPerformance).toHaveBeenCalledOnce());
    await vi.waitFor(() => expect(button("Start recording")).not.toBeDisabled());
    expect(midiStart).not.toHaveBeenCalled();
  });

  test("ends performance and keeps setup when capture initialization fails after the downbeat", async () => {
    const runtime = new MusicRuntime();
    vi.spyOn(runtime, "ensurePlaybackVoice").mockResolvedValue(true);
    vi.spyOn(runtime, "beginPerformance").mockResolvedValue({
      status: "started",
      downbeat: monotonicMs(2_000),
    });
    const endPerformance = vi.spyOn(runtime, "endPerformance");
    vi.spyOn(AudioTakeRecorder.prototype, "prepare").mockResolvedValue();
    vi.spyOn(AudioTakeRecorder.prototype, "start").mockImplementation(() => {
      throw new Error("Audio capture failed.");
    });
    const midiStart = vi.spyOn(RecordingSession.prototype, "start");
    render(Page, { runtime });

    button("Arm microphone")?.click();
    await vi.waitFor(() => expect(button("Disarm microphone")).toBeDefined());
    button("Start recording")?.click();
    await vi.waitFor(() => expect(document.body.textContent).toContain("Audio capture failed."));
    expect(endPerformance).toHaveBeenCalled();
    expect(midiStart).not.toHaveBeenCalled();
    expect(button("Start recording")).toBeDefined();
  });

  test("cleans up the practice context and performance on teardown", async () => {
    const runtime = new MusicRuntime();
    const cleanup = vi.fn();
    vi.spyOn(runtime, "registerPracticeContext").mockResolvedValue(cleanup);
    vi.spyOn(runtime, "ensurePlaybackVoice").mockResolvedValue(true);
    vi.spyOn(runtime, "beginPerformance").mockResolvedValue({
      status: "started",
      downbeat: monotonicMs(0),
    });
    const endPerformance = vi.spyOn(runtime, "endPerformance");
    const view = render(Page, { runtime });
    await vi.waitFor(() => expect(runtime.registerPracticeContext).toHaveBeenCalledOnce());
    await startLab();
    const callsBeforeUnmount = endPerformance.mock.calls.length;

    view.unmount();

    expect(cleanup).toHaveBeenCalledOnce();
    expect(endPerformance.mock.calls.length).toBeGreaterThan(callsBeforeUnmount);
  });

  test("does not start a performance when playback activation settles after teardown", async () => {
    const runtime = new MusicRuntime();
    const cleanup = vi.fn();
    vi.spyOn(runtime, "registerPracticeContext").mockResolvedValue(cleanup);
    let resolveVoice!: (enabled: boolean) => void;
    vi.spyOn(runtime, "ensurePlaybackVoice").mockReturnValue(
      new Promise((resolve) => {
        resolveVoice = resolve;
      }),
    );
    const beginPerformance = vi.spyOn(runtime, "beginPerformance");
    const midiStart = vi.spyOn(RecordingSession.prototype, "start");
    const view = render(Page, { runtime });
    await vi.waitFor(() => expect(runtime.registerPracticeContext).toHaveBeenCalledOnce());

    button("Start recording")?.click();
    await vi.waitFor(() => expect(runtime.ensurePlaybackVoice).toHaveBeenCalledOnce());
    view.unmount();
    resolveVoice(true);
    await flush();

    expect(cleanup).toHaveBeenCalledOnce();
    expect(beginPerformance).not.toHaveBeenCalled();
    expect(midiStart).not.toHaveBeenCalled();
  });

  test("keeps practice-take playback local, volume-aware, and teardown-safe", async () => {
    const originalAudio = globalThis.Audio;
    const created: PracticeReviewAudio[] = [];
    vi.stubGlobal(
      "Audio",
      class extends PracticeReviewAudio {
        constructor(src?: string) {
          super();
          this.src = src ?? "";
          created.push(this);
        }
      },
    );
    const createUrl = vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:practice-take");
    const revokeUrl = vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => undefined);
    const runtime = new MusicRuntime();
    runtime.audioEnabled = true;
    runtime.playbackLevel = 0.5;
    runtime.masterLevel = 0.8;
    runtime.media = {
      listBackings: vi.fn().mockResolvedValue([]),
      listTakes: vi
        .fn()
        .mockResolvedValue([
          practiceTake("take-1", "First practice take"),
          practiceTake("take-2", "Second practice take"),
        ]),
      usage: vi.fn().mockResolvedValue(undefined),
      takeBlob: vi.fn().mockResolvedValue(new Blob(["audio"])),
    } as unknown as MusicRuntime["media"];
    const view = render(Page, { runtime });

    await vi.waitFor(() => expect(takeNameField("First practice take")).not.toBeNull());
    const reviewButton = document.querySelector<HTMLButtonElement>(
      '[aria-label="Play synchronized take"]',
    );
    reviewButton?.click();
    await vi.waitFor(() => expect(created).toHaveLength(2));
    expect(created[1]!.volume).toBeCloseTo(0.4);

    runtime.masterLevel = 0.5;
    await vi.waitFor(() => expect(created[1]!.volume).toBeCloseTo(0.25));
    document
      .querySelector<HTMLButtonElement>('[aria-label="Select take Second practice take"]')
      ?.click();
    await vi.waitFor(() => expect(reviewButton?.textContent).toContain("Play take"));
    reviewButton?.click();
    await vi.waitFor(() => expect(created).toHaveLength(3));
    expect(created[1]!.pause).toHaveBeenCalled();
    expect(created[2]!.volume).toBeCloseTo(0.25);

    created[2]!.onended?.(new Event("ended"));
    await vi.waitFor(() => expect(reviewButton?.textContent).toContain("Play take"));
    reviewButton?.click();
    await vi.waitFor(() => expect(created).toHaveLength(4));
    view.unmount();
    expect(created[3]!.pause).toHaveBeenCalled();

    vi.stubGlobal("Audio", originalAudio);
    createUrl.mockRestore();
    revokeUrl.mockRestore();
  });
});

function practiceTake(id: string, name: string) {
  return {
    id,
    name,
    mimeType: "audio/webm",
    size: 1_024,
    durationMs: 2_000,
    createdAt: Date.now(),
    instrument: "piano" as const,
    backingOffsetMs: 0,
  };
}

function importedBacking() {
  return {
    id: "backing-1",
    name: "Backing loop.wav",
    mimeType: "audio/wav",
    size: 1_024,
    durationMs: 2_000,
    createdAt: Date.now(),
  };
}

function settingsRepository(tempoByVariant: Record<string, number>) {
  return {
    get: async () => ({
      id: "music.settings",
      value: { activeInstrument: "piano", tempoByVariant },
    }),
    put: async () => undefined,
  };
}
