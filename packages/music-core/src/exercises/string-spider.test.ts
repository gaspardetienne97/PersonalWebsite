import { describe, expect, test } from "vitest";

import { monotonicMs, type NoteOnEvent } from "@repo/music-core/domain";
import { curatedTunings } from "@repo/music-core/engines/tunings";

import { createStringSpiderExercise } from "./string-spider";

describe("createStringSpiderExercise", () => {
  test("builds a guitar 1-2-3-4 pattern from the selected string and fret", () => {
    const exercise = createStringSpiderExercise({
      tuning: curatedTunings("guitar")[0]!,
      stringNumber: 6,
      startFret: 5,
      bpm: 120,
    });
    const prompt = exercise.generate({
      targetSkillIds: exercise.skillIds,
      difficulty: 0.4,
    });

    expect(prompt.payload).toMatchObject({
      instrument: "guitar",
      tuningId: "guitar.standard",
      stringNumber: 6,
      startFret: 5,
      bpm: 120,
      midiNotes: [45, 46, 47, 48],
      targetSpacingMs: 500,
    });
  });

  test("scores a clean ukulele pattern with pitch and timing feedback", () => {
    const exercise = createStringSpiderExercise({
      tuning: curatedTunings("ukulele")[0]!,
      stringNumber: 1,
      startFret: 1,
      bpm: 120,
    });
    const context = { targetSkillIds: exercise.skillIds, difficulty: 0.4 };
    const prompt = exercise.generate(context);
    const run = exercise.createRun(prompt, context);

    prompt.payload.midiNotes.forEach((midiNote, index) => {
      run.accept(note(midiNote, index * prompt.payload.targetSpacingMs, "ukulele"));
    });
    const result = run.finish({ reason: "completed" });

    expect(result.correct).toBe(true);
    expect(result.answer).toMatchObject({
      playedMidiNotes: prompt.payload.midiNotes,
      pitchAccuracy: 1,
      meanTimingErrorMs: 0,
    });
    expect(result.metrics.filter((metric) => metric.kind === "pitch")).toHaveLength(4);
    expect(result.metrics.filter((metric) => metric.kind === "timing")).toHaveLength(4);
  });

  test("rejects notes played in the wrong order", () => {
    const exercise = createStringSpiderExercise({
      tuning: curatedTunings("guitar")[0]!,
      stringNumber: 6,
      startFret: 0,
      bpm: 120,
    });
    const context = { targetSkillIds: exercise.skillIds, difficulty: 0.4 };
    const prompt = exercise.generate(context);
    const run = exercise.createRun(prompt, context);

    [40, 42, 41, 43].forEach((midiNote, index) => {
      run.accept(note(midiNote, index * 500, "guitar"));
    });
    const result = run.finish({ reason: "completed" });

    expect(result.correct).toBe(false);
    expect(result.answer).toMatchObject({ pitchAccuracy: 0.5 });
    expect(result.feedback[0]?.message).toContain("2/4");
  });
});

function note(midiNote: number, atMs: number, instrument: "guitar" | "ukulele"): NoteOnEvent {
  return {
    type: "noteOn",
    midiNote,
    velocity: 1,
    source: "onscreen",
    instrument,
    timestamp: monotonicMs(atMs),
    clock: "performance",
  };
}
