// Rhythm route helpers: turn input into timed hits, and a pattern into the
// sound of its demo (clicks, taps, strums), with the event each sound lights.
import { m } from "@repo/i18n/messages.js";
import type { NoteEvent } from "@repo/music-core";
import { pc } from "@repo/music-core";
import type { RhythmPatternDef } from "@repo/music-core/data/index";
import { RHYTHM_PATTERNS, type RhythmPlan } from "@repo/music-core/content/rhythm";
import type { RhythmHit } from "@repo/music-core/scoring/rhythm";

/**
 * The read-and-tap list: the rhythms, then the strums for this instrument under
 * their own heading. The plain quarter pulse is Pulse mode, so it stays out.
 */
export function readPatterns(instrument: string) {
  return RHYTHM_PATTERNS.filter(
    (p) => p.id !== "quarter-pulse" && (!p.chords?.length || p.id.startsWith(`${instrument}-`)),
  ).map((p) => ({
    value: p.id,
    // A strum is listed under its instrument, so its label drops the "Guitar: " prefix, in any language.
    label: /^(guitar|ukulele)-/.test(p.id) ? p.label.replace(/^[^:]*:\s*/, "") : p.label,
    group: p.chords?.length ? strumsGroup(instrument) : m.music_drills_rhythm_group_rhythms(),
  }));
}

/** The heading over an instrument's strums in the pattern list. */
function strumsGroup(instrument: string): string {
  if (instrument === "guitar") return m.music_drills_rhythm_group_strums_guitar();
  if (instrument === "ukulele") return m.music_drills_rhythm_group_strums_ukulele();
  return m.music_drills_rhythm_group_strums_other({
    instrument: `${instrument[0].toUpperCase()}${instrument.slice(1)}`,
  });
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

/** How much the taps varied beat to beat, in words a player reads: "23 ms, tight". */
export function spreadText(ms: number): string {
  const n = Math.round(ms);
  return (
    n <= 25
      ? m.music_drills_rhythm_spread_tight
      : n <= 50
        ? m.music_drills_rhythm_spread_little_loose
        : m.music_drills_rhythm_spread_loose
  )({ ms: n });
}

/** How long a run is, as the grid draws it: "4 bars of 4", or "6 beats" when it is not whole bars. */
export function lengthText(beats: number, perBar: number): string {
  if (beats % perBar) return m.music_drills_rhythm_length_beats({ count: beats });
  return m.music_drills_rhythm_length_bars({ count: beats / perBar, perBar });
}

/** A written cell once a dictation is checked: right, extra, missed, or nothing to say. */
export function cellVerdict(heard: boolean, marked: boolean): "right" | "extra" | "missed" | null {
  return marked ? (heard ? "right" : "extra") : heard ? "missed" : null;
}

/**
 * The narrowest a dictation cell gets, and the gap between cells, in px. Cells
 * are a full 44 px touch target both ways: on a phone a bar of eighths splits
 * into two rows of four rather than shrinking its cells.
 */
export const CELL_MIN = 44;
export const CELL_GAP = 3;

/**
 * How many beats of a bar go on one row of the dictation grid at this width: the
 * whole bar when its cells fit, else the largest whole-beat share of it that
 * does (half a bar of sixteenths on a phone), never less than one beat.
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

/**
 * What a dictation grid says, written down: a note at every mark, held until
 * the next mark or the bar line, and a rest from the bar line to a bar's first
 * mark (a whole bar's rest when a bar has none). A mark is an onset only, so
 * this is one honest reading of it, not the only one.
 */
export function marksAsPattern(
  onsets: readonly number[],
  bars: number,
  perBar: number,
): RhythmPatternDef {
  const sorted = [...new Set(onsets)].sort((a, b) => a - b);
  const barEnd = (b: number) => (Math.floor(b / perBar + 1e-6) + 1) * perBar;
  const rests: RhythmPatternDef["rests"] = [];
  for (let bar = 0; bar < bars; bar++) {
    const from = bar * perBar;
    const first = sorted.find((b) => b >= from - 1e-6 && b < from + perBar - 1e-6);
    if (first === undefined) rests.push({ startBeat: from, endBeat: from + perBar });
    else if (first > from + 1e-6) rests.push({ startBeat: from, endBeat: first });
  }
  return {
    id: `marks-${sorted.join("_")}`,
    label: m.music_drills_rhythm_your_rhythm(),
    meter: { beats: perBar, beatUnit: 4 },
    defaultBars: bars,
    events: sorted.map((beat, i) => ({
      id: `m${i}`,
      beat,
      voice: "tap" as const,
      accent: "normal" as const,
      durationBeats: Math.min(sorted[i + 1] ?? Infinity, barEnd(beat)) - beat,
    })),
    rests,
  };
}

/**
 * The headline's count, read from the same breakdown the bars draw, so the two
 * never disagree: "16 of 16 beats landed, 15 on time, 1 late." Early and late
 * are named only when there are some; a run with none says "all on time".
 */
export function landedText(
  t: { onTime: number; early: number; late: number; missed: number },
  noun: string,
  verb = "landed",
): string {
  const landed = t.onTime + t.early + t.late;
  const total = landed + t.missed;
  const parts = !landed
    ? []
    : landed === t.onTime
      ? [
          landed === 1
            ? m.music_drills_rhythm_landed_on_time_one()
            : m.music_drills_rhythm_landed_all_on_time(),
        ]
      : [
          ...(t.onTime ? [m.music_drills_rhythm_landed_n_on_time({ n: t.onTime })] : []),
          ...(t.early ? [m.music_drills_rhythm_landed_n_early({ n: t.early })] : []),
          ...(t.late ? [m.music_drills_rhythm_landed_n_late({ n: t.late })] : []),
        ];
  // The two sentences the route says have messages; any other noun and verb stay as given.
  const said =
    noun === "beats" && verb === "landed"
      ? "beats"
      : noun === "notes" && verb === "tapped"
        ? "notes"
        : null;
  if (!said)
    return `${landed} of ${total} ${noun} ${verb}${parts.length ? `, ${parts.join(", ")}` : ""}.`;
  const at = { landed, total, parts: parts.join(", ") };
  if (said === "beats")
    return parts.length
      ? m.music_drills_rhythm_landed_beats_parts(at)
      : m.music_drills_rhythm_landed_beats(at);
  return parts.length
    ? m.music_drills_rhythm_landed_notes_parts(at)
    : m.music_drills_rhythm_landed_notes(at);
}

/**
 * Echo's faint target: the rhythm drawn as it is heard, in Practice only and only while the setup
 * keeps it on. A run that shows it is recorded as hinted (`assistanceFor(mode, true)`); Check never does.
 */
export const echoTargetShown = (rhythmMode: string, target: boolean, mode: "practice" | "check") =>
  rhythmMode === "echo" && target && mode === "practice";
