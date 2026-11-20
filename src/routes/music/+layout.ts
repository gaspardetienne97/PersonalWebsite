import { getLocale } from "@repo/i18n/runtime.js";
import {
  defaultNoteNaming,
  getNoteNaming,
  rememberNoteNaming,
  setNoteNaming,
} from "@repo/music-core";
import { loadPathText } from "@repo/music-core/progress/path-text";
import { settings } from "#lib/music/runtime/settings.svelte.ts";

// Everything the music app stores is client-side (IndexedDB, OPFS), so it
// renders in the browser only.
export const ssr = false;
export const prerender = false;

// Before any page renders: the note names (letters or solfège), then the
// learning paths' text, a large dictionary per language, for the current
// language only.
export async function load({ data }) {
  await settings.ready;
  // Modules already built their text with the naming cached in this browser.
  // If the saved setting says otherwise (another browser's backup restored,
  // storage cleared), cache it and reload once so every name agrees.
  const chosen = settings.value.noteNames ?? defaultNoteNaming(getLocale());
  if (chosen !== getNoteNaming()) {
    if (rememberNoteNaming(settings.value.noteNames)) {
      location.reload();
      return new Promise<never>(() => {});
    }
    setNoteNaming(chosen);
  }
  await loadPathText();
  return data;
}
