/**
 * `audio-in` — microphone capture + monophonic pitch detection.
 *
 * The highest-leverage Phase-2 engine: it unblocks the Tuner, the Intonation /
 * Drone trainer, audio-driven technique drills, and later chord verification.
 * Layered so the analysis math is pure and testable while the browser glue stays
 * thin:
 *  - {@link ./pitch-detect}: McLeod Pitch Method + frequency/MIDI/cents math (pure).
 *  - {@link ./onset-detect}: adaptive RMS transient detection (pure).
 *  - {@link ./tuner}: estimate → note + cents + flat/in-tune/sharp zone (pure).
 *  - {@link ./capture}: getUserMedia + AudioWorklet emitting readings & events.
 */

export {
  DEFAULT_A4,
  detectPitch,
  frequencyToMidi,
  midiToFrequency,
  centsBetween,
  type PitchDetectOptions,
  type PitchEstimate,
} from "./pitch-detect";

export {
  OnsetDetector,
  frameRms,
  type OnsetDetection,
  type OnsetDetectOptions,
} from "./onset-detect";

export {
  tunerReading,
  intonationZone,
  type TunerReading,
  type TunerOptions,
  type IntonationZone,
} from "./tuner";

export {
  AudioPitchSource,
  type AudioPitchState,
  type AudioPitchStatus,
  type AudioPitchSourceOptions,
} from "./capture";
