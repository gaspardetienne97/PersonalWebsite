// Pure helpers the guitar and ukulele drills share (unit tested).
import { parseNote } from "@repo/music-core";
import { SKILL_IDS } from "@repo/music-core/data/index";
import { exerciseIdFor } from "@repo/music-core/content/catalog";

export type Fretted = "guitar" | "ukulele";

/**
 * A catalog mode's skills for one instrument: the other instrument's children are
 * dropped, guitar children are swapped for the ukulele ones when the skill map has
 * them, and a guitar-only child with no ukulele twin is dropped rather than claimed.
 */
export function skillsFor(ids: readonly string[], instrument: Fretted): string[] {
  const other = instrument === "guitar" ? "ukulele" : "guitar";
  const out = ids.flatMap((id) => {
    if (id.startsWith(`technique.${other}.`)) {
      if (instrument === "guitar") return [];
      const twin = id.replace(/^technique\.guitar\./, "technique.ukulele.");
      return SKILL_IDS.has(twin) ? [twin] : [];
    }
    return [id];
  });
  return [...new Set(out)];
}

export const exerciseFor = (guitarExerciseId: string, instrument: Fretted) =>
  exerciseIdFor(guitarExerciseId, instrument);

/**
 * "E2 A2 D3 G3 B3 E4" (or MIDI numbers), written low string first as players say
 * it, returned string 1 first as the tuning data stores it. A string is an error.
 */
export function parseTuningNotes(text: string): number[] | string {
  const parts = text
    .trim()
    .split(/[\s,]+/)
    .filter(Boolean);
  if (!parts.length) return "Write the open strings, low to high, e.g. E2 A2 D3 G3 B3 E4.";
  const midis: number[] = [];
  for (const p of parts) {
    const n = /^\d+$/.test(p) ? Number(p) : /\d$/.test(p) ? parseNote(p) : null;
    if (n === null) return `"${p}" is not a note with an octave, like E2 or Bb3.`;
    midis.push(n);
  }
  return midis.reverse();
}

/** A tuning id from a name: custom.<slug>. */
export const customTuningId = (name: string) =>
  `custom.${
    name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "") || "tuning"
  }`;
