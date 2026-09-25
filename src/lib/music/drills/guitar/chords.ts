// Chord shapes for one instrument, the symbol each shape sounds, and the
// per-pair history the Changes mode keeps.
import { CHORD_SHAPES, type ChordShape } from "@repo/music-core/data/index";
import { identifyChord } from "@repo/music-core/theory/chords";
import { shapePcs } from "@repo/music-core/content/technique";
import type { Fretted } from "./fretted";

export const shapesFor = (instrument: Fretted) =>
  CHORD_SHAPES.filter((s) => s.instrument === instrument);

/** The symbol a shape sounds, named by the same identifier that grades a strum. */
export const chordSymbol = (shape: Pick<ChordShape, "frets" | "tuningId">) =>
  identifyChord(shapePcs(shape))[0]?.symbol ?? "?";

export interface PairRun {
  date: string;
  perMinute: number;
  clean: number;
  completed: number;
}

export const PAIR_HISTORY_KEY = "chords.pair-history.v1";
export const pairKey = (from: string, to: string) => `${from}>${to}`;
/** Newest last, capped so the settings row stays small. */
export const mergePairRuns = (a: PairRun[], b: PairRun[]) => [...a, ...b].slice(-30);
