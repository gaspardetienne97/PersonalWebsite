import { loadPathText } from "@repo/music-core/progress/path-text";

// Everything the music app stores is client-side (IndexedDB, OPFS), so it
// renders in the browser only.
export const ssr = false;
export const prerender = false;

// The learning paths' text is a large dictionary per language: load only the
// current one, before any page reads a path.
export async function load({ data }) {
  await loadPathText();
  return data;
}
