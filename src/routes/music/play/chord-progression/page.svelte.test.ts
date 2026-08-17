import { afterEach, beforeEach, expect, test, vi } from "vite-plus/test";
import { render } from "vitest-browser-svelte";

import { expectedChordsFromProgression } from "@repo/music-core/engines/chord-follower";
import { JAM_PROGRESSIONS } from "@repo/music-core/engines/jam";
import { monotonicMs } from "@repo/music-core/domain";

import { MusicRuntime } from "../../_runtime.svelte";
import Page from "./+page.svelte";
import { pushTestUrl, setTestUrl } from "../../_components/test-url";

beforeEach(() => {
  vi.spyOn(MusicRuntime.prototype, "beginPerformance").mockResolvedValue({
    status: "started",
    downbeat: monotonicMs(1_000),
  });
});

afterEach(() => {
  vi.restoreAllMocks();
  setTestUrl("/");
  document.body.replaceChildren();
});

function button(label: string): HTMLButtonElement | undefined {
  return [...document.querySelectorAll<HTMLButtonElement>("button")].find(
    (b) => b.textContent?.trim() === label,
  );
}

test("grades a strummed progression from injected onset observations", async () => {
  let analysisCb:
    | ((a: {
        chroma: Float32Array;
        timestamp: number;
        onset: boolean;
        onsetWindow?: Float32Array;
      }) => void)
    | undefined;
  const audioSource = {
    state: { status: "running" as const },
    start: vi.fn(async () => {}),
    stop: vi.fn(async () => {}),
    subscribeState: vi.fn(() => () => {}),
    subscribeAnalysis: vi.fn((cb: typeof analysisCb) => {
      analysisCb = cb;
      return () => {};
    }),
  };
  const expected = expectedChordsFromProgression(JAM_PROGRESSIONS[0]!);
  // Injected analyzer returns, per call, the MIDI of the next expected chord in order.
  let call = 0;
  const analyzeOnsetWindow = vi.fn(async () => {
    const chord = expected[Math.min(call++, expected.length - 1)]!;
    return chord.pitchClasses.map((pc) => 60 + pc);
  });
  const runtime = new MusicRuntime();
  const register = vi.spyOn(runtime, "registerPracticeContext");

  render(Page, { audioSource, analyzeOnsetWindow, runtime });
  expect(
    document.querySelector('[data-testid="progression-current-symbol"]')?.textContent,
  ).toContain(expected[0]!.symbol);
  expect(
    document.querySelector('[data-testid="progression-cell-0"]')?.getAttribute("data-state"),
  ).toBe("current");
  expect(document.querySelectorAll('[data-tone-role="chord"]').length).toBeGreaterThan(0);
  expect(document.querySelectorAll('[data-tone-role="scale"]').length).toBeGreaterThan(0);

  button("Start")?.click();
  await vi.waitFor(() => expect(audioSource.start).toHaveBeenCalled());
  expect(runtime.beginPerformance).toHaveBeenCalledOnce();
  expect(register).toHaveBeenCalledWith(
    expect.objectContaining({ variantKey: "v1:chord-progression:ii-v-i:follow" }),
  );

  // Emit one onset per expected chord; the follower should advance + grade each.
  for (let i = 0; i < expected.length; i++) {
    analysisCb?.({
      chroma: new Float32Array(12),
      timestamp: 1000 + i,
      onset: true,
      onsetWindow: new Float32Array(8),
    });
    await vi.waitFor(() => expect(analyzeOnsetWindow).toHaveBeenCalledTimes(i + 1));
    if (i === 1) {
      await vi.waitFor(() =>
        expect(
          document.querySelector('[data-testid="progression-current-symbol"]')?.textContent,
        ).toContain(expected[1]!.symbol),
      );
      expect(
        document.querySelector('[data-testid="progression-cell-1"]')?.getAttribute("data-state"),
      ).toBe("current");
    }
  }

  await vi.waitFor(() => {
    expect(document.body.textContent).toContain(expected[0]!.symbol);
    expect(document.body.textContent).toContain(expected[expected.length - 1]!.symbol);
  });
  expect(audioSource.subscribeAnalysis).toHaveBeenCalled();
});

test("chroma-only analyses update the detected-tones readout but never grade or advance", async () => {
  let analysisCb:
    | ((a: {
        chroma: Float32Array;
        timestamp: number;
        onset: boolean;
        onsetWindow?: Float32Array;
      }) => void)
    | undefined;
  const audioSource = {
    state: { status: "running" as const },
    start: vi.fn(async () => {}),
    stop: vi.fn(async () => {}),
    subscribeState: vi.fn(() => () => {}),
    subscribeAnalysis: vi.fn((cb: typeof analysisCb) => {
      analysisCb = cb;
      return () => {};
    }),
  };
  const expected = expectedChordsFromProgression(JAM_PROGRESSIONS[0]!);
  const analyzeOnsetWindow = vi.fn(async () => {
    const chord = expected[0]!;
    return chord.pitchClasses.map((pc) => 60 + pc);
  });
  const runtime = new MusicRuntime();

  render(Page, { audioSource, analyzeOnsetWindow, runtime });
  button("Start")?.click();
  await vi.waitFor(() => expect(audioSource.start).toHaveBeenCalled());

  // Chroma-only frames (no onsetWindow) — bins 0/4/7 (C major triad) set to 1.
  for (let i = 0; i < 5; i++) {
    const chroma = new Float32Array(12);
    chroma[0] = 1;
    chroma[4] = 1;
    chroma[7] = 1;
    analysisCb?.({
      chroma,
      timestamp: 1000 + i,
      onset: false,
    });
  }

  // Give any (incorrect) async grading a chance to run before asserting it didn't.
  await new Promise((resolve) => setTimeout(resolve, 20));

  expect(analyzeOnsetWindow).not.toHaveBeenCalled();
  await vi.waitFor(() => {
    expect(document.body.textContent).toContain("C");
  });
  expect(document.body.textContent).not.toContain("matched in-time");
  expect(document.body.textContent).not.toContain("matched off-time");
});

test("starts verified capture before the clock and ignores analysis until the downbeat", async () => {
  let state = { status: "requesting" as const } as { status: "requesting" } | { status: "running" };
  let resolveCapture!: () => void;
  let resolveDownbeat!: (result: Awaited<ReturnType<MusicRuntime["beginPerformance"]>>) => void;
  let analysisCb:
    | ((analysis: {
        chroma: Float32Array;
        timestamp: number;
        onset: boolean;
        onsetWindow?: Float32Array;
      }) => void)
    | undefined;
  const audioSource = {
    get state() {
      return state;
    },
    start: vi.fn(
      () =>
        new Promise<void>((resolve) => {
          resolveCapture = resolve;
        }),
    ),
    stop: vi.fn(async () => {}),
    subscribeState: vi.fn(() => () => {}),
    subscribeAnalysis: vi.fn((cb: typeof analysisCb) => {
      analysisCb = cb;
      return () => {};
    }),
  };
  const runtime = new MusicRuntime();
  vi.spyOn(runtime, "beginPerformance").mockReturnValue(
    new Promise((resolve) => {
      resolveDownbeat = resolve;
    }),
  );
  const analyzeOnsetWindow = vi.fn(async () => [60, 64, 67]);
  render(Page, { audioSource, analyzeOnsetWindow, runtime });

  button("Start")?.click();
  await vi.waitFor(() => expect(audioSource.start).toHaveBeenCalledOnce());
  expect(runtime.beginPerformance).not.toHaveBeenCalled();
  expect(audioSource.subscribeAnalysis).not.toHaveBeenCalled();

  state = { status: "running" };
  resolveCapture();
  await vi.waitFor(() => expect(runtime.beginPerformance).toHaveBeenCalledOnce());
  expect(audioSource.subscribeAnalysis).not.toHaveBeenCalled();

  resolveDownbeat({ status: "started", downbeat: monotonicMs(1_000) });
  await vi.waitFor(() => expect(audioSource.subscribeAnalysis).toHaveBeenCalledOnce());
  analysisCb?.({
    chroma: new Float32Array(12),
    timestamp: 1_000,
    onset: true,
    onsetWindow: new Float32Array(8),
  });
  await vi.waitFor(() => expect(analyzeOnsetWindow).toHaveBeenCalledOnce());
});

test("uses the tempo that settles while microphone capture is pending", async () => {
  let state = { status: "requesting" as const } as { status: "requesting" } | { status: "running" };
  let resolveCapture!: () => void;
  let analysisCb:
    | ((analysis: {
        chroma: Float32Array;
        timestamp: number;
        onset: boolean;
        onsetWindow?: Float32Array;
      }) => void)
    | undefined;
  const audioSource = {
    get state() {
      return state;
    },
    start: vi.fn(
      () =>
        new Promise<void>((resolve) => {
          resolveCapture = resolve;
        }),
    ),
    stop: vi.fn(async () => {}),
    subscribeState: vi.fn(() => () => {}),
    subscribeAnalysis: vi.fn((callback: typeof analysisCb) => {
      analysisCb = callback;
      return () => {};
    }),
  };
  const expected = expectedChordsFromProgression(JAM_PROGRESSIONS[0]!);
  let analyzed = 0;
  const analyzeOnsetWindow = vi.fn(async () => {
    const chord = expected[Math.min(analyzed++, expected.length - 1)]!;
    return chord.pitchClasses.map((pitchClass) => 60 + pitchClass);
  });
  const runtime = new MusicRuntime();
  const clockBpms: number[] = [];
  vi.spyOn(runtime, "beginPerformance").mockImplementation(async () => {
    clockBpms.push(runtime.practiceBpm);
    return { status: "started", downbeat: monotonicMs(1_000) };
  });
  render(Page, { audioSource, analyzeOnsetWindow, runtime });

  button("Start")?.click();
  await vi.waitFor(() => expect(audioSource.start).toHaveBeenCalledOnce());
  runtime.setPracticeVariantBpm(180, "v1:chord-progression:ii-v-i:follow");
  state = { status: "running" };
  resolveCapture();

  await vi.waitFor(() => expect(audioSource.subscribeAnalysis).toHaveBeenCalledOnce());
  expect(clockBpms).toEqual([180]);
  expect(runtime.practiceBpm).toBe(180);
  expect(window.location.search).toContain("bpm=180");

  for (const chord of expected.slice(0, 2)) {
    analysisCb?.({
      chroma: new Float32Array(12),
      timestamp: 1_000 + (chord.startBeat * 60_000) / 180,
      onset: true,
      onsetWindow: new Float32Array(8),
    });
    await vi.waitFor(() => expect(analyzeOnsetWindow).toHaveBeenCalledTimes(analyzed));
  }
  await vi.waitFor(() => expect(document.body.textContent).toContain("matched in-time"));
});

test("keeps setup idle when microphone capture is denied", async () => {
  const audioSource = {
    state: {
      status: "denied" as const,
      message: "Microphone access was blocked.",
    },
    start: vi.fn(async () => {}),
    stop: vi.fn(async () => {}),
    subscribeState: vi.fn(() => () => {}),
    subscribeAnalysis: vi.fn(() => () => {}),
  };
  const runtime = new MusicRuntime();
  const endPerformance = vi.spyOn(runtime, "endPerformance");
  render(Page, { audioSource, runtime });

  button("Start")?.click();

  await vi.waitFor(() => expect(audioSource.stop).toHaveBeenCalled());
  expect(document.body.textContent).toContain("Microphone access was blocked.");
  expect(runtime.beginPerformance).not.toHaveBeenCalled();
  expect(endPerformance).toHaveBeenCalled();
  expect(button("Start")).not.toBeUndefined();
  expect(button("Stop")).toBeUndefined();
});

test("does not start the clock when teardown wins pending microphone setup", async () => {
  let state = { status: "requesting" as const } as { status: "requesting" } | { status: "running" };
  let resolveCapture!: () => void;
  const audioSource = {
    get state() {
      return state;
    },
    start: vi.fn(
      () =>
        new Promise<void>((resolve) => {
          resolveCapture = resolve;
        }),
    ),
    stop: vi.fn(async () => {}),
    subscribeState: vi.fn(() => () => {}),
    subscribeAnalysis: vi.fn(() => () => {}),
  };
  const runtime = new MusicRuntime();
  const view = render(Page, { audioSource, runtime });

  button("Start")?.click();
  await vi.waitFor(() => expect(audioSource.start).toHaveBeenCalledOnce());
  view.unmount();
  state = { status: "running" };
  resolveCapture();

  await vi.waitFor(() => expect(audioSource.stop).toHaveBeenCalled());
  expect(runtime.beginPerformance).not.toHaveBeenCalled();
  expect(audioSource.subscribeAnalysis).not.toHaveBeenCalled();
});

test("keeps setup pending and stops an unresolved microphone start", async () => {
  let state = { status: "requesting" as const } as { status: "requesting" } | { status: "running" };
  let resolveCapture!: () => void;
  const audioSource = {
    get state() {
      return state;
    },
    start: vi.fn(
      () =>
        new Promise<void>((resolve) => {
          resolveCapture = resolve;
        }),
    ),
    stop: vi.fn(async () => {}),
    subscribeState: vi.fn(() => () => {}),
    subscribeAnalysis: vi.fn(() => () => {}),
  };
  const runtime = new MusicRuntime();
  render(Page, { audioSource, runtime });

  button("Start")?.click();
  await vi.waitFor(() => expect(audioSource.start).toHaveBeenCalledOnce());

  expect(button("Blues")).not.toBeUndefined();
  expect(button("Stop")).not.toBeUndefined();
  expect(runtime.beginPerformance).not.toHaveBeenCalled();

  button("Stop")?.click();
  await vi.waitFor(() => expect(audioSource.stop).toHaveBeenCalled());
  state = { status: "running" };
  resolveCapture();

  await new Promise((resolve) => setTimeout(resolve, 0));
  expect(runtime.beginPerformance).not.toHaveBeenCalled();
  expect(button("Start")).not.toBeUndefined();
  expect(button("Stop")).toBeUndefined();
});

test("does not grade a stale onset into a restarted follower", async () => {
  const callbacks: Array<
    (analysis: {
      chroma: Float32Array;
      timestamp: number;
      onset: boolean;
      onsetWindow?: Float32Array;
    }) => void
  > = [];
  const audioSource = {
    state: { status: "running" as const },
    start: vi.fn(async () => {}),
    stop: vi.fn(async () => {}),
    subscribeState: vi.fn(() => () => {}),
    subscribeAnalysis: vi.fn((callback: (typeof callbacks)[number]) => {
      callbacks.push(callback);
      return () => {};
    }),
  };
  let resolveAnalysis!: (notes: number[]) => void;
  const analyzeOnsetWindow = vi.fn(
    () =>
      new Promise<number[]>((resolve) => {
        resolveAnalysis = resolve;
      }),
  );
  const runtime = new MusicRuntime();
  const recordPractice = vi.spyOn(runtime, "recordPractice").mockResolvedValue();
  render(Page, { audioSource, analyzeOnsetWindow, runtime });

  button("Start")?.click();
  await vi.waitFor(() => expect(callbacks).toHaveLength(1));
  callbacks[0]?.({
    chroma: new Float32Array(12),
    timestamp: 1_000,
    onset: true,
    onsetWindow: new Float32Array(8),
  });
  await vi.waitFor(() => expect(analyzeOnsetWindow).toHaveBeenCalledOnce());
  // Stop settles the run into the summary phase; Change setup returns to setup
  // where Start reappears for the restart.
  button("Stop")?.click();
  await vi.waitFor(() => expect(button("Change setup")).not.toBeUndefined());
  button("Change setup")?.click();
  await vi.waitFor(() => expect(button("Start")).not.toBeUndefined());
  recordPractice.mockClear();
  button("Start")?.click();
  await vi.waitFor(() => expect(callbacks).toHaveLength(2));

  resolveAnalysis([60, 64, 67]);
  await new Promise((resolve) => setTimeout(resolve, 0));

  expect(document.querySelector('[data-testid="progression-cell-0"]')).toHaveAttribute(
    "data-state",
    "current",
  );
  expect(recordPractice).not.toHaveBeenCalled();
});

test("recovers the onset queue after an analyzer rejection", async () => {
  let analysisCallback:
    | ((analysis: {
        chroma: Float32Array;
        timestamp: number;
        onset: boolean;
        onsetWindow?: Float32Array;
      }) => void)
    | undefined;
  const audioSource = {
    state: { status: "running" as const },
    start: vi.fn(async () => {}),
    stop: vi.fn(async () => {}),
    subscribeState: vi.fn(() => () => {}),
    subscribeAnalysis: vi.fn((callback: typeof analysisCallback) => {
      analysisCallback = callback;
      return () => {};
    }),
  };
  const analyzeOnsetWindow = vi
    .fn<() => Promise<number[]>>()
    .mockRejectedValueOnce(new Error("Analyzer unavailable."))
    .mockResolvedValueOnce([60, 64, 67]);
  render(Page, { audioSource, analyzeOnsetWindow });

  button("Start")?.click();
  await vi.waitFor(() => expect(analysisCallback).toBeDefined());
  analysisCallback?.({
    chroma: new Float32Array(12),
    timestamp: 1_000,
    onset: true,
    onsetWindow: new Float32Array(8),
  });
  await vi.waitFor(() => expect(analyzeOnsetWindow).toHaveBeenCalledOnce());
  analysisCallback?.({
    chroma: new Float32Array(12),
    timestamp: 1_100,
    onset: true,
    onsetWindow: new Float32Array(8),
  });

  await vi.waitFor(() => expect(analyzeOnsetWindow).toHaveBeenCalledTimes(2));
});

test("persists a completed snapshot and blocks Repeat until source stop settles", async () => {
  let resolveStop!: () => void;
  const audioSource = {
    state: { status: "running" as const },
    start: vi.fn(async () => {}),
    stop: vi.fn(
      () =>
        new Promise<void>((resolve) => {
          resolveStop = resolve;
        }),
    ),
    subscribeState: vi.fn(() => () => {}),
    subscribeAnalysis: vi.fn(() => () => {}),
  };
  const runtime = new MusicRuntime();
  const recordPractice = vi.spyOn(runtime, "recordPractice").mockResolvedValue();
  render(Page, { audioSource, runtime });

  button("Start")?.click();
  await vi.waitFor(() => expect(button("Stop")).not.toBeUndefined());
  button("Stop")?.click();
  await vi.waitFor(() => expect(audioSource.stop).toHaveBeenCalled());

  const repeat = button("Repeat");
  expect(repeat).not.toBeUndefined();
  expect(repeat).toBeDisabled();
  repeat?.click();
  expect(audioSource.start).toHaveBeenCalledOnce();
  await vi.waitFor(() => expect(recordPractice).toHaveBeenCalledOnce());
  expect(recordPractice).toHaveBeenCalledWith(
    expect.objectContaining({
      source: "drill",
      note: expect.stringContaining("Chord progression"),
    }),
  );

  resolveStop();
  await vi.waitFor(() => expect(button("Repeat")).not.toBeDisabled());
  button("Repeat")?.click();

  await vi.waitFor(() => expect(audioSource.start).toHaveBeenCalledTimes(2));
  expect(recordPractice).toHaveBeenCalledOnce();
});

test("releases setup after deferred finish when configuration authority changes", async () => {
  let resolveStop!: () => void;
  const audioSource = {
    state: { status: "running" as const },
    start: vi.fn(async () => {}),
    stop: vi
      .fn<() => Promise<void>>()
      .mockImplementationOnce(
        () =>
          new Promise<void>((resolve) => {
            resolveStop = resolve;
          }),
      )
      .mockResolvedValue(undefined),
    subscribeState: vi.fn(() => () => {}),
    subscribeAnalysis: vi.fn(() => () => {}),
  };
  const runtime = new MusicRuntime();
  vi.spyOn(runtime, "recordPractice").mockResolvedValue();
  render(Page, { audioSource, runtime });

  button("Start")?.click();
  await vi.waitFor(() => expect(button("Stop")).not.toBeUndefined());
  button("Stop")?.click();
  await vi.waitFor(() => expect(button("Change setup")).not.toBeUndefined());
  button("Change setup")?.click();

  await vi.waitFor(() => expect(button("Blues")).not.toBeUndefined());
  const setupFieldset = button("Blues")?.closest("fieldset");
  if (setupFieldset) setupFieldset.disabled = false;
  button("Blues")?.click();
  if (setupFieldset) setupFieldset.disabled = true;
  await vi.waitFor(() => expect(window.location.search).toContain("group=blues"));
  expect(button("Start")).toBeDisabled();

  resolveStop();

  await vi.waitFor(() => expect(button("Start")).not.toBeDisabled());
  expect(document.querySelector('[aria-live="polite"]')?.textContent).toContain("Setup ready");
  button("Start")?.click();
  await vi.waitFor(() => expect(audioSource.start).toHaveBeenCalledTimes(2));
});

test("waits for journal settlement and unlocks after source stop rejects", async () => {
  let rejectStop!: (error: Error) => void;
  let resolveRecord!: () => void;
  const audioSource = {
    state: { status: "running" as const },
    start: vi.fn(async () => {}),
    stop: vi
      .fn<() => Promise<void>>()
      .mockImplementationOnce(
        () =>
          new Promise<void>((_, reject) => {
            rejectStop = reject;
          }),
      )
      .mockResolvedValue(undefined),
    subscribeState: vi.fn(() => () => {}),
    subscribeAnalysis: vi.fn(() => () => {}),
  };
  const runtime = new MusicRuntime();
  const recordPractice = vi.spyOn(runtime, "recordPractice").mockImplementationOnce(
    () =>
      new Promise<void>((resolve) => {
        resolveRecord = resolve;
      }),
  );
  render(Page, { audioSource, runtime });

  button("Start")?.click();
  await vi.waitFor(() => expect(button("Stop")).not.toBeUndefined());
  button("Stop")?.click();
  await vi.waitFor(() => expect(recordPractice).toHaveBeenCalledOnce());

  rejectStop(new Error("Audio close failed."));
  await new Promise((resolve) => setTimeout(resolve, 0));
  expect(button("Repeat")).toBeDisabled();

  resolveRecord();
  await vi.waitFor(() => expect(button("Repeat")).not.toBeDisabled());
  expect(document.body.textContent).toContain("Audio close failed.");

  button("Change setup")?.click();
  await vi.waitFor(() => expect(button("Start")).not.toBeDisabled());
  expect(document.querySelector('[aria-live="polite"]')?.textContent).toContain("Setup ready");
  button("Start")?.click();
  await vi.waitFor(() => expect(audioSource.start).toHaveBeenCalledTimes(2));
});

test("waits for source stop and preserves newer setup status when journal rejects", async () => {
  let resolveStop!: () => void;
  let rejectRecord!: (error: Error) => void;
  const audioSource = {
    state: { status: "running" as const },
    start: vi.fn(async () => {}),
    stop: vi
      .fn<() => Promise<void>>()
      .mockImplementationOnce(
        () =>
          new Promise<void>((resolve) => {
            resolveStop = resolve;
          }),
      )
      .mockResolvedValue(undefined),
    subscribeState: vi.fn(() => () => {}),
    subscribeAnalysis: vi.fn(() => () => {}),
  };
  const runtime = new MusicRuntime();
  vi.spyOn(runtime, "recordPractice").mockImplementationOnce(
    () =>
      new Promise<void>((_, reject) => {
        rejectRecord = reject;
      }),
  );
  render(Page, { audioSource, runtime });

  button("Start")?.click();
  await vi.waitFor(() => expect(button("Stop")).not.toBeUndefined());
  button("Stop")?.click();
  await vi.waitFor(() => expect(button("Change setup")).not.toBeUndefined());
  button("Change setup")?.click();
  await vi.waitFor(() => expect(button("Start")).toBeDisabled());

  rejectRecord(new Error("Journal write failed."));
  await new Promise((resolve) => setTimeout(resolve, 0));
  expect(button("Start")).toBeDisabled();

  resolveStop();
  await vi.waitFor(() => expect(button("Start")).not.toBeDisabled());
  expect(document.querySelector('[aria-live="polite"]')?.textContent).toContain("Setup ready");
  expect(document.querySelector('[aria-live="polite"]')?.textContent).not.toContain(
    "Journal write failed.",
  );
  button("Start")?.click();
  await vi.waitFor(() => expect(audioSource.start).toHaveBeenCalledTimes(2));
});

test("hides setup and surfaces Stop in the stage action while the run is active", async () => {
  const audioSource = {
    state: { status: "running" as const },
    start: vi.fn(async () => {}),
    stop: vi.fn(async () => {}),
    subscribeState: vi.fn(() => () => {}),
    subscribeAnalysis: vi.fn(() => () => {}),
  };
  const runtime = new MusicRuntime();
  render(Page, { audioSource, runtime });

  // Setup phase: a group control and Start are present, Stop is not.
  expect(button("Start")).not.toBeUndefined();
  expect(button("Blues")).not.toBeUndefined();
  expect(button("Stop")).toBeUndefined();

  button("Start")?.click();
  await vi.waitFor(() => expect(button("Stop")).not.toBeUndefined());
  // Stage phase: setup is hidden.
  expect(button("Start")).toBeUndefined();
  expect(button("Blues")).toBeUndefined();
});

test("settles the run into the summary phase on Stop and returns to setup", async () => {
  let analysisCb:
    | ((a: {
        chroma: Float32Array;
        timestamp: number;
        onset: boolean;
        onsetWindow?: Float32Array;
      }) => void)
    | undefined;
  const audioSource = {
    state: { status: "running" as const },
    start: vi.fn(async () => {}),
    stop: vi.fn(async () => {}),
    subscribeState: vi.fn(() => () => {}),
    subscribeAnalysis: vi.fn((cb: typeof analysisCb) => {
      analysisCb = cb;
      return () => {};
    }),
  };
  const expected = expectedChordsFromProgression(JAM_PROGRESSIONS[0]!);
  let call = 0;
  const analyzeOnsetWindow = vi.fn(async () => {
    const chord = expected[Math.min(call++, expected.length - 1)]!;
    return chord.pitchClasses.map((pc) => 60 + pc);
  });
  const runtime = new MusicRuntime();
  render(Page, { audioSource, analyzeOnsetWindow, runtime });

  button("Start")?.click();
  await vi.waitFor(() => expect(audioSource.start).toHaveBeenCalled());
  // Grade a couple of chords, then stop — Stop finalizes the run (finish()).
  for (let i = 0; i < 2; i++) {
    analysisCb?.({
      chroma: new Float32Array(12),
      timestamp: 1000 + i,
      onset: true,
      onsetWindow: new Float32Array(8),
    });
    await vi.waitFor(() => expect(analyzeOnsetWindow).toHaveBeenCalledTimes(i + 1));
  }
  button("Stop")?.click();

  // Summary phase: results are shown, setup and stage controls are hidden.
  await vi.waitFor(() => expect(document.body.textContent).toContain("chords matched"));
  expect(button("Change setup")).not.toBeUndefined();
  expect(button("Start")).toBeUndefined();
  expect(button("Stop")).toBeUndefined();

  // Change setup returns to the setup phase.
  button("Change setup")?.click();
  await vi.waitFor(() => expect(button("Start")).not.toBeUndefined());
});

test("moves focus through stage, summary, and back to setup", async () => {
  const audioSource = {
    state: { status: "running" as const },
    start: vi.fn(async () => {}),
    stop: vi.fn(async () => {}),
    subscribeState: vi.fn(() => () => {}),
    subscribeAnalysis: vi.fn(() => () => {}),
  };
  render(Page, { audioSource });

  button("Start")?.click();
  await vi.waitFor(() =>
    expect(document.activeElement).toBe(
      document.querySelector('[data-testid="chord-progression-stage-heading"]'),
    ),
  );

  button("Stop")?.click();
  await vi.waitFor(() => expect(button("Change setup")).not.toBeUndefined());
  await vi.waitFor(() => {
    const summaryLabel = [...document.querySelectorAll("p")].find(
      (element) => element.textContent?.trim() === "Progression complete",
    );
    expect(document.activeElement).toBe(summaryLabel?.parentElement);
  });

  button("Change setup")?.click();
  await vi.waitFor(() =>
    expect(document.activeElement).toBe(
      document.querySelector('[data-testid="chord-progression-setup-heading"]'),
    ),
  );
});

test("keeps one persistent phase-truthful live announcement after Change setup", async () => {
  const audioSource = {
    state: { status: "running" as const },
    start: vi.fn(async () => {}),
    stop: vi.fn(async () => {}),
    subscribeState: vi.fn(() => () => {}),
    subscribeAnalysis: vi.fn(() => () => {}),
  };
  render(Page, { audioSource });
  const liveRegion = document.querySelector('[aria-live="polite"]');

  button("Start")?.click();
  await vi.waitFor(() => expect(button("Stop")).not.toBeUndefined());
  button("Stop")?.click();
  await vi.waitFor(() => expect(liveRegion?.textContent).toContain("Progression complete"));

  button("Change setup")?.click();
  await vi.waitFor(() => expect(liveRegion?.textContent).toContain("Setup ready"));

  expect(liveRegion?.isConnected).toBe(true);
  expect(liveRegion?.textContent).not.toContain("Progression complete");
  expect(document.querySelectorAll('[aria-live="polite"]')).toHaveLength(1);
});

test("restores progression drill setup from shareable query parameters", async () => {
  pushTestUrl(
    "/music/play/chord-progression?group=jazz&progression=minor-ii-v-i&bpm=112&transpose=2",
  );

  render(Page);

  expect(document.body.textContent).toContain("Minor ii–V–i");
  expect(document.body.textContent).toContain("D minor");
  expect(document.body.textContent).toContain("Em7b5");
  await vi.waitFor(() => expect(document.body.textContent).toContain("Tempo · 112 BPM"));
  expect(
    document.querySelector('[aria-label="Transpose"] button[aria-pressed="true"]')?.textContent,
  ).toContain("+2");
});

test("keeps progression drill setup changes in the shareable URL", async () => {
  const runtime = new MusicRuntime();
  render(Page, { runtime });

  button("Blues")?.click();
  button("12-bar blues")?.click();
  button("+2")?.click();
  await vi.waitFor(() => expect(window.location.search).toContain("progression=blues"));
  runtime.setPracticeVariantBpm(140, "v1:chord-progression:blues:follow");

  await vi.waitFor(() => {
    const params = new URLSearchParams(window.location.search);
    expect(params.get("group")).toBe("blues");
    expect(params.get("progression")).toBe("blues");
    expect(params.get("bpm")).toBe("140");
    expect(params.get("transpose")).toBe("2");
  });
});
