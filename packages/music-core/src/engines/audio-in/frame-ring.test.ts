import { describe, expect, test } from "vitest";

import { FrameRing } from "./frame-ring";

describe("FrameRing", () => {
  test("returns the most recent samples in order", () => {
    const ring = new FrameRing(4);
    ring.push(new Float32Array([1, 2, 3]));
    expect(ring.size).toBe(3);
    expect([...ring.takeLast(2)]).toEqual([2, 3]);
  });

  test("overwrites oldest samples past capacity", () => {
    const ring = new FrameRing(4);
    ring.push(new Float32Array([1, 2, 3]));
    ring.push(new Float32Array([4, 5]));
    // capacity 4 keeps the last four: 2,3,4,5
    expect(ring.size).toBe(4);
    expect([...ring.takeLast(4)]).toEqual([2, 3, 4, 5]);
  });

  test("clamps takeLast to what is stored", () => {
    const ring = new FrameRing(8);
    ring.push(new Float32Array([7, 8, 9]));
    expect([...ring.takeLast(100)]).toEqual([7, 8, 9]);
  });
});
