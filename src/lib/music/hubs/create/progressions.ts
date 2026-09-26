// Chord progressions to start a backing track from: one chord a bar, voiced
// in the middle of the keyboard with each chord moving as little as it can
// from the last. Pure.
import { FLAT_NAMES } from "@repo/music-core";
import { parseChordSymbol, transposeSymbol } from "@repo/music-core/theory/chords";
import type { RollVoice } from "./roll";
import { BAR_BEATS } from "./roll";

export interface Progression {
  id: string;
  name: string;
  /** Chord symbols in C (C minor for the minor ones), one per bar. */
  chords: string[];
  minor?: boolean;
}

export const PROGRESSIONS: Progression[] = [
  { id: "pop", name: "Pop, I-V-vi-IV", chords: ["C", "G", "Am", "F"] },
  { id: "fifties", name: "Fifties, I-vi-IV-V", chords: ["C", "Am", "F", "G"] },
  { id: "jazz", name: "Jazz, ii-V-I", chords: ["Dm7", "G7", "Cmaj7", "Cmaj7"] },
  { id: "minor", name: "Minor, i-VI-III-VII", chords: ["Cm", "Ab", "Eb", "Bb"], minor: true },
  {
    id: "andalusian",
    name: "Andalusian, i-VII-VI-V",
    chords: ["Cm", "Bb", "Ab", "G"],
    minor: true,
  },
  {
    id: "blues",
    name: "12-bar blues",
    chords: ["C7", "C7", "C7", "C7", "F7", "F7", "C7", "C7", "G7", "F7", "C7", "G7"],
  },
];

/** Keys to play them in, by name (flats), tonic pitch class as the index. */
export const KEYS = FLAT_NAMES;

const LOW = 52; // E3: the lowest note a voicing starts on

/** The inversion of `pcs` nearest to `prev` (by total movement), starting at or above LOW. */
function voice(pcs: number[], prev: number[] | null): number[] {
  const options = pcs.map((_, r) => {
    const order = [...pcs.slice(r), ...pcs.slice(0, r)];
    const notes: number[] = [];
    for (const p of order) {
      let m = LOW + ((((p - LOW) % 12) + 12) % 12);
      while (notes.length && m <= notes[notes.length - 1]) m += 12;
      notes.push(m);
    }
    return notes;
  });
  if (!prev) return options.reduce((a, b) => (b[0] < a[0] ? b : a)); // root position-ish, low
  const centre = prev.reduce((s, m) => s + m, 0) / prev.length;
  const cost = (n: number[]) => Math.abs(n.reduce((s, m) => s + m, 0) / n.length - centre);
  return options.reduce((a, b) => (cost(b) < cost(a) ? b : a));
}

/** The chord symbols of `p` in the key whose tonic is pitch class `key`. */
export const chordsIn = (p: Progression, key: number) =>
  p.chords.map((c) => (key ? transposeSymbol(c, key) : c));

/** A melody track holding the progression, one held chord a bar. */
export function progressionVoice(p: Progression, key: number, id: string): RollVoice {
  let prev: number[] | null = null;
  const notes = chordsIn(p, key).flatMap((symbol, bar) => {
    const chord = parseChordSymbol(symbol)!;
    const pcs = chord.intervals.filter((i) => i < 12).map((i) => (chord.rootPc + i) % 12);
    prev = voice(pcs, prev);
    return prev.map((midi) => ({
      midi,
      startBeat: bar * BAR_BEATS,
      durationBeats: BAR_BEATS,
      velocity: 0.7,
    }));
  });
  return {
    id,
    name: `${p.name.split(",")[0]} in ${KEYS[key]}${p.minor ? " minor" : ""}`,
    velocity: 0.7,
    sound: "e-piano",
    notes,
  };
}
