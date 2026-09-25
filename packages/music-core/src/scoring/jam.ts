// Jam chorus report (catalog 4.10): how a solo sat on the changes. Unscored:
// it describes where the notes landed (chord tone, scale tone, avoid) and
// never turns that into a grade, because an avoid tone is often a good passing note.
import { jamToneRoles, type Progression } from "../content/jam";
import type { ToneRole } from "../theory/chords";
import { pc } from "../theory/notes";

export interface JamNote {
  midi: number;
  /** Index into progression.chords of the chord sounding when the note began. */
  chordIndex: number;
}

export interface ToneCounts {
  notes: number;
  chord: number;
  scale: number;
  avoid: number;
}

export interface ChorusReport extends ToneCounts {
  perChord: (ToneCounts & { index: number; symbol: string })[];
  headline: string;
}

export function toneRoleOf(p: Progression, chordIndex: number, midi: number): ToneRole {
  return jamToneRoles(p.chords[chordIndex])[pc(midi)];
}

const empty = (): ToneCounts => ({ notes: 0, chord: 0, scale: 0, avoid: 0 });

export function chorusReport(p: Progression, notes: readonly JamNote[]): ChorusReport {
  const total = empty();
  const perChord = p.chords.map((c, index) => ({ ...empty(), index, symbol: c.symbol }));
  for (const n of notes) {
    const row = perChord[n.chordIndex];
    if (!row) continue;
    const role = toneRoleOf(p, n.chordIndex, n.midi);
    row.notes++;
    row[role]++;
    total.notes++;
    total[role]++;
  }
  return { ...total, perChord, headline: headline(total, perChord) };
}

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;

function headline(t: ToneCounts, perChord: ChorusReport["perChord"]): string {
  if (!t.notes) return "No notes in this chorus.";
  const counts = `${plural(t.notes, "note")}: ${plural(t.chord, "chord tone")}, ${plural(t.scale, "scale tone")}, ${plural(t.avoid, "avoid note")}.`;
  const silent = perChord.filter((c) => !c.notes).map((c) => c.symbol);
  if (silent.length && silent.length < perChord.length)
    return `${counts} Nothing was played over ${silent.join(", ")}.`;
  if (t.chord / t.notes >= 0.5) return `${counts} Most notes landed on the chord.`;
  if (t.avoid / t.notes > 0.3)
    return `${counts} Many notes sat outside the scale; aim for a chord tone on each change.`;
  return `${counts} Try landing on a chord tone as each chord arrives.`;
}
