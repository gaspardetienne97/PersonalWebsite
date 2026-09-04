/**
 * Chord positions: for every curated chord shape, the other places on the neck
 * where the same chord can be fretted (barre and closed voicings), generated
 * from the shape's pitch classes and the tuning. Position 0 is always the
 * curated shape itself with its id unchanged, so persisted prompt and run ids
 * are untouched; higher positions get `<shapeId>@<n>`.
 */
import { fretWindowAround, type FretWindow } from "@repo/music-core/engines/projection";
import type { TuningProfile } from "@repo/music-core/engines/tunings";

import { chordShapeMidiNotes, type ChordShape } from "./chord-perfect";

export type ChordPositionKind = "open" | "barre" | "closed";

export interface ChordBarre {
  fret: number;
  /** Highest-pitched string covered (string numbers count from 1 = highest). */
  fromString: number;
  /** Lowest-pitched string covered. */
  toString: number;
}

export interface ChordPosition extends ChordShape {
  shapeId: string;
  positionIndex: number;
  /** "Open position", "Barre at fret 3", "Fret 8". */
  positionLabel: string;
  kind: ChordPositionKind;
  /** Lowest fretted fret (0 for the open position). */
  baseFret: number;
  barre?: ChordBarre;
  fretWindow: FretWindow;
}

export interface ChordPositionOptions {
  /** Including position 0. */
  maxPositions?: number;
  /** Highest fret minus lowest fretted fret. */
  maxStretch?: number;
  /** A barre counts as one finger. */
  maxFingers?: number;
  /** The lowest sounding string must play the chord root (the curated shape's bass). */
  bassMustBeRoot?: boolean;
}

const DEFAULTS: Required<ChordPositionOptions> = {
  maxPositions: 5,
  maxStretch: 3,
  maxFingers: 4,
  bassMustBeRoot: true,
};

const cache = new Map<string, ChordPosition[]>();

export function chordPositionsFor(
  shape: ChordShape,
  tuning: TuningProfile,
  options: ChordPositionOptions = {},
): ChordPosition[] {
  const opts = { ...DEFAULTS, ...options };
  const key = `${shape.id}|${tuning.id}|${tuning.openStrings.join(",")}|${tuning.fretCount}|${JSON.stringify(opts)}`;
  const hit = cache.get(key);
  if (hit) return hit;

  const positions = [toPosition(shape, shape, tuning, 0)];
  for (const candidate of generate(shape, tuning, opts)) {
    if (positions.length >= opts.maxPositions) break;
    positions.push(toPosition(shape, candidate, tuning, positions.length));
  }
  cache.set(key, positions);
  return positions;
}

/** The position at `index`, clamped into the available range. */
export function chordPositionAt(
  shape: ChordShape,
  tuning: TuningProfile,
  index: number,
): ChordPosition {
  const positions = chordPositionsFor(shape, tuning);
  const clamped = Math.min(positions.length - 1, Math.max(0, Math.trunc(index) || 0));
  return positions[clamped]!;
}

export function chordPositionCount(shape: ChordShape, tuning: TuningProfile): number {
  return chordPositionsFor(shape, tuning).length;
}

interface Candidate {
  frets: (number | null)[];
  fingers: (number | null)[];
  baseFret: number;
  barre?: ChordBarre;
  score: number;
}

function generate(
  shape: ChordShape,
  tuning: TuningProfile,
  opts: Required<ChordPositionOptions>,
): Candidate[] {
  const open = tuning.openStrings;
  const midi = chordShapeMidiNotes(tuning, shape);
  const pcs = new Set(midi.map((m) => m % 12));
  const rootPc = midi[0]! % 12;
  const minSounding = open.length >= 6 ? 4 : 3;
  const seen = new Set([fretKey(shape.frets)]);
  // Re-entrant tunings (ukulele high G) have no true bass string, so the root rule is skipped.
  const reentrant = open.some((midi, i) => i > 0 && midi > open[i - 1]!);
  const bassMustBeRoot = opts.bassMustBeRoot && !reentrant;
  const results: Candidate[] = [];

  for (let base = 1; base + opts.maxStretch <= tuning.fretCount; base++) {
    const perString = open.map((openMidi) => {
      const choices: (number | null)[] = [null];
      // Open strings only in first position; higher up the hand cannot reach the nut.
      if (base === 1 && pcs.has(openMidi % 12)) choices.push(0);
      for (let fret = base; fret <= base + opts.maxStretch; fret++) {
        if (pcs.has((openMidi + fret) % 12)) choices.push(fret);
      }
      return choices;
    });
    let best: Candidate | undefined;
    for (const frets of combinations(perString)) {
      const candidate = evaluate(frets, open, pcs, rootPc, base, minSounding, bassMustBeRoot, opts);
      if (!candidate) continue;
      if (!best || candidate.score > best.score) best = candidate;
    }
    if (!best) continue;
    const key = fretKey(best.frets);
    if (seen.has(key)) continue;
    seen.add(key);
    results.push(best);
  }
  return results;
}

function fretKey(frets: (number | null)[]): string {
  return frets.map((f) => (f === null ? "x" : String(f))).join(".");
}

function* combinations(perString: (number | null)[][]): Generator<(number | null)[]> {
  const current: (number | null)[] = new Array(perString.length).fill(null);
  function* walk(index: number): Generator<(number | null)[]> {
    if (index === perString.length) {
      yield [...current];
      return;
    }
    for (const choice of perString[index]!) {
      current[index] = choice;
      yield* walk(index + 1);
    }
  }
  yield* walk(0);
}

function evaluate(
  frets: (number | null)[],
  open: number[],
  pcs: Set<number>,
  rootPc: number,
  base: number,
  minSounding: number,
  bassMustBeRoot: boolean,
  opts: Required<ChordPositionOptions>,
): Candidate | undefined {
  const sounding = frets.map((f, i) => (f === null ? undefined : open[i]! + f));
  const soundingIdx = sounding.map((m, i) => (m === undefined ? -1 : i)).filter((i) => i >= 0);
  if (soundingIdx.length < minSounding) return undefined;
  // No inner mutes: muted strings only at the edges.
  const first = soundingIdx[0]!;
  const last = soundingIdx.at(-1)!;
  if (last - first + 1 !== soundingIdx.length) return undefined;
  // Every chord tone present.
  const covered = new Set(soundingIdx.map((i) => sounding[i]! % 12));
  if (covered.size !== pcs.size) return undefined;
  // The lowest sounding pitch is the chord root.
  const lowestMidi = Math.min(...soundingIdx.map((i) => sounding[i]!));
  if (bassMustBeRoot && lowestMidi % 12 !== rootPc) return undefined;
  const fretted = soundingIdx.map((i) => frets[i]!).filter((f) => f > 0);
  if (fretted.length === 0) return undefined;
  const lowest = Math.min(...fretted);
  const highest = Math.max(...fretted);
  if (lowest !== base || highest - lowest > opts.maxStretch) return undefined;

  // Fingering: a barre when two or more strings sit at the base fret and nothing is open.
  const atBase = soundingIdx.filter((i) => frets[i] === base);
  const hasOpen = soundingIdx.some((i) => frets[i] === 0);
  const fingers: (number | null)[] = frets.map(() => null);
  let barre: ChordBarre | undefined;
  let next = 1;
  if (atBase.length >= 2 && !hasOpen) {
    barre = { fret: base, fromString: atBase[0]! + 1, toString: atBase.at(-1)! + 1 };
    for (const i of atBase) fingers[i] = 1;
    next = 2;
  }
  const rest = soundingIdx
    .filter((i) => frets[i]! > 0 && fingers[i] === null)
    .sort((a, b) => frets[a]! - frets[b]! || b - a);
  for (const i of rest) {
    if (next > opts.maxFingers) return undefined;
    fingers[i] = next++;
  }
  const fingerCount = next - 1;
  const score =
    soundingIdx.length * 10 -
    (frets.length - soundingIdx.length) * 4 -
    fingerCount +
    (barre ? 2 : 0) -
    (hasOpen ? 1 : 0);
  return { frets, fingers, baseFret: base, barre, score };
}

function toPosition(
  shape: ChordShape,
  source: ChordShape | Candidate,
  tuning: TuningProfile,
  index: number,
): ChordPosition {
  const frets = source.frets;
  const fingers = source.fingers;
  const fretted = frets.filter((f): f is number => f !== null);
  const barre = "barre" in source ? source.barre : undefined;
  const hasOpen = fretted.includes(0);
  const baseFret = index === 0 ? Math.min(...fretted) : (source as Candidate).baseFret;
  const kind: ChordPositionKind = barre ? "barre" : hasOpen ? "open" : "closed";
  const positionLabel =
    kind === "open"
      ? "Open position"
      : kind === "barre"
        ? `Barre at fret ${baseFret}`
        : `Fret ${baseFret}`;
  return {
    ...shape,
    id: index === 0 ? shape.id : `${shape.id}@${index}`,
    frets: [...frets],
    fingers: [...fingers],
    mutedStrings: frets.flatMap((f, i) => (f === null ? [i + 1] : [])),
    openStrings: frets.flatMap((f, i) => (f === 0 ? [i + 1] : [])),
    shapeId: shape.id,
    positionIndex: index,
    positionLabel,
    kind,
    baseFret,
    ...(barre ? { barre } : {}),
    fretWindow: fretWindowAround(fretted, tuning.fretCount),
  };
}
