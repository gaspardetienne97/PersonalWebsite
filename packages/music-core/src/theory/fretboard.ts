// Tunings, fretboard positions and the curated chord positions.
// Strings are numbered from 1 = highest-pitched string, as in the data.

import {
  CHORD_SHAPES,
  GUITAR_STANDARD_POSITIONS,
  TUNINGS,
  UKULELE_HIGH_G_POSITIONS,
  type ChordPosition,
  type ChordShape,
  type Tuning,
} from "../data";
import { pc } from "./notes";
import { generatedChord, generatedPositions } from "./voicings";

export type { ChordPosition, ChordShape, Tuning };
export interface FretPosition {
  string: number;
  fret: number;
}
export interface FretWindow {
  start: number;
  end: number;
}

export const CURATED_TUNINGS: Tuning[] = [...TUNINGS.guitar, ...TUNINGS.ukulele];
export const tuningById = (id: string) => CURATED_TUNINGS.find((t) => t.id === id);

/** Validate a user tuning. Returns the first problem, or null when it is usable. */
export function validateCustomTuning(t: Tuning): string | null {
  if (!t.id.startsWith("custom.")) return "A custom tuning id must start with custom.";
  const strings = t.instrument === "guitar" ? 6 : 4;
  if (t.openStrings.length !== strings) return `A ${t.instrument} tuning needs ${strings} strings.`;
  if (!t.openStrings.every((m) => Number.isInteger(m) && m >= 0 && m <= 127))
    return "Open strings must be MIDI notes 0 to 127.";
  if (!Number.isInteger(t.fretCount) || t.fretCount < 1 || t.fretCount > 36)
    return "Frets must be 1 to 36.";
  return null;
}

export const midiAt = (tuning: Tuning, string: number, fret: number) =>
  tuning.openStrings[string - 1] + fret;

/** Every string/fret that sounds `midi` inside a fret window (default: the whole neck). */
export function positionsOf(tuning: Tuning, midi: number, window?: FretWindow): FretPosition[] {
  const start = Math.max(0, window?.start ?? 0);
  const end = Math.min(tuning.fretCount, window?.end ?? tuning.fretCount);
  const out: FretPosition[] = [];
  tuning.openStrings.forEach((open, i) => {
    const fret = midi - open;
    if (fret >= start && fret <= end) out.push({ string: i + 1, fret });
  });
  return out;
}

/** Every string/fret whose pitch class is `targetPc` inside a window. */
export function pcPositions(
  tuning: Tuning,
  targetPc: number,
  window: FretWindow,
  strings?: number[],
): FretPosition[] {
  const out: FretPosition[] = [];
  tuning.openStrings.forEach((open, i) => {
    if (strings && !strings.includes(i + 1)) return;
    for (
      let fret = Math.max(0, window.start);
      fret <= Math.min(tuning.fretCount, window.end);
      fret++
    )
      if (pc(open + fret) === targetPc) out.push({ string: i + 1, fret });
  });
  return out;
}

const POSITIONS: Record<string, ChordPosition[]> = {
  ...GUITAR_STANDARD_POSITIONS,
  ...UKULELE_HIGH_G_POSITIONS,
};

/**
 * Positions for a shape: the curated ones (position 0 the curated shape, id
 * unchanged), or a generated chord's voicings ("gen.guitar.0.maj").
 */
export const chordPositions = (shapeId: string): ChordPosition[] =>
  POSITIONS[shapeId] ?? generatedPositions(shapeId);
export const chordShapeById = (id: string): ChordShape | undefined =>
  CHORD_SHAPES.find((s) => s.id === id) ?? generatedChord(id);

/** Sounding strings of a fretted shape as string/fret/MIDI, in ascending pitch order. */
export function shapeNotes(tuning: Tuning, frets: (number | null)[]) {
  return frets
    .map((fret, i) =>
      fret === null ? null : { string: i + 1, fret, midi: midiAt(tuning, i + 1, fret) },
    )
    .filter((n) => n !== null)
    .sort((a, b) => a.midi - b.midi);
}
