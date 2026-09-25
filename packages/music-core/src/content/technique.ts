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
  handLines,
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

export const SCALE_TEMPO = { min: 60, max: 180, default: 100 };

export interface ScaleSetup {
  kind: ScaleKind;
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

/** One expected step per beat of the line. */
export function scaleDrillTargets(setup: ScaleSetup): ScaleStep[] {
  const line = scaleLine(setup.kind, setup.tonic, setup.span, setup.motion);
  return handLines(line, setup.hands).map((midis, index) => ({
    index,
    atBeat: index,
    notes: midis.map((midi, i) => ({
      midi,
      hand:
        setup.hands === "both"
          ? i === 0
            ? "left"
            : "right"
          : setup.hands === "left"
            ? "left"
            : "right",
    })),
  }));
}

export const scaleSkills = (kind: ScaleKind) =>
  ["technique.scales", `technique.scale.${kind}`].filter((id) => SKILL_IDS.has(id));

/** Stable setup key for the tempo ladder (scale, tonic, motion, span, hands). */
export const scaleSetupKey = (
  s: Pick<ScaleSetup, "kind" | "tonic" | "motion" | "span" | "hands">,
) => [s.kind, s.tonic, s.motion, s.span, s.hands].join("|");

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
