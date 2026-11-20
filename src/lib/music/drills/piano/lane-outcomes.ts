// How each note on the beat lane landed, for the marks on its chip: the right
// key inside half the hand's spacing (the window the two-hand grade claims in),
// early or late past a quarter of it, missed once its window has passed.
import { timingBreakdown } from "@repo/music-core/scoring/evidence";
import { m } from "@repo/i18n/messages.js";

export type LaneOutcome = "ok" | "early" | "late" | "miss";

export interface LaneTarget {
  midi: number;
  /** Beats from the downbeat. */
  beat: number;
  /** The hand's spacing in beats (a beat or an eighth). */
  dur: number;
}

/**
 * One outcome per target, in order; undefined while its window is still open.
 * `hits` are note-ons in beats from the downbeat; each hit is claimed once.
 * `nowBeat` null means the run is over, so every unclaimed target is missed.
 * `grader` matches the grade the run gets: `slack` (beats a target may land
 * late at no cost, as a swung off-beat in `claim`) and `pitchClass` (any octave).
 */
export function laneOutcomes(
  targets: readonly LaneTarget[],
  hits: readonly { midi: number; beat: number }[],
  nowBeat: number | null,
  grader: { slack?: (beat: number) => number; pitchClass?: boolean } = {},
): (LaneOutcome | undefined)[] {
  const used = new Set<number>();
  const same = (a: number, b: number) =>
    grader.pitchClass ? (((a - b) % 12) + 12) % 12 === 0 : a === b;
  return targets.map((t) => {
    const win = t.dur / 2;
    const slack = grader.slack?.(t.beat) ?? 0;
    const errOf = (b: number) => (b < t.beat ? b - t.beat : Math.max(0, b - t.beat - slack));
    let best = -1;
    hits.forEach((h, i) => {
      if (used.has(i) || !same(h.midi, t.midi) || Math.abs(errOf(h.beat)) > win) return;
      if (best < 0 || Math.abs(errOf(h.beat)) < Math.abs(errOf(hits[best].beat))) best = i;
    });
    if (best >= 0) {
      used.add(best);
      const err = errOf(hits[best].beat);
      return Math.abs(err) <= win / 2 ? "ok" : err < 0 ? "early" : "late";
    }
    return nowBeat === null || nowBeat > t.beat + slack + win ? "miss" : undefined;
  });
}

/**
 * A line graded by position (the nth note played answers the nth target, any octave):
 * the right pitch class within `tol` beats is on time, past it early or late; a wrong
 * or missing note is missed. Only the notes played so far get an outcome.
 */
export function lineOutcomes(
  targets: readonly { midi: number; beat: number }[],
  played: readonly { midi: number; beat: number }[],
  tol: number,
): (LaneOutcome | undefined)[] {
  return targets.map((t, i) => {
    const p = played[i];
    if (!p) return undefined;
    if ((((p.midi - t.midi) % 12) + 12) % 12) return "miss";
    const err = p.beat - t.beat;
    return Math.abs(err) <= tol ? "ok" : err < 0 ? "early" : "late";
  });
}

/** The results' timing breakdown from a finished run's outcomes (anything unplayed counts as missed). */
export function timingOf(outcomes: readonly (LaneOutcome | undefined)[]) {
  const t = { onTime: 0, early: 0, late: 0, missed: 0 };
  for (const o of outcomes) {
    if (o === "ok") t.onTime++;
    else if (o === "early") t.early++;
    else if (o === "late") t.late++;
    else t.missed++;
  }
  return t;
}

/** The Verdict for one landed outcome, with the error in ms when it is off the beat. */
export function verdictOf(
  o: LaneOutcome,
  errMs = 0,
): { kind: "ontime" | "early" | "late" | "miss"; text?: string } {
  if (o === "ok") return { kind: "ontime" };
  if (o === "miss") return { kind: "miss" };
  const ms = Math.round(Math.abs(errMs));
  return {
    kind: o,
    text: o === "early" ? m.music_strings_early_ms({ ms }) : m.music_strings_late_ms({ ms }),
  };
}

/** The timing breakdown from per-target errors in ms (positive late, null missed): the shared K3 rule. */
export const timingFromErrors = timingBreakdown;
