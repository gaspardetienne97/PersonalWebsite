import { describe, expect, it } from "vite-plus/test";
import type { ControlEvent, NoteEvent } from "../types";
import {
  bendWobble,
  crossingLine,
  glitches,
  gradeCalibration,
  gradeSwing,
  gradeTrill,
  heldBand,
  inBandShare,
  joinTypes,
  octaveSlip,
  patternIndexes,
  scaleLine,
  scaleTonic,
  tonguingMarks,
  tonguingScore,
  tonguingVerdict,
  swingMarks,
  swingCredit,
} from "./aero-skills";
import { fingeringFor } from "./winds-pads";

const on = (midi: number, at: number): NoteEvent => ({
  kind: "noteon",
  midi,
  velocity: 0.8,
  at,
  source: "midi",
  confidence: 1,
  velocityMeasured: true,
});
const off = (midi: number, at: number): NoteEvent => ({
  kind: "noteoff",
  midi,
  velocity: 0,
  at,
  source: "midi",
  confidence: 1,
  velocityMeasured: true,
});
const cc = (value: number, at: number): ControlEvent => ({ kind: "cc", controller: 2, value, at });

describe("aerophone skills", () => {
  it("puts every key's scale inside the fingering chart", () => {
    for (let root = 0; root < 12; root++)
      for (const id of ["major", "harmonic-minor", "chromatic", "major-arpeggio"]) {
        const line = scaleLine(id, root);
        expect(line.length, `${id} ${root}`).toBeGreaterThan(0);
        expect(
          line.every((m) => fingeringFor(m)),
          `${id} ${root}`,
        ).toBe(true);
      }
    expect(scaleLine("major", 0).slice(0, 8)).toEqual([60, 62, 64, 65, 67, 69, 71, 72]);
    // Bb starts on the lowest key, Bb3.
    expect(scaleTonic(10, 12)).toBe(58);
  });

  it("tells a tongued note from a slurred one by the breath and the gaps", () => {
    const notes = [on(60, 0), off(60, 280), on(62, 320), on(64, 600), off(62, 600), on(65, 900)];
    // A breath dip between 64 and 65, steady otherwise.
    const breath = [
      cc(0.6, 50),
      cc(0.6, 300),
      cc(0.62, 500),
      cc(0.6, 700),
      cc(0.1, 820),
      cc(0.6, 880),
    ];
    expect(joinTypes(notes, breath)).toEqual(["T", "T", "S", "T"]);
    expect(tonguingMarks("slur2-tongue2", 8).join("")).toBe("TSTTTSTT");
    expect(tonguingScore(["T", "S", "T", "T"], ["T", "S", "T", "S"])).toBeCloseTo(2 / 3);
    // With breath the tonguing is half the grade; without it the line's grade stands alone.
    expect(tonguingVerdict({ score: 1, correct: true }, 0.5, true)).toEqual({
      score: 0.75,
      correct: false,
    });
    expect(tonguingVerdict({ score: 1, correct: true }, 0.5, false)).toEqual({
      score: 1,
      correct: true,
    });
  });

  it("counts the glitches a register crossing makes", () => {
    expect(crossingLine("cs5-d5", 4)).toEqual([73, 74, 73, 74]);
    expect(glitches([on(73, 0), on(72, 240), on(74, 250), on(73, 500)], [73, 74])).toBe(1);
  });

  it("grades a trill on speed and evenness", () => {
    const even = Array.from({ length: 24 }, (_, i) => on(i % 2 ? 69 : 67, i * 125));
    expect(gradeTrill(even, [67, 69])).toMatchObject({ correct: true, strays: 0 });
    expect(gradeTrill(even, [67, 69]).perSecond).toBeCloseTo(8);
    const ragged = even.map((n, i) => ({ ...n, at: n.at + (i % 2 ? 50 : 0) }));
    expect(gradeTrill(ragged, [67, 69]).correct).toBe(false);
  });

  it("measures breath bands, bite vibrato and octave slips", () => {
    expect(inBandShare([0.5, 0.55, 0.7, 0.6], [0.45, 0.65])).toBe(0.75);
    const wobble = Array.from({ length: 200 }, (_, i) => ({
      at: i * 20,
      value: 0.1 * Math.sin((2 * Math.PI * 5 * i * 20) / 1000),
    }));
    const w = bendWobble(wobble)!;
    expect(w.rateHz!).toBeGreaterThan(4.6);
    expect(w.rateHz!).toBeLessThan(5.4);
    expect(w.evenness!).toBeGreaterThan(0.8);
    expect(bendWobble(wobble.map((p) => ({ ...p, value: 0 })))!.rateHz).toBeNull();
    expect(octaveSlip(62, 74)).toBe("the octave key was down");
    expect(octaveSlip(62, 64)).toBeNull();
  });

  it("adds blues, pentatonic and melodic minor, two octaves and interval patterns", () => {
    // Melodic minor rises with the raised 6 and 7 and comes down natural.
    expect(scaleLine("melodic-minor", 9)).toEqual([
      69, 71, 72, 74, 76, 78, 80, 81, 79, 77, 76, 74, 72, 71, 69,
    ]);
    expect(scaleLine("blues", 2).slice(0, 7)).toEqual([62, 65, 67, 68, 69, 72, 74]);
    expect(scaleLine("minor-pentatonic", 7).slice(0, 6)).toEqual([67, 70, 72, 74, 77, 79]);
    // Two octaves of C: 15 up, 14 down; D, Eb and F reach the palm keys.
    const two = scaleLine("major", 0, { octaves: 2 });
    expect(two).toHaveLength(29);
    expect(Math.max(...two)).toBe(84);
    expect(Math.max(...scaleLine("major", 5, { octaves: 2 }))).toBe(89);
    expect(scaleLine("major-arpeggio", 2, { octaves: 2 }).slice(0, 7)).toEqual([
      62, 66, 69, 74, 78, 81, 86,
    ]);
    for (let root = 0; root < 12; root++)
      for (const id of ["blues", "minor-pentatonic", "melodic-minor"])
        expect(
          scaleLine(id, root).every((m) => fingeringFor(m)),
          `${id} ${root}`,
        ).toBe(true);
    // Thirds: C E D F .. A C, then B G .. E C.
    expect(patternIndexes("thirds", 8)).toEqual([
      0, 2, 1, 3, 2, 4, 3, 5, 4, 6, 5, 7, 6, 4, 5, 3, 4, 2, 3, 1, 2, 0,
    ]);
    expect(patternIndexes("1231", 8).slice(0, 8)).toEqual([0, 1, 2, 0, 1, 2, 3, 1]);
    expect(patternIndexes("1231", 8).at(-1)).toBe(0);
    expect(patternIndexes("triads", 8)).toEqual([
      0, 2, 4, 1, 3, 5, 2, 4, 6, 3, 5, 7, 6, 4, 2, 5, 3, 1, 4, 2, 0,
    ]);
    expect(scaleLine("major", 0, { pattern: "thirds" }).slice(0, 4)).toEqual([60, 64, 62, 65]);
    // No pattern on an arpeggio: it stays straight.
    expect(scaleLine("major-arpeggio", 0, { pattern: "thirds" })).toEqual(
      scaleLine("major-arpeggio", 0),
    );
  });

  it("grades swing articulation: the off-beat late, tongued, slurred into the beat", () => {
    const line = [60, 62, 64, 65, 67, 65, 64, 62];
    const beat = 500;
    const swung = (frac: number, tongue: boolean) => {
      const notes: NoteEvent[] = [];
      const breath: ControlEvent[] = [];
      line.forEach((m, i) => {
        const at = 1000 + Math.floor(i / 2) * beat + (i % 2 ? frac * beat : 0);
        if (i > 0) notes.push(off(line[i - 1], at - (tongue && i % 2 ? 40 : 0)));
        if (tongue && i % 2) breath.push(cc(0.1, at - 20));
        notes.push(on(m, at));
        breath.push(cc(0.7, at + 10));
      });
      return { line, beatMs: beat, downbeat: 1000, notes, breath };
    };
    expect(swingMarks(4)).toEqual(["T", "T", "S", "T"]);
    const good = gradeSwing(swung(0.66, true));
    expect(good).toMatchObject({ correct: true, pitch: 1, swing: 1, articulation: 1 });
    expect(good.frac!).toBeCloseTo(0.66);
    // Straight eighths get no swing credit.
    const straight = gradeSwing(swung(0.5, true));
    expect(straight.swing).toBe(0);
    expect(straight.correct).toBe(false);
    // Every note slurred: the joins miss the off-beat tongue.
    expect(gradeSwing(swung(0.66, false)).articulation).toBeLessThan(0.8);
    // Without breath the articulation is not measured.
    expect(gradeSwing({ ...swung(0.66, true), breath: [] }).articulation).toBeNull();
    expect(swingCredit(0.55)).toBeCloseTo(0.5);
  });

  it("checks the set-up: key, breath floor and ceiling", () => {
    const soft = Array(20).fill(0.3);
    const loud = Array(20).fill(0.8);
    expect(
      gradeCalibration({ writtenTarget: 67, shift: 0, received: 67, soft, loud }),
    ).toMatchObject({ correct: true, score: 1 });
    // The AE-20 transposes as an alto while the app reads in C.
    const alto = gradeCalibration({ writtenTarget: 67, shift: 0, received: 58, soft, loud });
    expect(alto).toMatchObject({ keyOk: false, keyFits: "Eb", score: 0.75 });
    expect(gradeCalibration({ writtenTarget: 67, shift: 9, received: 58, soft, loud }).keyOk).toBe(
      true,
    );
    // Pinned at the top: clipping.
    expect(
      gradeCalibration({ writtenTarget: 67, shift: 0, received: 67, soft, loud: Array(20).fill(1) })
        .ceilingOk,
    ).toBe(false);
    // Never soft enough, and no breath at all.
    expect(
      gradeCalibration({
        writtenTarget: 67,
        shift: 0,
        received: 67,
        soft: Array(9).fill(0.6),
        loud,
      }).floorOk,
    ).toBe(false);
    expect(
      gradeCalibration({ writtenTarget: 67, shift: 0, received: null, soft: [], loud: [] }).score,
    ).toBe(0);
    expect(heldBand([cc(0.3, 10), cc(0.5, 20), cc(0.9, 99)], [0.25, 0.42], 0, 50)).toBe(0.5);
    expect(heldBand([], [0.25, 0.42], 0, 50)).toBeNull();
  });
});
