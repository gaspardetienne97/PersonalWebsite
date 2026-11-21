import { describe, expect, it } from "vitest";
import { STUDIO, STUDIO_KINDS, kindsByWork, newestByKind, zoomSteps } from "./studio";

describe("kindsByWork", () => {
  const kinds = kindsByWork();

  it("keeps every kind, once", () => {
    expect(kinds.map((k) => k.kind).sort()).toEqual(STUDIO_KINDS.map((k) => k.kind).sort());
  });

  it("puts kinds that hold work before the empty ones, each group in the usual order", () => {
    const counts = kinds.map((k) => STUDIO[k.kind].length);
    const firstEmpty = counts.findIndex((n) => n === 0);
    if (firstEmpty !== -1) expect(counts.slice(firstEmpty).every((n) => n === 0)).toBe(true);
    const order = (list: typeof kinds) => list.map((k) => STUDIO_KINDS.indexOf(k));
    const split = firstEmpty === -1 ? kinds.length : firstEmpty;
    for (const group of [kinds.slice(0, split), kinds.slice(split)])
      expect(order(group)).toEqual([...order(group)].sort((a, b) => a - b));
  });
});

describe("newestByKind", () => {
  it("gives one piece for each kind that holds work, none older than its siblings", () => {
    const picks = newestByKind();
    expect(picks.map((p) => p.kind)).toEqual(
      kindsByWork()
        .filter((k) => STUDIO[k.kind].length > 0)
        .map((k) => k.kind),
    );
    for (const pick of picks)
      for (const other of STUDIO[pick.kind])
        expect(pick.media.year ?? 0).toBeGreaterThanOrEqual(other.media.year ?? 0);
  });
});

describe("zoomSteps", () => {
  it("offers twice and four times while four times stays near the picture's own pixels", () => {
    // A tall drawing fitted at 385px, its file 1600px wide: 4x is 1540px.
    expect(zoomSteps(385, 1600)).toEqual([2, 4]);
    // One and a half times its own pixels is the limit.
    expect(zoomSteps(600, 1600)).toEqual([2, 4]);
    expect(zoomSteps(601, 1600)).toEqual([2]);
  });

  it("always offers the first step, even for a picture already near its own size", () => {
    expect(zoomSteps(1000, 1600)).toEqual([2]);
    expect(zoomSteps(1500, 1600)).toEqual([2]);
  });
});
