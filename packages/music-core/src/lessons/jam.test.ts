import { describe, expect, it } from "vitest";
import { TUNES } from "../content/tunes";
import { IMPROV_GAMES, gameOf, gradeImprov, guideTones, type ImprovNote } from "../scoring/improv";
import { lessonProblems } from "./check";
import {
  FULL_JAM_LESSONS,
  JAM_EXAMPLE,
  jamLessonGames,
  aimOf,
  approachLine,
  bridgeChanges,
  charlestonLine,
  displacementLine,
  filledHead,
  filledLine,
  guideLine,
  guideVoices,
  headOpening,
  jamGameLesson,
  offBeatLine,
  restingLine,
  setLine,
  thirdLine,
  windowLine,
  bridgeLine,
  quoteLine,
  slipLine,
  slipOf,
  slotsOf,
  toneLine,
} from "./jam";

const grade = (
  game: string,
  notes: ImprovNote[],
  more: Partial<Parameters<typeof gradeImprov>[2]> = {},
  p = JAM_EXAMPLE,
) =>
  gradeImprov(p, notes, {
    game: gameOf(game),
    choruses: 1,
    swing: true,
    bpm: 100,
    ...more,
  });
const text = (id: string) => JSON.stringify(jamGameLesson(id));

describe("Jam game lessons", () => {
  it("every game that grades a rule has one lesson, and only the open game has none", () => {
    for (const g of IMPROV_GAMES) {
      const ls = jamGameLesson(g.id);
      if (g.id === "free") expect(ls).toEqual([]);
      else {
        expect(ls.map((l) => l.id)).toEqual([`jam.${g.id}`]);
        expect(
          lessonProblems(ls[0], FULL_JAM_LESSONS.includes(g.id) ? "lesson" : "card"),
          g.id,
        ).toEqual([]);
      }
    }
    expect(jamLessonGames()).toHaveLength(IMPROV_GAMES.length - 1);
    expect(jamGameLesson("nope")).toEqual([]);
  });

  it("the guide-tones lesson moves the 3rd and 7th by step through the ii-V-I, from the chord code", () => {
    const v = guideVoices();
    expect(v.slice(0, 3).map((x) => x.a.tone.name)).toEqual(["F", "F", "E"]);
    expect(v.slice(0, 3).map((x) => x.b.tone.name)).toEqual(["C", "B", "B"]);
    for (const line of ["a", "b"] as const)
      for (let i = 1; i < 3; i++)
        expect(Math.abs(v[i][line].midi - v[i - 1][line].midi)).toBeLessThanOrEqual(1);
    const t = text("guide-tones");
    expect(t).toContain("F moves down a half step to E, now the 3rd");
    expect(t).toContain("C moves down a half step to B, now the 3rd");
    expect(t).toContain("F stays, now the 7th");
    expect(t).toContain(`${aimOf("guide-tones", "set") * 100}%`);
    expect(t).toContain(`${aimOf("guide-tones", "landings") * 100}%`);
  });

  it("states each game's aim from the game", () => {
    expect(text("changes")).toContain("75%");
    expect(text("changes")).toContain("70%");
    expect(text("bridge")).toContain("85%");
    expect(text("three-notes")).toContain("90%");
    expect(text("three-notes")).toContain("6 silences");
    expect(text("melody-fills")).toContain("90%");
    expect(text("displacement")).toContain(`${aimOf("displacement", "displaced")} displaced`);
    expect(text("side-slip")).toContain(`${aimOf("side-slip", "slips")} slips`);
  });

  it("names the sets from the key", () => {
    expect(text("three-notes")).toContain("C, Eb and G");
    expect(text("blues-scale")).toContain("C, Eb, F, Gb, G and Bb");
    expect(text("pentatonic-1")).toContain("C, Eb, F, G and Bb");
    expect(text("pentatonic-2")).toContain("D, F, G, A and C");
    expect(text("pentatonic-5")).toContain("G, Bb, C, D and F");
  });
});

describe("worked examples pass the game's own grader over the ii-V-I", () => {
  const passes = (game: string, notes: ImprovNote[], more = {}) => {
    const g = grade(game, notes, more);
    expect(g.passed, `${game}: ${g.headline}`).toBe(true);
  };

  it("the chord changes", () => {
    expect(slotsOf(JAM_EXAMPLE).every((s) => s.tones.length === 4)).toBe(true);
    for (const id of ["changes", "chord-tones"]) passes(id, toneLine());
  });

  it("guide tones and thirds", () => {
    const g = grade("guide-tones", guideLine());
    expect(g.choruses[0].measures.set!.value).toBe(1);
    expect(g.passed).toBe(true);
    passes("thirds", thirdLine());
  });

  it("the sets, with rests where the game wants them", () => {
    for (const id of ["blues-scale", "pentatonic-1", "pentatonic-2", "pentatonic-5"]) {
      const set = (gameOf(id).set as { key: number[] }).key;
      const g = grade(id, setLine(set));
      expect(g.choruses[0].measures.set!.value, id).toBe(1);
      expect(g.passed, id).toBe(true);
    }
    const three = (gameOf("three-notes").set as { key: number[] }).key;
    passes("three-notes", restingLine(three));
    expect(grade("three-notes", restingLine(three)).choruses[0].measures.rests!.value).toBe(8);
  });

  it("the Charleston motif", () => {
    const g = grade("motif", charlestonLine());
    expect(g.choruses[0].measures.motif!.value).toBe(1);
    expect(g.passed).toBe(true);
  });

  it("approach notes from a half step", () => passes("approach", approachLine()));

  it("starting off the beat", () => passes("off-beat", offBeatLine()));

  it("the space and answer games", () => {
    for (const id of ["space", "space-1", "call-response"]) {
      expect(windowLine(id).length, id).toBeGreaterThan(0);
      passes(id, windowLine(id));
    }
  });

  it("the bridge", () => {
    const tune = TUNES.find((p) => p.id === "tune-rhythm-changes")!;
    const changes = bridgeChanges(tune);
    expect(changes.map((c) => c.symbol)).toEqual(["D7", "G7", "C7", "F7"]);
    const line = bridgeLine(tune);
    const g = gradeImprov(tune, line, {
      game: gameOf("bridge"),
      choruses: 1,
      swing: true,
      bpm: 100,
    });
    expect(g.choruses[0].measures.landings!.value).toBe(1);
    expect(g.passed).toBe(true);
  });

  it("displacement", () => {
    const g = grade("displacement", displacementLine());
    expect(g.choruses[0].measures.displaced!.value).toBeGreaterThanOrEqual(
      aimOf("displacement", "displaced"),
    );
    expect(g.passed).toBe(true);
  });

  it("side-slips: each chord's slip has three outside notes and resolves", () => {
    for (const s of slotsOf(JAM_EXAMPLE))
      expect(slipOf(s).outside.length, s.symbol).toBeGreaterThanOrEqual(3);
    const g = grade("side-slip", slipLine());
    expect(g.choruses[0].measures.slips!.value).toBe(4);
    expect(g.passed).toBe(true);
  });

  it("quoting the head", () => {
    const g = grade("quote", quoteLine(), { head: headOpening() });
    expect(g.choruses[0].measures.quotes!.value).toBe(1);
    expect(g.passed).toBe(true);
  });

  it("melody and fills", () => {
    const g = grade("melody-fills", filledLine(), { head: filledHead() });
    expect(g.choruses[0].measures.fills!.value).toBe(8);
    expect(g.passed).toBe(true);
    // Without the fills the head alone fills no rest.
    const bare = grade(
      "melody-fills",
      filledLine().filter((n) => n.beat % 4 < 2),
      { head: filledHead() },
    );
    expect(bare.passed).toBe(false);
  });
});

describe("guideTones", () => {
  it("gives the 3rd and 7th, with the 6th standing in on a sixth chord", () => {
    expect(guideTones("G7")).toEqual({ third: 11, guide: [11, 5] });
    expect(guideTones("C6").guide).toEqual([4, 9]);
    expect(guideTones("Csus4").third).toBe(5);
  });
});
