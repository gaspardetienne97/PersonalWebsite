import { describe, expect, it } from "vitest";
import {
  ALL_KEYS,
  accidentalCount,
  CIRCLE,
  diatonicChords,
  keyAt,
  keyByMajor,
  keyByMinor,
  neighbour,
  opposite,
} from "./circle";
import { pcOf } from "./notes";

describe("circle of fifths", () => {
  it("has the fifteen signatures, relative minors and accidentals in order", () => {
    expect(ALL_KEYS.map((k) => k.major)).toEqual([
      "Cb",
      "Gb",
      "Db",
      "Ab",
      "Eb",
      "Bb",
      "F",
      "C",
      "G",
      "D",
      "A",
      "E",
      "B",
      "F#",
      "C#",
    ]);
    expect(keyAt(3)).toMatchObject({ major: "A", minor: "F#", accidentals: ["F#", "C#", "G#"] });
    expect(keyAt(-4)).toMatchObject({
      major: "Ab",
      minor: "F",
      accidentals: ["Bb", "Eb", "Ab", "Db"],
    });
    expect(keyByMinor("G")?.fifths).toBe(-2);
    expect(keyByMajor("E")?.pc).toBe(4);
    // The last sharp is a half step below the tonic; the second-to-last flat is the key.
    for (const k of ALL_KEYS.filter((x) => x.fifths >= 1))
      expect(pcOf(k.accidentals.at(-1)!)).toBe((k.pc + 11) % 12);
    for (const k of ALL_KEYS.filter((x) => x.fifths <= -2))
      expect(k.accidentals.at(-2)).toBe(k.major);
  });

  it("goes round clockwise from C, with the three enharmonic keys at the bottom", () => {
    expect(CIRCLE.map((k) => k.major)).toEqual([
      "C",
      "G",
      "D",
      "A",
      "E",
      "B",
      "F#",
      "Db",
      "Ab",
      "Eb",
      "Bb",
      "F",
    ]);
    expect(CIRCLE.map((k) => k.enharmonic?.major ?? "")).toEqual([
      "",
      "",
      "",
      "",
      "",
      "Cb",
      "Gb",
      "C#",
      "",
      "",
      "",
      "",
    ]);
  });

  it("reads a key's chords off its neighbours", () => {
    expect(diatonicChords(0).map((c) => c.name)).toEqual(["C", "Dm", "Em", "F", "G", "Am", "B°"]);
    expect(diatonicChords(-2).map((c) => c.name)).toEqual([
      "Bb",
      "Cm",
      "Dm",
      "Eb",
      "F",
      "Gm",
      "A°",
    ]);
    expect(neighbour(0, 1).major).toBe("G");
    expect(neighbour(0, -1).major).toBe("F");
    expect(opposite(1).major).toBe("Db"); // G7 and its tritone sub Db7
    expect([0, 1, -3].map(accidentalCount)).toEqual(["no sharps or flats", "1 sharp", "3 flats"]);
  });
});
