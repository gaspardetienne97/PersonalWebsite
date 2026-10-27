import { describe, expect, it } from "vitest";
import { CATALOG } from "../content/catalog";
import { ev, run, T0 } from "./fixtures";
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

  it("passes an each-step only when every value passes", () => {
    const shapeRun = (shape: string, day: number, i: number) => ({
      run: run({ id: `r${shape}${day}${i}`, exerciseId: build.exerciseIds![0], params: { shape } }),
      event: ev({
        id: `e${shape}${day}${i}`,
        runId: `r${shape}${day}${i}`,
        exerciseId: build.exerciseIds![0],
        skillIds: ["technique.guitar.chord-perfect"],
        modality: "played",
        instrument: "guitar",
        at: T0 + day * DAY_MS + i,
      }),
    });
    const two = ["guitar.a-major", "guitar.d-major"].flatMap((shape) =>
      [0, 0, 0, 1, 1].map((day, i) => shapeRun(shape, day, i)),
    );
    const status = (xs: typeof two) =>
      pathProgress(
        g,
        xs.map((x) => x.event),
        undefined,
        xs.map((x) => x.run),
      ).steps.find((s) => s.step.id === build.id)!;
    expect(status(two).status).not.toBe("done");
    expect(status(two).evidence.map((e) => e.done)).toEqual([true, true, false]);
    const all = [...two, ...[0, 0, 0, 1, 1].map((day, i) => shapeRun("guitar.e-major", day, i))];
    expect(status(all).status).toBe("done");
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
