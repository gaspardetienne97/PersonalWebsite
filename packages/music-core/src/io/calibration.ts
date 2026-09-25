// Tap-along latency estimate (hardware notes §7, scoring rules §13).
// Positive offset = the input arrives late; the router subtracts it once.

export const CALIBRATION = {
  bpm: 90,
  clicks: 20,
  warmup: 4,
  minAnswered: 14,
  windowMs: 200,
  maxIqrMs: 30,
  maxOffsetMs: 500,
} as const;

export type CalibrationResult =
  | { ok: true; offsetMs: number; iqrMs: number; answered: number }
  | {
      ok: false;
      reason: "too-few-clicks" | "missed-clicks" | "too-loose" | "out-of-range";
      message: string;
      answered?: number;
      iqrMs?: number;
    };

function median(v: number[]): number {
  const s = [...v].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

/** Exclusive method: the median splits the halves and belongs to neither. */
function iqr(v: number[]): number {
  const s = [...v].sort((a, b) => a - b);
  const half = s.length >> 1;
  return median(s.slice(s.length - half)) - median(s.slice(0, half));
}

/** Each click claims the nearest tap no earlier click has taken, within `reach` of `centre`. */
function claim(clicks: number[], taps: number[], centre: number, reach: number): number[] {
  const taken = new Set<number>();
  const diffs: number[] = [];
  for (const c of clicks) {
    let best = -1;
    for (let i = 0; i < taps.length; i++) {
      if (taken.has(i) || Math.abs(taps[i] - c - centre) > reach) continue;
      if (best < 0 || Math.abs(taps[i] - c - centre) < Math.abs(taps[best] - c - centre)) best = i;
    }
    if (best >= 0) {
      taken.add(best);
      diffs.push(taps[best] - c);
    }
  }
  return diffs;
}

export function estimateOffset(
  clickTimesMs: number[],
  tapTimesMs: number[],
  bpm = CALIBRATION.bpm,
): CalibrationResult {
  const C = CALIBRATION;
  if (clickTimesMs.length < C.clicks)
    return {
      ok: false,
      reason: "too-few-clicks",
      message: `The run stopped early. Let all ${C.clicks} clicks play, then tap along again.`,
    };
  const scored = clickTimesMs.slice(C.warmup, C.clicks);
  const taps = [...tapTimesMs].sort((a, b) => a - b);
  // A periodic grid cannot tell a tap later than half a beat from an early one.
  const coarse = claim(scored, taps, 0, 60000 / bpm / 2);
  const diffs = coarse.length ? claim(scored, taps, median(coarse), C.windowMs) : [];
  const answered = diffs.length;
  if (answered < C.minAnswered)
    return {
      ok: false,
      reason: "missed-clicks",
      answered,
      message: `Tap once on every click. ${answered} of the last ${scored.length} clicks had a tap; ${C.minAnswered} are needed.`,
    };
  const offsetMs = Math.round(median(diffs));
  const iqrMs = iqr(diffs);
  if (iqrMs > C.maxIqrMs)
    return {
      ok: false,
      reason: "too-loose",
      answered,
      iqrMs,
      message: `Your taps were too spread out to trust (they varied by ${Math.round(iqrMs)} ms; ${C.maxIqrMs} ms or less is needed). Try again with one steady tap per click.`,
    };
  if (Math.abs(offsetMs) > C.maxOffsetMs)
    return {
      ok: false,
      reason: "out-of-range",
      answered,
      iqrMs,
      message: `That came out at ${offsetMs} ms, beyond the ${C.maxOffsetMs} ms this can correct. Check the device and try again.`,
    };
  return { ok: true, offsetMs, iqrMs, answered };
}
