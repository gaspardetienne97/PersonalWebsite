import type { ScoringEvent } from "@repo/music-core/domain";

export interface ProgressState {
  xp: number;
  level: number;
  streakDays: number;
  practicedDays: string[];
  achievements: string[];
}

export class ProgressEngine {
  state: ProgressState = {
    xp: 0,
    level: 1,
    streakDays: 0,
    practicedDays: [],
    achievements: [],
  };

  ingest(event: ScoringEvent): number {
    const awarded = Math.round(10 + event.partialCredit * 30 + event.difficulty * 20);
    this.state.xp += awarded;
    this.state.level = Math.max(1, Math.floor(this.state.xp / 250) + 1);
    this.markPracticeDay(event.at);
    if (this.state.xp >= 100 && !this.state.achievements.includes("first-100-xp")) {
      this.state.achievements.push("first-100-xp");
    }
    return awarded;
  }

  markPracticeDay(at: number): void {
    const day = new Date(at).toISOString().slice(0, 10);
    if (!this.state.practicedDays.includes(day)) this.state.practicedDays.push(day);
    this.state.practicedDays.sort();
    this.state.streakDays = calculateCurrentStreak(this.state.practicedDays);
  }
}

export function calculateCurrentStreak(days: string[]): number {
  if (days.length === 0) return 0;
  let streak = 1;
  for (let index = days.length - 1; index > 0; index -= 1) {
    const current = Date.parse(`${days[index]}T00:00:00.000Z`);
    const previous = Date.parse(`${days[index - 1]}T00:00:00.000Z`);
    if (current - previous === 86_400_000) streak += 1;
    else break;
  }
  return streak;
}
