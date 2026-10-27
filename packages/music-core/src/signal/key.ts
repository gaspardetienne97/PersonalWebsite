// The key of a stretch of recorded music, for "find home": chroma summed over
// the stretch, correlated with the Krumhansl-Kessler key profiles.
import { CHORD_SAMPLE_RATE, chroma, resample } from "./chroma";

const MAJOR = [6.35, 2.23, 3.48, 2.33, 4.38, 4.09, 2.52, 5.19, 2.39, 3.66, 2.29, 2.88];
const MINOR = [6.33, 2.68, 3.52, 5.38, 2.6, 3.53, 2.54, 4.75, 3.98, 2.69, 3.34, 3.17];
const FRAME = 4096;
const HOP = 8192;

function pearson(a: number[], b: number[]) {
  const ma = a.reduce((s, x) => s + x, 0) / a.length;
  const mb = b.reduce((s, x) => s + x, 0) / b.length;
  let n = 0;
  let da = 0;
  let db = 0;
  for (let i = 0; i < a.length; i++) {
    n += (a[i] - ma) * (b[i] - mb);
    da += (a[i] - ma) ** 2;
    db += (b[i] - mb) ** 2;
  }
  return da && db ? n / Math.sqrt(da * db) : 0;
}

export interface KeyGuess {
  tonicPc: number;
  minor: boolean;
  /** Correlation with the key's profile, -1 to 1. */
  r: number;
}

/** All 24 keys, best match first. */
export function rankKeys(c: number[]): KeyGuess[] {
  const out: KeyGuess[] = [];
  for (let k = 0; k < 12; k++)
    for (const minor of [false, true]) {
      const profile = minor ? MINOR : MAJOR;
      out.push({
        tonicPc: k,
        minor,
        r: pearson(
          c,
          profile.map((_, i) => profile[(i - k + 12) % 12]),
        ),
      });
    }
  return out.sort((a, b) => b.r - a.r);
}

/** Chroma summed over `from` to `to` seconds of mono audio, silent frames left out. */
export function regionChroma(
  mono: Float32Array,
  sampleRate: number,
  from = 0,
  to = Infinity,
): number[] {
  const a = Math.max(0, Math.floor(from * sampleRate));
  const b = Math.min(mono.length, Math.ceil(to * sampleRate));
  const x = resample(mono.subarray(a, b), sampleRate, CHORD_SAMPLE_RATE);
  const sum = Array<number>(12).fill(0);
  for (let i = 0; i + FRAME <= x.length; i += HOP) {
    const frame = x.subarray(i, i + FRAME);
    let e = 0;
    for (let j = 0; j < frame.length; j++) e += frame[j] * frame[j];
    if (Math.sqrt(e / FRAME) < 1e-3) continue;
    chroma(frame, CHORD_SAMPLE_RATE).forEach((v, pc) => (sum[pc] += v));
  }
  return sum;
}

// ponytail: profiles confuse a key with its relative, so the relative's tonic also counts
// when it scores within RELATIVE_MARGIN of the best; a real chord-and-bass key finder if that misjudges.
export const RELATIVE_MARGIN = 0.05;

/** The tonics that count as home: the best key's, and its relative's when that is nearly as good. */
export function homeTonics(ranked: KeyGuess[]): number[] {
  const best = ranked[0];
  if (!best) return [];
  const relPc = (best.tonicPc + (best.minor ? 3 : 9)) % 12;
  const rel = ranked.find((k) => k.tonicPc === relPc && k.minor !== best.minor);
  return rel && best.r - rel.r <= RELATIVE_MARGIN ? [best.tonicPc, rel.tonicPc] : [best.tonicPc];
}
