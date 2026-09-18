/**
 * Jazz piano content engine.
 *
 * Source material: Julian Bradley's "Ultimate Guide to Jazz Piano" resource pack
 * (JazzTutorial.com) — chord-symbol guide, chord extensions, chord/scale map,
 * ii-V-I voicings, 29 jazz licks, recommended repertoire, and backing tracks.
 *
 * Everything here is pure data + pure functions (no Svelte, no I/O) so it can be
 * unit-tested and reused by routes, the jam engine, and the theory library.
 */

import {
  Capability,
  type ContentApplicability,
  type ExerciseRunRecord,
  type InstrumentId,
  resultToScoringEvent,
  type NoteEvent,
  type ScoringEvent,
  type ScoringMetric,
  type UnixMs,
} from "@repo/music-core/domain";
import {
  buildLearningPath,
  type LearningPath,
  type LearningPathOptions,
  type LearningPathStep,
  type LearningPathStepDefinition,
  type LearningPathStepStatus,
} from "@repo/music-core/engines/learning-path";
import { noteToMidi } from "@repo/music-core/engines/theory";

// ---------------------------------------------------------------------------
// Chord vocabulary (JT2 "All Chord Symbols", JT3 "All Chord Extensions")
// ---------------------------------------------------------------------------

/** The seven core chord families a jazz musician must know. */
export type ChordFamily = "maj7" | "m7" | "dom7" | "m7b5" | "dim7" | "mMaj7" | "maj6" | "min6";

export interface JazzChordType {
  /** Stable id. */
  id: string;
  /** tonal-compatible symbol built on C, e.g. "Cmaj7". */
  symbol: string;
  /** Spoken name. */
  name: string;
  family: ChordFamily;
  /** Where it shows up in jazz harmony. */
  role: string;
  /** Common extensions stacked on top of this chord (9/11/13/altered). */
  extensions?: string[];
}

/** JT2: the chord-symbol guide, condensed to the families + their jazz role. */
export const JAZZ_CHORD_TYPES: JazzChordType[] = [
  {
    id: "maj7",
    symbol: "Cmaj7",
    name: "Major 7",
    family: "maj7",
    role: "The I chord of a major ii-V-I.",
    extensions: ["Cmaj9", "Cmaj7#11", "C6", "C6/9"],
  },
  {
    id: "m7",
    symbol: "Cm7",
    name: "Minor 7",
    family: "m7",
    role: "The ii chord of a major ii-V-I.",
    extensions: ["Cm9", "Cm11"],
  },
  {
    id: "dom7",
    symbol: "C7",
    name: "Dominant 7",
    family: "dom7",
    role: "The V chord of a ii-V-I. Takes every altered extension (b9 #9 #11 b13).",
    extensions: ["C9", "C13", "C7b9", "C7#9", "C7#11", "C7b13", "C7alt", "C7sus4"],
  },
  {
    id: "mMaj7",
    symbol: "CmMaj7",
    name: "Minor-major 7",
    family: "mMaj7",
    role: 'The i chord of a minor ii-V-i. ("The James Bond chord" with a 9th.)',
    extensions: ["CmMaj9"],
  },
  {
    id: "m7b5",
    symbol: "Cm7b5",
    name: "Half-diminished (min 7 b5)",
    family: "m7b5",
    role: "The ii chord of a minor ii-V-i.",
  },
  {
    id: "dim7",
    symbol: "Cdim7",
    name: "Diminished 7",
    family: "dim7",
    role: "Passing chord; stacks of minor 3rds (C Eb Gb A).",
  },
  {
    id: "maj6",
    symbol: "C6",
    name: "Major 6",
    family: "maj6",
    role: "A brighter tonic than maj7. The 6th replaces the 7th.",
    extensions: ["C6/9"],
  },
  {
    id: "min6",
    symbol: "Cm6",
    name: "Minor 6",
    family: "min6",
    role: "Tonic minor with a major 6th (not b6). Common minor i chord.",
    extensions: ["Cm6/9"],
  },
];

/** JT3: how a chord extension (natural or altered) is found. */
export interface ExtensionRule {
  symbol: string;
  /** Scale degree above the root (always counted from the MAJOR scale). */
  degree: 9 | 11 | 13;
  alteration?: "b" | "#";
  /** Semitones above the root. */
  semitones: number;
  note: string;
}

export const CHORD_EXTENSIONS: ExtensionRule[] = [
  { symbol: "9", degree: 9, semitones: 14, note: "The 2nd, an octave up." },
  { symbol: "b9", degree: 9, alteration: "b", semitones: 13, note: "Altered; over V7." },
  { symbol: "#9", degree: 9, alteration: "#", semitones: 15, note: "Altered; over V7." },
  { symbol: "11", degree: 11, semitones: 17, note: "The 4th, an octave up (m7 / V7)." },
  {
    symbol: "#11",
    degree: 11,
    alteration: "#",
    semitones: 18,
    note: "The lydian colour (maj7 / V7).",
  },
  { symbol: "13", degree: 13, semitones: 21, note: "The 6th, an octave up. V7 only." },
  {
    symbol: "b13",
    degree: 13,
    alteration: "b",
    semitones: 20,
    note: 'Altered; "C7b13" means C7 altered.',
  },
];

// ---------------------------------------------------------------------------
// Chord <-> scale map (JT4 "All Jazz Scales for each chord")
// ---------------------------------------------------------------------------

export interface ChordScaleEntry {
  family: ChordFamily;
  /** tonal scale name (without root), e.g. "lydian". */
  scale: string;
  label: string;
  /** Julian's "go-to" recommendation for this chord. */
  recommended?: boolean;
  /** Short note on when/why. */
  hint?: string;
}

export type ChordScaleDrillChangesId = "major" | "minor";

export interface ChordScaleDrillConfig {
  changesId: ChordScaleDrillChangesId;
}

export type ChordScaleDrillConfigSource =
  | URLSearchParams
  | {
      changes?: unknown;
      changesId?: unknown;
      variant?: unknown;
    };

export const CHORD_SCALE_DRILL_CHANGES: readonly ChordScaleDrillChangesId[] = ["major", "minor"];

export const CHORD_SCALE_DRILL_DEFAULT_CONFIG: ChordScaleDrillConfig = {
  changesId: "major",
};

export function normalizeChordScaleDrillConfig(
  source: ChordScaleDrillConfigSource,
): ChordScaleDrillConfig {
  return {
    changesId: normalizeChordScaleChangesId(
      readChordScaleConfigValue(source, ["changes", "changesId", "variant"]),
    ),
  };
}

/**
 * JT4: the "go-to" scales jazz musicians use over each chord type. Every scale
 * here contains the chord tones (1 3 5 7); they vary in the colour tones.
 */
export const CHORD_SCALE_MAP: ChordScaleEntry[] = [
  // Major 7
  {
    family: "maj7",
    scale: "lydian",
    label: "Lydian",
    recommended: true,
    hint: "Brighter than major — #11 instead of 11.",
  },
  { family: "maj7", scale: "major", label: "Major (Ionian)" },
  {
    family: "maj7",
    scale: "bebop major",
    label: "Major bebop",
    hint: "Major scale + #5 passing note.",
  },
  { family: "maj7", scale: "major pentatonic", label: "Major pentatonic" },
  { family: "maj7", scale: "major blues", label: "Major blues" },
  // Minor 7
  {
    family: "m7",
    scale: "dorian",
    label: "Dorian",
    recommended: true,
    hint: "Minor scale with a major 6th.",
  },
  { family: "m7", scale: "minor blues", label: "Minor blues" },
  { family: "m7", scale: "minor pentatonic", label: "Minor pentatonic" },
  // Dominant 7
  {
    family: "dom7",
    scale: "lydian dominant",
    label: "Lydian dominant",
    recommended: true,
    hint: "Mixolydian with a #11.",
  },
  { family: "dom7", scale: "mixolydian", label: "Mixolydian" },
  {
    family: "dom7",
    scale: "bebop",
    label: "Dominant bebop",
    hint: "Mixolydian + a major-7th passing note.",
  },
  {
    family: "dom7",
    scale: "altered",
    label: "Altered",
    hint: "Over minor ii-V-i / max tension. Think Db melodic minor.",
  },
  {
    family: "dom7",
    scale: "half-whole diminished",
    label: "Diminished (half-whole)",
    hint: "Gives b9 #9 #11 over V7.",
  },
  { family: "dom7", scale: "whole tone", label: "Whole tone", hint: "For 7#5 chords." },
  // Half-diminished
  {
    family: "m7b5",
    scale: "locrian",
    label: "Locrian",
    recommended: true,
    hint: "Think the major scale a half-step above (Db major over Cm7b5).",
  },
  {
    family: "m7b5",
    scale: "altered",
    label: "Locrian #2",
    hint: "Brighter half-dim sound. Think Eb melodic minor.",
  },
  // Diminished 7
  {
    family: "dim7",
    scale: "whole-half diminished",
    label: "Diminished (whole-half)",
    recommended: true,
  },
  // Minor-major / minor 6
  { family: "mMaj7", scale: "melodic minor", label: "Melodic minor", recommended: true },
  { family: "min6", scale: "dorian", label: "Dorian", recommended: true },
  { family: "min6", scale: "melodic minor", label: "Melodic minor" },
  // Major 6 behaves like maj7
  { family: "maj6", scale: "major", label: "Major (Ionian)", recommended: true },
  { family: "maj6", scale: "lydian", label: "Lydian" },
];

/** Scales that go with a chord family, recommended first. */
export function scalesForFamily(family: ChordFamily): ChordScaleEntry[] {
  return CHORD_SCALE_MAP.filter((entry) => entry.family === family).sort(
    (a, b) => Number(b.recommended ?? false) - Number(a.recommended ?? false),
  );
}

function readChordScaleConfigValue(
  source: ChordScaleDrillConfigSource,
  keys: string[],
): string | undefined {
  if (source instanceof URLSearchParams) {
    for (const key of keys) {
      const value = source.get(key);
      if (value !== null) return value;
    }
    return undefined;
  }

  for (const key of keys) {
    const value = source[key as keyof typeof source];
    if (typeof value === "string") return value;
  }
  return undefined;
}

function normalizeChordScaleChangesId(value: string | undefined): ChordScaleDrillChangesId {
  return CHORD_SCALE_DRILL_CHANGES.includes(value as ChordScaleDrillChangesId)
    ? (value as ChordScaleDrillChangesId)
    : CHORD_SCALE_DRILL_DEFAULT_CONFIG.changesId;
}

// ---------------------------------------------------------------------------
// Voicings (JT6 left-hand, JT8 shell, JT9 rootless, JT12 upper structures)
// ---------------------------------------------------------------------------

export type VoicingType = "rooted" | "shell" | "rootlessA" | "rootlessB";
export type RootlessPosition = "A" | "B";

/** Chord-tone offsets (semitones above the root) per family. */
const CHORD_TONES: Record<
  ChordFamily,
  { third: number; fifth: number; seventh: number; ninth: number }
> = {
  maj7: { third: 4, fifth: 7, seventh: 11, ninth: 14 },
  m7: { third: 3, fifth: 7, seventh: 10, ninth: 14 },
  dom7: { third: 4, fifth: 7, seventh: 10, ninth: 14 },
  m7b5: { third: 3, fifth: 6, seventh: 10, ninth: 14 },
  dim7: { third: 3, fifth: 6, seventh: 9, ninth: 14 },
  mMaj7: { third: 3, fifth: 7, seventh: 11, ninth: 14 },
  maj6: { third: 4, fifth: 7, seventh: 9, ninth: 14 }, // "7th" slot holds the 6th
  min6: { third: 3, fifth: 7, seventh: 9, ninth: 14 },
};

export interface RealizedVoicing {
  type: VoicingType;
  /** Right/both-hand voicing notes, ascending MIDI. */
  midi: number[];
  /** Optional bass note (root) for the left hand. */
  bassMidi?: number;
  label: string;
}

/**
 * Realize a voicing as MIDI note numbers from a root pitch.
 *
 * - `rooted`  = 1 3 5 7 (literal chord symbol).
 * - `shell`   = 1 3 7 (JT8 — guide tones; root in bass).
 * - `rootlessA` = 3 5 7 9 (JT9 — use when the melody note is the 9th).
 * - `rootlessB` = 7 9 3 5 (JT9 — use when the melody note is the 5th).
 *
 * Rootless voicings put the root in the bass (`bassMidi`) so the left hand can
 * play it while the right hand plays the rootless shape.
 */
export function realizeVoicing(
  rootMidi: number,
  family: ChordFamily,
  type: VoicingType,
): RealizedVoicing {
  const t = CHORD_TONES[family];
  switch (type) {
    case "rooted":
      return {
        type,
        midi: [rootMidi, rootMidi + t.third, rootMidi + t.fifth, rootMidi + t.seventh],
        label: "1 3 5 7",
      };
    case "shell":
      return {
        type,
        midi: [rootMidi, rootMidi + t.third, rootMidi + t.seventh],
        label: "1 3 7 (shell)",
      };
    case "rootlessA":
      return {
        type,
        bassMidi: rootMidi,
        midi: [rootMidi + t.third, rootMidi + t.fifth, rootMidi + t.seventh, rootMidi + t.ninth],
        label: "3 5 7 9 (rootless A)",
      };
    case "rootlessB":
      return {
        type,
        bassMidi: rootMidi,
        midi: [
          rootMidi + t.seventh,
          rootMidi + t.ninth,
          rootMidi + t.third + 12,
          rootMidi + t.fifth + 12,
        ],
        label: "7 9 3 5 (rootless B)",
      };
  }
}

// ---------------------------------------------------------------------------
// Altered V7 voicings (JT10 V7b9, JT11 V7 altered)
// ---------------------------------------------------------------------------

export type DominantVoicingId = "rootless9" | "rootlessB9" | "altered";

export interface DominantVoicing {
  id: DominantVoicingId;
  label: string;
  /** Description of the colour it adds. */
  hint: string;
  /** Semitone offsets above the root for the right-hand voicing (ascending). */
  offsets: number[];
}

/**
 * Rootless dominant voicings, getting more "outside" left to right (JT9-11).
 * Left hand plays the root; right hand plays these.
 */
export const DOMINANT_VOICINGS: DominantVoicing[] = [
  {
    id: "rootless9",
    label: "Rootless (3 5 7 9)",
    hint: "Plain dominant colour.",
    offsets: [4, 7, 10, 14],
  },
  {
    id: "rootlessB9",
    label: "Rootless b9 (3 7 b9 5)",
    hint: "Diminished tension (JT10).",
    offsets: [4, 10, 13, 19],
  },
  {
    id: "altered",
    label: "Altered (7 b9 3 b13)",
    hint: "Max tension; resolves strongly (JT11).",
    offsets: [10, 13, 16, 20],
  },
];

export function realizeDominantVoicing(rootMidi: number, id: DominantVoicingId): RealizedVoicing {
  const voicing = DOMINANT_VOICINGS.find((entry) => entry.id === id) ?? DOMINANT_VOICINGS[0]!;
  return {
    type: "rootlessA",
    bassMidi: rootMidi,
    midi: voicing.offsets.map((offset) => rootMidi + offset),
    label: voicing.label,
  };
}

// ---------------------------------------------------------------------------
// Upper structures (JT12 — a triad over the V7's 1-3-7)
// ---------------------------------------------------------------------------

export interface UpperStructure {
  id: string;
  /** e.g. "D maj" — the right-hand triad over the V7 root. */
  triad: string;
  /** Semitones above the V7 root where the triad is built. */
  triadRoot: number;
  quality: "maj" | "min";
  /** Extensions the triad adds, e.g. "#11". */
  adds: string;
  /** One of the three Julian uses most. */
  favorite?: boolean;
}

/** Upper structures over a dominant 7 (JT12). Built relative to the V7 root. */
export const UPPER_STRUCTURES: UpperStructure[] = [
  { id: "us-II", triad: "II maj", triadRoot: 2, quality: "maj", adds: "9 #11 13", favorite: true },
  { id: "us-bIII", triad: "bIII maj", triadRoot: 3, quality: "maj", adds: "#9" },
  { id: "us-bIII-min", triad: "bIII min", triadRoot: 3, quality: "min", adds: "#9 #11" },
  { id: "us-bV", triad: "#IV maj", triadRoot: 6, quality: "maj", adds: "b9 #11" },
  { id: "us-bV-min", triad: "#IV min", triadRoot: 6, quality: "min", adds: "b9 #11 13" },
  { id: "us-bVI", triad: "bVI maj", triadRoot: 8, quality: "maj", adds: "#9 b13", favorite: true },
  { id: "us-VI", triad: "VI maj", triadRoot: 9, quality: "maj", adds: "b9 13", favorite: true },
];

const TRIAD_OFFSETS: Record<UpperStructure["quality"], number[]> = {
  maj: [0, 4, 7],
  min: [0, 3, 7],
};

export interface RealizedUpperStructure {
  /** Left-hand shell (1 3 7). */
  lh: number[];
  /** Right-hand triad. */
  rh: number[];
  label: string;
  adds: string;
}

/** Realize an upper structure over a dominant root: LH shell + RH triad. */
export function realizeUpperStructure(rootMidi: number, id: string): RealizedUpperStructure {
  const structure = UPPER_STRUCTURES.find((entry) => entry.id === id) ?? UPPER_STRUCTURES[0]!;
  const t = CHORD_TONES.dom7;
  const triadRoot = rootMidi + structure.triadRoot + 12;
  return {
    lh: [rootMidi, rootMidi + t.third, rootMidi + t.seventh],
    rh: TRIAD_OFFSETS[structure.quality].map((offset) => triadRoot + offset),
    label: `${structure.triad} over V7`,
    adds: structure.adds,
  };
}

// ---------------------------------------------------------------------------
// The ii-V-I voicing drill (JT9 — "play through all 12 keys, 3x in a row")
// ---------------------------------------------------------------------------

/** Cycle of keys Julian uses for the 12-key drill (down in 4ths / by half-step). */
export const TWELVE_KEY_CYCLE = [
  "C",
  "Bb",
  "Ab",
  "Gb",
  "E",
  "D",
  "C#",
  "B",
  "A",
  "G",
  "F",
  "Eb",
] as const;

export interface DrillStep {
  /** Tonic of the ii-V-I, e.g. "C". */
  key: string;
  chords: { symbol: string; family: ChordFamily; rootMidi: number; position: RootlessPosition }[];
}

/**
 * Build the rootless ii-V-I voicing drill across all 12 keys (JT9).
 *
 * Positions alternate A-B-A (or B-A-B) so the voicings stay close together and
 * voice-lead smoothly, the way Julian teaches it.
 */
export function buildIIVIDrill(startPosition: RootlessPosition = "A", baseOctave = 4): DrillStep[] {
  const pattern: RootlessPosition[] = startPosition === "A" ? ["A", "B", "A"] : ["B", "A", "B"];
  return TWELVE_KEY_CYCLE.map((key) => {
    const tonicMidi = noteToMidi(`${key}${baseOctave}`);
    const iiMidi = tonicMidi + 2; // ii is a whole step above I
    const vMidi = tonicMidi + 7; // V is a fifth above I
    return {
      key,
      chords: [
        {
          symbol: `${midiToFlatName(iiMidi)}m7`,
          family: "m7" as const,
          rootMidi: iiMidi,
          position: pattern[0]!,
        },
        {
          symbol: `${midiToFlatName(vMidi)}7`,
          family: "dom7" as const,
          rootMidi: vMidi,
          position: pattern[1]!,
        },
        {
          symbol: `${key}maj7`,
          family: "maj7" as const,
          rootMidi: tonicMidi,
          position: pattern[2]!,
        },
      ],
    };
  });
}

const FLAT_NAMES = ["C", "Db", "D", "Eb", "E", "F", "Gb", "G", "Ab", "A", "Bb", "B"];
function midiToFlatName(midi: number): string {
  return FLAT_NAMES[((midi % 12) + 12) % 12]!;
}

export type DrillVariant = "major" | "minor" | "altered";

/** A chord with its voicing already resolved to MIDI (root in `bassMidi`). */
export interface DrillChordVoicing {
  symbol: string;
  midi: number[];
  bassMidi?: number;
}

export interface DrillVoicingStep {
  key: string;
  chords: DrillChordVoicing[];
}

function resolved(symbol: string, voicing: RealizedVoicing): DrillChordVoicing {
  return { symbol, midi: voicing.midi, bassMidi: voicing.bassMidi };
}

function resolvedUpper(symbol: string, voicing: RealizedUpperStructure): DrillChordVoicing {
  return { symbol, bassMidi: voicing.lh[0], midi: [...voicing.lh.slice(1), ...voicing.rh] };
}

/** Major rootless ii-V-I across all 12 keys, voicings resolved (JT9). */
export function buildMajorIIVIVoicings(startPosition: RootlessPosition = "A"): DrillVoicingStep[] {
  return buildIIVIDrill(startPosition).map((step) => ({
    key: step.key,
    chords: step.chords.map((chord) =>
      resolved(
        chord.symbol,
        realizeVoicing(
          chord.rootMidi,
          chord.family,
          chord.position === "A" ? "rootlessA" : "rootlessB",
        ),
      ),
    ),
  }));
}

/**
 * Minor rootless ii-V-i across all 12 keys (JT7): half-diminished ii, altered V7,
 * minor i. Voicings are fixed (no A/B alternation) for clean voice-leading.
 */
export function buildMinorIIVIVoicings(baseOctave = 4): DrillVoicingStep[] {
  return TWELVE_KEY_CYCLE.map((key) => {
    const tonicMidi = noteToMidi(`${key}${baseOctave}`);
    const iiMidi = tonicMidi + 2;
    const vMidi = tonicMidi + 7;
    return {
      key,
      chords: [
        resolved(`${midiToFlatName(iiMidi)}m7b5`, realizeVoicing(iiMidi, "m7b5", "rootlessA")),
        resolved(`${midiToFlatName(vMidi)}7alt`, realizeDominantVoicing(vMidi, "altered")),
        resolved(`${key}m7`, realizeVoicing(tonicMidi, "m7", "rootlessB")),
      ],
    };
  });
}

/**
 * Dominant-colour drill across all 12 keys (JT10-12): each key practices the V7
 * as b9 tension, altered tension, then a favorite upper-structure triad.
 */
export function buildAlteredDominantVoicings(baseOctave = 4): DrillVoicingStep[] {
  return TWELVE_KEY_CYCLE.map((key) => {
    const tonicMidi = noteToMidi(`${key}${baseOctave}`);
    const vMidi = tonicMidi + 7;
    const vName = midiToFlatName(vMidi);
    return {
      key,
      chords: [
        resolved(`${vName}7b9`, realizeDominantVoicing(vMidi, "rootlessB9")),
        resolved(`${vName}7alt`, realizeDominantVoicing(vMidi, "altered")),
        resolvedUpper(`${vName}7 · II maj upper`, realizeUpperStructure(vMidi, "us-II")),
      ],
    };
  });
}

/** Resolved voicings for a drill variant. */
export function buildDrillVoicings(
  variant: DrillVariant,
  startPosition: RootlessPosition = "A",
): DrillVoicingStep[] {
  if (variant === "minor") return buildMinorIIVIVoicings();
  if (variant === "altered") return buildAlteredDominantVoicings();
  return buildMajorIIVIVoicings(startPosition);
}

// ---------------------------------------------------------------------------
// Improv techniques (the ideas behind the 29 licks — JT5)
// ---------------------------------------------------------------------------

export interface ImprovTechnique {
  id: string;
  name: string;
  summary: string;
}

export const IMPROV_TECHNIQUES: ImprovTechnique[] = [
  {
    id: "chord-tone-soloing",
    name: "Chord-tone soloing",
    summary:
      "Build lines from the 1 3 5 7 (and 9) of each chord. The safest, strongest note choices.",
  },
  {
    id: "parent-scale",
    name: "One parent scale",
    summary:
      "The C major scale works over every chord of a C-major ii-V-I. Aim to land lines on 1 3 5 or 7.",
  },
  {
    id: "half-step-below",
    name: "Half-step-below approach",
    summary:
      "Precede a chord tone (best of all the major 3rd) with the note a half-step below, e.g. Bb→B, Eb→E. Most effective right at the chord change.",
  },
  {
    id: "chromatic-enclosure",
    name: "Chromatic enclosure",
    summary: "Surround a target note from above and below before landing on it.",
  },
  {
    id: "v7-scale-change",
    name: "Change scale over the V7",
    summary:
      "Switch to the diminished (half-whole) or altered scale over the V7 to add b9 #9 #11 b13 tension, then resolve back into the key.",
  },
  {
    id: "bebop-scale",
    name: "Bebop scales",
    summary:
      "Add a chromatic passing note: dominant bebop = mixolydian + maj7; major bebop = major + #5; minor bebop = dorian + maj7 (or maj3).",
  },
  {
    id: "sequence",
    name: "Melodic sequence",
    summary: "Repeat a melodic shape, moving it up or down the scale.",
  },
  {
    id: "rhythmic-variation",
    name: "Rhythmic variation",
    summary: "Inject triplets and 8th-note rests to keep lines from sounding mechanical.",
  },
  {
    id: "start-from-any-note",
    name: "Start from any note",
    summary: "Begin lines from the root, 9th, 3rd, 4th… not always the root. Varies the contour.",
  },
  {
    id: "lh-textures",
    name: "Left-hand textures",
    summary:
      "Stride (bass note then chord), bossa-nova bass (root + 5th), paradiddle (L/R/L/R) and 4-note cell patterns.",
  },
];

// ---------------------------------------------------------------------------
// The 29 licks (JT5) — encoded as practice cards, not literal transcriptions.
// ---------------------------------------------------------------------------

export type LickCategory = "major-ii-V-I" | "major-ii-V-I-VI" | "minor-ii-V-i" | "minor-chord";

export interface JazzLickDrillConfig {
  category: LickCategory;
  lickNumber: number;
}

export type JazzLickDrillConfigSource =
  | URLSearchParams
  | {
      category?: unknown;
      lick?: unknown;
      lickNumber?: unknown;
      number?: unknown;
    };

export const JAZZ_LICK_CATEGORIES: readonly LickCategory[] = [
  "major-ii-V-I",
  "major-ii-V-I-VI",
  "minor-ii-V-i",
  "minor-chord",
];

export const JAZZ_LICK_DRILL_DEFAULT_CONFIG: JazzLickDrillConfig = {
  category: "major-ii-V-I",
  lickNumber: 1,
};

export interface JazzLick {
  number: number;
  category: LickCategory;
  /** Chord symbols of the progression the lick is played over. */
  progression: string[];
  /** Scales / sources used in the line. */
  scales: string[];
  /** Improv technique ids (see IMPROV_TECHNIQUES). */
  techniques: string[];
  /** Julian's annotation for this lick. */
  tip: string;
}

const MAJ = ["Dm7", "G7", "Cmaj7"];
const MAJ_VI = ["Dm7", "G7", "Cmaj7", "A7"];
const MIN = ["Dm7b5", "G7", "Cm7"];

export const JAZZ_LICKS: JazzLick[] = [
  {
    number: 1,
    category: "major-ii-V-I",
    progression: MAJ,
    scales: ["chord tones"],
    techniques: ["chord-tone-soloing"],
    tip: "Solo using only the 1 3 5 7 of each chord.",
  },
  {
    number: 2,
    category: "major-ii-V-I",
    progression: MAJ,
    scales: ["C major"],
    techniques: ["parent-scale"],
    tip: "The C major scale works over all three chords of a major ii-V-I.",
  },
  {
    number: 3,
    category: "major-ii-V-I",
    progression: MAJ,
    scales: ["G dominant bebop"],
    techniques: ["bebop-scale", "rhythmic-variation"],
    tip: "Add a triplet to vary rhythm; the bebop chromatic note is Gb. End lines on 1 3 5 or 7 (C E G B).",
  },
  {
    number: 4,
    category: "major-ii-V-I",
    progression: MAJ,
    scales: ["C major"],
    techniques: ["half-step-below"],
    tip: "Half-step-below approach into the changes: Bb→B and Eb→E.",
  },
  {
    number: 5,
    category: "major-ii-V-I",
    progression: MAJ,
    scales: ["C major"],
    techniques: ["half-step-below"],
    tip: "The approach is most effective at the chord change. Aim for the chord's major 3rd.",
  },
  {
    number: 6,
    category: "major-ii-V-I",
    progression: ["Dm7", "G7b9", "Cmaj7"],
    scales: ["C major"],
    techniques: ["half-step-below"],
    tip: "You can precede all 7 scale notes with the half-step-below approach (F#→G, D#→E).",
  },
  {
    number: 7,
    category: "major-ii-V-I",
    progression: ["Dm7", "G7#9b9", "Cmaj7"],
    scales: ["C major", "G diminished (half-whole)"],
    techniques: ["v7-scale-change"],
    tip: "Go IN (C major), then OUT over the V7 (G diminished → b9 #9 #11), then back IN.",
  },
  {
    number: 8,
    category: "major-ii-V-I",
    progression: ["Dm7", "G7#9b9", "Cmaj7"],
    scales: ["G diminished (half-whole)"],
    techniques: ["v7-scale-change", "lh-textures"],
    tip: "Diminished line over G7 with a stride left-hand texture.",
  },
  {
    number: 9,
    category: "major-ii-V-I",
    progression: ["Dm7", "G7alt", "Cmaj7"],
    scales: ["G altered (Ab melodic minor)"],
    techniques: ["v7-scale-change"],
    tip: "Altered scale over G7 with a rootless altered voicing underneath.",
  },
  {
    number: 10,
    category: "major-ii-V-I",
    progression: ["Dm7", "G7alt", "Cmaj7"],
    scales: ["G altered"],
    techniques: ["v7-scale-change", "rhythmic-variation"],
    tip: "Inject 8th-note rests for interesting rhythm.",
  },
  {
    number: 11,
    category: "major-ii-V-I",
    progression: ["Dm7", "G7alt", "Cmaj7"],
    scales: ["G altered"],
    techniques: ["sequence"],
    tip: "A sequence: a repeating melodic shape moving up or down.",
  },
  {
    number: 12,
    category: "major-ii-V-I-VI",
    progression: MAJ_VI,
    scales: ["C major"],
    techniques: ["chord-tone-soloing"],
    tip: "ii-V-I-VI loops: the A7 resolves back to Dm7. Great for repeated improv practice.",
  },
  {
    number: 13,
    category: "major-ii-V-I-VI",
    progression: MAJ_VI,
    scales: ["D minor bebop (D dorian + Db)"],
    techniques: ["start-from-any-note", "chromatic-enclosure"],
    tip: "Start lines from every possible note; use a chromatic enclosure to precede the A7.",
  },
  {
    number: 14,
    category: "major-ii-V-I-VI",
    progression: ["Dm7", "G7alt", "Cmaj7", "A7b9"],
    scales: ["G altered"],
    techniques: ["half-step-below", "chord-tone-soloing"],
    tip: "Half-step approach into G7alt; chord-tone solo (1 3 5 7 9) over A7b9.",
  },
  {
    number: 15,
    category: "major-ii-V-I-VI",
    progression: MAJ_VI,
    scales: ["G diminished (half-whole)"],
    techniques: ["v7-scale-change", "chromatic-enclosure"],
    tip: "Diminished over G7; chromatic enclosure to precede the A7.",
  },
  {
    number: 16,
    category: "major-ii-V-I-VI",
    progression: ["Dm7", "G7#9b9", "Cmaj7", "A7b9"],
    scales: ["G diminished (half-whole)"],
    techniques: ["v7-scale-change", "lh-textures"],
    tip: "Diminished over G7 with a stride left hand.",
  },
  {
    number: 17,
    category: "major-ii-V-I-VI",
    progression: ["Dm7", "G7b9", "Cmaj7", "A7"],
    scales: ["C major"],
    techniques: ["half-step-below", "chromatic-enclosure"],
    tip: "Half-step approaches Bb→B and Eb→E; chromatic enclosure to precede the A7.",
  },
  {
    number: 18,
    category: "minor-ii-V-i",
    progression: MIN,
    scales: ["chord tones"],
    techniques: ["chord-tone-soloing"],
    tip: "Chord-tone solo (1 3 5 7 9). Over a minor ii-V-i you change scale on each chord.",
  },
  {
    number: 19,
    category: "minor-ii-V-i",
    progression: MIN,
    scales: ["D locrian", "G diminished", "C dorian"],
    techniques: ["v7-scale-change"],
    tip: "The standard minor ii-V-i scale set: D locrian – G diminished/altered – C dorian.",
  },
  {
    number: 20,
    category: "minor-ii-V-i",
    progression: ["Dm7b5", "G7#9b9", "Cm7"],
    scales: ["D locrian", "G diminished", "C dorian"],
    techniques: ["v7-scale-change", "lh-textures"],
    tip: "Stride left-hand texture under the minor ii-V-i.",
  },
  {
    number: 21,
    category: "minor-ii-V-i",
    progression: ["Dm7b5", "G7#9b9", "Cm7"],
    scales: ["D locrian", "G diminished", "C dorian"],
    techniques: ["half-step-below"],
    tip: "Half-step-below approaches C#→D and F#→G.",
  },
  {
    number: 22,
    category: "minor-ii-V-i",
    progression: ["Dm7b5", "G7b9", "Cm7"],
    scales: ["chord tones"],
    techniques: ["rhythmic-variation", "chord-tone-soloing"],
    tip: "Inject 8th-note rests; chord-tone solo (1 3 5 7 9).",
  },
  {
    number: 23,
    category: "minor-ii-V-i",
    progression: ["Dm7b5", "G7alt", "Cm7"],
    scales: ["D locrian", "G altered (Ab melodic minor)", "C dorian / melodic minor"],
    techniques: ["v7-scale-change"],
    tip: "Altered scale over G7 with a rootless altered voicing.",
  },
  {
    number: 24,
    category: "minor-ii-V-i",
    progression: ["Dm7b5", "G7alt", "Cm7"],
    scales: ["D locrian", "G altered", "C dorian"],
    techniques: ["v7-scale-change"],
    tip: "Another altered minor ii-V-i line.",
  },
  {
    number: 25,
    category: "minor-chord",
    progression: ["Cm7"],
    scales: ["C dorian", "C minor blues"],
    techniques: ["half-step-below"],
    tip: "Minor-chord lick in straight time. Half-step-below approach (B→C, E→F).",
  },
  {
    number: 26,
    category: "minor-chord",
    progression: ["Cm7", "Fm7"],
    scales: ["C dorian", "F dorian"],
    techniques: ["lh-textures"],
    tip: "A bossa-nova bass line plays the root and 5th of each chord.",
  },
  {
    number: 27,
    category: "minor-chord",
    progression: ["Cm7"],
    scales: ["C minor blues (C Eb F Gb G Bb)"],
    techniques: ["rhythmic-variation"],
    tip: "Bluesy, accented minor-blues line.",
  },
  {
    number: 28,
    category: "minor-chord",
    progression: ["Cm7"],
    scales: ["C dorian"],
    techniques: ["lh-textures"],
    tip: "Paradiddle texture — the L/R/L/R pattern works over any chord or set of notes.",
  },
  {
    number: 29,
    category: "minor-chord",
    progression: ["Cm7"],
    scales: ["C minor pentatonic (C Eb F G Bb)"],
    techniques: ["lh-textures", "sequence"],
    tip: "Ascending minor pentatonic in 4-note cells; the left hand plays the first note of each cell.",
  },
];

export function normalizeJazzLickDrillConfig(
  source: JazzLickDrillConfigSource,
): JazzLickDrillConfig {
  const requestedCategory = normalizeLickCategory(readJazzLickConfigValue(source, ["category"]));
  const requestedNumber = normalizeLickNumber(
    readJazzLickConfigValue(source, ["lick", "lickNumber", "number"]),
  );
  const requestedLick =
    requestedNumber === undefined
      ? undefined
      : JAZZ_LICKS.find((entry) => entry.number === requestedNumber);

  if (requestedCategory) {
    const categoryLick =
      requestedLick?.category === requestedCategory
        ? requestedLick
        : JAZZ_LICKS.find((entry) => entry.category === requestedCategory);
    return {
      category: requestedCategory,
      lickNumber: categoryLick?.number ?? JAZZ_LICK_DRILL_DEFAULT_CONFIG.lickNumber,
    };
  }

  if (requestedLick) {
    return {
      category: requestedLick.category,
      lickNumber: requestedLick.number,
    };
  }

  return JAZZ_LICK_DRILL_DEFAULT_CONFIG;
}

function readJazzLickConfigValue(
  source: JazzLickDrillConfigSource,
  keys: string[],
): string | undefined {
  if (source instanceof URLSearchParams) {
    for (const key of keys) {
      const value = source.get(key);
      if (value !== null) return value;
    }
    return undefined;
  }

  for (const key of keys) {
    const value = source[key as keyof typeof source];
    if (typeof value === "string") return value;
    if (typeof value === "number" && Number.isFinite(value)) return String(value);
  }
  return undefined;
}

function normalizeLickCategory(value: string | undefined): LickCategory | undefined {
  return JAZZ_LICK_CATEGORIES.includes(value as LickCategory) ? (value as LickCategory) : undefined;
}

function normalizeLickNumber(value: string | undefined): number | undefined {
  const parsed = Number(value);
  if (!Number.isInteger(parsed)) return undefined;
  return JAZZ_LICKS.some((entry) => entry.number === parsed) ? parsed : undefined;
}

// ---------------------------------------------------------------------------
// Backing tracks (JT14-18) — catalogue of the included practice tracks.
// ---------------------------------------------------------------------------

export interface BackingTrackInfo {
  id: string;
  style: "swing" | "ballad" | "bossa-nova";
  bpm: number;
  label: string;
  /** Songs the track suits, per Julian's notes. */
  songs: string[];
  /** Static URL the track is served from (see static/audio/jazz/). */
  url: string;
}

export const JAZZ_BACKING_TRACKS: BackingTrackInfo[] = [
  {
    id: "swing-125",
    style: "swing",
    bpm: 125,
    label: "Swing — 125 bpm",
    songs: ["Autumn Leaves", "Afternoon in Paris"],
    url: "/audio/jazz/swing-125.mp3",
  },
  {
    id: "swing-115",
    style: "swing",
    bpm: 115,
    label: "Swing — 115 bpm",
    songs: [],
    url: "/audio/jazz/swing-115.mp3",
  },
  {
    id: "swing-40",
    style: "swing",
    bpm: 40,
    label: "Slow swing — 40 bpm",
    songs: ["Georgia On My Mind"],
    url: "/audio/jazz/swing-40.mp3",
  },
  {
    id: "ballad-65",
    style: "ballad",
    bpm: 65,
    label: "Ballad — 65 bpm",
    songs: ["Misty", "Tenderly", "Cry Me A River"],
    url: "/audio/jazz/ballad-65.mp3",
  },
  {
    id: "bossa-125",
    style: "bossa-nova",
    bpm: 125,
    label: "Bossa nova — 125 bpm",
    songs: ["Girl from Ipanema", "So Nice", "Blue Bossa"],
    url: "/audio/jazz/bossa-125.mp3",
  },
];

// ---------------------------------------------------------------------------
// Repertoire (JT13 — "33 jazz songs ideal for learning")
// ---------------------------------------------------------------------------

export interface RepertoireSong {
  title: string;
  feel: "swing" | "latin";
}

export const JAZZ_REPERTOIRE: RepertoireSong[] = [
  ...[
    "Autumn Leaves",
    "Misty",
    "Satin Doll",
    "Stompin' At The Savoy",
    "All The Things You Are",
    "Cry Me A River",
    "Afternoon In Paris",
    "Ladybird",
    "Summertime",
    "Taxi Driver",
    "Fly Me To The Moon",
    "Caravan",
    "Dolphin Dance",
    "They Can't Take That Away From Me",
    "Just Friends",
    "Easy Living",
    "Stella By Starlight",
    "Georgia On My Mind",
    "All Of Me",
    "Bye Bye Blackbird",
    "In A Sentimental Mood",
    "It Could Happen To You",
    "My Funny Valentine",
    "My Romance",
    "Night And Day",
    "Night In Tunisia",
  ].map((title) => ({ title, feel: "swing" as const })),
  ...[
    "Girl From Ipanema",
    "Blue Bossa",
    "Song For My Father",
    "So Nice (Summer Samba)",
    "Slow Hot Wind",
    "Invitation",
    "One Note Samba",
  ].map((title) => ({ title, feel: "latin" as const })),
];

// ---------------------------------------------------------------------------
// Curriculum (the ordered learning path — JT2 p2 philosophy + the whole pack)
// ---------------------------------------------------------------------------

export interface CurriculumLesson extends LearningPathStepDefinition {
  id: string;
  order: number;
  title: string;
  summary: string;
  /** Resource sheet(s) this lesson is drawn from. */
  resources: string[];
  /** In-app route that lets you practice it, if any. */
  href?: string;
  /** Skill Graph node this lesson advances (drives the path's progress). */
  skillId?: string;
  skillIds?: string[];
  modalities?: LearningPathStepDefinition["modalities"];
  minAttempts?: number;
  detail?: string;
  /** How this lesson generalizes across instruments. Defaults to `all`. */
  applies?: ContentApplicability;
}

/** "To master jazz piano you have to learn things in the right order." (JT2) */
export const JAZZ_CURRICULUM: CurriculumLesson[] = [
  {
    id: "intervals",
    order: 1,
    title: "Memorize your intervals",
    summary:
      "Every jazz technique is an interval pattern. Learn all ascending intervals first — set a 30–60 day deadline.",
    resources: ["JT1"],
    href: "/music/learn/ear/intervals",
    skillId: "pitch.intervals",
  },
  {
    id: "chord-symbols",
    order: 2,
    title: "Read every chord symbol",
    summary:
      "maj7, m7, 7, mMaj7, m7b5, dim7, 6/9 and the slash chords — what each means and its role in a ii-V-I.",
    resources: ["JT2"],
    kind: "reference",
    href: "/music/learn/jazz",
    links: [{ label: "Hear the qualities", href: "/music/learn/ear/chord-qualities" }],
  },
  {
    id: "extensions",
    order: 3,
    title: "Add chord extensions",
    summary:
      "Build the 9th, 11th, 13th (and b9 #9 #11 b13) from the major scale above any chord root.",
    resources: ["JT3"],
    kind: "reference",
    href: "/music/learn/jazz",
    links: [{ label: "Hear the qualities", href: "/music/learn/ear/chord-qualities" }],
  },
  {
    id: "chord-scales",
    order: 4,
    title: "Learn the chord-scale relationships",
    summary:
      "Pick one go-to scale per chord type (lydian over maj7, dorian over m7, mixolydian/altered over V7).",
    resources: ["JT4"],
    href: "/music/play/chord-scales?changes=major",
    links: [
      { label: "Minor ii-V-i", href: "/music/play/chord-scales?changes=minor" },
      { label: "Theory", href: "/music/learn/jazz" },
    ],
    skillIds: ["harmony.ii-v-i.chord-scales.major", "harmony.ii-v-i.chord-scales.minor"],
    modalities: ["played"],
    minAttempts: 3,
    detail:
      "At least 3 unaided Check answers in each major and minor variant, each averaging 66% or higher.",
  },
  {
    id: "shell-voicings",
    order: 5,
    title: "Shell voicings",
    summary: "Play the guide tones (1 3 7). The fastest way to comp through a tune.",
    resources: ["JT8"],
    kind: "reference",
    href: "/music/learn/jazz",
    links: [{ label: "Rootless voicings drill", href: "/music/play/voicings" }],
    applies: "polyphonic",
  },
  {
    id: "rootless-voicings",
    order: 6,
    title: "Rootless voicings — ii-V-I in 12 keys",
    summary:
      'Positions A (3 5 7 9) and B (7 9 3 5). "If you only learn one voicing type, make it this." Drill all 12 keys (graded).',
    resources: ["JT9", "JT6"],
    href: "/music/play/voicings",
    skillIds: ["harmony.ii-v-i.voicings.major", "harmony.ii-v-i.voicings.minor"],
    modalities: ["played"],
    minAttempts: 36,
    detail:
      "At least 36 unaided Check chord answers in each major and minor variant, each averaging 66% or higher. Extras are tolerated; this checks note collection.",
    applies: "polyphonic",
  },
  {
    id: "altered-voicings",
    order: 7,
    title: "Altered & upper-structure V7 voicings",
    summary:
      "Rootless voicings with V7b9 and V7 altered, plus upper-structure triads for richer dominant colour.",
    resources: ["JT10", "JT11", "JT12"],
    href: "/music/play/voicings?variant=altered",
    links: [{ label: "Theory", href: "/music/learn/jazz" }],
    skillId: "harmony.ii-v-i.voicings.altered",
    modalities: ["played"],
    minAttempts: 36,
    detail:
      "At least 36 unaided Check answers in the altered variant, averaging 66% or higher. Extras are tolerated; this checks note collection.",
    applies: "polyphonic",
  },
  {
    id: "licks",
    order: 8,
    title: "Play the licks over ii-V-I",
    summary:
      "Hear a transcribed line, play it back over the changes, then take it through the keys.",
    resources: ["JT5"],
    href: "/music/play/licks?category=major-ii-V-I",
    links: [{ label: "Minor ii-V-i licks", href: "/music/play/licks?category=minor-ii-V-i" }],
    skillIds: ["harmony.ii-v-i.licks.major-ii-V-I", "harmony.ii-v-i.licks.minor-ii-V-i"],
    modalities: ["played"],
    detail:
      "At least one unaided Check phrase in each major and minor ii-V-I category, each averaging 66% or higher. Pitch order only; transposition and timing are not assessed.",
    applies: "pitched",
  },
  {
    id: "improv",
    order: 9,
    title: "Improvise over ii-V-I",
    summary:
      "Chord tones + approach patterns + bebop/altered/diminished scales. Work the 29 licks.",
    resources: ["JT5"],
    href: "/music/jam",
    applies: "pitched",
  },
  {
    id: "repertoire",
    order: 10,
    title: "Learn repertoire from a Real Book",
    summary:
      "Apply everything to standards. Practice with the swing / ballad / bossa backing tracks.",
    resources: ["JT13", "JT14", "JT15", "JT16", "JT17", "JT18"],
    href: "/music/jam",
  },
];

// ---------------------------------------------------------------------------
// Lick transcriptions (JT5) — playable single-line melodies.
// ---------------------------------------------------------------------------

/** One melody note: [MIDI pitch, duration in beats] (0.5 = a swung eighth). */
export type LickNote = readonly [midi: number, beats: number];

/**
 * Transcribed right-hand lines for the 29 licks, one bar per chord of the
 * lick's progression. Read from the JT5 notation; each follows the scale and
 * technique documented on `JAZZ_LICKS[n]`. Stored as data so any note is easy
 * to correct.
 */
export const LICK_PHRASES: Record<number, LickNote[]> = {
  // --- Major ii-V-I (Dm7 | G7 | Cmaj7) ---
  1: [
    [62, 0.5],
    [65, 0.5],
    [69, 0.5],
    [72, 0.5],
    [69, 0.5],
    [65, 0.5],
    [62, 0.5],
    [65, 0.5],
    [67, 0.5],
    [71, 0.5],
    [74, 0.5],
    [77, 0.5],
    [74, 0.5],
    [71, 0.5],
    [67, 0.5],
    [71, 0.5],
    [72, 0.5],
    [71, 0.5],
    [67, 0.5],
    [64, 0.5],
    [67, 0.5],
    [72, 0.5],
    [76, 2],
  ],
  2: [
    [62, 0.5],
    [64, 0.5],
    [65, 0.5],
    [67, 0.5],
    [69, 0.5],
    [71, 0.5],
    [72, 0.5],
    [74, 0.5],
    [76, 0.5],
    [74, 0.5],
    [72, 0.5],
    [71, 0.5],
    [69, 0.5],
    [67, 0.5],
    [65, 0.5],
    [64, 0.5],
    [65, 0.5],
    [64, 0.5],
    [62, 0.5],
    [60, 0.5],
    [64, 0.5],
    [67, 0.5],
    [72, 2],
  ],
  3: [
    [62, 0.5],
    [65, 0.5],
    [69, 0.5],
    [72, 1],
    [69, 0.5],
    [65, 0.5],
    [79, 0.5],
    [78, 0.5],
    [77, 0.5],
    [76, 0.5],
    [74, 0.5],
    [72, 0.5],
    [71, 0.5],
    [69, 0.5],
    [71, 0.5],
    [72, 0.5],
    [76, 2],
  ],
  4: [
    [69, 0.5],
    [70, 0.5],
    [71, 0.5],
    [74, 0.5],
    [72, 0.5],
    [69, 0.5],
    [63, 0.5],
    [64, 0.5],
    [71, 0.5],
    [65, 0.5],
    [62, 0.5],
    [71, 0.5],
    [72, 0.5],
    [71, 0.5],
    [67, 0.5],
    [64, 1.5],
  ],
  5: [
    [65, 0.5],
    [69, 0.5],
    [72, 0.5],
    [70, 0.5],
    [71, 1],
    [74, 0.5],
    [71, 0.5],
    [69, 0.5],
    [67, 0.5],
    [63, 0.5],
    [64, 0.5],
    [67, 0.5],
    [72, 0.5],
    [76, 2],
  ],
  6: [
    [66, 0.5],
    [67, 0.5],
    [63, 0.5],
    [64, 0.5],
    [60, 0.5],
    [62, 0.5],
    [61, 0.5],
    [62, 0.5],
    [68, 0.5],
    [70, 0.5],
    [73, 0.5],
    [71, 0.5],
    [64, 0.5],
    [67, 0.5],
    [72, 2],
  ],
  7: [
    [62, 0.5],
    [64, 0.5],
    [65, 0.5],
    [67, 0.5],
    [69, 0.5],
    [65, 0.5],
    [67, 0.5],
    [68, 0.5],
    [70, 0.5],
    [71, 0.5],
    [73, 0.5],
    [74, 0.5],
    [72, 0.5],
    [71, 0.5],
    [67, 1.5],
  ],
  8: [
    [62, 0.5],
    [65, 0.5],
    [69, 0.5],
    [72, 1],
    [70, 0.5],
    [68, 0.5],
    [67, 0.5],
    [65, 0.5],
    [73, 0.5],
    [71, 0.5],
    [70, 0.5],
    [68, 0.5],
    [72, 0.5],
    [71, 0.5],
    [76, 1.5],
  ],
  9: [
    [62, 0.5],
    [65, 0.5],
    [69, 0.5],
    [72, 1],
    [80, 0.5],
    [78, 0.5],
    [75, 0.5],
    [73, 0.5],
    [70, 0.5],
    [68, 0.5],
    [71, 0.5],
    [72, 0.5],
    [76, 0.5],
    [79, 1.5],
  ],
  10: [
    [62, 1],
    [65, 0.5],
    [69, 0.5],
    [72, 0.5],
    [70, 0.5],
    [80, 0.5],
    [78, 0.5],
    [75, 0.5],
    [73, 0.5],
    [70, 0.5],
    [68, 0.5],
    [71, 0.5],
    [72, 1],
    [76, 1.5],
  ],
  11: [
    [62, 0.5],
    [65, 0.5],
    [69, 0.5],
    [62, 0.5],
    [65, 0.5],
    [69, 0.5],
    [72, 0.5],
    [76, 0.5],
    [68, 0.5],
    [70, 0.5],
    [73, 0.5],
    [75, 0.5],
    [78, 0.5],
    [80, 0.5],
    [76, 0.5],
    [72, 0.5],
    [76, 1.5],
  ],
  // --- Major ii-V-I-VI (Dm7 | G7 | Cmaj7 | A7) ---
  12: [
    [62, 0.5],
    [64, 0.5],
    [65, 0.5],
    [67, 0.5],
    [69, 0.5],
    [72, 0.5],
    [71, 0.5],
    [69, 0.5],
    [67, 0.5],
    [71, 0.5],
    [74, 0.5],
    [77, 0.5],
    [76, 0.5],
    [74, 0.5],
    [72, 0.5],
    [71, 0.5],
    [72, 0.5],
    [76, 0.5],
    [79, 0.5],
    [76, 0.5],
    [72, 0.5],
    [71, 0.5],
    [69, 0.5],
    [67, 0.5],
    [73, 0.5],
    [69, 0.5],
    [66, 0.5],
    [64, 1.5],
  ],
  13: [
    [62, 0.5],
    [64, 0.5],
    [65, 0.5],
    [62, 0.5],
    [69, 0.5],
    [72, 0.5],
    [74, 0.5],
    [70, 0.5],
    [71, 0.5],
    [74, 0.5],
    [77, 0.5],
    [74, 0.5],
    [71, 0.5],
    [67, 0.5],
    [65, 0.5],
    [62, 0.5],
    [64, 0.5],
    [67, 0.5],
    [72, 0.5],
    [71, 0.5],
    [67, 0.5],
    [64, 0.5],
    [70, 0.5],
    [71, 0.5],
    [73, 0.5],
    [69, 1.5],
  ],
  14: [
    [69, 0.5],
    [70, 0.5],
    [72, 0.5],
    [69, 0.5],
    [65, 0.5],
    [62, 0.5],
    [80, 0.5],
    [78, 0.5],
    [75, 0.5],
    [73, 0.5],
    [70, 0.5],
    [68, 0.5],
    [67, 0.5],
    [65, 0.5],
    [64, 0.5],
    [67, 0.5],
    [72, 0.5],
    [76, 0.5],
    [69, 0.5],
    [73, 0.5],
    [76, 0.5],
    [79, 1.5],
  ],
  15: [
    [62, 0.5],
    [65, 0.5],
    [69, 0.5],
    [72, 0.5],
    [74, 0.5],
    [72, 0.5],
    [69, 0.5],
    [65, 0.5],
    [71, 0.5],
    [70, 0.5],
    [68, 0.5],
    [67, 0.5],
    [73, 0.5],
    [71, 0.5],
    [70, 0.5],
    [68, 0.5],
    [72, 0.5],
    [76, 0.5],
    [79, 0.5],
    [76, 0.5],
    [70, 0.5],
    [71, 0.5],
    [73, 0.5],
    [69, 1.5],
  ],
  16: [
    [62, 0.5],
    [65, 0.5],
    [69, 0.5],
    [72, 1],
    [74, 0.5],
    [69, 0.5],
    [68, 0.5],
    [70, 0.5],
    [71, 0.5],
    [73, 0.5],
    [74, 0.5],
    [76, 0.5],
    [77, 0.5],
    [79, 0.5],
    [76, 0.5],
    [72, 0.5],
    [71, 0.5],
    [67, 0.5],
    [73, 0.5],
    [69, 0.5],
    [66, 0.5],
    [64, 1.5],
  ],
  17: [
    [62, 0.5],
    [65, 0.5],
    [69, 0.5],
    [70, 0.5],
    [72, 0.5],
    [69, 0.5],
    [65, 0.5],
    [62, 0.5],
    [70, 0.5],
    [71, 0.5],
    [74, 0.5],
    [73, 0.5],
    [71, 0.5],
    [70, 0.5],
    [68, 0.5],
    [67, 0.5],
    [64, 0.5],
    [67, 0.5],
    [72, 0.5],
    [76, 0.5],
    [75, 0.5],
    [76, 0.5],
    [69, 0.5],
    [73, 0.5],
    [76, 1],
  ],
  // --- Minor ii-V-i (Dm7b5 | G7 | Cm7) ---
  18: [
    [62, 0.5],
    [65, 0.5],
    [68, 0.5],
    [72, 0.5],
    [74, 0.5],
    [72, 0.5],
    [68, 0.5],
    [65, 0.5],
    [67, 0.5],
    [71, 0.5],
    [74, 0.5],
    [77, 0.5],
    [74, 0.5],
    [71, 0.5],
    [67, 0.5],
    [69, 0.5],
    [70, 0.5],
    [72, 0.5],
    [75, 0.5],
    [70, 0.5],
    [67, 0.5],
    [63, 0.5],
    [60, 1.5],
  ],
  19: [
    [62, 0.5],
    [65, 0.5],
    [68, 0.5],
    [70, 0.5],
    [72, 0.5],
    [68, 0.5],
    [65, 0.5],
    [62, 0.5],
    [71, 0.5],
    [74, 0.5],
    [77, 0.5],
    [74, 0.5],
    [70, 0.5],
    [67, 0.5],
    [65, 0.5],
    [62, 0.5],
    [63, 0.5],
    [65, 0.5],
    [70, 0.5],
    [72, 0.5],
    [70, 0.5],
    [67, 0.5],
    [63, 1.5],
  ],
  20: [
    [62, 0.5],
    [65, 0.5],
    [68, 0.5],
    [70, 1],
    [68, 0.5],
    [65, 0.5],
    [71, 0.5],
    [73, 0.5],
    [74, 0.5],
    [76, 0.5],
    [77, 0.5],
    [73, 0.5],
    [70, 0.5],
    [68, 0.5],
    [70, 0.5],
    [72, 0.5],
    [75, 0.5],
    [70, 0.5],
    [67, 1],
  ],
  21: [
    [61, 0.5],
    [62, 0.5],
    [65, 0.5],
    [68, 0.5],
    [70, 0.5],
    [68, 0.5],
    [65, 0.5],
    [62, 0.5],
    [66, 0.5],
    [67, 0.5],
    [70, 0.5],
    [71, 0.5],
    [73, 0.5],
    [74, 0.5],
    [76, 0.5],
    [77, 0.5],
    [75, 0.5],
    [72, 0.5],
    [70, 0.5],
    [67, 0.5],
    [63, 1.5],
  ],
  22: [
    [62, 0.5],
    [65, 1],
    [68, 0.5],
    [72, 0.5],
    [70, 1],
    [67, 0.5],
    [71, 1],
    [74, 0.5],
    [70, 0.5],
    [67, 1],
    [70, 0.5],
    [72, 0.5],
    [75, 0.5],
    [70, 0.5],
    [63, 1.5],
  ],
  23: [
    [62, 0.5],
    [65, 0.5],
    [68, 0.5],
    [70, 0.5],
    [72, 0.5],
    [70, 0.5],
    [68, 0.5],
    [65, 0.5],
    [80, 0.5],
    [78, 0.5],
    [75, 0.5],
    [73, 0.5],
    [70, 0.5],
    [68, 0.5],
    [67, 0.5],
    [65, 0.5],
    [63, 0.5],
    [65, 0.5],
    [70, 0.5],
    [72, 0.5],
    [75, 0.5],
    [70, 1],
  ],
  24: [
    [62, 0.5],
    [65, 0.5],
    [68, 0.5],
    [62, 0.5],
    [65, 0.5],
    [68, 0.5],
    [70, 0.5],
    [72, 0.5],
    [80, 0.5],
    [78, 0.5],
    [75, 0.5],
    [73, 0.5],
    [70, 0.5],
    [68, 0.5],
    [75, 0.5],
    [72, 0.5],
    [70, 0.5],
    [67, 0.5],
    [63, 1.5],
  ],
  // --- Minor-chord licks (straight time, over Cm7) ---
  25: [
    [60, 0.5],
    [63, 0.5],
    [62, 0.5],
    [63, 0.5],
    [65, 0.5],
    [67, 0.5],
    [70, 0.5],
    [67, 0.5],
    [65, 0.5],
    [63, 0.5],
    [62, 0.5],
    [60, 0.5],
    [70, 0.5],
    [72, 0.5],
    [75, 1],
  ],
  26: [
    [63, 0.5],
    [65, 0.5],
    [67, 0.5],
    [69, 0.5],
    [70, 0.5],
    [69, 0.5],
    [67, 0.5],
    [65, 1],
    [68, 0.5],
    [70, 0.5],
    [72, 0.5],
    [74, 0.5],
    [75, 0.5],
    [74, 0.5],
    [72, 0.5],
    [70, 1],
  ],
  27: [
    [60, 0.5],
    [63, 0.5],
    [65, 0.5],
    [66, 0.5],
    [67, 0.5],
    [70, 0.5],
    [67, 0.5],
    [66, 0.5],
    [65, 0.5],
    [63, 0.5],
    [66, 0.5],
    [65, 0.5],
    [63, 0.5],
    [60, 1.5],
  ],
  28: [
    [60, 0.5],
    [63, 0.5],
    [60, 0.5],
    [63, 0.5],
    [65, 0.5],
    [67, 0.5],
    [65, 0.5],
    [67, 0.5],
    [70, 0.5],
    [72, 0.5],
    [70, 0.5],
    [72, 0.5],
    [75, 0.5],
    [72, 0.5],
    [70, 0.5],
    [67, 1],
  ],
  29: [
    [60, 0.5],
    [63, 0.5],
    [65, 0.5],
    [67, 0.5],
    [63, 0.5],
    [65, 0.5],
    [67, 0.5],
    [70, 0.5],
    [65, 0.5],
    [67, 0.5],
    [70, 0.5],
    [72, 0.5],
    [67, 0.5],
    [70, 0.5],
    [72, 0.5],
    [75, 0.5],
    [70, 0.5],
    [72, 0.5],
    [75, 0.5],
    [79, 0.5],
    [84, 1],
  ],
};

/** Cumulative-offset timed notes for a lick, in beats. */
export function lickTimeline(
  phrase: LickNote[],
): { midi: number; beats: number; offsetBeats: number }[] {
  let offset = 0;
  return phrase.map(([midi, beats]) => {
    const note = { midi, beats, offsetBeats: offset };
    offset += beats;
    return note;
  });
}

/** Total length of a lick phrase in beats. */
export function lickDurationBeats(phrase: LickNote[]): number {
  return phrase.reduce((total, [, beats]) => total + beats, 0);
}

export interface LickGrade {
  /** Notes played in the right place (pitch-class), 0..total. */
  matched: number;
  total: number;
  /** matched / total, 0..1. */
  accuracy: number;
}

export interface JazzSequenceCaptureArgs {
  /** Accepted note events, when observed; older callers may only have pitch arrays. */
  input?: NoteEvent[];
  assistance?: ScoringEvent["assistance"];
  exerciseId: string;
  label: string;
  sessionId: string;
  runId: string;
  eventId: string;
  promptId: string;
  skillIds: string[];
  capabilities: Capability[];
  expectedMidi: number[];
  playedMidi: number[];
  grade: LickGrade;
  startedAt: UnixMs;
  endedAt: UnixMs;
  difficulty: number;
  instrument?: InstrumentId;
  params?: Record<string, unknown>;
}

export interface JazzSequenceCapture {
  event: ScoringEvent;
  run: ExerciseRunRecord;
}

export function buildJazzSequenceCapture(args: JazzSequenceCaptureArgs): JazzSequenceCapture {
  const metrics: ScoringMetric[] = args.expectedMidi.map((expectedMidi, index) => ({
    kind: "pitch",
    expectedMidi,
    actualMidi: args.playedMidi[index],
  }));
  const run: ExerciseRunRecord = {
    id: args.runId,
    exerciseId: args.exerciseId,
    startedAt: args.startedAt,
    endedAt: args.endedAt,
    promptIds: [args.promptId],
    targetSkillIds: [...args.skillIds],
    difficulty: args.difficulty,
    ...(args.instrument !== undefined ? { instrument: args.instrument } : {}),
    ...(args.params !== undefined ? { params: { ...args.params } } : {}),
  };
  const event = resultToScoringEvent({
    result: {
      correct: args.grade.accuracy >= 0.9,
      score: args.grade.accuracy,
      metrics,
      feedback: [],
      input: args.input ?? [],
      target: { label: args.label, midiNotes: [...args.expectedMidi] },
      response: { midiNotes: [...args.playedMidi] },
    },
    sessionId: args.sessionId,
    runId: args.runId,
    exercise: { id: args.exerciseId, skillIds: args.skillIds, capabilities: args.capabilities },
    prompt: { id: args.promptId },
    at: args.endedAt,
    difficulty: args.difficulty,
    modality: "played",
    instrument: args.instrument,
    assistance: args.assistance,
    makeId: () => args.eventId,
  });

  return { event, run };
}

/**
 * Grade a played-back lick against its phrase by positional pitch-class match.
 * Octave-lenient (so on-screen / different-register playing still scores) and
 * position-based: the i-th played note is compared to the i-th phrase note, so
 * wrong or missing notes count against accuracy. Extra notes past the phrase
 * length are ignored. Pure — the route layer captures the played midi sequence.
 */
export function gradeLickSequence(expectedMidi: number[], playedMidi: number[]): LickGrade {
  const total = expectedMidi.length;
  if (total === 0) return { matched: 0, total: 0, accuracy: 1 };
  const pc = (n: number) => ((n % 12) + 12) % 12;
  let matched = 0;
  for (let i = 0; i < total; i++) {
    const played = playedMidi[i];
    if (played !== undefined && pc(played) === pc(expectedMidi[i]!)) matched += 1;
  }
  return { matched, total, accuracy: matched / total };
}

// ---------------------------------------------------------------------------
// Lesson path — the ordered curriculum projected over real skill progress and
// the active instrument. Threads the existing tools into one path.
// ---------------------------------------------------------------------------

export type LessonStatus = LearningPathStepStatus;

export type LessonPathStep = LearningPathStep<CurriculumLesson>;

/**
 * Project the jazz curriculum into a progress-aware, instrument-aware path.
 * A thin wrapper over the shared learning-path engine: lessons map their single
 * `skillId` onto the engine's `skillIds`. Pass `mastery(skillId)` (e.g.
 * `SkillGraphStore.getMastery(id).mastery`) so the engine stays free of storage.
 */
export function buildJazzLessonPath(opts: LearningPathOptions = {}): LessonPathStep[] {
  return buildJazzPath(opts).steps;
}

/** The Jazz Path with its done count and Continue target. */
export function buildJazzPath(opts: LearningPathOptions = {}): LearningPath<CurriculumLesson> {
  return buildLearningPath(
    JAZZ_CURRICULUM.map((lesson) => ({
      ...lesson,
      ...(lesson.skillId ? { skillIds: [lesson.skillId] } : {}),
    })),
    opts,
  );
}

/** Inclusive, one-based note positions for the selected response and its reference. */
export function normalizeLickRange(
  length: number,
  start = 1,
  end = length,
): { start: number; end: number } {
  const first = Math.max(1, Math.min(length, Number.isFinite(start) ? Math.floor(start) : 1));
  return {
    start: first,
    end: Math.max(first, Math.min(length, Number.isFinite(end) ? Math.floor(end) : length)),
  };
}

/** A four-note practice window around the first positional pitch-class error. */
export function missedLickChunk(
  expected: number[],
  played: number[],
): { start: number; end: number } | undefined {
  const missed = expected.findIndex(
    (note, index) => gradeLickSequence([note], played.slice(index, index + 1)).matched === 0,
  );
  if (missed < 0) return undefined;
  const start = Math.floor(missed / 4) * 4 + 1;
  return { start, end: Math.min(expected.length, start + 3) };
}
