// Typed exports of the verified JSON in this folder. The JSON is copied verbatim
// from context/data and must not be edited; these interfaces describe it.

import type {
  Instrument,
  Modality,
  PlaybackSound,
  Settings,
  Skill,
  SkillLevel,
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

export type DrumVoiceId =
  | "kick"
  | "snare"
  | "hats"
  | "openhat"
  | "808"
  | "perc"
  // Voices the app adds for the repertoire, on their General MIDI notes in bank A.
  | "rim"
  | "pedalhat"
  | "tom-low"
  | "tom-mid"
  | "tom-high"
  | "crash"
  | "ride"
  | "cowbell";
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
  sectionLabels: string[];
  /** "ghost": a soft note under the groove (MIDI velocity below 50). */
  targets: { voice: DrumVoiceId; beat: number; accent: "normal" | "accent" | "ghost" }[];
}
export const MPC_GROOVES = mpcGroovesJson as { voices: DrumVoice[]; catalog: GrooveDef[] };

export interface RudimentDef {
  id: string;
  label: string;
  unit: Hand[];
  accentMode?: "moving";
  /** Notes a beat; the app's rolls go to 6 (sixteenth triplets) and 8 (thirty-seconds). */
  subdivision?: 2 | 3 | 4 | 6 | 8;
  flam?: boolean;
  /** Both hands (two fingers) on one pad: a roll. */
  onePad?: boolean;
  /** Accented positions in the unit; the rest are taps (velocity bands). */
  accents?: number[];
  /** Notes in each beat, cycling (a pyramid: 1 2 3 4 3 2); overrides the subdivision. */
  perBeat?: number[];
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
  minAttempts?: number;
  /** Mean credit for done when not the paths' usual 0.66 (higher with only 2 or 3 answers). */
  threshold?: number;
  /** Only runs at least this hard count (a harder setup counts for easier steps too). */
  minDifficulty?: number;
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
const MINOR_NAMES: [string, string][] = [
  ["I", "i chord in a minor key"],
  ["ii", "ii° chord in a minor key"],
  ["iii", "III chord in a minor key"],
  ["IV", "iv chord in a minor key"],
  ["V", "V chord in a minor key"],
  ["vi", "VI chord in a minor key"],
  ["vii", "VII chord in a minor key"],
];
APP_SKILLS.push(
  {
    id: "ear.chord-functions.minor",
    name: "Chords in a minor key",
    capability: "harmony",
    level: "intermediate",
    tags: ["ear", "function", "minor"],
    version: 1,
  },
  ...MINOR_NAMES.map(([t, name]) => ({
    id: `ear.chord-function.minor.${t}`,
    name,
    capability: "harmony" as const,
    level: "intermediate" as const,
    tags: ["ear", "function", "minor"],
    version: 1,
  })),
  {
    id: "ear.chord-function.sevenths",
    name: "Seventh chords in a key",
    capability: "harmony",
    level: "intermediate",
    tags: ["ear", "function", "seventh"],
    version: 1,
  },
);
const SCALE_NAMES: [string, string][] = [
  ["major", "Major scale by ear"],
  ["natural-minor", "Natural minor scale by ear"],
  ["harmonic-minor", "Harmonic minor scale by ear"],
  ["major-pentatonic", "Major pentatonic by ear"],
  ["minor-pentatonic", "Minor pentatonic by ear"],
  ["blues", "Blues scale by ear"],
  ["melodic-minor", "Melodic minor scale by ear"],
  ["mixolydian", "Mixolydian by ear"],
  ["dorian", "Dorian by ear"],
  ["lydian", "Lydian by ear"],
  ["phrygian", "Phrygian by ear"],
  ["locrian", "Locrian by ear"],
];
APP_SKILLS.push(
  {
    id: "ear.scales",
    name: "Scales and modes by ear",
    capability: "harmony",
    level: "early-intermediate",
    tags: ["ear", "scale"],
    version: 1,
  },
  ...SCALE_NAMES.map(([t, name]) => ({
    id: `ear.scale.${t}`,
    name,
    capability: "harmony" as const,
    level: "early-intermediate" as const,
    tags: ["ear", "scale"],
    version: 1,
  })),
);
const POSITION_NAMES: [string, string][] = [
  ["root", "Root position by ear"],
  ["first", "First inversion by ear"],
  ["second", "Second inversion by ear"],
  ["third", "Third inversion by ear"],
];
APP_SKILLS.push(
  {
    id: "ear.inversions",
    name: "Inversions by ear",
    capability: "harmony",
    level: "intermediate",
    tags: ["ear", "inversion"],
    version: 1,
  },
  ...POSITION_NAMES.map(([t, name]) => ({
    id: `ear.inversion.${t}`,
    name,
    capability: "harmony" as const,
    level: "intermediate" as const,
    tags: ["ear", "inversion"],
    version: 1,
  })),
  {
    id: "ear.inversion.sevenths",
    name: "Seventh-chord inversions by ear",
    capability: "harmony",
    level: "advanced",
    tags: ["ear", "inversion", "seventh"],
    version: 1,
  },
);
APP_SKILLS.push(
  {
    id: "ear.bass-lines",
    name: "Bass lines by ear",
    capability: "harmony",
    level: "intermediate",
    tags: ["ear", "bass", "dictation"],
    version: 1,
  },
  {
    id: "ear.bass-lines.inversions",
    name: "Bass lines through inversions",
    capability: "harmony",
    level: "advanced",
    tags: ["ear", "bass", "inversion"],
    version: 1,
  },
);
APP_SKILLS.push({
  id: "ear.fine-pitch",
  name: "Fine pitch (cents)",
  capability: "pitch",
  level: "intermediate",
  tags: ["ear", "intonation"],
  version: 1,
});
APP_SKILLS.push({
  id: "ear.error-detection",
  name: "Spotting a wrong note",
  capability: "pitch",
  level: "early-intermediate",
  tags: ["ear", "melody", "error-detection"],
  version: 1,
});
APP_SKILLS.push(
  {
    id: "ear.rhythm-echo",
    name: "Rhythm echo: hear it, tap it back",
    capability: "rhythm",
    level: "beginner",
    tags: ["ear", "rhythm"],
    version: 1,
  },
  {
    id: "ear.groove-dictation",
    name: "Groove dictation: kick, snare and hat",
    capability: "rhythm",
    level: "intermediate",
    tags: ["ear", "rhythm", "drums", "dictation"],
    version: 1,
  },
  {
    id: "ear.rhythm-dictation",
    name: "Rhythm dictation: hear it, write it",
    capability: "rhythm",
    level: "early-intermediate",
    tags: ["ear", "rhythm", "dictation"],
    version: 1,
  },
);
const STUDIO_NAMES: [string, string][] = [
  ["eq-peak", "Finding a boosted EQ band"],
  ["eq-cut", "Finding a cut EQ band"],
  ["boost-or-cut", "Telling a boost from a cut"],
  ["level", "Level differences in dB"],
  ["pan", "Pan position"],
  ["compression", "How hard something is compressed"],
  ["delay", "Delay time"],
];
APP_SKILLS.push(
  {
    id: "studio.ears",
    name: "Studio ears",
    capability: "ear",
    level: "intermediate",
    tags: ["studio", "eq", "mixing"],
    version: 1,
  },
  ...STUDIO_NAMES.map(([t, name]) => ({
    id: `studio.${t}`,
    name,
    capability: "ear" as const,
    level: "intermediate" as const,
    tags: ["studio", "mixing"],
    version: 1,
  })),
);
const CIRCLE_NAMES: [string, string][] = [
  ["order", "Order of sharps and flats"],
  ["count", "Keys and their signatures"],
  ["signature", "Reading key signatures"],
  ["neighbours", "Neighbouring and relative keys"],
  ["chords", "The chords of a key"],
  ["wheel", "The circle from memory"],
];
APP_SKILLS.push(
  {
    id: "theory.circle",
    name: "Circle of fifths",
    capability: "reading",
    level: "beginner",
    tags: ["theory", "keys"],
    version: 1,
  },
  ...CIRCLE_NAMES.map(([t, name]) => ({
    id: `theory.circle.${t}`,
    name,
    capability: "reading" as const,
    level: "beginner" as const,
    tags: ["theory", "keys"],
    version: 1,
  })),
);
// Finger drumming (docs/research/finger-drumming.md): technique and the repertoire's topics.
const PAD_SKILLS: [string, string, SkillLevel][] = [
  ["rolls", "Finger rolls on one pad", "intermediate"],
  ["accents", "Accents and ghosts", "early-intermediate"],
  ["steadiness", "Holding the tempo without a click", "early-intermediate"],
  ["basics", "First grooves", "beginner"],
  ["hiphop", "Boom bap and the first breaks", "beginner"],
  ["ghosts", "Ghost-note grooves", "early-intermediate"],
  ["independence", "Independence: the hats steady while the kick moves", "intermediate"],
  ["fills", "Fills across the pads", "intermediate"],
  ["swing", "Swing by hand", "intermediate"],
  ["dance", "House, trap and drum and bass", "advanced"],
  ["breaks", "The classic breaks", "advanced"],
  ["latin", "Latin, Caribbean and Brazilian grooves", "intermediate"],
];
APP_SKILLS.push(
  ...PAD_SKILLS.map(([t, name, level]) => ({
    id: `technique.mpc.${t}`,
    name,
    capability: "technique" as const,
    level,
    tags: ["mpc", "finger-drumming"],
    version: 1,
  })),
);
APP_SKILLS.push(
  {
    id: "technique.arpeggios",
    name: "Arpeggios",
    capability: "technique",
    level: "early-intermediate",
    tags: ["piano", "arpeggios"],
    version: 1,
  },
  {
    id: "harmony.keyboard-cadences",
    name: "Cadences at the keyboard in every key",
    capability: "harmony",
    level: "early-intermediate",
    tags: ["piano", "cadences"],
    version: 1,
  },
  {
    id: "technique.chord-inversions",
    name: "Broken and blocked chords through their inversions",
    capability: "technique",
    level: "beginner",
    tags: ["piano", "chords"],
    version: 1,
  },
);
APP_SKILLS.push({
  id: "technique.aerophone.fingering",
  name: "Aerophone fingerings, in Roland's lesson order",
  capability: "technique",
  level: "beginner",
  tags: ["aerophone", "fingering"],
  version: 1,
});
const APP_RELATIONSHIPS: SkillRelationship[] = [
  { from: "technique.aerophone", to: "technique.aerophone.fingering", kind: "component" },
  ...CIRCLE_NAMES.map(([t]) => ({
    from: "theory.circle",
    to: `theory.circle.${t}`,
    kind: "component" as const,
  })),
  ...STUDIO_NAMES.map(([t]) => ({
    from: "studio.ears",
    to: `studio.${t}`,
    kind: "component" as const,
  })),
  ...POSITION_NAMES.map(([t]) => ({
    from: "ear.inversions",
    to: `ear.inversion.${t}`,
    kind: "component" as const,
  })),
  ...SCALE_NAMES.map(([t]) => ({
    from: "ear.scales",
    to: `ear.scale.${t}`,
    kind: "component" as const,
  })),
  ...FUNCTION_NAMES.map(([t]) => ({
    from: "ear.chord-functions",
    to: `ear.chord-function.${t}`,
    kind: "component" as const,
  })),
  ...MINOR_NAMES.map(([t]) => ({
    from: "ear.chord-functions.minor",
    to: `ear.chord-function.minor.${t}`,
    kind: "component" as const,
  })),
];

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
