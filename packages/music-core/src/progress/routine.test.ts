import { describe, expect, it } from "vitest";
import { T0, ev, run, session } from "./fixtures";
import { buildRoutine, completedSteps, routineSummary, stepForSkill } from "./routine";

const ids = (r: ReturnType<typeof buildRoutine>) => r.steps.map((s) => s.id);

describe("buildRoutine", () => {
  it("uses the per-instrument defaults", () => {
    expect(ids(buildRoutine({ id: "r", instrument: "piano" }))).toEqual([
      "scales",
      "ear",
      "reading",
      "rhythm",
    ]);
    expect(ids(buildRoutine({ id: "r", instrument: "guitar" }))).toEqual([
      "spider",
      "ear",
      "chord-perfect",
      "rhythm",
    ]);
    expect(ids(buildRoutine({ id: "r", instrument: "ukulele" }))).toEqual([
      "spider",
      "ear",
      "chord-perfect",
      "rhythm",
    ]);
    expect(ids(buildRoutine({ id: "r", instrument: "mpc" }))).toEqual(["mpc", "rhythm"]);
    expect(ids(buildRoutine({ id: "r", instrument: "aerophone" }))).toEqual([
      "aerophone",
      "ear",
      "rhythm",
      "scales",
    ]);
    expect(ids(buildRoutine({ id: "r", instrument: "voice" }))).toEqual(["ear", "rhythm"]);
    expect(ids(buildRoutine({ id: "r" }))).toEqual(["ear", "reading", "rhythm", "scales"]);
  });

  it("links every step with the instrument, routine id and step number", () => {
    const piano = buildRoutine({ id: "day-1", instrument: "piano" });
    expect(piano.steps.map((s) => s.href)).toEqual([
      "/music/scales?instrument=piano&routine=day-1&step=1",
      "/music/ear/mixed?instrument=piano&routine=day-1&step=2",
      "/music/reading?instrument=piano&routine=day-1&step=3",
      "/music/rhythm?instrument=piano&routine=day-1&step=4",
    ]);
    expect(buildRoutine({ id: "v", instrument: "voice" }).steps[0].href).toBe(
      "/music/ear/mixed?instrument=voice&answer=voice&routine=v&step=1",
    );
    expect(buildRoutine({ id: "g", instrument: "guitar" }).steps[0].href).toBe(
      "/music/fretboard?instrument=guitar&routine=g&step=1",
    );
    expect(buildRoutine({ id: "x" }).steps[0].href).toBe("/music/ear/mixed?routine=x&step=1");
  });

  it("truncates to the budget in 5-minute steps and clamps it to 1-120", () => {
    const at = (budgetMinutes: number) =>
      buildRoutine({ id: "r", instrument: "piano", budgetMinutes });
    expect(ids(at(10))).toEqual(["scales", "ear"]);
    expect(ids(at(5))).toEqual(["scales"]);
    expect(at(3).steps).toEqual([expect.objectContaining({ id: "scales", minutes: 3 })]);
    expect(at(0).budgetMinutes).toBe(1);
    expect(at(500).budgetMinutes).toBe(120);
    expect(at(30).steps).toHaveLength(4);
  });

  it("puts weak-skill steps first, deduped, allowed for the instrument, ear in one slot", () => {
    const r = buildRoutine({
      id: "r",
      instrument: "piano",
      weakSkillIds: [
        "pitch.interval.m3",
        "pitch.scale-degree.2",
        "technique.mpc.single-strokes",
        "technique.piano.comping",
      ],
    });
    expect(ids(r)).toEqual(["ear", "comping", "scales", "reading"]);
    expect(r.steps[0]).toMatchObject({ reason: "weak-spot", skillId: "pitch.interval.m3" });
    expect(r.steps[2].reason).toBe("default");
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

describe("routine completion", () => {
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
          params: { routine: "day-1", step: 4 },
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
    expect(completedSteps(routine, sessions)).toEqual([1, 2, 4]);
  });

  it("summarises the routine", () => {
    const s = routineSummary(routine, sessions, [
      ev({ id: "e1" }),
      ev({ id: "e2", correct: false }),
      ev({ id: "e3" }),
    ]);
    expect(s).toMatchObject({
      completedSteps: 3,
      totalSteps: 4,
      xp: 70,
      accuracy: 0.5,
      durationMs: 12 * 60_000,
      tags: ["ear"],
    });
    expect(s.runs).toHaveLength(3);
  });
});
