export interface OnsetDetectOptions {
  /** Absolute RMS floor below which a frame cannot be an onset. */
  minimumRms?: number;
  /** Required multiple above the adaptive background-noise floor. */
  thresholdRatio?: number;
  /** Fraction of the trigger threshold required to re-arm the detector. */
  releaseRatio?: number;
  /** Minimum time between emitted onsets. */
  cooldownMs?: number;
  /** Weight retained from the previous background-noise estimate. */
  noiseFloorSmoothing?: number;
}

export interface OnsetDetection {
  rms: number;
  strength: number;
}

const DEFAULTS = {
  minimumRms: 0.02,
  thresholdRatio: 3,
  releaseRatio: 0.6,
  cooldownMs: 80,
  noiseFloorSmoothing: 0.9,
} satisfies Required<OnsetDetectOptions>;

export function frameRms(frame: Float32Array): number {
  if (frame.length === 0) return 0;

  let sumSquares = 0;
  for (const sample of frame) sumSquares += sample * sample;
  return Math.sqrt(sumSquares / frame.length);
}

/**
 * Adaptive transient detector for microphone timing input.
 *
 * It learns the quiet background level, emits once when a frame crosses the
 * trigger threshold, and waits for the signal to release before re-arming.
 */
export class OnsetDetector {
  readonly #options: Required<OnsetDetectOptions>;
  #noiseFloor: number;
  #armed = true;
  #lastOnsetMs = Number.NEGATIVE_INFINITY;

  constructor(options: OnsetDetectOptions = {}) {
    this.#options = { ...DEFAULTS, ...options };
    this.#noiseFloor = this.#options.minimumRms / this.#options.thresholdRatio;
  }

  process(frame: Float32Array, timestampMs: number): OnsetDetection | null {
    const rms = frameRms(frame);
    const threshold = Math.max(
      this.#options.minimumRms,
      this.#noiseFloor * this.#options.thresholdRatio,
    );

    if (!this.#armed) {
      if (rms <= threshold * this.#options.releaseRatio) this.#armed = true;
      this.#updateNoiseFloor(rms, threshold);
      return null;
    }

    if (rms >= threshold && timestampMs - this.#lastOnsetMs >= this.#options.cooldownMs) {
      this.#armed = false;
      this.#lastOnsetMs = timestampMs;
      return {
        rms,
        strength: Math.min(1, Math.max(0, (rms - threshold) / (threshold * 2))),
      };
    }

    this.#updateNoiseFloor(rms, threshold);
    return null;
  }

  reset(): void {
    this.#noiseFloor = this.#options.minimumRms / this.#options.thresholdRatio;
    this.#armed = true;
    this.#lastOnsetMs = Number.NEGATIVE_INFINITY;
  }

  #updateNoiseFloor(rms: number, threshold: number): void {
    if (rms >= threshold) return;
    const smoothing = this.#options.noiseFloorSmoothing;
    this.#noiseFloor = smoothing * this.#noiseFloor + (1 - smoothing) * rms;
  }
}
