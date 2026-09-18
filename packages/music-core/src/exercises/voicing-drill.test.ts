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

describe("inversions (P2)", () => {
  // P2 bar 2: F/C — RH C4 F4 A4 over an LH root of F2.
  const target: VoicingTarget = {
    id: "P2-2",
    symbol: "F/C",
    mode: "chord",
    strict: true,
    expectedPitchClasses: [0, 5, 9],
    expectedBassPc: 0,
    bassSplitMidi: 54,
    requireInversion: true,
  };

  function play(events: NoteEvent[], overrides: Partial<VoicingTarget> = {}) {
    const exercise = createVoicingDrillExercise({ ...target, ...overrides });
    const run = exercise.createRun(exercise.generate(ctx), ctx);
    events.forEach((event) => run.accept(event));
    return run.finish();
  }

  function hold(notes: number[], overrides: Partial<VoicingTarget> = {}) {
    return play(notes.map(noteOn), overrides);
  }

  const inversion = (result: ReturnType<typeof hold>) =>
    result.metrics.find((metric) => metric.kind === "chord")?.inversionCorrect;

  test("sets inversionCorrect from the lowest held MIDI's pitch class", () => {
    expect(inversion(hold([60, 65, 69]))).toBe(true);
    expect(inversion(hold([65, 69, 72]))).toBe(false);
  });

  test("ignores the accompanying root below bassSplitMidi", () => {
    const result = hold([41, 60, 65, 69]);
    expect(inversion(result)).toBe(true);
    expect(result.metrics.find((metric) => metric.kind === "chord")?.actualBass).toBe(0);
  });

  test("strict mode rejects an octave-equivalent right-hand voicing", () => {
    expect(hold([60, 65, 69]).correct).toBe(true);
    // Same pitch classes, wrong inversion: F4 A4 C5 is root position, not F/C.
    expect(hold([65, 69, 72]).correct).toBe(false);
  });

  test("reports the inversion without gating correctness when it is not required", () => {
    const relaxed = hold([65, 69, 72], { requireInversion: false });
    expect(inversion(relaxed)).toBe(false);
    expect(relaxed.correct).toBe(true);
  });

  test("keeps the bass of the complete voicing when a voice is released before Check", () => {
    // P2 bar 1: C3 in the left hand under C4 E4 G4. Lifting the right thumb
    // leaves {48, 64, 67} — the sustained root keeps pitch class 0 alive, so the
    // held set still covers {0, 4, 7} and ties on matched, while the lowest
    // *voiced* note jumps to E4. The bass must stay C4, or the bar reads as a
    // first inversion the player never played.
    const barOne: Partial<VoicingTarget> = {
      symbol: "C",
      expectedPitchClasses: [0, 4, 7],
      expectedBassPc: 0,
    };
    const released = play([noteOn(48), noteOn(60), noteOn(64), noteOn(67), noteOff(60)], barOne);
    expect(inversion(released)).toBe(true);
    expect(released.correct).toBe(true);
  });

  test("requires the left-hand root under the chord", () => {
    const rooted = { requiredRootPc: 5 };
    expect(play([noteOn(41), noteOn(60), noteOn(65), noteOn(69)], rooted).correct).toBe(true);
    // Right hand alone: every expected pitch class is there, but no root below the split.
    const handsOff = play([noteOn(60), noteOn(65), noteOn(69)], rooted);
    expect(handsOff.correct).toBe(false);
    expect(handsOff.feedback.map((item) => item.message)).toContain(
      "Play the left-hand root under the chord.",
    );
  });
});

describe("three-voice voice leading", () => {
  // P2 bar 3: G/B — B3 D4 G4 from the previous bar's C4 F4 A4.
  const target: VoicingTarget = {
    id: "P2-3",
    symbol: "G/B",
    mode: "chord",
    strict: true,
    expectedPitchClasses: [7, 11, 2],
    voiceLeading: { fromMidi: [60, 65, 69], register: [55, 72], toleranceSemitones: 2 },
  };

  function play(notes: number[]) {
    const exercise = createVoicingDrillExercise(target);
    const run = exercise.createRun(exercise.generate(ctx), ctx);
    notes.forEach((note) => run.accept(noteOn(note)));
    return run.finish();
  }

  const movement = (notes: number[]) =>
    play(notes).metrics.find((metric) => metric.kind === "voice-leading");

  test("totals the movement across three voices", () => {
    expect(movement([59, 62, 67])).toMatchObject({
      membershipCorrect: true,
      actualSemitones: 6,
      minimumSemitones: 6,
    });
  });

  test("ignores notes outside the register, so an accompanying root does not count as a voice", () => {
    expect(movement([43, 59, 62, 67])).toMatchObject({
      actualMidi: [59, 62, 67],
      actualSemitones: 6,
    });
  });

  test("accepts a voicing within the tolerance of the best and rejects one beyond it", () => {
    expect(play([59, 62, 67]).correct).toBe(true);
    expect(play([62, 67, 71]).correct).toBe(true); // D4 G4 B4, also 6
    expect(play([55, 59, 62]).correct).toBe(false); // G3 B3 D4 — 5 + 6 + 7 = 18
  });
});
