import { describe, expect, test } from "vitest";

import type { PracticeSession } from "@repo/music-core/domain";

import { buildJournalHeatmap } from "./journal-projections";

function session(start: string, durationMin: number): PracticeSession {
  const startTime = new Date(start).getTime();
  return {
    id: start,
    startTime: startTime as unknown as PracticeSession["startTime"],
    endTime: (startTime + durationMin * 60_000) as unknown as PracticeSession["endTime"],
    source: "manual" as PracticeSession["source"],
    runs: [],
    scoringEvents: [],
    xpEarned: 0,
    tags: [],
  };
}

describe("buildJournalHeatmap", () => {
  test("returns weeks of 7 days each", () => {
    const heatmap = buildJournalHeatmap([], new Date("2026-06-05"));
    expect(heatmap.length).toBeGreaterThan(0);
    expect(heatmap[0]!.length).toBe(7);
  });

  test("counts session minutes per day from start/end time", () => {
    const heatmap = buildJournalHeatmap(
      [session("2026-06-01T10:00:00Z", 30)],
      new Date("2026-06-05"),
    );
    const cell = heatmap.flat().find((entry) => entry.date === "2026-06-01");
    expect(cell?.minutes).toBe(30);
    expect(cell?.intensity).toBe(3);
  });
});
