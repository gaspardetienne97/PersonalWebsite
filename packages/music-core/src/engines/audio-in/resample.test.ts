import { describe, expect, test } from "vitest";

import { resampleLinear } from "./resample";

describe("resampleLinear", () => {
  test("returns a copy when the rate is unchanged", () => {
    const input = new Float32Array([0, 1, 2, 3]);
    const output = resampleLinear(input, 100, 100);
    expect([...output]).toEqual([0, 1, 2, 3]);
    expect(output).not.toBe(input);
  });

  test("halves the length when downsampling 2:1", () => {
    // 44.1k → 22.05k is exactly this ratio.
    const output = resampleLinear(new Float32Array([0, 2, 4, 6]), 4, 2);
    expect([...output]).toEqual([0, 4]);
  });

  test("linearly interpolates between samples when upsampling", () => {
    const output = resampleLinear(new Float32Array([0, 10]), 2, 3);
    expect(output.length).toBe(3);
    expect(output[0]).toBeCloseTo(0, 5);
    expect(output[1]).toBeCloseTo(6.6667, 3);
    expect(output[2]).toBeCloseTo(10, 5);
  });

  test("returns empty for empty input", () => {
    expect(resampleLinear(new Float32Array(), 44_100, 22_050).length).toBe(0);
  });
});
