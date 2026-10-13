import { describe, expect, it } from "vitest";
import type { ControlEvent, NoteEvent } from "../types";
import {
  bendWobble,
  crossingLine,
  glitches,
  gradeTrill,
  inBandShare,
  joinTypes,
  octaveSlip,
  scaleLine,
  scaleTonic,
  tonguingMarks,
  tonguingScore,
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
});
