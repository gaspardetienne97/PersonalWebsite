// Rhythm patterns expanded to timed targets; pulse targets for tap-the-beat.

import { RHYTHM_PATTERNS as VERIFIED_PATTERNS, type RhythmPatternDef } from "../data";
import { clamp } from "../theory/notes";
import { STRUM_PATTERNS } from "./strums";
import { m } from "@repo/i18n/messages.js";

/** The verified patterns (data/rhythm-patterns.json), then the strums written in strums.ts. */
export const RHYTHM_PATTERNS: RhythmPatternDef[] = [...VERIFIED_PATTERNS, ...STRUM_PATTERNS];
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
  "guitar-old-faithful": ["technique.strumming"],
  "ukulele-island-strum": ["technique.strumming"],
  "ukulele-chuck": ["technique.strumming"],
  ...Object.fromEntries(STRUM_PATTERNS.map((p) => [p.id, ["technique.strumming"]])),
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

// ---------------------------------------------------------------------------
// Rhythm by ear: patterns made from one-beat and two-beat cells, a level at a time.

/**
 * Onsets in beats from the cell's start; a rest cell has none and is drawn as
 * a rest. `written` is where a swung cell's notes are written (straight eighths).
 * In 6/8 a beat is a dotted quarter, so "triplet" is three eighths there.
 */
export const RHYTHM_CELLS: Record<
  string,
  { beats: number; onsets: readonly number[]; written?: readonly number[] }
> = {
  quarter: { beats: 1, onsets: [0] },
  eighths: { beats: 1, onsets: [0, 0.5] },
  rest: { beats: 1, onsets: [] },
  half: { beats: 2, onsets: [0] },
  "dotted-quarter": { beats: 2, onsets: [0, 1.5] },
  sixteenths: { beats: 1, onsets: [0, 0.25, 0.5, 0.75] },
  "eighth-sixteenths": { beats: 1, onsets: [0, 0.5, 0.75] },
  "sixteenths-eighth": { beats: 1, onsets: [0, 0.25, 0.5] },
  syncopation: { beats: 2, onsets: [0, 0.5, 1.5] },
  triplet: { beats: 1, onsets: [0, 1 / 3, 2 / 3] },
  "dotted-eighth": { beats: 1, onsets: [0, 0.75] },
  // 6/8: quarter-eighth and eighth-quarter inside a dotted-quarter beat.
  "long-short": { beats: 1, onsets: [0, 2 / 3] },
  "short-long": { beats: 1, onsets: [0, 1 / 3] },
  // Swing: two eighths played long-short, written straight.
  swing: { beats: 1, onsets: [0, 2 / 3], written: [0, 0.5] },
};
export type RhythmCell = keyof typeof RHYTHM_CELLS & string;

/**
 * Levels in the order the research suggests (Kodály, Gordon, Karpinski):
 * quarters and eighths, rests and halves, dotted quarters, 6/8, sixteenths,
 * syncopation and triplets, dotted eighth-sixteenths, swing.
 */
export const EAR_RHYTHM_LEVELS: {
  id: string;
  title: string;
  bars: number;
  cells: RhythmCell[];
  /** The grid a dictation answer is written on, in cells per beat. */
  perBeat: 2 | 3 | 4;
  /** Beats in a bar: 4 in 4/4, 2 dotted quarters in 6/8. */
  beatsPerBar: 2 | 4;
}[] = [
  {
    id: "quarters-eighths",
    title: m.music_rep_rhythm_ear_quarters_eighths(),
    bars: 1,
    cells: ["quarter", "eighths"],
    perBeat: 2,
    beatsPerBar: 4,
  },
  {
    id: "rests-halves",
    title: m.music_rep_rhythm_ear_rests_halves(),
    bars: 2,
    cells: ["quarter", "eighths", "rest", "half"],
    perBeat: 2,
    beatsPerBar: 4,
  },
  {
    id: "dotted",
    title: m.music_rep_rhythm_ear_dotted(),
    bars: 2,
    cells: ["quarter", "eighths", "rest", "half", "dotted-quarter"],
    perBeat: 2,
    beatsPerBar: 4,
  },
  {
    id: "compound",
    title: m.music_rep_rhythm_ear_compound(),
    bars: 2,
    cells: ["quarter", "triplet", "long-short", "short-long", "rest", "half"],
    perBeat: 3,
    beatsPerBar: 2,
  },
  {
    id: "sixteenths",
    title: m.music_rep_rhythm_ear_sixteenths(),
    bars: 2,
    cells: ["quarter", "eighths", "rest", "sixteenths", "eighth-sixteenths", "sixteenths-eighth"],
    perBeat: 4,
    beatsPerBar: 4,
  },
  {
    id: "syncopation",
    title: m.music_rep_rhythm_ear_syncopation(),
    bars: 2,
    cells: ["quarter", "eighths", "rest", "sixteenths", "syncopation", "triplet"],
    perBeat: 4,
    beatsPerBar: 4,
  },
  {
    id: "dotted-sixteenths",
    title: m.music_rep_rhythm_ear_dotted_sixteenths(),
    bars: 2,
    cells: ["quarter", "eighths", "rest", "sixteenths", "syncopation", "dotted-eighth"],
    perBeat: 4,
    beatsPerBar: 4,
  },
  {
    id: "swing",
    title: m.music_rep_rhythm_ear_swing(),
    bars: 2,
    cells: ["quarter", "swing", "rest", "half"],
    perBeat: 2,
    beatsPerBar: 4,
  },
];

/**
 * A random pattern from a level's cells: never a rest on beat 1 or two rests
 * in a row. Dictation leaves out cells its grid cannot write (triplets on an
 * eighth or sixteenth grid). `written` is each onset as written (swing is
 * written straight); `events` are where they sound.
 */
export function earRhythmPattern(
  rand: () => number,
  levelId: string,
  opts: { dictation?: boolean } = {},
): RhythmPatternDef & { cells: RhythmCell[]; written: number[] } {
  const level = EAR_RHYTHM_LEVELS.find((l) => l.id === levelId) ?? EAR_RHYTHM_LEVELS[0];
  const perBar = level.beatsPerBar;
  const total = level.bars * perBar;
  const onGrid = (c: RhythmCell) =>
    (RHYTHM_CELLS[c].written ?? RHYTHM_CELLS[c].onsets).every(
      (o) => Math.abs(o * level.perBeat - Math.round(o * level.perBeat)) < 1e-6,
    );
  const usable = level.cells.filter((c) => !opts.dictation || onGrid(c));
  const cells: RhythmCell[] = [];
  let at = 0;
  while (at < total) {
    const fits = usable.filter(
      (c) =>
        RHYTHM_CELLS[c].beats <= total - at &&
        // A two-beat cell stays inside its bar.
        Math.floor(at / perBar) === Math.floor((at + RHYTHM_CELLS[c].beats - 1) / perBar) &&
        !(c === "rest" && (at === 0 || cells.at(-1) === "rest")),
    );
    const c = fits[Math.floor(rand() * fits.length)] ?? "quarter";
    cells.push(c);
    at += RHYTHM_CELLS[c].beats;
  }
  const onsets: number[] = [];
  const written: number[] = [];
  const rests: { startBeat: number; endBeat: number }[] = [];
  at = 0;
  for (const c of cells) {
    if (c === "rest") rests.push({ startBeat: at, endBeat: at + 1 });
    const cell = RHYTHM_CELLS[c];
    cell.onsets.forEach((o, k) => {
      onsets.push(at + o);
      written.push(at + (cell.written ?? cell.onsets)[k]);
    });
    at += cell.beats;
  }
  // A note lasts until the next onset, a rest, or the end.
  const ends = [...onsets.slice(1), ...rests.map((r) => r.startBeat), total];
  return {
    id: `ear-rhythm-${level.id}-${cells.join("_")}`,
    label: level.title,
    meter: { beats: perBar, beatUnit: 4 },
    defaultBars: level.bars,
    events: onsets.map((beat, i) => ({
      id: `e${i}`,
      beat,
      voice: "tap" as const,
      accent: beat % perBar === 0 ? ("accent" as const) : ("normal" as const),
      durationBeats: Math.min(...ends.filter((e) => e > beat + 1e-6)) - beat,
    })),
    rests,
    cells,
    written,
  };
}

// ---------------------------------------------------------------------------
// Groove dictation: a drum groove heard, then written on kick, snare and hat rows.

export type GrooveLane = "hat" | "snare" | "kick";
/** Top to bottom as a drum grid shows them, with the General MIDI drum each plays. */
export const GROOVE_LANES: { id: GrooveLane; label: string; midi: number }[] = [
  { id: "hat", label: m.music_rep_rhythm_lane_hat(), midi: 42 },
  { id: "snare", label: m.music_rep_rhythm_lane_snare(), midi: 38 },
  { id: "kick", label: m.music_rep_rhythm_lane_kick(), midi: 36 },
];
/** Rock beats first, then kicks off the beat, then sixteenth kicks and ghost snares. */
export const GROOVE_LEVELS: { id: string; title: string; bars: number; perBeat: 2 | 4 }[] = [
  { id: "rock", title: m.music_rep_rhythm_groove_rock(), bars: 1, perBeat: 2 },
  { id: "offbeats", title: m.music_rep_rhythm_groove_offbeats(), bars: 2, perBeat: 2 },
  { id: "sixteenths", title: m.music_rep_rhythm_groove_sixteenths(), bars: 2, perBeat: 4 },
  { id: "trap", title: m.music_rep_rhythm_groove_trap(), bars: 2, perBeat: 4 },
];
const KICKS: Record<string, number[][]> = {
  rock: [
    [0, 2],
    [0, 2.5],
    [0, 1.5, 2],
    [0, 2, 2.5],
    [0, 0.5, 2],
    [0, 2, 3.5],
  ],
  offbeats: [
    [0, 1.5, 2.5],
    [0, 0.5, 2.5],
    [0, 1.5, 3.5],
    [0, 2.5, 3],
    [0, 2, 3.5],
    [0, 0.5, 1.5, 2.5],
  ],
  sixteenths: [
    [0, 0.75, 2],
    [0, 1.75, 2.5],
    [0, 2, 2.75],
    [0, 0.75, 2.5, 3.25],
    [0, 1.5, 2.75],
  ],
  // Trap is half time: the snare (clap) on 3, the 808 placed around it.
  trap: [
    [0, 1.75, 2.5],
    [0, 0.75, 3.5],
    [0, 1.5, 2.75],
    [0, 0.75, 1.5, 3.25],
    [0, 2.5, 3.5],
    [0, 0.5, 1.75, 3],
  ],
};

export interface Groove {
  id: string;
  level: string;
  bars: number;
  perBeat: 2 | 4;
  /** Onsets in beats from the first downbeat, per lane. */
  lanes: Record<GrooveLane, number[]>;
}

/** A groove for a level: snare on 2 and 4, hats on eighths (or sixteenths), a kick pattern each bar. */
export function earGroove(rand: () => number, levelId: string): Groove {
  const level = GROOVE_LEVELS.find((l) => l.id === levelId) ?? GROOVE_LEVELS[0];
  const pickOf = <T>(xs: T[]) => xs[Math.floor(rand() * xs.length)];
  const kicks = level.id === "rock" ? KICKS.rock : [...KICKS.rock, ...KICKS[level.id]];
  const sixteenthHats = level.perBeat === 4 && rand() < 0.5;
  const lanes: Record<GrooveLane, number[]> = { hat: [], snare: [], kick: [] };
  for (let bar = 0; bar < level.bars; bar++) {
    const at = bar * 4;
    // The second bar of a pair answers the first with a different kick.
    const kick =
      level.id !== "rock" && bar === 1
        ? pickOf(KICKS[level.id])
        : pickOf(level.id === "trap" ? KICKS.trap : kicks);
    lanes.kick.push(...kick.map((b) => at + b));
    if (level.id === "trap") {
      lanes.snare.push(at + 2);
      // Sometimes a late snare at the end of the second bar, as trap hooks do.
      if (bar === 1 && rand() < 0.5) lanes.snare.push(at + 3.75);
    } else lanes.snare.push(at + 1, at + 3);
    if (level.perBeat === 4 && level.id !== "trap" && rand() < 0.6)
      lanes.snare.push(at + pickOf([1.75, 2.75, 3.25, 3.75]));
    const step = sixteenthHats ? 0.25 : 0.5;
    for (let b = 0; b < 4; b += step) lanes.hat.push(at + b);
  }
  for (const k of Object.keys(lanes) as GrooveLane[])
    lanes[k] = [...new Set(lanes[k])].sort((a, b) => a - b);
  return {
    id: `groove-${level.id}-${(["kick", "snare", "hat"] as const).map((k) => lanes[k].join("_")).join("-")}`,
    level: level.id,
    bars: level.bars,
    perBeat: level.perBeat,
    lanes,
  };
}

/** The groove as one rhythm (every hit, any lane), for its length, grid and click. */
export function grooveAsPattern(g: Groove): RhythmPatternDef & { written: number[] } {
  const onsets = [...new Set(Object.values(g.lanes).flat())].sort((a, b) => a - b);
  return {
    id: g.id,
    label:
      GROOVE_LEVELS.find((l) => l.id === g.level)?.title ?? m.music_rep_rhythm_groove_fallback(),
    meter: { beats: 4, beatUnit: 4 },
    defaultBars: g.bars,
    events: onsets.map((beat, i) => ({
      id: `e${i}`,
      beat,
      voice: "tap" as const,
      accent: beat % 4 === 0 ? ("accent" as const) : ("normal" as const),
    })),
    rests: [],
    written: onsets,
  };
}

/** Each lane's onsets as one list, kept apart by lane (100 beats each), for gradeOnsets. */
export const grooveKeys = (lanes: Partial<Record<GrooveLane, number[]>>) =>
  GROOVE_LANES.flatMap((l, i) => (lanes[l.id] ?? []).map((b) => i * 100 + b));
