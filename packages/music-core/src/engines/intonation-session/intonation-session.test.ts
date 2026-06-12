import { describe, expect, test } from "vitest";

import { IntonationSession } from "./index";

/** Push a run of samples spaced `stepMs` apart starting at `t0`. */
function feed(
  session: IntonationSession,
  centsValues: number[],
  { t0 = 0, stepMs = 100, clarity = 0.9 } = {},
): void {
  centsValues.forEach((cents, i) => session.push({ cents, clarity, t: t0 + i * stepMs }));
}

describe("IntonationSession", () => {
  test("reports no data before any sample", () => {
    const s = new IntonationSession();
    expect(s.stats).toEqual({
      inTunePercent: 0,
      holdSeconds: 0,
      steadiness: 0,
      avgDriftCents: 0,
      trace: [],
      sampleCount: 0,
      hasData: false,
    });
  });

  test("computes in-tune % and average drift over the window", () => {
    const s = new IntonationSession({ toleranceCents: 10 });
    feed(s, [0, 5, 20, -30]); // two within ±10, two outside
    const stats = s.stats;
    expect(stats.inTunePercent).toBe(50);
    expect(stats.avgDriftCents).toBeCloseTo((0 + 5 + 20 + 30) / 4, 6);
    expect(stats.sampleCount).toBe(4);
    expect(stats.hasData).toBe(true);
  });

  test("accumulates hold seconds across a continuous in-tune run", () => {
    const s = new IntonationSession({ toleranceCents: 10 });
    feed(s, [2, -3, 4, 1], { stepMs: 100 }); // 4 samples, 300 ms span, all in tune
    expect(s.stats.holdSeconds).toBeCloseTo(0.3, 6);
  });

  test("resets hold the moment a sample goes out of tune", () => {
    const s = new IntonationSession({ toleranceCents: 10 });
    feed(s, [2, 2, 2], { stepMs: 100 });
    expect(s.stats.holdSeconds).toBeCloseTo(0.2, 6);
    s.push({ cents: 40, clarity: 0.9, t: 300 }); // out of tune
    expect(s.stats.holdSeconds).toBe(0);
    s.push({ cents: 1, clarity: 0.9, t: 400 }); // back in tune — new run from 0
    expect(s.stats.holdSeconds).toBe(0);
  });

  test("steadiness is high for a tight spread and low for a wide one", () => {
    const tight = new IntonationSession({ steadinessRangeCents: 20 });
    feed(tight, [1, -1, 0, 1, -1]);
    expect(tight.stats.steadiness).toBeGreaterThan(90);

    const wide = new IntonationSession({ steadinessRangeCents: 20 });
    feed(wide, [-40, 40, -40, 40]);
    expect(wide.stats.steadiness).toBe(0);
  });

  test("drops samples older than the window", () => {
    const s = new IntonationSession({ windowMs: 1_000, toleranceCents: 10 });
    feed(s, [50, 50, 50, 50, 50], { t0: 0, stepMs: 100 }); // t = 0..400
    s.push({ cents: 0, clarity: 0.9, t: 1500 }); // window now [500, 1500] → only this
    const stats = s.stats;
    expect(stats.sampleCount).toBe(1);
    expect(stats.inTunePercent).toBe(100);
    expect(stats.trace).toEqual([0]);
  });

  test("trace is oldest→newest and capped to maxTracePoints", () => {
    const s = new IntonationSession({ windowMs: 1_000_000, maxTracePoints: 3 });
    feed(s, [1, 2, 3, 4, 5], { stepMs: 1 });
    expect(s.stats.trace).toEqual([3, 4, 5]);
  });

  test("reset clears samples and hold", () => {
    const s = new IntonationSession();
    feed(s, [1, 2, 3]);
    s.reset();
    expect(s.stats.hasData).toBe(false);
    expect(s.stats.holdSeconds).toBe(0);
  });
});
