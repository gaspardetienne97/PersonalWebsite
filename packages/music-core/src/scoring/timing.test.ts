import { describe, expect, it } from "vitest";
import {
  alignChangeClusters,
  claim,
  clusterByGap,
  evenness,
  matchWindowMs,
  timingCredit,
  timingVerdict,
  togetherBeats,
} from "./timing";

describe("matchWindowMs", () => {
  it("scales by strictness and sqrt(duration), clamped 35..300", () => {
    expect(matchWindowMs(500, 1, "relaxed")).toBe(120);
    expect(matchWindowMs(500, 1, "normal")).toBe(80);
    expect(matchWindowMs(500, 1, "strict")).toBe(50);
    expect(matchWindowMs(600, 2, "normal")).toBe(136);
    expect(matchWindowMs(500, 0.1, "strict")).toBe(35); // duration floored at 0.25, then the 35 floor
    expect(matchWindowMs(2000, 4, "relaxed")).toBe(300);
  });
});

describe("timingVerdict", () => {
  it("positive is late, pocket is ±15 by default", () => {
    expect(timingVerdict(-16)).toBe("early");
    expect(timingVerdict(-15)).toBe("pocket");
    expect(timingVerdict(15)).toBe("pocket");
    expect(timingVerdict(16)).toBe("late");
    expect(timingVerdict(25, 30)).toBe("pocket");
  });
  it("timing credit is linear inside the window", () => {
    expect(timingCredit(20, 80)).toBe(0.75);
    expect(timingCredit(-100, 80)).toBe(0);
  });
});

describe("claim", () => {
  const at = (xs: number[]) => xs.map((x) => ({ at: x }));

  it("a missed note does not shift later hits", () => {
    const r = claim(at([0, 500, 1000, 1500]), at([3, 1004, 1497]), 200);
    expect(r.claims).toEqual([
      { hit: 0, errorMs: 3 },
      null,
      { hit: 1, errorMs: 4 },
      { hit: 2, errorMs: -3 },
    ]);
    expect(r.extras).toEqual([]);
  });

  it("a double onset cannot answer the same target twice", () => {
    const r = claim(at([0]), at([0, 10]), 100);
    expect(r.claims).toEqual([{ hit: 0, errorMs: 0 }]);
    expect(r.extras).toEqual([1]);
  });

  it("nearest pairs win", () => {
    const r = claim(at([0, 100]), at([60]), 80);
    expect(r.claims).toEqual([null, { hit: 0, errorMs: -40 }]);
  });

  it("honours the per-target predicate and returns extras in time order", () => {
    const targets = [{ at: 0, midi: 60 }];
    const hits = [
      { at: 5, midi: 61 },
      { at: -2, midi: 62 },
      { at: 8, midi: 60 },
    ];
    const r = claim(targets, hits, 50, (t, h) => t.midi === h.midi);
    expect(r.claims).toEqual([{ hit: 2, errorMs: 8 }]);
    expect(r.extras).toEqual([1, 0]);
  });

  it("slack gives zero error across a late-side span", () => {
    const t = [{ at: 0, slackMs: 100 }];
    expect(claim(t, at([60]), 50).claims[0]?.errorMs).toBe(0);
    expect(claim(t, at([130]), 50).claims[0]?.errorMs).toBe(30);
    expect(claim(t, at([-20]), 50).claims[0]?.errorMs).toBe(-20);
    expect(claim(t, at([160]), 50).claims[0]).toBeNull();
  });
});

describe("evenness", () => {
  const pts = (actual: number[]) => actual.map((a, i) => ({ expected: i * 500, actual: a }));
  it("scores mean spacing error against 180 ms", () => {
    expect(evenness(pts([0, 500, 1000]), 500)).toEqual({ score: 1, errorMs: 0 });
    expect(evenness(pts([0, 518, 1000, 1500]), 500).errorMs).toBe(12);
    expect(evenness(pts([0, 518, 1000, 1500]), 500).score).toBeCloseTo(1 - 12 / 180, 10);
  });
  it("no spacings means the full target spacing as error", () => {
    expect(evenness([], 600)).toEqual({ score: 0, errorMs: 600 });
    expect(evenness(pts([0]), 90)).toEqual({ score: 0.5, errorMs: 90 });
  });
});

describe("togetherBeats", () => {
  it("pairs by half-beat chunks and counts hands within 40 ms", () => {
    const r = togetherBeats([0, 500, 1000], [10, 560, 1500], 500);
    expect(r.beats.map((b) => b.together)).toEqual([true, false, false, false]);
    expect(r.together).toBe(1);
    expect(r.beats[2]).toEqual({ at: 1000, left: 1000, together: false });
  });
});

describe("chord-change clusters", () => {
  it("splits on gaps longer than 350 ms", () => {
    const notes = [0, 20, 40, 390, 900, 920].map((at, i) => ({ at, midi: 60 + i }));
    expect(clusterByGap(notes).map((c) => [c.start, c.end, c.midis.length])).toEqual([
      [0, 390, 4],
      [900, 920, 2],
    ]);
  });

  it("untimed mode alternates the pair", () => {
    const c = clusterByGap([0, 1000, 2000].map((at) => ({ at, midi: 60 })));
    expect(alignChangeClusters(c).slots.map((s) => s.target)).toEqual([0, 1, 0]);
  });

  it("timed mode assigns clusters to their nearest beat and keeps the nearest per window", () => {
    const c = clusterByGap([30, 1990, 2400, 4000].map((at) => ({ at, midi: 60 })));
    const r = alignChangeClusters(c, { periodMs: 2000, anchorAt: 0 });
    expect(r.slots.map((s) => [s.slot, s.target, s.errorMs])).toEqual([
      [0, 0, 30],
      [1, 1, -10],
      [2, 0, 0],
    ]);
    expect(r.unassigned).toEqual([2]);
  });
});
