import { afterEach, describe, expect, test } from "vitest";

import { unixMs } from "@repo/music-core/domain";
import { PracticeDatabase, PracticeStore } from "@repo/music-core/engines/store";

import { SongLibrary, importedSongToScore, scorePlaybackPattern } from "./index";

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
    const score = importedSongToScore(importedSong("Pattern Test"), "song-pattern");

    expect(scorePlaybackPattern(score)).toEqual([
      { midiNotes: [60], offsetSeconds: 0, durationSeconds: 0.5 },
      { midiNotes: [64], offsetSeconds: 0.5, durationSeconds: 0.5 },
      { midiNotes: [67], offsetSeconds: 1, durationSeconds: 1 },
    ]);
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
