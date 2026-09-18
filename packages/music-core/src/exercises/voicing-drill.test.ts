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

const ctx: ExerciseContext = {
  targetSkillIds: ["harmony.ii-v-i"],
  difficulty: 0.5,
};

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

  test("a doubled pitch stays held until every source releases it", () => {
    const midiOn = { ...noteOn(65), source: "midi" as const };
    const midiOff = { ...noteOff(65), source: "midi" as const };
    const exercise = createVoicingDrillExercise(heldTarget);
    const r = exercise.createRun(exercise.generate(ctx), ctx);

    // F on both the on-screen keyboard and MIDI, then A and C on-screen only.
    [noteOn(65), midiOn, noteOn(69), noteOn(72)].forEach((event) => r.accept(event));
    r.accept(midiOff); // MIDI lets go of F; the on-screen hold survives
    r.accept(noteOn(76)); // E completes the chord — F must still count
    expect(r.getLiveState().progress).toBe(1);
    expect(r.finish().correct).toBe(true);
  });

  test("a release from one source still releases that source's own hold", () => {
    const midi = (event: NoteEvent): NoteEvent => ({
      ...event,
      source: "midi",
    });
    // F, A, C on MIDI; F released before E arrives, so only three ever overlap.
    const result = run(
      [midi(noteOn(65)), midi(noteOn(69)), midi(noteOn(72))].concat(
        midi(noteOff(65)),
        midi(noteOn(76)),
      ),
    );
    expect(result.correct).toBe(false);
    expect(result.score).toBeCloseTo(3 / 4);
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

describe("guide-tone voice leading", () => {
  const target: VoicingTarget = {
    id: "C-guide-V",
    symbol: "G7",
    mode: "chord",
    expectedPitchClasses: [11, 5],
    voiceLeading: { fromMidi: [53, 60], register: [48, 71] },
  };
  function answer(notes: number[], fromMidi: [number, number] = [53, 60]) {
    const exercise = createVoicingDrillExercise({
      ...target,
      voiceLeading: { ...target.voiceLeading!, fromMidi },
    });
    const run = exercise.createRun(exercise.generate(ctx), ctx);
    notes.forEach((note) => {
      run.accept(noteOn(note));
      run.accept(noteOff(note));
    });
    return run.finish();
  }
  test("separates exact membership from minimum sorted-voice travel, accepting sequential notes", () => {
    expect(answer([53, 59])).toMatchObject({ correct: true, score: 1 });
    expect(answer([53, 59]).metrics).toContainEqual(
      expect.objectContaining({
        kind: "voice-leading",
        membershipCorrect: true,
        actualSemitones: 1,
        minimumSemitones: 1,
      }),
    );
    expect(answer([59, 65])).toMatchObject({ correct: false });
    expect(answer([59, 65]).metrics).toContainEqual(
      expect.objectContaining({
        kind: "voice-leading",
        membershipCorrect: true,
        actualSemitones: 11,
        minimumSemitones: 1,
      }),
    );
  });
  test("accepts every tied minimum rather than only the authored answer", () => {
    for (const notes of [
      [53, 59],
      [59, 65],
    ]) {
      expect(answer(notes, [53, 65])).toMatchObject({ correct: true, score: 1 });
      expect(answer(notes, [53, 65]).metrics).toContainEqual(
        expect.objectContaining({ minimumSemitones: 6, actualSemitones: 6 }),
      );
    }
  });
  test("rejects wrong, out-of-register, doubled octave, extra and missing pitches", () => {
    for (const notes of [[53, 60], [41, 59], [53, 71, 59], [53, 53], [], [53], [53, 65]]) {
      const result = answer(notes);
      expect(result.correct).toBe(false);
      expect(result.metrics).toContainEqual(
        expect.objectContaining({ kind: "voice-leading", membershipCorrect: false }),
      );
      if (new Set(notes).size !== 2)
        expect(
          result.metrics.find((metric) => metric.kind === "voice-leading")?.actualSemitones,
        ).toBeUndefined();
    }
    expect(answer([53, 59, 53]).correct).toBe(true);
  });
});
