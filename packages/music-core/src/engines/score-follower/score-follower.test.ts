import { describe, expect, test } from "vitest";

import { monotonicMs, type NoteEvent, type Score } from "@repo/music-core/domain";

import { createScoreFollower, expectedGroups } from "./index";

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
