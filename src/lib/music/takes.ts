// MIDI takes: the db.midiTakes row the Lab, Jam and Record share, and the
// conversions between takes, the canonical score and audio sequences.
// Durations come from real note-offs (lessons A7).
import type { InputSource, Instrument, NoteEvent, Score } from "@repo/music-core";
import { db } from "#lib/music/runtime/index.ts";
import type { SequenceNote } from "#lib/music/runtime/audio.svelte.ts";

export interface TakeNote {
  midi: number;
  startMs: number;
  durationMs: number;
  /** 0..1 */
  velocity: number;
}
// A type alias (not an interface) so it fits the db row's index signature.
export type MidiTake = {
  id: string;
  createdAt: number;
  name: string;
  notes: TakeNote[];
  durationMs: number;
  instrument?: Instrument;
  note?: string;
};

/** Longest a take may run (catalog 4.12). */
export const TAKE_LIMIT_MS = 60 * 60 * 1000;
/** The beat grid the piano roll snaps to. */
export const STEP_BEATS = 0.25;
export const TAKE_BPM = 120;

/**
 * Pair note-ons with their note-offs. Times are relative to `t0`; a note still
 * held at `end` closes there, so a take never holds a note forever.
 */
export function pairNotes(events: readonly NoteEvent[], t0: number, end: number): TakeNote[] {
  // Keyed by source and pitch: one source's note-off never ends another's note.
  const open = new Map<string, NoteEvent>();
  const out: TakeNote[] = [];
  const close = (on: NoteEvent, at: number) =>
    out.push({
      midi: on.midi,
      startMs: Math.max(0, Math.round(on.at - t0)),
      durationMs: Math.max(1, Math.round(at - on.at)),
      velocity: on.velocity,
    });
  for (const e of [...events].sort((a, b) => a.at - b.at)) {
    const key = `${e.source}:${e.midi}`;
    const on = open.get(key);
    if (e.kind === "noteon") {
      if (on) close(on, e.at); // re-strike without a release
      open.set(key, e);
    } else if (on) {
      close(on, e.at);
      open.delete(key);
    }
  }
  for (const on of open.values()) close(on, end);
  return out.sort((a, b) => a.startMs - b.startMs || a.midi - b.midi);
}

const round3 = (v: number) => Math.round(v * 1000) / 1000;

/**
 * A take as a one-voice score. `snap` rounds onsets and lengths to sixteenths
 * (the piano roll grid); without it the timing is exact at `bpm`.
 */
export function takeToScore(take: MidiTake, opts: { bpm?: number; snap?: boolean } = {}): Score {
  const bpm = opts.bpm ?? TAKE_BPM;
  const beat = (ms: number) => (ms / 60000) * bpm;
  const q = (b: number) => (opts.snap ? Math.round(b / STEP_BEATS) * STEP_BEATS : round3(b));
  const notes = take.notes.map((n) => ({
    midi: n.midi,
    startBeat: q(beat(n.startMs)),
    durationBeats: Math.max(opts.snap ? STEP_BEATS : 0.01, q(beat(n.durationMs))),
    velocity: n.velocity,
  }));
  const end = Math.max(
    beat(take.durationMs),
    ...notes.map((n) => n.startBeat + n.durationBeats),
    0,
  );
  return {
    id: crypto.randomUUID(),
    title: take.name,
    bpm,
    meter: { beats: 4, beatUnit: 4 },
    voices: [
      {
        id: "take",
        name: take.name,
        clef:
          notes.length && notes.reduce((s, n) => s + n.midi, 0) / notes.length < 60
            ? "bass"
            : "treble",
        notes,
      },
    ],
    lengthBeats: Math.max(4, Math.ceil(end / 4) * 4),
    source: { kind: "take" },
  };
}

export function takeToSequence(take: MidiTake): SequenceNote[] {
  return take.notes.map((n) => ({
    midi: n.midi,
    time: n.startMs / 1000,
    duration: n.durationMs / 1000,
    velocity: n.velocity,
  }));
}

export function scoreToSequence(score: Score): SequenceNote[] {
  const s = 60 / score.bpm;
  return score.voices.flatMap((v) =>
    v.notes.map((n) => ({
      midi: n.midi,
      time: n.startBeat * s,
      duration: n.durationBeats * s,
      velocity: n.velocity ?? 0.8,
    })),
  );
}

/** "1:05" */
export function clock(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = String(total % 60).padStart(2, "0");
  return h ? `${h}:${String(m).padStart(2, "0")}:${s}` : `${m}:${s}`;
}

/** A take's length: "0.8 s" when short, else the clock. */
export const takeLength = (ms: number) => (ms < 10_000 ? `${(ms / 1000).toFixed(1)} s` : clock(ms));

/** File-name-safe stem for downloads. */
export const fileStem = (name: string, fallback = "take") =>
  name
    .trim()
    .replace(/[^\p{L}\p{N}]+/gu, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60) || fallback;

export interface TakeStats {
  count: number;
  distinct: number;
  low: number | null;
  high: number | null;
  perSource: Partial<Record<InputSource, number>>;
}

export function takeStats(events: readonly NoteEvent[]): TakeStats {
  const ons = events.filter((e) => e.kind === "noteon");
  const midis = ons.map((e) => e.midi);
  const perSource: TakeStats["perSource"] = {};
  for (const e of ons) perSource[e.source] = (perSource[e.source] ?? 0) + 1;
  return {
    count: ons.length,
    distinct: new Set(midis).size,
    low: midis.length ? Math.min(...midis) : null,
    high: midis.length ? Math.max(...midis) : null,
    perSource,
  };
}

export async function saveTake(take: MidiTake) {
  await db.midiTakes.put(take);
}

export async function recentTakes(limit = 6): Promise<MidiTake[]> {
  return (await db.midiTakes
    .orderBy("createdAt")
    .reverse()
    .limit(limit)
    .toArray()) as unknown as MidiTake[];
}
