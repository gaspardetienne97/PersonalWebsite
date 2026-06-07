import { describe, expect, test } from "vitest";

import type { PracticeSession } from "@repo/music-core/domain";

import { summarizeFocusAreas } from "./journal-focus";

function session(start: string, tags: string[]): PracticeSession {
  const startTime = new Date(start).getTime();
  return {
    id: start,
    startTime: startTime as unknown as PracticeSession["startTime"],
    source: "manual" as PracticeSession["source"],
    runs: [],
    scoringEvents: [],
    xpEarned: 0,
    tags,
  };
}

describe("summarizeFocusAreas", () => {
  test("aggregates tag counts and most-recent practice", () => {
    const focus = summarizeFocusAreas([
      session("2026-06-01T10:00:00Z", ["ii-V-I", "shell voicings"]),
      session("2026-06-03T10:00:00Z", ["ii-V-I"]),
      session("2026-06-02T10:00:00Z", ["spider"]),
    ]);

    expect(focus[0]).toMatchObject({ tag: "ii-V-I", sessionCount: 2 });
    expect(focus.map((entry) => entry.tag)).toContain("spider");
  });

  test("orders by recency then count and respects the limit", () => {
    const focus = summarizeFocusAreas(
      [
        session("2026-06-01T10:00:00Z", ["a"]),
        session("2026-06-05T10:00:00Z", ["b"]),
        session("2026-06-03T10:00:00Z", ["c"]),
      ],
      2,
    );
    expect(focus.map((entry) => entry.tag)).toEqual(["b", "c"]);
  });
});
