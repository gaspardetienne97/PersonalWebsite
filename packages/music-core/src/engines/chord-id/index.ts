/**
 * chord-id — open chord identification from a set of pitch classes.
 *
 * This is deliberately separate from `chord-verification` (which only compares
 * observed notes against a known target). Here we match a pitch-class set
 * against quality templates across all 12 roots and rank by Jaccard similarity,
 * which naturally prefers the most complete chord and tolerates inversions
 * (identification is octave/order agnostic).
 *
 * It does NOT do real-time streaming polyphonic detection — callers pass a
 * pitch-class set already extracted from an analyzed audio buffer (e.g. Basic
 * Pitch) or from MIDI/on-screen input.
 */

const ROOT_NAMES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];

interface ChordQuality {
  quality: string;
  /** Suffix appended to the root name, e.g. "" (major), "m", "7", "maj7". */
  symbol: string;
  /** Semitone offsets from the root. */
  intervals: number[];
}

// Triads, sevenths, and common extensions. Extend here (not at call sites) to
// widen recognition; Jaccard ranking keeps richer templates from drowning the
// triads. Note: identification is on pitch-class SETS, so it is inversion- and
// voicing-agnostic — slash chords (C/E) and a chord's inversions share one set
// and cannot be distinguished here; do not add them as separate qualities.
const QUALITIES: ChordQuality[] = [
  { quality: "maj", symbol: "", intervals: [0, 4, 7] },
  { quality: "min", symbol: "m", intervals: [0, 3, 7] },
  { quality: "dim", symbol: "dim", intervals: [0, 3, 6] },
  { quality: "aug", symbol: "aug", intervals: [0, 4, 8] },
  { quality: "sus2", symbol: "sus2", intervals: [0, 2, 7] },
  { quality: "sus4", symbol: "sus4", intervals: [0, 5, 7] },
  { quality: "add9", symbol: "add9", intervals: [0, 2, 4, 7] },
  { quality: "6", symbol: "6", intervals: [0, 4, 7, 9] },
  { quality: "min6", symbol: "m6", intervals: [0, 3, 7, 9] },
  { quality: "maj7", symbol: "maj7", intervals: [0, 4, 7, 11] },
  { quality: "min7", symbol: "m7", intervals: [0, 3, 7, 10] },
  { quality: "dom7", symbol: "7", intervals: [0, 4, 7, 10] },
  { quality: "7sus4", symbol: "7sus4", intervals: [0, 5, 7, 10] },
  { quality: "min7b5", symbol: "m7b5", intervals: [0, 3, 6, 10] },
  { quality: "dim7", symbol: "dim7", intervals: [0, 3, 6, 9] },
  { quality: "dom9", symbol: "9", intervals: [0, 2, 4, 7, 10] },
  { quality: "maj9", symbol: "maj9", intervals: [0, 2, 4, 7, 11] },
  { quality: "min9", symbol: "m9", intervals: [0, 2, 3, 7, 10] },
];

export interface ChordCandidate {
  rootPitchClass: number;
  rootName: string;
  quality: string;
  /** Display symbol, e.g. "Cmaj7", "Am", "G7". */
  symbol: string;
  /** Jaccard similarity to the matched template, 0-1. */
  confidence: number;
}

export interface IdentifyChordOptions {
  maxCandidates?: number;
  minConfidence?: number;
}

/** Reduce MIDI notes to a sorted, deduped pitch-class set (0-11). */
export function toPitchClasses(midiNotes: number[]): number[] {
  return [...new Set(midiNotes.map((midi) => ((Math.round(midi) % 12) + 12) % 12))].sort(
    (left, right) => left - right,
  );
}

export function identifyChord(
  pitchClasses: number[],
  options: IdentifyChordOptions = {},
): ChordCandidate[] {
  const observed = new Set(toPitchClasses(pitchClasses));
  if (observed.size === 0) return [];

  const maxCandidates = Math.max(1, Math.floor(options.maxCandidates ?? 4));
  const minConfidence = options.minConfidence ?? 0.3;

  const ranked: (ChordCandidate & { size: number })[] = [];
  for (let root = 0; root < 12; root++) {
    for (const quality of QUALITIES) {
      const template = new Set(quality.intervals.map((interval) => (root + interval) % 12));
      let intersection = 0;
      for (const pitchClass of template) if (observed.has(pitchClass)) intersection++;
      const union = template.size + observed.size - intersection;
      const confidence = intersection / union;
      if (confidence < minConfidence) continue;
      ranked.push({
        rootPitchClass: root,
        rootName: ROOT_NAMES[root]!,
        quality: quality.quality,
        symbol: `${ROOT_NAMES[root]}${quality.symbol}`,
        confidence,
        size: template.size,
      });
    }
  }

  return ranked
    .sort(
      (left, right) =>
        right.confidence - left.confidence ||
        right.size - left.size ||
        left.rootPitchClass - right.rootPitchClass,
    )
    .slice(0, maxCandidates)
    .map(({ size: _size, ...candidate }) => candidate);
}
