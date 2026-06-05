import type { PracticeSession } from "@repo/music-core/domain";

export interface HeatmapCell {
  /** ISO date YYYY-MM-DD (UTC). */
  date: string;
  minutes: number;
  /** 0 = none … 4 = most, for token-based shading. */
  intensity: 0 | 1 | 2 | 3 | 4;
}

function dateKey(ms: number): string {
  const d = new Date(ms);
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(
    d.getUTCDate(),
  ).padStart(2, "0")}`;
}

/**
 * Buckets practice minutes per day into a week-by-week heatmap grid ending on
 * the week containing `today`. Duration comes from `endTime - startTime`.
 */
export function buildJournalHeatmap(
  sessions: PracticeSession[],
  today: Date,
  weeks = 12,
): HeatmapCell[][] {
  const DAY_MS = 86_400_000;
  const todayMs = Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate());
  const todayDow = today.getUTCDay() || 7; // 1=Mon … 7=Sun
  const startMs = todayMs - (todayDow - 1 + (weeks - 1) * 7) * DAY_MS;

  const minutesByDate = new Map<string, number>();
  for (const session of sessions) {
    const start = Number(session.startTime);
    const end = session.endTime != null ? Number(session.endTime) : start;
    const minutes = Math.max(0, Math.round((end - start) / 60_000));
    const key = dateKey(start);
    minutesByDate.set(key, (minutesByDate.get(key) ?? 0) + minutes);
  }

  const cells: HeatmapCell[] = [];
  for (let index = 0; index < weeks * 7; index += 1) {
    const date = dateKey(startMs + index * DAY_MS);
    const minutes = minutesByDate.get(date) ?? 0;
    const intensity: HeatmapCell["intensity"] =
      minutes === 0 ? 0 : minutes < 15 ? 1 : minutes < 30 ? 2 : minutes < 60 ? 3 : 4;
    cells.push({ date, minutes, intensity });
  }

  const grid: HeatmapCell[][] = [];
  for (let week = 0; week < weeks; week += 1) {
    grid.push(cells.slice(week * 7, week * 7 + 7));
  }
  return grid;
}
