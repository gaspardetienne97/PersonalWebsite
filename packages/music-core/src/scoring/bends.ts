// Bends and vibrato from a microphone pitch trace (docs/research/guitar-ukulele-drills.md):
// a bend is judged on the pitch it settles at, against the target interval;
// vibrato is described (rate, width, evenness), not passed or failed, since no
// one publishes norms for guitar vibrato.
import type { Graded } from "./grade";

export interface PitchPoint {
  at: number;
  /** Detected frequency, null when the frame had no clear pitch. */
  hz: number | null;
}

export const BEND = {
  /** In tune within this many cents of the target, close within CLOSE. */
  inTune: 15,
  close: 30,
  /** A bend counts as held after this long steady. */
  holdMs: 250,
  /** Frames this close to the last count as the same steady pitch. */
  steadyCents: 20,
} as const;

const hzOf = (midi: number) => 440 * 2 ** ((midi - 69) / 12);
const centsFrom = (hz: number, midi: number) => 1200 * Math.log2(hz / hzOf(midi));
const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / Math.max(1, xs.length);

export type BendVerdict = "in-tune" | "close" | "flat" | "sharp" | "not-held";

export interface BendResult extends Graded {
  verdict: BendVerdict;
  /** Where the held bend sat, cents above the fretted note; null when nothing held. */
  reachedCents: number | null;
  /** reached minus target. */
  errorCents: number | null;
  heldMs: number;
  targetCents: number;
}

/**
 * The steadiest stretch above half the bend (at least BEND.holdMs of frames
 * each within BEND.steadyCents of the stretch so far) is where the bend landed.
 * score: in tune 1, close 0.6, held but out 0.25, nothing held 0.
 */
export function analyseBend(
  trace: readonly PitchPoint[],
  fromMidi: number,
  toMidi: number,
): BendResult {
  const target = (toMidi - fromMidi) * 100;
  const pts = trace.flatMap((p) => (p.hz ? [{ at: p.at, c: centsFrom(p.hz, fromMidi) }] : []));
  let best: { from: number; to: number; cents: number[] } | null = null;
  let run: { from: number; to: number; cents: number[] } | null = null;
  for (const p of pts) {
    const high = p.c >= target / 2;
    if (high && run && Math.abs(p.c - mean(run.cents)) <= BEND.steadyCents) {
      run.to = p.at;
      run.cents.push(p.c);
    } else run = high ? { from: p.at, to: p.at, cents: [p.c] } : null;
    if (run && (!best || run.to - run.from > best.to - best.from))
      best = { ...run, cents: [...run.cents] };
  }
  const heldMs = best ? best.to - best.from : 0;
  if (!best || heldMs < BEND.holdMs)
    return {
      score: 0,
      correct: false,
      metrics: [],
      notMeasured: pts.length ? [] : ["pitch"],
      verdict: "not-held",
      reachedCents: null,
      errorCents: null,
      heldMs,
      targetCents: target,
    };
  const reached = mean(best.cents);
  const error = reached - target;
  const off = Math.abs(error);
  const verdict: BendVerdict =
    off <= BEND.inTune ? "in-tune" : off <= BEND.close ? "close" : error < 0 ? "flat" : "sharp";
  return {
    score: verdict === "in-tune" ? 1 : verdict === "close" ? 0.6 : 0.25,
    correct: verdict === "in-tune",
    metrics: [
      {
        kind: "pitch",
        expectedMidi: toMidi,
        actualMidi: Math.round(fromMidi + reached / 100),
        cents: error,
      },
    ],
    notMeasured: [],
    verdict,
    reachedCents: reached,
    errorCents: error,
    heldMs,
    targetCents: target,
  };
}

export interface VibratoResult {
  /** Cycles a second; null when too little steady pitch was heard. */
  rateHz: number | null;
  /** Half the peak-to-peak swing, in cents. */
  widthCents: number | null;
  /** How alike the cycles are, 0..1 (1 = every swing the same length). */
  evenness: number | null;
  /** Seconds of pitched sound analysed. */
  seconds: number;
}

/**
 * Vibrato around a held note: the pitch's swing about its own centre (a
 * ~400 ms moving average, so a slow drift isn't counted as vibrato), the rate
 * from the crossings of that centre, the width from the 5th to 95th percentile.
 */
export function analyseVibrato(trace: readonly PitchPoint[]): VibratoResult {
  const pts = trace.flatMap((p) => (p.hz ? [{ at: p.at, c: 1200 * Math.log2(p.hz / 440) }] : []));
  const seconds = pts.length > 1 ? (pts.at(-1)!.at - pts[0].at) / 1000 : 0;
  if (seconds < 1 || pts.length < 12)
    return { rateHz: null, widthCents: null, evenness: null, seconds };
  const swing = pts.map((p) => {
    const near = pts.filter((q) => Math.abs(q.at - p.at) <= 200).map((q) => q.c);
    return { at: p.at, d: p.c - mean(near) };
  });
  const crossings: number[] = [];
  for (let i = 1; i < swing.length; i++)
    if (Math.sign(swing[i].d) !== Math.sign(swing[i - 1].d) && swing[i].d !== 0) {
      // Where the line between the two frames crosses the centre.
      const a = swing[i - 1];
      const b = swing[i];
      crossings.push(a.at + ((b.at - a.at) * Math.abs(a.d)) / (Math.abs(a.d) + Math.abs(b.d)));
    }
  const sorted = swing.map((s) => s.d).sort((a, b) => a - b);
  const q = (f: number) => sorted[Math.min(sorted.length - 1, Math.floor(f * sorted.length))];
  const widthCents = (q(0.95) - q(0.05)) / 2;
  if (crossings.length < 3 || widthCents < 3)
    return { rateHz: null, widthCents, evenness: null, seconds };
  const halves = crossings.slice(1).map((t, i) => t - crossings[i]);
  const m = mean(halves);
  const sd = Math.sqrt(mean(halves.map((h) => (h - m) ** 2)));
  return {
    rateHz: 1000 / (2 * m),
    widthCents,
    evenness: Math.max(0, Math.min(1, 1 - sd / m)),
    seconds,
  };
}
