import {
  summarizeSession,
  type ExerciseRunRecord,
  type InstrumentId,
  type PracticeSession,
  type ScoringEvent,
  type SessionSource,
  type SessionSummary,
  type UnixMs,
  unixMs,
} from "@repo/music-core/domain";
import type { PracticeStore } from "@repo/music-core/engines/store";

export interface StartSessionArgs {
  id: string;
  startedAt: UnixMs;
  source: SessionSource;
  instrument?: InstrumentId;
  tags?: string[];
}

export interface SessionQuery {
  skillId?: string;
  instrument?: InstrumentId;
  start?: UnixMs;
  end?: UnixMs;
  tags?: string[];
}

export interface PeriodSummary {
  sessionCount: number;
  xp: number;
  attempts: number;
  meanScore: number;
  durationMs: number;
}

export interface WeekComparison {
  thisWeek: PeriodSummary;
  lastWeek: PeriodSummary;
  delta: PeriodSummary;
}

export class PracticeSessionStore {
  #sessions = new Map<string, PracticeSession>();
  #operationQueue: Promise<void> = Promise.resolve();
  #flushQueue: Promise<void> = Promise.resolve();

  constructor(private readonly store?: PracticeStore) {}

  async load(): Promise<void> {
    if (!this.store) return;
    const sessions = await this.store.sessions.all();
    this.#sessions = new Map(sessions.map((session) => [session.id, clone(session)]));
  }

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
    this.#persist(session);
    return clone(session);
  }

  recordRun(sessionId: string, run: ExerciseRunRecord): void {
    const session = this.requireSession(sessionId);
    session.runs.push(clone(run));
    this.#persist(session);
  }

  recordScoringEvent(sessionId: string, event: ScoringEvent): void {
    const session = this.requireSession(sessionId);
    session.scoringEvents.push(clone(event));
    this.#persist(session);
  }

  finish(sessionId: string, endedAt: UnixMs, xpEarned: number, notes?: string): PracticeSession {
    const session = this.requireSession(sessionId);
    session.endTime = endedAt;
    session.xpEarned = xpEarned;
    if (notes !== undefined) session.notes = notes;
    this.#persist(session);
    return clone(session);
  }

  updateJournal(sessionId: string, notes: string, tags?: string[]): PracticeSession {
    const session = this.requireSession(sessionId);
    session.notes = notes;
    if (tags !== undefined) session.tags = [...tags];
    this.#persist(session);
    return clone(session);
  }

  /** Delete a session (e.g. a journal entry). No-op if it does not exist. */
  remove(sessionId: string): void {
    if (!this.#sessions.delete(sessionId)) return;
    if (this.store) {
      this.#enqueue(() => this.store!.sessions.delete(sessionId));
    }
  }

  query(options: SessionQuery = {}): PracticeSession[] {
    return this.all().filter((session) => {
      if (options.skillId && !touchesSkill(session, options.skillId)) return false;
      if (options.instrument && session.instrument !== options.instrument) return false;
      if (options.start !== undefined && session.startTime < options.start) return false;
      if (options.end !== undefined && session.startTime > options.end) return false;
      if (options.tags?.some((tag) => !session.tags.includes(tag))) return false;
      return true;
    });
  }

  bySkill(skillId: string): PracticeSession[] {
    return this.query({ skillId });
  }

  byInstrument(instrument: InstrumentId): PracticeSession[] {
    return this.query({ instrument });
  }

  byDateRange(start: UnixMs, end: UnixMs): PracticeSession[] {
    return this.query({ start, end });
  }

  compareWeeks(referenceAt: UnixMs): WeekComparison {
    const thisWeekStart = startOfUtcWeek(referenceAt);
    const nextWeekStart = unixMs(thisWeekStart + WEEK_MS);
    const lastWeekStart = unixMs(thisWeekStart - WEEK_MS);

    const thisWeek = summarizePeriod(this.byDateRange(thisWeekStart, unixMs(nextWeekStart - 1)));
    const lastWeek = summarizePeriod(this.byDateRange(lastWeekStart, unixMs(thisWeekStart - 1)));

    return {
      thisWeek,
      lastWeek,
      delta: {
        sessionCount: thisWeek.sessionCount - lastWeek.sessionCount,
        xp: thisWeek.xp - lastWeek.xp,
        attempts: thisWeek.attempts - lastWeek.attempts,
        meanScore: round(thisWeek.meanScore - lastWeek.meanScore),
        durationMs: thisWeek.durationMs - lastWeek.durationMs,
      },
    };
  }

  summarize(sessionId: string): SessionSummary {
    return summarizeSession(this.requireSession(sessionId));
  }

  all(): PracticeSession[] {
    return [...this.#sessions.values()].map((session) => clone(session));
  }

  flush(): Promise<void> {
    const result = this.#flushQueue;
    this.#flushQueue = this.#operationQueue;
    return result;
  }

  private requireSession(sessionId: string): PracticeSession {
    const session = this.#sessions.get(sessionId);
    if (!session) throw new Error(`Practice session not found: ${sessionId}`);
    return session;
  }

  #persist(session: PracticeSession): void {
    if (!this.store) return;
    const row = clone(session);
    this.#enqueue(() => this.store!.sessions.put(row));
  }

  #enqueue(operation: () => Promise<void>): void {
    const result = this.#operationQueue.then(operation, operation);
    this.#operationQueue = result.catch(() => undefined);
    this.#flushQueue = Promise.all([this.#flushQueue, result]).then(() => undefined);
  }
}

function clone<T>(value: T): T {
  return structuredClone(value);
}

function touchesSkill(session: PracticeSession, skillId: string): boolean {
  return (
    session.scoringEvents.some((event) => event.skillIds.includes(skillId)) ||
    session.runs.some((run) => run.targetSkillIds.includes(skillId))
  );
}

function summarizePeriod(sessions: PracticeSession[]): PeriodSummary {
  const summaries = sessions.map((session) => summarizeSession(session));
  const attempts = summaries.reduce((total, summary) => total + summary.attempts, 0);
  const weightedScore = summaries.reduce(
    (total, summary) => total + summary.meanScore * summary.attempts,
    0,
  );

  return {
    sessionCount: sessions.length,
    xp: sessions.reduce((total, session) => total + session.xpEarned, 0),
    attempts,
    meanScore: attempts === 0 ? 0 : round(weightedScore / attempts),
    durationMs: summaries.reduce((total, summary) => total + summary.durationMs, 0),
  };
}

function startOfUtcWeek(at: UnixMs): UnixMs {
  const date = new Date(at);
  const midnight = Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate());
  const day = new Date(midnight).getUTCDay();
  const daysSinceMonday = (day + 6) % 7;
  return unixMs(midnight - daysSinceMonday * DAY_MS);
}

function round(value: number): number {
  return Math.round(value * 1_000_000) / 1_000_000;
}

const DAY_MS = 86_400_000;
const WEEK_MS = DAY_MS * 7;

export interface LastRunReference {
  /** Mean partial credit of the prior run, 0-1. */
  accuracy: number;
  endedAt: UnixMs;
}

/**
 * The most recent prior run of a drill — sessions carrying ALL of `tags`,
 * with at least one scoring event, started before `before`. Drill summaries
 * use it for "vs last run" deltas; `before` is the page-visit time so the
 * just-recorded run (whose persistence may have already landed) and mid-visit
 * retries never compare against themselves.
 */
export function lastRunReference(
  sessions: PracticeSession[],
  tags: string[],
  before: UnixMs,
): LastRunReference | undefined {
  let best: PracticeSession | undefined;
  for (const session of sessions) {
    if (session.startTime >= before) continue;
    if (session.scoringEvents.length === 0) continue;
    if (!tags.every((tag) => session.tags.includes(tag))) continue;
    if (!best || session.startTime > best.startTime) best = session;
  }
  if (!best) return undefined;
  return {
    accuracy: summarizeSession(best).meanScore,
    endedAt: unixMs(best.endTime ?? best.startTime),
  };
}

/** Mean partial credit of a run's scoring events — the same metric
 * `lastRunReference` summarizes, so "vs last run" deltas compare like for
 * like. */
export function meanPartialCredit(events: readonly Pick<ScoringEvent, "partialCredit">[]): number {
  if (events.length === 0) return 0;
  return events.reduce((sum, event) => sum + event.partialCredit, 0) / events.length;
}
