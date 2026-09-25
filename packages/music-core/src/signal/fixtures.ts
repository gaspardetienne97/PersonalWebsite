// Deterministic synthetic audio for the signal tests (no recordings in the repo).
export interface Partial {
  hz: number;
  amp: number;
  phase?: number;
}

/** Seeded PRNG so noise fixtures are identical on every run. */
export function rng(seed = 1) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 2 ** 32;
  };
}

export function synth(
  sampleRate: number,
  seconds: number,
  partials: Partial[],
  { noise = 0, dc = 0, decay = 0, seed = 7 } = {},
): Float32Array {
  const n = Math.round(sampleRate * seconds);
  const out = new Float32Array(n);
  const rand = rng(seed);
  for (let i = 0; i < n; i++) {
    const t = i / sampleRate;
    let v = dc;
    for (const p of partials) v += p.amp * Math.sin(2 * Math.PI * p.hz * t + (p.phase ?? 0));
    if (decay) v *= Math.exp(-decay * t);
    out[i] = v + (noise ? (rand() * 2 - 1) * noise : 0);
  }
  return out;
}

/** A plucked-string-like tone: fundamental plus falling harmonics. */
export const stringTone = (f0: number, amps = [1, 0.6, 0.4, 0.25, 0.15, 0.1]) =>
  amps.map((amp, i) => ({ hz: f0 * (i + 1), amp: amp * 0.3, phase: i * 0.7 }));
