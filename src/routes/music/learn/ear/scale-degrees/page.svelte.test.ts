import { continueEarPractice } from "../_components/ear-test-helpers";
import { describe, expect, test, vi } from "vite-plus/test";
import { render } from "vitest-browser-svelte";

import { monotonicMs, type NoteOnEvent } from "@repo/music-core/domain";
import { EarTrainingSession } from "@repo/music-core/engines/ear-training";
import { SoundEngine } from "@repo/music-core/engines/sound";

import Page from "./+page.svelte";
import { setTestUrl } from "../../../_components/test-url";
import { MusicRuntime } from "../../../_runtime.svelte";
import {
  answerChoiceButton,
  audioNote,
  button,
  openSetup,
  setupEarTest,
} from "../_components/ear-test-helpers";

describe("/music/learn/ear/scale-degrees/+page.svelte", () => {
  setupEarTest();

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
    await openSetup();

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

    const scaleDegree = [...document.querySelectorAll("button")].find(
      (button) => button.textContent?.trim() === "Start",
    );
    expect(document.querySelector('[aria-label="Input: Microphone"]')).not.toBeNull();
    await vi.waitFor(() => expect(scaleDegree?.disabled).toBe(false));
    vi.useFakeTimers();
    scaleDegree?.click();

    await vi.waitFor(() => expect(audioSource.start).toHaveBeenCalledOnce());
    await vi.waitFor(() => expect(playPattern).toHaveBeenCalled());
    await vi.advanceTimersByTimeAsync(3_000);
    expect(document.body.textContent).toContain("Sing the answer");

    audioListener?.(audioNote(60));

    await continueEarPractice();
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

    await openSetup();
    button("Play-back")?.click();
    const scaleDegree = button("Start");
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
    await openSetup();

    button("Play-back")?.click();
    const scaleDegree = button("Start");
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
    await openSetup();

    button("Play-back")?.click();
    const scaleDegree = button("Start");
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
    await openSetup();

    button("Play-back")?.click();
    const scaleDegree = button("Start");
    await vi.waitFor(() => expect(scaleDegree?.disabled).toBe(false));
    vi.useFakeTimers();
    const clearTimer = vi.spyOn(globalThis, "clearTimeout");
    scaleDegree?.click();
    await vi.advanceTimersByTimeAsync(0);
    expect(playPattern).toHaveBeenCalled();

    stopPattern.mockClear();
    endPerformance.mockClear();
    button("Stop")?.click();
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
      await openSetup();

      if (mode === "listen") {
        await openSetup();
        button("Pocket")?.click();
      }
      const mixed = button("Start");
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
      if (mode === "listen") {
        button("Reveal answer")?.click();
        await vi.waitFor(() => expect(button("I recalled it")).not.toBeUndefined());
        button("I recalled it")?.click();
      } else {
        answerChoiceButton()?.click();
        await continueEarPractice();
      }
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
    await openSetup();

    button("Play-back")?.click();
    const scaleDegree = button("Start");
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

  test("uses the selected scale-degree level for focused sessions", async () => {
    render(Page);
    await openSetup();

    const majorPentachord = [...document.querySelectorAll("button")].find((button) =>
      button.textContent?.includes("Major pentachord"),
    );
    majorPentachord?.click();
    await vi.waitFor(() => expect(majorPentachord?.getAttribute("aria-pressed")).toBe("true"));

    const scaleDegree = [...document.querySelectorAll("button")].find(
      (button) => button.textContent?.trim() === "Start",
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

    await openSetup();
    button("Solfege")?.click();
    await vi.waitFor(() => expect(button("Solfege")).toHaveAttribute("aria-pressed", "true"));

    const scaleDegree = [...document.querySelectorAll("button")].find(
      (candidate) => candidate.textContent?.trim() === "Start",
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
      "/music/learn/ear/scale-degrees?answer=play-back&feedback=test&level=chromatic-color&labels=solfege",
    );

    render(Page);

    await openSetup();
    await vi.waitFor(() => expect(button("Play-back")?.getAttribute("aria-pressed")).toBe("true"));
    expect(button("Test")).toHaveAttribute("aria-pressed", "true");
    expect(button("Chromatic color")).toHaveAttribute("aria-pressed", "true");
    expect(button("Solfege")).toHaveAttribute("aria-pressed", "true");
    // The drill is the route now, never a query parameter.
    expect(window.location.search).not.toContain("drill=");
  });

  test("keeps setup changes in the shareable URL without a drill parameter", async () => {
    setTestUrl("/music/learn/ear/scale-degrees");
    render(Page);

    await openSetup();
    button("Pocket")?.click();
    button("Test")?.click();
    button("Major pentachord")?.click();
    await vi.waitFor(() => expect(window.location.search).toContain("answer=listen"));
    expect(window.location.search).toContain("feedback=test");
    expect(window.location.search).toContain("level=major-pentachord");

    const scaleDegree = [...document.querySelectorAll("button")].find(
      (candidate) => candidate.textContent?.trim() === "Start",
    );
    await vi.waitFor(() => expect(scaleDegree?.disabled).toBe(false));
    scaleDegree?.click();

    await vi.waitFor(() => expect(button("Stop")).not.toBeUndefined());
    expect(window.location.pathname).toBe("/music/learn/ear/scale-degrees");
    expect(window.location.search).not.toContain("drill=");
    expect(window.location.search).toContain("level=major-pentachord");
  });

  test("plays an unscored scale-degree warmup over a drone", async () => {
    const startDrone = vi.spyOn(SoundEngine.prototype, "startDrone");
    const stopDrone = vi.spyOn(SoundEngine.prototype, "stopDrone");
    const playPattern = vi.spyOn(SoundEngine.prototype, "playPattern");
    render(Page);
    await openSetup();

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
});
