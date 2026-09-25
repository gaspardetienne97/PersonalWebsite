// McLeod Pitch Method plus the tuner and intonation readers built on it.
// Every number here is from hardware notes §4 and was measured on low strings.
import { clamp01, hzToNote } from "../theory/notes";

/** Peak-pick ratio. 0.9 flips to 2T/3T under hum; 0.8 starts picking T/2. */
export const PEAK_PICK_RATIO = 0.85;
export const MIN_HZ = 50;
export const MAX_HZ = 1500;
export const SILENCE_RMS = 1e-3;
export const FRAME_SIZE = 2048;
export const WIDE_FRAME_SIZE = 4096;
/** Below this the 2048 frame holds too few periods (E2 gets ~3.5). */
export const WIDE_BELOW_HZ = 130;
export const TUNER_CLARITY_FLOOR = 0.6;

export interface PitchEstimate {
  hz: number;
  clarity: number;
}
export interface PitchReading extends PitchEstimate {
  midi: number;
  cents: number;
}

export function mpm(
  buf: Float32Array,
  sampleRate: number,
  opts: { ratio?: number; minHz?: number; maxHz?: number } = {},
): PitchEstimate | null {
  const { ratio = PEAK_PICK_RATIO, minHz = MIN_HZ, maxHz = MAX_HZ } = opts;
  const n = buf.length;
  let energy = 0;
  for (let i = 0; i < n; i++) energy += buf[i] * buf[i];
  if (n < 4 || Math.sqrt(energy / n) < SILENCE_RMS) return null;

  const maxLag = Math.min(n - 2, Math.ceil(sampleRate / minHz) + 2);
  const minLag = Math.floor(sampleRate / maxHz);
  const nsdf = new Float64Array(maxLag + 1);
  let m = 2 * energy;
  for (let tau = 0; tau <= maxLag; tau++) {
    if (tau > 0) m -= buf[n - tau] * buf[n - tau] + buf[tau - 1] * buf[tau - 1];
    let acf = 0;
    for (let j = 0, end = n - tau; j < end; j++) acf += buf[j] * buf[j + tau];
    nsdf[tau] = m > 0 ? (2 * acf) / m : 0;
  }

  // Key maxima: the highest point of each positive lobe after the zero-lag lobe.
  const keys: number[] = [];
  let tau = 1;
  while (tau <= maxLag && nsdf[tau] > 0) tau++;
  while (tau <= maxLag) {
    while (tau <= maxLag && nsdf[tau] <= 0) tau++;
    let best = -1;
    while (tau <= maxLag && nsdf[tau] > 0) {
      if (best < 0 || nsdf[tau] > nsdf[best]) best = tau;
      tau++;
    }
    if (best >= Math.max(1, minLag) && best < maxLag) keys.push(best);
  }
  if (!keys.length) return null;
  let top = 0;
  for (const k of keys) top = Math.max(top, nsdf[k]);
  const pick = keys.find((k) => nsdf[k] >= ratio * top)!;

  const a = nsdf[pick - 1];
  const b = nsdf[pick];
  const c = nsdf[pick + 1];
  const denom = a - 2 * b + c;
  const delta = denom === 0 ? 0 : (0.5 * (a - c)) / denom;
  const hz = sampleRate / (pick + delta);
  if (hz < minHz || hz > maxHz) return null;
  return { hz, clarity: clamp01(b - 0.25 * (a - c) * delta) };
}

const usable = (e: PitchEstimate | null): e is PitchEstimate =>
  e !== null && e.clarity >= TUNER_CLARITY_FLOOR;

/**
 * One tuner frame. `frame` is the latest 2048 samples; `wide` the latest 4096
 * (it contains `frame`). The wide pass runs only when the frame alone is
 * unusable or reads below 130 Hz. It may improve a reading (same note, steadier)
 * but never deletes one the frame earned: on a transition half the wide window
 * is the previous note, so a wide result that disagrees by more than 50 cents or
 * falls under the clarity floor is ignored.
 */
export function analyzePitch(
  frame: Float32Array,
  sampleRate: number,
  wide?: Float32Array,
  a4 = 440,
): PitchReading | null {
  let best = mpm(frame, sampleRate);
  if (wide && wide.length > frame.length && (!usable(best) || best.hz < WIDE_BELOW_HZ)) {
    const w = mpm(wide, sampleRate);
    if (usable(w) && (!usable(best) || Math.abs(1200 * Math.log2(w.hz / best.hz)) <= 50)) best = w;
  }
  return best && { ...best, ...hzToNote(best.hz, a4) };
}

export interface TunerState extends PitchReading {
  /** When this reading was heard (it may be held from an earlier frame). */
  at: number;
  inTune: boolean;
}

/** Holds the last reading above the clarity floor; clears it after `staleMs`. */
export function createTunerReader({ clarityFloor = 0.6, staleMs = 1500, toleranceCents = 5 } = {}) {
  let held: (PitchReading & { at: number }) | null = null;
  const read = (at: number): TunerState | null => {
    if (held && at - held.at > staleMs) held = null;
    return held && { ...held, inTune: Math.abs(held.cents) <= toleranceCents };
  };
  return {
    push(reading: PitchReading | null, at: number): TunerState | null {
      if (reading && reading.clarity >= clarityFloor) held = { ...reading, at };
      return read(at);
    },
    read,
    reset() {
      held = null;
    },
  };
}

export interface IntonationStats {
  inTunePct: number;
  /** Seconds the current unbroken in-tune stretch has lasted (0 if out of tune now). */
  holdSeconds: number;
  /** 100 x clamp01(1 - stdev(cents) / 50): 50 cents of spread reads 0. */
  steadinessPct: number;
  avgDriftCents: number;
  /** cents is null where no usable pitch was heard (draw a gap). */
  trace: { at: number; cents: number | null }[];
}

/**
 * Rolling intonation over `windowMs`. Cents are measured against `targetMidi`
 * when given (drone trainer), else against the nearest note.
 */
export function createIntonationStats({
  windowMs = 10000,
  toleranceCents = 10,
  clarityFloor = TUNER_CLARITY_FLOOR,
} = {}) {
  let trace: { at: number; cents: number | null }[] = [];
  return {
    push(reading: PitchReading | null, at: number, targetMidi?: number) {
      const ok = reading && reading.clarity >= clarityFloor;
      const cents = !ok
        ? null
        : targetMidi === undefined
          ? reading.cents
          : (reading.midi - targetMidi) * 100 + reading.cents;
      trace.push({ at, cents });
      trace = trace.filter((s) => at - s.at <= windowMs);
    },
    stats(): IntonationStats {
      const voiced = trace.filter((s) => s.cents !== null).map((s) => s.cents!);
      const inTune = (c: number | null) => c !== null && Math.abs(c) <= toleranceCents;
      let holdSeconds = 0;
      const last = trace.length - 1;
      if (last >= 0 && inTune(trace[last].cents)) {
        let i = last;
        while (i > 0 && inTune(trace[i - 1].cents)) i--;
        holdSeconds = (trace[last].at - trace[i].at) / 1000;
      }
      const mean = voiced.length ? voiced.reduce((s, c) => s + c, 0) / voiced.length : 0;
      const sd =
        voiced.length >= 2
          ? Math.sqrt(voiced.reduce((s, c) => s + (c - mean) ** 2, 0) / voiced.length)
          : null;
      return {
        inTunePct: voiced.length
          ? Math.round((100 * voiced.filter(inTune).length) / voiced.length)
          : 0,
        holdSeconds,
        steadinessPct: sd === null ? 0 : Math.round(100 * clamp01(1 - sd / 50)),
        avgDriftCents: Math.round(mean * 10) / 10,
        trace: trace.slice(),
      };
    },
    reset() {
      trace = [];
    },
  };
}
