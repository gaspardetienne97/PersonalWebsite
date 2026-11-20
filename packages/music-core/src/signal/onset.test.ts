import { describe, expect, it } from "vite-plus/test";
import { rng, stringTone } from "./fixtures";
import { createOnsetDetector } from "./onset";

/** Mix events into a buffer with a -60 dB noise bed. */
function timeline(
  sr: number,
  seconds: number,
  events: { at: number; render: (t: number) => number; len: number }[],
) {
  const out = new Float32Array(Math.round(sr * seconds));
  const rand = rng(11);
  for (let i = 0; i < out.length; i++) out[i] = (rand() * 2 - 1) * 0.001;
  for (const e of events) {
    const start = Math.round((e.at / 1000) * sr);
    for (let i = 0; i < e.len * sr && start + i < out.length; i++)
      out[start + i] += e.render(i / sr);
  }
  return out;
}
const click = (at: number) => {
  const r = rng(at);
  return { at, len: 0.003, render: (t: number) => (r() * 2 - 1) * 0.5 * Math.exp(-t * 1500) };
};
const pluck = (at: number, hz: number, sustain = false) => ({
  at,
  len: sustain ? 3 : 1.2,
  render: (t: number) =>
    stringTone(hz).reduce(
      (s, p) => s + p.amp * Math.sin(2 * Math.PI * p.hz * t + (p.phase ?? 0)),
      0,
    ) *
    Math.min(1, t / 0.002) *
    (sustain ? 1 : Math.exp(-4 * t)),
});
function detect(sr: number, x: Float32Array, frame: number) {
  const d = createOnsetDetector(sr);
  const hits: number[] = [];
  for (let i = 0; i + frame <= x.length; i += frame) {
    const o = d.push(x.subarray(i, i + frame), (i / sr) * 1000);
    if (o) hits.push(o.at);
  }
  return hits;
}

describe("onset detector", () => {
  it("finds each click once within one 128-sample block (1024 frames at 48 kHz)", () => {
    const at = [100, 400, 650, 1000, 1300];
    const hits = detect(48000, timeline(48000, 2, at.map(click)), 1024);
    expect(hits).toHaveLength(at.length);
    hits.forEach((h, i) => expect(Math.abs(h - at[i])).toBeLessThanOrEqual(128 / 48));
  });

  it("merges a flam inside the 60 ms refractory period", () => {
    const hits = detect(48000, timeline(48000, 1, [click(300), click(330)]), 1024);
    expect(hits).toHaveLength(1);
    expect(hits[0]).toBeCloseTo(300, -1);
  });

  it("finds plucks over ringing strings, including a repeated pitch (2048 frames at 44.1 kHz)", () => {
    const at = [200, 700, 1200, 1450, 1900];
    const hz = [110, 146.83, 196, 196, 82.41];
    const hits = detect(
      44100,
      timeline(
        44100,
        2.6,
        at.map((a, i) => pluck(a, hz[i])),
      ),
      2048,
    );
    expect(hits).toHaveLength(at.length);
    // Measured: +0.3, +2.4, +1.6, +1.2, +6.9 ms (the E2 is the late one).
    hits.forEach((h, i) => expect(h - at[i]).toBeGreaterThanOrEqual(-3));
    hits.forEach((h, i) => expect(h - at[i]).toBeLessThanOrEqual(8));
  });

  it("reports a sustained tone once", () => {
    const hits = detect(48000, timeline(48000, 2, [pluck(300, 220, true)]), 1024);
    expect(hits).toHaveLength(1);
    expect(Math.abs(hits[0] - 300)).toBeLessThanOrEqual(3);
  });

  it("stays quiet on the noise bed alone", () => {
    expect(detect(48000, timeline(48000, 1, []), 1024)).toEqual([]);
  });
});
