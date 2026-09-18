import { afterEach, describe, expect, test, vi } from "vitest";

import { Capability, unixMs, type ScoringEvent } from "@repo/music-core/domain";
import { PracticeDatabase, PracticeStore } from "@repo/music-core/engines/store";

import { lastRunReference, meanPartialCredit, PracticeSessionStore } from "./index";

const databases: PracticeDatabase[] = [];

afterEach(async () => {
  await Promise.all(databases.map((database) => database.delete()));
  databases.length = 0;
});

const event = (
  id: string,
  skillId: string,
  at: number,
  sessionId = "session-1",
  partialCredit = 1,
): ScoringEvent => ({
  id,
  sessionId,
  exerciseId: "exercise-1",
  skillIds: [skillId],
  capabilities: [Capability.Harmony],
  at: unixMs(at),
  correct: partialCredit >= 0.9,
  partialCredit,
  difficulty: 0.5,
  metrics: [],
});

describe("PracticeSessionStore", () => {
  test("a failed journal edit does not leak into later reads or saves", async () => {
    const store = createStore();
    const sessions = new PracticeSessionStore(store);
    sessions.start({ id: "failed-edit", source: "free-practice", startedAt: unixMs(1000) });
    await sessions.flush();
    const before = sessions.all()[0];
    const put = vi.spyOn(store.sessions, "put").mockRejectedValueOnce(new Error("Storage full"));
    try {
      const save = sessions.updateJournal(
        "failed-edit",
        "Rejected note",
        ["rejected"],
        "Rejected reflection",
      );
      await expect(Promise.all([Promise.resolve(save), sessions.flush()])).rejects.toThrow(
        "Storage full",
      );
      expect(sessions.all()[0]).toEqual(before);
      await sessions.updateJournal("failed-edit", "Later note");
      await sessions.flush();
      expect(await store.sessions.get("failed-edit")).not.toHaveProperty("nextTime");
      expect(sessions.all()[0]?.notes).toBe("Later note");
    } finally {
      put.mockRestore();
    }
  });
  test("persists, preserves and clears an optional Next time without changing session evidence", async () => {
    const store = createStore();
    const sessions = new PracticeSessionStore(store);
    const session = sessions.start({
      id: "reflection",
      source: "drill",
      startedAt: unixMs(1000),
      tags: ["practice", "comparison:bpm:80"],
    });
    sessions.finish(session.id, unixMs(2000), 42, "Original note");
    await sessions.flush();
    expect(await store.sessions.get(session.id)).not.toHaveProperty("nextTime");

    await sessions.updateJournal(
      session.id,
      "Edited note",
      ["harmony"],
      "  Start with the left hand  ",
    );
    await sessions.flush();
    const reloaded = new PracticeSessionStore(store);
    await reloaded.load();
    expect(reloaded.all()[0]).toMatchObject({
      nextTime: "Start with the left hand",
      notes: "Edited note",
      tags: ["harmony", "comparison:bpm:80"],
      xpEarned: 42,
      startTime: 1000,
      endTime: 2000,
    });
    await reloaded.updateJournal(session.id, "Another note");
    await reloaded.flush();
    expect(await store.sessions.get(session.id)).toHaveProperty(
      "nextTime",
      "Start with the left hand",
    );
    await reloaded.updateJournal(session.id, "Another note", undefined, "   ");
    await reloaded.flush();
    expect(await store.sessions.get(session.id)).not.toHaveProperty("nextTime");
  });
  test("persists a completed session and queries by skill and date", async () => {
    const sessions = new PracticeSessionStore();
    const session = sessions.start({
      id: "session-1",
      instrument: "piano",
      source: "daily-routine",
      startedAt: unixMs(Date.UTC(2026, 0, 2)),
    });

    sessions.recordRun(session.id, {
      id: "run-1",
      exerciseId: "ear.interval",
      startedAt: session.startTime,
      endedAt: unixMs(Date.UTC(2026, 0, 2, 0, 5)),
      promptIds: ["prompt-1"],
      targetSkillIds: ["harmony.ii-v-i"],
      instrument: "piano",
      difficulty: 0.5,
    });
    sessions.recordScoringEvent(
      session.id,
      event("event-1", "harmony.ii-v-i", Date.UTC(2026, 0, 2)),
    );
    sessions.finish(session.id, unixMs(Date.UTC(2026, 0, 2, 0, 10)), 42, "Worked ii-V-I slowly.");

    expect(sessions.bySkill("harmony.ii-v-i")).toHaveLength(1);
    expect(sessions.byInstrument("piano")).toHaveLength(1);
    expect(
      sessions.byDateRange(unixMs(Date.UTC(2026, 0, 1)), unixMs(Date.UTC(2026, 0, 3))),
    ).toHaveLength(1);
    expect(sessions.summarize(session.id).meanScore).toBe(1);
  });

  test("persists completed sessions and reloads query views", async () => {
    const store = createStore();
    const sessions = new PracticeSessionStore(store);
    const session = sessions.start({
      id: "session-1",
      instrument: "piano",
      source: "drill",
      startedAt: unixMs(Date.UTC(2026, 0, 6, 15)),
      tags: ["morning", "harmony"],
    });

    sessions.recordRun(session.id, {
      id: "run-1",
      exerciseId: "harmony.drill",
      startedAt: session.startTime,
      endedAt: unixMs(Date.UTC(2026, 0, 6, 15, 12)),
      promptIds: ["prompt-1", "prompt-2"],
      targetSkillIds: ["harmony.ii-v-i"],
      instrument: "piano",
      difficulty: 0.5,
      params: { tempo: 80 },
    });
    sessions.recordScoringEvent(
      session.id,
      event("event-1", "harmony.ii-v-i", Date.UTC(2026, 0, 6, 15, 6)),
    );
    sessions.finish(session.id, unixMs(Date.UTC(2026, 0, 6, 15, 15)), 48, "Voicings felt clean.");
    await sessions.flush();

    const reloaded = new PracticeSessionStore(store);
    await reloaded.load();

    expect(reloaded.bySkill("harmony.ii-v-i")).toHaveLength(1);
    expect(reloaded.byInstrument("piano")).toHaveLength(1);
    expect(
      reloaded.byDateRange(unixMs(Date.UTC(2026, 0, 6)), unixMs(Date.UTC(2026, 0, 7))),
    ).toHaveLength(1);
    expect(reloaded.query({ tags: ["harmony"] })[0]?.notes).toBe("Voicings felt clean.");
    expect(reloaded.summarize(session.id)).toMatchObject({
      attempts: 1,
      meanScore: 1,
    });
  });

  test("recovers the persistence queue after a failed write", async () => {
    const store = createStore();
    const put = vi.spyOn(store.sessions, "put");
    put.mockRejectedValueOnce(new Error("Persistence unavailable"));
    const sessions = new PracticeSessionStore(store);
    const session = sessions.start({
      id: "session-retry",
      source: "free-practice",
      startedAt: unixMs(1_000),
    });

    await expect(sessions.flush()).rejects.toThrow("Persistence unavailable");

    await sessions.updateJournal(session.id, "Recovered note");
    sessions.finish(session.id, unixMs(2_000), 12, "Completed after recovery");
    await expect(sessions.flush()).resolves.toBeUndefined();

    expect(put.mock.calls.map(([row]) => row.notes)).toEqual([
      undefined,
      "Recovered note",
      "Completed after recovery",
    ]);

    const reloaded = new PracticeSessionStore(store);
    await reloaded.load();
    expect(reloaded.all()).toEqual([
      expect.objectContaining({
        id: session.id,
        endTime: 2_000,
        xpEarned: 12,
        notes: "Completed after recovery",
      }),
    ]);
  });

  test("edits a journal note and removes a session, persisting both", async () => {
    const store = createStore();
    const sessions = new PracticeSessionStore(store);
    sessions.start({
      id: "keep",
      tags: ["v1:scales:piano:major", "comparison:bpm:60"],
      source: "free-practice",
      startedAt: unixMs(Date.UTC(2026, 0, 6)),
    });
    sessions.start({
      id: "drop",
      source: "free-practice",
      startedAt: unixMs(Date.UTC(2026, 0, 7)),
    });

    await sessions.updateJournal("keep", "Edited note.", ["harmony", "edited"]);
    sessions.remove("drop");
    await sessions.flush();

    expect(sessions.all().map((session) => session.id)).toEqual(["keep"]);

    const reloaded = new PracticeSessionStore(store);
    await reloaded.load();
    expect(reloaded.all()).toHaveLength(1);
    const kept = reloaded.all()[0];
    expect(kept?.id).toBe("keep");
    expect(kept?.notes).toBe("Edited note.");
    expect(kept?.tags).toEqual(["harmony", "edited", "v1:scales:piano:major", "comparison:bpm:60"]);
  });

  test("removing an unknown session is a no-op", () => {
    const sessions = new PracticeSessionStore();
    expect(() => sessions.remove("missing")).not.toThrow();
    expect(sessions.all()).toHaveLength(0);
  });

  test("compares this week against last week", () => {
    const sessions = new PracticeSessionStore();
    const lastWeek = sessions.start({
      id: "last-week",
      source: "daily-routine",
      startedAt: unixMs(Date.UTC(2026, 0, 7, 12)),
    });
    sessions.recordScoringEvent(
      lastWeek.id,
      event("event-last", "harmony.ii-v-i", Date.UTC(2026, 0, 7, 12), lastWeek.id, 0.5),
    );
    sessions.finish(lastWeek.id, unixMs(Date.UTC(2026, 0, 7, 12, 20)), 20);

    const thisWeek = sessions.start({
      id: "this-week",
      source: "daily-routine",
      startedAt: unixMs(Date.UTC(2026, 0, 14, 12)),
    });
    sessions.recordScoringEvent(
      thisWeek.id,
      event("event-this-1", "harmony.ii-v-i", Date.UTC(2026, 0, 14, 12), thisWeek.id, 1),
    );
    sessions.recordScoringEvent(
      thisWeek.id,
      event("event-this-2", "rhythm.quarter-pulse", Date.UTC(2026, 0, 14, 12), thisWeek.id, 0.8),
    );
    sessions.finish(thisWeek.id, unixMs(Date.UTC(2026, 0, 14, 12, 20)), 52);

    expect(sessions.compareWeeks(unixMs(Date.UTC(2026, 0, 15)))).toMatchObject({
      thisWeek: { sessionCount: 1, xp: 52, attempts: 2, meanScore: 0.9 },
      lastWeek: { sessionCount: 1, xp: 20, attempts: 1, meanScore: 0.5 },
      delta: { sessionCount: 0, xp: 32, attempts: 1, meanScore: 0.4 },
    });
  });
});

function createStore(): PracticeStore {
  const database = new PracticeDatabase(`practice-sessions-${crypto.randomUUID()}`);
  databases.push(database);
  return new PracticeStore(database);
}

describe("lastRunReference", () => {
  const drillSession = (id: string, at: number, tags: string[], credits: number[]) => ({
    id,
    startTime: unixMs(at),
    endTime: unixMs(at + 60_000),
    source: "drill" as const,
    runs: [],
    scoringEvents: credits.map((partialCredit, index) =>
      event(`${id}-event-${index}`, "rhythm.patterns", at + index, id, partialCredit),
    ),
    xpEarned: 10,
    tags,
  });

  test("finds the most recent prior run matching all tags", () => {
    const sessions = [
      drillSession("old", Date.UTC(2026, 0, 1), ["rhythm"], [0.5, 0.7]),
      drillSession("newer", Date.UTC(2026, 0, 3), ["rhythm"], [0.8, 1]),
      drillSession("other-drill", Date.UTC(2026, 0, 4), ["scales"], [1]),
    ];

    const reference = lastRunReference(sessions, ["rhythm"], unixMs(Date.UTC(2026, 0, 5)));
    expect(reference?.accuracy).toBeCloseTo(0.9, 5);
    expect(reference?.endedAt).toBe(unixMs(Date.UTC(2026, 0, 3) + 60_000));
  });

  test("ignores runs at or after the cutoff (the run being summarized)", () => {
    const sessions = [
      drillSession("previous", Date.UTC(2026, 0, 1), ["rhythm"], [0.6]),
      drillSession("current", Date.UTC(2026, 0, 2, 12), ["rhythm"], [1]),
    ];

    const reference = lastRunReference(sessions, ["rhythm"], unixMs(Date.UTC(2026, 0, 2, 12)));
    expect(reference?.accuracy).toBeCloseTo(0.6, 5);
  });

  test("only compares matching variants, tempo, and observed input before the visit", () => {
    const matching = [
      "scales",
      "v1:scales:piano:major:up:octave",
      "comparison:bpm:60",
      'comparison:input:[["midi","piano","independent"]]',
    ];
    const sessions = [
      drillSession("match", 1, matching, [0.6]),
      drillSession("other-variant", 2, ["scales", "v1:scales:piano:minor:up:octave"], [1]),
      drillSession("legacy", 3, ["scales"], [1]),
      { ...drillSession("routine", 4, matching, [1]), source: "daily-routine" as const },
      drillSession("this-visit", 5, matching, [1]),
    ];
    expect(lastRunReference(sessions, matching, unixMs(5))?.accuracy).toBe(0.6);
    expect(
      lastRunReference(sessions, [...matching, "comparison:bpm:120"], unixMs(5)),
    ).toBeUndefined();
  });

  test("returns undefined when no prior tagged run exists", () => {
    const sessions = [drillSession("scales-only", Date.UTC(2026, 0, 1), ["scales"], [1])];
    expect(lastRunReference(sessions, ["rhythm"], unixMs(Date.UTC(2026, 0, 5)))).toBeUndefined();
  });
});

describe("meanPartialCredit", () => {
  test("averages partial credit and handles the empty run", () => {
    expect(meanPartialCredit([])).toBe(0);
    expect(
      meanPartialCredit([{ partialCredit: 1 }, { partialCredit: 0.5 }, { partialCredit: 0 }]),
    ).toBeCloseTo(0.5, 5);
  });
});
