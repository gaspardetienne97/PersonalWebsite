// Small helpers the concept cards share.

import { voicingTargets, type VoicingVariant } from "../content/piano";
import { parseChordSymbol } from "../theory/chords";
import { noteName, pc } from "../theory/notes";
import type { Tuning } from "../theory/fretboard";
import type { LessonSound } from "./types";

export const join = (a: string[]) =>
  a.length < 2 ? a.join("") : `${a.slice(0, -1).join(", ")} and ${a[a.length - 1]}`;
export const flat = (m: number) => noteName(m, "flat", false);
export const sharp = (m: number) => noteName(m, "sharp", false);
export const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;
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
