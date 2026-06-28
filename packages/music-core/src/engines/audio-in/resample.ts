/**
 * resampleLinear — linear-interpolation resampler for mono PCM.
 *
 * Used to bring captured mic frames (at the AudioContext sample rate) down to
 * Basic Pitch's 22.05 kHz. Pure and testable; the Web-Audio capture that feeds
 * it lives in Phase 3.
 */
export function resampleLinear(
  samples: Float32Array,
  fromRate: number,
  toRate: number,
): Float32Array {
  if (samples.length === 0) return new Float32Array();
  if (fromRate === toRate) return samples.slice();

  const ratio = toRate / fromRate;
  const outLength = Math.max(1, Math.round(samples.length * ratio));
  const out = new Float32Array(outLength);
  for (let i = 0; i < outLength; i++) {
    const sourcePos = i / ratio;
    const i0 = Math.floor(sourcePos);
    const i1 = Math.min(i0 + 1, samples.length - 1);
    const frac = sourcePos - i0;
    out[i] = samples[i0]! * (1 - frac) + samples[i1]! * frac;
  }
  return out;
}
