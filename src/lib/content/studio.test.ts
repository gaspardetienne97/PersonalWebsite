import { describe, expect, it } from "vitest";
import { STUDIO, STUDIO_KINDS, kindsByWork, newestByKind } from "./studio";

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
