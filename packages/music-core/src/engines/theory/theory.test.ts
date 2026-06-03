import { describe, expect, test } from "vitest";

import {
  chordNotes,
  frequency,
  intervalBetween,
  midiToNote,
  noteToMidi,
  scaleNotes,
  transpose,
} from "./index";

describe("music-core/theory", () => {
  test.each([
    ["C4", 60],
    ["F#3", 54],
    ["Bb2", 46],
    ["Db5", 73],
  ])("converts %s to MIDI %i", (note, midi) => {
    expect(noteToMidi(note)).toBe(midi);
    expect(noteToMidi(midiToNote(midi))).toBe(midi);
  });

  test("computes frequency from MIDI note", () => {
    expect(frequency(69)).toBeCloseTo(440, 5);
    expect(frequency(60)).toBeCloseTo(261.625565, 5);
  });

  test("spells common chords and scales", () => {
    expect(chordNotes("Cmaj7")).toEqual(["C", "E", "G", "B"]);
    expect(chordNotes("Dm7")).toEqual(["D", "F", "A", "C"]);
    expect(chordNotes("G7")).toEqual(["G", "B", "D", "F"]);
    expect(scaleNotes("C major")).toEqual(["C", "D", "E", "F", "G", "A", "B"]);
    expect(scaleNotes("A minor")).toEqual(["A", "B", "C", "D", "E", "F", "G"]);
  });

  test("calculates interval labels and transposition", () => {
    expect(intervalBetween("C4", "Ab4")).toBe("m6");
    expect(intervalBetween("C4", "G4")).toBe("P5");
    expect(transpose("Bb3", 2)).toBe("C4");
  });
});
