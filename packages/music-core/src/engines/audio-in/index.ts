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

export {
  micClipSupported,
  prepareMicClip,
  recordMicClip,
  type PreparedMicClip,
  type RecordMicClipOptions,
} from "./record-clip";

export {
  computeChroma,
  chromaFromNoteEnergies,
  chromaToPitchClasses,
  computeNoteEnergies,
  noteEnergy,
  type ChromaOptions,
  type NoteEnergyBank,
} from "./chroma";

export {
  GATE_MAX_MIDI,
  GATE_MIN_MIDI,
  NoteGate,
  type NoteGateFrame,
  type NoteGateOptions,
  type NoteGateReason,
  type NoteGateResult,
} from "./note-gate";

export {
  evaluateGateAcceptance,
  gateAcceptanceAdvertises,
  gateMaterialFor,
  GATE_ACCEPTANCE_MANIFEST_VERSION,
  GATE_ACCEPTED_P95_LIMIT_MS,
  GATE_ADVANCE_LIMIT_MS,
  GATE_DYNAMICS,
  GATE_MATERIAL_STRATA,
  GATE_REGISTER_STRATA,
  type GateAcceptanceInput,
  type GateAcceptanceReport,
  type GateDynamic,
  type GateMaterialId,
  type GatePhysicalAttempt,
  type GateRegisterId,
  type GateStratumReport,
  type GateTrial,
} from "./gate-acceptance";

export {
  GateSession,
  MICROPHONE_HINT_MESSAGE,
  type GateCaptureSource,
  type GateEventSink,
  type GateHintReason,
  type GateSessionOptions,
  type GateSessionState,
} from "./gate-session";

export { resampleLinear } from "./resample";

export { FrameRing } from "./frame-ring";

export { ChordAudioSource, type ChordAnalysis, type ChordAudioSourceOptions } from "./chord-source";
