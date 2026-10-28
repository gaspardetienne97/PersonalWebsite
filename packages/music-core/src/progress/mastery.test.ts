import { describe, expect, it } from "vitest";
import type { SkillMastery } from "../types";
import { T0, ev } from "./fixtures";
import {
  applyEvidence,
  DAY_MS,
  DECAY_RATE_RANGE,
  decayMastery,
  ingestEvents,
  isDueForReview,
  REVIEW_DROP,
} from "./mastery";
import {
  aggregateMastery,
  capabilitySummary,
  isUnlocked,
  SKILL_GRAPH,
  withDescendants,
} from "./graph";

describe("applyEvidence", () => {
  it("folds evidence in with the EMA and difficulty weight", () => {
    const a = applyEvidence(undefined, "s", 1, 0.5, T0);
    expect(a.mastery).toBeCloseTo(0.3, 10); // weight 1, learn rate 0.3
    expect(a.observations).toBe(1);
    expect(a.confidence).toBeCloseTo(1 / 9, 10);
    expect(a.lastMeasured).toBeCloseTo(0.3, 10);
    const b = applyEvidence(a, "s", 1, 1, T0);
    expect(b.mastery).toBeCloseTo(0.3 + 0.45 * 0.7, 10); // weight 1.5, learn rate 0.45
    expect(b.confidence).toBeCloseTo(0.2, 10);
  });

  it("decays to the event time before folding in", () => {
    const m = { ...applyEvidence(undefined, "s", 0, 0, T0), mastery: 0.5, lastMeasured: 0.5 };
    const later = applyEvidence(m, "s", 1, 0.5, T0 + 30 * DAY_MS);
    const decayed = 0.5 * Math.exp(-0.6);
    expect(later.mastery).toBeCloseTo(decayed + 0.3 * (1 - decayed), 10);
    expect(later.lastPracticed).toBe(T0 + 30 * DAY_MS);
  });
});

describe("adaptive decay", () => {
  // Days until a skill at this mastery is due (a 0.10 drop).
  const gap = (m: SkillMastery) => -Math.log(1 - REVIEW_DROP / m.mastery) / m.decayRate;

  it("widens the review gap after each spaced pass and narrows it after a spaced miss", () => {
    let m = { ...applyEvidence(undefined, "s", 1, 0.5, T0), mastery: 0.9 };
    const gaps = [gap(m)];
    let at = T0;
    for (let i = 0; i < 3; i++) {
      at += Math.ceil(gaps.at(-1)!) * DAY_MS;
      m = { ...applyEvidence(m, "s", 1, 0.5, at), mastery: 0.9 };
      gaps.push(gap(m));
    }
    expect(gaps[1]).toBeGreaterThan(gaps[0] * 1.5);
    expect(gaps[3]).toBeGreaterThan(gaps[2] * 1.5);
    const missed = applyEvidence(m, "s", 0.2, 0.5, at + 2 * DAY_MS);
    expect(missed.decayRate).toBeCloseTo(m.decayRate * 1.5, 10);
  });

  it("keeps the rate within a day, and inside its bounds", () => {
    const a = applyEvidence(undefined, "s", 1, 0.5, T0);
    expect(applyEvidence(a, "s", 1, 0.5, T0 + DAY_MS / 2).decayRate).toBe(a.decayRate);
    let m = a;
    for (let i = 1; i < 40; i++) m = applyEvidence(m, "s", 1, 0.5, T0 + i * 3 * DAY_MS);
    expect(m.decayRate).toBe(DECAY_RATE_RANGE[0]);
  });
});

describe("decayMastery", () => {
  it("halves the rate for confidence, after 30 days", () => {
    const m: SkillMastery = {
      skillId: "s",
      mastery: 0.5,
      confidence: 0.5,
      decayRate: 0.02,
      lastPracticed: T0,
      observations: 4,
    };
    const d = decayMastery(m, T0 + 30 * DAY_MS);
    expect(d.mastery).toBeCloseTo(0.274405818, 8);
    expect(d.confidence).toBeCloseTo(0.37040911, 8);
    expect(d.lastPracticed).toBe(T0);
  });
});

describe("isDueForReview", () => {
  const m: SkillMastery = {
    skillId: "s",
    mastery: 0.5,
    confidence: 0.5,
    decayRate: 0.02,
    lastPracticed: T0,
    observations: 4,
    lastMeasured: 0.5,
  };
  const exactDays = Math.log(0.5 / 0.4) / 0.02; // decayed to exactly 0.40
  it("is due at exactly a 0.10 drop and not just before", () => {
    expect(isDueForReview(m, T0 + exactDays * DAY_MS)).toBe(true);
    expect(isDueForReview(m, T0 + (exactDays - 0.05) * DAY_MS)).toBe(false);
  });
});

describe("ingestEvents", () => {
  it("is idempotent by event id", () => {
    const events = [ev({ id: "a" }), ev({ id: "b", at: T0 + 1000 })];
    const once = ingestEvents({}, [], events);
    const twice = ingestEvents(once.state, once.processed, events);
    expect(twice.state).toEqual(once.state);
    expect(twice.changed).toEqual([]);
    expect(once.state["pitch.interval.m3"].observations).toBe(2);
  });

  it("moves mastery only on independent or historical (unlabelled) events", () => {
    const r = ingestEvents(
      {},
      [],
      [
        ev({ id: "g", assistance: "guided" }),
        ev({ id: "h", assistance: "hinted" }),
        ev({ id: "sa", assistance: "self-assessed" }),
        ev({ id: "old", assistance: undefined, skillIds: ["pitch.interval.P5"] }),
      ],
    );
    expect(r.state["pitch.interval.m3"]).toBeUndefined();
    expect(r.state["pitch.interval.P5"].observations).toBe(1);
    expect(r.processed.sort()).toEqual(["g", "h", "old", "sa"]);
    expect(r.changed).toEqual(["pitch.interval.P5"]);
  });
});

describe("graph", () => {
  const m = (skillId: string, mastery: number): SkillMastery => ({
    skillId,
    mastery,
    confidence: 0.5,
    decayRate: 0.02,
    lastPracticed: T0,
    observations: 3,
  });

  it("unlocks on prerequisite thresholds", () => {
    expect(isUnlocked("harmony.seventh.dominant", {}, SKILL_GRAPH, T0)).toBe(false);
    const state = { "harmony.triad.major": m("harmony.triad.major", 0.5) };
    expect(isUnlocked("harmony.seventh.dominant", state, SKILL_GRAPH, T0)).toBe(true); // threshold 0.5
    expect(isUnlocked("pitch.interval.m3", {}, SKILL_GRAPH, T0)).toBe(true);
  });

  it("aggregates umbrella skills as the mean of their children", () => {
    const triads = aggregateMastery(
      "harmony.triads",
      {
        "harmony.triad.major": m("harmony.triad.major", 0.8),
        "harmony.triad.minor": m("harmony.triad.minor", 0.4),
      },
      SKILL_GRAPH,
      T0,
    );
    expect(triads?.mastery).toBeCloseTo(0.3, 10); // (0.8 + 0.4 + 0 + 0) / 4
    expect(triads?.observations).toBe(6);
    expect(withDescendants("pitch.intervals")).toHaveLength(13);
  });

  it("summarises per capability", () => {
    const rows = capabilitySummary(
      { "reading.treble.landmarks": m("reading.treble.landmarks", 0.9) },
      SKILL_GRAPH,
      T0,
    );
    const reading = rows.find((r) => r.capability === "reading")!;
    // The seed's 8 reading skills and the app's 9 circle-of-fifths skills.
    expect(reading.total).toBe(17);
    expect(reading.mastered).toBe(1);
    // landmarks 0.9 and the reading.treble umbrella at 0.45
    expect(reading.average).toBeCloseTo((0.9 + 0.45) / 17, 10);
  });
});
