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

/** Where a key sits when drawing the instrument (SVG units; portrait body). */
export interface AerophoneKeyLayout {
  id: AerophoneKeyId;
  label: string;
  x: number;
  y: number;
  /** Radius for round tone keys, or half-size for the small square side keys. */
  size: number;
  shape: "circle" | "pill";
}

/** viewBox the layout coordinates are authored against. */
export const AEROPHONE_VIEWBOX = { width: 150, height: 330 } as const;

/** Key positions, roughly matching the manual's "Pressing the Performance Keys". */
export const AEROPHONE_KEYS: readonly AerophoneKeyLayout[] = [
  { id: "k1", label: "1", x: 78, y: 95, size: 10, shape: "circle" },
  { id: "k2", label: "2", x: 78, y: 128, size: 10, shape: "circle" },
  { id: "k3", label: "3", x: 78, y: 161, size: 10, shape: "circle" },
  { id: "k4", label: "4", x: 78, y: 206, size: 10, shape: "circle" },
  { id: "k5", label: "5", x: 78, y: 239, size: 10, shape: "circle" },
  { id: "k6", label: "6", x: 78, y: 272, size: 10, shape: "circle" },
  { id: "bisBb", label: "Bb", x: 57, y: 112, size: 5, shape: "pill" },
  { id: "gsharp", label: "G#", x: 50, y: 158, size: 5, shape: "pill" },
  { id: "lowCsharp", label: "C#", x: 40, y: 172, size: 5, shape: "pill" },
  { id: "lowB", label: "B", x: 54, y: 180, size: 5, shape: "pill" },
  { id: "lowBb", label: "Bb", x: 42, y: 188, size: 5, shape: "pill" },
  { id: "sideE", label: "E", x: 104, y: 196, size: 5, shape: "pill" },
  { id: "sideC", label: "C", x: 104, y: 210, size: 5, shape: "pill" },
  { id: "sideBb", label: "Bb", x: 104, y: 224, size: 5, shape: "pill" },
  { id: "eb", label: "Eb", x: 64, y: 296, size: 5, shape: "pill" },
  { id: "lowC", label: "C", x: 90, y: 296, size: 5, shape: "pill" },
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
