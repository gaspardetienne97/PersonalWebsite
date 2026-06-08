import { describe, expect, test } from "vitest";

import { monotonicMs, type NoteEvent } from "@repo/music-core/domain";

import { JAM_PROGRESSIONS, JamSession, targetTones } from "./index";

function note(midiNote: number): NoteEvent {
  return {
    type: "noteOn",
    midiNote,
    velocity: 1,
    source: "onscreen",
    timestamp: monotonicMs(0),
    clock: "performance",
    instrument: "piano",
  };
}

describe("targetTones", () => {
  test("labels chord tones, scale tones, and avoid notes", () => {
    const tones = targetTones("Dm7", "D dorian");
    expect(tones).toHaveLength(12);
    const role = (pc: number) => tones.find((tone) => tone.pitchClass === pc)?.role;
    // D F A C are chord tones (pitch classes 2,5,9,0)
    expect(role(2)).toBe("chord");
    expect(role(5)).toBe("chord");
    expect(role(0)).toBe("chord");
    // E and G are scale (dorian) but not chord tones (4, 7)
    expect(role(4)).toBe("scale");
    expect(role(7)).toBe("scale");
    // C# (1) is outside D dorian
    expect(role(1)).toBe("avoid");
  });
});

describe("JamSession", () => {
  test("loops through the progression", () => {
    const session = new JamSession(JAM_PROGRESSIONS[0]!);
    const first = session.current.symbol;
    const length = session.progression.chords.length;
    for (let i = 0; i < length; i += 1) session.advance();
    expect(session.current.symbol).toBe(first);
    expect(session.index).toBe(0);
  });

  test("exposes the next chord", () => {
    const session = new JamSession(JAM_PROGRESSIONS[0]!);
    expect(session.next.symbol).toBe(session.progression.chords[1]!.symbol);
  });

  test("captures only note-on events for the solo", () => {
    const session = new JamSession(JAM_PROGRESSIONS[0]!);
    session.record(note(60));
    session.record({
      type: "noteOff",
      midiNote: 60,
      source: "onscreen",
      timestamp: monotonicMs(0),
      clock: "performance",
      instrument: "piano",
    });
    session.record(note(64));
    expect(session.recorded().map((event) => event.midiNote)).toEqual([60, 64]);
    session.clearRecording();
    expect(session.recorded()).toHaveLength(0);
  });
});
