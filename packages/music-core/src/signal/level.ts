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

/**
 * A running estimate of the input's noise floor, as the gate the pitch reader
 * should use. The floor is the quietest frame of the last `horizonMs` (kept as
 * one minimum per bucket), and the gate sits `marginDb` over it, held between
 * -80 and -50 dBFS: a silent line input is read down to its faint notes, a
 * laptop microphone in a room is not read at room level, and playing without
 * a pause for the whole horizon can never close the gate on a healthy signal.
 */
export function createNoiseGate({
  marginDb = 9,
  horizonMs = 12000,
  bucketMs = 1500,
  minRms = 1e-4,
  maxRms = 0.01,
} = {}) {
  const margin = 10 ** (marginDb / 20);
  const keep = Math.ceil(horizonMs / bucketMs);
  let buckets: number[] = [];
  let bucketStart = -Infinity;
  return {
    /** Feed one frame's RMS; returns the gate to read that frame with. */
    push(rms: number, at: number): number {
      if (at - bucketStart >= bucketMs || at < bucketStart) {
        buckets.push(rms);
        if (buckets.length > keep) buckets.shift();
        bucketStart = at;
      } else if (rms < buckets[buckets.length - 1]) buckets[buckets.length - 1] = rms;
      let floor = Infinity;
      for (const b of buckets) floor = Math.min(floor, b);
      return Math.min(maxRms, Math.max(minRms, floor * margin));
    },
    reset() {
      buckets = [];
      bucketStart = -Infinity;
    },
  };
}
