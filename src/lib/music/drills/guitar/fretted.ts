// Pure helpers the guitar and ukulele drills share (unit tested).
import { getNoteNaming, noteName, parseNote, showKeyName } from "@repo/music-core";
import type { Tuning } from "@repo/music-core/data/index";
import { SKILL_IDS } from "@repo/music-core/data/index";
import { exerciseIdFor } from "@repo/music-core/content/catalog";
import type { LineResult } from "@repo/music-core/scoring/technique";
import { m } from "@repo/i18n/messages.js";

export type Fretted = "guitar" | "ukulele";

/** "C on the guitar neck": a fretboard's accessible name. */
export const neckLabel = (instrument: Fretted, symbol: string) =>
  instrument === "ukulele"
    ? m.music_strings_neck_ukulele({ symbol })
    : m.music_strings_neck_guitar({ symbol });

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

/** The curated tunings' names, with their notes as placeholders so the notes follow the note-name setting. */
const TUNING_NAME: Record<string, (notes: { note: string; notes: string }) => string> = {
  "guitar.standard": () => m.music_strings_tuning_n_standard(),
  "guitar.drop-d": m.music_strings_tuning_n_drop,
  "guitar.dadgad": m.music_strings_tuning_n_spelled,
  "guitar.open-g": m.music_strings_tuning_n_open,
  "ukulele.high-g": m.music_strings_tuning_n_high,
  "ukulele.low-g": m.music_strings_tuning_n_low,
  "ukulele.baritone": m.music_strings_tuning_n_baritone,
};

/** The letters each curated name is built from. */
const TUNING_LETTERS: Record<string, string> = {
  "guitar.drop-d": "D",
  "guitar.dadgad": "DADGAD",
  "guitar.open-g": "G",
  "ukulele.high-g": "G",
  "ukulele.low-g": "G",
  "ukulele.baritone": "DGBE",
};

/**
 * A tuning's name for display. A curated name's notes follow the note-name
 * setting ("Drop D" reads "Drop Re", "DADGAD" "Re La Re Sol La Re"); a player's
 * own tuning keeps the name they gave it. Tunings are absolute, like keys.
 */
export function tuningName(t: Pick<Tuning, "id" | "name" | "source">) {
  const name = t.source === "custom" ? undefined : TUNING_NAME[t.id];
  if (!name) return t.name;
  // The note in the name ("Drop D", "Open G") or its strings ("DADGAD"), in
  // letters: core's `t.name` may already be in solfège, so it isn't parsed.
  const last = TUNING_LETTERS[t.id] ?? "";
  const notes = [...last].map(showKeyName).join(getNoteNaming() === "letters" ? "" : " ");
  return name({ note: showKeyName(last), notes });
}

/** A tuning's open strings, low to high with octaves, as the player reads note names ("E2 A2 D3 G3 B3 E4"). */
export const tuningNotes = (t: Pick<Tuning, "openStrings">) =>
  [...t.openStrings]
    .reverse()
    .map((midi) => showKeyName(noteName(midi, "flat")))
    .join(" ");

/**
 * "E2 A2 D3 G3 B3 E4" (or MIDI numbers), written low string first as players say
 * it, returned string 1 first as the tuning data stores it. A string is an error.
 */
export function parseTuningNotes(text: string): number[] | string {
  const parts = text
    .trim()
    .split(/[\s,]+/)
    .filter(Boolean);
  if (!parts.length) return m.music_strings_tuning_err_empty();
  const midis: number[] = [];
  for (const p of parts) {
    const n = /^\d+$/.test(p) ? Number(p) : /\d$/.test(p) ? parseNote(p) : null;
    if (n === null) return m.music_strings_tuning_err_note({ part: p });
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

/** How one step of a line went: right first time, a wrong note first (a slip), or never played. */
export type Outcome = "correct" | "wrong" | "missed";

/**
 * The run's numbers from its per-step marks: a step whose first note was wrong is a slip, so its notes leave
 * the clean count and the score. The grader follows the line by pitch alone and
 * would count a slipped step's right note; the marks are the truth the player sees on the tab and the keys.
 * Never raises a number: a step counts only when the marks say clean and the grader heard every note of it.
 */
export function withSlips(
  r: LineResult,
  steps: readonly { notes: readonly unknown[] }[],
  played: readonly (Outcome | undefined)[],
  /** The wrong note heard first on each slipped step, for the saved confusion. */
  firstWrong: readonly (number | undefined)[] = [],
  /** The grader's evenness weight (gradeLine's default). */
  evennessWeight = 0.15,
): LineResult & { outcomes: Outcome[]; slips: number[] } {
  // The grader writes one pitch metric per target, in step order, ahead of the timing ones.
  const pitch = r.metrics.filter((m) => m.kind === "pitch");
  let k = 0;
  let lost = 0;
  const slips: number[] = [];
  const metrics = [...r.metrics];
  const outcomes = steps.map((st, i): Outcome => {
    const at = k;
    k += st.notes.length;
    const heard = pitch.slice(at, at + st.notes.length);
    const claimed = heard.filter((m) => m.actualMidi === m.expectedMidi).length;
    const outcome: Outcome =
      played[i] === "correct" && claimed === st.notes.length
        ? "correct"
        : played[i] === "wrong"
          ? "wrong"
          : "missed";
    if (outcome === "wrong") slips.push(i);
    if (outcome !== "correct" && claimed) {
      lost += claimed;
      heard.forEach((m) => {
        if (m.actualMidi === m.expectedMidi)
          metrics[metrics.indexOf(m)] = { ...m, actualMidi: firstWrong[i] };
      });
    }
    return outcome;
  });
  const clean = r.clean - lost;
  const score = Math.max(0, r.score - (r.total ? (lost / r.total) * (1 - evennessWeight) : 0));
  return {
    ...r,
    metrics,
    clean,
    pitch: r.total ? clean / r.total : 0,
    score,
    // The grader's own rule (gradeLine: 90% or more, plus any evenness floor), applied to the score with
    // the slips taken out, so a run never passes on notes the marks call slipped.
    correct: r.correct && score >= 0.9,
    outcomes,
    slips,
  };
}
