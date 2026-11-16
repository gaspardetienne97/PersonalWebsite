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
//
// Level: the spectrum is measured against the loudest the input has recently
// been (a peak follower with a two second half-life, never less than 12 dB over
// the noise gate), and what a bin holds of the noise floor is taken off first.
// So a quiet line input and a hot one give the same flux for the same playing,
// and the detector does not open up on room noise before the first note.
//
// One attack, one onset: a slow strum keeps the flux up for as long as the pick
// is still crossing strings, so a new onset waits for the flux to fall back
// under the threshold, and for 130 ms.
//
// The app's own click is taken out of the signal before it gets here
// (click.ts). What is left of it is still there for a few frames, so the caller
// raises the gate over it and says so (`clickAt`): while it lasts, the spectrum
// from before the click stays the baseline. A bare click then leaves nothing to
// find. A strum louder than what is left is found at once; a quieter one is
// found a few frames later, when the gate comes back down and the chord is
// still ringing over the old baseline, and is timed at the click it was under.
// A click that could not be taken out is flagged (`mute`), and nothing is
// reported while it sounds.
import { powerSpectrum } from "./fft";
import { createNoiseGate } from "./level";

export const ONSET_BLOCK = 128;

export function createOnsetDetector(
  sampleRate: number,
  {
    refractoryMs = 130,
    sensitivity = 2,
    historyMs = 1000,
    minFlux = 0.06,
    /** How far under the recent peak a partial still counts in full (100 is 40 dB). */
    range = 100,
    halfLifeMs = 2000,
    maxHz = 8000,
  } = {},
) {
  let prevFrame: Float32Array | null = null;
  let prevMag: Float64Array | null = null;
  let history: number[] = [];
  let lastOnset = -Infinity;
  let peak = 0;
  let armed = true;
  /** A removed click is in the window: when it began and the level of the frame before it. */
  let held: { since: number; level: number } | null = null;
  let lastLevel = 0;
  const ownGate = createNoiseGate();
  /**
   * Where in `win` (two frames, the second starting at `at`) the attack is, or
   * null when the level never rises the way an attack makes it rise.
   */
  function place(win: Float32Array, at: number): number | null {
    const n = win.length / 2;
    // Peak level over the trailing 512 samples (a full period of E2), sampled
    // every 128. The onset is the first block where the envelope has climbed a
    // quarter of the way from its level before the rise to the loudest point.
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
    // And it leaves what follows louder than what came before. A hand damping
    // ringing strings splashes as much flux and leaves it quieter.
    const split = idx * ONSET_BLOCK;
    let before = 0;
    let after = 0;
    for (let i = 0; i < win.length; i++)
      if (i < split) before += win[i] * win[i];
      else after += win[i] * win[i];
    if (split > 0 && after / (win.length - split) < before / split) return null;
    return at - (n / sampleRate) * 1000 + (idx * ONSET_BLOCK * 1000) / sampleRate;
  }

  return {
    /**
     * `gateRms`: the level under which the input is noise (the listener's gate);
     * kept here when not given. `mute`: a click of the app's own that could not
     * be removed is in this frame, so whatever rises here is not reported.
     * `clickAt`: a click was removed from this window and began then (ms).
     */
    push(
      frame: Float32Array,
      at: number,
      gateRms?: number,
      mute = false,
      clickAt?: number,
    ): { at: number; strength: number } | null {
      const n = frame.length;
      const win = new Float32Array(2 * n);
      if (prevFrame) win.set(prevFrame);
      win.set(frame, n);
      prevFrame = frame.slice();
      const frameMs = (n / sampleRate) * 1000;

      let sum = 0;
      let own = 0;
      for (let i = 0; i < n; i++) {
        sum += win[i] * win[i];
        own += frame[i] * frame[i];
      }
      const rms = Math.sqrt((sum + own) / win.length);
      const gate = gateRms ?? ownGate.push(Math.sqrt(own / n), at);
      const quiet = Math.max(rms, Math.sqrt(own / n)) < 1.5 * gate;
      peak = Math.max(peak * 0.5 ** (frameMs / halfLifeMs), rms);
      const scale = range / Math.max(peak, 4 * gate);
      // What a bin holds when only the noise floor is in it.
      const noise = 0.1 * gate;
      const loud = (m: number) => Math.log1p(scale * Math.max(0, m - noise));

      const mag = powerSpectrum(win).power.map(Math.sqrt);
      const bins = Math.min(mag.length, Math.ceil((maxHz * win.length) / sampleRate));
      const mean = history.length ? history.reduce((a, b) => a + b, 0) / history.length : 0;
      const sd = history.length
        ? Math.sqrt(history.reduce((a, b) => a + (b - mean) ** 2, 0) / history.length)
        : 0;
      const threshold = Math.max(minFlux, mean + sensitivity * sd);
      const remember = (flux: number) => {
        // Clip what goes into the history so one loud hit does not deafen the next second.
        history.push(Math.min(flux, threshold));
        if (history.length > Math.ceil(historyMs / frameMs)) history.shift();
      };

      let flux = 0;
      if (prevMag && !quiet) {
        for (let k = 1; k < bins; k++) flux += Math.max(0, loud(mag[k]) - loud(prevMag[k]));
        flux /= bins;
      }
      // Over a removed click the baseline stays what it was before the click,
      // and for one frame after, so what the click hid can still be seen.
      const under = held;
      if (clickAt !== undefined) held ??= { since: clickAt, level: lastLevel };
      else held = null;
      if (clickAt === undefined || !prevMag) prevMag = mag;
      lastLevel = Math.sqrt(own / n);

      remember(flux);
      // Muted, nothing is decided: what the click hid is looked for afterwards.
      if (mute) return null;
      const rising = armed;
      armed = flux <= threshold;
      if (armed || !rising) return null;
      let onsetAt = place(win, at);
      // Nothing rises inside this window when the attack was under the click:
      // the sound is simply there now, well over the level from before.
      if (onsetAt === null && under && lastLevel >= 2 * under.level) onsetAt = under.since;
      if (onsetAt === null || onsetAt - lastOnset < refractoryMs) return null;
      lastOnset = onsetAt;
      return { at: onsetAt, strength: flux };
    },
    reset() {
      prevFrame = prevMag = null;
      history = [];
      lastOnset = -Infinity;
      peak = 0;
      armed = true;
      held = null;
      lastLevel = 0;
      ownGate.reset();
    },
  };
}
