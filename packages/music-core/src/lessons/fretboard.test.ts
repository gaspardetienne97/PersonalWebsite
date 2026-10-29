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
    const shift = iv.screens.find((s) => s.title === "Irregular pairs")!;
    expect(shift.text).toContain("D string (string 6) to the A string");
    expect(shift.text).toContain("G string to the B string");
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

  const offset = (w: string) =>
    w === "the same fret" ? 0 : Number(w.split(" ")[0]) * (w.endsWith("lower") ? -1 : 1);
  const text2 = (t: number[], mode: "note-finder" | "interval-recall", title: string) =>
    fretboardLessons(mode, "guitar", t)[0].screens.find((s) => s.title === title)!.text;

  it("the fret rule names every exception pair, and the octave rule is the common one", () => {
    const notes = (t: number[]) => fretboardLessons("note-finder", "guitar", t)[0].screens;
    const text = (t: number[], title: string) => notes(t).find((s) => s.title === title)!.text;
    const dropD = [64, 59, 55, 50, 45, 38];
    const dadgad = [62, 57, 55, 50, 45, 38];
    const openG = [62, 59, 55, 50, 43, 38];
    expect(text(dropD, "Fret 5 is the next string")).toContain(
      "from the D string (string 6) to the A string it is fret 7 (past this figure)",
    );
    expect(text(dropD, "Fret 5 is the next string")).toContain("to the B string it is fret 4");
    expect(text(dadgad, "Fret 5 is the next string")).toContain("fret 7 (past this figure)");
    expect(text(dadgad, "Fret 5 is the next string")).toContain(
      "to the A string (string 2) it is fret 2",
    );
    expect(text(openG, "Fret 5 is the next string")).toContain(
      "from the G string (string 5) to the D string (string 4) it is fret 7",
    );
    const words = (t: string) =>
      [...t.matchAll(/it is (the same fret|\d+ frets? (?:higher|lower))/g)].map((m) =>
        offset(m[1]),
      );
    for (const t of [GUITAR, dropD, dadgad, openG]) {
      const steps = fretboardLessons("interval-recall", "guitar", t)[0].screens.find(
        (s) => s.title === "The octave",
      )!.steps!;
      // each step's words match the frets its marks show
      const shown = steps.map((st) => {
        const [r, top] = marks(st.figure);
        expect(offset(st.text.split(": ")[1].slice(0, -1)), st.text).toBe(top.fret - r.fret);
        return top.fret - r.fret;
      });
      // the screens name every pair that is not the regular 2 frets, each with its own offset
      const named = shown.filter((o) => o !== 2);
      expect(words(text2(t, "interval-recall", "The octave"))).toEqual(named);
      expect(words(text(t, "Octave shapes"))).toEqual(named);
      const octave = notes(t).find((s) => s.title === "Octave shapes")!;
      const [a, b] = marks(octave.figure);
      expect(a.label).toBe(b.label);
      expect(a.label).not.toBe("R");
      if (shown.includes(2))
        expect(b.fret - a.fret).toBe(2); // the figure shows a pair that follows the regular case
      else expect(text(t, "Octave shapes")).toContain("No pair of strings here follows");
    }
    expect(text(GUITAR, "Octave shapes")).toContain("is 2 frets higher");
    // the fret-5 rule skips the high G on the ukulele
    expect(
      fretboardLessons("note-finder", "ukulele", UKE)[0].screens.find(
        (s) => s.title === "Fret 5 is the next string",
      )!.text,
    ).toContain("tuned high and does not follow this");
    // the usual gap is not called "mostly" on open G
    expect(JSON.stringify(fretboardLessons("interval-recall", "guitar", openG))).not.toContain(
      "mostly",
    );
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
    expect(l.screens.find((s) => s.title === "Irregular pairs")!.text).toContain(
      "G string to the B string",
    );
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
    expect(l.screens.find((s) => s.title === "Irregular pairs")!.text).toContain(
      "C string to the E string",
    );
    expect(JSON.stringify(l)).toContain("tuned high");
    expect(lessonProblems(l)).toEqual([]);
  });
});
