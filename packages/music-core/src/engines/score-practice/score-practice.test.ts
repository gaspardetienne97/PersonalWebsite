import { describe, expect, test } from "vitest";

import { monotonicMs, type NoteEvent, type Score } from "@repo/music-core/domain";

import {
  ScorePracticeSession,
  barBeatRange,
  barNumberAtBeat,
  buildPracticeExecutions,
  buildScorePracticePlan,
  buildScoreSelectionMap,
  describeScoreRange,
  type ScorePracticeSelection,
} from "./index";

describe("music-core/score-practice", () => {
  test("builds measure and note-group boundaries across time-signature changes", () => {
    const map = buildScoreSelectionMap(changingMeterScore());

    expect(map.measureBoundaries.map(({ beat }) => beat)).toEqual([0, 4, 7]);
    expect(map.noteGroupBoundaries.map(({ beat }) => beat)).toEqual([0, 1, 3, 4, 6, 7]);
    expect(map.noteGroupBoundaries.map(({ measureIndex }) => measureIndex)).toEqual([
      0, 0, 0, 1, 1, 1,
    ]);
  });

  test("normalizes selected sections into score order and rebases each segment", () => {
    const plan = buildScorePracticePlan(changingMeterScore(), {
      kind: "sections",
      sectionIds: ["b", "a"],
      order: "sequence",
    });

    expect(plan.segments.map(({ id }) => id)).toEqual(["a", "b"]);
    expect(plan.segments[0]?.groups.map(({ startBeat }) => startBeat)).toEqual([0, 1, 3]);
    expect(plan.segments[1]?.groups.map(({ startBeat }) => startBeat)).toEqual([0, 2]);
    expect(plan).toMatchObject({
      durationBeats: 7,
      expectedGroups: 5,
    });
  });

  test("uses half-open custom ranges and preserves original source note indexes", () => {
    const plan = buildScorePracticePlan(changingMeterScore(), {
      kind: "custom",
      startBeat: 1,
      endBeat: 4,
      snap: "note-group",
    });

    expect(plan.segments[0]?.groups).toMatchObject([
      { startBeat: 0, sourceNoteIndexes: [1] },
      { startBeat: 2, sourceNoteIndexes: [2] },
    ]);
    expect(plan.segments[0]?.groups.some(({ startBeat }) => startBeat === 3)).toBe(false);
  });

  test("excludes notes beginning before a range and clamps notes beginning inside it", () => {
    const score = changingMeterScore();
    score.notes.push({
      midiNote: 55,
      startBeat: 0,
      durationBeats: 3,
      velocity: 0.8,
      voiceId: "melody",
    });
    score.notes[2] = {
      ...score.notes[2]!,
      durationBeats: 3,
    };

    const plan = buildScorePracticePlan(score, {
      kind: "custom",
      startBeat: 1,
      endBeat: 4,
      snap: "note-group",
    });

    expect(plan.segments[0]?.midiNotes).not.toContain(55);
    expect(plan.segments[0]?.groups[1]).toMatchObject({
      startBeat: 2,
      durationBeats: 1,
      midiNotes: [65],
    });
  });

  test.each<{ name: string; selection: ScorePracticeSelection; message: string }>([
    {
      name: "duplicate sections",
      selection: { kind: "sections", sectionIds: ["a", "a"], order: "sequence" },
      message: "Practice sections must not contain duplicates",
    },
    {
      name: "overlapping sections",
      selection: {
        kind: "sections",
        sectionIds: ["a", "overlap"],
        order: "sequence",
      },
      message: "Practice sections must not overlap",
    },
    {
      name: "unknown sections",
      selection: { kind: "sections", sectionIds: ["missing"], order: "sequence" },
      message: "Unknown score section: missing",
    },
    {
      name: "missing sections",
      selection: { kind: "sections", sectionIds: [], order: "sequence" },
      message: "Select at least one score section",
    },
    {
      name: "reversed custom ranges",
      selection: {
        kind: "custom",
        startBeat: 4,
        endBeat: 1,
        snap: "note-group",
      },
      message: "Practice range end must be after its start",
    },
    {
      name: "zero-width custom ranges",
      selection: {
        kind: "custom",
        startBeat: 1,
        endBeat: 1,
        snap: "note-group",
      },
      message: "Practice range end must be after its start",
    },
    {
      name: "non-finite custom ranges",
      selection: {
        kind: "custom",
        startBeat: Number.NaN,
        endBeat: 4,
        snap: "note-group",
      },
      message: "Practice range beats must be finite",
    },
    {
      name: "note-empty custom ranges",
      selection: {
        kind: "custom",
        startBeat: 2,
        endBeat: 3,
        snap: "note-group",
      },
      message: "Practice range must contain at least one note group",
    },
  ])("rejects $name", ({ selection, message }) => {
    expect(() => buildScorePracticePlan(changingMeterScore(), selection)).toThrow(message);
  });

  test("sequence mode concatenates sections into one execution per take", () => {
    const executions = buildPracticeExecutions(sectionPlan("sequence"), { totalTakes: 2 });

    expect(executions.map(({ take, segmentIds }) => ({ take, segmentIds }))).toEqual([
      { take: 1, segmentIds: ["a", "b"] },
      { take: 2, segmentIds: ["a", "b"] },
    ]);
    expect(executions[0]?.groups.map(({ startBeat }) => startBeat)).toEqual([0, 1, 3, 4, 6]);
    expect(executions[0]?.durationBeats).toBe(7);
  });

  test("per-section mode completes all takes before moving sections", () => {
    const executions = buildPracticeExecutions(sectionPlan("per-section"), { totalTakes: 2 });

    expect(executions.map(({ take, segmentIds }) => ({ take, segmentIds }))).toEqual([
      { take: 1, segmentIds: ["a"] },
      { take: 2, segmentIds: ["a"] },
      { take: 1, segmentIds: ["b"] },
      { take: 2, segmentIds: ["b"] },
    ]);
    expect(executions.map(({ startsNewTake }) => startsNewTake)).toEqual([true, true, true, true]);
  });

  test("creates an isolated follower for every performance take", () => {
    const session = new ScorePracticeSession(singleNotePlan(), {
      mode: "performance",
      bpm: 60,
      strictness: "normal",
      totalTakes: 2,
    });

    session.markCountingIn();
    session.startExecution(monotonicMs(1_000));
    session.accept(noteOn(60, 1_000));
    expect(session.finishExecution().status).toBe("between");

    session.markCountingIn();
    session.startExecution(monotonicMs(2_000));
    const state = session.finishExecution();

    expect(state.status).toBe("complete");
    expect(state.summary?.takes.map(({ score }) => score)).toEqual([1, 0]);
    expect(state.summary).toMatchObject({
      aggregateScore: 0.5,
      matchedNotes: 1,
      expectedNotes: 2,
      missedNotes: 1,
      bestTake: 1,
    });
  });

  test("advances performance progress from the shared clock despite missed notes", () => {
    const session = new ScorePracticeSession(
      buildScorePracticePlan(changingMeterScore(), { kind: "full" }),
      {
        mode: "performance",
        bpm: 60,
        strictness: "normal",
        totalTakes: 1,
      },
    );

    expect(session.accept(noteOn(60, 900)).status).toBe("ready");
    session.markCountingIn();
    expect(session.accept(noteOn(60, 950)).status).toBe("count-in");
    session.startExecution(monotonicMs(1_000));

    const state = session.tick(monotonicMs(3_000));

    expect(state.progress).toBeCloseTo(2 / 7);
    expect(state.live?.currentGroupIndex).toBe(2);
  });

  test("aggregates timing bands, misses, extras, and best take deterministically", () => {
    const session = new ScorePracticeSession(threeNotePlan(), {
      mode: "performance",
      bpm: 60,
      strictness: "normal",
      totalTakes: 1,
    });

    session.markCountingIn();
    session.startExecution(monotonicMs(10_000));
    session.accept(noteOn(60, 9_950));
    session.accept(noteOn(62, 11_010));
    session.accept(noteOn(65, 12_080));
    session.accept(noteOn(70, 11_500));

    const summary = session.finishExecution().summary;

    expect(summary).toMatchObject({
      matchedNotes: 3,
      expectedNotes: 3,
      pitchCompletion: 1,
      earlyNotes: 1,
      onTimeNotes: 1,
      lateNotes: 1,
      missedNotes: 0,
      extraNotes: 1,
      bestTake: 1,
    });
    expect(summary?.meanAbsoluteTimingErrorMs).toBeCloseTo(140 / 3);
  });

  test("attributes sequence matches to the section that owns each expected note", () => {
    const score = scoreWithNotes([note(60, 0, 1), note(62, 1, 1)]);
    score.sections = [
      { id: "a", name: "A", startBeat: 0, endBeat: 1 },
      { id: "b", name: "B", startBeat: 1, endBeat: 2 },
    ];
    const session = new ScorePracticeSession(
      buildScorePracticePlan(score, {
        kind: "sections",
        sectionIds: ["a", "b"],
        order: "sequence",
      }),
      {
        mode: "performance",
        bpm: 60,
        strictness: "normal",
        totalTakes: 1,
      },
    );

    session.startExecution(monotonicMs(1_000));
    session.accept(noteOn(60, 1_000));

    expect(session.finishExecution().summary?.sections).toMatchObject([
      { segmentId: "a", matchedNotes: 1, expectedNotes: 1, score: 1 },
      { segmentId: "b", matchedNotes: 0, expectedNotes: 1, score: 0 },
    ]);
  });

  test("cancels without producing a completed aggregate", () => {
    const session = new ScorePracticeSession(singleNotePlan(), {
      mode: "wait",
      bpm: 90,
      strictness: "normal",
      totalTakes: 1,
    });

    session.startExecution(monotonicMs(0));

    expect(session.cancel()).toMatchObject({
      status: "cancelled",
      summary: undefined,
      completedResults: [],
    });
  });
});

describe("music-core/score-practice bars", () => {
  test("numbers bars from one and keeps the last beat inside the last bar", () => {
    const { measureBoundaries } = buildScoreSelectionMap(changingMeterScore());

    expect(measureBoundaries.map(({ beat }) => beat)).toEqual([0, 4, 7]);
    expect(barNumberAtBeat(0, measureBoundaries)).toBe(1);
    expect(barNumberAtBeat(3.5, measureBoundaries)).toBe(1);
    expect(barNumberAtBeat(4, measureBoundaries)).toBe(2);
    expect(barNumberAtBeat(6.5, measureBoundaries)).toBe(2);
  });

  test("resolves a bar number back to its half-open beat range", () => {
    const { measureBoundaries } = buildScoreSelectionMap(changingMeterScore());

    expect(barBeatRange(1, measureBoundaries)).toEqual({ startBeat: 0, endBeat: 4 });
    expect(barBeatRange(2, measureBoundaries)).toEqual({ startBeat: 4, endBeat: 7 });
    expect(barBeatRange(0, measureBoundaries)).toBeUndefined();
    expect(barBeatRange(3, measureBoundaries)).toBeUndefined();
  });

  test("describes a custom range as bars, beats and seconds at the practice tempo", () => {
    const { measureBoundaries } = buildScoreSelectionMap(eightBarScore());

    expect(describeScoreRange({ startBeat: 8, endBeat: 24 }, measureBoundaries, 96)).toEqual({
      startBar: 3,
      endBar: 6,
      bars: 4,
      beats: 16,
      seconds: 10,
    });
  });

  test("describes a single-bar range as one bar", () => {
    const { measureBoundaries } = buildScoreSelectionMap(eightBarScore());

    expect(describeScoreRange({ startBeat: 8, endBeat: 12 }, measureBoundaries, 120)).toMatchObject(
      { startBar: 3, endBar: 3, bars: 1, beats: 4 },
    );
  });
});

function eightBarScore(): Score {
  return {
    id: "eight-bar",
    title: "Eight Bars",
    origin: "generated",
    keySignature: "C major",
    tempoMap: [{ atBeat: 0, bpm: 96 }],
    timeSignatures: [{ atBeat: 0, numerator: 4, denominator: 4 }],
    voices: [{ id: "melody", name: "Melody", role: "melody" }],
    notes: Array.from({ length: 8 }, (_, index) => note(60, index * 4, 4)),
    chords: [],
    sections: [],
    markers: [],
  };
}

function changingMeterScore(): Score {
  return {
    id: "changing-meter",
    title: "Changing Meter",
    origin: "generated",
    keySignature: "C major",
    tempoMap: [{ atBeat: 0, bpm: 100 }],
    timeSignatures: [
      { atBeat: 0, numerator: 4, denominator: 4 },
      { atBeat: 4, numerator: 3, denominator: 4 },
    ],
    voices: [{ id: "melody", name: "Melody", role: "melody" }],
    notes: [note(60, 0, 1), note(62, 1, 1), note(65, 3, 1), note(67, 4, 1), note(69, 6, 1)],
    chords: [],
    sections: [
      { id: "a", name: "A", startBeat: 0, endBeat: 4 },
      { id: "b", name: "B", startBeat: 4, endBeat: 7 },
      { id: "overlap", name: "Overlap", startBeat: 3, endBeat: 6 },
    ],
    markers: [],
  };
}

function note(midiNote: number, startBeat: number, durationBeats: number) {
  return {
    midiNote,
    startBeat,
    durationBeats,
    velocity: 0.8,
    voiceId: "melody",
  };
}

function sectionPlan(order: "sequence" | "per-section") {
  return buildScorePracticePlan(changingMeterScore(), {
    kind: "sections",
    sectionIds: ["a", "b"],
    order,
  });
}

function singleNotePlan() {
  return buildScorePracticePlan(scoreWithNotes([note(60, 0, 1)]), { kind: "full" });
}

function threeNotePlan() {
  return buildScorePracticePlan(scoreWithNotes([note(60, 0, 1), note(62, 1, 1), note(65, 2, 1)]), {
    kind: "full",
  });
}

function scoreWithNotes(notes: Score["notes"]): Score {
  return {
    id: "compact",
    title: "Compact",
    origin: "generated",
    keySignature: "C major",
    tempoMap: [{ atBeat: 0, bpm: 60 }],
    timeSignatures: [{ atBeat: 0, numerator: 4, denominator: 4 }],
    voices: [{ id: "melody", name: "Melody", role: "melody" }],
    notes,
    chords: [],
    sections: [],
    markers: [],
  };
}

function noteOn(midiNote: number, timestamp: number): NoteEvent {
  return {
    type: "noteOn",
    midiNote,
    velocity: 1,
    source: "midi",
    timestamp: monotonicMs(timestamp),
    clock: "performance",
  };
}
