import { describe, expect, test } from "vitest";

import { monotonicMs, type NoteOnEvent } from "@repo/music-core/domain";
import { curatedTunings } from "@repo/music-core/engines/tunings";

import {
  CHORD_SHAPES,
  chordShapeMidiNotes,
  chordShapesFor,
  createChordPerfectExercise,
  createOpenChordIdentificationExercise,
  normalizeChordPerfectDrillConfig,
} from "./chord-perfect";

// Expected pitch-class set per curated shape — the authoritative check that the
// fret data is correct, independent of any one voicing.
const EXPECTED_PCS: Record<string, number[]> = {
  "guitar.c-major": [0, 4, 7],
  "guitar.g-major": [7, 11, 2],
  "guitar.d-major": [2, 6, 9],
  "guitar.e-minor": [4, 7, 11],
  "guitar.a-minor": [9, 0, 4],
  "ukulele.c-major": [0, 4, 7],
  "ukulele.f-major": [5, 9, 0],
  "ukulele.g-major": [7, 11, 2],
  "ukulele.a-minor": [9, 0, 4],
};

describe("createChordPerfectExercise", () => {
  test("every curated shape resolves to the right chord tones", () => {
    for (const shape of CHORD_SHAPES) {
      const tuning = curatedTunings(shape.instrument).find((entry) => entry.id === shape.tuningId)!;
      const shapeMidi = chordShapeMidiNotes(tuning, shape);
      const prompt = createChordPerfectExercise({ tuning, shape }).generate({
        targetSkillIds: [],
        difficulty: 0.4,
      });
      expect(prompt.payload.midiNotes).toEqual(shapeMidi);
      const pcs = new Set(prompt.payload.midiNotes.map((midi) => ((midi % 12) + 12) % 12));
      expect([...pcs].sort((a, b) => a - b)).toEqual(
        [...new Set(EXPECTED_PCS[shape.id])].sort((a, b) => a - b),
      );
      // Voiced notes are sorted low to high.
      expect(prompt.payload.midiNotes).toEqual([...prompt.payload.midiNotes].sort((a, b) => a - b));
    }
  });

  test("curated open shapes carry explicit suggested fingering aligned with frets", () => {
    const cMajor = CHORD_SHAPES.find((shape) => shape.id === "guitar.c-major");

    expect(cMajor?.fingers).toEqual([null, 1, null, 2, 3, null]);

    for (const shape of CHORD_SHAPES) {
      expect(shape.fingers).toHaveLength(shape.frets.length);
      shape.frets.forEach((fret, index) => {
        const finger = shape.fingers[index];
        if (fret === null || fret === 0) {
          expect(finger).toBeNull();
        } else {
          expect(finger).toBeGreaterThanOrEqual(1);
          expect(finger).toBeLessThanOrEqual(4);
        }
      });
    }
  });

  test("curated open shapes carry transition metadata for change training", () => {
    const byId = new Map(CHORD_SHAPES.map((shape) => [shape.id, shape]));
    const cMajor = byId.get("guitar.c-major");

    expect(cMajor).toMatchObject({
      difficulty: expect.any(Number),
      mutedStrings: [6],
      openStrings: [1, 3],
      commonTransitions: expect.arrayContaining(["guitar.g-major", "guitar.a-minor"]),
    });

    for (const shape of CHORD_SHAPES) {
      expect(shape.difficulty).toBeGreaterThanOrEqual(1);
      expect(shape.mutedStrings).toEqual(
        shape.frets
          .map((fret, index) => (fret === null ? index + 1 : undefined))
          .filter((stringNumber): stringNumber is number => stringNumber !== undefined),
      );
      expect(shape.openStrings).toEqual(
        shape.frets
          .map((fret, index) => (fret === 0 ? index + 1 : undefined))
          .filter((stringNumber): stringNumber is number => stringNumber !== undefined),
      );
      for (const transitionId of shape.commonTransitions) {
        expect(byId.get(transitionId)?.instrument).toBe(shape.instrument);
      }
    }
  });

  test("scores a clean six-string guitar C as chord-perfect", () => {
    const tuning = curatedTunings("guitar")[0]!;
    const shape = chordShapesFor("guitar").find((entry) => entry.id === "guitar.c-major")!;
    const exercise = createChordPerfectExercise({ tuning, shape });
    const context = { targetSkillIds: exercise.skillIds, difficulty: 0.4 };
    const prompt = exercise.generate(context);
    const run = exercise.createRun(prompt, context);

    // C major omits string 6 → 5 voiced notes.
    expect(prompt.payload.midiNotes).toHaveLength(5);
    prompt.payload.midiNotes.forEach((midi, index) => run.accept(note(midi, index * 400)));
    const result = run.finish({ reason: "completed" });

    expect(result.correct).toBe(true);
    expect(result.answer).toMatchObject({ pitchAccuracy: 1 });
  });

  test("a muted string drags the score below chord-perfect", () => {
    const tuning = curatedTunings("ukulele")[0]!;
    const shape = chordShapesFor("ukulele").find((entry) => entry.id === "ukulele.c-major")!;
    const exercise = createChordPerfectExercise({ tuning, shape });
    const context = { targetSkillIds: exercise.skillIds, difficulty: 0.4 };
    const prompt = exercise.generate(context);
    const run = exercise.createRun(prompt, context);

    // Play three of four notes correctly, then a wrong final note.
    const notes = [...prompt.payload.midiNotes];
    notes[notes.length - 1] = notes[notes.length - 1]! + 2;
    notes.forEach((midi, index) => run.accept(note(midi, index * 400)));
    const result = run.finish({ reason: "completed" });

    expect(result.correct).toBe(false);
    expect(result.feedback[0]?.message).toContain("3/4");
  });

  test("scores a clean analyzed strum as open chord identification", () => {
    const tuning = curatedTunings("guitar")[0]!;
    const shape = chordShapesFor("guitar").find((entry) => entry.id === "guitar.c-major")!;
    const exercise = createOpenChordIdentificationExercise({ tuning, shape });
    const context = { targetSkillIds: exercise.skillIds, difficulty: 0.4 };
    const prompt = exercise.generate(context);
    const run = exercise.createRun(prompt, context);

    [60, 64, 67].forEach((midi, index) => run.accept(note(midi, index * 10)));
    const result = run.finish({ reason: "completed" });

    expect(prompt.payload.expectedSymbol).toBe("C");
    expect(result.correct).toBe(true);
    expect(result.score).toBe(1);
    expect(result.answer).toMatchObject({
      detectedSymbol: "C",
      expectedSymbol: "C",
      targetCoverage: 1,
    });
    expect(result.metrics).toEqual(
      expect.arrayContaining([
        { kind: "choice", expected: "C", actual: "C" },
        expect.objectContaining({
          kind: "chord",
          expectedPitchClasses: [0, 4, 7],
          actualPitchClasses: [0, 4, 7],
        }),
      ]),
    );
  });

  test("keeps the detected symbol when open chord identification misses the target", () => {
    const tuning = curatedTunings("guitar")[0]!;
    const shape = chordShapesFor("guitar").find((entry) => entry.id === "guitar.c-major")!;
    const exercise = createOpenChordIdentificationExercise({ tuning, shape });
    const context = { targetSkillIds: exercise.skillIds, difficulty: 0.4 };
    const prompt = exercise.generate(context);
    const run = exercise.createRun(prompt, context);

    [57, 60, 64].forEach((midi, index) => run.accept(note(midi, index * 10)));
    const result = run.finish({ reason: "completed" });

    expect(result.correct).toBe(false);
    expect(result.answer).toMatchObject({
      detectedSymbol: "Am",
      expectedSymbol: "C",
    });
    expect(result.response).toMatchObject({ label: "Am", choice: "Am" });
    expect(result.feedback[0]?.message).toContain("Heard Am");
  });

  test("normalizes shareable chord-perfect drill config values", () => {
    expect(
      normalizeChordPerfectDrillConfig(
        new URLSearchParams("mode=pick&instrument=ukulele&shape=ukulele.g-major"),
      ),
    ).toEqual({
      mode: "pick",
      instrument: "ukulele",
      shapeId: "ukulele.g-major",
      tuningId: "ukulele.high-g",
      toShapeId: "ukulele.c-major",
    });

    expect(
      normalizeChordPerfectDrillConfig({ workflow: "strum", chord: "guitar.d-major" }),
    ).toEqual({
      mode: "strum",
      instrument: "guitar",
      shapeId: "guitar.d-major",
      tuningId: "guitar.standard",
      toShapeId: "guitar.g-major",
    });

    expect(
      normalizeChordPerfectDrillConfig({
        mode: "not-a-mode",
        instrument: "ukulele",
        shape: "guitar.c-major",
      }),
    ).toEqual({
      mode: "build",
      instrument: "ukulele",
      shapeId: "ukulele.c-major",
      tuningId: "ukulele.high-g",
      toShapeId: "ukulele.f-major",
    });

    expect(
      normalizeChordPerfectDrillConfig(
        new URLSearchParams(
          "mode=changes&instrument=guitar&shape=guitar.c-major&to=guitar.g-major",
        ),
      ),
    ).toEqual({
      mode: "changes",
      instrument: "guitar",
      shapeId: "guitar.c-major",
      tuningId: "guitar.standard",
      toShapeId: "guitar.g-major",
    });
  });
});

function note(midiNote: number, atMs: number): NoteOnEvent {
  return {
    type: "noteOn",
    midiNote,
    velocity: 1,
    source: "onscreen",
    instrument: "guitar",
    timestamp: monotonicMs(atMs),
    clock: "performance",
  };
}
