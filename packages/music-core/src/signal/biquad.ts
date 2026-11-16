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

/**
 * What the microphone path listens through: a 60 Hz high-pass (DC, rumble and
 * the low noise laptop microphones are full of) and two narrow notches on the
 * mains frequencies, 50 and 60 Hz. Hum sits a quarter tone under the lowest
 * note the reader names (C2, 65.4 Hz) and is as periodic as a string, so left
 * in it reads as a low note and pulls real notes down to a common period with
 * it. The notches are 6 Hz wide (Q 8 and 10): C2 loses about 3 dB of its
 * fundamental, which the pitch reader does not need.
 *
 * Self-contained like `createHighPass`: the AudioWorklet embeds this function's
 * own source, so it must not use anything defined outside itself.
 */
export function createInputFilter(sampleRate?: number): HighPass {
  const fs = typeof sampleRate === "number" && sampleRate > 0 ? sampleRate : 48000;
  // RBJ biquads, coefficients already divided by a0: [b0, b1, b2, a1, a2].
  const section = (kind: "highpass" | "notch", hz: number, q: number) => {
    const w0 = (2 * Math.PI * hz) / fs;
    const cos = Math.cos(w0);
    const alpha = Math.sin(w0) / (2 * q);
    const a0 = 1 + alpha;
    const b = kind === "highpass" ? [(1 + cos) / 2, -(1 + cos), (1 + cos) / 2] : [1, -2 * cos, 1];
    return [b[0] / a0, b[1] / a0, b[2] / a0, (-2 * cos) / a0, (1 - alpha) / a0];
  };
  const sections = [
    section("highpass", 60, Math.SQRT1_2),
    section("notch", 50, 8),
    section("notch", 60, 10),
  ];
  // Per section: x1, x2, y1, y2.
  const z = new Float64Array(sections.length * 4);

  function process(x: number): number {
    let v = x;
    for (let s = 0; s < sections.length; s++) {
      const c = sections[s];
      const o = s * 4;
      let y = c[0] * v + c[1] * z[o] + c[2] * z[o + 1] - c[3] * z[o + 2] - c[4] * z[o + 3];
      // The poles sit just inside the unit circle: on silence the state decays into denormals.
      if (y < 1e-20 && y > -1e-20) y = 0;
      z[o + 1] = z[o];
      z[o] = v;
      z[o + 3] = z[o + 2];
      z[o + 2] = y;
      v = y;
    }
    return v;
  }

  return {
    process,
    processBlock(buf) {
      for (let i = 0; i < buf.length; i++) buf[i] = process(buf[i]);
    },
    reset() {
      z.fill(0);
    },
  };
}
