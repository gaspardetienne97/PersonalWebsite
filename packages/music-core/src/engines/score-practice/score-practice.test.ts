import { describe, expect, test } from "vitest";

import type { Score } from "@repo/music-core/domain";

import {
  buildScorePracticePlan,
  buildScoreSelectionMap,
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
});

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
