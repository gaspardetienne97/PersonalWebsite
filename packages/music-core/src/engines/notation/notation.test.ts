import { describe, expect, test } from "vitest";

import type { Score } from "@repo/music-core/domain";
import { noteToMidi } from "@repo/music-core/engines/theory";

import { enharmonicEqual, notationView, spellMidiForKey, writtenPitchName } from "./index";

const ALL_KEYS = [
  "C major",
  "G major",
  "D major",
  "A major",
  "E major",
  "B major",
  "F# major",
  "C# major",
  "F major",
  "Bb major",
  "Eb major",
  "Ab major",
  "Db major",
  "Gb major",
  "Cb major",
  "A minor",
  "E minor",
  "B minor",
  "F# minor",
  "C# minor",
  "G# minor",
  "D# minor",
  "A# minor",
  "D minor",
  "G minor",
  "C minor",
  "F minor",
  "Bb minor",
  "Eb minor",
  "Ab minor",
] as const;

describe("music-core/notation", () => {
  test("spells sounding pitches for sharp and flat key contexts", () => {
    expect(spellMidiForKey(66, "Gb major")).toEqual({ step: "G", accidental: "b", octave: 4 });
    expect(spellMidiForKey(66, "F# major")).toEqual({ step: "F", accidental: "#", octave: 4 });
  });

  test("produces valid written pitches in every major and minor key", () => {
    for (const key of ALL_KEYS) {
      for (const midi of [48, 54, 60, 66, 72]) {
        const written = spellMidiForKey(midi, key);
        expect(noteToMidi(writtenPitchName(written, true))).toBe(midi);
      }
    }
  });

  test("compares enharmonic note names without requiring identical spelling", () => {
    expect(enharmonicEqual("F#", "Gb")).toBe(true);
    expect(enharmonicEqual("B#", "C")).toBe(true);
    expect(enharmonicEqual("F#", "G")).toBe(false);
  });

  test("groups grand-staff voices, rests, ties, tuplets, and measures", () => {
    const view = notationView(grandStaffScore());

    expect(view.staves.map(({ clef }) => clef)).toEqual(["treble", "bass"]);
    expect(view.measures).toHaveLength(2);
    expect(view.measures[0]?.events).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          kind: "note",
          voiceId: "right-hand",
          staff: "treble",
          pitches: [{ step: "F", accidental: "#", octave: 4 }],
          duration: "q",
        }),
        expect.objectContaining({
          kind: "note",
          voiceId: "left-hand",
          staff: "bass",
          pitches: [{ step: "C", octave: 3 }],
          duration: "h",
        }),
        expect.objectContaining({
          kind: "rest",
          voiceId: "left-hand",
          staff: "bass",
          duration: "h",
        }),
      ]),
    );
    expect(view.measures[0]?.tuplets).toContainEqual({ id: "triplet-1", actual: 3, normal: 2 });
    expect(view.measures[0]?.ties).toContainEqual({ id: "tie-1", start: true });
    expect(view.measures[1]?.ties).toContainEqual({ id: "tie-1", stop: true });
  });

  test("rejects durations that cannot be represented by the notation contract", () => {
    const score = grandStaffScore();
    score.notes[0]!.durationBeats = 0.2;

    expect(() => notationView(score)).toThrow("Unsupported notation duration");
  });
});

function grandStaffScore(): Score {
  return {
    id: "grand-staff",
    origin: "generated",
    keySignature: "F# major",
    tempoMap: [{ atBeat: 0, bpm: 96 }],
    timeSignatures: [{ atBeat: 0, numerator: 4, denominator: 4 }],
    voices: [
      { id: "right-hand", name: "Right Hand", role: "melody" },
      { id: "left-hand", name: "Left Hand", role: "bass" },
    ],
    notes: [
      {
        midiNote: 66,
        writtenPitch: { step: "F", accidental: "#", octave: 4 },
        startBeat: 0,
        durationBeats: 1,
        velocity: 0.8,
        voiceId: "right-hand",
        tie: { id: "tie-1", start: true },
      },
      {
        midiNote: 67,
        writtenPitch: { step: "G", accidental: "natural", octave: 4 },
        startBeat: 1,
        durationBeats: 1 / 3,
        velocity: 0.8,
        voiceId: "right-hand",
        tuplet: { id: "triplet-1", actual: 3, normal: 2 },
      },
      {
        midiNote: 48,
        writtenPitch: { step: "C", octave: 3 },
        startBeat: 0,
        durationBeats: 2,
        velocity: 0.7,
        voiceId: "left-hand",
      },
      {
        midiNote: 66,
        writtenPitch: { step: "F", accidental: "#", octave: 4 },
        startBeat: 4,
        durationBeats: 1,
        velocity: 0.8,
        voiceId: "right-hand",
        tie: { id: "tie-1", stop: true },
      },
    ],
    rests: [{ startBeat: 2, durationBeats: 2, voiceId: "left-hand" }],
    chords: [],
    sections: [],
    markers: [],
  };
}
