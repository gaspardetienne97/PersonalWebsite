import { afterEach, describe, expect, test } from "vitest";

import { PracticeDatabase, PracticeStore } from "@repo/music-core/engines/store";

import { chordVoicings, TheoryLibrary } from "./index";

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

  test("chordVoicings returns root position, inversions, and drop-2 for a 7th chord", () => {
    const voicings = chordVoicings([60, 64, 67, 71]); // Cmaj7
    expect(voicings.map((v) => v.id)).toEqual(["root", "inv-1", "inv-2", "inv-3", "drop-2"]);
    expect(voicings[0]!.midi).toEqual([60, 64, 67, 71]);
    expect(voicings[1]!.midi).toEqual([64, 67, 71, 72]); // root up an octave
    expect(voicings.at(-1)!.midi).toEqual([55, 60, 64, 71]); // drop the 2nd-from-top (G) an octave
    // Every voicing is the same set of pitch classes.
    for (const voicing of voicings) {
      expect(new Set(voicing.midi.map((m) => m % 12))).toEqual(new Set([0, 4, 7, 11]));
    }
  });

  test("covers the minor ii-V-i vocabulary and projects each cleanly (J5)", () => {
    const library = new TheoryLibrary();
    const ids = [
      // chords: iiø7 → V7alt → i (mMaj7 / m6), plus the passing dim7
      "c-half-diminished",
      "c-7alt",
      "c-minor-major-7",
      "c-minor-6",
      "c-diminished-7",
      // scales for the minor changes
      "c-locrian",
      "c-altered",
      "c-melodic-minor",
      "c-diminished-wh",
      "c-diminished-hw",
    ];
    for (const id of ids) {
      const item = library.get(id);
      expect(item, id).toBeDefined();
      // Every item projects to real notes + ascending piano MIDI (would throw on bad data).
      expect(item!.notes.length, id).toBeGreaterThan(2);
      expect(item!.pianoMidi.length, id).toBe(item!.notes.length);
      expect([...item!.pianoMidi].sort((a, b) => a - b)).toEqual(item!.pianoMidi);
    }

    // The tonic minor 6 is browsable as a minor-i chord.
    expect(library.get("c-minor-6")).toMatchObject({ symbol: "Cm6", notes: ["C", "Eb", "G", "A"] });
    // Search finds it by the natural-language alias.
    expect(library.search("tonic minor", "chord").some((i) => i.id === "c-minor-6")).toBe(true);
  });

  test("chordVoicings yields one entry per note (no drop-2) for a triad", () => {
    expect(chordVoicings([60, 64, 67]).map((v) => v.label)).toEqual([
      "Root position",
      "1st inversion",
      "2nd inversion",
    ]);
  });
});
