// Pure helpers for the reading route: flashcard scores for the staff, the
// "you played X, it was Y" comparison, sounding pitch for fretted notation,
// and which hand the current target belongs to.
import type { Score, ScoreGroup } from "@repo/music-core";
import type { FlashcardPrompt } from "@repo/music-core/content/reading";
import type { Tuning } from "@repo/music-core/data/index";
import { pc } from "@repo/music-core";

/** The flashcard as a one-bar score: a whole note (or chord) on its clef. */
export function flashcardScore(p: FlashcardPrompt, keyFifths = 0): Score {
  return {
    id: p.id,
    title: "Flashcard",
    bpm: 60,
    meter: { beats: 4, beatUnit: 4 },
    keyFifths,
    voices: [
      {
        id: "card",
        name: "Card",
        clef: p.clef,
        notes: p.midi.map((m) => ({ midi: m, startBeat: 0, durationBeats: 4 })),
      },
    ],
    lengthBeats: 4,
    source: { kind: "generated" },
  };
}

/**
 * Expected and submitted side by side: two half notes, the answer first.
 * A named answer (no octave) is placed in the octave nearest the expected note.
 */
export function comparisonScore(p: FlashcardPrompt, submitted: number[], keyFifths = 0): Score {
  const near = (m: number) => {
    const target = p.midi[0];
    const base = target - pc(target) + pc(m);
    return [base - 12, base, base + 12].reduce((a, b) =>
      Math.abs(b - target) < Math.abs(a - target) ? b : a,
    );
  };
  return {
    ...flashcardScore(p, keyFifths),
    id: `${p.id}-vs`,
    voices: [
      {
        id: "card",
        name: "Card",
        clef: p.clef,
        notes: [
          ...p.midi.map((m) => ({ midi: m, startBeat: 0, durationBeats: 2 })),
          ...submitted.map((m) => ({ midi: near(m), startBeat: 2, durationBeats: 2 })),
        ],
      },
    ],
  };
}

/** Guitar is written an octave above it sounds (notationTransposition -12). */
export function soundingScore(score: Score, transposition: number): Score {
  if (!transposition) return score;
  return {
    ...score,
    voices: score.voices.map((v) => ({
      ...v,
      notes: v.notes.map((n) => ({ ...n, midi: n.midi + transposition })),
    })),
  };
}

/** Written range a fretted instrument can play in the first 12 frets. */
export function playableWrittenRange(
  t: Pick<Tuning, "openStrings" | "notationTransposition">,
  frets = 12,
): [number, number] {
  const lo = Math.min(...t.openStrings) - t.notationTransposition;
  const hi = Math.max(...t.openStrings) + frets - t.notationTransposition;
  return [lo, hi];
}

/** Clamp a range into limits, keeping at least an octave. */
export function clampRange(
  [lo, hi]: [number, number],
  [min, max]: [number, number],
): [number, number] {
  let a = Math.max(min, Math.min(lo, hi));
  let b = Math.min(max, Math.max(lo, hi));
  if (b - a < 12) {
    b = Math.min(max, a + 12);
    a = Math.max(min, b - 12);
  }
  return [a, b];
}

/**
 * The on-screen keyboard's span for these sounding notes: from the C at or
 * below the lowest note (not a whole octave lower when the lowest note is a C)
 * to the C above the highest, at least two octaves.
 */
export function keyboardSpan(sounding: readonly number[]): [number, number] {
  const low = Math.floor(Math.min(...sounding) / 12) * 12;
  return [low, Math.max(low + 24, Math.ceil((Math.max(...sounding) + 2) / 12) * 12)];
}

export function handLabel(g: ScoreGroup | undefined): string | null {
  if (!g) return null;
  const ids = new Set(g.notes.map((n) => n.voiceId));
  if (ids.has("rh") && ids.has("lh")) return "Both hands";
  if (ids.has("lh")) return "Left hand";
  if (ids.has("rh")) return "Right hand";
  return null;
}

/** The two reading exercises, as the shell's tab row. */
export const READING_TABS = [
  { id: "flashcards", label: "Flashcards" },
  { id: "sight-reading", label: "Sight-reading" },
] as const;

/**
 * The reading route's setup; URL parameters (from paths) win, else the last setup.
 * The instrument is the practice strip's, and the range follows level, clefs and instrument.
 */
export const READING_SETUP = {
  activity: "flashcards",
  clefs: "treble",
  key: "C major",
  level: "primer",
  kind: "note",
  answer: "choice",
  follower: "wait",
  strictness: "normal",
  meter: "simple",
  measures: 2,
  input: "keys",
  /** Sight-reading as a level climb (Piano Marvel's assessment). */
  climb: false,
};
export type ReadingSetup = typeof READING_SETUP;
