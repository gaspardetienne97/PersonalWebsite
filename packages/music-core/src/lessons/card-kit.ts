// Small helpers the concept cards share.

import { voicingTargets, type VoicingVariant } from "../content/piano";
import { parseChordSymbol } from "../theory/chords";
import { noteName, pc } from "../theory/notes";
import type { Tuning } from "../theory/fretboard";
import type { LessonSound } from "./types";
import { formatList } from "@repo/i18n/format";
import {
  getNamingKey,
  setNamingKey,
  showChord,
  showKeyName,
  showNote,
  type NamingKey,
} from "../theory/note-names";

/** "a, b and c" in the player's language (English leaves out the serial comma). */
export const join = (a: string[]) => formatList(a);
/** A note's name as shown (letters, fixed do or movable do), spelled with flats. */
export const flat = (m: number) => showNote(noteName(m, "flat", false));
/** A note's name as shown, spelled with sharps. */
export const sharp = (m: number) => showNote(noteName(m, "sharp", false));
/** A chord symbol as shown: its root and bass named, its quality as written. */
export const chord = (symbol: string) => showChord(symbol);
/** A key's name as shown ("C" in "C major"): absolute, so movable do names it as fixed do. */
export const keyName = (tonic: string) => showKeyName(tonic);
/** A label that starts with a note, "D Dorian": the note named, the rest as it is. */
export const nameLead = (label: string) => label.replace(/^\S+/, (t) => showNote(t));

export const IN_C: NamingKey = { tonic: "C" };
export const IN_C_MINOR: NamingKey = { tonic: "C", minor: true };
export const IN_A_MINOR: NamingKey = { tonic: "A", minor: true };

/**
 * Builds a lesson with movable do counting from `key` (a lesson in C names C as Do whatever key
 * the drill is in), then gives the screen its own key back. Lesson text is built eagerly, so
 * every name inside `build` counts from `key`.
 */
export function inKey<T>(key: NamingKey, build: () => T): T {
  const was = getNamingKey();
  setNamingKey(key);
  try {
    return build();
  } finally {
    setNamingKey(was);
  }
}
export const tones = (ms: number[], at = 0, dur = 1.4): LessonSound => ({
  notes: [{ midi: ms, at, dur }],
});
/** The notes one after another. */
export const run = (ms: number[], gap = 0.35): LessonSound => ({
  notes: ms.map((m, i) => ({ midi: [m], at: i * gap, dur: gap * 1.4 })),
});

/** What a drill passes along so the card matches its setup. */
export interface CardOpts {
  /** The strip's tuning (position cards place their shapes on it). */
  tuning?: Tuning;
  /** The instrument plays one note at a time (Aerophone, voice): voicings are arpeggios. */
  arpeggio?: boolean;
}

/** A chord note's name in the chord's own terms: 1, 3, 5, 7 from its symbol, 9 for the step above the root. */
export function degreeOf(symbol: string, midi: number): string {
  const c = parseChordSymbol(symbol)!;
  const i = pc(midi - c.rootPc);
  return i === 2 ? "9" : ["1", "3", "5", "7"][c.intervals.indexOf(i)];
}

/** The voicing drill's targets in the key of C (ids start "C-"). */
export const voicingInC = (variant: VoicingVariant, start: "A" | "B" = "A") =>
  voicingTargets({ variant, startPosition: start, mode: "chord" }).filter((t) =>
    t.id.startsWith("C-"),
  );
