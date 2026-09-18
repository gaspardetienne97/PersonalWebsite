import { describe, expect, test } from "vitest";

import { monotonicMs, type InputSource, type NoteEvent, type Score } from "@repo/music-core/domain";

import {
  beatToMs,
  createScoreFollower,
  expectedGroups,
  timingWindowMs,
  type ExpectedNoteGroup,
} from "./index";

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
    // Advancing clears the hold, so the next group starts from a clean slate.
    expect(run.getLiveState()).toMatchObject({
      progress: 1 / groups.length,
      currentGroupIndex: 1,
      expectedMidiNotes: [62],
      heldMidiNotes: [],
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

  test("wait mode shows a wrong note only while its own group is current", () => {
    const run = waitRun([group(0, [60]), group(1, [62])]);

    run.accept(noteOn(61));
    expect(run.getLiveState().wrongMidiNotes).toEqual([61]);

    run.accept(noteOff(61));
    run.accept(noteOn(60));

    // The keyboard and staff only ever show the current group's mistakes.
    expect(run.getLiveState()).toMatchObject({ currentGroupIndex: 1, wrongMidiNotes: [] });
    expect(run.getLiveState().feedback).toEqual([]);
    // The run still remembers the mis-hit for the result.
    expect(run.finish().answer?.wrongMidiNotes).toEqual([61]);
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

  test("wait mode waits for an extra note to be released before advancing", () => {
    const run = waitRun([group(0, [60, 64]), group(1, [65])]);

    run.accept(noteOn(67));
    run.accept(noteOn(60));
    run.accept(noteOn(64));
    expect(run.getLiveState()).toMatchObject({
      currentGroupIndex: 0,
      heldMidiNotes: [60, 64, 67],
      wrongMidiNotes: [67],
    });

    // Releasing the extra completes the chord within the same group.
    run.accept(noteOff(67));
    expect(run.getLiveState()).toMatchObject({ currentGroupIndex: 1, heldMidiNotes: [] });
  });

  test("wait mode never advances a later group from released leftovers", () => {
    const run = waitRun([group(0, [60, 62]), group(1, [60])]);

    run.accept(noteOn(60));
    run.accept(noteOn(62));
    expect(run.getLiveState()).toMatchObject({ currentGroupIndex: 1 });

    // 60 is still physically down; its release must not complete group 1.
    run.accept(noteOff(62));
    run.accept(noteOff(60));
    expect(run.getLiveState()).toMatchObject({ currentGroupIndex: 1, heldMidiNotes: [] });

    run.accept(noteOn(60));
    expect(run.getLiveState()).toMatchObject({ currentGroupIndex: 2 });
  });

  test("wait mode requires a fresh attack for a repeated group", () => {
    const run = waitRun([group(0, [60]), group(1, [60])]);

    run.accept(noteOn(60));
    expect(run.getLiveState()).toMatchObject({ currentGroupIndex: 1, heldMidiNotes: [] });

    run.accept(noteOn(60));
    expect(run.getLiveState()).toMatchObject({ currentGroupIndex: 2 });
  });

  test("wait mode drops the prior source's hold when another source takes over", () => {
    const run = waitRun([group(0, [60, 64])]);

    run.accept(noteOn(60, 0, "onscreen"));
    expect(run.getLiveState()).toMatchObject({ heldMidiNotes: [60] });

    // MIDI takes over: the on-screen hold is gone, so 64 alone cannot complete.
    run.accept(noteOn(64, 0, "midi"));
    expect(run.getLiveState()).toMatchObject({ currentGroupIndex: 0, heldMidiNotes: [64] });

    // ...and the abandoned on-screen release cannot erase the owner's hold.
    run.accept(noteOff(64, 0, "onscreen"));
    expect(run.getLiveState()).toMatchObject({ heldMidiNotes: [64] });

    run.accept(noteOn(60, 0, "midi"));
    expect(run.getLiveState()).toMatchObject({ currentGroupIndex: 1 });
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
    expect(result.answer).toMatchObject({
      matchedNotes: 5,
      expectedNotes: 5,
      missedNotes: 0,
      extraNotes: 0,
    });
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

  test("performance mode shows an extra note only until the player lands an expected one", () => {
    const groups = expectedGroups(polyphonicScore());
    const run = createScoreFollower(groups, {
      mode: "performance",
      bpm: 60,
      strictness: "normal",
      startTimestampMs: monotonicMs(10_000),
    });

    run.accept(noteOn(67, 10_000));
    expect(run.getLiveState().wrongMidiNotes).toEqual([67]);

    // Back on the score: the stale red must not sit over the notes still to come.
    run.accept(noteOn(48, 10_000));
    expect(run.getLiveState().wrongMidiNotes).toEqual([]);
    expect(run.finish().answer?.wrongMidiNotes).toEqual([67]);
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
      matchedNotes: 2,
      expectedNotes: 5,
      missedNotes: 3,
      extraNotes: 2,
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

  test("performance mode reports the groups that contain missed notes", () => {
    const groups = expectedGroups(polyphonicScore());
    const run = createScoreFollower(groups, {
      mode: "performance",
      bpm: 60,
      strictness: "normal",
      startTimestampMs: monotonicMs(10_000),
    });

    for (const midiNote of groups[0]!.midiNotes) run.accept(noteOn(midiNote, 10_000));
    run.accept(noteOn(64, 12_000));

    const result = run.finish();

    expect(result.answer?.missedGroups).toEqual([groups[1]]);
  });
});

function waitRun(groups: ExpectedNoteGroup[]) {
  return createScoreFollower(groups, { mode: "wait", bpm: 90, strictness: "normal" });
}

function group(index: number, midiNotes: number[]): ExpectedNoteGroup {
  return {
    id: `group:${index}`,
    startBeat: index,
    durationBeats: 1,
    midiNotes,
    sourceNoteIndexes: midiNotes.map((_, offset) => index * 10 + offset),
  };
}

function noteOn(midiNote: number, timestamp = 0, source: InputSource = "midi"): NoteEvent {
  return {
    type: "noteOn",
    midiNote,
    velocity: 1,
    source,
    timestamp: monotonicMs(timestamp),
    clock: "performance",
  };
}

function noteOff(midiNote: number, timestamp = 0, source: InputSource = "midi"): NoteEvent {
  return {
    type: "noteOff",
    midiNote,
    source,
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
