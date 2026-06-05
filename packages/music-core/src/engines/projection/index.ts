import type { TuningProfile } from "@repo/music-core/engines/tunings";

export { rhythmHudProjection, type RhythmHudData } from "./rhythm-hud";
export { tempoLadderProjection, type TempoRung, type TempoLadderOptions } from "./technique-ladder";
export { buildJournalHeatmap, type HeatmapCell } from "./journal-projections";

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

export function projectPiano(midiNotes: number[]): PianoLocation[] {
  return midiNotes.map((midiNote) => ({
    midiNote,
    hand: midiNote < 60 ? "left" : "right",
  }));
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
