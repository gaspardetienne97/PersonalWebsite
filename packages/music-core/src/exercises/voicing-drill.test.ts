import { describe, expect, test } from "vitest";

import { monotonicMs, type ExerciseContext, type NoteEvent } from "@repo/music-core/domain";

import { createVoicingDrillExercise, type VoicingTarget } from "./voicing-drill";

const noteOn = (midiNote: number): NoteEvent => ({
  type: "noteOn",
  midiNote,
  velocity: 1,
  source: "onscreen",
  timestamp: monotonicMs(0),
  clock: "performance",
});

const noteOff = (midiNote: number): NoteEvent => ({
  type: "noteOff",
  midiNote,
  source: "onscreen",
  timestamp: monotonicMs(0),
  clock: "performance",
});

const ctx: ExerciseContext = { targetSkillIds: ["harmony.ii-v-i"], difficulty: 0.5 };

// Dm7 rootless A = F A C E → pitch classes {5, 9, 0, 4}.
const chordTarget: VoicingTarget = {
  id: "C-ii",
  symbol: "Dm7",
  expectedPitchClasses: [5, 9, 0, 4],
  expectedBassPc: 2,
  mode: "chord",
};

describe("voicing drill — held (strict) chord mode", () => {
  const heldTarget: VoicingTarget = { ...chordTarget, strict: true }; // expects {5,9,0,4}

  function run(events: NoteEvent[]) {
    const exercise = createVoicingDrillExercise(heldTarget);
    const r = exercise.createRun(exercise.generate(ctx), ctx);
    events.forEach((event) => r.accept(event));
    return r.finish();
  }

  test("is correct when all notes are held together", () => {
    const result = run([noteOn(65), noteOn(69), noteOn(72), noteOn(76)]); // F A C E held
    expect(result.correct).toBe(true);
    expect(result.score).toBe(1);
  });

  test("does not credit a chord that is never held together (sequential taps)", () => {
    const result = run([
      noteOn(65),
      noteOff(65),
      noteOn(69),
      noteOff(69),
      noteOn(72),
      noteOff(72),
      noteOn(76),
      noteOff(76),
    ]);
    expect(result.correct).toBe(false);
    expect(result.score).toBeLessThanOrEqual(1 / 4); // at most one note held at a time
  });

  test("credits the best simultaneous overlap and stays there (monotonic progress)", () => {
    const exercise = createVoicingDrillExercise(heldTarget);
    const r = exercise.createRun(exercise.generate(ctx), ctx);
    [noteOn(65), noteOn(69), noteOn(72)].forEach((event) => r.accept(event));
    expect(r.getLiveState().progress).toBeCloseTo(3 / 4);
    r.accept(noteOff(65)); // release one — best overlap should not drop
    expect(r.getLiveState().progress).toBeCloseTo(3 / 4);
  });
});

describe("voicing drill — chord mode", () => {
  function run(notes: number[]) {
    const exercise = createVoicingDrillExercise(chordTarget);
    const r = exercise.createRun(exercise.generate(ctx), ctx);
    notes.forEach((note) => r.accept(noteOn(note)));
    return r.finish();
  }

  test("marks the chord correct when all pitch classes are played (any octave/order)", () => {
    const result = run([65, 69, 72, 76]); // F A C E
    expect(result.correct).toBe(true);
    expect(result.score).toBe(1);
  });

  test("scores partial credit and reports the missing pitch class", () => {
    const result = run([65, 69, 72]); // missing E (4)
    expect(result.correct).toBe(false);
    expect(result.score).toBeCloseTo(3 / 4);
    const metric = result.metrics[0];
    expect(metric).toMatchObject({ kind: "chord", missingPitchClasses: [4] });
  });

  test("tolerates extra notes but records them as diagnostics", () => {
    const result = run([65, 69, 72, 76, 70]); // + Bb (extra)
    expect(result.correct).toBe(true);
    expect(result.metrics[0]).toMatchObject({ extraPitchClasses: [10] });
  });

  test("exposes live progress as notes come in", () => {
    const exercise = createVoicingDrillExercise(chordTarget);
    const r = exercise.createRun(exercise.generate(ctx), ctx);
    r.accept(noteOn(65));
    r.accept(noteOn(69));
    expect(r.getLiveState().progress).toBeCloseTo(2 / 4);
  });
});

describe("voicing drill — arpeggio mode (monophonic)", () => {
  // Same chord, played one note at a time in order.
  const arpTarget: VoicingTarget = {
    ...chordTarget,
    mode: "arpeggio",
    expectedPitchClasses: [5, 9, 0, 4],
  };

  function run(notes: number[]) {
    const exercise = createVoicingDrillExercise(arpTarget);
    const r = exercise.createRun(exercise.generate(ctx), ctx);
    notes.forEach((note) => r.accept(noteOn(note)));
    return r.finish();
  }

  test("is correct when the arpeggio is played in order", () => {
    expect(run([65, 69, 72, 76]).correct).toBe(true); // F A C E
  });

  test("scores the longest in-order prefix when notes are out of order", () => {
    const result = run([65, 72, 69, 76]); // F C A E → matches F(5), then C(0)? no — needs 9 next
    // expected order 5,9,0,4: F(5)✓ then looks for 9; gets C(0) no, A(9)✓, then 0; E(4)... C already passed
    expect(result.score).toBeLessThan(1);
    expect(result.score).toBeGreaterThan(0);
  });
});
