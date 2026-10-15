// Chord shapes for one instrument, the chords they sound (root and quality,
// spelled as guitarists spell them), their positions on the player's tuning, and
// the per-pair history the Changes mode keeps.
import { pc } from "@repo/music-core";
import {
  CHORD_SHAPES,
  type ChordPosition,
  type ChordShape,
  type Tuning,
} from "@repo/music-core/data/index";
import { identifyChord, parseChordSymbol } from "@repo/music-core/theory/chords";
import { chordPositions } from "@repo/music-core/theory/fretboard";
import {
  generatedChordId,
  generatedPositions,
  parseGeneratedId,
  VOICING_QUALITIES,
} from "@repo/music-core/theory/voicings";
import { shapePcs } from "@repo/music-core/content/technique";
import { CHANGE_GAP_MS, clusterByGap } from "@repo/music-core/scoring/timing";
import type { Fretted } from "./fretted";

export const shapesFor = (instrument: Fretted) =>
  CHORD_SHAPES.filter((s) => s.instrument === instrument);

// Sharps on the minor side (F#m, C#m, G#m), flats for Db, Eb, Ab and Bb.
const MAJOR_ROOTS = ["C", "Db", "D", "Eb", "E", "F", "F#", "G", "Ab", "A", "Bb", "B"];
const MINOR_ROOTS = ["C", "C#", "D", "Eb", "E", "F", "F#", "G", "G#", "A", "Bb", "B"];
const MINOR = new Set(["m", "m6", "m7", "m9", "m7b5", "dim", "dim7"]);
export const rootName = (root: number, quality = "maj") =>
  (MINOR.has(quality) ? MINOR_ROOTS : MAJOR_ROOTS)[pc(root)];

/** A chord as root pitch class and a quality the voicer knows ("maj", "m7", "5"...). */
export interface ChordRef {
  root: number;
  quality: string;
}
const suffixOf = (quality: string) =>
  VOICING_QUALITIES.find((q) => q.quality === quality)?.suffix ?? quality;
export const chordLabel = (c: ChordRef) => rootName(c.root, c.quality) + suffixOf(c.quality);

const LETTERS = "CDEFGAB";
const LETTER_PC = [0, 2, 4, 5, 7, 9, 11];
// Letters above the root for each interval in semitones, as chord tones are spelled (#5 in aug, bb7 in dim7).
const STEPS = [0, 1, 1, 2, 2, 3, 4, 4, 4, 5, 6, 6];

/** A chord tone spelled from the chord's root: G#3 in E major, Ab3 in Fm, Bbb in Cdim7. */
export function toneName(midi: number, c: ChordRef, withOctave = true) {
  const iv = pc(midi - c.root);
  const step = iv === 9 && c.quality === "dim7" ? 6 : STEPS[iv];
  const letter = (LETTERS.indexOf(rootName(c.root, c.quality)[0]) + step) % 7;
  const diff = ((pc(midi) - LETTER_PC[letter] + 18) % 12) - 6;
  const octave = Math.floor((Math.round(midi) - diff) / 12) - 1;
  return (
    LETTERS[letter] +
    (diff > 0 ? "#".repeat(diff) : "b".repeat(-diff)) +
    (withOctave ? String(octave) : "")
  );
}

/** The common five first, then the rest in the identifier's order. */
export const COMMON_QUALITIES = ["maj", "m", "7", "maj7", "m7"];
export const QUALITY_LABEL: Record<string, string> = { maj: "Major", m: "Minor", "5": "5 (power)" };
export const qualityLabel = (q: string) => QUALITY_LABEL[q] ?? suffixOf(q);

/** The symbol a shape sounds, named by the same identifier that grades a strum. */
export const chordSymbol = (shape: Pick<ChordShape, "frets" | "tuningId">, tuning?: Tuning) => {
  const c = identifyChord(shapePcs(shape, tuning))[0];
  return c ? chordLabel({ root: c.rootPc, quality: c.quality }) : "?";
};

const curatedRefs = new Map(
  CHORD_SHAPES.map((s) => {
    const c = identifyChord(shapePcs(s))[0];
    return [s.id, c ? { root: c.rootPc, quality: c.quality as string } : null] as const;
  }),
);

/** What a shape id names: a generated id ("gen.guitar.0.maj"), or what a curated shape sounds. */
export function chordRef(id: string): ChordRef | null {
  const g = parseGeneratedId(id.replace(/@\d+$/, ""));
  if (g) return { root: g.rootPc, quality: g.quality.quality };
  return curatedRefs.get(id) ?? null;
}

/** The curated shape for a chord when there is one (the first: no duplicate F), else the generated id. */
export function chordId(instrument: Fretted, c: ChordRef): string {
  const curated = shapesFor(instrument).find((s) => {
    const r = curatedRefs.get(s.id);
    return r?.root === pc(c.root) && r.quality === c.quality;
  });
  return curated?.id ?? generatedChordId(instrument, c.root, c.quality);
}

/**
 * A chord's positions on a tuning: the curated ones on the tuning they were
 * written for (position 0 the curated open shape), else voiced for this tuning.
 */
export function positionsOn(id: string, tuning: Tuning): ChordPosition[] {
  const own = chordPositions(id);
  if (own.length && own[0].tuningId === tuning.id) return own;
  const c = chordRef(id);
  const gen = c
    ? generatedPositions(generatedChordId(tuning.instrument, c.root, c.quality), tuning)
    : [];
  return gen.length ? gen : own;
}

/** A chart symbol as a chord the voicer can shape, or null ("G7alt", slash chords). */
export function symbolRef(symbol: string): ChordRef | null {
  const p = parseChordSymbol(symbol);
  if (!p || p.bassPc !== undefined) return null;
  const want = [...p.pcs].sort((a, b) => a - b).join(",");
  const q = VOICING_QUALITIES.find(
    (x) =>
      [...new Set(x.intervals.map((i) => pc(p.rootPc + i)))].sort((a, b) => a - b).join(",") ===
      want,
  );
  return q ? { root: p.rootPc, quality: q.quality } : null;
}

/** "Open", "Barre 3", "Fret 10": a position's short name. */
export const shortPosition = (label: string) =>
  label.replace("Open position", "Open").replace("Barre at fret", "Barre");

// ---------------------------------------------------------------------------
// Untimed changes: a pause alone is not a change.

const likeness = (pcs: Set<number>, chord: readonly number[]) => {
  const shared = chord.filter((p) => pcs.has(p)).length;
  return shared / (pcs.size + chord.length - shared);
};

export interface ChangeGroup {
  /** The chord of the cycle this group plays. */
  target: number;
  start: number;
  end: number;
  midis: number[];
}

/**
 * Clusters split by silence join the chord being played until one sounds more
 * like the next chord of the cycle, so strumming a chord twice, or tapping its
 * strings one at a time, is one arrival. The first group is the first chord.
 */
export function groupChanges(
  notes: readonly { midi: number; at: number }[],
  chords: readonly (readonly number[])[],
  gapMs = CHANGE_GAP_MS,
): ChangeGroup[] {
  const groups: ChangeGroup[] = [];
  const next = (t: number) => (t + 1) % chords.length;
  for (const c of clusterByGap(notes, gapMs)) {
    const last = groups.at(-1);
    const pcs = new Set(c.midis.map(pc));
    if (last && likeness(pcs, chords[next(last.target)]) <= likeness(pcs, chords[last.target])) {
      last.end = c.end;
      last.midis.push(...c.midis);
    } else
      groups.push({
        target: last ? next(last.target) : 0,
        start: c.start,
        end: c.end,
        midis: [...c.midis],
      });
  }
  return groups;
}

/** The groups as notes the changes grader clusters one to a group (each moved to its group's start). */
export const groupedNotes = (groups: readonly ChangeGroup[]) =>
  groups.flatMap((g) => g.midis.map((midi) => ({ midi, at: g.start })));

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

// ---------------------------------------------------------------------------
// A cycle of chords (changes, fingerpicking): two to eight, in order.

export const MAX_CYCLE = 8;

/** A common next chord after `id` that is not already in `not`, else any other shape. */
export const nextChordId = (instrument: Fretted, id: string, not: readonly string[]) =>
  shapesFor(instrument)
    .find((x) => x.id === id)
    ?.commonTransitions.find((t) => !not.includes(t)) ??
  shapesFor(instrument).find((x) => !not.includes(x.id))?.id;

/**
 * The cycle from a setup's comma list of shape ids (or an older setup's pair).
 * A chord the same as the one before it is dropped, since there is no change to
 * hear; there are always two or more.
 */
export function cycleRefs(instrument: Fretted, csv: string, max = MAX_CYCLE): ChordRef[] {
  const C: ChordRef = { root: 0, quality: "maj" };
  const id = (r: ChordRef) => chordId(instrument, r);
  const list = csv
    .split(",")
    .map((x) => chordRef(x))
    .filter((r): r is ChordRef => !!r);
  const out: ChordRef[] = [];
  for (const r of list.length ? list : [C])
    if (!out.length || id(r) !== id(out.at(-1)!)) out.push(r);
  if (out.length > 2 && id(out[0]) === id(out.at(-1)!)) out.pop();
  if (out.length < 2)
    out.push(chordRef(nextChordId(instrument, id(out[0]), [id(out[0])]) ?? "") ?? C);
  return out.slice(0, max);
}

/** Each chord's chosen position from a comma list; null where none was chosen. */
export const cyclePositions = (csv: string, n: number) =>
  Array.from({ length: n }, (_, i) => {
    const v = csv.split(",")[i];
    return v === undefined || v === "" || Number.isNaN(Number(v)) ? null : Number(v);
  });
