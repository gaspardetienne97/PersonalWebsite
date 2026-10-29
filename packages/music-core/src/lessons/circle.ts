import { FLAT_ORDER, SHARP_ORDER, keyAt } from "../theory/circle";
import type { CircleMode } from "../content/circle";
import type { Lesson, LessonFigure, LessonStep } from "./types";

const sig = (fifths: number, reveal?: number): LessonFigure => ({
  kind: "signature",
  clef: "treble",
  fifths,
  reveal,
});
const list = (a: readonly string[]) => a.join(" ");

/** One step per accidental added, the staff growing with it. */
const growing = (order: readonly string[], sign: 1 | -1, mark: "#" | "b"): LessonStep[] =>
  order.map((l, i) => ({
    text:
      i === 0
        ? `${l}${mark} is the first.`
        : `${l}${mark} is next. The signature now has ${i + 1}.`,
    figure: sig(sign * (i + 1), i + 1),
  }));

const worked = (fifths: number): LessonStep => {
  const k = keyAt(fifths);
  const n = Math.abs(fifths);
  const kind = fifths > 0 ? "sharp" : "flat";
  const first = k.accidentals.slice(0, n);
  const text =
    fifths > 0
      ? `${k.major} major has ${n} ${kind}s: the first ${n}, ${first.join(" and ")}.`
      : `${k.major} major has ${n} ${kind}s: ${first.join(" and ")}.`;
  return { text, figure: sig(fifths, n) };
};

const ORDER: Lesson = {
  id: "circle.order",
  title: "The order of sharps and flats",
  screens: [
    {
      title: "The order of sharps",
      text: `Sharps always join a key signature in the same order: ${list(SHARP_ORDER)}. Remember it as Father Charles Goes Down And Ends Battle. Tap Next to add them one at a time.`,
      steps: growing(SHARP_ORDER, 1, "#"),
    },
    {
      title: "Flats run backwards",
      text: `Flats use the same letters in reverse: ${list(FLAT_ORDER)}. Read the sharps sentence from the end and you have the flats. Tap Next to add them one at a time.`,
      steps: growing(FLAT_ORDER, -1, "b"),
    },
    {
      title: "Counting a signature",
      text: "A key with N sharps uses the first N in the order. A key with N flats uses the first N flats.",
      steps: [worked(2), worked(3), worked(-2)],
    },
    {
      title: "Ready for the quiz",
      text: `Next you are asked for the sharps or flats of a key, in order: ${list(SHARP_ORDER)} for sharps, ${list(FLAT_ORDER)} for flats. Go as fast as you can stay right.`,
    },
  ],
};

export function circleLessons(mode: CircleMode): Lesson[] {
  return mode === "order" ? [ORDER] : [];
}
