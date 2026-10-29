import { noteName } from "../theory/notes";
import type { Lesson, LessonFigure, LessonStep } from "./types";

type Instrument = "guitar" | "ukulele";
type Mark = { string: number; fret: number; label: string };

const nameOf = (midi: number) => noteName(midi, "sharp", false);
const frets = (n: number) => `${n} ${n === 1 ? "fret" : "frets"}`;
/** A fret offset in words. */
const rel = (d: number) =>
  d === 0 ? "the same fret" : d > 0 ? `${frets(d)} higher` : `${frets(-d)} lower`;
const ROOT = 1;
/** "a", "a and b", "a, b and c". */
const list = (a: string[]) =>
  a.length < 2 ? a.join("") : `${a.slice(0, -1).join(", ")} and ${a[a.length - 1]}`;

/**
 * Lessons for the fretboard drills. Everything is worked out from the open strings
 * (string 1 = highest, as the data and Fretboard number them), so a custom tuning
 * still gets true examples.
 */
export function fretboardLessons(
  mode: "note-finder" | "interval-recall",
  instrument: Instrument,
  tuning: readonly number[],
): Lesson[] {
  const open = [...tuning];
  const name = (s: number) => nameOf(open[s - 1]);
  /** "E string", or "E string (string 6)" when another string has the same note name. */
  const sn = (s: number) =>
    open.filter((_, i) => name(i + 1) === name(s)).length > 1
      ? `${name(s)} string (string ${s})`
      : `${name(s)} string`;
  const fig = (marks: Mark[]): LessonFigure => ({
    kind: "fretboard",
    instrument,
    openStrings: open,
    marks, // callers keep every mark inside frets 0 to 5, the window the figure shows
  });

  // Strings that climb in pitch as the string number falls, ending at string 1.
  // A re-entrant string (ukulele high G) is not part of the run.
  const run = [1];
  for (let s = 2; s <= open.length && open[s - 1] < open[run[0] - 1]; s++) run.unshift(s);
  const reentrant = open.map((_, i) => i + 1).filter((s) => s > run[0]);
  const pairs = run
    .slice(0, -1)
    .map((lo, i) => ({ lo, hi: run[i + 1], gap: open[run[i + 1] - 1] - open[lo - 1] }));
  // ponytail: most neighbours are 5 apart; a tuning with none just takes its first gap.
  const common = pairs.some((p) => p.gap === 5) ? 5 : (pairs[0]?.gap ?? 5);
  const odd = pairs.filter((p) => p.gap !== common);
  const first = pairs.find((p) => p.gap === common) ?? pairs[0]; // the typical pair, for single examples

  /**
   * The root on string `lo` and the note n half steps up on string `hi`. The root starts at
   * `pref`, or the lowest fret that keeps both marks in the window; null when none does.
   */
  const upMarks = (
    lo: number,
    hi: number,
    n: number,
    label: string,
    pref = ROOT,
  ): Mark[] | null => {
    const off = n - (open[hi - 1] - open[lo - 1]);
    const root = [pref, 0, 1, 2, 3, 4, 5].find((r) => r <= 5 && r + off >= 0 && r + off <= 5);
    return root === undefined
      ? null
      : [
          { string: lo, fret: root, label: "R" },
          { string: hi, fret: root + off, label },
        ];
  };
  /** One step per pair of strings that fits the window, each with its own offset in words. */
  const stepsFor = (
    pairList: { lo: number; hi: number }[],
    n: number,
    label: string,
    text: (lo: string, hi: string, off: number) => string,
    pref = ROOT,
  ): LessonStep[] =>
    pairList.flatMap(({ lo, hi }) => {
      const m = upMarks(lo, hi, n, label, pref);
      const off = n - (open[hi - 1] - open[lo - 1]);
      return m ? [{ text: text(sn(lo), sn(hi), off), figure: fig(m) }] : [];
    });
  const fromTo = () => (lo: string, hi: string, off: number) =>
    `From the ${lo} to the ${hi}: ${rel(off)}.`;
  const skip2 = run.slice(0, -2).map((lo, i) => ({ lo, hi: run[i + 2] }));
  const octaveSteps = (pref: number) => stepsFor(skip2, 12, "8", fromTo(), pref);
  /** The offset most steps share (the first, on a tie), in words. */
  const commonOctave = (steps: LessonStep[]) => {
    const offs = steps.map((x) => x.text.split(": ")[1].slice(0, -1));
    return offs.sort(
      (a, b) => offs.filter((o) => o === b).length - offs.filter((o) => o === a).length,
    )[0];
  };
  /** Octave shapes change by a fret where they cross a shift, so say so when a step differs. */
  const octaveVaries = (steps: LessonStep[]) =>
    new Set(steps.map((x) => x.text.split(": ")[1])).size > 1;

  const highG = reentrant.length
    ? ` The ${reentrant.map(name).join(" and ")} string is tuned high, above the string next to it, so it sits apart from the rest.`
    : "";
  if (mode === "note-finder") {
    const low = run[0];
    const naturals = [0, 1, 2, 3, 4, 5]
      .map((f) => ({ string: low, fret: f, label: nameOf(open[low - 1] + f) }))
      .filter((m) => !m.label.includes("#"));
    const shown = pairs.filter((p) => p.gap <= 5); // a longer gap runs off the figure
    const matchSteps: LessonStep[] = shown.map((p) => ({
      text: `Fret ${p.gap} on the ${sn(p.lo)} is the open ${sn(p.hi)}.`,
      figure: fig([
        { string: p.lo, fret: p.gap, label: name(p.hi) },
        { string: p.hi, fret: 0, label: name(p.hi) },
      ]),
    }));
    const exception = odd.length
      ? ` Irregular ${odd.length > 1 ? "pairs" : "pair"}: ${odd.map((p) => `from the ${sn(p.lo)} to the ${sn(p.hi)} it is fret ${p.gap}${p.gap > 5 ? " (past this figure)" : ""}`).join("; ")}.`
      : "";
    // The octave rule most pairs share, shown on a pair that follows it.
    const ocPairs = skip2.map((q) => ({ ...q, off: 12 - (open[q.hi - 1] - open[q.lo - 1]) }));
    const ocMode = ocPairs
      .map((q) => q.off)
      .sort(
        (a, b) =>
          ocPairs.filter((q) => q.off === b).length - ocPairs.filter((q) => q.off === a).length,
      )[0];
    const ocPair = ocPairs.find((q) => q.off === ocMode);
    const oc =
      ocPair &&
      (upMarks(ocPair.lo, ocPair.hi, 12, name(ocPair.lo), 0)?.map((m) => ({
        ...m,
        label: name(ocPair.lo),
      })) ??
        null);
    return [
      {
        id: `fretboard.notes.${instrument}`,
        title: "Finding notes on the neck",
        screens: [
          {
            title: "The open strings",
            text: `The open strings are the notes you hear with no finger down. From string ${open.length} to string 1 they are ${[
              ...open,
            ]
              .reverse()
              .map((m) => nameOf(m))
              .join(" ")}.${highG}`,
            figure: fig(open.map((m, i) => ({ string: i + 1, fret: 0, label: nameOf(m) }))),
          },
          {
            title: "The natural notes",
            text: `The natural notes are A B C D E F G, then A again. There is a sharp between most of them, but not between B and C or between E and F. The ${name(low)} string below shows the naturals in its first five frets.`,
            figure: fig(naturals),
          },
          {
            title: "The fret markers",
            text:
              instrument === "guitar"
                ? "The figure shows the dots at frets 3 and 5. Higher up there are dots at 7 and 9, and two at 12. Fret 12 is the open string's note an octave higher."
                : "Ukuleles usually have dots at frets 5, 7, 10 and 12, with two at 12. They help you find your place. Fret 12 is the open string's note an octave higher.",
            ...(instrument === "guitar" ? { figure: fig([]) } : {}),
          },
          {
            title: "Fret 5 is the next string",
            text: `Fret ${common} on a string is the open note of the next string up.${exception} Tap Next to see each pair.`,
            figure: fig([]),
            steps: matchSteps,
          },
          ...(oc
            ? [
                {
                  title: "Octave shapes",
                  text: `An octave is 12 half steps, which is 12 frets on one string. Two strings up and ${rel(ocMode)} is the same note an octave higher.${ocPairs.some((q) => q.off !== ocMode) ? " The shape changes across an irregular pair." : ""}`,
                  figure: fig(oc),
                },
              ]
            : []),
        ],
      },
    ];
  }

  return [
    {
      id: `fretboard.intervals.${instrument}`,
      title: "Intervals as shapes",
      screens: [
        {
          title: "Half steps",
          text: "An interval is the distance between two notes, counted in half steps. One fret is one half step. A minor 3rd is 3, a major 3rd is 4, a 4th is 5, a 5th is 7 and an octave is 12.",
        },
        {
          title: "The 4th",
          text: `A 4th is 5 half steps, and neighbouring strings are mostly ${common} frets apart. So a 4th is the next string up, ${rel(5 - common)}.${highG}`,
          figure: fig((first && upMarks(first.lo, first.hi, 5, "4")) || []),
        },
        {
          title: "The 5th",
          text: `A 5th is 7 half steps: the next string up, ${rel(7 - common)}. Tap Next to see each pair of strings.`,
          figure: fig([]),
          steps: stepsFor(pairs, 7, "5", fromTo()),
        },
        {
          title: "The 3rds",
          text: `A major 3rd is 4 half steps: the next string up, ${rel(4 - common)}. A minor 3rd is 3 half steps, ${rel(3 - common)}.`,
          figure: fig([]),
          steps: first
            ? [
                {
                  text: `Major 3rd: ${rel(4 - first.gap)}.`,
                  figure: fig(upMarks(first.lo, first.hi, 4, "3", 2) ?? []),
                },
                {
                  text: `Minor 3rd: ${rel(3 - first.gap)}.`,
                  figure: fig(upMarks(first.lo, first.hi, 3, "m3", 2) ?? []),
                },
              ]
            : [],
        },
        ...(octaveSteps(ROOT).length
          ? [
              {
                title: "The octave",
                text: `An octave is 12 half steps, so go two strings up and ${commonOctave(octaveSteps(ROOT))}.${octaveVaries(octaveSteps(ROOT)) ? " The shape changes across an irregular pair." : ""} Tap Next to see each pair.`,
                figure: fig([]),
                steps: octaveSteps(ROOT),
              },
            ]
          : []),
        ...(odd.length
          ? [
              {
                title: "Irregular pairs",
                text: `The irregular ${odd.length > 1 ? "pairs have gaps" : "pair has a gap"} of ${list(odd.map((p) => `${frets(p.gap)} from the ${sn(p.lo)} to the ${sn(p.hi)}`))} instead of ${common}. A shape that crosses a smaller gap moves higher and a larger gap lower, by the difference. Tap Next to see the 5th across ${odd.length > 1 ? "each" : "it"}.`,
                figure: fig([]),
                steps: stepsFor(odd, 7, "5", fromTo()),
              },
            ]
          : []),
      ],
    },
  ];
}
