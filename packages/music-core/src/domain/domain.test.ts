import { describe, expect, test } from "vitest";

import {
  Capability,
  applyScoringEventToSkillState,
  initialMastery,
  isMasteryEligible,
  monotonicMs,
  resultToScoringEvent,
  scoringEventToEvidence,
  updateConfusion,
  unixMs,
  type ConfusionMatrix,
  type SkillMastery,
  type WrittenPitch,
  type NoteEvent,
  type ScoringEvent,
} from "./index";

describe("domain learning pipeline", () => {
  test("represents a written pitch independently from sounding MIDI", () => {
    const written: WrittenPitch = { step: "F", accidental: "#", octave: 4 };

    expect(written).toEqual({ step: "F", accidental: "#", octave: 4 });
  });

  test("moves mastery and records m6/P5 confusion on the canonical path", () => {
    let mastery = new Map<string, SkillMastery>([
      ["pitch.interval.m6", initialMastery("pitch.interval.m6")],
    ]);
    const confusion: ConfusionMatrix = new Map();

    const event = resultToScoringEvent({
      result: {
        correct: false,
        score: 0,
        latencyMs: 900,
        metrics: [{ kind: "choice", expected: "m6", actual: "P5" }],
        feedback: [],
        input: [],
      },
      sessionId: "session-1",
      runId: "run-1",
      exercise: {
        id: "ear.interval-recognition",
        skillIds: ["pitch.interval.m6"],
        capabilities: [Capability.EarTraining, Capability.Pitch],
      },
      prompt: { id: "prompt-1" },
      at: unixMs(1_700_000_000_000),
      difficulty: 0.6,
      modality: "heard",
      makeId: () => "event-1",
    });

    expect(scoringEventToEvidence(event)).toHaveLength(1);
    expect(event).toMatchObject({ latencyMs: 900 });
    mastery = applyScoringEventToSkillState(mastery, event, initialMastery);
    updateConfusion(confusion, event);

    expect(mastery.get("pitch.interval.m6")?.confidence).toBeGreaterThan(0);
    expect(mastery.get("pitch.interval.m6")?.mastery).toBe(0);
    expect(confusion.get("m6")?.get("P5")).toBe(1);
  });
});

describe("scoring provenance", () => {
  const input = (source: NoteEvent["source"], instrument?: NoteEvent["instrument"]): NoteEvent => ({
    type: "noteOn",
    midiNote: 60,
    velocity: 1,
    source,
    instrument,
    timestamp: monotonicMs(0),
    clock: "performance",
  });
  function event(
    inputs: NoteEvent[] = [],
    assistance?: ScoringEvent["assistance"],
    instrument?: ScoringEvent["instrument"],
  ) {
    return resultToScoringEvent({
      result: { correct: true, score: 1, metrics: [], feedback: [], input: inputs },
      sessionId: "session",
      runId: "run",
      exercise: { id: "exercise", skillIds: ["skill"], capabilities: [] },
      prompt: { id: "prompt" },
      at: unixMs(100),
      difficulty: 0.5,
      makeId: () => "event",
      assistance,
      instrument,
    });
  }

  test("uses accepted sources, preserving mixed input and unknown provenance", () => {
    expect(event([input("audio", "guitar")])).toMatchObject({
      source: "audio",
      instrument: "guitar",
    });
    expect(event([input("midi"), input("onscreen")])).toMatchObject({ source: "mixed" });
    expect(event([input("midi"), input("midi")]).source).toBe("midi");
    expect(event()).not.toHaveProperty("source");
    expect(event()).not.toHaveProperty("instrument");
    expect(event()).not.toHaveProperty("assistance");
    expect(event([input("midi", "guitar"), input("midi", "piano")])).not.toHaveProperty(
      "instrument",
    );
    expect(event([], "independent", "ukulele").instrument).toBe("ukulele");
  });

  test.each(["hinted", "guided", "self-assessed"] as const)(
    "%s remains practice without adding mastery evidence",
    (assistance) => {
      const attempt = event([input("click")], assistance);
      expect(attempt.assistance).toBe(assistance);
      expect(isMasteryEligible(attempt)).toBe(false);
      expect(scoringEventToEvidence(attempt)).toEqual([]);
      expect(applyScoringEventToSkillState(new Map(), attempt, initialMastery).size).toBe(0);
    },
  );

  test("unaided eligibility requires explicit independence; legacy cumulative evidence remains compatible", () => {
    expect(isMasteryEligible(event())).toBe(false);
    expect(scoringEventToEvidence(event())).toHaveLength(1);
    expect(isMasteryEligible(event([], "independent"))).toBe(true);
    expect(scoringEventToEvidence(event([], "independent"))).toHaveLength(1);
  });
});
