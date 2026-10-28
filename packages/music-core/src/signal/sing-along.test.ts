import { describe, expect, it } from "vitest";
import { gradeSingAlong, recordingPcs } from "./sing-along";

const RATE = 22050;
const hz = (m: number) => 440 * 2 ** ((m - 69) / 12);

/** A bass note and a melody note together, half a second each. */
function song(pairs: [bass: number, tune: number][]): Float32Array {
  const per = RATE / 2;
  const out = new Float32Array(per * pairs.length);
  pairs.forEach(([bass, tune], k) => {
    for (let i = 0; i < per; i++)
      out[k * per + i] =
        0.3 * Math.sin((2 * Math.PI * hz(bass) * i) / RATE) +
        0.2 * Math.sin((2 * Math.PI * hz(tune) * i) / RATE);
  });
  return out;
}

describe("singing along with a recording", () => {
  // C under E, F under A, G under B, C under C.
  const rec = song([
    [36, 64],
    [41, 69],
    [43, 71],
    [36, 72],
  ]);
  const at = (k: number) => k * 0.5 + 0.25;

  it("hears the bass in the low band and the tune above it", () => {
    expect(recordingPcs(rec, RATE, at(1), "roots")).toEqual([5]);
    expect(recordingPcs(rec, RATE, at(1), "head")).toContain(9);
  });

  it("passes the tune and the roots sung in tune, and fails the roots sung for the tune", () => {
    const tune = [64, 69, 71, 72].map((midi, k) => ({ at: at(k), midi, cents: 10 }));
    const roots = [48, 53, 55, 48].map((midi, k) => ({ at: at(k), midi, cents: -12 }));
    expect(gradeSingAlong({ mono: rec, sampleRate: RATE, sung: tune, part: "head" })).toMatchObject(
      { right: 4, correct: true },
    );
    expect(
      gradeSingAlong({ mono: rec, sampleRate: RATE, sung: roots, part: "roots" }),
    ).toMatchObject({ right: 4, correct: true });
    expect(gradeSingAlong({ mono: rec, sampleRate: RATE, sung: tune, part: "roots" }).correct).toBe(
      false,
    );
  });

  it("counts a note out of tune as missed, follows a pitch shift, and needs four notes", () => {
    const sharp = [64, 69, 71, 72].map((midi, k) => ({ at: at(k), midi, cents: k === 0 ? 45 : 0 }));
    expect(
      gradeSingAlong({ mono: rec, sampleRate: RATE, sung: sharp, part: "head", tune: 35 }).right,
    ).toBe(3);
    const up = [66, 71, 73, 74].map((midi, k) => ({ at: at(k), midi, cents: 0 }));
    expect(
      gradeSingAlong({ mono: rec, sampleRate: RATE, sung: up, part: "head", shift: 2 }).right,
    ).toBe(4);
    expect(
      gradeSingAlong({ mono: rec, sampleRate: RATE, sung: up.slice(0, 3), part: "head", shift: 2 })
        .score,
    ).toBe(0);
  });
});
