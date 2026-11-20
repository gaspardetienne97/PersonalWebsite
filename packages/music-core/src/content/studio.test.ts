import { describe, expect, it } from "vite-plus/test";
import { rng } from "./random";
import {
  BAND_SETS,
  bellDb,
  delayLabel,
  gradeStudio,
  OCTAVE_Q,
  studioPrompt,
  type StudioSetup,
} from "./studio";

const setup = (over: Partial<StudioSetup> = {}): StudioSetup => ({
  exercise: "peak",
  bands: "3",
  gainDb: 12,
  levels: [6, 3],
  pans: "3",
  ...over,
});

describe("studio ears", () => {
  it("boosts or cuts one octave band from the set", () => {
    for (let seed = 1; seed < 30; seed++) {
      const p = studioPrompt(rng(seed), setup());
      expect(BAND_SETS["3"].map(String)).toContain(p.answer);
      expect(p.change.eq).toEqual({ freq: Number(p.answer), gainDb: 12, q: OCTAVE_Q });
      const cut = studioPrompt(rng(seed), setup({ exercise: "cut", bands: "9", gainDb: 6 }));
      expect(cut.change.eq!.gainDb).toBe(-6);
      expect(cut.choices).toHaveLength(9);
    }
  });

  it("asks the missed bands more", () => {
    const answers = Array.from(
      { length: 400 },
      (_, i) => studioPrompt(rng(i + 1), setup(), (a) => (a === "4000" ? 10 : 1)).answer,
    );
    expect(answers.filter((a) => a === "4000").length).toBeGreaterThan(250);
  });

  it("gives half credit an octave off on the 9 bands, none on the spread-out sets", () => {
    const nine = studioPrompt(rng(3), setup({ bands: "9" }));
    const i = nine.choices.indexOf(nine.answer);
    const next = nine.choices[i === 0 ? 1 : i - 1];
    expect(gradeStudio(nine, next)).toEqual({ score: 0.5, correct: false, near: true });
    expect(gradeStudio(nine, nine.answer)).toMatchObject({ score: 1, correct: true });
    const three = studioPrompt(rng(3), setup());
    const other = three.choices.find(
      (c) =>
        c !== three.answer &&
        Math.abs(three.choices.indexOf(c) - three.choices.indexOf(three.answer)) === 1,
    )!;
    expect(gradeStudio(three, other).score).toBe(0);
  });

  it("levels and pans are answered by the step, a step off is near", () => {
    const lvl = studioPrompt(rng(2), setup({ exercise: "level", levels: [6, 3, 2, 1] }));
    expect(lvl.change.levelDb).toBe(Number(lvl.answer));
    const pan = studioPrompt(rng(2), setup({ exercise: "pan", pans: "5" }));
    expect(pan.change.pan).toBe(Number(pan.answer));
    expect(pan.choices).toEqual(["-1", "-0.5", "0", "0.5", "1"]);
    // Every choice can be the answer, centre included (Changed then sounds like Flat).
    const answers = new Set<string>();
    for (let seed = 1; seed < 60; seed++)
      answers.add(studioPrompt(rng(seed), setup({ exercise: "pan" })).answer);
    expect([...answers].sort()).toEqual(["-1", "0", "1"]);
  });

  it("draws the bell at its gain in the centre, falling away an octave out", () => {
    const eq = { freq: 1000, gainDb: 12, q: OCTAVE_Q };
    expect(bellDb(1000, eq)).toBeCloseTo(12);
    expect(bellDb(2000, eq)).toBeLessThan(3);
  });

  it("compression is none, light or heavy, and none changes nothing", () => {
    const seen = new Set<string>();
    for (let seed = 1; seed < 40; seed++) {
      const p = studioPrompt(rng(seed), setup({ exercise: "compression" }));
      seen.add(p.answer);
      expect(p.change.comp ?? "none").toBe(p.answer);
      expect(p.choices).toEqual(["none", "light", "heavy"]);
    }
    expect(seen.size).toBe(3);
    const heavy = studioPrompt(rng(1), setup({ exercise: "compression" }), (a) =>
      a === "heavy" ? 100 : 0.001,
    );
    expect(gradeStudio(heavy, "light")).toMatchObject({ score: 0.5, near: true });
  });

  it("delay times are note values at the loops' 90 BPM", () => {
    const p = studioPrompt(rng(2), setup({ exercise: "delay", delays: "4" }));
    expect(p.choices).toEqual(["167", "333", "500", "667"]);
    expect(p.change.delayMs).toBe(Number(p.answer));
    expect(["167", "333", "500", "667"].map((x) => delayLabel(Number(x)))).toEqual([
      "1/16, 167 ms",
      "1/8, 333 ms",
      "Dotted 1/8, 500 ms",
      "1/4, 667 ms",
    ]);
  });
});
