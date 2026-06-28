import { describe, expect, test } from "vitest";

import { monotonicMs, type NoteOnEvent } from "@repo/music-core/domain";
import { curatedTunings } from "@repo/music-core/engines/tunings";

import {
  CHORD_SHAPES,
  chordShapeMidiNotes,
  chordShapesFor,
  createChordPerfectExercise,
  createOpenChordIdentificationExercise,
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
