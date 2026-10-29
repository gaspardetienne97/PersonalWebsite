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
  const fig = (marks: Mark[]): LessonFigure => ({
    kind: "fretboard",
    instrument,
    openStrings: open,
    marks: marks.filter((m) => m.fret >= 0 && m.fret <= 5), // the figure shows frets 0 to 5
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

  /** The note n half steps up from `fret` on string `lo`, found on the next string up. */
  const up = (p: (typeof pairs)[number], n: number, label: string, rootFret = ROOT): Mark[] => [
    { string: p.lo, fret: rootFret, label: "R" },
    { string: p.hi, fret: rootFret + n - p.gap, label },
  ];
  const pairSteps = (n: number, label: string, rootFret = ROOT): LessonStep[] =>
    pairs.map((p) => ({
      text: `From the ${name(p.lo)} string to the ${name(p.hi)}: ${rel(n - p.gap)}.`,
      figure: fig(up(p, n, label, rootFret)),
    }));

  const highG = reentrant.length
    ? ` The ${reentrant.map(name).join(" and ")} string is tuned high, above the string next to it, so it sits apart from the rest.`
    : "";
  const oct = pairs.length > 1 ? 12 - (pairs[0].gap + pairs[1].gap) : null;
  const octMarks = (a: number, b: number, root: number): Mark[] => [
    { string: run[a], fret: root, label: "R" },
    { string: run[b], fret: root + 12 - (open[run[b] - 1] - open[run[a] - 1]), label: "8" },
  ];

  if (mode === "note-finder") {
    const low = run[0];
    const naturals = [0, 1, 2, 3, 4, 5]
      .map((f) => ({ string: low, fret: f, label: nameOf(open[low - 1] + f) }))
      .filter((m) => !m.label.includes("#"));
    const matchSteps: LessonStep[] = pairs
      .filter((p) => p.gap <= 5)
      .map((p) => ({
        text: `Fret ${p.gap} on the ${name(p.lo)} string is the open ${name(p.hi)} string.`,
        figure: fig([
          { string: p.lo, fret: p.gap, label: name(p.hi) },
          { string: p.hi, fret: 0, label: name(p.hi) },
        ]),
      }));
    const exception = odd.length
      ? ` The exception is onto the ${odd.map((p) => name(p.hi)).join(" and ")} string, where it is fret ${odd.map((p) => p.gap).join(" and ")}.`
      : "";
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
            text: "The dots sit at frets 3, 5, 7, 9 and 12, with two dots at 12. They help you find your place. Fret 12 is the open string's note an octave higher.",
            figure: fig([]),
          },
          {
            title: "Fret 5 is the next string",
            text: `Fret ${common} on a string is the open note of the next string up.${exception} Tap Next to see each pair.`,
            figure: fig([]),
            steps: matchSteps,
          },
          ...(first && oct !== null && oct >= 0 && oct <= 5
            ? [
                {
                  title: "Octave shapes",
                  text: `An octave is 12 half steps, which is 12 frets on one string. Two strings up and ${rel(oct)} is the same note an octave higher.`,
                  figure: fig(octMarks(0, 2, 0).map((m) => ({ ...m, label: name(run[0]) }))),
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
          figure: fig(first ? up(first, 5, "4", ROOT) : []),
        },
        {
          title: "The 5th",
          text: `A 5th is 7 half steps: the next string up, ${rel(7 - common)}. Tap Next to see each pair of strings.`,
          figure: fig([]),
          steps: pairSteps(7, "5"),
        },
        {
          title: "The 3rds",
          text: `A major 3rd is 4 half steps: the next string up, ${rel(4 - common)}. A minor 3rd is 3 half steps, ${rel(3 - common)}.`,
          figure: fig([]),
          steps: first
            ? [
                { text: `Major 3rd: ${rel(4 - first.gap)}.`, figure: fig(up(first, 4, "3", 2)) },
                { text: `Minor 3rd: ${rel(3 - first.gap)}.`, figure: fig(up(first, 3, "m3", 2)) },
              ]
            : [],
        },
        ...(oct !== null && oct >= 0
          ? [
              {
                title: "The octave",
                text: `An octave is 12 half steps. Go two strings up and ${rel(oct)}. Tap Next to see each pair.`,
                figure: fig([]),
                steps: run.slice(0, -2).map((lo, i) => ({
                  text: `From the ${name(lo)} string to the ${name(run[i + 2])}.`,
                  figure: fig(octMarks(i, i + 2, ROOT)),
                })),
              },
            ]
          : []),
        ...(odd.length
          ? [
              {
                title: "The shift",
                text: `Between the ${name(odd[0].lo)} and ${name(odd[0].hi)} strings the gap is ${frets(odd[0].gap)}, not ${common}. A shape that crosses it moves ${rel(common - odd[0].gap)}. So the 5th from ${name(odd[0].lo)} is ${frets(7 - odd[0].gap)} up, not ${7 - common}.`,
                figure: fig(up(odd[0], 7, "5")),
              },
            ]
          : []),
      ],
    },
  ];
}
