import { describe, expect, test } from "vitest";

import { monotonicMs, type NoteOnEvent } from "@repo/music-core/domain";
import { curatedTunings } from "@repo/music-core/engines/tunings";

import {
  FRETBOARD_PATTERNS,
  createFretboardPatternExercise,
  fretboardPatternDefinition,
} from "./fretboard-pattern";

const tuning = curatedTunings("guitar")[0]!;

function onscreen(
  midiNote: number,
  atMs: number,
  fretPosition?: { stringNumber: number; fretNumber: number },
): NoteOnEvent {
  return {
    type: "noteOn",
    midiNote,
    velocity: 1,
    source: "onscreen",
    instrument: "guitar",
    inputProfileId: tuning.id,
    timestamp: monotonicMs(atMs),
    clock: "performance",
    ...(fretPosition === undefined ? {} : { fretPosition }),
  };
}

function mic(midiNote: number, atMs: number): NoteOnEvent {
  return {
    type: "noteOn",
    midiNote,
    velocity: 1,
    source: "audio",
    instrument: "guitar",
    timestamp: monotonicMs(atMs),
    clock: "performance",
  };
}

describe("FRETBOARD_PATTERNS", () => {
  test("carries the five minor-pentatonic boxes and the five CAGED major shapes", () => {
    expect(FRETBOARD_PATTERNS.map((pattern) => pattern.id)).toEqual([
      "minor-pentatonic-box-1",
      "minor-pentatonic-box-2",
      "minor-pentatonic-box-3",
      "minor-pentatonic-box-4",
      "minor-pentatonic-box-5",
      "caged-major-e-shape",
      "caged-major-d-shape",
      "caged-major-c-shape",
      "caged-major-a-shape",
      "caged-major-g-shape",
    ]);
  });

  test("every box is A minor pentatonic at root fret 5 and fits one hand position", () => {
    for (const pattern of FRETBOARD_PATTERNS.filter(
      (entry) => entry.family === "minor-pentatonic",
    )) {
      const prompt = createFretboardPatternExercise({
        tuning,
        patternId: pattern.id,
        rootFret: 5,
        bpm: 90,
      }).generate({ targetSkillIds: [], difficulty: 0.4 });
      const pitchClasses = new Set(prompt.payload.midiNotes.map((midi) => midi % 12));
      // A C D E G.
      expect(
        [...pitchClasses].sort((a, b) => a - b),
        pattern.id,
      ).toEqual([0, 2, 4, 7, 9]);
      const frets = prompt.payload.positions.map((position) => position.fretNumber);
      expect(Math.max(...frets) - Math.min(...frets), pattern.id).toBeLessThanOrEqual(4);
      // Two notes per string, low to high, ascending.
      expect(
        prompt.payload.positions.map((position) => position.stringNumber),
        pattern.id,
      ).toEqual([6, 6, 5, 5, 4, 4, 3, 3, 2, 2, 1, 1]);
    }
  });

  test("every CAGED shape spells a C major triad at root fret 8", () => {
    for (const pattern of FRETBOARD_PATTERNS.filter((entry) => entry.family === "caged-major")) {
      const prompt = createFretboardPatternExercise({
        tuning,
        patternId: pattern.id,
        rootFret: 8,
        bpm: 90,
      }).generate({ targetSkillIds: [], difficulty: 0.4 });
      const pitchClasses = new Set(prompt.payload.midiNotes.map((midi) => midi % 12));
      expect(
        [...pitchClasses].sort((a, b) => a - b),
        pattern.id,
      ).toEqual([0, 4, 7]);
      const frets = prompt.payload.positions.map((position) => position.fretNumber);
      expect(Math.max(...frets) - Math.min(...frets), pattern.id).toBeLessThanOrEqual(4);
      expect(
        prompt.payload.positions.every((position) => position.fretNumber > 0),
        pattern.id,
      ).toBe(true);
    }
  });

  test("a pattern that would run off the neck is rejected", () => {
    expect(() =>
      createFretboardPatternExercise({
        tuning,
        patternId: "minor-pentatonic-box-5",
        rootFret: tuning.fretCount,
        bpm: 90,
      }),
    ).toThrow(/fretboard/i);
  });
});

describe("createFretboardPatternExercise", () => {
  test("on-screen input grades the string and the fret, not just the pitch", () => {
    const exercise = createFretboardPatternExercise({
      tuning,
      patternId: "minor-pentatonic-box-1",
      rootFret: 5,
      bpm: 90,
    });
    const context = { targetSkillIds: exercise.skillIds, difficulty: 0.4 };
    const prompt = exercise.generate(context);
    const run = exercise.createRun(prompt, context);
    const positions = prompt.payload.positions;

    // Two notes are played at the right pitch on the wrong string: C3 (string 6
    // fret 8) also sits at string 5 fret 3, and E3 (string 5 fret 7) at string 6
    // fret 12. Pitch alone cannot tell them apart; the tap can.
    const elsewhere = new Map([
      [1, { stringNumber: 5, fretNumber: 3 }],
      [3, { stringNumber: 6, fretNumber: 12 }],
    ]);
    positions.forEach((position, index) => {
      const played = elsewhere.get(index) ?? {
        stringNumber: position.stringNumber,
        fretNumber: position.fretNumber,
      };
      run.accept(onscreen(position.midiNote, index * prompt.payload.targetSpacingMs, played));
    });

    const result = run.finish({ reason: "completed" });
    const answer = result.answer;

    expect(answer?.positionsMeasured).toBe(positions.length);
    expect(answer?.positionsCorrect).toBe(positions.length - 2);
    expect(answer?.pitchAccuracy).toBe(1);
    expect(result.correct).toBe(false);
    expect(result.feedback[0]?.message).toContain(`${positions.length - 2}/${positions.length}`);
    expect(
      result.metrics.some(
        (metric) => metric.kind === "choice" && metric.actual === "Wrong string or fret",
      ),
    ).toBe(true);
  });

  test("microphone input grades pitch only and says the position is not verified", () => {
    const exercise = createFretboardPatternExercise({
      tuning,
      patternId: "minor-pentatonic-box-1",
      rootFret: 5,
      bpm: 90,
    });
    const context = { targetSkillIds: exercise.skillIds, difficulty: 0.4 };
    const prompt = exercise.generate(context);
    const run = exercise.createRun(prompt, context);

    prompt.payload.positions.forEach((position, index) => {
      run.accept(mic(position.midiNote, index * prompt.payload.targetSpacingMs));
    });

    const result = run.finish({ reason: "completed" });

    expect(result.answer?.positionsMeasured).toBe(0);
    expect(result.answer?.pitchAccuracy).toBe(1);
    expect(result.correct).toBe(true);
    expect(result.feedback.map((item) => item.message).join(" ")).toContain(
      "position not verified",
    );
    expect(
      result.metrics.some(
        (metric) => metric.kind === "choice" && metric.actual === "Position not observed",
      ),
    ).toBe(true);
  });

  test("grades the positions it could see, even when the run is left unfinished", () => {
    const exercise = createFretboardPatternExercise({
      tuning,
      patternId: "minor-pentatonic-box-1",
      rootFret: 5,
      bpm: 90,
    });
    const context = { targetSkillIds: exercise.skillIds, difficulty: 0.4 };
    const prompt = exercise.generate(context);
    const run = exercise.createRun(prompt, context);
    const positions = prompt.payload.positions;

    // Eleven of twelve tapped, all on the right string and fret.
    positions.slice(0, 11).forEach((position, index) => {
      run.accept(
        onscreen(position.midiNote, index * prompt.payload.targetSpacingMs, {
          stringNumber: position.stringNumber,
          fretNumber: position.fretNumber,
        }),
      );
    });

    const result = run.finish({ reason: "completed" });

    expect(result.answer?.positionsMeasured).toBe(11);
    expect(result.answer?.positionsCorrect).toBe(11);
    // The measured subset is graded, not written off as unobserved.
    expect(result.feedback[0]?.message).toBe("11/11 notes on the right string and fret.");
    expect(result.feedback.map((item) => item.message).join(" ")).not.toContain(
      "position not verified",
    );
    expect(
      result.metrics.some(
        (metric) => metric.kind === "choice" && metric.actual === "Position not observed",
      ),
    ).toBe(false);
    // The missing twelfth note still costs: it is an unmatched pitch target.
    expect(result.score).toBeLessThan(1);
    expect(result.metrics.at(-2)).toEqual({
      kind: "pitch",
      expectedMidi: positions.at(-1)!.midiNote,
      actualMidi: undefined,
    });
  });

  test("credits pitch for the notes whose position the input could not see", () => {
    const exercise = createFretboardPatternExercise({
      tuning,
      patternId: "minor-pentatonic-box-1",
      rootFret: 5,
      bpm: 90,
    });
    const context = { targetSkillIds: exercise.skillIds, difficulty: 0.4 };
    const prompt = exercise.generate(context);
    const run = exercise.createRun(prompt, context);

    // One tap, the rest from the microphone.
    prompt.payload.positions.forEach((position, index) => {
      const atMs = index * prompt.payload.targetSpacingMs;
      run.accept(
        index === 0
          ? onscreen(position.midiNote, atMs, {
              stringNumber: position.stringNumber,
              fretNumber: position.fretNumber,
            })
          : mic(position.midiNote, atMs),
      );
    });

    const result = run.finish({ reason: "completed" });

    expect(result.answer?.positionsMeasured).toBe(1);
    expect(result.answer?.positionsCorrect).toBe(1);
    expect(result.correct).toBe(true);
  });

  test("names the pattern and the root fret in the prompt", () => {
    expect(fretboardPatternDefinition("caged-major-g-shape").label).toBe("CAGED G shape");
    const prompt = createFretboardPatternExercise({
      tuning,
      patternId: "minor-pentatonic-box-3",
      rootFret: 5,
      bpm: 90,
    }).generate({ targetSkillIds: [], difficulty: 0.4 });

    expect(prompt.payload.label).toBe("Guitar · Minor pentatonic box 3 · root fret 5");
    expect(prompt.payload.patternId).toBe("minor-pentatonic-box-3");
    expect(prompt.payload.rootFret).toBe(5);
  });
});
