import type {
  ExerciseLiveState,
  ExerciseRun,
  NoteEvent,
  Score,
  ScoringMetric,
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
  if (options.mode !== "wait") {
    throw new Error("Performance score following is implemented in the next checkpoint task");
  }

  return waitModeRun(groups);
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
