// Call and response over a groove: the app plays a one or two bar call over a
// Jam progression, then you answer in the same number of bars. Echo plays the
// call back; Answer plays your own phrase, judged on landing on a chord tone
// and staying on the eighth-note grid.

import type { NoteEvent } from "../types";
import { pc } from "../theory/notes";
import { parseChordSymbol } from "../theory/chords";
import { jamToneRoles, PROGRESSIONS, type Progression } from "./jam";
import { pick, type Rand } from "./random";

export const CALL_GROOVES = [
  { id: "blues", label: "12-bar blues" },
  { id: "minor-ii-v-i", label: "Minor ii-V-i" },
  { id: "modal", label: "Dorian vamp" },
  { id: "pop-axis", label: "Pop loop" },
] as const;
export type CallMode = "echo" | "answer";
export const CALL_TURNS = 6;
export const BEATS_PER_BAR = 4;

export const grooveOf = (id: string): Progression =>
  PROGRESSIONS.find((p) => p.id === id) ?? PROGRESSIONS.find((p) => p.id === "blues")!;

/** The chord sounding in bar `bar` (from 0), the form looping. */
export function chordAtBar(p: Progression, bar: number) {
  const total = p.chords.reduce((n, c) => n + c.bars, 0);
  let left = ((bar % total) + total) % total;
  for (const ch of p.chords) {
    if (left < ch.bars) return ch;
    left -= ch.bars;
  }
  return p.chords[0];
}

export interface CallNote {
  midi: number;
  startBeat: number;
  durationBeats: number;
}

// Rhythm cells for one bar: [start, length] in beats, the last note held. Generic
// call shapes (a pickup, a long note, a short burst), not taken from any tune.
const CELLS: [number, number][][] = [
  [
    [0, 1],
    [1, 1],
    [2, 2],
  ],
  [
    [0, 0.5],
    [0.5, 0.5],
    [1, 1],
    [2, 2],
  ],
  [
    [0, 1.5],
    [1.5, 0.5],
    [2, 2],
  ],
  [
    [0.5, 0.5],
    [1, 0.5],
    [1.5, 0.5],
    [2, 1],
    [3, 1],
  ],
  [
    [0, 1],
    [1, 0.5],
    [1.5, 0.5],
    [2, 2],
  ],
];

/** Pitches from `low` to `high` whose pitch class plays the role over the chord. */
function poolFor(
  ch: Progression["chords"][number],
  role: "chord" | "scale",
  low: number,
  high: number,
) {
  const roles = jamToneRoles(ch);
  const out: number[] = [];
  for (let m = low; m <= high; m++)
    if (roles[pc(m)] === "chord" || (role === "scale" && roles[pc(m)] === "scale")) out.push(m);
  return out;
}

/**
 * A call starting at `bar`: one rhythm cell a bar, steps of the chord's scale
 * that start and end on chord tones, moving at most a fourth at a time.
 */
export function callPhrase(
  rand: Rand,
  opts: { groove: Progression; bar: number; bars: number; low?: number; high?: number },
): CallNote[] {
  const low = opts.low ?? 60;
  const high = opts.high ?? 76;
  const out: CallNote[] = [];
  let prev = pick(rand, poolFor(chordAtBar(opts.groove, opts.bar), "chord", low + 2, high - 5));
  for (let b = 0; b < opts.bars; b++) {
    const ch = chordAtBar(opts.groove, opts.bar + b);
    const cell = pick(rand, CELLS);
    cell.forEach(([start, len], i) => {
      const last = i === cell.length - 1;
      const pool = poolFor(ch, last || (b === 0 && i === 0) ? "chord" : "scale", low, high);
      const near = pool.filter((m) => m !== prev && Math.abs(m - prev) <= 5);
      const midi = b === 0 && i === 0 ? prev : pick(rand, near.length ? near : pool);
      out.push({ midi, startBeat: b * BEATS_PER_BAR + start, durationBeats: len });
      prev = midi;
    });
  }
  return out;
}

/** Where turn `k` starts, in bars from the downbeat: a call, then the same length to answer. */
export const turnBar = (k: number, bars: number) => k * 2 * bars;

export interface AnswerGrade {
  score: number;
  correct: boolean;
  notes: number;
  /** The last note's pitch class is in the chord sounding under it. */
  landed: boolean;
  /** Share of the notes within the tolerance of an eighth-note grid. */
  inTime: number;
}

/** Off the eighth-note grid by more than this (or a sixth of a beat when faster) is out of time. */
export const GRID_MS = 100;

/**
 * Your own answer: half for landing on a chord tone, half for the share of
 * notes on the eighth-note grid; right when it lands and three quarters are in time.
 */
export function gradeAnswer(input: {
  notes: readonly NoteEvent[];
  groove: Progression;
  /** performance.now() of the run's downbeat and of the answer's first beat. */
  downbeat: number;
  startAt: number;
  beatMs: number;
}): AnswerGrade {
  const ons = input.notes.filter((n) => n.kind === "noteon");
  if (!ons.length) return { score: 0, correct: false, notes: 0, landed: false, inTime: 0 };
  const eighth = input.beatMs / 2;
  const tol = Math.min(GRID_MS, input.beatMs / 6);
  const onGrid = ons.filter((n) => {
    const x = (n.at - input.startAt) / eighth;
    return Math.abs(x - Math.round(x)) * eighth <= tol;
  }).length;
  const last = ons[ons.length - 1];
  const bar = Math.floor((last.at - input.downbeat + tol) / (input.beatMs * BEATS_PER_BAR));
  const chord = parseChordSymbol(chordAtBar(input.groove, bar).symbol)!;
  const landed = chord.pcs.includes(pc(last.midi));
  const inTime = onGrid / ons.length;
  const score = (landed ? 0.5 : 0) + 0.5 * inTime;
  return { score, correct: landed && inTime >= 0.75, notes: ons.length, landed, inTime };
}
