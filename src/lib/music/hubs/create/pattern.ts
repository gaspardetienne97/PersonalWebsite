// The beat grid's pattern: 16 sixteenth-note steps per bar, one or more bars,
// rows keyed by MIDI note so a row plays the kit pad with that note, or the
// synth kit. Pure.
import { DRUM_KITS, type GrooveDef } from "@repo/music-core/data/index";
import { PAD_LEVELS, PAD_REPERTOIRE } from "@repo/music-core/content/pads-repertoire";
import { swungBeat } from "@repo/music-core/content/pads-grid";
import { GROOVE_VOICES } from "@repo/music-core/content/winds-pads";
import type { SequenceNote } from "#lib/music/runtime/audio.svelte.ts";

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
  /** Hits recorded live and kept as played (quantise off or 50%): beats into the pattern. */
  live?: LiveStep[];
  /** MPC swing for the grid's steps, 50 straight to 75. */
  swing?: number;
  updatedAt: number;
}
export interface LiveStep {
  midi: number;
  beat: number;
  velocity: number;
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
  const lastBeat = (bars - 1) * 4;
  const live =
    p.live && copy
      ? [
          ...p.live,
          ...p.live.filter((h) => h.beat >= lastBeat).map((h) => ({ ...h, beat: h.beat + 4 })),
        ]
      : p.live;
  return { ...p, bars: bars + 1, steps, ...(live ? { live } : {}) };
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
  const live = p.live?.filter((h) => h.beat < (bars - 1) * 4);
  return { ...p, bars: bars - 1, steps, ...(live ? { live } : {}) };
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
  Object.values(p.steps).reduce((n, s) => n + s.length, 0) + (p.live?.length ?? 0);

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
  for (let base = 0; base < total; base += len) {
    for (const [key, steps] of Object.entries(p.steps))
      for (const step of steps)
        if (base + step < total)
          out.push({
            midi: Number(key),
            time: (base + (p.swing ? swungBeat(step, p.swing) * 4 : step)) * s,
            duration: s,
            velocity: 0.8,
            voice: "kit",
          });
    for (const h of p.live ?? [])
      if (base + h.beat * 4 < total)
        out.push({
          midi: h.midi,
          time: (base + h.beat * 4) * s,
          duration: s,
          velocity: h.velocity,
          voice: "kit",
        });
  }
  return out.sort((a, b) => a.time - b.time);
}

// ---------------------------------------------------------------------------
// Presets: the finger-drumming repertoire, the same grooves the Pads drills
// teach, by level. Swing is written straight; a groove with hits between the
// sixteenths (trap rolls, a pushed snare, a shuffle's triplets) can't sit on the
// grid and is left out.

const VOICE_NOTE = Object.fromEntries(GROOVE_VOICES.map((v) => [v.id, v.midi]));

/** A groove as grid steps per MIDI note, or null when a hit falls between sixteenths. */
export function grooveSteps(g: GrooveDef, swing = 50): Record<string, number[]> | null {
  const steps: Record<string, number[]> = {};
  for (const t of g.targets) {
    const bar = Math.floor(t.beat / 4 + 1e-6);
    if (bar >= g.bars) continue; // a closing downbeat belongs to the next bar
    const near = Math.round((t.beat - bar * 4) * 4);
    const step = [near - 1, near, near + 1].find(
      (k) => k >= 0 && k < STEPS && Math.abs(bar * 4 + swungBeat(k, swing) - t.beat) < 1e-6,
    );
    if (step === undefined) return null;
    (steps[VOICE_NOTE[t.voice]] ??= []).push(bar * STEPS + step);
  }
  for (const k of Object.keys(steps)) steps[k] = [...new Set(steps[k])].sort((a, b) => a - b);
  return steps;
}

export interface BeatPreset {
  id: string;
  name: string;
  /** The repertoire level it is taught at, for grouping. */
  group: string;
  bars: number;
  steps: Record<string, number[]>;
}

export const PRESETS: BeatPreset[] = [...PAD_REPERTOIRE]
  .sort((a, b) => a.level - b.level)
  .flatMap((r) => {
    // Create's grid is sixteenths in 4/4: odd meters stay out, and triplets fall out of grooveSteps.
    const steps =
      r.groove.bars <= MAX_BARS && (r.groove.beatsPerBar ?? 4) === 4
        ? grooveSteps(r.groove, r.swing)
        : null;
    const level = PAD_LEVELS.find((l) => l.level === r.level);
    return steps
      ? [
          {
            id: r.groove.value,
            name: r.groove.label,
            group: `Level ${r.level}: ${level?.title ?? ""}`,
            bars: r.groove.bars,
            steps,
          },
        ]
      : [];
  });

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

/** One bar of the song as the beat's overview draws it. */
export interface BarCell {
  /** The song's bar, from 0. */
  bar: number;
  /** The beat's own bar that sounds there (the beat repeats to fill the song). */
  beatBar: number;
  /** True past the beat's own length: a repeat. */
  repeat: boolean;
  /** True for the bar the playhead is in. */
  now: boolean;
}

/** The song's bars for the overview strip; `beat` is beats into the pass, -1 when stopped. */
export function barCells(beatBars: number, songBars: number, beat = -1): BarCell[] {
  const n = Math.max(1, beatBars, songBars);
  const now = beat < 0 ? -1 : Math.floor(beat / 4) % n;
  return Array.from({ length: n }, (_, bar) => ({
    bar,
    beatBar: bar % Math.max(1, beatBars),
    repeat: bar >= beatBars,
    now: bar === now,
  }));
}
