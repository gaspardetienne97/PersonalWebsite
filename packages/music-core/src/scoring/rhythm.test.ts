import { describe, expect, it } from "vitest";
import patterns from "../data/rhythm-patterns.json";
import { gradeOnsets, gradePattern, gradePulse, type RhythmPattern } from "./rhythm";

const beats = [0, 500, 1000, 1500];

describe("gradePulse", () => {
  it("scores 1 - meanAbsErr/160 and names the direction", () => {
    const r = gradePulse(
      beats.map((b) => b + 10),
      beats,
      500,
    );
    expect(r.score).toBeCloseTo(1 - 10 / 160, 10);
    expect(r.correct).toBe(true);
    expect(r.direction).toBe("centered");
    expect(
      gradePulse(
        beats.map((b) => b - 30),
        beats,
        500,
      ),
    ).toMatchObject({ score: 1 - 30 / 160, correct: false, direction: "ahead" });
    expect(
      gradePulse(
        beats.map((b) => b + 25),
        beats,
        500,
      ).direction,
    ).toBe("behind");
  });

  it("reports jitter as the stdev of signed errors", () => {
    expect(gradePulse([10, 490, 1010, 1490], beats, 500).jitterMs).toBe(10);
  });

  it("an empty run scores zero, and a skipped beat is not free", () => {
    expect(gradePulse([], beats, 500).score).toBe(0);
    expect(gradePulse([0, 500, 1000], beats, 500)).toMatchObject({ score: 0.75, missed: 1 });
  });
});

const byId = (id: string) => patterns.find((p) => p.id === id) as unknown as RhythmPattern;
const clock = { startAt: 1000, beatMs: 500 };
const hitsAt = (beatsList: number[]) => beatsList.map((b) => ({ at: 1000 + b * 500 }));

describe("gradePattern", () => {
  it("a clean quarter pulse scores 1 with a window of half the smallest spacing", () => {
    const r = gradePattern(byId("quarter-pulse"), hitsAt([0, 1, 2, 3]), clock);
    expect(r).toMatchObject({ score: 1, correct: true, windowMs: 250, matched: 4 });
    expect(r.grid.map((g) => g.verdict)).toEqual(["pocket", "pocket", "pocket", "pocket"]);
  });

  it("a missed event costs 0.2 and does not shift later hits", () => {
    const hits = [{ at: 1000 }, { at: 2008 }, { at: 2500 }];
    const r = gradePattern(byId("quarter-pulse"), hits, clock);
    expect(r.missed).toBe(1);
    expect(r.grid.map((g) => g.errorMs)).toEqual([0, undefined, 8, 0]);
    expect(r.score).toBeCloseTo(1 - 8 / 3 / 160 - 0.2, 10);
  });

  it("extra hits cost 0.1 each, capped at 0.3", () => {
    expect(
      gradePattern(byId("quarter-pulse"), [...hitsAt([0, 1, 2, 3]), { at: 1010 }], clock).score,
    ).toBeCloseTo(0.9, 10);
    const many = [...hitsAt([0, 1, 2, 3]), ...[1, 2, 3, 4, 5].map((k) => ({ at: 1000 + k * 3 }))];
    expect(gradePattern(byId("quarter-pulse"), many, clock).score).toBeCloseTo(0.7, 10);
  });

  it("hits in a rest cost 0.2 each, capped at 0.5, and are never eligible", () => {
    const r = gradePattern(byId("eighth-rests"), hitsAt([0, 0.5, 1, 2, 3]), clock);
    expect(r).toMatchObject({ restHits: 1, matched: 4, extra: 0 });
    expect(r.score).toBeCloseTo(0.8, 10);
    // tapping the downbeats of the off-beat pattern: 4 rest hits, 4 misses, no timing credit
    const off = gradePattern(byId("off-beats"), hitsAt([0, 1, 2, 3]), clock);
    expect(off).toMatchObject({ restHits: 4, missed: 4, timingScore: 0, score: 0 });
  });

  it("an empty performance has timing score 0, not a free 0 ms", () => {
    expect(gradePattern(byId("quarter-pulse"), [], clock)).toMatchObject({
      timingScore: 0,
      score: 0,
      correct: false,
    });
  });

  const strum: RhythmPattern = {
    events: [
      { id: "a", beat: 0, stroke: "down" },
      { id: "m", beat: 1, stroke: "mute" },
      { id: "b", beat: 2, stroke: "down" },
      { id: "c", beat: 3, stroke: "down" },
    ],
    chords: [
      { symbol: "G", pitchClasses: [2, 7, 11], startBeat: 0, durationBeats: 2 },
      { symbol: "C", pitchClasses: [0, 4, 7], startBeat: 2, durationBeats: 2 },
    ],
  };

  it("a mute counts only when an onset landed and nothing pitched did", () => {
    const g = [2, 7, 11];
    const ok = gradePattern(
      strum,
      [
        { at: 1000, pcs: g },
        { at: 1500 },
        { at: 2000, pcs: [0, 4, 7] },
        { at: 2500, pcs: [0, 4, 7] },
      ],
      clock,
    );
    expect(ok.missed).toBe(0);
    const rang = gradePattern(
      strum,
      [
        { at: 1000, pcs: g },
        { at: 1500, pcs: g },
        { at: 2000, pcs: [0, 4, 7] },
        { at: 2500, pcs: [0, 4, 7] },
      ],
      clock,
    );
    expect(rang.missed).toBe(1);
    expect(rang.grid[1].verdict).toBe("missed");
  });

  it("grades chords when pitch was heard, timing only otherwise", () => {
    const heard = gradePattern(
      strum,
      [
        { at: 1000, pcs: [7, 11, 2] },
        { at: 1500 },
        { at: 2000, pcs: [0, 4] },
        { at: 2500, pcs: [4] },
      ],
      clock,
    );
    expect(heard.chords).toEqual([
      { symbol: "G", held: true, missing: [] },
      { symbol: "C", held: false, missing: [7] },
    ]);
    expect(heard.notMeasured).toEqual([]);
    const silent = gradePattern(strum, hitsAt([0, 1, 2, 3]), clock);
    expect(silent.chords).toBeNull();
    expect(silent.notMeasured).toEqual(["chords"]);
  });
});

describe("gradeOnsets", () => {
  it("counts misses and extras against the matched onsets", () => {
    expect(gradeOnsets([0, 1, 1.5, 2], [0, 1, 1.5, 2])).toMatchObject({ score: 1, correct: true });
    const g = gradeOnsets([0, 1, 1.5, 2], [0, 1, 2, 3]);
    expect(g.score).toBeCloseTo(3 / 5);
    expect(g.correct).toBe(false);
  });
});
