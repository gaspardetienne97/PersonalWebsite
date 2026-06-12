/**
 * Monophonic pitch detection — the framework-agnostic core of `audio-in`.
 *
 * Implements the **McLeod Pitch Method (MPM)**: a normalized square-difference
 * function (NSDF) plus peak-picking, which the domain's `NoteOnEvent.confidence`
 * comment already refers to as "MPM clarity". MPM is robust for monophonic
 * instrument/voice pitch and yields a 0–1 clarity measure for free, which the
 * Input Router uses as audio confidence and the tuner uses to gate noisy frames.
 *
 * Pure functions over a `Float32Array` of mono PCM samples (−1..1). No Web Audio,
 * no Svelte — the browser capture layer ({@link ./capture}) feeds buffers in and
 * turns estimates into events; this file is fully unit-testable with synthesized
 * waveforms.
 */

/** A4 reference pitch in Hz; configurable so the tuner can offset the whole grid. */
export const DEFAULT_A4 = 440;

export interface PitchDetectOptions {
  /** Sample rate of the buffer in Hz (e.g. 44100). Required — no sane default. */
  sampleRate: number;
  /** Lowest pitch to consider (Hz). Below this, lags are ignored. Default 50. */
  minFrequency?: number;
  /** Highest pitch to consider (Hz). Above this, lags are ignored. Default 1500. */
  maxFrequency?: number;
  /**
   * Peak-pick ratio (0–1): a key maximum counts only if it is at least this
   * fraction of the strongest key maximum. MPM's classic value is ~0.9; lower
   * picks lower (sub-)octaves more eagerly. Default 0.9.
   */
  clarityThreshold?: number;
}

export interface PitchEstimate {
  /** Estimated fundamental in Hz, or 0 when no confident pitch was found. */
  frequency: number;
  /** NSDF peak height at the chosen lag, 0–1. Higher = more periodic/cleaner. */
  clarity: number;
}

const NO_PITCH: PitchEstimate = { frequency: 0, clarity: 0 };

/**
 * Estimate the fundamental frequency of a mono buffer via MPM. Returns
 * `{ frequency: 0, clarity: 0 }` when the signal is too quiet or aperiodic to
 * call (silence, noise, or a transient). Cost is O(n · maxLag); intended for
 * analysis windows of ~1–4k samples, not whole recordings.
 */
export function detectPitch(buffer: Float32Array, options: PitchDetectOptions): PitchEstimate {
  const { sampleRate } = options;
  const minFrequency = options.minFrequency ?? 50;
  const maxFrequency = options.maxFrequency ?? 1500;
  const clarityThreshold = options.clarityThreshold ?? 0.9;

  const n = buffer.length;
  if (n < 4 || sampleRate <= 0) return NO_PITCH;

  // Bail on near-silence so we don't lock onto noise (RMS gate).
  let sumSquares = 0;
  for (let i = 0; i < n; i++) sumSquares += buffer[i] * buffer[i];
  if (Math.sqrt(sumSquares / n) < 1e-3) return NO_PITCH;

  const maxLag = Math.min(n - 1, Math.floor(sampleRate / minFrequency));
  const minLag = Math.max(1, Math.floor(sampleRate / maxFrequency));
  if (maxLag <= minLag) return NO_PITCH;

  // Normalized square difference function (Type II, incremental window).
  const nsdf = new Float32Array(maxLag + 1);
  for (let tau = 0; tau <= maxLag; tau++) {
    let acf = 0; // autocorrelation
    let div = 0; // sum of squared magnitudes of both windows
    for (let i = 0; i + tau < n; i++) {
      const a = buffer[i];
      const b = buffer[i + tau];
      acf += a * b;
      div += a * a + b * b;
    }
    nsdf[tau] = div > 0 ? (2 * acf) / div : 0;
  }

  // Collect key maxima: the peak inside each region between a positive-going and
  // the following negative-going zero crossing of the NSDF, starting only after
  // the function first dips negative (skips the tau≈0 lobe where NSDF≈1).
  const peakLags: number[] = [];
  const peakValues: number[] = [];
  let searching = false;
  let bestLag = -1;
  let bestVal = -Infinity;

  for (let tau = minLag; tau < maxLag; tau++) {
    const prev = nsdf[tau - 1];
    const cur = nsdf[tau];
    const next = nsdf[tau + 1];

    if (prev <= 0 && cur > 0) {
      // entered a positive region
      searching = true;
      bestLag = tau;
      bestVal = cur;
    } else if (searching) {
      if (cur > bestVal) {
        bestVal = cur;
        bestLag = tau;
      }
      if (cur > 0 && next <= 0) {
        // leaving the positive region — commit the region's max
        peakLags.push(bestLag);
        peakValues.push(bestVal);
        searching = false;
      }
    }
  }

  if (peakLags.length === 0) return NO_PITCH;

  let strongest = -Infinity;
  for (const v of peakValues) if (v > strongest) strongest = v;
  if (strongest <= 0) return NO_PITCH;

  // First key maximum at or above the threshold relative to the strongest peak.
  const cutoff = clarityThreshold * strongest;
  let chosen = -1;
  for (let i = 0; i < peakLags.length; i++) {
    if (peakValues[i] >= cutoff) {
      chosen = peakLags[i];
      break;
    }
  }
  if (chosen <= 0) return NO_PITCH;

  // Parabolic interpolation around the chosen lag for sub-sample precision.
  const { lag, value } = parabolicPeak(nsdf, chosen);
  const frequency = sampleRate / lag;
  if (frequency < minFrequency || frequency > maxFrequency) return NO_PITCH;

  return { frequency, clarity: Math.min(1, Math.max(0, value)) };
}

/** Refine an integer-lag peak with a parabola through its two neighbours. */
function parabolicPeak(data: Float32Array, index: number): { lag: number; value: number } {
  if (index <= 0 || index >= data.length - 1) {
    return { lag: index, value: data[index] };
  }
  const a = data[index - 1];
  const b = data[index];
  const c = data[index + 1];
  const denom = a - 2 * b + c;
  if (denom === 0) return { lag: index, value: b };
  const shift = (0.5 * (a - c)) / denom;
  return { lag: index + shift, value: b - 0.25 * (a - c) * shift };
}

/** Fractional MIDI note number for a frequency (69 = A4). */
export function frequencyToMidi(frequency: number, a4 = DEFAULT_A4): number {
  return 69 + 12 * Math.log2(frequency / a4);
}

/** Frequency in Hz for a (possibly fractional) MIDI note number. */
export function midiToFrequency(midi: number, a4 = DEFAULT_A4): number {
  return a4 * 2 ** ((midi - 69) / 12);
}

/** Cents difference from `refFreq` to `frequency` (positive = sharp). */
export function centsBetween(frequency: number, refFreq: number): number {
  return 1200 * Math.log2(frequency / refFreq);
}
