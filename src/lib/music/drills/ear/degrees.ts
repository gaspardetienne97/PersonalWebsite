// Fixed colour identity for scale degrees: a musical object's own colour, always
// drawn with its text label (colour is never the only cue). The hue walks the
// chromatic circle so neighbouring degrees differ and 1 is always the same gold.
import { noteName } from "@repo/music-core";
import { SCALE_DEGREES } from "@repo/music-core/content/ear";

export const DEGREE_ROLE: Record<string, string> = {
  "1": "Tonic, home",
  b2: "Flat two, colour",
  "2": "Supertonic",
  b3: "Flat three, minor colour",
  "3": "Mediant",
  "4": "Subdominant",
  "#4": "Sharp four, colour",
  "5": "Dominant",
  b6: "Flat six, minor colour",
  "6": "Submediant",
  b7: "Flat seven, colour",
  "7": "Leading tone",
};

export const semitonesOf = (label: string) =>
  SCALE_DEGREES.find((d) => d.label === label)?.semitones ?? 0;

/** Diatonic degrees are brighter than the chromatic colour tones. */
export function degreeColor(label: string): string {
  const s = semitonesOf(label);
  const chromatic = label.startsWith("b") || label.startsWith("#");
  return `oklch(${chromatic ? 0.74 : 0.83} ${chromatic ? 0.1 : 0.13} ${(80 + s * 30) % 360})`;
}

const LETTERS = "CDEFGAB";
const NATURAL = [0, 2, 4, 5, 7, 9, 11];
/**
 * A note spelled as its degree in the key of `tonic` (named with flats, as the
 * drill names the key): degree 4 of Gb major is Cb4, not B3. Falls back to a
 * flat name when the spelling would need more than a double accidental.
 */
export function spellDegree(midi: number, tonic: number, degree: string): string {
  const step = Number(degree.replace(/[b#]/g, "")) - 1;
  const tonicName = noteName(tonic, "flat", false);
  if (!(step >= 0 && step < 7)) return noteName(midi, "flat");
  const li = (LETTERS.indexOf(tonicName[0]) + step) % 7;
  let diff = (((midi - NATURAL[li]) % 12) + 12) % 12;
  if (diff > 6) diff -= 12;
  if (Math.abs(diff) > 2) return noteName(midi, "flat");
  const octave = Math.floor((midi - diff) / 12) - 1;
  return LETTERS[li] + (diff > 0 ? "#" : "b").repeat(Math.abs(diff)) + octave;
}
