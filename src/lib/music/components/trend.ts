import type { PracticeSession, RunRecord } from "@repo/music-core";
import { ADVANCE, type AdvanceNext } from "@repo/music-core/progress/advance";
import { m } from "@repo/i18n/messages.js";

/**
 * Scored runs, oldest first, with the setup of the newest run if it ended within `fresh` ms.
 * The setup includes the instrument: a scale on guitar is never compared with the same scale on piano.
 */
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
        r.exerciseId === last.exerciseId &&
        r.setupKey === last.setupKey &&
        r.instrument === last.instrument &&
        r.score !== undefined,
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

export const VERDICT_WORDS: readonly string[] = [
  m.music_shell_trend_keep_at_it(),
  m.music_shell_trend_nearly(),
  m.music_shell_trend_good_run(),
  m.music_shell_trend_clean_run(),
];
const asPct = (value: number) => m.music_shell_pct({ value });

/** A score with nothing missed, in the whole percents the ring shows. */
export const isClean = (score: number | undefined) =>
  score !== undefined && Math.round(score * 100) === 100;

/**
 * The verdict word. "Clean" means one thing everywhere: a run the drill's own rule counts (the
 * same run the pips count). Three stars read "Clean run"; with nothing missed, "Perfect run!".
 */
export const verdictWord = (n: Stars, score: number | undefined) =>
  n === 3 && isClean(score) ? m.music_shell_trend_perfect() : VERDICT_WORDS[n];

const passPct = Math.round(ADVANCE.pass * 100);
const failPct = Math.round(ADVANCE.fail * 100);
/** What the stars mean, for their accessible name. */
export function starsLabel(n: Stars): string {
  const fail = asPct(failPct);
  const pass = asPct(passPct);
  return [
    m.music_shell_trend_stars_0({ fail }),
    m.music_shell_trend_stars_1({ fail }),
    m.music_shell_trend_stars_2({ pass }),
    m.music_shell_trend_stars_3({ pass }),
  ][n];
}

/**
 * The star key: what the next star takes, or null at three stars (a key there read as the
 * run's result). `cleanMeans` is the drill's own rule for a clean run ("every answer right");
 * leave it out when the screen already says what a clean run is.
 */
export function starKey(n: Stars, cleanMeans?: string): string | null {
  if (n === 0) return m.music_shell_trend_next_star({ what: asPct(failPct) });
  if (n === 1) return m.music_shell_trend_next_star({ what: asPct(passPct) });
  return n === 2
    ? m.music_shell_trend_next_star({ what: cleanMeans ?? m.music_shell_trend_a_clean_run() })
    : null;
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
  return `${m.music_shell_trend_unmeasured({ list })}${list.endsWith(".") ? "" : "."}`;
}

/** The count toward moving on, in words: "Clean runs: 1 of 2 to move on" (the next-run line says faster or harder). */
export function pipsText(
  a: Pick<AdvanceNext, "kind" | "passes" | "need" | "reason" | "bpm">,
): string {
  // The full count moved the run on: the rule's own reason ("2 clean runs at 80 BPM"), then what it earned.
  if (a.passes >= a.need && (a.kind === "faster" || a.kind === "harder"))
    return (a.kind === "faster" ? m.music_shell_trend_speeding_up : m.music_shell_trend_moving_on)({
      reason: `${a.reason[0].toUpperCase()}${a.reason.slice(1)}`,
    });
  return m.music_shell_trend_pips({ passes: a.passes, need: a.need });
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
        unit && o.priorBest !== undefined
          ? m.music_shell_trend_new_best_from({ prior: asPct(pct(o.priorBest)) })
          : m.music_shell_trend_new_best(),
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
 * "Last time: 100%", "Same as last time". Scores are 0..1; `unit` false leaves the old
 * figure out ("Up on last time"), for a metric that is not a percentage.
 */
export function deltaText(prev: number, now: number, unit = true): string {
  const p = Math.round(prev * 100);
  const n = Math.round(now * 100);
  if (p === n) return m.music_shell_trend_same();
  // A drop states the last figure plainly (the ring already shows this one), never "Down from".
  if (n < p)
    return unit
      ? m.music_shell_trend_last_time({ prior: asPct(p) })
      : m.music_shell_trend_down_on_last();
  return unit ? m.music_shell_trend_up_from({ prior: asPct(p) }) : m.music_shell_trend_up_on_last();
}

/** The score (0..1) a run's metric states, when it is one: "85%" or "3/4"; undefined otherwise ("24"). */
export function metricScore(metric: string): number | undefined {
  // Any language's way of writing it: "85 %", "85,5%", "3 de 4", "3 sur 4", "3 sou 4".
  const pct = /^(\d+(?:[.,]\d+)?)\s*%$/.exec(metric.trim());
  if (pct) return Math.min(1, +pct[1].replace(",", ".") / 100);
  const frac = /^(\d+)\s*(?:\/|of|de|sur|sou)\s*(\d+)$/.exec(metric.trim());
  if (frac && +frac[2] > 0) return Math.min(1, +frac[1] / +frac[2]);
  return undefined;
}
