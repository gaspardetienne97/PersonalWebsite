// Pure helpers for the reading route: flashcard scores for the staff, the
// "you played X, it was Y" comparison, sounding pitch for fretted notation,
// and which hand the current target belongs to.
import type { Score, ScoreGroup, ScoreNote, ScoreVoice } from "@repo/music-core";
import type { FlashcardPrompt } from "@repo/music-core/content/reading";
import type { Tuning } from "@repo/music-core/data/index";
import { pc } from "@repo/music-core";

/** The card's notes on its clef; a four-part chord across the grand staff, split at middle C. */
function cardVoices(p: FlashcardPrompt, notes: ScoreNote[]): ScoreVoice[] {
  if (p.kind !== "satb") return [{ id: "card", name: "Card", clef: p.clef, notes }];
  return (["treble", "bass"] as const).map((clef) => ({
    id: clef,
    name: clef === "treble" ? "Soprano and alto" : "Tenor and bass",
    clef,
    notes: notes.filter((n) => n.midi >= 60 === (clef === "treble")),
  }));
}

/** The flashcard as a one-bar score: a whole note (or chord) on its clef. */
export function flashcardScore(p: FlashcardPrompt, keyFifths = 0): Score {
  return {
    id: p.id,
    title: "Flashcard",
    bpm: 60,
    meter: { beats: 4, beatUnit: 4 },
    keyFifths,
    voices: cardVoices(
      p,
      p.midi.map((m) => ({ midi: m, startBeat: 0, durationBeats: 4 })),
    ),
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
    voices: cardVoices(p, [
      ...p.midi.map((m) => ({ midi: m, startBeat: 0, durationBeats: 2 })),
      ...submitted.map((m) => ({ midi: near(m), startBeat: 2, durationBeats: 2 })),
    ]),
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

/**
 * Hand positions for reading on a fretted instrument, as fret windows (open
 * strings count in a window from 0). The written range follows from the tuning.
 */
export const FRET_POSITIONS: Record<
  string,
  { value: string; label: string; frets: [number, number] }[]
> = {
  guitar: [
    { value: "open", label: "Open", frets: [0, 5] },
    { value: "2", label: "Second", frets: [2, 7] },
    { value: "5", label: "Fifth", frets: [4, 9] },
  ],
  ukulele: [
    { value: "open", label: "Open", frets: [0, 3] },
    { value: "up", label: "Up the neck", frets: [0, 7] },
  ],
};
export const fretPosition = (instrument: string, value: string) =>
  FRET_POSITIONS[instrument]?.find((p) => p.value === value) ?? FRET_POSITIONS[instrument]?.[0];

/** The written range a fret window reaches: the lowest string's first fret to the highest string's last. */
export function positionRange(
  t: Pick<Tuning, "openStrings" | "notationTransposition">,
  [from, to]: [number, number],
): [number, number] {
  return [
    Math.min(...t.openStrings) + from - t.notationTransposition,
    Math.max(...t.openStrings) + to - t.notationTransposition,
  ];
}

/**
 * Sounding notes placed inside a fret window: the string whose fret falls in it
 * (the lowest such fret when two do), else the nearest fret outside it. The tab
 * and the fretboard then show the position being read, not the lowest frets.
 */
export function placeInPosition<N extends Pick<ScoreNote, "midi">>(
  notes: N[],
  t: Pick<Tuning, "openStrings" | "fretCount">,
  [from, to]: [number, number],
): (N & { string?: number; fret?: number })[] {
  return notes.map((n) => {
    let best: { string: number; fret: number; miss: number } | null = null;
    t.openStrings.forEach((open, i) => {
      const fret = n.midi - open;
      if (fret < 0 || fret > t.fretCount) return;
      const miss = fret < from ? from - fret : fret > to ? fret - to : 0;
      if (!best || miss < best.miss || (miss === best.miss && fret < best.fret))
        best = { string: i + 1, fret, miss };
    });
    const b = best as { string: number; fret: number } | null;
    return b ? { ...n, string: b.string, fret: b.fret } : n;
  });
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
  /** Fretted hand position (FRET_POSITIONS); the first when empty. */
  position: "",
  /** Look-ahead mask in beats: played notes hide, and only this many beats ahead show. 0 is off. */
  mask: 0,
  /** Seconds to look at a phrase before Start opens. 0 is off. */
  look: 0,
  /** Tap the rhythm with a kick on every quarter (a kick pad, MIDI note 36, or the Kick button). */
  kick: false,
  /** Flashcards: sharps, flats and naturals beside the key's own notes. */
  accidentals: false,
  /** A written range set by note (MIDI), instead of the level's; 0 follows the level. */
  low: 0,
  high: 0,
};
export type ReadingSetup = typeof READING_SETUP;

/** The kick lane under Tap the rhythm: a kick on every quarter beat of the phrase. */
export const KICK_MIDI = 36;
export function kickGroups(lengthBeats: number): ScoreGroup[] {
  return Array.from({ length: Math.ceil(lengthBeats - 1e-6) }, (_, i) => ({
    index: i,
    startBeat: i,
    durationBeats: 1,
    notes: [{ midi: KICK_MIDI, startBeat: i, durationBeats: 1, voiceId: "kick" }],
  }));
}

/** The rhythm and the kick lane as one score, each weighed by its number of notes; clean only when both are. */
export function combineLanes(
  taps: { score: number; correct: boolean; n: number },
  kicks: { score: number; correct: boolean; n: number } | null,
): { score: number; correct: boolean } {
  if (!kicks) return { score: taps.score, correct: taps.correct };
  const n = taps.n + kicks.n;
  return {
    score: n ? (taps.score * taps.n + kicks.score * kicks.n) / n : 0,
    correct: taps.correct && kicks.correct,
  };
}

/**
 * What one step of the cursor is, in plain words. The follower moves by groups (the notes
 * that start together), so a group is a note when every one is a single note.
 */
export function stepWords(groups: readonly ScoreGroup[]): { one: string; many: string } {
  return groups.every((g) => g.notes.length === 1)
    ? { one: "Note", many: "notes" }
    : { one: "Note or chord", many: "notes and chords" };
}

/** The wait-mode result in those words: how many steps were played with no wrong note first. */
export function waitHeadline(
  r: { cleanGroups: number; total: number; wrongNotes: number },
  words: { many: string },
): string {
  if (r.cleanGroups === r.total) return `All ${r.total} ${words.many} right first time.`;
  return `${r.cleanGroups} of ${r.total} ${words.many} right first time, ${r.wrongNotes} wrong note${r.wrongNotes === 1 ? "" : "s"} on the way.`;
}

export type Follower = "wait" | "performance" | "tap";
/** The follower's one name, used by the Follower choice, the setup line and the mode note alike. */
export const FOLLOWER_NAME: Record<Follower, string> = {
  wait: "Wait for me",
  performance: "Keep time",
  tap: "Tap the rhythm",
};

/**
 * What Practice and Check mean for the chosen follower, in the follower's own name. Wait for me
 * is guided whichever way the switch is set (scoring rules 1), so it never counts.
 */
export function followerModeNotes(f: Follower): { practice: string; check: string } {
  if (f === "wait")
    return {
      practice:
        "Wait for me: the cursor waits for each note, and each note is lit for you. Practice only.",
      check:
        "Wait for me: nothing is lit, but the cursor still waits, so it does not count. Keep time in Check counts.",
    };
  if (f === "tap")
    return {
      practice: "Tap the rhythm: the cursor moves with the click. Practice, so it does not count.",
      check: "Tap the rhythm: the cursor moves with the click. This run counts.",
    };
  return {
    practice:
      "Keep time: the cursor moves with the click, and each note is lit for you. Practice, so it does not count.",
    check: "Keep time: the cursor moves with the click, and nothing is lit. This run counts.",
  };
}

/**
 * Keyboard marks after a missed card: each right key a check, each played key a cross. A key that
 * is both (a chord with one note right) keeps the check.
 */
export function missMarks(
  target: readonly number[],
  played: readonly number[],
): Record<number, { target?: boolean; label: string }> {
  return {
    ...Object.fromEntries(played.map((m) => [m, { label: "✕" }])),
    ...Object.fromEntries(target.map((m) => [m, { target: true, label: "✓" }])),
  };
}
