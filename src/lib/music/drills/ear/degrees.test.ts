import { describe, expect, it } from "vite-plus/test";
import { setNoteNaming, showNote } from "@repo/music-core";
import type { EarPrompt } from "@repo/music-core/content/ear";
import {
  namingKeyOf,
  placeTags,
  spellChord,
  spellDegree,
  spellInKey,
  spellInterval,
} from "./degrees";

describe("spellDegree", () => {
  it("spells degree 4 of Gb major as Cb, an octave number above the B it sounds as", () => {
    expect(spellDegree(59, 54, "4")).toBe("Cb4");
    expect(spellDegree(54, 54, "1")).toBe("Gb3");
    expect(spellDegree(65, 54, "7")).toBe("F4");
  });
  it("keeps plain keys plain and spells chromatic degrees by their letter", () => {
    expect(spellDegree(64, 60, "3")).toBe("E4");
    expect(spellDegree(63, 60, "b3")).toBe("Eb4");
    expect(spellDegree(66, 60, "#4")).toBe("F#4");
    expect(spellDegree(73, 71, "2")).toBe("C#5");
  });
});

describe("spellInKey", () => {
  it("names a played note as the key spells it", () => {
    expect([54, 59, 56].map((m) => spellInKey(m, 52))).toEqual(["F#3", "B3", "G#3"]); // in E
    expect(spellInKey(58, 53)).toBe("Bb3"); // 4 of F
    expect(spellInKey(51, 48)).toBe("Eb3"); // b3 of C
    expect(spellInKey(47, 54)).toBe("Cb3"); // 4 of Gb, under the tonic
  });
});

describe("spellInterval", () => {
  it("spells the second note by the interval, not by pitch class", () => {
    expect(spellInterval(57, 61)).toEqual(["A", "C#"]); // major 3rd up from A
    expect(spellInterval(61, 65)).toEqual(["Db", "F"]); // fewer accidentals than C# E#
    expect(spellInterval(60, 66)).toEqual(["C", "F#"]); // the tritone as an augmented 4th
    expect(spellInterval(64, 60)).toEqual(["E", "C"]); // major 3rd down
    expect(spellInterval(60, 72)).toEqual(["C", "C"]); // octave
  });
});

describe("spellChord", () => {
  it("spells each note by its place above the root, bass to top", () => {
    expect(spellChord([64, 68, 72])).toEqual(["E", "G#", "B#"]); // E augmented
    expect(spellChord([66, 69, 73])).toEqual(["F#", "A", "C#"]); // F# minor, not Gb Bbb Db
    expect(spellChord([64, 67, 72])).toEqual(["E", "G", "C"]); // C major, first inversion
    expect(spellChord([62, 65, 68])).toEqual(["D", "F", "Ab"]); // D diminished
  });
});

describe("placeTags", () => {
  it("keeps labels above their notes when they are apart", () => {
    expect(
      placeTags([
        { x: 0, above: 50, below: 80, w: 40 },
        { x: 100, above: 50, below: 80, w: 10 },
      ]),
    ).toEqual([50, 50]);
  });
  it("moves a label under its note when it would touch the one before (the tonic and a first 1)", () => {
    expect(
      placeTags([
        { x: 0, above: 50, below: 80, w: 40 },
        { x: 44, above: 50, below: 80, w: 10 },
      ]),
    ).toEqual([50, 80]);
  });
  it("keeps clear of fixed labels too", () => {
    expect(placeTags([{ x: 0, above: 100, below: 130, w: 20 }], [{ x: 0, y: 103, w: 30 }])).toEqual(
      [130],
    );
  });
});

describe("namingKeyOf", () => {
  const prompt = (p: Partial<EarPrompt> & Record<string, unknown>) =>
    ({
      id: "x",
      drill: "interval",
      skillIds: [],
      choices: [],
      difficulty: 0,
      answer: "",
      playback: [{ midi: [60], time: 0, duration: 1 }],
      ...p,
    }) as EarPrompt;
  it("names a prompt's key with flats, minor when its chords or degrees are", () => {
    expect(namingKeyOf(prompt({ drill: "chord-function", answer: "IV", keyPc: 3 }))).toEqual({
      tonic: "Eb",
      minor: false,
    });
    expect(namingKeyOf(prompt({ drill: "chord-function", answer: "m:IV", keyPc: 9 }))).toEqual({
      tonic: "A",
      minor: true,
    });
    expect(
      namingKeyOf(prompt({ drill: "scale-degree", answer: "b3", keyPc: 7, choices: ["1", "b3"] })),
    ).toEqual({ tonic: "G", minor: true });
  });
  it("takes a tonic drill's key from its first note, and a cadence's from its shift", () => {
    expect(
      namingKeyOf(prompt({ drill: "scale", playback: [{ midi: [54], time: 0, duration: 1 }] })),
    ).toEqual({
      tonic: "Gb",
      minor: false,
    });
    expect(namingKeyOf(prompt({ drill: "cadence", id: "cadence-half-5" }))).toEqual({ tonic: "F" });
  });
  it("has no key for an interval", () => {
    expect(namingKeyOf(prompt({ drill: "interval" }))).toBeUndefined();
  });
  it("counts names from it in movable do", () => {
    setNoteNaming("movable");
    try {
      const key = namingKeyOf(prompt({ drill: "melody-dictation", keyPc: 7, minor: false }));
      expect(showNote(spellInKey(66, 55), key)).toBe("Si4");
    } finally {
      setNoteNaming("letters");
    }
  });
});
