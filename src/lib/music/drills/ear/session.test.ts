import { describe, expect, it } from "vitest";
import { rng } from "@repo/music-core/content/random";
import type { ScoringEvent } from "@repo/music-core";
import { cadencePrompt } from "@repo/music-core/content/ear";
import {
  buildSession,
  cadenceShift,
  confusionCells,
  confusions,
  mixKinds,
  MIX_KINDS,
  FRESH_DIFFICULTY,
  perKind,
  retryPrompts,
  setLadder,
  targetForSkill,
  tokenLabel,
  weaknessWeight,
} from "./session";

const base = { mastery: {}, summaries: {}, now: Date.now(), level: "anchor" };

describe("ear sessions", () => {
  it("asks the loops of the picked set, in one key, with the set's numerals as answers", () => {
    const p = buildSession({
      ...base,
      kinds: ["loop"],
      mode: "balanced",
      rand: rng(4),
      focus: { loops: "modal" },
    });
    expect(p).toHaveLength(10);
    expect(p.every((x) => x.drill === "loop" && x.skillIds.includes("ear.loops.modal"))).toBe(true);
    expect(new Set(p.map((x) => (x as { keyPc?: number }).keyPc)).size).toBe(1);
    expect(new Set(p.map((x) => x.answer)).size).toBe(5);
    expect(p[0].choices).toEqual(["I", "i", "bII", "II", "IV", "bVI", "bVII"]);
    expect(tokenLabel("loop", "i bVII bVI bVII")).toBe("i, ♭VII, ♭VI, ♭VII");
  });

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

  it("puts the headline's mix-up in the grid square of the same pair (played row, answered column)", () => {
    const deg = (expected: string, answered: string) => ({
      kind: "scale-degree" as const,
      expected,
      answered,
      correct: expected === answered,
      scored: true,
    });
    const recs = [deg("2", "1"), deg("2", "1"), deg("1", "2"), deg("4", "1"), deg("3", "3")];
    const top = confusions(recs)[0];
    expect(top).toMatchObject({ expected: "2", answered: "1", count: 2 });
    const cells = confusionCells(recs, ["1", "2", "3", "4", "5", "6", "7"]);
    expect(cells.rows).toEqual(["1", "2", "3", "4"]);
    expect(cells.count(top.expected, top.answered)).toBe(top.count);
    // The reverse pair is its own square, not the headline's.
    expect(cells.count("1", "2")).toBe(1);
    for (const c of confusions(recs)) expect(cells.count(c.expected, c.answered)).toBe(c.count);
  });

  it("reads a cadence's shift from its id, up as well as down", () => {
    expect(cadenceShift("cadence-half-4")).toBe(4);
    expect(cadenceShift("cadence-authentic--5")).toBe(-5);
    expect(cadenceShift("cadence-plagal-0")).toBe(0);
    for (let seed = 1; seed < 40; seed++) {
      const p = cadencePrompt(rng(seed), { difficulty: 0.3 });
      const shift = cadenceShift(p.id);
      expect(shift).toBeGreaterThanOrEqual(-5);
      expect(shift).toBeLessThanOrEqual(6);
    }
  });

  it("mixes the picked drills, and leaves cadences and scales out of a played mix", () => {
    expect(mixKinds("all", "choice")).toEqual([...MIX_KINDS]);
    expect(mixKinds("interval,scale", "choice")).toEqual(["interval", "scale"]);
    expect(mixKinds("all", "play-back")).not.toContain("scale");
    expect(mixKinds("all", "play-back")).not.toContain("cadence");
    expect(mixKinds("interval,scale", "play-back")).toEqual(["interval"]);
    // Only drills with no play-back picked: the rest of the mix plays instead of hanging.
    expect(mixKinds("cadence,scale", "play-back")).toHaveLength(7);
    expect(mixKinds("interval", "voice")).toEqual(["scale-degree"]);
    // A saved single pick from before still reads.
    expect(mixKinds("chord-quality", "choice")).toEqual(["chord-quality"]);
  });

  it("mixed direction asks intervals every way from the first prompt", () => {
    const p = buildSession({
      ...base,
      kinds: ["interval"],
      mode: "balanced",
      rand: rng(5),
      length: 30,
      focus: { tokens: ["M3", "P5"], direction: "mixed" },
    });
    expect(p.every((x) => x.difficulty === FRESH_DIFFICULTY)).toBe(true);
    const dirs = new Set(p.map((x) => (x as { direction?: string }).direction));
    expect(dirs).toEqual(new Set(["ascending", "descending", "harmonic"]));
  });
});

describe("key change sessions", () => {
  it("asks every destination from one starting key and labels the answer", () => {
    const p = buildSession({ ...base, kinds: ["key-change"], mode: "balanced", rand: rng(2) });
    expect(p).toHaveLength(10);
    expect(p.every((x) => x.drill === "key-change")).toBe(true);
    expect(new Set(p.map((x) => x.answer.split(" ")[0])).size).toBe(8);
    expect(new Set(p.map((x) => (x as { fromPc?: number }).fromPc)).size).toBe(1);
    expect(tokenLabel("key-change", "up-step ii7 V7 Imaj7")).toBe(
      "up a whole step, by ii7, V7, Imaj7",
    );
    expect(targetForSkill("ear.key-change.relative", ["key-change"], "anchor")?.token).toBe(
      "relative",
    );
  });
});

describe("keys in a run", () => {
  const keysOf = (p: unknown[]) => p.map((x) => (x as { keyPc: number }).keyPc);
  it("keeps one key for a melody dictation run", () => {
    const p = buildSession({
      ...base,
      kinds: ["melody-dictation"],
      mode: "balanced",
      rand: rng(5),
    });
    expect(new Set(keysOf(p)).size).toBe(1);
  });

  it("changes key every N prompts, never to the same key", () => {
    for (const seed of [1, 2, 3]) {
      const k = keysOf(
        buildSession({
          ...base,
          kinds: ["chord-function"],
          mode: "balanced",
          rand: rng(seed),
          focus: { keyEvery: 3 },
        }),
      );
      expect(k).toHaveLength(10);
      for (const b of [0, 3, 6]) expect(new Set(k.slice(b, b + 3)).size).toBe(1);
      for (const b of [3, 6, 9]) expect(k[b]).not.toBe(k[b - 1]);
    }
    const five = keysOf(
      buildSession({
        ...base,
        kinds: ["scale-degree"],
        mode: "balanced",
        rand: rng(4),
        focus: { keyEvery: 5 },
      }),
    );
    expect(new Set(five.slice(0, 5)).size).toBe(1);
    expect(new Set(five.slice(5)).size).toBe(1);
    expect(five[5]).not.toBe(five[4]);
  });
});

describe("retrying chords in a key", () => {
  const miss = (target: string, promptId: string, skillIds: string[]): ScoringEvent => ({
    id: Math.random().toString(36),
    sessionId: "s",
    exerciseId: "ear.chord-functions",
    promptId,
    at: 1,
    skillIds,
    capabilities: ["ear"],
    correct: false,
    partialCredit: 0,
    difficulty: 0.3,
    modality: "heard",
    source: "click",
    assistance: "independent",
    target,
    metrics: [{ kind: "choice", expected: target, actual: "I" }],
  });
  it("asks a minor or seventh miss again as it was asked, in its key", () => {
    const r = retryPrompts(
      [
        miss("m:IV", "chord-function-m:IV-5", [
          "ear.chord-functions.minor",
          "ear.chord-function.minor.IV",
        ]),
        miss("V7", "chord-function-V7-10", [
          "ear.chord-functions",
          "ear.chord-function.V",
          "ear.chord-function.sevenths",
        ]),
      ],
      ["chord-function"],
      rng(1),
    ) as (ReturnType<typeof retryPrompts>[number] & { keyPc: number })[];
    const minor = r.find((x) => x.answer === "m:IV")!;
    expect(minor.keyPc).toBe(5);
    expect(minor.choices).toContain("m:V");
    const seventh = r.find((x) => x.answer === "V7")!;
    expect(seventh.keyPc).toBe(10);
    expect(r.map((x) => x.answer).sort()).toEqual(["V7", "m:IV"]);
  });
});

describe("setLadder", () => {
  const ladder = ["P8", "P5", "M3", "P4"];
  const phrase = (t: string) => `the ${t}`;
  it("steps back by the latest item added and on by the next one", () => {
    const { steps, step } = setLadder(["M3", "P5", "P8"], ladder, phrase);
    expect(step).toBe(1);
    expect(steps.map((s) => s.label)).toEqual(["without the M3", "this set", "the P4"]);
    expect(steps[0].tokens).toEqual(["P5", "P8"]);
    expect(steps[2].tokens).toEqual(["M3", "P5", "P8", "P4"]);
  });
  it("never drops below two items, and stops at the top", () => {
    expect(setLadder(["P5", "P8"], ladder, phrase).steps.map((s) => s.label)).toEqual([
      "this set",
      "the M3",
    ]);
    expect(setLadder(ladder, ladder, phrase)).toMatchObject({
      step: 1,
      steps: [{ label: "without the P4" }, { label: "this set" }],
    });
  });
});
