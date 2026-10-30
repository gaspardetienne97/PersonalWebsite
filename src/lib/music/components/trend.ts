import type { PracticeSession, RunRecord } from "@repo/music-core";

/**
 * Scores (0..1), oldest first, of the last `n` runs with the setup of the run
 * just saved: the newest run, if it ended within `fresh` ms. Empty when that run
 * has no score or is not this one (a run that was not recorded).
 */
export function setupTrend(
  sessions: readonly PracticeSession[],
  now = Date.now(),
  n = 8,
  fresh = 15_000,
): number[] {
  const runs = sessions.flatMap((s) => s.runs);
  const last = runs.reduce<RunRecord | undefined>(
    (a, r) => (!a || r.endedAt > a.endedAt ? r : a),
    undefined,
  );
  if (!last || last.score === undefined || now - last.endedAt > fresh) return [];
  return runs
    .filter(
      (r) =>
        r.exerciseId === last.exerciseId && r.setupKey === last.setupKey && r.score !== undefined,
    )
    .sort((a, b) => a.endedAt - b.endedAt)
    .slice(-n)
    .map((r) => r.score!);
}

/** The sparkline's points in a `w` by `h` box, 0 at the bottom. */
export const sparkPoints = (scores: readonly number[], w: number, h: number) =>
  scores.map(
    (v, i) =>
      [
        scores.length > 1 ? (i / (scores.length - 1)) * w : w / 2,
        h - Math.max(0, Math.min(1, v)) * h,
      ] as const,
  );
