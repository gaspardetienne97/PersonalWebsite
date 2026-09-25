// Note-reading flashcards: binary, enharmonic-tolerant, chords as sets.
import type { Metric } from "../types";
import { noteName, pcOf } from "../theory/notes";
import { type Graded, pcSet } from "./grade";

const sameSet = (a: readonly number[], b: readonly number[]) =>
  a.length === b.length && a.every((x, i) => x === b[i]);

/**
 * `answer` is either choice names joined with hyphens ("C#-E-G#", pitch classes
 * compared, so C# = Db) or the played MIDI notes (exact pitches: the staff names an octave).
 */
export function gradeFlashcard(
  expectedMidi: readonly number[],
  answer: string | readonly number[],
): Graded {
  let correct: boolean;
  let metrics: Metric[];
  if (typeof answer === "string") {
    const pcs = answer.split("-").map((n) => pcOf(n));
    correct = !pcs.includes(null) && sameSet(pcSet(pcs as number[]), pcSet(expectedMidi));
    metrics = [
      {
        kind: "choice",
        expected: expectedMidi.map((m) => noteName(m, "flat", false)).join("-"),
        actual: answer,
      },
    ];
  } else {
    const want = [...new Set(expectedMidi)].sort((a, b) => a - b);
    const got = [...new Set(answer)].sort((a, b) => a - b);
    correct = sameSet(want, got);
    metrics =
      want.length === 1
        ? [{ kind: "pitch", expectedMidi: want[0], actualMidi: got[0] }]
        : [
            {
              kind: "chord",
              expectedPcs: pcSet(want),
              actualPcs: pcSet(got),
              missing: pcSet(want.filter((m) => !got.includes(m))),
              extra: pcSet(got.filter((m) => !want.includes(m))),
            },
          ];
  }
  return { score: correct ? 1 : 0, correct, metrics, notMeasured: [] };
}
