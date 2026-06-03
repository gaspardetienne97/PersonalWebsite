import type { InstrumentId } from "./instrument";

/**
 * Score - the canonical, instrument-neutral representation of a piece of music.
 *
 * The "one Score" half of "one Score, many projections". MIDI, MusicXML, ABC,
 * and (offline) audio transcription parse *into* this; instruments render
 * *from* it via a derived InstrumentProjection. Timing is in beats
 * (tempo-independent) so transpose/tempo/slow-down are clean transforms.
 *
 * v1.1 change: a score is no longer just notes. Chords, sections, markers, and
 * lyrics live in their own lanes, because chord symbols belong to *positions*
 * (not individual notes), and looping/practice needs form and annotations.
 */

export interface TempoMarker {
  atBeat: number;
  bpm: number;
}

export interface TimeSignatureMarker {
  atBeat: number;
  numerator: number;
  denominator: number;
}

export type VoiceRole = "melody" | "harmony" | "bass" | "drums" | "other";

export interface ScoreVoice {
  id: string;
  name: string; // "Melody", "Comping", "Bass", "Drums"
  role: VoiceRole;
}

export type DrumArticulation =
  | "kick"
  | "snare"
  | "closedHat"
  | "openHat"
  | "rim"
  | "clap"
  | "tom"
  | "crash"
  | "ride"
  | "perc";

export interface ScoreNote {
  midiNote: number;
  /** Onset in beats from score start (tempo-independent). */
  startBeat: number;
  /** Length in beats. */
  durationBeats: number;
  /** Normalized 0-1. */
  velocity: number;
  /** The voice/part this note belongs to. */
  voiceId: string;
  /** Semantic label for drum-voice notes (so MIDI 36 reads as "kick"). */
  drumArticulation?: DrumArticulation;
  /** Tie/slur/staccato/accent hints for rendering + articulation drills. */
  articulations?: string[];
}

/** Chord symbol at a position - its own lane, not a per-note field. */
export interface ChordEvent {
  symbol: string; // "G7b9", "Cmaj7", "Am"
  startBeat: number;
  durationBeats?: number;
}

/** Formal section for navigation and looping (intro/verse/chorus/solo). */
export interface ScoreSection {
  id: string;
  name: string;
  startBeat: number;
  endBeat: number;
}

/** Point/range marker for loops, practice spots, mistakes, annotations. */
export interface ScoreMarker {
  id: string;
  beat: number;
  endBeat?: number;
  label: string;
  kind: "loop" | "practice" | "mistake" | "annotation";
}

export interface LyricEvent {
  text: string;
  startBeat: number;
}

export type ScoreOrigin = "midi" | "musicxml" | "abc" | "audio-transcription" | "generated";

export interface Score {
  id: string;
  title?: string;
  origin: ScoreOrigin;
  /** e.g. "Bb", "G minor". */
  keySignature?: string;
  /** Always at least one marker (the starting tempo). */
  tempoMap: TempoMarker[];
  timeSignatures: TimeSignatureMarker[];
  voices: ScoreVoice[];
  notes: ScoreNote[];
  chords: ChordEvent[];
  sections: ScoreSection[];
  markers: ScoreMarker[];
  lyrics?: LyricEvent[];
}

/* --------------------------------------------------------------------------
 * Projections - the "many projections" half.
 *
 * v1.1 change: a projection is a DERIVED, CACHEABLE artifact, not core source
 * state. Parallel-indexed fret positions silently break under transpose, capo,
 * tuning, quantization, or voice filtering, so we never treat them as a source
 * of truth. Instead a projection is a reproducible function of:
 *
 *     project(Score, InstrumentProfile, ProjectionOptions) -> InstrumentProjection
 *
 * Cache it; recompute on any input change; only persist if the user manually
 * edits a fingering.
 * ------------------------------------------------------------------------ */

export interface ProjectionOptions {
  instrument: InstrumentId;
  /** Profile id whose tuning/capo/range govern the projection. */
  profileId?: string;
  transpose?: number;
  /** Voices to surface (e.g. a wind instrument gets melody only). */
  voiceIds?: string[];
  /** Fingering/voicing strategy for string instruments. */
  strategy?: "easy" | "position" | "voice-leading" | "open-strings" | "compact";
}

export interface FretPosition {
  /** 1 = highest string; numbering is instrument-defined but consistent. */
  string: number;
  /** 0 = open. */
  fret: number;
  finger?: 1 | 2 | 3 | 4;
}

/** A projected note: the source note plus where/how it lands on the instrument. */
export interface ProjectedNote {
  /** Index into the source Score.notes this was projected from. */
  sourceIndex: number;
  midiNote: number;
  startBeat: number;
  durationBeats: number;
  /** Fretboard placement(s) for guitar/uke. */
  frets?: FretPosition[];
  /** Hand assignment for keyboard reading. */
  hand?: "left" | "right";
  /** Aerophone fingering id. */
  fingeringId?: string;
  /** MPC pad index (bank A-H x 16) for drum voices. */
  padIndex?: number;
}

export interface InstrumentProjection {
  scoreId: string;
  options: ProjectionOptions;
  /** Derived; safe to discard and recompute. */
  notes: ProjectedNote[];
}
