import { Midi } from "@tonejs/midi";
import { describe, expect, test } from "vitest";

import type { ImportedSong } from "@repo/music-core/engines/import";

import { parseMidiScore, scoreFromImportedSong } from "./index";

describe("scoreFromImportedSong", () => {
  test("preserves beat-native timing maps and classifies track roles", () => {
    const song = {
      name: "Tempo Study",
      durationSec: 4,
      bpm: 120,
      timeSignature: [4, 4],
      tempoMap: [
        { atBeat: 0, bpm: 120 },
        { atBeat: 4, bpm: 90 },
      ],
      timeSignatures: [
        { atBeat: 0, numerator: 4, denominator: 4 },
        { atBeat: 8, numerator: 3, denominator: 4 },
      ],
      totalNotes: 2,
      tracks: [
        {
          name: "Lead",
          notes: [
            {
              midi: 60,
              time: 0,
              duration: 0.5,
              velocity: 0.8,
              startBeat: 0,
              durationBeats: 1,
            },
          ],
        },
        {
          name: "Bass",
          notes: [
            {
              midi: 36,
              time: 2,
              duration: 1,
              velocity: 0.7,
              startBeat: 4,
              durationBeats: 2,
            },
          ],
        },
      ],
    } satisfies ImportedSong;

    const score = scoreFromImportedSong(song, "score-1");

    expect(score.tempoMap).toEqual(song.tempoMap);
    expect(score.timeSignatures).toEqual(song.timeSignatures);
    expect(score.voices.map(({ role }) => role)).toEqual(["melody", "bass"]);
    expect(
      score.notes.map(({ startBeat, durationBeats }) => ({ startBeat, durationBeats })),
    ).toEqual([
      { startBeat: 0, durationBeats: 1 },
      { startBeat: 4, durationBeats: 2 },
    ]);
    expect(score.sections[0]?.endBeat).toBe(6);
  });

  test("converts legacy second timing using the starting tempo", () => {
    const score = scoreFromImportedSong(
      {
        name: "Legacy Import",
        durationSec: 2,
        bpm: 120,
        timeSignature: [4, 4],
        totalNotes: 1,
        tracks: [
          {
            name: "Piano",
            notes: [{ midi: 60, time: 0.5, duration: 1, velocity: 0.8 }],
          },
        ],
      },
      "legacy",
    );

    expect(score.notes[0]).toMatchObject({ startBeat: 1, durationBeats: 2 });
    expect(score.sections[0]?.endBeat).toBe(4);
  });

  test("accepts reactive proxy timing arrays from UI state", () => {
    const tempoMap = new Proxy([{ atBeat: 0, bpm: 100 }], {});
    const timeSignatures = new Proxy([{ atBeat: 0, numerator: 4, denominator: 4 }], {});

    expect(() =>
      scoreFromImportedSong(
        {
          name: "Reactive Import",
          durationSec: 1,
          bpm: 100,
          timeSignature: [4, 4],
          tempoMap,
          timeSignatures,
          totalNotes: 0,
          tracks: [],
        },
        "reactive",
      ),
    ).not.toThrow();
  });
});

describe("parseMidiScore", () => {
  test("parses raw MIDI directly into the canonical Score model", () => {
    const midi = new Midi();
    midi.name = "Direct Import";
    midi.header.setTempo(96);
    const track = midi.addTrack();
    track.name = "Melody";
    track.addNote({ midi: 64, ticks: 0, durationTicks: midi.header.ppq, velocity: 0.75 });

    const score = parseMidiScore(new Uint8Array(midi.toArray()).buffer as ArrayBuffer, {
      id: "direct",
      fallbackName: "Fallback",
    });

    expect(score).toMatchObject({
      id: "direct",
      title: "Direct Import",
      origin: "midi",
      voices: [{ name: "Melody", role: "melody" }],
      notes: [{ midiNote: 64, startBeat: 0, durationBeats: 1 }],
    });
    expect(score.notes[0]?.velocity).toBeCloseTo(0.75, 2);
  });
});
