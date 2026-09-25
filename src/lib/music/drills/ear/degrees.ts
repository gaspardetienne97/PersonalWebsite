// Fixed colour identity for scale degrees: a musical object's own colour, always
// drawn with its text label (colour is never the only cue). The hue walks the
// chromatic circle so neighbouring degrees differ and 1 is always the same gold.
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
