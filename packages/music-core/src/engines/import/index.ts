import { Midi } from "@tonejs/midi";

import { midiToNote } from "@repo/music-core/engines/theory";

export interface ImportedNote {
  midi: number;
  time: number;
  duration: number;
  velocity: number;
}

export interface ImportedTrack {
  name: string;
  notes: ImportedNote[];
}

export interface ImportedSong {
  name: string;
  durationSec: number;
  bpm: number;
  timeSignature: [number, number];
  tracks: ImportedTrack[];
  totalNotes: number;
  keyEstimate?: string;
}

/** Parse a MIDI file (`.mid`) into a normalized, projectable song model. */
export function parseMidiFile(data: ArrayBuffer, fallbackName = "Untitled"): ImportedSong {
  const midi = new Midi(data);
  const bpm = midi.header.tempos[0]?.bpm ?? 120;
  const ts = midi.header.timeSignatures[0]?.timeSignature ?? [4, 4];

  const tracks: ImportedTrack[] = midi.tracks
    .map((track) => ({
      name: track.name || track.instrument?.name || "Track",
      notes: track.notes.map((note) => ({
        midi: note.midi,
        time: note.time,
        duration: note.duration,
        velocity: note.velocity,
      })),
    }))
    .filter((track) => track.notes.length > 0);

  const allNotes = tracks.flatMap((track) => track.notes);

  return {
    name: midi.name || fallbackName,
    durationSec: midi.duration,
    bpm,
    timeSignature: [ts[0] ?? 4, ts[1] ?? 4],
    tracks,
    totalNotes: allNotes.length,
    keyEstimate: estimateKey(allNotes),
  };
}

/**
 * Lightweight key estimate: duration-weighted pitch-class histogram picks the
 * tonic; major vs minor is decided by which third is more present. Labeled as
 * an estimate — not a full key-finding algorithm.
 */
export function estimateKey(notes: ImportedNote[]): string | undefined {
  if (notes.length === 0) return undefined;

  const weights = new Array<number>(12).fill(0);
  for (const note of notes) {
    weights[((note.midi % 12) + 12) % 12] += Math.max(note.duration, 0.1);
  }

  const maxWeight = Math.max(...weights);
  const candidates = weights.flatMap((weight, pc) => (weight === maxWeight ? [pc] : []));
  let tonic = candidates[0]!;
  if (candidates.length > 1) {
    // Tie-break toward the bass: the lowest note is the most likely root.
    const lowestPc = ((Math.min(...notes.map((note) => note.midi)) % 12) + 12) % 12;
    if (candidates.includes(lowestPc)) tonic = lowestPc;
  }

  const majorThird = weights[(tonic + 4) % 12]!;
  const minorThird = weights[(tonic + 3) % 12]!;
  const mode = majorThird >= minorThird ? "major" : "minor";
  const tonicName = midiToNote(60 + tonic).replace(/\d+$/, "");
  return `${tonicName} ${mode}`;
}

/** Flatten all tracks into a single time-sorted note list (for the piano-roll). */
export function pianoRoll(song: ImportedSong, maxNotes = 400): ImportedNote[] {
  return song.tracks
    .flatMap((track) => track.notes)
    .sort((left, right) => left.time - right.time)
    .slice(0, maxNotes);
}
