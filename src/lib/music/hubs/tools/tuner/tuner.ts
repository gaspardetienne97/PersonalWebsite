// Small pure helpers behind the Tuner views.
import { hzToMidiFloat } from "@repo/music-core";

export const IN_TUNE_CENTS = 5;
export const INTONATION_BAND_CENTS = 10;
export const A4_CHOICES = [
  415, 430, 432, 435, 438, 439, 440, 441, 442, 443, 444, 445, 446,
] as const;

/** The word a player acts on: flat means tune up, sharp means tune down. */
export function direction(cents: number, tol = IN_TUNE_CENTS): "flat" | "sharp" | "in tune" {
  if (cents < -tol) return "flat";
  if (cents > tol) return "sharp";
  return "in tune";
}

/** "+12", "−7", "0": a real minus sign so it reads as signed. */
export function signedCents(cents: number): string {
  const r = Math.round(cents);
  return r > 0 ? `+${r}` : r < 0 ? `−${-r}` : "0";
}

/** Index of the open string closest to `hz` (in cents), or -1 with no strings. */
export function nearestString(hz: number, openStrings: readonly number[], a4 = 440): number {
  const f = hzToMidiFloat(hz, a4);
  let best = -1;
  for (let i = 0; i < openStrings.length; i++)
    if (best < 0 || Math.abs(openStrings[i] - f) < Math.abs(openStrings[best] - f)) best = i;
  return best;
}

/** Degree labels by semitones above the tonic. */
export const DEGREES = ["1", "♭2", "2", "♭3", "3", "4", "♯4", "5", "♭6", "6", "♭7", "7"];
const MAJOR = new Set([0, 2, 4, 5, 7, 9, 11]);
export type DegreeRole = "tonic" | "fifth" | "scale" | "other";
export function degreeRole(semis: number): DegreeRole {
  const s = ((semis % 12) + 12) % 12;
  return s === 0 ? "tonic" : s === 7 ? "fifth" : MAJOR.has(s) ? "scale" : "other";
}

/**
 * SVG path data for a pitch trace: x across the last `windowMs`, y from +50
 * (top) to -50 cents (bottom). A null sample breaks the line (no pitch heard).
 */
export function tracePath(
  trace: readonly { at: number; cents: number | null }[],
  now: number,
  { windowMs = 10000, width = 600, height = 160, range = 50 } = {},
): string {
  let d = "";
  let pen = false;
  for (const s of trace) {
    if (s.cents === null) {
      pen = false;
      continue;
    }
    const x = ((s.at - (now - windowMs)) / windowMs) * width;
    const c = Math.max(-range, Math.min(range, s.cents));
    const y = height / 2 - (c / range) * (height / 2);
    d += `${pen ? "L" : "M"}${x.toFixed(1)} ${y.toFixed(1)}`;
    pen = true;
  }
  return d;
}

/** "B♭", "F♯": note names with real accidentals. */
export const pretty = (name: string) => name.replace("b", "♭").replace("#", "♯");

/**
 * Distance from a chosen target note, in whichever octave you are nearest
 * (so you can sing or play it in your own register). `pc` is 0..11.
 */
export function centsToTarget(
  hz: number,
  pc: number,
  a4 = 440,
): { targetMidi: number; cents: number } {
  const f = hzToMidiFloat(hz, a4);
  const targetMidi = pc + 12 * Math.round((f - pc) / 12);
  return { targetMidi, cents: (f - targetMidi) * 100 };
}

/**
 * SVG path for a scope trace. Starts at the first rising zero crossing so a
 * steady tone stands still, and scales to the loudest sample shown.
 */
export function scopePath(
  buf: Float32Array,
  { width = 600, height = 160, samples = 1024 } = {},
): string {
  let start = 0;
  for (let i = 1; i < buf.length - samples; i++)
    if (buf[i - 1] < 0 && buf[i] >= 0) {
      start = i;
      break;
    }
  const n = Math.min(samples, buf.length - start);
  let peak = 0.05;
  for (let i = 0; i < n; i++) peak = Math.max(peak, Math.abs(buf[start + i]));
  let d = "";
  for (let i = 0; i < n; i++) {
    const x = (i / (n - 1)) * width;
    const y = height / 2 - (buf[start + i] / peak) * (height / 2 - 6);
    d += `${i ? "L" : "M"}${x.toFixed(1)} ${y.toFixed(1)}`;
  }
  return d;
}
