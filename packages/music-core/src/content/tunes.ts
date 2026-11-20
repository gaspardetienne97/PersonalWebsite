// Standards for the tune player in Jam: each tune's changes and form, typed
// from a lead sheet. Chord progressions are not protected, melodies are, so
// no melody is bundled: the head is read from the player's own Real Book, or
// taken from one of their own scores with chord symbols (tuneFromScore).

import { parseChordSymbol } from "../theory/chords";
import { FLAT_NAMES, pc } from "../theory/notes";
import { scaleSemitones } from "../theory/scales";
import type { Score } from "../types";
import type { JamChord, Progression } from "./jam";
import { goToScale } from "./piano";
import { m } from "@repo/i18n/messages.js";

interface TuneSpec {
  id: string;
  name: string;
  composer: string;
  key: string;
  bpm: number;
  feel: "swing" | "straight";
  difficulty: Progression["difficulty"];
  /** 3 for a waltz; 4 when unset. */
  meter?: 3;
  /** Section order, e.g. "A A B A". */
  form: string;
  /** Each section's bars split by "|"; two chords in a bar take half each. */
  sections: Record<string, string>;
}

/** The chord's go-to scale (dorian on m7, mixolydian on 7...); a triad takes its own major, dorian or locrian. */
export function scaleFor(symbol: string): JamChord["scale"] {
  const parsed = parseChordSymbol(symbol);
  if (!parsed) throw new Error(`Unreadable chord in a tune: ${symbol}`);
  const row = goToScale(symbol);
  if (row)
    return { rootPc: parsed.rootPc, name: scaleSemitones(row.label) ? row.label : row.scale };
  const name = parsed.intervals.includes(6)
    ? "locrian"
    : parsed.intervals.includes(3)
      ? "dorian"
      : "major";
  return { rootPc: parsed.rootPc, name };
}

/** A section's chart as chords; equal whole bars in a row merge into one longer chord. */
function sectionChords(chart: string): JamChord[] {
  const out: JamChord[] = [];
  for (const bar of chart.split("|").map((b) => b.trim().split(/\s+/).filter(Boolean))) {
    if (!bar.length) continue;
    for (const symbol of bar) {
      const bars = 1 / bar.length;
      const last = out[out.length - 1];
      if (bar.length === 1 && last?.symbol === symbol && Number.isInteger(last.bars))
        last.bars += 1;
      else out.push({ symbol, bars, scale: scaleFor(symbol) });
    }
  }
  return out;
}

function tune(spec: TuneSpec): Progression {
  const keyPc = parseChordSymbol(spec.key.split(" ")[0])!.rootPc;
  const order = spec.form.split(/\s+/);
  const chords: JamChord[] = [];
  const sections: { label: string; bars: number }[] = [];
  for (const label of order) {
    const part = sectionChords(spec.sections[label]);
    sections.push({ label, bars: part.reduce((n, c) => n + c.bars, 0) });
    chords.push(...part);
  }
  return {
    id: `tune-${spec.id}`,
    name: spec.name,
    key: spec.key,
    keyPc,
    group: "standards",
    difficulty: spec.difficulty,
    bpm: spec.bpm,
    chords,
    sections,
    feel: spec.feel,
    composer: spec.composer,
    ...(spec.meter ? { beatsPerBar: spec.meter } : {}),
  };
}

// The changes as the common lead sheets give them, in the written (concert) key.
// ponytail: chord charts only, no melody; the owner reads the head from the Real Book.
export const TUNES: Progression[] = [
  tune({
    id: "jazz-blues",
    name: m.music_content_tunes_jazz_blues_name(),
    composer: m.music_content_tunes_jazz_blues_composer(),
    key: "F major",
    bpm: 120,
    feel: "swing",
    difficulty: "beginner",
    form: "A",
    sections: {
      A: "F7 | Bb7 | F7 | Cm7 F7 | Bb7 | Bdim7 | F7 | Am7 D7 | Gm7 | C7 | F7 D7 | Gm7 C7",
    },
  }),
  tune({
    id: "c-jam-blues",
    name: "C Jam Blues",
    composer: "Duke Ellington",
    key: "C major",
    bpm: 120,
    feel: "swing",
    difficulty: "beginner",
    form: "A",
    sections: { A: "C7 | F7 | C7 | C7 | F7 | F7 | C7 | C7 | Dm7 | G7 | C7 | Dm7 G7" },
  }),
  tune({
    id: "minor-blues",
    name: m.music_content_tunes_minor_blues_name(),
    composer: m.music_content_tunes_minor_blues_composer(),
    key: "C minor",
    bpm: 140,
    feel: "swing",
    difficulty: "beginner",
    form: "A",
    sections: {
      A: "Cm7 | Fm7 | Cm7 | Cm7 | Fm7 | Fm7 | Cm7 | Cm7 | Ab7 | G7alt | Cm7 | Dm7b5 G7alt",
    },
  }),
  tune({
    id: "autumn-leaves",
    name: "Autumn Leaves",
    composer: "Joseph Kosma",
    key: "G minor",
    bpm: 120,
    feel: "swing",
    difficulty: "beginner",
    form: "A A B C",
    sections: {
      A: "Cm7 | F7 | Bbmaj7 | Ebmaj7 | Am7b5 | D7 | Gm6 | Gm6",
      B: "Am7b5 | D7 | Gm6 | Gm6 | Cm7 | F7 | Bbmaj7 | Ebmaj7",
      C: "Am7b5 | D7 | Gm7 C7 | Fm7 Bb7 | Ebmaj7 | Am7b5 D7 | Gm6 | Gm6",
    },
  }),
  tune({
    id: "blue-bossa",
    name: "Blue Bossa",
    composer: "Kenny Dorham",
    key: "C minor",
    bpm: 140,
    feel: "straight",
    difficulty: "beginner",
    form: "A",
    sections: {
      A: "Cm7 | Cm7 | Fm7 | Fm7 | Dm7b5 | G7alt | Cm7 | Cm7 | Ebm7 | Ab7 | Dbmaj7 | Dbmaj7 | Dm7b5 | G7alt | Cm7 | Dm7b5 G7alt",
    },
  }),
  tune({
    id: "so-what",
    name: "So What",
    composer: "Miles Davis",
    key: "D dorian",
    bpm: 135,
    feel: "swing",
    difficulty: "beginner",
    form: "A A B A",
    sections: {
      A: "Dm7 | Dm7 | Dm7 | Dm7 | Dm7 | Dm7 | Dm7 | Dm7",
      B: "Ebm7 | Ebm7 | Ebm7 | Ebm7 | Ebm7 | Ebm7 | Ebm7 | Ebm7",
    },
  }),
  tune({
    id: "take-the-a-train",
    name: "Take the A Train",
    composer: "Billy Strayhorn",
    key: "C major",
    bpm: 160,
    feel: "swing",
    difficulty: "intermediate",
    form: "A A2 B A2",
    sections: {
      A: "C6 | C6 | D7b5 | D7b5 | Dm7 | G7 | C6 | Dm7 G7",
      A2: "C6 | C6 | D7b5 | D7b5 | Dm7 | G7 | C6 | C6",
      B: "Fmaj7 | Fmaj7 | Fmaj7 | Fmaj7 | D7 | D7 | Dm7 | G7",
    },
  }),
  tune({
    id: "rhythm-changes",
    name: m.music_content_tunes_rhythm_changes_name(),
    composer: m.music_content_tunes_rhythm_changes_composer(),
    key: "Bb major",
    bpm: 160,
    feel: "swing",
    difficulty: "intermediate",
    form: "A A2 B A",
    sections: {
      A: "Bb6 G7 | Cm7 F7 | Bb6 G7 | Cm7 F7 | Fm7 Bb7 | Eb Edim | Bb6 G7 | Cm7 F7",
      A2: "Bb6 G7 | Cm7 F7 | Bb6 G7 | Cm7 F7 | Fm7 Bb7 | Eb Edim | Cm7 F7 | Bb6",
      B: "D7 | D7 | G7 | G7 | C7 | C7 | F7 | F7",
    },
  }),
  tune({
    id: "all-of-me",
    name: "All of Me",
    composer: m.music_content_tunes_all_of_me_composer(),
    key: "C major",
    bpm: 140,
    feel: "swing",
    difficulty: "beginner",
    form: "A B",
    sections: {
      A: "C6 | C6 | E7 | E7 | A7 | A7 | Dm7 | Dm7 | E7 | E7 | Am7 | Am7 | D7 | D7 | Dm7 | G7",
      B: "C6 | C6 | E7 | E7 | A7 | A7 | Dm7 | Dm7 | F6 | Fm6 | Em7 | A7 | Dm7 | G7 | C6 | Dm7 G7",
    },
  }),
  tune({
    id: "satin-doll",
    name: "Satin Doll",
    composer: m.music_content_tunes_satin_doll_composer(),
    key: "C major",
    bpm: 130,
    feel: "swing",
    difficulty: "intermediate",
    form: "A A B A",
    sections: {
      A: "Dm7 G7 | Dm7 G7 | Em7 A7 | Em7 A7 | Am7 D7 | Abm7 Db7 | Cmaj7 | Cmaj7",
      B: "Gm7 | C7 | Fmaj7 | Fmaj7 | Am7 | D7 | Dm7 | G7",
    },
  }),
  tune({
    id: "fly-me-to-the-moon",
    name: "Fly Me to the Moon",
    composer: "Bart Howard",
    key: "C major",
    bpm: 120,
    feel: "swing",
    difficulty: "beginner",
    form: "A B A C",
    sections: {
      A: "Am7 | Dm7 | G7 | Cmaj7 | Fmaj7 | Bm7b5 | E7 | Am7 A7",
      B: "Dm7 | G7 | Cmaj7 | Am7 | Dm7 | G7 | Cmaj7 | Bm7b5 E7",
      C: "Dm7 | G7 | Em7 | A7 | Dm7 | G7 | C6 | Bm7b5 E7",
    },
  }),
  tune({
    id: "all-the-things-you-are",
    name: "All the Things You Are",
    composer: "Jerome Kern",
    key: "Ab major",
    bpm: 160,
    feel: "swing",
    difficulty: "advanced",
    form: "A1 A2 B A3",
    sections: {
      A1: "Fm7 | Bbm7 | Eb7 | Abmaj7 | Dbmaj7 | Dm7 G7 | Cmaj7 | Cmaj7",
      A2: "Cm7 | Fm7 | Bb7 | Ebmaj7 | Abmaj7 | Am7 D7 | Gmaj7 | Gmaj7",
      B: "Am7 | D7 | Gmaj7 | Gmaj7 | F#m7b5 | B7 | Emaj7 | C7#5",
      A3: "Fm7 | Bbm7 | Eb7 | Abmaj7 | Dbmaj7 | Dbm7 | Cm7 | Bdim7 | Bbm7 | Eb7 | Abmaj7 | Gm7b5 C7",
    },
  }),
  tune({
    id: "giant-steps",
    name: "Giant Steps",
    composer: "John Coltrane",
    key: "B major",
    bpm: 120,
    feel: "swing",
    difficulty: "advanced",
    form: "A",
    sections: {
      A: "Bmaj7 D7 | Gmaj7 Bb7 | Ebmaj7 | Am7 D7 | Gmaj7 Bb7 | Ebmaj7 F#7 | Bmaj7 | Fm7 Bb7 | Ebmaj7 | Am7 D7 | Gmaj7 | C#m7 F#7 | Bmaj7 | Fm7 Bb7 | Ebmaj7 | C#m7 F#7",
    },
  }),
  // Added 2026-10-27, each checked against two independent charts (iReal Pro's Jazz 1350,
  // learnjazzstandards.com, swiss-jazz.ch, Music Theory Online); extensions dropped to the
  // nearest symbol, passing chords inside a bar left out. Tempos are the jazz shelf's.
  tune({
    id: "yardbird-suite",
    name: "Yardbird Suite",
    composer: "Charlie Parker",
    key: "C major",
    bpm: 160,
    feel: "swing",
    difficulty: "intermediate",
    form: "A A2 B A3",
    sections: {
      A: "C6 | Fm7 Bb7 | C7 Bb7 | A7 | D7 | G7 | Em7 A7 | Dm7 G7",
      A2: "C6 | Fm7 Bb7 | C7 Bb7 | A7 | D7 | G7 | C6 | F#m7b5 B7b9",
      B: "Em7 | F#m7b5 B7b9 | Em7 | A7 | Dm7 | Em7b5 A7 | D7 | Dm7 G7",
      A3: "C6 | Fm7 Bb7 | C7 Bb7 | A7 | D7 | G7 | C6 | Dm7 G7",
    },
  }),
  tune({
    id: "well-you-neednt",
    name: "Well You Needn't",
    composer: m.music_content_tunes_well_you_neednt_composer(),
    key: "F",
    bpm: 160,
    feel: "swing",
    difficulty: "advanced",
    form: "A A B A",
    sections: {
      A: "F7 | Gb7 | F7 | Gb7 | F7 | Gb7 | F7 | F7",
      B: "Db7 | Db7 | D7 | D7 | Eb7 E7 | Eb7 D7 | Db7 C7 | B7 C7",
    },
  }),
  tune({
    id: "epistrophy",
    name: "Epistrophy",
    composer: m.music_content_tunes_epistrophy_composer(),
    key: "Db",
    bpm: 160,
    feel: "swing",
    difficulty: "advanced",
    form: "A B C B",
    sections: {
      A: "Db7 D7 | Db7 D7 | Db7 D7 | Db7 D7 | Eb7 E7 | Eb7 E7 | Eb7 E7 | Eb7 E7",
      B: "Eb7 E7 | Eb7 E7 | Eb7 E7 | Eb7 E7 | Db7 D7 | Db7 D7 | Db7 D7 | Db7 D7",
      C: "F#m7 | F#m7 | F#m7 | F#m7 | B7 | B7 | Db7 | D7",
    },
  }),
  tune({
    id: "ruby-my-dear",
    name: "Ruby, My Dear",
    composer: "Thelonious Monk",
    key: "Eb major",
    bpm: 66,
    feel: "swing",
    difficulty: "advanced",
    form: "A A B A2",
    sections: {
      A: "Fm7 Bb7 | Ebmaj7 | Gm7 C7 | Fmaj7 | Bbm7 Eb7 | Abmaj7 | Bbm7 A7 | Bm7 Bb7",
      B: "Amaj7 | Bm7 E7 | Amaj7 | Bb6 Bdim7 | Cm7 | Cm7 Dm7 | Ebm7 | Ab7",
      A2: "Fm7 Bb7 | Ebmaj7 | Gm7 C7 | Fmaj7 | Bbm7 Eb7 | Abmaj7 | Bbm7 A7 | Gb6 Bb7",
    },
  }),
  tune({
    id: "peace",
    name: "Peace",
    composer: "Horace Silver",
    key: "Bb major",
    bpm: 60,
    feel: "swing",
    difficulty: "advanced",
    form: "A",
    sections: {
      A: "Am7b5 D7b9 | Gm7 C7 | Bmaj7 F7 | Bbmaj7 | Bm7 E7 | Amaj7 F#m7 | Ebm7b5 Ab7 | Dbmaj7 | C7 B7 | Bbmaj7",
    },
  }),
  tune({
    id: "stella-by-starlight",
    name: "Stella by Starlight",
    composer: "Victor Young",
    key: "Bb major",
    bpm: 130,
    feel: "swing",
    difficulty: "advanced",
    form: "A B C",
    sections: {
      A: "Em7b5 | A7b9 | Cm7 | F7 | Fm7 | Bb7 | Ebmaj7 | Ab7 | Bbmaj7 | Em7b5 A7b9 | Dm7 | Bbm7 Eb7 | Fmaj7 | Em7b5 A7b9 | Am7b5 | D7b9",
      B: "G7#5 | G7#5 | Cm7 | Cm7 | Ab7#11 | Ab7#11 | Bbmaj7 | Bbmaj7",
      C: "Em7b5 | A7b9 | Dm7b5 | G7b9 | Cm7b5 | F7b9 | Bbmaj7 | Bbmaj7",
    },
  }),
  tune({
    id: "just-friends",
    name: "Just Friends",
    composer: "John Klenner",
    key: "G major",
    bpm: 180,
    feel: "swing",
    difficulty: "intermediate",
    form: "A B A C",
    sections: {
      A: "Cmaj7 | Cmaj7 | Cm7 | F7 | Gmaj7 | Gmaj7 | Bbm7 | Eb7",
      B: "Am7 | D7 | Bm7 | Em7 | A7 | A7 | Am7 | D7",
      C: "Am7 | D7 | Bm7 | Em7 | A7 | Am7 D7 | G6 | Dm7 G7",
    },
  }),
  tune({
    id: "ill-remember-april",
    name: "I'll Remember April",
    composer: "Gene de Paul",
    key: "G major",
    bpm: 180,
    feel: "swing",
    difficulty: "advanced",
    form: "A B A",
    sections: {
      A: "Gmaj7 | G6 | Gmaj7 | G6 | Gm7 | Gm6 | Gm7 | Gm6 | Am7b5 | D7b9 | Bm7b5 | E7b9 | Am7 | D7 | Gmaj7 | Gmaj7",
      B: "Cm7 | F7 | Bbmaj7 | Gm7 | Cm7 | F7 | Bbmaj7 | Bbmaj7 | Am7 | D7 | Gmaj7 | Gmaj7 | F#m7 | B7 | Emaj7 | Am7 D7",
    },
  }),
  tune({
    id: "infant-eyes",
    name: "Infant Eyes",
    composer: "Wayne Shorter",
    key: "Eb major",
    bpm: 60,
    feel: "swing",
    difficulty: "advanced",
    // Three 9-bar phrases.
    form: "A B A",
    sections: {
      A: "Gm7 | Fm7 | Ebmaj7 | A7b9 | Gbmaj7 | F7sus4 | Ebm7 | Bb7sus4 | Bb7alt",
      B: "Ebmaj7 | Emaj7 | Ebmaj7 | Emaj7 | Bmaj7 | Bb7sus4 | Abm7 | Eb7sus4 | D7b9",
    },
  }),
  tune({
    id: "footprints",
    name: "Footprints",
    composer: "Wayne Shorter",
    key: "C minor",
    bpm: 140,
    feel: "swing",
    difficulty: "intermediate",
    // The 12-bar 6/4 form, written as 24 bars of 3/4.
    meter: 3,
    form: "A",
    sections: {
      A: "Cm7 | Cm7 | Cm7 | Cm7 | Cm7 | Cm7 | Cm7 | Cm7 | Fm7 | Fm7 | Fm7 | Fm7 | Cm7 | Cm7 | Cm7 | Cm7 | F#m7b5 | F7#11 | E7alt | A7alt | Cm7 | Cm7 | Cm7 | Cm7",
    },
  }),
  tune({
    id: "very-early",
    name: "Very Early",
    composer: "Bill Evans",
    key: "C major",
    bpm: 160,
    feel: "swing",
    difficulty: "advanced",
    meter: 3,
    form: "A A B",
    sections: {
      A: "Cmaj7 | Bb7 | Ebmaj7 | Ab7 | Dbmaj7 | G7 | Cmaj7 | Bb7 | Dmaj7 | Am7 | F#m7 | B7 | Em7 | Ab7 | Dbmaj7 | G7",
      B: "Bmaj7 | Ab7 | Dbmaj7 | Bb7 | Bmaj7 | G7 | Cmaj7 | Ab7 | Dbmaj7 | G7 | Cmaj7 | A7 | Dm7 Em7 | Fmaj7 G7 | Cmaj7 | G7",
    },
  }),
  tune({
    id: "inner-urge",
    name: "Inner Urge",
    composer: "Joe Henderson",
    key: "G",
    bpm: 180,
    feel: "swing",
    difficulty: "advanced",
    form: "A B",
    sections: {
      A: "F#m7b5 | F#m7b5 | F#m7b5 | F#m7b5 | Fmaj7 | Fmaj7 | Fmaj7 | Fmaj7 | Ebmaj7 | Ebmaj7 | Ebmaj7 | Ebmaj7 | Dbmaj7 | Dbmaj7 | Dbmaj7 | Dbmaj7",
      B: "Emaj7 | Dbmaj7 | Dmaj7 | Bmaj7 | Cmaj7 | Amaj7 | Bb7#11 | Gmaj7",
    },
  }),
  tune({
    id: "summertime",
    name: "Summertime",
    composer: "George Gershwin",
    key: "A minor",
    bpm: 80,
    feel: "swing",
    difficulty: "beginner",
    form: "A",
    sections: {
      A: "Am7 | Bm7b5 E7 | Am7 | Am7 A7 | Dm7 | F7 | Bm7b5 | E7 | Am7 | Bm7b5 E7 | Am7 | D7 G7 | Cmaj7 Am7 | Bm7b5 E7 | Am7 | Bm7b5 E7",
    },
  }),
  // Checked against Wikipedia (Am7/D, Cm7/F, Bbm7/Eb, Dbm9, four bars each) and jazzadvice.com
  // (D and F sus, then Eb sus and C# minor). Dolphin Dance is not here: its charts disagree.
  tune({
    id: "maiden-voyage",
    name: "Maiden Voyage",
    composer: "Herbie Hancock",
    key: "D dorian",
    bpm: 120,
    feel: "straight",
    difficulty: "intermediate",
    form: "A A B A",
    sections: {
      A: "D7sus4 | D7sus4 | D7sus4 | D7sus4 | F7sus4 | F7sus4 | F7sus4 | F7sus4",
      B: "Eb7sus4 | Eb7sus4 | Eb7sus4 | Eb7sus4 | Dbm7 | Dbm7 | Dbm7 | Dbm7",
    },
  }),
];

/** A melody note of a tune's head, in beats from the top of the chorus. */
export interface HeadNote {
  midi: number;
  beat: number;
  end: number;
}

/**
 * One of the player's scores with chord symbols (MusicXML `<harmony>`) and a melody as a Jam tune:
 * the form from its chords, from the bar of the first chord to the end of the score, and the head
 * from its top line (the right hand's when marked; tied notes join). Null without chords or a melody,
 * or in a meter Jam does not play (it plays bars of three or four quarter notes).
 */
export function tuneFromScore(
  score: Score,
  id: string,
  title = score.title,
): { progression: Progression; head: HeadNote[] } | null {
  const perBar = (score.meter.beats * 4) / score.meter.beatUnit;
  const chart = [...(score.chords ?? [])]
    .filter((c) => parseChordSymbol(c.symbol))
    .sort((a, b) => a.startBeat - b.startBeat)
    .filter((c, i, all) => all[i + 1]?.startBeat !== c.startBeat);
  if ((perBar !== 3 && perBar !== 4) || !chart.length) return null;
  const top = Math.floor(chart[0].startBeat / perBar + 1e-6) * perBar;
  const end = top + Math.max(1, Math.ceil((score.lengthBeats - top) / perBar - 1e-6)) * perBar;
  const chords: JamChord[] = chart.flatMap((c, i) => {
    const from = i ? c.startBeat : top;
    const to = Math.min(end, chart[i + 1]?.startBeat ?? end);
    return to > from
      ? [{ symbol: c.symbol, bars: (to - from) / perBar, scale: scaleFor(c.symbol) }]
      : [];
  });
  // The top line: the highest note starting at each beat; a tie continues the note before it.
  const voices = score.voices.filter((v) => !v.drums);
  const pick = voices.filter((v) => v.hand !== "left");
  const onsets = new Map<number, HeadNote>();
  for (const n of (pick.length ? pick : voices).flatMap((v) => v.notes)) {
    const was = onsets.get(n.startBeat);
    if (!was || n.midi > was.midi)
      onsets.set(n.startBeat, {
        midi: n.midi,
        beat: n.startBeat,
        end: n.startBeat + n.durationBeats,
      });
  }
  const tied = new Set(
    (pick.length ? pick : voices).flatMap((v) =>
      v.notes.filter((n) => n.tieFrom).map((n) => n.startBeat),
    ),
  );
  const head: HeadNote[] = [];
  for (const n of [...onsets.values()].sort((a, b) => a.beat - b.beat)) {
    const last = head.at(-1);
    if (tied.has(n.beat) && last?.midi === n.midi) last.end = n.end - top;
    // ponytail: a pickup before the first chord's bar is dropped; the form starts on that bar.
    else if (n.beat >= top) head.push({ midi: n.midi, beat: n.beat - top, end: n.end - top });
  }
  if (!head.length) return null;
  const majorPc = [0, 7, 2, 9, 4, 11, 6, 1, 8, 3, 10, 5][(((score.keyFifths ?? 0) % 12) + 12) % 12];
  const minor = score.keyMode === "minor";
  const keyPc = minor ? pc(majorPc + 9) : majorPc;
  // The score's sections when they tile the form from its first chord.
  let at = top;
  const sections = (score.sections ?? []).map((x) => {
    const ok = Math.abs(x.startBeat - at) < 1e-6;
    at = x.endBeat;
    return ok ? { label: x.label, bars: Math.round((x.endBeat - x.startBeat) / perBar) } : null;
  });
  const tiled = sections.length > 0 && sections.every(Boolean) && Math.abs(at - end) < 1e-6;
  return {
    progression: {
      id,
      name: title,
      key: `${FLAT_NAMES[keyPc]} ${minor ? "minor" : "major"}`,
      keyPc,
      group: "standards",
      difficulty: "intermediate",
      bpm: score.bpm,
      chords,
      feel: "swing",
      ...(tiled ? { sections: sections as { label: string; bars: number }[] } : {}),
      ...(perBar === 3 ? { beatsPerBar: 3 } : {}),
    },
    head,
  };
}

/** Where each section starts, in bars from the top of the chorus. */
export function sectionStarts(p: Progression): { label: string; bar: number; bars: number }[] {
  let bar = 0;
  return (p.sections ?? []).map((s) => {
    const out = { ...s, bar };
    bar += s.bars;
    return out;
  });
}

/**
 * What chorus `k` (from 0) of `total` is called in a tune's form: the head in
 * and out when there are three or more, solos between them.
 */
export function chorusLabel(k: number, total: number): string {
  if (total >= 3 && k === 0) return m.music_content_tunes_chorus_head();
  if (total >= 3 && k === total - 1) return m.music_content_tunes_chorus_head_out();
  if (total >= 3) return m.music_content_tunes_chorus_solo({ n: k });
  return m.music_content_tunes_chorus({ n: k + 1 });
}

// ---------------------------------------------------------------------------
// Reharmonisation (jazz path rank 10): swap a chord in a chart for a substitute.

export type ReharmDevice =
  | "tritone"
  | "related-ii"
  | "backdoor"
  | "secondary"
  | "passing-dim"
  | "chromatic-ii-v";

export const REHARM_DEVICES: { id: ReharmDevice; label: string; about: string }[] = [
  {
    id: "tritone",
    label: m.music_content_tunes_reharm_tritone_label(),
    about: m.music_content_tunes_reharm_tritone_about(),
  },
  {
    id: "related-ii",
    label: m.music_content_tunes_reharm_related_ii_label(),
    about: m.music_content_tunes_reharm_related_ii_about(),
  },
  {
    id: "backdoor",
    label: m.music_content_tunes_reharm_backdoor_label(),
    about: m.music_content_tunes_reharm_backdoor_about(),
  },
  {
    id: "secondary",
    label: m.music_content_tunes_reharm_secondary_label(),
    about: m.music_content_tunes_reharm_secondary_about(),
  },
  {
    id: "passing-dim",
    label: m.music_content_tunes_reharm_passing_dim_label(),
    about: m.music_content_tunes_reharm_passing_dim_about(),
  },
  {
    id: "chromatic-ii-v",
    label: m.music_content_tunes_reharm_chromatic_label(),
    about: m.music_content_tunes_reharm_chromatic_about(),
  },
];

const isDominant = (symbol: string) => {
  const c = parseChordSymbol(symbol);
  return !!c && c.intervals.includes(4) && c.intervals.includes(10);
};
const chordOn = (root: number, suffix: string, bars: number): JamChord => {
  const symbol = `${FLAT_NAMES[pc(root)]}${suffix}`;
  return { symbol, bars, scale: scaleFor(symbol) };
};

/** The devices that apply to chord `i` (a dominant for the tritone sub and the related ii). */
export function reharmOptions(p: Progression, i: number): ReharmDevice[] {
  const ch = p.chords[i];
  const next = p.chords[(i + 1) % p.chords.length];
  if (!ch || !next) return [];
  const nextRoot = parseChordSymbol(next.symbol)!.rootPc;
  const out: ReharmDevice[] = [];
  if (isDominant(ch.symbol)) out.push("tritone", "related-ii");
  out.push("backdoor");
  if (!isDominant(ch.symbol) || parseChordSymbol(ch.symbol)!.rootPc !== pc(nextRoot + 7))
    out.push("secondary");
  out.push("passing-dim", "chromatic-ii-v");
  return out;
}

/** What chord `i` becomes under a device: one or more chords filling its bars. */
export function reharmChord(p: Progression, i: number, device: ReharmDevice): JamChord[] {
  const ch = p.chords[i];
  const root = parseChordSymbol(ch.symbol)!.rootPc;
  const next = parseChordSymbol(p.chords[(i + 1) % p.chords.length].symbol)!.rootPc;
  const half = ch.bars / 2;
  switch (device) {
    case "tritone":
      return [chordOn(root + 6, "7", ch.bars)];
    case "related-ii":
      return [chordOn(root + 7, "m7", half), { ...ch, bars: half }];
    case "backdoor":
      return [chordOn(next + 5, "m7", half), chordOn(next + 10, "7", half)];
    case "secondary":
      return [chordOn(next + 7, "7", ch.bars)];
    case "passing-dim":
      return [{ ...ch, bars: half }, chordOn(next - 1, "dim7", half)];
    case "chromatic-ii-v":
      return [
        { ...ch, bars: half },
        chordOn(next + 3, "m7", half / 2),
        chordOn(next + 8, "7", half / 2),
      ];
  }
}

/** Swaps as written in a setup or a link: "5:tritone,7:backdoor" (chord indexes of the chart as written). */
export function parseReharm(text: string): Map<number, ReharmDevice> {
  const ids = new Set(REHARM_DEVICES.map((d) => d.id));
  const out = new Map<number, ReharmDevice>();
  for (const part of (text ?? "").split(",")) {
    const [i, d] = part.split(":");
    if (/^\d+$/.test(i ?? "") && ids.has(d as ReharmDevice)) out.set(Number(i), d as ReharmDevice);
  }
  return out;
}

export const formatReharm = (swaps: Map<number, ReharmDevice>) =>
  [...swaps]
    .sort((a, b) => a[0] - b[0])
    .map(([i, d]) => `${i}:${d}`)
    .join(",");

/** The chart with its swaps applied; swaps on chords it does not have, or that do not apply, are dropped. */
export function reharmonise(p: Progression, swaps: Map<number, ReharmDevice>): Progression {
  if (!swaps.size) return p;
  const chords = p.chords.flatMap((ch, i) => {
    const d = swaps.get(i);
    return d && reharmOptions(p, i).includes(d) ? reharmChord(p, i, d) : [ch];
  });
  return { ...p, chords };
}

/** The run param for a reharmonised chart: the one device used, "mixed", or undefined when none. */
export function reharmDevice(swaps: Map<number, ReharmDevice>): string | undefined {
  const kinds = new Set(swaps.values());
  return kinds.size === 0 ? undefined : kinds.size === 1 ? [...kinds][0] : "mixed";
}
