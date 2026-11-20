import { describe, expect, it } from "vite-plus/test";
import type { ScoringEvent } from "../types";
import { ev, run, T0 } from "./fixtures";
import { DAY_MS } from "./mastery";
import { LEARNING_PATHS, pathProgress, type LearningPath, type PathStep } from "./paths";
import { setNoteNaming } from "../theory/note-names";

// One attempt a day, in order, so every pass below is on more than one day.
let n = 0;
const reps = (count: number, over: Partial<ScoringEvent>) =>
  Array.from({ length: count }, () => {
    const i = n++;
    return ev({ id: `p${i}`, at: T0 + i * DAY_MS, ...over });
  });

// A small path in the old guitar path's shape, so the engine tests outlive the path data.
const step = (id: string, over: Partial<PathStep>): PathStep => ({
  id,
  order: 0,
  title: id,
  summary: "",
  kind: "drill",
  href: "/music/chords",
  links: [],
  skillIds: ["technique.guitar.chord-perfect"],
  minAttempts: 3,
  minSessions: 1,
  minDays: 2,
  requires: [],
  instruments: ["guitar"],
  ...over,
});
const changes = { skillIds: ["technique.guitar.chord-changes"], minAttempts: 1, minSessions: 2 };
const toy: LearningPath = {
  id: "guitar",
  title: "Toy",
  subtitle: "",
  steps: [
    step("G-B1", {}),
    step("G-B2", { skillIds: ["rhythm.pulse"], requires: ["G-B1"] }),
    step("G-B3", { skillIds: ["rhythm.pulse"], requires: ["G-B2"] }),
    step("G-A1", { ...changes, requires: ["G-B3"] }),
    step("G-A2", { ...changes, requires: ["G-B3"] }),
  ].map((s, i) => ({ ...s, order: i + 1 })),
};

const statuses = (id: keyof typeof LEARNING_PATHS | LearningPath, events: ScoringEvent[]) =>
  Object.fromEntries(
    pathProgress(typeof id === "string" ? LEARNING_PATHS[id] : id, events).steps.map((s) => [
      s.step.id,
      s.status,
    ]),
  );

describe("path content", () => {
  it("normalises the paths", () => {
    expect(Object.keys(LEARNING_PATHS)).toEqual([
      "guitar",
      "ukulele",
      "piano",
      "jazz",
      "aerophone",
      "mpc",
      "ear",
      "reading",
      "theory",
      "studio",
    ]);
    expect(LEARNING_PATHS.theory.steps).toHaveLength(8);
    expect(LEARNING_PATHS.studio.steps).toHaveLength(7);
    for (const p of Object.values(LEARNING_PATHS)) {
      expect(p.steps.map((s) => s.order)).toEqual(p.steps.map((_, i) => i + 1));
      if (!["theory", "studio"].includes(p.id)) expect(p.levels?.length, p.id).toBeGreaterThan(0);
    }
  });

  it("names the theory steps' keys when they are read, in the setting made after load", () => {
    const [t1, t2] = LEARNING_PATHS.theory.steps;
    expect(t2.summary).toBe(
      "C, G, F, D and Bb: from the key to its count, and from the count to the key.",
    );
    setNoteNaming("fixed");
    try {
      expect(t2.summary).toBe(
        "Do, Sol, Fa, Re and Sib: from the key to its count, and from the count to the key.",
      );
      expect(t2.links[0].label).toBe("Start with Do, Sol and Fa");
      // The letter mnemonic is left out when the notes aren't letters.
      expect(t1.summary).toBe("Fa Do Sol Re La Mi Si for sharps, backwards for flats.");
    } finally {
      setNoteNaming("letters");
    }
  });
});

describe("pathProgress", () => {
  const chordPerfect = {
    skillIds: ["technique.guitar.chord-perfect"],
    exerciseId: "technique.guitar.chord-perfect",
    modality: "played" as const,
  };

  it("moves a step from next to done on independent evidence only", () => {
    expect(statuses(toy, [])).toMatchObject({
      "G-B1": "next",
      "G-B2": "locked",
      "G-A2": "locked",
    });
    // guided-accepted is gone and hinted never counts
    const assisted = [
      ...reps(3, { ...chordPerfect, assistance: "guided" }),
      ...reps(3, { ...chordPerfect, assistance: "hinted" }),
    ];
    expect(pathProgress(toy, assisted).steps[0].evidence[0].attempts).toBe(0);
    // two of three attempts, then a mean below 0.66, then one at 0.70
    const two = reps(2, { ...chordPerfect, partialCredit: 0.8 });
    expect(pathProgress(toy, two).steps[0].evidence[0]).toMatchObject({
      attempts: 2,
      done: false,
    });
    expect(
      statuses(toy, [...two, ...reps(1, { ...chordPerfect, partialCredit: 0.3 })])["G-B1"],
    ).toBe("next"); // mean 0.63
    const done = statuses(toy, [...two, ...reps(1, { ...chordPerfect, partialCredit: 0.5 })]);
    expect(done).toMatchObject({ "G-B1": "done", "G-B2": "next", "G-B3": "locked" });
  });

  it("ignores evidence from another instrument on a pinned step", () => {
    expect(statuses(toy, reps(3, { ...chordPerfect, instrument: "ukulele" }))["G-B1"]).toBe("next");
    expect(statuses(toy, reps(3, { ...chordPerfect, instrument: "guitar" }))["G-B1"]).toBe("done");
  });

  it("requires distinct sessions where the step asks for them", () => {
    const changes = {
      skillIds: ["technique.guitar.chord-changes"],
      exerciseId: "technique.guitar.chord-changes",
    };
    const one = pathProgress(toy, reps(4, { ...changes, sessionId: "a" }));
    expect(one.steps.find((s) => s.step.id === "G-A1")!.evidence[0]).toMatchObject({
      sessions: 1,
      done: false,
    });
    const both = pathProgress(toy, [
      ...reps(2, { ...changes, sessionId: "a" }),
      ...reps(2, { ...changes, sessionId: "b" }),
    ]);
    expect(both.steps.find((s) => s.step.id === "G-A1")!.evidence[0].done).toBe(true);
  });

  // The old jazz path's opening, in brief: an umbrella skill, reference steps, a chord-scale step.
  const jazzish: LearningPath = {
    id: "jazz",
    title: "Toy jazz",
    subtitle: "",
    steps: [
      step("intervals", { skillIds: ["pitch.intervals"], minAttempts: 1, instruments: undefined }),
      step("chord-symbols", { skillIds: [], kind: "reference" }),
      step("chord-scales", {
        skillIds: ["harmony.ii-v-i.chord-scales"],
        href: "/music/changes/chord-scales?changes=major",
        instruments: undefined,
      }),
      step("altered-voicings", {
        skillIds: ["harmony.ii-v-i.voicings.altered"],
        instruments: undefined,
      }),
    ].map((s, i) => ({ ...s, order: i + 1 })),
  };

  it("never blocks Continue on reference steps without skills, and counts umbrella children", () => {
    const events = [
      ...reps(2, { skillIds: ["pitch.interval.m3"] }),
      ...reps(1, {
        skillIds: ["harmony.ii-v-i.chord-scales.major"],
        modality: "played",
        partialCredit: 0.9,
      }),
    ];
    const p = pathProgress(jazzish, events);
    expect(Object.fromEntries(p.steps.map((s) => [s.step.id, s.status]))).toEqual({
      intervals: "done",
      "chord-symbols": "todo",
      "chord-scales": "next",
      "altered-voicings": "not-assessed",
    });
    expect(p.continueHref).toBe("/music/changes/chord-scales?changes=major");
    expect(p).toMatchObject({ done: 1, total: 3 });
  });

  it("judges the latest attempts, on two days, at the stated tempo", () => {
    const first = (events: ScoringEvent[], runs = [run()]) =>
      pathProgress(toy, events, undefined, runs).steps[0];
    // Early misses stop counting once the last three pass.
    const climb = [
      ...reps(3, { ...chordPerfect, partialCredit: 0 }),
      ...reps(3, { ...chordPerfect, partialCredit: 1 }),
    ];
    expect(first(climb).status).toBe("done");
    // Three passes on one day: almost, waiting for a second day.
    const oneDay = Array.from({ length: 3 }, (_, i) =>
      ev({ id: `d${i}`, ...chordPerfect, at: T0 + i * 1000 }),
    );
    expect(first(oneDay)).toMatchObject({ status: "next", almost: true });
    expect(first(oneDay).evidence[0].days).toBe(1);
    // One pass of three asked for is a start, not almost.
    expect(first(oneDay.slice(0, 1)).almost).toBe(false);
    // With a tempo, only runs at that tempo or faster count.
    const fast = {
      ...toy,
      steps: [{ ...toy.steps[0], minBpm: 80 }],
    };
    const timed = reps(3, { ...chordPerfect, runId: "slow" });
    const slowRun = run({ id: "slow", params: { bpm: 60 } });
    expect(pathProgress(fast, timed, undefined, [slowRun]).steps[0].evidence[0].attempts).toBe(0);
    const fastRun = run({ id: "slow", params: { bpm: "84" } });
    expect(pathProgress(fast, timed, undefined, [fastRun]).steps[0].status).toBe("done");
  });

  it("marks steps a done step needs as review, so they never block", () => {
    const changes = reps(4, {
      skillIds: ["technique.guitar.chord-changes"],
      exerciseId: "technique.guitar.chord-changes",
      sessionId: "x",
    }).map((e, i) => ({ ...e, sessionId: `s${i}` }));
    const p = pathProgress(toy, changes);
    const st = Object.fromEntries(p.steps.map((s) => [s.step.id, s.status]));
    expect(st["G-A1"]).toBe("done");
    expect(st["G-B1"]).toBe("review");
    expect(p.done).toBeGreaterThanOrEqual(2);
  });

  it("marks an open step in progress when it is not the next one", () => {
    const s = statuses(
      jazzish,
      reps(1, { skillIds: ["harmony.ii-v-i.voicings.altered"], modality: "played" }),
    );
    expect(s).toMatchObject({ intervals: "next", "altered-voicings": "in-progress" });
  });
});

describe("studio ears path", () => {
  const ev = (over: Partial<ScoringEvent>): ScoringEvent => ({
    id: Math.random().toString(36),
    sessionId: "s1",
    exerciseId: "studio.peak",
    promptId: "p",
    at: T0 + n++ * DAY_MS,
    skillIds: ["studio.ears", "studio.eq-peak"],
    capabilities: ["ear"],
    correct: true,
    partialCredit: 1,
    difficulty: 0.2,
    modality: "heard",
    source: "click",
    assistance: "independent",
    metrics: [],
    ...over,
  });

  it("asks for a harder setup and its own threshold", () => {
    // Ten right on 3 bands: the first step is done, the 5-band step has no evidence yet.
    const easy = Array.from({ length: 10 }, () => ev({}));
    expect(statuses("studio", easy)["S-1"]).toBe("done");
    expect(statuses("studio", easy)["S-2"]).toBe("next");
    // Twenty on 5 bands at 75%: under S-2's 80%.
    const five = Array.from({ length: 20 }, (_, i) =>
      ev({ difficulty: 0.4, partialCredit: i % 4 ? 1 : 0 }),
    );
    expect(statuses("studio", [...easy, ...five])["S-2"]).toBe("in-progress");
  });
});
