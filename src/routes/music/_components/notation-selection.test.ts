import { describe, expect, test } from "vitest";

import {
  nearestHit,
  overlayRects,
  rangeFromHits,
  type NotationHitTarget,
} from "./notation-selection";

describe("notation selection geometry", () => {
  test("finds the nearest target using point-to-rectangle distance", () => {
    const targets = [target("a", 0, 1, 0, 0, 10, 10), target("b", 1, 2, 20, 0, 30, 10)];

    expect(nearestHit({ x: 24, y: 5 }, targets)?.boundaryId).toBe("b");
    expect(nearestHit({ x: 14, y: 5 }, targets)?.boundaryId).toBe("a");
    expect(nearestHit({ x: 0, y: 0 }, [])).toBeUndefined();
  });

  test("normalizes forward and reverse selections into one half-open range", () => {
    const first = target("first", 0, 1, 0, 0, 10, 10);
    const last = target("last", 2, 3, 20, 0, 30, 10);

    expect(rangeFromHits(first, last)).toEqual({ startBeat: 0, endBeat: 3 });
    expect(rangeFromHits(last, first)).toEqual({ startBeat: 0, endBeat: 3 });
  });

  test("rejects a selection that begins and ends on the same boundary", () => {
    const first = target("first", 0, 1, 0, 0, 10, 10);

    expect(rangeFromHits(first, first)).toBeUndefined();
  });

  test("merges adjacent highlight rectangles on the same row", () => {
    const targets = [
      target("a", 0, 1, 0, 0, 10, 10),
      target("b", 1, 2, 10, 0, 20, 10),
      target("c", 2, 3, 0, 20, 10, 30),
    ];

    expect(overlayRects({ startBeat: 0, endBeat: 3 }, targets)).toEqual([
      { left: 0, top: 0, width: 20, height: 10 },
      { left: 0, top: 20, width: 10, height: 10 },
    ]);
  });

  test("includes only targets whose half-open beat range intersects the selection", () => {
    const targets = [
      target("a", 0, 1, 0, 0, 10, 10),
      target("b", 1, 2, 10, 0, 20, 10),
      target("c", 2, 3, 20, 0, 30, 10),
    ];

    expect(overlayRects({ startBeat: 1, endBeat: 2 }, targets)).toEqual([
      { left: 10, top: 0, width: 10, height: 10 },
    ]);
  });
});

function target(
  boundaryId: string,
  startBeat: number,
  endBeat: number,
  left: number,
  top: number,
  right: number,
  bottom: number,
): NotationHitTarget {
  return {
    boundaryId,
    beat: startBeat,
    startBeat,
    endBeat,
    rect: { left, top, right, bottom },
  };
}
