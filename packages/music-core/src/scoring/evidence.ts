// One source for the numbers a results screen shows about a run (contract K3).
// The ring, the headline counts, the breakdown and the rows come from the same
// arrays; a row built from too little evidence reads Not measured with its
// reason, never a full bar.

/** One line of a run's breakdown. */
export interface ResultRow {
  label: string;
  /** 0..1 drawn as a bar; null with `notMeasured` reads "Not measured". */
  value?: number | null;
  text?: string;
  /** The input could not measure it, or too little landed to judge: `text` says why. */
  notMeasured?: boolean;
}

/** How the run's notes landed against the beat, as counts. */
export interface RunTiming {
  onTime: number;
  early: number;
  late: number;
  missed: number;
}

/** Why a gated row is not measured. */
export const TOO_FEW = "too few notes landed to judge";

/**
 * Where each target landed: `errorsMs` is one entry per target, in ms (positive
 * late), null for a miss. On time within `onTimeMs` either side.
 */
export function timingBreakdown(
  errorsMs: readonly (number | null | undefined)[],
  onTimeMs: number,
): RunTiming {
  const t: RunTiming = { onTime: 0, early: 0, late: 0, missed: 0 };
  for (const e of errorsMs) {
    if (e === null || e === undefined || Number.isNaN(e)) t.missed++;
    else if (e < -onTimeMs) t.early++;
    else if (e > onTimeMs) t.late++;
    else t.onTime++;
  }
  return t;
}

/**
 * Enough landed to judge timing or evenness: at least half of the targets, and
 * at least four (or every target, when there are fewer than four).
 */
export const enough = (landed: number, total: number): boolean =>
  landed > 0 && landed >= Math.min(total, 4) && landed * 2 >= total;

const fromPart = (landed: number, total: number) =>
  landed < total ? `, from ${landed} of ${total}` : "";

/**
 * The timing row from the landed notes' errors (ms, either sign) out of `total`
 * targets: "24 ms off on average, from 6 of 8", filled `1 - mean / windowMs`.
 * With `onTimeMs` (the drill's on-time window) the text names it, "25 ms off on
 * average (on time is within 15 ms)", and the bar fills to `onTimeMs / mean`, full
 * only when the average sits inside the window, so a long bar never reads as
 * good timing that the breakdown calls late.
 */
export function timingRow(
  errorsMs: readonly number[],
  total: number,
  windowMs: number,
  label = "Timing",
  onTimeMs?: number,
): ResultRow {
  const landed = errorsMs.length;
  if (!enough(landed, total)) return { label, notMeasured: true, text: TOO_FEW };
  const mean = errorsMs.reduce((s, e) => s + Math.abs(e), 0) / landed;
  const value =
    onTimeMs !== undefined ? Math.min(1, onTimeMs / Math.max(mean, 1)) : 1 - mean / windowMs;
  return {
    label,
    value: Math.max(0, Math.min(1, value)),
    text: `${Math.round(mean)} ms off on average${fromPart(landed, total)}${onTimeMs !== undefined ? ` (on time is within ${Math.round(onTimeMs)} ms)` : ""}`,
  };
}

/** The evenness row (0..1 from the drill's grader), behind the same gate. */
export function evennessRow(
  score: number,
  landed: number,
  total: number,
  label = "Evenness",
): ResultRow {
  if (!enough(landed, total)) return { label, notMeasured: true, text: TOO_FEW };
  const v = Math.max(0, Math.min(1, score));
  return { label, value: v, text: `${Math.round(v * 100)}%${fromPart(landed, total)}` };
}
