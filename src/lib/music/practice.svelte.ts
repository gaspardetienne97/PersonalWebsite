// The practice recorder: the one path from a graded attempt to storage,
// mastery, analytics, XP and the journal. Drills call `practice.beginRun()`,
// `run.attempt()` per graded item and `run.finish()` once. Demos never call it.
// A run where nothing was heard (no note, tap, onset or answer) writes nothing:
// no session, no XP, no streak day. Its attempts wait until input arrives.
import { page } from "$app/state";
import type {
  Assistance,
  InputEvent,
  Capability,
  InputSource,
  Instrument,
  Label,
  Metric,
  Modality,
  PracticeSession,
  RunRecord,
  ScoringEvent,
  SessionSource,
  SkillMastery,
} from "@repo/music-core";
import { ingestEvents } from "@repo/music-core/progress/mastery";
import { ingestAnalytics, type SkillStats } from "@repo/music-core/progress/analytics";
import {
  applyFreezes,
  dayKey,
  improvementFor,
  practicedDays,
  xpForAttempt,
} from "@repo/music-core/progress/rewards";
import { lastRunForSetup, personalBest } from "@repo/music-core/progress/journal";
import { db, getSetting, input, putSetting, settings } from "./runtime";

const SESSION_IDLE_MS = 30 * 60_000;
const PROCESSED_KEY = "skills.processed-events.v1";
const STATS_KEY = "analytics.stats.v1";
const STATS_PROCESSED_KEY = "analytics.processed-events.v1";

const uid = (p: string) =>
  `${p}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

export interface RunSpec {
  exerciseId: string;
  setupKey: string;
  skillIds: string[];
  capabilities: Capability[];
  modality: Modality;
  assistance: Assistance;
  difficulty: number;
  instrument?: Instrument;
  params?: Record<string, string | number | boolean>;
  source?: SessionSource;
}

export interface AttemptInput {
  promptId: string;
  correct: boolean;
  partialCredit: number;
  metrics?: Metric[];
  source: InputSource | "mixed";
  target?: Label;
  response?: Label;
  latencyMs?: number;
  /** Override the run's skills for this attempt (ear mixes, per-degree skills). */
  skillIds?: string[];
  difficulty?: number;
  assistance?: Assistance;
  instrument?: Instrument | null;
  /**
   * Whether this attempt had input behind it. Drills with their own input path
   * (the big Tap button, the strum and bend listeners) say so; `answered()` otherwise.
   */
  heard?: boolean;
}

export interface FinishInput {
  score?: number;
  correct?: boolean;
  headline?: string;
  params?: Record<string, string | number | boolean>;
  /** A self-rated run: the rating is the evidence, so it counts without any input. */
  rated?: boolean;
}

export interface FinishResult {
  run: RunRecord;
  xp: number;
  /** Score points (0..100) vs the last run with the same setup. */
  delta: number | null;
  best: boolean;
  previous?: RunRecord;
  /** False when nothing was heard: the run was not scored or saved. */
  heard: boolean;
}

/** An instrument event that shows the player did something. */
export const isPlayed = (e: InputEvent) =>
  e.kind === "noteon" || e.kind === "onset" || (e.kind === "cc" && e.value > 0);

/**
 * An attempt that carries its own evidence: a non-empty response, or with none
 * an answer clicked or notes from hardware (`runSource` says "onscreen" when
 * nothing arrived).
 */
export function answered(a: Pick<AttemptInput, "response" | "source">) {
  if (a.response !== undefined)
    return Array.isArray(a.response) ? a.response.length > 0 : a.response !== "";
  return a.source !== "onscreen";
}

class Practice {
  sessions = $state<PracticeSession[]>([]);
  mastery = $state<Record<string, SkillMastery>>({});
  stats = $state<Record<string, SkillStats>>({});
  events = $state<ScoringEvent[]>([]);
  ready: Promise<void>;
  #processed: string[] = [];
  #statsProcessed: string[] = [];
  #current: PracticeSession | null = null;

  constructor() {
    this.ready = typeof window === "undefined" ? Promise.resolve() : this.load();
  }

  async load() {
    const [sessions, mastery, events, processed, stats, statsProcessed] = await Promise.all([
      db.sessions.orderBy("startTime").toArray(),
      db.skillMastery.toArray(),
      db.scoringEvents.orderBy("at").toArray(),
      getSetting<string[]>(PROCESSED_KEY, []),
      getSetting<Record<string, SkillStats>>(STATS_KEY, {}),
      getSetting<string[]>(STATS_PROCESSED_KEY, []),
    ]);
    this.sessions = sessions;
    this.mastery = Object.fromEntries(mastery.map((m) => [m.skillId, m]));
    this.events = events;
    this.#processed = processed;
    this.stats = stats;
    this.#statsProcessed = statsProcessed;
  }

  /** Reload everything, e.g. after a restore. */
  async reload() {
    this.#current = null;
    this.ready = this.load();
    await this.ready;
  }

  get xpTotal() {
    return this.sessions.reduce((sum, s) => sum + s.xp, 0);
  }

  beginRun(spec: RunSpec): Run {
    return new Run(this, spec);
  }

  /** @internal */
  async session(
    source: SessionSource,
    instrument: Instrument | undefined,
  ): Promise<PracticeSession> {
    await this.ready;
    const routineId = page.url.searchParams.get("routine") ?? undefined;
    const now = Date.now();
    const cur = this.#current;
    const last = cur ? Math.max(cur.startTime, cur.endTime ?? 0) : 0;
    if (
      cur &&
      cur.source === (routineId ? "daily-routine" : source) &&
      cur.routineId === routineId &&
      now - last < SESSION_IDLE_MS
    ) {
      if (cur.instrument !== instrument) cur.instrument = undefined;
      return cur;
    }
    const s: PracticeSession = {
      id: uid("session"),
      startTime: now,
      instrument,
      source: routineId ? "daily-routine" : source,
      routineId,
      runs: [],
      eventIds: [],
      xp: 0,
      tags: [],
    };
    this.#current = s;
    this.sessions = [...this.sessions, s];
    return s;
  }

  /** @internal */
  async record(session: PracticeSession, event: ScoringEvent, xp: number) {
    session.eventIds.push(event.id);
    session.xp += xp;
    session.endTime = Date.now();
    this.events = [...this.events, event];
    const m = ingestEvents(this.mastery, this.#processed, [event]);
    const a = ingestAnalytics(this.stats, this.#statsProcessed, [event]);
    this.mastery = m.state;
    this.#processed = m.processed;
    this.stats = a.stats;
    this.#statsProcessed = a.processed;
    await db.transaction(
      "rw",
      [db.scoringEvents, db.skillMastery, db.sessions, db.settings],
      async () => {
        await db.scoringEvents.put(event);
        await db.skillMastery.bulkPut(m.changed.map((id) => m.state[id]));
        await db.sessions.put(session);
        await putSetting(PROCESSED_KEY, m.processed);
        await putSetting(STATS_KEY, a.stats);
        await putSetting(STATS_PROCESSED_KEY, a.processed);
      },
    );
    this.touch(session);
  }

  /** @internal */
  async saveSession(session: PracticeSession) {
    session.endTime = Date.now();
    await db.sessions.put(session);
    this.touch(session);
    const { frozenDays, used } = applyFreezes(
      practicedDays(this.sessions),
      settings.value.frozenDays,
      dayKey(Date.now()),
    );
    if (used) await settings.update({ frozenDays });
  }

  /** Update note, next-time reminder or tags of a stored session. */
  async editSession(
    id: string,
    patch: Partial<Pick<PracticeSession, "note" | "nextTime" | "tags">>,
  ) {
    const s = this.sessions.find((x) => x.id === id);
    if (!s) return;
    Object.assign(s, patch);
    await db.sessions.put(s);
    this.touch(s);
  }

  async deleteSession(id: string) {
    await db.sessions.delete(id);
    this.sessions = this.sessions.filter((s) => s.id !== id);
    if (this.#current?.id === id) this.#current = null;
  }

  /** Free practice, jam or song sessions with no graded attempts. */
  async logSession(
    source: SessionSource,
    instrument: Instrument | undefined,
    run: Omit<RunRecord, "id" | "xp">,
    tags: string[] = [],
  ) {
    const s = await this.session(source, instrument);
    s.runs.push({ ...run, id: uid("run"), xp: 0 });
    s.tags = [...new Set([...s.tags, ...tags])];
    await this.saveSession(s);
  }

  private touch(session: PracticeSession) {
    this.sessions = this.sessions.map((s) => (s.id === session.id ? { ...session } : s));
  }

  previousScores(skillIds: string[]): Record<string, number> {
    const out: Record<string, number> = {};
    for (const id of skillIds) {
      let sum = 0;
      let n = 0;
      for (const st of Object.values(this.stats)) {
        if (st.skillId === id) {
          sum += st.scoreSum;
          n += st.attempts;
        }
      }
      if (n) out[id] = sum / n;
    }
    return out;
  }
}

function routineParams(): Record<string, string> {
  const q = page.url.searchParams;
  const routine = q.get("routine");
  return routine ? { routine, step: q.get("step") ?? "" } : {};
}

export class Run {
  readonly id = uid("run");
  readonly startedAt = Date.now();
  events: ScoringEvent[] = [];
  xp = 0;
  #sessionP: Promise<PracticeSession> | null = null;
  #finished = false;
  #heard = false;
  /** Attempts made before anything was heard, with their XP; saved once input arrives. */
  #pending: { event: ScoringEvent; xp: number }[] = [];
  #unsub: (() => void) | null;

  constructor(
    private practice: Practice,
    readonly spec: RunSpec,
  ) {
    // Listen until the first played event; an abandoned silent run lets go on the next one.
    this.#unsub = input.subscribe((e) => {
      if (isPlayed(e)) this.#hear();
    });
  }

  #hear() {
    this.#heard = true;
    this.#unsub?.();
    this.#unsub = null;
  }

  /** The session opens with the first saved attempt, so a silent run never makes one. */
  #session() {
    return (this.#sessionP ??= this.practice.session(
      this.spec.source ?? "drill",
      this.spec.instrument,
    ));
  }

  async #flush() {
    const pending = this.#pending;
    this.#pending = [];
    if (!pending.length) return;
    const session = await this.#session();
    for (const { event, xp } of pending) {
      event.sessionId = session.id;
      this.xp += xp;
      await this.practice.record(session, event, xp);
    }
  }

  async attempt(a: AttemptInput): Promise<ScoringEvent> {
    const skillIds = a.skillIds ?? this.spec.skillIds;
    const difficulty = a.difficulty ?? this.spec.difficulty;
    const event: ScoringEvent = {
      id: uid("ev"),
      sessionId: "",
      runId: this.id,
      exerciseId: this.spec.exerciseId,
      promptId: a.promptId,
      at: Date.now(),
      skillIds,
      capabilities: this.spec.capabilities,
      correct: a.correct,
      partialCredit: Math.max(0, Math.min(1, a.partialCredit)),
      difficulty,
      latencyMs: a.latencyMs,
      modality: this.spec.modality,
      source: a.source,
      instrument: a.instrument === null ? undefined : (a.instrument ?? this.spec.instrument),
      assistance: a.assistance ?? this.spec.assistance,
      metrics: a.metrics ?? [],
      target: a.target,
      response: a.response,
    };
    const improvement = improvementFor(
      skillIds,
      event.partialCredit,
      this.practice.previousScores(skillIds),
    );
    this.events.push(event);
    this.#pending.push({ event, xp: xpForAttempt(event.partialCredit, difficulty, improvement) });
    if (a.heard ?? answered(a)) this.#hear();
    if (this.#heard) await this.#flush();
    return event;
  }

  async finish(f: FinishInput = {}): Promise<FinishResult> {
    const heard = this.#heard || !!f.rated;
    this.#unsub?.();
    this.#unsub = null;
    const score =
      f.score ??
      (this.events.length
        ? this.events.reduce((s, e) => s + e.partialCredit, 0) / this.events.length
        : undefined);
    const run: RunRecord = {
      id: this.id,
      exerciseId: this.spec.exerciseId,
      setupKey: this.spec.setupKey,
      promptIds: this.events.map((e) => e.promptId),
      skillIds: this.spec.skillIds,
      difficulty: this.spec.difficulty,
      instrument: this.spec.instrument,
      params: { ...this.spec.params, ...routineParams(), ...f.params },
      startedAt: this.startedAt,
      endedAt: Date.now(),
      score: heard ? score : undefined,
      correct: heard && (f.correct ?? this.events.every((e) => e.correct)),
      assistance: this.spec.assistance,
      xp: 0,
      headline: f.headline,
    };
    // Nothing heard: nothing scored, nothing saved, no XP (honest evidence).
    if (!heard) {
      this.#pending = [];
      return { run, xp: 0, delta: null, best: false, heard };
    }
    await this.#flush();
    run.xp = this.xp;
    const sessions = this.practice.sessions;
    const previous = lastRunForSetup(sessions, run.exerciseId, run.setupKey, run.startedAt);
    const bestBefore = personalBest(sessions, run.exerciseId, run.setupKey);
    if (!this.#finished) {
      this.#finished = true;
      const session = await this.#session();
      session.runs.push(run);
      await this.practice.saveSession(session);
    }
    const delta =
      previous?.score !== undefined && score !== undefined ? (score - previous.score) * 100 : null;
    const best =
      score !== undefined &&
      !!bestBefore &&
      bestBefore.score !== undefined &&
      score > bestBefore.score;
    return { run, xp: this.xp, delta, best, previous, heard };
  }
}

export const practice = new Practice();
