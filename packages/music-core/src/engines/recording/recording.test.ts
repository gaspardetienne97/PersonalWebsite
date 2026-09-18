import { describe, expect, test } from "vitest";

import {
  monotonicMs,
  type InputSource,
  type NoteOffEvent,
  type NoteOnEvent,
} from "@repo/music-core/domain";

import { buildTakeDensity, buildTakeRoll, RecordingSession, takeToScore, type Take } from "./index";

function noteOn(midiNote: number, atMs: number, source: InputSource = "midi"): NoteOnEvent {
  return {
    type: "noteOn",
    midiNote,
    velocity: 0.8,
    source,
    timestamp: monotonicMs(atMs),
    clock: "performance",
    instrument: "piano",
  };
}

function noteOff(midiNote: number, atMs: number, source: InputSource = "midi"): NoteOffEvent {
  return {
    type: "noteOff",
    midiNote,
    source,
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
    session.capture(noteOff(60, 1100));
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

describe("note-off capture", () => {
  test("a held note yields its real duration", () => {
    const session = new RecordingSession();
    session.start(1_000);
    session.capture(noteOn(60, 1_000));
    session.capture(noteOff(60, 1_750));
    session.capture(noteOn(64, 1_800));
    const take = session.stop(2_000);

    expect(take.notes[0]?.durationMs).toBe(750);
    expect(take.notes[1]?.durationMs).toBeUndefined();

    const score = takeToScore(take, 120); // 500ms per beat
    expect(score.notes[0]?.durationBeats).toBe(1.5);
    expect(score.notes[1]?.durationBeats).toBe(0.5); // no note-off: the fixed default
  });

  test("ignores a note-off with no matching note-on and keeps the take's source", () => {
    const session = new RecordingSession();
    session.start(0);
    session.capture(noteOn(60, 0, "onscreen"));
    session.capture(noteOff(64, 50, "midi"));
    const take = session.stop(100);

    expect(take.source).toBe("onscreen");
    expect(take.notes).toHaveLength(1);
    expect(take.notes[0]?.durationMs).toBeUndefined();
  });

  test("floors an instant note-off at a hundredth of a beat", () => {
    const session = new RecordingSession();
    session.start(0);
    session.capture(noteOn(60, 0));
    session.capture(noteOff(60, 0));
    const take = session.stop(100);

    expect(take.notes[0]?.durationMs).toBe(0);
    expect(takeToScore(take, 120).notes[0]?.durationBeats).toBe(0.01);
  });

  test("matches a note-off to the most recent note-on of that pitch", () => {
    const session = new RecordingSession();
    session.start(0);
    session.capture(noteOn(60, 0));
    session.capture(noteOn(60, 100));
    session.capture(noteOff(60, 400));
    const take = session.stop(500);

    expect(take.notes.map((note) => note.durationMs)).toEqual([undefined, 300]);
  });
});

describe("take naming", () => {
  test("renames a take and keeps the name across a reload", () => {
    const session = new RecordingSession();
    session.start(0);
    session.capture(noteOn(60, 0));
    const take = session.stop(100);

    session.renameTake(take.id, "  Bridge idea  ");
    session.setTakeNote(take.id, "left hand drags");
    expect(session.take(take.id)?.name).toBe("Bridge idea");
    expect(session.take(take.id)?.note).toBe("left hand drags");

    const reloaded = new RecordingSession();
    reloaded.restore(session.takes());
    expect(reloaded.take(take.id)?.name).toBe("Bridge idea");
    expect(reloaded.take(take.id)?.note).toBe("left hand drags");
  });

  test("ignores a blank rename and clears an emptied note", () => {
    const session = new RecordingSession();
    session.start(0);
    session.capture(noteOn(60, 0));
    const take = session.stop(100);

    session.setTakeNote(take.id, "worth keeping");
    session.renameTake(take.id, "   ");
    session.setTakeNote(take.id, "  ");

    expect(session.take(take.id)?.name).toBe(take.name);
    expect(session.take(take.id)?.note).toBeUndefined();
  });
});

describe("buildTakeRoll", () => {
  const take: Take = {
    id: "take-1",
    name: "Take 1",
    source: "midi",
    durationMs: 1_000,
    notes: [
      { midi: 48, atMs: 0, velocity: 0.8, durationMs: 500 },
      { midi: 72, atMs: 500, velocity: 0.8 },
    ],
  };

  test("places notes in a unit box with a middle-C guide and a hand per register", () => {
    const roll = buildTakeRoll(take);

    expect(roll.notes).toHaveLength(2);
    expect(roll.notes[0]).toEqual(
      expect.objectContaining({ x: 0, width: 0.5, hand: "left", midi: 48 }),
    );
    expect(roll.notes[1]).toEqual(expect.objectContaining({ x: 0.5, hand: "right", midi: 72 }));
    // The C4 guide sits halfway through a 48-72 range drawn low pitch at the bottom.
    expect(roll.middleCY).toBeCloseTo(0.5, 5);
    expect(roll.notes[0]!.y).toBeGreaterThan(roll.notes[1]!.y);
    for (const note of roll.notes) {
      expect(note.y).toBeGreaterThanOrEqual(0);
      expect(note.y + note.height).toBeLessThanOrEqual(1);
      expect(note.x + note.width).toBeLessThanOrEqual(1);
    }
  });

  test("gives a note without a note-off a visible minimum width", () => {
    const roll = buildTakeRoll(take);
    expect(roll.notes[1]!.width).toBeGreaterThan(0);
    expect(roll.notes[1]!.width).toBeLessThan(0.2);
  });

  test("returns no notes for an empty take", () => {
    expect(buildTakeRoll({ ...take, notes: [] }).notes).toEqual([]);
  });

  test("keeps a note struck on the last millisecond visible", () => {
    const roll = buildTakeRoll({
      ...take,
      durationMs: 1_000,
      notes: [{ midi: 60, atMs: 1_000, velocity: 0.8 }],
    });

    expect(roll.notes[0]!.width).toBeGreaterThan(0);
    expect(roll.notes[0]!.x + roll.notes[0]!.width).toBeLessThanOrEqual(1);
  });

  test("fills the box for a single-pitch take", () => {
    const roll = buildTakeRoll({ ...take, notes: [{ midi: 55, atMs: 0, velocity: 0.8 }] });

    expect(roll.lowMidi).toBe(55);
    expect(roll.highMidi).toBe(55);
    expect(roll.notes[0]).toEqual(expect.objectContaining({ y: 0, height: 1 }));
  });

  test("puts middle C itself in the right hand", () => {
    const roll = buildTakeRoll({
      ...take,
      notes: [
        { midi: 59, atMs: 0, velocity: 0.8 },
        { midi: 60, atMs: 10, velocity: 0.8 },
      ],
    });

    expect(roll.notes.map((note) => note.hand)).toEqual(["left", "right"]);
  });

  test("drops the middle-C guide when middle C is outside the take", () => {
    const bass = buildTakeRoll({
      ...take,
      notes: [
        { midi: 36, atMs: 0, velocity: 0.8 },
        { midi: 55, atMs: 10, velocity: 0.8 },
      ],
    });
    const treble = buildTakeRoll({
      ...take,
      notes: [
        { midi: 72, atMs: 0, velocity: 0.8 },
        { midi: 84, atMs: 10, velocity: 0.8 },
      ],
    });

    expect(bass.middleCY).toBeUndefined();
    expect(treble.middleCY).toBeUndefined();
    expect(buildTakeRoll(take).middleCY).toBeCloseTo(0.5, 5);
  });
});
