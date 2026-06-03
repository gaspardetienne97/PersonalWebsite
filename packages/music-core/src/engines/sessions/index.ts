import {
  summarizeSession,
  type ExerciseRunRecord,
  type InstrumentId,
  type PracticeSession,
  type ScoringEvent,
  type SessionSource,
  type SessionSummary,
  type UnixMs,
} from "@repo/music-core/domain";

export interface StartSessionArgs {
  id: string;
  startedAt: UnixMs;
  source: SessionSource;
  instrument?: InstrumentId;
  tags?: string[];
}

export class PracticeSessionStore {
  #sessions = new Map<string, PracticeSession>();

  start(args: StartSessionArgs): PracticeSession {
    const session: PracticeSession = {
      id: args.id,
      startTime: args.startedAt,
      source: args.source,
      ...(args.instrument !== undefined ? { instrument: args.instrument } : {}),
      runs: [],
      scoringEvents: [],
      xpEarned: 0,
      tags: args.tags ?? [],
    };
    this.#sessions.set(session.id, session);
    return clone(session);
  }

  recordRun(sessionId: string, run: ExerciseRunRecord): void {
    const session = this.requireSession(sessionId);
    session.runs.push(clone(run));
  }

  recordScoringEvent(sessionId: string, event: ScoringEvent): void {
    const session = this.requireSession(sessionId);
    session.scoringEvents.push(clone(event));
  }

  finish(sessionId: string, endedAt: UnixMs, xpEarned: number, notes?: string): PracticeSession {
    const session = this.requireSession(sessionId);
    session.endTime = endedAt;
    session.xpEarned = xpEarned;
    if (notes !== undefined) session.notes = notes;
    return clone(session);
  }

  bySkill(skillId: string): PracticeSession[] {
    return this.all().filter((session) =>
      session.scoringEvents.some((event) => event.skillIds.includes(skillId)),
    );
  }

  byInstrument(instrument: InstrumentId): PracticeSession[] {
    return this.all().filter((session) => session.instrument === instrument);
  }

  byDateRange(start: UnixMs, end: UnixMs): PracticeSession[] {
    return this.all().filter((session) => session.startTime >= start && session.startTime <= end);
  }

  summarize(sessionId: string): SessionSummary {
    return summarizeSession(this.requireSession(sessionId));
  }

  all(): PracticeSession[] {
    return [...this.#sessions.values()].map((session) => clone(session));
  }

  private requireSession(sessionId: string): PracticeSession {
    const session = this.#sessions.get(sessionId);
    if (!session) throw new Error(`Practice session not found: ${sessionId}`);
    return session;
  }
}

function clone<T>(value: T): T {
  return structuredClone(value);
}
