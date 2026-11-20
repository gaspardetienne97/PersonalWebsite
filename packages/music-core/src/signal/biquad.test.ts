import { describe, expect, it } from "vite-plus/test";
import { createHighPass } from "./biquad";

describe("40 Hz high-pass", () => {
  it("falls back to 48 kHz when sampleRate is missing or NaN", () => {
    for (const hp of [createHighPass(), createHighPass(Number.NaN)]) {
      const buf = new Float32Array(4800).fill(0.5);
      hp.processBlock(buf);
      expect(buf.every(Number.isFinite)).toBe(true);
      expect(Math.abs(buf[4799])).toBeLessThan(1e-3); // DC removed
    }
  });

  it("passes 110 Hz, cuts 20 Hz by ~12 dB, and flushes silence to exactly 0", () => {
    const gain = (hz: number) => {
      const hp = createHighPass(48000);
      let peak = 0;
      for (let i = 0; i < 48000; i++) {
        const y = hp.process(Math.sin((2 * Math.PI * hz * i) / 48000));
        if (i > 24000) peak = Math.max(peak, Math.abs(y));
      }
      return 20 * Math.log10(peak);
    };
    expect(gain(110)).toBeGreaterThan(-0.6);
    expect(gain(40)).toBeCloseTo(-3.01, 1);
    expect(gain(20)).toBeCloseTo(-12.3, 0);
    const hp = createHighPass(48000);
    hp.process(1);
    let y = 1;
    for (let i = 0; i < 48000; i++) y = hp.process(0);
    expect(y).toBe(0);
    hp.reset();
    expect(hp.process(0)).toBe(0);
  });
});
