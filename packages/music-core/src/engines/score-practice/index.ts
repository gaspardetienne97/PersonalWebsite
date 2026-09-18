import type { MonotonicMs, NoteEvent, Score, ScoreSection } from "@repo/music-core/domain";
import {
  beatToMs,
  createScoreFollower,
  type ExpectedNoteGroup,
  type ScoreFollowerAnswer,
  type ScoreFollowerLiveState,
  type ScoreFollowerMode,
  type ScoreFollowerRun,
  type TimingStrictness,
} from "@repo/music-core/engines/score-follower";

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

export interface ScorePracticeOptions {
  mode: ScoreFollowerMode;
  bpm: number;
  strictness: TimingStrictness;
  totalTakes: 1 | 2 | 4 | 8;
}

export interface PracticeExecution {
  id: string;
  take: number;
  segmentIds: string[];
  groups: ExpectedNoteGroup[];
  durationBeats: number;
  startsNewTake: boolean;
  segmentGroupCounts: number[];
  segmentExpectedNotes: number[];
}

export interface ScorePracticeTakeSummary {
  take: number;
  score: number;
  expectedNotes: number;
  matchedNotes: number;
  meanAbsoluteTimingErrorMs?: number;
  segmentIds: string[];
}

export interface ScorePracticeSectionSummary {
  segmentId: string;
  label: string;
  score: number;
  expectedNotes: number;
  matchedNotes: number;
  bestTake?: number;
}

export interface ScorePracticeSummary {
  aggregateScore: number;
  matchedNotes: number;
  expectedNotes: number;
  pitchCompletion: number;
  meanAbsoluteTimingErrorMs?: number;
  earlyNotes: number;
  onTimeNotes: number;
  lateNotes: number;
  missedNotes: number;
  extraNotes: number;
  bestTake?: number;
  takes: ScorePracticeTakeSummary[];
  sections: ScorePracticeSectionSummary[];
}

export type ScorePracticeExecutionResult = Omit<
  ReturnType<ScoreFollowerRun["finish"]>,
  "answer"
> & {
  answer: ScoreFollowerAnswer;
};
export type ScorePracticeStatus =
  | "ready"
  | "count-in"
  | "running"
  | "between"
  | "complete"
  | "cancelled";

export interface ScorePracticeState {
  status: ScorePracticeStatus;
  executionIndex: number;
  execution?: PracticeExecution;
  take: number;
  currentSegmentId?: string;
  progress: number;
  live?: ScoreFollowerLiveState;
  completedResults: ScorePracticeExecutionResult[];
  summary?: ScorePracticeSummary;
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

/**
 * A custom range read as a musician reads it: which bar it starts and ends on,
 * how many bars and beats that is, and how long that lasts at the practice
 * tempo. Beats and `quarterNoteBpm` are both in quarter notes, the unit the
 * score follower runs on.
 */
export interface ScoreRangeReadout {
  startBar: number;
  endBar: number;
  bars: number;
  beats: number;
  seconds: number;
}

/** The 1-based bar number containing `beat`. */
export function barNumberAtBeat(
  beat: number,
  measureBoundaries: readonly ScoreSelectionBoundary[],
): number {
  const index = measureBoundaries.findLastIndex(
    (boundary, position) =>
      position < measureBoundaries.length - 1 && boundary.beat <= beat + EPSILON,
  );
  return Math.max(1, index + 1);
}

/** The half-open beat range of the 1-based `bar`, or undefined past the score. */
export function barBeatRange(
  bar: number,
  measureBoundaries: readonly ScoreSelectionBoundary[],
): { startBeat: number; endBeat: number } | undefined {
  const start = measureBoundaries[bar - 1];
  const end = measureBoundaries[bar];
  if (bar < 1 || !start || !end) return undefined;
  return { startBeat: start.beat, endBeat: end.beat };
}

/** The first and last bars a range touches. The range is half-open, so a range
 * ending on a bar line ends in the bar before it. */
export function barRangeOf(
  range: { startBeat: number; endBeat: number },
  measureBoundaries: readonly ScoreSelectionBoundary[],
): { startBar: number; endBar: number } {
  const startBar = barNumberAtBeat(range.startBeat, measureBoundaries);
  const lastBarIndex = measureBoundaries.findLastIndex(
    (boundary, position) =>
      position < measureBoundaries.length - 1 && boundary.beat < range.endBeat - EPSILON,
  );
  return { startBar, endBar: Math.max(startBar, lastBarIndex + 1) };
}

export function describeScoreRange(
  range: { startBeat: number; endBeat: number },
  measureBoundaries: readonly ScoreSelectionBoundary[],
  quarterNoteBpm: number,
): ScoreRangeReadout {
  const { startBar, endBar } = barRangeOf(range, measureBoundaries);
  const beats = Math.max(0, range.endBeat - range.startBeat);
  return {
    startBar,
    endBar,
    bars: endBar - startBar + 1,
    beats,
    seconds: quarterNoteBpm > 0 ? (beats * 60) / quarterNoteBpm : 0,
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

export function buildPracticeExecutions(
  plan: ScorePracticePlan,
  options: Pick<ScorePracticeOptions, "totalTakes">,
): PracticeExecution[] {
  const order = plan.selection.kind === "sections" ? plan.selection.order : "sequence";
  if (order === "per-section") {
    return plan.segments.flatMap((segment) =>
      Array.from({ length: options.totalTakes }, (_, index) =>
        segmentExecution(segment, index + 1),
      ),
    );
  }
  return Array.from({ length: options.totalTakes }, (_, index) =>
    sequenceExecution(plan.segments, index + 1),
  );
}

export class ScorePracticeSession {
  readonly #plan: ScorePracticePlan;
  readonly #options: ScorePracticeOptions;
  readonly #executions: PracticeExecution[];
  readonly #records: Array<{
    execution: PracticeExecution;
    result: ScorePracticeExecutionResult;
  }> = [];
  #status: ScorePracticeStatus = "ready";
  #executionIndex = 0;
  #follower?: ScoreFollowerRun;
  #startTimestampMs?: MonotonicMs;
  #live?: ScoreFollowerLiveState;
  #summary?: ScorePracticeSummary;

  constructor(plan: ScorePracticePlan, options: ScorePracticeOptions) {
    if (!Number.isFinite(options.bpm) || options.bpm <= 0) {
      throw new Error("Practice BPM must be positive");
    }
    this.#plan = plan;
    this.#options = options;
    this.#executions = buildPracticeExecutions(plan, options);
  }

  get state(): ScorePracticeState {
    const execution = this.#executions[this.#executionIndex];
    return {
      status: this.#status,
      executionIndex: this.#executionIndex,
      ...(execution ? { execution, take: execution.take } : { take: this.#options.totalTakes }),
      ...(execution && this.#live
        ? { currentSegmentId: segmentAtGroup(execution, this.#live.currentGroupIndex) }
        : {}),
      progress: this.#live?.progress ?? (this.#status === "complete" ? 1 : 0),
      ...(this.#live ? { live: this.#live } : {}),
      completedResults: this.#records.map(({ result }) => result),
      summary: this.#summary,
    };
  }

  markCountingIn(): ScorePracticeState {
    if (this.#status !== "ready" && this.#status !== "between") {
      throw new Error(`Cannot count in from ${this.#status}`);
    }
    this.#status = "count-in";
    this.#live = undefined;
    return this.state;
  }

  startExecution(startTimestampMs: MonotonicMs): ScorePracticeState {
    if (!["ready", "count-in", "between"].includes(this.#status)) {
      throw new Error(`Cannot start practice from ${this.#status}`);
    }
    const execution = this.#executions[this.#executionIndex];
    if (!execution) throw new Error("No practice execution is available");

    this.#startTimestampMs = startTimestampMs;
    this.#follower = createScoreFollower(execution.groups, {
      mode: this.#options.mode,
      bpm: this.#options.bpm,
      strictness: this.#options.strictness,
      startTimestampMs,
    });
    this.#live = this.#follower.getLiveState();
    this.#status = "running";
    return this.state;
  }

  accept(event: NoteEvent): ScorePracticeState {
    if (this.#status !== "running" || !this.#follower) return this.state;
    this.#follower.accept(event);
    this.#live = this.#follower.getLiveState();
    return this.state;
  }

  tick(timestampMs: MonotonicMs): ScorePracticeState {
    if (
      this.#status !== "running" ||
      this.#options.mode !== "performance" ||
      this.#startTimestampMs === undefined ||
      !this.#follower
    ) {
      return this.state;
    }
    const execution = this.#executions[this.#executionIndex];
    if (!execution) return this.state;

    const elapsedMs = Math.max(0, timestampMs - this.#startTimestampMs);
    const elapsedBeats = elapsedMs / beatToMs(1, this.#options.bpm);
    const followerLive = this.#follower.getLiveState();
    const currentGroupIndex = temporalGroupIndex(execution.groups, elapsedBeats);
    this.#live = {
      ...followerLive,
      progress: Math.min(1, elapsedBeats / execution.durationBeats),
      currentGroupIndex,
      expectedMidiNotes: execution.groups[currentGroupIndex]?.midiNotes ?? [],
    };
    return this.state;
  }

  finishExecution(): ScorePracticeState {
    if (this.#status !== "running" || !this.#follower) {
      throw new Error(`Cannot finish practice from ${this.#status}`);
    }
    const execution = this.#executions[this.#executionIndex]!;
    const result = this.#follower.finish();
    if (!result.answer) throw new Error("Score follower returned no answer");
    this.#records.push({ execution, result: { ...result, answer: result.answer } });
    this.#follower = undefined;
    this.#startTimestampMs = undefined;
    this.#live = undefined;
    this.#executionIndex += 1;

    if (this.#executionIndex < this.#executions.length) {
      this.#status = "between";
    } else {
      this.#status = "complete";
      this.#summary = summarizePractice(this.#plan, this.#records);
    }
    return this.state;
  }

  cancel(): ScorePracticeState {
    this.#status = "cancelled";
    this.#executionIndex = 0;
    this.#follower = undefined;
    this.#startTimestampMs = undefined;
    this.#live = undefined;
    this.#records.length = 0;
    this.#summary = undefined;
    return this.state;
  }
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

function segmentExecution(segment: PracticeSegment, take: number): PracticeExecution {
  return {
    id: `${segment.id}:take:${take}`,
    take,
    segmentIds: [segment.id],
    groups: segment.groups.map((group) => ({ ...group })),
    durationBeats: segment.durationBeats,
    startsNewTake: true,
    segmentGroupCounts: [segment.groups.length],
    segmentExpectedNotes: [expectedNoteCount(segment.groups)],
  };
}

function sequenceExecution(segments: PracticeSegment[], take: number): PracticeExecution {
  let offset = 0;
  const groups: ExpectedNoteGroup[] = [];
  for (const segment of segments) {
    groups.push(
      ...segment.groups.map((group) => ({
        ...group,
        id: `${segment.id}:${group.id}:take:${take}`,
        startBeat: group.startBeat + offset,
      })),
    );
    offset += segment.durationBeats;
  }
  return {
    id: `sequence:take:${take}`,
    take,
    segmentIds: segments.map(({ id }) => id),
    groups,
    durationBeats: offset,
    startsNewTake: true,
    segmentGroupCounts: segments.map(({ groups: segmentGroups }) => segmentGroups.length),
    segmentExpectedNotes: segments.map(({ groups: segmentGroups }) =>
      expectedNoteCount(segmentGroups),
    ),
  };
}

function temporalGroupIndex(groups: ExpectedNoteGroup[], beat: number): number {
  const index = groups.findIndex(({ startBeat }) => startBeat >= beat - EPSILON);
  return index < 0 ? groups.length : index;
}

function segmentAtGroup(execution: PracticeExecution, groupIndex: number): string | undefined {
  let boundary = 0;
  for (const [index, count] of execution.segmentGroupCounts.entries()) {
    boundary += count;
    if (groupIndex < boundary) return execution.segmentIds[index];
  }
  return execution.segmentIds.at(-1);
}

function summarizePractice(
  plan: ScorePracticePlan,
  records: Array<{ execution: PracticeExecution; result: ScorePracticeExecutionResult }>,
): ScorePracticeSummary {
  const expectedNotes = records.reduce(
    (total, { result }) => total + result.answer.expectedNotes,
    0,
  );
  const matchedNotes = records.reduce((total, { result }) => total + result.answer.matchedNotes, 0);
  const timingErrors = records.flatMap(({ result }) =>
    result.metrics.flatMap((metric) => (metric.kind === "timing" ? [metric.errorMs] : [])),
  );
  const aggregateScore =
    expectedNotes === 0
      ? 0
      : records.reduce(
          (total, { result }) => total + result.score * result.answer.expectedNotes,
          0,
        ) / expectedNotes;
  const takes = summarizeTakes(records);
  const bestTake = [...takes].sort(
    (left, right) => right.score - left.score || left.take - right.take,
  )[0]?.take;

  return {
    aggregateScore,
    matchedNotes,
    expectedNotes,
    pitchCompletion: expectedNotes === 0 ? 0 : matchedNotes / expectedNotes,
    ...(timingErrors.length > 0
      ? {
          meanAbsoluteTimingErrorMs:
            timingErrors.reduce((total, error) => total + Math.abs(error), 0) / timingErrors.length,
        }
      : {}),
    earlyNotes: timingErrors.filter((error) => error < -20).length,
    onTimeNotes: timingErrors.filter((error) => Math.abs(error) <= 20).length,
    lateNotes: timingErrors.filter((error) => error > 20).length,
    missedNotes: records.reduce((total, { result }) => total + result.answer.missedNotes, 0),
    extraNotes: records.reduce((total, { result }) => total + result.answer.extraNotes, 0),
    ...(bestTake === undefined ? {} : { bestTake }),
    takes,
    sections: summarizeSections(plan, records),
  };
}

function summarizeTakes(
  records: Array<{ execution: PracticeExecution; result: ScorePracticeExecutionResult }>,
): ScorePracticeTakeSummary[] {
  const byTake = new Map<
    number,
    Array<{ execution: PracticeExecution; result: ScorePracticeExecutionResult }>
  >();
  for (const record of records) {
    const entries = byTake.get(record.execution.take) ?? [];
    entries.push(record);
    byTake.set(record.execution.take, entries);
  }

  return [...byTake.entries()]
    .sort(([left], [right]) => left - right)
    .map(([take, entries]) => {
      const expectedNotes = entries.reduce(
        (total, { result }) => total + result.answer.expectedNotes,
        0,
      );
      const matchedNotes = entries.reduce(
        (total, { result }) => total + result.answer.matchedNotes,
        0,
      );
      const timingErrors = entries.flatMap(({ result }) =>
        result.metrics.flatMap((metric) => (metric.kind === "timing" ? [metric.errorMs] : [])),
      );
      return {
        take,
        score:
          expectedNotes === 0
            ? 0
            : entries.reduce(
                (total, { result }) => total + result.score * result.answer.expectedNotes,
                0,
              ) / expectedNotes,
        expectedNotes,
        matchedNotes,
        ...(timingErrors.length > 0
          ? {
              meanAbsoluteTimingErrorMs:
                timingErrors.reduce((total, error) => total + Math.abs(error), 0) /
                timingErrors.length,
            }
          : {}),
        segmentIds: [...new Set(entries.flatMap(({ execution }) => execution.segmentIds))],
      };
    });
}

function summarizeSections(
  plan: ScorePracticePlan,
  records: Array<{ execution: PracticeExecution; result: ScorePracticeExecutionResult }>,
): ScorePracticeSectionSummary[] {
  return plan.segments.map((segment) => {
    const attempts = records.flatMap(({ execution, result }) => {
      const segmentIndex = execution.segmentIds.indexOf(segment.id);
      if (segmentIndex < 0) return [];
      const outcomes = expectedNoteOutcomes(result);
      const start = execution.segmentExpectedNotes
        .slice(0, segmentIndex)
        .reduce((total, count) => total + count, 0);
      const expectedNotes = execution.segmentExpectedNotes[segmentIndex] ?? 0;
      const segmentOutcomes = outcomes.slice(start, start + expectedNotes);
      const matchedNotes = segmentOutcomes.filter(({ matched }) => matched).length;
      return [
        {
          take: execution.take,
          expectedNotes,
          matchedNotes,
          score:
            execution.segmentIds.length === 1
              ? result.score
              : expectedNotes === 0
                ? 0
                : matchedNotes / expectedNotes,
        },
      ];
    });
    const expectedNotes = attempts.reduce((total, attempt) => total + attempt.expectedNotes, 0);
    const matchedNotes = attempts.reduce((total, attempt) => total + attempt.matchedNotes, 0);
    const bestAttempt = [...attempts].sort(
      (left, right) => right.score - left.score || left.take - right.take,
    )[0];
    const score =
      expectedNotes === 0
        ? 0
        : attempts.reduce((total, attempt) => total + attempt.score * attempt.expectedNotes, 0) /
          expectedNotes;

    return {
      segmentId: segment.id,
      label: segment.label,
      score,
      expectedNotes,
      matchedNotes,
      ...(bestAttempt ? { bestTake: bestAttempt.take } : {}),
    };
  });
}

function expectedNoteCount(groups: ExpectedNoteGroup[]): number {
  return groups.reduce((total, group) => total + group.midiNotes.length, 0);
}

function expectedNoteOutcomes(
  result: ScorePracticeExecutionResult,
): Array<{ matched: boolean; timingErrorMs?: number }> {
  const outcomes: Array<{ matched: boolean; timingErrorMs?: number }> = [];
  for (const metric of result.metrics) {
    if (metric.kind === "pitch") {
      outcomes.push({ matched: metric.actualMidi !== undefined });
    } else if (metric.kind === "timing") {
      const current = outcomes.at(-1);
      if (current) current.timingErrorMs = metric.errorMs;
    }
  }
  return outcomes;
}
