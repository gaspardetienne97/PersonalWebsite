import { describe, expect, it } from "vitest";
import { FLAT_ORDER, SHARP_ORDER, diatonicChords } from "../theory/circle";
import { lessonProblems } from "./check";
import { circleLessons } from "./circle";
import { analysisSheet } from "../content/analysis";
import { TUNES } from "../content/tunes";

describe("circle lessons", () => {
  it("the order lesson shows the sharps and flats from the theory code", () => {
    const [l] = circleLessons("order");
    const text = JSON.stringify(l);
    expect(l.id).toBe("circle.order");
    expect(text).toContain(SHARP_ORDER.join(" "));
    expect(text).toContain(FLAT_ORDER.join(" "));
    expect(lessonProblems(l)).toEqual([]);
  });
});

describe("the other circle lessons", () => {
  const modes = [
    "count",
    "signature",
    "neighbours",
    "chords",
    "wheel",
    "borrowed",
    "secondary",
    "analysis",
  ] as const;
  it("every mode has lessons that pass the copy check", () => {
    for (const m of modes) {
      const ls = circleLessons(m);
      expect(ls.length, m).toBeGreaterThan(0);
      for (const l of ls) expect(lessonProblems(l), l.id).toEqual([]);
    }
  });
  it("ids, and signature shows count first", () => {
    expect(circleLessons("count").map((l) => l.id)).toEqual(["circle.count"]);
    expect(circleLessons("signature").map((l) => l.id)).toEqual([
      "circle.count",
      "circle.signature",
    ]);
    expect(circleLessons("analysis").map((l) => l.id)).toEqual(["circle.analysis"]);
  });
  it("states the facts from the theory code", () => {
    const j = (m: (typeof modes)[number]) => JSON.stringify(circleLessons(m));
    expect(j("count")).toContain("half step above the last sharp");
    expect(j("count")).toContain("D major has 2 sharps");
    expect(j("count")).toContain("second-to-last");
    expect(j("chords")).toContain(
      diatonicChords(0)
        .map((c) => c.numeral)
        .join(" "),
    );
    expect(j("wheel")).toContain("G D A E B F#");
    expect(j("wheel")).toContain("Db Ab Eb Bb F");
    expect(j("neighbours")).toContain("Opposite C is F#");
    for (const c of ["Fm", "Ab", "Bb", "Eb"]) expect(j("borrowed")).toContain(c);
    for (const c of ["D7", "E7", "A7", "C7"]) expect(j("secondary")).toContain(c);
    expect(j("analysis")).toContain("E7 is V of Am7");
  });
  it("borrowed and secondary options carry sounds", () => {
    for (const m of ["borrowed", "secondary"] as const)
      expect(
        circleLessons(m)[0].screens.some((s) =>
          s.options?.every((o) => o.sound.notes.length === 2),
        ),
      ).toBe(true);
  });
  it("the analysis lesson indexes the chords it names", () => {
    const sheet = analysisSheet(TUNES.find((t) => t.id === "tune-fly-me-to-the-moon")!);
    expect(sheet.slice(0, 8).map((c) => `${c.symbol} ${c.fn}`)).toEqual([
      "Am7 vi",
      "Dm7 ii",
      "G7 V",
      "Cmaj7 I",
      "Fmaj7 IV",
      "Bm7b5 Related ii",
      "E7 V of",
      "Am7 vi",
    ]);
  });
});
