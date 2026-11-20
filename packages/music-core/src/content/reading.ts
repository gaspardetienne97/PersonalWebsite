// Note-reading flashcards and generated sight-reading phrases.

import {
  READING_LEVELS as AUTHORED_LEVELS,
  type ReadingLevelDef,
  type ReadingLevelId,
} from "../data";
import type { Score, ScoreGroup, ScoreNote, ScoreVoice } from "../types";
import { pc, pcOf } from "../theory/notes";
import {
  choicesForKey,
  diatonicNames,
  enharmonicEqual,
  keyByName,
  spellInKey,
  type KeySignature,
} from "../theory/spelling";
import { pick, randInt, type Rand } from "./random";
import { m } from "@repo/i18n/messages.js";

export type Clef = "treble" | "bass";

/** Meters a phrase can be written in; "simple" is 4/4 and "compound" 6/8, the first two. */
export type ReadingMeter =
  | "simple"
  | "compound"
  | "2/4"
  | "3/4"
  | "3/8"
  | "9/8"
  | "2/2"
  | "5/4"
  | "7/8"
  | "5/8"
  | "changing";
export const READING_METERS: Record<
  ReadingMeter,
  { beats: number; beatUnit: number; label: string }
> = {
  simple: { beats: 4, beatUnit: 4, label: "4/4" },
  compound: { beats: 6, beatUnit: 8, label: "6/8" },
  "2/4": { beats: 2, beatUnit: 4, label: "2/4" },
  "3/4": { beats: 3, beatUnit: 4, label: "3/4" },
  "3/8": { beats: 3, beatUnit: 8, label: "3/8" },
  "9/8": { beats: 9, beatUnit: 8, label: "9/8" },
  "2/2": { beats: 2, beatUnit: 2, label: "2/2" },
  "5/4": { beats: 5, beatUnit: 4, label: "5/4" },
  "7/8": { beats: 7, beatUnit: 8, label: "7/8" },
  "5/8": { beats: 5, beatUnit: 8, label: "5/8" },
  changing: { beats: 4, beatUnit: 4, label: m.music_content_reading_meter_changing() },
};
/** The "changing" meter: a change every 2 bars, through these in turn. */
export const CHANGING_METERS: ReadingMeter[] = ["simple", "3/4", "5/8"];
/** The meter of each 2-bar part of a changing-meter phrase this many bars long. */
export const changingMeterParts = (measures: number): ReadingMeter[] =>
  Array.from(
    { length: Math.ceil(measures / 2) },
    (_, i) => CHANGING_METERS[i % CHANGING_METERS.length],
  );

export interface ReadingLevel extends ReadingLevelDef {
  /** Who reads it: both hands at the piano, one line (guitar, ukulele, Aerophone), or either. */
  reader: "any" | "piano" | "line";
  meters: ReadingMeter[];
  /** The keys the level climb visits (each a rung); the authored levels visit all of theirs. */
  climbKeys: string[];
  /** Bars a phrase has when the level is picked. */
  measures?: number;
  /** Written straight, played swung: the eighths long-short (jazz lines). */
  swing?: boolean;
}

const PIANO_4_KEYS = [
  "C major",
  "G major",
  "F major",
  "D major",
  "A minor",
  "D minor",
  "E minor",
  "G minor",
];
const PIANO_5_KEYS = [...PIANO_4_KEYS, "A major", "Bb major", "Eb major", "B minor", "C minor"];
const PIANO_7_KEYS = [...PIANO_5_KEYS, "E major", "Ab major", "F# minor"];
const PIANO_8_KEYS = [...PIANO_7_KEYS, "C# minor", "F minor"];
const PIANO_9_KEYS = [...PIANO_8_KEYS, "B major", "Db major", "Bb minor"];
const JAZZ_KEYS = ["C major", "F major", "Bb major", "Eb major", "G major", "D major"];
const LINE_4_KEYS = [
  "C major",
  "G major",
  "D major",
  "F major",
  "Bb major",
  "A minor",
  "E minor",
  "B minor",
  "D minor",
  "G minor",
];
const LINE_5_KEYS = [...LINE_4_KEYS, "A major", "Eb major", "F# minor", "C minor"];
const LINE_6_KEYS = [...LINE_5_KEYS, "E major", "Ab major", "C# minor", "F minor"];
const grand: Clef[] = ["treble", "bass"];

/**
 * The levels past 3 (reading.md section 2): piano grand-staff levels toward
 * ABRSM Grade 6 and single-line levels for guitar, ukulele and the Aerophone.
 * The authored four stay in reading-levels.json; these are written here.
 */
const MORE_LEVELS: ReadingLevel[] = [
  {
    id: "piano-4",
    label: m.music_content_reading_piano_4_label(),
    description:
      m.music_content_reading_piano_4_description(),
    rhythm: m.music_content_reading_piano_4_rhythm(),
    recommendedDifficulty: 0.75,
    recommendedClefs: grand,
    recommendedRange: { lowestMidi: 41, highestMidi: 79 },
    recommendedKeys: PIANO_4_KEYS,
    reader: "piano",
    meters: ["simple", "3/4", "2/4"],
    climbKeys: ["C major", "G major", "A minor", "G minor"],
    measures: 4,
  },
  {
    id: "piano-5",
    label: m.music_content_reading_piano_5_label(),
    description:
      m.music_content_reading_piano_5_description(),
    rhythm: m.music_content_reading_piano_5_rhythm(),
    recommendedDifficulty: 0.8,
    recommendedClefs: grand,
    recommendedRange: { lowestMidi: 41, highestMidi: 84 },
    recommendedKeys: PIANO_5_KEYS,
    reader: "piano",
    meters: ["simple", "3/4", "2/4", "3/8"],
    climbKeys: ["D major", "Bb major", "A major", "Eb major", "C minor"],
    measures: 8,
  },
  {
    id: "piano-6",
    label: m.music_content_reading_piano_6_label(),
    description:
      m.music_content_reading_piano_6_description(),
    rhythm: m.music_content_reading_piano_6_rhythm(),
    recommendedDifficulty: 0.85,
    recommendedClefs: grand,
    recommendedRange: { lowestMidi: 41, highestMidi: 84 },
    recommendedKeys: PIANO_5_KEYS,
    reader: "piano",
    meters: ["simple", "3/4", "compound"],
    climbKeys: ["G major", "F major", "E minor", "Eb major", "B minor"],
    measures: 8,
  },
  {
    id: "piano-7",
    label: m.music_content_reading_piano_7_label(),
    description:
      m.music_content_reading_piano_7_description(),
    rhythm: m.music_content_reading_piano_7_rhythm(),
    recommendedDifficulty: 0.9,
    recommendedClefs: grand,
    recommendedRange: { lowestMidi: 41, highestMidi: 86 },
    recommendedKeys: PIANO_7_KEYS,
    reader: "piano",
    meters: ["simple", "3/4", "compound", "2/2"],
    climbKeys: ["E major", "Ab major", "F# minor", "C minor"],
    measures: 8,
  },
  {
    id: "piano-8",
    label: m.music_content_reading_piano_8_label(),
    description:
      m.music_content_reading_piano_8_description(),
    rhythm: m.music_content_reading_piano_8_rhythm(),
    recommendedDifficulty: 0.95,
    recommendedClefs: grand,
    recommendedRange: { lowestMidi: 41, highestMidi: 88 },
    recommendedKeys: PIANO_8_KEYS,
    reader: "piano",
    meters: ["simple", "3/4", "compound", "9/8", "5/4"],
    climbKeys: ["A major", "E major", "C# minor", "F minor", "Ab major"],
    measures: 12,
  },
  {
    id: "piano-9",
    label: m.music_content_reading_piano_9_label(),
    description:
      m.music_content_reading_piano_9_description(),
    rhythm: m.music_content_reading_piano_9_rhythm(),
    recommendedDifficulty: 0.97,
    recommendedClefs: grand,
    recommendedRange: { lowestMidi: 36, highestMidi: 91 },
    recommendedKeys: PIANO_9_KEYS,
    reader: "piano",
    meters: ["simple", "3/4", "compound", "7/8", "5/8", "5/4", "9/8", "2/2", "changing"],
    climbKeys: ["B major", "Db major", "Bb minor", "C# minor", "Ab major"],
    measures: 16,
  },
  {
    id: "line-4",
    label: m.music_content_reading_line_4_label(),
    description:
      m.music_content_reading_line_4_description(),
    rhythm: m.music_content_reading_line_4_rhythm(),
    recommendedDifficulty: 0.75,
    recommendedClefs: ["treble"],
    recommendedRange: { lowestMidi: 52, highestMidi: 84 },
    recommendedKeys: LINE_4_KEYS,
    reader: "line",
    meters: ["simple", "3/4", "2/4"],
    climbKeys: ["D major", "Bb major", "B minor", "G minor"],
    measures: 4,
  },
  {
    id: "line-5",
    label: m.music_content_reading_line_5_label(),
    description: m.music_content_reading_line_5_description(),
    rhythm: m.music_content_reading_line_5_rhythm(),
    recommendedDifficulty: 0.82,
    recommendedClefs: ["treble"],
    recommendedRange: { lowestMidi: 52, highestMidi: 86 },
    recommendedKeys: LINE_5_KEYS,
    reader: "line",
    meters: ["simple", "3/4", "2/4", "compound"],
    climbKeys: ["A major", "Eb major", "F# minor", "C minor"],
    measures: 8,
  },
  {
    id: "line-6",
    label: m.music_content_reading_line_6_label(),
    description:
      m.music_content_reading_line_6_description(),
    rhythm:
      m.music_content_reading_line_6_rhythm(),
    recommendedDifficulty: 0.9,
    recommendedClefs: ["treble"],
    recommendedRange: { lowestMidi: 52, highestMidi: 89 },
    recommendedKeys: LINE_6_KEYS,
    reader: "line",
    meters: ["simple", "3/4", "2/4", "compound", "2/2", "3/8"],
    climbKeys: ["E major", "Ab major", "C# minor", "F minor"],
    measures: 8,
  },
  {
    id: "line-jazz",
    label: m.music_content_reading_jazz_label(),
    description:
      m.music_content_reading_jazz_description(),
    rhythm: m.music_content_reading_jazz_rhythm(),
    recommendedDifficulty: 0.85,
    recommendedClefs: ["treble"],
    recommendedRange: { lowestMidi: 55, highestMidi: 84 },
    recommendedKeys: JAZZ_KEYS,
    reader: "line",
    meters: ["simple"],
    climbKeys: ["F major", "Bb major", "Eb major"],
    measures: 8,
    swing: true,
  },
];

export const READING_LEVELS: ReadingLevel[] = [
  ...AUTHORED_LEVELS.map((l) => ({
    ...l,
    reader: "any" as const,
    meters: ["simple", "compound"] as ReadingMeter[],
    climbKeys: l.recommendedKeys,
  })),
  ...MORE_LEVELS,
];
export const readingLevel = (id: ReadingLevelId) =>
  READING_LEVELS.find((l) => l.id === id) ?? READING_LEVELS[0];
/** A level id from a URL or saved setup, the Primer when it is not one. */
export const readingLevelId = (id: string): ReadingLevelId =>
  READING_LEVELS.find((l) => l.id === id)?.id ?? "primer";
/** The levels an instrument reads: the authored four, then the piano's or the single line's. */
export const levelsFor = (instrument: string) =>
  READING_LEVELS.filter(
    (l) => l.reader === "any" || l.reader === (instrument === "piano" ? "piano" : "line"),
  );
/** The meter a level writes in: the one asked for when the level has it, else its first. */
export const levelMeter = (level: ReadingLevelId, meter: string): ReadingMeter => {
  const ms = readingLevel(level).meters;
  return ms.find((m) => m === meter) ?? ms[0];
};

/** Reading setup bounds and defaults (catalog 4.2). */
export const READING_DEFAULTS = {
  range: [48, 84] as [number, number],
  rangeLimits: [21, 108] as [number, number],
  bpm: 90,
  bpmLimits: [40, 200] as [number, number],
  measures: 2,
  measureLimits: [1, 8] as [number, number],
};

/**
 * The written range a level reads on the given clefs. Each clef gets the level's
 * reach on its side of middle C, at least an octave, so the bass clef at the
 * Primer reads C3 to C4 rather than ledger lines above it. Both clefs span from
 * the bass low to the treble high and split at middle C.
 */
export function readingRange(level: ReadingLevelId, clefs: readonly Clef[]): [number, number] {
  const l = readingLevel(level);
  const r = l.recommendedRange;
  // A single-line level reads its whole range on the treble clef, low notes on ledger lines.
  if (l.reader === "line") return [r.lowestMidi, r.highestMidi];
  const up = Math.max(12, r.highestMidi - 60);
  const down = Math.max(12, 60 - r.lowestMidi);
  return [clefs.includes("bass") ? 60 - down : 60, clefs.includes("treble") ? 60 + up : 60];
}

const keyOrC = (name: string) => keyByName(name) ?? keyByName("C major")!;
const diatonicPcs = (k: KeySignature) => new Set(diatonicNames(k).map((n) => pcOf(n)!));
const diatonicIn = (k: KeySignature, lo: number, hi: number) => {
  const pcs = diatonicPcs(k);
  const out: number[] = [];
  for (let m = lo; m <= hi; m++) if (pcs.has(pc(m))) out.push(m);
  return out;
};

// ---------------------------------------------------------------------------
// Flashcards

export type FlashcardKind = "note" | "chord" | "satb";

export interface FlashcardPrompt {
  id: string;
  /** A note, a root-position triad, or a four-part chord (doubled root) across the grand staff. */
  kind: FlashcardKind;
  clef: Clef;
  key: string;
  midi: number[];
  /** Spelled names, low to high, hyphen-joined for chords ("C-E-G"). */
  answer: string;
  choices: string[];
  skillIds: string[];
  difficulty: number;
}

/**
 * A diatonic note or root-position diatonic triad in the key and range. With both
 * clefs, the clef is drawn first and splits the range at middle C (treble >= 60);
 * `crossed` drops the split, so either clef shows notes from the whole range (the
 * left hand reading treble, the right hand bass). `accidentals` adds the other five
 * notes of the octave, spelled for the key. A four-part chord puts a root-position
 * triad on the grand staff in chorale spacing and is named as the triad.
 */
export function flashcardPrompt(
  rand: Rand,
  opts: {
    kind: FlashcardKind;
    clefs: Clef[];
    key: string;
    range: [number, number];
    difficulty: number;
    accidentals?: boolean;
    crossed?: boolean;
  },
): FlashcardPrompt {
  const k = keyOrC(opts.key);
  const [lo, hi] = opts.range;
  const names = diatonicNames(k);
  const triads = names.map((_, j) => [0, 2, 4].map((o) => names[(j + o) % 7]).join("-"));
  if (opts.kind === "satb") return satbPrompt(rand, k, opts.range, triads, opts.difficulty);
  const all =
    opts.accidentals && opts.kind === "note"
      ? Array.from({ length: Math.max(0, hi - lo + 1) }, (_, i) => lo + i)
      : diatonicIn(k, lo, hi);
  let clef = opts.clefs.length > 1 ? pick(rand, opts.clefs) : (opts.clefs[0] ?? "treble");
  const side = (c: Clef) =>
    opts.clefs.length > 1 && !opts.crossed
      ? (m: number) => (c === "treble" ? m >= 60 : m < 60)
      : () => true;
  const rootOk = (i: number) => opts.kind === "note" || i + 4 < all.length;
  let roots = all.map((m, i) => i).filter((i) => side(clef)(all[i]) && rootOk(i));
  if (roots.length === 0) {
    clef = clef === "treble" ? "bass" : "treble";
    roots = all.map((m, i) => i).filter((i) => side(clef)(all[i]) && rootOk(i));
  }
  if (roots.length === 0) throw new Error(`No ${opts.kind} fits ${opts.key} in ${lo}-${hi}`);
  const i = pick(rand, roots);
  const midi = opts.kind === "note" ? [all[i]] : [all[i], all[i + 2], all[i + 4]];
  const choices = opts.kind === "note" ? choicesForKey(k) : triads;
  return {
    id: `flash-${opts.kind}-${clef}-${k.name}-${midi.join("_")}`,
    kind: opts.kind,
    clef,
    key: k.name,
    midi,
    // A note is named as its button reads (C rather than B# in C# minor).
    answer:
      opts.kind === "note" ? choices[pc(midi[0])] : midi.map((m) => spellInKey(m, k)).join("-"),
    choices,
    skillIds: [
      `reading.${clef}`,
      opts.kind === "note" ? `reading.${clef}.landmarks` : "reading.polyphonic",
    ],
    difficulty: opts.difficulty,
  };
}

/**
 * Four parts in chorale spacing: the root in the bass (F2 to G3), then tenor,
 * alto and soprano in close position above it, each upper voice a chord tone and
 * the root doubled. Its clef is the bass's; the card draws both staves.
 */
function satbPrompt(
  rand: Rand,
  k: KeySignature,
  [lo, hi]: [number, number],
  triads: string[],
  difficulty: number,
): FlashcardPrompt {
  const scale = scalePcs(k);
  // The diminished triad is left out, as chorales rarely sit on it in root position.
  const degrees = [0, 1, 2, 3, 4, 5].filter((d) => k.mode === "major" || d !== 1);
  for (let tries = 0; ; tries++) {
    const d = pick(rand, degrees);
    const tones = [0, 2, 4].map((o) => scale[(d + o) % 7]);
    const basses = [];
    for (let m = Math.max(lo, 41); m <= Math.min(hi, 55); m++)
      if (pc(m) === tones[0]) basses.push(m);
    if (!basses.length && tries < 20) continue;
    const bass = basses.length ? pick(rand, basses) : 48 + tones[0];
    const top = randInt(rand, 0, 2);
    const upper: number[] = [];
    let m = Math.max(bass + 3, 52);
    for (const t of [0, 1, 2].map((j) => tones[(top + j) % 3])) {
      while (pc(m) !== t) m++;
      upper.push(m++);
    }
    const midi = [bass, ...upper];
    const root = spellInKey(scale[d], k);
    return {
      id: `flash-satb-${k.name}-${midi.join("_")}`,
      kind: "satb",
      clef: "bass",
      key: k.name,
      midi,
      answer: triads.find((t) => t.split("-")[0] === root)!,
      choices: triads,
      skillIds: ["reading.treble", "reading.bass", "reading.polyphonic"],
      difficulty,
    };
  }
}
/** The key's scale as pitch classes from the tonic up (natural minor). */
const scalePcs = (k: KeySignature) => {
  const pcs = [...diatonicPcs(k)].sort((a, b) => a - b);
  const i = pcs.indexOf(k.tonicPc);
  return [...pcs.slice(i), ...pcs.slice(0, i)];
};

/**
 * A run of cards drawn as a shuffle bag: every card in the range once before
 * any comes back, and never the same card twice in a row.
 */
export function flashcardDeck(
  rand: Rand,
  opts: Parameters<typeof flashcardPrompt>[1],
  length: number,
): FlashcardPrompt[] {
  const deck: FlashcardPrompt[] = [];
  let seen = new Set<string>();
  while (deck.length < length) {
    let p = flashcardPrompt(rand, opts);
    for (let t = 0; t < 60 && seen.has(p.id); t++) p = flashcardPrompt(rand, opts);
    // ponytail: "every card seen" is guessed from 60 misses; a small chance of starting the next round early.
    if (seen.has(p.id) && seen.size > 1) {
      seen = new Set([deck.at(-1)!.id]);
      continue;
    }
    seen.add(p.id);
    deck.push(p);
  }
  return deck;
}

/** Enharmonic-tolerant answer check; a played answer compares pitch classes, octave-lenient. */
export function flashcardCorrect(prompt: FlashcardPrompt, response: string | number[]): boolean {
  if (typeof response === "string") return enharmonicEqual(prompt.answer, response);
  const want = [...new Set(prompt.midi.map(pc))].sort();
  const got = [...new Set(response.map(pc))].sort();
  return want.length === got.length && want.every((p, i) => p === got[i]);
}

// ---------------------------------------------------------------------------
// Sight-reading

// Rhythm cells per level in quarter-note beats (the Score convention). Simple meters
// (x/4, 2/2) take the simple cells, a beat a quarter; compound meters (x/8) take the
// compound cells, a beat a dotted quarter (1.5). A negative value is a rest. Every
// level has a cell that fills any remaining space, so bars always total exactly.
// ponytail: the cell sets and step sizes below render the levels' one-line rhythm
// descriptions; the old app's exact generator was not in the context.
interface LevelGen {
  simple: number[][];
  compound: number[][];
  /** Largest melodic step, in scale steps. */
  maxStep: number;
  /** Mostly steps, with scale and arpeggio fragments, rather than an even random walk. */
  figures?: boolean;
  /** Chance a note is tied over the bar line into the next bar. */
  ties?: number;
  /** Chance a note off the strong beats becomes a chromatic passing or neighbour note. */
  chromatic?: number;
  /** Half the phrases open with a pickup: the first bar rests until its last beat. */
  pickup?: boolean;
  /** Piano: the right hand stays in a five-finger position. */
  fiveFinger?: boolean;
  /** Piano: the left hand accompanies a progression instead of reading its own line. */
  lh?: "roots" | "dyads" | "broken" | "chorale";
  /** Piano: notes on strong beats add chord tones below the melody (1: a lower voice, 2: octaves and three-note chords). */
  rhChords?: 1 | 2;
  /** Piano: a bar or two of the left hand moves up into the treble clef. */
  clefChange?: boolean;
  /** A jazz line: chord tones on the beat, blue notes, chromatic approaches into the beat. */
  jazz?: boolean;
}
const SIMPLE_BASE = [[1], [2], [0.5, 0.5]];
const COMPOUND_BASE = [[1.5], [1, 0.5], [0.5, 0.5, 0.5]];
const SIXTEENTHS = [
  [0.5, 0.25, 0.25],
  [0.25, 0.25, 0.5],
];
/** An eighth triplet, three in the time of two (engraved with a 3). */
const TRIPLET = [1 / 3, 1 / 3, 1 / 3];
/** Odd eighth meters fill each group (2+2+3, 2+3); a two-eighth group takes these cells. */
const ODD_GROUPS: Record<string, number[]> = { "7/8": [1, 1, 1.5], "5/8": [1, 1.5] };
const TWO_EIGHTHS = [[1], [0.5, 0.5], [-0.5, 0.5]];
const GEN: Record<ReadingLevelId, LevelGen> = {
  primer: { simple: [[1], [2]], compound: [[1.5], [1, 0.5]], maxStep: 1 },
  "level-1": { simple: [[1], [2], [0.5, 0.5]], compound: [[1.5], [1, 0.5]], maxStep: 1 },
  "level-2": {
    simple: [[0.5, 0.5], [1], [2], [0.5, 0.5, 0.5, 0.5]],
    compound: [[1.5], [1, 0.5], [0.5, 0.5, 0.5]],
    maxStep: 2,
  },
  "level-3": {
    simple: [[0.5, 0.5], [1], [1.5, 0.5], [0.5, 1, 0.5]],
    compound: [[1.5], [1, 0.5], [0.5, 0.5, 0.5], [0.5, 1]],
    maxStep: 3,
  },
  "piano-4": {
    simple: [...SIMPLE_BASE, [1.5, 0.5], [-1], [-2], [3]],
    compound: COMPOUND_BASE,
    maxStep: 2,
    figures: true,
    ties: 0.2,
    fiveFinger: true,
    lh: "roots",
  },
  "piano-5": {
    simple: [...SIMPLE_BASE, [1.5, 0.5], [-1], ...SIXTEENTHS],
    compound: [...COMPOUND_BASE, [0.5, 0.25, 0.25, 0.5], [-0.5, 0.5, 0.5]],
    maxStep: 5,
    figures: true,
    ties: 0.15,
    lh: "dyads",
  },
  "piano-6": {
    simple: [...SIMPLE_BASE, [1.5, 0.5], [-1], ...SIXTEENTHS],
    compound: [...COMPOUND_BASE, [0.5, 1], [0.5, 0.25, 0.25, 0.5], [-0.5, 0.5, 0.5]],
    maxStep: 5,
    figures: true,
    ties: 0.15,
    chromatic: 0.25,
    pickup: true,
    lh: "broken",
  },
  "piano-7": {
    simple: [
      ...SIMPLE_BASE,
      [1.5, 0.5],
      [0.5, 1, 0.5],
      [0.75, 0.25],
      [0.5, 1.5],
      [-1],
      ...SIXTEENTHS,
    ],
    compound: [...COMPOUND_BASE, [0.5, 1], [0.75, 0.25, 0.5], [-0.5, 0.5, 0.5]],
    maxStep: 5,
    figures: true,
    ties: 0.2,
    chromatic: 0.2,
    pickup: true,
    lh: "chorale",
    rhChords: 1,
  },
  "piano-8": {
    simple: [
      ...SIMPLE_BASE,
      [1.5, 0.5],
      [0.5, 1, 0.5],
      [0.75, 0.25],
      [0.5, 1.5],
      [-1],
      ...SIXTEENTHS,
      TRIPLET,
    ],
    compound: [
      ...COMPOUND_BASE,
      [0.5, 1],
      [0.75, 0.25, 0.5],
      [0.5, 0.25, 0.25, 0.5],
      [-0.5, 0.5, 0.5],
    ],
    maxStep: 7,
    figures: true,
    ties: 0.2,
    chromatic: 0.25,
    pickup: true,
    lh: "broken",
    rhChords: 2,
    clefChange: true,
  },
  "line-4": {
    simple: [...SIMPLE_BASE, [1.5, 0.5], [-1], [-0.5, 0.5], [3]],
    compound: COMPOUND_BASE,
    maxStep: 4,
    figures: true,
    ties: 0.2,
  },
  "line-5": {
    simple: [...SIMPLE_BASE, [1.5, 0.5], [-1], [-0.5, 0.5], ...SIXTEENTHS],
    compound: [...COMPOUND_BASE, [0.5, 1], [-0.5, 0.5, 0.5]],
    maxStep: 7,
    figures: true,
    ties: 0.15,
    chromatic: 0.12,
    pickup: true,
  },
  "line-6": {
    simple: [
      ...SIMPLE_BASE,
      [1.5, 0.5],
      [0.5, 1, 0.5],
      [0.75, 0.25],
      [0.25, 0.5, 0.25],
      [0.5, 1.5],
      [-1],
      [-0.5, 0.5],
      ...SIXTEENTHS,
      TRIPLET,
    ],
    compound: [
      ...COMPOUND_BASE,
      [0.5, 1],
      [0.75, 0.25, 0.5],
      [0.5, 0.25, 0.25, 0.5],
      [-0.5, 0.5, 0.5],
    ],
    maxStep: 7,
    figures: true,
    ties: 0.2,
    chromatic: 0.3,
    pickup: true,
  },
  "piano-9": {
    simple: [
      ...SIMPLE_BASE,
      [1.5, 0.5],
      [0.5, 1, 0.5],
      [0.75, 0.25],
      [0.25, 0.5, 0.25],
      [0.5, 1.5],
      [-1],
      ...SIXTEENTHS,
      TRIPLET,
      [2 / 3, 1 / 3],
    ],
    compound: [
      ...COMPOUND_BASE,
      [0.5, 1],
      [0.75, 0.25, 0.5],
      [0.5, 0.25, 0.25, 0.5],
      [-0.5, 0.5, 0.5],
    ],
    maxStep: 9,
    figures: true,
    ties: 0.2,
    chromatic: 0.3,
    pickup: true,
    lh: "broken",
    rhChords: 2,
    clefChange: true,
  },
  "line-jazz": {
    simple: [[0.5, 0.5], [0.5, 0.5], [1], [1.5, 0.5], [0.5, 1, 0.5], [-0.5, 0.5], [2]],
    compound: COMPOUND_BASE,
    maxStep: 4,
    figures: true,
    ties: 0.3,
    jazz: true,
  },
};

/**
 * What a level's phrases can contain that a player may not have met, read from the generator's own
 * configuration for the level and meter (not from its one-line description). Durations are judged
 * in the note values of the meter: a 1.5 in a simple meter is a dotted quarter, but in x/8 it is the beat.
 * `piano` is the instrument; `grand` is a piano reading both clefs, the only case with an accompanied left hand.
 */
export type SightItem =
  | "ties"
  | "dotted-quarter"
  | "syncopation"
  | "sixteenths"
  | "dotted-eighth"
  | "triplets"
  | "rests"
  | "pickup"
  | "accidentals"
  | "chords"
  | "clef-change"
  | "swing";
export function sightReadingItems(
  levelId: ReadingLevelId,
  meter: string,
  who: { piano?: boolean; grand?: boolean; measures?: number } = {},
): SightItem[] {
  const level = readingLevel(levelId);
  const gen = GEN[level.id];
  const meterId = levelMeter(level.id, meter);
  // The phrase length, as the generator clamps it; without one, the longest phrase.
  const measures = Math.min(16, Math.max(1, Math.round(who.measures ?? 16)));
  const ids = meterId === "changing" ? [...new Set(changingMeterParts(measures))] : [meterId];
  const found = new Set<SightItem>();
  for (const id of ids) {
    const { beats, beatUnit } = READING_METERS[id];
    const compound = beatUnit === 8;
    const odd = ODD_GROUPS[`${beats}/${beatUnit}`];
    const cells = compound ? [...gen.compound, ...(odd ? TWO_EIGHTHS : [])] : gen.simple;
    for (const cell of cells) {
      let at = 0;
      for (const d of cell) {
        const v = Math.abs(d);
        if (d < 0) found.add("rests");
        if (v === 0.25) found.add("sixteenths");
        if (v === 0.75) found.add("dotted-eighth");
        if (Math.abs(v - 1 / 3) < 1e-9 || Math.abs(v - 2 / 3) < 1e-9) found.add("triplets");
        if (!compound && v === 1.5) found.add("dotted-quarter");
        if (!compound && d > 0 && v >= 1 && at % 1 === 0.5) found.add("syncopation");
        at += v;
      }
    }
  }
  // Ties cross a bar line; a pickup bar rests until its last note (both need a second bar).
  if (gen.ties && measures > 1) found.add("ties");
  if (gen.pickup && meterId !== "changing" && measures > 1) found.add("pickup").add("rests");
  if (gen.chromatic || gen.jazz) found.add("accidentals");
  // Chord tones are added to any piano line of a level that has them (the generator checks `piano && rhChords && chords`).
  if (who.piano && gen.rhChords && (gen.lh || gen.jazz)) found.add("chords");
  // A clef change needs 4 bars; a changing-meter phrase is built from 2-bar parts, too short for one.
  if (who.grand && gen.lh && gen.clefChange && meterId !== "changing" && measures >= 4)
    found.add("clef-change");
  if (level.swing) found.add("swing");
  return [...found];
}

export interface SightReadingOptions {
  level: ReadingLevelId;
  instrument: "piano" | "guitar" | "ukulele" | "aerophone";
  clefs?: Clef[];
  key?: string;
  range?: [number, number];
  measures: number;
  /** One of the level's meters; another falls back to the level's first. */
  meter: ReadingMeter;
  bpm: number;
  /** False keeps out a pickup bar (a chunk inside a longer phrase). */
  pickup?: boolean;
}

const sum = (xs: number[]) => xs.reduce((a, b) => a + Math.abs(b), 0);
/** Bar length in quarter-note beats. */
export const barQuarters = (meter: Score["meter"]) => (meter.beats * 4) / meter.beatUnit;

/** Durations bar by bar; a negative value is a rest. `groups` fills an odd meter group by group. */
function rhythm(
  rand: Rand,
  cells: number[][],
  barBeats: number,
  measures: number,
  groups: number[] = [barBeats],
): number[][] {
  const out: number[][] = [];
  // A cell is drawn only when what it leaves can still be filled (a 2-eighth cell can't open a 3-eighth group).
  const known = new Map<number, boolean>();
  const fillable = (left: number): boolean => {
    if (left < 1e-9) return true;
    const k = Math.round(left * 48);
    if (!known.has(k)) {
      known.set(k, false);
      known.set(
        k,
        cells.some((c) => sum(c) <= left + 1e-9 && fillable(left - sum(c))),
      );
    }
    return known.get(k)!;
  };
  for (let bar = 0; bar < measures; bar++) {
    const b: number[] = [];
    for (const group of groups) {
      let left = group;
      while (left > 1e-9) {
        const cell = pick(
          rand,
          cells.filter((c) => sum(c) <= left + 1e-9 && fillable(left - sum(c))),
        );
        b.push(...cell);
        left -= sum(cell);
      }
    }
    // A bar of rests alone reads as nothing to play: its last rest becomes a note.
    if (b.every((d) => d < 0)) b[b.length - 1] *= -1;
    out.push(b);
  }
  return out;
}

function melody(
  rand: Rand,
  pool: number[],
  tonicPc: number,
  count: number,
  maxStep: number,
  figures = false,
): number[] {
  const mid = (pool[0] + pool[pool.length - 1]) / 2;
  const tonics = pool.map((m, i) => i).filter((i) => pc(pool[i]) === tonicPc);
  let i = tonics.length
    ? tonics.reduce((a, b) => (Math.abs(pool[b] - mid) < Math.abs(pool[a] - mid) ? b : a))
    : Math.floor(pool.length / 2);
  const out = [pool[i]];
  // A figure: two or three more notes by step (a scale run) or by thirds (an arpeggio).
  let run = 0;
  let runStep = 1;
  while (out.length < count) {
    let step: number;
    if (figures && run === 0 && rand() < 0.3) {
      run = randInt(rand, 2, 3);
      runStep = (rand() < 0.6 ? 1 : 2) * (rand() < 0.5 ? -1 : 1);
    }
    if (run > 0) {
      step = runStep;
      run--;
    } else if (figures) {
      const r = rand();
      const size = r < 0.55 ? 1 : r < 0.8 ? 2 : randInt(rand, Math.min(3, maxStep), maxStep);
      step = Math.min(size, maxStep) * (rand() < 0.5 ? -1 : 1);
    } else step = randInt(rand, 1, maxStep) * (rand() < 0.5 ? -1 : 1);
    if (i + step < 0 || i + step >= pool.length) {
      step = -step;
      runStep = -runStep;
    }
    i = Math.min(pool.length - 1, Math.max(0, i + step));
    out.push(pool[i]);
  }
  return out;
}

/** The chord a bar sits on, as scale degrees from 0: I to start, V then I to close, else I, ii, IV, V or vi. */
function progression(rand: Rand, measures: number, rich: boolean): number[] {
  const pool = rich ? [0, 1, 3, 4, 5] : [0, 3, 4];
  return Array.from({ length: measures }, (_, b) =>
    b === 0 || (b === measures - 1 && measures > 1)
      ? 0
      : b === measures - 2 && measures > 2
        ? 4
        : pick(rand, pool),
  );
}

/** Strong beats of a bar, in quarter beats from its start: the downbeat, and the middle of an even bar. */
function strongBeats(meter: Score["meter"]): number[] {
  const bar = barQuarters(meter);
  const beat = meter.beatUnit === 8 ? 1.5 : 1;
  const beats = Math.round(bar / beat);
  return beats >= 4 && beats % 2 === 0 ? [0, bar / 2] : [0];
}

/** Split a bar into chord spans: halves of an even bar, 2 + 1 in 3/4, 3 + 2 in 5/4, dotted quarters in x/8. */
function spans(meter: Score["meter"]): number[] {
  const bar = barQuarters(meter);
  const odd = ODD_GROUPS[`${meter.beats}/${meter.beatUnit}`];
  if (odd) return odd;
  if (meter.beatUnit === 8) return Array.from({ length: Math.round(bar / 1.5) }, () => 1.5);
  if (bar === 3) return [2, 1];
  if (bar === 5) return [3, 2];
  if (bar === 2) return [1, 1];
  return [bar / 2, bar / 2];
}

/**
 * The left hand under a progression: whole-bar roots and fifths, two-note chords,
 * broken chords (Alberti in simple time, waltz bass in 3/4, rolling eighths in x/8)
 * or chorale dyads. The root sits between F2 and E3, so the hand stays on the bass staff.
 */
function accompaniment(
  rand: Rand,
  kind: NonNullable<LevelGen["lh"]>,
  chords: number[],
  k: KeySignature,
  meter: Score["meter"],
  lo: number,
  pickupBar: boolean,
): ScoreNote[] {
  const scale = scalePcs(k);
  const bar = barQuarters(meter);
  const compound = meter.beatUnit === 8;
  const base = Math.max(lo, 41);
  const above = (from: number, p: number) => {
    let m = from;
    while (pc(m) !== p) m++;
    return m;
  };
  const style = rand();
  const notes: ScoreNote[] = [];
  chords.forEach((d, b) => {
    const start = b * bar;
    if (b === 0 && pickupBar) return;
    const r = above(base, scale[d]);
    const t = above(r + 1, scale[(d + 2) % 7]);
    const f = above(t + 1, scale[(d + 4) % 7]);
    const put = (at: number, dur: number, ms: number[]) => {
      for (const midi of ms) notes.push({ midi, startBeat: start + at, durationBeats: dur });
    };
    let at = 0;
    if (kind === "roots") {
      if (rand() < 0.5) put(0, bar, [r]);
      else
        for (const [i, len] of spans(meter).entries()) put((at += len) - len, len, [i % 2 ? f : r]);
    } else if (kind === "dyads" || kind === "chorale") {
      // Thirds, fifths and sixths; a chorale's bass and tenor (a tenth only when it stays low).
      const shapes =
        kind === "dyads"
          ? [
              [r, f],
              [r, t],
              [t, r + 12],
            ]
          : [[r, f], [r, r + 12], ...(t + 12 <= 64 ? [[r, t + 12]] : [])];
      for (const len of spans(meter)) put((at += len) - len, len, pick(rand, shapes));
    } else if (compound) {
      const cycle = style < 0.5 ? [r, f, r + 12] : [r, t, f];
      for (let i = 0; i * 0.5 < bar - 1e-9; i++) put(i * 0.5, 0.5, [cycle[i % 3]]);
    } else if (bar === 3) {
      put(0, 1, [r]);
      put(1, 1, [t, f]);
      put(2, 1, [t, f]);
    } else if (style < 0.5) {
      // Alberti: low, high, middle, high.
      const cycle = [r, f, t, f];
      for (let i = 0; i * 0.5 < bar - 1e-9; i++) put(i * 0.5, 0.5, [cycle[i % 4]]);
    } else {
      const cycle = [r, t, f, t];
      for (let i = 0; i < bar; i++) put(i, 1, [cycle[i % 4]]);
    }
  });
  return notes;
}

/**
 * One line: rhythm, pitches and ties for a bar list. With `chords`, notes on strong
 * beats move to the nearest chord tone, so a melody agrees with its left hand.
 */
function line(
  rand: Rand,
  gen: LevelGen,
  pool: number[],
  k: KeySignature,
  meter: Score["meter"],
  measures: number,
  pickupBar: boolean,
  chords?: number[],
): ScoreNote[] {
  const bar = barQuarters(meter);
  const compound = meter.beatUnit === 8;
  const odd = ODD_GROUPS[`${meter.beats}/${meter.beatUnit}`];
  const bars = rhythm(
    rand,
    compound ? [...gen.compound, ...(odd ? TWO_EIGHTHS : [])] : gen.simple,
    bar,
    measures,
    odd,
  );
  if (pickupBar) {
    const up = compound ? 0.5 : 1;
    bars[0] = [-(bar - up), up];
  }
  // A tie over the bar line: the bar's last note holds into the next bar's first.
  const durations: number[] = [];
  bars.forEach((b, i) =>
    b.forEach((d, j) => {
      const last = durations.length - 1;
      if (j === 0 && i > 0 && d > 0 && durations[last] > 0 && gen.ties && rand() < gen.ties)
        durations[last] += d;
      else durations.push(d);
    }),
  );
  const count = durations.filter((d) => d > 0).length;
  const pitches = melody(rand, pool, k.tonicPc, count, gen.maxStep, gen.figures);
  const notes: ScoreNote[] = [];
  let beat = 0;
  for (const d of durations) {
    if (d > 0)
      notes.push({ midi: pitches[notes.length], startBeat: snap(beat), durationBeats: snap(d) });
    beat += Math.abs(d);
  }
  const scale = scalePcs(k);
  const strong = strongBeats(meter);
  const isStrong = (n: ScoreNote) => strong.some((s) => Math.abs((n.startBeat % bar) - s) < 1e-9);
  const nearest = (m: number, pcs: number[]) =>
    pool
      .filter((p) => pcs.includes(pc(p)))
      .reduce((a, b) => (Math.abs(b - m) < Math.abs(a - m) ? b : a), Infinity);
  const tonesAt = (n: ScoreNote) => {
    const d = chords?.[Math.floor(n.startBeat / bar + 1e-9)] ?? 0;
    return [0, 2, 4].map((o) => scale[(d + o) % 7]);
  };
  if (chords)
    for (const n of notes) {
      const to = isStrong(n) ? nearest(n.midi, tonesAt(n)) : Infinity;
      if (to !== Infinity) n.midi = to;
    }
  // Chromatic notes: a passing note between two notes a whole step apart, or a lower neighbour.
  const pcs = diatonicPcs(k);
  if (gen.chromatic)
    for (let i = 1; i < notes.length - 1; i++) {
      const [a, n, b] = [notes[i - 1], notes[i], notes[i + 1]];
      if (isStrong(n) || rand() >= gen.chromatic) continue;
      const cand =
        Math.abs(a.midi - b.midi) === 2
          ? (a.midi + b.midi) / 2
          : a.midi === b.midi
            ? a.midi - 1
            : null;
      if (cand !== null && !pcs.has(pc(cand)) && cand >= pool[0]) n.midi = cand;
    }
  if (gen.jazz) jazzColour(rand, notes, k, isStrong, pool[0]);
  return notes;
}

/** A third of a beat is not a round number: starts and lengths sit on a 48th of a beat. */
const snap = (b: number) => Math.round(b * 48) / 48;

/**
 * A jazz line's colour: an eighth before a strong-beat note becomes its chromatic
 * approach from below (half the time), and an off-beat 3rd or 7th of the key
 * sometimes flattens into a blue note.
 */
function jazzColour(
  rand: Rand,
  notes: ScoreNote[],
  k: KeySignature,
  isStrong: (n: ScoreNote) => boolean,
  lowest: number,
) {
  const third = pc(k.tonicPc + (k.mode === "major" ? 4 : 3));
  const seventh = pc(k.tonicPc + 10 + (k.mode === "major" ? 1 : 0));
  for (let i = 0; i < notes.length; i++) {
    const n = notes[i];
    const next = notes[i + 1];
    if (
      next &&
      isStrong(next) &&
      n.durationBeats <= 0.5 &&
      Math.abs(n.startBeat + n.durationBeats - next.startBeat) < 1e-6 &&
      next.midi - 1 >= lowest &&
      rand() < 0.5
    )
      n.midi = next.midi - 1;
    else if (!isStrong(n) && (pc(n.midi) === third || pc(n.midi) === seventh) && rand() < 0.3)
      n.midi -= 1;
  }
}

/** Chord tones under strong-beat melody notes: one lower voice, or octaves and three-note chords. */
function addChordTones(
  rand: Rand,
  notes: ScoreNote[],
  chords: number[],
  k: KeySignature,
  meter: Score["meter"],
  how: 1 | 2,
): ScoreNote[] {
  const scale = scalePcs(k);
  const bar = barQuarters(meter);
  const strong = strongBeats(meter);
  const extra: ScoreNote[] = [];
  for (const n of notes) {
    if (!strong.some((s) => Math.abs((n.startBeat % bar) - s) < 1e-9)) continue;
    const d = chords[Math.floor(n.startBeat / bar + 1e-9)] ?? 0;
    const tones = [0, 2, 4].map((o) => scale[(d + o) % 7]);
    const below = (from: number) => {
      let m = from - 3;
      while (!tones.includes(pc(m))) m--;
      return m;
    };
    const lower =
      how === 2 && rand() < 0.4
        ? [n.midi - 12]
        : how === 2 && rand() < 0.5
          ? [below(n.midi), below(below(n.midi) + 1)]
          : [below(n.midi)];
    for (const midi of lower) if (midi >= 55) extra.push({ ...n, midi });
  }
  return [...notes, ...extra].sort((a, b) => a.startBeat - b.startBeat || a.midi - b.midi);
}

/**
 * A generated phrase as a canonical Score. Piano puts treble in a right-hand voice
 * and bass in a left-hand voice (both clefs split the range at middle C); fretted
 * instruments get one voice. Beats are quarter notes; a bar is meter.beats * 4 / beatUnit.
 * From Piano 4 the left hand plays a progression's chords and the melody agrees with it.
 */
export function sightReadingScore(rand: Rand, opts: SightReadingOptions): Score {
  const level = readingLevel(opts.level);
  const gen = GEN[level.id];
  const k = keyOrC(opts.key ?? level.recommendedKeys[0]);
  const [lo, hi] = opts.range ?? [
    level.recommendedRange.lowestMidi,
    level.recommendedRange.highestMidi,
  ];
  const clefs = opts.clefs?.length ? opts.clefs : level.recommendedClefs;
  const measures = Math.min(16, Math.max(1, Math.round(opts.measures)));
  const meterId = levelMeter(level.id, opts.meter);
  if (meterId === "changing") return changingMeters(rand, opts, measures);
  const { beats, beatUnit } = READING_METERS[meterId];
  const meter = { beats, beatUnit };
  const split = clefs.length > 1;
  const piano = opts.instrument === "piano";
  const voiceClefs: Clef[] = piano ? clefs : [clefs[0]];
  let parts = voiceClefs
    .map((clef) => ({
      clef,
      pool: diatonicIn(
        k,
        split && clef === "treble" ? Math.max(lo, 60) : lo,
        split && clef === "bass" ? Math.min(hi, 59) : hi,
      ),
    }))
    .filter((p) => p.pool.length);
  // A clef with no notes on its side of middle C (Both at a range that starts
  // at C4) is left out, and the other clef reads the whole range.
  if (parts.length < voiceClefs.length)
    parts = [{ clef: parts[0]?.clef ?? clefs[0], pool: diatonicIn(k, lo, hi) }];
  const pickupBar = opts.pickup !== false && !!gen.pickup && measures > 1 && rand() < 0.5;
  const accompanied = piano && !!gen.lh && parts.length === 2;
  const chords = gen.lh || gen.jazz ? progression(rand, measures, !gen.fiveFinger) : undefined;
  const voices: ScoreVoice[] = parts.map(({ clef, pool }) => {
    let notes: ScoreNote[];
    if (accompanied && clef === "bass")
      notes = accompaniment(rand, gen.lh!, chords!, k, meter, lo, pickupBar);
    else {
      // Five fingers from the tonic nearest the bottom of the treble pool.
      const t = pool.findIndex((m) => pc(m) === k.tonicPc);
      const hand = gen.fiveFinger && t >= 0 ? pool.slice(t, t + 5) : pool;
      notes = line(
        rand,
        gen,
        hand.length >= 5 ? hand : pool,
        k,
        meter,
        measures,
        pickupBar,
        chords,
      );
      if (piano && gen.rhChords && chords)
        notes = addChordTones(rand, notes, chords, k, meter, gen.rhChords);
    }
    return {
      id: piano ? (clef === "treble" ? "rh" : "lh") : "melody",
      name: piano ? (clef === "treble" ? m.music_content_piano_right_hand() : m.music_content_piano_left_hand()) : m.music_content_reading_melody_voice(),
      clef,
      ...(piano ? { hand: clef === "treble" ? ("right" as const) : ("left" as const) } : {}),
      notes,
    };
  });
  if (accompanied && gen.clefChange) clefChange(rand, voices, barQuarters(meter), measures);
  return {
    id: `sight-${opts.level}-${Math.floor(rand() * 2 ** 32).toString(36)}`,
    title: m.music_content_reading_sight_title({ level: level.label }),
    bpm: opts.bpm,
    meter,
    keyFifths: k.fifths,
    keyMode: k.mode,
    voices,
    lengthBeats: measures * barQuarters(meter),
    source: { kind: "generated" },
  };
}

/** A phrase whose meter changes every 2 bars (CHANGING_METERS in turn): 2-bar phrases joined. */
function changingMeters(rand: Rand, opts: SightReadingOptions, measures: number): Score {
  const parts: { score: Score; at: number }[] = [];
  const meters = changingMeterParts(measures);
  for (let b = 0, at = 0; b < measures; b += 2) {
    const meter = meters[b / 2];
    const score = sightReadingScore(rand, {
      ...opts,
      meter,
      measures: Math.min(2, measures - b),
      pickup: false,
    });
    parts.push({ score, at });
    at += score.lengthBeats;
  }
  const first = parts[0].score;
  const shift = <T extends { startBeat: number }>(xs: T[] | undefined, at: number) =>
    (xs ?? []).map((x) => ({ ...x, startBeat: x.startBeat + at }));
  const voices = first.voices.map((v) => {
    const all = parts.map((p) => ({ v: p.score.voices.find((x) => x.id === v.id), at: p.at }));
    const clefChanges = all.flatMap(({ v: x, at }) => shift(x?.clefChanges, at));
    return {
      ...v,
      notes: all.flatMap(({ v: x, at }) => shift(x?.notes, at)),
      ...(clefChanges.length ? { clefChanges } : {}),
    };
  });
  const last = parts.at(-1)!;
  return {
    ...first,
    id: `${first.id}-changing`,
    meterChanges: parts.map((p) => ({ startBeat: p.at, ...p.score.meter })),
    voices,
    lengthBeats: last.at + last.score.lengthBeats,
  };
}

/**
 * A bar or two in the middle where the left hand moves up an octave into the
 * treble clef (and back after), when it stays below the right hand there.
 */
function clefChange(rand: Rand, voices: ScoreVoice[], bar: number, measures: number) {
  const lh = voices.find((v) => v.id === "lh");
  const rh = voices.find((v) => v.id === "rh");
  if (!lh || !rh || measures < 4 || rand() < 0.3) return;
  const from = randInt(rand, 1, measures - 3);
  const to = Math.min(measures - 1, from + randInt(rand, 1, 2));
  const inBars = (n: ScoreNote) =>
    n.startBeat >= from * bar - 1e-6 && n.startBeat < to * bar - 1e-6;
  const left = lh.notes.filter(inBars);
  const right = rh.notes.filter(inBars);
  if (!left.length || !right.length) return;
  if (Math.max(...left.map((n) => n.midi)) + 12 >= Math.min(...right.map((n) => n.midi))) return;
  if (Math.min(...left.map((n) => n.midi)) + 12 < 53) return;
  for (const n of left) n.midi += 12;
  lh.clefChanges = [
    { startBeat: from * bar, clef: "treble" },
    { startBeat: to * bar, clef: "bass" },
  ];
}

/** Skill ids a sight-reading score exercises. */
export function sightReadingSkills(score: Score): string[] {
  const clefs = [...new Set(score.voices.map((v) => v.clef ?? "treble"))];
  return [
    ...clefs.flatMap((c) => [`reading.${c}`, `reading.${c}.stepwise`]),
    ...(score.meter.beatUnit === 8 ? ["reading.rhythm.compound"] : []),
  ];
}

/**
 * "Practice the notes you missed": the missed groups in order, a quarter each
 * (a dotted quarter in compound meter), the last one held to the bar line.
 */
export function practiceMissedScore(score: Score, missed: ScoreGroup[]): Score {
  const unit = score.meter.beatUnit === 8 ? 1.5 : 1;
  const bar = barQuarters(score.meter);
  const lengthBeats = Math.max(1, Math.ceil((missed.length * unit) / bar)) * bar;
  const voices = score.voices.map((v) => ({
    ...v,
    notes: missed.flatMap((g, i) =>
      g.notes
        .filter((n) => n.voiceId === v.id)
        .map(({ voiceId: _, ...n }) => ({
          ...n,
          tieFrom: undefined,
          startBeat: i * unit,
          durationBeats: i === missed.length - 1 ? lengthBeats - i * unit : unit,
        })),
    ),
  }));
  return {
    ...score,
    id: `${score.id}-missed`,
    title: m.music_content_reading_missed_title({ title: score.title }),
    voices,
    lengthBeats,
    sections: undefined,
    chords: undefined,
  };
}

// ---------------------------------------------------------------------------
// The level climb: sight-reading as Piano Marvel's assessment runs it (SASR):
// short phrases played in time, a pass at 80% moves up a rung, anything less
// is a strike, three strikes end it. Rungs are each level through its keys.

export const CLIMB = { pass: 0.8, strikes: 3, measures: 4 } as const;
/** The climb's rungs for an instrument: each of its levels through the level's climb keys. */
/** "D major" as shown: the note and the mode in the current language. */
const keyLabel = (key: string) => {
  const [note, mode] = key.split(" ");
  if (mode === "major") return m.music_content_ear_key_major({ note });
  if (mode === "minor") return m.music_content_ear_key_minor({ note });
  return key;
};
export const readingRungs = (instrument: string) =>
  levelsFor(instrument).flatMap((l) =>
    l.climbKeys.map((key) => ({
      level: l.id,
      key,
      clefs: l.recommendedClefs,
      label: m.music_content_reading_rung_label({ level: l.label, key: keyLabel(key) }),
    })),
  );
export const READING_RUNGS = readingRungs("piano");

export interface ClimbState {
  rung: number;
  strikes: number;
  /** The highest rung passed this climb, -1 for none. */
  best: number;
  phrases: number;
  over: boolean;
}
export const startClimb = (rung = 0, rungs = READING_RUNGS.length): ClimbState => ({
  rung: Math.max(0, Math.min(rungs - 1, rung)),
  strikes: 0,
  best: -1,
  phrases: 0,
  over: false,
});

/** After a phrase scored `score`: up a rung on a pass (the top rung stays), a strike otherwise. */
export function climbAfter(s: ClimbState, score: number, rungs = READING_RUNGS.length): ClimbState {
  const phrases = s.phrases + 1;
  if (score >= CLIMB.pass) {
    const top = s.rung === rungs - 1;
    return {
      ...s,
      phrases,
      best: Math.max(s.best, s.rung),
      rung: top ? s.rung : s.rung + 1,
      over: top,
    };
  }
  const strikes = s.strikes + 1;
  return { ...s, phrases, strikes, over: strikes >= CLIMB.strikes };
}
