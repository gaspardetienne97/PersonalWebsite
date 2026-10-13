import { describe, expect, it } from "vitest";
import { CHORD_SHAPES, TUNINGS, type Tuning } from "../data";
import {
  chordPositions,
  CURATED_TUNINGS,
  positionLine,
  midiAt,
  positionsOf,
  shapeNotes,
  tuningById,
  validateCustomTuning,
} from "./fretboard";

describe("fretboard", () => {
  it("has the 7 curated tunings", () => {
    expect(CURATED_TUNINGS.map((t) => `${t.id}:${t.openStrings.join(" ")}:${t.fretCount}`)).toEqual(
      [
        "guitar.standard:64 59 55 50 45 40:22",
        "guitar.drop-d:64 59 55 50 45 38:22",
        "guitar.dadgad:62 57 55 50 45 38:22",
        "guitar.open-g:62 59 55 50 43 38:22",
        "ukulele.high-g:69 64 60 67:15",
        "ukulele.low-g:69 64 60 55:15",
        "ukulele.baritone:64 59 55 50:15",
      ],
    );
  });

  it("validates custom tunings", () => {
    const t: Tuning = { ...tuningById("guitar.standard")!, id: "custom.mine", source: "custom" };
    expect(validateCustomTuning(t)).toBeNull();
    expect(validateCustomTuning({ ...t, id: "mine" })).toMatch(/custom\./);
    expect(validateCustomTuning({ ...t, openStrings: [64, 59, 55, 50] })).toMatch(/6 strings/);
    expect(validateCustomTuning({ ...t, instrument: "ukulele" })).toMatch(/4 strings/);
    expect(validateCustomTuning({ ...t, fretCount: 0 })).toMatch(/1 to 36/);
    expect(validateCustomTuning({ ...t, fretCount: 37 })).toMatch(/1 to 36/);
    expect(validateCustomTuning({ ...t, fretCount: 36 })).toBeNull();
    expect(validateCustomTuning({ ...t, openStrings: [64, 59, 55, 50, 45, 128] })).toMatch(
      /0 to 127/,
    );
  });

  it("maps string and fret to MIDI and back", () => {
    const std = tuningById("guitar.standard")!;
    expect(midiAt(std, 6, 0)).toBe(40);
    expect(midiAt(std, 1, 12)).toBe(76);
    expect(positionsOf(std, 64)).toEqual([
      { string: 1, fret: 0 },
      { string: 2, fret: 5 },
      { string: 3, fret: 9 },
      { string: 4, fret: 14 },
      { string: 5, fret: 19 },
    ]);
    expect(positionsOf(std, 64, { start: 0, end: 5 })).toEqual([
      { string: 1, fret: 0 },
      { string: 2, fret: 5 },
    ]);
  });

  it("keeps position 0 as the curated shape with its id unchanged", () => {
    for (const shape of CHORD_SHAPES) {
      const positions = chordPositions(shape.id);
      expect(positions.length, shape.id).toBeGreaterThan(0);
      expect(positions.length).toBeLessThanOrEqual(5);
      expect(positions[0]).toMatchObject({
        id: shape.id,
        shapeId: shape.id,
        positionIndex: 0,
        frets: shape.frets,
      });
      positions.slice(1).forEach((p, i) => expect(p.id).toBe(`${shape.id}@${i + 1}`));
    }
  });

  it("lists a shape's sounding notes in ascending pitch order", () => {
    const c = CHORD_SHAPES.find((s) => s.id === "guitar.c-major")!;
    expect(shapeNotes(tuningById("guitar.standard")!, c.frets).map((n) => n.midi)).toEqual([
      48, 52, 55, 60, 64,
    ]);
    const uke = CHORD_SHAPES.find((s) => s.id === "ukulele.c-major")!;
    expect(shapeNotes(tuningById("ukulele.high-g")!, uke.frets).map((n) => n.midi)).toEqual([
      60, 64, 67, 72,
    ]);
  });
});

describe("positionLine", () => {
  const guitar = TUNINGS.guitar[0];
  it("fingers a scale in one hand position", () => {
    const pos = positionLine(guitar, [60, 62, 64, 65, 67, 69, 71, 72]);
    const frets = pos.map((p) => p!.fret);
    expect(Math.min(...frets)).toBe(5);
    expect(Math.max(...frets)).toBe(8);
    expect(pos[0]).toEqual({ string: 3, fret: 5 });
    // An open position when the line fits there.
    expect(positionLine(guitar, [52, 55, 57]).map((p) => p!.fret)).toEqual([2, 0, 2]);
    expect(positionLine(guitar, [20])).toEqual([null]);
  });
});
