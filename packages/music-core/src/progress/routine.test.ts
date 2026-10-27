import { describe, expect, it } from "vitest";
import { T0, ev, run, session } from "./fixtures";
import type { Instrument } from "../types";
import { DAY_MS } from "./mastery";
import {
  BLOCKS,
  BUDGET_OPTIONS,
  buildRoutine,
  completedSteps,
  dueSkills,
  roleLabel,
  routineSummary,
  snapBudget,
  stepForSkill,
  stepHref,
  type PathFocus,
} from "./routine";

const ids = (r: ReturnType<typeof buildRoutine>) => r.steps.map((s) => s.id);
const roles = (r: ReturnType<typeof buildRoutine>) => r.steps.map((s) => s.role);
const route = (href: string) => href.split("?")[0];

const focus: PathFocus = {
  pathTitle: "Piano Path",
  title: "Five-finger pattern, one hand",
  summary: "C position, steady quarters.",
  href: "/music/two-hand?mode=five-finger&bpm=60",
  skillIds: ["technique.piano.five-finger"],
};

describe("buildRoutine", () => {
  it("sums every budget to its minutes, roles in set order", () => {
    for (const b of BUDGET_OPTIONS) {
      const r = buildRoutine({ id: "r", instrument: "piano", budgetMinutes: b });
      expect(r.budgetMinutes).toBe(b);
      expect(r.steps.reduce((m, s) => m + s.minutes, 0)).toBe(b);
      expect(roles(r)).toEqual(BLOCKS[b].map(([role]) => role));
    }
    expect(roles(buildRoutine({ id: "r", instrument: "piano", budgetMinutes: 90 }))).toEqual([
      "review",
      "focus",
      "ear",
      "song",
      "variety",
      "create",
    ]);
  });

  it("snaps an old or odd budget to the nearest option", () => {
    expect(snapBudget(5)).toBe(10);
    expect(snapBudget(0)).toBe(10);
    expect(snapBudget(500)).toBe(90);
    expect(snapBudget(50)).toBe(45);
    expect(snapBudget(undefined)).toBe(20);
    const r = buildRoutine({ id: "r", instrument: "piano", budgetMinutes: 5 });
    expect(r.budgetMinutes).toBe(10);
    expect(r.steps.map((s) => s.minutes)).toEqual([4, 6]);
  });

  it("warms up from the defaults when nothing is due, and focuses on a default with no path", () => {
    const r = buildRoutine({ id: "r", instrument: "piano", budgetMinutes: 20, day: "2026-10-26" });
    expect(r.steps.map((s) => [s.role, s.id, s.reason])).toEqual([
      ["review", "rhythm", "warm-up"],
      ["focus", "scales", "default"],
      ["ear", "ear", "default"],
    ]);
    expect(roleLabel(r.steps[0])).toBe("Warm-up");
  });

  it("reviews the first due skill on an unused route, allowed for the instrument", () => {
    const r = buildRoutine({
      id: "r",
      instrument: "piano",
      budgetMinutes: 20,
      dueSkillIds: ["technique.mpc.single-strokes", "reading.treble.landmarks"],
    });
    expect(r.steps[0]).toMatchObject({
      role: "review",
      id: "reading",
      reason: "due",
      skillId: "reading.treble.landmarks",
    });
    expect(roleLabel(r.steps[0])).toBe("Review");
  });

  it("takes focus from the path step, keeping its setup and adding the routine params", () => {
    const r = buildRoutine({
      id: "day-1",
      instrument: "piano",
      budgetMinutes: 30,
      pathFocus: focus,
    });
    const f = r.steps.find((s) => s.role === "focus")!;
    expect(f).toMatchObject({
      id: "path",
      reason: "path",
      label: focus.title,
      minutes: 12,
      skillIds: focus.skillIds,
      href: "/music/two-hand?mode=five-finger&bpm=60&instrument=piano&routine=day-1&step=2",
    });
    expect(f.description).toContain("Piano Path");
    expect(roleLabel(f)).toBe("Path");
    // The warm-up does not repeat the focus route.
    expect(route(r.steps[0].href)).not.toBe("/music/two-hand");
  });

  it("falls back to the weak spot for focus with no path step", () => {
    const r = buildRoutine({
      id: "r",
      instrument: "piano",
      budgetMinutes: 20,
      weakSkillIds: ["technique.mpc.single-strokes", "technique.piano.comping"],
    });
    expect(r.steps[1]).toMatchObject({
      role: "focus",
      id: "comping",
      reason: "weak-spot",
      skillId: "technique.piano.comping",
    });
  });

  it("alternates ear and reading by day, ear only where reading does not apply", () => {
    const at = (day: string, instrument: Instrument = "piano") =>
      buildRoutine({ id: "r", instrument, budgetMinutes: 20, day }).steps[2].id;
    expect(at("2026-10-26")).toBe("ear");
    expect(at("2026-10-27")).toBe("reading");
    expect(at("2026-10-27", "mpc")).toBe("ear");
  });

  it("drops a role with no fresh route and gives its minutes to focus", () => {
    const r = buildRoutine({
      id: "r",
      instrument: "voice",
      budgetMinutes: 90,
      pathFocus: { ...focus, href: "/music/ear/degrees" },
    });
    // No song route for voice; variety has nothing left that is not already in the set.
    expect(roles(r)).toEqual(["review", "focus", "ear", "create"]);
    expect(r.steps.find((s) => s.role === "focus")!.minutes).toBe(60);
    expect(r.steps.reduce((m, s) => m + s.minutes, 0)).toBe(90);
    const piano = buildRoutine({ id: "r", instrument: "piano", budgetMinutes: 90 });
    expect(route(piano.steps.find((s) => s.role === "song")!.href)).toBe("/music/phrases");
    expect(route(piano.steps.find((s) => s.role === "create")!.href)).toBe("/music/jam");
  });

  it("never repeats a route when another is left", () => {
    for (const instrument of ["piano", "guitar", "ukulele", "aerophone"] as Instrument[]) {
      const r = buildRoutine({ id: "r", instrument, budgetMinutes: 90, pathFocus: focus });
      const routes = r.steps.map((s) => route(s.href));
      expect(new Set(routes).size).toBe(routes.length);
    }
  });

  it("links every step with the instrument, routine id and step number", () => {
    const piano = buildRoutine({ id: "day-1", instrument: "piano", day: "2026-10-26" });
    expect(piano.steps.map((s) => s.href)).toEqual([
      "/music/rhythm?instrument=piano&routine=day-1&step=1",
      "/music/scales?instrument=piano&routine=day-1&step=2",
      "/music/ear/mixed?instrument=piano&routine=day-1&step=3",
    ]);
    const voice = buildRoutine({ id: "v", instrument: "voice", day: "2026-10-26" });
    expect(voice.steps.find((s) => s.id === "ear")!.href).toBe(
      "/music/ear/mixed?instrument=voice&answer=voice&routine=v&step=1",
    );
    expect(stepHref("ear", 1, "x")).toBe("/music/ear/mixed?routine=x&step=1");
    const kept = buildRoutine({
      id: "r",
      instrument: "piano",
      pathFocus: { ...focus, href: "/music/scales?instrument=guitar&step=9" },
    }).steps[1].href;
    expect(kept).toBe("/music/scales?instrument=guitar&step=2&routine=r");
  });

  it("maps skills to steps", () => {
    expect(stepForSkill("harmony.triad.minor")).toBe("ear");
    expect(stepForSkill("technique.guitar.chord-changes")).toBe("chord-perfect");
    expect(stepForSkill("technique.guitar.note-finder")).toBe("spider");
    expect(stepForSkill("harmony.ii-v-i.voicings.altered")).toBe("voicings");
    expect(stepForSkill("harmony.ii-v-i.licks.minor-ii-V-i")).toBe("licks");
    expect(stepForSkill("intonation.interval-landing")).toBe("aerophone");
  });
});

describe("dueSkills", () => {
  it("lists skills past a ten-point drop, most overdue first", () => {
    const m = (skillId: string, lastPracticed: number) => ({
      skillId,
      mastery: 0.8,
      lastMeasured: 0.8,
      confidence: 0.5,
      decayRate: 0.02,
      lastPracticed,
      observations: 5,
    });
    const now = T0 + 30 * DAY_MS;
    expect(dueSkills({ a: m("a", T0), b: m("b", T0 - 20 * DAY_MS), c: m("c", now) }, now)).toEqual([
      "b",
      "a",
    ]);
  });
});

describe("routine completion", () => {
  // Rhythm warm-up (1), scales focus (2), ear (3).
  const routine = buildRoutine({ id: "day-1", instrument: "piano" });
  const sessions = [
    session({
      routineId: "day-1",
      runs: [
        run({ id: "a", exerciseId: "ear.mixed", skillIds: ["pitch.interval.m3"] }),
        run({ id: "b", exerciseId: "technique.scale", skillIds: ["technique.scale.major"] }),
        run({
          id: "c",
          exerciseId: "anything",
          skillIds: [],
          params: { routine: "day-1", step: 1 },
        }),
      ],
      eventIds: ["e1", "e2"],
      xp: 70,
      tags: ["ear"],
      endTime: T0 + 12 * 60_000,
    }),
    session({
      id: "other",
      runs: [
        run({ exerciseId: "reading.flashcard.note-id", skillIds: ["reading.treble.landmarks"] }),
      ],
    }),
  ];

  it("completes steps from finished runs, the ear step by exercise prefix", () => {
    expect(ids(routine)).toEqual(["rhythm", "scales", "ear"]);
    expect(completedSteps(routine, sessions)).toEqual([1, 2, 3]);
  });

  it("a run linked to one step does not complete another", () => {
    const linked = [
      session({
        routineId: "day-1",
        runs: [run({ exerciseId: "ear.mixed", params: { routine: "day-1", step: 2 } })],
      }),
    ];
    expect(completedSteps(routine, linked)).toEqual([2]);
  });

  it("completes a path focus block by its skills when the run has no routine params", () => {
    const r = buildRoutine({ id: "day-2", instrument: "piano", pathFocus: focus });
    const at = (skillIds: string[]) =>
      completedSteps(r, [
        session({ routineId: "day-2", runs: [run({ exerciseId: "x", skillIds })] }),
      ]);
    expect(at(["technique.piano.five-finger.right"])).toEqual([2]);
    expect(at(["technique.piano.five-finger"])).toEqual([2]);
    expect(at(["technique.piano.five"])).toEqual([]);
  });

  it("summarises the routine", () => {
    const s = routineSummary(routine, sessions, [
      ev({ id: "e1" }),
      ev({ id: "e2", correct: false }),
      ev({ id: "e3" }),
    ]);
    expect(s).toMatchObject({
      completedSteps: 3,
      totalSteps: 3,
      xp: 70,
      accuracy: 0.5,
      durationMs: 12 * 60_000,
      tags: ["ear"],
    });
    expect(s.runs).toHaveLength(3);
  });
});
