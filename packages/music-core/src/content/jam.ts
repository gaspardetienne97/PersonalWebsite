// Jam progressions (catalog 4.10) and the tone role of every pitch class over the current chord.

import { clamp, FLAT_NAMES, pc } from "../theory/notes";
import { parseChordSymbol, toneRoles, transposeSymbol, type ToneRole } from "../theory/chords";
import { scaleSemitones } from "../theory/scales";
import { m } from "@repo/i18n/messages.js";
import { noteInputs, showNoteList } from "../theory/note-inputs";
import { showKeyName } from "../theory/note-names";

export type JamGroup = "pop" | "guitar-uke" | "jazz" | "blues" | "modal" | "songs" | "standards";
export const JAM_GROUPS: { id: JamGroup; label: string }[] = [
  { id: "pop", label: m.music_rep_jam_group_pop() },
  { id: "guitar-uke", label: m.music_rep_jam_group_guitar_uke() },
  { id: "jazz", label: m.music_rep_jam_group_jazz() },
  { id: "blues", label: m.music_rep_jam_group_blues() },
  { id: "modal", label: m.music_rep_jam_group_modal() },
  { id: "songs", label: m.music_rep_jam_group_songs() },
  { id: "standards", label: m.music_rep_jam_group_standards() },
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
  /** A standard's form (content/tunes): its sections in order, e.g. A A B A, in bars. */
  sections?: { label: string; bars: number }[];
  /** Swung or straight eighths; unset, the jazz and blues groups swing. */
  feel?: "swing" | "straight";
  /** Who wrote the tune (standards only; the changes are typed from a lead sheet). */
  composer?: string;
  /** Beats in a bar: 3 for a waltz; unset is 4. */
  beatsPerBar?: number;
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
    name: m.music_rep_jam_name_minor_ii_v_i(),
    key: "C minor",
    keyPc: 0,
    group: "jazz",
    difficulty: "advanced",
    bpm: 96,
    chords: [c("Dm7b5", 2, "D locrian"), c("G7alt", 2, "G altered"), c("Cm7", 2, "C dorian")],
  },
  {
    id: "blues",
    name: m.music_rep_jam_name_blues(),
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
    name: m.music_rep_jam_name_modal_vamp(),
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
    // Chords in its name follow the note names when shown.
    get name() {
      return showNoteList("G-D-Em-C");
    },
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
  note?: () => string,
): Progression => ({
  id: `song-${id}`,
  name,
  key,
  keyPc: parseChordSymbol(key.split(" ")[0])!.rootPc,
  group: "songs",
  difficulty: "beginner",
  bpm,
  chords: chords.map(([symbol, bars]) => c(symbol, bars, key.replace(/ minor$/, " natural minor"))),
  // Read when shown, so its note names follow the setting made after import.
  song: note
    ? {
        artist,
        get note() {
          return note();
        },
      }
    : { artist },
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
    () => m.music_rep_jam_note_capo({ key: showKeyName("A"), fret: 2 }),
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
    () => m.music_rep_jam_note_horse_with_no_name(noteInputs()),
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
    () => m.music_rep_jam_note_capo({ key: showKeyName("B"), fret: 4 }),
  ),
  song("riptide", "Riptide", "Vance Joy", "C major", 102, [
    ["Am", 1],
    ["G", 1],
    ["C", 2],
  ]),
  song(
    "country-roads",
    m.music_rep_jam_song_chorus({ title: "Take Me Home, Country Roads" }),
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
    () => m.music_rep_jam_note_capo({ key: showKeyName("A"), fret: 2 }),
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
    () => m.music_rep_jam_note_zombie(noteInputs()),
  ),
  song("with-or-without-you", "With or Without You", "U2", "D major", 110, [
    ["D", 1],
    ["A", 1],
    ["Bm", 1],
    ["G", 1],
  ]),
  song(
    "let-it-be",
    m.music_rep_jam_song_verse({ title: "Let It Be" }),
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
    () => m.music_rep_jam_note_let_it_be(),
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
    () => m.music_rep_jam_note_sweet_home_alabama(noteInputs()),
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

/** Scale names as Jam and the chord-scale table spell them, keyed as scaleSemitones reads them. */
const SCALE_NAMES: Record<string, () => string> = {
  major: () => m.music_rep_jam_scale_major(),
  ionian: () => m.music_rep_jam_scale_ionian(),
  minor: () => m.music_rep_jam_scale_minor(),
  "natural-minor": () => m.music_rep_jam_scale_natural_minor(),
  "harmonic-minor": () => m.music_rep_jam_scale_harmonic_minor(),
  "melodic-minor": () => m.music_rep_jam_scale_melodic_minor(),
  dorian: () => m.music_rep_jam_scale_dorian(),
  phrygian: () => m.music_rep_jam_scale_phrygian(),
  lydian: () => m.music_rep_jam_scale_lydian(),
  mixolydian: () => m.music_rep_jam_scale_mixolydian(),
  aeolian: () => m.music_rep_jam_scale_aeolian(),
  locrian: () => m.music_rep_jam_scale_locrian(),
  "locrian-#2": () => m.music_rep_jam_scale_locrian_sharp2(),
  altered: () => m.music_rep_jam_scale_altered(),
  "lydian-dominant": () => m.music_rep_jam_scale_lydian_dominant(),
  blues: () => m.music_rep_jam_scale_blues(),
  "major-blues": () => m.music_rep_jam_scale_major_blues(),
  "minor-blues": () => m.music_rep_jam_scale_minor_blues(),
  "blues-scale": () => m.music_rep_jam_scale_blues_scale(),
  "major-pentatonic": () => m.music_rep_jam_scale_major_pentatonic(),
  "minor-pentatonic": () => m.music_rep_jam_scale_minor_pentatonic(),
  "minor-triad": () => m.music_rep_jam_scale_minor_triad(),
  "whole-tone": () => m.music_rep_jam_scale_whole_tone(),
  diminished: () => m.music_rep_jam_scale_diminished(),
  "half-whole-diminished": () => m.music_rep_jam_scale_half_whole_diminished(),
  "whole-half-diminished": () => m.music_rep_jam_scale_whole_half_diminished(),
  bebop: () => m.music_rep_jam_scale_bebop(),
  "bebop-dominant": () => m.music_rep_jam_scale_bebop_dominant(),
  "dominant-bebop": () => m.music_rep_jam_scale_bebop_dominant(),
  "bebop-major": () => m.music_rep_jam_scale_bebop_major(),
};

/**
 * A scale's name ("dorian", "Melodic minor", "minor triad") in the current language, for display
 * only: a capital stays a capital, and a name it doesn't know comes back as given.
 */
export function scaleNameText(name: string): string {
  const text = SCALE_NAMES[name.trim().toLowerCase().replace(/\s+/g, "-")]?.();
  if (!text) return name;
  return /^[A-Z]/.test(name) ? text.charAt(0).toUpperCase() + text.slice(1) : text;
}

/** A progression's key ("C major", "D dorian", "C") for display, its tonic in the current note names; `key` itself stays English for the code that reads it. */
export function keyText(key: string): string {
  const [tonic, ...mode] = key.split(" ");
  const name = showKeyName(tonic);
  return mode.length ? `${name} ${scaleNameText(mode.join(" "))}` : name;
}

/** Chord tone / scale tone / avoid for all 12 pitch classes over a chord. */
export function jamToneRoles(chord: JamChord): ToneRole[] {
  const semitones = scaleSemitones(chord.scale.name) ?? [];
  return toneRoles(
    parseChordSymbol(chord.symbol)!.pcs,
    semitones.map((s) => chord.scale.rootPc + s),
  );
}

/** Beats in one bar of the progression (4 unless it is a waltz). */
export const barBeats = (p: Pick<Progression, "beatsPerBar">) => p.beatsPerBar ?? 4;

/** Total bars in one chorus. */
export const chorusBars = (p: Progression) => p.chords.reduce((n, ch) => n + ch.bars, 0);

/** Whether the eighths swing: a standard says so, otherwise the jazz and blues groups do. */
export const swings = (p: Progression) =>
  p.feel ? p.feel === "swing" : p.group === "jazz" || p.group === "blues";
