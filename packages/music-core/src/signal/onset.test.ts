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

  it("merges a flam inside the 130 ms refractory period", () => {
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

  it("hears the same plucks the same at any input level", () => {
    const at = [200, 700, 1200, 1700, 2200];
    const hz = [110, 146.83, 196, 220, 164.81];
    const x = timeline(
      48000,
      3,
      at.map((a, i) => pluck(a, hz[i])),
    );
    // The same take 40 dB down, noise bed and all (a quiet line input) and 12 dB up.
    for (const gain of [0.01, 1, 4]) {
      const hits = detect(
        48000,
        x.map((v) => v * gain),
        2048,
      );
      expect(hits).toHaveLength(at.length);
      hits.forEach((h, i) => expect(Math.abs(h - at[i])).toBeLessThanOrEqual(10));
    }
  });

  it("reports a slow strum once and two strokes 300 ms apart twice", () => {
    // Six strings 45 ms apart: the pick takes 225 ms to cross them.
    const sweep = (start: number) =>
      [82.41, 110, 146.83, 196, 246.94, 329.63].map((f, i) => pluck(start + i * 45, f));
    expect(detect(48000, timeline(48000, 2, sweep(300)), 2048)).toHaveLength(1);
    const two = detect(48000, timeline(48000, 2, [pluck(300, 196), pluck(600, 220)]), 2048);
    expect(two).toHaveLength(2);
    expect(two[1] - two[0]).toBeGreaterThan(280);
    expect(two[1] - two[0]).toBeLessThan(320);
  });

  it("does not take a hand damping the strings for an attack", () => {
    // A ringing chord cut off in 5 ms with a little noise from the hand.
    const r = rng(5);
    const chord = [110, 164.81, 220, 277.18].flatMap((f) => stringTone(f));
    const x = timeline(48000, 2, [
      {
        at: 200,
        len: 0.8,
        render: (t: number) =>
          chord.reduce((s, p) => s + 0.3 * p.amp * Math.sin(2 * Math.PI * p.hz * t), 0) *
            Math.min(1, t / 0.002) *
            Math.min(1, Math.max(0, (0.6 - t) / 0.005)) +
          (t > 0.6 && t < 0.61 ? (r() * 2 - 1) * 0.02 : 0),
      },
    ]);
    const hits = detect(48000, x, 2048);
    expect(hits).toHaveLength(1);
    expect(Math.abs(hits[0] - 200)).toBeLessThanOrEqual(10);
  });

  it("reports nothing while muted, and keeps the baseline over a removed click", () => {
    const sr = 48000;
    const d = createOnsetDetector(sr);
    const x = timeline(sr, 2, [pluck(300, 196), pluck(1000, 220, true)]);
    const hits: number[] = [];
    for (let i = 0; i + 2048 <= x.length; i += 2048) {
      const at = (i / sr) * 1000;
      // The first pluck is under a click that could not be removed. The second
      // is under one that was: the gate is up for three frames from 990 ms.
      const mute = at > 250 && at < 400;
      const over = at > 950 && at < 1100;
      const o = d.push(
        x.subarray(i, i + 2048),
        at,
        over ? 1 : 0.0016,
        mute,
        over ? 990 : undefined,
      );
      if (o) hits.push(o.at);
    }
    // Only the second, found once the gate is back down, timed at its click.
    expect(hits).toEqual([990]);
  });

  it("stays quiet on the noise bed alone", () => {
    expect(detect(48000, timeline(48000, 1, []), 1024)).toEqual([]);
  });
});
