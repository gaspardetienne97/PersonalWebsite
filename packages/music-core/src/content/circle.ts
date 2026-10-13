// Circle-of-fifths drills: fast recall of key signatures, the order of
// sharps and flats, neighbours and a key's chords (the research's targets:
// recall under 2 s, a signature on the staff under 3 s, a key's chords
// under 5 s). Keys come in bands by accidental count, sharps and flats
// together; missed and slow keys are asked more.

import {
  CIRCLE,
  diatonicChords,
  FLAT_ORDER,
  keyAt,
  noteAtFifths,
  opposite,
  SHARP_ORDER,
  wheelIndex,
} from "../theory/circle";
import { pick, type Rand } from "./random";

export type CircleMode = "order" | "count" | "signature" | "neighbours" | "chords" | "wheel";

export const CIRCLE_MODES: {
  id: CircleMode;
  title: string;
  skillId: string;
  /** Answer within this to count as fluent. */
  targetMs: number;
}[] = [
  {
    id: "order",
    title: "Order of sharps and flats",
    skillId: "theory.circle.order",
    targetMs: 2000,
  },
  {
    id: "count",
    title: "Keys and their signatures",
    skillId: "theory.circle.count",
    targetMs: 2000,
  },
  {
    id: "signature",
    title: "Read the signature",
    skillId: "theory.circle.signature",
    targetMs: 3000,
  },
  {
    id: "neighbours",
    title: "Neighbours and relatives",
    skillId: "theory.circle.neighbours",
    targetMs: 2500,
  },
  { id: "chords", title: "A key's chords", skillId: "theory.circle.chords", targetMs: 5000 },
  { id: "wheel", title: "The blank wheel", skillId: "theory.circle.wheel", targetMs: 3000 },
];

/** Keys by how many sharps or flats, both sides at once, as graded syllabi introduce them. */
export const KEY_BANDS = [
  { id: "near", title: "C, G and F", max: 1 },
  { id: "two", title: "Up to 2 sharps or flats", max: 2 },
  { id: "four", title: "Up to 4", max: 4 },
  { id: "all", title: "All 15, enharmonics too", max: 7 },
] as const;
export type KeyBand = (typeof KEY_BANDS)[number]["id"];

export interface CirclePrompt {
  id: string;
  mode: CircleMode;
  ask: string;
  answer: string;
  choices: string[];
  skillIds: string[];
  /** The key the prompt is about (for weighting and for the wheel after the answer). */
  fifths: number;
  targetMs: number;
  /** Signature drills: the key signature to draw. */
  staff?: { fifths: number; clef: "treble" | "bass" };
}

export interface CircleSetup {
  mode: CircleMode;
  band: KeyBand;
  /** Ask minor keys too. */
  minor?: boolean;
  clefs?: ("treble" | "bass")[];
}

/** "3♯", "2♭", "0" */
export const countLabel = (fifths: number) =>
  fifths === 0 ? "0" : `${Math.abs(fifths)}${fifths > 0 ? "♯" : "♭"}`;
const ORDINAL = ["first", "second", "third", "fourth", "fifth", "sixth", "seventh"];
const ALPHA = ["C", "D", "E", "F", "G", "A", "B"];

const bandMax = (band: KeyBand) => KEY_BANDS.find((b) => b.id === band)?.max ?? 1;
const fifthsIn = (max: number) => Array.from({ length: 2 * max + 1 }, (_, i) => i - max);
const majorName = (f: number) => keyAt(f).major;
const minorName = (f: number) => `${keyAt(f).minor}m`;

/** One prompt; `weightOf(fifths)` (1 when missing) asks the weaker keys more. */
export function circlePrompt(
  rand: Rand,
  setup: CircleSetup,
  weightOf: (fifths: number) => number = () => 1,
): CirclePrompt {
  const meta = CIRCLE_MODES.find((m) => m.id === setup.mode)!;
  const max = bandMax(setup.band);
  const keys = fifthsIn(max);
  const weighted = (xs: number[]) => {
    let r = rand() * xs.reduce((t, x) => t + weightOf(x), 0);
    for (const x of xs) if ((r -= weightOf(x)) <= 0) return x;
    return xs[xs.length - 1];
  };
  const base = {
    mode: setup.mode,
    skillIds: ["theory.circle", meta.skillId],
    targetMs: meta.targetMs,
  };
  const minor = !!setup.minor && rand() < 0.5;
  const keyName = (f: number) => (minor ? minorName(f) : majorName(f));
  const keyChoices = keys.map(keyName);

  switch (setup.mode) {
    case "order": {
      // Every band uses all seven: the order is learned whole.
      const sharps = rand() < 0.5;
      const list = (sharps ? SHARP_ORDER : FLAT_ORDER).map((l) => l + (sharps ? "#" : "b"));
      const n = Math.floor(rand() * 7);
      const after = n < 6 && rand() < 0.5;
      const sign = sharps ? 1 : -1;
      return {
        ...base,
        id: `circle-order-${sharps ? "s" : "f"}${n}${after ? "a" : ""}`,
        ask: after
          ? `Which ${sharps ? "sharp" : "flat"} comes after ${list[n]}?`
          : `The ${ORDINAL[n]} ${sharps ? "sharp" : "flat"}?`,
        answer: after ? list[n + 1] : list[n],
        // In letter order, so the buttons never give the order away.
        choices: ALPHA.map((l) => l + (sharps ? "#" : "b")),
        fifths: sign * (after ? n + 2 : n + 1),
      };
    }
    case "count": {
      const f = weighted(keys);
      const toCount = rand() < 0.5;
      return {
        ...base,
        id: `circle-count-${toCount ? "k" : "c"}-${f}${minor ? "m" : ""}`,
        ask: toCount
          ? `How many sharps or flats in ${minor ? `${keyAt(f).minor} minor` : `${majorName(f)} major`}?`
          : `Which ${minor ? "minor" : "major"} key has ${f === 0 ? "no sharps or flats" : `${Math.abs(f)} ${f > 0 ? "sharp" : "flat"}${Math.abs(f) > 1 ? "s" : ""}`}?`,
        answer: toCount ? countLabel(f) : keyName(f),
        choices: toCount ? keys.map(countLabel) : keyChoices,
        fifths: f,
      };
    }
    case "signature": {
      const f = weighted(keys);
      const clefs = setup.clefs?.length ? setup.clefs : (["treble"] as const);
      return {
        ...base,
        id: `circle-signature-${f}${minor ? "m" : ""}`,
        ask: `Which ${minor ? "minor" : "major"} key is this signature?`,
        answer: keyName(f),
        choices: keyChoices,
        fifths: f,
        staff: { fifths: f, clef: pick(rand, clefs) },
      };
    }
    case "neighbours": {
      const kinds = ["sharper", "flatter", "relative", ...(max >= 4 ? (["across"] as const) : [])];
      const kind = pick(rand, kinds);
      // A neighbour can sit one step outside the band.
      const pool =
        kind === "sharper"
          ? keys.filter((f) => f < 7)
          : kind === "flatter"
            ? keys.filter((f) => f > -7)
            : keys;
      const f = weighted(pool);
      const wide = fifthsIn(Math.min(7, max + 1)).map(majorName);
      if (kind === "relative") {
        const fromMinor = rand() < 0.5;
        return {
          ...base,
          id: `circle-relative-${f}${fromMinor ? "m" : ""}`,
          ask: fromMinor
            ? `The relative major of ${keyAt(f).minor} minor?`
            : `The relative minor of ${majorName(f)} major?`,
          answer: fromMinor ? majorName(f) : minorName(f),
          choices: fromMinor ? keys.map(majorName) : keys.map(minorName),
          fifths: f,
        };
      }
      if (kind === "across") {
        const o = opposite(f);
        const names = CIRCLE.map((k) => k.major);
        return {
          ...base,
          id: `circle-across-${f}`,
          ask: `Across the circle from ${majorName(f)}? (Its dominant is the tritone substitute.)`,
          answer: o.major,
          choices: names,
          fifths: f,
        };
      }
      const step = kind === "sharper" ? 1 : -1;
      return {
        ...base,
        id: `circle-${kind}-${f}`,
        ask: `One more ${step > 0 ? "sharp" : "flat"} than ${majorName(f)} major?`,
        answer: majorName(f + step),
        choices: wide,
        fifths: f,
      };
    }
    case "chords": {
      const f = weighted(keys);
      const chords = diatonicChords(f);
      const c = pick(rand, chords);
      if (rand() < 0.5) {
        // Name the chord: the key's own chords, plus the same numeral in the keys either side.
        const others = [-1, 1].map(
          (d) => diatonicChords(f + d).find((x) => x.numeral === c.numeral)!.name,
        );
        const choices = [...new Set([...chords.map((x) => x.name), ...others])];
        return {
          ...base,
          id: `circle-chord-${f}-${c.numeral}`,
          ask: `The ${c.numeral} chord in ${majorName(f)} major?`,
          answer: c.name,
          choices,
          fifths: f,
        };
      }
      return {
        ...base,
        id: `circle-numeral-${f}-${c.numeral}`,
        ask: `Which chord of ${majorName(f)} major is ${c.name}?`,
        answer: c.numeral,
        choices: chords.map((x) => x.numeral),
        fifths: f,
      };
    }
    case "wheel": {
      const f = weighted(keys);
      // The wheel shows one spelling per slot; the outermost keys use their slot's.
      const slot = wheelIndex(f);
      return {
        ...base,
        id: `circle-wheel-${f}`,
        ask: `Tap where ${noteAtFifths(f)} major goes.`,
        answer: String(slot),
        choices: CIRCLE.map((_, i) => String(i)),
        fifths: f,
      };
    }
  }
}

/** Right within the target: full credit; right but slow: three quarters (still deriving it); wrong: none. */
export function gradeCircle(p: CirclePrompt, answered: string, ms: number) {
  const correct = answered === p.answer;
  const slow = correct && ms > p.targetMs;
  return { correct, slow, score: correct ? (slow ? 0.75 : 1) : 0 };
}
