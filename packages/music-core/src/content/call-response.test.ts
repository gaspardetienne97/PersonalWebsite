import { describe, expect, it } from "vitest";
import type { NoteEvent } from "../types";
import { parseChordSymbol } from "../theory/chords";
import { pc } from "../theory/notes";
import {
  CALL_GROOVES,
  callPhrase,
  chordAtBar,
  gradeAnswer,
  grooveOf,
  turnBar,
} from "./call-response";
import { rng } from "./random";

const on = (midi: number, at: number): NoteEvent =>
  ({ kind: "noteon", midi, at, velocity: 0.8, source: "midi" }) as NoteEvent;

describe("calls", () => {
  it("finds the chord of any bar, the form looping", () => {
    const blues = grooveOf("blues");
    expect([0, 3, 4, 6, 8, 10, 12, 16].map((b) => chordAtBar(blues, b).symbol)).toEqual([
      "C7",
      "C7",
      "F7",
      "C7",
      "G7",
      "C7",
      "C7",
      "F7",
    ]);
    expect(turnBar(2, 2)).toBe(8);
  });

  it("stay in range, on plain values, and start and end on chord tones", () => {
    for (const g of CALL_GROOVES)
      for (let seed = 1; seed <= 30; seed++)
        for (const bars of [1, 2]) {
          const groove = grooveOf(g.id);
          const bar = seed % 5;
          const call = callPhrase(rng(seed), { groove, bar, bars });
          expect(call.length, g.id).toBeGreaterThanOrEqual(3);
          for (const n of call) {
            expect(n.midi).toBeGreaterThanOrEqual(60);
            expect(n.midi).toBeLessThanOrEqual(76);
            expect([0.5, 1, 1.5, 2]).toContain(n.durationBeats);
            expect(n.startBeat + n.durationBeats).toBeLessThanOrEqual(bars * 4);
          }
          const tones = (b: number) => parseChordSymbol(chordAtBar(groove, b).symbol)!.pcs;
          expect(tones(bar)).toContain(pc(call[0].midi));
          expect(tones(bar + bars - 1)).toContain(pc(call.at(-1)!.midi));
          call
            .slice(1)
            .forEach((n, i) => expect(Math.abs(n.midi - call[i].midi)).toBeLessThanOrEqual(16));
        }
    const a = callPhrase(rng(9), { groove: grooveOf("modal"), bar: 0, bars: 2 });
    expect(callPhrase(rng(9), { groove: grooveOf("modal"), bar: 0, bars: 2 })).toEqual(a);
  });
});

describe("gradeAnswer", () => {
  const groove = grooveOf("blues");
  const beatMs = 500;
  // Turn 0 with one-bar calls: the answer is bar 1 (still C7), from 2000 ms.
  const base = { groove, downbeat: 0, startAt: 2000, beatMs };

  it("is right when it lands on a chord tone in time", () => {
    const g = gradeAnswer({
      ...base,
      notes: [on(62, 2000), on(63, 2250), on(64, 2510), on(67, 3000)],
    });
    expect(g).toMatchObject({ landed: true, inTime: 1, correct: true, score: 1, notes: 4 });
  });

  it("takes half off for a last note outside the chord, and counts notes off the grid", () => {
    const g = gradeAnswer({ ...base, notes: [on(64, 2000), on(65, 2130), on(62, 3000)] });
    expect(g.landed).toBe(false);
    expect(g.inTime).toBeCloseTo(2 / 3);
    expect(g.correct).toBe(false);
    expect(g.score).toBeCloseTo(1 / 3);
  });

  it("judges the landing on the chord under the last note (F7 in bar 4)", () => {
    const at = 4 * 4 * beatMs + 250;
    expect(gradeAnswer({ ...base, startAt: 8000, notes: [on(69, at)] }).landed).toBe(true);
    expect(gradeAnswer({ ...base, startAt: 8000, notes: [on(64, at)] }).landed).toBe(false);
  });

  it("scores silence as nothing", () => {
    expect(gradeAnswer({ ...base, notes: [] })).toMatchObject({ score: 0, correct: false });
  });
});
