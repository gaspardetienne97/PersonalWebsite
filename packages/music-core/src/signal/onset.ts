// Onset detection for microphone rhythm and strum input: log-magnitude spectral
// flux against an adaptive threshold, then a sub-block energy search to place
// the onset in time.
//
// Each push analyses the previous frame plus this one under a Hann window, so an
// attack at a frame edge is never windowed away. Granularity: detection happens
// once per pushed frame (1024 to 2048 samples, 21-46 ms); the reported time is
// refined to a 128-sample block of the amplitude envelope (2.7 ms at 48 kHz,
// 2.9 ms at 44.1 kHz); low notes can read up to about 7 ms late because a spiky
// waveform takes part of a period to show its level. Frames are contiguous
// (hop = frame length) and `at` is the time of the frame's first sample.
import { powerSpectrum } from "./fft";
import { SILENCE_RMS } from "./pitch";

export const ONSET_BLOCK = 128;

export function createOnsetDetector(
  sampleRate: number,
  { refractoryMs = 60, sensitivity = 2, historyMs = 1000, minFlux = 0.02 } = {},
) {
  let prevFrame: Float32Array | null = null;
  let prevMag: Float64Array | null = null;
  let history: number[] = [];
  let lastOnset = -Infinity;

  return {
    push(frame: Float32Array, at: number): { at: number; strength: number } | null {
      const n = frame.length;
      const win = new Float32Array(2 * n);
      if (prevFrame) win.set(prevFrame);
      win.set(frame, n);
      prevFrame = frame.slice();

      let sum = 0;
      for (let i = 0; i < win.length; i++) sum += win[i] * win[i];
      const quiet = Math.sqrt(sum / win.length) < SILENCE_RMS;
      const mag = powerSpectrum(win).power.map((p) => Math.log1p(1000 * Math.sqrt(p)));
      let flux = 0;
      if (prevMag && !quiet) {
        for (let k = 1; k < mag.length; k++) flux += Math.max(0, mag[k] - prevMag[k]);
        flux /= mag.length;
      }
      prevMag = mag;

      const frameMs = (n / sampleRate) * 1000;
      const mean = history.length ? history.reduce((a, b) => a + b, 0) / history.length : 0;
      const sd = history.length
        ? Math.sqrt(history.reduce((a, b) => a + (b - mean) ** 2, 0) / history.length)
        : 0;
      const threshold = Math.max(minFlux, mean + sensitivity * sd);
      // Clip what goes into the history so one loud hit does not deafen the next second.
      history.push(Math.min(flux, threshold));
      if (history.length > Math.ceil(historyMs / frameMs)) history.shift();
      if (flux <= threshold) return null;

      // Place it on an envelope: the peak level over the trailing 512 samples
      // (a full period of E2), sampled every 128. The onset is the first block
      // where the envelope has climbed a quarter of the way from its level before
      // the rise to the loudest point in the window.
      const peaks: number[] = [];
      for (let b = 0; b * ONSET_BLOCK < win.length; b++) {
        let p = 0;
        const end = Math.min(win.length, (b + 1) * ONSET_BLOCK);
        for (let i = b * ONSET_BLOCK; i < end; i++) p = Math.max(p, Math.abs(win[i]));
        peaks.push(p);
      }
      const env = peaks.map((_, b) => Math.max(...peaks.slice(Math.max(0, b - 3), b + 1)));
      const top = env.indexOf(Math.max(...env));
      const base = Math.min(...env.slice(0, top + 1));
      // An attack raises the level; a note ending (or a fade) can splash flux but never does.
      if (env[top] - base < 0.3 * env[top]) return null;
      const idx = env.findIndex((e) => e - base >= 0.25 * (env[top] - base));
      const onsetAt = at - frameMs + (idx * ONSET_BLOCK * 1000) / sampleRate;
      if (onsetAt - lastOnset < refractoryMs) return null;
      lastOnset = onsetAt;
      return { at: onsetAt, strength: flux };
    },
    reset() {
      prevFrame = prevMag = null;
      history = [];
      lastOnset = -Infinity;
    },
  };
}
