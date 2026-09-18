import { describe, expect, test } from "vitest";

import { unixMs, type PracticeSession, type ScoringEvent } from "@repo/music-core/domain";
import { AnalyticsEngine } from "@repo/music-core/engines/analytics";
import { SkillGraphStore, seedCoreSkills } from "@repo/music-core/engines/skills";

import { buildPracticeJournal, buildSkillDriftView } from "./index";

const DAY_MS = 86_400_000;

describe("skill drift projection", () => {
  test("partitions skills by the five-attempt floor and the ten-point drop", async () => {
    const { analytics, skills } = await setup();
    const now = unixMs(Date.UTC(2026, 8, 8));
    const old = unixMs(now - 90 * DAY_MS);

    // Six unaided attempts, all correct, but ninety days stale: the estimate has fallen.
    await ingest(analytics, "rhythm.quarter-pulse", old, 6);
    // Six unaided attempts today: nothing has decayed.
    await ingest(analytics, "harmony.seventh.dominant", now, 6);
    // Under the floor: no verdict either way.
    await ingest(analytics, "pitch.interval.m6", now, 3);
    // Hinted attempts never count toward a verdict.
    await ingest(analytics, "technique.scale.major", now, 6, "hinted");

    const view = buildSkillDriftView({ skills, analytics, now });
    const falling = view.falling.find((row) => row.skillId === "rhythm.quarter-pulse");
    const holding = view.holding.find((row) => row.skillId === "harmony.seventh.dominant");

    expect(falling).toMatchObject({ attempts: 6, lastPracticed: old });
    expect(falling!.dropPercent).toBeGreaterThanOrEqual(10);
    expect(falling!.estimatePercent).toBeLessThan(90);
    expect(holding).toMatchObject({ attempts: 6, dropPercent: 0, estimatePercent: 100 });

    expect(ids(view.holding)).not.toContain("pitch.interval.m6");
    expect(ids(view.falling)).not.toContain("pitch.interval.m6");
    // Under the floor there is an estimate but no verdict.
    expect(view.unmeasured.find((row) => row.skillId === "pitch.interval.m6")).toMatchObject({
      attempts: 3,
      estimatePercent: 100,
    });
    // Hinted-only and never-attempted skills both sit at zero unaided attempts.
    const untouched = view.unmeasured.find((row) => row.skillId === "technique.scale.major")!;
    expect(untouched.attempts).toBe(0);
    expect(untouched.estimatePercent).toBeUndefined();
    // Every skill lands in exactly one list.
    const all = [...ids(view.falling), ...ids(view.holding), ...ids(view.unmeasured)];
    expect(new Set(all).size).toBe(all.length);
    expect(all).toHaveLength(skills.skills.length);
  });

  test("carries one review-due verdict, and never under the floor", async () => {
    const { analytics, skills } = await setup();
    const now = unixMs(Date.UTC(2026, 8, 8));
    const old = unixMs(now - 90 * DAY_MS);
    await ingest(analytics, "rhythm.quarter-pulse", old, 6);
    await ingest(analytics, "harmony.seventh.dominant", now, 6);
    // Four unaided attempts, just as stale: a big drop, but no verdict.
    await ingest(analytics, "pitch.interval.m6", old, 4);

    const view = buildSkillDriftView({ skills, analytics, now });
    const stale = view.unmeasured.find((row) => row.skillId === "pitch.interval.m6")!;

    expect(view.falling.every((row) => row.dueForReview)).toBe(true);
    expect(view.holding.every((row) => !row.dueForReview)).toBe(true);
    expect(view.unmeasured.every((row) => !row.dueForReview)).toBe(true);
    expect(stale.dropPercent).toBeGreaterThanOrEqual(10);
    expect(stale.dueForReview).toBe(false);
  });

  test("names the steepest drop in the headline and reasons in prose", async () => {
    const { analytics, skills } = await setup();
    const now = unixMs(Date.UTC(2026, 8, 8));
    await ingest(analytics, "rhythm.quarter-pulse", unixMs(now - 90 * DAY_MS), 6);
    await ingest(analytics, "harmony.seventh.dominant", now, 6);

    const view = buildSkillDriftView({ skills, analytics, now, budgetMinutes: 20 });

    expect(view.headline).toContain("Quarter-Note Pulse");
    expect(view.reason).toContain("Quarter-Note Pulse");
    expect(view.reason).toContain("20 minutes");
    expect(view.reason).toContain("five");
  });

  test("says nothing is measured when no skill clears the floor", async () => {
    const { analytics, skills } = await setup();
    const now = unixMs(Date.UTC(2026, 8, 8));
    await ingest(analytics, "rhythm.quarter-pulse", now, 4);

    const view = buildSkillDriftView({ skills, analytics, now });

    expect(view.falling).toEqual([]);
    expect(view.holding).toEqual([]);
    expect(view.headline).toBe("Nothing is measured yet");
  });

  test("scopes the verdict to the active instrument", async () => {
    const { analytics, skills } = await setup();
    const now = unixMs(Date.UTC(2026, 8, 8));
    await ingest(analytics, "rhythm.quarter-pulse", unixMs(now - 90 * DAY_MS), 6, "independent", {
      instrument: "piano",
    });

    const view = buildSkillDriftView({ skills, analytics, instrument: "guitar", now });

    // The piano evidence never reaches the guitar verdict.
    expect(view.falling).toEqual([]);
    const pulse = view.unmeasured.find((row) => row.skillId === "rhythm.quarter-pulse")!;
    expect(pulse).toMatchObject({ attempts: 0, dropPercent: 0 });
    expect(pulse.estimatePercent).toBeUndefined();
    expect(
      buildSkillDriftView({ skills, analytics, instrument: "piano", now }).falling.map(
        (row) => row.skillId,
      ),
    ).toEqual(["rhythm.quarter-pulse"]);
  });
});

describe("practice journal projection", () => {
  const now = unixMs(new Date(2026, 8, 8, 18).getTime());
  const yesterday = unixMs(new Date(2026, 8, 7, 18).getTime());

  test("groups runs by day with assistance tags and the same-setup delta", () => {
    const tags = ["v1:changes:d-a", "comparison:bpm:80"];
    const sessions = [
      session("earlier", yesterday, 20, tags, [scoring("a", yesterday, 0.6)]),
      {
        ...session("later", now, 15, tags, [scoring("b", now, 0.8)]),
        nextTime: "Keep the wrist loose.",
      },
      session("hinted", now, 5, [], [scoring("c", now, 0.5, "hinted")]),
    ];

    const view = buildPracticeJournal({ sessions, now });

    expect(view.days.map((day) => day.runs.length)).toEqual([2, 1]);
    expect(view.days[0]!.minutes).toBe(20);
    const later = view.days[0]!.runs.find((run) => run.id === "later")!;
    expect(later).toMatchObject({ accuracyPercent: 80, deltaPercent: 20, assistance: ["unaided"] });
    expect(view.days[0]!.runs.find((run) => run.id === "hinted")!.assistance).toEqual(["hinted"]);
    // The earlier run has no matching run before it, so it carries no delta.
    expect(view.days[1]!.runs[0]!.deltaPercent).toBeUndefined();
    expect(view.nextTime).toEqual({ text: "Keep the wrist loose.", at: now });
    expect(view.totalMinutes).toBe(40);
    expect(view.sessionCount).toBe(3);
  });

  test("refuses a delta when the runs record no comparable input", () => {
    const tags = ["v1:changes:d-a", "comparison:bpm:80"];
    const blank = { source: undefined, instrument: undefined, assistance: undefined };
    const sessions = [
      session("earlier", yesterday, 20, tags, [scoring("a", yesterday, 0.6, "independent", blank)]),
      session("later", now, 15, tags, [scoring("b", now, 0.8, "independent", blank)]),
    ];

    const view = buildPracticeJournal({ sessions, now });

    // Both runs serialise to the same "null" input tag; pairing them would be a lie.
    expect(
      view.days.flatMap((day) => day.runs).every((run) => run.deltaPercent === undefined),
    ).toBe(true);
  });

  test("refuses a delta when the setup records no tempo", () => {
    const sessions = [
      session("earlier", yesterday, 20, ["v1:changes:d-a"], [scoring("a", yesterday, 0.6)]),
      session("later", now, 15, ["v1:changes:d-a"], [scoring("b", now, 0.8)]),
    ];

    const view = buildPracticeJournal({ sessions, now });

    expect(view.days[0]!.runs[0]!.deltaPercent).toBeUndefined();
  });

  test("is empty, not broken, without a single session", () => {
    const view = buildPracticeJournal({ sessions: [], now });

    expect(view.days).toEqual([]);
    expect(view.week.map((day) => day.minutes)).toEqual([0, 0, 0, 0, 0, 0, 0]);
    expect(view.nextTime).toBeUndefined();
    expect(view.totalMinutes).toBe(0);
    expect(view.sessionCount).toBe(0);
  });

  test("reports seven days of minutes ending today", () => {
    const view = buildPracticeJournal({
      sessions: [session("one", yesterday, 20, [], [scoring("a", yesterday, 1)])],
      now,
    });

    expect(view.week).toHaveLength(7);
    expect(view.week.map((day) => day.minutes)).toEqual([0, 0, 0, 0, 0, 20, 0]);
  });

  test("drops another instrument's sessions but keeps unlabelled ones", () => {
    const sessions = [
      { ...session("guitar", now, 10, [], [scoring("a", now, 1)]), instrument: "guitar" as const },
      { ...session("piano", now, 10, [], [scoring("b", now, 1)]), instrument: "piano" as const },
      session("unlabelled", now, 10, [], [scoring("c", now, 1)]),
    ];

    const view = buildPracticeJournal({ sessions, instrument: "guitar", now });

    expect(view.days.flatMap((day) => day.runs.map((run) => run.id)).sort()).toEqual([
      "guitar",
      "unlabelled",
    ]);
  });
});

async function setup() {
  const skills = new SkillGraphStore();
  await skills.seed(seedCoreSkills());
  return { analytics: new AnalyticsEngine(), skills };
}

function ids(rows: { skillId: string }[]): string[] {
  return rows.map((row) => row.skillId);
}

async function ingest(
  analytics: AnalyticsEngine,
  skillId: string,
  at: number,
  count: number,
  assistance: ScoringEvent["assistance"] = "independent",
  overrides: Partial<ScoringEvent> = {},
): Promise<void> {
  for (let index = 0; index < count; index += 1) {
    await analytics.ingest({
      id: `${skillId}-${assistance}-${index}`,
      sessionId: "session-1",
      exerciseId: "exercise-1",
      skillIds: [skillId],
      capabilities: [],
      at: unixMs(at),
      correct: true,
      partialCredit: 1,
      difficulty: 0.6,
      assistance,
      metrics: [],
      ...overrides,
    });
  }
}

function scoring(
  id: string,
  at: number,
  partialCredit: number,
  assistance: ScoringEvent["assistance"] = "independent",
  overrides: Partial<ScoringEvent> = {},
): ScoringEvent {
  return {
    id,
    sessionId: id,
    exerciseId: "technique.guitar.chord-changes",
    skillIds: ["technique.strings.chord-changes"],
    capabilities: [],
    at: unixMs(at),
    correct: partialCredit >= 0.5,
    partialCredit,
    difficulty: 0.6,
    assistance,
    source: "midi",
    instrument: "guitar",
    metrics: [],
    ...overrides,
  };
}

function session(
  id: string,
  at: number,
  minutes: number,
  tags: string[],
  scoringEvents: ScoringEvent[],
): PracticeSession {
  return {
    id,
    startTime: unixMs(at),
    endTime: unixMs(at + minutes * 60_000),
    source: "drill",
    runs: [
      {
        id: `${id}-run`,
        exerciseId: "technique.guitar.chord-changes",
        startedAt: unixMs(at),
        promptIds: [],
        targetSkillIds: ["technique.strings.chord-changes"],
        difficulty: 0.6,
      },
    ],
    scoringEvents,
    xpEarned: 10,
    tags,
  };
}
