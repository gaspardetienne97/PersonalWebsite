// Shared domain contract for Practice OS. Framework-free: no DOM, no Svelte.
// Input events carry performance.now() ms; stored records (ScoringEvent.at,
// sessions, runs) carry epoch ms (Date.now()). Every
// engine, drill and store speaks these types.

export type Instrument = "piano" | "guitar" | "ukulele" | "aerophone" | "mpc" | "voice";
export const INSTRUMENTS: readonly Instrument[] = [
  "piano",
  "guitar",
  "ukulele",
  "aerophone",
  "mpc",
  "voice",
];

export type InputSource = "midi" | "audio" | "onscreen" | "click";
export type Assistance = "independent" | "guided" | "hinted" | "self-assessed";
export type Modality = "played" | "heard" | "read" | "sung" | "written" | "tapped" | "recognized";
export type Capability = "pitch" | "rhythm" | "harmony" | "reading" | "technique" | "ear";
export type SkillLevel = "beginner" | "early-intermediate" | "intermediate" | "advanced";
export type Strictness = "relaxed" | "normal" | "strict";

/** Router confidence per source (catalog 5.1). Audio uses the detector clarity. */
export const SOURCE_CONFIDENCE = { midi: 1, onscreen: 0.8, audio: 0.7, click: 0.6 } as const;

// ---------------------------------------------------------------------------
// Input events: what reaches a drill after the router (profiles applied,
// pad maps rewritten to canonical bank A, latency offsets subtracted).

export interface NoteEvent {
  kind: "noteon" | "noteoff";
  midi: number;
  /** 0..1. On-screen input is a fixed 0.8 and must be treated as "not measured". */
  velocity: number;
  at: number;
  source: InputSource;
  confidence: number;
  instrument?: Instrument;
  deviceId?: string;
  channel?: number;
  /** Fretted on-screen taps only. String 1 is the highest-pitched string. */
  string?: number;
  fret?: number;
  /** Microphone only: detune of the detected pitch from `midi`. */
  cents?: number;
  /** True when velocity was actually measured (MIDI). */
  velocityMeasured?: boolean;
}

export interface ControlEvent {
  kind: "cc" | "pitchbend" | "pressure";
  /** CC number for kind "cc" (breath is CC 2). */
  controller?: number;
  /** cc/pressure: 0..1. pitchbend: -1..1. */
  value: number;
  at: number;
  deviceId?: string;
  channel?: number;
  instrument?: Instrument;
}

/** A detected onset with no pitch claim (microphone rhythm and strum input). */
export interface OnsetEvent {
  kind: "onset";
  at: number;
  source: InputSource;
  strength: number;
  /** Detected pitch at the onset, when the detector heard one. */
  midi?: number;
}

export type InputEvent = NoteEvent | ControlEvent | OnsetEvent;

// ---------------------------------------------------------------------------
// Scoring (scoring rules 1-2).

export type Metric =
  | { kind: "pitch"; expectedMidi: number; actualMidi?: number; cents?: number }
  | { kind: "timing"; expectedMs: number; actualMs: number; errorMs: number }
  | { kind: "velocity"; expected: number; actual: number }
  | { kind: "choice"; expected: string; actual?: string }
  | {
      kind: "chord";
      expectedPcs: number[];
      actualPcs: number[];
      missing: number[];
      extra: number[];
      expectedBassPc?: number;
      actualBassPc?: number;
      inversionCorrect?: boolean;
    }
  | {
      kind: "voice-leading";
      fromMidi: number[];
      actualMidi: number[];
      register: [number, number];
      membershipCorrect: boolean;
      actualSemitones?: number;
      minimumSemitones: number;
    }
  | {
      kind: "chord-changes";
      tuningId: string;
      durationMs: number;
      fromShapeId: string;
      toShapeId: string;
      completedChanges: number;
      cleanChanges: number;
      changesPerMinute: number;
    }
  | { kind: "breath"; steadiness: number; targetCurve?: number[]; actualCurve?: number[] };

export type Label = string | number | number[];

export interface ScoringEvent {
  id: string;
  sessionId: string;
  runId?: string;
  exerciseId: string;
  promptId: string;
  at: number;
  skillIds: string[];
  capabilities: Capability[];
  correct: boolean;
  partialCredit: number;
  difficulty: number;
  latencyMs?: number;
  modality: Modality;
  source: InputSource | "mixed";
  /** Only when unambiguous; a mixed-instrument run records none. */
  instrument?: Instrument;
  /** Missing only on historical records; never relabel. */
  assistance?: Assistance;
  metrics: Metric[];
  target?: Label;
  response?: Label;
}

/** The single mastery predicate (scoring rules 1). */
export function isMasteryEligible(event: Pick<ScoringEvent, "assistance">): boolean {
  return event.assistance === "independent";
}

/** Grade tone for any 0..1 score (scoring rules 15). */
export type GradeTone = "success" | "warn" | "error";
export function gradeTone(score: number): GradeTone {
  return score >= 0.67 ? "success" : score >= 0.34 ? "warn" : "error";
}

// ---------------------------------------------------------------------------
// Skill graph (catalog 5.3).

export interface Skill {
  id: string;
  name: string;
  capability: Capability;
  level: SkillLevel;
  tags: string[];
  version: number;
  deprecated?: boolean;
  replacedBy?: string;
}

export interface SkillRelationship {
  from: string;
  to: string;
  kind: "prerequisite" | "component" | "related";
  threshold?: number;
}

export interface SkillMastery {
  skillId: string;
  mastery: number;
  confidence: number;
  decayRate: number;
  /** ms epoch */
  lastPracticed: number;
  observations: number;
  /** Mastery right after the last evidence folded in (for review-due). */
  lastMeasured?: number;
}

// ---------------------------------------------------------------------------
// Sessions and runs (catalog 5.9). Times here are ms since epoch (Date.now()).

export type SessionSource = "free-practice" | "daily-routine" | "song" | "drill" | "jam";

export interface RunRecord {
  id: string;
  exerciseId: string;
  /** Stable setup key, used for "vs last run with the same setup". */
  setupKey: string;
  promptIds: string[];
  skillIds: string[];
  difficulty: number;
  instrument?: Instrument;
  params: Record<string, string | number | boolean>;
  startedAt: number;
  endedAt: number;
  score?: number;
  correct?: boolean;
  assistance: Assistance;
  xp: number;
  /** Short human summary, e.g. "92% · 88 BPM". */
  headline?: string;
}

export interface PracticeSession {
  id: string;
  startTime: number;
  endTime?: number;
  instrument?: Instrument;
  source: SessionSource;
  routineId?: string;
  runs: RunRecord[];
  eventIds: string[];
  xp: number;
  note?: string;
  nextTime?: string;
  tags: string[];
}

// ---------------------------------------------------------------------------
// Canonical score (catalog 5.13). Every renderer, player and follower
// consumes this; MusicXML keeps its source for engraving only.

export interface ScoreNote {
  midi: number;
  startBeat: number;
  durationBeats: number;
  /** 0..1 */
  velocity?: number;
  string?: number;
  fret?: number;
  finger?: number | string;
  /** Tie continuation from a previous note: sounds, but is not a new attack. */
  tieFrom?: boolean;
}

export interface ScoreVoice {
  id: string;
  name: string;
  partId?: string;
  clef?: "treble" | "bass";
  /** Hand for piano material. */
  hand?: "left" | "right";
  notes: ScoreNote[];
}

export interface ScoreSection {
  label: string;
  startBeat: number;
  endBeat: number;
}

export interface Score {
  id: string;
  title: string;
  composer?: string;
  bpm: number;
  meter: { beats: number; beatUnit: number };
  /** Circle-of-fifths key signature, -7..7. */
  keyFifths?: number;
  keyMode?: "major" | "minor";
  voices: ScoreVoice[];
  /** Total length in beats (end of last bar). */
  lengthBeats: number;
  sections?: ScoreSection[];
  chords?: { symbol: string; startBeat: number; durationBeats: number }[];
  source?: {
    kind: "musicxml" | "midi" | "generated" | "transcribed" | "piano-roll" | "take";
    xml?: string;
  };
}

/** A group of notes sharing an onset: the unit a follower waits for. */
export interface ScoreGroup {
  index: number;
  startBeat: number;
  durationBeats: number;
  notes: (ScoreNote & { voiceId: string })[];
}

// ---------------------------------------------------------------------------
// Devices (hardware notes 1).

export interface DeviceProfile {
  id: string;
  alias?: string;
  instrument?: Instrument;
  channel?: number;
  ignored?: boolean;
  padNotes?: number[];
  inputOffsetMs?: number;
  controllerLink?: boolean;
}

export type PreferredSurface = "keyboard" | "guitar" | "ukulele" | "mpc";

// ---------------------------------------------------------------------------
// Settings (data/default-settings.json).

export type PlaybackSound =
  | "salamander-piano"
  | "warm-synth"
  | "synth"
  | "e-piano"
  | "square"
  | "saw";

export interface Settings {
  echoCancellation: boolean;
  reduceMotion: boolean;
  instrumentColorCoding: boolean;
  audioInputLabel: string;
  audioInputDeviceId?: string;
  audioOffsetMs: number;
  midiOffsetMs: number;
  preferredPlaybackSound: PlaybackSound;
  playbackLevel: number;
  metronomeLevel: number;
  masterLevel: number;
  muted: boolean;
  metronomeEnabled: boolean;
  countInBars: 0 | 1 | 2;
  activeInstrument: Instrument;
  bpm: number;
  a4Hz: number;
  midiEnabledBefore: boolean;
  guitarTuningId: string;
  ukuleleTuningId: string;
  routineBudgetMinutes: number;
  weeklySessionGoal: number;
  preferredSource: Partial<Record<Instrument, InputSource>>;
  preferredSurface: Partial<Record<Instrument, PreferredSurface>>;
  frozenDays: string[];
  feedbackStyle: "every-note" | "summary";
  /** On-screen keys, frets and pads make sound (when sound is on). */
  onscreenSound: boolean;
  /** Gain applied to microphone recordings before encoding (dB, 0..24). */
  recordBoostDb: number;
}

export const DEFAULT_SETTINGS: Settings = {
  echoCancellation: false,
  reduceMotion: false,
  instrumentColorCoding: true,
  audioInputLabel: "Default input",
  audioOffsetMs: 0,
  midiOffsetMs: 0,
  preferredPlaybackSound: "salamander-piano",
  playbackLevel: 0.8,
  metronomeLevel: 0.7,
  masterLevel: 1,
  muted: false,
  metronomeEnabled: true,
  countInBars: 1,
  activeInstrument: "piano",
  bpm: 90,
  a4Hz: 440,
  midiEnabledBefore: false,
  guitarTuningId: "guitar.standard",
  ukuleleTuningId: "ukulele.high-g",
  routineBudgetMinutes: 20,
  weeklySessionGoal: 4,
  preferredSource: {},
  preferredSurface: {},
  frozenDays: [],
  feedbackStyle: "every-note",
  onscreenSound: true,
  recordBoostDb: 0,
};
