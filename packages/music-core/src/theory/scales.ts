// Scale lines for the scale drill, and scale lookups by name for jazz content.

import { SCALE_DATA, type ScaleKind, type ScaleMotion, type ScaleSpan } from "../data";
import { noteName, pc } from "./notes";

export type { ScaleKind, ScaleMotion, ScaleSpan };
export type ScaleHands = "right" | "left" | "both";

export const SCALE_KINDS = Object.keys(SCALE_DATA.semitonesByKind) as ScaleKind[];
/** The picker's two groups: "Modes" and "Jazz / modal". */
export const SCALE_GROUPS = {
  modes: SCALE_KINDS.filter((k) => !SCALE_DATA.jazzScaleKinds.includes(k)),
  jazz: SCALE_DATA.jazzScaleKinds,
};
/** The 12 chromatic tonics at octave 4 (C4 = 60 ... B4 = 71). */
export const SCALE_TONICS = Array.from({ length: 12 }, (_, i) => ({
  midi: 60 + i,
  name: noteName(60 + i),
}));

/** Ascending semitone offsets from the tonic for a span. */
export function spanOffsets(kind: ScaleKind, span: ScaleSpan): number[] {
  const steps = SCALE_DATA.semitonesByKind[kind];
  if (span === "pentascale") return steps.slice(0, 5);
  if (span === "one-octave") return steps;
  return [...steps, ...steps.slice(1).map((s) => s + 12)];
}

/**
 * The scale line as MIDI. "down" walks from the top of the span back to the
 * tonic along the same (mirrored) degrees, so it stays in key; "up-down" does
 * not repeat the top note.
 */
export function scaleLine(
  kind: ScaleKind,
  tonic: number,
  span: ScaleSpan,
  motion: ScaleMotion,
): number[] {
  const up = spanOffsets(kind, span).map((s) => tonic + s);
  const down = [...up].reverse();
  if (motion === "up") return up;
  if (motion === "down") return down;
  return [...up, ...down.slice(1)];
}

/** Notes per step for a hand setting: left is the line an octave down; both doubles it (left first). */
export function handLines(line: number[], hands: ScaleHands): number[][] {
  return line.map((m) => (hands === "right" ? [m] : hands === "left" ? [m - 12] : [m - 12, m]));
}

// Scales named in CHORD_SCALE_MAP and the jam table that are not scale kinds.
const NAMED_SCALES: Record<string, number[]> = {
  ionian: SCALE_DATA.semitonesByKind.major,
  "lydian-dominant": [0, 2, 4, 6, 7, 9, 10, 12],
  "locrian-#2": [0, 2, 3, 5, 6, 8, 10, 12],
  "major-blues": [0, 2, 3, 4, 7, 9, 12],
  "minor-blues": SCALE_DATA.semitonesByKind.blues,
  bebop: SCALE_DATA.semitonesByKind["bebop-dominant"],
  "dominant-bebop": SCALE_DATA.semitonesByKind["bebop-dominant"],
  "half-whole-diminished": SCALE_DATA.semitonesByKind.diminished,
  "whole-half-diminished": [0, 2, 3, 5, 6, 8, 9, 11, 12],
};

/** Semitones (octave inclusive) for a scale kind or a jazz scale name like "lydian dominant". */
export function scaleSemitones(name: string): number[] | undefined {
  const key = name.trim().toLowerCase().replace(/\s+/g, "-");
  return (SCALE_DATA.semitonesByKind as Record<string, number[]>)[key] ?? NAMED_SCALES[key];
}

/** Pitch classes of a scale on a root pitch class. */
export function scalePcs(semitones: number[], rootPc: number): number[] {
  return [...new Set(semitones.map((s) => pc(rootPc + s)))];
}
