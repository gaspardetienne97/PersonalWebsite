import { describe, expect, it } from "vitest";
import { chordSymbol, mergePairRuns, shapesFor } from "./chords";

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
      "guitar.f-sharp-minor-barre": "Gbm",
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
