import { describe, expect, it } from "vite-plus/test";
import { T0, ev } from "./fixtures";
import { ingestAnalytics, skillSummaries, topConfusions, weakestSkills } from "./analytics";
import { DAY_MS } from "./mastery";
import {
  buildQueue,
  orderEarQueue,
  presentedDifficulty,
  retrySchedule,
  reviewIntervalDays,
  type QueueItem,
} from "./scheduler";

describe("ingestAnalytics", () => {
  const events = [
    ev({ id: "a", partialCredit: 1, correct: true, latencyMs: 400 }),
    ev({
      id: "b",
      partialCredit: 0.5,
      correct: false,
      latencyMs: 600,
      at: T0 + 5,
      metrics: [
        { kind: "choice", expected: "m6", actual: "P5" },
        { kind: "pitch", expectedMidi: 60, actualMidi: 61 },
        { kind: "pitch", expectedMidi: 60, actualMidi: 72 },
        { kind: "chord", expectedPcs: [0], actualPcs: [0], missing: [], extra: [] },
      ],
    }),
  ];

  it("keeps accuracy, mean score, consistency, reaction and chord-switch times", () => {
    const { stats } = ingestAnalytics({}, [], events);
    const s = skillSummaries(stats)["pitch.interval.m3"];
    expect(s.attempts).toBe(2);
    expect(s.accuracy).toBe(0.5);
    expect(s.meanScore).toBe(0.75);
    expect(s.consistency).toBeCloseTo(0.5, 10); // stdev 0.25
    expect(s.meanReactionMs).toBe(500);
    expect(s.meanChordSwitchMs).toBe(600);
    expect(s.lastPracticed).toBe(T0 + 5);
    // pitch reduced to pitch classes; an octave slip is not a confusion
    expect(s.confusions).toEqual({ m6: { P5: 1 }, C: { "C#": 1 } });
  });

  it("is idempotent by event id", () => {
    const once = ingestAnalytics({}, [], events);
    const twice = ingestAnalytics(once.stats, once.processed, events);
    expect(twice.stats).toEqual(once.stats);
    expect(twice.changed).toEqual([]);
  });

  it("scopes weakest skills by instrument and independence, more attempts first on ties", () => {
    const { stats } = ingestAnalytics(
      {},
      [],
      [
        ev({ id: "p1", instrument: "piano", skillIds: ["a"], correct: false, partialCredit: 0 }),
        ev({ id: "g1", instrument: "guitar", skillIds: ["b"], correct: false, partialCredit: 0 }),
        ev({ id: "g2", instrument: "guitar", skillIds: ["c"], correct: false, partialCredit: 0 }),
        ev({ id: "g3", instrument: "guitar", skillIds: ["c"], correct: false, partialCredit: 0 }),
        ev({
          id: "g4",
          instrument: "guitar",
          skillIds: ["d"],
          assistance: "guided",
          correct: false,
          partialCredit: 0,
        }),
      ],
    );
    const guitar = weakestSkills(stats, {
      instrument: "guitar",
      independentOnly: true,
      minAttempts: 1,
    });
    expect(guitar.map((s) => s.skillId)).toEqual(["c", "b"]);
    expect(
      weakestSkills(stats, { instrument: "guitar", minAttempts: 2 }).map((s) => s.skillId),
    ).toEqual(["c"]);
    expect(weakestSkills(stats, { minAttempts: 1 })).toHaveLength(4);
  });
});

describe("scheduler", () => {
  it("computes the review interval and presented difficulty", () => {
    expect(reviewIntervalDays(0, 0)).toBe(1);
    expect(reviewIntervalDays(3, 0.5)).toBe(5); // 2^2 * 1.25
    expect(reviewIntervalDays(20, 1)).toBe(256 * 1.75);
    const s = (accuracy: number, attempts: number) => ({ accuracy, attempts }) as never;
    expect(presentedDifficulty(0.5)).toBeCloseTo(0.6, 10);
    expect(presentedDifficulty(0.5, s(0.9, 2))).toBeCloseTo(0.7, 10);
    expect(presentedDifficulty(0.5, s(0.5, 2))).toBeCloseTo(0.5, 10);
    expect(presentedDifficulty(0.5, s(0.9, 1))).toBeCloseTo(0.6, 10);
    expect(presentedDifficulty(1, s(0.9, 2))).toBe(0.9);
  });

  it("queues unlocked skills with priority and reason", () => {
    const events = [
      ev({ id: "a", skillIds: ["pitch.interval.P5"], correct: false, partialCredit: 0.2 }),
      ev({ id: "b", skillIds: ["pitch.interval.P5"], correct: false, partialCredit: 0.4 }),
    ];
    const { stats } = ingestAnalytics({}, [], events);
    const summaries = skillSummaries(stats, { independentOnly: true });
    const state = {
      "pitch.interval.P5": {
        skillId: "pitch.interval.P5",
        mastery: 0.2,
        confidence: 0.2,
        decayRate: 0,
        lastPracticed: T0,
        observations: 2,
      },
    };
    const q = buildQueue(
      [
        {
          id: "ear.intervals",
          skillIds: ["pitch.interval.P5", "pitch.interval.m3"],
          drill: "interval",
        },
        { id: "ear.chords", skillIds: ["harmony.seventh.dominant"], drill: "chord-quality" },
      ],
      state,
      summaries,
      T0 + 2 * DAY_MS,
    );
    expect(q.map((i) => i.skillId)).toEqual(["pitch.interval.P5", "pitch.interval.m3"]); // dominant 7th locked
    const [p5, m3] = q;
    // elapsed 2 / interval 2*0.95, weakness 0.7, top weak rank 1
    expect(p5.priority).toBeCloseTo(2 / 1.9 + 0.7 * 1.5 + 0.5, 10);
    expect(p5.reason).toBe("weakness");
    expect(p5.difficulty).toBeCloseTo(0.4 + 0.08 - 0.1, 10);
    expect(m3.priority).toBeCloseTo(1 + 0.5 * 1.5, 10);
    expect(m3.reason).toBe("new");
  });

  const item = (drill: string, priority: number): QueueItem => ({
    exerciseId: drill,
    skillId: `${drill}-${priority}`,
    drill,
    priority,
    reason: "review",
    difficulty: 0.5,
  });
  const queue = [
    item("interval", 9),
    item("interval", 8),
    item("interval", 7),
    item("cadence", 6),
    item("scale-degree", 5),
    item("reading", 4),
  ];

  it("orders ear prompts balanced (round-robin) or adaptive (no repeats)", () => {
    expect(orderEarQueue(queue, "balanced").map((i) => i.skillId)).toEqual([
      "interval-9",
      "scale-degree-5",
      "cadence-6",
      "interval-8",
      "interval-7",
    ]);
    expect(orderEarQueue(queue, "adaptive").map((i) => i.skillId)).toEqual([
      "interval-9",
      "cadence-6",
      "interval-8",
      "scale-degree-5",
      "interval-7",
    ]);
  });

  it("schedules retries from the top confusions, one per skill", () => {
    const { stats } = ingestAnalytics(
      {},
      [],
      [
        ev({
          id: "1",
          skillIds: ["x"],
          metrics: [{ kind: "choice", expected: "m6", actual: "P5" }],
        }),
        ev({
          id: "2",
          skillIds: ["x"],
          metrics: [{ kind: "choice", expected: "m6", actual: "P5" }],
        }),
        ev({
          id: "3",
          skillIds: ["x"],
          metrics: [{ kind: "choice", expected: "M3", actual: "P4" }],
        }),
        ev({
          id: "4",
          skillIds: ["y"],
          metrics: [{ kind: "choice", expected: "maj", actual: "aug" }],
        }),
      ],
    );
    const summaries = skillSummaries(stats);
    expect(topConfusions(summaries)[0]).toEqual({
      skillId: "x",
      expected: "m6",
      actual: "P5",
      count: 2,
    });
    expect(retrySchedule(summaries)).toEqual([
      { skillId: "x", expected: "m6", actual: "P5", count: 2, difficulty: 0.5 },
      { skillId: "y", expected: "maj", actual: "aug", count: 1, difficulty: 0.5 },
    ]);
  });
});
