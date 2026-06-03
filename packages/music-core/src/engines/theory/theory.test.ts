import { describe, expect, test } from "vitest";

import {
  chordNotes,
  frequency,
  intervalBetween,
  midiToNote,
  noteToMidi,
  romanNumeral,
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

  test.each([
    ["Cmaj7", ["C", "E", "G", "B"]],
    ["Dm7", ["D", "F", "A", "C"]],
    ["G7", ["G", "B", "D", "F"]],
    ["Cdim", ["C", "Eb", "Gb"]],
  ])("spells the %s chord", (symbol, notes) => {
    expect(chordNotes(symbol)).toEqual(notes);
  });

  test.each([
    ["C major", ["C", "D", "E", "F", "G", "A", "B"]],
    ["A minor", ["A", "B", "C", "D", "E", "F", "G"]],
    ["D dorian", ["D", "E", "F", "G", "A", "B", "C"]],
    ["G mixolydian", ["G", "A", "B", "C", "D", "E", "F"]],
  ])("spells the %s scale", (name, notes) => {
    expect(scaleNotes(name)).toEqual(notes);
  });

  test("calculates interval labels and transposition", () => {
    expect(intervalBetween("C4", "Ab4")).toBe("m6");
    expect(intervalBetween("C4", "G4")).toBe("P5");
    expect(transpose("Bb3", 2)).toBe("C4");
  });

  test.each([
    ["Dm7", "C", "IIm7"],
    ["G7", "C", "V7"],
    ["F", "A", "bVI"],
  ])("expresses %s in %s as %s", (chord, key, expected) => {
    expect(romanNumeral(chord, key)).toBe(expected);
  });
});
