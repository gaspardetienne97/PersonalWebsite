import { describe, expect, test } from "vitest";

import { monotonicMs, type NoteEvent } from "@repo/music-core/domain";

import {
  createScalePatternExercise,
  JAZZ_SCALE_KINDS,
  majorScaleExercise,
  scaleSemitones,
  type ScalePatternLiveState,
} from "./scale-pattern";

const note = (midiNote: number, atMs: number): NoteEvent => ({
  type: "noteOn",
  midiNote,
  velocity: 1,
  source: "onscreen",
  timestamp: monotonicMs(atMs),
  clock: "performance",
});

describe("scale kinds", () => {
  test("each scale kind has correct semitone intervals", () => {
    expect(scaleSemitones("major")).toEqual([0, 2, 4, 5, 7, 9, 11, 12]);
    expect(scaleSemitones("dorian")).toEqual([0, 2, 3, 5, 7, 9, 10, 12]);
    expect(scaleSemitones("mixolydian")).toEqual([0, 2, 4, 5, 7, 9, 10, 12]);
    expect(scaleSemitones("altered")).toEqual([0, 1, 3, 4, 6, 8, 10, 12]);
    // The bebop dominant scale is an 8-note scale (adds the major 7).
    expect(scaleSemitones("bebop-dominant")).toHaveLength(9);
    expect(scaleSemitones("harmonic-minor")).toEqual([0, 2, 3, 5, 7, 8, 11, 12]);
    expect(scaleSemitones("major-pentatonic")).toEqual([0, 2, 4, 7, 9, 12]);
    expect(scaleSemitones("minor-pentatonic")).toEqual([0, 3, 5, 7, 10, 12]);
    expect(scaleSemitones("blues")).toEqual([0, 3, 5, 6, 7, 10, 12]);
    expect(scaleSemitones("bebop-major")).toEqual([0, 2, 4, 5, 7, 8, 9, 11, 12]);
    expect(scaleSemitones("whole-tone")).toEqual([0, 2, 4, 6, 8, 10, 12]);
  });

  test("a jazz scale exercise generates its own MIDI notes from C4", () => {
    const exercise = createScalePatternExercise({ tonic: "C4", scale: "dorian" });
    const prompt = exercise.generate({ targetSkillIds: exercise.skillIds, difficulty: 0.4 });
    // C4=60; Dorian = 60,62,63,65,67,69,70,72.
    expect(prompt.payload.midiNotes).toEqual([60, 62, 63, 65, 67, 69, 70, 72]);
  });

  test("JAZZ_SCALE_KINDS only lists jazz/modal scales, not plain major/minor", () => {
    expect(JAZZ_SCALE_KINDS).toContain("dorian");
    expect(JAZZ_SCALE_KINDS).toContain("altered");
    expect(JAZZ_SCALE_KINDS).not.toContain("major");
    expect(JAZZ_SCALE_KINDS).not.toContain("natural-minor");
  });

  test("scale exercises can generate descending motion", () => {
    const exercise = createScalePatternExercise({ tonic: "D4", scale: "major", motion: "down" });
    const prompt = exercise.generate({ targetSkillIds: exercise.skillIds, difficulty: 0.4 });

    expect(prompt.payload.motion).toBe("down");
    expect(prompt.payload.midiNotes).toEqual([74, 73, 71, 69, 67, 66, 64, 62]);
  });

  test("scale exercises can generate up-down motion without duplicating the top note", () => {
    const exercise = createScalePatternExercise({
      tonic: "C4",
      scale: "major",
      motion: "up-down",
    });
    const prompt = exercise.generate({ targetSkillIds: exercise.skillIds, difficulty: 0.4 });

    expect(prompt.payload.motion).toBe("up-down");
    expect(prompt.payload.midiNotes).toEqual([
      60, 62, 64, 65, 67, 69, 71, 72, 71, 69, 67, 65, 64, 62, 60,
    ]);
  });

  test("scale exercises can generate pentascale and two-octave spans", () => {
    const pentascale = createScalePatternExercise({
      tonic: "C4",
      scale: "major",
      span: "pentascale",
    }).generate({ targetSkillIds: ["technique.scale.major"], difficulty: 0.2 });
    const twoOctave = createScalePatternExercise({
      tonic: "C4",
      scale: "major",
      span: "two-octave",
    }).generate({ targetSkillIds: ["technique.scale.major"], difficulty: 0.6 });

    expect(pentascale.payload.span).toBe("pentascale");
    expect(pentascale.payload.midiNotes).toEqual([60, 62, 64, 65, 67]);
    expect(twoOctave.payload.span).toBe("two-octave");
    expect(twoOctave.payload.midiNotes).toEqual([
      60, 62, 64, 65, 67, 69, 71, 72, 74, 76, 77, 79, 81, 83, 84,
    ]);
  });
});

describe("majorScaleExercise", () => {
  test("scores a correct even C major scale highly", () => {
    const ctx = { targetSkillIds: majorScaleExercise.skillIds, difficulty: 0.4 };
    const prompt = majorScaleExercise.generate(ctx);
    const run = majorScaleExercise.createRun(prompt, ctx);

    prompt.payload.midiNotes.forEach((midi, index) => run.accept(note(midi, index * 500)));
    const result = run.finish({ reason: "completed" });

    expect(result.correct).toBe(true);
    expect(result.score).toBeGreaterThan(0.9);
    expect(result.feedback[0]?.message).toContain("Evenness");
  });

  test("penalizes wrong scale tones", () => {
    const ctx = { targetSkillIds: majorScaleExercise.skillIds, difficulty: 0.4 };
    const prompt = majorScaleExercise.generate(ctx);
    const run = majorScaleExercise.createRun(prompt, ctx);

    prompt.payload.midiNotes.forEach((midi, index) => {
      run.accept(note(index === 3 ? midi + 1 : midi, index * 500));
    });
    const result = run.finish({ reason: "completed" });

    expect(result.correct).toBe(false);
    expect(result.score).toBeLessThan(0.9);
  });
});

describe("hands together", () => {
  const ctx = { targetSkillIds: ["technique.scale.major"], difficulty: 0.4 };
  const midi = (midiNote: number, atMs: number): NoteEvent => ({
    type: "noteOn",
    midiNote,
    velocity: 1,
    source: "midi",
    timestamp: monotonicMs(atMs),
    clock: "performance",
  });

  test("defaults to the right hand and keeps one note per beat", () => {
    const prompt = majorScaleExercise.generate(ctx);
    expect(prompt.payload.hands).toBe("right");
    expect(prompt.payload.noteGroups[0]).toEqual([60]);
    expect(prompt.payload.midiNotes).toEqual([60, 62, 64, 65, 67, 69, 71, 72]);
  });

  test("hands: left plays the same pattern one octave down", () => {
    const prompt = createScalePatternExercise({ hands: "left" }).generate(ctx);
    expect(prompt.payload.midiNotes).toEqual([48, 50, 52, 53, 55, 57, 59, 60]);
    expect(prompt.payload.noteGroups[0]).toEqual([48]);
  });

  test("hands: both expects two notes an octave apart on every beat", () => {
    const prompt = createScalePatternExercise({ hands: "both", bpm: 80 }).generate(ctx);
    expect(prompt.payload.noteGroups).toHaveLength(8);
    for (const group of prompt.payload.noteGroups) {
      expect(group).toHaveLength(2);
      expect(group[1]! - group[0]!).toBe(12);
    }
    expect(prompt.payload.midiNotes.slice(0, 4)).toEqual([48, 60, 50, 62]);
  });

  test("counts a beat as together inside the window and not beyond it", () => {
    const exercise = createScalePatternExercise({ hands: "both", bpm: 80 });
    const prompt = exercise.generate(ctx);
    const beatMs = prompt.payload.targetSpacingMs;
    const play = (offsets: number[]) => {
      const run = exercise.createRun(prompt, ctx);
      prompt.payload.noteGroups.forEach((group, beat) => {
        run.accept(midi(group[0]!, beat * beatMs));
        run.accept(midi(group[1]!, beat * beatMs + offsets[beat]!));
      });
      return run;
    };

    const tight = play(prompt.payload.noteGroups.map(() => 30)).finish({ reason: "completed" });
    expect(tight.answer?.togetherTotal).toBe(8);
    expect(tight.answer?.togetherCount).toBe(8);

    const loose = play(prompt.payload.noteGroups.map(() => 60)).finish({ reason: "completed" });
    expect(loose.answer?.togetherCount).toBe(0);
    expect(loose.answer?.togetherTotal).toBe(8);
  });

  test("reports per-beat together flags live", () => {
    const exercise = createScalePatternExercise({ hands: "both", bpm: 80 });
    const prompt = exercise.generate(ctx);
    const run = exercise.createRun(prompt, ctx);
    const [first, second] = prompt.payload.noteGroups;
    run.accept(midi(first![0]!, 0));
    run.accept(midi(first![1]!, 20));
    run.accept(midi(second![0]!, 750));
    run.accept(midi(second![1]!, 900));

    expect((run.getLiveState() as ScalePatternLiveState).togetherFlags).toEqual([true, false]);
  });

  test("does not measure together when both hands come from the on-screen keyboard", () => {
    const exercise = createScalePatternExercise({ hands: "both", bpm: 80 });
    const prompt = exercise.generate(ctx);
    const run = exercise.createRun(prompt, ctx);
    prompt.payload.noteGroups.forEach((group, beat) => {
      run.accept(note(group[0]!, beat * 750));
      run.accept(note(group[1]!, beat * 750 + 20));
    });
    const result = run.finish({ reason: "completed" });

    expect(result.answer?.togetherCount).toBeUndefined();
    expect(result.feedback.map((item) => item.message).join(" ")).toContain(
      "Together not measured",
    );
  });

  test("keeps beats aligned when one hand drops a note", () => {
    const exercise = createScalePatternExercise({ hands: "both", bpm: 80 });
    const prompt = exercise.generate(ctx);
    const run = exercise.createRun(prompt, ctx);
    const beatMs = prompt.payload.targetSpacingMs;
    prompt.payload.noteGroups.forEach((group, beat) => {
      run.accept(midi(group[0]!, beat * beatMs));
      // The right hand misses beat 1 entirely.
      if (beat !== 1) run.accept(midi(group[1]!, beat * beatMs + 10));
    });
    const result = run.finish({ reason: "completed" });

    // 15 of the 16 expected notes still line up: only the dropped one is missing.
    expect(result.feedback[0]?.message).toContain("notes 15/16");
    expect(result.answer?.togetherCount).toBe(7);
  });

  test("measures together on a MIDI run that never completes a beat", () => {
    const exercise = createScalePatternExercise({ hands: "both", bpm: 80 });
    const prompt = exercise.generate(ctx);
    const run = exercise.createRun(prompt, ctx);
    prompt.payload.noteGroups.forEach((group, beat) => {
      run.accept(midi(group[0]!, beat * prompt.payload.targetSpacingMs));
    });
    const result = run.finish({ reason: "completed" });

    expect(result.answer?.togetherCount).toBe(0);
    expect(result.answer?.togetherTotal).toBe(8);
    expect(result.feedback.map((item) => item.message).join(" ")).not.toContain("not measured");
  });

  test("reports evenness and honours a preset evenness threshold", () => {
    const play = (options: { minEvenness?: number }) => {
      const exercise = createScalePatternExercise({ hands: "both", bpm: 80, ...options });
      const prompt = exercise.generate(ctx);
      const run = exercise.createRun(prompt, ctx);
      const beatMs = prompt.payload.targetSpacingMs;
      prompt.payload.noteGroups.forEach((group, beat) => {
        // Every note right, but the beats drag by 50 ms more each time: evenness ~0.72.
        const at = beat * beatMs + beat * 50;
        run.accept(midi(group[0]!, at));
        run.accept(midi(group[1]!, at + 10));
      });
      return run.finish({ reason: "completed" });
    };

    const unchecked = play({});
    expect(unchecked.answer?.evenness).toBeCloseTo(1 - 50 / 180, 5);
    // Pitch is complete, so the composite bar alone still passes it.
    expect(unchecked.correct).toBe(true);

    const checkpoint = play({ minEvenness: 0.85 });
    expect(checkpoint.answer?.evenness).toBeCloseTo(1 - 50 / 180, 5);
    expect(checkpoint.correct).toBe(false);
  });

  test("grades an even hands-together octave scale at 80 BPM", () => {
    const exercise = createScalePatternExercise({ hands: "both", bpm: 80 });
    const prompt = exercise.generate(ctx);
    const run = exercise.createRun(prompt, ctx);
    const beatMs = prompt.payload.targetSpacingMs;
    prompt.payload.noteGroups.forEach((group, beat) => {
      run.accept(midi(group[0]!, beat * beatMs));
      run.accept(midi(group[1]!, beat * beatMs + 10));
    });
    const result = run.finish({ reason: "completed" });

    expect(result.correct).toBe(true);
    expect(result.score).toBeGreaterThan(0.9);
  });
});
