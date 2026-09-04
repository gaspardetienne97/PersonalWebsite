import type {
  InstrumentProjection,
  ProjectedNote,
  Score,
  ScoreNote,
} from "@repo/music-core/domain";
import type { TuningProfile } from "@repo/music-core/engines/tunings";

export { rhythmHudProjection, type RhythmHudData } from "./rhythm-hud";
export { tempoLadderProjection, type TempoRung, type TempoLadderOptions } from "./technique-ladder";
export { buildJournalHeatmap, type HeatmapCell } from "./journal-projections";
export { summarizeFocusAreas, type FocusArea } from "./journal-focus";

export interface PianoLocation {
  midiNote: number;
  hand: "left" | "right";
}

export interface FretboardLocation {
  midiNote: number;
  string: number;
  fret: number;
}

export interface PlayableFretboardGroup {
  positions: FretboardLocation[];
  span: number;
}

export function filterScoreVoices(score: Score, voiceIds: string[]): Score {
  if (voiceIds.length === 0) throw new Error("Select at least one score voice");
  const selected = new Set(voiceIds);
  const known = new Set(score.voices.map(({ id }) => id));
  const unknown = voiceIds.find((id) => !known.has(id));
  if (unknown) throw new Error(`Unknown score voice: ${unknown}`);

  return {
    ...score,
    voices: score.voices.filter(({ id }) => selected.has(id)),
    notes: score.notes.filter(({ voiceId }) => selected.has(voiceId)),
    ...(score.rests ? { rests: score.rests.filter(({ voiceId }) => selected.has(voiceId)) } : {}),
  };
}

export function projectPiano(midiNotes: number[]): PianoLocation[] {
  return midiNotes.map((midiNote) => ({
    midiNote,
    hand: midiNote < 60 ? "left" : "right",
  }));
}

export function projectScoreToPiano(
  score: Score,
  options: { splitMidi?: number } = {},
): InstrumentProjection {
  const splitMidi = options.splitMidi ?? 60;
  const roles = new Map(score.voices.map(({ id, role }) => [id, role]));

  return {
    scoreId: score.id,
    options: { instrument: "piano" },
    notes: score.notes.map((note, sourceIndex) => ({
      sourceIndex,
      midiNote: note.midiNote,
      startBeat: note.startBeat,
      durationBeats: note.durationBeats,
      hand:
        roles.get(note.voiceId) === "bass"
          ? "left"
          : roles.get(note.voiceId) === "melody"
            ? "right"
            : note.midiNote < splitMidi
              ? "left"
              : "right",
    })),
  };
}

export function projectFretboard(midiNotes: number[], tuning: TuningProfile): FretboardLocation[] {
  return midiNotes.flatMap((midiNote) =>
    tuning.openStrings.flatMap((openMidi, index) => {
      const fret = midiNote - openMidi;
      return fret >= 0 && fret <= tuning.fretCount ? [{ midiNote, string: index + 1, fret }] : [];
    }),
  );
}

export function projectPlayableGroup(
  midiNotes: number[],
  tuning: TuningProfile,
  maxSpan = 5,
): PlayableFretboardGroup | undefined {
  if (midiNotes.length === 0) return { positions: [], span: 0 };
  if (midiNotes.length > tuning.openStrings.length || maxSpan < 0) return undefined;

  const candidates = midiNotes.map((midiNote) => projectFretboard([midiNote], tuning));
  if (candidates.some((locations) => locations.length === 0)) return undefined;

  const solutions: PlayableFretboardGroup[] = [];
  collectSolutions(candidates, 0, [], new Set(), maxSpan, solutions);
  return solutions.sort(compareGroups)[0];
}

/**
 * Project a whole canonical score onto a fretboard as TAB. Notes sharing an
 * onset beat are placed together as one playable shape (one note per string,
 * lowest frets, smallest span); a group that won't fit one shape (more notes
 * than strings, out of range, or too wide) degrades to each note's lowest
 * single position, dropping any note off the fretboard.
 */
export function projectScoreToFretboard(
  score: Score,
  tuning: TuningProfile,
  options: { transpose?: number; maxSpan?: number } = {},
): InstrumentProjection {
  const transpose = options.transpose ?? 0;
  const maxSpan = options.maxSpan ?? 5;

  const byOnset = new Map<number, { sourceIndex: number; note: ScoreNote }[]>();
  score.notes.forEach((note, sourceIndex) => {
    const group = byOnset.get(note.startBeat) ?? [];
    group.push({ sourceIndex, note });
    byOnset.set(note.startBeat, group);
  });

  const projected: ProjectedNote[] = [];
  for (const startBeat of [...byOnset.keys()].sort((a, b) => a - b)) {
    const group = byOnset.get(startBeat)!;
    const midiNotes = group.map(({ note }) => note.midiNote + transpose);
    const shape = projectPlayableGroup(midiNotes, tuning, maxSpan);
    if (shape && shape.positions.length === group.length) {
      group.forEach((entry, index) => {
        const { string, fret } = shape.positions[index]!;
        projected.push(toProjectedNote(entry, transpose, [{ string, fret }]));
      });
    } else {
      for (const entry of group) {
        const lowest = lowestPosition(entry.note.midiNote + transpose, tuning);
        projected.push(toProjectedNote(entry, transpose, lowest ? [lowest] : undefined));
      }
    }
  }

  projected.sort(
    (left, right) =>
      left.startBeat - right.startBeat ||
      (left.frets?.[0]?.string ?? 99) - (right.frets?.[0]?.string ?? 99),
  );

  return {
    scoreId: score.id,
    options: { instrument: tuning.instrument, profileId: tuning.id, transpose },
    notes: projected,
  };
}

/**
 * Project a score onto the Aerophone as a single readable line. The Aerophone
 * is monophonic, so each onset keeps only its highest note (the melody on top);
 * per-note fingering is derived for display from the MIDI, not stored here.
 */
export function projectScoreToAerophone(
  score: Score,
  options: { transpose?: number } = {},
): InstrumentProjection {
  const transpose = options.transpose ?? 0;

  const topByOnset = new Map<number, { sourceIndex: number; note: ScoreNote }>();
  score.notes.forEach((note, sourceIndex) => {
    const current = topByOnset.get(note.startBeat);
    if (!current || note.midiNote > current.note.midiNote) {
      topByOnset.set(note.startBeat, { sourceIndex, note });
    }
  });

  const notes = [...topByOnset.values()]
    .sort((left, right) => left.note.startBeat - right.note.startBeat)
    .map((entry) => toProjectedNote(entry, transpose, undefined));

  return {
    scoreId: score.id,
    options: { instrument: "aerophone", transpose },
    notes,
  };
}

function toProjectedNote(
  entry: { sourceIndex: number; note: ScoreNote },
  transpose: number,
  frets: { string: number; fret: number }[] | undefined,
): ProjectedNote {
  return {
    sourceIndex: entry.sourceIndex,
    midiNote: entry.note.midiNote + transpose,
    startBeat: entry.note.startBeat,
    durationBeats: entry.note.durationBeats,
    ...(frets ? { frets } : {}),
  };
}

function lowestPosition(
  midiNote: number,
  tuning: TuningProfile,
): { string: number; fret: number } | undefined {
  const locations = projectFretboard([midiNote], tuning);
  if (locations.length === 0) return undefined;
  const best = locations.sort(
    (left, right) => left.fret - right.fret || left.string - right.string,
  )[0]!;
  return { string: best.string, fret: best.fret };
}

function collectSolutions(
  candidates: FretboardLocation[][],
  index: number,
  positions: FretboardLocation[],
  usedStrings: Set<number>,
  maxSpan: number,
  solutions: PlayableFretboardGroup[],
): void {
  if (index === candidates.length) {
    solutions.push({ positions: [...positions], span: fretSpan(positions) });
    return;
  }

  for (const location of candidates[index]!) {
    if (usedStrings.has(location.string)) continue;
    const next = [...positions, location];
    if (fretSpan(next) > maxSpan) continue;

    positions.push(location);
    usedStrings.add(location.string);
    collectSolutions(candidates, index + 1, positions, usedStrings, maxSpan, solutions);
    positions.pop();
    usedStrings.delete(location.string);
  }
}

function fretSpan(positions: FretboardLocation[]): number {
  if (positions.length < 2) return 0;
  const frets = positions.map(({ fret }) => fret);
  return Math.max(...frets) - Math.min(...frets);
}

function compareGroups(left: PlayableFretboardGroup, right: PlayableFretboardGroup): number {
  const leftTotal = left.positions.reduce((total, { fret }) => total + fret, 0);
  const rightTotal = right.positions.reduce((total, { fret }) => total + fret, 0);
  return leftTotal - rightTotal || left.span - right.span;
}

export interface FretWindow {
  /** Absolute fret numbers, inclusive. */
  start: number;
  end: number;
}

export interface FretWindowOptions {
  /** Frets of context on each side of the played frets. */
  context?: number;
  /** Widen narrow windows to at least this many frets. */
  minWidth?: number;
}

/**
 * The stretch of neck worth showing for a set of frets: the frets in play plus
 * one of context on each side, never narrower than `minWidth`, clamped to the
 * instrument. Empty input gives the first frets from the nut.
 */
export function fretWindowAround(
  frets: readonly number[],
  fretCount: number,
  options: FretWindowOptions = {},
): FretWindow {
  const context = options.context ?? 1;
  const minWidth = Math.max(1, options.minWidth ?? 5);
  const last = Math.max(0, Math.trunc(fretCount));
  const valid = frets.filter((f) => Number.isFinite(f) && f >= 0 && f <= last);
  let start = valid.length ? Math.max(0, Math.min(...valid) - context) : 0;
  let end = valid.length
    ? Math.min(last, Math.max(...valid) + context)
    : Math.min(last, minWidth - 1);
  while (end - start + 1 < minWidth && (end < last || start > 0)) {
    if (end < last) end += 1;
    else start -= 1;
  }
  return { start, end };
}
