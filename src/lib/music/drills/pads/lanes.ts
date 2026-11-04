// A fixed colour per drum, the way play-along apps colour their lanes: the
// low drums warm, the cymbals cool, so a lane is known before it is read.
// Always drawn with the drum's name (colour is never the only cue).
const HUE: Record<string, number> = {
  kick: 22,
  "808": 5,
  snare: 70,
  rim: 50,
  perc: 345,
  hats: 135,
  pedalhat: 155,
  openhat: 185,
  "tom-high": 225,
  "tom-mid": 245,
  "tom-low": 265,
  ride: 290,
  crash: 315,
  cowbell: 95,
  // Rudiments: the two hands, and both fingers on one pad.
  left: 250,
  right: 40,
  both: 160,
};

/** A drum's colour; a chop's slices go round the colour wheel, slice 1 warm. */
export function laneColor(id: string) {
  const slice = /^slice-(\d+)$/.exec(id);
  const hue = slice ? (20 + (Number(slice[1]) - 1) * 22.5) % 360 : (HUE[id] ?? 200);
  return `oklch(0.74 0.17 ${hue})`;
}

/** Top to bottom as drum notation reads: cymbals, hats, toms, snare, kick. Slices in order after. */
const LANE_ORDER = [
  "crash",
  "ride",
  "cowbell",
  "openhat",
  "hats",
  "pedalhat",
  "tom-high",
  "tom-mid",
  "perc",
  "rim",
  "snare",
  "tom-low",
  "kick",
  "808",
];
export function orderLanes(ids: Iterable<string>): string[] {
  const rank = (id: string) => {
    const i = LANE_ORDER.indexOf(id);
    if (i >= 0) return i;
    const slice = /^slice-(\d+)$/.exec(id);
    return slice ? 100 + Number(slice[1]) : 1000;
  };
  return [...new Set(ids)].sort((a, b) => rank(a) - rank(b));
}

export type Judgement = "perfect" | "early" | "late" | "miss";
export const JUDGEMENT_TEXT: Record<Judgement, string> = {
  perfect: "Perfect",
  early: "Early",
  late: "Late",
  miss: "Miss",
};

// ---------------------------------------------------------------------------
// The lanes view: time to x, the grid behind, the pad grid beside.

/** The share of the width behind the hit line, where judged notes leave. */
export const BEHIND = 0.16;

export interface HighwayScale {
  hitX: number;
  pxPerMs: number;
  /** ms before and after now that the width shows. */
  behindMs: number;
  aheadMs: number;
}

/** The highway shows `aheadBars` bars ahead of the hit line, whatever the width. */
export function highwayScale(
  width: number,
  beatMs: number,
  beatsPerBar: number,
  aheadBars: number,
): HighwayScale {
  const aheadMs = Math.max(1, aheadBars * beatsPerBar * beatMs);
  const hitX = width * BEHIND;
  const pxPerMs = (width - hitX) / aheadMs;
  return { hitX, pxPerMs, behindMs: hitX / pxPerMs, aheadMs };
}

/** Where a moment (ms from the downbeat) sits when the hit line is at `now`. */
export const xAt = (ms: number, now: number, s: HighwayScale) => s.hitX + (ms - now) * s.pxPerMs;

export interface GridLine {
  ms: number;
  kind: "bar" | "beat" | "step";
  /** Bar number (from 1) on a bar line. */
  bar?: number;
}

/**
 * The lines between two moments: bars, clicks and the steps between clicks.
 * Any meter (5 or 7 clicks a bar) and any split of the click (3 for
 * triplets). Steps are left out when they would sit closer than `minStepPx`.
 */
export function gridLines(
  fromMs: number,
  toMs: number,
  beatMs: number,
  beatsPerBar: number,
  stepsPerBeat: number,
  pxPerMs = Infinity,
  minStepPx = 7,
): GridLine[] {
  const steps = (beatMs / stepsPerBeat) * pxPerMs >= minStepPx ? stepsPerBeat : 1;
  const stepMs = beatMs / steps;
  const perBar = steps * beatsPerBar;
  const out: GridLine[] = [];
  for (let k = Math.ceil(fromMs / stepMs - 1e-9) + 0; k * stepMs <= toMs + 1e-9; k++) {
    const inBar = ((k % perBar) + perBar) % perBar;
    const ms = k * stepMs;
    if (inBar === 0) out.push({ ms, kind: "bar", bar: Math.round(k / perBar) + 1 });
    else out.push({ ms, kind: inBar % steps === 0 ? "beat" : "step" });
  }
  return out;
}

/** Steps a beat that put every hit on a line: sixteenths, triplets, sextuplets, or finer. */
export function stepsPerBeatFor(beats: Iterable<number>): number {
  const all = [...beats];
  const fits = (n: number) => all.every((b) => Math.abs(b * n - Math.round(b * n)) < 0.02);
  return [4, 3, 6, 8, 12].find(fits) ?? 4;
}

/** A pad's place on the 4 by 4 grid, laid out like the MPC: A01 bottom left, A16 top right. Row 0 is the top. */
export function padCell(midi: number, base = 36): { row: number; col: number } | null {
  const i = midi - base;
  if (i < 0 || i > 15) return null;
  return { row: 3 - Math.floor(i / 4), col: i % 4 };
}

// ---------------------------------------------------------------------------
// Judging hits as they come, for the live feedback (the grade is the grader's).

export interface Window {
  perfect: number;
  good: number;
}

/** A hit, judged against the nearest unjudged note on its pad inside the good window. */
export function judgeHit(
  notes: readonly { pad: number; atMs: number }[],
  judged: Record<number, Judgement>,
  pad: number,
  at: number,
  w: Window,
): { index: number; judgement: Judgement; err: number } | null {
  let index = -1;
  let err = Infinity;
  notes.forEach((t, i) => {
    if (judged[i] || t.pad !== pad) return;
    const d = at - t.atMs;
    if (Math.abs(d) <= w.good && Math.abs(d) < Math.abs(err)) [index, err] = [i, d];
  });
  if (index < 0) return null;
  return {
    index,
    err,
    judgement: Math.abs(err) <= w.perfect ? "perfect" : err < 0 ? "early" : "late",
  };
}

/** Notes gone past the good window unhit by `at`. */
export const overdue = (
  notes: readonly { atMs: number }[],
  judged: Record<number, Judgement>,
  at: number,
  good: number,
) => notes.flatMap((t, i) => (!judged[i] && t.atMs + good < at ? [i] : []));

/** The pads to light: notes from just behind now to `aheadMs` ahead. */
export function padsDue(
  notes: readonly { pad: number; atMs: number }[],
  at: number,
  aheadMs: number,
): Set<number> {
  const out = new Set<number>();
  for (const t of notes) if (t.atMs >= at - 40 && t.atMs <= at + aheadMs) out.add(t.pad);
  return out;
}
