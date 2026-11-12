// Concept cards for the Positions drill: the CAGED shapes, the pentatonic boxes, the connected run,
// the ukulele's positions, the triads and the B.B. box. Every fret and string is worked out with
// the drill's own `positionTargets` on the strip's tuning, so a retuned guitar gets true numbers.

import {
  POSITION_PATTERNS,
  positionRootFretMax,
  positionRootFretMin,
  positionTargets,
  type PositionPattern,
} from "../content/technique";
import { midiAt, tuningById, type Tuning } from "../theory/fretboard";
import { noteName, pc } from "../theory/notes";
import { join, plural, run, sharp, tones, type CardOpts } from "./card-kit";
import type { Lesson, LessonFigure, LessonStep } from "./types";

const STANDARD = tuningById("guitar.standard")!;
const HIGH_G = tuningById("ukulele.high-g")!;

const pattern = (id: string) => POSITION_PATTERNS.find((p) => p.id === id)!;

/** A shape placed as low on the neck as it fits, on a tuning. */
export function placed(id: string, tuning: Tuning) {
  const p = pattern(id);
  const lo = positionRootFretMin(p, tuning);
  const rootFret = Math.min(lo, positionRootFretMax(p, tuning));
  const targets = positionTargets({ patternId: id, tuning, rootFret });
  const rootString = p.rootString ?? (p.instrument === "ukulele" ? 1 : 6);
  const frets = targets.map((t) => t.fret);
  const used = targets.map((t) => t.string);
  return {
    p,
    rootFret,
    rootPc: pc(midiAt(tuning, rootString, rootFret)),
    targets: targets.map((t) => ({ ...t, midi: midiAt(tuning, t.string, t.fret) })),
    /** Lowest fret, from the root fret. */
    low: Math.min(...frets) - rootFret,
    firstString: Math.max(...used),
    lastString: Math.min(...used),
    /** Notes on each string, or null when the strings differ. */
    perString: (() => {
      const counts = [...new Set(used)].map((s) => used.filter((u) => u === s).length);
      return counts.every((c) => c === counts[0]) ? counts[0] : null;
    })(),
    stringCount: new Set(used).size,
  };
}
type Placed = ReturnType<typeof placed>;

const place = (off: number) =>
  off === 0
    ? "at the root fret"
    : off > 0
      ? `${plural(off, "fret")} above the root fret`
      : `${plural(-off, "fret")} below the root fret`;
/** A fret against the root fret, short: "on it", "2 above it", "2 below it". */
const against = (off: number) =>
  off === 0 ? "on it" : off > 0 ? `${off} above it` : `${-off} below it`;

const figure = (
  x: Placed,
  tuning: Tuning,
  label = (m: number) => sharp(m),
): LessonFigure | undefined => {
  const f = x.targets.map((t) => t.fret);
  const from = Math.min(...f);
  const to = Math.max(Math.max(...f), from + 4);
  if (to - from > 6) return undefined;
  return {
    kind: "fretboard",
    instrument: x.p.instrument ?? "guitar",
    openStrings: [...tuning.openStrings],
    from,
    to,
    marks: x.targets.map((t) => ({ string: t.string, fret: t.fret, label: label(t.midi) })),
  };
};
/** The notes low string to high, in the order the drill plays them. */
const lowToHigh = (x: Placed) =>
  [...x.targets].sort((a, b) => b.string - a.string || a.fret - b.fret).map((t) => t.midi);

const tuningText = (t: Tuning) =>
  t.id === STANDARD.id || t.id === HIGH_G.id ? "" : ` on ${t.name}`;

/** The CAGED forms, lowest on the neck first, with the letter from the data's id. */
export const cagedForms = (tuning: Tuning = STANDARD) =>
  POSITION_PATTERNS.filter((p) => p.family === "caged-major")
    .map((p) => ({ id: p.id, letter: p.id.split("-")[2].toUpperCase(), ...placed(p.id, tuning) }))
    .sort((a, b) => a.low - b.low);
/** The guitar's pentatonic boxes, lowest first. */
export const boxes = (tuning: Tuning = STANDARD) =>
  POSITION_PATTERNS.filter((p) => p.family === "minor-pentatonic" && !p.instrument)
    .map((p) => placed(p.id, tuning))
    .sort((a, b) => a.low - b.low);
export const ukulelePositions = (tuning: Tuning = HIGH_G) =>
  POSITION_PATTERNS.filter((p) => p.instrument === "ukulele")
    .map((p) => placed(p.id, tuning))
    .sort((a, b) => a.low - b.low);

/** The card a Positions setup gets, by the shape it is on; null for a shape with none. */
export function positionsCard(
  p: Pick<PositionPattern, "id" | "family" | "instrument">,
): string | null {
  if (p.instrument === "ukulele") return "positions.boxes-ukulele";
  switch (p.family) {
    case "caged-major":
      return "positions.caged";
    case "minor-pentatonic":
      return "positions.boxes";
    case "connected":
      return "positions.connected";
    case "triads":
      return `positions.${p.id}`;
    case "blues-box":
      return "positions.bb-box";
    default:
      return null;
  }
}

export function caged(o: CardOpts): Lesson {
  const t = o.tuning ?? STANDARD;
  const forms = cagedForms(t);
  const steps: LessonStep[] = forms.map((f) => ({
    text: `The ${f.letter} shape uses strings ${f.firstString} to ${f.lastString}, and its lowest fret is ${place(f.low)}.`,
    figure: figure(f, t),
    sound: run(lowToHigh(f), 0.25),
  }));
  return {
    id: "positions.caged",
    title: "The five CAGED shapes",
    screens: [
      {
        title: "Five shapes for one chord",
        text: `CAGED names five shapes for a major chord, after the open chords C, A, G, E and D. Each one plays the same chord, in five places along the neck. Tap Next for where each sits${tuningText(t)}, counted from the root fret on string 6.`,
        steps,
      },
      {
        title: "Find it in Check",
        text: "Check hides the notes of the shape. Know which shape it is, which strings it uses and where it sits. Then play it from its lowest string up.",
      },
    ],
  };
}

export function pentatonicBoxes(o: CardOpts): Lesson {
  const t = o.tuning ?? STANDARD;
  const bx = boxes(t);
  const b1 = bx[0];
  const perString = bx.every((b) => b.perString === bx[0].perString) ? bx[0].perString : null;
  return {
    id: "positions.boxes",
    title: "The five pentatonic boxes",
    screens: [
      {
        title: "A box is a hand position",
        text: `A box of the minor pentatonic is one hand position${perString ? ` with ${perString === 2 ? "two" : perString} notes on each of the ${b1.stringCount} strings` : ""}. Here is box 1${tuningText(t)}, as the drill places it at its lowest root fret. The drill plays a box from the low string to the high.`,
        figure: figure(b1, t),
        sound: run(lowToHigh(b1), 0.25),
      },
      {
        title: "Five boxes up the neck",
        text: `The five boxes climb the neck. Counted from the root fret on string 6${tuningText(t)}, the lowest fret of ${join(bx.map((b, i) => `box ${i + 1} is ${against(b.low)}`))}. In Check the notes stay hidden, so know where each box starts.`,
      },
    ],
  };
}

export function connectedBoxes(o: CardOpts): Lesson {
  const t = o.tuning ?? STANDARD;
  const bx = boxes(t);
  return {
    id: "positions.connected",
    title: "The boxes joined up the neck",
    screens: [
      {
        title: "One run through five boxes",
        text: "The connected run joins the five boxes into one line up the neck. It plays box 1 from the low string to the high, then box 2 from the high string back to the low. It carries on that way through box 5.",
        steps: bx.map((b, i) => ({
          text: `Box ${i + 1}: ${i % 2 ? "high string to low" : "low string to high"}, its lowest fret ${place(b.low)}.`,
        })),
      },
      {
        title: "Find it in Check",
        text: "Check hides the notes, so know the order of the boxes and which way each one runs.",
      },
    ],
  };
}

export function ukuleBoxes(o: CardOpts): Lesson {
  const t = o.tuning ?? HIGH_G;
  const ps = ukulelePositions(t);
  const perString = ps.every((b) => b.perString === ps[0].perString) ? ps[0].perString : null;
  return {
    id: "positions.boxes-ukulele",
    title: "The five ukulele positions",
    screens: [
      {
        title: "A position is a hand position",
        text: `A position of the minor pentatonic is one hand position${perString ? ` with ${perString === 2 ? "two" : perString} notes on each of the ${ps[0].stringCount} strings` : ""}. Here is position 1${tuningText(t)}, as the drill places it at its lowest root fret. The drill plays it from string ${ps[0].firstString} to string ${ps[0].lastString}.`,
        figure: figure(ps[0], t),
        sound: run(lowToHigh(ps[0]), 0.25),
      },
      {
        title: "Five positions up the neck",
        text: `The five positions climb the neck. Counted from the root fret on string 1${tuningText(t)}, the lowest fret of ${join(ps.map((b, i) => `position ${i + 1} is ${against(b.low)}`))}. In Check the notes stay hidden, so know where each position starts.`,
      },
    ],
  };
}

/** A note's role against the root, for the B.B. box. */
const DEGREE: Record<number, string> = {
  0: "root",
  2: "2nd",
  3: "flat 3rd",
  4: "3rd",
  5: "4th",
  6: "flat 5th",
  7: "5th",
  9: "6th",
  10: "flat 7th",
};
const role = (rootPc: number, midi: number) =>
  DEGREE[pc(midi - rootPc)] ?? noteName(midi, "sharp", false);

export function bbBox(o: CardOpts): Lesson {
  const t = o.tuning ?? STANDARD;
  const x = placed("bb-box", t);
  const own = x.targets.find((n) => role(x.rootPc, n.midi) === "root")!;
  const roles = [...x.targets].sort((a, b) => a.midi - b.midi).map((n) => role(x.rootPc, n.midi));
  return {
    id: "positions.bb-box",
    title: "The B.B. box",
    screens: [
      {
        title: "Six notes around the root",
        text: `This box is six notes around one root: the ${join(roles)}. The drill's root fret is the root note on string 6, and the box's own root is on string ${own.string}, ${place(own.fret - x.rootFret)}${tuningText(t)}. Tap Hear it for the box low string to high.`,
        figure: figure(x, t, (m) => role(x.rootPc, m)),
        sound: run(lowToHigh(x), 0.25),
      },
      {
        title: "Find it in Check",
        text: "Check hides the notes. Find the box's root, then find the other notes by their roles around it.",
      },
    ],
  };
}

export const triadIds = () =>
  POSITION_PATTERNS.filter((p) => p.family === "triads").map((p) => p.id);

export function triads(id: string, o: CardOpts): Lesson {
  const t = o.tuning ?? STANDARD;
  const x = placed(id, t);
  const minor = /minor/.test(id);
  const root = noteName(x.rootPc, "sharp", false);
  const parts = [0, 1, 2].map((k) => x.targets.slice(k * 3, k * 3 + 3));
  const lowest = (ns: (typeof parts)[number]) => [...ns].sort((a, b) => a.midi - b.midi);
  const inversion = (ns: (typeof parts)[number]) =>
    ({ 0: "root position", 3: "first inversion", 4: "first inversion", 7: "second inversion" })[
      pc(lowest(ns)[0].midi - x.rootPc)
    ] ?? "an inversion";
  const stringsOf = x.targets.map((n) => n.string);
  return {
    id: `positions.${id}`,
    title: minor ? "Minor triads up the neck" : "Major triads up the neck",
    screens: [
      {
        title: "Three inversions",
        text: `You can play a ${minor ? "minor" : "major"} triad in three inversions, each higher up the neck than the one before. The drill plays them on strings ${Math.max(...stringsOf)} to ${Math.min(...stringsOf)}. Tap Next for ${root} ${minor ? "minor" : "major"}${tuningText(t)} at its lowest root fret.`,
        steps: parts.map((ns) => {
          const ord = lowest(ns);
          return {
            text: `${inversion(ns)}: ${ord.map((n) => sharp(n.midi)).join(" ")}, frets ${ns.map((n) => n.fret).join(" ")}.`,
            figure: figure({ ...x, targets: ns }, t),
            sound: tones(ord.map((n) => n.midi)),
          };
        }),
      },
      {
        title: "Find it in Check",
        text: "Check hides the notes. Know the three inversions and where each sits, and play each from its lowest string up.",
      },
    ],
  };
}
