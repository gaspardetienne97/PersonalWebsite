import { describe, expect, test } from "vitest";

import { monotonicMs, type NoteEvent } from "@repo/music-core/domain";

import { RecordingSession } from "./index";

function noteOn(midiNote: number, atMs: number): NoteEvent {
  return {
    type: "noteOn",
    midiNote,
    velocity: 0.8,
    source: "midi",
    timestamp: monotonicMs(atMs),
    clock: "performance",
    instrument: "piano",
  };
}

describe("RecordingSession", () => {
  test("captures note-on events into a finalized take", () => {
    const session = new RecordingSession();
    expect(session.recording).toBe(false);

    session.start(1000);
    expect(session.recording).toBe(true);
    session.capture(noteOn(60, 1000));
    session.capture({ ...noteOn(60, 1100), type: "noteOff" } as NoteEvent);
    session.capture(noteOn(64, 1500));
    const take = session.stop(1600, "Take 1");

    expect(session.recording).toBe(false);
    expect(take.notes.map((note) => note.midi)).toEqual([60, 64]);
    expect(take.notes[0]?.atMs).toBe(0);
    expect(take.notes[1]?.atMs).toBe(500);
    expect(take.durationMs).toBe(600);
    expect(session.takes()).toHaveLength(1);
  });

  test("compares two takes by aligned pitch", () => {
    const session = new RecordingSession();
    session.start(0);
    [60, 64, 67].forEach((midi, i) => session.capture(noteOn(midi, i * 100)));
    const a = session.stop(300, "A");

    session.start(0);
    [60, 65, 67].forEach((midi, i) => session.capture(noteOn(midi, i * 100)));
    const b = session.stop(300, "B");

    const result = session.compare(a.id, b.id);
    expect(result.total).toBe(3);
    expect(result.matched).toBe(2);
    expect(result.accuracy).toBeCloseTo(2 / 3, 2);
  });

  test("removes a take", () => {
    const session = new RecordingSession();
    session.start(0);
    session.capture(noteOn(60, 0));
    const take = session.stop(100);
    session.remove(take.id);
    expect(session.takes()).toHaveLength(0);
  });
});
