// Chord qualities, pitch-class chord identification and the jazz chord-symbol parser.

import { CADENCES_AND_QUALITIES } from "../data";
import { FLAT_NAMES, pc, pcOf } from "./notes";

/** The 9 ear-training qualities (triads and sevenths). */
export const EAR_CHORD_QUALITIES = CADENCES_AND_QUALITIES.chordQualities;

/** The 18 identification templates, simplest first (earlier wins a tie). */
export const CHORD_TEMPLATES = [
  { quality: "maj", suffix: "", intervals: [0, 4, 7] },
  { quality: "m", suffix: "m", intervals: [0, 3, 7] },
  { quality: "dim", suffix: "dim", intervals: [0, 3, 6] },
  { quality: "aug", suffix: "aug", intervals: [0, 4, 8] },
  { quality: "sus2", suffix: "sus2", intervals: [0, 2, 7] },
  { quality: "sus4", suffix: "sus4", intervals: [0, 5, 7] },
  { quality: "add9", suffix: "add9", intervals: [0, 2, 4, 7] },
  { quality: "6", suffix: "6", intervals: [0, 4, 7, 9] },
  { quality: "m6", suffix: "m6", intervals: [0, 3, 7, 9] },
  { quality: "maj7", suffix: "maj7", intervals: [0, 4, 7, 11] },
  { quality: "m7", suffix: "m7", intervals: [0, 3, 7, 10] },
  { quality: "7", suffix: "7", intervals: [0, 4, 7, 10] },
  { quality: "7sus4", suffix: "7sus4", intervals: [0, 5, 7, 10] },
  { quality: "m7b5", suffix: "m7b5", intervals: [0, 3, 6, 10] },
  { quality: "dim7", suffix: "dim7", intervals: [0, 3, 6, 9] },
  { quality: "9", suffix: "9", intervals: [0, 2, 4, 7, 10] },
  { quality: "maj9", suffix: "maj9", intervals: [0, 2, 4, 7, 11] },
  { quality: "m9", suffix: "m9", intervals: [0, 2, 3, 7, 10] },
] as const;

export interface ChordCandidate {
  rootPc: number;
  quality: (typeof CHORD_TEMPLATES)[number]["quality"];
  symbol: string;
  pcs: number[];
  /** Jaccard similarity 0..1 between the heard set and the template. */
  score: number;
}

const uniquePcs = (values: number[]) => [...new Set(values.map(pc))].sort((a, b) => a - b);

/** Rank every template on every root by Jaccard similarity. Inversion-agnostic (the bass is ignored). */
export function identifyChord(heard: number[]): ChordCandidate[] {
  const set = new Set(heard.map(pc));
  if (set.size === 0) return [];
  const out: ChordCandidate[] = [];
  CHORD_TEMPLATES.forEach((t) => {
    for (let root = 0; root < 12; root++) {
      const pcs = uniquePcs(t.intervals.map((i) => root + i));
      const shared = pcs.filter((p) => set.has(p)).length;
      const score = shared / (set.size + pcs.length - shared);
      if (score > 0)
        out.push({
          rootPc: root,
          quality: t.quality,
          symbol: FLAT_NAMES[root] + t.suffix,
          pcs,
          score,
        });
    }
  });
  // Array.prototype.sort is stable, so ties keep template order, then root order.
  return out.sort((a, b) => b.score - a.score);
}

// ---------------------------------------------------------------------------
// Chord symbols

export interface ParsedChord {
  symbol: string;
  rootPc: number;
  rootName: string;
  /** Everything after the root and before a slash bass, e.g. "m7b5", "7#9b9". */
  suffix: string;
  bassPc?: number;
  /** Semitones above the root, extensions above the octave kept (b9 = 13). */
  intervals: number[];
  /** Sorted unique pitch classes, including a slash bass. */
  pcs: number[];
}

// Longest match wins, so order does not matter here.
const BASES: Record<string, number[]> = {
  "": [0, 4, 7],
  maj: [0, 4, 7],
  m: [0, 3, 7],
  dim: [0, 3, 6],
  aug: [0, 4, 8],
  sus2: [0, 2, 7],
  sus4: [0, 5, 7],
  add9: [0, 4, 7, 14],
  "6": [0, 4, 7, 9],
  "6/9": [0, 4, 7, 9, 14],
  m6: [0, 3, 7, 9],
  "m6/9": [0, 3, 7, 9, 14],
  "7": [0, 4, 7, 10],
  "7sus4": [0, 5, 7, 10],
  "9": [0, 4, 7, 10, 14],
  "13": [0, 4, 7, 10, 14, 21],
  maj7: [0, 4, 7, 11],
  maj9: [0, 4, 7, 11, 14],
  m7: [0, 3, 7, 10],
  m9: [0, 3, 7, 10, 14],
  m11: [0, 3, 7, 10, 14, 17],
  m7b5: [0, 3, 6, 10],
  dim7: [0, 3, 6, 9],
  mMaj7: [0, 3, 7, 11],
  mMaj9: [0, 3, 7, 11, 14],
};
const BASE_KEYS = Object.keys(BASES).sort((a, b) => b.length - a.length);
const ADDED: Record<string, number> = {
  b9: 13,
  "#9": 15,
  "9": 14,
  "11": 17,
  "#11": 18,
  "13": 21,
  b13: 20,
};
/** 7alt: root, 3, b7 plus every alteration (b9 #9 #11 b13), no natural 5th. */
const ALTERED = [0, 4, 10, 13, 15, 18, 20];

/**
 * Parse a jazz chord symbol (Dm7, G7#9b9, G7alt, Dm7b5, CmMaj7, C6/9, Cmaj7#11, C/E ...).
 * Returns null for anything it cannot read, so callers never guess.
 */
export function parseChordSymbol(symbol: string): ParsedChord | null {
  const m = /^([A-G])([#b]?)(.*)$/.exec(symbol.trim());
  if (!m) return null;
  const rootName = m[1] + m[2];
  const rootPc = pcOf(rootName)!;
  let rest = m[3];
  let bassPc: number | undefined;
  const slash = /^(.*)\/([A-G][#b]?)$/.exec(rest);
  if (slash) {
    rest = slash[1];
    bassPc = pcOf(slash[2])!;
  }
  const suffix = rest;
  const base = BASE_KEYS.find((k) => rest.startsWith(k))!;
  let intervals = [...BASES[base]];
  rest = rest.slice(base.length);
  while (rest) {
    const alt = /^(alt|b5|#5|b9|#9|#11|b13|9|11|13)/.exec(rest);
    if (!alt) return null;
    const token = alt[1];
    if (token === "alt") intervals = [...ALTERED];
    else if (token === "b5" || token === "#5")
      intervals = intervals.map((i) => (i === 7 ? (token === "b5" ? 6 : 8) : i));
    else intervals.push(ADDED[token]);
    rest = rest.slice(token.length);
  }
  intervals = [...new Set(intervals)].sort((a, b) => a - b);
  const pcs = uniquePcs([
    ...intervals.map((i) => rootPc + i),
    ...(bassPc === undefined ? [] : [bassPc]),
  ]);
  return { symbol, rootPc, rootName, suffix, bassPc, intervals, pcs };
}

/** Transpose a chord symbol, respelling the root (and slash bass) with flats. */
export function transposeSymbol(symbol: string, semitones: number): string {
  return symbol.replace(/^([A-G][#b]?)|\/([A-G][#b]?)$/g, (match) => {
    const slash = match.startsWith("/");
    const name = slash ? match.slice(1) : match;
    return (slash ? "/" : "") + FLAT_NAMES[pc(pcOf(name)! + semitones)];
  });
}

export type ToneRole = "chord" | "scale" | "avoid";

/** Role of each of the 12 pitch classes over a chord: chord tone, scale tone, or avoid (outside both). */
export function toneRoles(chordPcs: number[], scalePcs: number[]): ToneRole[] {
  return Array.from({ length: 12 }, (_, p) =>
    chordPcs.some((c) => pc(c) === p)
      ? "chord"
      : scalePcs.some((s) => pc(s) === p)
        ? "scale"
        : "avoid",
  );
}
