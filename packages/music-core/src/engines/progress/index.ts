import type { ScoringEvent, SkillMastery } from "@repo/music-core/domain";
import type { PracticeStore } from "@repo/music-core/engines/store";

export interface ProgressState {
  xp: number;
  level: number;
  streakDays: number;
  streakFreezes: number;
  practicedDays: string[];
  frozenDays: string[];
  achievements: string[];
  lastScores: Record<string, number>;
  processedEventIds: string[];
}

export interface SkillMasteryReader {
  getMastery(skillId: string): SkillMastery;
}

const PROGRESS_STATE_ID = "progress.state.v1";

export class ProgressEngine {
  #state = initialProgressState();
  #loaded = false;
  #operationQueue: Promise<void> = Promise.resolve();

  constructor(private readonly store?: PracticeStore) {}

  get state(): ProgressState {
    return structuredClone(this.#state);
  }

  load(): Promise<void> {
    return this.#enqueue(() => this.#load());
  }

  ingest(event: ScoringEvent, mastery?: SkillMasteryReader): Promise<number> {
    let awarded = 0;
    return this.#enqueue(async () => {
      await this.#load();
      if (this.#state.processedEventIds.includes(event.id)) return;

      const improvement = improvementFor(event, this.#state.lastScores);
      awarded = Math.round(
        10 + event.partialCredit * 30 + event.difficulty * 20 + improvement * 25,
      );
      this.#state.xp += awarded;
      this.#state.level = Math.max(1, Math.floor(this.#state.xp / 250) + 1);
      this.#state.processedEventIds.push(event.id);
      for (const skillId of new Set(event.skillIds)) {
        this.#state.lastScores[skillId] = event.partialCredit;
      }

      this.#markPracticeDay(event.at);
      this.#unlockAchievements(event, mastery);
      await this.#persist();
    }).then(() => awarded);
  }

  grantStreakFreeze(count = 1): Promise<void> {
    return this.#enqueue(async () => {
      await this.#load();
      this.#state.streakFreezes += Math.max(0, Math.floor(count));
      await this.#persist();
    });
  }

  async #load(): Promise<void> {
    if (this.#loaded) return;

    if (this.store) {
      const saved = await this.store.settings.get(PROGRESS_STATE_ID);
      if (saved) this.#state = normalizeProgressState(saved.value);
    }
    this.#loaded = true;
  }

  #markPracticeDay(at: number): void {
    const day = utcDay(at);
    if (this.#state.practicedDays.includes(day)) return;

    const latest = this.#state.practicedDays.at(-1);
    if (latest !== undefined && day > latest) {
      const missingDays = daysBetween(latest, day);
      if (missingDays.length > 0 && missingDays.length <= this.#state.streakFreezes) {
        this.#state.streakFreezes -= missingDays.length;
        this.#state.frozenDays.push(...missingDays);
        unlock(this.#state, "first-freeze-save");
      }
    }

    this.#state.practicedDays.push(day);
    this.#state.practicedDays = sortedUnique(this.#state.practicedDays);
    this.#state.frozenDays = sortedUnique(this.#state.frozenDays);
    this.#state.streakDays = calculateCurrentStreak(
      this.#state.practicedDays,
      this.#state.frozenDays,
    );
  }

  #unlockAchievements(event: ScoringEvent, mastery?: SkillMasteryReader): void {
    if (this.#state.xp >= 100) unlock(this.#state, "first-100-xp");
    if (this.#state.level >= 5) unlock(this.#state, "level-5");
    if (this.#state.streakDays >= 7) unlock(this.#state, "seven-day-streak");

    if (!mastery) return;
    const touchedMastery = [...new Set(event.skillIds)].map(
      (skillId) => mastery.getMastery(skillId).mastery,
    );
    if (touchedMastery.some((value) => value >= 0.5)) unlock(this.#state, "first-skill-50");
    if (touchedMastery.some((value) => value >= 0.8)) unlock(this.#state, "first-skill-mastered");
  }

  async #persist(): Promise<void> {
    if (!this.store) return;
    await this.store.settings.put({ id: PROGRESS_STATE_ID, value: this.#state });
  }

  #enqueue<T>(operation: () => Promise<T>): Promise<T> {
    const result = this.#operationQueue.then(operation, operation);
    this.#operationQueue = result.then(
      () => undefined,
      () => undefined,
    );
    return result;
  }
}

export function calculateCurrentStreak(days: string[], frozenDays: string[] = []): number {
  const allDays = sortedUnique([...days, ...frozenDays]);
  if (allDays.length === 0) return 0;

  let streak = 1;
  for (let index = allDays.length - 1; index > 0; index -= 1) {
    if (dayNumber(allDays[index]!) - dayNumber(allDays[index - 1]!) === 1) streak += 1;
    else break;
  }
  return streak;
}

function improvementFor(event: ScoringEvent, lastScores: Record<string, number>): number {
  return Math.max(
    0,
    ...event.skillIds.map((skillId) => {
      const previous = lastScores[skillId];
      return previous === undefined ? 0 : event.partialCredit - previous;
    }),
  );
}

function daysBetween(start: string, end: string): string[] {
  const days: string[] = [];
  for (let day = dayNumber(start) + 1; day < dayNumber(end); day += 1) {
    days.push(new Date(day * DAY_MS).toISOString().slice(0, 10));
  }
  return days;
}

function dayNumber(day: string): number {
  return Math.floor(Date.parse(`${day}T00:00:00.000Z`) / DAY_MS);
}

function utcDay(at: number): string {
  return new Date(at).toISOString().slice(0, 10);
}

function sortedUnique(values: string[]): string[] {
  return [...new Set(values)].sort();
}

function unlock(state: ProgressState, achievement: string): void {
  if (!state.achievements.includes(achievement)) state.achievements.push(achievement);
}

function initialProgressState(): ProgressState {
  return {
    xp: 0,
    level: 1,
    streakDays: 0,
    streakFreezes: 0,
    practicedDays: [],
    frozenDays: [],
    achievements: [],
    lastScores: {},
    processedEventIds: [],
  };
}

function normalizeProgressState(value: unknown): ProgressState {
  if (!isRecord(value)) return initialProgressState();
  const initial = initialProgressState();
  return {
    xp: numberOr(value.xp, initial.xp),
    level: numberOr(value.level, initial.level),
    streakDays: numberOr(value.streakDays, initial.streakDays),
    streakFreezes: numberOr(value.streakFreezes, initial.streakFreezes),
    practicedDays: stringArrayOr(value.practicedDays, initial.practicedDays),
    frozenDays: stringArrayOr(value.frozenDays, initial.frozenDays),
    achievements: stringArrayOr(value.achievements, initial.achievements),
    lastScores: numberRecordOr(value.lastScores, initial.lastScores),
    processedEventIds: stringArrayOr(value.processedEventIds, initial.processedEventIds),
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function numberOr(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function stringArrayOr(value: unknown, fallback: string[]): string[] {
  return Array.isArray(value) && value.every((item) => typeof item === "string")
    ? [...value]
    : fallback;
}

function numberRecordOr(value: unknown, fallback: Record<string, number>): Record<string, number> {
  if (!isRecord(value)) return fallback;
  const entries = Object.entries(value).filter((entry): entry is [string, number] => {
    return typeof entry[1] === "number" && Number.isFinite(entry[1]);
  });
  return Object.fromEntries(entries);
}

const DAY_MS = 86_400_000;
