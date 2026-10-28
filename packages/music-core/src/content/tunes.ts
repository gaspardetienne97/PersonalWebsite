// Standards for the tune player in Jam: each tune's changes and form, typed
// from a lead sheet. Chord progressions are not protected, melodies are, so
// no melody is bundled: the head is read from the player's own Real Book.

import { parseChordSymbol } from "../theory/chords";
import { scaleSemitones } from "../theory/scales";
import type { JamChord, Progression } from "./jam";
import { goToScale } from "./piano";

interface TuneSpec {
  id: string;
  name: string;
  composer: string;
  key: string;
  bpm: number;
  feel: "swing" | "straight";
  difficulty: Progression["difficulty"];
  /** Section order, e.g. "A A B A". */
  form: string;
  /** Each section's bars split by "|"; two chords in a bar take half each. */
  sections: Record<string, string>;
}

/** The chord's go-to scale (dorian on m7, mixolydian on 7...); a triad takes its own major, dorian or locrian. */
function scaleFor(symbol: string): JamChord["scale"] {
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
  };
}

// The changes as the common lead sheets give them, in the written (concert) key.
// ponytail: chord charts only, no melody; the owner reads the head from the Real Book.
export const TUNES: Progression[] = [
  tune({
    id: "jazz-blues",
    name: "Jazz blues in F",
    composer: "Traditional form (Bags' Groove, Now's the Time)",
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
    name: "Minor blues in C",
    composer: "Traditional form (Mr. P.C., Equinox)",
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
    name: "Rhythm changes in Bb",
    composer: "After George Gershwin's I Got Rhythm (Oleo, Anthropology)",
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
    composer: "Gerald Marks and Seymour Simons",
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
    composer: "Duke Ellington and Billy Strayhorn",
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
];

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
  if (total >= 3 && k === 0) return "Head";
  if (total >= 3 && k === total - 1) return "Head out";
  if (total >= 3) return `Solo ${k}`;
  return `Chorus ${k + 1}`;
}
