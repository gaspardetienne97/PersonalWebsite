/**
 * Tuner reading — turns a raw {@link PitchEstimate} into a UI-ready intonation
 * reading: nearest note, cents deviation, and a flat/in-tune/sharp zone. Pure;
 * the zone bucketing reuses {@link timingZone} from `semantic-color` (the same
 * ±tolerance diverging logic the timing meter uses) so there is a single source
 * of truth and the UI drives color from a token, never a hardcoded hex.
 */

import { timingZone } from "@repo/music-core/engines/semantic-color";

import {
  DEFAULT_A4,
  centsBetween,
  frequencyToMidi,
  midiToFrequency,
  type PitchEstimate,
} from "./pitch-detect";

const NOTE_NAMES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"] as const;

/** Flat / in-tune / sharp — the intonation counterpart of the timing zones. */
export type IntonationZone = "flat" | "in-tune" | "sharp";

export interface TunerReading {
  /** Detected frequency in Hz. */
  frequency: number;
  /** Detector clarity 0–1 (carried through from the estimate). */
  clarity: number;
  /** Nearest equal-tempered MIDI note number. */
  midi: number;
  /** Note name without octave, e.g. "A". */
  note: string;
  /** Octave number in scientific pitch notation (A4 = 440 Hz → 4). */
  octave: number;
  /** Full scientific name, e.g. "A4". */
  name: string;
  /** Signed cents from the nearest note (negative = flat, positive = sharp). */
  cents: number;
  /** Bucketed intonation zone for coloring the meter. */
  zone: IntonationZone;
  /** True when |cents| is within tolerance (zone === "in-tune"). */
  inTune: boolean;
}

export interface TunerOptions {
  /** Reference pitch for A4 in Hz. Default 440. */
  a4?: number;
  /** Half-width of the in-tune window in cents. Default 5. */
  toleranceCents?: number;
  /** Minimum clarity to accept a frame; below this returns null. Default 0.6. */
  minClarity?: number;
}

/**
 * Build a {@link TunerReading} from a pitch estimate, or `null` when there is no
 * pitch or the estimate is below the clarity floor (so callers can hold the last
 * good reading instead of flickering on noise).
 */
export function tunerReading(
  estimate: PitchEstimate,
  options: TunerOptions = {},
): TunerReading | null {
  const a4 = options.a4 ?? DEFAULT_A4;
  const toleranceCents = options.toleranceCents ?? 5;
  const minClarity = options.minClarity ?? 0.6;

  if (estimate.frequency <= 0 || estimate.clarity < minClarity) return null;

  const exactMidi = frequencyToMidi(estimate.frequency, a4);
  const midi = Math.round(exactMidi);
  const cents = centsBetween(estimate.frequency, midiToFrequency(midi, a4));
  const note = NOTE_NAMES[((midi % 12) + 12) % 12];
  const octave = Math.floor(midi / 12) - 1;

  return {
    frequency: estimate.frequency,
    clarity: estimate.clarity,
    midi,
    note,
    octave,
    name: `${note}${octave}`,
    cents,
    zone: intonationZone(cents, toleranceCents),
    inTune: Math.abs(cents) <= toleranceCents,
  };
}

/**
 * Bucket a cents deviation into flat / in-tune / sharp. Delegates to
 * `semantic-color`'s `timingZone` (behind/pocket/ahead) so the ±tolerance math
 * is shared, then renames the buckets to intonation terms.
 */
export function intonationZone(cents: number, toleranceCents = 5): IntonationZone {
  switch (timingZone(cents, toleranceCents)) {
    case "behind":
      return "flat";
    case "ahead":
      return "sharp";
    default:
      return "in-tune";
  }
}
