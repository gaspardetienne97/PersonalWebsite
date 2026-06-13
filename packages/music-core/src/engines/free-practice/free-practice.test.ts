import { describe, expect, test } from "vitest";
import {
  monotonicMs,
  unixMs,
  type InputSource,
  type NoteEvent,
} from "@repo/music-core/domain";
import { FreePracticeSession } from "./index";

const note = (
  midiNote: number,
  source: InputSource,
  at: number,
  velocity = 0.75,
): NoteEvent => ({
  type: "noteOn",
  midiNote,
  velocity,
  source,
  timestamp: monotonicMs(at),
  clock: "performance",
  instrument: "piano",
});

describe("FreePracticeSession", () => {
  test.each([
    ["startedAt", Number.NaN, 100],
    ["startedAt", Number.POSITIVE_INFINITY, 100],
    ["startedAt", Number.NEGATIVE_INFINITY, 100],
    ["startedAtMonotonic", 1_000, Number.NaN],
    ["startedAtMonotonic", 1_000, Number.POSITIVE_INFINITY],
    ["startedAtMonotonic", 1_000, Number.NEGATIVE_INFINITY],
  ])("rejects non-finite constructor timestamp %s", (field, startedAt, startedAtMonotonic) => {
    expect(
      () =>
        new FreePracticeSession({
          id: "practice-invalid-start",
          instrument: "piano",
          startedAt: unixMs(startedAt),
          startedAtMonotonic: monotonicMs(startedAtMonotonic),
        }),
    ).toThrow(field);
  });

  test("aggregates notes and exposes only immutable copies of the latest eight", () => {
    const session = new FreePracticeSession({
      id: "practice-1",
      instrument: "piano",
      startedAt: unixMs(1_000),
      startedAtMonotonic: monotonicMs(100),
    });

    for (let index = 0; index < 10; index += 1) {
      session.accept(
        note(60 + (index % 4), index % 2 === 0 ? "onscreen" : "midi", 110 + index),
      );
    }

    const state = session.state;
    expect(state).toMatchObject({
      id: "practice-1",
      status: "recording",
      instrument: "piano",
      startedAt: 1_000,
      noteCount: 10,
      distinctNoteCount: 4,
      lowestMidiNote: 60,
      highestMidiNote: 63,
      sourceCounts: { midi: 5, onscreen: 5 },
    });
    expect(state.recentNotes).toEqual([
      { midiNote: 62, velocity: 0.75, source: "onscreen", offsetMs: 12 },
      { midiNote: 63, velocity: 0.75, source: "midi", offsetMs: 13 },
      { midiNote: 60, velocity: 0.75, source: "onscreen", offsetMs: 14 },
      { midiNote: 61, velocity: 0.75, source: "midi", offsetMs: 15 },
      { midiNote: 62, velocity: 0.75, source: "onscreen", offsetMs: 16 },
      { midiNote: 63, velocity: 0.75, source: "midi", offsetMs: 17 },
      { midiNote: 60, velocity: 0.75, source: "onscreen", offsetMs: 18 },
      { midiNote: 61, velocity: 0.75, source: "midi", offsetMs: 19 },
    ]);

    state.recentNotes.length = 0;
    state.sourceCounts.midi = 99;
    expect(session.state.recentNotes).toHaveLength(8);
    expect(session.state.sourceCounts.midi).toBe(5);

    const nextState = session.state;
    nextState.recentNotes[0]!.midiNote = 0;
    expect(session.state.recentNotes[0]!.midiNote).toBe(62);
  });

  test("ignores non-note events and invalid note-on events", () => {
    const session = new FreePracticeSession({
      id: "practice-2",
      instrument: "piano",
      startedAt: unixMs(1_000),
      startedAtMonotonic: monotonicMs(100),
    });

    session.accept(note(60, "midi", 99));
    session.accept(note(-1, "midi", 120));
    session.accept(note(128, "midi", 120));
    session.accept(note(60, "midi", 120, Number.NaN));
    session.accept(note(60, "midi", 120, Number.POSITIVE_INFINITY));
    session.accept({
      type: "noteOff",
      midiNote: 60,
      source: "midi",
      timestamp: monotonicMs(120),
      clock: "performance",
    });

    expect(session.state).toMatchObject({
      noteCount: 0,
      distinctNoteCount: 0,
      sourceCounts: {},
      recentNotes: [],
    });
    expect(session.state.lowestMidiNote).toBeUndefined();
    expect(session.state.highestMidiNote).toBeUndefined();
  });

  test.each([Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY])(
    "ignores note-on events with non-finite timestamp %s",
    (timestamp) => {
      const session = new FreePracticeSession({
        id: "practice-invalid-timestamp",
        instrument: "piano",
        startedAt: unixMs(1_000),
        startedAtMonotonic: monotonicMs(100),
      });

      session.accept(note(60, "midi", timestamp));

      expect(session.state.noteCount).toBe(0);
      expect(session.state.recentNotes).toEqual([]);
    },
  );

  test("stops once with a stable wall-clock result and rejects later activity", () => {
    const session = new FreePracticeSession({
      id: "practice-3",
      instrument: "guitar",
      startedAt: unixMs(1_000),
      startedAtMonotonic: monotonicMs(100),
    });
    session.accept(note(64, "onscreen", 150));

    const result = session.stop(unixMs(4_000));
    expect(result).toMatchObject({
      id: "practice-3",
      status: "stopped",
      endedAt: 4_000,
      durationMs: 3_000,
      noteCount: 1,
    });
    expect(session.state.status).toBe("stopped");
    expect(session.result).toEqual(result);

    result.recentNotes.length = 0;
    result.sourceCounts.onscreen = 99;
    expect(session.state.recentNotes).toHaveLength(1);
    expect(session.state.sourceCounts.onscreen).toBe(1);

    const retainedResult = session.result!;
    retainedResult.recentNotes[0]!.midiNote = 0;
    retainedResult.sourceCounts.onscreen = 99;
    expect(session.result!.recentNotes[0]!.midiNote).toBe(64);
    expect(session.result!.sourceCounts.onscreen).toBe(1);
    expect(() => session.stop(unixMs(5_000))).toThrow("already stopped");
    expect(() => session.accept(note(65, "midi", 160))).toThrow("already stopped");

    const clampedSession = new FreePracticeSession({
      id: "practice-4",
      instrument: "piano",
      startedAt: unixMs(5_000),
      startedAtMonotonic: monotonicMs(200),
    });
    expect(clampedSession.stop(unixMs(4_000)).durationMs).toBe(0);
  });

  test.each([Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY])(
    "rejects non-finite endedAt %s without stopping the session",
    (endedAt) => {
      const session = new FreePracticeSession({
        id: "practice-invalid-end",
        instrument: "piano",
        startedAt: unixMs(1_000),
        startedAtMonotonic: monotonicMs(100),
      });

      expect(session.result).toBeUndefined();
      expect(() => session.stop(unixMs(endedAt))).toThrow("endedAt");
      expect(session.state.status).toBe("recording");
      expect(session.result).toBeUndefined();

      session.accept(note(60, "midi", 120));
      expect(session.stop(unixMs(2_000))).toMatchObject({
        status: "stopped",
        durationMs: 1_000,
        noteCount: 1,
      });
    },
  );
});
