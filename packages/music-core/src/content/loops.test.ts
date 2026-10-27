import { describe, expect, it } from "vitest";
import { parseChordSymbol } from "../theory/chords";
import { pc } from "../theory/notes";
import { SKILL_GRAPH } from "../progress/graph";
import { SONG_PROGRESSIONS } from "./jam";
import {
  CHORD_LOOPS,
  LOOP_SETS,
  loopGroove,
  loopPalette,
  loopPrompt,
  loopsIn,
  numeralChord,
  numeralOfNotes,
  numeralSymbol,
  parseNumeral,
  symbolNumeral,
} from "./loops";
import { rng } from "./random";

const pcs = (ms: number[]) => [...new Set(ms.map(pc))].sort((a, b) => a - b);

describe("numerals", () => {
  it("read accidentals, case, sevenths and secondary dominants", () => {
    expect(parseNumeral("I")).toEqual({ root: 0, intervals: [0, 4, 7] });
    expect(parseNumeral("iv")).toEqual({ root: 5, intervals: [0, 3, 7] });
    expect(parseNumeral("bVII")).toEqual({ root: 10, intervals: [0, 4, 7] });
    expect(parseNumeral("bIII")).toEqual({ root: 3, intervals: [0, 4, 7] });
    expect(parseNumeral("vii°")).toEqual({ root: 11, intervals: [0, 3, 6] });
    expect(parseNumeral("viiø7")).toEqual({ root: 11, intervals: [0, 3, 6, 10] });
    expect(parseNumeral("#i°7")).toEqual({ root: 1, intervals: [0, 3, 6, 9] });
    expect(parseNumeral("Imaj7")).toEqual({ root: 0, intervals: [0, 4, 7, 11] });
    expect(parseNumeral("ii7")).toEqual({ root: 2, intervals: [0, 3, 7, 10] });
    expect(parseNumeral("bII7")).toEqual({ root: 1, intervals: [0, 4, 7, 10] });
    // V7/V in C is D7; V7/vi is E7; V7/IV is C7.
    expect(parseNumeral("V7/V")).toEqual({ root: 2, intervals: [0, 4, 7, 10] });
    expect(parseNumeral("V7/vi")?.root).toBe(4);
    expect(parseNumeral("V7/IV")?.root).toBe(0);
    expect(parseNumeral("X")).toBeNull();
  });

  it("voice the chord with the root in the bass, in the key", () => {
    // bVII in D is C major: C3 in the bass, C E G from middle C.
    expect(numeralChord(2, "bVII")).toEqual([48, 60, 64, 67]);
    expect(numeralSymbol(2, "bVII")).toBe("C");
    expect(numeralSymbol(0, "V7/V")).toBe("D7");
    expect(numeralSymbol(0, "iv")).toBe("Fm");
    expect(numeralSymbol(7, "bII7")).toBe("Ab7");
  });

  it("name a chord symbol in a key", () => {
    expect(symbolNumeral("Am", 0)).toBe("vi");
    expect(symbolNumeral("Bb", 0)).toBe("bVII");
    expect(symbolNumeral("C", 4)).toBe("bVI");
    expect(symbolNumeral("G", 4)).toBe("bIII");
    expect(symbolNumeral("Bdim", 0)).toBe("vii°");
    expect(symbolNumeral("G7", 0)).toBe("V7");
  });

  it("find the numeral a played chord makes, in any inversion", () => {
    const palette = loopPalette("rock");
    expect(numeralOfNotes(2, [60, 64, 67], palette)).toBe("bVII");
    expect(numeralOfNotes(2, [64, 67, 72], palette)).toBe("bVII");
    expect(numeralOfNotes(2, [61, 64, 68], palette)).toBeUndefined();
  });
});

describe("loops", () => {
  it("have unique ids, real numerals and at least three loops a set", () => {
    expect(new Set(CHORD_LOOPS.map((l) => l.id)).size).toBe(CHORD_LOOPS.length);
    for (const set of LOOP_SETS) expect(loopsIn(set.id).length, set.id).toBeGreaterThanOrEqual(3);
    for (const l of CHORD_LOOPS) {
      for (const t of l.numerals) expect(parseNumeral(t), `${l.id} ${t}`).not.toBeNull();
      if (l.bars) expect(l.bars.length, l.id).toBe(l.numerals.length);
    }
  });

  it("turn every song's chords into numerals that sound the same chords", () => {
    for (const p of SONG_PROGRESSIONS) {
      const l = CHORD_LOOPS.find((x) => x.id === p.id)!;
      expect(l.set).toBe("songs");
      expect(l.minor).toBe(p.key.endsWith("minor"));
      p.chords.forEach((ch, i) =>
        expect(pcs(numeralChord(p.keyPc, l.numerals[i])), `${p.id} ${ch.symbol}`).toEqual(
          parseChordSymbol(ch.symbol)!.pcs,
        ),
      );
    }
  });

  it("give each set at most twelve answer buttons holding every numeral it uses", () => {
    for (const set of LOOP_SETS) {
      const palette = loopPalette(set.id);
      expect(palette.length, set.id).toBeLessThanOrEqual(12);
      for (const l of loopsIn(set.id)) for (const t of l.numerals) expect(palette).toContain(t);
    }
    expect(loopPalette("pop")).toEqual(["I", "IV", "V", "vi"]);
  });
});

describe("loopPrompt", () => {
  it("asks every chord of the loop in the run's key, a chord per event, bars long", () => {
    const l = CHORD_LOOPS.find((x) => x.id === "song-knockin-on-heavens-door")!;
    const p = loopPrompt(rng(1), { loop: l, difficulty: 0.3, keyPc: 7 });
    expect(p.drill).toBe("loop");
    expect(p.answer).toBe("I V ii I V IV");
    expect(p.minor).toBe(false);
    expect(p.playback).toHaveLength(6);
    // Am is two bars, so the next G starts four bars in.
    const bar = 4 * p.beat;
    expect(p.playback[3].time).toBeCloseTo(4 * bar);
    expect(pcs(p.playback[2].midi)).toEqual([0, 4, 9]);
    for (const t of p.answer.split(" ")) expect(p.choices).toContain(t);
    expect(p.caption).toContain("G, D, Am, G, D, C");
    for (const id of p.skillIds)
      expect(
        SKILL_GRAPH.skills.some((s) => s.id === id),
        id,
      ).toBe(true);
  });

  it("is minor for a minor loop and deterministic for a seed", () => {
    const l = CHORD_LOOPS.find((x) => x.id === "rock.aeolian-shuttle")!;
    const a = loopPrompt(rng(5), { loop: l, difficulty: 0.5 });
    const b = loopPrompt(rng(5), { loop: l, difficulty: 0.5 });
    expect(a).toEqual(b);
    expect(a.minor).toBe(true);
    expect(a.answer).toBe("i bVII bVI bVII");
  });

  it("plays a loop as a groove with the root in the bass, a short one twice", () => {
    const l = CHORD_LOOPS.find((x) => x.id === "pop.pop-axis")!;
    const p = loopPrompt(rng(2), { loop: l, difficulty: 0.3, keyPc: 0 });
    const g = loopGroove(p);
    const bar = 4 * p.beat;
    const pitched = g.filter((n) => !n.voice);
    // Four bars once: chords on 1 and 3, so 8 hits of a bass note.
    expect(pitched.filter((n) => n.velocity === 0.65)).toHaveLength(8);
    expect(pitched.at(-1)!.time).toBeLessThan(4 * bar);
    // Three bars (I-bVII-IV) play twice.
    const rock = CHORD_LOOPS.find((x) => x.id === "rock.rock-bvii-iv")!;
    const short = loopPrompt(rng(2), { loop: rock, difficulty: 0.3 });
    expect(Math.max(...loopGroove(short).map((n) => n.time))).toBeGreaterThan(5 * 4 * short.beat);
    expect(g.some((n) => n.voice === "drum" && n.midi === 38)).toBe(true);
    // The bass under the second chord (G) is a G.
    const second = pitched.filter((n) => Math.abs(n.time - bar) < 1e-6 && n.velocity === 0.65);
    expect(second.map((n) => pc(n.midi))).toEqual([7]);
  });
});
