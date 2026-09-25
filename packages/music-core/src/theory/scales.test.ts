import { describe, expect, it } from "vitest";
import { JAZZ, SCALE_DATA } from "../data";
import { INTERVALS } from "./intervals";
import { pc } from "./notes";
import {
  handLines,
  SCALE_GROUPS,
  SCALE_KINDS,
  SCALE_TONICS,
  scaleLine,
  scaleSemitones,
} from "./scales";

describe("scales", () => {
  it("carries the 17 catalog scales exactly", () => {
    expect(SCALE_DATA.semitonesByKind).toEqual({
      major: [0, 2, 4, 5, 7, 9, 11, 12],
      "natural-minor": [0, 2, 3, 5, 7, 8, 10, 12],
      "harmonic-minor": [0, 2, 3, 5, 7, 8, 11, 12],
      dorian: [0, 2, 3, 5, 7, 9, 10, 12],
      phrygian: [0, 1, 3, 5, 7, 8, 10, 12],
      lydian: [0, 2, 4, 6, 7, 9, 11, 12],
      mixolydian: [0, 2, 4, 5, 7, 9, 10, 12],
      locrian: [0, 1, 3, 5, 6, 8, 10, 12],
      "melodic-minor": [0, 2, 3, 5, 7, 9, 11, 12],
      "major-pentatonic": [0, 2, 4, 7, 9, 12],
      "minor-pentatonic": [0, 3, 5, 7, 10, 12],
      blues: [0, 3, 5, 6, 7, 10, 12],
      altered: [0, 1, 3, 4, 6, 8, 10, 12],
      "bebop-major": [0, 2, 4, 5, 7, 8, 9, 11, 12],
      "bebop-dominant": [0, 2, 4, 5, 7, 9, 10, 11, 12],
      "whole-tone": [0, 2, 4, 6, 8, 10, 12],
      diminished: [0, 1, 3, 4, 6, 7, 9, 10, 12],
    });
    expect(SCALE_KINDS).toHaveLength(17);
    expect(SCALE_GROUPS.jazz).toHaveLength(9);
    expect(SCALE_GROUPS.modes).toHaveLength(8);
    expect(SCALE_TONICS.map((t) => t.name)).toEqual([
      "C4",
      "Db4",
      "D4",
      "Eb4",
      "E4",
      "F4",
      "Gb4",
      "G4",
      "Ab4",
      "A4",
      "Bb4",
      "B4",
    ]);
  });

  it("builds spans and motions without repeating the top", () => {
    expect(scaleLine("major", 60, "one-octave", "up")).toEqual([60, 62, 64, 65, 67, 69, 71, 72]);
    expect(scaleLine("major", 60, "pentascale", "up")).toEqual([60, 62, 64, 65, 67]);
    expect(scaleLine("major", 60, "two-octave", "up")).toHaveLength(15);
    expect(scaleLine("major", 60, "two-octave", "up").at(-1)).toBe(84);
    const upDown = scaleLine("major", 60, "one-octave", "up-down");
    expect(upDown).toEqual([60, 62, 64, 65, 67, 69, 71, 72, 71, 69, 67, 65, 64, 62, 60]);
    expect(upDown.filter((m) => m === 72)).toHaveLength(1);
  });

  it("walks a descending line down in key (B4 A4 E4 D4, never Bb4 Ab4 Eb4 Db4)", () => {
    const down = scaleLine("major", 60, "one-octave", "down");
    expect(down).toEqual([72, 71, 69, 67, 65, 64, 62, 60]);
    for (const kind of SCALE_KINDS) {
      const pcs = new Set(SCALE_DATA.semitonesByKind[kind].map((s) => pc(s)));
      for (const m of scaleLine(kind, 60, "two-octave", "down"))
        expect(pcs.has(pc(m - 60))).toBe(true);
    }
  });

  it("doubles both hands an octave apart, left first", () => {
    expect(handLines([60, 62], "both")).toEqual([
      [48, 60],
      [50, 62],
    ]);
    expect(handLines([60], "left")).toEqual([[48]]);
    expect(handLines([60], "right")).toEqual([[60]]);
  });

  it("knows every scale named by CHORD_SCALE_MAP and the jam table", () => {
    for (const row of JAZZ.CHORD_SCALE_MAP)
      expect(scaleSemitones(row.scale), row.scale).toBeDefined();
    for (const name of ["dorian", "mixolydian", "major", "locrian", "altered"])
      expect(scaleSemitones(name)).toBeDefined();
    expect(scaleSemitones("lydian dominant")).toEqual([0, 2, 4, 6, 7, 9, 10, 12]);
    expect(scaleSemitones("whole-half diminished")).toEqual([0, 2, 3, 5, 6, 8, 9, 11, 12]);
  });

  it("has the 12 interval tokens", () => {
    expect(INTERVALS.map((i) => `${i.token}:${i.semitones}`)).toEqual([
      "m2:1",
      "M2:2",
      "m3:3",
      "M3:4",
      "P4:5",
      "TT:6",
      "P5:7",
      "m6:8",
      "M6:9",
      "m7:10",
      "M7:11",
      "P8:12",
    ]);
    expect(INTERVALS[7].name).toBe("Minor 6th");
  });
});
