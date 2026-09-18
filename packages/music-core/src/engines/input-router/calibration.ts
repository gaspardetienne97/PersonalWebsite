/**
 * Tap-along offset estimation.
 *
 * The player taps with a metronome; each click claims the nearest tap nobody
 * else took, and the median difference is the offset. Positive means the taps
 * land after the click, which is what the router then subtracts from incoming
 * timestamps.
 *
 * This is an *estimate*, not a hardware measurement: it contains the player's
 * reaction time and the output path as well as the input round trip. The UI
 * says so. The warm-up clicks are ignored because the first few are spent
 * finding the beat, and a run is only accepted when the spread is tight enough
 * for the median to mean anything.
 *
 * A periodic grid cannot tell a late tap from an early one more than half a
 * beat away, so the usable range is ±half a beat (±333 ms at 90 BPM). Within it
 * a big constant latency is fine: a coarse median is taken first and the
 * outlier window is applied around *that*, so a 250 ms Bluetooth round trip
 * reads as 250 ms rather than as twenty missed taps.
 */

/** Tempo of the calibration metronome. Slow enough to tap accurately. */
export const CALIBRATION_BPM = 90;
/** Clicks in one run. */
export const CALIBRATION_TAPS = 20;
/** Leading clicks ignored before the median is taken. */
export const CALIBRATION_WARMUP_TAPS = 4;
/** Widest interquartile spread an accepted run may have, in ms. */
export const CALIBRATION_MAX_IQR_MS = 30;
/** How many of the remaining clicks must be answered by a tap. */
export const CALIBRATION_MIN_MATCHED = 14;
/** How far from the run's own median a tap may sit and still count. */
export const CALIBRATION_MATCH_WINDOW_MS = 200;

export interface OffsetEstimateOptions {
  warmupTaps?: number;
  minMatched?: number;
  maxIqrMs?: number;
  matchWindowMs?: number;
}

export interface OffsetEstimate {
  /** Median tap-minus-click difference, in whole ms. Positive = taps land late. */
  offsetMs: number;
  /** Interquartile spread of those differences, in whole ms. */
  iqrMs: number;
  /** Clicks after the warm-up that a tap answered. */
  matched: number;
  /** Clicks after the warm-up, i.e. the chances to tap. */
  considered: number;
  /** True when the run is tight enough to save. */
  accepted: boolean;
  /** Why the run was not accepted, in the player's words. */
  reason?: string;
}

/**
 * Estimate the input offset from a tap-along run. `tapsMs` and `clicksMs` must
 * be on the same clock (both `performance.now()` based).
 */
export function estimateInputOffset(
  tapsMs: readonly number[],
  clicksMs: readonly number[],
  options: OffsetEstimateOptions = {},
): OffsetEstimate {
  const warmupTaps = options.warmupTaps ?? CALIBRATION_WARMUP_TAPS;
  const minMatched = options.minMatched ?? CALIBRATION_MIN_MATCHED;
  const maxIqrMs = options.maxIqrMs ?? CALIBRATION_MAX_IQR_MS;
  const matchWindowMs = options.matchWindowMs ?? CALIBRATION_MATCH_WINDOW_MS;
  // Past half a beat a tap belongs to the neighbouring click, so that is the
  // furthest any claim may reach.
  const spacingMs = clicksMs.length > 1 ? clicksMs[1]! - clicksMs[0]! : undefined;
  const reachMs = spacingMs === undefined ? matchWindowMs : Math.abs(spacingMs) / 2;

  const coarse = median(
    defined(claimTaps(clicksMs, tapsMs, (delta) => Math.abs(delta) <= reachMs)),
  );
  const deltas = claimTaps(
    clicksMs,
    tapsMs,
    (delta) => Math.abs(delta) <= reachMs && Math.abs(delta - coarse) <= matchWindowMs,
  ).slice(warmupTaps);

  const weighed = defined(deltas);
  const matched = weighed.length;
  const considered = Math.max(0, clicksMs.length - warmupTaps);
  const offsetMs = matched === 0 ? 0 : Math.round(median(weighed));
  const iqrMs = matched === 0 ? 0 : Math.round(quartile(weighed, 3) - quartile(weighed, 1));

  if (matched < minMatched) {
    return {
      offsetMs,
      iqrMs,
      matched,
      considered,
      accepted: false,
      reason: `Only ${matched} of ${considered} clicks got a tap; ${minMatched} are needed. Tap once on every click.`,
    };
  }
  if (iqrMs > maxIqrMs) {
    return {
      offsetMs,
      iqrMs,
      matched,
      considered,
      accepted: false,
      reason: `Your taps varied by ${iqrMs} ms, more than the ${maxIqrMs} ms this needs. Try again when you can hold a steady tap.`,
    };
  }
  return { offsetMs, iqrMs, matched, considered, accepted: true };
}

/**
 * Give each click the nearest tap no earlier click has taken, so a double
 * onset or a flam cannot answer the same click twice. Returns one entry per
 * click, `undefined` where nothing acceptable was left.
 */
function claimTaps(
  clicksMs: readonly number[],
  tapsMs: readonly number[],
  accept: (delta: number) => boolean,
): (number | undefined)[] {
  const pool = tapsMs.map((atMs) => ({ atMs, used: false }));
  return clicksMs.map((click) => {
    let best: (typeof pool)[number] | undefined;
    for (const candidate of pool) {
      if (candidate.used) continue;
      const delta = candidate.atMs - click;
      if (!accept(delta)) continue;
      if (!best || Math.abs(delta) < Math.abs(best.atMs - click)) best = candidate;
    }
    if (!best) return undefined;
    best.used = true;
    return best.atMs - click;
  });
}

/** The claims that landed, ascending. */
function defined(deltas: readonly (number | undefined)[]): number[] {
  return deltas.filter((delta): delta is number => delta !== undefined).sort((a, b) => a - b);
}

/** Median of an already ascending list; 0 for an empty one. */
function median(sorted: readonly number[]): number {
  if (sorted.length === 0) return 0;
  const middle = sorted.length / 2;
  return sorted.length % 2 === 1
    ? sorted[(sorted.length - 1) / 2]!
    : (sorted[middle - 1]! + sorted[middle]!) / 2;
}

/** Quartile 1 or 3 by the exclusive method (the median splits the halves). */
function quartile(sorted: readonly number[], which: 1 | 3): number {
  const half = Math.floor(sorted.length / 2);
  const part = which === 1 ? sorted.slice(0, half) : sorted.slice(sorted.length - half);
  return part.length === 0 ? sorted[0]! : median(part);
}
