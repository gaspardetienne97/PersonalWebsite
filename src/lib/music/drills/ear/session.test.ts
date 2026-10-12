import { describe, expect, it } from "vitest";
import { rng } from "@repo/music-core/content/random";
import type { ScoringEvent } from "@repo/music-core";
import {
  buildSession,
  confusions,
  FRESH_DIFFICULTY,
  perKind,
  retryPrompts,
  targetForSkill,
  tokenLabel,
  weaknessWeight,
} from "./session";

const base = { mastery: {}, summaries: {}, now: Date.now(), level: "anchor" };

describe("ear sessions", () => {
  it("fills ten prompts from a two-degree level without back-to-back repeats", () => {
    const p = buildSession({ ...base, kinds: ["scale-degree"], mode: "balanced", rand: rng(1) });
    expect(p).toHaveLength(10);
    expect(new Set(p.map((x) => x.answer))).toEqual(new Set(["1", "5"]));
    p.slice(1).forEach((x, i) => expect(x.answer).not.toBe(p[i].answer));
    expect(p.every((x) => x.difficulty === FRESH_DIFFICULTY)).toBe(true);
  });

  it("asks only the intervals picked, in the direction picked, with only those as answers", () => {
    const p = buildSession({
      ...base,
      kinds: ["interval"],
      mode: "balanced",
      rand: rng(3),
      focus: { tokens: ["P1", "M3", "P5"], direction: "descending" },
    });
    expect(p).toHaveLength(10);
    expect(new Set(p.map((x) => x.answer))).toEqual(new Set(["P1", "M3", "P5"]));
    expect(p.every((x) => x.choices.join() === "P1,M3,P5")).toBe(true);
    expect(p.every((x) => x.expectedMidi![0] >= x.expectedMidi![1])).toBe(true);
    expect(tokenLabel("interval", "P1")).toBe("Perfect unison");
    // One interval alone: it repeats, and every interval stays a possible answer.
    const one = buildSession({
      ...base,
      kinds: ["interval"],
      mode: "balanced",
      rand: rng(4),
      focus: { tokens: ["P5"] },
    });
    expect(one.every((x) => x.answer === "P5")).toBe(true);
    expect(one[0].choices).toHaveLength(12);
  });

  it("asks every picked interval once, then the weak ones more often, never twice in a row", () => {
    const focus = { tokens: ["M3", "P5", "P8"] };
    const accuracy = { "pitch.interval.M3": 0.2, "pitch.interval.P5": 1, "pitch.interval.P8": 1 };
    let weak = 0;
    let total = 0;
    for (let seed = 1; seed <= 30; seed++) {
      const p = buildSession({
        ...base,
        kinds: ["interval"],
        mode: "balanced",
        rand: rng(seed),
        focus,
        accuracy,
      });
      expect(new Set(p.slice(0, 3).map((x) => x.answer))).toEqual(new Set(["M3", "P5", "P8"]));
      p.slice(3).forEach((x, i) => expect(x.answer).not.toBe(p[i + 2].answer));
      weak += p.slice(3).filter((x) => x.answer === "M3").length;
      total += p.length - 3;
    }
    // M3 weighs 3.4 against 1 and 1: well over a third of the rest.
    expect(weak / total).toBeGreaterThan(0.45);
    expect(weaknessWeight(undefined)).toBe(2);
    // A fixed first note carries through.
    const fixed = buildSession({
      ...base,
      kinds: ["interval"],
      mode: "balanced",
      rand: rng(9),
      focus: { tokens: ["M3", "P5"], root: 62 },
    });
    expect(fixed.every((x) => x.expectedMidi![0] === 62)).toBe(true);
  });

  it("narrows chord qualities to the ones picked, sevenths included, and weights the weak ones", () => {
    const p = buildSession({
      ...base,
      kinds: ["chord-quality"],
      mode: "balanced",
      rand: rng(5),
      focus: { tokens: ["major", "minor", "dominant-7"] },
      accuracy: { "harmony.triad.minor": 0 },
    });
    expect(new Set(p.map((x) => x.answer))).toEqual(new Set(["major", "minor", "dominant-7"]));
    expect(p.every((x) => x.choices.join() === "major,minor,dominant-7")).toBe(true);
    expect(p.filter((x) => x.answer === "minor").length).toBeGreaterThanOrEqual(3);
  });

  it("narrows cadences to the ones picked", () => {
    const p = buildSession({
      ...base,
      kinds: ["cadence"],
      mode: "balanced",
      rand: rng(6),
      focus: { tokens: ["authentic", "plagal"] },
    });
    expect(new Set(p.map((x) => x.answer))).toEqual(new Set(["authentic", "plagal"]));
    expect(p.every((x) => x.choices.join() === "authentic,plagal")).toBe(true);
  });

  it("uses presented difficulty once a skill has mastery", () => {
    const mastery = {
      "pitch.interval.P5": {
        skillId: "pitch.interval.P5",
        mastery: 0.5,
        confidence: 0.5,
        decayRate: 0.02,
        lastPracticed: Date.now(),
        observations: 3,
      },
    };
    const p = buildSession({
      ...base,
      mastery,
      kinds: ["interval"],
      mode: "balanced",
      rand: rng(2),
      length: 12,
    });
    const p5 = p.find((x) => x.answer === "P5")!;
    expect(p5.difficulty).toBeCloseTo(0.6);
    expect(p.find((x) => x.answer === "m2")!.difficulty).toBe(FRESH_DIFFICULTY);
  });

  it("mixed adaptive never repeats a drill twice in a row", () => {
    const p = buildSession({
      ...base,
      kinds: ["interval", "chord-quality", "scale-degree", "cadence"],
      mode: "adaptive",
      rand: rng(3),
    });
    expect(p).toHaveLength(10);
    p.slice(1).forEach((x, i) => expect(x.drill).not.toBe(p[i].drill));
  });

  it("seventh chords are presented at a difficulty that offers them", () => {
    const t = targetForSkill("harmony.seventh.dominant", ["chord-quality"], "anchor")!;
    expect(t.token).toBe("dominant-7");
  });

  it("builds retries from confusions, one per confused skill", () => {
    const ev = (expected: string, actual: string, skill: string): ScoringEvent => ({
      id: Math.random().toString(36),
      sessionId: "s",
      exerciseId: "ear.intervals",
      promptId: "p",
      at: 1,
      skillIds: ["pitch.intervals", skill],
      capabilities: ["ear"],
      correct: false,
      partialCredit: 0,
      difficulty: 0.3,
      modality: "heard",
      source: "click",
      assistance: "independent",
      metrics: [{ kind: "choice", expected, actual }],
    });
    const r = retryPrompts(
      [
        ev("m6", "P5", "pitch.interval.m6"),
        ev("m6", "P5", "pitch.interval.m6"),
        ev("M3", "m3", "pitch.interval.M3"),
      ],
      ["interval"],
      rng(4),
    );
    expect(r.map((x) => x.answer).sort()).toEqual(["M3", "m6"]);
    expect(r.every((x) => x.difficulty === 0.5)).toBe(true);
  });

  it("summarises per drill and lists confusions with counts", () => {
    const recs = [
      { kind: "interval" as const, expected: "m6", answered: "P5", correct: false, scored: true },
      { kind: "interval" as const, expected: "m6", answered: "P5", correct: false, scored: true },
      { kind: "interval" as const, expected: "P5", answered: "P5", correct: true, scored: true },
      {
        kind: "cadence" as const,
        expected: "half",
        answered: "plagal",
        correct: false,
        scored: false,
      },
    ];
    expect(perKind(recs)).toEqual([{ kind: "interval", total: 3, correct: 1 }]);
    expect(confusions(recs)).toEqual([
      { kind: "interval", expected: "m6", answered: "P5", count: 2 },
    ]);
    expect(tokenLabel("scale-degree", "3", "solfege")).toBe("mi");
    expect(tokenLabel("cadence", "authentic")).toBe("Authentic (V to I)");
  });
});
