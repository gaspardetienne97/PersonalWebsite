// The beat grid's pattern: 16 sixteenth-note steps per row, rows keyed by MIDI
// note so a row plays the kit pad with that note, or the synth kit. Pure.
import { DRUM_KITS } from "@repo/music-core/data/index";
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
  /** MIDI note -> the steps (0..15) that hit. */
  steps: Record<string, number[]>;
  updatedAt: number;
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
 * `loops` bars of the pattern on the "kit" voice: the audio runtime schedules
 * each pad's sample on the audio clock, or the synth drum when the pad is empty.
 */
export function patternToSequence(p: BeatPattern, loops = 1): SequenceNote[] {
  const s = stepSeconds(p.bpm);
  const out: SequenceNote[] = [];
  for (let l = 0; l < loops; l++)
    for (const [key, steps] of Object.entries(p.steps)) {
      const midi = Number(key);
      for (const step of steps)
        out.push({
          midi,
          time: (l * STEPS + step) * s,
          duration: s,
          velocity: 0.8,
          voice: "kit",
        });
    }
  // A silent marker on the last step keeps every loop a whole bar long.
  out.push({ midi: 0, time: (loops * STEPS - 1) * s, duration: s, velocity: 0, voice: "drum" });
  return out.sort((a, b) => a.time - b.time);
}
