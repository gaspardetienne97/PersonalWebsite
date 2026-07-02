import { describe, expect, test } from "vitest";

import { monotonicMs, type NoteEvent } from "@repo/music-core/domain";

import { buildTakeDensity, RecordingSession, takeToScore } from "./index";

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

  test("restores persisted takes and keeps new ids unique", () => {
    const session = new RecordingSession();
    session.restore([
      {
        id: "take-2",
        name: "Take 2",
        source: "midi",
        notes: [{ midi: 60, atMs: 0, velocity: 0.8 }],
        durationMs: 100,
      },
    ]);
    expect(session.takes()).toHaveLength(1);

    session.start(0);
    session.capture(noteOn(64, 0));
    const next = session.stop(100);
    expect(next.id).toBe("take-3"); // counter advanced past the restored take-2
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

describe("takeToScore", () => {
  test("maps take timing to beats at the given tempo", () => {
    const session = new RecordingSession();
    session.start(0);
    session.capture(noteOn(60, 0)); // beat 0
    session.capture(noteOn(64, 500)); // half a beat at 120bpm = beat 1
    const take = session.stop(1000, "Riff");

    const score = takeToScore(take, 120);
    expect(score.origin).toBe("midi");
    expect(score.title).toBe("Riff");
    expect(score.tempoMap[0]?.bpm).toBe(120);
    expect(score.notes).toEqual([
      expect.objectContaining({ midiNote: 60, startBeat: 0, durationBeats: 0.5 }),
      expect.objectContaining({ midiNote: 64, startBeat: 1, durationBeats: 0.5 }),
    ]);
  });
});

describe("buildTakeDensity", () => {
  test("groups take notes into normalized timeline buckets", () => {
    const density = buildTakeDensity(
      {
        id: "take-1",
        name: "Take 1",
        source: "midi",
        durationMs: 4_000,
        notes: [
          { midi: 60, atMs: 0, velocity: 0.8 },
          { midi: 62, atMs: 800, velocity: 0.8 },
          { midi: 64, atMs: 2_100, velocity: 0.8 },
          { midi: 67, atMs: 3_900, velocity: 0.8 },
        ],
      },
      4,
    );

    expect(density).toEqual([
      expect.objectContaining({ index: 0, startMs: 0, endMs: 1_000, count: 2, intensity: 1 }),
      expect.objectContaining({ index: 1, startMs: 1_000, endMs: 2_000, count: 0, intensity: 0 }),
      expect.objectContaining({ index: 2, startMs: 2_000, endMs: 3_000, count: 1, intensity: 0.5 }),
      expect.objectContaining({ index: 3, startMs: 3_000, endMs: 4_000, count: 1, intensity: 0.5 }),
    ]);
  });
});
