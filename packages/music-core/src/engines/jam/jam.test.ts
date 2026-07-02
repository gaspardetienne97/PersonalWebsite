import { describe, expect, test } from "vitest";

import { monotonicMs, type NoteEvent } from "@repo/music-core/domain";

import {
  JAM_PROGRESSIONS,
  JamSession,
  normalizeChordProgressionDrillConfig,
  normalizeJamPracticeConfig,
  targetTones,
} from "./index";

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

describe("normalizeChordProgressionDrillConfig", () => {
  test("restores and clamps shareable chord progression drill config", () => {
    const params = new URLSearchParams("progression=minor-ii-v-i&bpm=236");

    expect(normalizeChordProgressionDrillConfig(params)).toEqual({
      progressionId: "minor-ii-v-i",
      bpm: 220,
    });
  });

  test("falls back to defaults for unknown progression and invalid tempo", () => {
    expect(
      normalizeChordProgressionDrillConfig({
        progression: "unknown",
        bpm: "fast",
      }),
    ).toEqual({
      progressionId: JAM_PROGRESSIONS[0]!.id,
      bpm: 90,
    });
  });
});

describe("normalizeJamPracticeConfig", () => {
  const drumOptions = {
    drumTrackIds: ["swing-125", "ballad-65"],
    defaultDrumTrackId: "swing-125",
  };

  test("restores and clamps shareable jam config", () => {
    const params = new URLSearchParams("progression=blues&backing=chords&bpm=236&drums=ballad-65");

    expect(normalizeJamPracticeConfig(params, drumOptions)).toEqual({
      progressionId: "blues",
      backingMode: "chords",
      drumTrackId: "ballad-65",
      bpm: 220,
    });
  });

  test("falls back to defaults for unknown jam config values", () => {
    expect(
      normalizeJamPracticeConfig(
        {
          progression: "missing",
          backing: "noise",
          drums: "unknown",
          tempo: "fast",
        },
        drumOptions,
      ),
    ).toEqual({
      progressionId: JAM_PROGRESSIONS[0]!.id,
      backingMode: "drums",
      drumTrackId: "swing-125",
      bpm: 96,
    });
  });
});
