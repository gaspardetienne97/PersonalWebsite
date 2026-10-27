// Jam progressions (catalog 4.10) and the tone role of every pitch class over the current chord.

import { clamp, FLAT_NAMES, pc } from "../theory/notes";
import { parseChordSymbol, toneRoles, transposeSymbol, type ToneRole } from "../theory/chords";
import { scaleSemitones } from "../theory/scales";

export type JamGroup = "pop" | "guitar-uke" | "jazz" | "blues" | "modal" | "songs";
export const JAM_GROUPS: { id: JamGroup; label: string }[] = [
  { id: "pop", label: "Pop" },
  { id: "guitar-uke", label: "Guitar/Uke" },
  { id: "jazz", label: "Jazz" },
  { id: "blues", label: "Blues" },
  { id: "modal", label: "Modal" },
  { id: "songs", label: "Songs" },
];
export const JAM_TEMPO = { min: 40, max: 220 };
export const JAM_TRANSPOSE = { min: -12, max: 12 };

export interface JamChord {
  symbol: string;
  bars: number;
  scale: { rootPc: number; name: string };
}
export interface Progression {
  id: string;
  name: string;
  key: string;
  keyPc: number;
  group: JamGroup;
  difficulty: "beginner" | "intermediate" | "advanced";
  bpm: number;
  chords: JamChord[];
  /** A song's chords to strum along with the record (group "songs"); `note` says what is simplified. */
  song?: { artist: string; note?: string };
}

/** "Dm7 D dorian 2" -> chord; a chord with no named scale takes the key's scale. */
const c = (symbol: string, bars: number, scale: string): JamChord => {
  const [root, ...name] = scale.split(" ");
  return { symbol, bars, scale: { rootPc: parseChordSymbol(root)!.rootPc, name: name.join(" ") } };
};

// ponytail: the table gives no scale for the pop and guitar progressions; they use the key's major scale.
const BASE_PROGRESSIONS: Progression[] = [
  {
    id: "ii-v-i",
    name: "ii-V-I",
    key: "C major",
    keyPc: 0,
    group: "jazz",
    difficulty: "intermediate",
    bpm: 110,
    chords: [
      c("Dm7", 2, "D dorian"),
      c("G7", 2, "G mixolydian"),
      c("Cmaj7", 2, "C major"),
      c("A7", 2, "A mixolydian"),
    ],
  },
  {
    id: "minor-ii-v-i",
    name: "Minor ii-V-i",
    key: "C minor",
    keyPc: 0,
    group: "jazz",
    difficulty: "advanced",
    bpm: 96,
    chords: [c("Dm7b5", 2, "D locrian"), c("G7alt", 2, "G altered"), c("Cm7", 2, "C dorian")],
  },
  {
    id: "blues",
    name: "12-bar blues",
    key: "C",
    keyPc: 0,
    group: "blues",
    difficulty: "beginner",
    bpm: 95,
    chords: [
      c("C7", 4, "C mixolydian"),
      c("F7", 2, "F mixolydian"),
      c("C7", 2, "C mixolydian"),
      c("G7", 2, "G mixolydian"),
      c("C7", 2, "C mixolydian"),
    ],
  },
  {
    id: "modal",
    name: "Modal vamp",
    key: "D dorian",
    keyPc: 2,
    group: "modal",
    difficulty: "beginner",
    bpm: 84,
    chords: [c("Dm7", 4, "D dorian"), c("Em7", 4, "E dorian")],
  },
  {
    id: "pop-axis",
    name: "I-V-vi-IV",
    key: "C major",
    keyPc: 0,
    group: "pop",
    difficulty: "beginner",
    bpm: 92,
    chords: [
      c("C", 1, "C major"),
      c("G", 1, "C major"),
      c("Am", 1, "C major"),
      c("F", 1, "C major"),
    ],
  },
  {
    id: "guitar-g-d-em-c",
    name: "G-D-Em-C",
    key: "G major",
    keyPc: 7,
    group: "guitar-uke",
    difficulty: "beginner",
    bpm: 96,
    chords: [
      c("G", 1, "G major"),
      c("D", 1, "G major"),
      c("Em", 1, "G major"),
      c("C", 1, "G major"),
    ],
  },
];

/** A song's form as one loop of whole-bar chords, in the open-chord key the path teaches. */
const song = (
  id: string,
  name: string,
  artist: string,
  key: string,
  bpm: number,
  chords: [string, number][],
  note?: string,
): Progression => ({
  id: `song-${id}`,
  name,
  key,
  keyPc: parseChordSymbol(key.split(" ")[0])!.rootPc,
  group: "songs",
  difficulty: "beginner",
  bpm,
  chords: chords.map(([symbol, bars]) => c(symbol, bars, key.replace(/ minor$/, " natural minor"))),
  song: { artist, note },
});

// ponytail: chord loops only (no strum pattern or song form); the paths' shelves carry the scores.
export const SONG_PROGRESSIONS: Progression[] = [
  song("knockin-on-heavens-door", "Knockin' on Heaven's Door", "Bob Dylan", "G major", 69, [
    ["G", 1],
    ["D", 1],
    ["Am", 2],
    ["G", 1],
    ["D", 1],
    ["C", 2],
  ]),
  song(
    "stand-by-me",
    "Stand by Me",
    "Ben E. King",
    "G major",
    118,
    [
      ["G", 2],
      ["Em", 2],
      ["C", 1],
      ["D", 1],
      ["G", 2],
    ],
    "The record is in A: capo 2.",
  ),
  song(
    "horse-with-no-name",
    "A Horse With No Name",
    "America",
    "E minor",
    122,
    [
      ["Em", 1],
      ["D", 1],
      ["Em", 1],
      ["D", 1],
    ],
    "The record's second chord is D6/9 over F#; plain D here.",
  ),
  song("brown-eyed-girl", "Brown Eyed Girl", "Van Morrison", "G major", 150, [
    ["G", 1],
    ["C", 1],
    ["G", 1],
    ["D", 1],
  ]),
  song(
    "im-yours",
    "I'm Yours",
    "Jason Mraz",
    "C major",
    151,
    [
      ["C", 1],
      ["G", 1],
      ["Am", 1],
      ["F", 1],
    ],
    "The record is in B: capo 4.",
  ),
  song("riptide", "Riptide", "Vance Joy", "C major", 102, [
    ["Am", 1],
    ["G", 1],
    ["C", 2],
  ]),
  song(
    "country-roads",
    "Take Me Home, Country Roads (chorus)",
    "John Denver",
    "G major",
    82,
    [
      ["G", 1],
      ["D", 1],
      ["Em", 1],
      ["C", 1],
      ["G", 1],
      ["D", 1],
      ["C", 1],
      ["G", 1],
    ],
    "The record is in A: capo 2.",
  ),
  song(
    "zombie",
    "Zombie",
    "The Cranberries",
    "E minor",
    84,
    [
      ["Em", 1],
      ["C", 1],
      ["G", 1],
      ["D", 1],
    ],
    "The record has D over F#; plain D here.",
  ),
  song("with-or-without-you", "With or Without You", "U2", "D major", 110, [
    ["D", 1],
    ["A", 1],
    ["Bm", 1],
    ["G", 1],
  ]),
  song(
    "let-it-be",
    "Let It Be (verse)",
    "The Beatles",
    "C major",
    72,
    [
      ["C", 1],
      ["G", 1],
      ["Am", 1],
      ["F", 1],
      ["C", 1],
      ["G", 1],
      ["F", 1],
      ["C", 1],
    ],
    "The record changes chord every two beats; one a bar here.",
  ),
  song(
    "sweet-home-alabama",
    "Sweet Home Alabama",
    "Lynyrd Skynyrd",
    "D major",
    98,
    [
      ["D", 1],
      ["C", 1],
      ["G", 2],
    ],
    "The record plays C and G in one bar, with Cadd9; plain chords here.",
  ),
];

export const PROGRESSIONS: Progression[] = [...BASE_PROGRESSIONS, ...SONG_PROGRESSIONS];

/** Shift a progression by up to ±12 semitones (chord roots respelled with flats). */
export function transposeProgression(p: Progression, semitones: number): Progression {
  const t = clamp(Math.round(semitones), JAM_TRANSPOSE.min, JAM_TRANSPOSE.max);
  if (t === 0) return p;
  const [, ...mode] = p.key.split(" ");
  const keyPc = pc(p.keyPc + t);
  return {
    ...p,
    key: [FLAT_NAMES[keyPc], ...mode].join(" "),
    keyPc,
    chords: p.chords.map((ch) => ({
      ...ch,
      symbol: transposeSymbol(ch.symbol, t),
      scale: { ...ch.scale, rootPc: pc(ch.scale.rootPc + t) },
    })),
  };
}

/** Chord tone / scale tone / avoid for all 12 pitch classes over a chord. */
export function jamToneRoles(chord: JamChord): ToneRole[] {
  const semitones = scaleSemitones(chord.scale.name) ?? [];
  return toneRoles(
    parseChordSymbol(chord.symbol)!.pcs,
    semitones.map((s) => chord.scale.rootPc + s),
  );
}

/** Total bars in one chorus. */
export const chorusBars = (p: Progression) => p.chords.reduce((n, ch) => n + ch.bars, 0);
