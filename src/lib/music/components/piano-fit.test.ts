import { describe, expect, it } from "vitest";
import { isBlackKey } from "@repo/music-core";
import { fitRange } from "./Piano.svelte";

const whites = (r: { low: number; high: number }) =>
  Array.from({ length: r.high - r.low + 1 }, (_, i) => r.low + i).filter((m) => !isBlackKey(m))
    .length;

describe("Piano fit", () => {
  it("keeps the whole range when there is no room to spare", () => {
    const r = fitRange({ low: 60, high: 79 }, 48, 84, 0);
    expect(r).toEqual({ low: 60, high: 79 });
  });
  it("widens a range that starts or ends on a black key to whole white keys", () => {
    expect(fitRange({ low: 61, high: 70 }, 48, 84, 0)).toEqual({ low: 60, high: 71 });
  });
  it("adds keys round the range while the container has room, inside low and high", () => {
    const r = fitRange({ low: 60, high: 67 }, 48, 84, 12);
    expect(whites(r)).toBe(12);
    expect(r.low).toBeLessThan(60);
    expect(r.high).toBeGreaterThan(67);
    expect(isBlackKey(r.low) || isBlackKey(r.high)).toBe(false);
  });
  it("stops at the outer frame", () => {
    expect(fitRange({ low: 60, high: 67 }, 60, 72, 40)).toEqual({ low: 60, high: 72 });
  });
});
