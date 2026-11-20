// Written pitch for transposing instruments. Scores, input, grading and
// playback are concert pitch; a staff or a fingering for a transposing
// instrument shows the written note, concert plus writtenOffset.
import type { AerophoneReadingKey, Instrument, Score, Settings } from "../types";
import { m } from "@repo/i18n/messages.js";

/** The AE-20 reads in C, or fingers like an alto or tenor sax. It sends concert pitch either way. */
export const AEROPHONE_READING_KEYS: readonly {
  id: AerophoneReadingKey;
  label: string;
  offset: number;
}[] = [
  { id: "C", label: "C", offset: 0 },
  { id: "Eb", label: m.music_content_transposition_alto(), offset: 9 },
  { id: "Bb", label: m.music_content_transposition_tenor(), offset: 14 },
];

/** Semitones from concert to written pitch on `instrument` (guitar's octave comes from its tuning). */
export function writtenOffset(
  instrument: Instrument,
  settings: Pick<Settings, "aerophoneKey">,
  tuning?: { notationTransposition: number } | null,
): number {
  if (instrument === "aerophone")
    return AEROPHONE_READING_KEYS.find((k) => k.id === settings.aerophoneKey)?.offset ?? 0;
  if (instrument === "guitar" || instrument === "ukulele")
    return 0 - (tuning?.notationTransposition ?? 0);
  return 0;
}

/** A key signature moved by `semitones`, the enharmonic with six or fewer sharps when it changes. */
export function transposeFifths(fifths: number, semitones: number): number {
  const step = (((semitones * 7) % 12) + 12) % 12;
  if (!step) return fifths;
  const f = fifths + step;
  return f > 6 ? f - 12 : f;
}

/** Every note and the key signature moved by `semitones`. */
export function transposeScore(score: Score, semitones: number): Score {
  if (!semitones) return score;
  return {
    ...score,
    ...(score.keyFifths === undefined
      ? {}
      : { keyFifths: transposeFifths(score.keyFifths, semitones) }),
    // Drum notes name a drum, not a pitch.
    voices: score.voices.map((v) =>
      v.drums ? v : { ...v, notes: v.notes.map((n) => ({ ...n, midi: n.midi + semitones })) },
    ),
  };
}

/**
 * Octaves to move a line spanning lo..hi into min..max: up until its bottom
 * reaches min, else down when its top runs over max and its bottom still fits.
 */
export function octaveFit(lo: number, hi: number, min: number, max = Infinity): number {
  const up = Math.max(0, Math.ceil((min - lo) / 12)) * 12;
  const down = Math.max(0, Math.ceil((hi - max) / 12)) * 12;
  return up || (down && lo - down >= min ? -down : 0);
}
