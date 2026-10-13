import { describe, expect, it } from "vitest";
import { CIRCLE_MODES, circlePrompt, countLabel, gradeCircle, KEY_BANDS } from "./circle";
import { rng } from "./random";

const seeds = (n: number) => Array.from({ length: n }, (_, i) => rng(i + 1));

describe("circle of fifths drills", () => {
  it("always offers the answer, and keeps to the band", () => {
    for (const m of CIRCLE_MODES)
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
    expect(asks.some((p) => /^How many/.test(p.ask))).toBe(true);
    expect(asks.some((p) => /^Which major key has/.test(p.ask))).toBe(true);
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
