import { describe, expect, it } from "vitest";
import { createHighPass, createInputFilter, type HighPass } from "./biquad";

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

describe("input filter: 60 Hz high-pass with 50 and 60 Hz notches", () => {
  const gain = (make: () => HighPass, hz: number) => {
    const f = make();
    let peak = 0;
    for (let i = 0; i < 96000; i++) {
      const y = f.process(Math.sin((2 * Math.PI * hz * i) / 48000));
      if (i > 72000) peak = Math.max(peak, Math.abs(y));
    }
    return 20 * Math.log10(peak);
  };
  const make = () => createInputFilter(48000);

  it("takes mains hum out and leaves the notes alone", () => {
    expect(gain(make, 50)).toBeLessThan(-40);
    expect(gain(make, 60)).toBeLessThan(-40);
    expect(gain(make, 20)).toBeLessThan(-18);
    // C2 loses a little of its fundamental; E2 and up pass.
    expect(gain(make, 65.41)).toBeGreaterThan(-6);
    expect(gain(make, 82.41)).toBeGreaterThan(-2);
    expect(gain(make, 110)).toBeGreaterThan(-1);
    expect(gain(make, 1000)).toBeGreaterThan(-0.1);
  });

  it("is self-contained, as the worklet needs: its own source runs on its own", () => {
    const standalone = new Function(`return (${createInputFilter.toString()})`)() as (
      sr?: number,
    ) => HighPass;
    expect(gain(() => standalone(48000), 60)).toBeLessThan(-40);
    expect(gain(() => standalone(48000), 110)).toBeGreaterThan(-1);
  });

  it("falls back to 48 kHz, removes DC and settles to nothing on silence", () => {
    for (const f of [createInputFilter(), createInputFilter(Number.NaN)]) {
      const buf = new Float32Array(24000).fill(0.5);
      f.processBlock(buf);
      expect(buf.every(Number.isFinite)).toBe(true);
      expect(Math.abs(buf[23999])).toBeLessThan(1e-3);
    }
    // The notches are resonators: the denormal flush keeps them ringing at
    // about 1e-18, far from a denormal, so silence settles there, not at 0.
    const f = make();
    f.process(1);
    let y = 1;
    for (let i = 0; i < 4 * 48000; i++) y = f.process(0);
    expect(Math.abs(y)).toBeLessThan(1e-15);
    f.reset();
    expect(f.process(0)).toBe(0);
  });
});
