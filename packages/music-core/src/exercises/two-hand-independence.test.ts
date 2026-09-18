import { describe, expect, test } from "vitest";

import { monotonicMs, type NoteOnEvent } from "@repo/music-core/domain";

import { createTwoHandIndependenceExercise, type TwoHandLiveState } from "./two-hand-independence";

describe("createTwoHandIndependenceExercise", () => {
  test("builds a steady LH pulse against a faster RH line", () => {
    const exercise = createTwoHandIndependenceExercise({
      tonic: "C4",
      bpm: 120,
      bars: 1,
    });
    const prompt = exercise.generate({
      targetSkillIds: exercise.skillIds,
      difficulty: 0.4,
    });

    // 1 bar of 4/4: LH one root per beat, RH two notes per beat.
    expect(prompt.payload.leftMidiNotes).toEqual([36, 36, 36, 36]);
    expect(prompt.payload.rightMidiNotes).toHaveLength(8);
    expect(prompt.payload.rightMidiNotes.slice(0, 4)).toEqual([60, 62, 64, 65]);
    expect(prompt.payload.splitMidi).toBe(48);
    expect(prompt.payload.beatMs).toBe(500);
    expect(prompt.payload.patternKind).toBe("lh-pulse-rh-line");
    expect(prompt.payload.targetEvents.slice(0, 3)).toEqual([
      { hand: "left", midiNote: 36, beat: 0 },
      { hand: "right", midiNote: 60, beat: 0 },
      { hand: "right", midiNote: 62, beat: 0.5 },
    ]);
  });

  test("builds role-swap and shell-line patterns with explicit hand lanes", () => {
    const roleSwap = createTwoHandIndependenceExercise({
      tonic: "C4",
      bpm: 120,
      bars: 1,
      patternKind: "rh-pulse-lh-line",
    });
    expect(roleSwap.skillIds).not.toContain("technique.piano.independence.shell-line");
    const roleSwapPrompt = roleSwap.generate({ targetSkillIds: [], difficulty: 0.4 }).payload;

    expect(roleSwapPrompt.leftMidiNotes.slice(0, 4)).toEqual([36, 38, 40, 41]);
    expect(roleSwapPrompt.rightMidiNotes).toEqual([60, 60, 60, 60]);
    expect(roleSwapPrompt.targetEvents.filter((event) => event.hand === "right")).toHaveLength(4);

    const shellExercise = createTwoHandIndependenceExercise({
      tonic: "C4",
      bpm: 120,
      bars: 1,
      patternKind: "lh-shell-rh-line",
    });
    const shell = shellExercise.generate({ targetSkillIds: [], difficulty: 0.4 }).payload;

    expect(shellExercise.skillIds).toContain("technique.piano.independence.shell-line");
    expect(shell.leftMidiNotes.slice(0, 4)).toEqual([36, 43, 46, 43]);
    expect(shell.rightMidiNotes.slice(0, 4)).toEqual([60, 62, 64, 67]);
    expect(shell.label).toContain("Shell + line");
  });

  test("contrary motion descends the major scale in key", () => {
    const prompt = createTwoHandIndependenceExercise({
      tonic: "C4",
      bpm: 120,
      bars: 1,
      patternKind: "contrary-motion-scale",
    }).generate({ targetSkillIds: [], difficulty: 0.4 }).payload;

    // LH ascends C major from C2 (36): C D E F G A B C…
    expect(prompt.leftMidiNotes.slice(0, 8)).toEqual([36, 38, 40, 41, 43, 45, 47, 47]);
    // RH descends C major from C5 (72): C B A G F E D — all diatonic, no ♭s.
    expect(prompt.rightMidiNotes.slice(0, 7)).toEqual([72, 71, 69, 67, 65, 64, 62]);
    // Both hands move together on the same eighth-note grid.
    const beatZero = prompt.targetEvents.filter((event) => event.beat === 0);
    expect(beatZero).toEqual([
      { hand: "left", midiNote: 36, beat: 0 },
      { hand: "right", midiNote: 72, beat: 0 },
    ]);
  });

  test("can isolate the left-hand lane for focused practice", () => {
    const prompt = createTwoHandIndependenceExercise({
      tonic: "C4",
      bpm: 120,
      bars: 1,
      patternKind: "alberti-rh-holds",
      handMode: "left",
    }).generate({ targetSkillIds: [], difficulty: 0.4 }).payload;

    expect(prompt.handMode).toBe("left");
    expect(prompt.leftMidiNotes).toEqual([36, 43, 40, 43, 36, 43, 40, 43]);
    expect(prompt.rightMidiNotes).toEqual([]);
    expect(prompt.targetEvents.every((event) => event.hand === "left")).toBe(true);
  });

  test("scores a clean two-hand performance as correct", () => {
    const exercise = createTwoHandIndependenceExercise({
      tonic: "C4",
      bpm: 120,
      bars: 1,
    });
    const context = { targetSkillIds: exercise.skillIds, difficulty: 0.4 };
    const prompt = exercise.generate(context);
    const run = exercise.createRun(prompt, context);

    const { leftMidiNotes, rightMidiNotes, beatMs } = prompt.payload;
    leftMidiNotes.forEach((midi, index) => run.accept(note(midi, index * beatMs)));
    rightMidiNotes.forEach((midi, index) => run.accept(note(midi, index * (beatMs / 2))));
    const result = run.finish({ reason: "completed" });

    expect(result.correct).toBe(true);
    expect(result.answer).toMatchObject({ leftAccuracy: 1, rightAccuracy: 1 });
  });

  test("a hand playing the wrong notes drags only its own accuracy down", () => {
    const exercise = createTwoHandIndependenceExercise({
      tonic: "C4",
      bpm: 120,
      bars: 1,
    });
    const context = { targetSkillIds: exercise.skillIds, difficulty: 0.4 };
    const prompt = exercise.generate(context);
    const run = exercise.createRun(prompt, context);

    const { leftMidiNotes, rightMidiNotes, beatMs } = prompt.payload;
    // Left hand clean; right hand plays every note a semitone sharp (still in RH register).
    leftMidiNotes.forEach((midi, index) => run.accept(note(midi, index * beatMs)));
    rightMidiNotes.forEach((midi, index) => run.accept(note(midi + 1, index * (beatMs / 2))));
    const result = run.finish({ reason: "completed" });

    expect(result.answer).toMatchObject({ leftAccuracy: 1, rightAccuracy: 0 });
    expect(result.correct).toBe(false);
    expect(result.feedback[0]?.message).toContain("LH 4/4");
  });

  test("scores an isolated hand without requiring the muted lane", () => {
    const exercise = createTwoHandIndependenceExercise({
      tonic: "C4",
      bpm: 120,
      bars: 1,
      patternKind: "alberti-rh-holds",
      handMode: "left",
    });
    const context = { targetSkillIds: exercise.skillIds, difficulty: 0.4 };
    const prompt = exercise.generate(context);
    const run = exercise.createRun(prompt, context);

    prompt.payload.leftMidiNotes.forEach((midi, index) => run.accept(note(midi, index * 250)));
    const result = run.finish({ reason: "completed" });

    expect(result.correct).toBe(true);
    expect(result.answer).toMatchObject({ leftAccuracy: 1, rightAccuracy: 1 });
    expect(result.target?.midiNotes).toEqual(prompt.payload.leftMidiNotes);
  });

  test("dynamics mode rewards the melody hand playing louder", () => {
    const exercise = createTwoHandIndependenceExercise({
      tonic: "C4",
      bpm: 120,
      bars: 1,
      dynamics: true,
    });
    const context = { targetSkillIds: exercise.skillIds, difficulty: 0.4 };
    const prompt = exercise.generate(context);

    expect(prompt.payload.dynamics).toBe(true);
    expect(prompt.payload.melodyHand).toBe("right"); // RH carries the line here
    expect(prompt.payload.label).toContain("dynamics");

    // Melody sings out: RH at 0.9, LH accompaniment at 0.4.
    const loud = exercise.createRun(prompt, context);
    const { leftMidiNotes, rightMidiNotes, beatMs } = prompt.payload;
    leftMidiNotes.forEach((midi, index) => loud.accept(note(midi, index * beatMs, 0.4)));
    rightMidiNotes.forEach((midi, index) => loud.accept(note(midi, index * (beatMs / 2), 0.9)));
    const loudResult = loud.finish({ reason: "completed" });

    expect(loudResult.correct).toBe(true);
    expect(loudResult.answer?.dynamicsContrast).toBeCloseTo(0.5, 5);
    expect(loudResult.feedback.some(({ message }) => message.includes("louder"))).toBe(true);

    // Same notes at a flat touch: pitch-perfect but no contrast — not correct.
    const flat = exercise.createRun(prompt, context);
    leftMidiNotes.forEach((midi, index) => flat.accept(note(midi, index * beatMs)));
    rightMidiNotes.forEach((midi, index) => flat.accept(note(midi, index * (beatMs / 2))));
    const flatResult = flat.finish({ reason: "completed" });

    expect(flatResult.answer?.dynamicsContrast).toBeCloseTo(0, 5);
    expect(flatResult.correct).toBe(false);
    expect(flatResult.score).toBeLessThan(loudResult.score);
  });

  test("dynamics is forced off when a single hand is isolated", () => {
    const prompt = createTwoHandIndependenceExercise({
      tonic: "C4",
      bpm: 120,
      bars: 1,
      handMode: "left",
      dynamics: true,
    }).generate({ targetSkillIds: [], difficulty: 0.4 });

    expect(prompt.payload.dynamics).toBe(false);
    expect(prompt.payload.label).not.toContain("dynamics");
  });
});

describe("contrary-five (P1 Mirror hands)", () => {
  const exercise = createTwoHandIndependenceExercise({
    tonic: "C4",
    bpm: 60,
    bars: 2,
    patternKind: "contrary-five",
  });
  const prompt = exercise.generate({ targetSkillIds: [], difficulty: 0.4 }).payload;

  test("walks the hands outward and back from the C3 / C4 thumbs", () => {
    expect(prompt.rightMidiNotes).toEqual([60, 62, 64, 65, 67, 65, 64, 62]);
    expect(prompt.leftMidiNotes).toEqual([48, 47, 45, 43, 41, 43, 45, 47]);
    expect(prompt.targetEvents.map((event) => event.beat)).toEqual([
      0, 0, 1, 1, 2, 2, 3, 3, 4, 4, 5, 5, 6, 6, 7, 7,
    ]);
    expect(prompt.splitMidi).toBe(54);
    expect(prompt.patternLabel).toBe("Mirror hands");
  });

  test("shows the same finger number in both hands on every beat", () => {
    const fingers = (hand: "left" | "right") =>
      prompt.targetEvents.filter((event) => event.hand === hand).map((event) => event.finger);
    expect(fingers("right")).toEqual([1, 2, 3, 4, 5, 4, 3, 2]);
    expect(fingers("left")).toEqual(fingers("right"));
  });

  test("counts a beat as together within the window and not beyond it", () => {
    const beatMs = prompt.beatMs;
    const play = (offsets: number[]) => {
      const run = exercise.createRun(exercise.generate({ targetSkillIds: [], difficulty: 0.4 }), {
        targetSkillIds: [],
        difficulty: 0.4,
      });
      prompt.leftMidiNotes.forEach((pitch, beat) => run.accept(midiNote(pitch, beat * beatMs)));
      prompt.rightMidiNotes.forEach((pitch, beat) =>
        run.accept(midiNote(pitch, beat * beatMs + offsets[beat]!)),
      );
      return run.finish().answer;
    };

    const onTime = play([40, 40, 40, 40, 40, 40, 40, 40]);
    expect(onTime!.togetherBeats).toBe(8);
    expect(onTime!.togetherTotal).toBe(8);

    const late = play([40, 60, 40, 60, 40, 60, 40, 60]);
    expect(late!.togetherBeats).toBe(4);
  });

  test("a dropped left-hand note costs its own beat, not every beat after it", () => {
    const beatMs = prompt.beatMs;
    const context = { targetSkillIds: [], difficulty: 0.4 };
    const run = exercise.createRun(exercise.generate(context), context);
    prompt.leftMidiNotes.forEach((pitch, beat) => {
      if (beat === 2) return; // the left hand misses beat 3 entirely
      run.accept(midiNote(pitch, beat * beatMs));
    });
    prompt.rightMidiNotes.forEach((pitch, beat) => run.accept(midiNote(pitch, beat * beatMs + 10)));
    const answer = run.finish().answer!;
    expect(answer.togetherBeats).toBe(7);
    expect(answer.togetherTotal).toBe(8);
  });

  test("does not measure together when every note came from the on-screen keyboard", () => {
    const beatMs = prompt.beatMs;
    const context = { targetSkillIds: [], difficulty: 0.4 };
    const run = exercise.createRun(exercise.generate(context), context);
    // Perfectly simultaneous taps, which an on-screen keyboard cannot actually produce.
    prompt.leftMidiNotes.forEach((pitch, beat) => run.accept(note(pitch, beat * beatMs)));
    prompt.rightMidiNotes.forEach((pitch, beat) => run.accept(note(pitch, beat * beatMs)));
    const result = run.finish();
    expect(result.answer!.togetherBeats).toBeUndefined();
    expect(result.feedback.map((item) => item.message).join(" ")).toContain(
      "Together not measured — an on-screen keyboard plays one hand at a time.",
    );
  });

  test("leaves the other patterns without a together readout", () => {
    const context = { targetSkillIds: [], difficulty: 0.4 };
    const pulse = createTwoHandIndependenceExercise({ tonic: "C4", bpm: 60, bars: 1 });
    const run = pulse.createRun(pulse.generate(context), context);
    run.accept(midiNote(36, 0));
    run.accept(midiNote(60, 10));
    const result = run.finish();
    expect(result.answer!.togetherBeats).toBeUndefined();
    expect(result.feedback.map((item) => item.message).join(" ")).not.toContain("Together");
  });

  test("reports per-beat together flags live", () => {
    const run = exercise.createRun(exercise.generate({ targetSkillIds: [], difficulty: 0.4 }), {
      targetSkillIds: [],
      difficulty: 0.4,
    });
    run.accept(midiNote(48, 0));
    run.accept(midiNote(60, 30));
    run.accept(midiNote(47, prompt.beatMs));
    run.accept(midiNote(62, prompt.beatMs + 100));
    expect((run.getLiveState() as TwoHandLiveState).togetherFlags).toEqual([true, false]);
  });

  test("does not measure together on a single-hand run", () => {
    const rightOnly = createTwoHandIndependenceExercise({
      tonic: "C4",
      bpm: 60,
      bars: 2,
      patternKind: "contrary-five",
      handMode: "right",
    });
    const context = { targetSkillIds: [], difficulty: 0.4 };
    const run = rightOnly.createRun(rightOnly.generate(context), context);
    prompt.rightMidiNotes.forEach((pitch, beat) =>
      run.accept(midiNote(pitch, beat * prompt.beatMs)),
    );
    const result = run.finish();
    expect(result.answer!.togetherBeats).toBeUndefined();
    expect((run.getLiveState() as TwoHandLiveState).togetherFlags).toBeUndefined();
    expect(result.feedback.map((item) => item.message).join(" ")).toContain(
      "Together not measured",
    );
  });
});

/** MIDI is the only source that can show two hands arriving together. */
function midiNote(pitch: number, atMs: number): NoteOnEvent {
  return { ...note(pitch, atMs), source: "midi" };
}

function note(midiNote: number, atMs: number, velocity = 1): NoteOnEvent {
  return {
    type: "noteOn",
    midiNote,
    velocity,
    source: "onscreen",
    instrument: "piano",
    timestamp: monotonicMs(atMs),
    clock: "performance",
  };
}
