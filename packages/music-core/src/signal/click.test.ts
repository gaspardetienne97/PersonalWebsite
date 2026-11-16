import { describe, expect, it } from "vitest";
import { createClickCanceller, type CleanFrame, type ExpectedClick } from "./click";
import { rng, stringTone } from "./fixtures";

const SR = 48000;
const FRAME = 2048;
const FRAME_MS = (FRAME / SR) * 1000;

/** The metronome's click as a microphone hears it: a decaying sine and two echoes off the room. */
function clickSound(hz: number, amp: number) {
  const dry = (t: number) =>
    t < 0
      ? 0
      : amp * Math.sin(2 * Math.PI * hz * t) * Math.min(1, t / 0.001) * Math.exp(-t / 0.012);
  return (t: number) => dry(t) + 0.4 * dry(t - 0.0071) - 0.25 * dry(t - 0.0193);
}
const pluckSound = (f0: number, amp: number) => (t: number) =>
  amp *
  stringTone(f0).reduce(
    (s, p) => s + p.amp * Math.sin(2 * Math.PI * p.hz * t + (p.phase ?? 0)),
    0,
  ) *
  Math.min(1, t / 0.002) *
  Math.exp(-6 * t);

/** A take: a noise bed plus sounds at times (ms). */
function take(
  seconds: number,
  sounds: { at: number; sound: (t: number) => number; len?: number }[],
) {
  const x = new Float32Array(Math.round(SR * seconds));
  const r = rng(3);
  for (let i = 0; i < x.length; i++) x[i] = (r() * 2 - 1) * 0.0005;
  for (const s of sounds) {
    const start = Math.round((s.at / 1000) * SR);
    const n = Math.round((s.len ?? 0.3) * SR);
    for (let i = 0; i < n && start + i < x.length; i++) x[start + i] += s.sound(i / SR);
  }
  return x;
}

function run(x: Float32Array, clicks?: ExpectedClick[]) {
  const c = createClickCanceller(SR);
  const out: (CleanFrame & { pushedAt: number })[] = [];
  for (let i = 0; i + FRAME <= x.length; i += FRAME) {
    const at = (i / SR) * 1000;
    for (const f of c.push(x.subarray(i, i + FRAME), at, clicks)) out.push({ ...f, pushedAt: at });
  }
  for (const f of c.flush()) out.push({ ...f, pushedAt: Infinity });
  return out;
}
/** RMS of the cleaned signal over [from, to) ms. */
function level(frames: CleanFrame[], from: number, to: number) {
  let s = 0;
  let n = 0;
  for (const f of frames)
    for (let i = 0; i < f.frame.length; i++) {
      const t = f.at + (i / SR) * 1000;
      if (t >= from && t < to) {
        s += f.frame[i] ** 2;
        n++;
      }
    }
  return Math.sqrt(s / Math.max(1, n));
}
const db = (v: number) => 20 * Math.log10(v);

// Clicks every 500 ms, heard 37 ms after the app expects them (latency it cannot know).
const beats = Array.from({ length: 8 }, (_, k) => 400 + k * 500);
const expected: ExpectedClick[] = beats.map((at) => ({ at: at - 37, hz: 1320 }));
const clicksOnly = () =>
  take(
    4.5,
    beats.map((at) => ({ at, sound: clickSound(1320, 0.2) })),
  );

describe("click canceller", () => {
  it("passes every frame through untouched, on time, when no click is due", () => {
    const x = clicksOnly();
    const out = run(x);
    expect(out).toHaveLength(Math.floor(x.length / FRAME));
    out.forEach((f, i) => {
      expect(f.at).toBe(f.pushedAt);
      expect(f.click).toBeUndefined();
      expect(Array.from(f.frame)).toEqual(Array.from(x.subarray(i * FRAME, (i + 1) * FRAME)));
    });
  });

  it("learns the first click and takes every later one off by 20 dB or more", () => {
    const out = run(clicksOnly(), expected);
    const raw = run(clicksOnly());
    // The first cannot be removed, and says so.
    expect(db(level(out, beats[0], beats[0] + 30))).toBeCloseTo(
      db(level(raw, beats[0], beats[0] + 30)),
      1,
    );
    expect(out.find((f) => f.at <= beats[0] && f.at + FRAME_MS > beats[0])?.click).toBe(
      "unlearned",
    );
    for (const at of beats.slice(1)) {
      const before = db(level(raw, at, at + 30));
      const after = db(level(out, at, at + 30));
      expect(before - after).toBeGreaterThan(20);
      const f = out.find((o) => o.at <= at + 5 && o.at + FRAME_MS > at + 5)!;
      expect(f.click).toBe("removed");
      expect(f.clickHz).toBe(1320);
      expect(f.residue).toBeGreaterThan(0);
      expect(Math.abs(f.clickAt! - at)).toBeLessThan(3);
    }
  });

  it("keeps the frames in order with their own times, a frame late only around a click", () => {
    const x = clicksOnly();
    const out = run(x, expected);
    expect(out).toHaveLength(Math.floor(x.length / FRAME));
    out.forEach((f, i) => expect(f.at).toBeCloseTo(i * FRAME_MS, 6));
    const late = out.filter((f) => f.pushedAt > f.at);
    expect(late.length).toBeGreaterThan(0);
    for (const f of late) {
      expect(f.pushedAt - f.at).toBeCloseTo(FRAME_MS, 6);
      // Held only from 40 ms (and two frames) before a click is expected until it has been found.
      expect(beats.some((b) => f.at > b - 37 - 40 - 3 * FRAME_MS && f.at < b + FRAME_MS)).toBe(
        true,
      );
    }
    // Between clicks nothing waits.
    expect(out.filter((f) => f.at > 500 && f.at < 700).every((f) => f.pushedAt === f.at)).toBe(
      true,
    );
  });

  it("leaves a pluck played on the click", () => {
    const withPluck = take(4.5, [
      ...beats.map((at) => ({ at, sound: clickSound(1320, 0.2) })),
      { at: beats[4] + 4, sound: pluckSound(196, 0.3), len: 1 },
    ]);
    const pluckAlone = take(4.5, [{ at: beats[4] + 4, sound: pluckSound(196, 0.3), len: 1 }]);
    const out = run(withPluck, expected);
    const want = db(level(run(pluckAlone), beats[4], beats[4] + 80));
    expect(Math.abs(db(level(out, beats[4], beats[4] + 80)) - want)).toBeLessThan(1);
    // And the clicks after it still come off: the pluck was not learned as a click.
    for (const at of beats.slice(5)) expect(db(level(out, at, at + 30))).toBeLessThan(db(0.2) - 20);
  });

  it("learns the click again when the volume changes", () => {
    // Three times louder from the fifth click on.
    const x = take(
      4.5,
      beats.map((at, k) => ({ at, sound: clickSound(1320, k < 4 ? 0.1 : 0.3) })),
    );
    const out = run(x, expected);
    const raw = run(x);
    const off = (at: number) => db(level(raw, at, at + 30)) - db(level(out, at, at + 30));
    expect(off(beats[3])).toBeGreaterThan(20);
    // The first loud one only half comes off, and says so; the ones after it come off again.
    expect(off(beats[4])).toBeLessThan(10);
    expect(out.find((f) => f.at <= beats[4] + 5 && f.at + FRAME_MS > beats[4] + 5)?.click).toBe(
      "unlearned",
    );
    expect(off(beats[6])).toBeGreaterThan(20);
    expect(off(beats[7])).toBeGreaterThan(20);
  });

  it("stops holding frames back when the clicks are not heard (headphones)", () => {
    const silent = take(4.5, []);
    const out = run(silent, expected);
    const late = out.filter((f) => f.pushedAt > f.at);
    // The first four clicks are waited for, the rest are not.
    expect(late.length).toBeGreaterThan(0);
    expect(late.every((f) => f.at < beats[3] + 300)).toBe(true);
    expect(out.every((f) => f.click === undefined)).toBe(true);
  });

  it("does not take a pluck in a click's window for the click", () => {
    // No click sounds at all; a pluck lands where the first one is expected.
    const x = take(2, [{ at: 410, sound: pluckSound(196, 0.3), len: 1 }]);
    const out = run(x, expected);
    expect(out.every((f) => f.click === undefined)).toBe(true);
    expect(db(level(out, 410, 500))).toBeCloseTo(db(level(run(x), 410, 500)), 5);
  });
});
