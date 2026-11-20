import { getLocale } from "@repo/i18n/runtime.js";
import { defaultNoteNaming, setNoteNaming } from "@repo/music-core";
import { loadPathText } from "@repo/music-core/progress/path-text";
import { settings } from "#lib/music/runtime/settings.svelte.ts";

// Everything the music app stores is client-side (IndexedDB, OPFS), so it
// renders in the browser only.
export const ssr = false;
export const prerender = false;

// Before any page renders: the note names (letters or solfège) from the
// settings, then the learning paths' text, a large dictionary per language,
// for the current language only.
export async function load({ data }) {
  await settings.ready;
  setNoteNaming(settings.value.noteNames ?? defaultNoteNaming(getLocale()));
  await loadPathText();
  return data;
}
