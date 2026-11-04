import {
  CIRCLE,
  FLAT_ORDER,
  SHARP_ORDER,
  accidentalCount,
  diatonicChords,
  keyAt,
  neighbour,
  noteAtFifths,
  opposite,
  wheelIndex,
} from "../theory/circle";
import { parseChordSymbol } from "../theory/chords";
import { analysisSheet } from "../content/analysis";
import { TUNES } from "../content/tunes";
import type { CircleMode } from "../content/circle";
import type { Lesson, LessonFigure, LessonSound, LessonStep } from "./types";

const sig = (
  fifths: number,
  reveal?: number,
  clef: "treble" | "bass" = "treble",
): LessonFigure => ({
  kind: "signature",
  clef,
  fifths,
  reveal,
});

/** The wheel with a key picked and some keys lit (marks are by wheel slot). */
const wheel = (selected: number | null, lit: number[] = []): LessonFigure => ({
  kind: "wheel",
  selected,
  marks: Object.fromEntries(lit.map((f) => [wheelIndex(f), "lit"])),
});

/** A chord symbol as midi notes in a middle register. */
const chordMidis = (symbol: string): number[] => {
  const c = parseChordSymbol(symbol.replace("°", "dim"))!;
  const root = 55 + ((((c.rootPc - 55) % 12) + 12) % 12);
  return c.intervals.map((i) => root + i);
};
/** Chords one after the other. */
const play = (...symbols: string[]): LessonSound => ({
  notes: symbols.map((s, i) => ({ midi: chordMidis(s), at: i * 1.3, dur: 1.2 })),
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
  const names = n === 2 ? first.join(" and ") : first.join(", ");
  const text = `${k.major} major has ${n} ${kind}s: ${names}.`;
  return { text, figure: sig(fifths, n) };
};

const ORDER: Lesson = {
  id: "circle.order",
  title: "The order of sharps and flats",
  screens: [
    {
      title: "The order of sharps",
      text: `Sharps always join a key signature in the same order: ${list(SHARP_ORDER)}. Remember it as Father Charles Goes Down And Ends Battle. Tap Next to add them one at a time.`,
      figure: sig(0, 0),
      steps: growing(SHARP_ORDER, 1, "#"),
    },
    {
      title: "Flats run backwards",
      text: `Flats use the same letters in reverse: ${list(FLAT_ORDER)}. Read the sharps sentence from the end and you have the flats. Tap Next to add them one at a time.`,
      figure: sig(0, 0),
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

const last = (a: readonly string[]) => a[a.length - 1];

const COUNT: Lesson = {
  id: "circle.count",
  title: "Counting sharps and flats",
  screens: [
    {
      title: "Round the wheel",
      text: "Start at C, which has no sharps or flats. Each step clockwise adds one sharp. Tap Next to walk round.",
      figure: wheel(0),
      steps: [1, 2, 3, 4].map((f) => ({
        text: `${keyAt(f).major} major has ${accidentalCount(f)}.`,
        figure: wheel(
          f,
          Array.from({ length: f + 1 }, (_, i) => i),
        ),
      })),
    },
    {
      title: "Naming a sharp key",
      text: "The major key is a half step above the last sharp. Find the last sharp in the signature, then go up one half step.",
      steps: [2, 3, 5].map((f) => {
        const k = keyAt(f);
        return {
          text: `${accidentalCount(f)}. The last is ${last(k.accidentals)}, a half step up is ${k.major}.`,
          figure: sig(f, f),
        };
      }),
    },
    {
      title: "Naming a flat key",
      text: "A flat key is named by the second-to-last flat. The exception is F, which has 1 flat and has to be learned.",
      steps: [-2, -3, -4, -1].map((f) => {
        const k = keyAt(f);
        return {
          text:
            f === -1
              ? `${k.major} major has 1 flat, ${k.accidentals[0]}. There is no second-to-last, so learn it.`
              : `${accidentalCount(f)}. The second-to-last is ${k.accidentals[-f - 2]}, so the key is ${k.major}.`,
          figure: sig(f, -f),
        };
      }),
    },
    {
      title: "The relative minor",
      text: "Every major key shares its signature with a minor key 3 half steps below its tonic. Count down 3 half steps from the major tonic.",
      steps: [0, 1, -1].map((f) => ({
        text: `${keyAt(f).major} major and ${keyAt(f).minor} minor share ${accidentalCount(f)}.`,
        figure: sig(f, Math.abs(f)),
      })),
    },
  ],
};

const SIGNATURE: Lesson = {
  id: "circle.signature",
  title: "Reading a key signature",
  screens: [
    {
      title: "Sharps and flats on the staff",
      text: "A key signature sits at the start of every line, after the clef. Count the sharps or flats and you know the key. Tap Next to see some.",
      figure: sig(0, 0),
      steps: [2, 4, -2, -3].map((f) => ({
        text: `${accidentalCount(f)}: ${keyAt(f).major} major.`,
        figure: sig(f, Math.abs(f)),
      })),
    },
    {
      title: "Bass clef",
      text: "The same signature is written on different lines in bass clef. The order of the sharps and flats stays the same.",
      steps: [3, -3].map((f) => ({
        text: `${keyAt(f).major} major on the bass staff: ${accidentalCount(f)}.`,
        figure: sig(f, Math.abs(f), "bass"),
      })),
    },
    {
      title: "From signature to key",
      text: "With sharps, the key is a half step above the last sharp. With flats, it is the second-to-last flat, and F has 1 flat.",
      steps: [4, -4].map((f) => {
        const k = keyAt(f);
        return {
          text:
            f > 0
              ? `${accidentalCount(f)}, the last is ${last(k.accidentals)}. A half step up gives ${k.major}.`
              : `${accidentalCount(f)}, the second-to-last is ${k.accidentals[-f - 2]}. That is ${k.major}.`,
          figure: sig(f, Math.abs(f)),
        };
      }),
    },
    {
      title: "Ready for the quiz",
      text: "You are shown a signature and asked for the key. Count first, then apply the rule for sharps or flats. Speed comes with practice.",
    },
  ],
};

const NEIGHBOURS: Lesson = {
  id: "circle.neighbours",
  title: "The keys next door",
  screens: [
    {
      title: "Clockwise",
      text: "One step clockwise is a fifth up and adds one sharp (or removes one flat). Tap Next to see three steps.",
      figure: wheel(0),
      steps: [0, 1, 2].map((f) => {
        const n = neighbour(f, 1);
        return {
          text: `${keyAt(f).major} to ${n.major}: a fifth up, ${accidentalCount(n.fifths)}.`,
          figure: wheel(n.fifths, [f]),
        };
      }),
    },
    {
      title: "Counter-clockwise",
      text: "One step counter-clockwise is a fourth up and adds one flat (or removes one sharp).",
      steps: [0, -1, 2].map((f) => {
        const n = neighbour(f, -1);
        return {
          text: `${keyAt(f).major} to ${n.major}: a fourth up, ${accidentalCount(n.fifths)}.`,
          figure: wheel(n.fifths, [f]),
        };
      }),
    },
    {
      title: "Relative minor and opposite",
      text: "The relative minor sits on the middle ring, 3 half steps below the major tonic. The key across the wheel is a tritone away.",
      steps: [
        {
          text: `${keyAt(0).major} major has ${keyAt(0).minor} minor as its relative.`,
          figure: wheel(0),
        },
        {
          text: `${keyAt(1).major} major has ${keyAt(1).minor} minor as its relative.`,
          figure: wheel(1),
        },
        {
          text: `Opposite ${keyAt(0).major} is ${opposite(0).major}, a tritone away.`,
          figure: wheel(0, [opposite(0).fifths]),
        },
        {
          text: `Opposite ${keyAt(1).major} is ${opposite(1).major}.`,
          figure: wheel(1, [opposite(1).fifths]),
        },
      ],
    },
  ],
};

const CHORDS: Lesson = {
  id: "circle.chords",
  title: "The chords of a key",
  screens: [
    {
      title: "One pattern in every major key",
      text: `The seven chords of a major key always run ${diatonicChords(0)
        .map((c) => c.numeral)
        .join(" ")}. In C they are ${diatonicChords(0)
        .map((c) => c.name)
        .join(", ")}. Tap Next to hear them.`,
      figure: wheel(0, [-1, 0, 1]),
      steps: diatonicChords(0).map((c) => ({
        text: `${c.numeral} is ${c.name}.`,
        sound: play(c.name),
      })),
    },
    {
      title: "The wedge on the wheel",
      text: "I, IV and V are the key and its two neighbours. The minor chords ii, iii and vi are the relative minors of IV, V and I.",
      figure: wheel(0, [-1, 0, 1]),
    },
    {
      title: "Any key, same shape",
      text: "Pick any key and the wedge moves with it. The chords change, the numerals do not.",
      steps: [1, -1, 2].map((f) => ({
        text: `In ${keyAt(f).major}: ${diatonicChords(f)
          .map((c) => c.name)
          .join(" ")}.`,
        figure: wheel(f, [f - 1, f, f + 1]),
      })),
    },
  ],
};

const WHEEL: Lesson = {
  id: "circle.wheel",
  title: "The wheel by heart",
  screens: [
    {
      title: "Clockwise from C",
      text: `Going clockwise from C the keys are ${CIRCLE.slice(1, 7)
        .map((k) => k.major)
        .join(" ")}. Each is a fifth above the last. Tap Next to walk round.`,
      figure: wheel(0),
      steps: CIRCLE.slice(1, 7).map((k, i) => ({
        text: `${k.major} is ${i + 1} step${i ? "s" : ""} clockwise from C.`,
        figure: wheel(
          k.fifths,
          Array.from({ length: i + 2 }, (_, j) => j),
        ),
      })),
    },
    {
      title: "The flat side",
      text: `On the other side the keys, read clockwise towards C, are ${CIRCLE.slice(7)
        .map((k) => k.major)
        .join(" ")}. Counter-clockwise from C they run F, Bb, Eb, Ab, Db.`,
      figure: wheel(0),
      steps: CIRCLE.slice(7)
        .reverse()
        .map((k, i) => ({
          text: `${k.major} is ${i + 1} step${i ? "s" : ""} counter-clockwise from C.`,
          figure: wheel(k.fifths),
        })),
    },
    {
      title: "Where the two sides meet",
      text: "At the bottom the sharp and flat names meet: B or Cb, F# or Gb, Db or C#. The wheel shows B, F# and Db.",
      figure: wheel(6),
    },
  ],
};

const BORROWED: Lesson = {
  id: "circle.borrowed",
  title: "Borrowed chords",
  screens: [
    {
      title: "The parallel minor",
      text: "A major key and the minor key on the same tonic are parallels, C major and C minor. The minor has three more flats. Borrowed chords come from it into the major key.",
      steps: [
        { text: `C major has ${accidentalCount(0)}.`, figure: sig(0, 0) },
        {
          text: `C minor has ${accidentalCount(-3)}: ${keyAt(-3).accidentals.join(", ")}.`,
          figure: sig(-3, 3),
        },
      ],
    },
    {
      title: "Four borrowed chords in C",
      text: "Tap each to hear the borrowed chord, then C. Each one takes a note from C minor.",
      options: [
        { label: `iv ${noteAtFifths(-1)}m`, chord: `${noteAtFifths(-1)}m` },
        { label: `bVI ${noteAtFifths(-4)}`, chord: noteAtFifths(-4) },
        { label: `bVII ${noteAtFifths(-2)}`, chord: noteAtFifths(-2) },
        { label: `bIII ${noteAtFifths(-3)}`, chord: noteAtFifths(-3) },
      ].map((o) => ({ label: o.label, sound: play(o.chord, "C") })),
    },
    {
      title: "Spotting them",
      text: "A borrowed chord holds a note outside the major scale. Look for a flat 3, flat 6 or flat 7 over the tonic.",
    },
  ],
};

/** The four secondary dominants in C: the dominant, its target. */
const SECONDARY_IN_C = [
  { name: "V/V", dom: `${noteAtFifths(2)}7`, target: noteAtFifths(1) },
  { name: "V/vi", dom: `${noteAtFifths(4)}7`, target: `${noteAtFifths(3)}m` },
  { name: "V/ii", dom: `${noteAtFifths(3)}7`, target: `${noteAtFifths(2)}m` },
  { name: "V/IV", dom: `${noteAtFifths(0)}7`, target: noteAtFifths(-1) },
];

const SECONDARY: Lesson = {
  id: "circle.secondary",
  title: "Secondary dominants",
  screens: [
    {
      title: "A dominant for any chord",
      text: "A secondary dominant is a dominant seventh a fifth above the chord it leads to. It is written V of, or V/ followed by the target.",
      steps: [
        {
          text: `G7 is the V of C, a fifth above C.`,
          figure: wheel(0, [1]),
          sound: play("G7", "C"),
        },
        {
          text: `${SECONDARY_IN_C[0].dom} is V/V: a fifth above G, leading to G.`,
          figure: wheel(1, [2]),
          sound: play(SECONDARY_IN_C[0].dom, SECONDARY_IN_C[0].target),
        },
      ],
    },
    {
      title: "Four in the key of C",
      text: "Tap each to hear the dominant resolve to its target.",
      options: SECONDARY_IN_C.map((s) => ({
        label: `${s.name} ${s.dom} to ${s.target}`,
        sound: play(s.dom, s.target),
      })),
    },
    {
      title: "Finding the dominant",
      text: "Name the target chord and go up a fifth. Make that a major chord with a flat seventh, even when the target is minor: E7 before Am, not Em7.",
      steps: SECONDARY_IN_C.slice(1).map((s) => ({
        text: `${s.name}: the target is ${s.target}, a fifth above is ${s.dom.slice(0, -1)}, so ${s.dom}.`,
      })),
    },
  ],
};

const ANALYSIS_TUNE = "tune-fly-me-to-the-moon";

/** Built on demand, so a change to the tune data cannot break the other circle lessons. */
function analysisLesson(): Lesson {
  const sheet = analysisSheet(TUNES.find((t) => t.id === ANALYSIS_TUNE)!);
  const chordStep = (i: number): LessonStep => {
    const c = sheet[i];
    const next = sheet[i + 1]?.symbol;
    return {
      text:
        c.fn === "V of"
          ? `${c.symbol} is V of ${next}, written V/vi.`
          : c.fn === "Related ii"
            ? `${c.symbol} is the related ii before ${next}.`
            : `${c.symbol} is ${c.fn} in ${c.key}.`,
      sound: play(c.symbol),
    };
  };
  return {
    id: "circle.analysis",
    title: "Analysing a tune",
    screens: [
      {
        title: "Key and function",
        text: "For each chord you name the key it belongs to and its job there, such as ii, V or I. Fly Me to the Moon is our example. It starts in C.",
        figure: wheel(0),
        steps: [0, 3, 4].map(chordStep),
      },
      {
        title: "ii, V, I",
        text: "A minor chord a fourth below a dominant is its ii, and the dominant resolves to the I.",
        steps: [1, 2, 3].map(chordStep),
      },
      {
        title: "V of",
        text: "A dominant that resolves to a chord that is not the home key's I is a secondary dominant, a V of. A minor chord before it is a related ii.",
        steps: [5, 6, 7].map(chordStep),
      },
      {
        title: "Tritone subs and backdoors",
        text: "A dominant a half step above the I it resolves to is a tritone sub, like Db7 to C. A dominant a whole step below is a backdoor, like Bb7 to C.",
      },
    ],
  };
}

export function circleLessons(mode: CircleMode): Lesson[] {
  switch (mode) {
    case "order":
      return [ORDER];
    case "count":
      return [COUNT];
    case "signature":
      return [COUNT, SIGNATURE];
    case "neighbours":
      return [NEIGHBOURS];
    case "chords":
      return [CHORDS];
    case "wheel":
      return [WHEEL];
    case "borrowed":
      return [BORROWED];
    case "secondary":
      return [SECONDARY];
    case "analysis":
      return [analysisLesson()];
  }
}
