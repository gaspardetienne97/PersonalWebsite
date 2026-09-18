import { describe, expect, test } from "vitest";

import { monotonicMs, type NoteOnEvent } from "@repo/music-core/domain";
import { beatToMs } from "@repo/music-core/engines/score-follower";

import {
  BLUE_THIRD_C7,
  COMPING_PATTERNS,
  compingScore,
  createCompingPatternExercise,
  type CompingPattern,
} from "./comping-pattern";

const context = { targetSkillIds: [], difficulty: 0.5 };

function run(pattern: CompingPattern, events: { midiNote: number; beat: number }[]) {
  const exercise = createCompingPatternExercise(pattern, { bpm: pattern.bpm });
  const exerciseRun = exercise.createRun(exercise.generate(context), context);
  for (const { midiNote, beat } of events) {
    exerciseRun.accept(note(midiNote, beatToMs(beat, pattern.bpm)));
  }
  return exerciseRun.finish();
}

/** Every note of the tabled performance, played dead on the written grid. */
function perfectEvents(pattern: CompingPattern): { midiNote: number; beat: number }[] {
  const score = compingScore(pattern);
  return score.notes
    .map((scoreNote) => ({ midiNote: scoreNote.midiNote, beat: scoreNote.startBeat }))
    .sort((left, right) => left.beat - right.beat);
}

describe("P3 'Blue third over a C7 shell'", () => {
  test("authors the tabled right-hand lick", () => {
    expect(BLUE_THIRD_C7.lick.map((lickNote) => [lickNote.startBeat, lickNote.midiNote])).toEqual([
      [0, 67],
      [0.5, 70],
      [1, 72],
      [2, 70],
      [2.5, 67],
      [3, 64],
      [4, 63],
      [4.5, 64],
      [5, 67],
      [6, 60],
    ]);
    expect(BLUE_THIRD_C7.lick.map((lickNote) => lickNote.finger)).toEqual([
      2, 3, 4, 3, 2, 1, 1, 2, 3, 1,
    ]);
  });

  test("keeps the Charleston shell on one and the and-of-two of both bars", () => {
    expect(BLUE_THIRD_C7.compRhythm).toEqual([
      { beat: 0, durationBeats: 1 },
      { beat: 1.5, durationBeats: 0.5 },
    ]);
    expect(BLUE_THIRD_C7.shellMidi).toEqual([48, 58]);
    const leftOnsets = compingScore(BLUE_THIRD_C7)
      .notes.filter((scoreNote) => scoreNote.voiceId === "left-hand")
      .map((scoreNote) => scoreNote.startBeat);
    expect(leftOnsets).toEqual([0, 0, 1.5, 1.5, 4, 4, 5.5, 5.5]);
  });

  test("fills 4.0 beats per bar in each hand", () => {
    const score = compingScore(BLUE_THIRD_C7);
    for (const voiceId of ["right-hand", "left-hand"]) {
      for (const bar of [0, 1]) {
        const spans = [...score.notes, ...(score.rests ?? [])].filter(
          (span) =>
            span.voiceId === voiceId && span.startBeat >= bar * 4 && span.startBeat < (bar + 1) * 4,
        );
        // The shell is two notes struck together, so a bar's spans are summed
        // over distinct onsets rather than over every note.
        const byOnset = new Map(spans.map((span) => [span.startBeat, span.durationBeats]));
        const total = [...byOnset.values()].reduce((sum, beats) => sum + beats, 0);
        expect(total, `${voiceId} bar ${bar + 1}`).toBe(4);
      }
    }
  });

  test("grades a straight, on-the-grid performance as correct", () => {
    const result = run(BLUE_THIRD_C7, perfectEvents(BLUE_THIRD_C7));
    expect(result.answer).toMatchObject({
      rightHandNotes: 10,
      rightHandExpected: 10,
      leftHandOnsets: 4,
      leftHandExpectedOnsets: 4,
      leftHandExtras: 0,
    });
    expect(result.correct).toBe(true);
  });

  test("accepts a swung off-beat eighth at 0.67 as on time", () => {
    const swung = perfectEvents(BLUE_THIRD_C7).map((event) =>
      event.beat % 1 === 0.5 ? { ...event, beat: event.beat + 1 / 6 } : event,
    );
    const result = run(BLUE_THIRD_C7, swung);
    expect(result.answer!.rightHandNotes).toBe(10);
    expect(result.answer!.leftHandOnsets).toBe(4);
    const timing = result.metrics.flatMap((metric) =>
      metric.kind === "timing" ? [Math.abs(metric.errorMs)] : [],
    );
    expect(Math.max(...timing)).toBe(0);
  });

  test("still grades a straight off-beat eighth as on time", () => {
    expect(run(BLUE_THIRD_C7, perfectEvents(BLUE_THIRD_C7)).answer!.rightHandNotes).toBe(10);
  });

  test("counts a left-hand stab on beat 3 as one extra and fails the run", () => {
    const result = run(BLUE_THIRD_C7, [
      ...perfectEvents(BLUE_THIRD_C7),
      { midiNote: 48, beat: 2 },
      { midiNote: 58, beat: 2 },
    ]);
    // One stab, two notes: the shell is one onset, so it is one extra.
    expect(result.answer!.leftHandExtras).toBe(1);
    expect(result.correct).toBe(false);
    expect(result.feedback.map((item) => item.message).join(" ")).toContain(
      "1 extra left-hand onset on beats 3-4",
    );
    // Stabs on beat 3 and on beat 4 are two extras.
    const twice = run(BLUE_THIRD_C7, [
      ...perfectEvents(BLUE_THIRD_C7),
      { midiNote: 48, beat: 2 },
      { midiNote: 58, beat: 2 },
      { midiNote: 48, beat: 3 },
      { midiNote: 58, beat: 3 },
    ]);
    expect(twice.answer!.leftHandExtras).toBe(2);
  });

  test("keeps the run input unquantised, so a replay shows what was played", () => {
    const swungOffbeatMs = beatToMs(0.5 + 1 / 6, BLUE_THIRD_C7.bpm);
    const result = run(BLUE_THIRD_C7, [{ midiNote: 70, beat: 0.5 + 1 / 6 }]);
    expect(Number(result.input[0]!.timestamp)).toBeCloseTo(swungOffbeatMs, 6);
  });

  test("without swing tolerance the same swung take loses notes and gains extras", () => {
    const swung = perfectEvents(BLUE_THIRD_C7).map((event) =>
      event.beat % 1 === 0.5 ? { ...event, beat: event.beat + 1 / 6 } : event,
    );
    const exercise = createCompingPatternExercise(BLUE_THIRD_C7, {
      bpm: BLUE_THIRD_C7.bpm,
      swingTolerance: false,
    });
    const straightRun = exercise.createRun(exercise.generate(context), context);
    for (const { midiNote, beat } of swung) {
      straightRun.accept(note(midiNote, beatToMs(beat, BLUE_THIRD_C7.bpm)));
    }
    const result = straightRun.finish();
    expect(result.answer!.rightHandNotes).toBeLessThan(10);
    expect(result.answer!.leftHandExtras).toBeGreaterThan(0);
    expect(result.correct).toBe(false);
  });

  test("does not stretch the corridor past the swung eighth", () => {
    // 0.9 of a beat is well past 2/3 plus a window: a late note stays late.
    const result = run(BLUE_THIRD_C7, [{ midiNote: 70, beat: 0.9 }]);
    expect(result.answer!.rightHandNotes).toBe(0);
  });

  test("does not count the swung and-of-two as an extra", () => {
    const result = run(
      BLUE_THIRD_C7,
      perfectEvents(BLUE_THIRD_C7).map((event) =>
        event.beat % 1 === 0.5 ? { ...event, beat: event.beat + 1 / 6 } : event,
      ),
    );
    expect(result.answer!.leftHandExtras).toBe(0);
  });
});

describe("P-A1 transpositions", () => {
  test("offers C7, F7 and G7 with the shell kept under the lick", () => {
    expect(COMPING_PATTERNS.map((pattern) => pattern.chord)).toEqual(["C7", "F7", "G7"]);
    const [, f7, g7] = COMPING_PATTERNS;
    // F7: the lick moves up a fourth, the shell down a fifth (F2 + Eb3).
    expect(f7!.lick.map((lickNote) => lickNote.midiNote)).toEqual([
      72, 75, 77, 75, 72, 69, 68, 69, 72, 65,
    ]);
    expect(f7!.shellMidi).toEqual([41, 51]);
    expect(g7!.shellMidi).toEqual([43, 53]);
    for (const pattern of COMPING_PATTERNS) {
      expect(Math.min(...pattern.lick.map((lickNote) => lickNote.midiNote))).toBeGreaterThan(
        Math.max(...pattern.shellMidi),
      );
    }
  });

  test("grades each transposition on its own pitches", () => {
    for (const pattern of COMPING_PATTERNS) {
      expect(run(pattern, perfectEvents(pattern)).correct, pattern.chord).toBe(true);
    }
  });
});

function note(midiNote: number, atMs: number): NoteOnEvent {
  return {
    type: "noteOn",
    midiNote,
    velocity: 0.8,
    source: "midi",
    instrument: "piano",
    timestamp: monotonicMs(atMs),
    clock: "performance",
  };
}
