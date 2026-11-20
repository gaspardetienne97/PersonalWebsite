// The levelled paths' text (data/paths/*.json) in the visitor's language.
//
// The path files are written in English. Each language has one dictionary,
// data/paths/i18n/<locale>.json, from an English string to its translation.
// Only the current language's dictionary is loaded (the music layout awaits
// `loadPathText` before anything renders), and a string with no entry shows in
// English. Editing a path's English therefore never shows a stale translation:
// the edited line reads in English until its dictionary entry is updated
// (`node packages/music-core/scripts/path-text.mjs` lists what's missing).

import { getLocale } from "@repo/i18n/runtime.js";

type Dictionary = Record<string, string>;

const DICTIONARIES: Record<string, () => Promise<{ default: Dictionary }>> = {
  es: () => import("../data/paths/i18n/es.json") as Promise<{ default: Dictionary }>,
  fr: () => import("../data/paths/i18n/fr.json") as Promise<{ default: Dictionary }>,
  ht: () => import("../data/paths/i18n/ht.json") as Promise<{ default: Dictionary }>,
};

let dictionary: Dictionary = {};

/** Loads the path text for a language (English needs nothing). */
export async function loadPathText(locale: string = getLocale()) {
  const load = DICTIONARIES[locale];
  dictionary = load ? (await load()).default : {};
}

/** A path string in the loaded language, or the English when it has no translation. */
export function pathString(english: string): string;
export function pathString(english: string | undefined): string | undefined;
export function pathString(english: string | undefined) {
  return english === undefined ? undefined : (dictionary[english] ?? english);
}
