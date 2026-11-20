import { describe, expect, it } from "vite-plus/test";
import {
  classifyChord,
  gradeChoice,
  gradeChordPlayback,
  gradeInversionPlayback,
  inversionOf,
  gradeChordQualityPlayback,
  gradeIntervalPlayback,
  gradeMelodyDictation,
  gradeScaleDegree,
  gradeSequence,
} from "./ear";
import { gradeFlashcard } from "./reading";

describe("ear", () => {
  it("choice is binary with a choice metric", () => {
    expect(gradeChoice("m6", "m6")).toMatchObject({ score: 1, correct: true });
    expect(gradeChoice("m6", "P5")).toMatchObject({
      score: 0,
      metrics: [{ kind: "choice", expected: "m6", actual: "P5" }],
    });
  });

  it("a chord of a key played back counts in any octave or inversion, with nothing missing or extra", () => {
    const fMajor = [41, 60, 65, 69];
    expect(gradeChordPlayback(fMajor, [57, 60, 65]).correct).toBe(true);
    expect(gradeChordPlayback(fMajor, [53, 57, 60, 72]).correct).toBe(true);
    expect(gradeChordPlayback(fMajor, [53, 57]).metrics[0]).toMatchObject({ missing: [0] });
    expect(gradeChordPlayback(fMajor, [53, 57, 60, 64]).metrics[0]).toMatchObject({ extra: [4] });
  });

  it("finds the inversion of any voicing, and grades a played one by its bass", () => {
    expect(inversionOf([52, 60, 67])).toEqual({ token: "major", rootPc: 0, position: 1 });
    expect(inversionOf([58, 64, 67, 72])).toMatchObject({ token: "dominant-7", position: 3 });
    expect(inversionOf([60, 61])).toBeNull();
    const firstInv = [52, 64, 67, 72];
    expect(gradeInversionPlayback(firstInv, [40, 60, 67]).correct).toBe(true);
    expect(gradeInversionPlayback(firstInv, [48, 64, 67]).correct).toBe(false);
  });

  it("sequences get partial credit per slot", () => {
    expect(gradeSequence(["IV", "V", "I"], ["IV", "V", "I"])).toMatchObject({
      score: 1,
      correct: true,
    });
    const g = gradeSequence(["IV", "V", "I"], ["IV", "vi", "I"]);
    expect(g.score).toBeCloseTo(2 / 3);
    expect(g.correct).toBe(false);
    expect(g.metrics[1]).toEqual({ kind: "choice", expected: "V", actual: "vi" });
  });

  it("played intervals must match direction unless harmonic", () => {
    const up = { semitones: 7, direction: "ascending" } as const;
    expect(gradeIntervalPlayback(up, [60, 67]).correct).toBe(true);
    expect(gradeIntervalPlayback(up, [50, 57]).correct).toBe(true); // any starting pitch
    expect(gradeIntervalPlayback(up, [67, 60]).correct).toBe(false);
    expect(gradeIntervalPlayback({ semitones: 7, direction: "descending" }, [67, 60]).correct).toBe(
      true,
    );
    expect(gradeIntervalPlayback({ semitones: 7, direction: "harmonic" }, [67, 60]).correct).toBe(
      true,
    );
    expect(gradeIntervalPlayback(up, [60]).score).toBe(0);
  });

  it("classifies a played chord by pitch-class shape, inversion-agnostic", () => {
    expect(classifyChord([64, 67, 72])).toEqual({ token: "major", rootPc: 0 });
    expect(gradeChordQualityPlayback("major", [64, 67, 72])).toMatchObject({
      correct: true,
      detected: "major",
    });
    const r = gradeChordQualityPlayback("minor", [64, 67, 72]);
    expect(r).toMatchObject({ correct: false, detected: "major" });
    expect(gradeChordQualityPlayback("minor", [60, 63]).detected).toBeNull();
  });

  it("melody dictation is position-wise pitch class, correct only at 1.0", () => {
    expect(gradeMelodyDictation([60, 62, 64], [72, 62, 65])).toMatchObject({
      matched: 2,
      total: 3,
      correct: false,
    });
    expect(gradeMelodyDictation([60, 62, 64], [72, 62, 65]).score).toBeCloseTo(2 / 3, 10);
    expect(gradeMelodyDictation([60, 62, 64], [48, 50, 52])).toMatchObject({
      score: 1,
      correct: true,
    });
    expect(gradeMelodyDictation([60, 62, 64], []).score).toBe(0);
  });

  it("a sung degree is its pitch class over the tonic", () => {
    expect(gradeScaleDegree(60, 7, { midi: 79, cents: -8 }).correct).toBe(true);
    expect(gradeScaleDegree(60, 7, { midi: 78 }).correct).toBe(false);
    expect(gradeScaleDegree(60, 7, null).score).toBe(0);
  });
});

describe("reading flashcards", () => {
  it("named answers are enharmonic-tolerant", () => {
    expect(gradeFlashcard([61], "C#").correct).toBe(true);
    expect(gradeFlashcard([61], "Db").correct).toBe(true);
    expect(gradeFlashcard([61], "D").correct).toBe(false);
    expect(gradeFlashcard([61], "H").correct).toBe(false);
  });

  it("chords compare as sets", () => {
    expect(gradeFlashcard([60, 64, 67], "C-E-G").correct).toBe(true);
    expect(gradeFlashcard([60, 64, 67], "E-G-C").correct).toBe(true);
    expect(gradeFlashcard([60, 64, 67], [67, 60, 64]).correct).toBe(true);
    expect(gradeFlashcard([60, 64, 67], [72, 64, 67])).toMatchObject({
      correct: false,
      metrics: [{ kind: "chord", missing: [0], extra: [0] }],
    });
  });
});
