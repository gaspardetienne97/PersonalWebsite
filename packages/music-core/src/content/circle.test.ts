import { describe, expect, it } from "vite-plus/test";
import {
  analysisPrompts,
  barLabel,
  chordIn,
  CIRCLE_MODES,
  circlePrompt,
  countLabel,
  gradeCircle,
  KEY_BANDS,
} from "./circle";
import { rng } from "./random";

const seeds = (n: number) => Array.from({ length: n }, (_, i) => rng(i + 1));

describe("circle of fifths drills", () => {
  it("always offers the answer, and keeps to the band", () => {
    // Analysis answers a key and a function at once: its own test below.
    for (const m of CIRCLE_MODES.filter((x) => x.id !== "analysis"))
      for (const b of KEY_BANDS)
        for (const r of seeds(25)) {
          const p = circlePrompt(r, {
            mode: m.id,
            band: b.id,
            minor: true,
            clefs: ["treble", "bass"],
          });
          expect(p.choices, `${m.id} ${b.id} ${p.ask}`).toContain(p.answer);
          expect(new Set(p.choices).size).toBe(p.choices.length);
          if (m.id !== "order" && m.id !== "neighbours")
            expect(Math.abs(p.fifths)).toBeLessThanOrEqual(b.max);
          expect(p.skillIds).toEqual(["theory.circle", m.skillId]);
        }
  });

  it("asks both ways: a key's count, and the key for a count", () => {
    const asks = seeds(40).map((r) => circlePrompt(r, { mode: "count", band: "four" }));
    expect(asks.some((p) => p.ask.startsWith("How many"))).toBe(true);
    expect(asks.some((p) => p.ask.startsWith("Which major key has"))).toBe(true);
    const e = asks.find((p) => p.ask === "How many sharps or flats in E major?");
    if (e) expect(e.answer).toBe("4♯");
    expect([3, -2, 0].map(countLabel)).toEqual(["3♯", "2♭", "0"]);
  });

  it("knows the order, the neighbours, the chords and the wheel", () => {
    for (const r of seeds(40)) {
      const o = circlePrompt(r, { mode: "order", band: "all" });
      if (o.ask === "The third sharp?") expect(o.answer).toBe("G#");
      if (o.ask === "Which flat comes after Eb?") expect(o.answer).toBe("Ab");
      expect(o.choices.map((c) => c[0])).toEqual(["C", "D", "E", "F", "G", "A", "B"]);
      const n = circlePrompt(r, { mode: "neighbours", band: "four" });
      if (n.ask === "One more sharp than A major?") expect(n.answer).toBe("E");
      if (n.ask === "The relative minor of Eb major?") expect(n.answer).toBe("Cm");
      const c = circlePrompt(r, { mode: "chords", band: "two" });
      if (c.ask === "The vi chord in D major?") expect(c.answer).toBe("Bm");
      const w = circlePrompt(r, { mode: "wheel", band: "all" });
      if (w.ask === "Tap where Bb major goes.") expect(w.answer).toBe("10");
    }
  });

  it("spots borrowed chords and secondary dominants in written progressions", () => {
    // C major: iv Fm, bVI Ab, bVII Bb, bIII Eb; V/V D7, V/vi E7, V/ii A7, V/IV C7.
    expect(["iv", "bVI", "bVII", "bIII"].map((n) => chordIn(0, n))).toEqual([
      "Fm",
      "Ab",
      "Bb",
      "Eb",
    ]);
    expect(["V/V", "V/vi", "V/ii", "V/IV"].map((n) => chordIn(0, n))).toEqual([
      "D7",
      "E7",
      "A7",
      "C7",
    ]);
    expect(chordIn(-1, "bVII")).toBe("Eb");
    const borrowed = seeds(30).map((r) => circlePrompt(r, { mode: "borrowed", band: "near" }));
    for (const p of borrowed) {
      expect(p.ask).toMatch(/Which chord is borrowed from (C|G|F) minor\?$/);
      expect(p.choices).toHaveLength(new Set(p.choices).size);
    }
    const c = borrowed.find((p) => p.ask.startsWith("C major: C | F | Fm | C"));
    if (c) expect(c.answer).toBe("Fm");
    const sec = seeds(40).map((r) => circlePrompt(r, { mode: "secondary", band: "near" }));
    expect(sec.some((p) => /V of which chord/.test(p.ask))).toBe(true);
    const d7 = sec.find((p) => p.ask.startsWith("C major: C | D7 | G | C. D7 is the V of"));
    if (d7) expect(d7.answer).toBe("V");
  });

  it("asks the weak keys more", () => {
    const ks = seeds(300).map(
      (r) => circlePrompt(r, { mode: "count", band: "four" }, (f) => (f === -4 ? 20 : 1)).fifths,
    );
    expect(ks.filter((f) => f === -4).length).toBeGreaterThan(150);
  });

  it("counts a slow right answer as three quarters", () => {
    const p = circlePrompt(rng(1), { mode: "count", band: "near" });
    expect(gradeCircle(p, p.answer, 1200)).toEqual({ correct: true, slow: false, score: 1 });
    expect(gradeCircle(p, p.answer, 4000)).toEqual({ correct: true, slow: true, score: 0.75 });
    expect(gradeCircle(p, "nope", 500).score).toBe(0);
  });
});

describe("tune analysis prompts", () => {
  it("asks every chord once, with the tune's keys and the functions it needs", () => {
    const ps = analysisPrompts("tune-all-the-things-you-are");
    expect(ps).toHaveLength(36);
    expect(ps[0]).toMatchObject({ ask: "Bar 1: Fm7", answer: "Ab|vi", fifths: -4 });
    expect(ps[5]).toMatchObject({ ask: "Bar 6, first half: Dm7", answer: "C|ii", fifths: 0 });
    expect(ps[6].ask).toBe("Bar 6, second half: G7");
    expect(ps[7].ask).toBe("Bars 7 to 8: Cmaj7");
    expect(ps[0].analysis!.keys).toEqual(["Ab", "C", "Eb", "G", "E"]);
    for (const p of ps) {
      const [key, fn] = p.answer.split("|");
      expect(p.analysis!.keys).toContain(key);
      expect(p.choices).toContain(fn);
    }
    expect(analysisPrompts("tune-autumn-leaves").find((p) => p.answer === "Gm|i")?.fifths).toBe(-2);
    expect(barLabel(8.5, 0.5)).toBe("Bar 9, second half");
  });

  it("gives half credit for the key or the function alone, and is never slow", () => {
    const p = analysisPrompts("tune-autumn-leaves")[0];
    expect(p.answer).toBe("Bb|ii");
    expect(gradeCircle(p, "Bb|ii", 60_000)).toEqual({ correct: true, slow: false, score: 1 });
    expect(gradeCircle(p, "Bb|V", 1000).score).toBe(0.5);
    expect(gradeCircle(p, "Gm|ii", 1000).score).toBe(0.5);
    expect(gradeCircle(p, "Gm|i", 1000)).toMatchObject({ correct: false, score: 0 });
  });
});
