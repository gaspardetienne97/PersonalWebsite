import { describe, expect, it } from "vitest";
import { TUNINGS } from "@repo/music-core/data/index";
import { gradeChanges } from "@repo/music-core/scoring/technique";
import { PROGRESSIONS } from "@repo/music-core/content/jam";
import {
  chordId,
  chordLabel,
  chordRef,
  chordSymbol,
  groupChanges,
  groupedNotes,
  mergePairRuns,
  positionsOn,
  shapesFor,
  symbolRef,
  toneName,
} from "./chords";

describe("chord shapes", () => {
  it("names every curated shape by what it sounds", () => {
    const names = (i: "guitar" | "ukulele") =>
      Object.fromEntries(shapesFor(i).map((s) => [s.id, chordSymbol(s)]));
    expect(names("guitar")).toEqual({
      "guitar.c-major": "C",
      "guitar.g-major": "G",
      "guitar.d-major": "D",
      "guitar.e-minor": "Em",
      "guitar.a-minor": "Am",
      "guitar.e-major": "E",
      "guitar.a-major": "A",
      "guitar.d-minor": "Dm",
      "guitar.f-major": "F",
      "guitar.b7": "B7",
      "guitar.b-minor": "Bm",
      "guitar.g7": "G7",
      "guitar.f-barre": "F",
      "guitar.b-flat-barre": "Bb",
      "guitar.f-sharp-minor-barre": "F#m",
      "guitar.e5": "E5",
      "guitar.a5": "A5",
      "guitar.g5": "G5",
      "guitar.d5": "D5",
    });
    expect(names("ukulele")).toEqual({
      "ukulele.c-major": "C",
      "ukulele.f-major": "F",
      "ukulele.g-major": "G",
      "ukulele.a-minor": "Am",
      "ukulele.d-minor": "Dm",
      "ukulele.c7": "C7",
      "ukulele.g7": "G7",
      "ukulele.a-major": "A",
      "ukulele.d-major": "D",
      "ukulele.g-minor": "Gm",
      "ukulele.a7": "A7",
      "ukulele.e7": "E7",
    });
  });

  it("spells roots as guitarists do", () => {
    expect(chordLabel({ root: 6, quality: "m" })).toBe("F#m");
    expect(chordLabel({ root: 1, quality: "maj" })).toBe("Db");
    expect(chordLabel({ root: 8, quality: "m7" })).toBe("G#m7");
    expect(chordLabel({ root: 10, quality: "7" })).toBe("Bb7");
  });

  it("spells chord tones from the root", () => {
    expect(toneName(56, { root: 4, quality: "maj" })).toBe("G#3");
    expect(toneName(56, { root: 5, quality: "m" })).toBe("Ab3");
    expect(toneName(59, { root: 7, quality: "maj" }, false)).toBe("B");
    expect(toneName(69, { root: 0, quality: "dim7" }, false)).toBe("Bbb");
    expect(toneName(68, { root: 0, quality: "aug" })).toBe("G#4");
  });

  it("resolves root and quality to the curated shape, else a generated chord", () => {
    expect(chordId("guitar", { root: 0, quality: "maj" })).toBe("guitar.c-major");
    // The curated F comes first; the duplicate barre F is never offered.
    expect(chordId("guitar", { root: 5, quality: "maj" })).toBe("guitar.f-major");
    expect(chordId("guitar", { root: 4, quality: "5" })).toBe("guitar.e5");
    expect(chordId("guitar", { root: 11, quality: "m7" })).toBe("gen.guitar.11.m7");
    expect(chordRef("guitar.f-sharp-minor-barre")).toEqual({ root: 6, quality: "m" });
    expect(chordRef("gen.ukulele.10.maj@2")).toEqual({ root: 10, quality: "maj" });
  });

  it("keeps curated positions on their own tuning and voices the chord for any other", () => {
    const [standard, dropD] = TUNINGS.guitar;
    expect(positionsOn("guitar.c-major", standard)[0].id).toBe("guitar.c-major");
    const onDropD = positionsOn("guitar.c-major", dropD);
    expect(onDropD[0].tuningId).toBe("guitar.drop-d");
    expect(chordSymbol(onDropD[0], dropD)).toBe("C");
  });

  it("reads chart symbols the voicer can shape", () => {
    expect(symbolRef("Dm7")).toEqual({ root: 2, quality: "m7" });
    expect(symbolRef("Cmaj7")).toEqual({ root: 0, quality: "maj7" });
    expect(symbolRef("G")).toEqual({ root: 7, quality: "maj" });
    expect(symbolRef("G7alt")).toBeNull();
  });

  it("shapes every chart chord except the altered dominant", () => {
    const unshaped = PROGRESSIONS.flatMap((p) => p.chords.map((c) => c.symbol)).filter((sym) => {
      const ref = symbolRef(sym);
      return (
        !ref ||
        !positionsOn(chordId("ukulele", ref), TUNINGS.ukulele[0]).length ||
        !positionsOn(chordId("guitar", ref), TUNINGS.guitar[0]).length
      );
    });
    expect([...new Set(unshaped)]).toEqual(["G7alt"]);
  });

  it("counts a change only when the chord changes, not at every pause", () => {
    const C = [0, 4, 7];
    const G = [7, 11, 2];
    // C tapped string by string (a pause after each), strummed again, then G, then C.
    const notes = [
      { midi: 48, at: 0 },
      { midi: 52, at: 500 },
      { midi: 55, at: 1000 },
      { midi: 60, at: 1500 },
      ...[48, 52, 55].map((midi) => ({ midi, at: 2200 })),
      ...[43, 47, 50].map((midi) => ({ midi, at: 3000 })),
      ...[48, 52, 55].map((midi) => ({ midi, at: 4000 })),
    ];
    const groups = groupChanges(notes, [C, G]);
    expect(groups.map((g) => g.target)).toEqual([0, 1, 0]);
    const r = gradeChanges({
      from: { id: "c", pcs: C },
      to: { id: "g", pcs: G },
      tuningId: "guitar.standard",
      notes: groupedNotes(groups),
      durationMs: 4000,
    });
    expect(r.completed).toBe(2);
    expect(r.clean).toBe(2);
  });

  it("keeps the newest pair runs", () => {
    const run = (n: number) => ({ date: `d${n}`, perMinute: n, clean: n, completed: n });
    const merged = mergePairRuns(
      Array.from({ length: 30 }, (_, i) => run(i)),
      [run(99)],
    );
    expect(merged).toHaveLength(30);
    expect(merged.at(-1)!.perMinute).toBe(99);
    expect(merged[0].perMinute).toBe(1);
  });
});
