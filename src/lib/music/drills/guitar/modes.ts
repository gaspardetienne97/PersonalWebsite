import { catalogEntry } from "@repo/music-core/content/catalog";

const tabs = (id: string) => catalogEntry(id)!.modes.map((m) => ({ id: m.id, label: m.label }));

export const FRETBOARD_MODES = tabs("fretboard");
export const CHORD_MODES = tabs("chords");

/** The ?mode= value when it names one of `modes`, else the first. */
export const modeFrom = (modes: readonly { id: string }[], raw: string | null) =>
  modes.some((m) => m.id === raw) ? raw! : modes[0].id;
