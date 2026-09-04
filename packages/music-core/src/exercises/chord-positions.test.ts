import { describe, expect, test } from "vitest";

import { curatedTunings } from "@repo/music-core/engines/tunings";

import { CHORD_SHAPES, chordShapeMidiNotes, chordShapesFor } from "./chord-perfect";
import { chordPositionAt, chordPositionsFor } from "./chord-positions";

const tuningFor = (shape: (typeof CHORD_SHAPES)[number]) =>
  curatedTunings(shape.instrument).find((t) => t.id === shape.tuningId)!;

describe("chordPositionsFor", () => {
  test.each(CHORD_SHAPES.map((shape) => [shape.id, shape] as const))(
    "%s keeps the curated shape as position 0 and generates playable alternatives",
    (_id, shape) => {
      const tuning = tuningFor(shape);
      const positions = chordPositionsFor(shape, tuning);
      const expectedPcs = new Set(chordShapeMidiNotes(tuning, shape).map((m) => m % 12));
      const rootPc = chordShapeMidiNotes(tuning, shape)[0]! % 12;
      const reentrant = tuning.openStrings.some((m, i) => i > 0 && m > tuning.openStrings[i - 1]!);

      expect(positions.length).toBeGreaterThanOrEqual(2);
      expect(positions.length).toBeLessThanOrEqual(5);
      expect(positions[0]).toMatchObject({
        id: shape.id,
        frets: shape.frets,
        positionIndex: 0,
        shapeId: shape.id,
      });
      for (const [index, position] of positions.entries()) {
        expect(position.positionIndex).toBe(index);
        if (index > 0) expect(position.id).toBe(`${shape.id}@${index}`);
        const midi = chordShapeMidiNotes(tuning, position);
        expect(new Set(midi.map((m) => m % 12))).toEqual(expectedPcs);
        if (!reentrant) expect(midi[0]! % 12).toBe(rootPc);
        const fretted = position.frets.filter((f): f is number => f !== null && f > 0);
        expect(Math.max(...fretted) - Math.min(...fretted)).toBeLessThanOrEqual(3);
        const fingers = new Set(position.fingers.filter((f): f is number => f !== null));
        expect(fingers.size).toBeLessThanOrEqual(4);
        // Frets in the window.
        for (const f of position.frets)
          if (f !== null) {
            expect(f).toBeGreaterThanOrEqual(position.fretWindow.start);
            expect(f).toBeLessThanOrEqual(position.fretWindow.end);
          }
        // No inner mutes.
        const sounding = position.frets.map((f) => f !== null);
        const first = sounding.indexOf(true);
        const last = sounding.lastIndexOf(true);
        expect(sounding.slice(first, last + 1).every(Boolean)).toBe(true);
        if (position.barre) {
          expect(position.kind).toBe("barre");
          expect(position.baseFret).toBe(position.barre.fret);
        }
      }
      // Positions climb the neck in order.
      const bases = positions.slice(1).map((p) => p.baseFret);
      expect([...bases].sort((a, b) => a - b)).toEqual(bases);
    },
  );

  test("finds the standard barre and closed voicings on guitar and ukulele", () => {
    const voicings = (shapeId: string) => {
      const shape = CHORD_SHAPES.find((s) => s.id === shapeId)!;
      return chordPositionsFor(shape, tuningFor(shape)).map((p) =>
        p.frets.map((f) => (f === null ? "x" : f)).join(" "),
      );
    };
    expect(voicings("guitar.c-major")).toContain("3 5 5 5 3 x");
    expect(voicings("guitar.c-major")).toContain("8 8 9 10 10 8");
    expect(voicings("guitar.g-major")).toContain("3 3 4 5 5 3");
    expect(voicings("guitar.d-major")).toContain("5 7 7 7 5 x");
    expect(voicings("guitar.e-minor")).toContain("7 8 9 9 7 x");
    expect(voicings("guitar.a-minor")).toContain("5 5 5 7 7 5");
    expect(voicings("ukulele.c-major")).toContain("3 3 4 5");
  });

  test("labels positions and clamps position lookups", () => {
    const shape = chordShapesFor("guitar")[0]!;
    const tuning = tuningFor(shape);
    const positions = chordPositionsFor(shape, tuning);
    expect(positions[0]?.positionLabel).toBe("Open position");
    expect(positions[0]?.kind).toBe("open");
    expect(positions.find((p) => p.baseFret === 3)?.positionLabel).toBe("Barre at fret 3");
    expect(chordPositionAt(shape, tuning, -3)).toBe(positions[0]);
    expect(chordPositionAt(shape, tuning, 99)).toBe(positions.at(-1));
    expect(chordPositionsFor(shape, tuning)).toBe(positions);
  });
});
