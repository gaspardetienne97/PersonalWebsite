import type { InstrumentId } from "./instrument";

/**
 * Instrument applicability — how a piece of content (a chord, scale, lick,
 * voicing, drill, or lesson) generalizes across instruments.
 *
 *  - `all`        — theory / ear training; identical on every instrument.
 *  - `pitched`    — melodic content (scales, licks, arpeggios); any pitched
 *                   instrument. Only the fingering view changes.
 *  - `polyphonic` — chord voicings; on a monophonic instrument they degrade to
 *                   an arpeggio (still playable, one note at a time).
 *  - `{ only }`   — instrument-specific (spider drill, MPC rudiments, Aerophone
 *                   breath drills); offered ONLY on those instruments.
 *
 * Pages and engines read this instead of hardcoding instrument lists, so the
 * "play it on multiple instruments" rule lives in one place.
 */
export type ContentApplicability = "all" | "pitched" | "polyphonic" | { only: InstrumentId[] };

/** Pitched instruments the app can render/practice melodic content on. */
export const PITCHED_INSTRUMENTS: InstrumentId[] = ["piano", "guitar", "ukulele", "aerophone"];

/** Instruments that can sound more than one note at once. */
export const POLYPHONIC_INSTRUMENTS: InstrumentId[] = ["piano", "guitar", "ukulele"];

/** Instruments that play one note at a time (chords become arpeggios). */
export const MONOPHONIC_INSTRUMENTS: InstrumentId[] = ["aerophone", "voice"];

/**
 * Instruments that have a distinct {@link InstrumentView} (keyboard, fretboard,
 * Aerophone fingering). The canonical toggle list for chord/scale/voicing views.
 */
export const VIEWABLE_INSTRUMENTS: InstrumentId[] = ["piano", "guitar", "ukulele", "aerophone"];

export function isMonophonic(instrument: InstrumentId): boolean {
  return MONOPHONIC_INSTRUMENTS.includes(instrument);
}

/** The viewable instruments a piece of content applies to. */
export function instrumentsForApplicability(applicability: ContentApplicability): InstrumentId[] {
  if (typeof applicability === "object") {
    return VIEWABLE_INSTRUMENTS.filter((id) => applicability.only.includes(id));
  }
  // all / pitched / polyphonic are all viewable across the pitched instruments;
  // polyphonic content simply degrades to an arpeggio on monophonic ones.
  return VIEWABLE_INSTRUMENTS;
}

/** True when polyphonic content must be shown/played as an arpeggio here. */
export function degradesToArpeggio(
  applicability: ContentApplicability,
  instrument: InstrumentId,
): boolean {
  return applicability === "polyphonic" && isMonophonic(instrument);
}
