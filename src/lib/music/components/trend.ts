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

/**
 * The change since the last run with this setup, in the score's own unit: "Up from 72%",
 * "Down from 100%", "Same as last time". Scores are 0..1; `unit` false leaves the old
 * figure out ("Up on last time"), for a metric that is not a percentage.
 */
export function deltaText(prev: number, now: number, unit = true): string {
  const p = Math.round(prev * 100);
  const n = Math.round(now * 100);
  if (p === n) return "Same as last time";
  const dir = n > p ? "Up" : "Down";
  return unit ? `${dir} from ${p}%` : `${dir} on last time`;
}

/** The score (0..1) a run's metric states, when it is one: "85%" or "3/4"; undefined otherwise ("24"). */
export function metricScore(metric: string): number | undefined {
  const pct = /^(\d+(?:\.\d+)?)%$/.exec(metric.trim());
  if (pct) return Math.min(1, +pct[1] / 100);
  const frac = /^(\d+)\s*(?:\/|of)\s*(\d+)$/.exec(metric.trim());
  if (frac && +frac[2] > 0) return Math.min(1, +frac[1] / +frac[2]);
  return undefined;
}

/** The rows a run could not measure, said once: "Not measured: timing, early or late". */
export function notMeasuredText(labels: readonly string[]): string {
  const low = labels.map((l) => (/^[A-Z][a-z]/.test(l) ? l[0].toLowerCase() + l.slice(1) : l));
  // Labels that carry their own commas or colons are kept apart with semicolons.
  return `Not measured: ${low.join(labels.some((l) => /[,:]/.test(l)) ? "; " : ", ")}`;
}
