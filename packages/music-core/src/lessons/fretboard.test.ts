import { describe, expect, it } from "vitest";
import { TUNINGS } from "../data";
import { lessonProblems } from "./check";
import { fretboardLessons } from "./fretboard";
import type { LessonFigure } from "./types";

const GUITAR = TUNINGS.guitar[0].openStrings;
const UKE = TUNINGS.ukulele[0].openStrings;
const marks = (f: LessonFigure | undefined) => (f?.kind === "fretboard" ? f.marks : []);

describe("fretboard lessons", () => {
  it("note lessons list the open strings from the tuning", () => {
    const [g] = fretboardLessons("note-finder", "guitar", GUITAR);
    const [u] = fretboardLessons("note-finder", "ukulele", UKE);
    expect(g.id).toBe("fretboard.notes.guitar");
    expect(u.id).toBe("fretboard.notes.ukulele");
    expect(g.screens[0].text).toContain("E A D G B E");
    expect(u.screens[0].text).toContain("G C E A");
    expect(u.screens[0].text).toContain("tuned high");
    for (const l of [g, u]) {
      expect(JSON.stringify(l)).toContain("not between B and C or between E and F");
      expect(lessonProblems(l)).toEqual([]);
    }
  });

  it("follows a non-standard tuning", () => {
    const [l] = fretboardLessons("note-finder", "guitar", [64, 59, 55, 50, 45, 38]); // drop D
    expect(l.screens[0].text).toContain("D A D G B E");
    expect(lessonProblems(l)).toEqual([]);
    const [iv] = fretboardLessons("interval-recall", "guitar", [64, 59, 55, 50, 45, 38]);
    const text = JSON.stringify(iv);
    expect(text).not.toContain("0 frets");
    const shift = iv.screens.find((s) => s.title === "The shift")!;
    expect(shift.text).toContain("D and A");
    expect(shift.text).toContain("G and B");
    expect(lessonProblems(iv)).toEqual([]);
    // each octave step names its own offset
    const oct = iv.screens.find((s) => s.title === "The octave")!;
    expect(oct.steps!.map((x) => x.text.split(": ")[1])).toEqual([
      "the same fret.",
      "2 frets higher.",
      "3 frets higher.",
      "3 frets higher.",
    ]);
  });

  it("every step on every curated tuning has both marks inside frets 0 to 5, and its text matches", () => {
    for (const [instrument, tunings] of [
      ["guitar", TUNINGS.guitar],
      ["ukulele", TUNINGS.ukulele],
    ] as const) {
      for (const t of tunings) {
        for (const mode of ["note-finder", "interval-recall"] as const) {
          const [l] = fretboardLessons(mode, instrument, t.openStrings);
          expect(lessonProblems(l), `${t.id} ${mode}`).toEqual([]);
          for (const sc of l.screens) {
            for (const f of [sc.figure, ...(sc.steps ?? []).map((x) => x.figure)]) {
              for (const m of marks(f)) {
                expect(m.fret, `${t.id} ${sc.title}`).toBeGreaterThanOrEqual(0);
                expect(m.fret, `${t.id} ${sc.title}`).toBeLessThanOrEqual(5);
              }
            }
            for (const st of sc.steps ?? [])
              expect(marks(st.figure), `${t.id} ${sc.title}`).toHaveLength(2);
          }
        }
      }
    }
  });

  it("guitar 5th is two frets up on strings 6 to 3, one more onto the B string", () => {
    const [l] = fretboardLessons("interval-recall", "guitar", GUITAR);
    expect(l.id).toBe("fretboard.intervals.guitar");
    const fifth = l.screens.find((s) => s.title === "The 5th")!;
    const spans = fifth.steps!.map((st) => {
      const [root, top] = marks(st.figure);
      return [root.string, top.string, top.fret - root.fret];
    });
    expect(spans).toEqual([
      [6, 5, 2],
      [5, 4, 2],
      [4, 3, 2],
      [3, 2, 3],
      [2, 1, 2],
    ]);
    expect(l.screens.find((s) => s.title === "The shift")!.text).toContain("G and B");
    expect(lessonProblems(l)).toEqual([]);
  });

  it("ukulele shape shift is between C and E, and the high G is left out", () => {
    const [l] = fretboardLessons("interval-recall", "ukulele", UKE);
    const fifth = l.screens.find((s) => s.title === "The 5th")!;
    expect(fifth.steps!.map((st) => marks(st.figure).map((m) => m.string))).toEqual([
      [3, 2],
      [2, 1],
    ]);
    expect(fifth.steps!.map((st) => marks(st.figure)[1].fret - 1)).toEqual([3, 2]);
    const third = l.screens.find((s) => s.title === "The 3rds")!;
    expect(marks(third.steps![0].figure).map((m) => [m.string, m.fret])).toEqual([
      [2, 2],
      [1, 1],
    ]);
    expect(l.screens.find((s) => s.title === "The shift")!.text).toContain("C and E");
    expect(JSON.stringify(l)).toContain("tuned high");
    expect(lessonProblems(l)).toEqual([]);
  });
});
