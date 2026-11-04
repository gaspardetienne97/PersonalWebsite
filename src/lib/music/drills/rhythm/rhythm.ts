// Rhythm route helpers: turn input into timed hits, and a pattern into the
// sound of its demo (clicks, taps, strums), with the event each sound lights.
import type { NoteEvent } from "@repo/music-core";
import { pc } from "@repo/music-core";
import { RHYTHM_PATTERNS, type RhythmPlan } from "@repo/music-core/content/rhythm";
import type { RhythmHit } from "@repo/music-core/scoring/rhythm";

/** The five rhythm exercises, as the shell's tab row. */
export const RHYTHM_TABS = [
  { id: "pulse", label: "Pulse" },
  { id: "read-and-tap", label: "Read and tap" },
  { id: "echo", label: "Echo" },
  { id: "dictation", label: "Dictation" },
  { id: "groove", label: "Groove dictation" },
] as const;

/**
 * The read-and-tap list: the rhythms, then the strums for this instrument under
 * their own heading. The plain quarter pulse is Pulse mode, so it stays out.
 */
export function readPatterns(instrument: string) {
  return RHYTHM_PATTERNS.filter(
    (p) => p.id !== "quarter-pulse" && (!p.chords?.length || p.id.startsWith(`${instrument}-`)),
  ).map((p) => ({
    value: p.id,
    label: p.label.replace(/^(Guitar|Ukulele): /, ""),
    group: p.chords?.length
      ? `${instrument[0].toUpperCase()}${instrument.slice(1)} strums`
      : "Rhythms",
  }));
}

export interface Hit extends RhythmHit {
  source: "onscreen" | "midi" | "audio";
}

/** MIDI note-ons within this many ms are one stroke (a strummed chord, a flam). */
export const STROKE_MS = 35;

/**
 * One hit per stroke. Pitch classes ride along for pitched MIDI (a keyboard),
 * never for MPC pads, whose note numbers are pads, not pitches.
 */
export function midiHits(notes: readonly NoteEvent[]): Hit[] {
  const out: Hit[] = [];
  for (const n of [...notes].filter((x) => x.kind === "noteon").sort((a, b) => a.at - b.at)) {
    const last = out.at(-1);
    const pitched = n.instrument !== "mpc";
    if (last && last.source === "midi" && n.at - last.at <= STROKE_MS) {
      if (pitched) last.pcs = [...new Set([...(last.pcs ?? []), pc(n.midi)])];
      continue;
    }
    out.push({ at: n.at, source: "midi", pcs: pitched ? [pc(n.midi)] : undefined });
  }
  return out;
}

export interface DemoNote {
  midi: number;
  time: number;
  duration: number;
  velocity: number;
  voice?: "piano" | "drum" | "click";
  /** Index into plan.events this sound belongs to; -1 for a click. */
  event: number;
}

/** A close guitar-ish voicing for a chord's pitch classes, E3 upward. */
export const voicing = (pcs: readonly number[]) =>
  pcs.map((p) => 52 + ((p - 4 + 12) % 12)).sort((a, b) => a - b);

/** The pattern as it sounds: audible clicks, then each event as a tap or a strum. */
export function demoNotes(plan: RhythmPlan): DemoNote[] {
  const s = (ms: number) => ms / 1000;
  const out: DemoNote[] = plan.clicks
    .filter((c) => c.audible)
    .map((c) => ({
      midi: 0,
      time: s(c.atMs),
      duration: 0.05,
      velocity: c.downbeat ? 1 : 0.6,
      voice: "click" as const,
      event: -1,
    }));
  plan.events.forEach((e, i) => {
    const chord = e.chord
      ? plan.chords.find((c) => c.symbol === e.chord && e.atMs >= c.startMs && e.atMs < c.endMs)
      : undefined;
    const vel = e.accent ? 1 : 0.7;
    if (!chord || e.stroke === "mute") {
      out.push({
        midi: e.stroke === "mute" ? 37 : 38,
        time: s(e.atMs),
        duration: 0.1,
        velocity: vel,
        voice: "drum",
        event: i,
      });
      return;
    }
    const notes = voicing(chord.pitchClasses);
    const order = e.stroke === "up" ? [...notes].reverse() : notes;
    order.forEach((m, k) =>
      out.push({
        midi: m,
        time: s(e.atMs) + k * 0.012,
        duration: s(e.durationMs ?? plan.beatMs * 0.5) * 0.9,
        velocity: vel * (e.stroke === "up" ? 0.75 : 1),
        event: i,
      }),
    );
  });
  return out.sort((a, b) => a.time - b.time);
}

/** A tap's offset from its beat, signed: "+4 ms" late, "−7 ms" early, "0 ms" dead on. */
export function signedMs(ms: number): string {
  const n = Math.round(ms);
  return n === 0 ? "0 ms" : `${n > 0 ? "+" : "−"}${Math.abs(n)} ms`;
}

/** How long a run is, as the grid draws it: "4 bars of 4", or "6 beats" when it is not whole bars. */
export function lengthText(beats: number, perBar: number): string {
  if (beats % perBar) return `${beats} beats`;
  const bars = beats / perBar;
  return `${bars} bar${bars === 1 ? "" : "s"} of ${perBar}`;
}

/** The count-in in words: "1 bar count-in", "no count-in". */
export const countInText = (bars: number) =>
  bars > 0 ? `${bars} bar${bars === 1 ? "" : "s"} count-in` : "no count-in";

/** A written cell once a dictation is checked: right, extra, missed, or nothing to say. */
export function cellVerdict(heard: boolean, marked: boolean): "right" | "extra" | "missed" | null {
  return marked ? (heard ? "right" : "extra") : heard ? "missed" : null;
}

/** The smallest cell a finger can hit, and the gap between cells, in px. */
export const CELL_MIN = 44;
export const CELL_GAP = 4;

/**
 * How many beats of a bar go on one row of the dictation grid at this width: the
 * whole bar when its cells fit at 44 px, else the largest whole-beat share of it that
 * does (half a bar on a phone), never less than one beat.
 */
export function beatsPerRow(
  width: number,
  perBeat: number,
  beatsPerBar: number,
  labelPx = 0,
): number {
  if (!width) return beatsPerBar;
  for (let b = beatsPerBar; b > 1; b--) {
    if (beatsPerBar % b) continue;
    const cells = b * perBeat;
    if (labelPx + cells * CELL_MIN + (cells - 1) * CELL_GAP <= width) return b;
  }
  return 1;
}
