import { afterEach, expect, test, vi } from "vite-plus/test";
import { render } from "vitest-browser-svelte";

import { expectedChordsFromProgression } from "@repo/music-core/engines/chord-follower";
import { JAM_PROGRESSIONS } from "@repo/music-core/engines/jam";

import { MusicRuntime } from "../../_runtime.svelte";
import Page from "./+page.svelte";
import { pushTestUrl, setTestUrl } from "../../_components/test-url";

afterEach(() => {
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
    state: { status: "idle" as const },
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
  // The real MusicRuntime's runCountIn() drives Tone.js's AudioContext, which
  // never resumes in a headless test browser with no audio output device.
  // Every other route test that touches it mocks it the same way; the
  // resolved value just has to be a MonotonicMs the follower can time against.
  const runtime = new MusicRuntime();
  vi.spyOn(runtime, "runCountIn").mockResolvedValue(performance.now() as never);

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
    state: { status: "idle" as const },
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
  vi.spyOn(runtime, "runCountIn").mockResolvedValue(performance.now() as never);

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

test("restores progression drill setup from shareable query parameters", async () => {
  pushTestUrl(
    "/music/play/chord-progression?group=jazz&progression=minor-ii-v-i&bpm=112&transpose=2",
  );

  render(Page);

  expect(document.body.textContent).toContain("Minor ii–V–i");
  expect(document.body.textContent).toContain("D minor");
  expect(document.body.textContent).toContain("Em7b5");
  const tempo = document.querySelector<HTMLInputElement>("#tempo");
  expect(tempo?.value).toBe("112");
  expect(
    document.querySelector('[aria-label="Transpose"] button[aria-pressed="true"]')?.textContent,
  ).toContain("+2");
});

test("keeps progression drill setup changes in the shareable URL", async () => {
  render(Page);

  button("Blues")?.click();
  button("12-bar blues")?.click();
  button("+2")?.click();
  const tempo = document.querySelector<HTMLInputElement>("#tempo");
  expect(tempo).toBeTruthy();
  tempo!.value = "140";
  tempo!.dispatchEvent(new Event("input", { bubbles: true }));

  await vi.waitFor(() => {
    const params = new URLSearchParams(window.location.search);
    expect(params.get("group")).toBe("blues");
    expect(params.get("progression")).toBe("blues");
    expect(params.get("bpm")).toBe("140");
    expect(params.get("transpose")).toBe("2");
  });
});
