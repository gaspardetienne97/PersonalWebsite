// Technique targets: scale drill, spider, positions, note finder, interval recall,
// chord-perfect and chord changes.

import {
  CHORD_SHAPES,
  FRETBOARD_PATTERNS,
  SCALE_DATA,
  SKILL_IDS,
  STRING_SPIDER,
  type ChordShape,
  type FretboardPatternDef,
  type SpiderSpanId,
  type Tuning,
} from "../data";
import { noteName, pc } from "../theory/notes";
import {
  scaleLine,
  type ScaleHands,
  type ScaleKind,
  type ScaleMotion,
  type ScaleSpan,
} from "../theory/scales";
import {
  midiAt,
  pcPositions,
  positionsOf,
  shapeNotes,
  tuningById,
  type FretPosition,
} from "../theory/fretboard";
import { pick, type Rand } from "./random";

// ---------------------------------------------------------------------------
// Scales

export const SCALE_TEMPO = { min: 40, max: 180, default: 100 };

/**
 * What the drill plays: the scale, in double thirds or in octaves in each hand,
 * or the tonic chord as an arpeggio, broken through its inversions, or blocked.
 */
export type ScalePattern =
  | "scale"
  | "thirds"
  | "octaves"
  | "arpeggio"
  | "broken"
  | "blocked"
  | "triad-pairs";
export const SCALE_PATTERNS: { id: ScalePattern; label: string; hint?: string }[] = [
  { id: "scale", label: "Scale" },
  { id: "thirds", label: "Double thirds", hint: "The scale in thirds in one hand" },
  { id: "octaves", label: "Octaves", hint: "The scale in octaves in each hand" },
  { id: "arpeggio", label: "Arpeggio" },
  { id: "broken", label: "Broken", hint: "Broken chords through the inversions" },
  { id: "blocked", label: "Blocked", hint: "Blocked chords through the inversions" },
  {
    id: "triad-pairs",
    label: "Triad pairs",
    hint: "The tonic's triad, then the one a whole step up, in turn",
  },
];
/** Scale-like patterns walk the scale's degrees; the others walk the chord. */
export const isScaleLine = (p: ScalePattern) => p === "scale" || p === "thirds" || p === "octaves";
/** The scale drill's kinds: the scale data's, plus the chromatic scale. */
export type DrillScaleKind = ScaleKind | "chromatic";
/** How two hands sit: an octave apart, in contrary motion from the tonic, a third or a sixth apart. */
export type HandsApart = "octave" | "contrary" | "third" | "sixth";
export const HANDS_APART: { id: HandsApart; label: string; hint: string }[] = [
  {
    id: "octave",
    label: "An octave apart",
    hint: "Similar motion, the left hand an octave below.",
  },
  {
    id: "contrary",
    label: "Contrary motion",
    hint: "Both hands start on the tonic and move apart, then back.",
  },
  {
    id: "third",
    label: "A third apart",
    hint: "The left hand on the tonic, the right hand from the 3rd above.",
  },
  {
    id: "sixth",
    label: "A sixth apart",
    hint: "The right hand on the tonic, the left hand from the 3rd below.",
  },
];
export type ChordKind = "major" | "minor" | "dominant-7" | "diminished-7";
export const CHORD_KINDS: { id: ChordKind; label: string; intervals: number[] }[] = [
  { id: "major", label: "Major", intervals: [0, 4, 7] },
  { id: "minor", label: "Minor", intervals: [0, 3, 7] },
  { id: "dominant-7", label: "Dominant 7th", intervals: [0, 4, 7, 10] },
  { id: "diminished-7", label: "Diminished 7th", intervals: [0, 3, 6, 9] },
];

/**
 * ABRSM 2025-26 piano speeds ("a general guide", spec p. 14), in quavers:
 * Initial to Grade 4 a crotchet beat (two notes a click), Grades 5 to 8 a
 * minim (four). Arpeggios and broken chords use the arpeggio column.
 */
export const ABRSM_SPEEDS: { grade: string; scale: [number, 2 | 4]; arpeggio: [number, 2 | 4] }[] =
  [
    { grade: "Initial", scale: [54, 2], arpeggio: [52, 2] },
    { grade: "Grade 1", scale: [60, 2], arpeggio: [58, 2] },
    { grade: "Grade 2", scale: [66, 2], arpeggio: [63, 2] },
    { grade: "Grade 3", scale: [80, 2], arpeggio: [72, 2] },
    { grade: "Grade 4", scale: [100, 2], arpeggio: [80, 2] },
    { grade: "Grade 5", scale: [60, 4], arpeggio: [44, 4] },
    { grade: "Grade 6", scale: [72, 4], arpeggio: [50, 4] },
    { grade: "Grade 7", scale: [80, 4], arpeggio: [56, 4] },
    { grade: "Grade 8", scale: [88, 4], arpeggio: [66, 4] },
  ];
/** A grade's speed for a pattern: [clicks per minute, notes per click]; none for blocked chords. */
export const gradeSpeed = (grade: string, pattern: ScalePattern) => {
  const g = ABRSM_SPEEDS.find((x) => x.grade === grade);
  if (!g || pattern === "blocked") return undefined;
  return isScaleLine(pattern) ? g.scale : g.arpeggio;
};

/**
 * The tonic chord as steps (each a list of right-hand pitches): an arpeggio
 * over one or two octaves, broken through each inversion in turn, or blocked
 * inversion by inversion. Down and up-down mirror it, as scales do.
 */
export function chordSteps(
  kind: ChordKind,
  tonic: number,
  pattern: "arpeggio" | "broken" | "blocked",
  octaves: 1 | 2,
  motion: ScaleMotion,
  /** An arpeggio from the 3rd (1) or the 5th (2) up to the same note, octaves above. */
  inversion = 0,
): number[][] {
  const iv = CHORD_KINDS.find((c) => c.id === kind)!.intervals;
  const n = iv.length;
  const tone = (t: number) => tonic + iv[t % n] + 12 * Math.floor(t / n);
  const inversionOf = (k: number) => Array.from({ length: n }, (_, j) => tone(k + j));
  const inv = Math.max(0, Math.min(n - 1, inversion));
  let up: number[][];
  if (pattern === "arpeggio")
    up = Array.from({ length: n * octaves + 1 }, (_, t) => [tone(t + inv)]);
  else {
    const chords = Array.from({ length: n * octaves + 1 }, (_, k) => inversionOf(k));
    up = pattern === "blocked" ? chords : chords.flatMap((c) => c.map((m) => [m]));
  }
  const down = [...up].reverse();
  if (motion === "up") return up;
  if (motion === "down") return down;
  return [...up, ...down.slice(1)];
}

/**
 * Triad pairs: the tonic's triad, then the same kind a whole step up (Eb and F
 * over F7sus), each root position, up an octave at a time and back. The two
 * make a six-note scale; a major pair is the IV and V of the key a 4th above
 * the tonic, a minor pair its ii and iii.
 */
export function triadPairSteps(
  kind: ChordKind,
  tonic: number,
  octaves: 1 | 2,
  motion: ScaleMotion,
): number[][] {
  const iv = kind === "minor" ? [0, 3, 7] : [0, 4, 7];
  const up = Array.from({ length: octaves }, (_, o) =>
    [0, 2].flatMap((root) => iv.map((i) => [tonic + 12 * o + root + i])),
  ).flat();
  up.push([tonic + 12 * octaves]);
  const down = [...up].reverse();
  if (motion === "up") return up;
  if (motion === "down") return down;
  return [...up, ...down.slice(1)];
}

export interface ScaleSetup {
  kind: DrillScaleKind;
  /** Default "scale". */
  pattern?: ScalePattern;
  /** The chord for arpeggios and broken or blocked chords (default major). */
  chord?: ChordKind;
  /** Notes per click (default 1). */
  perBeat?: 1 | 2 | 3 | 4 | 6;
  tonic: number;
  span: ScaleSpan;
  motion: ScaleMotion;
  hands: ScaleHands;
  /** With both hands: how they sit (default an octave apart). */
  apart?: HandsApart;
  /** Arpeggios: start on the root (0), the 3rd (1) or the 5th (2). */
  inversion?: number;
  bpm: number;
  /** Extra bar some presets add: evenness must reach this outright. */
  minEvenness?: number;
}

/** The one-tap preset; it keeps the chosen scale and tonic. */
export const HANDS_TOGETHER_PRESET = {
  label: "Hands together, one octave, 80 BPM",
  span: "one-octave",
  motion: "up",
  hands: "both",
  bpm: 80,
  minEvenness: 0.85,
} as const satisfies Partial<ScaleSetup> & { label: string };

export interface ScaleStep {
  index: number;
  /** One note per hand; both hands are doubled an octave apart (left first). */
  notes: { midi: number; hand: "left" | "right" }[];
  atBeat: number;
}

/** The scale's steps from the tonic, the chromatic scale's twelve. */
const degreeSteps = (kind: DrillScaleKind) =>
  kind === "chromatic"
    ? Array.from({ length: 12 }, (_, i) => i)
    : (SCALE_DATA.semitonesByKind[kind] as number[]).filter((st) => st < 12);

/**
 * A scale line by degree, for the shapes an octave apart can't give: hands a
 * third or a sixth apart, contrary motion, double thirds and octaves in a hand,
 * and the chromatic scale. Each step is [left notes, right notes].
 */
function degreeLine(setup: ScaleSetup, pattern: "scale" | "thirds" | "octaves"): number[][][] {
  const steps = degreeSteps(setup.kind);
  const n = steps.length;
  const at = (d: number) => setup.tonic + steps[((d % n) + n) % n] + 12 * Math.floor(d / n);
  const top = setup.span === "pentascale" ? 4 : setup.span === "two-octave" ? 2 * n : n;
  const up = Array.from({ length: top + 1 }, (_, d) => d);
  const down = [...up].reverse();
  const line =
    setup.motion === "up" ? up : setup.motion === "down" ? down : [...up, ...down.slice(1)];
  const shape = (m: number) =>
    pattern === "thirds" ? [m] : pattern === "octaves" ? [m, m + 12] : [m];
  // Double thirds: the degree and the one two above, in each hand.
  const hand = (d: number, shift: number) =>
    pattern === "thirds" ? [at(d) + shift, at(d + 2) + shift] : shape(at(d) + shift);
  const apart = setup.hands === "both" ? (setup.apart ?? "octave") : "octave";
  return line.map((d) => {
    const right = apart === "third" ? hand(d + 2, 0) : hand(d, 0);
    const left =
      apart === "contrary"
        ? hand(-d, pattern === "octaves" ? -12 : 0)
        : apart === "sixth"
          ? hand(d + 2, -12)
          : hand(d, pattern === "octaves" ? -24 : -12);
    if (setup.hands === "both") return [left, right];
    if (setup.hands === "left") return [hand(d, pattern === "octaves" ? -24 : -12), []];
    return [[], right];
  });
}

/** One expected step per note-time of the line (`perBeat` of them to a click). */
export function scaleDrillTargets(setup: ScaleSetup): ScaleStep[] {
  const pattern = setup.pattern ?? "scale";
  const per = setup.perBeat ?? 1;
  const plain =
    pattern === "scale" &&
    setup.kind !== "chromatic" &&
    (setup.hands !== "both" || (setup.apart ?? "octave") === "octave");
  if (isScaleLine(pattern) && !plain)
    return degreeLine(setup, pattern as "scale" | "thirds" | "octaves").map(([l, r], index) => ({
      index,
      atBeat: index / per,
      // Contrary motion starts and ends in unison: both thumbs share one key, so it is one note.
      notes: [
        ...l.filter((m) => !r.includes(m)).map((midi) => ({ midi, hand: "left" as const })),
        ...r.map((midi) => ({ midi, hand: "right" as const })),
      ],
    }));
  const right =
    pattern === "scale"
      ? scaleLine(setup.kind as ScaleKind, setup.tonic, setup.span, setup.motion).map((m) => [m])
      : pattern === "triad-pairs"
        ? triadPairSteps(
            setup.chord ?? "major",
            setup.tonic,
            setup.span === "two-octave" ? 2 : 1,
            setup.motion,
          )
        : chordSteps(
            setup.chord ?? "major",
            setup.tonic,
            pattern as "arpeggio" | "broken" | "blocked",
            setup.span === "two-octave" ? 2 : 1,
            setup.motion,
            pattern === "arpeggio" ? (setup.inversion ?? 0) : 0,
          );
  return right.map((midis, index) => ({
    index,
    atBeat: index / per,
    notes:
      setup.hands === "both"
        ? [
            ...midis.map((m) => ({ midi: m - 12, hand: "left" as const })),
            ...midis.map((m) => ({ midi: m, hand: "right" as const })),
          ]
        : midis.map((m) => ({
            midi: setup.hands === "left" ? m - 12 : m,
            hand: setup.hands === "left" ? ("left" as const) : ("right" as const),
          })),
  }));
}

export const scaleSkills = (kind: DrillScaleKind, pattern: ScalePattern = "scale") =>
  pattern === "arpeggio" || pattern === "triad-pairs"
    ? ["technique.arpeggios"]
    : !isScaleLine(pattern)
      ? ["technique.chord-inversions"]
      : ["technique.scales", `technique.scale.${kind}`].filter((id) => SKILL_IDS.has(id));

/** Stable setup key for the tempo ladder (pattern, scale or chord, tonic, motion, span, hands, notes a click). */
export const scaleSetupKey = (
  s: Pick<
    ScaleSetup,
    "kind" | "tonic" | "motion" | "span" | "hands" | "pattern" | "chord" | "perBeat"
  > &
    Partial<Pick<ScaleSetup, "apart" | "inversion">>,
) => {
  // Hands a third, a sixth or contrary say so; an octave apart keeps the old key.
  const hands = s.hands === "both" && s.apart && s.apart !== "octave" ? `both-${s.apart}` : s.hands;
  const base = [s.kind, s.tonic, s.motion, s.span, hands];
  const pattern = s.pattern ?? "scale";
  // Scales one note a click keep their old keys, so stored ladders still apply.
  if (pattern === "scale" && (s.perBeat ?? 1) === 1) return base.join("|");
  return [
    pattern === "arpeggio" && s.inversion ? `arpeggio-${s.inversion}` : pattern,
    isScaleLine(pattern) ? s.kind : (s.chord ?? "major"),
    ...base.slice(1),
    s.perBeat ?? 1,
  ].join("|");
};

// ---------------------------------------------------------------------------
// Fretted targets

export interface FretTarget extends FretPosition {
  midi: number;
  /** 0 = open string. */
  finger?: number;
  /** A picking-hand label (p i m a) shown instead of the finger. */
  label?: string;
  /** Its time step when not its index: notes sharing a step sound together (a pinch). */
  slot?: number;
  /** Outside the hand's four frets: the index reaches back, or the pinky up (a shift when more than a fret). */
  stretch?: "back" | "up";
}

// ---------------------------------------------------------------------------
// Legato: hammer-ons, pull-offs and slides on one string. Each group starts
// with a picked note; h hammers on, p pulls off, s slides from the note before.
// On the neck and in the text the marks are tab's: ↓ picked, h, p, / slide up
// and \ slide down, so the picked note and the pull-off never share a letter.

export interface LegatoPattern {
  id: string;
  label: string;
  /** Frets above the start fret, how each note sounds (P picked), and its finger when not one a fret from the start. */
  steps: [number, "P" | "h" | "p" | "s", finger?: number][];
}
export const LEGATO_PATTERNS: LegatoPattern[] = [
  {
    id: "hammer-pull",
    label: "Hammer on, pull off",
    steps: [
      [0, "P"],
      [2, "h"],
      [0, "p"],
    ],
  },
  {
    id: "trill",
    label: "Trill",
    steps: [
      [0, "P"],
      [2, "h"],
      [0, "p"],
      [2, "h"],
    ],
  },
  {
    id: "three-note",
    label: "Three notes",
    steps: [
      [0, "P"],
      [2, "h"],
      [3, "h"],
      [2, "p"],
    ],
  },
  {
    id: "slide",
    label: "Slide up and back",
    steps: [
      [0, "P", 3],
      [2, "s", 3],
      [0, "s", 3],
    ],
  },
  {
    id: "slide-shift",
    label: "Position shift",
    steps: [
      [0, "P", 1],
      [2, "P", 3],
      [4, "s", 3],
      [5, "h", 4],
      [4, "p", 3],
      [2, "s", 3],
    ],
  },
];

/** A step's mark on the neck: ↓ picked, h, p, and a slide's direction (/ up, \ down). */
const legatoMark = (how: "P" | "h" | "p" | "s", from: number, to: number) =>
  how === "P" ? "↓" : how === "s" ? (to > from ? "/" : "\\") : how;

/** One pass written as tab writes it from `startFret`: "5h7p5", "5/7\5", a space before each picked note. */
export const legatoText = (pattern: LegatoPattern, startFret: number) =>
  pattern.steps
    .map(([off, how], i) =>
      i === 0
        ? String(startFret + off)
        : `${how === "P" ? " " : legatoMark(how, pattern.steps[i - 1][0], off)}${startFret + off}`,
    )
    .join("");

/** The pattern on `string` from `startFret`, `repeats` times. */
export function legatoTargets(opts: {
  patternId: string;
  tuning: Tuning;
  string: number;
  startFret: number;
  repeats?: number;
}): FretTarget[] {
  const pattern = LEGATO_PATTERNS.find((p) => p.id === opts.patternId) ?? LEGATO_PATTERNS[0];
  return Array.from({ length: opts.repeats ?? 4 }, () => pattern.steps).flatMap((steps) =>
    steps.map(([off, how, finger], i) => {
      const fret = opts.startFret + off;
      return {
        string: opts.string,
        fret,
        midi: midiAt(opts.tuning, opts.string, fret),
        label: legatoMark(how, steps[(i + steps.length - 1) % steps.length][0], off),
        // One finger per fret from the start (0 the index, 2 the ring), unless a slide carries one finger along.
        finger: finger ?? off + 1,
      };
    }),
  );
}

// ---------------------------------------------------------------------------
// Fingerpicking: a picking pattern over chord shapes, a step per eighth.
// "B" is the chord's bass string (its lowest sounding string), "A" the
// alternate bass (string 4 under a string-6 root, else the next string up).
// A step can pinch strings together ("B+2", fingers "p+m") or hold ("-").
// Eight steps make a bar of 4/4; six make a bar of 3/4 (or 6/8 at three a click).
// The ukulele patterns name strings directly: on re-entrant tuning string 4
// is not the lowest note, so pitches come from the tuning, never the order.

export interface FingerpickPattern {
  id: string;
  label: string;
  instrument: "guitar" | "ukulele";
  strings: string[];
  /** p thumb, i index, m middle, a ring; "p+m" for a pinch, "-" for a hold. */
  fingers: string[];
}

/** Tremolo patterns: one note repeated, so evenness is most of the grade. */
export const isTremolo = (p: Pick<FingerpickPattern, "id">) => p.id.includes("tremolo");

/** The strings of one step ("B+2" is two, "-" none). */
const stepParts = (step: string) => (step === "-" ? [] : step.split("+"));
// Sources for the additions: Fender's Travis picking lesson (thumb alone, then one
// finger), Heartwood Guitar's Travis patterns, Giuliani Op. 1 style arpeggios,
// UkuleleGo's five patterns and liveukulele's picking patterns. Patterns that need
// pinches or 6/8 (Dust in the Wind as written, House of the Rising Sun) are not here yet.
export const FINGERPICK_PATTERNS: FingerpickPattern[] = [
  {
    id: "travis-bass",
    label: "Alternating bass, thumb only",
    instrument: "guitar",
    strings: ["B", "A", "B", "A", "B", "A", "B", "A"],
    fingers: ["p", "p", "p", "p", "p", "p", "p", "p"],
  },
  {
    id: "travis-middle",
    label: "Travis with one finger",
    instrument: "guitar",
    strings: ["B", "2", "A", "2", "B", "2", "A", "2"],
    fingers: ["p", "m", "p", "m", "p", "m", "p", "m"],
  },
  {
    id: "travis",
    label: "Travis picking, alternating bass",
    instrument: "guitar",
    strings: ["B", "3", "A", "2", "B", "3", "A", "2"],
    fingers: ["p", "i", "p", "m", "p", "i", "p", "m"],
  },
  {
    id: "travis-syncopated",
    label: "Syncopated Travis, one note at a time",
    instrument: "guitar",
    strings: ["B", "2", "A", "3", "B", "2", "A", "3"],
    fingers: ["p", "m", "p", "i", "p", "m", "p", "i"],
  },
  {
    id: "pima",
    label: "p i m a",
    instrument: "guitar",
    strings: ["B", "3", "2", "1", "B", "3", "2", "1"],
    fingers: ["p", "i", "m", "a", "p", "i", "m", "a"],
  },
  {
    id: "pima-alternating",
    label: "p i m a, alternating bass",
    instrument: "guitar",
    strings: ["B", "3", "2", "1", "A", "3", "2", "1"],
    fingers: ["p", "i", "m", "a", "p", "i", "m", "a"],
  },
  {
    id: "folk-pimi",
    label: "Folk arpeggio, p i m i",
    instrument: "guitar",
    strings: ["B", "3", "2", "3", "A", "3", "2", "3"],
    fingers: ["p", "i", "m", "i", "p", "i", "m", "i"],
  },
  {
    id: "pmim",
    label: "Reverse folk arpeggio, p m i m",
    instrument: "guitar",
    strings: ["B", "2", "3", "2", "A", "2", "3", "2"],
    fingers: ["p", "m", "i", "m", "p", "m", "i", "m"],
  },
  {
    id: "pimiaimi",
    label: "Eight-note arpeggio, p i m i a i m i",
    instrument: "guitar",
    strings: ["B", "3", "2", "3", "1", "3", "2", "3"],
    fingers: ["p", "i", "m", "i", "a", "i", "m", "i"],
  },
  {
    id: "pami",
    label: "p a m i, down from the top",
    instrument: "guitar",
    strings: ["B", "1", "2", "3", "A", "1", "2", "3"],
    fingers: ["p", "a", "m", "i", "p", "a", "m", "i"],
  },
  {
    id: "rolling",
    label: "Up and down, p i m a m i",
    instrument: "guitar",
    strings: ["B", "3", "2", "1", "2", "3"],
    fingers: ["p", "i", "m", "a", "m", "i"],
  },
  {
    id: "travis-pinch",
    label: "Travis with a pinch on one",
    instrument: "guitar",
    strings: ["B+2", "3", "A", "2", "B", "3", "A", "2"],
    fingers: ["p+m", "i", "p", "m", "p", "i", "p", "m"],
  },
  {
    id: "dust-pinch",
    label: "Syncopated Travis with a pinch (Dust in the Wind)",
    instrument: "guitar",
    strings: ["B+2", "-", "A", "3", "B", "2", "A", "3"],
    fingers: ["p+m", "-", "p", "i", "p", "m", "p", "i"],
  },
  {
    id: "boom-chick",
    label: "Boom chick: thumb, then three fingers together",
    instrument: "guitar",
    strings: ["B", "-", "3+2+1", "-", "A", "-", "3+2+1", "-"],
    fingers: ["p", "-", "i+m+a", "-", "p", "-", "i+m+a", "-"],
  },
  {
    // The Blackbird technique (not the song's notes): thumb and middle pluck tenths
    // together, the index sounds the open G between them as a drone.
    id: "blackbird-pinch",
    label: "Blackbird-style pinch: p and m together, i on string 3",
    instrument: "guitar",
    strings: ["B+2", "3", "B+2", "3", "B+2", "3", "B+2", "3"],
    fingers: ["p+m", "i", "p+m", "i", "p+m", "i", "p+m", "i"],
  },
  {
    id: "travis-high",
    label: "Travis picking on strings 2 and 1",
    instrument: "guitar",
    strings: ["B", "2", "A", "1", "B", "2", "A", "1"],
    fingers: ["p", "i", "p", "m", "p", "i", "p", "m"],
  },
  {
    id: "uke-claw",
    label: "The claw",
    instrument: "ukulele",
    strings: ["4", "2", "1", "2", "4", "2", "1", "2"],
    fingers: ["p", "i", "m", "i", "p", "i", "m", "i"],
  },
  {
    id: "uke-claw-alternating",
    label: "Claw with alternating thumb",
    instrument: "ukulele",
    strings: ["4", "2", "1", "2", "3", "2", "1", "2"],
    fingers: ["p", "i", "m", "i", "p", "i", "m", "i"],
  },
  {
    id: "uke-outside-in",
    label: "Outside in",
    instrument: "ukulele",
    strings: ["4", "1", "3", "2", "4", "1", "3", "2"],
    fingers: ["p", "m", "p", "i", "p", "m", "p", "i"],
  },
  {
    id: "uke-tima",
    label: "Thumb on 4, then i m a",
    instrument: "ukulele",
    strings: ["4", "3", "2", "1", "4", "3", "2", "1"],
    fingers: ["p", "i", "m", "a", "p", "i", "m", "a"],
  },
  {
    id: "uke-alternating",
    label: "Alternating thumb on 3 and 4",
    instrument: "ukulele",
    strings: ["3", "1", "4", "2", "3", "1", "4", "2"],
    fingers: ["p", "m", "p", "i", "p", "m", "p", "i"],
  },
  {
    id: "uke-tami",
    label: "Thumb on 4, then a m i",
    instrument: "ukulele",
    strings: ["4", "1", "2", "3", "4", "1", "2", "3"],
    fingers: ["p", "a", "m", "i", "p", "a", "m", "i"],
  },
  {
    id: "uke-travis",
    label: "Travis: thumb on 4 and 3, i and m on 2 and 1",
    instrument: "ukulele",
    strings: ["4", "2", "3", "1", "4", "2", "3", "1"],
    fingers: ["p", "i", "p", "m", "p", "i", "p", "m"],
  },
  {
    id: "uke-fancy-eight",
    label: "Fancy eight, 3 3 2 feel",
    instrument: "ukulele",
    strings: ["1", "4", "2", "1", "4", "2", "3", "2"],
    fingers: ["m", "p", "i", "m", "p", "i", "p", "i"],
  },
  {
    id: "uke-linear",
    label: "Low to high, C E G A",
    instrument: "ukulele",
    strings: ["3", "2", "4", "1", "3", "2", "4", "1"],
    fingers: ["p", "i", "p", "m", "p", "i", "p", "m"],
  },
  {
    id: "uke-rolling",
    label: "Up and down, p i m a m i",
    instrument: "ukulele",
    strings: ["4", "3", "2", "1", "2", "3"],
    fingers: ["p", "i", "m", "a", "m", "i"],
  },
  {
    id: "uke-backward-roll",
    label: "Backward roll, m i p",
    instrument: "ukulele",
    strings: ["1", "2", "3", "1", "2", "4"],
    fingers: ["m", "i", "p", "m", "i", "p"],
  },
  {
    id: "uke-ohta",
    label: "Ohta-San, 6/8",
    instrument: "ukulele",
    strings: ["3", "2", "4", "1", "4", "2"],
    fingers: ["p", "i", "p", "m", "p", "i"],
  },
  // Tremolo on string 1, graded mostly on how even the notes are.
  {
    id: "uke-tremolo-im",
    label: "Tremolo, i m on string 1",
    instrument: "ukulele",
    strings: ["1", "1", "1", "1", "1", "1", "1", "1"],
    fingers: ["i", "m", "i", "m", "i", "m", "i", "m"],
  },
  {
    id: "uke-tremolo-pami",
    label: "Tremolo, p a m i on string 1",
    instrument: "ukulele",
    strings: ["1", "1", "1", "1", "1", "1", "1", "1"],
    fingers: ["p", "a", "m", "i", "p", "a", "m", "i"],
  },
  {
    id: "uke-two-strings",
    label: "Thumb, then two strings together",
    instrument: "ukulele",
    strings: ["4", "2+1", "2+1", "2+1", "4", "2+1", "2+1", "2+1"],
    fingers: ["p", "i+m", "i+m", "i+m", "p", "i+m", "i+m", "i+m"],
  },
];

/**
 * A song to start from: its picking pattern, its chords in order (a bar each,
 * plain symbols such as "Am" or "Cmaj7"), the click tempo and notes a click.
 * Only those facts are stored; the note says what is simplified (capo, slash chords).
 */
export interface FingerpickSong {
  id: string;
  song: string;
  artist: string;
  instrument: "guitar" | "ukulele";
  pattern: string;
  chords: string[];
  bpm: number;
  perBeat: 2 | 3;
  note: string;
  source: string;
}

// Progressions from lesson pages (source on each); tempos checked against song
// length where only automated BPM sites gave one, so treat them as starting points.
export const FINGERPICK_SONGS: FingerpickSong[] = [
  {
    id: "house-of-the-rising-sun",
    song: "House of the Rising Sun",
    artist: "The Animals",
    instrument: "guitar",
    pattern: "rolling",
    chords: ["Am", "C", "D", "F", "Am", "E"],
    bpm: 58,
    perBeat: 3,
    note: "The 8-bar verse is cut to 6 by merging the closing C E E into one E bar. No capo.",
    source:
      "https://www.guitarlessons.com/guitar-lessons/guitar-lessons-for-beginners/learn-to-play-house-of-the-rising-sun/",
  },
  {
    id: "dust-in-the-wind",
    song: "Dust in the Wind",
    artist: "Kansas",
    instrument: "guitar",
    pattern: "dust-pinch",
    chords: ["C", "G", "Am", "G", "Dm", "Am"],
    bpm: 94,
    perBeat: 2,
    note: "Verse progression. G/B is played as G. The intro's Cmaj7, Cadd9 and Asus2 colour chords are left out.",
    source: "https://nationalguitaracademy.com/?p=14276",
  },
  {
    id: "landslide",
    song: "Landslide",
    artist: "Fleetwood Mac",
    instrument: "guitar",
    pattern: "travis",
    chords: ["C", "G", "Am7", "G"],
    bpm: 80,
    perBeat: 2,
    note: "Capo 3. G/B becomes G. The original is closer to an inside-out roll than true Travis.",
    source: "https://andyguitar.co.uk/videos/fleetwood-mac-landslide",
  },
  {
    id: "hallelujah",
    song: "Hallelujah",
    artist: "Leonard Cohen",
    instrument: "guitar",
    pattern: "rolling",
    chords: ["G", "Em", "G", "Em", "C", "D"],
    bpm: 60,
    perBeat: 3,
    note: "Capo 5 with G shapes (sounds in C). The first half of the verse. The roll is an approximation.",
    source: "https://www.guitarlessons.com/guitar-lessons/guitar-lessons-for-beginners/hallelujah/",
  },
  {
    id: "everybody-hurts",
    song: "Everybody Hurts",
    artist: "R.E.M.",
    instrument: "guitar",
    pattern: "rolling",
    chords: ["D", "G"],
    bpm: 63,
    perBeat: 3,
    note: "Verse only (bass then strings 3 2 1 2 3). The walkdown and the Em A chorus are left out.",
    source: "https://laurenbateman.com/?p=5038",
  },
  {
    id: "the-boxer",
    song: "The Boxer",
    artist: "Simon & Garfunkel",
    instrument: "guitar",
    pattern: "travis-pinch",
    chords: ["C", "Am", "G", "G7"],
    bpm: 93,
    perBeat: 2,
    note: "Verse in C shapes with no capo. The recording sounds lower (a detuned guitar). The C to Am bass walk is dropped.",
    source: "https://pg.zachmanson.com/tab/simon-garfunkel/the-boxer-chords-1744664",
  },
  {
    id: "scarborough-fair",
    song: "Scarborough Fair",
    artist: "Simon & Garfunkel",
    instrument: "guitar",
    pattern: "rolling",
    chords: ["Am", "G", "Am", "C", "Am", "D"],
    bpm: 129,
    perBeat: 2,
    note: "3/4 in Am shapes (capo 7 to match the recording). G/B becomes G and the melody isn't included.",
    source: "https://jgmusiclessons.com/scarborough-fair-guitar-tabs-chords-and-arrangement",
  },
  {
    id: "tears-in-heaven",
    song: "Tears in Heaven",
    artist: "Eric Clapton",
    instrument: "guitar",
    pattern: "pima",
    chords: ["A", "E", "F#m", "A", "D", "E7"],
    bpm: 80,
    perBeat: 2,
    note: "Slash bass notes (E/G#, A/E, D/F#) and E7sus4 are dropped. The song changes chord every two beats, and p i m a only approximates Clapton's picking.",
    source: "https://www.licklibrary.com/learn/lessons/eric-clapton/tears-in-heaven",
  },
  {
    id: "nothing-else-matters",
    song: "Nothing Else Matters",
    artist: "Metallica",
    instrument: "guitar",
    pattern: "rolling",
    chords: ["Em", "D", "C"],
    bpm: 46,
    perBeat: 3,
    note: "Only the verse chord loop. The intro's open-string melody and hammer-ons aren't included.",
    source: "https://www.licklibrary.com/learn/lessons/metallica/nothing-else-matters",
  },
  {
    id: "uke-hallelujah",
    song: "Hallelujah",
    artist: "Leonard Cohen",
    instrument: "ukulele",
    pattern: "uke-rolling",
    chords: ["C", "Am", "C", "Am", "F", "G"],
    bpm: 60,
    perBeat: 3,
    note: "12/8 felt as 6/8. The taught version pinches strings 4 and 1 on each downbeat, so the roll is an approximation.",
    source:
      "https://ukulelemagazine.com/lessons/watch-sarah-maisel-perform-leonard-cohens-hallelujah",
  },
  {
    id: "uke-cant-help-falling-in-love",
    song: "Can't Help Falling in Love",
    artist: "Elvis Presley",
    instrument: "ukulele",
    pattern: "uke-rolling",
    chords: ["C", "Em", "Am", "F", "C", "G"],
    bpm: 66,
    perBeat: 3,
    note: "In C (the original is in D). 12/8 at a dotted quarter of about 66 BPM.",
    source: "https://ukulelego.com/lessons/cant-help-falling-in-love-by-twenty-one-pilots/",
  },
  {
    id: "uke-house-of-the-rising-sun",
    song: "House of the Rising Sun",
    artist: "The Animals",
    instrument: "ukulele",
    pattern: "uke-rolling",
    chords: ["Am", "C", "D", "F", "Am", "E"],
    bpm: 58,
    perBeat: 3,
    note: "Thumb on string 4, then i m a. The verse is shortened to 6 bars.",
    source: "https://ukulelego.com/lessons/house-of-the-rising-sun-ukulele-lesson/",
  },
  {
    id: "uke-scarborough-fair",
    song: "Scarborough Fair",
    artist: "Simon & Garfunkel",
    instrument: "ukulele",
    pattern: "uke-rolling",
    chords: ["Am", "G", "Am", "C", "Am", "D"],
    bpm: 90,
    perBeat: 2,
    note: "3/4 in Am at a slower practice tempo with open strings ringing. The melody isn't included.",
    source: "https://ukutabs.com/pl/s/simon-and-garfunkel/scarborough-fair/",
  },
];

/** The string a pattern step plays on a shape, or null when that string is muted. */
function pickString(step: string, frets: readonly (number | null)[]): number | null {
  const sounds = (n: number) => n >= 1 && n <= frets.length && frets[n - 1] !== null;
  const bass = Math.max(...frets.flatMap((f, i) => (f === null ? [] : [i + 1])));
  if (step === "B") return bass;
  if (step === "A") {
    const alt = bass === 6 && sounds(4) ? 4 : bass - 1;
    return sounds(alt) ? alt : null;
  }
  const n = Number(step);
  return sounds(n) ? n : null;
}

/** Whether every step of the pattern lands on a sounding string of the shape. */
export const fingerpickable = (
  pattern: FingerpickPattern,
  shape: Pick<ChordShape, "frets" | "instrument">,
) =>
  pattern.instrument === shape.instrument &&
  pattern.strings.every((st) =>
    stepParts(st).every((part) => pickString(part, shape.frets) !== null),
  );

/** The pattern a bar per chord, `rounds` times through the chords. */
export function fingerpickTargets(opts: {
  pattern: FingerpickPattern;
  shapes: readonly ChordShape[];
  tuning: Tuning;
  rounds?: number;
}): FretTarget[] {
  const out: FretTarget[] = [];
  const len = opts.pattern.strings.length;
  let bar = 0;
  for (let r = 0; r < (opts.rounds ?? 2); r++)
    for (const shape of opts.shapes) {
      opts.pattern.strings.forEach((st, k) => {
        const fingers = opts.pattern.fingers[k].split("+");
        // A muted string or a hold still takes its step, so the time never shifts.
        stepParts(st).forEach((part, j) => {
          const string = pickString(part, shape.frets);
          if (string === null) return;
          const fret = shape.frets[string - 1]!;
          out.push({
            string,
            fret,
            midi: midiAt(opts.tuning, string, fret),
            label: fingers[j] ?? fingers[0],
            // The fretting hand's finger on that string (none when it rings open).
            finger: fret === 0 ? 0 : (shape.fingers[string - 1] ?? undefined),
            slot: bar * len + k,
          });
        });
      });
      bar++;
    }
  return out;
}

export const SPIDER_PATTERNS = STRING_SPIDER.patterns;
export const SPIDER_SPANS = STRING_SPIDER.spans;
export const SPIDER_TEMPOS = [60, 80, 100, 120];

/**
 * Exam click tempos for guitar scales: Rockschool (RSL) Electric 2018 and the
 * Trinity Classical Guitar minimum scale tempos (Apr 2023). Neither extract
 * says how many notes fall on a click, so these set the click only.
 */
export const GUITAR_GRADE_TEMPOS: { id: string; label: string; bpm: number }[] = [
  ...(
    [
      ["Debut", 70],
      ["Grade 1", 70],
      ["Grade 2", 80],
      ["Grade 3", 90],
      ["Grade 4", 80],
      ["Grade 5", 80],
      ["Grade 6", 100],
      ["Grade 7", 100],
      ["Grade 8", 100],
    ] as const
  ).map(([g, bpm]) => ({
    id: `rsl-${g.toLowerCase().replace(" ", "-")}`,
    label: `Rockschool ${g}`,
    bpm,
  })),
  ...(
    [
      ["Initial", 88],
      ["Grade 1", 56],
      ["Grade 2", 62],
      ["Grade 3", 70],
      ["Grade 4", 82],
      ["Grade 5", 92],
      ["Grade 6", 106],
      ["Grade 7", 122],
      ["Grade 8", 136],
    ] as const
  ).map(([g, bpm]) => ({
    id: `trinity-${g.toLowerCase().replace(" ", "-")}`,
    label: `Trinity classical ${g}`,
    bpm,
  })),
];
export const SPIDER_DEFAULTS = { bpm: 80, startFret: 5 };
/** Starting frets offered: 0..min(9, fretCount - 3). */
export const spiderMaxStartFret = (t: Tuning) => Math.min(9, t.fretCount - 3);

const SPAN_SIZE: Record<SpiderSpanId, number> = {
  single: 1,
  "adjacent-2": 2,
  "adjacent-3": 3,
  all: Infinity,
};

/**
 * Strings in a span, from the start string toward string 1. A span that would
 * run past string 1 moves toward the bass so it keeps its size; "all" is every string.
 */
export const spiderStrings = (start: number, span: SpiderSpanId, count = 6) => {
  const size = Math.min(SPAN_SIZE[span], count);
  const first = Math.min(count, Math.max(start, size));
  return Array.from({ length: size }, (_, i) => first - i);
};

/**
 * Spider: the pattern's four frets on each string of the span in turn. With
 * crossing, each step lands on the next string, one pass starting from each string.
 */
export function spiderTargets(opts: {
  patternId: string;
  tuning: Tuning;
  string: number;
  span: SpiderSpanId;
  /** Any set of strings, in place of string and span: played bass first. */
  strings?: number[];
  startFret: number;
  crossing: boolean;
}): FretTarget[] {
  const pattern = SPIDER_PATTERNS.find((p) => p.id === opts.patternId) ?? SPIDER_PATTERNS[0];
  const start = Math.min(Math.max(0, Math.round(opts.startFret)), spiderMaxStartFret(opts.tuning));
  const count = opts.tuning.openStrings.length;
  const picked = [...new Set(opts.strings ?? [])]
    .filter((n) => n >= 1 && n <= count)
    .sort((a, b) => b - a);
  const strings = picked.length
    ? picked
    : spiderStrings(Math.min(opts.string, count), opts.span, count);
  // Crossing needs two strings or more.
  const crossing = opts.crossing && strings.length > 1;
  const at = (string: number, offset: number): FretTarget => {
    const fret = start + offset;
    return {
      string,
      fret,
      midi: midiAt(opts.tuning, string, fret),
      // From the nut, the index takes fret 1: one finger per fret, open strings 0.
      finger: fret === 0 ? 0 : start === 0 ? offset : offset + 1,
    };
  };
  if (!crossing) return strings.flatMap((s) => pattern.fretOffsets.map((o) => at(s, o)));
  return strings.flatMap((_, pass) =>
    pattern.fretOffsets.map((o, step) => at(strings[(pass + step) % strings.length], o)),
  );
}

export interface PositionPattern extends Omit<FretboardPatternDef, "family"> {
  family: FretboardPatternDef["family"] | "connected" | "triads" | "blues-box";
  /** Ukulele shapes; the rest are guitar. */
  instrument?: "ukulele";
  /** The string the root fret is on: 6 on guitar, 1 (the A string) on ukulele. */
  rootString?: number;
  /** Played in the written order (a run across boxes, triads by inversion), not low string to high. */
  ordered?: boolean;
  /** The fretting finger of each offset, when one finger a fret from the lowest would be wrong. */
  fingers?: number[];
  /** Notes to a hand position when the pattern moves up the neck (a box of the run, a triad). */
  segment?: number;
}

/**
 * Box 3 spans five frets. The usual fingering puts the index a fret above the
 * lowest note (fret 10 in A) and reaches back with it on string 3; one finger a
 * fret from the lowest note would leave the pinky two frets past its reach on string 2.
 */
const BOX_FINGERS: Record<string, number[]> = {
  "minor-pentatonic-box-3": [1, 3, 1, 3, 1, 3, 1, 3, 1, 4, 1, 3],
};
const BOXES: PositionPattern[] = FRETBOARD_PATTERNS.map((p) =>
  BOX_FINGERS[p.id] ? { ...p, fingers: BOX_FINGERS[p.id] } : p,
);

const offs = (list: [string: number, fret: number][]) =>
  list.map(([stringNumber, fretOffset]) => ({ stringNumber, fretOffset }));

/** Boxes 1 to 5 joined up the neck: box 1 up, box 2 down, box 3 up, and so on (frets 5 to 17 in A). */
function connectedBoxes(): PositionPattern {
  const boxes = BOXES.filter((p) => p.family === "minor-pentatonic");
  const offsets: FretboardPatternDef["offsets"] = [];
  const fingers: number[] = [];
  boxes.forEach((b, k) => {
    const low = Math.min(...b.offsets.map((o) => o.fretOffset));
    const up = b.offsets
      .map((o, i) => ({ o, finger: b.fingers?.[i] ?? Math.min(4, o.fretOffset - low + 1) }))
      .sort((x, y) => y.o.stringNumber - x.o.stringNumber || x.o.fretOffset - y.o.fretOffset);
    for (const { o, finger } of k % 2 ? up.reverse() : up) {
      offsets.push(o);
      fingers.push(finger);
    }
  });
  return {
    id: "minor-pentatonic-connected",
    label: "Boxes 1 to 5 connected",
    family: "connected",
    ordered: true,
    offsets,
    fingers,
    segment: boxes[0].offsets.length,
  };
}

/**
 * Triads on three strings, every inversion up the neck, offsets from the root
 * on string 6 like the boxes. In A at fret 5, major on strings 1 to 3 is
 * C# E A at 6 5 5, E A C# at 9 10 9, A C# E at 14 14 12.
 */
const TRIADS: PositionPattern[] = [
  {
    id: "triads-major-strings-1-3",
    label: "Major triads, strings 1 to 3",
    family: "triads",
    ordered: true,
    segment: 3,
    offsets: offs([
      [3, 1],
      [2, 0],
      [1, 0],
      [3, 4],
      [2, 5],
      [1, 4],
      [3, 9],
      [2, 9],
      [1, 7],
    ]),
    fingers: [2, 1, 1, 1, 3, 2, 2, 3, 1],
  },
  {
    id: "triads-major-strings-2-4",
    label: "Major triads, strings 2 to 4",
    family: "triads",
    ordered: true,
    segment: 3,
    offsets: offs([
      [4, 2],
      [3, 1],
      [2, 0],
      [4, 6],
      [3, 4],
      [2, 5],
      [4, 9],
      [3, 9],
      [2, 9],
    ]),
    fingers: [3, 2, 1, 3, 1, 2, 1, 1, 1],
  },
  {
    id: "triads-minor-strings-1-3",
    label: "Minor triads, strings 1 to 3",
    family: "triads",
    ordered: true,
    segment: 3,
    offsets: offs([
      [3, 0],
      [2, 0],
      [1, 0],
      [3, 4],
      [2, 5],
      [1, 3],
      [3, 9],
      [2, 8],
      [1, 7],
    ]),
    fingers: [1, 1, 1, 2, 3, 1, 3, 2, 1],
  },
  {
    id: "triads-minor-strings-2-4",
    label: "Minor triads, strings 2 to 4",
    family: "triads",
    ordered: true,
    segment: 3,
    offsets: offs([
      [4, 2],
      [3, 0],
      [2, 0],
      [4, 5],
      [3, 4],
      [2, 5],
      [4, 9],
      [3, 9],
      [2, 8],
    ]),
    fingers: [3, 1, 1, 2, 1, 3, 2, 3, 1],
  },
];

/**
 * B.B. King's box: the root on string 2 under the index (fret 10 in A, five frets
 * above the string-6 root), the 2nd and flat 3rd above it, the 4th and 5th on
 * string 1, the 6th on string 3. Six notes (Guitar World, Happy Bluesman).
 */
const BB_BOX: PositionPattern = {
  id: "bb-box",
  label: "The B.B. box",
  family: "blues-box",
  offsets: offs([
    [3, 6],
    [2, 5],
    [2, 7],
    [2, 8],
    [1, 5],
    [1, 7],
  ]),
};

/**
 * Ukulele minor pentatonic, positions 1 to 5 up the neck, offsets from the root on
 * string 1 (A open, C at fret 3), on GCEA in either G. Each position takes the next
 * two notes on every string; played string 4 to 1, as a re-entrant G is not the lowest note.
 */
const UKE_PENTATONIC: PositionPattern[] = (
  [
    [
      [0, 2],
      [0, 2],
      [0, 3],
      [0, 3],
    ],
    [
      [2, 5],
      [2, 4],
      [3, 5],
      [3, 5],
    ],
    [
      [5, 7],
      [4, 7],
      [5, 8],
      [5, 7],
    ],
    [
      [7, 9],
      [7, 9],
      [8, 10],
      [7, 10],
    ],
    [
      [9, 12],
      [9, 12],
      [10, 12],
      [10, 12],
    ],
  ] as const
).map((perString, k) => ({
  id: `ukulele-minor-pentatonic-${k + 1}`,
  label: `Minor pentatonic position ${k + 1}`,
  family: "minor-pentatonic",
  instrument: "ukulele",
  rootString: 1,
  // Strings 4, 3, 2, 1 in that order.
  offsets: offs(
    perString.flatMap(([a, b], i) => [
      [4 - i, a] as [number, number],
      [4 - i, b] as [number, number],
    ]),
  ),
  // Position 3 spans five frets: the hand sits at the root and the index reaches back on string 3.
  ...(k === 2 ? { fingers: [1, 3, 1, 3, 1, 4, 1, 3] } : {}),
}));

export const POSITION_PATTERNS: PositionPattern[] = [
  ...BOXES,
  connectedBoxes(),
  ...TRIADS,
  BB_BOX,
  ...UKE_PENTATONIC,
];
/** The shapes for one instrument. */
export const positionPatternsFor = (instrument: "guitar" | "ukulele") =>
  POSITION_PATTERNS.filter((p) => (p.instrument ?? "guitar") === instrument);
/** Where a shape's lowest fret sits relative to the root fret (E 0, D 2, C 4, A 7, G 9). */
export const baseOffset = (p: Pick<FretboardPatternDef, "offsets">) =>
  Math.min(...p.offsets.map((o) => o.fretOffset));
/**
 * The shapes are written for one tuning: guitar standard, root on string 6, and
 * ukulele GCEA (high G), root on string 1. On another tuning each note keeps its
 * string and its pitch against the root string, so its fret moves by that
 * string's retuning: in drop D string 6 sits two frets higher than the rest.
 * An octave apart counts as the same (low G plays the high-G frets).
 */
function retune(p: Pick<PositionPattern, "instrument" | "rootString">, tuning: Tuning) {
  const ref = tuningById(p.instrument === "ukulele" ? "ukulele.high-g" : "guitar.standard")!;
  const near = (d: number) => (((d % 12) + 18) % 12) - 6;
  const by = (s: number) =>
    near(ref.openStrings[s - 1] - (tuning.openStrings[s - 1] ?? ref.openStrings[s - 1]));
  const root = by(p.rootString ?? (p.instrument === "ukulele" ? 1 : 6));
  return (s: number) => by(s) - root;
}
/** Root frets that keep the whole shape on the neck in this tuning. */
export const positionRootFretMax = (p: PositionPattern, t: Tuning) => {
  const shift = retune(p, t);
  return t.fretCount - Math.max(...p.offsets.map((o) => o.fretOffset + shift(o.stringNumber)));
};
export const positionRootFretMin = (p: PositionPattern, t: Tuning) => {
  const shift = retune(p, t);
  return Math.max(0, ...p.offsets.map((o) => -(o.fretOffset + shift(o.stringNumber))));
};

/** The most common value, the lowest on a tie. */
const mode = (xs: number[]) => {
  const count = new Map<number, number>();
  for (const x of xs) count.set(x, (count.get(x) ?? 0) + 1);
  return [...count].sort((a, b) => b[1] - a[1] || a[0] - b[0])[0]?.[0];
};

/**
 * A shape at a root fret on its root string: a box or CAGED shape arpeggiated
 * low string to high, an ordered pattern in its written order. Fingering is one
 * finger a fret from where the hand sits (the index's fret most notes imply);
 * a note a fret outside is a stretch, further a shift. Chord shapes keep their
 * authored fingers in their own tuning.
 */
export function positionTargets(opts: {
  patternId: string;
  tuning: Tuning;
  rootFret: number;
}): FretTarget[] {
  const p = POSITION_PATTERNS.find((x) => x.id === opts.patternId) ?? POSITION_PATTERNS[0];
  const shift = retune(p, opts.tuning);
  const notes = p.offsets
    .map((o, i) => ({
      string: o.stringNumber,
      fret: opts.rootFret + o.fretOffset + shift(o.stringNumber),
      written: opts.rootFret + o.fretOffset,
      authored: p.fingers?.[i],
      seg: p.segment ? Math.floor(i / p.segment) : 0,
    }))
    .filter(
      (t) =>
        t.string <= opts.tuning.openStrings.length &&
        t.fret >= 0 &&
        t.fret <= opts.tuning.fretCount,
    );
  const asWritten = notes.every((t) => t.fret === t.written);
  const keep = asWritten && (p.family === "triads" || p.family === "caged-major") && !!p.fingers;
  const out = notes.map((t): FretTarget & { seg: number } => {
    const base = {
      string: t.string,
      fret: t.fret,
      seg: t.seg,
      midi: midiAt(opts.tuning, t.string, t.fret),
    };
    if (keep) return { ...base, finger: t.authored };
    if (t.fret === 0) return { ...base, finger: 0 };
    // Where the hand sits: the index fret the written fingering implies, from the nut at the lowest.
    const own = notes.filter((n) => n.seg === t.seg);
    const low = Math.max(1, Math.min(...own.map((n) => n.written)));
    const ref = (n: (typeof notes)[number]) =>
      n.authored ?? (n.written === 0 ? 0 : Math.min(4, n.written - low + 1));
    const hand =
      mode(own.filter((n) => n.fret > 0 && ref(n) > 0).map((n) => n.fret - ref(n) + 1)) ?? 1;
    if (t.fret < hand) return { ...base, finger: 1, stretch: "back" };
    if (t.fret > hand + 3) return { ...base, finger: 4, stretch: "up" };
    return { ...base, finger: t.fret - hand + 1 };
  });
  if (!p.ordered) out.sort((a, b) => b.string - a.string || a.fret - b.fret);
  return out.map(({ seg: _seg, ...t }) => t);
}

// ---------------------------------------------------------------------------
// Natural harmonics: touched over fret 12 (an octave up), 7 (an octave and a fifth)
// and 5 (two octaves), every string from the bass up, each fret in turn.

export const HARMONIC_ABOVE: Record<number, number> = { 12: 12, 7: 19, 5: 24 };

/** The harmonic a string and fret sound, or null off frets 12, 7 and 5. */
export const harmonicMidi = (tuning: Tuning, string: number, fret: number) =>
  fret in HARMONIC_ABOVE ? tuning.openStrings[string - 1] + HARMONIC_ABOVE[fret] : null;

export function harmonicTargets(tuning: Tuning): FretTarget[] {
  const strings = tuning.openStrings.map((_, i) => tuning.openStrings.length - i);
  return [12, 7, 5].flatMap((fret) =>
    strings.map((string) => ({
      string,
      fret,
      midi: harmonicMidi(tuning, string, fret)!,
      finger: 0,
      label: "H",
    })),
  );
}

// ---------------------------------------------------------------------------
// Note finder and interval recall

export interface NoteFinderPrompt {
  id: string;
  pc: number;
  name: string;
  region: { start: number; end: number };
  /** Every place the note can be found in the region. */
  answers: FretPosition[];
}

/** A named note (sharp spelling, the fretboard convention) somewhere in a fret region. */
export function noteFinderPrompt(
  rand: Rand,
  opts: { tuning: Tuning; region: { start: number; end: number }; strings?: number[] },
): NoteFinderPrompt {
  const cells = Array.from({ length: 12 }, (_, p) => p).filter(
    (p) => pcPositions(opts.tuning, p, opts.region, opts.strings).length > 0,
  );
  const target = pick(rand, cells);
  return {
    id: `note-finder-${target}-${opts.region.start}-${opts.region.end}`,
    pc: target,
    name: noteName(target, "sharp", false),
    region: opts.region,
    answers: pcPositions(opts.tuning, target, opts.region, opts.strings),
  };
}

export const RECALL_INTERVALS = [
  { semitones: 3, label: "Minor third" },
  { semitones: 4, label: "Major third" },
  { semitones: 7, label: "Perfect fifth" },
  { semitones: 12, label: "Octave" },
] as const;
export const RECALL_REGIONS = [
  { start: 0, end: 4 },
  { start: 5, end: 9 },
  { start: 10, end: 14 },
];

export interface IntervalRecallPrompt {
  id: string;
  semitones: number;
  region: number;
  anchor: FretTarget;
  targetMidi: number;
  answers: FretPosition[];
  skillIds: string[];
}

/** From an unlabelled anchor, find the ascending interval inside the region's 5-fret window. */
export function intervalRecallPrompt(
  rand: Rand,
  opts: { tuning: Tuning; region: number; semitones: number },
): IntervalRecallPrompt {
  const window = RECALL_REGIONS[opts.region] ?? RECALL_REGIONS[0];
  const anchors: FretTarget[] = [];
  opts.tuning.openStrings.forEach((_, i) => {
    for (let fret = window.start; fret <= Math.min(window.end, opts.tuning.fretCount); fret++) {
      const midi = midiAt(opts.tuning, i + 1, fret);
      if (positionsOf(opts.tuning, midi + opts.semitones, window).length)
        anchors.push({ string: i + 1, fret, midi });
    }
  });
  const anchor = pick(rand, anchors);
  const targetMidi = anchor.midi + opts.semitones;
  return {
    id: `interval-recall-${opts.semitones}-${anchor.string}-${anchor.fret}`,
    semitones: opts.semitones,
    region: RECALL_REGIONS.indexOf(window),
    anchor,
    targetMidi,
    answers: positionsOf(opts.tuning, targetMidi, window),
    skillIds: ["technique.guitar.intervals", `technique.guitar.intervals.${opts.semitones}`],
  };
}

// ---------------------------------------------------------------------------
// Chord-perfect and chord changes

/**
 * Per-string targets of a shape (or one of its positions) in string order, the
 * lowest string first, as the strings are picked. On a re-entrant ukulele that
 * is not pitch order (string 4 is high). `tuning` defaults to the shape's own.
 */
export function chordPerfectTargets(
  shape: Pick<ChordShape, "frets" | "fingers" | "tuningId">,
  tuning: Tuning = tuningById(shape.tuningId)!,
) {
  return shapeNotes(tuning, shape.frets)
    .sort((a, b) => b.string - a.string)
    .map((n) => ({
      ...n,
      finger: shape.fingers[n.string - 1] ?? undefined,
    }));
}

export const chordShapeSkills = (
  instrument: "guitar" | "ukulele",
  mode: "build" | "pick" | "strum" | "changes",
) =>
  mode === "changes"
    ? ["technique.strings.chord-changes", `technique.${instrument}.chord-changes`]
    : mode === "strum"
      ? ["technique.strings.open-chord-id", `technique.${instrument}.open-chord-id`]
      : ["technique.strings.chord-perfect", `technique.${instrument}.chord-perfect`];

export const CHANGES_SETUP = { roundTrips: [1, 8] as const, timedSeconds: 60, beatsPerChord: 4 };

/** Suggested from/to pairs: each shape's authored common transitions that exist as shapes. */
export function chordChangePairs(instrument: "guitar" | "ukulele") {
  const shapes = CHORD_SHAPES.filter((s) => s.instrument === instrument);
  const ids = new Set(shapes.map((s) => s.id));
  return shapes.flatMap((s) =>
    s.commonTransitions.filter((t) => ids.has(t)).map((to) => ({ from: s.id, to })),
  );
}

/** Pitch classes a shape sounds (for strum-and-identify verification). */
export const shapePcs = (
  shape: Pick<ChordShape, "frets" | "tuningId">,
  tuning: Tuning = tuningById(shape.tuningId)!,
) => [...new Set(shapeNotes(tuning, shape.frets).map((n) => pc(n.midi)))];
