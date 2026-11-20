import { describe, expect, it } from "vite-plus/test";
import type { Score } from "../types";
import { octaveFit, transposeFifths, transposeScore, writtenOffset } from "./transposition";

describe("written pitch", () => {
  it("puts the Aerophone's written note above concert by its reading key", () => {
    expect(writtenOffset("aerophone", { aerophoneKey: "C" })).toBe(0);
    // Concert Eb4 is written C5 on alto, F5 on tenor.
    expect(63 + writtenOffset("aerophone", { aerophoneKey: "Eb" })).toBe(72);
    expect(63 + writtenOffset("aerophone", { aerophoneKey: "Bb" })).toBe(77);
  });

  it("takes guitar's octave from the tuning and leaves the rest at concert", () => {
    expect(writtenOffset("guitar", { aerophoneKey: "Eb" }, { notationTransposition: -12 })).toBe(
      12,
    );
    expect(writtenOffset("ukulele", { aerophoneKey: "Eb" }, { notationTransposition: 0 })).toBe(0);
    expect(writtenOffset("guitar", { aerophoneKey: "C" }, null)).toBe(0);
    expect(writtenOffset("piano", { aerophoneKey: "Bb" })).toBe(0);
  });

  it("moves the key signature with the notes", () => {
    expect(transposeFifths(0, 9)).toBe(3); // concert C: alto reads A major
    expect(transposeFifths(-3, 9)).toBe(0); // concert Eb: alto reads C
    expect(transposeFifths(-2, 14)).toBe(0); // concert Bb: tenor reads C
    expect(transposeFifths(4, 9)).toBe(-5); // concert E: alto reads Db, not C#
    expect(transposeFifths(7, 12)).toBe(7); // an octave keeps the signature
    expect(transposeFifths(3, -9)).toBe(0); // and back
  });

  it("transposes a score's notes and key, leaving the original alone", () => {
    const score = {
      id: "s",
      title: "S",
      bpm: 90,
      meter: { beats: 4, beatUnit: 4 },
      keyFifths: -1,
      voices: [{ id: "v", name: "V", notes: [{ midi: 60, startBeat: 0, durationBeats: 1 }] }],
      lengthBeats: 4,
    } as Score;
    const alto = transposeScore(score, 9);
    expect(alto.voices[0].notes[0].midi).toBe(69);
    expect(alto.keyFifths).toBe(2);
    expect(score.voices[0].notes[0].midi).toBe(60);
    expect(transposeScore(score, 0)).toBe(score);
  });

  it("fits a line into a written range by octaves", () => {
    // The Aerophone's chart is Bb3 to C#6 written (58 to 85).
    expect(octaveFit(60, 72, 58, 85)).toBe(0);
    expect(octaveFit(48, 60, 58, 85)).toBe(12);
    // Concert C4 to C5 on a tenor reads D5 to D6: over the top, so down an octave.
    expect(octaveFit(60 + 14, 72 + 14, 58, 85)).toBe(-12);
    // Too wide to fit either way: left where it is.
    expect(octaveFit(58, 90, 58, 85)).toBe(0);
    // A fretted instrument has only a bottom.
    expect(octaveFit(36, 48, 40)).toBe(12);
  });
});
