/**
 * PracticeModality — *how* a capability is being practiced, orthogonal to the
 * {@link Capability} ("what").
 *
 * The critique correctly noted that "ear training" is really a *modality* that
 * applies across capabilities (hearing an interval = Pitch/heard; hearing a
 * ii–V–I = Harmony/heard; clapping a rhythm = Rhythm/tapped). Modelling this
 * axis explicitly lets a single skill be practiced multiple ways and lets
 * analytics distinguish "knows the m6 when read" from "knows it by ear".
 *
 * NOTE (deliberate v1.1 decision): we are introducing this type but NOT yet
 * removing `Capability.EarTraining`. Collapsing ear training into
 * Harmony/Pitch/Rhythm + modality is a taxonomy change that should be made
 * against real exercises, not speculatively. For now `EarTraining` and a
 * `heard` modality coexist; revisit once concrete ear-training exercises exist.
 */
export type PracticeModality =
  | "played"
  | "heard"
  | "read"
  | "sung"
  | "written"
  | "tapped"
  | "recognized";
