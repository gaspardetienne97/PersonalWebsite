import { describe, expect, it } from "vitest";
import { spellChord, spellDegree, spellInterval } from "./degrees";

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
