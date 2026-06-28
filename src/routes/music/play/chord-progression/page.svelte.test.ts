import { afterEach, expect, test, vi } from "vite-plus/test";
import { render } from "vitest-browser-svelte";

import { expectedChordsFromProgression } from "@repo/music-core/engines/chord-follower";
import { JAM_PROGRESSIONS } from "@repo/music-core/engines/jam";

import { MusicRuntime } from "../../_runtime.svelte";
import Page from "./+page.svelte";

afterEach(() => {
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
  }

  await vi.waitFor(() => {
    expect(document.body.textContent).toContain(expected[0]!.symbol);
    expect(document.body.textContent).toContain(expected[expected.length - 1]!.symbol);
  });
  expect(audioSource.subscribeAnalysis).toHaveBeenCalled();
});
