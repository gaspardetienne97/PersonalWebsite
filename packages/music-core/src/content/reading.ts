// Note-reading flashcards and generated sight-reading phrases.

import { READING_LEVELS, type ReadingLevelId } from "../data";
import type { Score, ScoreGroup, ScoreNote, ScoreVoice } from "../types";
import { pc, pcOf } from "../theory/notes";
import {
  choicesForKey,
  diatonicNames,
  enharmonicEqual,
  keyByName,
  spellInKey,
  type KeySignature,
} from "../theory/spelling";
import { pick, randInt, type Rand } from "./random";

export type Clef = "treble" | "bass";
export { READING_LEVELS };
export const readingLevel = (id: ReadingLevelId) => READING_LEVELS.find((l) => l.id === id)!;

/** Reading setup bounds and defaults (catalog 4.2). */
export const READING_DEFAULTS = {
  range: [48, 84] as [number, number],
  rangeLimits: [21, 108] as [number, number],
  bpm: 90,
  bpmLimits: [40, 200] as [number, number],
  measures: 2,
  measureLimits: [1, 8] as [number, number],
};

const keyOrC = (name: string) => keyByName(name) ?? keyByName("C major")!;
const diatonicPcs = (k: KeySignature) => new Set(diatonicNames(k).map((n) => pcOf(n)!));
const diatonicIn = (k: KeySignature, lo: number, hi: number) => {
  const pcs = diatonicPcs(k);
  const out: number[] = [];
  for (let m = lo; m <= hi; m++) if (pcs.has(pc(m))) out.push(m);
  return out;
};

// ---------------------------------------------------------------------------
// Flashcards

export interface FlashcardPrompt {
  id: string;
  kind: "note" | "chord";
  clef: Clef;
  key: string;
  midi: number[];
  /** Spelled names, low to high, hyphen-joined for chords ("C-E-G"). */
  answer: string;
  choices: string[];
  skillIds: string[];
  difficulty: number;
}

/**
 * A diatonic note or root-position diatonic triad in the key and range. With both
 * clefs, the clef is drawn first and splits the range at middle C (treble >= 60).
 */
export function flashcardPrompt(
  rand: Rand,
  opts: {
    kind: "note" | "chord";
    clefs: Clef[];
    key: string;
    range: [number, number];
    difficulty: number;
  },
): FlashcardPrompt {
  const k = keyOrC(opts.key);
  const [lo, hi] = opts.range;
  const all = diatonicIn(k, lo, hi);
  let clef = opts.clefs.length > 1 ? pick(rand, opts.clefs) : (opts.clefs[0] ?? "treble");
  const side = (c: Clef) =>
    opts.clefs.length > 1 ? (m: number) => (c === "treble" ? m >= 60 : m < 60) : () => true;
  const rootOk = (i: number) => opts.kind === "note" || i + 4 < all.length;
  let roots = all.map((m, i) => i).filter((i) => side(clef)(all[i]) && rootOk(i));
  if (roots.length === 0) {
    clef = clef === "treble" ? "bass" : "treble";
    roots = all.map((m, i) => i).filter((i) => side(clef)(all[i]) && rootOk(i));
  }
  if (roots.length === 0) throw new Error(`No ${opts.kind} fits ${opts.key} in ${lo}-${hi}`);
  const i = pick(rand, roots);
  const midi = opts.kind === "note" ? [all[i]] : [all[i], all[i + 2], all[i + 4]];
  const names = diatonicNames(k);
  const triads = names.map((_, j) => [0, 2, 4].map((o) => names[(j + o) % 7]).join("-"));
  return {
    id: `flash-${opts.kind}-${clef}-${k.name}-${midi.join("_")}`,
    kind: opts.kind,
    clef,
    key: k.name,
    midi,
    answer: midi.map((m) => spellInKey(m, k)).join("-"),
    choices: opts.kind === "note" ? choicesForKey(k) : triads,
    skillIds: [
      `reading.${clef}`,
      opts.kind === "note" ? `reading.${clef}.landmarks` : "reading.polyphonic",
    ],
    difficulty: opts.difficulty,
  };
}

/** Enharmonic-tolerant answer check; a played answer compares pitch classes, octave-lenient. */
export function flashcardCorrect(prompt: FlashcardPrompt, response: string | number[]): boolean {
  if (typeof response === "string") return enharmonicEqual(prompt.answer, response);
  const want = [...new Set(prompt.midi.map(pc))].sort();
  const got = [...new Set(response.map(pc))].sort();
  return want.length === got.length && want.every((p, i) => p === got[i]);
}

// ---------------------------------------------------------------------------
// Sight-reading

// Rhythm cells per level in quarter-note beats (the Score convention). Simple meter is
// 4/4 (4 per bar); compound is 6/8 (3 per bar, dotted quarter = 1.5). Every level has a
// cell that fills any remaining space, so bars always total exactly.
// ponytail: the cell sets and step sizes below render the levels' one-line rhythm
// descriptions; the old app's exact generator was not in the context.
const SIMPLE_CELLS: Record<ReadingLevelId, number[][]> = {
  primer: [[1], [2]],
  "level-1": [[1], [2], [0.5, 0.5]],
  "level-2": [[0.5, 0.5], [1], [2], [0.5, 0.5, 0.5, 0.5]],
  "level-3": [[0.5, 0.5], [1], [1.5, 0.5], [0.5, 1, 0.5]],
};
const COMPOUND_CELLS: Record<ReadingLevelId, number[][]> = {
  primer: [[1.5], [1, 0.5]],
  "level-1": [[1.5], [1, 0.5]],
  "level-2": [[1.5], [1, 0.5], [0.5, 0.5, 0.5]],
  "level-3": [[1.5], [1, 0.5], [0.5, 0.5, 0.5], [0.5, 1]],
};
/** Largest melodic step, in scale steps. */
const MAX_STEP: Record<ReadingLevelId, number> = {
  primer: 1,
  "level-1": 1,
  "level-2": 2,
  "level-3": 3,
};

export interface SightReadingOptions {
  level: ReadingLevelId;
  instrument: "piano" | "guitar" | "ukulele" | "aerophone";
  clefs?: Clef[];
  key?: string;
  range?: [number, number];
  measures: number;
  meter: "simple" | "compound";
  bpm: number;
}

const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);
/** Bar length in quarter-note beats. */
export const barQuarters = (meter: Score["meter"]) => (meter.beats * 4) / meter.beatUnit;

function rhythm(rand: Rand, cells: number[][], barBeats: number, measures: number): number[] {
  const out: number[] = [];
  for (let bar = 0; bar < measures; bar++) {
    let left = barBeats;
    while (left > 0) {
      const cell = pick(
        rand,
        cells.filter((c) => sum(c) <= left),
      );
      out.push(...cell);
      left -= sum(cell);
    }
  }
  return out;
}

function melody(
  rand: Rand,
  pool: number[],
  tonicPc: number,
  count: number,
  maxStep: number,
): number[] {
  const mid = (pool[0] + pool[pool.length - 1]) / 2;
  const tonics = pool.map((m, i) => i).filter((i) => pc(pool[i]) === tonicPc);
  let i = tonics.length
    ? tonics.reduce((a, b) => (Math.abs(pool[b] - mid) < Math.abs(pool[a] - mid) ? b : a))
    : Math.floor(pool.length / 2);
  const out = [pool[i]];
  while (out.length < count) {
    let step = randInt(rand, 1, maxStep) * (rand() < 0.5 ? -1 : 1);
    if (i + step < 0 || i + step >= pool.length) step = -step;
    i = Math.min(pool.length - 1, Math.max(0, i + step));
    out.push(pool[i]);
  }
  return out;
}

/**
 * A generated phrase as a canonical Score. Piano puts treble in a right-hand voice
 * and bass in a left-hand voice (both clefs split the range at middle C); fretted
 * instruments get one voice. Beats are quarter notes; a bar is meter.beats * 4 / beatUnit.
 */
export function sightReadingScore(rand: Rand, opts: SightReadingOptions): Score {
  const level = readingLevel(opts.level);
  const k = keyOrC(opts.key ?? level.recommendedKeys[0]);
  const [lo, hi] = opts.range ?? [
    level.recommendedRange.lowestMidi,
    level.recommendedRange.highestMidi,
  ];
  const clefs = opts.clefs?.length ? opts.clefs : level.recommendedClefs;
  const measures = Math.min(8, Math.max(1, Math.round(opts.measures)));
  const meter = opts.meter === "compound" ? { beats: 6, beatUnit: 8 } : { beats: 4, beatUnit: 4 };
  const cells = (opts.meter === "compound" ? COMPOUND_CELLS : SIMPLE_CELLS)[opts.level];
  const split = clefs.length > 1;
  const voiceClefs: Clef[] = opts.instrument === "piano" ? clefs : [clefs[0]];
  const voices: ScoreVoice[] = voiceClefs.map((clef) => {
    const pool = diatonicIn(
      k,
      split && clef === "treble" ? Math.max(lo, 60) : lo,
      split && clef === "bass" ? Math.min(hi, 59) : hi,
    );
    const durations = rhythm(rand, cells, barQuarters(meter), measures);
    const pitches = melody(rand, pool, k.tonicPc, durations.length, MAX_STEP[opts.level]);
    let beat = 0;
    const notes: ScoreNote[] = durations.map((d, i) => {
      const n = { midi: pitches[i], startBeat: beat, durationBeats: d };
      beat += d;
      return n;
    });
    const piano = opts.instrument === "piano";
    return {
      id: piano ? (clef === "treble" ? "rh" : "lh") : "melody",
      name: piano ? (clef === "treble" ? "Right hand" : "Left hand") : "Melody",
      clef,
      ...(piano ? { hand: clef === "treble" ? ("right" as const) : ("left" as const) } : {}),
      notes,
    };
  });
  return {
    id: `sight-${opts.level}-${Math.floor(rand() * 2 ** 32).toString(36)}`,
    title: `${level.label} sight-reading`,
    bpm: opts.bpm,
    meter,
    keyFifths: k.fifths,
    keyMode: k.mode,
    voices,
    lengthBeats: measures * barQuarters(meter),
    source: { kind: "generated" },
  };
}

/** Skill ids a sight-reading score exercises. */
export function sightReadingSkills(score: Score): string[] {
  const clefs = [...new Set(score.voices.map((v) => v.clef ?? "treble"))];
  return [
    ...clefs.flatMap((c) => [`reading.${c}`, `reading.${c}.stepwise`]),
    ...(score.meter.beatUnit === 8 ? ["reading.rhythm.compound"] : []),
  ];
}

/**
 * "Practice the notes you missed": the missed groups in order, a quarter each
 * (a dotted quarter in compound meter), the last one held to the bar line.
 */
export function practiceMissedScore(score: Score, missed: ScoreGroup[]): Score {
  const unit = score.meter.beatUnit === 8 ? 1.5 : 1;
  const bar = barQuarters(score.meter);
  const lengthBeats = Math.max(1, Math.ceil((missed.length * unit) / bar)) * bar;
  const voices = score.voices.map((v) => ({
    ...v,
    notes: missed.flatMap((g, i) =>
      g.notes
        .filter((n) => n.voiceId === v.id)
        .map(({ voiceId: _, ...n }) => ({
          ...n,
          tieFrom: undefined,
          startBeat: i * unit,
          durationBeats: i === missed.length - 1 ? lengthBeats - i * unit : unit,
        })),
    ),
  }));
  return {
    ...score,
    id: `${score.id}-missed`,
    title: `${score.title}: missed notes`,
    voices,
    lengthBeats,
    sections: undefined,
    chords: undefined,
  };
}

// ---------------------------------------------------------------------------
// The level climb: sight-reading as Piano Marvel's assessment runs it (SASR):
// short phrases played in time, a pass at 80% moves up a rung, anything less
// is a strike, three strikes end it. Rungs are each level through its keys.

export const CLIMB = { pass: 0.8, strikes: 3, measures: 4 } as const;
export const READING_RUNGS = READING_LEVELS.flatMap((l) =>
  l.recommendedKeys.map((key) => ({
    level: l.id,
    key,
    clefs: l.recommendedClefs,
    label: `${l.label}, ${key}`,
  })),
);

export interface ClimbState {
  rung: number;
  strikes: number;
  /** The highest rung passed this climb, -1 for none. */
  best: number;
  phrases: number;
  over: boolean;
}
export const startClimb = (rung = 0): ClimbState => ({
  rung: Math.max(0, Math.min(READING_RUNGS.length - 1, rung)),
  strikes: 0,
  best: -1,
  phrases: 0,
  over: false,
});

/** After a phrase scored `score`: up a rung on a pass (the top rung stays), a strike otherwise. */
export function climbAfter(s: ClimbState, score: number): ClimbState {
  const phrases = s.phrases + 1;
  if (score >= CLIMB.pass) {
    const top = s.rung === READING_RUNGS.length - 1;
    return {
      ...s,
      phrases,
      best: Math.max(s.best, s.rung),
      rung: top ? s.rung : s.rung + 1,
      over: top,
    };
  }
  const strikes = s.strikes + 1;
  return { ...s, phrases, strikes, over: strikes >= CLIMB.strikes };
}
