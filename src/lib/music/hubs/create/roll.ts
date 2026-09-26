// The piano roll's document: voices of notes on a sixteenth grid, convertible
// to and from the canonical score. Pure.
import type { PlaybackSound, Score, ScoreNote } from "@repo/music-core";
import type { SequenceNote } from "$lib/music/runtime/audio.svelte";
import { STEP_BEATS } from "$lib/music/takes";

export const ROLL_KEY = "music.piano-roll";

export interface RollVoice {
  id: string;
  name: string;
  /** Velocity new notes get (0..1). */
  velocity: number;
  notes: ScoreNote[];
  /** The instrument this voice plays (default the sampled piano). */
  sound?: PlaybackSound;
  muted?: boolean;
}

/** What a voice can sound like. Bass and pad are here for backing tracks. */
export const ROLL_SOUNDS: { value: PlaybackSound; label: string }[] = [
  { value: "salamander-piano", label: "Piano" },
  { value: "e-piano", label: "E-Piano" },
  { value: "warm-synth", label: "Warm synth" },
  { value: "synth", label: "Synth" },
  { value: "bass", label: "Bass" },
  { value: "pad", label: "Pad" },
  { value: "square", label: "Square lead" },
  { value: "saw", label: "Saw lead" },
];
export const soundOf = (v: Pick<RollVoice, "sound">): PlaybackSound =>
  v.sound ?? "salamander-piano";

/** Every unmuted voice as sequence notes on its own sound, `loopBars` long at `bpm`. */
export function rollNotes(
  doc: RollDoc,
  bpm: number,
  loopBars = doc.lengthBeats / BAR_BEATS,
): SequenceNote[] {
  const beatS = 60 / bpm;
  const end = loopBars * BAR_BEATS;
  const out: SequenceNote[] = [];
  const len = doc.lengthBeats;
  for (let base = 0; base < end; base += len)
    for (const v of doc.voices)
      if (!v.muted)
        for (const n of v.notes)
          if (base + n.startBeat < end)
            out.push({
              midi: n.midi,
              time: (base + n.startBeat) * beatS,
              duration: Math.min(n.durationBeats, end - base - n.startBeat) * beatS,
              velocity: n.velocity ?? v.velocity,
              sound: soundOf(v),
            });
  return out;
}
export interface RollDoc {
  title: string;
  bpm: number;
  lengthBeats: number;
  voices: RollVoice[];
}

/** Identity colours for voices; they wrap after six. Names always accompany them. */
export const TRACK_COLOURS = [
  "var(--hue-piano)",
  "var(--hue-aerophone)",
  "var(--hue-mpc)",
  "var(--hue-rhythm)",
  "var(--hue-guitar)",
  "var(--hue-create)", // last: the beat wears Create's own colour
];
export const trackColour = (i: number) =>
  TRACK_COLOURS[((i % TRACK_COLOURS.length) + TRACK_COLOURS.length) % TRACK_COLOURS.length];

export const BAR_BEATS = 4;

export function newVoice(n: number, id: string): RollVoice {
  return { id, name: `Melody ${n}`, velocity: 0.8, notes: [] };
}

export function emptyDoc(id: string): RollDoc {
  return { title: "Sketch", bpm: 100, lengthBeats: 2 * BAR_BEATS, voices: [newVoice(1, id)] };
}

const EPS = 1e-6;
/** Index of the note sounding `midi` at `beat`, or -1. */
export function noteAt(notes: readonly ScoreNote[], midi: number, beat: number): number {
  return notes.findIndex(
    (n) =>
      n.midi === midi && beat >= n.startBeat - EPS && beat < n.startBeat + n.durationBeats - EPS,
  );
}

/** Remove the note under the cell, or add one `lengthBeats` long (clipped to the sketch). */
export function toggleNote(
  doc: RollDoc,
  voiceId: string,
  midi: number,
  beat: number,
  lengthBeats: number,
): RollDoc {
  return mapVoice(doc, voiceId, (v) => {
    const i = noteAt(v.notes, midi, beat);
    if (i >= 0) return { ...v, notes: v.notes.filter((_, k) => k !== i) };
    const start = Math.floor(beat / STEP_BEATS + EPS) * STEP_BEATS;
    // A new note stops at the next note of the same pitch.
    const next = v.notes
      .filter((n) => n.midi === midi && n.startBeat > start)
      .reduce((m, n) => Math.min(m, n.startBeat), doc.lengthBeats);
    const durationBeats = Math.max(STEP_BEATS, Math.min(lengthBeats, next - start));
    return {
      ...v,
      notes: [...v.notes, { midi, startBeat: start, durationBeats, velocity: v.velocity }],
    };
  });
}

/** Set a note's length, snapped to sixteenths, at least one step and inside the sketch. */
export function resizeNote(
  doc: RollDoc,
  voiceId: string,
  index: number,
  durationBeats: number,
): RollDoc {
  return mapVoice(doc, voiceId, (v) => ({
    ...v,
    notes: v.notes.map((n, i) =>
      i === index
        ? {
            ...n,
            durationBeats: Math.max(
              STEP_BEATS,
              Math.min(
                doc.lengthBeats - n.startBeat,
                Math.round(durationBeats / STEP_BEATS) * STEP_BEATS,
              ),
            ),
          }
        : n,
    ),
  }));
}

export function setVelocity(
  doc: RollDoc,
  voiceId: string,
  index: number,
  velocity: number,
): RollDoc {
  const vel = Math.round(Math.min(1, Math.max(0.05, velocity)) * 100) / 100;
  return mapVoice(doc, voiceId, (v) => ({
    ...v,
    notes: v.notes.map((n, i) => (i === index ? { ...n, velocity: vel } : n)),
  }));
}

export function mapVoice(doc: RollDoc, voiceId: string, fn: (v: RollVoice) => RollVoice): RollDoc {
  return { ...doc, voices: doc.voices.map((v) => (v.id === voiceId ? fn(v) : v)) };
}

export function docToScore(doc: RollDoc, id: string): Score {
  return {
    id,
    title: doc.title,
    bpm: doc.bpm,
    meter: { beats: BAR_BEATS, beatUnit: 4 },
    voices: doc.voices.map((v) => {
      const avg = v.notes.reduce((s, n) => s + n.midi, 0) / (v.notes.length || 1);
      return {
        id: v.id,
        name: v.name,
        clef: v.notes.length && avg < 60 ? "bass" : "treble",
        notes: [...v.notes].sort((a, b) => a.startBeat - b.startBeat || a.midi - b.midi),
      };
    }),
    lengthBeats: doc.lengthBeats,
    source: { kind: "piano-roll" },
  };
}

export function scoreToDoc(score: Score): RollDoc {
  const end = Math.max(
    0,
    ...score.voices.flatMap((v) => v.notes.map((n) => n.startBeat + n.durationBeats)),
  );
  return {
    title: score.title,
    bpm: score.bpm,
    lengthBeats: Math.max(
      BAR_BEATS,
      Math.ceil(Math.max(score.lengthBeats, end) / BAR_BEATS) * BAR_BEATS,
    ),
    voices: score.voices.map((v, i) => ({
      id: v.id || `voice-${i + 1}`,
      name: v.name || `Voice ${i + 1}`,
      velocity: 0.8,
      notes: v.notes
        .filter((n) => !n.tieFrom)
        .map((n) => ({
          midi: n.midi,
          startBeat: n.startBeat,
          durationBeats: n.durationBeats,
          velocity: n.velocity ?? 0.8,
        })),
    })),
  };
}

/** Pitch range the roll shows: the notes plus a margin, at least C3..C5. */
export function rollRange(doc: RollDoc): { low: number; high: number } {
  const all = doc.voices.flatMap((v) => v.notes.map((n) => n.midi));
  const low = Math.min(48, ...all.map((m) => m - 2));
  const high = Math.max(72, ...all.map((m) => m + 2));
  return {
    low: Math.max(0, Math.floor(low / 12) * 12),
    high: Math.min(127, Math.ceil((high + 1) / 12) * 12 - 1),
  };
}

/** Make the sketch `beats` long; notes past the new end go, notes across it are cut. */
export function setLength(doc: RollDoc, beats: number): RollDoc {
  return {
    ...doc,
    lengthBeats: beats,
    voices: doc.voices.map((v) => ({
      ...v,
      notes: v.notes
        .filter((n) => n.startBeat < beats - EPS)
        .map((n) => ({ ...n, durationBeats: Math.min(n.durationBeats, beats - n.startBeat) })),
    })),
  };
}
