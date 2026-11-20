// Accompaniment over a chord chart: pop, blues and gospel hand patterns, jazz
// comping and lead sheets, all as timed slots per hand (the notes struck
// together on one beat). The grader (scoring/piano gradeAccompaniment) checks
// each slot's pitch classes, so any inversion or octave of a chord counts.

import type { Score } from "../types";
import { parseChordSymbol, transposeSymbol, type ParsedChord } from "../theory/chords";
import { pc } from "../theory/notes";
import { scaleSemitones } from "../theory/scales";
import { PROGRESSIONS, barBeats, type JamGroup, type Progression } from "./jam";
import { nearestVoicing, placeVoicing } from "./piano";
import { rng, type Rand } from "./random";

export type Hand = "left" | "right";
/** Notes one hand strikes together, `beat` from the start of the run. */
export interface AccompSlot {
  hand: Hand;
  beat: number;
  dur: number;
  midi: number[];
}
export interface ChartChord {
  symbol: string;
  startBeat: number;
  durationBeats: number;
}
export interface Rendering {
  slots: AccompSlot[];
  /** Notes below this are the left hand. */
  splitMidi: number;
  beats: number;
  swing: boolean;
  chart: ChartChord[];
}

export const BEATS_PER_BAR = 4;
/** A run is at least this many bars: a four-bar loop is played twice. */
export const MIN_BARS = 8;

// ---------------------------------------------------------------------------
// Progressions: Jam's, plus the pop loops and the minor blues the paths name.

const prog = (
  id: string,
  name: string,
  group: JamGroup,
  key: string,
  bpm: number,
  chords: [string, number][],
): Progression => {
  const keyPc = parseChordSymbol(key.split(" ")[0])!.rootPc;
  const scale = { rootPc: keyPc, name: key.endsWith("minor") ? "dorian" : "major" };
  return {
    id,
    name,
    key,
    keyPc,
    group,
    difficulty: "beginner",
    bpm,
    chords: chords.map(([symbol, bars]) => ({ symbol, bars, scale })),
  };
};

const RHYTHM_TURNAROUND: [string, number][] = [
  ["Bb6", 0.5],
  ["G7", 0.5],
  ["Cm7", 0.5],
  ["F7", 0.5],
];

export const ACCOMP_PROGRESSIONS: Progression[] = [
  ...PROGRESSIONS,
  prog("pop-vi-iv-i-v", "vi-IV-I-V", "pop", "C major", 80, [
    ["Am", 1],
    ["F", 1],
    ["C", 1],
    ["G", 1],
  ]),
  prog("pop-fifties", "I-vi-IV-V", "pop", "C major", 80, [
    ["C", 1],
    ["Am", 1],
    ["F", 1],
    ["G", 1],
  ]),
  prog("pop-i-iv-vi-v", "I-IV-vi-V", "pop", "C major", 80, [
    ["C", 1],
    ["F", 1],
    ["Am", 1],
    ["G", 1],
  ]),
  prog("minor-blues", "Minor blues", "blues", "C minor", 100, [
    ["Cm7", 4],
    ["Fm7", 2],
    ["Cm7", 2],
    ["Ab7", 1],
    ["G7alt", 1],
    ["Cm7", 2],
  ]),
  prog("pop-i-vi-ii-v", "I-vi-ii-V", "pop", "C major", 100, [
    ["C", 1],
    ["Am", 1],
    ["Dm7", 1],
    ["G7", 1],
  ]),
  prog("pop-i-iv-v", "I-IV-V", "pop", "C major", 100, [
    ["C", 1],
    ["F", 1],
    ["G", 1],
    ["C", 1],
  ]),
  prog("pop-add9-sus", "I-V-vi-IV, add9 and sus", "pop", "C major", 80, [
    ["Cadd9", 1],
    ["Gsus4", 1],
    ["Asus2", 1],
    ["Fadd9", 1],
  ]),
  prog("bird-blues", "Bird blues", "jazz", "F major", 140, [
    ["Fmaj7", 1],
    ["Em7b5", 0.5],
    ["A7", 0.5],
    ["Dm7", 0.5],
    ["G7", 0.5],
    ["Cm7", 0.5],
    ["F7", 0.5],
    ["Bb7", 1],
    ["Bbm7", 0.5],
    ["Eb7", 0.5],
    ["Am7", 0.5],
    ["D7", 0.5],
    ["Abm7", 0.5],
    ["Db7", 0.5],
    ["Gm7", 1],
    ["C7", 1],
    ["Fmaj7", 0.5],
    ["D7", 0.5],
    ["Gm7", 0.5],
    ["C7", 0.5],
  ]),
  prog("rhythm-changes", "Rhythm changes, A section", "jazz", "Bb major", 160, [
    ...RHYTHM_TURNAROUND,
    ...RHYTHM_TURNAROUND,
    ["Fm7", 0.5],
    ["Bb7", 0.5],
    ["Eb", 0.5],
    ["Edim", 0.5],
    ["Bb6", 0.5],
    ["G7", 0.5],
    ["Cm7", 0.5],
    ["F7", 0.5],
  ]),
  prog("dominant-cycle", "Dominant cycle (the rhythm bridge)", "jazz", "Bb major", 120, [
    ["D7", 2],
    ["G7", 2],
    ["C7", 2],
    ["F7", 2],
  ]),
];

/** Every chord lasts whole bars: hand patterns need one chord a bar. */
export const wholeBars = (p: Progression) => p.chords.every((c) => Number.isInteger(c.bars));

// ---------------------------------------------------------------------------
// Generated chord charts (reading path chart-1 to chart-3): eight bars in C to read and play.

export const CHART_LEVELS: { id: string; label: string; about: string }[] = [
  {
    id: "chart-1",
    label: "Chart 1: one chord a bar",
    about: "Eight bars of triads, one a bar, closing on V and I.",
  },
  {
    id: "chart-2",
    label: "Chart 2: two chords in some bars",
    about: "Sevenths join the triads, and some bars change chord on beat 3.",
  },
  {
    id: "chart-3",
    label: "Chart 3: sus, add9 and slash bass",
    about: "Sus and add9 colours and slash chords (the bass named after the slash).",
  },
];
const CHART_POOLS: string[][] = [
  ["C", "Dm", "Em", "F", "G", "Am"],
  ["C", "Dm", "Em", "F", "G", "Am", "Dm7", "Em7", "Fmaj7", "G7", "Am7"],
  [
    "C",
    "Dm",
    "F",
    "G",
    "Am",
    "Dm7",
    "G7",
    "Cadd9",
    "Fadd9",
    "Gsus4",
    "Asus2",
    "G/B",
    "C/E",
    "Am/G",
    "F/G",
  ],
];
export const isChartLevel = (id: string) => CHART_LEVELS.some((l) => l.id === id);

/**
 * A new chart at a level from a seed: I to open, V (or IV) and I to close,
 * the bars between drawn from the level's chords with no chord twice running.
 * From chart-2 some bars split at beat 3. Written in C; the key picker moves it.
 */
export function chartProgression(level: string, seed = 1): Progression {
  const n = Math.max(
    0,
    CHART_LEVELS.findIndex((l) => l.id === level),
  );
  const rand = rng(seed * 7919 + n * 104729 + 1);
  const pool = CHART_POOLS[n];
  const chords: [string, number][] = [];
  let last = "";
  const draw = () => {
    const options = pool.filter((c) => c !== last);
    last = options[Math.floor(rand() * options.length)];
    return last;
  };
  const close = n === 2 ? ["Gsus4", "G", "F/G", "G7"] : n === 1 ? ["G", "G7"] : ["G"];
  for (let bar = 0; bar < 8; bar++) {
    if (bar === 0) chords.push([n === 2 ? "Cadd9" : "C", 1]);
    else if (bar === 6) chords.push([close[Math.floor(rand() * close.length)], 1]);
    else if (bar === 7) chords.push(["C", 1]);
    else if (n > 0 && rand() < 0.4) chords.push([draw(), 0.5], [draw(), 0.5]);
    else chords.push([draw(), 1]);
    last = chords[chords.length - 1][0];
  }
  return {
    id: CHART_LEVELS[n].id,
    name: CHART_LEVELS[n].label,
    key: "C major",
    keyPc: 0,
    group: "pop",
    difficulty: n === 0 ? "beginner" : "intermediate",
    bpm: 80,
    chords: chords.map(([symbol, bars]) => ({ symbol, bars, scale: { rootPc: 0, name: "major" } })),
  };
}

/** A progression's chords as a chart, transposed, looped to at least MIN_BARS and `choruses` times through. */
export function chartOf(p: Progression, transpose = 0, choruses = 1): ChartChord[] {
  const out: ChartChord[] = [];
  const bpb = barBeats(p);
  let beat = 0;
  let passes = 0;
  do {
    for (const c of p.chords) {
      out.push({
        symbol: transposeSymbol(c.symbol, transpose),
        startBeat: beat,
        durationBeats: c.bars * bpb,
      });
      beat += c.bars * bpb;
    }
    passes++;
  } while (beat < MIN_BARS * bpb || passes < choruses);
  return out;
}

const chartBeats = (chart: readonly ChartChord[]) =>
  chart.reduce((m, c) => Math.max(m, c.startBeat + c.durationBeats), 0);

// ---------------------------------------------------------------------------
// Voicing a chord

const third = (c: ParsedChord) =>
  c.intervals.find((i) => i === 3 || i === 4) ?? (c.intervals.includes(5) ? 5 : 2);
const fifth = (c: ParsedChord) => c.intervals.find((i) => i >= 6 && i <= 8) ?? 7;
/** The 7th, or the 6th of a sixth or diminished chord; undefined on a triad. */
const seventh = (c: ParsedChord) =>
  c.intervals.find((i) => i === 10 || i === 11) ?? c.intervals.find((i) => i === 9);
/** A bass in C2 to B2: the slash bass when there is one. */
const bassOf = (c: ParsedChord, low = 36) => low + pc((c.bassPc ?? c.rootPc) - low);
/** A left-hand root for shells, F2 to E3. */
const shellRoot = (c: ParsedChord) => 41 + pc(c.rootPc - 41);

/**
 * At most four pitch classes for one hand: the 3rd and 7th first, then the
 * rest, dropping the 5th and then the root from a big chord (a slash bass is the
 * left hand's).
 */
function handPcs(c: ParsedChord): number[] {
  let iv = [...new Set(c.intervals.map((i) => i % 12))];
  if (iv.length > 4) iv = iv.filter((i) => i < 6 || i > 8);
  if (iv.length > 4) iv = iv.filter((i) => i !== 0);
  const first = [third(c), seventh(c)].filter((i): i is number => i !== undefined);
  iv = [...first.filter((i) => iv.includes(i)), ...iv.filter((i) => !first.includes(i))];
  return iv.slice(0, 4).map((i) => pc(c.rootPc + i));
}

/** `pcs` in one hand inside `register`, moving least from `prev` (the middle to start). */
function lead(prev: number[] | undefined, pcs: number[], register: [number, number]) {
  const mid = prev
    ? prev.reduce((a, b) => a + b, 0) / prev.length
    : (register[0] + register[1]) / 2;
  const from =
    prev && prev.length === pcs.length
      ? prev
      : pcs.map((_, i) => mid + (i - (pcs.length - 1) / 2) * 4);
  return nearestVoicing(from, pcs, register).midi;
}

interface Voiced {
  symbol: string;
  chord: ParsedChord;
  bass: number;
  /** Right-hand chord, C4 to G5, moving least from the one before. */
  rh: number[];
  /** Left-hand close chord, A2 to B3. */
  lh: number[];
  /** The IV of this chord over it (gospel 1-4-1), near `rh`. */
  four: number[];
}

function voiceChart(chart: readonly ChartChord[]): Voiced[] {
  let rh: number[] | undefined;
  let lh: number[] | undefined;
  return chart.map(({ symbol }) => {
    const chord = parseChordSymbol(symbol);
    if (!chord) throw new Error(`Can't read the chord ${symbol}`);
    rh = lead(rh, handPcs(chord), [60, 79]);
    lh = lead(lh, handPcs(chord).slice(0, 3), [45, 59]);
    const minor = third(chord) === 3;
    const four = [0, minor ? 3 : 4, 7].map((i) => pc(chord.rootPc + 5 + i));
    return { symbol, chord, bass: bassOf(chord), rh, lh, four: lead(rh, four, [60, 79]) };
  });
}

// ---------------------------------------------------------------------------
// Hand patterns (the piano path's pattern list, numbered as the path numbers them)

interface BarCtx {
  v: Voiced;
  next: Voiced;
}
type BarFn = (x: BarCtx) => AccompSlot[];

const L = (beat: number, dur: number, ...midi: number[]): AccompSlot => ({
  hand: "left",
  beat,
  dur,
  midi,
});
const R = (beat: number, dur: number, ...midi: number[]): AccompSlot => ({
  hand: "right",
  beat,
  dur,
  midi,
});
const eighths = (hand: Hand, notes: number[]): AccompSlot[] =>
  notes.map((m, i) => ({ hand, beat: i / 2, dur: 0.5, midi: [m] }));
/** Up and down a chord: a b c b, or a b c d c b. */
const upDown = (ch: number[]) => [...ch, ...ch.slice(1, -1).reverse()];
const cycle = (seq: number[], n: number) =>
  Array.from({ length: n }, (_, i) => seq[i % seq.length]);

export type PatternGroup = "pop" | "blues" | "gospel";
export const PATTERN_GROUPS: { id: PatternGroup; label: string }[] = [
  { id: "pop", label: "Pop and ballad" },
  { id: "blues", label: "Blues, boogie and stride" },
  { id: "gospel", label: "Gospel" },
];

export interface AccompPattern {
  id: string;
  /** The number in the piano path's pattern list. */
  n: number;
  label: string;
  group: PatternGroup;
  about: string;
  swing?: boolean;
  bar: BarFn;
}

export const ACCOMP_PATTERNS: AccompPattern[] = [
  {
    id: "block-1",
    n: 1,
    label: "Block chords on 1",
    group: "pop",
    about:
      "Both hands strike the chord on beat 1 and hold the bar: the root below, the chord above.",
    bar: ({ v }) => [L(0, 4, v.bass), R(0, 4, ...v.rh)],
  },
  {
    id: "block-1-3",
    n: 2,
    label: "Block chords on 1 and 3",
    group: "pop",
    about: "The root and the chord together on beats 1 and 3.",
    bar: ({ v }) => [L(0, 2, v.bass), R(0, 2, ...v.rh), L(2, 2, v.bass), R(2, 2, ...v.rh)],
  },
  {
    id: "root-fifth-octave",
    n: 3,
    label: "Root, fifth, octave",
    group: "pop",
    about:
      "The left hand walks root, fifth, octave, fifth in quarters under a held right-hand chord.",
    bar: ({ v }) => [...[0, 7, 12, 7].map((o, i) => L(i, 1, v.bass + o)), R(0, 4, ...v.rh)],
  },
  {
    id: "rock-octaves",
    n: 4,
    label: "Rock octave eighths",
    group: "pop",
    about: "Left-hand octaves on every eighth, the right hand's chord on 1 and 3.",
    bar: ({ v }) => [
      ...Array.from({ length: 8 }, (_, i) => L(i / 2, 0.5, v.bass, v.bass + 12)),
      R(0, 2, ...v.rh),
      R(2, 2, ...v.rh),
    ],
  },
  {
    id: "broken-triad",
    n: 5,
    label: "Broken chord eighths",
    group: "pop",
    about: "The right hand rocks up and down the chord in eighths over a held root.",
    bar: ({ v }) => [L(0, 4, v.bass), ...eighths("right", cycle(upDown(v.rh), 8))],
  },
  {
    id: "ballad-arpeggio",
    n: 6,
    label: "Ballad arpeggio, 1-5-8-10",
    group: "pop",
    about:
      "The left hand climbs root, fifth, octave and tenth twice a bar under a held right-hand chord.",
    bar: ({ v }) => {
      const t = v.bass + 12 + third(v.chord);
      return [...eighths("left", cycle([v.bass, v.bass + 7, v.bass + 12, t], 8)), R(0, 4, ...v.rh)];
    },
  },
  {
    id: "three-three-two",
    n: 7,
    label: "3+3+2 eighths",
    group: "pop",
    about:
      "The right hand runs down the chord in groups of three, three and two. The root lands with each group.",
    bar: ({ v }) => {
      const down = [...v.rh].sort((a, b) => b - a).slice(0, 3);
      return [
        L(0, 1.5, v.bass),
        L(1.5, 1.5, v.bass),
        L(3, 1, v.bass),
        ...eighths("right", cycle(down, 6).concat(down.slice(0, 2))),
      ];
    },
  },
  {
    id: "pop-syncopation",
    n: 8,
    label: "Pop syncopation, 1, and-of-2, 4",
    group: "pop",
    about: "Both hands together on 1, the and of 2, and 4.",
    bar: ({ v }) =>
      [
        [0, 1.5],
        [1.5, 1.5],
        [3, 1],
      ].flatMap(([b, d]) => [L(b, d, v.bass), R(b, d, ...v.rh)]),
  },
  {
    id: "alberti",
    n: 9,
    label: "Alberti bass",
    group: "pop",
    about: "Low, high, middle, high in the left hand, the right hand's chord on 1 and 3.",
    bar: ({ v }) => {
      const [a, b, c] = v.lh;
      return [...eighths("left", cycle([a, c, b, c], 8)), R(0, 2, ...v.rh), R(2, 2, ...v.rh)];
    },
  },
  {
    id: "spread-1-5-10",
    n: 11,
    label: "Spread 1-5-10",
    group: "pop",
    about:
      "The left hand opens root, fifth, tenth, fifth in quarters under a held right-hand chord.",
    bar: ({ v }) => {
      const t = v.bass + 12 + third(v.chord);
      return [...[v.bass, v.bass + 7, t, v.bass + 7].map((m, i) => L(i, 1, m)), R(0, 4, ...v.rh)];
    },
  },
  {
    id: "half-time-push",
    n: 16,
    label: "Half time with pushes",
    group: "pop",
    about: "Root and chord on 1, then the next bar's chord pushed early on the and of 4.",
    bar: ({ v, next }) => [
      L(0, 3.5, v.bass),
      R(0, 3.5, ...v.rh),
      L(3.5, 0.5, next.bass),
      R(3.5, 0.5, ...next.rh),
    ],
  },
  {
    id: "boogie",
    n: 12,
    label: "Boogie bass, chords on 2 and 4",
    group: "blues",
    about:
      "Eight to the bar, up the chord and back (1 3 5 6 b7 6 5 3) and swung, with right-hand chords on 2 and 4.",
    swing: true,
    bar: ({ v }) => {
      const b = 36 + pc(v.chord.rootPc - 36);
      const line = [0, third(v.chord), 7, 9, 10, 9, 7, third(v.chord)].map((o) => b + o);
      return [...eighths("left", line), R(1, 1, ...v.rh), R(3, 1, ...v.rh)];
    },
  },
  {
    id: "shuffle-fifth-sixth",
    n: 12,
    label: "Shuffle, fifth to sixth",
    group: "blues",
    about: "The rock and roll left hand: root and fifth, root and sixth, in swung eighths.",
    swing: true,
    bar: ({ v }) => {
      const b = 36 + pc(v.chord.rootPc - 36);
      return Array.from({ length: 8 }, (_, i) => L(i / 2, 0.5, b, b + (i % 2 ? 9 : 7)));
    },
  },
  {
    id: "stride-lite",
    n: 13,
    label: "Stride-lite",
    group: "blues",
    about: "Left hand only: the root on 1, the chord on 2, the fifth on 3, the chord on 4.",
    bar: ({ v }) => {
      const b = bassOf(v.chord);
      const ch = lead(undefined, handPcs(v.chord).slice(0, 3), [50, 62]);
      return [L(0, 1, b), L(1, 1, ...ch), L(2, 1, b + 7), L(3, 1, ...ch)];
    },
  },
  {
    id: "stride",
    n: 13,
    label: "Stride, octave and tenth",
    group: "blues",
    about:
      "Left hand only: the root in octaves on 1, the chord on 2, a tenth on 3, the chord on 4.",
    bar: ({ v }) => {
      const b = bassOf(v.chord);
      const ch = lead(undefined, handPcs(v.chord).slice(0, 3), [50, 62]);
      return [
        L(0, 1, b, b + 12),
        L(1, 1, ...ch),
        L(2, 1, b, b + 12 + third(v.chord)),
        L(3, 1, ...ch),
      ];
    },
  },
  {
    id: "gospel-1-4-1",
    n: 14,
    label: "Gospel 1-4-1",
    group: "gospel",
    about:
      "The chord, its IV over the same bass on the and of 2, and back on 4: the gospel and rock 1-4-1.",
    bar: ({ v }) => [L(0, 4, v.bass), R(0, 1.5, ...v.rh), R(1.5, 1.5, ...v.four), R(3, 1, ...v.rh)],
  },
];

/** Move the right hand up by octaves until it sits above the left; the split goes between. */
function separate(slots: AccompSlot[]): { slots: AccompSlot[]; splitMidi: number } {
  const left = slots.filter((s) => s.hand === "left").flatMap((s) => s.midi);
  const right = slots.filter((s) => s.hand === "right").flatMap((s) => s.midi);
  if (!left.length || !right.length) return { slots, splitMidi: left.length ? 128 : 0 };
  const top = Math.max(...left);
  const shift = 12 * Math.max(0, Math.ceil((top + 1 - Math.min(...right)) / 12));
  return {
    slots: slots.map((s) =>
      s.hand === "right" && shift ? { ...s, midi: s.midi.map((m) => m + shift) } : s,
    ),
    splitMidi: top + 1,
  };
}

const sortSlots = (slots: AccompSlot[]) =>
  slots.sort((a, b) => a.beat - b.beat || (a.hand === "left" ? -1 : 1));

/**
 * Render a bar function over every bar of a chart. A bar that changes chord on
 * beat 3 plays its first half from the first chord's bar and its second half
 * from the second's, re-striking on beat 3 whatever a hand held over it.
 */
function byBar(chart: readonly ChartChord[], fn: BarFn): AccompSlot[] {
  const voiced = voiceChart(chart);
  const total = chartBeats(chart);
  const bars = Math.round(total / BEATS_PER_BAR);
  const at = (beat: number) => {
    const b = beat % total;
    return voiced[chart.findIndex((c) => b >= c.startBeat && b < c.startBeat + c.durationBeats)];
  };
  const half = BEATS_PER_BAR / 2;
  return Array.from({ length: bars }, (_, bar) => {
    const b0 = bar * BEATS_PER_BAR;
    const v = at(b0);
    const next = at(b0 + BEATS_PER_BAR);
    const mid = at(b0 + half);
    let slots = fn({ v, next });
    if (mid !== v) {
      const second = fn({ v: mid, next });
      const late = second.filter((s) => s.beat >= half - 1e-6);
      const held = (["left", "right"] as const).flatMap((hand) =>
        late.some((s) => s.hand === hand && Math.abs(s.beat - half) < 1e-6)
          ? []
          : second
              .filter((s) => s.hand === hand && s.beat < half && s.beat + s.dur > half + 1e-6)
              .map((s) => ({ ...s, beat: half, dur: s.beat + s.dur - half })),
      );
      slots = [
        ...slots
          .filter((s) => s.beat < half - 1e-6)
          .map((s) => ({ ...s, dur: Math.min(s.dur, half - s.beat) })),
        ...held,
        ...late,
      ];
    }
    return slots.map((s) => ({ ...s, beat: s.beat + b0 }));
  }).flat();
}

export type HandChoice = "both" | Hand;
const onlyHands = (slots: AccompSlot[], hands: HandChoice) =>
  hands === "both" ? slots : slots.filter((s) => s.hand === hands);

export function patternRendering(
  chart: ChartChord[],
  patternId: string,
  hands: HandChoice = "both",
): Rendering {
  const p = ACCOMP_PATTERNS.find((x) => x.id === patternId) ?? ACCOMP_PATTERNS[0];
  const { slots, splitMidi } = separate(byBar(chart, p.bar));
  return {
    slots: sortSlots(onlyHands(slots, hands)),
    splitMidi,
    beats: chartBeats(chart),
    swing: !!p.swing,
    chart,
  };
}

// ---------------------------------------------------------------------------
// Comping: a voicing on a rhythm, bar by bar.

export interface CompRhythm {
  id: string;
  label: string;
  about: string;
  /** [beat, beats held, true when the hit anticipates the next bar's chord]. */
  hits: [number, number, boolean?][];
  straight?: boolean;
  /** 3 for a waltz rhythm (3/4 only); 4/4 rhythms when unset. */
  meter?: 3;
}
export const COMP_RHYTHMS: CompRhythm[] = [
  { id: "whole", label: "Whole notes", about: "One chord a bar, on 1, held.", hits: [[0, 4]] },
  {
    id: "halves",
    label: "Two to the bar",
    about: "On 1 and 3.",
    hits: [
      [0, 2],
      [2, 2],
    ],
  },
  {
    id: "charleston",
    label: "Charleston",
    about: "On 1 and the and of 2.",
    hits: [
      [0, 1],
      [1.5, 0.5],
    ],
  },
  {
    id: "garland",
    label: "And of 2, and of 4",
    about: "Red Garland's offbeats: the and of 2, then the next chord early on the and of 4.",
    hits: [
      [1.5, 1],
      [3.5, 0.5, true],
    ],
  },
  {
    id: "stabs",
    label: "And of 2, and 4",
    about: "Short stabs on the and of 2 and on 4, room for a line on top.",
    hits: [
      [1.5, 0.5],
      [3, 1],
    ],
  },
  {
    id: "bossa",
    label: "Bossa",
    about: "On 1, the and of 2 and 4, straight eighths.",
    hits: [
      [0, 1.5],
      [1.5, 1.5],
      [3, 1],
    ],
    straight: true,
  },
  {
    id: "hard-bop",
    label: "Hard-bop hits",
    about:
      "Short hits with the drummer: on 1, the and of 2, then the next chord pushed on the and of 4.",
    hits: [
      [0, 0.5],
      [1.5, 0.5],
      [3.5, 0.5, true],
    ],
  },
  {
    id: "waltz",
    label: "Waltz: 1 and the and of 2",
    about: "Jazz waltz comping in 3/4: on 1, then the and of 2.",
    hits: [
      [0, 1],
      [1.5, 1],
    ],
    meter: 3,
  },
  {
    id: "waltz-23",
    label: "Waltz: 2 and 3",
    about: "In 3/4, leave 1 to the bass and comp on 2 and 3.",
    hits: [
      [1, 1],
      [2, 1],
    ],
    meter: 3,
  },
];

/** The rhythms that fit a bar of `beatsPerBar` beats. */
export const compRhythmsFor = (beatsPerBar: number) =>
  COMP_RHYTHMS.filter((r) => (r.meter ?? 4) === beatsPerBar);

export interface CompVoicing {
  id: string;
  label: string;
  about: string;
}
export const COMP_VOICINGS: CompVoicing[] = [
  {
    id: "shell-137",
    label: "Shells 1-3-7",
    about: "Left hand: root, 3rd, 7th (the 5th on a triad).",
  },
  { id: "shell-173", label: "Shells 1-7-3", about: "Left hand: root, 7th, then the 3rd on top." },
  {
    id: "shells",
    label: "Shells, alternating",
    about: "Left hand: 1-3-7 or 1-7-3, whichever moves least from the chord before.",
  },
  {
    id: "rootless",
    label: "Rootless A and B",
    about:
      "Left hand: 3 5 7 9 or 7 9 3 5 (3 13 7 9 or 7 9 3 13 on a dominant), whichever moves least. The bass player has the root.",
  },
  {
    id: "root-rootless",
    label: "Root, then rootless",
    about: "Left hand: the root. Right hand: rootless A or B.",
  },
  {
    id: "two-feel",
    label: "Two-feel bass and guide tones",
    about: "Left hand: root on 1, fifth on 3. Right hand: the 3rd and 7th on the rhythm.",
  },
  {
    id: "octave-stabs",
    label: "Octave stabs",
    about:
      "Left hand: the root in octaves, short, with the right hand (Horace Silver's punches). Right hand: rootless A or B.",
  },
];

/** Rootless A (3 5 7 9) or B (7 9 3 5) of a chord, the 13th for the 5th on a dominant; altered dominants take 7 b9 3 b13. */
function rootlessShape(c: ParsedChord, position: "A" | "B"): number[] {
  if (c.suffix.includes("alt")) return [10, 13, 16, 20];
  if (c.suffix.startsWith("m7b5")) return position === "A" ? [3, 6, 10, 12] : [10, 12, 15, 18];
  const t = third(c);
  const f = fifth(c);
  const s = seventh(c) ?? 9;
  const nine = c.intervals.includes(13) ? 13 : c.intervals.includes(15) ? 15 : 14;
  // A plain dominant takes the 13th for its 5th: 3-13-7-9 and 7-9-3-13.
  const top = t === 4 && s === 10 && f === 7 ? 9 : f;
  return position === "A" ? [t, top, s, nine].sort((a, b) => a - b) : [s, nine, t + 12, top + 12];
}

const movement = (a: number[], b: number[] | undefined) =>
  b
    ? Math.abs(a.reduce((x, y) => x + y, 0) / a.length - b.reduce((x, y) => x + y, 0) / b.length)
    : 0;

/** Per chord: what each hand holds, voice-led through the chart. */
function compVoices(
  chart: readonly ChartChord[],
  voicing: string,
): { left: number[]; right: number[] }[] {
  let prev: number[] | undefined;
  return chart.map(({ symbol }) => {
    const c = parseChordSymbol(symbol)!;
    const root = shellRoot(c);
    const t = third(c);
    const s = seventh(c) ?? fifth(c);
    const s137 = [root, root + t, root + s];
    const s173 = [root, root + s, root + t + 12];
    if (voicing === "shell-137") return { left: s137, right: [] };
    if (voicing === "shell-173") return { left: s173, right: [] };
    if (voicing === "shells") {
      const upper = (v: number[]) => v.slice(1);
      const pickA = !prev || movement(upper(s137), prev) <= movement(upper(s173), prev);
      const left = pickA ? s137 : s173;
      prev = upper(left);
      return { left, right: [] };
    }
    if (voicing === "two-feel") {
      const guide = lead(prev, [pc(c.rootPc + t), pc(c.rootPc + s)], [55, 71]);
      prev = guide;
      return { left: [bassOf(c)], right: guide };
    }
    if (voicing === "octave-stabs") {
      const low = 36 + pc(c.rootPc - 36);
      const [a, b] = (["A", "B"] as const).map((pos) =>
        placeVoicing(c.rootPc, rootlessShape(c, pos), prev, [60, 79]),
      );
      prev = movement(a, prev) <= movement(b, prev) ? a : b;
      return { left: [low, low + 12], right: prev };
    }
    const register: [number, number] = voicing === "rootless" ? [48, 67] : [55, 76];
    const [a, b] = (["A", "B"] as const).map((pos) =>
      placeVoicing(c.rootPc, rootlessShape(c, pos), prev, register),
    );
    const v = movement(a, prev) <= movement(b, prev) ? a : b;
    prev = v;
    return voicing === "rootless" ? { left: v, right: [] } : { left: [root], right: v };
  });
}

export function compingRendering(
  chart: ChartChord[],
  voicing: string,
  rhythmId: string,
  swing = true,
  beatsPerBar = BEATS_PER_BAR,
): Rendering {
  const fits = compRhythmsFor(beatsPerBar);
  const rhythm = fits.find((r) => r.id === rhythmId) ?? fits[0];
  const voices = compVoices(chart, voicing);
  const beats = chartBeats(chart);
  /** The voicing sounding at a beat, the chart looping. */
  const at = (beat: number) => {
    const b = beat % beats;
    return voices[chart.findIndex((c) => b >= c.startBeat && b < c.startBeat + c.durationBeats)];
  };
  const twoFeel = voicing === "two-feel";
  const out: AccompSlot[] = [];
  const stabs = voicing === "octave-stabs";
  for (let b0 = 0; b0 < beats; b0 += beatsPerBar) {
    for (const [beat, dur, push] of rhythm.hits) {
      // A push sounds the chord of the next beat it leads into.
      const v = at(b0 + beat + (push ? 0.5 : 0));
      if (!twoFeel && v.left.length)
        out.push(L(b0 + beat, stabs ? Math.min(dur, 0.5) : dur, ...v.left));
      if (v.right.length) out.push(R(b0 + beat, dur, ...v.right));
    }
    if (twoFeel && beatsPerBar === 3) out.push(L(b0, 3, at(b0).left[0]));
    else if (twoFeel)
      out.push(
        L(b0, 2, at(b0).left[0]),
        L(b0 + 2, 2, at(b0 + 2).left[0] + (at(b0 + 2) === at(b0) ? 7 : 0)),
      );
  }
  const { slots: placed, splitMidi } = separate(out);
  return {
    slots: sortSlots(placed),
    splitMidi,
    beats,
    swing: swing && !rhythm.straight,
    chart,
  };
}

// ---------------------------------------------------------------------------
// Lead sheets: a melody with chord symbols, the melody in the right hand.

export interface LeadNote {
  midi: number;
  startBeat: number;
  durationBeats: number;
}
export interface LeadSheet {
  id: string;
  title: string;
  source: string;
  bpm: number;
  keyPc: number;
  melody: LeadNote[];
  chart: ChartChord[];
}

/** [midi or null for a rest, beats] steps, and [symbol, beats] chords, into a sheet. */
function sheet(
  id: string,
  title: string,
  source: string,
  bpm: number,
  keyPc: number,
  steps: [number | null, number][],
  chords: [string, number][],
): LeadSheet {
  const melody: LeadNote[] = [];
  let beat = 0;
  for (const [midi, beats] of steps) {
    if (midi !== null) melody.push({ midi, startBeat: beat, durationBeats: beats });
    beat += beats;
  }
  const chart: ChartChord[] = [];
  beat = 0;
  for (const [symbol, beats] of chords) {
    chart.push({ symbol, startBeat: beat, durationBeats: beats });
    beat += beats;
  }
  return { id, title, source, bpm, keyPc, melody, chart };
}

const q = (...midis: number[]): [number, number][] => midis.map((m) => [m, 1]);
const C = 60;
const D = 62;
const E = 64;
const F = 65;
const G = 67;
const A = 69;

const TWINKLE_A = [...q(C, C, G, G, A, A), [G, 2], ...q(F, F, E, E, D, D), [C, 2]] as [
  number,
  number,
][];
const TWINKLE_B = [...q(G, G, F, F, E, E), [D, 2]] as [number, number][];
const TWINKLE_B_CHORDS: [string, number][] = [
  ["C", 2],
  ["F", 2],
  ["C", 2],
  ["G", 2],
];
const ODE_A = [...q(E, E, F, G, G, F, E, D, C, C, D, E)] as [number, number][];

export const LEAD_SHEETS: LeadSheet[] = [
  sheet(
    "twinkle",
    "Twinkle, Twinkle",
    "Traditional French, 1761",
    96,
    0,
    [...TWINKLE_A, ...TWINKLE_B, ...TWINKLE_B, ...TWINKLE_A],
    [
      ["C", 4],
      ["F", 2],
      ["C", 2],
      ["F", 2],
      ["C", 2],
      ["G", 2],
      ["C", 2],
      ...TWINKLE_B_CHORDS,
      ...TWINKLE_B_CHORDS,
      ["C", 4],
      ["F", 2],
      ["C", 2],
      ["F", 2],
      ["C", 2],
      ["G", 2],
      ["C", 2],
    ],
  ),
  sheet(
    "ode-to-joy",
    "Ode to Joy",
    "Beethoven, Symphony No. 9 (1824)",
    96,
    0,
    [
      ...ODE_A,
      [E, 1.5],
      [D, 0.5],
      [D, 2],
      ...ODE_A,
      [D, 1.5],
      [C, 0.5],
      [C, 2],
      ...q(D, D, E, C, D),
      [E, 0.5],
      [F, 0.5],
      ...q(E, C, D),
      [E, 0.5],
      [F, 0.5],
      ...q(E, D, C, D),
      [G - 12, 2],
      ...ODE_A,
      [D, 1.5],
      [C, 0.5],
      [C, 2],
    ],
    [
      ["C", 4],
      ["G7", 4],
      ["C", 4],
      ["G", 4],
      ["C", 4],
      ["G7", 4],
      ["C", 4],
      ["G", 2],
      ["C", 2],
      ["G", 2],
      ["C", 2],
      ["G", 2],
      ["C", 2],
      ["G7", 4],
      ["C", 2],
      ["G", 2],
      ["C", 4],
      ["G7", 4],
      ["C", 4],
      ["G", 2],
      ["C", 2],
    ],
  ),
];

const RHYTHMS: number[][] = [
  [2, 2],
  [1, 1, 2],
  [1, 1, 1, 1],
  [2, 1, 1],
  [3, 1],
  [1.5, 0.5, 2],
];
const MELODY_REGISTER: [number, number] = [60, 79];

/**
 * A melody over a progression from a seed: chord tones on beats 1 and 3, scale
 * steps between, no leap past a fourth, ending on the last chord's root.
 */
export function generatedLeadSheet(
  p: Progression,
  transpose = 0,
  seed = 1,
  rhythms: number[][] = RHYTHMS,
): LeadSheet {
  const chart = chartOf(p, transpose);
  const rand: Rand = rng(seed);
  const beats = chartBeats(chart);
  const melody: LeadNote[] = [];
  let prev = 67;
  const inRange = (pcs: number[]) => {
    const out: number[] = [];
    for (let m = MELODY_REGISTER[0]; m <= MELODY_REGISTER[1]; m++)
      if (pcs.includes(pc(m))) out.push(m);
    return out;
  };
  for (let bar = 0; bar * BEATS_PER_BAR < beats; bar++) {
    const last = (bar + 1) * BEATS_PER_BAR >= beats;
    const rhythm = last ? [4] : rhythms[Math.floor(rand() * rhythms.length)];
    let t = bar * BEATS_PER_BAR;
    for (const dur of rhythm) {
      const ci = chart.findIndex((c) => t >= c.startBeat && t < c.startBeat + c.durationBeats);
      const chord = parseChordSymbol(chart[ci].symbol)!;
      const jam = p.chords[ci % p.chords.length];
      const scale = (scaleSemitones(jam.scale.name) ?? [0, 2, 4, 5, 7, 9, 11]).map((s) =>
        pc(jam.scale.rootPc + transpose + s),
      );
      const strong = t % 2 === 0;
      const pcs = last
        ? [chord.rootPc]
        : strong
          ? chord.intervals.map((i) => pc(chord.rootPc + i))
          : scale;
      const near = inRange(pcs)
        .filter((m) => Math.abs(m - prev) <= 5 && (m !== prev || last))
        .sort((a, b) => Math.abs(a - prev) - Math.abs(b - prev));
      const options = near.length
        ? near.slice(0, 3)
        : inRange(pcs)
            .sort((a, b) => Math.abs(a - prev) - Math.abs(b - prev))
            .slice(0, 1);
      prev = options[Math.floor(rand() * options.length)];
      melody.push({ midi: prev, startBeat: t, durationBeats: dur });
      t += dur;
    }
  }
  return {
    id: `generated-${p.id}`,
    title: `A melody over ${p.name}`,
    source: "Generated",
    bpm: Math.min(p.bpm, 96),
    keyPc: pc(p.keyPc + transpose),
    melody,
    chart,
  };
}

/** The jazz lead-sheet levels (reading path lead-1 and lead-2): a generated head over a progression, swung. */
export const LEAD_LEVELS: { id: string; label: string; about: string }[] = [
  {
    id: "lead-1",
    label: "Jazz lead sheet 1",
    about: "Quarters and eighths, chord tones on 1 and 3, played swung.",
  },
  {
    id: "lead-2",
    label: "Jazz lead sheet 2",
    about: "Eighth-note lines and anticipations: the and of 4 tied into the next chord.",
  },
];
export const isLeadLevel = (id: string) => LEAD_LEVELS.some((l) => l.id === id);
const LEAD_RHYTHMS: Record<string, number[][]> = {
  "lead-1": [
    [2, 2],
    [1, 1, 2],
    [1, 1, 1, 1],
    [1.5, 0.5, 2],
    [0.5, 0.5, 1, 2],
    [1, 0.5, 0.5, 2],
  ],
  "lead-2": [
    [0.5, 0.5, 0.5, 0.5, 1, 1],
    [1, 0.5, 0.5, 0.5, 0.5, 1],
    [0.5, 0.5, 1, 0.5, 0.5, 1],
    [1.5, 0.5, 1, 0.5, 0.5],
    [1, 1, 1, 0.5, 0.5],
    [0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 1],
  ],
};

/**
 * A jazz head over a progression from a seed, as `generatedLeadSheet` writes a
 * melody, with the level's rhythms; at lead-2 a bar's last eighth (the and of 4)
 * often anticipates the next bar's chord, tied over the bar line.
 */
export function jazzLeadSheet(level: string, p: Progression, transpose = 0, seed = 1): LeadSheet {
  const id = isLeadLevel(level) ? level : "lead-1";
  const base = generatedLeadSheet(p, transpose, seed, LEAD_RHYTHMS[id]);
  const melody = [...base.melody];
  if (id === "lead-2") {
    const rand = rng(seed * 31 + 7);
    const chordAt = (t: number) =>
      base.chart.find((c) => t >= c.startBeat - 1e-6 && t < c.startBeat + c.durationBeats - 1e-6);
    for (let i = 0; i + 1 < melody.length; i++) {
      const n = melody[i];
      const next = melody[i + 1];
      const end = n.startBeat + n.durationBeats;
      if (
        n.durationBeats !== 0.5 ||
        next.durationBeats > 1.5 ||
        end % BEATS_PER_BAR !== 0 ||
        Math.abs(next.startBeat - end) > 1e-6 ||
        rand() >= 0.6
      )
        continue;
      const chord = parseChordSymbol(chordAt(end)?.symbol ?? "")!;
      const tones = chord ? chord.intervals.map((iv) => pc(chord.rootPc + iv)) : [];
      // The next chord's tone nearest the note, held through the next bar's first note.
      const near = Array.from({ length: 9 }, (_, k) => n.midi - 4 + k)
        .filter((m) => tones.includes(pc(m)))
        .sort((a, b) => Math.abs(a - n.midi) - Math.abs(b - n.midi));
      melody[i] = {
        ...n,
        midi: near[0] ?? n.midi,
        durationBeats: n.durationBeats + next.durationBeats,
      };
      melody.splice(i + 1, 1);
    }
  }
  const level0 = LEAD_LEVELS.find((l) => l.id === id)!;
  return {
    ...base,
    id: `${id}-${p.id}`,
    title: `${level0.label} over ${p.name}`,
    source: "Generated",
    melody,
  };
}

/** A score with chord symbols as a lead sheet: its top line (the right hand's when marked). */
export function leadSheetFromScore(score: Score): LeadSheet | null {
  if (!score.chords?.length) return null;
  const voices = score.voices.filter((v) => !v.drums);
  const pick = voices.filter((v) => v.hand !== "left");
  const top = new Map<number, LeadNote>();
  for (const n of (pick.length ? pick : voices).flatMap((v) => v.notes)) {
    const was = top.get(n.startBeat);
    if (!was || n.midi > was.midi)
      top.set(n.startBeat, {
        midi: n.midi,
        startBeat: n.startBeat,
        durationBeats: n.durationBeats,
      });
  }
  const melody = [...top.values()].sort((a, b) => a.startBeat - b.startBeat);
  if (!melody.length) return null;
  const chart = score.chords.filter((c) => parseChordSymbol(c.symbol));
  return {
    id: `song-${score.id}`,
    title: score.title,
    source: "Your songs",
    bpm: score.bpm,
    keyPc: [0, 7, 2, 9, 4, 11, 6, 1, 8, 3, 10, 5][(((score.keyFifths ?? 0) % 12) + 12) % 12],
    melody,
    chart,
  };
}

export type LeadLeft = "roots" | "shells" | "rootless" | "chords";
export const LEAD_LEFT: { id: LeadLeft; label: string; about: string }[] = [
  { id: "roots", label: "Left-hand roots", about: "The root on each chord and each bar line." },
  {
    id: "shells",
    label: "Left-hand shells",
    about: "Root and 7th (root and 5th on a triad) on each chord and each bar line.",
  },
  {
    id: "rootless",
    label: "Left-hand rootless",
    about:
      "Rootless A or B (3 5 7 9 or 7 9 3 5) on each chord and each bar line, whichever moves least.",
  },
  {
    id: "chords",
    label: "Chords under the melody",
    about:
      "The left hand on roots. On each chord change the right hand adds the chord below the melody note.",
  },
];

/** Lead sheet slots: the melody (kept in C4 to C6) in the right hand, the left hand on the chart. */
export function leadSheetRendering(
  s: LeadSheet,
  left: LeadLeft,
  transpose = 0,
  hands: HandChoice = "both",
): Rendering {
  const low = Math.min(...s.melody.map((n) => n.midi + transpose));
  const shift = 12 * Math.ceil(Math.max(0, 60 - low) / 12);
  const melody = s.melody.map((n) => ({ ...n, midi: n.midi + transpose + shift }));
  const chart = s.chart.map((c) => ({ ...c, symbol: transposeSymbol(c.symbol, transpose) }));
  const beats =
    Math.ceil(
      Math.max(chartBeats(chart), ...melody.map((n) => n.startBeat + n.durationBeats)) /
        BEATS_PER_BAR,
    ) * BEATS_PER_BAR;
  const slots: AccompSlot[] = melody.map((n) => R(n.startBeat, n.durationBeats, n.midi));
  let prev: number[] | undefined;
  for (const c of chart) {
    const chord = parseChordSymbol(c.symbol)!;
    const b = bassOf(chord);
    let lh = left === "shells" ? [b, b + (seventh(chord) ?? fifth(chord))] : [b];
    if (left === "rootless") {
      // Around middle C, where rootless voicings sound clear; the melody moves up above them.
      const [a, bb] = (["A", "B"] as const).map((pos) =>
        placeVoicing(chord.rootPc, rootlessShape(chord, pos), prev, [47, 70]),
      );
      lh = prev && movement(bb, prev) < movement(a, prev) ? bb : a;
      prev = lh;
    }
    const end = c.startBeat + c.durationBeats;
    for (let t = c.startBeat; t < end - 1e-6;) {
      const nextBar = (Math.floor(t / BEATS_PER_BAR + 1e-6) + 1) * BEATS_PER_BAR;
      const until = Math.min(end, nextBar);
      slots.push(L(t, until - t, ...lh));
      t = until;
    }
    if (left !== "chords") continue;
    const at = melody.find((n) => Math.abs(n.startBeat - c.startBeat) < 1e-6);
    const top = at ?? [...melody].reverse().find((n) => n.startBeat <= c.startBeat) ?? melody[0];
    const under = handPcs(chord)
      .filter((p) => p !== pc(top.midi))
      .slice(0, 3)
      .map((p) => top.midi - 12 + pc(p - top.midi + 12));
    const slot = at && slots.find((x) => x.hand === "right" && x.beat === at.startBeat);
    if (slot) slot.midi = [...under, ...slot.midi].sort((a, b) => a - b);
    else slots.push(R(c.startBeat, Math.min(c.durationBeats, BEATS_PER_BAR), ...under));
  }
  const placed = separate(slots);
  return {
    slots: sortSlots(onlyHands(placed.slots, hands)),
    splitMidi: placed.splitMidi,
    beats,
    swing: false,
    chart,
  };
}
