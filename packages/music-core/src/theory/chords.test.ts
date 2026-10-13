import { describe, expect, it } from "vitest";
import { COMPING, JAZZ, RHYTHM_PATTERNS, VOICING_DRILL } from "../data";
import { PROGRESSIONS } from "../content/jam";
import { CHORD_SCALE_CHANGES, voicingTargets, voiceLeadingTargets } from "../content/piano";
import {
  CHORD_TEMPLATES,
  EAR_CHORD_QUALITIES,
  identifyChord,
  parseChordSymbol,
  toneRoles,
  transposeSymbol,
} from "./chords";

describe("chord qualities and templates", () => {
  it("has the 9 ear qualities and 19 identification templates", () => {
    expect(EAR_CHORD_QUALITIES.map((q) => `${q.token}:${q.intervals.join(" ")}`)).toEqual([
      "major:0 4 7",
      "minor:0 3 7",
      "diminished:0 3 6",
      "augmented:0 4 8",
      "major-7:0 4 7 11",
      "dominant-7:0 4 7 10",
      "minor-7:0 3 7 10",
      "half-diminished-7:0 3 6 10",
      "diminished-7:0 3 6 9",
    ]);
    expect(CHORD_TEMPLATES.map((t) => t.quality)).toEqual([
      "maj",
      "m",
      "dim",
      "aug",
      "sus2",
      "sus4",
      "add9",
      "6",
      "m6",
      "maj7",
      "m7",
      "7",
      "7sus4",
      "m7b5",
      "dim7",
      "9",
      "maj9",
      "m9",
      "5",
    ]);
  });

  it("identifies chords by Jaccard similarity, ignoring inversion", () => {
    expect(identifyChord([60, 64, 67])[0]).toMatchObject({ symbol: "C", score: 1 });
    expect(identifyChord([64, 67, 72])[0].symbol).toBe("C");
    expect(identifyChord([55, 59, 62, 65])[0].symbol).toBe("G7");
    expect(identifyChord([57, 60, 64])[0].symbol).toBe("Am");
    // An exact tie keeps template order: C6 is listed before Am7.
    expect(
      identifyChord([9, 0, 4, 7])
        .slice(0, 2)
        .map((c) => c.symbol),
    ).toEqual(["C6", "Am7"]);
    // Partial match: C E (no G) scores 2/3 against C major.
    expect(identifyChord([0, 4]).find((c) => c.symbol === "C")!.score).toBeCloseTo(2 / 3);
    expect(identifyChord([])).toEqual([]);
  });
});

describe("chord symbol parser", () => {
  const cases: Record<string, number[]> = {
    Dm7: [0, 2, 5, 9],
    G7: [2, 5, 7, 11],
    Cmaj7: [0, 4, 7, 11],
    A7: [1, 4, 7, 9],
    A7b9: [1, 4, 7, 9, 10],
    G7b9: [2, 5, 7, 8, 11],
    "G7#9b9": [2, 5, 7, 8, 10, 11],
    G7alt: [1, 3, 5, 7, 8, 10, 11],
    Dm7b5: [0, 2, 5, 8],
    Cm7: [0, 3, 7, 10],
    CmMaj7: [0, 3, 7, 11],
    C6: [0, 4, 7, 9],
    Cm6: [0, 3, 7, 9],
    "C6/9": [0, 2, 4, 7, 9],
    Fm7: [0, 3, 5, 8],
    Em: [4, 7, 11],
    D: [2, 6, 9],
    Am: [0, 4, 9],
    F7: [0, 3, 5, 9],
    C7: [0, 4, 7, 10],
    "Cmaj7#11": [0, 4, 6, 7, 11],
    C7b13: [0, 4, 7, 8, 10],
    Cdim7: [0, 3, 6, 9],
    "G13#11": [1, 2, 4, 5, 7, 9, 11],
  };
  it("reads the listed symbols into pitch classes", () => {
    for (const [symbol, pcs] of Object.entries(cases))
      expect(parseChordSymbol(symbol)?.pcs, symbol).toEqual(pcs);
    expect(parseChordSymbol("C/E")).toMatchObject({ rootPc: 0, bassPc: 4, pcs: [0, 4, 7] });
    expect(parseChordSymbol("Gbm7")?.rootPc).toBe(6);
    expect(parseChordSymbol("C#maj7")?.rootPc).toBe(1);
    expect(parseChordSymbol("Cxyz")).toBeNull();
    expect(parseChordSymbol("H7")).toBeNull();
  });

  it("reads every symbol the content uses", () => {
    const symbols = [
      ...JAZZ.JAZZ_LICKS.flatMap((l) => l.progression),
      ...JAZZ.JAZZ_CHORD_TYPES.flatMap((t) => [t.symbol, ...(t.extensions ?? [])]),
      ...VOICING_DRILL.targets.map((t) => t.symbol),
      ...(["major", "minor", "altered"] as const).flatMap((v) =>
        voicingTargets({ variant: v }).map((t) => t.symbol),
      ),
      ...voiceLeadingTargets().map((t) => t.symbol),
      ...PROGRESSIONS.flatMap((p) => p.chords.map((c) => c.symbol)),
      ...RHYTHM_PATTERNS.flatMap((p) => (p.chords ?? []).map((c) => c.symbol)),
      ...COMPING.patterns.map((p) => p.chord),
      ...CHORD_SCALE_CHANGES.major,
      ...CHORD_SCALE_CHANGES.minor,
    ];
    for (const s of symbols) expect(parseChordSymbol(s), s).not.toBeNull();
    for (const p of RHYTHM_PATTERNS)
      for (const c of p.chords ?? [])
        expect(parseChordSymbol(c.symbol)!.pcs).toEqual([...c.pitchClasses].sort((a, b) => a - b));
  });

  it("transposes symbols with flat spellings", () => {
    expect(transposeSymbol("Dm7", -2)).toBe("Cm7");
    expect(transposeSymbol("G7alt", 1)).toBe("Ab7alt");
    expect(transposeSymbol("C/E", 2)).toBe("D/Gb");
    expect(transposeSymbol("C6/9", 5)).toBe("F6/9");
  });

  it("labels tone roles", () => {
    const roles = toneRoles([2, 5, 9, 0], [2, 4, 5, 7, 9, 11, 0]);
    expect(roles.filter((r) => r === "chord")).toHaveLength(4);
    expect(roles[4]).toBe("scale");
    expect(roles[1]).toBe("avoid");
  });
});
