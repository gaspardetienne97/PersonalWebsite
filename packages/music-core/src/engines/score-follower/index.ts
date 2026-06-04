import type {
  ExerciseLiveState,
  ExerciseRun,
  NoteEvent,
  NoteOnEvent,
  Score,
  ScoringMetric,
  MonotonicMs,
} from "@repo/music-core/domain";

export type ScoreFollowerMode = "wait" | "performance";
export type TimingStrictness = "relaxed" | "normal" | "strict";

export interface ExpectedNoteGroup {
  id: string;
  startBeat: number;
  durationBeats: number;
  midiNotes: number[];
  sourceNoteIndexes: number[];
}

export interface ScoreFollowerLiveState extends ExerciseLiveState {
  currentGroupIndex: number;
  expectedMidiNotes: number[];
  heldMidiNotes: number[];
  wrongMidiNotes: number[];
  timingErrorMs?: number;
}

export interface ScoreFollowerOptions {
  mode: ScoreFollowerMode;
  bpm: number;
  strictness: TimingStrictness;
  startTimestampMs?: MonotonicMs;
}

export interface ScoreFollowerAnswer {
  completedGroups: number;
  expectedGroups: number;
  playedMidiNotes: number[];
  wrongMidiNotes: number[];
}

export interface ScoreFollowerRun extends ExerciseRun<ScoreFollowerAnswer> {
  getLiveState(): ScoreFollowerLiveState;
}

export function expectedGroups(score: Score): ExpectedNoteGroup[] {
  const grouped = new Map<
    string,
    { notes: number[]; indexes: number[]; start: number; duration: number }
  >();

  score.notes.forEach((note, index) => {
    const key = `${note.startBeat}:${note.durationBeats}`;
    const group = grouped.get(key) ?? {
      notes: [],
      indexes: [],
      start: note.startBeat,
      duration: note.durationBeats,
    };
    group.notes.push(note.midiNote);
    group.indexes.push(index);
    grouped.set(key, group);
  });

  return [...grouped.values()]
    .sort((left, right) => left.start - right.start || left.duration - right.duration)
    .map((group, index) => ({
      id: `group:${index}`,
      startBeat: group.start,
      durationBeats: group.duration,
      midiNotes: sortedUnique(group.notes),
      sourceNoteIndexes: [...group.indexes],
    }));
}

export function createScoreFollower(
  groups: ExpectedNoteGroup[],
  options: ScoreFollowerOptions,
): ScoreFollowerRun {
  return options.mode === "wait" ? waitModeRun(groups) : performanceModeRun(groups, options);
}

export function beatToMs(beat: number, bpm: number): number {
  return (beat * 60_000) / bpm;
}

export function timingWindowMs(input: {
  bpm: number;
  durationBeats: number;
  strictness: TimingStrictness;
}): number {
  const strictnessMultiplier = { relaxed: 0.24, normal: 0.16, strict: 0.1 }[input.strictness];
  const beatMs = beatToMs(1, input.bpm);
  const durationMultiplier = Math.sqrt(Math.max(0.25, input.durationBeats));

  return Math.round(clamp(beatMs * strictnessMultiplier * durationMultiplier, 35, 300));
}

function waitModeRun(groups: ExpectedNoteGroup[]): ScoreFollowerRun {
  const held = new Set<number>();
  const wrong = new Set<number>();
  const input: NoteEvent[] = [];
  const playedMidiNotes: number[] = [];
  let currentGroupIndex = 0;

  function currentGroup(): ExpectedNoteGroup | undefined {
    return groups[currentGroupIndex];
  }

  function advanceIfComplete(): void {
    const group = currentGroup();
    if (!group) return;
    if (group.midiNotes.every((midiNote) => held.has(midiNote))) currentGroupIndex += 1;
  }

  return {
    accept(event) {
      if (event.type === "noteOn" || event.type === "noteOff") input.push(event);

      if (event.type === "noteOff") {
        held.delete(event.midiNote);
        return;
      }

      if (event.type !== "noteOn") return;

      playedMidiNotes.push(event.midiNote);
      held.add(event.midiNote);

      const expected = currentGroup()?.midiNotes ?? [];
      if (expected.length > 0 && !expected.includes(event.midiNote)) wrong.add(event.midiNote);
      advanceIfComplete();
    },
    getLiveState() {
      return liveState(groups, currentGroupIndex, held, wrong);
    },
    finish() {
      const state = liveState(groups, currentGroupIndex, held, wrong);
      const completed = Math.min(currentGroupIndex, groups.length);
      const score = groups.length === 0 ? 1 : completed / groups.length;
      const wrongMidiNotes = sortedUnique([...wrong]);
      const expectedMidiNotes = groups.flatMap(({ midiNotes }) => midiNotes);

      return {
        correct: completed === groups.length && wrongMidiNotes.length === 0,
        score,
        metrics: pitchMetrics(groups, new Set(playedMidiNotes)),
        feedback:
          wrongMidiNotes.length > 0
            ? [{ severity: "error", message: `Wrong notes: ${wrongMidiNotes.join(", ")}.` }]
            : state.feedback,
        target: { label: "Score follower", midiNotes: expectedMidiNotes },
        response: playedMidiNotes.length === 0 ? undefined : { midiNotes: [...playedMidiNotes] },
        answer: {
          completedGroups: completed,
          expectedGroups: groups.length,
          playedMidiNotes: [...playedMidiNotes],
          wrongMidiNotes,
        },
        input: [...input],
      };
    },
  };
}

function performanceModeRun(
  groups: ExpectedNoteGroup[],
  options: ScoreFollowerOptions,
): ScoreFollowerRun {
  const expected = expectedNotes(groups, options);
  const input: NoteEvent[] = [];
  const noteOns: NoteOnEvent[] = [];
  const matched = new Map<number, { actualMs: number; errorMs: number }>();
  const expectedPitchSet = new Set(expected.map(({ midiNote }) => midiNote));
  const extraMidiNotes = new Set<number>();
  let lastTimingErrorMs: number | undefined;

  return {
    accept(event) {
      if (event.type === "noteOn" || event.type === "noteOff") input.push(event);
      if (event.type !== "noteOn") return;

      noteOns.push(event);
      const candidate = nearestExpectedMatch(event, expected, matched);

      if (candidate) {
        matched.set(candidate.index, {
          actualMs: event.timestamp as number,
          errorMs: candidate.errorMs,
        });
        lastTimingErrorMs = candidate.errorMs;
        return;
      }

      if (!expectedPitchSet.has(event.midiNote)) extraMidiNotes.add(event.midiNote);
    },
    getLiveState() {
      return performanceLiveState(groups, expected, matched, extraMidiNotes, lastTimingErrorMs);
    },
    finish() {
      const metrics: ScoringMetric[] = [];
      let timingCreditTotal = 0;

      for (const note of expected) {
        const match = matched.get(note.index);
        metrics.push({
          kind: "pitch",
          expectedMidi: note.midiNote,
          ...(match ? { actualMidi: note.midiNote } : {}),
        });

        if (match) {
          metrics.push({
            kind: "timing",
            expectedMs: note.expectedMs,
            actualMs: match.actualMs,
            errorMs: match.errorMs,
          });
          timingCreditTotal += 1 - Math.min(1, Math.abs(match.errorMs) / note.windowMs);
        }
      }

      const expectedCount = expected.length;
      const matchedCount = matched.size;
      const pitchCredit = expectedCount === 0 ? 1 : matchedCount / expectedCount;
      const timingCredit = expectedCount === 0 ? 1 : timingCreditTotal / expectedCount;
      const extraPenalty = expectedCount === 0 ? 0 : (extraMidiNotes.size / expectedCount) * 0.25;
      const score = clamp01((pitchCredit + timingCredit) / 2 - extraPenalty);
      const missedMidiNotes = sortedUnique(
        expected.filter((note) => !matched.has(note.index)).map(({ midiNote }) => midiNote),
      );
      const wrongMidiNotes = sortedUnique([...extraMidiNotes]);
      const completedGroups = groups.filter((_, groupIndex) =>
        expected.some((note) => note.groupIndex === groupIndex && matched.has(note.index)),
      ).length;

      return {
        correct: score === 1,
        score,
        metrics,
        feedback: [
          ...(missedMidiNotes.length > 0
            ? [
                {
                  severity: "error" as const,
                  message: `Missed notes: ${missedMidiNotes.join(", ")}.`,
                },
              ]
            : []),
          ...(wrongMidiNotes.length > 0
            ? [
                {
                  severity: "warn" as const,
                  message: `Extra notes: ${wrongMidiNotes.join(", ")}.`,
                },
              ]
            : []),
        ],
        target: { label: "Score follower", midiNotes: expected.map(({ midiNote }) => midiNote) },
        response:
          noteOns.length === 0 ? undefined : { midiNotes: noteOns.map((event) => event.midiNote) },
        answer: {
          completedGroups,
          expectedGroups: groups.length,
          playedMidiNotes: noteOns.map((event) => event.midiNote),
          wrongMidiNotes,
        },
        input: [...input],
      };
    },
  };
}

function liveState(
  groups: ExpectedNoteGroup[],
  currentGroupIndex: number,
  held: ReadonlySet<number>,
  wrong: ReadonlySet<number>,
): ScoreFollowerLiveState {
  const group = groups[currentGroupIndex];
  const progress = groups.length === 0 ? 1 : Math.min(1, currentGroupIndex / groups.length);
  const wrongMidiNotes = sortedUnique([...wrong]);

  return {
    progress,
    runningScore: progress,
    currentGroupIndex,
    expectedMidiNotes: group?.midiNotes ?? [],
    heldMidiNotes: sortedUnique([...held]),
    wrongMidiNotes,
    feedback:
      wrongMidiNotes.length === 0
        ? []
        : [{ severity: "error", message: `Wrong note: ${wrongMidiNotes[0]}.` }],
  };
}

function pitchMetrics(
  groups: ExpectedNoteGroup[],
  playedMidiNotes: ReadonlySet<number>,
): ScoringMetric[] {
  return groups.flatMap(({ midiNotes }) =>
    midiNotes.map((expectedMidi) => ({
      kind: "pitch" as const,
      expectedMidi,
      ...(playedMidiNotes.has(expectedMidi) ? { actualMidi: expectedMidi } : {}),
    })),
  );
}

function sortedUnique(values: number[]): number[] {
  return [...new Set(values)].sort((left, right) => left - right);
}

function clamp01(value: number): number {
  return clamp(value, 0, 1);
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

interface ExpectedPerformanceNote {
  index: number;
  groupIndex: number;
  midiNote: number;
  expectedMs: number;
  windowMs: number;
}

function expectedNotes(
  groups: ExpectedNoteGroup[],
  options: ScoreFollowerOptions,
): ExpectedPerformanceNote[] {
  const startMs = options.startTimestampMs ?? 0;
  return groups.flatMap((group, groupIndex) =>
    group.midiNotes.map((midiNote) => ({
      index: group.sourceNoteIndexes[group.midiNotes.indexOf(midiNote)] ?? groupIndex,
      groupIndex,
      midiNote,
      expectedMs: startMs + beatToMs(group.startBeat, options.bpm),
      windowMs: timingWindowMs({
        bpm: options.bpm,
        durationBeats: group.durationBeats,
        strictness: options.strictness,
      }),
    })),
  );
}

function nearestExpectedMatch(
  event: NoteEvent,
  expected: ExpectedPerformanceNote[],
  matched: ReadonlyMap<number, unknown>,
): { index: number; errorMs: number } | undefined {
  if (event.type !== "noteOn") return undefined;

  return expected
    .filter(({ index, midiNote }) => midiNote === event.midiNote && !matched.has(index))
    .map((note) => ({
      index: note.index,
      errorMs: Math.round((event.timestamp as number) - note.expectedMs),
      windowMs: note.windowMs,
    }))
    .filter(({ errorMs, windowMs }) => Math.abs(errorMs) <= windowMs)
    .sort((left, right) => Math.abs(left.errorMs) - Math.abs(right.errorMs))[0];
}

function performanceLiveState(
  groups: ExpectedNoteGroup[],
  expected: ExpectedPerformanceNote[],
  matched: ReadonlyMap<number, unknown>,
  extraMidiNotes: ReadonlySet<number>,
  timingErrorMs: number | undefined,
): ScoreFollowerLiveState {
  const currentGroupIndex = Math.min(
    groups.length,
    groups.findIndex((_, groupIndex) =>
      expected.some((note) => note.groupIndex === groupIndex && !matched.has(note.index)),
    ),
  );
  const normalizedGroupIndex = currentGroupIndex < 0 ? groups.length : currentGroupIndex;
  const group = groups[normalizedGroupIndex];
  const progress = expected.length === 0 ? 1 : Math.min(1, matched.size / expected.length);

  return {
    progress,
    runningScore: progress,
    currentGroupIndex: normalizedGroupIndex,
    expectedMidiNotes: group?.midiNotes ?? [],
    heldMidiNotes: [],
    wrongMidiNotes: sortedUnique([...extraMidiNotes]),
    ...(timingErrorMs === undefined ? {} : { timingErrorMs }),
    feedback:
      timingErrorMs === undefined
        ? []
        : [
            {
              severity: Math.abs(timingErrorMs) <= 20 ? "good" : "info",
              message:
                timingErrorMs === 0
                  ? "On time."
                  : timingErrorMs < 0
                    ? `${Math.abs(timingErrorMs)}ms early.`
                    : `${timingErrorMs}ms late.`,
            },
          ],
  };
}
