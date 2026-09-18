import type { InstrumentId } from "./instrument";
import type { MonotonicMs, ClockSource } from "./time";

/**
 * NoteEvent - the single normalized representation of musical input.
 *
 * This is the most important seam in the system: MIDI (MPC, Aerophone,
 * keyboards), real-time audio pitch/onset detection (guitar, ukulele, voice),
 * the on-screen keyboard, and click answers all produce the *same* event
 * shape. Every Exercise consumes NoteEvents and therefore never needs to know
 * how the note arrived - which is what makes exercises input-agnostic and lets
 * the Input Router swap sources transparently.
 *
 * Modelled as a discriminated union on `type` for exhaustive handling.
 */

export type InputSource = "midi" | "audio" | "onscreen" | "click";

interface NoteEventBase {
  source: InputSource;
  /**
   * MONOTONIC timestamp (not wall-clock) - performance.now() or
   * AudioContext.currentTime * 1000. All timing/rhythm scoring uses this, so it
   * must come from one consistent clock across sources; `clock` records which.
   */
  timestamp: MonotonicMs;
  clock: ClockSource;
  /** Which instrument produced it, when known. */
  instrument?: InstrumentId;
  /** Stable hardware/device identifier (e.g. the MIDI port id). */
  deviceId?: string;
  /** The InstrumentProfile this input was interpreted under, when known. */
  inputProfileId?: string;
  /**
   * Detector confidence for audio-derived events, 0-1 (e.g. MPM "clarity").
   * Undefined for MIDI/onscreen/click, which are exact by construction.
   */
  confidence?: number;
  /** Raw bytes, kept optionally for hardware debugging / latency calibration. */
  raw?: { midiStatus?: number; midiData1?: number; midiData2?: number };
}

export interface NoteOnEvent extends NoteEventBase {
  type: "noteOn";
  /** MIDI note number 0-127. Audio path quantizes detected pitch to nearest. */
  midiNote: number;
  /** Exact detected frequency before quantization; present on the audio path. */
  frequencyHz?: number;
  /** Observed on-screen string/fret selection; never inferred from MIDI pitch. */
  fretPosition?: { stringNumber: number; fretNumber: number };
  /** Normalized velocity 0-1 (raw MIDI 0-127 is scaled on ingest). */
  velocity: number;
  channel?: number;
}

export interface NoteOffEvent extends NoteEventBase {
  type: "noteOff";
  midiNote: number;
  channel?: number;
}

/**
 * Onset - a percussive/rhythmic attack with no required pitch. Produced by
 * audio onset detection (strummed/muted guitar, clapping, table taps) and used
 * by rhythm exercises that only care about *when*, not *what*. This fills the
 * gap where pitch is irrelevant or unavailable.
 */
export interface OnsetEvent extends NoteEventBase {
  type: "onset";
  /** Attack strength, normalized 0-1. */
  strength: number;
  /** Pitch if the detector happened to estimate one; often absent. */
  frequencyHz?: number;
}

/**
 * Continuous controller - e.g. Aerophone breath (CC2), expression (CC11),
 * volume (CC7). Drives breath-steadiness and swell analysis.
 */
export interface ControlChangeEvent extends NoteEventBase {
  type: "cc";
  controller: number;
  /** Normalized 0-1 (raw MIDI 0-127 scaled on ingest). */
  value: number;
  channel?: number;
}

/** Pitch bend - the Aerophone's bite sensor maps here; used for bend drills. */
export interface PitchBendEvent extends NoteEventBase {
  type: "pitchBend";
  /** Normalized -1..1 (center = 0). */
  bend: number;
  channel?: number;
}

/** Aftertouch / pressure - MPC pad pressure (poly) or channel pressure. */
export interface AftertouchEvent extends NoteEventBase {
  type: "aftertouch";
  /** Normalized 0-1. */
  pressure: number;
  /** Present for polyphonic (per-note) aftertouch. */
  midiNote?: number;
  channel?: number;
}

export type NoteEvent =
  | NoteOnEvent
  | NoteOffEvent
  | OnsetEvent
  | ControlChangeEvent
  | PitchBendEvent
  | AftertouchEvent;

/** Type guard for the common case. */
export function isNoteOn(e: NoteEvent): e is NoteOnEvent {
  return e.type === "noteOn";
}
