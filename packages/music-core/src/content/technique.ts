// Technique targets: scale drill, spider, positions, note finder, interval recall,
// chord-perfect and chord changes.

import {
  CHORD_SHAPES,
  FRETBOARD_PATTERNS,
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

/** What the drill plays: the scale, or the tonic chord as an arpeggio, broken through its inversions, or blocked. */
export type ScalePattern = "scale" | "arpeggio" | "broken" | "blocked";
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
  return pattern === "scale" ? g.scale : g.arpeggio;
};

/**
 * The tonic chord as steps (each a list of right-hand pitches): an arpeggio
 * over one or two octaves, broken through each inversion in turn, or blocked
 * inversion by inversion. Down and up-down mirror it, as scales do.
 */
export function chordSteps(
  kind: ChordKind,
  tonic: number,
  pattern: Exclude<ScalePattern, "scale">,
  octaves: 1 | 2,
  motion: ScaleMotion,
): number[][] {
  const iv = CHORD_KINDS.find((c) => c.id === kind)!.intervals;
  const n = iv.length;
  const tone = (t: number) => tonic + iv[t % n] + 12 * Math.floor(t / n);
  const inversion = (k: number) => Array.from({ length: n }, (_, j) => tone(k + j));
  let up: number[][];
  if (pattern === "arpeggio") up = Array.from({ length: n * octaves + 1 }, (_, t) => [tone(t)]);
  else {
    const chords = Array.from({ length: n * octaves + 1 }, (_, k) => inversion(k));
    up = pattern === "blocked" ? chords : chords.flatMap((c) => c.map((m) => [m]));
  }
  const down = [...up].reverse();
  if (motion === "up") return up;
  if (motion === "down") return down;
  return [...up, ...down.slice(1)];
}

export interface ScaleSetup {
  kind: ScaleKind;
  /** Default "scale". */
  pattern?: ScalePattern;
  /** The chord for arpeggios and broken or blocked chords (default major). */
  chord?: ChordKind;
  /** Notes per click (default 1). */
  perBeat?: 1 | 2 | 4;
  tonic: number;
  span: ScaleSpan;
  motion: ScaleMotion;
  hands: ScaleHands;
  bpm: number;
  /** Extra bar some presets add: evenness must reach this outright. */
  minEvenness?: number;
}

/** The one-tap preset; it keeps the chosen scale and tonic. */
export const HANDS_TOGETHER_PRESET = {
  label: "Hands together, one octave, 80",
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

/** One expected step per note-time of the line (`perBeat` of them to a click). */
export function scaleDrillTargets(setup: ScaleSetup): ScaleStep[] {
  const pattern = setup.pattern ?? "scale";
  const right =
    pattern === "scale"
      ? scaleLine(setup.kind, setup.tonic, setup.span, setup.motion).map((m) => [m])
      : chordSteps(
          setup.chord ?? "major",
          setup.tonic,
          pattern,
          setup.span === "two-octave" ? 2 : 1,
          setup.motion,
        );
  const per = setup.perBeat ?? 1;
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

export const scaleSkills = (kind: ScaleKind, pattern: ScalePattern = "scale") =>
  pattern === "arpeggio"
    ? ["technique.arpeggios"]
    : pattern !== "scale"
      ? ["technique.chord-inversions"]
      : ["technique.scales", `technique.scale.${kind}`].filter((id) => SKILL_IDS.has(id));

/** Stable setup key for the tempo ladder (pattern, scale or chord, tonic, motion, span, hands, notes a click). */
export const scaleSetupKey = (
  s: Pick<
    ScaleSetup,
    "kind" | "tonic" | "motion" | "span" | "hands" | "pattern" | "chord" | "perBeat"
  >,
) => {
  const base = [s.kind, s.tonic, s.motion, s.span, s.hands];
  const pattern = s.pattern ?? "scale";
  // Scales one note a click keep their old keys, so stored ladders still apply.
  if (pattern === "scale" && (s.perBeat ?? 1) === 1) return base.join("|");
  return [
    pattern,
    pattern === "scale" ? s.kind : (s.chord ?? "major"),
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

/** Strings in a span, from the start string toward string 1. */
// ponytail: a span that runs past string 1 is cut short rather than shifted.
export const spiderStrings = (start: number, span: SpiderSpanId) =>
  Array.from({ length: Math.min(SPAN_SIZE[span], start) }, (_, i) => start - i);

/**
 * Spider: the pattern's four frets on each string of the span in turn. With
 * crossing, each step lands on the next string, one pass starting from each string.
 */
export function spiderTargets(opts: {
  patternId: string;
  tuning: Tuning;
  string: number;
  span: SpiderSpanId;
  startFret: number;
  crossing: boolean;
}): FretTarget[] {
  const pattern = SPIDER_PATTERNS.find((p) => p.id === opts.patternId) ?? SPIDER_PATTERNS[0];
  const start = Math.min(Math.max(0, Math.round(opts.startFret)), spiderMaxStartFret(opts.tuning));
  const strings = spiderStrings(Math.min(opts.string, opts.tuning.openStrings.length), opts.span);
  const at = (string: number, offset: number): FretTarget => {
    const fret = start + offset;
    return {
      string,
      fret,
      midi: midiAt(opts.tuning, string, fret),
      finger: fret === 0 ? 0 : offset + 1,
    };
  };
  if (!opts.crossing) return strings.flatMap((s) => pattern.fretOffsets.map((o) => at(s, o)));
  return strings.flatMap((_, pass) =>
    pattern.fretOffsets.map((o, step) => at(strings[(pass + step) % strings.length], o)),
  );
}

export const POSITION_PATTERNS = FRETBOARD_PATTERNS;
/** Where a shape's lowest fret sits relative to the root fret (E 0, D 2, C 4, A 7, G 9). */
export const baseOffset = (p: FretboardPatternDef) =>
  Math.min(...p.offsets.map((o) => o.fretOffset));
/** Root frets that keep the whole shape on the neck. */
export const positionRootFretMax = (p: FretboardPatternDef, t: Tuning) =>
  t.fretCount - Math.max(...p.offsets.map((o) => o.fretOffset));

/** A box or CAGED shape at a root fret (on string 6), arpeggiated low string to high. */
export function positionTargets(opts: {
  patternId: string;
  tuning: Tuning;
  rootFret: number;
}): FretTarget[] {
  const p = POSITION_PATTERNS.find((x) => x.id === opts.patternId) ?? POSITION_PATTERNS[0];
  return p.offsets
    .filter((o) => o.stringNumber <= opts.tuning.openStrings.length)
    .map((o) => ({ string: o.stringNumber, fret: opts.rootFret + o.fretOffset }))
    .filter((t) => t.fret >= 0 && t.fret <= opts.tuning.fretCount)
    .sort((a, b) => b.string - a.string || a.fret - b.fret)
    .map((t) => ({ ...t, midi: midiAt(opts.tuning, t.string, t.fret) }));
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

/** Five recent correct independent answers suggest the next region up. */
export function suggestRecallRegion(region: number, recentCorrect: boolean[]): number {
  const last5 = recentCorrect.slice(-5);
  return last5.length === 5 && last5.every(Boolean)
    ? Math.min(region + 1, RECALL_REGIONS.length - 1)
    : region;
}

// ---------------------------------------------------------------------------
// Chord-perfect and chord changes

/** Per-string targets of a shape (or one of its positions), in ascending pitch order. */
export function chordPerfectTargets(shape: Pick<ChordShape, "frets" | "fingers" | "tuningId">) {
  const tuning = tuningById(shape.tuningId)!;
  return shapeNotes(tuning, shape.frets).map((n) => ({
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
export const shapePcs = (shape: Pick<ChordShape, "frets" | "tuningId">) => [
  ...new Set(shapeNotes(tuningById(shape.tuningId)!, shape.frets).map((n) => pc(n.midi))),
];
