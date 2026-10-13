import { describe, expect, it } from "vitest";
import { CHORD_SHAPES } from "../data";
import { tuningById } from "../theory/fretboard";
import { pc } from "../theory/notes";
import { rng } from "./random";
import {
  baseOffset,
  chordChangePairs,
  chordPerfectTargets,
  HANDS_TOGETHER_PRESET,
  intervalRecallPrompt,
  noteFinderPrompt,
  POSITION_PATTERNS,
  positionTargets,
  RECALL_REGIONS,
  scaleDrillTargets,
  scaleSetupKey,
  gradeSpeed,
  GUITAR_GRADE_TEMPOS,
  ABRSM_SPEEDS,
  scaleSkills,
  shapePcs,
  SPIDER_PATTERNS,
  spiderMaxStartFret,
  spiderTargets,
  suggestRecallRegion,
} from "./technique";

const std = tuningById("guitar.standard")!;
const uke = tuningById("ukulele.high-g")!;

describe("scale drill", () => {
  it("expects one step per note, both hands doubled an octave apart", () => {
    const steps = scaleDrillTargets({
      kind: "major",
      tonic: 60,
      span: "one-octave",
      motion: "up",
      hands: "both",
      bpm: 80,
    });
    expect(steps).toHaveLength(8);
    expect(steps[0].notes).toEqual([
      { midi: 48, hand: "left" },
      { midi: 60, hand: "right" },
    ]);
    expect(steps.map((s) => s.atBeat)).toEqual([0, 1, 2, 3, 4, 5, 6, 7]);
    const left = scaleDrillTargets({
      kind: "major",
      tonic: 60,
      span: "pentascale",
      motion: "up",
      hands: "left",
      bpm: 80,
    });
    expect(left.map((s) => s.notes[0])).toEqual(
      [48, 50, 52, 53, 55].map((midi) => ({ midi, hand: "left" })),
    );
    expect(HANDS_TOGETHER_PRESET).toMatchObject({
      span: "one-octave",
      hands: "both",
      bpm: 80,
      minEvenness: 0.85,
    });
    expect(scaleSkills("major")).toEqual(["technique.scales", "technique.scale.major"]);
    expect(scaleSkills("dorian")).toEqual(["technique.scales"]);
  });
});

describe("arpeggios and chords through their inversions", () => {
  const base = {
    kind: "major" as const,
    tonic: 60,
    motion: "up" as const,
    hands: "right" as const,
    bpm: 60,
  };
  it("arpeggiates, breaks and blocks the tonic chord", () => {
    const arp = scaleDrillTargets({ ...base, pattern: "arpeggio", span: "two-octave" });
    expect(arp.map((s) => s.notes[0].midi)).toEqual([60, 64, 67, 72, 76, 79, 84]);
    // Broken: each inversion's notes in turn, ending on the root position an octave up.
    const broken = scaleDrillTargets({
      ...base,
      pattern: "broken",
      span: "one-octave",
      chord: "minor",
    });
    expect(broken.map((s) => s.notes[0].midi)).toEqual([
      60, 63, 67, 63, 67, 72, 67, 72, 75, 72, 75, 79,
    ]);
    const blocked = scaleDrillTargets({
      ...base,
      pattern: "blocked",
      span: "one-octave",
      motion: "up-down",
    });
    expect(blocked.map((s) => s.notes.map((n) => n.midi))).toEqual([
      [60, 64, 67],
      [64, 67, 72],
      [67, 72, 76],
      [72, 76, 79],
      [67, 72, 76],
      [64, 67, 72],
      [60, 64, 67],
    ]);
    // A seventh chord has four inversions; both hands double it an octave down.
    const dom = scaleDrillTargets({
      ...base,
      pattern: "blocked",
      span: "one-octave",
      chord: "dominant-7",
      hands: "both",
    });
    expect(dom).toHaveLength(5);
    expect(dom[0].notes.filter((n) => n.hand === "left").map((n) => n.midi)).toEqual([
      48, 52, 55, 58,
    ]);
  });

  it("puts two or four notes to a click at the ABRSM grade speeds", () => {
    const fast = scaleDrillTargets({ ...base, span: "one-octave", perBeat: 2 });
    expect(fast.map((s) => s.atBeat).slice(0, 4)).toEqual([0, 0.5, 1, 1.5]);
    expect(gradeSpeed("Grade 1", "scale")).toEqual([60, 2]);
    expect(gradeSpeed("Grade 5", "arpeggio")).toEqual([44, 4]);
    expect(gradeSpeed("Grade 5", "blocked")).toBeUndefined();
    expect(ABRSM_SPEEDS).toHaveLength(9);
    // Old scale ladders keep their keys; the new patterns get their own.
    expect(scaleSetupKey({ ...base, span: "one-octave" })).toBe("major|60|up|one-octave|right");
    expect(
      scaleSetupKey({ ...base, span: "one-octave", pattern: "arpeggio", chord: "minor" }),
    ).toBe("arpeggio|minor|60|up|one-octave|right|1");
    expect(scaleSkills("major", "arpeggio")).toEqual(["technique.arpeggios"]);
  });
});

describe("spider", () => {
  it("has the 4 classic patterns then all 24 finger orders", () => {
    expect(SPIDER_PATTERNS).toHaveLength(24);
    expect(SPIDER_PATTERNS.slice(0, 4).map((p) => p.fretOffsets.join(""))).toEqual([
      "0123",
      "3210",
      "0213",
      "0312",
    ]);
    expect(new Set(SPIDER_PATTERNS.map((p) => p.fretOffsets.join(""))).size).toBe(24);
    expect(spiderMaxStartFret(std)).toBe(9);
    expect(spiderMaxStartFret({ ...uke, fretCount: 10 })).toBe(7);
  });

  it("walks each string of the span in turn", () => {
    const t = spiderTargets({
      patternId: "ascending-1234",
      tuning: std,
      string: 6,
      span: "single",
      startFret: 5,
      crossing: false,
    });
    expect(t).toEqual(
      [5, 6, 7, 8].map((fret, i) => ({ string: 6, fret, midi: 40 + fret, finger: i + 1 })),
    );
    const all = spiderTargets({
      patternId: "ascending-1234",
      tuning: std,
      string: 6,
      span: "all",
      startFret: 5,
      crossing: false,
    });
    expect(all).toHaveLength(24);
    expect(all.at(-1)).toMatchObject({ string: 1, fret: 8 });
  });

  it("lands each step on the next string when crossing, one pass per string", () => {
    const t = spiderTargets({
      patternId: "ascending-1234",
      tuning: std,
      string: 6,
      span: "adjacent-2",
      startFret: 5,
      crossing: true,
    });
    expect(t.map((n) => `${n.string}/${n.fret}`)).toEqual([
      "6/5",
      "5/6",
      "6/7",
      "5/8",
      "5/5",
      "6/6",
      "5/7",
      "6/8",
    ]);
  });

  it("clamps the start fret and marks open strings with finger 0", () => {
    const t = spiderTargets({
      patternId: "ascending-1234",
      tuning: std,
      string: 1,
      span: "single",
      startFret: 0,
      crossing: false,
    });
    expect(t[0]).toEqual({ string: 1, fret: 0, midi: 64, finger: 0 });
    expect(
      spiderTargets({
        patternId: "ascending-1234",
        tuning: std,
        string: 1,
        span: "single",
        startFret: 15,
        crossing: false,
      })[0].fret,
    ).toBe(9);
  });
});

describe("positions", () => {
  it("has 5 boxes and 5 CAGED shapes with their base offsets", () => {
    expect(POSITION_PATTERNS.map((p) => `${p.id}:${baseOffset(p)}`)).toEqual([
      "minor-pentatonic-box-1:0",
      "minor-pentatonic-box-2:2",
      "minor-pentatonic-box-3:4",
      "minor-pentatonic-box-4:7",
      "minor-pentatonic-box-5:9",
      "caged-major-e-shape:0",
      "caged-major-d-shape:2",
      "caged-major-c-shape:4",
      "caged-major-a-shape:7",
      "caged-major-g-shape:9",
    ]);
  });

  it("arpeggiates low to high and stays in the scale or chord", () => {
    const box1 = positionTargets({ patternId: "minor-pentatonic-box-1", tuning: std, rootFret: 5 });
    expect(box1).toHaveLength(12);
    expect(box1[0]).toEqual({ string: 6, fret: 5, midi: 45 });
    expect(box1.map((n) => n.midi)).toEqual(box1.map((n) => n.midi).sort((a, b) => a - b));
    for (const p of POSITION_PATTERNS.filter((x) => x.family === "minor-pentatonic"))
      for (const n of positionTargets({ patternId: p.id, tuning: std, rootFret: 5 }))
        expect([9, 0, 2, 4, 7]).toContain(pc(n.midi));
    for (const p of POSITION_PATTERNS.filter((x) => x.family === "caged-major"))
      for (const n of positionTargets({ patternId: p.id, tuning: std, rootFret: 3 }))
        expect([7, 11, 2], p.id).toContain(pc(n.midi));
  });
});

describe("note finder and interval recall", () => {
  it("names a note found somewhere in the region", () => {
    for (let s = 1; s < 50; s++) {
      const p = noteFinderPrompt(rng(s), {
        tuning: std,
        region: { start: 0, end: 5 },
        strings: [1, 2, 3],
      });
      expect(p.answers.length).toBeGreaterThan(0);
      for (const a of p.answers) {
        expect([1, 2, 3]).toContain(a.string);
        expect(a.fret).toBeLessThanOrEqual(5);
        expect(pc(std.openStrings[a.string - 1] + a.fret)).toBe(p.pc);
      }
    }
  });

  it("finds the ascending interval inside the 5-fret window", () => {
    expect(RECALL_REGIONS).toEqual([
      { start: 0, end: 4 },
      { start: 5, end: 9 },
      { start: 10, end: 14 },
    ]);
    for (const semitones of [3, 4, 7, 12])
      for (let region = 0; region < 3; region++) {
        const p = intervalRecallPrompt(rng(semitones * 10 + region), {
          tuning: std,
          region,
          semitones,
        });
        expect(p.targetMidi).toBe(p.anchor.midi + semitones);
        expect(p.answers.length).toBeGreaterThan(0);
        for (const a of p.answers) {
          expect(a.fret).toBeGreaterThanOrEqual(RECALL_REGIONS[region].start);
          expect(a.fret).toBeLessThanOrEqual(RECALL_REGIONS[region].end);
          expect(std.openStrings[a.string - 1] + a.fret).toBe(p.targetMidi);
        }
        expect(p.skillIds).toEqual([
          "technique.guitar.intervals",
          `technique.guitar.intervals.${semitones}`,
        ]);
      }
  });

  it("suggests the next region after five recent correct answers", () => {
    expect(suggestRecallRegion(0, [true, true, true, true, true])).toBe(1);
    expect(suggestRecallRegion(0, [true, true, false, true, true])).toBe(0);
    expect(suggestRecallRegion(0, [true, true, true, true])).toBe(0);
    expect(suggestRecallRegion(2, [true, true, true, true, true])).toBe(2);
  });
});

describe("chord-perfect and changes", () => {
  it("targets each sounding string in ascending pitch order", () => {
    const c = CHORD_SHAPES.find((s) => s.id === "guitar.c-major")!;
    expect(chordPerfectTargets(c).map((n) => [n.string, n.fret, n.midi, n.finger])).toEqual([
      [5, 3, 48, 3],
      [4, 2, 52, 2],
      [3, 0, 55, undefined],
      [2, 1, 60, 1],
      [1, 0, 64, undefined],
    ]);
    // The curated shapes sound their named chord.
    expect(shapePcs(CHORD_SHAPES.find((s) => s.id === "guitar.g7")!).sort((a, b) => a - b)).toEqual(
      [2, 5, 7, 11],
    );
    expect(
      shapePcs(CHORD_SHAPES.find((s) => s.id === "ukulele.f-major")!).sort((a, b) => a - b),
    ).toEqual([0, 5, 9]);
  });

  it("pairs shapes with their authored transitions", () => {
    const pairs = chordChangePairs("guitar");
    expect(pairs).toContainEqual({ from: "guitar.c-major", to: "guitar.g-major" });
    expect(pairs).toContainEqual({ from: "guitar.d-major", to: "guitar.a-major" });
    expect(chordChangePairs("ukulele").every((p) => p.from.startsWith("ukulele."))).toBe(true);
  });
});

describe("guitar grade tempos", () => {
  it("lists the Rockschool and Trinity exam clicks", () => {
    expect(GUITAR_GRADE_TEMPOS).toHaveLength(18);
    expect(GUITAR_GRADE_TEMPOS.find((g) => g.id === "rsl-grade-3")).toEqual({
      id: "rsl-grade-3",
      label: "Rockschool Grade 3",
      bpm: 90,
    });
    expect(GUITAR_GRADE_TEMPOS.find((g) => g.id === "trinity-grade-8")!.bpm).toBe(136);
  });
});
