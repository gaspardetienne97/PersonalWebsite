import { describe, expect, it } from "vitest";
import { TUNINGS } from "../data";
import { noteName } from "../theory/notes";
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
      else
        expect(text(t, "Octave shapes")).toContain("No two strings two apart here have both gaps");
    }
    expect(text(GUITAR, "Octave shapes")).toContain("is 2 frets higher");
    // the fret-5 rule skips the high G on the ukulele
    expect(
      fretboardLessons("note-finder", "ukulele", UKE)[0].screens.find(
        (s) => s.title === "Fret 5 is the next string",
      )!.text,
    ).toContain("counting from the C string and skipping the high G string");
    // the usual gap is not called "mostly" on open G
    expect(JSON.stringify(fretboardLessons("interval-recall", "guitar", openG))).not.toContain(
      "mostly",
    );
  });

  it("every rule sentence holds on every curated tuning: unnamed pairs follow it, named pairs give their own offset", () => {
    const OFF = String.raw`the same fret|\d+ frets? (?:higher|lower)`;
    const LABEL = String.raw`[A-G]#? string(?: \(string \d\))?`;
    const HIGH = String.raw`(?:,? leaving out the high \w+ string,)?`;
    const num = (w: string) =>
      /^\d+$/.test(w) ? Number(w) : w.startsWith("fret ") ? Number(w.split(" ")[1]) : offset(w);
    for (const [instrument, tunings] of [
      ["guitar", TUNINGS.guitar],
      ["ukulele", TUNINGS.ukulele],
    ] as const) {
      for (const { id, openStrings: t } of tunings) {
        const nm = (s: number) => noteName(t[s - 1], "sharp", false);
        const label = (s: number) =>
          t.filter((_, i) => nm(i + 1) === nm(s)).length > 1
            ? `${nm(s)} string (string ${s})`
            : `${nm(s)} string`;
        // the strings that climb from string 1; a re-entrant string sits outside every rule
        const run = [1];
        for (let s = 2; s <= t.length && t[s - 1] < t[run[0] - 1]; s++) run.unshift(s);
        const next = run.slice(0, -1).map((lo, i) => [lo, run[i + 1]] as const);
        const two = run.slice(0, -2).map((lo, i) => [lo, run[i + 2]] as const);
        const span = ([lo, hi]: readonly [number, number]) => t[hi - 1] - t[lo - 1];
        const screen = (mode: "note-finder" | "interval-recall", title: string) =>
          fretboardLessons(mode, instrument, t)[0].screens.find((s) => s.title === title)!.text;
        const octave = new RegExp(`the octave two strings up${HIGH} is (${OFF})`);
        const rules = [
          [
            screen("note-finder", "Fret 5 is the next string"),
            /^Fret (\d+) on a string/,
            next,
            span,
          ],
          [
            screen("interval-recall", "The 4th"),
            new RegExp(`a 4th is the next string up${HIGH},? (${OFF})`),
            next,
            (p) => 5 - span(p),
          ],
          [
            screen("interval-recall", "The 5th"),
            new RegExp(`A 5th is 7 half steps: the next string up${HIGH},? (${OFF})`),
            next,
            (p) => 7 - span(p),
          ],
          [
            screen("interval-recall", "The 3rds"),
            new RegExp(`A major 3rd is 4 half steps: the next string up${HIGH},? (${OFF})`),
            next,
            (p) => 4 - span(p),
          ],
          [screen("interval-recall", "The octave"), octave, two, (p) => 12 - span(p)],
          [screen("note-finder", "Octave shapes"), octave, two, (p) => 12 - span(p)],
        ] as const satisfies readonly (readonly [
          string,
          RegExp,
          unknown,
          (p: readonly [number, number]) => number,
        ])[];
        for (const [text, usualRe, ps, value] of rules) {
          const named = new Map(
            [
              ...text.matchAll(
                new RegExp(`from the (${LABEL}) to the (${LABEL}) it is (fret \\d+|${OFF})`, "g"),
              ),
            ].map((m) => [`${m[1]} > ${m[2]}`, num(m[3])]),
          );
          const keys = ps.map(([lo, hi]) => `${label(lo)} > ${label(hi)}`);
          expect(
            [...named.keys()].filter((k) => !keys.includes(k)),
            `${id} stray pair: ${text}`,
          ).toEqual([]);
          const usual = text.match(usualRe);
          // a rule with no usual shape must say so and name every pair
          if (!usual) expect(text, id).toMatch(/No two strings two apart here/);
          ps.forEach((p, i) =>
            expect(
              named.get(keys[i]) ?? (usual && num(usual[1])),
              `${id} ${keys[i]}: ${text}`,
            ).toBe(value(p)),
          );
          if (run.length < t.length)
            expect(text, id).toMatch(/(?:leaving out|skipping) the high G string/);
        }
        // "no two strings two apart have both gaps of 5" is true
        const none = screen("interval-recall", "The octave").match(/have both gaps of (\d+) frets/);
        if (none)
          run.slice(0, -2).forEach((lo, i) => {
            const [a, b] = [span([lo, run[i + 1]]), span([run[i + 1], run[i + 2]])];
            expect(a === +none[1] && b === +none[1], id).toBe(false);
          });
        expect(screen("interval-recall", "The 3rds")).toContain(
          "A minor 3rd is 3 half steps, always one fret lower than the major 3rd.",
        );
      }
    }
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
