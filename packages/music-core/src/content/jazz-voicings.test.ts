import { describe, expect, it } from "vitest";
import { SKILL_IDS } from "../data";
import { pc } from "../theory/notes";
import {
  JAZZ_VOICING_TYPES,
  chordSpeller,
  jazzVoicingChords,
  quartalStack,
  UPPER_TUNES,
} from "./jazz-voicings";
import { TUNES } from "./tunes";

const pcs = (ms: number[]) => ms.map(pc);
const DORIAN_D = [2, 4, 5, 7, 9, 11, 0];

describe("jazz voicing types", () => {
  it("every type, every key: notes rise, the left hand sits under the right, skills exist", () => {
    for (const t of JAZZ_VOICING_TYPES)
      for (let k = 0; k < 12; k++)
        for (const c of jazzVoicingChords(t.id, k, { tune: UPPER_TUNES[0].id })) {
          const all = [...c.left, ...c.right];
          expect(all, c.id).toEqual([...all].sort((a, b) => a - b));
          expect(new Set(all).size, c.id).toBe(all.length);
          expect(
            all.every((m) => m >= 33 && m <= 96),
            c.id,
          ).toBe(true);
          for (const s of c.skillIds) expect(SKILL_IDS.has(s), s).toBe(true);
          expect(c.name, c.id).not.toMatch(/[–—]/);
        }
  });

  it("diatonic sevenths: up the key and back, root position", () => {
    const cs = jazzVoicingChords("sevenths", 0);
    expect(cs.map((c) => c.symbol)).toEqual(
      "Cmaj7 Dm7 Em7 Fmaj7 G7 Am7 Bm7b5 Cmaj7 Bm7b5 Am7 G7 Fmaj7 Em7 Dm7 Cmaj7".split(" "),
    );
    expect(cs[4].right).toEqual([67, 71, 74, 77]);
    expect(
      jazzVoicingChords("sevenths", 10)
        .map((c) => c.symbol)
        .slice(0, 7),
    ).toEqual("Bbmaj7 Cm7 Dm7 Ebmaj7 F7 Gm7 Am7b5".split(" "));
  });

  it("So What: three 4ths and a 3rd on E in D dorian, all seven positions up and back", () => {
    const cs = jazzVoicingChords("so-what", 2);
    expect(cs).toHaveLength(15);
    expect(pcs([...cs[1].left, ...cs[1].right])).toEqual([4, 9, 2, 7, 11]);
    expect(cs[1].left).toHaveLength(2);
    for (const c of cs)
      expect(pcs([...c.left, ...c.right]).every((p) => DORIAN_D.includes(p))).toBe(true);
    // On D itself the shape is exact: 5 5 5 4 semitones.
    const d = [...cs[0].left, ...cs[0].right];
    expect(d.slice(1).map((m, i) => m - d[i])).toEqual([5, 5, 5, 4]);
  });

  it("quartal stacks: three notes in the left hand, two octaves up the mode", () => {
    const cs = jazzVoicingChords("quartal", 5);
    expect(cs).toHaveLength(15);
    expect(cs[14].left[0] - cs[0].left[0]).toBe(24);
    expect(cs.every((c) => c.left.length === 3 && c.right.length === 0)).toBe(true);
    expect(cs[0].group).toBe("F dorian");
  });

  it("sus and slash: the Maiden Voyage set, the triad a whole step below the root", () => {
    const cs = jazzVoicingChords("sus", 2);
    expect(cs.map((c) => c.symbol)).toEqual(["D7sus", "F7sus", "Eb7sus", "Db7sus"]);
    expect(pcs(cs[0].left)).toEqual([2, 9]);
    expect(new Set(pcs(cs[0].right))).toEqual(new Set([0, 4, 7]));
    expect(cs[0].order).toBe(false);
  });

  it("two-handed rootless: 3-7 under 9-5-13, the V with 7-3", () => {
    const [ii, v, i] = jazzVoicingChords("two-hand", 0);
    expect(pcs(ii.left)).toEqual([5, 0]);
    expect(pcs(ii.right)).toEqual([4, 9, 11]);
    expect(pcs(v.left)).toEqual([5, 11]);
    expect(pcs(i.right)).toEqual([2, 7, 9]);
  });

  it("4-way close inside an octave with the melody on top; drop-2 drops the second voice", () => {
    const close = jazzVoicingChords("close", 0);
    const drop = jazzVoicingChords("drop2", 0);
    expect(close).toHaveLength(12);
    close.forEach((c, i) => {
      const n = c.right;
      expect(n[3] - n[0], c.symbol).toBeLessThan(12);
      const d = [...drop[i].left, ...drop[i].right];
      expect(d, c.symbol).toEqual([n[2] - 12, n[0], n[1], n[3]]);
    });
    expect(close[8].symbol).toBe("C6 (C)");
  });

  it("locked hands: chord tones get the 6th chord, passing notes the diminished, melody doubled below", () => {
    const cs = jazzVoicingChords("locked", 0);
    expect(cs[0].symbol).toBe("C6 (C)");
    expect(cs[1].symbol).toBe("Bdim7 (D)");
    for (const c of cs) {
      expect(c.left).toEqual([c.right[3] - 12]);
      expect(c.right[3] - c.right[0]).toBeLessThan(12);
    }
    expect(cs[1].name).toContain("Ab");
  });

  it("Red Garland: 3-7-9 under the melody in octaves with the 5th inside", () => {
    const cs = jazzVoicingChords("garland", 5);
    expect(cs).toHaveLength(12);
    for (const c of cs) {
      const [lo, mid, hi] = c.right;
      expect([hi - lo, mid - lo]).toEqual([12, 7]);
      expect(c.left[2]).toBeLessThan(lo);
    }
    expect(cs[8].symbol).toBe("Gm7 (Bb)");
  });

  it("Monk: the root and b9 a half step apart on top of the IV and V", () => {
    const cs = jazzVoicingChords("monk", 10);
    expect(pcs(cs[0].right)).toEqual([2, 8, 10]);
    const iv = cs[1].right;
    expect(iv[3] - iv[2]).toBe(1);
    expect(cs[1].name).toContain("Fb");
  });

  it("upper structures: II on a dominant to major, bVI on one to minor", () => {
    const blues = jazzVoicingChords("upper", 0, { tune: "tune-jazz-blues" });
    const f7 = blues.find((c) => c.symbol === "F7")!;
    expect(new Set(pcs(f7.right))).toEqual(new Set([7, 11, 2]));
    const d7 = blues.find((c) => c.symbol === "D7")!;
    expect(new Set(pcs(d7.right))).toEqual(new Set([10, 2, 5]));
    expect(pcs(d7.left)).toEqual([2, 6, 0]);
    expect(UPPER_TUNES.length).toBeGreaterThan(1);
    expect(UPPER_TUNES.length).toBeLessThanOrEqual(TUNES.length);
  });

  it("quartal on a tune: two 4ths in the chord's scale with a 3rd or 7th inside", () => {
    const mv = jazzVoicingChords("quartal-tune", 0, { tune: "tune-maiden-voyage" });
    expect(mv.map((c) => c.symbol)).toEqual(["D7sus4", "F7sus4", "Eb7sus4", "Dbm7"]);
    // D7sus4: A D G (5-1-4); Dbm7: Gb Cb Fb (11-b7-b3).
    expect(pcs(mv[0].left)).toEqual([9, 2, 7]);
    expect(pcs(mv[3].left)).toEqual([6, 11, 4]);
    for (const c of mv) expect(c.left[1] - c.left[0]).toBe(5);
    // Cmaj7 7-3-6, G7 3-6-9 (7-3 is a tritone), Dm7 11-b7-b3.
    const MAJOR = [0, 2, 4, 5, 7, 9, 11];
    expect(quartalStack([0, 4, 7, 11], MAJOR)).toEqual([11, 16, 21]);
    expect(quartalStack([0, 4, 7, 10], [0, 2, 4, 5, 7, 9, 10])).toEqual([4, 9, 14]);
    expect(quartalStack([0, 3, 7, 10], [0, 2, 3, 5, 7, 9, 10])).toEqual([5, 10, 15]);
    // Altered: b7 #9 b13. Diminished has no stack of perfect 4ths, so 7-3 and a 4th on top.
    expect(quartalStack([0, 4, 10, 13, 15, 18, 20], [0, 1, 3, 4, 6, 8, 10])).toEqual([10, 15, 20]);
    expect(quartalStack([0, 3, 6, 9], [0, 2, 3, 5, 6, 8, 9, 11])).toEqual([9, 15, 20]);
  });

  it("slash chords on a tune: a triad over the root", () => {
    const mv = jazzVoicingChords("slash-tune", 0, { tune: "tune-maiden-voyage" });
    // D7sus4 as C/D, Dbm7 as Cb/Db (a minor 11th).
    expect(pcs(mv[0].left)).toEqual([2, 9]);
    expect(new Set(pcs(mv[0].right))).toEqual(new Set([0, 4, 7]));
    expect(mv[0].name).toContain("C/D");
    expect(new Set(pcs(mv[3].right))).toEqual(new Set([11, 3, 6]));
    expect(mv[3].name).toContain("Cb/Db");
    const blues = jazzVoicingChords("slash-tune", 0, { tune: "tune-summertime" });
    const half = blues.find((c) => c.symbol === "Bm7b5")!;
    expect(half.name).toContain("Dm/B");
    expect(new Set(pcs(half.right))).toEqual(new Set([2, 5, 9]));
    const cmaj = blues.find((c) => c.symbol === "Cmaj7")!;
    expect(new Set(pcs(cmaj.right))).toEqual(new Set([7, 11, 2]));
  });

  it("spells chord tones letter by letter", () => {
    expect(chordSpeller("Bb", "7")(11)).toBe("Cb");
    expect(chordSpeller("D", "7")(6)).toBe("F#");
    expect(chordSpeller("G", "m7")(10)).toBe("Bb");
    expect(chordSpeller("Eb", "7")(6)).toBe("F#");
  });
});
