// Chord reading from audio: spectral peaks, then the smallest set of pitch
// classes that explains them.
//
// Plain chroma counts every partial as a note (the third harmonic of an open E
// string is a B, the fifth harmonic of a C is an E) and a fixed cut drops the
// quiet strings (the open D in an open G chord). So the reader works on peaks,
// not bins: each peak may be its own note or a partial of a lower note whose
// series is also in the spectrum, and a pitch class is "heard" only when it
// explains something the other heard tones cannot.
import { CHORD_TEMPLATES } from "../theory/chords";
import { CHORD_SAMPLE_RATE, resample } from "./chroma";
import { fft, nextPow2 } from "./fft";

export const CHORD_READ = {
  /**
   * The strongest peak must reach this amplitude (dB re full scale) or nothing
   * is read. Low on purpose: a guitar across the room reaches a laptop mic near
   * -52 dB RMS, its partials near -58. What keeps room hiss from reading as
   * tones is the noise test on the peaks, not this floor.
   */
  floorDb: -66,
  /** Lowest fundamental considered (just under E2, the guitar's low string). */
  minHz: 70,
  /** Peaks are read up to here (C7). */
  topHz: 2100,
  /** A peak counts when it is within this many dB of the strongest peak. */
  peakRangeDb: 36,
  /** A peak this many dB under a stronger one within `maskCents` is that one's skirt. */
  maskDb: 18,
  maskCents: 250,
  /** The strongest peak must be this many times the band's median magnitude, and every peak this many. */
  clearOfNoise: 30,
  peakOverNoise: 6,
  /** How far a partial may sit from h x f0: the larger of these. */
  partialCents: 10,
  partialHz: 1.2,
  /** The highest partial a peak may be explained as (a bright string or a reed has many). */
  partials: 20,
  /** A partial's series must show peaks at least this share of its own amplitude. */
  siblingRatio: 0.15,
  /**
   * How much of a peak a lower note may claim as its 3rd, 5th or 7th partial.
   * The 3rd is the note's own fifth, which chords nearly always hold as well,
   * so it is only partly claimed.
   */
  credit3: 0.7,
  credit5: 1,
  credit7: 1,
  /** Peak weight is amplitude to this power (compression: quiet strings still count). */
  gamma: 0.5,
  /** A tone must explain this share of the whole spectrum that no other tone does. */
  toneCost: 0.1,
  maxTones: 6,
  /**
   * A set that is a known chord is preferred by this share of the spectrum
   * (triads in full, other shapes by half). Kept under `toneCost`, so a tone
   * with no evidence of its own is never added to complete a chord.
   */
  chordBonus: 0.08,
  /** The heard tones must explain this share of the spectrum, or it is not a chord at all. */
  minExplained: 0.66,
  /** Peaks further than this from one shared tuning (cents, weighted mean) are not strings in tune. */
  maxSpreadCents: 17,
};
export type ChordReadSettings = typeof CHORD_READ;

export interface SpectralPeak {
  hz: number;
  amp: number;
}

/**
 * Hann-windowed amplitude peaks between `minHz` and `topHz`, zero-padded twice
 * and parabolic-interpolated (a 600 ms window places a peak well inside the
 * 4.9 Hz between E2 and F2). Empty when nothing stands clear of the noise.
 */
export function spectralPeaks(
  buf: Float32Array,
  sampleRate: number,
  s: ChordReadSettings = CHORD_READ,
): SpectralPeak[] {
  const n = buf.length;
  if (n < 256) return [];
  const size = nextPow2(n) * 2;
  const re = new Float64Array(size);
  const im = new Float64Array(size);
  for (let i = 0; i < n; i++) re[i] = buf[i] * (0.5 - 0.5 * Math.cos((2 * Math.PI * i) / (n - 1)));
  fft(re, im);
  const binHz = sampleRate / size;
  const lo = Math.max(2, Math.floor((s.minHz * 0.97) / binHz));
  const hi = Math.min(size / 2 - 2, Math.ceil(s.topHz / binHz));
  if (hi <= lo) return [];
  const mag = new Float64Array(hi + 2);
  const norm = 4 / n; // Hann coherent gain 0.5, one-sided x2
  for (let k = lo - 1; k <= hi + 1; k++) mag[k] = Math.hypot(re[k], im[k]) * norm;
  const peaks: SpectralPeak[] = [];
  for (let k = lo; k <= hi; k++) {
    const m = mag[k];
    if (m <= mag[k - 1] || m < mag[k + 1] || m <= 0) continue;
    const a = Math.log(mag[k - 1] + 1e-12);
    const b = Math.log(m);
    const c = Math.log(mag[k + 1] + 1e-12);
    const d = a - 2 * b + c;
    const off = d < 0 ? Math.max(-0.5, Math.min(0.5, (0.5 * (a - c)) / d)) : 0;
    const amp = Math.exp(b - 0.25 * (a - c) * off);
    peaks.push({ hz: (k + off) * binHz, amp });
  }
  // Noise has a strongest bin too: the peaks must stand clear of the band's median.
  const sorted = Float64Array.from(mag.subarray(lo, hi + 1)).sort();
  const median = sorted[sorted.length >> 1];
  const clear = (all: SpectralPeak[]) => {
    const top = all.reduce((m, p) => Math.max(m, p.amp), 0);
    if (top < 10 ** (s.floorDb / 20) || top < median * s.clearOfNoise) return [];
    const floor = Math.max(top * 10 ** (-s.peakRangeDb / 20), median * s.peakOverNoise);
    return all.filter((p) => p.amp >= floor);
  };
  let kept = clear(peaks);
  const hum = humGrid(kept);
  if (hum) kept = clear(peaks.filter((p) => !hum(p.hz)));
  // A loud string spreads skirts over its neighbours as it decays: drop peaks
  // far below a stronger one close by.
  const span = 2 ** (s.maskCents / 1200);
  const mask = 10 ** (-s.maskDb / 20);
  return kept.filter((p, i) => {
    for (let j = i - 1; j >= 0 && kept[j].hz * span >= p.hz; j--)
      if (p.amp < kept[j].amp * mask) return false;
    for (let j = i + 1; j < kept.length && kept[j].hz <= p.hz * span; j++)
      if (p.amp < kept[j].amp * mask) return false;
    return true;
  });
}

/**
 * Mains hum on a line input is a clean harmonic series, which is exactly what a
 * note looks like (60 Hz hum reads as B, F sharp and D sharp). When the peaks
 * sit on at least three of the 2nd to 5th multiples of 50 or 60 Hz, this
 * returns the test for "on that grid", and those peaks go. Strings in tune are
 * 2 Hz or more off both grids down there.
 */
function humGrid(peaks: SpectralPeak[]): ((hz: number) => boolean) | null {
  const near = (hz: number, target: number) => Math.abs(hz - target) <= 0.6 + 0.004 * target;
  for (const mains of [50, 60]) {
    const hits = [2, 3, 4, 5].filter((k) => peaks.some((p) => near(p.hz, k * mains))).length;
    if (hits >= 3) return (hz) => near(hz, Math.round(hz / mains) * mains);
  }
  return null;
}

/** What a peak can be: its own note, or a partial of a lower note that is also in the spectrum. */
export interface ExplainedPeak {
  weight: number;
  /** The peak's own pitch class. */
  own: number;
  /** Credit 0..1 per pitch class that could have made this peak. */
  by: number[];
}

const hzToMidi = (hz: number) => 69 + 12 * Math.log2(hz / 440);
const pcOfHz = (hz: number) => ((Math.round(hzToMidi(hz)) % 12) + 12) % 12;

/**
 * For each peak, which pitch classes could have made it. Always its own. Also
 * any lower note it would be a partial of (3rd to 20th), but only when that
 * note's series shows in the spectrum: its fundamental, or its 2nd partial
 * under a 5th or 7th, or, for a mic that loses the bass, the 4th and 5th
 * partials beside a 3rd. The match is tight (10 cents): a real harmonic sits on
 * the series, while the third of an equal-tempered chord is 14 cents off its
 * root's 5th partial and stays a note of its own.
 */
export function explainPeaks(
  peaks: SpectralPeak[],
  s: ChordReadSettings = CHORD_READ,
): ExplainedPeak[] {
  const has = (hz: number, floor: number) => {
    const tol = Math.max(hz * (2 ** (s.partialCents / 1200) - 1), s.partialHz);
    for (const p of peaks) {
      if (p.hz < hz - tol) continue;
      if (p.hz > hz + tol) break;
      if (p.amp >= floor) return true;
    }
    return false;
  };
  return peaks.map((p) => {
    const by = Array<number>(12).fill(0);
    const own = pcOfHz(p.hz);
    by[own] = 1;
    const floor = p.amp * s.siblingRatio;
    for (let h = 3; h <= s.partials; h++) {
      if ((h & (h - 1)) === 0) continue; // octaves of the peak's own pitch class
      const f0 = p.hz / h;
      if (f0 < s.minHz) break;
      const t = pcOfHz(f0);
      if (t === own) continue;
      const odd = h / (h & -h);
      const credit = odd === 3 ? s.credit3 : odd === 5 ? s.credit5 : odd === 7 ? s.credit7 : 1;
      const made =
        has(f0, floor) ||
        ((h === 5 || h === 7) && has(2 * f0, floor)) ||
        (h === 3 && has(4 * f0, floor) && has(5 * f0, floor));
      if (made) by[t] = Math.max(by[t], credit);
    }
    return { weight: p.amp ** s.gamma, own, by };
  });
}

/**
 * How far the peaks sit from one shared tuning, in cents (weighted mean
 * distance from the semitone grid, after the grid is moved to fit them best).
 * Strings in tune with each other stay within a few cents whatever the
 * instrument's overall pitch; damped strings and speech land anywhere.
 */
export function tuningSpread(peaks: SpectralPeak[], s: ChordReadSettings = CHORD_READ): number {
  let x = 0;
  let y = 0;
  const off = peaks.map((p) => {
    const m = hzToMidi(p.hz);
    const d = m - Math.round(m);
    const w = p.amp ** s.gamma;
    x += w * Math.cos(2 * Math.PI * d);
    y += w * Math.sin(2 * Math.PI * d);
    return { d, w };
  });
  const centre = Math.atan2(y, x) / (2 * Math.PI);
  let sum = 0;
  let total = 0;
  for (const { d, w } of off) {
    const r = d - centre;
    sum += w * Math.abs(r - Math.round(r));
    total += w;
  }
  return total ? (100 * sum) / total : 0;
}

const SHAPES = new Map<number, number>();
for (const t of CHORD_TEMPLATES)
  for (let root = 0; root < 12; root++) {
    const mask = t.intervals.reduce<number>((m, i) => m | (1 << ((root + i) % 12)), 0);
    // A bare fifth earns nothing: one string's third partial would complete it.
    const rank = t.quality === "maj" || t.quality === "m" ? 1 : t.quality === "5" ? 0 : 0.5;
    if ((SHAPES.get(mask) ?? 0) < rank) SHAPES.set(mask, rank);
  }
const shapeRank = (pcs: number[]) => SHAPES.get(pcs.reduce((m, p) => m | (1 << p), 0)) ?? 0;

/**
 * The smallest set of pitch classes that explains the peaks. Every subset of
 * the pitch classes with evidence is scored as the weight it explains, minus a
 * cost per tone, plus a small preference for a known chord shape. So a tone is
 * kept only when it explains something the others cannot.
 */
export function coverPeaks(peaks: ExplainedPeak[], s: ChordReadSettings = CHORD_READ) {
  const total = peaks.reduce((n, e) => n + e.weight, 0);
  const own = Array<number>(12).fill(0);
  for (const e of peaks) own[e.own] += e.weight;
  const candidates = own
    .map((v, pc) => ({ v, pc }))
    .filter((x) => x.v >= s.toneCost * total * 0.25)
    .sort((a, b) => b.v - a.v)
    .slice(0, 10)
    .map((x) => x.pc);
  let best = { score: 0, pcs: [] as number[], explained: 0 };
  for (let mask = 1; mask < 1 << candidates.length; mask++) {
    const pcs = candidates.filter((_, i) => mask & (1 << i));
    if (pcs.length > s.maxTones) continue;
    let explained = 0;
    for (const e of peaks) {
      let c = 0;
      for (const t of pcs) if (e.by[t] > c) c = e.by[t];
      explained += c * e.weight;
    }
    const score =
      explained - s.toneCost * total * pcs.length + s.chordBonus * total * shapeRank(pcs);
    if (score > best.score) best = { score, pcs, explained };
  }
  return { pcs: best.pcs, explained: total ? best.explained / total : 0, own };
}

export interface ChordReading {
  /** Pitch classes heard, ascending. Empty when nothing chord-like was heard. */
  pcs: number[];
  /** 12 pitch-class strengths (C = 0), strongest 1, before harmonics are explained away; all zero on silence. */
  chroma: number[];
  /** Share of the spectrum the heard tones explain, 0..1. */
  explained: number;
  /** How far the peaks sit from one shared tuning, cents (see `tuningSpread`). */
  spreadCents: number;
  /** True when nothing stood clear of the level floor and the noise, so nothing was read. */
  quiet: boolean;
}

/**
 * Read the pitch classes ringing in a stretch of audio, ideally the 300 to
 * 600 ms from a strum. Answers nothing (`pcs` empty) for noise, for a spectrum
 * its tones leave mostly unexplained (a clipped click, a room full of sound),
 * and for a smear with two or more pairs of neighbouring semitones (speech, a
 * muted stroke, a metronome click), none of which is a chord.
 */
export function readChord(
  buf: Float32Array,
  sampleRate: number,
  settings: Partial<ChordReadSettings> = {},
): ChordReading {
  const s = { ...CHORD_READ, ...settings };
  const none = { pcs: [], chroma: Array<number>(12).fill(0), explained: 0, spreadCents: 0 };
  const down = sampleRate > CHORD_SAMPLE_RATE;
  const peaks = spectralPeaks(
    down ? resample(buf, sampleRate, CHORD_SAMPLE_RATE) : buf,
    down ? CHORD_SAMPLE_RATE : sampleRate,
    s,
  );
  if (!peaks.length) return { ...none, quiet: true };
  const cover = coverPeaks(explainPeaks(peaks, s), s);
  const max = Math.max(...cover.own);
  // Chords hold at most one pair of neighbouring semitones (the 7 and 1 of a maj7).
  const smeared = cover.pcs.filter((p) => cover.pcs.includes((p + 1) % 12)).length >= 2;
  const spreadCents = tuningSpread(peaks, s);
  const chord = !smeared && cover.explained >= s.minExplained && spreadCents <= s.maxSpreadCents;
  return {
    pcs: chord ? [...cover.pcs].sort((a, b) => a - b) : [],
    chroma: cover.own.map((v) => v / max),
    explained: cover.explained,
    spreadCents,
    quiet: false,
  };
}

/** A contiguous analysed frame: `at` is the time (ms) of its first sample. */
export interface TimedFrame {
  frame: Float32Array;
  sampleRate: number;
  at: number;
}

/**
 * The samples of contiguous frames between `from` and `from + ms`, cut to the
 * sample: a reading starts at the strum, not at the frame that held it (a
 * frame is 43 ms and the sound before the attack is another chord or noise).
 */
export function framesWindow(frames: readonly TimedFrame[], from: number, ms: number) {
  const first = frames[0];
  if (!first) return new Float32Array(0);
  const perMs = first.sampleRate / 1000;
  const total = frames.reduce((n, f) => n + f.frame.length, 0);
  const a = Math.min(total, Math.max(0, Math.round((from - first.at) * perMs)));
  const b = Math.min(total, Math.max(a, Math.round((from + ms - first.at) * perMs)));
  const out = new Float32Array(b - a);
  let pos = 0;
  for (const f of frames) {
    const lo = Math.max(a, pos);
    const hi = Math.min(b, pos + f.frame.length);
    if (hi > lo) out.set(f.frame.subarray(lo - pos, hi - pos), lo - a);
    pos += f.frame.length;
  }
  return out;
}
