// Jam chorus report (catalog 4.10): how a solo sat on the changes. Unscored:
// it describes where the notes landed (chord tone, scale tone, avoid) and
// never turns that into a grade, because an avoid tone is often a good passing note.
import { jamToneRoles, type Progression } from "../content/jam";
import type { ToneRole } from "../theory/chords";
import { pc } from "../theory/notes";
import { m } from "@repo/i18n/messages.js";
import { showChord } from "../theory/note-names";

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

function headline(t: ToneCounts, perChord: ChorusReport["perChord"]): string {
  if (!t.notes) return m.music_rep_score_jam_no_notes();
  const counts = m.music_rep_score_jam_counts({
    notes: m.music_rep_score_jam_notes({ count: t.notes }),
    chord: m.music_rep_score_jam_chord_tones({ count: t.chord }),
    scale: m.music_rep_score_jam_scale_tones({ count: t.scale }),
    avoid: m.music_rep_score_jam_avoid_notes({ count: t.avoid }),
  });
  const silent = perChord.filter((c) => !c.notes).map((c) => c.symbol);
  // Chord symbols, comma-separated in every language.
  if (silent.length && silent.length < perChord.length)
    return m.music_rep_score_jam_silent({
      counts,
      chords: silent.map((c) => showChord(c)).join(", "),
    });
  if (t.chord / t.notes >= 0.5) return m.music_rep_score_jam_on_chord({ counts });
  if (t.avoid / t.notes > 0.3) return m.music_rep_score_jam_outside({ counts });
  return m.music_rep_score_jam_try_landing({ counts });
}
