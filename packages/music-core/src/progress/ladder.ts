// The tune ladder and the repertoire (jazz path, ranks 1 and 11). Every standard is
// learned through six rungs, a to f, each read from checked runs: Song Studio on the
// tune's shelf score, Jam on its changes, Accompaniment comping and lead sheets. A tune
// with rung a done is in the repertoire and comes back for review the way a skill does.
import type { RunRecord } from "../types";
import { TUNES } from "../content/tunes";
import jazz from "../data/paths/jazz.json";
import { applyEvidence, DAY_MS, isDueForReview, REVIEW_DROP } from "./mastery";
import { dayKey } from "./rewards";

export type Rung = "a" | "b" | "c" | "d" | "e" | "f";

export const RUNGS: { id: Rung; label: string; done: string }[] = [
  {
    id: "a",
    label: "Roots and melody",
    done: "Song practice in Performance mode on the tune's notation: 90% or better at 90% of its tempo or faster, on two days.",
  },
  {
    id: "b",
    label: "Guide tones",
    done: "Jam's guide-tones game on the tune: two choruses, 90% or better, at 80% of its tempo or faster.",
  },
  {
    id: "c",
    label: "Melody and shells",
    done: "Accompaniment's lead sheet on the tune's notation, shells in the left hand: 90% or better.",
  },
  {
    id: "d",
    label: "Rootless comping",
    done: "Accompaniment's comping on the tune's changes with rootless voicings: 90% or better.",
  },
  {
    id: "e",
    label: "A solo chorus",
    done: "Jam's make-the-changes game on the tune, every chorus meeting its aims.",
  },
  {
    id: "f",
    label: "A second key",
    done: "Steps a and c in another key: 85% or better each.",
  },
];

export interface LadderTune {
  /** The shelf song id (Jam's progression is `tune-<id>`). */
  id: string;
  name: string;
  bpm: number;
  /** Jam has its changes (rungs b, d and e need them). */
  changes: boolean;
}

/** Every standard on the jazz shelf, and the tune player's tunes. */
export const LADDER_TUNES: LadderTune[] = (() => {
  const out = new Map<string, LadderTune>();
  for (const level of jazz.levels)
    for (const s of level.shelf as { id: string; title: string; bpm?: number }[])
      out.set(s.id, { id: s.id, name: s.title, bpm: s.bpm ?? 0, changes: false });
  for (const t of TUNES) {
    const id = t.id.replace(/^tune-/, "");
    out.set(id, {
      id,
      name: out.get(id)?.name ?? t.name,
      bpm: out.get(id)?.bpm || t.bpm,
      changes: true,
    });
  }
  return [...out.values()];
})();

export interface RungState {
  done: boolean;
  /** Checked runs that met the rung's bar. */
  runs: number;
  last?: number;
}

export interface TuneLadderState {
  tune: LadderTune;
  rungs: Record<Rung, RungState>;
  /** Runs on the tune at all, for its review. */
  played: number;
  lastPlayed?: number;
  /** In the repertoire (rung a done): when it is due again and whether it is due now. */
  review?: { due: boolean; dueAt: number };
}

const num = (r: RunRecord, k: string) => Number(r.params[k] ?? 0);
const str = (r: RunRecord, k: string) => String(r.params[k] ?? "");
const SONG = "song.studio";
const JAM = "jam.improv";
const LEAD = "technique.piano.lead-sheet";
const COMP = "technique.piano.comping-changes";

/** Which tune a run is on, by the shelf score or Jam's and Comping's progression. */
function tuneOf(r: RunRecord): string | undefined {
  const shelf = str(r, "shelf");
  if (shelf.startsWith("jazz/")) return shelf.slice(5);
  const p = str(r, "progression");
  return (r.exerciseId === JAM || r.exerciseId === COMP) && p.startsWith("tune-")
    ? p.slice(5)
    : undefined;
}

/** The rungs a run meets (a run can meet a or c and also count toward f). */
function rungsOf(r: RunRecord, tune: LadderTune): Rung[] {
  const score = r.score ?? (r.correct ? 1 : 0);
  const bpm = num(r, "bpm");
  const moved = !!num(r, "transpose");
  const out: Rung[] = [];
  const perf = r.exerciseId === SONG && ["performance", "no-stop"].includes(str(r, "mode"));
  const shells = r.exerciseId === LEAD && str(r, "lh") === "shells";
  if (perf && !moved && score >= 0.9 && bpm >= tune.bpm * 0.9 - 1e-9) out.push("a");
  if (shells && !moved && score >= 0.9) out.push("c");
  if ((perf || shells) && moved && score >= 0.85) out.push("f");
  if (r.exerciseId === JAM) {
    if (
      str(r, "game") === "guide-tones" &&
      num(r, "choruses") >= 2 &&
      score >= 0.9 &&
      bpm >= tune.bpm * 0.8 - 1e-9
    )
      out.push("b");
    if (str(r, "game") === "changes" && r.correct) out.push("e");
  }
  if (
    r.exerciseId === COMP &&
    ["rootless", "root-rootless"].includes(str(r, "voicing")) &&
    score >= 0.9
  )
    out.push("d");
  return out;
}

/** Each tune's ladder and review, from checked runs. Tunes with no runs are listed too. */
export function tuneLadders(runs: readonly RunRecord[], now = Date.now()): TuneLadderState[] {
  const byTune = new Map<string, RunRecord[]>();
  for (const r of runs) {
    if (r.assistance !== "independent" || !r.endedAt) continue;
    const id = tuneOf(r);
    if (id) byTune.set(id, [...(byTune.get(id) ?? []), r]);
  }
  return LADDER_TUNES.map((tune) => {
    const mine = (byTune.get(tune.id) ?? []).sort((a, b) => a.endedAt - b.endedAt);
    const rungs = Object.fromEntries(
      RUNGS.map((g) => [g.id, { done: false, runs: 0 } as RungState]),
    ) as Record<Rung, RungState>;
    const aDays = new Set<string>();
    // f needs a transposed a-type and c-type run.
    const fKinds = new Set<string>();
    for (const r of mine)
      for (const g of rungsOf(r, tune)) {
        rungs[g].runs++;
        rungs[g].last = r.endedAt;
        if (g === "a") aDays.add(dayKey(r.endedAt));
        if (g === "f") fKinds.add(r.exerciseId);
      }
    for (const g of RUNGS) rungs[g.id].done = rungs[g.id].runs > 0;
    rungs.a.done = aDays.size >= 2;
    rungs.f.done = fKinds.has(SONG) && fKinds.has(LEAD);
    // A tune comes due as a skill does: every run on it is a review.
    let m;
    for (const r of mine) m = applyEvidence(m, `tune.${tune.id}`, r.score ?? 0, 0.5, r.endedAt);
    const review =
      m && rungs.a.done
        ? {
            due: isDueForReview(m, now),
            // The day the estimate falls REVIEW_DROP below the last measure.
            dueAt:
              m.lastPracticed +
              (m.mastery > REVIEW_DROP
                ? (-Math.log((m.mastery - REVIEW_DROP) / m.mastery) / m.decayRate) * DAY_MS
                : 0),
          }
        : undefined;
    return {
      tune,
      rungs,
      played: mine.length,
      lastPlayed: mine[mine.length - 1]?.endedAt,
      review,
    };
  });
}

/** The repertoire's tune to review next: the most overdue, else the soonest due. */
export const nextReview = (ladders: TuneLadderState[]) =>
  ladders.filter((l) => l.review).sort((a, b) => a.review!.dueAt - b.review!.dueAt)[0];

/** A path step on the ladder: `rungs` done on `tunes` tunes (from `among` when it names some). */
export interface LadderCriterion {
  rungs: Rung[];
  tunes: number;
  among?: string[];
}

/**
 * The step's evidence: one row per tune it needs, the closest tunes first; a row is done when
 * the tune has every rung. `attempts` is the rungs done, `mean` their share.
 */
export function ladderEvidence(c: LadderCriterion, runs: readonly RunRecord[]) {
  const rows = tuneLadders(runs)
    .filter((l) => !c.among || c.among.includes(l.tune.id))
    .map((l) => {
      const done = c.rungs.filter((g) => l.rungs[g].done).length;
      return {
        skillId: l.tune.id,
        attempts: done,
        sessions: done,
        days: done,
        mean: done / c.rungs.length,
        done: done === c.rungs.length,
      };
    })
    .sort((a, b) => b.mean - a.mean)
    .slice(0, c.tunes);
  while (rows.length < c.tunes)
    rows.push({ skillId: "tune", attempts: 0, sessions: 0, days: 0, mean: 0, done: false });
  return rows;
}
