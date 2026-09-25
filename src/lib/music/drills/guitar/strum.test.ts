import { describe, expect, it, vi } from "vitest";

// The listener only needs the frame feed and the onset feed.
const feeds = vi.hoisted(() => ({
  frame: [] as ((f: unknown) => void)[],
  input: [] as ((e: unknown) => void)[],
}));
vi.mock("$lib/music/runtime", () => ({
  mic: { subscribeFrames: (fn: (f: unknown) => void) => (feeds.frame.push(fn), () => true) },
  input: { subscribe: (fn: (e: unknown) => void) => (feeds.input.push(fn), () => {}) },
}));

const { ChordListener } = await import("./strum.svelte");

const SR = 48000;
const N = 2048;
const frameMs = (N / SR) * 1000;
const hz = (m: number) => 440 * 2 ** ((m - 69) / 12);

/** Frames of a sum of sines (a chord) or silence, starting at perf time `t0`. */
function feed(midis: number[], t0: number, count: number, amp = 0.2) {
  for (let k = 0; k < count; k++) {
    const frame = new Float32Array(N);
    for (let i = 0; i < N; i++) {
      const t = (k * N + i) / SR;
      for (const m of midis) frame[i] += (amp / midis.length) * Math.sin(2 * Math.PI * hz(m) * t);
    }
    for (const fn of feeds.frame)
      fn({ frame, wide: frame, sampleRate: SR, at: t0 + k * frameMs, pitch: null, db: -20 });
  }
}

describe("ChordListener", () => {
  it("reads one strum per onset from the 600 ms after it, and silence as no tones", () => {
    const heard: { at: number; pcs: number[] }[] = [];
    const l = new ChordListener();
    l.start({ onStrum: (h) => heard.push(h) });
    // Silence first, then a C major triad (C3 E3 G3 C4) after an onset at 1000 ms.
    feed([], 0, 21);
    for (const fn of feeds.input) fn({ kind: "onset", source: "audio", at: 1000, strength: 1 });
    feed([48, 52, 55, 60], 21 * frameMs, 18);
    expect(heard).toHaveLength(1);
    expect(heard[0].at).toBe(1000);
    expect(heard[0].pcs).toEqual([0, 4, 7]);
    expect(l.live).toEqual([0, 4, 7]);
    expect(l.analyse(0)?.pcs).toEqual([]);
    // A window that has not fully arrived is not read yet.
    expect(l.analyse(1100)).toBeNull();
    l.stop();
    expect(l.live).toEqual([]);
  });
});
