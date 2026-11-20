import { describe, expect, it } from "vite-plus/test";
import { SKILL_IDS } from "../data";
import { parseChordSymbol } from "../theory/chords";
import { pc } from "../theory/notes";
import vocabulary from "../data/jazz-vocabulary.json";
import { scaleDrillTargets, scaleSkills, triadPairSteps } from "./technique";
import {
  LICKS,
  LICK_CATEGORIES,
  LICK_CATEGORY_LABEL,
  chordPattern,
  chordPatternLine,
  lickChordAt,
  lickNotes,
  lickSkills,
  lickTip,
} from "./piano";

const PLAIN = [0.25, 0.5, 0.75, 1, 1.5, 2, 3, 4];
const ours = LICKS.filter((l) => l.number > 100);

describe("jazz vocabulary licks", () => {
  it("fills the six categories, numbered from 101, each with a label and a skill", () => {
    expect(ours).toHaveLength(vocabulary.licks.length);
    expect(new Set(ours.map((l) => l.number)).size).toBe(ours.length);
    for (const c of vocabulary.categories) {
      expect(LICK_CATEGORIES).toContain(c.id);
      expect(LICK_CATEGORY_LABEL[c.id]).toBe(c.label);
      for (const s of lickSkills(c.id)) expect(SKILL_IDS.has(s), s).toBe(true);
      expect(
        ours.some((l) => l.category === c.id),
        c.id,
      ).toBe(true);
    }
  });

  it("writes plain values that fill each chord's bars, over chords the app can read", () => {
    for (const l of ours) {
      const phrase = (vocabulary.phrases as unknown as Record<string, [number | null, number][]>)[
        l.number
      ];
      for (const [, beats] of phrase) expect(PLAIN, `${l.number}`).toContain(beats);
      const total = phrase.reduce((a, [, b]) => a + b, 0);
      expect(total, `${l.number}`).toBe(
        (l.bars ?? l.progression.map(() => 1)).reduce((a, b) => a + b, 0) * 4,
      );
      for (const c of l.progression) expect(parseChordSymbol(c), c).not.toBeNull();
      expect(lickTip(l)).not.toMatch(/left.hand|—|–/i);
    }
  });

  it("enclosures land on the target with a step above and a half step below", () => {
    for (const l of ours.filter((x) => x.category === "bebop-enclosures")) {
      const notes = lickNotes(l.number);
      const target = notes[notes.length - 1].midi;
      const [above, below] = notes.slice(-3, -1).map((n) => n.midi);
      expect(above - target, `${l.number}`).toBeGreaterThanOrEqual(1);
      expect(above - target, `${l.number}`).toBeLessThanOrEqual(2);
      expect(target - below, `${l.number}`).toBe(1);
    }
  });

  it("Coltrane patterns play 1-2-3-5 of the chord sounding", () => {
    for (const l of ours.filter((x) => x.category === "coltrane-1235")) {
      const notes = lickNotes(l.number);
      for (let i = 0; i < notes.length; i += 4) {
        const chord = parseChordSymbol(lickChordAt(l, notes[i].startBeat))!;
        const cell = notes.slice(i, i + 4).map((n) => pc(n.midi - chord.rootPc));
        // Up 1 2 3 5, or (a whole-bar chord's second half) back down 5 3 2 1.
        const third = chord.intervals.includes(3) ? 3 : 4;
        expect(
          [[0, 2, third, 7].join(), [7, third, 2, 0].join()],
          `${l.number} at ${notes[i].startBeat}`,
        ).toContain(cell.join());
      }
    }
  });

  it("reads chord lengths for half-bar changes", () => {
    const giant = ours.find((l) => l.category === "coltrane-1235")!;
    expect([0, 2, 4, 6, 8].map((b) => lickChordAt(giant, b))).toEqual([
      "Bmaj7",
      "D7",
      "Gmaj7",
      "Bb7",
      "Ebmaj7",
    ]);
  });
});

describe("chord-scale patterns", () => {
  it("1-2-3-5 and 3-5-7-9 from each chord's own tones", () => {
    expect(chordPattern("Dm7", "1235")).toEqual([0, 2, 3, 7]);
    expect(chordPattern("G7", "3579")).toEqual([4, 7, 10, 14]);
    expect(chordPattern("Cmaj7", "3579")).toEqual([4, 7, 11, 14]);
    // Minor ii-V-i: the half-diminished 5th, the altered dominant's b13 and b9.
    expect(chordPattern("Dm7b5", "1235")).toEqual([0, 1, 3, 6]);
    expect(chordPattern("G7alt", "3579")).toEqual([4, 8, 10, 13]);
  });
  it("plays each pattern up and back, a bar of eighths a chord", () => {
    const line = chordPatternLine(["Dm7", "G7", "Cmaj7"], "1235");
    expect(line).toHaveLength(24);
    expect(line.slice(0, 8).map((n) => n.midi)).toEqual([62, 64, 65, 69, 69, 65, 64, 62]);
    expect(line[8]).toMatchObject({ midi: 67, startBeat: 4, chord: 1 });
  });
});

describe("triad pairs in the scale drill", () => {
  it("Eb then F, an octave at a time, back down: the six notes of Bb major's IV and V", () => {
    const steps = scaleDrillTargets({
      kind: "major",
      pattern: "triad-pairs",
      chord: "major",
      tonic: 63,
      span: "one-octave",
      motion: "up-down",
      hands: "right",
      bpm: 100,
    });
    const line = steps.map((st) => st.notes[0].midi);
    expect(line.slice(0, 7)).toEqual([63, 67, 70, 65, 69, 72, 75]);
    expect(line).toEqual([...line.slice(0, 7), ...line.slice(0, 6).reverse()]);
    expect(new Set(line.map(pc))).toEqual(new Set([3, 5, 7, 9, 10, 0]));
    expect(scaleSkills("major", "triad-pairs")).toEqual(["technique.arpeggios"]);
  });
  it("minor pairs, two octaves, up", () => {
    const up = triadPairSteps("minor", 62, 2, "up").map(([m]) => m);
    expect(up).toEqual([62, 65, 69, 64, 67, 71, 74, 77, 81, 76, 79, 83, 86]);
  });
});
