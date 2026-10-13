// The circle of fifths: every major key by its signature (-7 flats to +7
// sharps), its relative minor, the order sharps and flats are added, the
// chords that belong to a key, and the neighbours one step either way.

import { pcOf } from "./notes";

/**
 * The note `fifths` fifths from C, spelled along the circle: ... Bb F C G D
 * A E B F# C# G# ... Works past seven either way (Fb, G#), which the chords of
 * the outermost keys need.
 */
export function noteAtFifths(fifths: number): string {
  const p = fifths + 1; // F is one fifth below C
  const letter = "FCGDAEB"[((p % 7) + 7) % 7];
  const acc = Math.floor(p / 7);
  return letter + (acc > 0 ? "#".repeat(acc) : "b".repeat(-acc));
}

/** Sharps are added in this order (Father Charles Goes Down And Ends Battle); flats in the reverse. */
export const SHARP_ORDER = ["F", "C", "G", "D", "A", "E", "B"] as const;
export const FLAT_ORDER = ["B", "E", "A", "D", "G", "C", "F"] as const;

export interface CircleKey {
  /** -7..7: flats are negative, sharps positive (matches Score.keyFifths). */
  fifths: number;
  major: string;
  minor: string;
  /** Pitch class of the major tonic. */
  pc: number;
  /** The accidentals in the signature, in the order they are written ("F#", "C#"...). */
  accidentals: string[];
}

export const keyAt = (fifths: number): CircleKey => {
  const f = Math.max(-7, Math.min(7, Math.round(fifths)));
  return {
    fifths: f,
    major: noteAtFifths(f),
    // The relative minor's tonic is three fifths up (a minor third below).
    minor: noteAtFifths(f + 3),
    pc: pcOf(noteAtFifths(f))!,
    accidentals:
      f > 0
        ? SHARP_ORDER.slice(0, f).map((l) => `${l}#`)
        : FLAT_ORDER.slice(0, -f).map((l) => `${l}b`),
  };
};

/** Every key signature, 7 flats to 7 sharps. */
export const ALL_KEYS: CircleKey[] = Array.from({ length: 15 }, (_, i) => keyAt(i - 7));

/**
 * The twelve positions of the wheel, clockwise from C at the top. The three
 * at the bottom have two spellings (B/Cb, F#/Gb, C#/Db): the circle shows the
 * one with fewer accidentals first, and `enharmonic` holds the other.
 */
export const CIRCLE: (CircleKey & { enharmonic?: CircleKey })[] = Array.from(
  { length: 12 },
  (_, i) => {
    // 0 C, 1 G ... 5 B, 6 F#/Gb, 7 Db ... 11 F.
    const sharps = i <= 6 ? i : i - 12;
    const k = keyAt(sharps);
    const other = i === 5 ? keyAt(-7) : i === 6 ? keyAt(-6) : i === 7 ? keyAt(7) : undefined;
    return other ? { ...k, enharmonic: other } : k;
  },
);

export const keyByMajor = (name: string) => ALL_KEYS.find((k) => k.major === name);
export const keyByMinor = (name: string) => ALL_KEYS.find((k) => k.minor === name);

/** Position of a key on the wheel (0 = C at the top, clockwise). */
export const wheelIndex = (fifths: number) => ((fifths % 12) + 12) % 12;

/**
 * The seven chords of a major key, from the wheel: I, IV and V are the key
 * and its two neighbours; ii, iii and vi are their relative minors; vii° sits
 * a step past V's minor.
 */
export function diatonicChords(fifths: number): { numeral: string; name: string }[] {
  const n = (d: number) => noteAtFifths(fifths + d);
  return [
    { numeral: "I", name: n(0) },
    { numeral: "ii", name: `${n(2)}m` },
    { numeral: "iii", name: `${n(4)}m` },
    { numeral: "IV", name: n(-1) },
    { numeral: "V", name: n(1) },
    { numeral: "vi", name: `${n(3)}m` },
    { numeral: "vii°", name: `${n(5)}°` },
  ];
}

/** The key one step clockwise (a fifth up, one more sharp) or counter-clockwise (a fourth up, one more flat). */
export const neighbour = (fifths: number, step: 1 | -1) => keyAt(fifths + step);

/** The tritone across the wheel: the dominant there substitutes for this one (G7 and Db7). */
export const opposite = (fifths: number) => CIRCLE[(wheelIndex(fifths) + 6) % 12];

/** "2 sharps", "1 flat", "no sharps or flats". */
export const accidentalCount = (fifths: number) =>
  fifths === 0
    ? "no sharps or flats"
    : `${Math.abs(fifths)} ${fifths > 0 ? "sharp" : "flat"}${Math.abs(fifths) === 1 ? "" : "s"}`;

/** Semitones from a scale's tonic to its parent major's (D dorian is C major's). */
const PARENT_MAJOR: Record<string, number> = {
  major: 0,
  "major-pentatonic": 0,
  "bebop-major": 0,
  lydian: 7,
  mixolydian: 5,
  "bebop-dominant": 5,
  dorian: 10,
  phrygian: 8,
  "natural-minor": 3,
  "harmonic-minor": 3,
  "melodic-minor": 3,
  "minor-pentatonic": 3,
  blues: 3,
  locrian: 1,
};

/** The key signature (fifths) a scale is written in; 0 for the symmetric ones (accidentals in the line). */
export function signatureFor(tonicPc: number, kind: string): number {
  const off = PARENT_MAJOR[kind];
  if (off === undefined) return 0;
  const i = CIRCLE.findIndex((k) => k.pc === (((tonicPc + off) % 12) + 12) % 12);
  return i <= 6 ? i : i - 12;
}
