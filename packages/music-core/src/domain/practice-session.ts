import type { InstrumentId } from "./instrument";
import type { Capability } from "./capability";
import type { ScoringEvent } from "./scoring";
import type { UnixMs } from "./time";

/**
 * ExerciseRunRecord - one invocation of an exercise within a session, with its
 * parameters. v1 stored only `exerciseIds`, which can't answer "spider at 80
 * BPM" or "37 prompts" or "repeated bars 12-16 five times". The run record
 * preserves the *structure* of a session, not just its scoring events.
 */
export interface ExerciseRunRecord {
  id: string;
  exerciseId: string;
  startedAt: UnixMs;
  endedAt?: UnixMs;
  /** Prompt ids presented during the run (count = number of prompts). */
  promptIds: string[];
  targetSkillIds: string[];
  instrument?: InstrumentId;
  /** Difficulty the run was set to, 0-1. */
  difficulty: number;
  /** Free-form run params, e.g. { bpm: 80, loopBars: [12, 16] }. */
  params?: Record<string, unknown>;
}

export type SessionSource = "free-practice" | "daily-routine" | "song" | "drill" | "jam";

/**
 * PracticeSession - the canonical container that ties everything together.
 *
 * Makes practice queryable as a unit: "every session with ii-V-I voicings",
 * "guitar sessions last month", "this week's rhythm vs last week", "summarize".
 * A session may span instruments; `instrument` records the primary one.
 */
export interface PracticeSession {
  id: string;
  startTime: UnixMs;
  endTime?: UnixMs;
  instrument?: InstrumentId;
  /** What initiated the session (drives analytics + journaling). */
  source: SessionSource;
  /** The routine this session ran, if any. */
  routineId?: string;
  /** Goals this session was working toward. */
  goalIds?: string[];
  /** Structured runs (preserves session shape). */
  runs: ExerciseRunRecord[];
  /** Every graded attempt in the session. */
  scoringEvents: ScoringEvent[];
  xpEarned: number;
  /** Free-text reflection - the Practice Journal entry for this session. */
  notes?: string;
  /** Optional one-line reminder for the next practice session. */
  nextTime?: string;
  tags: string[];
}

/**
 * SessionSummary - a derived, queryable rollup. Computed from a session's
 * events, never stored as a source of truth (so it can't drift).
 */
export interface SessionSummary {
  sessionId: string;
  durationMs: number;
  attempts: number;
  /** Mean partial-credit score across attempts, 0-1. */
  meanScore: number;
  bySkill: Record<string, { attempts: number; meanScore: number }>;
  byCapability: Partial<Record<Capability, { attempts: number; meanScore: number }>>;
}

/** Compute a summary from a session. Pure and deterministic. */
export function summarizeSession(session: PracticeSession): SessionSummary {
  const end = session.endTime ?? session.startTime;
  const durationMs = Math.max(0, end - session.startTime);

  const bySkill: SessionSummary["bySkill"] = {};
  const byCapability: SessionSummary["byCapability"] = {};
  let scoreSum = 0;

  for (const ev of session.scoringEvents) {
    scoreSum += ev.partialCredit;

    for (const skillId of ev.skillIds) {
      const s = bySkill[skillId] ?? { attempts: 0, meanScore: 0 };
      s.meanScore = (s.meanScore * s.attempts + ev.partialCredit) / (s.attempts + 1);
      s.attempts += 1;
      bySkill[skillId] = s;
    }

    for (const cap of ev.capabilities) {
      const c = byCapability[cap] ?? { attempts: 0, meanScore: 0 };
      c.meanScore = (c.meanScore * c.attempts + ev.partialCredit) / (c.attempts + 1);
      c.attempts += 1;
      byCapability[cap] = c;
    }
  }

  const attempts = session.scoringEvents.length;
  return {
    sessionId: session.id,
    durationMs,
    attempts,
    meanScore: attempts === 0 ? 0 : scoreSum / attempts,
    bySkill,
    byCapability,
  };
}
