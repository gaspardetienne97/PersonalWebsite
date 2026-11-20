import { describe, expect, it } from "vite-plus/test";
import type { Score } from "@repo/music-core";
import { scoreToMidi } from "@repo/music-core/io/midi-file";
import {
  importScoreFile,
  keyName,
  plainTeaches,
  scoreFacts,
  shelfTags,
  songHistory,
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
      /isn't a score Woodshed can read/,
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

it("names minor keys", () => {
  expect(keyName({ keyFifths: -3, keyMode: "minor" })).toBe("C minor");
  expect(keyName({})).toBeNull();
});

describe("songHistory", () => {
  const run = (
    song: string,
    score: number | undefined,
    endedAt: number,
    extra: Record<string, string> = {},
  ) => ({
    exerciseId: "song.studio",
    params: { song, ...extra },
    endedAt,
    score,
  });
  it("reads the best score and the last run for one song, shelf runs included", () => {
    const runs = [
      run("a", 0.8, 10),
      run("a", 0.93, 20),
      run("b", 1, 30),
      run("old", undefined, 40, { shelf: "piano/ode" }),
      { exerciseId: "ear.intervals", params: { song: "a" }, endedAt: 50, score: 1 },
    ];
    expect(songHistory(runs, { id: "a" })).toEqual({ runs: 2, best: 0.93, lastAt: 20 });
    expect(songHistory(runs, { id: "x", shelf: "piano/ode" })).toEqual({
      runs: 1,
      best: null,
      lastAt: 40,
    });
    expect(songHistory([], { id: "a" })).toEqual({ runs: 0, best: null, lastAt: null });
  });
});

describe("shelf cards", () => {
  it("tag each song from its own data", () => {
    expect(shelfTags({ detail: "F, 74", bpm: 74, diff: 1 })).toEqual([
      "Key of F",
      "74 BPM",
      "Easier",
    ]);
    expect(shelfTags({ detail: "A minor, 3/4", diff: 3 })).toEqual(["Key of A minor", "Harder"]);
    expect(shelfTags({ detail: "Capo 1, 102 BPM", bpm: 102, diff: 2 })).toEqual([
      "102 BPM",
      "Medium",
    ]);
  });
  it("spell out the hands, in sentence case", () => {
    expect(plainTeaches("RH broken chords, LH root")).toBe(
      "Right hand broken chords, left hand root",
    );
    expect(plainTeaches("6/8 ballad feel")).toBe("6/8 ballad feel");
  });
});
