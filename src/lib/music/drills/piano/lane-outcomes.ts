// How each note on the beat lane landed, for the marks on its chip: the right
// key inside half the hand's spacing (the window the two-hand grade claims in),
// early or late past a quarter of it, missed once its window has passed.

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
 */
export function laneOutcomes(
  targets: readonly LaneTarget[],
  hits: readonly { midi: number; beat: number }[],
  nowBeat: number | null,
): (LaneOutcome | undefined)[] {
  const used = new Set<number>();
  return targets.map((t) => {
    const win = t.dur / 2;
    let best = -1;
    hits.forEach((h, i) => {
      if (used.has(i) || h.midi !== t.midi || Math.abs(h.beat - t.beat) > win) return;
      if (best < 0 || Math.abs(h.beat - t.beat) < Math.abs(hits[best].beat - t.beat)) best = i;
    });
    if (best >= 0) {
      used.add(best);
      const err = hits[best].beat - t.beat;
      return Math.abs(err) <= win / 2 ? "ok" : err < 0 ? "early" : "late";
    }
    return nowBeat === null || nowBeat > t.beat + win ? "miss" : undefined;
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
  return { kind: o, text: `${o === "early" ? "Early" : "Late"} ${Math.round(Math.abs(errMs))} ms` };
}

/** The timing breakdown from per-target errors in ms (positive late, null missed), on time within `onTimeMs`. */
export function timingFromErrors(errors: readonly (number | null | undefined)[], onTimeMs: number) {
  return timingOf(
    errors.map((e) =>
      e === null || e === undefined
        ? "miss"
        : Math.abs(e) <= onTimeMs
          ? "ok"
          : e < 0
            ? "early"
            : "late",
    ),
  );
}
