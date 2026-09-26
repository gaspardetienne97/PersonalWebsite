// From heard notes (seconds, from either transcription engine) to a draft
// score: a tempo guess, a beat grid, and two hands for piano-like material.
// Pure, so it runs in the worker and in tests alike.
import type { Score, ScoreNote, ScoreVoice } from "@repo/music-core";

/** A note as an engine heard it, in seconds. */
export interface HeardNote {
  midi: number;
  start: number;
  duration: number;
  /** 0..1, how strongly it sounded. */
  amplitude: number;
}

const SPLIT = 60; // middle C: at and above goes to the right hand

/**
 * The tempo whose beat grid the onsets sit on best, and where beat 0 falls.
 * Each candidate is scored by how close the onsets land to its beats, less
 * what a random grid of that spacing would score, times a gentle preference
 * for 70-130 BPM (so a grid twice or half as fast does not win on a tie).
 */
export function estimateTempo(notes: readonly HeardNote[]): { bpm: number; offset: number } {
  const onsets: { t: number; w: number }[] = [];
  for (const n of [...notes].sort((a, b) => a.start - b.start)) {
    const last = onsets.at(-1);
    if (last && n.start - last.t < 0.03) last.w += n.amplitude;
    else onsets.push({ t: n.start, w: n.amplitude });
  }
  if (onsets.length < 4) return { bpm: 90, offset: onsets[0]?.t ?? 0 };
  const total = onsets.reduce((s, o) => s + o.w, 0);
  const sigma = 0.03;
  /** How well the onsets sit on a grid at `bpm` (its best phase), above chance. */
  const fit = (bpm: number) => {
    const p = 60 / bpm;
    const chance = (sigma * Math.sqrt(2 * Math.PI)) / p;
    let out = { fit: -Infinity, phase: 0 };
    // Phases half a tolerance apart, so no grid is missed between steps.
    const steps = Math.ceil(p / (sigma / 2));
    for (let k = 0; k < steps; k++) {
      const phase = (k / steps) * p;
      let hit = 0;
      for (const o of onsets) {
        const r = (((o.t - phase) % p) + p) % p;
        const d = Math.min(r, p - r);
        hit += o.w * Math.exp(-(d * d) / (2 * sigma * sigma));
      }
      if (hit / total - chance > out.fit) out = { fit: hit / total - chance, phase };
    }
    return out;
  };
  let best = { score: -Infinity, bpm: 90, phase: 0, fit: 0 };
  for (let bpm = 50; bpm <= 180; bpm += 0.5) {
    const prior = Math.exp(-(Math.log2(bpm / 100) ** 2) / (2 * 0.5 ** 2));
    const f = fit(bpm);
    if (f.fit * prior > best.score)
      best = { score: f.fit * prior, bpm, phase: f.phase, fit: f.fit };
  }
  // Steady eighth notes make a grid twice as fast fit best (a 70 BPM ballad
  // reads as 140). Above 120, take the half tempo when it fits nearly as well:
  // notes on every beat of a real 140 fit the half grid only about half as well.
  if (best.bpm > 120) {
    const half = fit(best.bpm / 2);
    if (half.fit >= 0.6 * best.fit)
      best = { ...best, bpm: best.bpm / 2, phase: half.phase, fit: half.fit };
  }
  const p = 60 / best.bpm;
  let offset = best.phase;
  const first = onsets[0].t;
  // Beat 0 is the grid beat nearest the first onset (a note played a little early still starts the song).
  while (offset > first + 0.05) offset -= p;
  while (offset + p <= first + 0.05) offset += p;
  return { bpm: best.bpm, offset: Math.max(0, offset) };
}

/**
 * Heard notes on a beat grid at `bpm`, beat 0 at `offset` seconds. Starts and
 * lengths snap to `grid` beats; repeats of one pitch never overlap. With
 * `split`, notes from middle C up go to the right hand and the rest to the
 * left (when both have notes).
 */
export function notesToScore(
  heard: readonly HeardNote[],
  opts: { bpm: number; offset?: number; title: string; split?: boolean; grid?: number },
): Score {
  const { bpm, offset = 0, grid = 0.25 } = opts;
  const beats = (s: number) => (s * bpm) / 60;
  const snap = (b: number) => Math.round(b / grid) * grid;
  const placed: ScoreNote[] = heard
    .map((n) => ({
      midi: n.midi,
      startBeat: Math.max(0, snap(beats(n.start - offset))),
      durationBeats: Math.max(grid, snap(beats(n.duration))),
      velocity: Math.round(Math.min(1, Math.max(0.3, n.amplitude)) * 100) / 100,
    }))
    .sort((a, b) => a.startBeat - b.startBeat || a.midi - b.midi);

  // One note per pitch per onset (the longest), and a repeat cuts the one before.
  const byKey = new Map<string, ScoreNote>();
  for (const n of placed) {
    const k = `${n.midi}@${n.startBeat}`;
    const had = byKey.get(k);
    if (!had || n.durationBeats > had.durationBeats) byKey.set(k, n);
  }
  const notes = [...byKey.values()].sort((a, b) => a.startBeat - b.startBeat || a.midi - b.midi);
  const lastOf = new Map<number, ScoreNote>();
  for (const n of notes) {
    const prev = lastOf.get(n.midi);
    if (prev && prev.startBeat + prev.durationBeats > n.startBeat)
      prev.durationBeats = Math.max(grid, n.startBeat - prev.startBeat);
    lastOf.set(n.midi, n);
  }

  const upper = notes.filter((n) => n.midi >= SPLIT);
  const lower = notes.filter((n) => n.midi < SPLIT);
  const voices: ScoreVoice[] =
    opts.split !== false && upper.length && lower.length
      ? [
          { id: "right", name: "Right hand", hand: "right", clef: "treble", notes: upper },
          { id: "left", name: "Left hand", hand: "left", clef: "bass", notes: lower },
        ]
      : [
          {
            id: "melody",
            name: "Transcription",
            clef: lower.length > upper.length ? "bass" : "treble",
            notes,
          },
        ];
  const end = Math.max(0, ...notes.map((n) => n.startBeat + n.durationBeats));
  return {
    id: crypto.randomUUID(),
    title: opts.title,
    bpm: Math.round(bpm),
    meter: { beats: 4, beatUnit: 4 },
    voices,
    lengthBeats: Math.max(4, Math.ceil(end / 4) * 4),
    source: { kind: "transcribed" },
  };
}
