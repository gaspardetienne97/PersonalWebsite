// Singing along with a recording (Learn by ear): each sung note is checked
// against what the recording sounds at that moment. The app can't pull the
// melody out of a mix, so a sung note counts when its pitch class is among the
// strongest in the recording there: across the melody's range for the tune,
// in the bass band (E1 to E3) for the roots.
import { pc } from "../theory/notes";
import { CHORD_SAMPLE_RATE, noteEnergies, resample } from "./chroma";

export type SingPart = "head" | "roots";

export interface SungNote {
  /** Seconds into the recording. */
  at: number;
  midi: number;
  cents: number;
}

/** Half the window looked at around each sung note, seconds. */
const HALF = 0.25;
const BANDS: Record<SingPart, [lo: number, hi: number, share: number]> = {
  // ponytail: the share of the strongest pitch class a class needs to count; knobs until checked on real records.
  head: [48, 88, 0.5],
  roots: [28, 52, 0.6],
};

/** The pitch classes sounding strongly in the recording around `at` seconds. */
export function recordingPcs(
  mono: Float32Array,
  sampleRate: number,
  at: number,
  part: SingPart,
): number[] {
  const a = Math.max(0, Math.floor((at - HALF) * sampleRate));
  const b = Math.min(mono.length, Math.ceil((at + HALF) * sampleRate));
  if (b - a < sampleRate * 0.05) return [];
  const [lo, hi, share] = BANDS[part];
  const e = noteEnergies(
    resample(mono.subarray(a, b), sampleRate, CHORD_SAMPLE_RATE),
    CHORD_SAMPLE_RATE,
    lo,
    hi,
  );
  const c = Array<number>(12).fill(0);
  e.forEach((v, i) => (c[(lo + i) % 12] += v));
  const max = Math.max(...c);
  return max > 0 ? c.flatMap((v, k) => (v >= share * max ? [k] : [])) : [];
}

export interface SingAlongResult {
  score: number;
  correct: boolean;
  /** Sung notes in tune and matching the recording. */
  right: number;
  /** Sung notes within the tolerance, whatever their pitch class. */
  inTune: number;
  total: number;
  notes: (SungNote & { ok: boolean; heard: number[] })[];
}

/** Fewer sung notes than this is not a run. */
export const MIN_SUNG = 4;

/**
 * Each sung note within `tune` cents whose pitch class the recording sounds then
 * (moved by `shift` semitones when the player shifts the pitch). 75% passes.
 */
export function gradeSingAlong(opts: {
  mono: Float32Array;
  sampleRate: number;
  sung: readonly SungNote[];
  part: SingPart;
  tune?: number;
  shift?: number;
}): SingAlongResult {
  const tune = opts.tune ?? 50;
  const notes = opts.sung.map((n) => {
    const heard = recordingPcs(opts.mono, opts.sampleRate, n.at, opts.part).map((k) =>
      pc(k + (opts.shift ?? 0)),
    );
    return { ...n, heard, ok: Math.abs(n.cents) <= tune && heard.includes(pc(n.midi)) };
  });
  const right = notes.filter((n) => n.ok).length;
  const total = notes.length;
  const score = total >= MIN_SUNG ? right / total : 0;
  return {
    score,
    correct: score >= 0.75,
    right,
    inTune: notes.filter((n) => Math.abs(n.cents) <= tune).length,
    total,
    notes,
  };
}
