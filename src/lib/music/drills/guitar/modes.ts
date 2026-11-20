import { goto } from "$app/navigation";
import { page } from "$app/state";
import { catalogEntry } from "@repo/music-core/content/catalog";

const tabs = (id: string) => catalogEntry(id)!.modes.map((m) => ({ id: m.id, label: m.label }));

export const FRETBOARD_MODES = tabs("fretboard");
export const CHORD_MODES = tabs("chords");

/** The ?mode= value when it names one of `modes`, else the first. */
export const modeFrom = (modes: readonly { id: string }[], raw: string | null) =>
  modes.some((m) => m.id === raw) ? raw! : modes[0].id;

/** The drill shell's tab row: switch ?mode= (the first mode has none), so Back and reload land on it. */
export function openMode(modes: readonly { id: string }[], id: string) {
  const q = new URLSearchParams(page.url.search);
  if (id === modes[0].id) q.delete("mode");
  else q.set("mode", id);
  const s = q.toString();
  void goto(s ? `?${s}` : page.url.pathname, { reset: false });
}
