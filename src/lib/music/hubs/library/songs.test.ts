import { describe, expect, it } from "vitest";
import type { Score } from "@repo/music-core";
import { scoreToMidi } from "@repo/music-core/io/midi-file";
import {
  importScoreFile,
  keyName,
  rowsToScore,
  scoreFacts,
  scoreToRows,
  songSections,
} from "./songs";

import odeXml from "../../../../../e2e/music/fixtures/ode-to-joy.musicxml?raw";

const ode = new TextEncoder().encode(odeXml);

const tiny: Score = {
  id: "t",
  title: "Tiny",
  bpm: 100,
  meter: { beats: 4, beatUnit: 4 },
  voices: [
    {
      id: "a",
      name: "A",
      notes: [60, 62, 64].map((midi, i) => ({ midi, startBeat: i, durationBeats: 1 })),
    },
  ],
  lengthBeats: 4,
};

describe("importScoreFile", () => {
  it("reads uncompressed MusicXML with its metadata", async () => {
    const s = await importScoreFile("ode.musicxml", ode);
    expect(s.title).toBe("Ode to Joy");
    expect(s.bpm).toBe(96);
    const f = scoreFacts(s);
    expect(f).toMatchObject({ bars: 4, notes: 15, voices: 1, meter: "4/4", key: "C major" });
  });

  it("reads MIDI and names an untitled file after itself", async () => {
    const bytes = scoreToMidi({ ...tiny, title: "" });
    const s = await importScoreFile("my riff.mid", bytes);
    expect(s.title).toBe("my riff");
    expect(scoreFacts(s).notes).toBe(3);
  });

  it("refuses other formats with a plain sentence", async () => {
    await expect(importScoreFile("song.mp3", new Uint8Array([1]))).rejects.toThrow(
      /not a score this app can read/,
    );
  });
});

describe("songSections", () => {
  it("falls back to four-bar phrases", () => {
    const s = { ...tiny, lengthBeats: 24 };
    expect(songSections(s).map((x) => x.label)).toEqual(["Bars 1 to 4", "Bars 5 to 6"]);
    expect(songSections(s)[1]).toMatchObject({ startBeat: 16, endBeat: 24 });
  });
  it("keeps the score's own sections", () => {
    const sections = [{ label: "A", startBeat: 0, endBeat: 4 }];
    expect(songSections({ ...tiny, sections })).toBe(sections);
  });
});

describe("note rows", () => {
  it("round-trips and drops invalid rows", () => {
    const rows = [
      ...scoreToRows(tiny),
      { midi: 200, startBeat: 0, durationBeats: 1 },
      { midi: 65, startBeat: 3, durationBeats: 0 },
    ];
    const s = rowsToScore(rows, "", 90);
    expect(s.voices[0].notes.map((n) => n.midi)).toEqual([60, 62, 64]);
    expect(s.title).toBe("Transcription");
    expect(s.lengthBeats).toBe(4);
  });
});

it("names minor keys", () => {
  expect(keyName({ keyFifths: -3, keyMode: "minor" })).toBe("C minor");
  expect(keyName({})).toBeNull();
});
