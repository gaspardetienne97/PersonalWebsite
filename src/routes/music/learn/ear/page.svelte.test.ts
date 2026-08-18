import { beforeEach, describe, expect, test, vi } from "vite-plus/test";
import { render } from "vitest-browser-svelte";

import { monotonicMs, type NoteOnEvent } from "@repo/music-core/domain";
import { EarTrainingSession } from "@repo/music-core/engines/ear-training";
import { SoundEngine } from "@repo/music-core/engines/sound";

import Page from "./+page.svelte";
import { setTestUrl } from "../../_components/test-url";
import { MusicRuntime } from "../../_runtime.svelte";

describe("/music/learn/ear/+page.svelte", () => {
  beforeEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
    setTestUrl("/");
    vi.spyOn(SoundEngine.prototype, "enable").mockImplementation(async function () {
      this.enabled = true;
      return { enabled: true, message: "Audio enabled." };
    });
    vi.spyOn(MusicRuntime.prototype, "beginPerformance").mockResolvedValue({
      status: "started",
      downbeat: monotonicMs(0),
    });
  });

  test("starts a mixed Practice session and advances the session rail", async () => {
    const runtime = new MusicRuntime();
    const beginPerformance = vi.spyOn(runtime, "beginPerformance");
    const playPattern = vi.spyOn(SoundEngine.prototype, "playPattern");
    render(Page, { runtime });

    expect(document.querySelector("h1")?.textContent).toContain("Ear Training");
    expect(document.body.textContent).toContain("Interval");
    expect(document.body.textContent).toContain("Chord Quality");
    expect(document.body.textContent).toContain("Scale Degree");
    expect(document.body.textContent).toContain("Cadence");
    expect(document.body.textContent).toContain("Adaptive mix");

    const mixed = [...document.querySelectorAll("button")].find((button) =>
      button.textContent?.includes("Mixed Session"),
    );
    await vi.waitFor(() => expect(mixed?.disabled).toBe(false));
    mixed?.click();

    await vi.waitFor(() => expect(playPattern).toHaveBeenCalled());
    expect(document.body.textContent).toContain("1 / 10");

    answerChoiceButton()?.click();

    await vi.waitFor(() => expect(document.body.textContent).toContain("2 / 10"));
    expect(document.querySelector('[data-testid="feedback"]')).not.toBeNull();
    expect(document.body.textContent).toContain("Session XP");
    expect(document.body.textContent).toContain("Streak");
    expect(beginPerformance).not.toHaveBeenCalled();
  });

  test("keeps setup locked during preflight, then renders only the active stage", async () => {
    const runtime = new MusicRuntime();
    let resolveVoice!: (enabled: boolean) => void;
    vi.spyOn(runtime, "ensurePlaybackVoice").mockReturnValue(
      new Promise((resolve) => (resolveVoice = resolve)),
    );
    render(Page, { runtime });

    const mixed = button("Start Mixed Session");
    await vi.waitFor(() => expect(mixed?.disabled).toBe(false));
    mixed?.click();

    await vi.waitFor(() => expect(mixed?.closest("fieldset")?.disabled).toBe(true));
    expect(button("End session")).toBeUndefined();
    expect(document.querySelector('[data-testid="ear-phase-announcement"]')?.textContent).toContain(
      "Starting",
    );

    resolveVoice(true);
    await vi.waitFor(() => expect(button("End session")).not.toBeUndefined());
    expect(button("Start Mixed Session")).toBeUndefined();
    expect(document.activeElement?.getAttribute("aria-label")).toBe("Ear training session");
  });

  test("returns from the active stage to setup through the standard end action", async () => {
    render(Page);

    const mixed = button("Start Mixed Session");
    await vi.waitFor(() => expect(mixed?.disabled).toBe(false));
    mixed?.click();
    await vi.waitFor(() => expect(button("End session")).not.toBeUndefined());

    button("End session")?.click();

    await vi.waitFor(() => expect(button("Start Mixed Session")).not.toBeUndefined());
    expect(button("End session")).toBeUndefined();
    expect(document.activeElement?.getAttribute("aria-label")).toBe("Ear training setup");
    expect(document.querySelector('[data-testid="ear-phase-announcement"]')?.textContent).toContain(
      "Session ended",
    );
  });

  test("supports Test and Play-back modes without immediate correctness", async () => {
    render(Page);
    const testMode = [...document.querySelectorAll("button")].find(
      (button) => button.textContent?.trim() === "Test",
    );
    const playBack = [...document.querySelectorAll("button")].find(
      (button) => button.textContent?.trim() === "Play-back",
    );
    testMode?.click();
    playBack?.click();

    await vi.waitFor(() => expect(testMode?.getAttribute("aria-pressed")).toBe("true"));
    await vi.waitFor(() => expect(playBack?.getAttribute("aria-pressed")).toBe("true"));

    const interval = [...document.querySelectorAll("button")].find((button) =>
      button.textContent?.includes("Start Interval"),
    );
    await vi.waitFor(() => expect(interval?.disabled).toBe(false));
    vi.useFakeTimers();
    interval?.click();
    await vi.advanceTimersByTimeAsync(3_000);

    await vi.waitFor(() =>
      expect(
        document.querySelector('[role="group"][aria-label="On-screen keyboard"]'),
      ).not.toBeNull(),
    );
    expect(
      [...document.querySelectorAll("button")].some((button) => button.textContent === "C#4"),
    ).toBe(true);
    expect(document.querySelector('[data-testid="feedback"]')).toBeNull();
  });

  test("plays interval prompts louder than the default pattern level", async () => {
    const playPattern = vi.spyOn(SoundEngine.prototype, "playPattern");
    render(Page);

    const interval = [...document.querySelectorAll("button")].find((button) =>
      button.textContent?.includes("Start Interval"),
    );
    await vi.waitFor(() => expect(interval?.disabled).toBe(false));
    interval?.click();

    await vi.waitFor(() => expect(playPattern).toHaveBeenCalled());
    expect(playPattern.mock.calls.at(-1)?.[1]).toBe(1);
  });

  test("starts cadence recognition and advances from a choice answer", async () => {
    const playPattern = vi.spyOn(SoundEngine.prototype, "playPattern");
    render(Page);

    const cadence = [...document.querySelectorAll("button")].find((button) =>
      button.textContent?.includes("Start Cadence"),
    );
    await vi.waitFor(() => expect(cadence?.disabled).toBe(false));
    cadence?.click();

    await vi.waitFor(() => expect(playPattern).toHaveBeenCalled());
    expect(document.body.textContent).toContain("What cadence did you hear?");
    expect(document.body.textContent).toContain("Authentic");
    answerChoiceButton()?.click();

    await vi.waitFor(() => expect(document.body.textContent).toContain("2 / 10"));
  });

  test("starts Pocket mode and advances from listening self-assessment", async () => {
    render(Page);

    const pocket = [...document.querySelectorAll("button")].find(
      (button) => button.textContent?.trim() === "Pocket",
    );
    pocket?.click();
    await vi.waitFor(() => expect(pocket?.getAttribute("aria-pressed")).toBe("true"));

    const mixed = [...document.querySelectorAll("button")].find((button) =>
      button.textContent?.includes("Mixed Session"),
    );
    await vi.waitFor(() => expect(mixed?.disabled).toBe(false));
    mixed?.click();

    await vi.waitFor(() => expect(document.body.textContent).toContain("Pocket mode"));
    expect(document.querySelector('[aria-label="Answer choices"]')).toBeNull();
    expect(document.querySelector('[role="group"][aria-label="On-screen keyboard"]')).toBeNull();

    [...document.querySelectorAll("button")]
      .find((button) => button.textContent?.trim() === "I heard it")
      ?.click();

    await vi.waitFor(() => expect(document.body.textContent).toContain("2 / 10"));
  });

  test("starts microphone voice mode and advances from audio pitch", async () => {
    let audioListener: ((event: NoteOnEvent) => void) | undefined;
    const audioSource = {
      state: { status: "idle" as const },
      start: vi.fn(async () => {}),
      stop: vi.fn(async () => {}),
      subscribeState: vi.fn(() => vi.fn()),
      subscribeEvents: vi.fn((listener: (event: NoteOnEvent) => void) => {
        audioListener = listener;
        return vi.fn();
      }),
    };
    const playPattern = vi.spyOn(SoundEngine.prototype, "playPattern");
    render(Page, { audioSource, audioSupported: true });

    [...document.querySelectorAll("button")]
      .find((button) => button.textContent?.trim() === "Voice")
      ?.click();
    await vi.waitFor(() =>
      expect(
        [...document.querySelectorAll("button")]
          .find((button) => button.textContent?.trim() === "Voice")
          ?.getAttribute("aria-pressed"),
      ).toBe("true"),
    );

    const scaleDegree = [...document.querySelectorAll("button")].find((button) =>
      button.textContent?.includes("Start Scale Degree"),
    );
    await vi.waitFor(() => expect(scaleDegree?.disabled).toBe(false));
    vi.useFakeTimers();
    scaleDegree?.click();

    await vi.waitFor(() => expect(audioSource.start).toHaveBeenCalledOnce());
    await vi.waitFor(() => expect(playPattern).toHaveBeenCalled());
    await vi.advanceTimersByTimeAsync(3_000);
    expect(document.body.textContent).toContain("Sing the answer");

    audioListener?.(audioNote(60));

    await vi.waitFor(() => expect(document.body.textContent).toContain("2 / 10"));
  });

  test("plays a performance prompt before count-in and arms only after started", async () => {
    const runtime = new MusicRuntime();
    vi.spyOn(runtime, "ensurePlaybackVoice").mockResolvedValue(true);
    const playPattern = vi.spyOn(runtime.sound, "playPattern").mockImplementation(() => undefined);
    let resolve!: (result: Awaited<ReturnType<MusicRuntime["beginPerformance"]>>) => void;
    const beginPerformance = vi.spyOn(runtime, "beginPerformance").mockReturnValue(
      new Promise((settle) => {
        resolve = settle;
      }),
    );
    const arm = vi.spyOn(EarTrainingSession.prototype, "armCurrentAnswer");
    render(Page, { runtime });

    button("Play-back")?.click();
    const scaleDegree = button("Start Scale Degree");
    await vi.waitFor(() => expect(scaleDegree?.disabled).toBe(false));
    vi.useFakeTimers();
    scaleDegree?.click();

    await vi.advanceTimersByTimeAsync(0);
    expect(playPattern).toHaveBeenCalled();
    const pattern = playPattern.mock.calls[0]![0];
    const durationMs =
      pattern.reduce((end, step) => Math.max(end, step.offsetSeconds + step.durationSeconds), 0) *
      1_000;
    expect(beginPerformance).not.toHaveBeenCalled();
    expect(arm).not.toHaveBeenCalled();
    expect(document.body.textContent).toContain("Input opens on the downbeat");

    await vi.advanceTimersByTimeAsync(durationMs - 1);
    expect(beginPerformance).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    expect(beginPerformance).toHaveBeenCalledOnce();
    resolve({ status: "started", downbeat: monotonicMs(1_234) });
    await vi.advanceTimersByTimeAsync(0);
    expect(arm).toHaveBeenCalledOnce();
    expect(document.body.textContent).toContain("Play the answer");
  });

  test("restarts the full prompt wait when replayed before count-in", async () => {
    const runtime = new MusicRuntime();
    vi.spyOn(runtime, "ensurePlaybackVoice").mockResolvedValue(true);
    const playPattern = vi.spyOn(runtime.sound, "playPattern").mockImplementation(() => undefined);
    const stopPattern = vi.spyOn(runtime.sound, "stopPattern");
    const beginPerformance = vi.spyOn(runtime, "beginPerformance").mockResolvedValue({
      status: "started",
      downbeat: monotonicMs(1_234),
    });
    const arm = vi.spyOn(EarTrainingSession.prototype, "armCurrentAnswer");
    const disarm = vi.spyOn(EarTrainingSession.prototype, "disarmCurrentAnswer");
    render(Page, { runtime });

    button("Play-back")?.click();
    const scaleDegree = button("Start Scale Degree");
    await vi.waitFor(() => expect(scaleDegree?.disabled).toBe(false));
    vi.useFakeTimers();
    scaleDegree?.click();
    await vi.advanceTimersByTimeAsync(0);

    const pattern = playPattern.mock.calls[0]![0];
    const durationMs =
      pattern.reduce((end, step) => Math.max(end, step.offsetSeconds + step.durationSeconds), 0) *
      1_000;
    await vi.advanceTimersByTimeAsync(Math.floor(durationMs / 2));
    stopPattern.mockClear();
    button("Replay sound")?.click();
    await vi.advanceTimersByTimeAsync(0);

    expect(disarm).toHaveBeenCalledOnce();
    expect(stopPattern).toHaveBeenCalledOnce();
    expect(arm).not.toHaveBeenCalled();
    expect(document.body.textContent).toContain("Input opens on the downbeat");
    await vi.advanceTimersByTimeAsync(durationMs - 1);
    expect(beginPerformance).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    expect(beginPerformance).toHaveBeenCalledOnce();
    expect(arm).toHaveBeenCalledOnce();
    expect(document.body.textContent).toContain("Play the answer");
  });

  test("restarts the full performance gate when replayed during count-in", async () => {
    const runtime = new MusicRuntime();
    vi.spyOn(runtime, "ensurePlaybackVoice").mockResolvedValue(true);
    const playPattern = vi.spyOn(runtime.sound, "playPattern").mockImplementation(() => undefined);
    const stopPattern = vi.spyOn(runtime.sound, "stopPattern");
    let resolveFirst!: (result: Awaited<ReturnType<MusicRuntime["beginPerformance"]>>) => void;
    let resolveSecond!: (result: Awaited<ReturnType<MusicRuntime["beginPerformance"]>>) => void;
    const beginPerformance = vi
      .spyOn(runtime, "beginPerformance")
      .mockReturnValueOnce(new Promise((resolve) => (resolveFirst = resolve)))
      .mockReturnValueOnce(new Promise((resolve) => (resolveSecond = resolve)));
    const arm = vi.spyOn(EarTrainingSession.prototype, "armCurrentAnswer");
    const disarm = vi.spyOn(EarTrainingSession.prototype, "disarmCurrentAnswer");
    render(Page, { runtime });

    button("Play-back")?.click();
    const scaleDegree = button("Start Scale Degree");
    await vi.waitFor(() => expect(scaleDegree?.disabled).toBe(false));
    vi.useFakeTimers();
    scaleDegree?.click();
    await vi.advanceTimersByTimeAsync(0);
    const pattern = playPattern.mock.calls[0]![0];
    const durationMs =
      pattern.reduce((end, step) => Math.max(end, step.offsetSeconds + step.durationSeconds), 0) *
      1_000;
    await vi.advanceTimersByTimeAsync(durationMs);
    expect(beginPerformance).toHaveBeenCalledOnce();

    stopPattern.mockClear();
    button("Replay sound")?.click();
    await vi.advanceTimersByTimeAsync(0);
    expect(disarm).toHaveBeenCalledOnce();
    expect(stopPattern).toHaveBeenCalledOnce();
    expect(arm).not.toHaveBeenCalled();
    expect(document.body.textContent).toContain("Input opens on the downbeat");

    resolveFirst({ status: "started", downbeat: monotonicMs(1_234) });
    await vi.advanceTimersByTimeAsync(0);
    expect(arm).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(durationMs);
    expect(beginPerformance).toHaveBeenCalledTimes(2);
    expect(arm).not.toHaveBeenCalled();
    resolveSecond({ status: "started", downbeat: monotonicMs(2_468) });
    await vi.advanceTimersByTimeAsync(0);
    expect(arm).toHaveBeenCalledOnce();
    expect(document.body.textContent).toContain("Play the answer");
  });

  test("cancels a stale performance prompt wait on abandon", async () => {
    const runtime = new MusicRuntime();
    vi.spyOn(runtime, "ensurePlaybackVoice").mockResolvedValue(true);
    const playPattern = vi.spyOn(runtime.sound, "playPattern").mockImplementation(() => undefined);
    const stopPattern = vi.spyOn(runtime.sound, "stopPattern");
    const endPerformance = vi.spyOn(runtime, "endPerformance");
    const beginPerformance = vi.spyOn(runtime, "beginPerformance");
    render(Page, { runtime });

    button("Play-back")?.click();
    const scaleDegree = button("Start Scale Degree");
    await vi.waitFor(() => expect(scaleDegree?.disabled).toBe(false));
    vi.useFakeTimers();
    const clearTimer = vi.spyOn(globalThis, "clearTimeout");
    scaleDegree?.click();
    await vi.advanceTimersByTimeAsync(0);
    expect(playPattern).toHaveBeenCalled();

    stopPattern.mockClear();
    endPerformance.mockClear();
    button("End session")?.click();
    expect(clearTimer).toHaveBeenCalled();
    expect(stopPattern).toHaveBeenCalledOnce();
    expect(endPerformance).toHaveBeenCalledOnce();
    await vi.advanceTimersByTimeAsync(10_000);
    expect(beginPerformance).not.toHaveBeenCalled();
  });

  test.each(["choice", "listen"] as const)(
    "keeps %s replay immediate and stops audio on result replacement",
    async (mode) => {
      const runtime = new MusicRuntime();
      const beginPerformance = vi.spyOn(runtime, "beginPerformance");
      const playPattern = vi
        .spyOn(runtime.sound, "playPattern")
        .mockImplementation(() => undefined);
      const stopPattern = vi.spyOn(runtime.sound, "stopPattern");
      const view = render(Page, { runtime });

      if (mode === "listen") button("Pocket")?.click();
      const mixed = button("Mixed Session");
      await vi.waitFor(() => expect(mixed?.disabled).toBe(false));
      mixed?.click();
      await vi.waitFor(() => expect(playPattern).toHaveBeenCalled());

      playPattern.mockClear();
      stopPattern.mockClear();
      button("Replay sound")?.click();
      await vi.waitFor(() => expect(playPattern).toHaveBeenCalledOnce());
      expect(stopPattern).toHaveBeenCalledOnce();
      expect(beginPerformance).not.toHaveBeenCalled();

      stopPattern.mockClear();
      if (mode === "listen") button("I heard it")?.click();
      else answerChoiceButton()?.click();
      await vi.waitFor(() => expect(document.body.textContent).toContain("2 / 10"));
      expect(stopPattern).toHaveBeenCalled();
      expect(beginPerformance).not.toHaveBeenCalled();
      view.unmount();
    },
  );

  test("settles prompt playback and stops the clock and audio on teardown", async () => {
    const runtime = new MusicRuntime();
    vi.spyOn(runtime, "ensurePlaybackVoice").mockResolvedValue(true);
    const playPattern = vi.spyOn(runtime.sound, "playPattern").mockImplementation(() => undefined);
    const stopPattern = vi.spyOn(runtime.sound, "stopPattern");
    const endPerformance = vi.spyOn(runtime, "endPerformance");
    const beginPerformance = vi.spyOn(runtime, "beginPerformance");
    const view = render(Page, { runtime });

    button("Play-back")?.click();
    const scaleDegree = button("Start Scale Degree");
    await vi.waitFor(() => expect(scaleDegree?.disabled).toBe(false));
    vi.useFakeTimers();
    scaleDegree?.click();
    await vi.advanceTimersByTimeAsync(0);
    expect(playPattern).toHaveBeenCalled();

    stopPattern.mockClear();
    endPerformance.mockClear();
    view.unmount();
    expect(stopPattern).toHaveBeenCalledOnce();
    expect(endPerformance).toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(10_000);
    expect(beginPerformance).not.toHaveBeenCalled();
  });

  test("starts melody dictation in play-back mode and advances from on-screen notes", async () => {
    render(Page);

    [...document.querySelectorAll("button")]
      .find((button) => button.textContent?.trim() === "Play-back")
      ?.click();
    await vi.waitFor(() =>
      expect(
        [...document.querySelectorAll("button")]
          .find((button) => button.textContent?.trim() === "Play-back")
          ?.getAttribute("aria-pressed"),
      ).toBe("true"),
    );

    const melody = [...document.querySelectorAll("button")].find(
      (button) => button.textContent?.trim() === "Start Melody Dictation",
    );
    await vi.waitFor(() => expect(melody?.disabled).toBe(false));
    vi.useFakeTimers();
    melody?.click();
    await vi.advanceTimersByTimeAsync(3_000);

    await vi.waitFor(() => expect(document.body.textContent).toContain("Play back the phrase"));
    await vi.waitFor(() =>
      expect(document.querySelector('[data-testid="melody-slot-stage"]')).not.toBeNull(),
    );
    expect(document.querySelector('[data-testid="melody-slot-stage"]')?.textContent).toContain(
      "Phrase memory",
    );
    expect(document.querySelector('[data-testid="melody-slot-stage"]')?.textContent).toContain(
      "3 notes",
    );
    expect(document.querySelector('[data-testid="melody-slot-stage"]')?.textContent).toContain(
      "Hear tonic again",
    );
    expect(document.querySelectorAll('[data-testid="melody-slot"]')).toHaveLength(3);

    [...document.querySelectorAll("button")].find((button) => button.textContent === "C4")?.click();
    await vi.waitFor(() =>
      expect(document.querySelector('[data-testid="melody-slot"]')?.textContent).toContain("C4"),
    );

    for (const noteName of ["F4", "C4"]) {
      [...document.querySelectorAll("button")]
        .find((button) => button.textContent === noteName)
        ?.click();
    }

    await vi.waitFor(() => expect(document.body.textContent).toContain("2 / 10"));
    await vi.waitFor(() =>
      expect(document.querySelector('[data-testid="phrase-result-feedback"]')).not.toBeNull(),
    );
    expect(document.querySelector('[data-testid="phrase-result-feedback"]')?.textContent).toContain(
      "Position feedback",
    );
    expect(document.querySelector('[data-testid="phrase-result-feedback"]')?.textContent).toContain(
      "/ 3 matched",
    );
    expect(document.querySelector('[data-testid="phrase-result-feedback"]')?.textContent).toContain(
      "Expected",
    );
    expect(document.querySelector('[data-testid="phrase-result-feedback"]')?.textContent).toContain(
      "Played",
    );
    const resultStates = [
      ...document.querySelectorAll('[data-testid="phrase-result-position"]'),
    ].map((element) => element.getAttribute("data-state"));
    expect(resultStates).toHaveLength(3);
    expect(resultStates).toContain("review");
  });

  test("uses the selected scale-degree level for focused sessions", async () => {
    render(Page);

    const majorPentachord = [...document.querySelectorAll("button")].find((button) =>
      button.textContent?.includes("Major pentachord"),
    );
    majorPentachord?.click();
    await vi.waitFor(() => expect(majorPentachord?.getAttribute("aria-pressed")).toBe("true"));

    const scaleDegree = [...document.querySelectorAll("button")].find((button) =>
      button.textContent?.includes("Start Scale Degree"),
    );
    await vi.waitFor(() => expect(scaleDegree?.disabled).toBe(false));
    scaleDegree?.click();

    await vi.waitFor(() => expect(answerChoiceButton()).not.toBeNull());
    expect(document.querySelector('[data-testid="scale-degree-context"]')?.textContent).toContain(
      "Tonic context",
    );
    expect(
      document.querySelectorAll('[aria-label="Scale-degree answer choices"] button'),
    ).toHaveLength(5);
    expect(
      [...document.querySelectorAll('[aria-label="Scale-degree answer choices"] button')].map(
        (button) => button.getAttribute("data-degree-token"),
      ),
    ).toEqual(["1", "2", "3", "4", "5"]);
  });

  test("can run focused scale-degree recognition as functional solfege", async () => {
    render(Page);

    button("Solfege")?.click();
    await vi.waitFor(() => expect(button("Solfege")).toHaveAttribute("aria-pressed", "true"));

    const scaleDegree = [...document.querySelectorAll("button")].find((candidate) =>
      candidate.textContent?.includes("Start Scale Degree"),
    );
    await vi.waitFor(() => expect(scaleDegree?.disabled).toBe(false));
    scaleDegree?.click();

    await vi.waitFor(() => expect(answerChoiceButton()).not.toBeNull());
    expect(
      [...document.querySelectorAll('[aria-label="Scale-degree answer choices"] button')].map(
        (choice) => choice.textContent?.trim(),
      ),
    ).toEqual(["do", "sol"]);
    expect(window.location.search).toContain("labels=solfege");
  });

  test("restores setup from shareable query parameters", async () => {
    setTestUrl(
      "/music/learn/ear?drill=scale-degree&answer=play-back&feedback=test&level=chromatic-color&labels=solfege",
    );

    render(Page);

    await vi.waitFor(() => expect(button("Play-back")?.getAttribute("aria-pressed")).toBe("true"));
    expect(button("Test")).toHaveAttribute("aria-pressed", "true");
    expect(button("Chromatic color")).toHaveAttribute("aria-pressed", "true");
    expect(button("Solfege")).toHaveAttribute("aria-pressed", "true");
    expect(window.location.search).toContain("drill=scale-degree");
  });

  test("keeps setup changes and the selected drill in the shareable URL", async () => {
    setTestUrl("/music/learn/ear");
    render(Page);

    button("Pocket")?.click();
    button("Test")?.click();
    button("Major pentachord")?.click();
    await vi.waitFor(() => expect(window.location.search).toContain("answer=listen"));
    expect(window.location.search).toContain("feedback=test");
    expect(window.location.search).toContain("level=major-pentachord");

    const scaleDegree = [...document.querySelectorAll("button")].find((candidate) =>
      candidate.textContent?.includes("Start Scale Degree"),
    );
    await vi.waitFor(() => expect(scaleDegree?.disabled).toBe(false));
    scaleDegree?.click();

    await vi.waitFor(() => expect(window.location.search).toContain("drill=scale-degree"));
  });

  test("plays an unscored scale-degree warmup over a drone", async () => {
    const startDrone = vi.spyOn(SoundEngine.prototype, "startDrone");
    const stopDrone = vi.spyOn(SoundEngine.prototype, "stopDrone");
    const playPattern = vi.spyOn(SoundEngine.prototype, "playPattern");
    render(Page);

    const startDroneButton = [...document.querySelectorAll("button")].find((button) =>
      button.textContent?.includes("Start drone"),
    );
    await vi.waitFor(() => expect(startDroneButton?.disabled).toBe(false));
    startDroneButton?.click();

    await vi.waitFor(() => expect(startDrone).toHaveBeenCalledWith(60));

    const dominant = document.querySelectorAll<HTMLButtonElement>(
      '[aria-label="Free-play scale degrees"] button',
    )[1];
    dominant?.click();

    await vi.waitFor(() =>
      expect(playPattern).toHaveBeenLastCalledWith([
        { midiNotes: [60], offsetSeconds: 0, durationSeconds: 0.45 },
        { midiNotes: [67], offsetSeconds: 0.55, durationSeconds: 0.6 },
      ]),
    );

    const stopDroneButton = [...document.querySelectorAll("button")].find((button) =>
      button.textContent?.includes("Stop drone"),
    );
    stopDroneButton?.click();
    expect(stopDrone).toHaveBeenCalled();
  });

  test("surfaces repertoire transfer prompts from saved songs", async () => {
    const playPattern = vi.spyOn(SoundEngine.prototype, "playPattern");
    render(Page, {
      library: {
        list: vi.fn(async () => [
          {
            id: "song-1",
            title: "Transfer Study",
            createdAt: 0,
            updatedAt: 0,
            score: repertoireScore(),
          },
        ]),
      },
    });

    await vi.waitFor(() => expect(document.body.textContent).toContain("Repertoire transfer"));
    expect(document.body.textContent).toContain("Transfer Study");
    expect(document.body.textContent).toContain("1 / do, 2 / re, 3 / mi, 5 / sol");

    [...document.querySelectorAll("button")]
      .find((button) => button.textContent?.trim() === "Preview transfer")
      ?.click();

    await vi.waitFor(() =>
      expect(playPattern).toHaveBeenCalledWith([
        { midiNotes: [60], offsetSeconds: 0, durationSeconds: 0.5 },
        { midiNotes: [62], offsetSeconds: 0.5, durationSeconds: 0.5 },
        { midiNotes: [64], offsetSeconds: 1, durationSeconds: 0.5 },
        { midiNotes: [67], offsetSeconds: 1.5, durationSeconds: 0.5 },
      ]),
    );
  });

  test("ranks a review queue across saved songs with status badges", async () => {
    render(Page, {
      library: {
        list: vi.fn(async () => [
          {
            id: "song-1",
            title: "Song One",
            createdAt: 0,
            updatedAt: 0,
            score: { ...repertoireScore(), id: "s1", title: "Song One" },
          },
          {
            id: "song-2",
            title: "Song Two",
            createdAt: 0,
            updatedAt: 0,
            score: { ...repertoireScore(), id: "s2", title: "Song Two" },
          },
        ]),
      },
    });

    await vi.waitFor(() =>
      expect(document.body.textContent).toContain("Review phrases from your saved songs"),
    );
    expect(document.body.textContent).toContain("Song One");
    expect(document.body.textContent).toContain("Song Two");
    // Each phrase carries a review-status badge (exact value depends on practice history).
    expect(document.body.textContent).toMatch(/New|Review due|Strong/);
    // One Practice button per ranked phrase.
    const practiceButtons = [...document.querySelectorAll("button")].filter(
      (button) => button.textContent?.trim() === "Practice transfer",
    );
    expect(practiceButtons.length).toBe(2);
  });

  test("surfaces a structured repertoire review plan", async () => {
    render(Page, {
      library: {
        list: vi.fn(async () => [
          {
            id: "song-1",
            title: "Song One",
            createdAt: 0,
            updatedAt: 0,
            score: { ...repertoireScore(), id: "s1", title: "Song One" },
          },
          {
            id: "song-2",
            title: "Song Two",
            createdAt: 0,
            updatedAt: 0,
            score: { ...repertoireScore(), id: "s2", title: "Song Two" },
          },
        ]),
      },
    });

    await vi.waitFor(() => expect(document.body.textContent).toContain("Repertoire review plan"));
    expect(document.body.textContent).toMatch(/Warm up|Review due|New material|Stretch/);
  });

  test("starts a scored repertoire transfer drill from a saved song phrase", async () => {
    render(Page, {
      library: {
        list: vi.fn(async () => [
          {
            id: "song-1",
            title: "Transfer Study",
            createdAt: 0,
            updatedAt: 0,
            score: repertoireScore(),
          },
        ]),
      },
    });

    await vi.waitFor(() => expect(document.body.textContent).toContain("Repertoire transfer"));
    vi.useFakeTimers();
    [...document.querySelectorAll("button")]
      .find((button) => button.textContent?.trim() === "Practice transfer")
      ?.click();
    await vi.advanceTimersByTimeAsync(3_000);

    await vi.waitFor(() =>
      expect(document.body.textContent).toContain("Play back the saved-song phrase"),
    );
    for (const noteName of ["C4", "D4", "E4", "G4"]) {
      [...document.querySelectorAll("button")]
        .find((button) => button.textContent === noteName)
        ?.click();
    }

    await vi.waitFor(() => expect(document.body.textContent).toContain("Session complete"));
    expect(document.body.textContent).toContain("1 of 1 correct");
    await vi.waitFor(() =>
      expect(document.querySelector('[data-testid="phrase-result-feedback"]')).not.toBeNull(),
    );
    expect(document.querySelector('[data-testid="phrase-result-feedback"]')?.textContent).toContain(
      "4 / 4 matched",
    );
    expect(document.body.textContent).not.toContain("Cannot read properties");
  });

  test("retries repertoire phrase mistakes as focused scale-degree review", async () => {
    render(Page, {
      library: {
        list: vi.fn(async () => [
          {
            id: "song-1",
            title: "Transfer Study",
            createdAt: 0,
            updatedAt: 0,
            score: repertoireScore(),
          },
        ]),
      },
    });

    await vi.waitFor(() => expect(document.body.textContent).toContain("Repertoire transfer"));
    vi.useFakeTimers();
    [...document.querySelectorAll("button")]
      .find((button) => button.textContent?.trim() === "Practice transfer")
      ?.click();
    await vi.advanceTimersByTimeAsync(3_000);

    await vi.waitFor(() =>
      expect(document.body.textContent).toContain("Play back the saved-song phrase"),
    );
    for (const noteName of ["C4", "D4", "D4", "G4"]) {
      [...document.querySelectorAll("button")]
        .find((button) => button.textContent === noteName)
        ?.click();
    }

    await vi.waitFor(() => expect(document.body.textContent).toContain("Session complete"));
    expect(document.body.textContent).toContain("3 → 2");

    [...document.querySelectorAll("button")]
      .find((button) => button.textContent?.trim() === "Retry mistakes")
      ?.click();

    await vi.waitFor(() => expect(document.body.textContent).toContain("1 / 1"));
    expect(document.body.textContent).toContain("What scale degree did you hear?");
  });

  test("starts the repertoire review plan as a multi-prompt transfer session", async () => {
    render(Page, {
      library: {
        list: vi.fn(async () => [
          {
            id: "song-1",
            title: "Song One",
            createdAt: 0,
            updatedAt: 0,
            score: { ...repertoireScore(), id: "s1", title: "Song One" },
          },
          {
            id: "song-2",
            title: "Song Two",
            createdAt: 0,
            updatedAt: 0,
            score: { ...repertoireScore(), id: "s2", title: "Song Two" },
          },
        ]),
      },
    });

    await vi.waitFor(() => expect(document.body.textContent).toContain("Repertoire review plan"));
    vi.useFakeTimers();
    [...document.querySelectorAll("button")]
      .find((button) => button.textContent?.trim() === "Practice review plan")
      ?.click();
    await vi.advanceTimersByTimeAsync(3_000);

    await vi.waitFor(() => expect(document.body.textContent).toContain("1 / 2"));
    for (const noteName of ["C4", "D4", "E4", "G4"]) {
      [...document.querySelectorAll("button")]
        .find((button) => button.textContent === noteName)
        ?.click();
    }
    await vi.waitFor(() => expect(document.body.textContent).toContain("2 / 2"));
    await vi.advanceTimersByTimeAsync(3_000);
    for (const noteName of ["C4", "D4", "E4", "G4"]) {
      [...document.querySelectorAll("button")]
        .find((button) => button.textContent === noteName)
        ?.click();
    }

    await vi.waitFor(() => expect(document.body.textContent).toContain("Session complete"));
    expect(document.body.textContent).toContain("2 of 2 correct");
  });

  test("stops the free-play drone before starting a scored session", async () => {
    const stopDrone = vi.spyOn(SoundEngine.prototype, "stopDrone");
    render(Page);

    const startDroneButton = [...document.querySelectorAll("button")].find((button) =>
      button.textContent?.includes("Start drone"),
    );
    await vi.waitFor(() => expect(startDroneButton?.disabled).toBe(false));
    startDroneButton?.click();

    await vi.waitFor(() =>
      expect(
        [...document.querySelectorAll("button")].some((button) =>
          button.textContent?.includes("Stop drone"),
        ),
      ).toBe(true),
    );

    const mixed = [...document.querySelectorAll("button")].find((button) =>
      button.textContent?.includes("Mixed Session"),
    );
    mixed?.click();

    await vi.waitFor(() => expect(stopDrone).toHaveBeenCalled());
  });

  test("renders recent results and retry actions in the summary", async () => {
    render(Page);
    const mixed = [...document.querySelectorAll("button")].find((button) =>
      button.textContent?.includes("Mixed Session"),
    );
    await vi.waitFor(() => expect(mixed?.disabled).toBe(false));
    mixed?.click();

    for (let index = 0; index < 10; index += 1) {
      await vi.waitFor(() => expect(answerChoiceButton()).not.toBeNull());
      answerChoiceButton()?.click();
      if (index < 9) {
        await vi.waitFor(() => expect(document.body.textContent).toContain(`${index + 2} / 10`));
      }
    }

    await vi.waitFor(() => expect(document.body.textContent).toContain("Session complete"));
    expect(document.body.textContent).toContain("Recent results");
    expect(document.body.textContent).toContain("Retry mistakes");
    expect(document.body.textContent).toContain("Repeat session");
    expect(document.body.textContent).toContain("Change setup");
    expect(document.activeElement?.textContent).toContain("Session complete");
    expect(document.querySelector('[data-testid="ear-phase-announcement"]')?.textContent).toContain(
      "Session complete",
    );

    button("Change setup")?.click();

    await vi.waitFor(() => expect(button("Start Mixed Session")).not.toBeUndefined());
    expect(document.body.textContent).not.toContain("Recent results");
    expect(document.activeElement?.getAttribute("aria-label")).toBe("Ear training setup");
  });
});

function button(label: string): HTMLButtonElement | undefined {
  const buttons = [...document.querySelectorAll<HTMLButtonElement>("button")];
  return (
    buttons.find((candidate) => candidate.textContent?.trim() === label) ??
    buttons.find((candidate) => candidate.textContent?.includes(label))
  );
}

function answerChoiceButton(): HTMLButtonElement | null {
  return document.querySelector<HTMLButtonElement>(
    '[aria-label="Answer choices"] button, [aria-label="Scale-degree answer choices"] button',
  );
}

function audioNote(midiNote: number): NoteOnEvent {
  return {
    type: "noteOn",
    midiNote,
    velocity: 1,
    source: "audio",
    confidence: 0.9,
    timestamp: monotonicMs(0),
    clock: "performance",
  };
}

function repertoireScore() {
  return {
    id: "score-1",
    title: "Transfer Study",
    origin: "generated" as const,
    keySignature: "C",
    tempoMap: [{ atBeat: 0, bpm: 120 }],
    timeSignatures: [{ atBeat: 0, numerator: 4, denominator: 4 }],
    voices: [{ id: "melody", name: "Melody", role: "melody" as const }],
    notes: [
      { midiNote: 60, startBeat: 0, durationBeats: 1, velocity: 0.8, voiceId: "melody" },
      { midiNote: 62, startBeat: 1, durationBeats: 1, velocity: 0.8, voiceId: "melody" },
      { midiNote: 64, startBeat: 2, durationBeats: 1, velocity: 0.8, voiceId: "melody" },
      { midiNote: 67, startBeat: 3, durationBeats: 1, velocity: 0.8, voiceId: "melody" },
    ],
    chords: [],
    sections: [],
    markers: [],
  };
}
