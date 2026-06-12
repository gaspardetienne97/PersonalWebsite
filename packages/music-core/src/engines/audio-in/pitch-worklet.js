/**
 * AudioWorkletProcessor that slices the mic stream into fixed analysis windows
 * and posts each completed window (a Float32Array of mono samples) to the main
 * thread, where the pure MPM detector runs. Living on the audio thread means the
 * frame cadence comes from `process()` itself — no setTimeout / rAF on the main
 * thread, honouring the project's "no timer-scheduled audio" guardrail.
 *
 * Plain JS on purpose: AudioWorklet modules load via `addModule(url)` and run in
 * the AudioWorkletGlobalScope, which has no TS/module bundling of its own.
 */

const FRAME_SIZE = 2048; // ~46 ms at 44.1 kHz — fine resolution for a tuner.

class PitchWorklet extends AudioWorkletProcessor {
  constructor() {
    super();
    this._buffer = new Float32Array(FRAME_SIZE);
    this._filled = 0;
  }

  process(inputs) {
    const input = inputs[0];
    if (!input || input.length === 0) return true;
    const channel = input[0];
    if (!channel) return true;

    for (let i = 0; i < channel.length; i++) {
      this._buffer[this._filled++] = channel[i];
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
