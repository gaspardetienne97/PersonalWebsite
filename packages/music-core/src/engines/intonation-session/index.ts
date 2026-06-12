/**
 * Intonation session — pure, framework-agnostic stats over a stream of cents
 * samples for the Intonation & Drone trainer. The `audio-in` engine supplies the
 * raw pitch (frequency → cents against the nearest note or a drone target); this
 * engine turns the time series into the live HUD the mockup specifies:
 * **in-tune %**, current **hold** seconds, **steadiness**, **average drift**, and
 * the rolling **pitch trace** for the sparkline.
 *
 * No Web Audio, no Svelte — fully unit-testable by pushing samples with
 * synthetic timestamps. The caller decides what `cents` is measured against, so
 * the same engine serves both "hold the pitch" (deviation from a drone tonic) and
 * free intonation (deviation from the nearest note).
 */

/** One pitch frame: signed cents (negative = flat), clarity, monotonic time (ms). */
export interface IntonationSample {
  cents: number;
  clarity: number;
  t: number;
}

export interface IntonationStats {
  /** Fraction of windowed samples within tolerance, 0–100. */
  inTunePercent: number;
  /** Length of the current uninterrupted in-tune run, in seconds. */
  holdSeconds: number;
  /** 0–100, derived from cents spread (tighter = steadier). */
  steadiness: number;
  /** Mean absolute cents over the window. */
  avgDriftCents: number;
  /** Windowed cents, oldest → newest, for the pitch-trace sparkline. */
  trace: number[];
  /** Number of samples currently in the window. */
  sampleCount: number;
  /** False before any sample arrives (render placeholders). */
  hasData: boolean;
}

export interface IntonationSessionOptions {
  /** Rolling window length in ms. Default 10000 (the "last 10 s" trace). */
  windowMs?: number;
  /** Half-width of the in-tune band in cents. Default 10 ("within ±10¢"). */
  toleranceCents?: number;
  /** Cents std-dev that maps steadiness to 0%. Default 20. */
  steadinessRangeCents?: number;
  /** Cap on trace points handed to the sparkline. Default 120. */
  maxTracePoints?: number;
}

const EMPTY_STATS: IntonationStats = {
  inTunePercent: 0,
  holdSeconds: 0,
  steadiness: 0,
  avgDriftCents: 0,
  trace: [],
  sampleCount: 0,
  hasData: false,
};

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

export class IntonationSession {
  #samples: IntonationSample[] = [];
  #windowMs: number;
  #toleranceCents: number;
  #steadinessRangeCents: number;
  #maxTracePoints: number;

  #holdStartT: number | undefined;
  #lastT = 0;
  #lastInTune = false;

  constructor(options: IntonationSessionOptions = {}) {
    this.#windowMs = options.windowMs ?? 10_000;
    this.#toleranceCents = options.toleranceCents ?? 10;
    this.#steadinessRangeCents = options.steadinessRangeCents ?? 20;
    this.#maxTracePoints = options.maxTracePoints ?? 120;
  }

  /** Feed one pitch frame. Out-of-order timestamps are tolerated but not reordered. */
  push(sample: IntonationSample): void {
    this.#samples.push(sample);
    this.#prune(sample.t);

    const inTune = Math.abs(sample.cents) <= this.#toleranceCents;
    if (inTune) {
      this.#holdStartT ??= sample.t;
    } else {
      this.#holdStartT = undefined;
    }
    this.#lastT = sample.t;
    this.#lastInTune = inTune;
  }

  /** Clear all samples and the current hold run. */
  reset(): void {
    this.#samples = [];
    this.#holdStartT = undefined;
    this.#lastT = 0;
    this.#lastInTune = false;
  }

  get stats(): IntonationStats {
    const samples = this.#samples;
    const n = samples.length;
    if (n === 0) return EMPTY_STATS;

    let inTuneCount = 0;
    let absSum = 0;
    let sum = 0;
    for (const s of samples) {
      const abs = Math.abs(s.cents);
      if (abs <= this.#toleranceCents) inTuneCount++;
      absSum += abs;
      sum += s.cents;
    }

    const mean = sum / n;
    let variance = 0;
    for (const s of samples) variance += (s.cents - mean) ** 2;
    const std = Math.sqrt(variance / n);
    const steadiness = clamp(100 * (1 - std / this.#steadinessRangeCents), 0, 100);

    const holdSeconds =
      this.#lastInTune && this.#holdStartT !== undefined
        ? Math.max(0, (this.#lastT - this.#holdStartT) / 1_000)
        : 0;

    return {
      inTunePercent: (inTuneCount / n) * 100,
      holdSeconds,
      steadiness,
      avgDriftCents: absSum / n,
      trace: this.#trace(),
      sampleCount: n,
      hasData: true,
    };
  }

  #prune(now: number): void {
    const cutoff = now - this.#windowMs;
    let drop = 0;
    while (drop < this.#samples.length && this.#samples[drop].t < cutoff) drop++;
    if (drop > 0) this.#samples.splice(0, drop);
  }

  /** Cents only, capped to the latest `maxTracePoints` for a bounded sparkline. */
  #trace(): number[] {
    const cents = this.#samples.map((s) => s.cents);
    return cents.length <= this.#maxTracePoints
      ? cents
      : cents.slice(cents.length - this.#maxTracePoints);
  }
}
