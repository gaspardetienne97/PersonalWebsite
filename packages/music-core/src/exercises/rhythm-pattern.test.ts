import { describe, expect, test } from "vitest";

import { monotonicMs, type NoteEvent } from "@repo/music-core/domain";

import {
  createRhythmPatternExercise,
  RHYTHM_PATTERN_CATALOG,
  rhythmPatternDefinition,
} from "./rhythm-pattern";

const strum = (atMs: number, midiNote: number): NoteEvent => ({
  type: "noteOn",
  midiNote,
  velocity: 1,
  source: "audio",
  timestamp: monotonicMs(atMs),
  clock: "performance",
});

const tap = (atMs: number): NoteEvent => ({
  type: "onset",
  strength: 1,
  source: "onscreen",
  timestamp: monotonicMs(atMs),
  clock: "performance",
});

describe("rhythm pattern catalog", () => {
  test("lists the first generated rhythm pattern family", () => {
    expect(RHYTHM_PATTERN_CATALOG.map((pattern) => pattern.id)).toEqual([
      "quarter-pulse",
      "eighths",
      "sixteenths",
      "eighth-rests",
      "triplets",
      "off-beats",
      "dotted-quarters",
      "swing-eighths",
      "gap-click-1-on-1-off",
      "guitar-four-on-the-floor",
      "guitar-island-strum",
    ]);
    expect(rhythmPatternDefinition("gap-click-1-on-1-off").clickSchedule).toEqual([
      { bar: 0, audible: true },
      { bar: 1, audible: false },
    ]);
  });

  test("builds beat-relative targets, rests, and absolute expected times", () => {
    const exercise = createRhythmPatternExercise({
      patternId: "eighth-rests",
      bpm: 120,
      bars: 1,
      startTimestampMs: 1000,
    });
    const prompt = exercise.generate({ targetSkillIds: exercise.skillIds, difficulty: 0.4 });

    expect(prompt.id).toBe("rhythm-pattern-eighth-rests-120-1");
    expect(prompt.payload).toMatchObject({
      id: "eighth-rests",
      label: "Eighth-note rests",
      bpm: 120,
      meter: { beats: 4, beatUnit: 4 },
      bars: 1,
      rests: [
        { startBeat: 0.5, endBeat: 1 },
        { startBeat: 1.5, endBeat: 2 },
        { startBeat: 2.5, endBeat: 3 },
        { startBeat: 3.5, endBeat: 4 },
      ],
      expectedMs: [1000, 1500, 2000, 2500],
    });
    expect(prompt.payload.events.map((event) => event.beat)).toEqual([0, 1, 2, 3]);
  });

  test("off-beats taps the &s against a click and penalizes downbeat taps", () => {
    const definition = rhythmPatternDefinition("off-beats");
    expect(definition.events.map((event) => event.beat)).toEqual([0.5, 1.5, 2.5, 3.5]);
    expect(definition.clickSchedule).toEqual([{ bar: 0, audible: true }]);

    const exercise = createRhythmPatternExercise({ patternId: "off-beats", bpm: 120, bars: 1 });
    const ctx = { targetSkillIds: exercise.skillIds, difficulty: 0.4 };
    const run = exercise.createRun(exercise.generate(ctx), ctx);
    expect(exercise.skillIds).toContain("rhythm.syncopation");

    // Three clean &s at 250/750/1250ms, one classic failure ON the beat (1500ms).
    [250, 750, 1250, 1500].forEach((time) => run.accept(tap(time)));
    const result = run.finish({ reason: "completed" });

    // The downbeat tap is a rest hit — penalized, never credited to a nearby &.
    expect(result.answer).toMatchObject({ extraRestHits: 1, missedEvents: 1 });
    expect(result.correct).toBe(false);
  });

  test("dotted quarters displace over two bars with a full click", () => {
    const definition = rhythmPatternDefinition("dotted-quarters");
    expect(definition.defaultBars).toBe(2);
    expect(definition.events.map((event) => event.beat)).toEqual([0, 1.5, 3, 4.5, 6, 7.5]);
    expect(definition.clickSchedule).toEqual([
      { bar: 0, audible: true },
      { bar: 1, audible: true },
    ]);
  });

  test("swing eighths place the off-eighth at two-thirds of the beat", () => {
    const exercise = createRhythmPatternExercise({
      patternId: "swing-eighths",
      bpm: 120,
      bars: 1,
      startTimestampMs: 0,
    });
    const prompt = exercise.generate({ targetSkillIds: exercise.skillIds, difficulty: 0.4 });

    expect(exercise.skillIds).toContain("rhythm.swing");
    expect(prompt.payload.events.slice(0, 4).map((event) => event.beat)).toEqual([
      0,
      2 / 3,
      1,
      1 + 2 / 3,
    ]);
    // 120 BPM: beat = 500ms, swung off-eighth lands ~333ms after the beat.
    expect(prompt.payload.expectedMs.slice(0, 3).map(Math.round)).toEqual([0, 333, 500]);
  });

  test("repeats the gap-click schedule cyclically across extra bars", () => {
    const exercise = createRhythmPatternExercise({
      patternId: "gap-click-1-on-1-off",
      bpm: 100,
      bars: 4,
      startTimestampMs: 0,
    });
    const prompt = exercise.generate({ targetSkillIds: exercise.skillIds, difficulty: 0.4 });

    expect(prompt.payload.clickSchedule).toEqual([
      { bar: 0, audible: true },
      { bar: 1, audible: false },
      { bar: 2, audible: true },
      { bar: 3, audible: false },
    ]);
    // 4 bars of quarter notes = 16 targets, silent bars included.
    expect(prompt.payload.events).toHaveLength(16);
  });
});

describe("createRhythmPatternExercise", () => {
  test("scores accurate eighth-note taps highly", () => {
    const exercise = createRhythmPatternExercise({ patternId: "eighths", bpm: 120, bars: 1 });
    const ctx = { targetSkillIds: exercise.skillIds, difficulty: 0.4 };
    const prompt = exercise.generate(ctx);
    const run = exercise.createRun(prompt, ctx);

    expect(exercise.skillIds).toEqual(["rhythm.pattern.eighths", "rhythm.subdivision.eighths"]);
    [0, 250, 500, 750, 1000, 1250, 1500, 1750].forEach((time) => run.accept(tap(time)));
    const result = run.finish({ reason: "completed" });

    expect(result.correct).toBe(true);
    expect(result.answer).toMatchObject({
      missedEvents: 0,
      extraRestHits: 0,
      meanAbsoluteErrorMs: 0,
      meanSignedErrorMs: 0,
    });
    expect(result.metrics.filter((metric) => metric.kind === "timing")).toHaveLength(8);
  });

  test("penalizes extra hits inside rest windows", () => {
    const exercise = createRhythmPatternExercise({ patternId: "eighth-rests", bpm: 120, bars: 1 });
    const ctx = { targetSkillIds: exercise.skillIds, difficulty: 0.4 };
    const prompt = exercise.generate(ctx);
    const run = exercise.createRun(prompt, ctx);

    [0, 250, 500, 1000, 1500].forEach((time) => run.accept(tap(time)));
    const result = run.finish({ reason: "completed" });

    expect(result.correct).toBe(false);
    expect(result.answer).toMatchObject({
      extraRestHits: 1,
      missedEvents: 0,
    });
    expect(result.feedback[0]?.message).toContain("1 rest hit");
  });

  test("one missed tap doesn't cascade into misgrading every later hit", () => {
    const exercise = createRhythmPatternExercise({ patternId: "quarter-pulse", bpm: 120, bars: 1 });
    const ctx = { targetSkillIds: exercise.skillIds, difficulty: 0.4 };
    const prompt = exercise.generate(ctx);
    const run = exercise.createRun(prompt, ctx);

    // Miss beat 1 (500ms); the other three land dead on.
    [0, 1000, 1500].forEach((time) => run.accept(tap(time)));
    const result = run.finish({ reason: "completed" });

    // The three real hits match their own slots with 0 error — no fabricated
    // 999ms metrics, no shifted pairings.
    const timing = result.metrics.filter((metric) => metric.kind === "timing");
    expect(timing).toHaveLength(3);
    expect(timing.map((metric) => metric.errorMs)).toEqual([0, 0, 0]);
    expect(result.answer).toMatchObject({
      missedEvents: 1,
      extraHits: 0,
      meanAbsoluteErrorMs: 0,
      meanSignedErrorMs: 0,
    });
    // Exactly one miss penalty: 1 - 0.2.
    expect(result.score).toBeCloseTo(0.8, 5);
  });

  test("an empty performance scores zero instead of riding a 0ms 'error'", () => {
    const exercise = createRhythmPatternExercise({ patternId: "quarter-pulse", bpm: 120, bars: 1 });
    const ctx = { targetSkillIds: exercise.skillIds, difficulty: 0.4 };
    const run = exercise.createRun(exercise.generate(ctx), ctx);

    const result = run.finish({ reason: "completed" });

    expect(result.score).toBe(0);
    expect(result.answer?.missedEvents).toBe(4);
  });

  test("tags sixteenth-note and gap-click patterns with adaptive review skills", () => {
    expect(createRhythmPatternExercise({ patternId: "sixteenths", bpm: 100 }).skillIds).toContain(
      "rhythm.subdivision.sixteenths",
    );
    expect(
      createRhythmPatternExercise({ patternId: "gap-click-1-on-1-off", bpm: 100 }).skillIds,
    ).toContain("rhythm.gap-click");
  });
});

describe("guitar strum patterns", () => {
  test("G1 is sixteen downstrokes over D then A", () => {
    const definition = rhythmPatternDefinition("guitar-four-on-the-floor");

    expect(definition.defaultBars).toBe(4);
    expect(definition.events).toHaveLength(16);
    expect(definition.events.every((event) => event.stroke === "down")).toBe(true);
    expect(definition.events.map((event) => event.beat)).toEqual([
      0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15,
    ]);
    expect(definition.chords).toEqual([
      { symbol: "D", pitchClasses: [2, 6, 9], startBeat: 0, durationBeats: 8 },
      { symbol: "A", pitchClasses: [1, 4, 9], startBeat: 8, durationBeats: 8 },
    ]);
  });

  test("G2's bar is D DU (mute) UDU: 4.0 beats, six pitched strokes and one mute", () => {
    const definition = rhythmPatternDefinition("guitar-island-strum");
    const bar = definition.events.filter((event) => event.beat < 4);

    expect(bar.map((event) => [event.beat, event.stroke, event.durationBeats])).toEqual([
      [0, "down", 1],
      [1, "down", 0.5],
      [1.5, "up", 0.5],
      [2, "mute", 0.5],
      [2.5, "up", 0.5],
      [3, "down", 0.5],
      [3.5, "up", 0.5],
    ]);
    expect(bar.reduce((total, event) => total + (event.durationBeats ?? 0), 0)).toBe(4);
    expect(bar.filter((event) => event.stroke !== "mute")).toHaveLength(6);
    expect(bar.filter((event) => event.stroke === "mute")).toHaveLength(1);
    expect(definition.chords?.map((chord) => chord.symbol)).toEqual(["G", "C"]);
  });

  test("a mute is an onset accepted without a pitch", () => {
    const exercise = createRhythmPatternExercise({
      patternId: "guitar-island-strum",
      bpm: 60,
      bars: 1,
    });
    const ctx = { targetSkillIds: exercise.skillIds, difficulty: 0.4 };
    const prompt = exercise.generate(ctx);
    const run = exercise.createRun(prompt, ctx);

    // Pitched strokes carry a G major note; the mute is a bare onset.
    prompt.payload.events.forEach((event, index) => {
      const atMs = prompt.payload.expectedMs[index]!;
      run.accept(event.stroke === "mute" ? tap(atMs) : strum(atMs, 55));
    });

    const result = run.finish({ reason: "completed" });

    expect(result.answer?.missedEvents).toBe(0);
    expect(result.answer?.mutesMatched).toBe(1);
  });

  test("a strum that rings out on beat 3 is not credited as a mute", () => {
    const exercise = createRhythmPatternExercise({
      patternId: "guitar-island-strum",
      bpm: 60,
      bars: 1,
    });
    const ctx = { targetSkillIds: exercise.skillIds, difficulty: 0.4 };
    const prompt = exercise.generate(ctx);
    const run = exercise.createRun(prompt, ctx);

    // The microphone reports an onset and a pitch at every stroke, the mute
    // included — the player never damped the strings.
    prompt.payload.events.forEach((_event, index) => {
      const atMs = prompt.payload.expectedMs[index]!;
      run.accept(tap(atMs));
      run.accept(strum(atMs, 55));
    });

    const result = run.finish({ reason: "completed" });

    expect(result.answer?.mutesMatched).toBe(0);
  });

  test("says the chord is not verified when nothing pitched was heard", () => {
    const exercise = createRhythmPatternExercise({
      patternId: "guitar-four-on-the-floor",
      bpm: 60,
      bars: 4,
    });
    const ctx = { targetSkillIds: exercise.skillIds, difficulty: 0.4 };
    const prompt = exercise.generate(ctx);
    const run = exercise.createRun(prompt, ctx);

    prompt.payload.expectedMs.forEach((atMs) => run.accept(tap(atMs)));
    const result = run.finish({ reason: "completed" });

    expect(result.answer?.chordsVerified).toBe(false);
    expect(result.feedback.map((item) => item.message).join(" ")).toContain("chord not verified");
  });

  test("verifies each chord span from the pitches heard inside it", () => {
    const exercise = createRhythmPatternExercise({
      patternId: "guitar-four-on-the-floor",
      bpm: 60,
      bars: 4,
    });
    const ctx = { targetSkillIds: exercise.skillIds, difficulty: 0.4 };
    const prompt = exercise.generate(ctx);
    const run = exercise.createRun(prompt, ctx);

    // D major (50 57 62 66) for bars 1-2, A major (45 52 57 61 64) for bars 3-4.
    prompt.payload.expectedMs.forEach((atMs, index) => {
      const chord = index < 8 ? [50, 57, 62, 66] : [45, 52, 57, 61, 64];
      chord.forEach((midiNote, voice) => run.accept(strum(atMs + voice * 12, midiNote)));
    });

    const result = run.finish({ reason: "completed" });

    expect(result.answer?.chordsVerified).toBe(true);
    expect(result.answer?.chordGrades?.map((grade) => [grade.symbol, grade.matched])).toEqual([
      ["D", true],
      ["A", true],
    ]);
  });
});
