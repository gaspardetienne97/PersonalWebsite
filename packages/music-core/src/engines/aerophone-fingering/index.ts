/**
 * Aerophone fingering — maps a MIDI note to the keys to press on a Roland
 * Aerophone (AE-10/AE-20) in **sax fingering mode**, plus the key layout used to
 * draw the instrument. Pure data + lookups (no Svelte), so the SVG component and
 * any live-MIDI consumer share one source of truth.
 *
 * Fingerings are transcribed from the Aerophone sax fingering chart; the six
 * main keys + octave behaviour are reliable, while a few side/pinky keys on the
 * register break (C5/C#5) are best-effort — verify against the manual and edit
 * {@link AEROPHONE_FINGERINGS} to correct. The chart covers A#/Bb3..F#/Gb5.
 *
 * Verified against manual charts / live use: C4, D4, E4, F4, G4, A4, B4, C#5,
 * D5, Eb5. Still to confirm: the low pinkies (Bb3/B3/C#4), Eb4, the long F#
 * (F#4/F#5), G#4, the bis Bb4, and the C5 side-C.
 */

/** A key on the Aerophone that the fingering chart can fill in. */
export type AerophoneKeyId =
  // Main tone keys — left hand (index/middle/ring) then right hand.
  | "k1"
  | "k2"
  | "k3"
  | "k4"
  | "k5"
  | "k6"
  // Left-hand side / pinky keys.
  | "bisBb"
  | "gsharp"
  | "lowCsharp"
  | "lowB"
  | "lowBb"
  // Right-hand side keys + pinky keys.
  | "sideE"
  | "sideC"
  | "sideBb"
  | "eb"
  | "lowC";

/** The canonical key registry (id + human label). Drawing geometry lives in the
 *  AerophoneFingering component, which traces the Roland AE app illustration. */
export interface AerophoneKey {
  id: AerophoneKeyId;
  label: string;
}

export const AEROPHONE_KEYS: readonly AerophoneKey[] = [
  { id: "k1", label: "LH index" },
  { id: "k2", label: "LH middle" },
  { id: "k3", label: "LH ring" },
  { id: "k4", label: "RH index" },
  { id: "k5", label: "RH middle" },
  { id: "k6", label: "RH ring" },
  { id: "bisBb", label: "Bis Bb" },
  { id: "gsharp", label: "G#" },
  { id: "lowCsharp", label: "Low C#" },
  { id: "lowB", label: "Low B" },
  { id: "lowBb", label: "Low Bb" },
  { id: "sideE", label: "Side E" },
  { id: "sideC", label: "Side C" },
  { id: "sideBb", label: "Side Bb" },
  { id: "eb", label: "Eb" },
  { id: "lowC", label: "Low C" },
];

/** Lowest and highest notes the sax chart covers (A#/Bb3 .. F#/Gb5). */
export const AEROPHONE_RANGE = { lowestMidi: 58, highestMidi: 78 } as const;

/** A note's fingering: which keys are held and whether the octave key is up. */
export interface AerophoneFingering {
  midi: number;
  /** Whether the note falls within the charted range. */
  inRange: boolean;
  /** Pressed keys (empty for an open note or an out-of-range note). */
  keys: AerophoneKeyId[];
  /** Octave key engaged (upper register). */
  octave: boolean;
}

/**
 * Per-note fingerings keyed by MIDI number. Sax mode, written pitch. Main keys
 * (k1..k6) + octave are reliable; side/pinky keys on the break (C5/C#5) and the
 * "long" F# are best-effort — edit here to match your unit.
 */
export const AEROPHONE_FINGERINGS: Readonly<
  Record<number, Omit<AerophoneFingering, "midi" | "inRange">>
> = {
  58: { keys: ["k1", "k2", "k3", "k4", "k5", "k6", "lowBb"], octave: false }, // Bb3
  59: { keys: ["k1", "k2", "k3", "k4", "k5", "k6", "lowB"], octave: false }, // B3
  60: { keys: ["k1", "k2", "k3", "k4", "k5", "k6", "lowC"], octave: false }, // C4
  61: { keys: ["k1", "k2", "k3", "k4", "k5", "k6", "lowCsharp"], octave: false }, // C#4
  62: { keys: ["k1", "k2", "k3", "k4", "k5", "k6"], octave: false }, // D4
  63: { keys: ["k1", "k2", "k3", "k4", "k5", "eb"], octave: false }, // Eb4
  64: { keys: ["k1", "k2", "k3", "k4", "k5"], octave: false }, // E4
  65: { keys: ["k1", "k2", "k3", "k4"], octave: false }, // F4
  66: { keys: ["k1", "k2", "k3", "k5"], octave: false }, // F#4 (long F#)
  67: { keys: ["k1", "k2", "k3"], octave: false }, // G4
  68: { keys: ["k1", "k2", "k3", "gsharp"], octave: false }, // G#4
  69: { keys: ["k1", "k2"], octave: false }, // A4
  70: { keys: ["k1", "bisBb"], octave: false }, // Bb4 (bis)
  71: { keys: ["k1"], octave: false }, // B4
  72: { keys: ["sideC"], octave: false }, // C5 (side C) — verify
  73: { keys: [], octave: false }, // C#5 (open) — verify
  74: { keys: ["k1", "k2", "k3", "k4", "k5", "k6"], octave: true }, // D5
  75: { keys: ["k1", "k2", "k3", "k4", "k5", "eb"], octave: true }, // Eb5
  76: { keys: ["k1", "k2", "k3", "k4", "k5"], octave: true }, // E5
  77: { keys: ["k1", "k2", "k3", "k4"], octave: true }, // F5
  78: { keys: ["k1", "k2", "k3", "k5"], octave: true }, // F#5 (long F#)
};

/** The fingering for a MIDI note, or an out-of-range marker (no keys). */
export function fingeringForMidi(midi: number): AerophoneFingering {
  const entry = AEROPHONE_FINGERINGS[midi];
  if (!entry) {
    return { midi, inRange: false, keys: [], octave: false };
  }
  return { midi, inRange: true, keys: [...entry.keys], octave: entry.octave };
}

/** Every charted note in ascending order — for rendering a full fingering chart. */
export function aerophoneChart(): AerophoneFingering[] {
  const out: AerophoneFingering[] = [];
  for (let midi = AEROPHONE_RANGE.lowestMidi; midi <= AEROPHONE_RANGE.highestMidi; midi++) {
    out.push(fingeringForMidi(midi));
  }
  return out;
}
