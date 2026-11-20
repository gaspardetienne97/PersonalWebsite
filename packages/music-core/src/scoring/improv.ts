// Graded improvising over a Jam progression or a tune (catalog 4.10, jazz
// path rank 3). A chorus is measured on what jazz teaching counts and MIDI can
// see: chord tones on strong beats, guide tones (3rds and 7ths) landing on the
// changes, time against the grid (straight sixteenths, or the triplet grid
// when swung), rests and phrases, range, and the constraint games the paths
// name (only three notes, guide tones only, one rhythmic motif, two bars on
// and two off...), and, on a tune with its melody, quoting the head or
// playing it with fills in its rests. Each game says which measures make its score and the aim
// for each; a chorus scores its weakest part against its aim (or the mean, for
// the open game), and a run the mean of its choruses.

import { FLAT_NAMES, pc } from "../theory/notes";
import { parseChordSymbol } from "../theory/chords";
import { scaleSemitones } from "../theory/scales";
import { barBeats, type Progression } from "../content/jam";
import type { HeadNote } from "../content/tunes";
import { scaleNameText } from "../content/jam";
import { m } from "@repo/i18n/messages.js";
import { showChord, showKeyName, showNote } from "../theory/note-names";
import { noteInputs } from "../theory/note-inputs";

/** One played note, in beats from the top of the form (chorus 1, beat 1). */
export interface ImprovNote {
  midi: number;
  beat: number;
  /** When it was released, in the same beats; unknown means it rang to the next note. */
  end?: number;
}

/** Bars you play and bars the band takes, counted from the top of the run. */
export interface Windows {
  you: number;
  band: number;
  bandFirst: boolean;
  /** What the band does in its bars: keeps comping, plays a call to answer, or a drum break (trading). */
  bandPlays: "comp" | "call" | "drums";
}

export type MetricId =
  | "strong"
  | "landings"
  | "thirds"
  | "time"
  | "rests"
  | "set"
  | "motif"
  | "downbeats"
  | "approach"
  | "offbeat"
  | "windows"
  | "displaced"
  | "slips"
  | "resolved"
  | "quotes"
  | "melody"
  | "fills";

export const METRIC_LABEL: Record<MetricId, string> = {
  strong: m.music_rep_score_improv_metric_strong(),
  landings: m.music_rep_score_improv_metric_landings(),
  thirds: m.music_rep_score_improv_metric_thirds(),
  time: m.music_rep_score_improv_metric_time(),
  rests: m.music_rep_score_improv_metric_rests(),
  set: m.music_rep_score_improv_metric_set(),
  motif: m.music_rep_score_improv_metric_motif(),
  downbeats: m.music_rep_score_improv_metric_downbeats(),
  approach: m.music_rep_score_improv_metric_approach(),
  offbeat: m.music_rep_score_improv_metric_offbeat(),
  windows: m.music_rep_score_improv_metric_windows(),
  displaced: m.music_rep_score_improv_metric_displaced(),
  slips: m.music_rep_score_improv_metric_slips(),
  resolved: m.music_rep_score_improv_metric_resolved(),
  quotes: m.music_rep_score_improv_metric_quotes(),
  melody: m.music_rep_score_improv_metric_melody(),
  fills: m.music_rep_score_improv_metric_fills(),
};

/** Measures that count things (rests, slips) rather than give a share. */
export const isCount = (m: MetricId) =>
  m === "rests" || m === "displaced" || m === "slips" || m === "fills";

/** A key-relative set: semitones above the key's tonic, from the set's own root up, and what it is called on that root. */
type KeySet = { key: number[]; name: string };
type ChordSet = { chord: "guide" | "chord" };

export interface Game {
  id: string;
  label: string;
  /** What to play, shown before the run. */
  about: string;
  set?: KeySet | ChordSet;
  windows?: Windows;
  /** Only the bridge (sections B...) is graded; the A sections are free for the head or rests. */
  only?: "bridge";
  /** Played on a tune's melody: the run needs a head (one of the player's scores). */
  head?: boolean;
  /** Measures that make the score, with the aim (a share, or a count for rests); a function gets the chorus's bars and the head's rests. */
  aims: {
    metric: MetricId;
    aim: number | ((bars: number, headRests: number) => number);
  }[];
  /** The weakest part against its aim (a game's rules), or the mean of the parts (the open game). */
  combine: "min" | "mean";
}

const MINOR_PENT = [0, 3, 5, 7, 10];
const shift = (set: number[], by: number) => set.map((s) => (s + by) % 12);

export const IMPROV_GAMES: Game[] = [
  {
    id: "free",
    label: m.music_rep_score_improv_game_free(),
    about: m.music_rep_score_improv_game_free_about(),
    aims: [
      { metric: "strong", aim: 0.75 },
      { metric: "landings", aim: 0.6 },
      { metric: "time", aim: 0.9 },
      { metric: "rests", aim: (bars) => Math.max(1, Math.round(bars / 4)) },
    ],
    combine: "mean",
  },
  {
    id: "changes",
    label: m.music_rep_score_improv_game_changes(),
    about: m.music_rep_score_improv_game_changes_about(),
    aims: [
      { metric: "strong", aim: 0.75 },
      { metric: "landings", aim: 0.7 },
    ],
    combine: "min",
  },
  {
    id: "chord-tones",
    label: m.music_rep_score_improv_game_chord_tones(),
    about: m.music_rep_score_improv_game_chord_tones_about(),
    aims: [{ metric: "strong", aim: 1 }],
    combine: "min",
  },
  {
    id: "guide-tones",
    label: m.music_rep_score_improv_game_guide_tones(),
    about: m.music_rep_score_improv_game_guide_tones_about(),
    set: { chord: "guide" },
    aims: [
      { metric: "set", aim: 0.9 },
      { metric: "landings", aim: 0.8 },
    ],
    combine: "min",
  },
  {
    id: "thirds",
    label: m.music_rep_score_improv_game_thirds(),
    about: m.music_rep_score_improv_game_thirds_about(),
    aims: [{ metric: "thirds", aim: 1 }],
    combine: "min",
  },
  {
    id: "three-notes",
    label: m.music_rep_score_improv_game_three_notes(),
    get about() {
      return m.music_rep_score_improv_game_three_notes_about(noteInputs());
    },
    set: { key: [0, 3, 7], name: "minor triad" },
    aims: [
      { metric: "set", aim: 0.9 },
      { metric: "rests", aim: 6 },
    ],
    combine: "min",
  },
  {
    id: "blues-scale",
    label: m.music_rep_score_improv_game_blues_scale(),
    about: m.music_rep_score_improv_game_blues_scale_about(),
    set: { key: [0, 3, 5, 6, 7, 10], name: "blues scale" },
    aims: [{ metric: "set", aim: 1 }],
    combine: "min",
  },
  {
    id: "pentatonic-1",
    label: m.music_rep_score_improv_game_pentatonic_1(),
    get about() {
      return m.music_rep_score_improv_game_pentatonic_1_about(noteInputs());
    },
    set: { key: MINOR_PENT, name: "minor pentatonic" },
    aims: [{ metric: "set", aim: 1 }],
    combine: "min",
  },
  {
    id: "pentatonic-2",
    label: m.music_rep_score_improv_game_pentatonic_2(),
    get about() {
      return m.music_rep_score_improv_game_pentatonic_2_about(noteInputs());
    },
    set: { key: shift(MINOR_PENT, 2), name: "minor pentatonic" },
    aims: [{ metric: "set", aim: 1 }],
    combine: "min",
  },
  {
    id: "pentatonic-5",
    label: m.music_rep_score_improv_game_pentatonic_5(),
    get about() {
      return m.music_rep_score_improv_game_pentatonic_5_about(noteInputs());
    },
    set: { key: shift(MINOR_PENT, 7), name: "minor pentatonic" },
    aims: [{ metric: "set", aim: 1 }],
    combine: "min",
  },
  {
    id: "motif",
    label: m.music_rep_score_improv_game_motif(),
    about: m.music_rep_score_improv_game_motif_about(),
    aims: [
      { metric: "motif", aim: 2 / 3 },
      { metric: "downbeats", aim: 0.75 },
    ],
    combine: "min",
  },
  {
    id: "approach",
    label: m.music_rep_score_improv_game_approach(),
    about: m.music_rep_score_improv_game_approach_about(),
    aims: [{ metric: "approach", aim: 1 }],
    combine: "min",
  },
  {
    id: "off-beat",
    label: m.music_rep_score_improv_game_off_beat(),
    about: m.music_rep_score_improv_game_off_beat_about(),
    aims: [{ metric: "offbeat", aim: 1 }],
    combine: "min",
  },
  {
    id: "space",
    label: m.music_rep_score_improv_game_space(),
    about: m.music_rep_score_improv_game_space_about(),
    windows: { you: 2, band: 2, bandFirst: false, bandPlays: "comp" },
    aims: [{ metric: "windows", aim: 1 }],
    combine: "min",
  },
  {
    id: "space-1",
    label: m.music_rep_score_improv_game_space_1(),
    about: m.music_rep_score_improv_game_space_1_about(),
    windows: { you: 1, band: 1, bandFirst: false, bandPlays: "comp" },
    aims: [{ metric: "windows", aim: 1 }],
    combine: "min",
  },
  {
    id: "call-response",
    label: m.music_rep_score_improv_game_call_response(),
    about: m.music_rep_score_improv_game_call_response_about(),
    windows: { you: 2, band: 2, bandFirst: true, bandPlays: "call" },
    aims: [{ metric: "windows", aim: 1 }],
    combine: "min",
  },
  {
    id: "bridge",
    label: m.music_rep_score_improv_game_bridge(),
    about: m.music_rep_score_improv_game_bridge_about(),
    only: "bridge",
    aims: [{ metric: "landings", aim: 0.85 }],
    combine: "min",
  },
  {
    id: "displacement",
    label: m.music_rep_score_improv_game_displacement(),
    about: m.music_rep_score_improv_game_displacement_about(),
    aims: [
      {
        metric: "displaced",
        aim: (bars) => Math.max(1, Math.round((bars * 2) / 3)),
      },
    ],
    combine: "min",
  },
  {
    id: "side-slip",
    label: m.music_rep_score_improv_game_side_slip(),
    about: m.music_rep_score_improv_game_side_slip_about(),
    aims: [
      { metric: "slips", aim: 4 },
      { metric: "resolved", aim: 1 },
    ],
    combine: "min",
  },
  {
    id: "quote",
    label: m.music_rep_score_improv_game_quote(),
    about: m.music_rep_score_improv_game_quote_about(),
    head: true,
    aims: [{ metric: "quotes", aim: 1 }],
    combine: "min",
  },
  {
    id: "melody-fills",
    label: m.music_rep_score_improv_game_melody_fills(),
    about: m.music_rep_score_improv_game_melody_fills_about(),
    head: true,
    aims: [
      { metric: "melody", aim: 0.9 },
      { metric: "fills", aim: (_bars, rests) => Math.min(6, rests) },
    ],
    combine: "min",
  },
];

/**
 * Runs of `min` or more notes in `line` that play consecutive notes of `head`: the same pitch
 * classes and the same intervals (the fragment in any octave). Repeated notes in a row count once
 * in both. Each run gives its first and last index in `line`, longest first from each start.
 */
export function findQuotes(
  line: readonly number[],
  head: readonly number[],
  min = 4,
): { from: number; to: number; length: number }[] {
  const squash = (xs: readonly number[]) =>
    xs.flatMap((m, i) => (i && xs[i - 1] === m ? [] : [{ m, i }]));
  const l = squash(line);
  const h = squash(head).map((x) => x.m);
  const out: { from: number; to: number; length: number }[] = [];
  for (let i = 0; i < l.length;) {
    let best = 0;
    for (let j = 0; j < h.length; j++) {
      if (pc(l[i].m) !== pc(h[j])) continue;
      let k = 1;
      while (
        i + k < l.length &&
        j + k < h.length &&
        l[i + k].m - l[i + k - 1].m === h[j + k] - h[j + k - 1]
      )
        k++;
      best = Math.max(best, k);
    }
    if (best >= min) {
      out.push({ from: l[i].i, to: l[i + best - 1].i, length: best });
      i += best;
    } else i++;
  }
  return out;
}

/** Bars (from the top of a chorus) where an A section starts; with no sections, every 8 bars past 16. */
export function aSectionBars(p: Progression): number[] {
  const bars = Math.round(p.chords.reduce((n, c) => n + c.bars, 0));
  if (!p.sections?.length)
    return bars > 16 ? Array.from({ length: Math.ceil(bars / 8) }, (_, k) => k * 8) : [0];
  const out: number[] = [];
  let bar = 0;
  for (const s of p.sections) {
    if (s.label.startsWith("A")) out.push(bar);
    bar += s.bars;
  }
  return out.length ? out : [0];
}

export const gameOf = (id: string) => IMPROV_GAMES.find((g) => g.id === id) ?? IMPROV_GAMES[0];

/** Trading with the band: you take the first bars, the band (a drum break) the next. */
export const tradeWindows = (bars: number): Windows | undefined =>
  bars > 0 ? { you: bars, band: bars, bandFirst: false, bandPlays: "drums" } : undefined;

/** Whether bar `bar` (from the top of the run) is the band's. */
export function bandBar(w: Windows | undefined, bar: number): boolean {
  if (!w) return false;
  const cycle = w.you + w.band;
  const at = ((bar % cycle) + cycle) % cycle;
  return w.bandFirst ? at < w.band : at >= w.you;
}

// ---------------------------------------------------------------------------
// The chord timeline

interface Slot {
  symbol: string;
  start: number;
  beats: number;
  pcs: number[];
  third?: number;
  guide: number[];
  /** The chord's scale and its chord tones: anything else is outside. */
  inside: number[];
}

/**
 * A chord's 3rd (the 4th of a sus chord) and its guide tones as pitch classes: the 3rd and the 7th,
 * or the 6th of a sixth or diminished chord.
 */
export function guideTones(symbol: string): {
  third?: number;
  guide: number[];
} {
  const c = parseChordSymbol(symbol);
  const iv = (c?.intervals ?? []).map((i) => i % 12);
  const rel = (i: number) => pc((c?.rootPc ?? 0) + i);
  const third = iv.find((i) => i === 3 || i === 4) ?? iv.find((i) => i === 5);
  const seventh = iv.find((i) => i === 10 || i === 11) ?? iv.find((i) => i === 9);
  return {
    third: third === undefined ? undefined : rel(third),
    guide: [third, seventh].flatMap((i) => (i === undefined ? [] : [rel(i)])),
  };
}

/**
 * The pitch classes a set game scores over a chord, from the set's root up: what the grader counts,
 * so what Jam rings on the instrument and names in its hint. Empty when the game has no set.
 */
export function scoredSet(game: Pick<Game, "set">, keyPc: number, symbol: string): number[] {
  const set = game.set;
  if (!set) return [];
  if ("key" in set) return set.key.map((s) => pc(keyPc + s));
  return set.chord === "guide" ? guideTones(symbol).guide : (parseChordSymbol(symbol)?.pcs ?? []);
}

/**
 * Jam's one line of advice over a chord. It makes one claim. A set game names its scored set and
 * those notes only ("Only the C minor triad: C, Eb, G."); with no set it names the chord's scale.
 */
export function jamHint(
  game: Pick<Game, "set">,
  keyPc: number,
  chord: { symbol: string; scale: { rootPc: number; name: string } },
): string {
  const set = game.set;
  const notes = scoredSet(game, keyPc, chord.symbol).map((p) => FLAT_NAMES[p]);
  if (!set || !notes.length)
    return m.music_rep_score_improv_hint_scale({
      tonic: showKeyName(FLAT_NAMES[pc(chord.scale.rootPc)]),
      scale: scaleNameText(chord.scale.name),
    });
  // Note names, comma-separated in every language.
  const list = notes.map((n) => showNote(n)).join(", ");
  if ("key" in set)
    return m.music_rep_score_improv_hint_set({
      tonic: showKeyName(notes[0]),
      set: scaleNameText(set.name),
      notes: list,
    });
  const symbol = showChord(chord.symbol);
  return set.chord === "guide"
    ? m.music_rep_score_improv_hint_guide({ chord: symbol, notes: list })
    : m.music_rep_score_improv_hint_chord({ chord: symbol, notes: list });
}

function timeline(p: Progression): { slots: Slot[]; beats: number } {
  const bpb = barBeats(p);
  let at = 0;
  const slots = p.chords.map((ch) => {
    const c = parseChordSymbol(ch.symbol);
    const g = guideTones(ch.symbol);
    const slot: Slot = {
      symbol: ch.symbol,
      start: at,
      beats: ch.bars * bpb,
      pcs: c?.pcs ?? [],
      inside: [
        ...(c?.pcs ?? []),
        ...(scaleSemitones(ch.scale.name) ?? []).map((s) => pc(ch.scale.rootPc + s)),
      ],
      third: g.third,
      guide: g.guide,
    };
    at += slot.beats;
    return slot;
  });
  return { slots, beats: at };
}

// ---------------------------------------------------------------------------
// Grading

export interface Part {
  metric: MetricId;
  label: string;
  /** A share 0..1, or a count for rests; null when there was nothing to judge. */
  value: number | null;
  aim: number;
  /** min(1, value / aim). */
  credit: number;
  /** "7 of 9", "4 rests". */
  detail: string;
}

export interface ChorusGrade {
  index: number;
  notes: number;
  score: number;
  passed: boolean;
  parts: Part[];
  /** Every measure, for the results (the game's own ones are in `parts`). */
  measures: Partial<Record<MetricId, { value: number | null; detail: string }>>;
  range: { low: number; high: number } | null;
  /** Swing ratio of the off-beat eighths (1 straight, 2 triplet), when there were enough. */
  swing: number | null;
  phrases: { count: number; meanBars: number };
}

export interface ImprovGrade {
  choruses: ChorusGrade[];
  score: number;
  passed: boolean;
  headline: string;
}

export interface GradeOptions {
  game: Game;
  choruses: number;
  swing: boolean;
  bpm: number;
  /** Trading (a game's own windows win). */
  windows?: Windows;
  /** The tune's melody, in beats from the top of the chorus (games on the head). */
  head?: readonly HeadNote[];
}

const share = (n: number, d: number) => (d ? n / d : null);
const nearBeat = (beat: number, target: number, tol = 0.25) => Math.abs(beat - target) <= tol;

/** Bars (from the top of a chorus) in a tune's bridge: its sections labelled B; every bar when it has none. */
function bridgeBars(p: Progression, bars: number): Set<number> {
  const out = new Set<number>();
  let bar = 0;
  for (const s of p.sections ?? []) {
    for (let b = 0; s.label.startsWith("B") && b < s.bars; b++) out.add(bar + b);
    bar += s.bars;
  }
  return out.size ? out : new Set(Array.from({ length: bars }, (_, b) => b));
}

/** Whether bar `bar` (from the top of the run) is one you rest in: the band's, or outside the bridge. */
export function restBar(
  p: Progression,
  game: Game,
  windows: Windows | undefined,
  bar: number,
): boolean {
  if (bandBar(windows, bar)) return true;
  if (game.only !== "bridge") return false;
  const bars = Math.round(p.chords.reduce((n, c) => n + c.bars, 0));
  return !bridgeBars(p, bars).has(((bar % bars) + bars) % bars);
}

/** Grade a run of `choruses` choruses over `p` (already transposed). */
export function gradeImprov(
  p: Progression,
  notes: readonly ImprovNote[],
  opts: GradeOptions,
): ImprovGrade {
  const { slots, beats: cb } = timeline(p);
  const bpb = barBeats(p);
  const windows = opts.game.windows ?? opts.windows;
  const beatMs = 60000 / opts.bpm;
  const all = [...notes].sort((a, b) => a.beat - b.beat);
  // Where a note stops sounding: its release, else the next onset.
  const ends = all.map((n, i) => n.end ?? all[i + 1]?.beat ?? n.beat + 1);
  const slotAt = (beat: number) => {
    const at = ((beat % cb) + cb) % cb;
    return slots.find((s) => at >= s.start - 1e-9 && at < s.start + s.beats - 1e-9) ?? slots[0];
  };
  const keyPcs = (opts.game.set as KeySet | undefined)?.key?.map((s) => pc(p.keyPc + s));
  /** In the game's set over the chord sounding, or the one arriving within an eighth (an anticipation). */
  const inSet = (n: ImprovNote) => {
    const set = opts.game.set;
    if (!set) return true;
    if ("key" in set) return keyPcs!.includes(pc(n.midi));
    return [slotAt(n.beat), slotAt(n.beat + 0.5)].some((s) =>
      (set.chord === "guide" ? s.guide : s.pcs).includes(pc(n.midi)),
    );
  };
  const yours = (beat: number) => !restBar(p, opts.game, windows, Math.floor((beat + 0.5) / bpb));

  const choruses = Array.from({ length: Math.max(1, opts.choruses) }, (_, k): ChorusGrade => {
    const from = k * cb;
    const to = from + cb;
    const bars = cb / bpb;
    // A note up to half a beat early belongs to the next chorus's downbeat.
    const idx = all.flatMap((n, i) => (n.beat >= from - 0.5 && n.beat < to - 0.5 ? [i] : []));
    const mine = idx.filter((i) => yours(all[i].beat));
    const ns = mine.map((i) => all[i]);
    const measures: ChorusGrade["measures"] = {};
    const put = (
      id: MetricId,
      n: number,
      d: number,
      detail = m.music_rep_score_improv_n_of({ n, d }),
    ) =>
      (measures[id] = {
        value: share(n, d),
        detail: d ? detail : m.music_rep_score_improv_nothing(),
      });

    // Chord tones on beats 1 and 3 (beat 1 in 3/4).
    const strong = ns.filter((n) => {
      const inBar = (((n.beat - from) % bpb) + bpb) % bpb;
      return nearBeat(inBar, 0) || nearBeat(inBar, bpb) || (bpb === 4 && nearBeat(inBar, 2));
    });
    put(
      "strong",
      strong.filter((n) => slotAt(Math.round(n.beat)).pcs.includes(pc(n.midi))).length,
      strong.length,
    );

    // Landings on each change: the chord differs from the one before it (round the form).
    const changes = slots
      .filter((s, i) => s.symbol !== slots[(i - 1 + slots.length) % slots.length].symbol)
      .map((s) => ({ ...s, at: from + s.start }))
      .filter((s) => yours(s.at));
    const landed = (want: (s: Slot) => number[]) =>
      changes.filter((s) =>
        all.some((n) => n.beat >= s.at - 0.5 && n.beat <= s.at + 1 && want(s).includes(pc(n.midi))),
      ).length;
    put(
      "landings",
      landed((s) => s.guide),
      changes.length,
    );
    put(
      "thirds",
      landed((s) => (s.third === undefined ? [] : [s.third])),
      changes.length,
    );

    // Time: onsets on the triplet grid when swung, the sixteenth grid when straight.
    const grid = opts.swing ? [0, 1 / 3, 2 / 3, 1] : [0, 0.25, 0.5, 0.75, 1];
    const tolBeats = Math.max(35, Math.min(70, beatMs * 0.12)) / beatMs;
    const frac = (b: number) => b - Math.floor(b);
    put(
      "time",
      ns.filter((n) => grid.some((g) => Math.abs(frac(n.beat) - g) <= tolBeats)).length,
      ns.length,
    );
    const offs = ns.map((n) => frac(n.beat)).filter((f) => f > 0.4 && f < 0.8);
    const mo = offs.reduce((a, b) => a + b, 0) / (offs.length || 1);
    const swing = offs.length >= 4 ? Math.round((mo / (1 - mo)) * 10) / 10 : null;

    // Rests and phrases: silences of two beats or more, phrases split by a beat or more.
    let rests = 0;
    let phraseCount = 0;
    let phraseBeats = 0;
    let phraseStart = -1;
    let lastEnd = from;
    const starts: number[] = [];
    for (const i of idx) {
      const gap = all[i].beat - lastEnd;
      if (gap >= 2 - 1e-6) rests++;
      if (phraseStart < 0 || gap >= 1 - 1e-6) {
        if (phraseStart >= 0) phraseBeats += lastEnd - phraseStart;
        phraseStart = all[i].beat;
        phraseCount++;
        starts.push(all[i].beat);
      }
      lastEnd = Math.max(lastEnd, Math.min(ends[i], to));
    }
    if (phraseStart >= 0) phraseBeats += lastEnd - phraseStart;
    if (to - lastEnd >= 2 - 1e-6) rests++;
    measures.rests = {
      value: rests,
      detail: m.music_rep_score_improv_rests({ count: rests }),
    };
    const phrases = {
      count: phraseCount,
      meanBars: phraseCount ? Math.round((phraseBeats / phraseCount / bpb) * 10) / 10 : 0,
    };
    put(
      "offbeat",
      starts.filter((b) => yours(b) && frac(b) > 0.17 && frac(b) < 0.83).length,
      starts.filter((b) => yours(b)).length,
    );

    if (opts.game.set) put("set", ns.filter(inSet).length, ns.length);

    // Per bar: the rhythm on an eighth grid, beat 1, and how beat 1 was approached.
    const barRows = Array.from({ length: Math.round(bars) }, (_, b) => {
      const start = from + b * bpb;
      const inBar = ns.filter((n) => n.beat >= start - 0.25 && n.beat < start + bpb - 0.25);
      const rhythm = [...new Set(inBar.map((n) => Math.round((n.beat - start) * 2)))]
        .sort((a, c) => a - c)
        .join(",");
      const one = inBar.find((n) => nearBeat(n.beat, start));
      const chordTone = !!one && slotAt(start).pcs.includes(pc(one.midi));
      const before =
        one && [...all].reverse().find((n) => n.beat < one.beat - 0.1 && n.beat >= one.beat - 1.1);
      return {
        yours: yours(start),
        rhythm,
        chordTone,
        approached: chordTone && !!before && Math.abs(before.midi - one!.midi) === 1,
      };
    }).filter((r) => r.yours);
    const counts = new Map<string, number>();
    for (const r of barRows) if (r.rhythm) counts.set(r.rhythm, (counts.get(r.rhythm) ?? 0) + 1);
    const most = Math.max(0, ...counts.values());
    put(
      "motif",
      most,
      barRows.length,
      m.music_rep_score_improv_n_of_bars({ n: most, count: barRows.length }),
    );
    put(
      "downbeats",
      barRows.filter((r) => r.chordTone).length,
      barRows.length,
      m.music_rep_score_improv_n_of_bars({
        n: barRows.filter((r) => r.chordTone).length,
        count: barRows.length,
      }),
    );
    put(
      "approach",
      barRows.filter((r) => r.approached).length,
      barRows.length,
      m.music_rep_score_improv_n_of_bars({
        n: barRows.filter((r) => r.approached).length,
        count: barRows.length,
      }),
    );

    // Displacement: motif instances (notes split by half a beat of silence, inside a bar's
    // length), each with the rhythm of the one before and starting a beat later in the bar.
    const groups: number[][] = [];
    for (const i of mine) {
      const g = groups[groups.length - 1];
      const last = g?.[g.length - 1];
      if (g && all[i].beat - ends[last!] < 0.5 - 1e-6 && all[i].beat - all[g[0]].beat < bpb)
        g.push(i);
      else groups.push([i]);
    }
    const shape = (g: number[]) => g.map((i) => all[i].beat - all[g[0]].beat);
    const sameShape = (a: number[], b: number[]) =>
      a.length === b.length && a.every((x, j) => Math.abs(x - b[j]) <= 0.2);
    let displaced = 0;
    for (let k = 1; k < groups.length; k++) {
      const [a, b] = [groups[k - 1], groups[k]];
      const d = all[b[0]].beat - all[a[0]].beat;
      const moved = (((d % bpb) + bpb) % bpb) - 1;
      if (
        b.length >= 2 &&
        b.length <= 6 &&
        sameShape(shape(a), shape(b)) &&
        d <= 2 * bpb + 0.25 &&
        Math.abs(moved) <= 0.2
      )
        displaced++;
    }
    measures.displaced = {
      value: displaced,
      detail: m.music_rep_score_improv_displaced({ count: displaced }),
    };

    // Side-slips: three or more notes outside the chord's scale with no two inside notes in a
    // row, then the next note a chord tone on a beat within a beat and a half.
    const outside = (n: ImprovNote) => !slotAt(n.beat).inside.includes(pc(n.midi));
    const slipEnds: number[] = [];
    let seq: number[] = [];
    const close = () => {
      while (seq.length && !outside(all[seq[seq.length - 1]])) seq.pop();
      if (seq.filter((i) => outside(all[i])).length >= 3) slipEnds.push(seq[seq.length - 1]);
      seq = [];
    };
    for (const i of mine) {
      const prev = seq[seq.length - 1];
      const o = outside(all[i]);
      if (prev !== undefined && (all[i].beat - all[prev].beat >= 1 || (!o && !outside(all[prev]))))
        close();
      if (seq.length || o) seq.push(i);
    }
    close();
    const resolved = slipEnds.filter((i) => {
      const next = all.find((n) => n.beat > all[i].beat + 0.05);
      if (!next || next.beat - all[i].beat > 1.5) return false;
      const off = Math.abs(next.beat - Math.round(next.beat));
      return off <= 0.25 && slotAt(Math.round(next.beat)).pcs.includes(pc(next.midi));
    }).length;
    measures.slips = {
      value: slipEnds.length,
      detail: m.music_rep_score_improv_slips({ count: slipEnds.length }),
    };
    put("resolved", resolved, slipEnds.length);

    // The head: quotes opening each A section, its notes played, fills in its rests.
    const head = opts.head ?? [];
    let headRests = 0;
    if (opts.game.head && !head.length) {
      put("quotes", 0, 1, m.music_rep_score_improv_no_melody_quote());
      put("melody", 0, 1, m.music_rep_score_improv_no_melody_play());
    } else if (opts.game.head) {
      const line = idx.map((i) => all[i]);
      const opens = aSectionBars(p).map((b) => from + b * bpb);
      const quoted = findQuotes(
        line.map((n) => n.midi),
        head.map((n) => n.midi),
      ).map((q) => line[q.from].beat);
      put(
        "quotes",
        opens.filter((o) => quoted.some((b) => b >= o - 0.5 && b < o + 2 * bpb)).length,
        opens.length,
        m.music_rep_score_improv_a_sections({
          n: opens.filter((o) => quoted.some((b) => b >= o - 0.5 && b < o + 2 * bpb)).length,
          d: opens.length,
        }),
      );
      put(
        "melody",
        head.filter((h) =>
          line.some((n) => pc(n.midi) === pc(h.midi) && Math.abs(n.beat - from - h.beat) <= 0.5),
        ).length,
        head.length,
        undefined,
      );
      // Rests of two beats or more between the head's notes (and before the first, after the last).
      const gaps: [number, number][] = [];
      let last = 0;
      for (const h of head) {
        if (h.beat - last >= 2 - 1e-6) gaps.push([last, h.beat]);
        last = Math.max(last, h.end);
      }
      if (cb - last >= 2 - 1e-6) gaps.push([last, cb]);
      headRests = gaps.length;
      const filled = gaps.filter(([a, b]) => {
        const n = line.filter((x) => x.beat >= from + a + 0.1 && x.beat < from + b - 0.5).length;
        return n >= 2 && n <= 4;
      }).length;
      measures.fills = gaps.length
        ? {
            value: filled,
            detail: m.music_rep_score_improv_rests_filled({ n: filled, d: gaps.length }),
          }
        : { value: null, detail: m.music_rep_score_improv_no_head_rests() };
    }

    // Windows: yours has a note in it, the band's has no onset after its first half beat.
    if (windows) {
      let kept = 0;
      let total = 0;
      const lens = windows.bandFirst ? [windows.band, windows.you] : [windows.you, windows.band];
      for (let bar = 0, w = 0; bar < to / bpb - 1e-9; bar += lens[w % 2], w++) {
        if (bar < from / bpb - 1e-9) continue;
        const band = w % 2 === (windows.bandFirst ? 0 : 1);
        const s = bar * bpb;
        const e = s + lens[w % 2] * bpb;
        // The band's bars may take a landing note on their first half beat.
        const onsets = all.filter((n) => n.beat >= s + (band ? 0.5 : -0.5) && n.beat < e - 0.5);
        total++;
        if (band ? onsets.length === 0 : onsets.length > 0) kept++;
      }
      put("windows", kept, total, m.music_rep_score_improv_windows({ n: kept, d: total }));
    }

    const parts: Part[] = opts.game.aims.map(({ metric, aim }) => {
      const a = typeof aim === "function" ? aim(bars, headRests) : aim;
      const value = measures[metric]?.value ?? null;
      return {
        metric,
        label:
          metric === "strong" && bpb === 3
            ? m.music_rep_score_improv_metric_strong_bar1()
            : METRIC_LABEL[metric],
        value,
        aim: a,
        credit: value === null ? (metric === "rests" ? 0 : 1) : Math.min(1, value / a),
        detail: measures[metric]?.detail ?? "",
      };
    });
    // Trading on top of a game: the band's bars must stay yours to leave.
    if (windows && !opts.game.windows && measures.windows)
      parts.push({
        metric: "windows",
        label: METRIC_LABEL.windows,
        value: measures.windows.value,
        aim: 1,
        credit: measures.windows.value ?? 1,
        detail: measures.windows.detail,
      });
    const judged = parts.filter((x) => x.value !== null || x.metric === "rests");
    const credits = (judged.length ? judged : parts).map((x) => x.credit);
    const score =
      !ns.length && !windows
        ? 0
        : opts.game.combine === "mean"
          ? credits.reduce((a, b) => a + b, 0) / credits.length
          : Math.min(...credits);
    const lows = ns.map((n) => n.midi);
    return {
      index: k,
      notes: ns.length,
      score,
      passed: score >= 1 - 1e-9,
      parts,
      measures,
      range: lows.length ? { low: Math.min(...lows), high: Math.max(...lows) } : null,
      swing,
      phrases,
    };
  });

  const score = choruses.reduce((a, c) => a + c.score, 0) / choruses.length;
  const passed = choruses.every((c) => c.passed);
  return {
    choruses,
    score,
    passed,
    headline: headline(opts.game, choruses, passed),
  };
}

function headline(game: Game, choruses: ChorusGrade[], passed: boolean): string {
  const n = choruses.length;
  const ok = choruses.filter((c) => c.passed).length;
  if (!choruses.some((c) => c.notes)) return m.music_rep_score_improv_headline_silent();
  if (passed) return m.music_rep_score_improv_headline_passed({ game: game.label });
  // Name the weakest part across the run.
  const weakest = choruses.flatMap((c) => c.parts).reduce((w, x) => (x.credit < w.credit ? x : w));
  return m.music_rep_score_improv_headline_some({
    game: game.label,
    ok,
    count: n,
    part: weakest.label.charAt(0).toLowerCase() + weakest.label.slice(1),
    detail: weakest.detail,
    aim: isCount(weakest.metric)
      ? weakest.aim
      : m.music_rep_score_improv_percent({ pct: Math.round(weakest.aim * 100) }),
  });
}

/** "Bb3 to F5, 19 semitones". */
export const rangeText = (r: ChorusGrade["range"]) =>
  r
    ? m.music_rep_score_improv_range({
        low: showNote(`${FLAT_NAMES[pc(r.low)]}${Math.floor(r.low / 12) - 1}`),
        high: showNote(`${FLAT_NAMES[pc(r.high)]}${Math.floor(r.high / 12) - 1}`),
        count: r.high - r.low,
      })
    : m.music_rep_score_improv_no_notes();
