import { describe, expect, it } from "vite-plus/test";
import { levelAdvice, peakDb, rmsDb } from "./level";

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
