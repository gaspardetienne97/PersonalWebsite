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
