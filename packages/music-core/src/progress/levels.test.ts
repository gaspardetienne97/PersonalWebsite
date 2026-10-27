import { describe, expect, it } from "vitest";
import { CATALOG } from "../content/catalog";
import { run, T0 } from "./fixtures";
import { SKILL_GRAPH } from "./graph";
import { exercisesForHref, knownRoute, shelfKey } from "./levels";
import { DAY_MS } from "./mastery";
import { LEARNING_PATHS, isGraded, pathProgress } from "./paths";

const levelled = Object.values(LEARNING_PATHS).filter((p) => p.levels);
const ROUTE = (href: string) => href.split(/[?#]/)[0];

describe("levelled path data", () => {
  it("has unique step ids, known drills and modes, real skills and real prerequisites", () => {
    const skills = new Set(SKILL_GRAPH.skills.map((s) => s.id));
    for (const p of levelled) {
      const ids = p.steps.map((s) => s.id);
      expect(new Set(ids).size, p.id).toBe(ids.length);
      for (const s of p.steps) {
        const where = `${s.id}: ${s.href}`;
        if (s.kind === "new") {
          expect(s.needs, where).toBeTruthy();
          continue;
        }
        if (!s.href) continue;
        expect(knownRoute(s.href), where).toBe(true);
        for (const l of s.links)
          if (l.href.startsWith("/")) expect(knownRoute(l.href), l.href).toBe(true);
        const entry = CATALOG.find((e) => ROUTE(e.route) === ROUTE(s.href));
        const mode = new URLSearchParams(s.href.split("?")[1] ?? "").get("mode");
        if (entry?.modes.length && mode && !s.href.startsWith("/music/rhythm"))
          expect(
            entry.modes.map((m) => m.id),
            where,
          ).toContain(mode);
        for (const id of s.skillIds) expect(skills.has(id), `${where} skill ${id}`).toBe(true);
        for (const r of s.requires) expect(ids, `${where} requires ${r}`).toContain(r);
        if (s.kind === "drill") expect(isGraded(s), where).toBe(true);
      }
    }
  });

  it("gives every level enough songs, each with a score or a fallback", () => {
    for (const p of levelled)
      for (const l of p.levels!) {
        const ids = l.shelf.map((s) => s.id);
        expect(new Set(ids).size, `${p.id} ${l.id}`).toBe(ids.length);
        expect(l.shelf.length, `${p.id} level ${l.id}`).toBeGreaterThanOrEqual(l.pick);
        for (const song of l.shelf) {
          expect(song.scores.length || song.fallback, song.id).toBeTruthy();
          for (const sc of song.scores)
            expect(sc.url, song.id).toMatch(/^https:\/\/musescore\.com\//);
        }
        expect(l.test, `${p.id} ${l.id}`).toBeTruthy();
      }
  });
});

describe("levelled progress", () => {
  it("derives a step's exercises from its link", () => {
    expect(exercisesForHref("/music/rhythm?mode=read-and-tap&pattern=guitar-old-faithful")).toEqual(
      ["rhythm.pattern.guitar-old-faithful"],
    );
    expect(exercisesForHref("/music/chords?mode=changes", ["ukulele"])).toEqual([
      "technique.guitar.chord-changes",
      "technique.ukulele.chord-changes",
    ]);
    expect(exercisesForHref("/music/nowhere")).toEqual([]);
  });

  const g = LEARNING_PATHS.guitar;
  const build = g.steps.find((s) => s.id === "guitar.1.2")!;

  it("judges a drill step on checked runs, each value on its own", () => {
    let n = 0;
    const shapeRun = (shape: string, day: number, over: Partial<ReturnType<typeof run>> = {}) =>
      run({
        id: `r${n++}`,
        exerciseId: build.exerciseIds![0],
        params: { shape },
        score: 0.95,
        endedAt: T0 + day * DAY_MS,
        ...over,
      });
    const status = (runs: ReturnType<typeof run>[]) =>
      pathProgress(g, [], undefined, runs).steps.find((s) => s.step.id === build.id)!;
    // Five clean runs over two days on A and D; nothing on E yet.
    const two = ["guitar.a-major", "guitar.d-major"].flatMap((shape) =>
      [0, 0, 0, 1, 1].map((day) => shapeRun(shape, day)),
    );
    expect(status(two).status).not.toBe("done");
    expect(status(two).evidence.map((e) => e.done)).toEqual([true, true, false]);
    const e = [0, 0, 0, 1, 1].map((day) => shapeRun("guitar.e-major", day));
    expect(status([...two, ...e]).status).toBe("done");
    // Practice runs (guided) and runs under the threshold do not pass it.
    const guided = e.map((r) => ({ ...r, id: `${r.id}g`, assistance: "guided" as const }));
    expect(status([...two, ...guided]).evidence[2].attempts).toBe(0);
    const weak = e.map((r) => ({ ...r, id: `${r.id}w`, score: 0.7 }));
    expect(status([...two, ...weak]).evidence[2].done).toBe(false);
  });

  it("counts a shelf song on two days of passing performances at tempo", () => {
    const level = g.levels![0];
    const song = level.shelf.find((s) => s.id === "three-little-birds")!;
    const perf = (day: number, over: Record<string, string | number> = {}, score = 0.9) =>
      run({
        id: `p${day}${JSON.stringify(over)}${score}`,
        exerciseId: "song.studio",
        params: { shelf: shelfKey("guitar", song), mode: "performance", bpm: 74, ...over },
        score,
        endedAt: T0 + day * DAY_MS,
      });
    const played = (runs: ReturnType<typeof run>[]) =>
      pathProgress(g, [], undefined, runs).levels![0].songs.find((s) => s.song.id === song.id)!;
    expect(played([perf(0)]).played).toBe(false);
    expect(played([perf(0), perf(1)]).played).toBe(true);
    // Too slow, in wait mode, or under 80% does not count.
    expect(played([perf(0), perf(1, { bpm: 60 })]).days).toBe(1);
    expect(played([perf(0), perf(1, { mode: "wait" })]).days).toBe(1);
    expect(played([perf(0), perf(1, {}, 0.7)]).days).toBe(1);
  });
});
