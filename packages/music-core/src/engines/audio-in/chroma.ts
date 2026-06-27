/**
 * computeChroma — a 12-bin pitch-class energy vector for one audio frame.
 *
 * Uses the Goertzel algorithm to read energy at the exact target pitch
 * frequencies across a few octaves and folds them into 12 pitch classes. This
 * avoids adding an FFT dependency and stays a pure, testable function (the
 * streaming glue lives in Phase 2). Normalized so the strongest class is 1.
 */

export interface ChromaOptions {
  sampleRate: number;
  /** Lowest MIDI note probed (default 40 = E2). */
  minMidi?: number;
  /** Highest MIDI note probed (default 88 = E6). */
  maxMidi?: number;
}

export function computeChroma(frame: Float32Array, options: ChromaOptions): Float32Array {
  const minMidi = options.minMidi ?? 40;
  const maxMidi = options.maxMidi ?? 88;
  const chroma = new Float32Array(12);

  for (let midi = minMidi; midi <= maxMidi; midi++) {
    const frequency = 440 * 2 ** ((midi - 69) / 12);
    chroma[midi % 12]! += goertzelPower(frame, frequency, options.sampleRate);
  }

  let max = 0;
  for (const value of chroma) if (value > max) max = value;
  if (max > 0) for (let i = 0; i < 12; i++) chroma[i]! /= max;
  return chroma;
}

/** Generalized Goertzel power at `frequency` over the frame. */
function goertzelPower(frame: Float32Array, frequency: number, sampleRate: number): number {
  const k = (frequency / sampleRate) * frame.length;
  const omega = (2 * Math.PI * k) / frame.length;
  const coeff = 2 * Math.cos(omega);
  let s1 = 0;
  let s2 = 0;
  for (let n = 0; n < frame.length; n++) {
    const s0 = frame[n]! + coeff * s1 - s2;
    s2 = s1;
    s1 = s0;
  }
  return s1 * s1 + s2 * s2 - coeff * s1 * s2;
}
