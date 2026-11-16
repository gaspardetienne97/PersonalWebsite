import { describe, expect, it } from "vitest";
import { createInputFilter } from "./biquad";
import type { ExpectedClick } from "./click";
import { rng, stringTone } from "./fixtures";
import { CLICK_HZ, createListener } from "./listen";

const SR = 48000;
const FRAME = 2048;

const clickSound = (hz: number, amp: number) => {
  const dry = (t: number) =>
    t < 0
      ? 0
      : amp * Math.sin(2 * Math.PI * hz * t) * Math.min(1, t / 0.001) * Math.exp(-t / 0.012);
  return (t: number) => dry(t) + 0.4 * dry(t - 0.0071) - 0.25 * dry(t - 0.0193);
};
const pluckSound = (f0: number, amp: number) => (t: number) =>
  amp *
  stringTone(f0).reduce(
    (s, p) => s + p.amp * Math.sin(2 * Math.PI * p.hz * t + (p.phase ?? 0)),
    0,
  ) *
  Math.min(1, t / 0.002) *
  Math.exp(-6 * t);

function take(
  seconds: number,
  sounds: { at: number; sound: (t: number) => number; len?: number }[],
  noise = 0.0005,
) {
  const x = new Float32Array(Math.round(SR * seconds));
  const r = rng(3);
  for (let i = 0; i < x.length; i++) x[i] = (r() * 2 - 1) * noise;
  for (const s of sounds) {
    const start = Math.round((s.at / 1000) * SR);
    const n = Math.round((s.len ?? 0.3) * SR);
    for (let i = 0; i < n && start + i < x.length; i++) x[start + i] += s.sound(i / SR);
  }
  createInputFilter(SR).processBlock(x);
  return x;
}

/** Everything the listener reports for a take, as the microphone path would push it. */
function listen(x: Float32Array, clicks?: ExpectedClick[]) {
  const l = createListener(SR);
  const onsets: number[] = [];
  const notes: number[] = [];
  const noteAt: number[] = [];
  for (let i = 0; i + FRAME <= x.length; i += FRAME)
    for (const h of l.push(x.subarray(i, i + FRAME), (i / SR) * 1000, { clicks })) {
      if (h.onset) onsets.push(h.onset.at);
      for (const n of h.notes)
        if (n.kind === "noteon") {
          notes.push(n.midi);
          noteAt.push(n.at);
        }
    }
  return { onsets, notes, noteAt };
}

// The metronome at 120 BPM, accent every fourth, heard 45 ms after the app expects it.
const beats = Array.from({ length: 12 }, (_, k) => 300 + k * 500);
const hzOf = (k: number) => (k % 4 === 0 ? CLICK_HZ.accent : CLICK_HZ.beat);
const expected: ExpectedClick[] = beats.map((at, k) => ({ at: at - 45, hz: hzOf(k) }));
const metronome = beats.map((at, k) => ({
  at,
  sound: clickSound(hzOf(k), k % 4 === 0 ? 0.3 : 0.18),
}));

describe("listener", () => {
  it("hears plucked notes: one onset and one note-on each, the note within 100 ms of sound", () => {
    const at = [300, 800, 1300, 1800];
    const hz = [110, 146.83, 196, 246.94];
    const x = take(
      2.6,
      at.map((a, i) => ({ at: a, sound: pluckSound(hz[i], 0.3), len: 1 })),
    );
    const heard = listen(x);
    expect(heard.notes).toEqual([45, 50, 55, 59]);
    expect(heard.onsets).toHaveLength(4);
    heard.onsets.forEach((o, i) => expect(Math.abs(o - at[i])).toBeLessThanOrEqual(10));
    // A note-on is timed at the first frame that read it.
    heard.noteAt.forEach((t, i) => expect(t - at[i]).toBeLessThan(60));
  });

  it("hears the same thing 40 dB down", () => {
    const at = [300, 800, 1300, 1800];
    const hz = [110, 146.83, 196, 246.94];
    const x = take(
      2.6,
      at.map((a, i) => ({ at: a, sound: pluckSound(hz[i], 0.3), len: 1 })),
    );
    const quiet = listen(x.map((v) => v * 0.01));
    expect(quiet.notes).toEqual([45, 50, 55, 59]);
    expect(quiet.onsets).toHaveLength(4);
  });

  it("without knowing about the metronome, hears every click as playing", () => {
    const heard = listen(take(6.4, metronome));
    expect(heard.onsets.length).toBeGreaterThanOrEqual(10);
  });

  it("knowing when the clicks are due, hears nothing in a metronome on its own", () => {
    const heard = listen(take(6.4, metronome), expected);
    expect(heard.onsets).toEqual([]);
    expect(heard.notes).toEqual([]);
  });

  it("still hears a pluck on the click, and one between clicks", () => {
    const x = take(6.4, [
      ...metronome,
      // On the fifth click (an accent) at the click's own level, on the tenth, and between two.
      { at: beats[4] + 6, sound: pluckSound(196, 0.3), len: 1 },
      { at: beats[9] - 3, sound: pluckSound(146.83, 0.3), len: 1 },
      { at: beats[6] + 250, sound: pluckSound(110, 0.3), len: 1 },
    ]);
    const heard = listen(x, expected);
    expect(heard.notes).toEqual([55, 45, 50]);
    expect(heard.onsets).toHaveLength(3);
    const want = [beats[4] + 6, beats[6] + 250, beats[9] - 3];
    heard.onsets.forEach((o, i) => expect(Math.abs(o - want[i])).toBeLessThanOrEqual(25));
  });

  it("finds a quiet strum under a loud click by the chord it leaves ringing", () => {
    // 20 dB under the click: what is left of the click hides the attack itself.
    const x = take(6.4, [...metronome, { at: beats[5] + 5, sound: pluckSound(196, 0.02), len: 1 }]);
    const heard = listen(x, expected);
    expect(heard.onsets).toHaveLength(1);
    // Timed at the click it was under.
    expect(Math.abs(heard.onsets[0] - beats[5])).toBeLessThanOrEqual(10);
  });
});
