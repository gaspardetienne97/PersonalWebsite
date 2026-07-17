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
  button("Stop")?.click();
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

test("does not publish or persist finish work after teardown wins source stop", async () => {
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
  const view = render(Page, { audioSource, runtime });

  button("Start")?.click();
  await vi.waitFor(() => expect(button("Stop")).not.toBeUndefined());
  button("Stop")?.click();
  await vi.waitFor(() => expect(audioSource.stop).toHaveBeenCalled());
  view.unmount();
  resolveStop();
  await new Promise((resolve) => setTimeout(resolve, 0));

  expect(recordPractice).not.toHaveBeenCalled();
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
