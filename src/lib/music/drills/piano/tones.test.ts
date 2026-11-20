import { describe, expect, it } from "vite-plus/test";
import { parseChordSymbol } from "@repo/music-core/theory/chords";
import { scaleTip, toneLabel } from "./tones";

const labels = (symbol: string, semis: number[]) =>
  semis.map((s) => toneLabel(s, parseChordSymbol(symbol)!.intervals));

describe("toneLabel", () => {
  it("names chord tones by degree and the rest as tensions", () => {
    expect(labels("Cmaj7", [0, 2, 4, 6, 7, 9, 11])).toEqual(["R", "9", "3", "#11", "5", "13", "7"]);
    expect(labels("Dm7", [0, 2, 3, 5, 7, 9, 10])).toEqual(["R", "9", "b3", "11", "5", "13", "b7"]);
  });
  it("spells altered and half-diminished chords", () => {
    expect(labels("G7alt", [0, 1, 3, 4, 6, 8, 10])).toEqual([
      "R",
      "b9",
      "#9",
      "3",
      "#11",
      "b13",
      "b7",
    ]);
    expect(labels("Dm7b5", [3, 6])).toEqual(["b3", "b5"]);
    expect(labels("Cdim7", [9])).toEqual(["bb7"]);
  });
});

describe("scaleTip", () => {
  it("gives each scale its own reason, never Lydian's to Mixolydian", () => {
    expect(scaleTip("lydian")).toBe("Raised 4th: no clash with the 3rd");
    expect(scaleTip("mixolydian")).toBe("Flat 7th: the chord's own 7th");
    expect(scaleTip("dorian")).toContain("6th");
    expect(scaleTip("major")).toBeNull();
  });
});
