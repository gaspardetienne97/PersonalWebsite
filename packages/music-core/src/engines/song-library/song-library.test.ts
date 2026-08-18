import { afterEach, describe, expect, test } from "vitest";

import { unixMs } from "@repo/music-core/domain";
import { scoreFromImportedSong } from "@repo/music-core/engines/score-import";
import { PracticeDatabase, PracticeStore } from "@repo/music-core/engines/store";

import { SongLibrary, beatAtSeconds, scorePlaybackPattern, secondsAtBeat } from "./index";

const databases: PracticeDatabase[] = [];

afterEach(async () => {
  await Promise.all(databases.map((database) => database.delete()));
  databases.length = 0;
});

function createStore(): PracticeStore {
  const database = new PracticeDatabase(`song-library-${crypto.randomUUID()}`);
  databases.push(database);
  return new PracticeStore(database);
}

describe("SongLibrary", () => {
  test("saves imported songs as domain scores and lists newest first", async () => {
    const store = createStore();
    const library = new SongLibrary(store, {
      makeId: () => "song-autumn",
      now: () => unixMs(2_000),
    });

    const saved = await library.saveImportedSong(importedSong("Autumn Leaves"));

    expect(saved).toMatchObject({
      id: "song-autumn",
      title: "Autumn Leaves",
      createdAt: unixMs(2_000),
      updatedAt: unixMs(2_000),
    });
    expect(saved.score?.origin).toBe("midi");
    expect(saved.score?.notes).toHaveLength(3);
    expect(saved.score?.tempoMap[0]?.bpm).toBe(120);

    await new SongLibrary(store, {
      makeId: () => "song-blue",
      now: () => unixMs(3_000),
    }).saveImportedSong(importedSong("Blue Bossa"));

    expect((await library.list()).map((song) => song.title)).toEqual([
      "Blue Bossa",
      "Autumn Leaves",
    ]);
    await expect(library.get("song-autumn")).resolves.toEqual(saved);
  });

  test("projects a stored score into a playback pattern", () => {
    const score = scoreFromImportedSong(importedSong("Pattern Test"), "song-pattern");

    expect(scorePlaybackPattern(score)).toEqual([
      { midiNotes: [60], offsetSeconds: 0, durationSeconds: 0.5 },
      { midiNotes: [64], offsetSeconds: 0.5, durationSeconds: 0.5 },
      { midiNotes: [67], offsetSeconds: 1, durationSeconds: 1 },
    ]);
  });

  test("projects playback timing across tempo-map changes", () => {
    const score = scoreFromImportedSong(importedSong("Tempo Map"), "tempo-map");
    score.tempoMap = [
      { atBeat: 0, bpm: 120 },
      { atBeat: 4, bpm: 60 },
    ];
    score.notes = [
      { midiNote: 60, startBeat: 0, durationBeats: 2, velocity: 0.8, voiceId: "voice-1" },
      { midiNote: 67, startBeat: 4, durationBeats: 2, velocity: 0.8, voiceId: "voice-1" },
    ];

    expect(scorePlaybackPattern(score)).toEqual([
      { midiNotes: [60], offsetSeconds: 0, durationSeconds: 1 },
      { midiNotes: [67], offsetSeconds: 2, durationSeconds: 2 },
    ]);
  });

  test("beatAtSeconds inverts the scheduler's projection across a tempo marker", () => {
    const tempoMap = [
      { atBeat: 0, bpm: 120 },
      { atBeat: 4, bpm: 60 },
    ];

    // Same seconds the pattern scheduler used, back to the same beats.
    for (const beat of [0, 1, 3.5, 4, 6, 9.25]) {
      expect(beatAtSeconds(secondsAtBeat(beat, tempoMap), tempoMap)).toBeCloseTo(beat, 9);
    }
    // 0.5 s/beat before the marker, 1 s/beat after it.
    expect(beatAtSeconds(1, tempoMap)).toBeCloseTo(2, 9);
    expect(beatAtSeconds(2, tempoMap)).toBeCloseTo(4, 9);
    expect(beatAtSeconds(3.5, tempoMap)).toBeCloseTo(5.5, 9);
    // A position sampled before the scheduled start never runs backwards.
    expect(beatAtSeconds(-0.75, tempoMap)).toBe(0);
    expect(beatAtSeconds(0, [])).toBe(0);
  });

  test("persists a canonical score with its original MusicXML source", async () => {
    const store = createStore();
    const library = new SongLibrary(store, {
      makeId: () => "song-musicxml",
      now: () => unixMs(4_000),
    });
    const score = scoreFromImportedSong(importedSong("MusicXML Study"), "preview-id");
    score.origin = "musicxml";
    const source = {
      format: "musicxml" as const,
      content: '<score-partwise version="4.0"/>',
    };

    const saved = await library.saveScore(score, source);

    expect(saved.id).toBe("song-musicxml");
    expect(saved.score?.id).toBe("song-musicxml");
    expect(saved.source).toEqual(source);
    await expect(library.get("song-musicxml")).resolves.toEqual(saved);
  });
});

function importedSong(name: string) {
  return {
    name,
    durationSec: 2,
    bpm: 120,
    timeSignature: [4, 4] as [number, number],
    totalNotes: 3,
    keyEstimate: "C major",
    tracks: [
      {
        name: "Piano",
        notes: [
          { midi: 60, time: 0, duration: 0.5, velocity: 0.8 },
          { midi: 64, time: 0.5, duration: 0.5, velocity: 0.7 },
          { midi: 67, time: 1, duration: 1, velocity: 0.9 },
        ],
      },
    ],
  };
}
