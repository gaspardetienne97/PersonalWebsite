// The note highway's geometry, as fractions so the component only scales them.
// One lane per string, string 1 (the highest) on top as tab writes it; time
// runs right to left into a "now" line near the left edge. Beats are the
// caller's beats (quarter notes for a score); `ahead` is how many fit between
// the now line and the right edge.
import { timingVerdict } from "@repo/music-core/scoring/timing";

/** The now line, as a fraction of the width from the left. */
export const NOW_X = 0.16;

/** A string's lane centre as a fraction of the lanes' height. */
export const laneY = (string: number, strings: number) => (string - 0.5) / strings;

/** A beat's x as a fraction of the width, with `ahead` beats past the now line. */
export const beatX = (at: number, now: number, ahead: number) =>
  NOW_X + ((at - now) / ahead) * (1 - NOW_X);

/** A length in beats as a fraction of the width. */
export const spanX = (beats: number, ahead: number) => (beats / ahead) * (1 - NOW_X);

/** Beats still on screen after they pass the now line. */
export const behindBeats = (ahead: number) => (ahead * NOW_X) / (1 - NOW_X);

/** On screen at `now`: not yet ended off the left edge, started before the right one. */
export const inView = (
  item: { startBeat: number; durationBeats: number },
  now: number,
  ahead: number,
) => item.startBeat + item.durationBeats > now - behindBeats(ahead) && item.startBeat < now + ahead;

/** A chord block over the strings it sounds on: its top and height as fractions of the lanes. */
export function chordBlock(strings: readonly number[], count: number) {
  const top = Math.min(...strings);
  const bottom = Math.max(...strings);
  return { top: (top - 1) / count, height: (bottom - top + 1) / count };
}

/** A hit's offset in ms (positive is late), or how it went when there is no timing. */
export type Hit = number | "hit" | "missed" | "wrong";
export type HitVerdict = "perfect" | "early" | "late" | "hit" | "missed" | "wrong";

/** Within `perfectMs` of the beat is perfect, else early or late. */
export function hitVerdict(hit: Hit, perfectMs: number): HitVerdict {
  if (typeof hit !== "number") return hit;
  const v = timingVerdict(hit, perfectMs);
  return v === "pocket" ? "perfect" : v;
}

/**
 * The beat ball's height (a fraction of the lanes, negative above them) at
 * `now`. It sits on the now line and lands on each onset as the onset reaches
 * it, arcing between; a hop shorter than a beat arcs lower. Before the first
 * onset it falls in from a beat out; after the last there is none.
 */
export function ballY(
  onsets: readonly { beat: number; y: number }[],
  now: number,
  lift = 0.3,
): number | null {
  const i = onsets.findIndex((o) => o.beat > now + 1e-9);
  if (i < 0) return null;
  const next = onsets[i];
  const prev = onsets[i - 1] ?? { beat: next.beat - 1, y: next.y };
  const p = Math.max(0, (now - prev.beat) / (next.beat - prev.beat));
  const h = lift * Math.min(1, next.beat - prev.beat);
  return prev.y + (next.y - prev.y) * p - h * 4 * p * (1 - p);
}
