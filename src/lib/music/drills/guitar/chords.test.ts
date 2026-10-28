import { describe, expect, it } from "vitest";
import { TUNINGS } from "@repo/music-core/data/index";
import { gradeChanges } from "@repo/music-core/scoring/technique";
import { PROGRESSIONS } from "@repo/music-core/content/jam";
import {
  cycleRefs,
  chordId,
  chordLabel,
  chordRef,
  chordSymbol,
  groupChanges,
  groupedNotes,
  hardestPairs,
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

describe("hardest five", () => {
  const run = (perMinute: number) => ({ date: "2026-10-27", perMinute, clean: 1, completed: 1 });
  it("picks the instrument's five slowest pairs by their last three runs", () => {
    const history = {
      "guitar.c-major>guitar.g-major": [run(5), run(40), run(42), run(44)],
      "guitar.g-major>guitar.d-major": [run(12), run(14)],
      "guitar.c-major>guitar.a-minor": [run(20)],
      "guitar.g-major>guitar.e-minor": [run(25)],
      "guitar.c-major>guitar.d-major": [run(18)],
      "gen.guitar.5.maj@1>guitar.c-major": [run(10)],
      // Not pairs of this instrument, or not pairs at all.
      "ukulele.c-major>ukulele.g-major": [run(1)],
      "guitar.c-major>guitar.g-major>guitar.a-minor": [run(2)],
    };
    const five = hardestPairs(history, "guitar");
    expect(five.map((h) => [h.key, h.perMinute])).toEqual([
      ["gen.guitar.5.maj@1>guitar.c-major", 10],
      ["guitar.g-major>guitar.d-major", 13],
      ["guitar.c-major>guitar.d-major", 18],
      ["guitar.c-major>guitar.a-minor", 20],
      ["guitar.g-major>guitar.e-minor", 25],
    ]);
    // The old slow run of C to G no longer counts: its last three average 42.
    expect(five[0]).toMatchObject({ chords: "gen.guitar.5.maj,guitar.c-major", positions: "1," });
    expect(hardestPairs(history, "ukulele").map((h) => h.key)).toEqual([
      "ukulele.c-major>ukulele.g-major",
    ]);
  });
});

describe("chord cycle", () => {
  it("keeps one chord at different positions (CAGED forms) and drops a true repeat", () => {
    const five = Array(5).fill("guitar.c-major").join(",");
    expect(cycleRefs("guitar", five, 8, "0,1,2,3,4")).toHaveLength(5);
    expect(
      cycleRefs("guitar", "guitar.c-major,guitar.c-major,guitar.g-major", 8, "0,0,0"),
    ).toHaveLength(2);
    // Without positions a repeated chord is still one chord, and a cycle needs two.
    expect(cycleRefs("guitar", "guitar.c-major,guitar.c-major")).toHaveLength(2);
  });
});

describe("guitar shells", () => {
  const std = TUNINGS.guitar[0];
  it("1-3-7 and 1-7-3 with the root on strings 6 and 5", () => {
    const g7 = positionsOn(chordId("guitar", { root: 7, quality: "7", shell: true }), std);
    expect(g7.map((p) => p.positionLabel)).toEqual([
      "1-3-7, root on 6",
      "1-7-3, root on 6",
      "1-3-7, root on 5",
      "1-7-3, root on 5",
    ]);
    // Strings 1 to 6: G7 as 3 2 3 on strings 6 5 4, and 3 x 3 4 on 6 4 3.
    expect(g7[0].frets).toEqual([null, null, null, 3, 2, 3]);
    expect(g7[0].fingers).toEqual([null, null, null, 3, 1, 2]);
    expect(g7[1].frets).toEqual([null, null, 4, 3, null, 3]);
    // Root on 5: G7 at the 10th fret.
    expect(g7[2].frets).toEqual([null, null, 10, 9, 10, null]);
    const cmaj7 = positionsOn("shell.guitar.0.maj7", std);
    expect(cmaj7[2].frets).toEqual([null, null, 4, 2, 3, null]);
    expect(cmaj7[3].frets).toEqual([null, 5, 4, null, 3, null]);
    const dm7 = positionsOn("shell.guitar.2.m7", std);
    expect(dm7[2].frets).toEqual([null, null, 5, 3, 5, null]);
    // Every note a chord tone, no 5th, and a finger that reaches.
    for (const q of ["maj7", "m7", "7"])
      for (let r = 0; r < 12; r++)
        for (const p of positionsOn(`shell.guitar.${r}.${q}`, std)) {
          const low = Math.min(...p.frets.filter((f): f is number => !!f));
          p.frets.forEach((f, i) => {
            if (f && p.fingers[i]) expect(f - low, p.id).toBeLessThanOrEqual(p.fingers[i]!);
          });
          expect(p.frets.filter((f) => f !== null)).toHaveLength(3);
        }
  });
  it("a shell id names its chord and keeps the shell; the ukulele and other qualities get the full chord", () => {
    expect(chordRef("shell.guitar.7.7@2")).toEqual({ root: 7, quality: "7", shell: true });
    expect(chordLabel(chordRef("shell.guitar.7.7")!)).toBe("G7");
    expect(chordId("guitar", { root: 7, quality: "maj", shell: true })).toBe("guitar.g-major");
    expect(chordId("ukulele", { root: 7, quality: "7", shell: true })).toBe("ukulele.g7");
    expect(
      cycleRefs("guitar", "shell.guitar.2.m7,shell.guitar.7.7").map((r) => chordId("guitar", r)),
    ).toEqual(["shell.guitar.2.m7", "shell.guitar.7.7"]);
  });
});
