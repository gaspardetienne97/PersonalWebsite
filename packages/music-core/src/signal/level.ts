// Input meter numbers (catalog 4.12): floor -60 dB, advice bands at -1 / -6 / -30 dB.
export const LEVEL_FLOOR_DB = -60;

const toDb = (v: number) => (v > 0 ? Math.max(LEVEL_FLOOR_DB, 20 * Math.log10(v)) : LEVEL_FLOOR_DB);

export function rmsDb(buf: Float32Array): number {
  let s = 0;
  for (let i = 0; i < buf.length; i++) s += buf[i] * buf[i];
  return toDb(buf.length ? Math.sqrt(s / buf.length) : 0);
}

export function peakDb(buf: Float32Array): number {
  let p = 0;
  for (let i = 0; i < buf.length; i++) p = Math.max(p, Math.abs(buf[i]));
  return toDb(p);
}

export type LevelTone = "clipping" | "hot" | "good" | "quiet";

export function levelAdvice(db: number): { tone: LevelTone; label: string } {
  if (db >= -1) return { tone: "clipping", label: "Clipping" };
  if (db >= -6) return { tone: "hot", label: "A little hot" };
  if (db >= -30) return { tone: "good", label: "Good level" };
  return { tone: "quiet", label: "Quiet" };
}
