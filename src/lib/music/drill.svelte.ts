// Small helpers every drill shares: capture input during a run, name its
// source and instrument honestly, and store per-setup data.
import type {
  InputEvent,
  InputSource,
  Instrument,
  NoteEvent,
  ControlEvent,
  OnsetEvent,
} from "@repo/music-core";
import type { DrillMode } from "./components/DrillShell.svelte";
import { getSetting, input, putSetting, settings } from "./runtime";
import { noteName } from "@repo/music-core";

export interface Capture {
  notes: NoteEvent[];
  controls: ControlEvent[];
  onsets: OnsetEvent[];
  stop(): void;
}

/** Collect every input event from `since` (perf ms) until stopped. */
export function capture(since = 0, onEvent?: (e: InputEvent) => void): Capture {
  const c: Capture = { notes: [], controls: [], onsets: [], stop: () => {} };
  c.stop = input.subscribe((e: InputEvent) => {
    if (e.at < since) return;
    if (e.kind === "noteon" || e.kind === "noteoff") c.notes.push(e);
    else if (e.kind === "onset") c.onsets.push(e);
    else c.controls.push(e as ControlEvent);
    onEvent?.(e);
  });
  return c;
}

/** "mixed" when a run's notes came from more than one source. */
export function runSource(
  notes: readonly { source: InputSource }[],
  fallback: InputSource = "onscreen",
): InputSource | "mixed" {
  const set = new Set(notes.map((n) => n.source));
  if (set.size === 0) return fallback;
  return set.size === 1 ? [...set][0] : "mixed";
}

/** The instrument only when unambiguous; profile-tagged MIDI wins over the picker. */
export function runInstrument(
  notes: readonly NoteEvent[],
  fallback?: Instrument,
): Instrument | undefined {
  const tagged = new Set(notes.map((n) => n.instrument).filter(Boolean));
  if (tagged.size > 1) return undefined;
  return (
    (tagged.values().next().value as Instrument | undefined) ??
    fallback ??
    settings.value.activeInstrument
  );
}

export const assistanceFor = (mode: DrillMode, hinted = false) =>
  hinted ? ("hinted" as const) : mode === "check" ? ("independent" as const) : ("guided" as const);

export const assistanceText = (mode: DrillMode, hinted = false) =>
  hinted
    ? "You used a hint, so this run is practice, not a check."
    : mode === "check"
      ? "Checked run: targets were hidden, so it counts toward mastery."
      : "Practice run: targets were shown, so it is saved as practice.";

/** A persisted map keyed by setup (tempo ladders, chord-pair history). */
export async function readKeyed<T>(key: string): Promise<Record<string, T>> {
  return getSetting<Record<string, T>>(key, {});
}
export async function writeKeyed<T>(key: string, id: string, value: T, merge?: (a: T, b: T) => T) {
  // Re-read before writing: another tab may have changed another entry.
  const stored = await readKeyed<T>(key);
  stored[id] = merge && stored[id] !== undefined ? merge(stored[id], value) : value;
  await putSetting(key, stored);
  return stored;
}

export const pct = (v: number) => `${Math.round(v * 100)}%`;

/**
 * A microphone note a quarter tone off its target (`nearMiss` in music-core) is
 * the instrument's tuning, not the playing: say so, plainly.
 */
export const tuningText = (
  miss: { midi: number; cents: number },
  heard: number,
  instrument: string,
) =>
  `That ${noteName(miss.midi, "flat", false)} is ${Math.abs(miss.cents)} cents ${miss.cents > 0 ? "sharp" : "flat"}, so it reads as ${noteName(heard, "flat", false)}. Your ${instrument} may need tuning.`;
