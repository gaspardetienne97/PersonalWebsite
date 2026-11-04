import type { PracticeSession, RunRecord } from "@repo/music-core";
import { ADVANCE, type AdvanceNext } from "@repo/music-core/progress/advance";

/** Scored runs, oldest first, with the setup of the newest run if it ended within `fresh` ms. */
function setupRuns(sessions: readonly PracticeSession[], now: number, fresh: number): RunRecord[] {
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
    .sort((a, b) => a.endedAt - b.endedAt);
}

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
  return setupRuns(sessions, now, fresh)
    .slice(-n)
    .map((r) => r.score!);
}

/** The best score with this setup before the run just saved, or undefined when it is the first. */
export function priorBest(
  sessions: readonly PracticeSession[],
  now = Date.now(),
  fresh = 15_000,
): number | undefined {
  const before = setupRuns(sessions, now, fresh).slice(0, -1);
  return before.length ? Math.max(...before.map((r) => r.score!)) : undefined;
}

export type Stars = 0 | 1 | 2 | 3;

/**
 * Stars on the score, with the third kept for the advance rule's pass: one at
 * 70% (the tempo does not step back), two at 85%, three only for a pass (85%
 * and the drill's own `correct`), the one run the rule counts. Null when the
 * run has no score to judge.
 */
export function starsFor(score: number | undefined, pass: boolean): Stars | null {
  if (score === undefined) return null;
  if (score >= ADVANCE.pass) return pass ? 3 : 2;
  return score >= ADVANCE.fail ? 1 : 0;
}

/** The score's tone on the same lines as the stars, so the ring never disagrees with the word. */
export const scoreTone = (score: number): "success" | "warn" | "error" =>
  score >= ADVANCE.pass ? "success" : score >= ADVANCE.fail ? "warn" : "error";

export const VERDICT_WORDS = ["Keep at it", "Close", "Good run", "Clean run!"] as const;

/** A score with nothing missed, in the whole percents the ring shows. */
export const isClean = (score: number | undefined) =>
  score !== undefined && Math.round(score * 100) === 100;

/**
 * The verdict word: three stars read "Clean run!" only when nothing was missed; a pass the
 * rule counts with a miss in it (a drill whose rule allows 9 of 10) reads "Passed".
 */
export const verdictWord = (n: Stars, score: number | undefined) =>
  n === 3 && !isClean(score) ? "Passed" : VERDICT_WORDS[n];

const passPct = Math.round(ADVANCE.pass * 100);
const failPct = Math.round(ADVANCE.fail * 100);
/** What the stars mean, for their accessible name. */
export function starsLabel(n: Stars): string {
  return [
    `0 of 3 stars: ${failPct}% earns the first`,
    `1 of 3 stars: ${failPct}% or better`,
    `2 of 3 stars: ${passPct}% or better`,
    `3 of 3 stars: a pass by the drill's own rule at ${passPct}% or better`,
  ][n];
}

/**
 * The star key, always shown under the stars: what the next star takes.
 * `cleanMeans` is the drill's own rule for a clean run ("every answer right", "9 of 10 right or better").
 */
export function starKey(n: Stars, cleanMeans?: string): string {
  if (n === 0) return `Next star: ${failPct}%`;
  if (n === 1) return `Next star: ${passPct}%`;
  const rule = cleanMeans ? `, ${cleanMeans}` : "";
  return n === 2 ? `Next star: a clean run${rule}` : `All 3 stars: a clean run${rule}`;
}

/**
 * Rows the input cannot measure (Not measured with no reason) as one line,
 * "Not measured with this input: which string, tone.", or null when there are
 * none. A row Not measured for too little evidence carries its reason and stays a row.
 */
export function unmeasuredLine(
  rows: readonly { label: string; notMeasured?: boolean; text?: string }[],
): string | null {
  const names = rows
    .filter((r) => r.notMeasured && !r.text)
    .map((r) =>
      /^[A-Z][A-Z]/.test(r.label) ? r.label : r.label[0].toLowerCase() + r.label.slice(1),
    );
  if (!names.length) return null;
  const list = names.join(names.some((n) => n.includes(",")) ? "; " : ", ");
  return `Not measured with this input: ${list}${list.endsWith(".") ? "" : "."}`;
}

/** The count toward moving on, in words: "Clean runs: 1 of 2 to speed up". */
export function pipsText(
  a: Pick<AdvanceNext, "kind" | "passes" | "need" | "reason" | "bpm">,
): string {
  // The full count moved the run on: the rule's own reason ("2 clean runs at 80 BPM"), then what it earned.
  if (a.passes >= a.need && (a.kind === "faster" || a.kind === "harder"))
    return `${a.reason[0].toUpperCase()}${a.reason.slice(1)}: ${a.kind === "faster" ? "speeding up next" : "moving on next"}`;
  return `Clean runs: ${a.passes} of ${a.need} to ${a.bpm !== undefined ? "speed up" : "move on"}`;
}

/**
 * The line under the verdict, from one source so it never disagrees with the
 * sparkline: a best names the old best; otherwise the last two runs with this
 * setup; otherwise the drill's own delta (points). A best that does not beat the
 * old one in whole percents is not called a best. `score` undefined for a metric
 * that is not a percentage.
 */
export function deltaLine(o: {
  trend: readonly number[];
  best?: boolean;
  priorBest?: number;
  delta?: number | null;
  score?: number;
}): { text: string; up: boolean; best: boolean } | null {
  const unit = o.score !== undefined;
  const pct = (v: number) => Math.round(v * 100);
  const best =
    !!o.best && !(unit && o.priorBest !== undefined && pct(o.priorBest) >= pct(o.score!));
  if (best)
    return {
      text:
        unit && o.priorBest !== undefined ? `New best, up from ${pct(o.priorBest)}%` : "New best",
      up: true,
      best,
    };
  if (o.trend.length >= 2) {
    const [a, b] = o.trend.slice(-2);
    return { text: deltaText(a, b, unit), up: pct(b) > pct(a), best };
  }
  if (o.delta === null || o.delta === undefined) return null;
  const d = o.delta / 100;
  return {
    text: unit ? deltaText(o.score! - d, o.score!) : deltaText(0, d, false),
    up: Math.round(o.delta) > 0,
    best,
  };
}

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
