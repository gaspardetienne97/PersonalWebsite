import { describe, expect, it } from "vite-plus/test";
import { createNoiseGate, levelAdvice, peakDb, rmsDb } from "./level";

describe("input level", () => {
  it("measures RMS and peak in dBFS with a -60 floor", () => {
    expect(rmsDb(new Float32Array(64).fill(0.5))).toBeCloseTo(-6.02, 2);
    expect(peakDb(Float32Array.from([0, -1, 0.25]))).toBe(0);
    expect(rmsDb(new Float32Array(64))).toBe(-60);
    expect(peakDb(new Float32Array(8).fill(1e-5))).toBe(-60);
  });

  it("gives the four pieces of advice at -1, -6 and -30 dB", () => {
    expect(levelAdvice(-1)).toEqual({ tone: "clipping", label: "Clipping" });
    expect(levelAdvice(-1.01).tone).toBe("hot");
    expect(levelAdvice(-6)).toEqual({ tone: "hot", label: "A little hot" });
    expect(levelAdvice(-6.01).tone).toBe("good");
    expect(levelAdvice(-30)).toEqual({ tone: "good", label: "Good level" });
    expect(levelAdvice(-30.01)).toEqual({ tone: "quiet", label: "Quiet" });
    expect(levelAdvice(-60).tone).toBe("quiet");
  });
});

describe("noise gate", () => {
  const db = (v: number) => 20 * Math.log10(v);
  const FRAME_MS = 43;

  it("sits 9 dB over the quietest frame, between -80 and -40 dBFS", () => {
    for (const [floor, want] of [
      [1e-3, -51], // a laptop microphone in a room
      [1e-5, -80], // a silent line input: held at -80
      [0.05, -40], // a very noisy input: held at -40
    ]) {
      const gate = createNoiseGate();
      let g = 0;
      for (let i = 0; i < 50; i++) g = gate.push(floor * (1 + 0.2 * Math.sin(i)), i * FRAME_MS);
      expect(db(g)).toBeGreaterThan(want - 2.5);
      expect(db(g)).toBeLessThanOrEqual(want + 0.01);
    }
  });

  it("stays on the room through playing, and forgets a floor it has not seen for 12 s", () => {
    const gate = createNoiseGate();
    let t = 0;
    let g = 0;
    for (let i = 0; i < 40; i++) g = gate.push(1e-3, (t += FRAME_MS)); // room
    const room = g;
    for (let i = 0; i < 120; i++) g = gate.push(0.1, (t += FRAME_MS)); // 5 s of playing
    expect(g).toBe(room);
    // Playing without a pause for longer than the horizon: the gate rises, but never over -40.
    for (let i = 0; i < 300; i++) g = gate.push(0.1, (t += FRAME_MS));
    expect(db(g)).toBeCloseTo(-40, 5);
    // The room again: the gate comes straight back down.
    g = gate.push(1e-3, (t += FRAME_MS));
    expect(g).toBe(room);
  });
});
