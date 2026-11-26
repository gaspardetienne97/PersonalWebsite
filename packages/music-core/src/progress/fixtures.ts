// Test fixtures for the progress engine (imported by *.test.ts only).
import type { PracticeSession, RunRecord, ScoringEvent } from "../types";

/** Midnight on 1 September 2026, local time. */
export const T0 = new Date(2026, 8, 1).getTime();

export const ev = (over: Partial<ScoringEvent> = {}): ScoringEvent => ({
  id: "e1",
  sessionId: "s1",
  exerciseId: "ear.intervals",
  promptId: "p",
  at: T0,
  skillIds: ["pitch.interval.m3"],
  capabilities: ["pitch"],
  correct: true,
  partialCredit: 1,
  difficulty: 0.5,
  modality: "heard",
  source: "click",
  assistance: "independent",
  metrics: [],
  ...over,
});

export const run = (over: Partial<RunRecord> = {}): RunRecord => ({
  id: "r1",
  exerciseId: "technique.scale",
  setupKey: "major-C4",
  promptIds: [],
  skillIds: ["technique.scale.major"],
  difficulty: 0.5,
  params: {},
  startedAt: T0,
  endedAt: T0 + 60_000,
  assistance: "independent",
  xp: 10,
  ...over,
});

export const session = (over: Partial<PracticeSession> = {}): PracticeSession => ({
  id: "s1",
  startTime: T0,
  endTime: T0 + 10 * 60_000,
  source: "drill",
  runs: [run()],
  eventIds: ["e1"],
  xp: 50,
  tags: [],
  ...over,
});
