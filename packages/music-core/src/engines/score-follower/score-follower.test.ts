import { describe, expect, test } from "vitest";

import { monotonicMs, type NoteEvent, type Score } from "@repo/music-core/domain";

import { beatToMs, createScoreFollower, expectedGroups, timingWindowMs } from "./index";

describe("music-core/score-follower", () => {
  test("groups simultaneous score notes into expected note groups", () => {
    const groups = expectedGroups(polyphonicScore());

    expect(groups[0]).toMatchObject({
      id: "group:0",
      startBeat: 0,
      durationBeats: 1,
      midiNotes: [48, 60, 64],
      sourceNoteIndexes: [0, 1, 2],
    });
    expect(groups.map(({ startBeat }) => startBeat)).toEqual([0, 1, 2]);
  });

  test("wait mode advances only when the full expected group is held together", () => {
    const groups = expectedGroups(polyphonicScore());
    const run = createScoreFollower(groups, { mode: "wait", bpm: 90, strictness: "normal" });

    run.accept(noteOn(48));
    run.accept(noteOn(60));
    expect(run.getLiveState()).toMatchObject({
      progress: 0,
      currentGroupIndex: 0,
      expectedMidiNotes: [48, 60, 64],
      heldMidiNotes: [48, 60],
    });

    run.accept(noteOn(64));
    expect(run.getLiveState()).toMatchObject({
      progress: 1 / groups.length,
      currentGroupIndex: 1,
      expectedMidiNotes: [62],
      heldMidiNotes: [48, 60, 64],
    });
  });

  test("wait mode reports wrong notes without advancing", () => {
    const groups = expectedGroups(polyphonicScore());
    const run = createScoreFollower(groups, { mode: "wait", bpm: 90, strictness: "normal" });

    run.accept(noteOn(61));

    const state = run.getLiveState();
    expect(state.progress).toBe(0);
    expect(state.currentGroupIndex).toBe(0);
    expect(state.wrongMidiNotes).toEqual([61]);
    expect(state.feedback[0]).toMatchObject({
      severity: "error",
      message: "Wrong note: 61.",
    });

    const result = run.finish();
    expect(result.correct).toBe(false);
    expect(result.response).toEqual({ midiNotes: [61] });
    expect(
      result.input.map((event) => (event.type === "noteOn" ? event.midiNote : undefined)),
    ).toEqual([61]);
  });

  test("wait mode requires a group to be held simultaneously", () => {
    const [group] = expectedGroups(polyphonicScore());
    const run = createScoreFollower([group!], { mode: "wait", bpm: 90, strictness: "normal" });

    for (const midiNote of [48, 60, 64]) {
      run.accept(noteOn(midiNote));
      run.accept(noteOff(midiNote));
    }

    expect(run.getLiveState()).toMatchObject({
      progress: 0,
      currentGroupIndex: 0,
      heldMidiNotes: [],
      wrongMidiNotes: [],
    });
  });

  test("adapts timing windows to tempo, note value, and strictness", () => {
    expect(beatToMs(2, 120)).toBe(1_000);
    expect(timingWindowMs({ bpm: 60, durationBeats: 1, strictness: "normal" })).toBeGreaterThan(
      timingWindowMs({ bpm: 120, durationBeats: 1, strictness: "normal" }),
    );
    expect(timingWindowMs({ bpm: 120, durationBeats: 2, strictness: "normal" })).toBeGreaterThan(
      timingWindowMs({ bpm: 120, durationBeats: 1, strictness: "normal" }),
    );
    expect(timingWindowMs({ bpm: 120, durationBeats: 1, strictness: "relaxed" })).toBeGreaterThan(
      timingWindowMs({ bpm: 120, durationBeats: 1, strictness: "strict" }),
    );
  });

  test("performance mode gives exact full credit to a perfectly timed phrase", () => {
    const groups = expectedGroups(polyphonicScore());
    const run = createScoreFollower(groups, {
      mode: "performance",
      bpm: 60,
      strictness: "normal",
      startTimestampMs: monotonicMs(10_000),
    });

    run.accept(noteOn(48, 10_000));
    run.accept(noteOn(60, 10_000));
    run.accept(noteOn(64, 10_000));
    run.accept(noteOn(62, 11_000));
    run.accept(noteOn(64, 12_000));

    const result = run.finish();
    expect(result.correct).toBe(true);
    expect(result.score).toBe(1);
    expect(result.metrics).toEqual([
      { kind: "pitch", expectedMidi: 48, actualMidi: 48 },
      { kind: "timing", expectedMs: 10_000, actualMs: 10_000, errorMs: 0 },
      { kind: "pitch", expectedMidi: 60, actualMidi: 60 },
      { kind: "timing", expectedMs: 10_000, actualMs: 10_000, errorMs: 0 },
      { kind: "pitch", expectedMidi: 64, actualMidi: 64 },
      { kind: "timing", expectedMs: 10_000, actualMs: 10_000, errorMs: 0 },
      { kind: "pitch", expectedMidi: 62, actualMidi: 62 },
      { kind: "timing", expectedMs: 11_000, actualMs: 11_000, errorMs: 0 },
      { kind: "pitch", expectedMidi: 64, actualMidi: 64 },
      { kind: "timing", expectedMs: 12_000, actualMs: 12_000, errorMs: 0 },
    ]);
  });

  test("performance mode scores wrong, missed, extra, early, and late notes below perfect", () => {
    const groups = expectedGroups(polyphonicScore());
    const run = createScoreFollower(groups, {
      mode: "performance",
      bpm: 60,
      strictness: "normal",
      startTimestampMs: monotonicMs(10_000),
    });

    run.accept(noteOn(48, 9_930));
    run.accept(noteOn(60, 10_080));
    run.accept(noteOn(67, 10_000));
    run.accept(noteOn(62, 11_500));
    run.accept(noteOn(70, 12_000));

    const result = run.finish();
    expect(result.correct).toBe(false);
    expect(result.score).toBeGreaterThan(0);
    expect(result.score).toBeLessThan(1);
    expect(result.answer).toMatchObject({
      completedGroups: 1,
      wrongMidiNotes: [67, 70],
    });
    expect(result.metrics).toContainEqual({
      kind: "timing",
      expectedMs: 10_000,
      actualMs: 9_930,
      errorMs: -70,
    });
    expect(result.metrics).toContainEqual({
      kind: "timing",
      expectedMs: 10_000,
      actualMs: 10_080,
      errorMs: 80,
    });
    expect(result.metrics).toContainEqual({ kind: "pitch", expectedMidi: 62 });
    expect(result.feedback).toContainEqual({
      severity: "error",
      message: "Missed notes: 62, 64.",
    });
    expect(result.feedback).toContainEqual({
      severity: "warn",
      message: "Extra notes: 67, 70.",
    });
  });
});

function noteOn(midiNote: number, timestamp = 0): NoteEvent {
  return {
    type: "noteOn",
    midiNote,
    velocity: 1,
    source: "midi",
    timestamp: monotonicMs(timestamp),
    clock: "performance",
  };
}

function noteOff(midiNote: number, timestamp = 0): NoteEvent {
  return {
    type: "noteOff",
    midiNote,
    source: "midi",
    timestamp: monotonicMs(timestamp),
    clock: "performance",
  };
}

function polyphonicScore(): Score {
  return {
    id: "polyphonic",
    origin: "generated",
    keySignature: "C major",
    tempoMap: [{ atBeat: 0, bpm: 90 }],
    timeSignatures: [{ atBeat: 0, numerator: 4, denominator: 4 }],
    voices: [
      { id: "right-hand", name: "Right Hand", role: "melody" },
      { id: "left-hand", name: "Left Hand", role: "bass" },
    ],
    notes: [
      {
        midiNote: 60,
        startBeat: 0,
        durationBeats: 1,
        velocity: 0.8,
        voiceId: "right-hand",
      },
      {
        midiNote: 64,
        startBeat: 0,
        durationBeats: 1,
        velocity: 0.8,
        voiceId: "right-hand",
      },
      {
        midiNote: 48,
        startBeat: 0,
        durationBeats: 1,
        velocity: 0.7,
        voiceId: "left-hand",
      },
      {
        midiNote: 62,
        startBeat: 1,
        durationBeats: 1,
        velocity: 0.8,
        voiceId: "right-hand",
      },
      {
        midiNote: 64,
        startBeat: 2,
        durationBeats: 1,
        velocity: 0.8,
        voiceId: "right-hand",
      },
    ],
    chords: [],
    sections: [],
    markers: [],
  };
}
