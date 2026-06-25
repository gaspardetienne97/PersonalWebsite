import { describe, expect, test } from "vitest";

import type { Score } from "@repo/music-core/domain";
import { parseMidiScore } from "@repo/music-core/engines/score-import";

import { scoreToMidiBlob, scoreToMidiFile } from "./index";

function score(overrides: Partial<Score> = {}): Score {
  return {
    id: "src",
    title: "Round Trip",
    origin: "generated",
    tempoMap: [{ atBeat: 0, bpm: 96 }],
    timeSignatures: [{ atBeat: 0, numerator: 4, denominator: 4 }],
    voices: [
      { id: "lead", name: "Lead", role: "melody" },
      { id: "bass", name: "Bass", role: "bass" },
    ],
    notes: [
      { midiNote: 64, startBeat: 0, durationBeats: 1, velocity: 0.75, voiceId: "lead" },
      { midiNote: 67, startBeat: 1, durationBeats: 2, velocity: 0.9, voiceId: "lead" },
      { midiNote: 40, startBeat: 0, durationBeats: 4, velocity: 0.6, voiceId: "bass" },
    ],
    chords: [],
    sections: [],
    markers: [],
    ...overrides,
  };
}

describe("scoreToMidiFile", () => {
  test("round-trips notes, timing, and tempo back through the MIDI parser", () => {
    const bytes = scoreToMidiFile(score());
    const reparsed = parseMidiScore(bytes.buffer as ArrayBuffer, { id: "out" });

    expect(reparsed.tempoMap[0]?.bpm).toBeCloseTo(96, 0);
    expect(reparsed.voices.map((voice) => voice.name)).toEqual(["Lead", "Bass"]);

    const byNote = reparsed.notes
      .map((note) => ({
        midiNote: note.midiNote,
        startBeat: note.startBeat,
        durationBeats: note.durationBeats,
      }))
      .sort((a, b) => a.midiNote - b.midiNote);
    expect(byNote).toEqual([
      { midiNote: 40, startBeat: 0, durationBeats: 4 },
      { midiNote: 64, startBeat: 0, durationBeats: 1 },
      { midiNote: 67, startBeat: 1, durationBeats: 2 },
    ]);
  });

  test("emits a non-empty audio/midi blob", async () => {
    const blob = scoreToMidiBlob(score());
    expect(blob.type).toBe("audio/midi");
    expect(blob.size).toBeGreaterThan(0);
    // valid SMF header
    const head = new Uint8Array(await blob.arrayBuffer()).slice(0, 4);
    expect(String.fromCharCode(...head)).toBe("MThd");
  });

  test("falls back to a single track when the score has no voices", () => {
    const bytes = scoreToMidiFile(
      score({
        voices: [],
        notes: [{ midiNote: 60, startBeat: 0, durationBeats: 1, velocity: 0.8, voiceId: "x" }],
      }),
    );
    const reparsed = parseMidiScore(bytes.buffer as ArrayBuffer, { id: "out" });
    expect(reparsed.notes.map((note) => note.midiNote)).toEqual([60]);
  });
});
