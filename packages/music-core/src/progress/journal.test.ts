import { describe, expect, it } from "vitest";
import { T0, run, session } from "./fixtures";
import { DAY_MS } from "./mastery";
import {
  filterSessions,
  focusAreas,
  heatmap,
  lastRunForSetup,
  personalBest,
  weekRollups,
  weeklyGoals,
} from "./journal";

// T0 is Tuesday 2026-09-01; its ISO week starts Monday 2026-08-31.
const sessions = [
  session({
    id: "a",
    startTime: T0,
    endTime: T0 + 20 * 60_000,
    xp: 100,
    eventIds: ["1", "2", "3"],
    tags: ["ear", "sight"],
    instrument: "piano",
  }),
  session({
    id: "b",
    startTime: T0 + DAY_MS,
    endTime: T0 + DAY_MS + 10 * 60_000,
    xp: 40,
    eventIds: ["4"],
    tags: ["ear"],
    instrument: "guitar",
    runs: [run({ skillIds: ["technique.guitar.spider"], instrument: "guitar" })],
  }),
  session({
    id: "c",
    startTime: T0 - 7 * DAY_MS,
    endTime: T0 - 7 * DAY_MS + 30 * 60_000,
    xp: 200,
    eventIds: [],
    tags: [],
  }),
];

describe("journal", () => {
  it("rolls up this week, last week and the delta", () => {
    expect(weekRollups(sessions, "2026-09-02")).toEqual({
      thisWeek: { xp: 140, sessions: 2, attempts: 4, minutes: 30 },
      lastWeek: { xp: 200, sessions: 1, attempts: 0, minutes: 30 },
      delta: { xp: -60, sessions: 1, attempts: 4, minutes: 0 },
    });
    expect(weeklyGoals(sessions, "2026-09-02", 4)).toEqual({
      sessions: { done: 2, target: 4, met: false },
      xp: { thisWeek: 140, lastWeek: 200, ahead: false },
    });
  });

  it("builds a 12-week Monday-first heatmap", () => {
    const cells = heatmap(sessions, "2026-09-02");
    expect(cells).toHaveLength(84);
    expect(cells[0].day).toBe("2026-06-15");
    expect(cells.at(-1)!.day).toBe("2026-09-06");
    const byDay = Object.fromEntries(cells.map((c) => [c.day, c]));
    expect(byDay["2026-09-01"]).toMatchObject({ minutes: 20, sessions: 1, level: 3 });
    expect(byDay["2026-08-25"]).toMatchObject({ minutes: 30, level: 4 });
    expect(byDay["2026-09-03"]).toMatchObject({ level: 0, future: true });
  });

  it("derives focus areas from tags and filters sessions", () => {
    expect(focusAreas(sessions)).toEqual([
      { tag: "ear", count: 2 },
      { tag: "sight", count: 1 },
    ]);
    expect(filterSessions(sessions, { instrument: "guitar" }).map((s) => s.id)).toEqual(["b"]);
    expect(
      filterSessions(sessions, { skillId: "technique.guitar.spider" }).map((s) => s.id),
    ).toEqual(["b"]);
    expect(
      filterSessions(sessions, { from: "2026-09-01", to: "2026-09-01" }).map((s) => s.id),
    ).toEqual(["a"]);
  });

  it("finds the last run and the personal best for a setup", () => {
    const history = [
      session({
        runs: [
          run({ id: "old", score: 0.9, endedAt: T0 + 1 }),
          run({ id: "mid", score: 0.7, endedAt: T0 + 2 }),
        ],
      }),
      session({
        runs: [
          run({ id: "now", score: 0.8, endedAt: T0 + 3 }),
          run({ id: "other", setupKey: "minor-A3", score: 1, endedAt: T0 + 4 }),
        ],
      }),
    ];
    expect(lastRunForSetup(history, "technique.scale", "major-C4")?.id).toBe("now");
    expect(lastRunForSetup(history, "technique.scale", "major-C4", T0 + 3)?.id).toBe("mid");
    expect(personalBest(history, "technique.scale", "major-C4")?.id).toBe("old");
    expect(lastRunForSetup(history, "technique.scale", "nope")).toBeUndefined();
  });
});
