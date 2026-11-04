import { describe, expect, it } from "vitest";
import { T0, ev, session } from "./fixtures";
import { DAY_MS } from "./mastery";
import {
  achievements,
  applyFreezes,
  computeStreak,
  dailyChallenges,
  dayKey,
  freezesEarned,
  improvementFor,
  levelFor,
  weekStart,
  weeklySummary,
  xpForAttempt,
} from "./rewards";

describe("xp and level", () => {
  it("pays for the work, not for showing up wrong", () => {
    expect(xpForAttempt(0, 1, 0)).toBe(5);
    expect(xpForAttempt(1, 1, 0)).toBe(60);
    expect(xpForAttempt(1, 1, 1)).toBe(85);
    expect(xpForAttempt(1, 0, 0)).toBe(40);
    expect(xpForAttempt(0.5, 0.5, 0)).toBe(28); // 27.5 rounds up
  });

  it("measures improvement as the best gain over a previous score", () => {
    expect(improvementFor(["a", "b"], 0.9, { a: 0.5, b: 0.8 })).toBeCloseTo(0.4, 10);
    expect(improvementFor(["a"], 0.3, { a: 0.5 })).toBe(0);
    expect(improvementFor(["a"], 0.9, {})).toBe(0);
  });

  it("levels every 250 xp", () => {
    expect([0, 249, 250, 999, 1000].map(levelFor)).toEqual([1, 1, 2, 4, 5]);
  });

  it("keys days in UTC and weeks from Monday", () => {
    expect(dayKey(Date.UTC(2026, 8, 25, 23, 59))).toBe("2026-09-25");
    expect(weekStart("2026-09-25")).toBe("2026-09-21");
    expect(weekStart("2026-09-21")).toBe("2026-09-21");
    expect(weekStart("2026-09-27")).toBe("2026-09-21");
  });
});

describe("streak", () => {
  it("bridges a frozen day without counting it", () => {
    const s = computeStreak(
      ["2026-09-20", "2026-09-21", "2026-09-23", "2026-09-24"],
      ["2026-09-22"],
      "2026-09-25",
    );
    expect(s.current).toBe(4); // today not yet practised: the streak is still alive
    expect(s.longest).toBe(4);
    expect(s.gap).toEqual([]);
    // The ISO week, Monday 21 to Sunday 27, as the minutes chart shows it.
    expect(s.week.map((d) => d.day)).toEqual(
      [21, 22, 23, 24, 25, 26, 27].map((d) => `2026-09-${d}`),
    );
    expect(s.week.map((d) => d.state)).toEqual([
      "practised",
      "frozen",
      "practised",
      "practised",
      "today",
      "upcoming",
      "upcoming",
    ]);
  });

  it("reports the gap a freeze would cover and breaks without one", () => {
    const s = computeStreak(["2026-09-21", "2026-09-22", "2026-09-25"], [], "2026-09-25");
    expect(s.current).toBe(1);
    expect(s.gap).toEqual(["2026-09-23", "2026-09-24"]);
    expect(s.week[4]).toEqual({ day: "2026-09-25", state: "practised" });
  });

  it("grants one freeze per practised ISO week, capped at 2, and spends them on a gap", () => {
    const practiced = [
      "2026-09-01",
      "2026-09-08",
      "2026-09-15",
      "2026-09-21",
      "2026-09-22",
      "2026-09-25",
    ];
    expect(freezesEarned(practiced.slice(0, 1), [])).toBe(1);
    expect(freezesEarned(practiced.slice(0, 5), [])).toBe(2); // four weeks, cap 2
    const saved = applyFreezes(practiced, [], "2026-09-25");
    expect(saved).toEqual({ frozenDays: ["2026-09-23", "2026-09-24"], used: 2 });
    expect(computeStreak(practiced, saved.frozenDays, "2026-09-25").current).toBe(3);
    expect(freezesEarned(practiced, saved.frozenDays)).toBe(0);
  });

  it("does not freeze a gap longer than the freezes held, or before practising today", () => {
    expect(applyFreezes(["2026-09-21", "2026-09-25"], [], "2026-09-25").used).toBe(0); // gap 3, held 1
    expect(applyFreezes(["2026-09-22"], [], "2026-09-25").used).toBe(0);
  });
});

describe("achievements", () => {
  it("unlocks from xp, streak, peak mastery and freezes", () => {
    const got = achievements({
      xp: 1000,
      longestStreak: 7,
      mastery: {
        a: {
          skillId: "a",
          mastery: 0.3,
          lastMeasured: 0.55,
          confidence: 0,
          decayRate: 0.02,
          lastPracticed: 0,
          observations: 1,
        },
      },
      frozenDays: [],
    });
    expect(got.filter((a) => a.unlocked).map((a) => a.id)).toEqual([
      "first-100-xp",
      "level-5",
      "seven-day-streak",
      "first-skill-50",
    ]);
  });
});

describe("daily challenges", () => {
  const day = dayKey(T0);
  const sessions = [session({ xp: 120 }), session({ id: "old", startTime: T0 - DAY_MS, xp: 999 })];
  const events = [
    ev({ id: "1", skillIds: ["pitch.interval.m6"], capabilities: ["pitch"] }),
    ev({ id: "2", skillIds: ["pitch.interval.m6"], capabilities: ["pitch"], assistance: "guided" }),
    ev({ id: "3", skillIds: ["rhythm.eighths"], capabilities: ["rhythm"] }),
    ev({ id: "4", skillIds: ["pitch.interval.m6"], at: T0 - DAY_MS }),
  ];

  it("measures the four challenges from today's sessions and events", () => {
    const c = dailyChallenges({
      day,
      sessions,
      events,
      weakSpot: { skillId: "pitch.interval.m6", name: "Minor 6th", href: "/music/ear/intervals" },
    });
    expect(c.map((x) => [x.id, x.title, x.progress, x.done])).toEqual([
      ["daily-xp", "Hit today's XP", 100, true],
      ["weak-spot-reps", "Minor 6th", 2, false],
      ["capability-variety", "Cross-train two skills", 2, true],
      ["keep-streak", "Keep the streak alive", 1, true],
    ]);
  });

  it("counts checked reps when no weak spot is named yet", () => {
    const reps = dailyChallenges({ day, sessions, events }).find((x) => x.id === "weak-spot-reps")!;
    expect(reps.title).toBe("Three answers in Check mode");
    expect(reps.progress).toBe(2);
  });

  it("summarises the week", () => {
    const w = weeklySummary({ today: day, sessions, events });
    expect(w).toEqual({ weekStart: "2026-08-31", xp: 1119, sessions: 2, completedChallenges: 5 });
  });
});
