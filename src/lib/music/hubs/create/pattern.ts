// The beat grid's pattern: 16 sixteenth-note steps per bar, one or more bars,
// rows keyed by MIDI note so a row plays the kit pad with that note, or the
// synth kit. Pure.
import { DRUM_KITS, MPC_GROOVES } from "@repo/music-core/data/index";
import type { SequenceNote } from "$lib/music/runtime/audio.svelte";

export const STEPS = 16;
export const PATTERNS_KEY = "music.beat-patterns";
export const DRAFT_KEY = "music.beat-draft";

export interface BeatRow {
  midi: number;
  name: string;
}
export interface BeatPattern {
  id: string;
  name: string;
  bpm: number;
  /** Length in bars (older patterns without it are one bar). */
  bars?: number;
  /** MIDI note -> the steps (0 .. bars*16-1) that hit. */
  steps: Record<string, number[]>;
  updatedAt: number;
}

export const MAX_BARS = 8;
export const barsOf = (p: Pick<BeatPattern, "bars">) =>
  Math.max(1, Math.min(MAX_BARS, p.bars ?? 1));
export const stepsOf = (p: Pick<BeatPattern, "bars">) => barsOf(p) * STEPS;

/** One more bar; with `copy`, the new bar repeats the last one so a groove keeps going. */
export function addBar(p: BeatPattern, copy = true): BeatPattern {
  const bars = barsOf(p);
  if (bars >= MAX_BARS) return p;
  const last = (bars - 1) * STEPS;
  const steps = Object.fromEntries(
    Object.entries(p.steps).map(([k, list]) => [
      k,
      copy ? [...list, ...list.filter((s) => s >= last).map((s) => s + STEPS)] : list,
    ]),
  );
  return { ...p, bars: bars + 1, steps };
}

/** Drop the last bar and its hits. */
export function removeBar(p: BeatPattern): BeatPattern {
  const bars = barsOf(p);
  if (bars <= 1) return p;
  const end = (bars - 1) * STEPS;
  const steps: Record<string, number[]> = {};
  for (const [k, list] of Object.entries(p.steps)) {
    const kept = list.filter((s) => s < end);
    if (kept.length) steps[k] = kept;
  }
  return { ...p, bars: bars - 1, steps };
}

/** The synth kit's voices, kick first. */
export const DEFAULT_ROWS: BeatRow[] = DRUM_KITS.BOOM_BAP_KIT.map((v) => ({
  midi: v.midi,
  name: v.name,
}));

export const stepSeconds = (bpm: number) => 60 / bpm / 4;

export function isOn(p: BeatPattern, midi: number, step: number) {
  return p.steps[midi]?.includes(step) ?? false;
}

export function toggleStep(p: BeatPattern, midi: number, step: number): BeatPattern {
  const cur = p.steps[midi] ?? [];
  const next = cur.includes(step)
    ? cur.filter((s) => s !== step)
    : [...cur, step].sort((a, b) => a - b);
  const steps: Record<string, number[]> = { ...p.steps, [midi]: next };
  if (!next.length) delete steps[midi];
  return { ...p, steps };
}

export const hitCount = (p: BeatPattern) =>
  Object.values(p.steps).reduce((n, s) => n + s.length, 0);

/**
 * `loopBars` bars of the beat on the "kit" voice (the pattern repeats to fill
 * them): the audio runtime schedules each pad's sample on the audio clock, or
 * the synth drum when the pad is empty. Times in seconds at `bpm`.
 */
export function beatNotes(p: BeatPattern, bpm: number, loopBars = barsOf(p)): SequenceNote[] {
  const s = stepSeconds(bpm);
  const len = stepsOf(p);
  const total = loopBars * STEPS;
  const out: SequenceNote[] = [];
  for (let base = 0; base < total; base += len)
    for (const [key, steps] of Object.entries(p.steps))
      for (const step of steps)
        if (base + step < total)
          out.push({
            midi: Number(key),
            time: (base + step) * s,
            duration: s,
            velocity: 0.8,
            voice: "kit",
          });
  return out.sort((a, b) => a.time - b.time);
}

// ---------------------------------------------------------------------------
// Presets: the verified MPC grooves, plus a few common feels.

const VOICE_NOTE = Object.fromEntries(MPC_GROOVES.voices.map((v) => [v.id, v.midi]));
function fromGroove(id: string, name: string): BeatPreset {
  const g = MPC_GROOVES.catalog.find((x) => x.value === id)!;
  const steps: Record<string, number[]> = {};
  for (const t of g.targets) {
    const step = Math.round(t.beat * 4);
    if (step >= g.bars * STEPS) continue; // a closing downbeat belongs to the next bar
    (steps[VOICE_NOTE[t.voice]] ??= []).push(step);
  }
  for (const k of Object.keys(steps)) steps[k].sort((a, b) => a - b);
  return { id, name, bars: g.bars, steps };
}
const every = (n: number, from = 0, bars = 1) =>
  Array.from({ length: (bars * STEPS) / n }, (_, i) => from + i * n).filter(
    (x) => x < bars * STEPS,
  );

export interface BeatPreset {
  id: string;
  name: string;
  bars: number;
  steps: Record<string, number[]>;
}

export const PRESETS: BeatPreset[] = [
  fromGroove("eighth-hats", "Backbeat with eighth hats"),
  fromGroove("syncopated", "Syncopated kick"),
  fromGroove("boom-bap-2bar", "Boom bap, 2 bars"),
  fromGroove("turnaround-fill", "Turnaround with a fill, 4 bars"),
  {
    id: "four-floor",
    name: "Four on the floor",
    bars: 1,
    steps: { 36: every(4), 38: [4, 12], 42: every(4, 2), 46: [14] },
  },
  {
    id: "rock",
    name: "Rock eighths",
    bars: 1,
    steps: { 36: [0, 6, 8], 38: [4, 12], 42: every(2) },
  },
  {
    id: "funk",
    name: "Funk sixteenths",
    bars: 1,
    steps: { 36: [0, 3, 10], 38: [4, 7, 12, 15], 42: every(1) },
  },
  {
    id: "bossa",
    name: "Bossa nova, 2 bars",
    bars: 2,
    steps: {
      36: [0, 3, 4, 8, 11, 12, 16, 19, 20, 24, 27, 28],
      39: [0, 6, 12, 20, 26],
      42: every(2, 0, 2),
    },
  },
];

export function fromPreset(preset: BeatPreset, bpm: number): BeatPattern {
  return {
    id: crypto.randomUUID(),
    name: preset.name,
    bpm,
    bars: preset.bars,
    steps: structuredClone(preset.steps),
    updatedAt: Date.now(),
  };
}
