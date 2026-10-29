// Key signatures for the reading drill and pitch spelling in a key.

import { FLAT_NAMES, SHARP_NAMES, pc, pcOf } from "./notes";

export interface KeySignature {
  name: string;
  tonic: string;
  tonicPc: number;
  mode: "major" | "minor";
  /** Circle-of-fifths position, -7..7 (matches Score.keyFifths). */
  fifths: number;
}

const key = (name: string, fifths: number): KeySignature => {
  const [tonic, mode] = name.split(" ") as [string, "major" | "minor"];
  return { name, tonic, tonicPc: pcOf(tonic)!, mode, fifths };
};

/** The selectable reading keys: the first eight, then the keys to five sharps and five flats the later levels add. */
export const KEY_SIGNATURES: KeySignature[] = [
  key("C major", 0),
  key("G major", 1),
  key("F major", -1),
  key("D major", 2),
  key("Bb major", -2),
  key("A minor", 0),
  key("E minor", 1),
  key("D minor", -1),
  key("A major", 3),
  key("E major", 4),
  key("Eb major", -3),
  key("Ab major", -4),
  key("B minor", 2),
  key("F# minor", 3),
  key("C# minor", 4),
  key("G minor", -2),
  key("C minor", -3),
  key("F minor", -4),
  // Five sharps and flats, for Grade 7 sight-reading (G# minor's leading tone is a double sharp, left out).
  key("B major", 5),
  key("Db major", -5),
  key("Bb minor", -5),
];
export const keyByName = (name: string) => KEY_SIGNATURES.find((k) => k.name === name);

/** The 17-name chromatic answer list. */
export const CHOICE_NAMES = [
  "C",
  "C#",
  "Db",
  "D",
  "D#",
  "Eb",
  "E",
  "F",
  "F#",
  "Gb",
  "G",
  "G#",
  "Ab",
  "A",
  "A#",
  "Bb",
  "B",
] as const;

const LETTERS = ["C", "D", "E", "F", "G", "A", "B"];
const SHARP_ORDER = ["F", "C", "G", "D", "A", "E", "B"];
const FLAT_ORDER = ["B", "E", "A", "D", "G", "C", "F"];

/** The seven diatonic names of a key, letter by letter, with the signature's accidentals. */
export function diatonicNames(k: KeySignature): string[] {
  return LETTERS.map((l) =>
    k.fifths > 0 && SHARP_ORDER.slice(0, k.fifths).includes(l)
      ? l + "#"
      : k.fifths < 0 && FLAT_ORDER.slice(0, -k.fifths).includes(l)
        ? l + "b"
        : l,
  );
}

/**
 * Spell a pitch (MIDI or pitch class) in a key: diatonic notes by the signature,
 * a minor key's raised leading tone as a sharp on the 7th letter, and other
 * chromatic notes with sharps in sharp/natural keys and flats in flat keys.
 */
export function spellInKey(midiOrPc: number, k: KeySignature): string {
  const p = pc(midiOrPc);
  const diatonic = diatonicNames(k).find((n) => pcOf(n) === p);
  if (diatonic) return diatonic;
  if (k.mode === "minor" && p === pc(k.tonicPc - 1)) {
    // The key's own seventh raised a semitone: G to G# in A minor, Bb to B in C minor.
    const seventh = diatonicNames(k)[(LETTERS.indexOf(k.tonic[0]) + 6) % 7];
    return seventh.endsWith("b") ? seventh[0] : seventh + "#";
  }
  return (k.fifths < 0 ? FLAT_NAMES : SHARP_NAMES)[p];
}

/** The 12 answer choices for a key, one per pitch class, spelled to the key. */
export function choicesForKey(k: KeySignature): string[] {
  // B# and E# (the raised sevenths of C# and F# minor) are not buttons; C and F are.
  return Array.from({ length: 12 }, (_, p) => {
    const name = spellInKey(p, k);
    return (CHOICE_NAMES as readonly string[]).includes(name) ? name : SHARP_NAMES[p];
  });
}

/** Enharmonic-tolerant comparison. Hyphen-joined chord answers compare note by note. */
export function enharmonicEqual(a: string, b: string): boolean {
  const as = a.split("-");
  const bs = b.split("-");
  return (
    as.length === bs.length &&
    as.every((n, i) => {
      const x = pcOf(n);
      return x !== null && x === pcOf(bs[i]);
    })
  );
}
