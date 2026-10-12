// Typed exports of the verified JSON in this folder. The JSON is copied verbatim
// from context/data and must not be edited; these interfaces describe it.

import type {
  Instrument,
  Modality,
  PlaybackSound,
  Settings,
  Skill,
  SkillRelationship,
} from "../types";
import aerophoneJson from "./aerophone-fingerings.json";
import cadencesJson from "./cadences-and-chord-qualities.json";
import challengesJson from "./challenges.json";
import guitarPositionsJson from "./chord-positions-guitar-standard.json";
import ukulelePositionsJson from "./chord-positions-ukulele-high-g.json";
import chordShapesJson from "./chord-shapes.json";
import compingJson from "./comping-patterns.json";
import dailyRoutineJson from "./daily-routine.json";
import defaultSettingsJson from "./default-settings.json";
import drumKitsJson from "./drum-kits.json";
import earTrainingJson from "./ear-training.json";
import fretboardPatternsJson from "./fretboard-patterns.json";
import jazzJson from "./jazz.json";
import learningPathsJson from "./learning-paths.json";
import mpcGroovesJson from "./mpc-grooves.json";
import mpcRudimentsJson from "./mpc-rudiments.json";
import readingLevelsJson from "./reading-levels.json";
import rhythmPatternsJson from "./rhythm-patterns.json";
import scalesJson from "./scales.json";
import skillGraphJson from "./skill-graph-seed.json";
import stringSpiderJson from "./string-spider.json";
import tuningsJson from "./tunings.json";
import twoHandJson from "./two-hand-patterns.json";
import voicingDrillJson from "./voicing-drill.json";

type Hand = "left" | "right";
type Link = { label: string; href: string };

// ---------------------------------------------------------------------------
// Aerophone

export interface AerophoneFingering {
  keys: string[];
  octave: boolean;
}
export interface AerophoneFingeringData {
  range: { lowestMidi: number; highestMidi: number };
  keys: { id: string; label: string }[];
  fingeringsByMidi: Record<string, AerophoneFingering>;
  chart: ({ midi: number; inRange: boolean } & AerophoneFingering)[];
}
export const AEROPHONE_FINGERINGS = aerophoneJson as AerophoneFingeringData;

// ---------------------------------------------------------------------------
// Ear: cadences and chord qualities

export interface CadenceDef {
  token: "authentic" | "plagal" | "half" | "deceptive";
  label: string;
  skillId: string;
  romanProgression: string[];
  playback: { midiNotes: number[]; offsetSeconds: number; durationSeconds: number }[];
}
export interface ChordQualityDef {
  token: string;
  label: string;
  skillId: string;
  intervals: number[];
  level: "triad" | "seventh";
}
export const CADENCES_AND_QUALITIES = cadencesJson as {
  cadences: CadenceDef[];
  chordQualities: ChordQualityDef[];
};

// ---------------------------------------------------------------------------
// Challenges

export interface ChallengeDef {
  id: string;
  title: string;
  description?: string;
  href?: string;
  defaultTarget: number;
  progressSource: string;
  reason?: string;
}
export const CHALLENGES = challengesJson as {
  dailyChallenges: ChallengeDef[];
  dayBoundaries: { dayMs: number; weekMs: number; dayKey: string };
  weeklySummary: string[];
};

// ---------------------------------------------------------------------------
// Chord shapes and positions. Frets and fingers are string-1-first; null = muted / no finger.

export interface ChordShape {
  id: string;
  name: string;
  instrument: "guitar" | "ukulele";
  tuningId: string;
  difficulty: number;
  frets: (number | null)[];
  fingers: (number | null)[];
  mutedStrings: number[];
  openStrings: number[];
  commonTransitions: string[];
}
export interface ChordPosition extends ChordShape {
  shapeId: string;
  positionIndex: number;
  positionLabel: string;
  kind: "open" | "barre" | "closed";
  baseFret: number;
  barre?: { fret: number; fromString: number; toString: number };
  fretWindow: { start: number; end: number };
}
export const CHORD_SHAPES = chordShapesJson as ChordShape[];
export const GUITAR_STANDARD_POSITIONS = guitarPositionsJson as Record<string, ChordPosition[]>;
export const UKULELE_HIGH_G_POSITIONS = ukulelePositionsJson as Record<string, ChordPosition[]>;

// ---------------------------------------------------------------------------
// Comping

export interface CompingPatternDef {
  id: string;
  label: string;
  chord: string;
  bpm: number;
  bars: number;
  swing: boolean;
  lick: { startBeat: number; midiNote: number; durationBeats: number; finger: number }[];
  compRhythm: { beat: number; durationBeats: number }[];
  shellMidi: number[];
}
export const COMPING = compingJson as {
  patterns: CompingPatternDef[];
  leftHandVoice: string;
  rightHandVoice: string;
  blueThirdC7: CompingPatternDef;
};

// ---------------------------------------------------------------------------
// Daily routine

export interface RoutineStepDef {
  id: string;
  label: string;
  href: string;
  description: string;
  minutes: number;
}
export const DAILY_ROUTINE = dailyRoutineJson as {
  minutesPerStep: number;
  defaultBudgetMinutes: number;
  budgetRangeMinutes: [number, number];
  plansByInstrument: Record<Instrument, RoutineStepDef[]>;
  genericPlan: RoutineStepDef[];
};

// ---------------------------------------------------------------------------
// Default settings

export const DEFAULT_SETTINGS_DATA = defaultSettingsJson as {
  defaults: Pick<
    Settings,
    | "echoCancellation"
    | "reduceMotion"
    | "instrumentColorCoding"
    | "audioInputLabel"
    | "audioOffsetMs"
    | "midiOffsetMs"
    | "preferredPlaybackSound"
    | "playbackLevel"
    | "metronomeLevel"
    | "masterLevel"
    | "muted"
    | "metronomeEnabled"
    | "countInBars"
    | "activeInstrument"
  > & { tempoByVariant: Record<string, number> };
  playbackSoundIds: PlaybackSound[];
  playbackSoundLabels: Record<PlaybackSound, string>;
};

// ---------------------------------------------------------------------------
// Drums

export type DrumVoiceId = "kick" | "snare" | "hats" | "openhat" | "808" | "perc";
export interface DrumVoice {
  id: DrumVoiceId;
  name: string;
  midi: number;
}
export const DRUM_KITS = drumKitsJson as { BOOM_BAP_KIT: DrumVoice[] };

export interface GrooveDef {
  value: string;
  label: string;
  bars: number;
  sectionLabels: ("groove" | "fill")[];
  targets: { voice: DrumVoiceId; beat: number; accent: "normal" | "accent" }[];
}
export const MPC_GROOVES = mpcGroovesJson as { voices: DrumVoice[]; catalog: GrooveDef[] };

export interface RudimentDef {
  id: string;
  label: string;
  unit: Hand[];
  accentMode?: "moving";
  subdivision?: 2 | 3 | 4;
  flam?: boolean;
}
export const MPC_RUDIMENTS = mpcRudimentsJson as {
  patterns: RudimentDef[];
  subdivisions: (2 | 3 | 4)[];
  subdivisionLabels: Record<string, string>;
  flamGraceMs: number;
};

// ---------------------------------------------------------------------------
// Ear training

export type EarAnswerMode = "choice" | "play-back" | "voice" | "listen" | "listen-along";
export interface EarDrillDef {
  slug: string;
  title: string;
  description: string;
  drill: string;
  answerModes: EarAnswerMode[];
  usesScaleDegreeLevel: boolean;
  usesLabels: boolean;
  queueMode: "balanced" | "adaptive";
  skillIds: string[];
}
export interface EarPathStepDef {
  id: string;
  order: number;
  title: string;
  summary: string;
  detail: string;
  kind?: "drill" | "review" | "reference";
  goal: string;
  practiceMode: string;
  currentSupport: string;
  recommendedDrill: string;
  href: string;
  modalities?: Modality[];
  exerciseIds?: string[];
  links?: Link[];
  skillIds?: string[];
  minSessions?: number;
}
export const EAR_TRAINING = earTrainingJson as {
  capabilities: {
    id: string;
    title: string;
    status: string;
    drill?: string;
    route: string;
    summary: string;
  }[];
  defaultConfig: {
    drill: string;
    answerMode: EarAnswerMode;
    feedbackMode: "practice" | "test";
    scaleDegreeSet: string;
    scaleDegreeLabelMode: "degree" | "solfege";
  };
  drills: EarDrillDef[];
  learningPathDefinition: {
    id: string;
    title: string;
    subtitle: string;
    href: string;
    steps: EarPathStepDef[];
  };
  pathHref: string;
};

// ---------------------------------------------------------------------------
// Fretboard patterns (offsets relative to a root fret on string 6)

export interface FretboardPatternDef {
  id: string;
  label: string;
  family: "minor-pentatonic" | "caged-major";
  offsets: { stringNumber: number; fretOffset: number }[];
}
export const FRETBOARD_PATTERNS = fretboardPatternsJson as FretboardPatternDef[];

export type SpiderSpanId = "single" | "adjacent-2" | "adjacent-3" | "all";
export interface SpiderPatternDef {
  id: string;
  label: string;
  fretOffsets: number[];
  group: "classic" | "permutation";
}
export const STRING_SPIDER = stringSpiderJson as {
  patterns: SpiderPatternDef[];
  spans: { id: SpiderSpanId; label: string }[];
};

// ---------------------------------------------------------------------------
// Jazz

export type LickPosition = { string: number; fret: number; finger: number };
/** [midi or null for a rest, beats, optional fretted position]. */
export type LickNoteTuple = [number | null, number] | [number | null, number, LickPosition];
export interface JazzLickDef {
  number: number;
  category: string;
  progression: string[];
  scales: string[];
  techniques: string[];
  tip: string;
}
export interface ChordScaleRow {
  family: string;
  scale: string;
  label: string;
  recommended?: boolean;
  hint?: string;
}
// LICK_PHRASES mixes plain number pairs with null rests, so the inferred JSON type
// cannot be narrowed directly; data.test.ts checks the tuple shape instead.
export const JAZZ = jazzJson as unknown as {
  CHORD_EXTENSIONS: {
    symbol: string;
    degree: number;
    alteration?: "b" | "#";
    semitones: number;
    note: string;
  }[];
  CHORD_SCALE_MAP: ChordScaleRow[];
  CHORD_SCALE_DRILL_CHANGES: ("major" | "minor")[];
  CHORD_SCALE_DRILL_DEFAULT_CONFIG: { changesId: "major" | "minor" };
  DOMINANT_VOICINGS: { id: string; label: string; hint: string; offsets: number[] }[];
  UPPER_STRUCTURES: {
    id: string;
    triad: string;
    triadRoot: number;
    quality: "maj" | "min";
    adds: string;
    favorite?: boolean;
  }[];
  JAZZ_CHORD_TYPES: {
    id: string;
    symbol: string;
    name: string;
    family: string;
    role: string;
    extensions?: string[];
  }[];
  TWELVE_KEY_CYCLE: string[];
  IMPROV_TECHNIQUES: { id: string; name: string; summary: string }[];
  JAZZ_CURRICULUM: {
    id: string;
    order: number;
    title: string;
    summary: string;
    resources: string[];
    kind?: "reference";
    href: string;
    links?: Link[];
    skillId?: string;
    skillIds?: string[];
    modalities?: Modality[];
    minAttempts?: number;
    detail?: string;
    applies?: "pitched" | "polyphonic";
  }[];
  JAZZ_REPERTOIRE: { title: string; feel: string }[];
  JAZZ_BACKING_TRACKS: {
    id: string;
    style: string;
    bpm: number;
    label: string;
    songs: string[];
    url: string;
  }[];
  JAZZ_LICK_CATEGORIES: string[];
  JAZZ_LICKS: JazzLickDef[];
  LICK_PHRASES: Record<string, LickNoteTuple[]>;
  GUITAR_BOX_ONE_LICK: number;
  GUITAR_BOX_ONE_LICK_A_MINOR: number;
  JAZZ_LICK_DRILL_DEFAULT_CONFIG: { category: string; lickNumber: number };
};

// ---------------------------------------------------------------------------
// Learning paths

export interface PathStepDef {
  id: string;
  order: number;
  title: string;
  summary: string;
  detail?: string;
  href: string;
  links?: Link[];
  requires?: string[];
  evidence?: "guided-accepted";
  skillIds?: string[];
  exerciseIds?: string[];
  minAttempts?: number;
  minSessions?: number;
  kind?: "drill" | "review" | "reference";
  applies?: { only: Instrument[] };
}
export interface LearningPathDef {
  id: string;
  title: string;
  subtitle: string;
  href: string;
  steps: PathStepDef[];
}
export const LEARNING_PATHS = learningPathsJson as {
  pathIds: ("guitar" | "piano" | "mpc")[];
  doneThreshold: number;
  paths: Record<"guitar" | "piano" | "mpc", LearningPathDef>;
};

// ---------------------------------------------------------------------------
// Reading

export type ReadingLevelId = "primer" | "level-1" | "level-2" | "level-3";
export interface ReadingLevelDef {
  id: ReadingLevelId;
  label: string;
  description: string;
  rhythm: string;
  recommendedDifficulty: number;
  recommendedClefs: ("treble" | "bass")[];
  recommendedRange: { lowestMidi: number; highestMidi: number };
  recommendedKeys: string[];
}
export const READING_LEVELS = readingLevelsJson as ReadingLevelDef[];

// ---------------------------------------------------------------------------
// Rhythm

export interface RhythmEventDef {
  id: string;
  beat: number;
  voice: "tap";
  accent: "accent" | "normal";
  stroke?: "down" | "up" | "mute";
  durationBeats?: number;
}
export interface RhythmPatternDef {
  id: string;
  label: string;
  meter: { beats: number; beatUnit: number };
  defaultBars: number;
  events: RhythmEventDef[];
  rests: { startBeat: number; endBeat: number }[];
  clickSchedule?: { bar: number; audible: boolean }[];
  chords?: { symbol: string; pitchClasses: number[]; startBeat: number; durationBeats: number }[];
}
export const RHYTHM_PATTERNS = rhythmPatternsJson as RhythmPatternDef[];

// ---------------------------------------------------------------------------
// Scales

export type ScaleKind = keyof typeof scalesJson.semitonesByKind;
export type ScaleSpan = "pentascale" | "one-octave" | "two-octave";
export type ScaleMotion = "up" | "down" | "up-down";
export const SCALE_DATA = scalesJson as {
  semitonesByKind: Record<ScaleKind, number[]>;
  jazzScaleKinds: ScaleKind[];
  spans: ScaleSpan[];
  motions: ScaleMotion[];
  togetherWindowMs: number;
};

// ---------------------------------------------------------------------------
// Skill graph

const FUNCTION_NAMES: [string, string][] = [
  ["I", "I chord in a key"],
  ["ii", "ii chord in a key"],
  ["iii", "iii chord in a key"],
  ["IV", "IV chord in a key"],
  ["V", "V chord in a key"],
  ["vi", "vi chord in a key"],
  ["vii", "vii° chord in a key"],
];
/**
 * Skills the app adds to the verified seed (kept as an exact copy): chords
 * heard by their place in a key, one per numeral, and progressions of them.
 */
const APP_SKILLS: Skill[] = [
  {
    id: "ear.chord-functions",
    name: "Chords in a key",
    capability: "harmony",
    level: "early-intermediate",
    tags: ["ear", "function"],
    version: 1,
  },
  ...FUNCTION_NAMES.map(([t, name]) => ({
    id: `ear.chord-function.${t}`,
    name,
    capability: "harmony" as const,
    level: "early-intermediate" as const,
    tags: ["ear", "function"],
    version: 1,
  })),
  {
    id: "ear.progressions",
    name: "Progression dictation",
    capability: "harmony",
    level: "intermediate",
    tags: ["ear", "function", "progression"],
    version: 1,
  },
];
const APP_RELATIONSHIPS: SkillRelationship[] = FUNCTION_NAMES.map(([t]) => ({
  from: "ear.chord-functions",
  to: `ear.chord-function.${t}`,
  kind: "component",
}));

export const SKILL_GRAPH_SEED = {
  skills: [...(skillGraphJson.skills as Skill[]), ...APP_SKILLS],
  relationships: [...(skillGraphJson.relationships as SkillRelationship[]), ...APP_RELATIONSHIPS],
};

// ---------------------------------------------------------------------------
// Tunings. Open strings are string-1-first (highest pitch first).

export interface Tuning {
  id: string;
  name: string;
  instrument: "guitar" | "ukulele";
  openStrings: number[];
  fretCount: number;
  notationTransposition: number;
  source: "curated" | "custom";
}
export const TUNINGS = tuningsJson as { guitar: Tuning[]; ukulele: Tuning[] };

// ---------------------------------------------------------------------------
// Two-hand piano patterns

export type TwoHandPatternId =
  | "lh-pulse-rh-line"
  | "rh-pulse-lh-line"
  | "lh-shell-rh-line"
  | "alberti-rh-holds"
  | "contrary-motion-scale"
  | "contrary-five";
export type HandMode = "both" | "left" | "right";
export interface TwoHandTargetEvent {
  hand: Hand;
  midiNote: number;
  beat: number;
  finger?: number;
}
export interface TwoHandRendering {
  patternKind: TwoHandPatternId;
  patternLabel: string;
  splitMidi: number;
  measuresTogether: boolean;
  melodyHand: Hand;
  togetherWindowMs: number;
  targetEvents: TwoHandTargetEvent[];
}
export const TWO_HAND = twoHandJson as {
  options: { id: TwoHandPatternId; label: string }[];
  handModes: { id: HandMode; label: string }[];
  majorSteps: number[];
  mirrorRightSteps: number[];
  mirrorLeftSteps: number[];
  mirrorFingers: number[];
  leftShell: number[];
  rightFragment: number[];
  alberti: number[];
  holds: number[];
  examplesTonicC4Bpm80Bars2: Record<TwoHandPatternId, TwoHandRendering>;
};

// ---------------------------------------------------------------------------
// Voicing drill

export interface VoicingTarget {
  id: string;
  skillIds: string[];
  symbol: string;
  expectedPitchClasses: number[];
  expectedBassPc: number;
  /** "arpeggio" on a monophonic instrument. */
  mode: "chord" | "arpeggio";
  displayMidi: number[];
}
export const VOICING_DRILL = voicingDrillJson as {
  defaultConfig: {
    instrument: Instrument;
    variant: "major" | "minor" | "altered" | "inversions";
    startPosition: "A" | "B";
    strict: boolean;
    autoAdvance: boolean;
  };
  targets: VoicingTarget[];
};

/** Every skill id in the seed graph; content must only emit these. */
export const SKILL_IDS: ReadonlySet<string> = new Set(SKILL_GRAPH_SEED.skills.map((s) => s.id));
