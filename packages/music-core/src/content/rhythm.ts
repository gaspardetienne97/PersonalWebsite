// Rhythm patterns expanded to timed targets; pulse targets for tap-the-beat.

import { RHYTHM_PATTERNS, type RhythmPatternDef } from "../data";
import { clamp } from "../theory/notes";

export { RHYTHM_PATTERNS };
export const RHYTHM_DEFAULTS = {
  bpm: 100,
  beats: 4,
  patternId: "quarter-pulse",
  mode: "pulse" as const,
};
export const RHYTHM_LIMITS = { bpm: [40, 220] as const, beats: [2, 16] as const };

export const rhythmPattern = (id: string): RhythmPatternDef | undefined =>
  RHYTHM_PATTERNS.find((p) => p.id === id);
export const beatMs = (bpm: number) => 60000 / bpm;

const PATTERN_SKILLS: Record<string, string[]> = {
  "quarter-pulse": ["rhythm.quarter-pulse"],
  eighths: ["rhythm.eighths", "rhythm.subdivision.eighths"],
  sixteenths: ["rhythm.sixteenths", "rhythm.subdivision.sixteenths"],
  "eighth-rests": ["rhythm.subdivision.eighths"],
  triplets: ["rhythm.triplets"],
  "off-beats": ["rhythm.syncopation"],
  "dotted-quarters": ["rhythm.dotted"],
  "swing-eighths": ["rhythm.swing"],
  "gap-click-1-on-1-off": ["rhythm.gap-click"],
  "guitar-four-on-the-floor": ["rhythm.pattern.guitar-four-on-the-floor"],
  "guitar-island-strum": ["rhythm.pattern.guitar-island-strum"],
};
/** Skills a pattern (or "pulse") exercises. */
export const rhythmSkills = (patternId: string | "pulse") => [
  "rhythm.subdivisions",
  ...(PATTERN_SKILLS[patternId === "pulse" ? "quarter-pulse" : patternId] ?? []),
];

export interface RhythmTarget {
  id: string;
  beat: number;
  bar: number;
  atMs: number;
  accent: boolean;
  stroke?: "down" | "up" | "mute";
  durationMs?: number;
  /** Chord symbol sounding at this onset, when the pattern carries chords. */
  chord?: string;
}

export interface RhythmPlan {
  patternId: string;
  bpm: number;
  bars: number;
  beatMs: number;
  lengthMs: number;
  events: RhythmTarget[];
  /** A tap inside a rest window is a penalty, never credit for a neighbour. */
  rests: { startMs: number; endMs: number }[];
  chords: { symbol: string; pitchClasses: number[]; startMs: number; endMs: number }[];
  clicks: { atMs: number; audible: boolean; downbeat: boolean }[];
  /** Half the pattern's smallest event spacing. */
  matchWindowMs: number;
}

/**
 * Expand a pattern over `bars` (default: its own length). Longer runs repeat the
 * pattern's cycle; a shorter run truncates it. Times are ms from the first downbeat.
 */
export function expandRhythm(
  pattern: RhythmPatternDef,
  opts: { bpm: number; bars?: number },
): RhythmPlan {
  const bpm = clamp(opts.bpm, RHYTHM_LIMITS.bpm[0], RHYTHM_LIMITS.bpm[1]);
  const bars = Math.max(1, Math.round(opts.bars ?? pattern.defaultBars));
  const perBar = pattern.meter.beats;
  const cycle = pattern.defaultBars * perBar;
  const total = bars * perBar;
  const ms = beatMs(bpm);
  const cycles = Array.from({ length: Math.ceil(total / cycle) }, (_, c) => c);

  const chords = cycles.flatMap((c) =>
    (pattern.chords ?? [])
      .filter((ch) => c * cycle + ch.startBeat < total)
      .map((ch) => ({
        symbol: ch.symbol,
        pitchClasses: ch.pitchClasses,
        startMs: (c * cycle + ch.startBeat) * ms,
        endMs: Math.min(total, c * cycle + ch.startBeat + ch.durationBeats) * ms,
      })),
  );
  const events = cycles.flatMap((c) =>
    pattern.events
      .map((e) => ({ e, beat: c * cycle + e.beat }))
      .filter(({ beat }) => beat < total)
      .map(({ e, beat }): RhythmTarget => {
        const atMs = beat * ms;
        return {
          id: c === 0 ? e.id : `${e.id}#${c}`,
          beat,
          bar: Math.floor(beat / perBar),
          atMs,
          accent: e.accent === "accent",
          ...(e.stroke ? { stroke: e.stroke } : {}),
          ...(e.durationBeats ? { durationMs: e.durationBeats * ms } : {}),
          ...(pattern.chords
            ? { chord: chords.find((ch) => atMs >= ch.startMs && atMs < ch.endMs)?.symbol }
            : {}),
        };
      }),
  );
  const rests = cycles.flatMap((c) =>
    pattern.rests
      .filter((r) => c * cycle + r.startBeat < total)
      .map((r) => ({
        startMs: (c * cycle + r.startBeat) * ms,
        endMs: (c * cycle + r.endBeat) * ms,
      })),
  );
  const clicks = Array.from({ length: total }, (_, b) => {
    const bar = Math.floor(b / perBar);
    const rule = pattern.clickSchedule?.find((s) => s.bar === bar % pattern.defaultBars);
    return { atMs: b * ms, audible: rule?.audible ?? true, downbeat: b % perBar === 0 };
  });
  const beats = [...new Set(events.map((e) => e.beat))].sort((a, b) => a - b);
  const spacing = Math.min(...beats.slice(1).map((b, i) => b - beats[i]), perBar);
  return {
    patternId: pattern.id,
    bpm,
    bars,
    beatMs: ms,
    lengthMs: total * ms,
    events,
    rests,
    chords,
    clicks,
    matchWindowMs: (spacing * ms) / 2,
  };
}

/** Tap-the-beat targets: one per beat, `beats` clamped 2..16. */
export function pulseTargets(beats: number, bpm: number): number[] {
  const n = clamp(Math.round(beats), RHYTHM_LIMITS.beats[0], RHYTHM_LIMITS.beats[1]);
  const ms = beatMs(clamp(bpm, RHYTHM_LIMITS.bpm[0], RHYTHM_LIMITS.bpm[1]));
  return Array.from({ length: n }, (_, i) => i * ms);
}
