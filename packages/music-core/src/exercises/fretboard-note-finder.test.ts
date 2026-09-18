import { describe, expect, test } from "vitest";

import { monotonicMs, type NoteOnEvent } from "@repo/music-core/domain";
import { curatedTunings } from "@repo/music-core/engines/tunings";

import {
  createFretboardNoteFinderExercise,
  intervalRecallAnchor,
  intervalRegionReady,
} from "./fretboard-note-finder";

const noteOn = (midiNote: number): NoteOnEvent => ({
  type: "noteOn",
  midiNote,
  velocity: 1,
  source: "onscreen",
  timestamp: monotonicMs(0),
  clock: "performance",
});

describe("fretboard note finder", () => {
  test("prompts an exact fretted note and scores the first answer", () => {
    const exercise = createFretboardNoteFinderExercise({
      tuning: curatedTunings("guitar")[0]!,
      stringNumber: 6,
      fretNumber: 5,
    });
    const prompt = exercise.generate({
      targetSkillIds: ["technique.guitar.note-finder"],
      difficulty: 0.3,
      instrument: "guitar",
    });
    const correctRun = exercise.createRun(prompt, {
      targetSkillIds: ["technique.guitar.note-finder"],
      difficulty: 0.3,
    });
    const wrongRun = exercise.createRun(prompt, {
      targetSkillIds: ["technique.guitar.note-finder"],
      difficulty: 0.3,
    });

    expect(prompt.payload).toMatchObject({
      label: "Find A2",
      targetMidi: 45,
      targetNote: "A2",
      targetPitchClass: "A",
      instrument: "guitar",
      stringNumber: 6,
      fretNumber: 5,
    });
    expect(prompt.payload.positions).toContainEqual({
      stringNumber: 6,
      fretNumber: 5,
      midiNote: 45,
    });

    correctRun.accept(noteOn(45));
    wrongRun.accept(noteOn(46));

    expect(correctRun.finish().correct).toBe(true);
    expect(wrongRun.finish().metrics).toContainEqual({
      kind: "pitch",
      expectedMidi: 45,
      actualMidi: 46,
    });
  });
});

describe("fretboard interval recall", () => {
  const tuning = curatedTunings("guitar")[0]!;
  const context = { targetSkillIds: [], difficulty: 0.3, instrument: "guitar" as const };
  const exercise = () =>
    createFretboardNoteFinderExercise({
      tuning,
      stringNumber: 6,
      fretNumber: 5,
      interval: { semitones: 4, windowStart: 5, windowEnd: 9 },
    });
  test("asks for a relationship and verifies a selected position within the region", () => {
    const drill = exercise();
    const prompt = drill.generate(context);
    expect(prompt.payload.label).toContain("major third");
    expect(prompt.payload.label).not.toContain("C#");
    expect(prompt.payload.targetMidi).toBe(49);
    const run = drill.createRun(prompt, context);
    run.accept({
      ...noteOn(49),
      inputProfileId: tuning.id,
      fretPosition: { stringNumber: 6, fretNumber: 9 },
    });
    expect(run.finish()).toMatchObject({
      correct: true,
      answer: { positionMeasured: true, positionCorrect: true },
    });
    const outside = drill.createRun(prompt, context);
    outside.accept({
      ...noteOn(49),
      inputProfileId: tuning.id,
      fretPosition: { stringNumber: 5, fretNumber: 4 },
    });
    expect(outside.finish().correct).toBe(false);
  });
  test("hardware earns pitch-only credit, not an invented string position", () => {
    const drill = exercise();
    const run = drill.createRun(drill.generate(context), context);
    run.accept({ ...noteOn(49), source: "midi" });
    expect(run.finish()).toMatchObject({ correct: true, answer: { positionMeasured: false } });
    expect(run.finish().feedback[0]?.message).toContain("Pitch only");
  });
  test("chooses playable anchors and rejects unsatisfiable or invalid interval windows", () => {
    for (const semitones of [3, 4, 7, 12] as const) {
      const anchor = intervalRecallAnchor(tuning, semitones, 0);
      const drill = createFretboardNoteFinderExercise({
        tuning,
        ...anchor,
        interval: { semitones, windowStart: 0, windowEnd: 4 },
      });
      expect(drill.generate(context).payload.positions.length).toBeGreaterThan(0);
    }
    expect(() =>
      createFretboardNoteFinderExercise({
        tuning,
        stringNumber: 1,
        fretNumber: 4,
        interval: { semitones: 12, windowStart: 0, windowEnd: 4 },
      }),
    ).toThrow();
  });
  test("region progression requires five recent independent position-correct attempts", () => {
    const drill = exercise();
    const run = drill.createRun(drill.generate(context), context);
    run.accept({
      ...noteOn(49),
      inputProfileId: tuning.id,
      fretPosition: { stringNumber: 6, fretNumber: 9 },
    });
    const result = run.finish();
    const events = Array.from({ length: 5 }, (_, index) => ({
      id: String(index),
      instrument: "guitar",
      assistance: "independent",
      source: "onscreen",
      correct: true,
      target: result.target,
      metrics: result.metrics,
      at: index,
    }));
    expect(intervalRegionReady(events as never, 4, 5, tuning.id)).toBe(true);
    expect(intervalRegionReady(events as never, 4, 5, "guitar.drop-d")).toBe(false);
    expect(intervalRegionReady(events.slice(0, 4) as never, 4, 5, tuning.id)).toBe(false);
    expect(
      intervalRegionReady(
        events.map((event) => ({ ...event, source: "midi", metrics: [] })) as never,
        4,
        5,
        tuning.id,
      ),
    ).toBe(false);
    expect(
      intervalRegionReady(
        events.map((event) => ({ ...event, assistance: "guided" })) as never,
        4,
        5,
        tuning.id,
      ),
    ).toBe(false);
  });
});
