// The levelled paths' text (data/paths/*.json) in the visitor's language.
//
// The path files are written in English. Each language has one dictionary,
// data/paths/i18n/<locale>.json, from an English string to its translation.
// Only the current language's dictionary is loaded (the music layout awaits
// `loadPathText` before anything renders), and a string with no entry shows in
// English. Editing a path's English therefore never shows a stale translation:
// the edited line reads in English until its dictionary entry is updated
// (`node packages/music-core/scripts/path-text.mjs` lists what's missing).
//
// Notes and chords in the text are marked ⟦C⟧, ⟦F#4⟧, ⟦Dm7⟧ in the dictionaries
// (en.json marks the English), so they follow the note-name setting:
// `showMarked` removes the marks, or renames what they hold.

import { getLocale } from "@repo/i18n/runtime.js";
import { getNoteNaming, showMarked } from "../theory/note-names";

type Dictionary = Record<string, string>;

const DICTIONARIES: Record<string, () => Promise<{ default: Dictionary }>> = {
  en: () => import("../data/paths/i18n/en.json") as Promise<{ default: Dictionary }>,
  es: () => import("../data/paths/i18n/es.json") as Promise<{ default: Dictionary }>,
  fr: () => import("../data/paths/i18n/fr.json") as Promise<{ default: Dictionary }>,
  ht: () => import("../data/paths/i18n/ht.json") as Promise<{ default: Dictionary }>,
};

let dictionary: Dictionary = {};

/** Loads the path text for a language. English needs only its note marks, and those only for solfège. */
export async function loadPathText(locale: string = getLocale()) {
  const load = locale === "en" && getNoteNaming() === "letters" ? undefined : DICTIONARIES[locale];
  dictionary = load ? (await load()).default : {};
}

/** A path string in the loaded language, or the English when it has no translation. */
export function pathString(english: string): string;
export function pathString(english: string | undefined): string | undefined;
export function pathString(english: string | undefined) {
  return english === undefined ? undefined : showMarked(dictionary[english] ?? english);
}
