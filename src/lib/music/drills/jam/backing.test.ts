import { describe, expect, it } from "vitest";
import { PROGRESSIONS } from "@repo/music-core/content/jam";
import { backingNotes, chordVoicing, degreeLabel, positionAt } from "./backing";

const blues = PROGRESSIONS.find((p) => p.id === "blues")!;
const pop = PROGRESSIONS.find((p) => p.id === "pop-axis")!;

describe("positionAt", () => {
  it("walks the form and counts wrapped choruses", () => {
    expect(positionAt(blues, 0, 0)).toEqual({ chordIndex: 0, choruses: 0, beatInChord: 0 });
    expect(positionAt(blues, 0, 17)).toEqual({ chordIndex: 1, choruses: 0, beatInChord: 1 });
    // 12 bars = 48 beats per chorus.
    expect(positionAt(blues, 0, 48)).toEqual({ chordIndex: 0, choruses: 1, beatInChord: 0 });
    // Starting from the last chord, one bar in wraps once.
    expect(positionAt(pop, 3, 4)).toEqual({ chordIndex: 0, choruses: 1, beatInChord: 0 });
  });
});

describe("backingNotes", () => {
  it("lays chords and a groove over every bar", () => {
    const notes = backingNotes(pop, { bpm: 120, mode: "both", choruses: 1 });
    const drums = notes.filter((n) => n.voice === "drum");
    expect(drums.filter((n) => n.midi === 38)).toHaveLength(8); // snare on 2 and 4, four bars
    const last = Math.max(...notes.map((n) => n.time));
    expect(last).toBeLessThan(8); // four bars at 120 BPM = 8 s
    expect(notes.some((n) => !n.voice && n.midi === 48)).toBe(true); // C in the bass
  });
  it("drums only has no pitched notes", () => {
    expect(
      backingNotes(pop, { bpm: 120, mode: "drums", choruses: 1 }).every((n) => n.voice === "drum"),
    ).toBe(true);
  });
});

it("voices a seventh without doubling the root", () => {
  expect(chordVoicing("C7")).toEqual({ bass: 48, upper: [55, 58, 64] });
});

it("names degrees from the chord root", () => {
  expect(degreeLabel("Cm7", 3)).toBe("b3");
  expect(degreeLabel("C7", 3)).toBe("#9");
  expect(degreeLabel("C7", 2)).toBe("9");
  expect(degreeLabel("Dm7b5", 2 + 6)).toBe("b5");
});
