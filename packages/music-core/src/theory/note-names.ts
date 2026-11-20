// How note names are shown: letters (C D E F G A B), fixed do (Do Re Mi Fa
// Sol La Si, C is always Do) or movable do (Do is the key's tonic; minor keys
// are la-based, so A minor's tonic is La). The app's data, ids, run params and
// parsing always use letters; only what's shown goes through these functions.
//
// The naming is known before any module builds text: an explicit choice is
// cached in localStorage (`rememberNoteNaming`) and read when this module
// loads; otherwise it follows the interface language. The music layout checks
// it against the saved setting, and changing it reloads the page, like the
// language.
// Movable do needs the key: a drill sets it with `setNamingKey` while it shows
// a key, or a caller passes one. Without a key, movable do reads as fixed do.

import { getLocale } from "@repo/i18n/runtime.js";

export type NoteNaming = "letters" | "fixed" | "movable";

/** A key for movable do: its tonic as a letter name ("G", "Bb", "F#") and whether it's minor. */
export interface NamingKey {
  tonic: string;
  minor?: boolean;
}

export const NOTE_NAMINGS: readonly NoteNaming[] = ["letters", "fixed", "movable"];

/** Letters in English; solfège where musicians usually learn it (Spanish, French, Creole). */
export const defaultNoteNaming = (locale: string): NoteNaming =>
  locale === "en" ? "letters" : "fixed";

const CACHE = "woodshed.noteNames";
const isNaming = (v: unknown): v is NoteNaming => NOTE_NAMINGS.includes(v as NoteNaming);

/** The cached choice, else the language's default; letters outside a browser (tests, tools). */
function initialNaming(): NoteNaming {
  if (typeof document === "undefined") return "letters";
  try {
    const cached = globalThis.localStorage?.getItem(CACHE);
    if (isNaming(cached)) return cached;
  } catch {
    // Storage can be blocked; fall back to the language.
  }
  return defaultNoteNaming(getLocale());
}

/**
 * Caches the user's explicit choice (or clears it, for "follow the language")
 * so the next page load names notes right from the start. Returns false when
 * storage is unavailable.
 */
export function rememberNoteNaming(choice: NoteNaming | undefined): boolean {
  try {
    if (choice) globalThis.localStorage.setItem(CACHE, choice);
    else globalThis.localStorage.removeItem(CACHE);
    return true;
  } catch {
    return false;
  }
}

let naming: NoteNaming = initialNaming();
let ambientKey: NamingKey | undefined;

export const setNoteNaming = (next: NoteNaming) => {
  naming = isNaming(next) ? next : "letters";
};
export const getNoteNaming = () => naming;

/** The key movable do counts from on the current screen; `undefined` clears it. */
export const setNamingKey = (key: NamingKey | undefined) => {
  ambientKey = key;
};
export const getNamingKey = () => ambientKey;

const LETTERS = ["C", "D", "E", "F", "G", "A", "B"] as const;
const SYLLABLES = ["Do", "Re", "Mi", "Fa", "Sol", "La", "Si"] as const;
const LETTER_PC = [0, 2, 4, 5, 7, 9, 11];

const ACCIDENTAL = "(##|bb|#|b|♯|♭|𝄪|𝄫)?";
const NOTE = new RegExp(`^([A-G])${ACCIDENTAL}(-?\\d+)?$`);
const ROOT = new RegExp(`^([A-G])${ACCIDENTAL}`);

const altOf = (accidental = "") =>
  ({ "": 0, "#": 1, "♯": 1, "##": 2, "𝄪": 2, b: -1, "♭": -1, bb: -2, "𝄫": -2 })[accidental] ?? 0;

/** An accidental written the way the input wrote its own (♯/♭ or #/b). */
function accidentalText(alt: number, unicode: boolean) {
  if (!alt) return "";
  const sharp = unicode ? "♯" : "#";
  const flat = unicode ? "♭" : "b";
  return (alt > 0 ? sharp : flat).repeat(Math.abs(alt));
}

/** Do's letter index and pitch class for a key (la-based minor: do is the relative major's tonic). */
function doOf(key: NamingKey) {
  const m = ROOT.exec(key.tonic.trim());
  if (!m) return undefined;
  let letter = LETTERS.indexOf(m[1] as (typeof LETTERS)[number]);
  let pitch = (LETTER_PC[letter] + altOf(m[2]) + 12) % 12;
  if (key.minor) {
    letter = (letter + 2) % 7;
    pitch = (pitch + 3) % 12;
  }
  return { letter, pitch };
}

/** One spelled pitch ("F#", "Bb", "C") in the current naming, without octave. */
function pitchText(letterName: string, accidental: string | undefined, key: NamingKey | undefined) {
  if (naming === "letters") return letterName + (accidental ?? "");
  const letter = LETTERS.indexOf(letterName as (typeof LETTERS)[number]);
  const tonic = naming === "movable" && key ? doOf(key) : undefined;
  if (!tonic) return SYLLABLES[letter] + (accidental ?? "");
  // Movable do: the degree from the spelling, the accidental from how far the
  // pitch sits from that degree in do's major scale.
  const degree = (letter - tonic.letter + 7) % 7;
  const pitch = (LETTER_PC[letter] + altOf(accidental) + 12) % 12;
  const expected = (tonic.pitch + LETTER_PC[degree]) % 12;
  const alt = ((pitch - expected + 18) % 12) - 6;
  return SYLLABLES[degree] + accidentalText(alt, /[♯♭𝄪𝄫]/u.test(accidental ?? ""));
}

/**
 * A note name for display: "F#4" stays "F#4" with letters, reads "Fa#4" in
 * fixed do, and in movable do is named from the key (in G major, "F#4" is
 * "Si4"). Anything that isn't a note name comes back unchanged.
 */
export function showNote(name: string, key: NamingKey | undefined = ambientKey): string {
  if (naming === "letters") return name;
  const m = NOTE.exec(name.trim());
  if (!m) return name;
  return pitchText(m[1], m[2], key) + (m[3] ?? "");
}

/**
 * A name already in solfège ("Do7", "Fa#maj7", "Sol"), so showing it twice is
 * harmless. Only Do and Fa could also start a letter chord ("Dom…" can't, but
 * "Fadd9" can), so a syllable counts only when a pitch or a quality follows.
 */
const SOLFEGE =
  /^(Do|Re|Mi|Fa|Sol|La|Si)(?=$|##|bb|[#b♯♭𝄪𝄫\d/(\s+°ø-]|m(?!a)|maj|min|dim|aug|sus|add)/u;

/**
 * A chord symbol for display: the root and any slash bass follow the naming,
 * the quality stays ("Dm7/G" reads "Rem7/Sol" in fixed do). Anything that
 * doesn't start with a note letter comes back unchanged.
 */
export function showChord(symbol: string, key: NamingKey | undefined = ambientKey): string {
  if (naming === "letters" || SOLFEGE.test(symbol)) return symbol;
  const m = ROOT.exec(symbol);
  if (!m) return symbol;
  const rest = symbol
    .slice(m[0].length)
    .replace(
      new RegExp(`/([A-G])${ACCIDENTAL}`),
      (_, letter: string, accidental?: string) => "/" + pitchText(letter, accidental, key),
    )
    // A note in brackets after the chord, as voicing names write the top or bass note: "C6 (E)".
    .replace(
      new RegExp(`\\(([A-G])${ACCIDENTAL}(-?\\d+)?\\)`),
      (_, letter: string, accidental?: string, octave?: string) =>
        `(${pitchText(letter, accidental, key)}${octave ?? ""})`,
    );
  return pitchText(m[1], m[2], key) + rest;
}

/**
 * A key's name for display ("Bb", "F#"). Keys are absolute, so movable do names
 * them as fixed do; letters stay letters.
 */
export function showKeyName(tonic: string): string {
  if (naming === "letters") return tonic;
  const m = NOTE.exec(tonic.trim());
  return m
    ? SYLLABLES[LETTERS.indexOf(m[1] as (typeof LETTERS)[number])] + (m[2] ?? "") + (m[3] ?? "")
    : tonic;
}

/** The marker that tags a note or chord inside free text: ⟦C⟧, ⟦F#4⟧, ⟦Dm7/G⟧. */
const MARKED = /⟦([^⟧]+)⟧/g;

/**
 * Text whose notes are marked ⟦…⟧ (the learning paths' text), with the markers
 * removed and each marked note or chord shown in the current naming.
 */
export function showMarked(text: string, key: NamingKey | undefined = ambientKey): string {
  if (!text.includes("⟦")) return text;
  return text.replace(MARKED, (_, token: string) =>
    naming === "letters" ? token : showChord(token, key),
  );
}
