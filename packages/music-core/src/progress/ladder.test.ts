import { describe, expect, it } from "vitest";
import type { RunRecord } from "../types";
import { run, T0 } from "./fixtures";
import { LADDER_TUNES, ladderEvidence, nextReview, tuneLadders, type Rung } from "./ladder";
import { DAY_MS } from "./mastery";
import { LEARNING_PATHS, pathProgress } from "./paths";

let n = 0;
const at = (day: number, over: Partial<RunRecord>) =>
  run({
    id: `r${++n}`,
    endedAt: T0 + day * DAY_MS,
    startedAt: T0 + day * DAY_MS - 60_000,
    ...over,
  });

/** Checked runs that climb a tune's ladder, at its shelf tempo. */
function climb(id: string, from = 0, rungs: Rung[] = ["a", "b", "c", "d", "e", "f"]): RunRecord[] {
  const out: RunRecord[] = [];
  const bpm = LADDER_TUNES.find((t) => t.id === id)!.bpm;
  const song = (day: number, extra = {}) =>
    at(day, {
      exerciseId: "song.studio",
      score: 0.95,
      params: { shelf: `jazz/${id}`, mode: "performance", bpm, ...extra },
    });
  if (rungs.includes("a")) out.push(song(from), song(from + 1));
  if (rungs.includes("b"))
    out.push(
      at(from, {
        exerciseId: "jam.improv",
        score: 0.95,
        params: { progression: `tune-${id}`, game: "guide-tones", choruses: 2, bpm: bpm * 0.8 },
      }),
    );
  if (rungs.includes("c"))
    out.push(
      at(from, {
        exerciseId: "technique.piano.lead-sheet",
        score: 0.92,
        params: { shelf: `jazz/${id}`, lh: "shells" },
      }),
    );
  if (rungs.includes("d"))
    out.push(
      at(from, {
        exerciseId: "technique.piano.comping-changes",
        score: 0.9,
        params: { progression: `tune-${id}`, voicing: "rootless" },
      }),
    );
  if (rungs.includes("e"))
    out.push(
      at(from, {
        exerciseId: "jam.improv",
        score: 1,
        correct: true,
        params: { progression: `tune-${id}`, game: "changes", choruses: 1, bpm },
      }),
    );
  if (rungs.includes("f"))
    out.push(
      song(from + 1, { transpose: -5, score: 0.9 }),
      at(from + 1, {
        exerciseId: "technique.piano.lead-sheet",
        score: 0.86,
        params: { shelf: `jazz/${id}`, lh: "shells", transpose: -5 },
      }),
    );
  return out;
}
const ladderOf = (runs: RunRecord[], id: string) =>
  tuneLadders(runs, T0 + 3 * DAY_MS).find((l) => l.tune.id === id)!;

describe("the tune ladder", () => {
  it("lists the jazz shelf and the tune player's tunes once each", () => {
    const ids = LADDER_TUNES.map((t) => t.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(LADDER_TUNES.find((t) => t.id === "autumn-leaves")).toMatchObject({
      bpm: 120,
      changes: true,
    });
    expect(LADDER_TUNES.find((t) => t.id === "misty")!.changes).toBe(false);
  });

  it("reads each rung from its own drill's checked runs", () => {
    const l = ladderOf(climb("autumn-leaves"), "autumn-leaves");
    expect(Object.values(l.rungs).every((r) => r.done)).toBe(true);
  });

  it("needs rung a on two days, at the shelf tempo, untransposed", () => {
    const one = climb("autumn-leaves", 0, ["a"]).slice(0, 1);
    expect(ladderOf(one, "autumn-leaves").rungs.a.done).toBe(false);
    const slow = climb("autumn-leaves", 0, ["a"]).map((r) => ({
      ...r,
      params: { ...r.params, bpm: 90 },
    }));
    expect(ladderOf(slow, "autumn-leaves").rungs.a.runs).toBe(0);
    const guided = climb("autumn-leaves", 0, ["a"]).map((r) => ({
      ...r,
      assistance: "guided" as const,
    }));
    expect(ladderOf(guided, "autumn-leaves").rungs.a.done).toBe(false);
  });

  it("does not count a solo that missed its aims, or comping with shells, as rungs e and d", () => {
    const runs = climb("autumn-leaves", 0, ["d", "e"]).map((r) => ({
      ...r,
      correct: false,
      params: { ...r.params, voicing: "shells" },
    }));
    const l = ladderOf(runs, "autumn-leaves");
    expect(l.rungs.e.done).toBe(false);
    expect(l.rungs.d.done).toBe(false);
  });

  it("puts a tune with rung a in the repertoire and brings it back for review", () => {
    const runs = climb("autumn-leaves", 0, ["a"]);
    const now = ladderOf(runs, "autumn-leaves");
    expect(now.review!.due).toBe(false);
    expect(now.review!.dueAt).toBeGreaterThan(T0 + DAY_MS);
    const later = tuneLadders(runs, T0 + 400 * DAY_MS).find((l) => l.tune.id === "autumn-leaves")!;
    expect(later.review!.due).toBe(true);
    expect(nextReview(tuneLadders(runs))!.tune.id).toBe("autumn-leaves");
    // No rung a, no repertoire.
    expect(ladderOf(climb("autumn-leaves", 0, ["d"]), "autumn-leaves").review).toBeUndefined();
  });
});

describe("ladder path steps", () => {
  it("judges rungs on a number of tunes", () => {
    const two = [...climb("autumn-leaves"), ...climb("blue-bossa", 0, ["a", "c", "d", "e"])];
    const rows = ladderEvidence({ rungs: ["a", "c", "d", "e"], tunes: 2 }, two);
    expect(rows.map((r) => r.done)).toEqual([true, true]);
    expect(
      ladderEvidence({ rungs: ["a", "b", "c", "d", "e", "f"], tunes: 2 }, two).map((r) => r.done),
    ).toEqual([true, false]);
    expect(ladderEvidence({ rungs: ["a"], tunes: 1, among: ["peace"] }, two)[0].done).toBe(false);
  });

  it("passes jazz 4.11 on the ladder", () => {
    const step = LEARNING_PATHS.jazz.steps.find((s) => s.id === "jazz.4.11")!;
    expect(step.kind).toBe("drill");
    const runs = [...climb("autumn-leaves"), ...climb("blue-bossa")];
    const st = (r: RunRecord[]) =>
      pathProgress(LEARNING_PATHS.jazz, [], undefined, r).steps.find(
        (s) => s.step.id === "jazz.4.11",
      )!.status;
    expect(st(runs)).toBe("done");
    expect(st(climb("autumn-leaves"))).not.toBe("done");
  });
});
