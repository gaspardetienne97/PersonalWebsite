/**
 * AudioWorkletProcessor that slices the mic stream into fixed analysis windows
 * and posts each completed window (a Float32Array of mono samples) to the main
 * thread, where the pure MPM detector runs. Living on the audio thread means the
 * frame cadence comes from `process()` itself — no setTimeout / rAF on the main
 * thread, honouring the project's "no timer-scheduled audio" guardrail.
 *
 * Plain JS on purpose: AudioWorklet modules load via `addModule(url)` and run in
 * the AudioWorkletGlobalScope, which has no TS/module bundling of its own.
 *
 * Two consumers load this same source: the tuner via {@link ./capture} and
 * chord recognition via {@link ./chord-source}, so the high-pass below sits in
 * front of the chroma/note-gate path too. Moving its cutoff moves both.
 */

const FRAME_SIZE = 2048; // ~46 ms at 44.1 kHz — fine resolution for a tuner.
const HIGH_PASS_HZ = 40; // below the lowest note the detector will report (50 Hz).

class PitchWorklet extends AudioWorkletProcessor {
  constructor() {
    super();
    this._buffer = new Float32Array(FRAME_SIZE);
    this._filled = 0;

    // Second-order (RBJ, Q = 1/√2) high-pass, run per sample before framing.
    // A DC offset from a cheap preamp and sub-50 Hz rumble (HVAC, handling)
    // add a slowly varying term to the autocorrelation that tilts the NSDF
    // peak toward shorter lags: readings come back a few cents sharp and about
    // half the frames on low strings fall under the clarity floor.
    // `sampleRate` is a global in the AudioWorkletGlobalScope; a harness that
    // evaluates this source without one would otherwise turn every coefficient
    // — and then every sample, permanently — into NaN.
    const sr = typeof sampleRate === "number" && sampleRate > 0 ? sampleRate : 48000;
    const w0 = (2 * Math.PI * HIGH_PASS_HZ) / sr;
    const cosW0 = Math.cos(w0);
    const alpha = Math.sin(w0) / Math.SQRT2;
    const a0 = 1 + alpha;
    this._b0 = (1 + cosW0) / 2 / a0;
    this._b1 = -(1 + cosW0) / a0;
    this._b2 = this._b0;
    this._a1 = (-2 * cosW0) / a0;
    this._a2 = (1 - alpha) / a0;
    this._x1 = 0;
    this._x2 = 0;
    this._y1 = 0;
    this._y2 = 0;
  }

  /** One biquad step; state carries across `process()` calls and frames. */
  _highPass(x) {
    let y =
      this._b0 * x +
      this._b1 * this._x1 +
      this._b2 * this._x2 -
      this._a1 * this._y1 -
      this._a2 * this._y2;
    // Poles sit at radius ~0.9963, so on digital silence the state decays into
    // denormals within seconds and stays there, at 10-100x the FP cost on the
    // audio thread. Flush it instead of relying on the host setting FTZ.
    if (y > -1e-20 && y < 1e-20) y = 0;
    this._x2 = this._x1;
    this._x1 = x;
    this._y2 = this._y1;
    this._y1 = y;
    return y;
  }

  process(inputs) {
    const input = inputs[0];
    if (!input || input.length === 0) return true;
    const channel = input[0];
    if (!channel) return true;

    for (let i = 0; i < channel.length; i++) {
      this._buffer[this._filled++] = this._highPass(channel[i]);
      if (this._filled >= FRAME_SIZE) {
        // Transfer a copy so the main thread owns its own frame.
        const frame = this._buffer.slice(0);
        this.port.postMessage(frame, [frame.buffer]);
        this._filled = 0;
      }
    }
    return true;
  }
}

registerProcessor("pitch-worklet", PitchWorklet);
