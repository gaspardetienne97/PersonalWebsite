/**
 * Capability — the top-level taxonomy of musicianship.
 *
 * The app is organized *capability-first*: every {@link Skill} belongs to exactly
 * one Capability, every Exercise targets one or more, and progress dashboards
 * aggregate by it (e.g. "Pitch 78% · Rhythm 91% · Harmony 63%").
 *
 * Capabilities are domains of musicianship and are deliberately
 * **instrument-agnostic** — the same capability is practiced on piano, guitar,
 * ukulele, Aerophone, or pads. Which instrument a given practice run uses is a
 * property of the run, not of the capability.
 */
export enum Capability {
  /** Intonation, single-note accuracy, tuning, sung/played pitch. */
  Pitch = "pitch",
  /** Subdivision, timing accuracy, groove, swing, polyrhythm. */
  Rhythm = "rhythm",
  /** Chords, voicings, progressions, functional harmony. */
  Harmony = "harmony",
  /** Staff/tab reading and sight-reading. */
  Reading = "reading",
  /** Physical facility: scales, arpeggios, drills, hand/limb independence. */
  Technique = "technique",
  /**
   * Recognizing pitch, harmony, and rhythm *by ear*.
   * This overlaps in subject matter with Pitch/Harmony/Rhythm but is modelled
   * separately because "by ear" is a distinct, separately-trainable modality
   * that users recognize as its own practice area.
   */
  EarTraining = "ear",
  /** Spontaneous melodic/harmonic creation over a context (jazz, blues, modal). */
  Improvisation = "improv",
  /** Learning, retaining, and performing actual pieces. */
  Repertoire = "repertoire",
  /** Sequencing, beat-making, arrangement, production-lite. */
  Production = "production",
}

/** Human-readable labels for dashboards. */
export const CAPABILITY_LABELS: Record<Capability, string> = {
  [Capability.Pitch]: "Pitch",
  [Capability.Rhythm]: "Rhythm",
  [Capability.Harmony]: "Harmony",
  [Capability.Reading]: "Reading",
  [Capability.Technique]: "Technique",
  [Capability.EarTraining]: "Ear Training",
  [Capability.Improvisation]: "Improvisation",
  [Capability.Repertoire]: "Repertoire",
  [Capability.Production]: "Production",
};
