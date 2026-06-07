import type { PracticeSession } from "@repo/music-core/domain";

export interface FocusArea {
  tag: string;
  sessionCount: number;
  lastPracticedMs: number;
}

/**
 * Derives "focus areas" from real session tags — the topics you've practiced
 * most recently and most often. Ordered by recency, then frequency.
 */
export function summarizeFocusAreas(sessions: PracticeSession[], limit = 5): FocusArea[] {
  const byTag = new Map<string, { count: number; last: number }>();
  for (const session of sessions) {
    const start = Number(session.startTime);
    for (const tag of session.tags) {
      const entry = byTag.get(tag) ?? { count: 0, last: 0 };
      entry.count += 1;
      entry.last = Math.max(entry.last, start);
      byTag.set(tag, entry);
    }
  }

  return [...byTag.entries()]
    .map(([tag, entry]) => ({ tag, sessionCount: entry.count, lastPracticedMs: entry.last }))
    .sort(
      (left, right) =>
        right.lastPracticedMs - left.lastPracticedMs || right.sessionCount - left.sessionCount,
    )
    .slice(0, limit);
}
