// A strum pattern's bar as a row of slots ("1 & 2 & 3 & 4 &"), and each heard
// strum judged against the stroke it was nearest: on time, early or late by so
// many ms, or missed. Pure, so the strum page and its tests share it.
import { timingBreakdown } from "@repo/music-core";
import { m } from "@repo/i18n/messages.js";

export type Stroke = "down" | "up" | "mute";
export interface SlotStroke {
  beat: number;
  stroke?: Stroke;
  accent?: boolean;
}
export interface Slot {
  /** The count spoken on this slot: "1", "&", "e", "a" (blank between triplet-and-eighth subdivisions). */
  count: string;
  stroke?: Stroke;
  accent: boolean;
}

/** The finest grid the bar needs, eighths at the coarsest (so empty "&"s show where the hand passes). */
export function slotStep(beats: readonly number[]): number {
  const fits = (step: number) =>
    beats.every((b) => Math.abs(b / step - Math.round(b / step)) < 0.02);
  return [0.5, 1 / 3, 0.25, 1 / 6].find(fits) ?? 1 / 12;
}

const COUNTS: Record<number, string[]> = {
  2: ["", "&"],
  3: ["", "&", "a"],
  4: ["", "e", "&", "a"],
};

/** One bar of strokes (beats from the bar's start) as slots. */
export function strumSlots(
  strokes: readonly SlotStroke[],
  beatsPerBar = 4,
): { step: number; slots: Slot[] } {
  const step = slotStep(strokes.map((s) => s.beat));
  const per = Math.round(1 / step);
  const slots: Slot[] = Array.from({ length: Math.round(beatsPerBar * per) }, (_, i) => ({
    count: i % per === 0 ? String(i / per + 1) : (COUNTS[per]?.[i % per] ?? ""),
    accent: false,
  }));
  for (const s of strokes) {
    const slot = slots[Math.round(s.beat / step)];
    if (slot) Object.assign(slot, { stroke: s.stroke ?? "down", accent: !!s.accent });
  }
  return { step, slots };
}

/** The slot sounding at `beat` (from the chart's downbeat), or null before the first beat. */
export function slotAt(beat: number | null, step: number, beatsPerBar = 4): number | null {
  if (beat === null || beat < 0) return null;
  return Math.floor((beat % beatsPerBar) / step + 1e-6);
}

export type StrokeVerdict = { kind: "ontime" | "early" | "late"; text: string };

/** A strum `offMs` from its stroke: on time within `onTimeMs`, else early or late by the signed ms. */
export function strokeVerdict(offMs: number, onTimeMs: number): StrokeVerdict {
  const ms = Math.round(offMs);
  if (Math.abs(ms) <= onTimeMs) return { kind: "ontime", text: m.music_strings_on_time() };
  return ms < 0
    ? { kind: "early", text: m.music_strings_early_ms({ ms: -ms }) }
    : { kind: "late", text: m.music_strings_late_ms({ ms }) };
}

/**
 * Each target stroke (perf ms) paired with the nearest heard strum within half a beat, one strum per
 * stroke: its offset, or undefined when none came. The strum's tones are judged elsewhere.
 */
export function pairStrums(
  targets: readonly number[],
  heard: readonly number[],
  beatMs: number,
): (number | undefined)[] {
  const out: (number | undefined)[] = targets.map(() => undefined);
  for (const at of heard) {
    let best = -1;
    for (let k = 0; k < targets.length; k++)
      if (best < 0 || Math.abs(at - targets[k]) < Math.abs(at - targets[best])) best = k;
    if (best < 0 || Math.abs(at - targets[best]) >= beatMs / 2 || out[best] !== undefined) continue;
    out[best] = at - targets[best];
  }
  return out;
}

/** The run's strokes as on time, early, late and missed counts: the shared breakdown (K3), so lanes and results agree. */
export const timingCounts = (offsets: readonly (number | undefined)[], onTimeMs: number) =>
  timingBreakdown(offsets, onTimeMs);

/**
 * The run's score on its expected strums: the share that landed on time on their chord (a hit's offset within
 * `onTimeMs`); "wrong" (not on the chord, by onChord) or any other word, and undefined (no strum), count against it.
 */
export function strumScore(hits: readonly (number | string | undefined)[], onTimeMs: number) {
  const landed = hits.filter((h) => typeof h === "number" && Math.abs(h) <= onTimeMs).length;
  return { landed, total: hits.length, score: hits.length ? landed / hits.length : 0 };
}

/**
 * Every expected strum in one of the five places the bar grid marks it: on time, early or late on its chord,
 * on the wrong chord (whatever its timing), or missed. They add up to the total, and `ontime` is the score's count.
 */
export function strokeTally(hits: readonly (number | string | undefined)[], onTimeMs: number) {
  const out = { ontime: 0, early: 0, late: 0, wrong: 0, miss: 0 };
  for (const h of hits)
    out[
      h === undefined ? "miss" : typeof h === "number" ? strokeVerdict(h, onTimeMs).kind : "wrong"
    ]++;
  return out;
}
