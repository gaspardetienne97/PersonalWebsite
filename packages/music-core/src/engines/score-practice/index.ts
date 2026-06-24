import type { Score, ScoreSection } from "@repo/music-core/domain";
import type { ExpectedNoteGroup } from "@repo/music-core/engines/score-follower";

const EPSILON = 1e-6;

export type LoopSnap = "measure" | "note-group";
export type LoopOrder = "sequence" | "per-section";

export type ScorePracticeSelection =
  | { kind: "full" }
  | { kind: "sections"; sectionIds: string[]; order: LoopOrder }
  | { kind: "custom"; startBeat: number; endBeat: number; snap: LoopSnap };

export interface PracticeSegment {
  id: string;
  label: string;
  startBeat: number;
  endBeat: number;
  durationBeats: number;
  groups: ExpectedNoteGroup[];
  midiNotes: number[];
}

export interface ScoreSelectionBoundary {
  id: string;
  beat: number;
  kind: "score-start" | "measure" | "note-group" | "score-end";
  measureIndex: number;
}

export interface ScoreSelectionMap {
  measureBoundaries: ScoreSelectionBoundary[];
  noteGroupBoundaries: ScoreSelectionBoundary[];
}

export interface ScorePracticePlan {
  selection: ScorePracticeSelection;
  segments: PracticeSegment[];
  durationBeats: number;
  expectedGroups: number;
}

export function buildScoreSelectionMap(score: Score): ScoreSelectionMap {
  const endBeat = scoreEndBeat(score);
  const measureStarts = scoreMeasureStarts(score, endBeat);
  const noteGroupStarts = score.notes.map(({ startBeat }) => startBeat);

  return {
    measureBoundaries: createBoundaries(measureStarts, measureStarts, endBeat, "measure"),
    noteGroupBoundaries: createBoundaries(
      [0, ...noteGroupStarts, endBeat],
      measureStarts,
      endBeat,
      "note-group",
    ),
  };
}

export function buildScorePracticePlan(
  score: Score,
  selection: ScorePracticeSelection,
): ScorePracticePlan {
  const ranges = resolveRanges(score, selection);
  const segments = ranges.map((range) => projectSegment(score, range));

  return {
    selection,
    segments,
    durationBeats: segments.reduce((total, segment) => total + segment.durationBeats, 0),
    expectedGroups: segments.reduce((total, segment) => total + segment.groups.length, 0),
  };
}

function resolveRanges(
  score: Score,
  selection: ScorePracticeSelection,
): Array<{ id: string; label: string; startBeat: number; endBeat: number }> {
  if (selection.kind === "full") {
    return [{ id: "full", label: "Full score", startBeat: 0, endBeat: scoreEndBeat(score) }];
  }

  if (selection.kind === "custom") {
    validateRange(selection.startBeat, selection.endBeat);
    return [
      {
        id: "custom",
        label: "Custom range",
        startBeat: selection.startBeat,
        endBeat: selection.endBeat,
      },
    ];
  }

  if (selection.sectionIds.length === 0) {
    throw new Error("Select at least one score section");
  }
  if (new Set(selection.sectionIds).size !== selection.sectionIds.length) {
    throw new Error("Practice sections must not contain duplicates");
  }

  const sections = selection.sectionIds.map((id) => {
    const section = score.sections.find((candidate) => candidate.id === id);
    if (!section) throw new Error(`Unknown score section: ${id}`);
    validateSection(section);
    return section;
  });
  sections.sort((left, right) => left.startBeat - right.startBeat || left.endBeat - right.endBeat);

  for (let index = 1; index < sections.length; index += 1) {
    if (sections[index]!.startBeat < sections[index - 1]!.endBeat - EPSILON) {
      throw new Error("Practice sections must not overlap");
    }
  }

  return sections.map(({ id, name, startBeat, endBeat }) => ({
    id,
    label: name,
    startBeat,
    endBeat,
  }));
}

function projectSegment(
  score: Score,
  range: { id: string; label: string; startBeat: number; endBeat: number },
): PracticeSegment {
  validateRange(range.startBeat, range.endBeat);
  const notes = score.notes
    .map((note, sourceIndex) => ({ note, sourceIndex }))
    .filter(
      ({ note }) =>
        note.startBeat >= range.startBeat - EPSILON && note.startBeat < range.endBeat - EPSILON,
    );
  if (notes.length === 0) throw new Error("Practice range must contain at least one note group");

  const grouped = new Map<
    string,
    {
      startBeat: number;
      durationBeats: number;
      entries: Array<{ midiNote: number; sourceIndex: number }>;
    }
  >();

  for (const { note, sourceIndex } of notes) {
    const startBeat = note.startBeat - range.startBeat;
    const durationBeats = Math.min(note.durationBeats, range.endBeat - note.startBeat);
    const key = `${startBeat}:${durationBeats}`;
    const group = grouped.get(key) ?? { startBeat, durationBeats, entries: [] };
    group.entries.push({ midiNote: note.midiNote, sourceIndex });
    grouped.set(key, group);
  }

  const groups = [...grouped.values()]
    .sort(
      (left, right) => left.startBeat - right.startBeat || left.durationBeats - right.durationBeats,
    )
    .map((group, index): ExpectedNoteGroup => {
      const entries = [...group.entries].sort(
        (left, right) => left.midiNote - right.midiNote || left.sourceIndex - right.sourceIndex,
      );
      return {
        id: `${range.id}:group:${index}`,
        startBeat: group.startBeat,
        durationBeats: group.durationBeats,
        midiNotes: [...new Set(entries.map(({ midiNote }) => midiNote))],
        sourceNoteIndexes: entries.map(({ sourceIndex }) => sourceIndex),
      };
    });

  return {
    id: range.id,
    label: range.label,
    startBeat: range.startBeat,
    endBeat: range.endBeat,
    durationBeats: range.endBeat - range.startBeat,
    groups,
    midiNotes: [...new Set(groups.flatMap(({ midiNotes }) => midiNotes))].sort(
      (left, right) => left - right,
    ),
  };
}

function validateSection(section: ScoreSection): void {
  validateRange(section.startBeat, section.endBeat);
}

function validateRange(startBeat: number, endBeat: number): void {
  if (!Number.isFinite(startBeat) || !Number.isFinite(endBeat)) {
    throw new Error("Practice range beats must be finite");
  }
  if (endBeat <= startBeat + EPSILON) {
    throw new Error("Practice range end must be after its start");
  }
}

function scoreEndBeat(score: Score): number {
  const endBeat = Math.max(
    0,
    ...score.notes.map(({ startBeat, durationBeats }) => startBeat + durationBeats),
  );
  if (endBeat <= EPSILON) throw new Error("Practice range must contain at least one note group");
  return endBeat;
}

function scoreMeasureStarts(score: Score, endBeat: number): number[] {
  const signatures = [...score.timeSignatures].sort((left, right) => left.atBeat - right.atBeat);
  if (signatures.length === 0 || Math.abs(signatures[0]!.atBeat) > EPSILON) {
    throw new Error("Score needs a time signature at beat 0");
  }

  const starts: number[] = [];
  for (const [index, signature] of signatures.entries()) {
    const segmentEnd = Math.min(signatures[index + 1]?.atBeat ?? endBeat, endBeat);
    const measureBeats = signature.numerator * (4 / signature.denominator);
    if (!Number.isFinite(measureBeats) || measureBeats <= 0) {
      throw new Error("Score has an invalid time signature");
    }
    for (let beat = signature.atBeat; beat < segmentEnd - EPSILON; beat += measureBeats) {
      starts.push(beat);
    }
    if (segmentEnd >= endBeat - EPSILON) break;
  }

  return sortedUnique([...starts, endBeat]);
}

function createBoundaries(
  beats: number[],
  measureStarts: number[],
  endBeat: number,
  defaultKind: "measure" | "note-group",
): ScoreSelectionBoundary[] {
  return sortedUnique(beats).map((beat, index) => ({
    id: `${defaultKind}:${index}:${beat}`,
    beat,
    kind:
      Math.abs(beat) <= EPSILON
        ? "score-start"
        : Math.abs(beat - endBeat) <= EPSILON
          ? "score-end"
          : defaultKind,
    measureIndex: measureIndexAtBeat(beat, measureStarts, endBeat),
  }));
}

function measureIndexAtBeat(beat: number, starts: number[], endBeat: number): number {
  const measureStarts = starts.filter((candidate) => candidate < endBeat - EPSILON);
  const index = measureStarts.findLastIndex((candidate) => candidate <= beat + EPSILON);
  return Math.max(0, index);
}

function sortedUnique(values: number[]): number[] {
  return [...values]
    .sort((left, right) => left - right)
    .filter(
      (value, index, sorted) => index === 0 || Math.abs(value - sorted[index - 1]!) > EPSILON,
    );
}
