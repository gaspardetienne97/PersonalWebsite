// What every grader returns, and the few helpers they all share.
import type { Metric, NoteEvent } from "../types";
import { pc } from "../theory/notes";

export interface Graded {
  /** 0..1 over the measured dimensions only. */
  score: number;
  correct: boolean;
  metrics: Metric[];
  /** Dimensions the input could not observe. Excluded from `score` and re-weighted, never a zero. */
  notMeasured: string[];
}

/** Weighted mean over `[weight, value]` parts; a `null` value is not measured and its weight drops out. */
export function blend(parts: [number, number | null][]): number {
  let w = 0;
  let s = 0;
  for (const [weight, v] of parts) {
    if (v === null) continue;
    w += weight;
    s += weight * v;
  }
  return w ? Math.round((s / w) * 1e9) / 1e9 : 0;
}

export const mean = (xs: readonly number[]) =>
  xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0;

/** Population standard deviation (0 below two values). */
export function stdev(xs: readonly number[]): number {
  if (xs.length < 2) return 0;
  const m = mean(xs);
  // rounded so identical values give exactly 0, not float noise
  return Math.round(Math.sqrt(mean(xs.map((x) => (x - m) ** 2))) * 1e12) / 1e12;
}

/** Note-ons in time order. */
export const noteOns = (events: readonly NoteEvent[]) =>
  events.filter((e) => e.kind === "noteon").sort((a, b) => a.at - b.at);

/** Velocity is only measured when every event says so (on-screen input is a fixed 0.8). */
export const velocityMeasured = (events: readonly NoteEvent[]) =>
  events.length > 0 && events.every((e) => e.velocityMeasured === true);

/** Simultaneity between hands can only be observed from MIDI. */
export const simultaneityMeasured = (events: readonly NoteEvent[]) =>
  events.length > 0 && events.every((e) => e.source === "midi");

/** Sorted distinct pitch classes. */
export const pcSet = (midis: readonly number[]) =>
  [...new Set(midis.map(pc))].sort((a, b) => a - b);

export const notMeasured = (flags: Record<string, boolean>) =>
  Object.keys(flags).filter((k) => !flags[k]);
