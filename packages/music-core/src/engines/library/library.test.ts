import { afterEach, describe, expect, test } from "vitest";

import { PracticeDatabase, PracticeStore } from "@repo/music-core/engines/store";

import { TheoryLibrary } from "./index";

const databases: PracticeDatabase[] = [];

afterEach(async () => {
  await Promise.all(databases.map((database) => database.delete()));
  databases.length = 0;
});

function createStore(): PracticeStore {
  const database = new PracticeDatabase(`theory-library-${crypto.randomUUID()}`);
  databases.push(database);
  return new PracticeStore(database);
}

describe("music-core/library", () => {
  test("projects Cmaj7 into notes, intervals, piano notes, and string voicings", () => {
    const library = new TheoryLibrary();

    expect(library.get("c-maj7")).toMatchObject({
      id: "c-maj7",
      kind: "chord",
      name: "C major seventh",
      symbol: "Cmaj7",
      notes: ["C", "E", "G", "B"],
      intervals: ["P1", "M3", "P5", "M7"],
      pianoMidi: [60, 64, 67, 71],
    });
    expect(library.get("c-maj7")?.voicings.guitar.length).toBeGreaterThan(0);
    expect(library.get("c-maj7")?.voicings.ukulele.length).toBeGreaterThan(0);
  });

  test("searches aliases and respects the selected kind", () => {
    const library = new TheoryLibrary();

    expect(library.search("major seven", "chord").map((item) => item.id)).toContain("c-maj7");
    expect(library.search("dorian", "scale").map((item) => item.id)).toContain("d-dorian");
    expect(library.search("major seven", "scale")).toEqual([]);
  });

  test("loads, saves, and removes chords through the practice store", async () => {
    const store = createStore();
    const library = new TheoryLibrary(store);

    await library.save("c-maj7");
    expect(library.isSaved("c-maj7")).toBe(true);
    await expect(store.chordLibrary.get("c-maj7")).resolves.toMatchObject({
      id: "c-maj7",
      symbol: "Cmaj7",
      notes: ["C", "E", "G", "B"],
      tags: ["theory-library"],
    });

    const reloaded = new TheoryLibrary(store);
    await reloaded.load();
    expect(reloaded.isSaved("c-maj7")).toBe(true);

    await reloaded.remove("c-maj7");
    expect(reloaded.isSaved("c-maj7")).toBe(false);
    await expect(store.chordLibrary.get("c-maj7")).resolves.toBeUndefined();
  });
});
