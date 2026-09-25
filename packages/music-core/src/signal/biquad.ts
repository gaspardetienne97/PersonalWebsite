// RBJ second-order high-pass (hardware notes §4). Self-contained on purpose:
// the AudioWorklet bundles this file on its own, so it must not import anything.

export interface HighPass {
  process(x: number): number;
  processBlock(buf: Float32Array): void;
  reset(): void;
}

/**
 * 40 Hz, Q = 1/sqrt(2). Removes DC and sub-50 Hz rumble that bias the NSDF sharp.
 * `sampleRate` falls back to 48000 when missing or NaN (a worklet test harness
 * without the global would otherwise turn every coefficient into NaN).
 */
export function createHighPass(sampleRate?: number, cutoffHz = 40): HighPass {
  const fs = typeof sampleRate === "number" && sampleRate > 0 ? sampleRate : 48000;
  const w0 = (2 * Math.PI * cutoffHz) / fs;
  const cos = Math.cos(w0);
  const alpha = Math.sin(w0) / (2 * Math.SQRT1_2);
  const a0 = 1 + alpha;
  const b0 = (1 + cos) / 2 / a0;
  const b1 = -(1 + cos) / a0;
  const b2 = b0;
  const a1 = (-2 * cos) / a0;
  const a2 = (1 - alpha) / a0;
  let x1 = 0;
  let x2 = 0;
  let y1 = 0;
  let y2 = 0;

  function process(x: number): number {
    let y = b0 * x + b1 * x1 + b2 * x2 - a1 * y1 - a2 * y2;
    // Poles sit at radius ~0.9963: on silence the state decays into denormals.
    if (y < 1e-20 && y > -1e-20) y = 0;
    x2 = x1;
    x1 = x;
    y2 = y1;
    y1 = y;
    return y;
  }

  return {
    process,
    processBlock(buf) {
      for (let i = 0; i < buf.length; i++) buf[i] = process(buf[i]);
    },
    reset() {
      x1 = x2 = y1 = y2 = 0;
    },
  };
}
