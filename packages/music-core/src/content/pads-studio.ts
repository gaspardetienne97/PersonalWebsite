// Beat making on the pads (pads.md section 4, round 1 recs 4, 5 and 9): a loop
// chopped onto A01 to A16, Note Repeat, a loop recorded live in passes, and
// song-form pieces graded section by section. Pure: the page renders, slices
// and plays; this says what is played, where, and how it went. Every
// threshold is a proposal to tune on the owner's MPC.

import type { DrumVoiceId, GrooveDef } from "../data";
import type { Metric, NoteEvent } from "../types";
import { gradeGroove, grooveWindowMs } from "../scoring/pads";
import { gridGroove, type Lanes } from "./pads-grid";
import {
  PAD_FILLS,
  fillGroove,
  gradeImprovise,
  inRange,
  rankCorrelation,
  type ImproviseGrade,
  type VelocityRange,
} from "./pad-skills";
import { PAD_REPERTOIRE, repertoireFor } from "./pads-repertoire";
import { GROOVE_VOICES } from "./winds-pads";
import { m } from "@repo/i18n/messages.js";

type Target = { voice: string; beat: number; accent: "accent" | "normal" | "ghost" };
/** A groove whose voices may be slices as well as drums (the grader takes any voice with a pad). */
export type PadPiece = Omit<GrooveDef, "targets"> & { targets: Target[] };

const mean = (xs: readonly number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);

// ---------------------------------------------------------------------------
// Chops: a loop cut into 16 equal slices, slice 1 on A01 (MIDI 36) to slice 16
// on A16 (51), as the MPC's Chop to pads does.

export const CHOP_SLICES = 16;
export const slicePad = (i: number) => 36 + i;
export const sliceVoice = (i: number) => `slice-${i + 1}`;
/** Each slice's voice to its pad, for the groove grader. */
export const CHOP_PADS: Record<string, number> = Object.fromEntries(
  Array.from({ length: CHOP_SLICES }, (_, i) => [sliceVoice(i), slicePad(i)]),
);

export interface ChopSource {
  id: string;
  label: string;
  /** Bars of 4/4 the loop lasts; a slice is bars x 4 / 16 beats. */
  bars: number;
  /** The tempo it is rendered at by default (an imported loop's tempo comes from its length). */
  bpm: number;
  detail: string;
}
/** Loops made from the app's own sounds; "file" is a loop the player imports. */
export const CHOP_SOURCES: ChopSource[] = [
  {
    id: "boom-bap-b",
    label: m.music_rep_studio_chop_boom_bap_label(),
    bars: 1,
    bpm: 84,
    detail: m.music_rep_studio_chop_boom_bap_detail(),
  },
  {
    id: "funky-drummer",
    label: "Funky Drummer",
    bars: 1,
    bpm: 92,
    detail: m.music_rep_studio_chop_funky_drummer_detail(),
  },
  {
    id: "keys",
    label: m.music_rep_studio_chop_keys_label(),
    bars: 2,
    bpm: 90,
    detail: m.music_rep_studio_chop_keys_detail(),
  },
  {
    id: "amen",
    label: "Amen break",
    bars: 4,
    bpm: 160,
    detail: m.music_rep_studio_chop_amen_detail(),
  },
];
export const chopSource = (id: string) => CHOP_SOURCES.find((s) => s.id === id);

/** The keys riff: Am7 then Dm9, a note an eighth so every slice is its own sound. */
const KEYS_RIFF = [
  [57, 60, 64, 67, 69, 67, 64, 60],
  [62, 65, 69, 72, 76, 72, 69, 65],
];

/** What a source plays, in beats: drum pads on the kit, or keys. */
export function chopSourceNotes(
  id: string,
): { midi: number; beat: number; beats: number; velocity: number; voice: "drum" | "piano" }[] {
  if (id === "keys")
    return KEYS_RIFF.flatMap((bar, b) => [
      { midi: b ? 50 : 45, beat: b * 4, beats: 4, velocity: 0.55, voice: "piano" as const },
      ...bar.map((midi, k) => ({
        midi,
        beat: b * 4 + k / 2,
        beats: 0.5,
        velocity: k % 2 ? 0.6 : 0.75,
        voice: "piano" as const,
      })),
    ]);
  const r = repertoireFor(id);
  if (!r) return [];
  return r.groove.targets.map((t) => ({
    midi: DRUM_PAD[t.voice] ?? 38,
    beat: t.beat,
    beats: 0.25,
    velocity: t.accent === "accent" ? 0.95 : t.accent === "ghost" ? 0.3 : 0.7,
    voice: "drum" as const,
  }));
}
const DRUM_PAD: Record<string, number> = {
  kick: 36,
  rim: 37,
  snare: 38,
  perc: 39,
  hats: 42,
  "tom-low": 41,
  pedalhat: 44,
  "tom-mid": 45,
  openhat: 46,
  cowbell: 47,
  "tom-high": 48,
  crash: 49,
  ride: 51,
  "808": 35,
};

/**
 * One channel cut into `n` equal slices from `start` (samples), each faded out
 * over its last few milliseconds so a cut never clicks.
 */
export function sliceSamples(
  data: Float32Array,
  n: number,
  length = data.length,
  rate = 44100,
): Float32Array[] {
  const each = Math.floor(length / n);
  const fade = Math.min(each, Math.round(rate * 0.004));
  return Array.from({ length: n }, (_, i) => {
    const s = data.slice(i * each, (i + 1) * each);
    for (let k = 0; k < fade; k++) s[s.length - 1 - k] *= k / fade;
    return s;
  });
}

export const CHOP_EXERCISES = [
  {
    id: "order",
    label: m.music_rep_studio_exercise_order_label(),
    detail: m.music_rep_studio_exercise_order_detail(),
  },
  {
    id: "reorder",
    label: m.music_rep_studio_exercise_reorder_label(),
    detail: m.music_rep_studio_exercise_reorder_detail(),
  },
  {
    id: "free",
    label: m.music_rep_studio_exercise_free_label(),
    detail: m.music_rep_studio_exercise_free_detail(),
  },
] as const;
export type ChopExercise = (typeof CHOP_EXERCISES)[number]["id"];

export interface ChopEdit {
  id: string;
  label: string;
  /** Beats a step. */
  every: number;
  /** The slice (1..16) each step plays; 0 lets the last one ring. */
  steps: number[];
  /** The source it is written for (any when missing). */
  source?: string;
}
export const CHOP_EDITS: ChopEdit[] = [
  // Sixteenth slices of a one-bar break: two bars, the second flips the first.
  {
    id: "flip",
    label: m.music_rep_studio_edit_flip(),
    every: 0.25,
    steps: [1, 2, 3, 4, 1, 2, 3, 4, 9, 10, 11, 12, 13, 14, 15, 16],
  },
  {
    id: "stutter",
    label: m.music_rep_studio_edit_stutter(),
    every: 0.25,
    steps: [
      1, 1, 2, 3, 5, 5, 6, 7, 9, 10, 9, 10, 13, 14, 15, 16, 1, 2, 3, 4, 5, 6, 7, 8, 9, 9, 9, 9, 13,
      14, 15, 16,
    ],
  },
  {
    id: "backwards",
    label: m.music_rep_studio_edit_backwards(),
    every: 0.25,
    steps: [13, 14, 15, 16, 9, 10, 11, 12, 5, 6, 7, 8, 1, 2, 3, 4],
  },
  // Eighth slices of the keys riff.
  {
    id: "hook",
    label: m.music_rep_studio_edit_hook(),
    every: 0.5,
    steps: [1, 2, 3, 4, 5, 0, 5, 4, 9, 10, 11, 12, 13, 0, 13, 12],
    source: "keys",
  },
  // A beat a slice of the Amen; jungle cuts them on the eighths.
  {
    id: "jungle",
    label: m.music_rep_studio_edit_jungle(),
    every: 0.5,
    steps: [
      1, 0, 2, 0, 3, 0, 4, 0, 5, 0, 6, 0, 7, 7, 8, 0, 1, 0, 2, 0, 3, 0, 4, 4, 13, 0, 14, 15, 16, 16,
      16, 16,
    ],
    source: "amen",
  },
];

/** The slices to play: 1 to 16 in order over the loop, or an edit's steps. */
export function chopPiece(
  source: ChopSource,
  exercise: "order" | "reorder",
  editId = "flip",
): PadPiece {
  const edit = CHOP_EDITS.find((e) => e.id === editId) ?? CHOP_EDITS[0];
  const every = exercise === "order" ? (source.bars * 4) / CHOP_SLICES : edit.every;
  const steps =
    exercise === "order" ? Array.from({ length: CHOP_SLICES }, (_, i) => i + 1) : edit.steps;
  const targets = steps.flatMap((slice, k): Target[] =>
    slice
      ? [
          {
            voice: sliceVoice(slice - 1),
            beat: k * every,
            accent: (k * every) % 4 === 0 ? "accent" : "normal",
          },
        ]
      : [],
  );
  const bars = Math.max(1, Math.ceil((steps.length * every) / 4 - 1e-9));
  return {
    value: exercise === "order" ? `chop-order-${source.id}` : `chop-${edit.id}`,
    label:
      exercise === "order"
        ? m.music_rep_studio_slices_in_order({ source: source.label })
        : edit.label,
    bars,
    sectionLabels: Array.from({ length: bars }, () => "chop"),
    targets,
  };
}

/** How a free chop went: bars 1 to 4 played, then again in 5 to 8. */
export interface FreeChopGrade {
  score: number;
  correct: boolean;
  /** 1 at 15 ms from the sixteenth grid on average, 0 at 60. */
  time: number;
  meanAbsMs: number | null;
  /** Hits of the first take found again, same pad, same place, in the second. */
  repeat: number;
  first: number;
  second: number;
}
export const FREE_CHOP = { minHits: 8, repeatPass: 0.9, timePass: 0.8 } as const;

export function gradeFreeChop(
  hits: readonly { at: number; midi: number }[],
  startAt: number,
  beatMs: number,
  bars = 4,
): FreeChopGrade {
  const step = beatMs / 4;
  const half = bars * 4 * beatMs;
  const rel = hits
    .map((h) => ({ midi: h.midi, t: h.at - startAt }))
    .filter((h) => h.t > -step / 2 && h.t < 2 * half - step / 2);
  const offs = rel.map((h) => Math.abs(h.t - Math.round(h.t / step) * step));
  const meanAbsMs = offs.length ? mean(offs) : null;
  const time = meanAbsMs === null ? 0 : Math.max(0, Math.min(1, 1 - (meanAbsMs - 15) / 45));
  const a = rel.filter((h) => h.t < half - step / 2);
  const b = rel.filter((h) => h.t >= half - step / 2);
  const window = Math.max(40, step * 0.5);
  const used = new Set<number>();
  let found = 0;
  for (const h of a) {
    const k = b.findIndex(
      (x, i) => !used.has(i) && x.midi === h.midi && Math.abs(x.t - half - h.t) <= window,
    );
    if (k >= 0) {
      used.add(k);
      found++;
    }
  }
  const repeat = Math.max(a.length, b.length) ? found / Math.max(a.length, b.length) : 0;
  const score = a.length ? (time + repeat) / 2 : 0;
  return {
    score,
    correct:
      a.length >= FREE_CHOP.minHits && repeat >= FREE_CHOP.repeatPass && time >= FREE_CHOP.timePass,
    time,
    meanAbsMs,
    repeat,
    first: a.length,
    second: b.length,
  };
}

// ---------------------------------------------------------------------------
// Note Repeat: while a pad is held it plays again on every step of the rate's
// grid, as the MPC's does. The grid runs from the loop's (or run's) downbeat.

export const REPEAT_RATES = [
  { id: "1/8", perBeat: 2 },
  { id: "1/16", perBeat: 4 },
  { id: "1/16T", perBeat: 6 },
  { id: "1/32", perBeat: 8 },
] as const;
export type RepeatRate = (typeof REPEAT_RATES)[number]["id"];
export const repeatPerBeat = (rate: string) =>
  REPEAT_RATES.find((r) => r.id === rate)?.perBeat ?? 4;

/**
 * The next repeat of a pad hit at `hitAt` and still held at `now`: the first
 * grid step after both, and never within half a step of the hit itself (the
 * hit stands for that step).
 */
export function nextRepeatAt(now: number, hitAt: number, origin: number, stepMs: number): number {
  const after = Math.max(now, hitAt + stepMs / 2);
  return origin + Math.floor((after - origin) / stepMs + 1 + 1e-9) * stepMs;
}

/** Every repeat of a pad held from `downAt` to `upAt` (for tests and replays). */
export function repeatTimes(
  downAt: number,
  upAt: number,
  origin: number,
  stepMs: number,
): number[] {
  const out: number[] = [];
  for (let t = nextRepeatAt(downAt, downAt, origin, stepMs); t < upAt; t += stepMs) out.push(t);
  return out;
}

export const NOTE_REPEAT_EXERCISES = [
  {
    id: "build",
    label: m.music_rep_studio_repeat_build_label(),
    detail: m.music_rep_studio_repeat_build_detail(),
  },
  {
    id: "rolls",
    label: m.music_rep_studio_repeat_rolls_label(),
    detail: m.music_rep_studio_repeat_rolls_detail(),
  },
] as const;
export type NoteRepeatExercise = (typeof NOTE_REPEAT_EXERCISES)[number]["id"];

const EIGHTHS = "x.x.x.x.x.x.x.x.";

/**
 * The exercise's piece and the rate the app sets beat by beat (the MPC player
 * turns the rate knob; here the chart does). Rolls are written on the
 * sixteenth-triplet grid (24 a bar) and the 1/32 on 8 a beat, so each bar is
 * built from its beats.
 */
export function noteRepeatPiece(
  id: string,
): GrooveDef & { rateAt: (beat: number) => RepeatRate; repeatVoice: DrumVoiceId } {
  if (id === "rolls") {
    // Beat by beat: 8 straight eighths, or a roll at a rate.
    const bars: RepeatRate[][] = [
      ["1/8", "1/8", "1/8", "1/16"],
      ["1/8", "1/8", "1/8", "1/32"],
      ["1/8", "1/8", "1/16T", "1/16T"],
      ["1/8", "1/16", "1/8", "1/32"],
    ];
    const targets: GrooveDef["targets"] = [];
    bars.forEach((beats, b) => {
      beats.forEach((rate, k) => {
        const n = repeatPerBeat(rate);
        for (let i = 0; i < n; i++)
          targets.push({ voice: "hats", beat: b * 4 + k + i / n, accent: i ? "normal" : "accent" });
      });
      targets.push(
        { voice: "kick", beat: b * 4, accent: "accent" },
        { voice: "kick", beat: b * 4 + 1.75, accent: "normal" },
        { voice: "perc", beat: b * 4 + 2, accent: "accent" },
      );
    });
    targets.sort((x, y) => x.beat - y.beat);
    return {
      value: "repeat-rolls",
      label: m.music_rep_studio_rolls_piece(),
      bars: 4,
      sectionLabels: ["1/16 roll", "1/32 roll", "1/16T roll", "1/16 and 1/32"],
      targets,
      rateAt: (beat) => bars[Math.min(3, Math.floor(beat / 4))]?.[Math.floor(beat % 4)] ?? "1/8",
      repeatVoice: "hats",
    };
  }
  const g = gridGroove(
    "repeat-build",
    m.music_rep_studio_build_piece(),
    {
      snare: `${EIGHTHS}|${EIGHTHS}|xxxxxxxxxxxxxxxx|xxxxxxxxxxxxxxxx|................`,
      kick: "x...x...x...x...|x...x...x...x...|x...x...x...x...|x...x...x...x...|X...............",
      crash: "................|................|................|................|X...............",
    },
    { sections: ["1/8", "1/8", "1/16", "1/16", "drop"] },
  );
  return { ...g, rateAt: (beat) => (beat < 8 ? "1/8" : "1/16"), repeatVoice: "snare" };
}

/**
 * A build rises when each beat's mean level climbs with time (rank
 * correlation) and covers enough of the player's range.
 */
export const BUILD = { rho: 0.7, span: 0.4 } as const;
export function gradeBuild(
  hits: readonly { at: number; velocity: number }[],
  startAt: number,
  beatMs: number,
  beats: number,
  range: VelocityRange,
) {
  const perBeat = Array.from({ length: beats }, (_, k) =>
    hits
      .filter((h) => Math.floor((h.at - startAt + beatMs / 8) / beatMs) === k)
      .map((h) => inRange(h.velocity, range)),
  );
  const levels = perBeat.filter((x) => x.length).map(mean);
  const rho = rankCorrelation(levels);
  const span = levels.length ? Math.max(...levels) - Math.min(...levels) : 0;
  return {
    rho,
    span,
    rising: rho >= BUILD.rho && span >= BUILD.span,
    score: Math.max(0, rho) * 0.6 + Math.min(1, span / BUILD.span) * 0.4,
  };
}

// ---------------------------------------------------------------------------
// A loop recorded live on the pads, pass by pass (kick, then snare, then
// hats), with input quantise off, 50% or 100% and undo of the last pass.

export interface LiveHit {
  midi: number;
  /** Beats into the loop, as played (before any quantise). */
  beat: number;
  velocity: number;
  /** A Note Repeat retrigger, not a finger. */
  repeat?: boolean;
}
export interface LivePass {
  hits: LiveHit[];
  undone: boolean;
}

/** The beat a hit lands on after quantise (0: as played, 1: on the sixteenth), swing kept. */
export function quantiseBeat(
  beat: number,
  amount: number,
  swing = 50,
  loopBeats = Infinity,
): number {
  const pair = Math.floor(beat * 2);
  const candidates = [pair / 2, pair / 2 + (swing / 100) * 0.5, (pair + 1) / 2];
  const grid = candidates.reduce(
    (best, c) => (Math.abs(c - beat) < Math.abs(best - beat) ? c : best),
    candidates[0],
  );
  const q = beat + (grid - beat) * amount;
  return loopBeats < Infinity ? ((q % loopBeats) + loopBeats) % loopBeats : q;
}

/**
 * The live loop as built: how far each finger hit sat from the sixteenth grid
 * (swung), how many passes were kept, and whether a pass from the third on
 * was undone. Passes holds every pass in order, undone ones included.
 */
export const LIVE_LOOP = { passes: 3, timePass: 0.7, maxMinutes: 5 } as const;
export function gradeLiveLoop(
  passes: readonly LivePass[],
  opts: { bpm: number; swing?: number; minutes: number },
) {
  const kept = passes.filter((p) => !p.undone);
  const lateUndo = passes.findIndex(
    (p, i) =>
      p.undone && passes.slice(0, i).filter((x) => !x.undone).length >= LIVE_LOOP.passes - 1,
  );
  const fingers = kept.flatMap((p) => p.hits.filter((h) => !h.repeat));
  const beatMs = 60000 / opts.bpm;
  const offs = fingers.map(
    (h) => Math.abs(h.beat - quantiseBeat(h.beat, 1, opts.swing ?? 50)) * beatMs,
  );
  // As Improvise: 1 at 15 ms from the (swung) sixteenth on average, 0 at 60.
  const meanOff = offs.length ? mean(offs) : null;
  const time = meanOff === null ? 0 : Math.max(0, Math.min(1, 1 - (meanOff - 15) / 45));
  const built = Math.min(1, kept.filter((p) => p.hits.length).length / LIVE_LOOP.passes);
  const quick = opts.minutes <= LIVE_LOOP.maxMinutes;
  return {
    score: time * built * (quick ? 1 : 0.6) * (lateUndo >= 0 ? 0.8 : 1),
    correct: built === 1 && lateUndo < 0 && time >= LIVE_LOOP.timePass && quick,
    time,
    kept: kept.length,
    undos: passes.length - kept.length,
    lateUndo: lateUndo >= 0,
    repeats: kept.some((p) => p.hits.some((h) => h.repeat)),
  };
}

// ---------------------------------------------------------------------------
// Song-form pieces: sections built from the repertoire's grooves, each with a
// dynamics band, graded in one take (Melodics' lessons are this shape).

export type Dyn = "soft" | "medium" | "loud" | "rising";
/** Where each band sits in the player's range, 0 softest to 1 loudest (a proposal). */
export const DYN_BANDS: Record<Exclude<Dyn, "rising">, [number, number]> = {
  soft: [0, 0.45],
  medium: [0.3, 0.75],
  loud: [0.6, 1],
};
export interface SongSection {
  label: string;
  /** A repertoire groove id, or lanes written here. */
  groove: string | Lanes;
  bars: number;
  dyn: Dyn;
  /** A crash on the section's first beat. */
  crash?: boolean;
}
export interface SongForm {
  id: string;
  label: string;
  level: number;
  bpm: { start: number; target: number };
  sections: SongSection[];
}
export const SONG_FORMS: SongForm[] = [
  {
    id: "house-drop",
    label: m.music_rep_studio_form_house_drop(),
    level: 5,
    bpm: { start: 110, target: 124 },
    sections: [
      {
        label: "intro",
        groove: { kick: "x...x...x...x...", hats: "..x...x...x...x." },
        bars: 4,
        dyn: "soft",
      },
      { label: "groove", groove: "house", bars: 8, dyn: "medium" },
      {
        label: "build",
        groove: {
          snare: "x...x...x...x...|x.x.x.x.x.x.x.x.|xxxxxxxxxxxxxxxx|xxxxxxxxxxxxxxxx",
          kick: "x...x...x...x...|x...x...x...x...|x...x...x...x...|x...x...x...x...",
        },
        bars: 4,
        dyn: "rising",
      },
      { label: "drop", groove: "house", bars: 12, dyn: "loud", crash: true },
      {
        label: "outro",
        groove: { kick: "x...x...x...x...", hats: "x...x...x...x..." },
        bars: 4,
        dyn: "soft",
      },
    ],
  },
  {
    id: "verse-chorus",
    label: m.music_rep_studio_form_verse_chorus(),
    level: 6,
    bpm: { start: 90, target: 110 },
    sections: [
      { label: "intro", groove: { hats: EIGHTHS }, bars: 2, dyn: "soft" },
      { label: "verse", groove: "basic-rock", bars: 8, dyn: "soft" },
      { label: "chorus", groove: "rock-open-hat", bars: 8, dyn: "loud", crash: true },
      { label: "verse 2", groove: "basic-rock", bars: 8, dyn: "soft" },
      { label: "chorus 2", groove: "rock-open-hat", bars: 8, dyn: "loud", crash: true },
    ],
  },
  {
    id: "break-set",
    label: m.music_rep_studio_form_break_set(),
    level: 4,
    bpm: { start: 84, target: 96 },
    sections: [
      { label: "intro", groove: { kick: "X.......x.......", hats: EIGHTHS }, bars: 4, dyn: "soft" },
      { label: "boom bap", groove: "boom-bap-b", bars: 8, dyn: "medium" },
      { label: "break", groove: "funky-drummer", bars: 8, dyn: "loud", crash: true },
      { label: "outro", groove: "boom-bap-b", bars: 4, dyn: "soft" },
    ],
  },
];

const sectionLanes = (s: SongSection): { lanes: Lanes; bars: number } | null => {
  if (typeof s.groove !== "string")
    return {
      lanes: s.groove,
      bars: s.groove[Object.keys(s.groove)[0] as keyof Lanes]!.split("|").length,
    };
  return null;
};

/** The whole piece as one groove: each section's bars labelled with it, a dynamics band per bar. */
export function songFormPiece(form: SongForm): GrooveDef & { dyn: Dyn[] } {
  const targets: GrooveDef["targets"] = [];
  const labels: string[] = [];
  const dyn: Dyn[] = [];
  let bar = 0;
  for (const s of form.sections) {
    const own = sectionLanes(s);
    const g = own
      ? gridGroove(s.label, s.label, own.lanes)
      : repertoireFor(s.groove as string)?.groove;
    if (!g || (g.beatsPerBar ?? 4) !== 4)
      throw new Error(`${form.id}: ${s.label} is not a 4/4 groove`);
    for (let b = 0; b < s.bars; b++) {
      const src = b % g.bars;
      for (const t of g.targets)
        if (Math.floor(t.beat / 4 + 1e-9) === src)
          targets.push({ ...t, beat: (bar + b) * 4 + t.beat - src * 4 });
      labels.push(s.label);
      dyn.push(s.dyn);
    }
    if (s.crash) targets.push({ voice: "crash", beat: bar * 4, accent: "accent" });
    bar += s.bars;
  }
  targets.sort((a, b) => a.beat - b.beat);
  return {
    value: `song-${form.id}`,
    label: form.label,
    bars: bar,
    sectionLabels: labels,
    targets,
    dyn,
  };
}

/**
 * Each section's dynamics: the mean level of its hits in the player's range
 * against its band, or a rise (rank correlation of each beat's level) for a
 * build. Null when velocity was not measured.
 */
export function sectionDynamics(
  piece: { sectionLabels: readonly string[]; dyn: readonly Dyn[] },
  hits: readonly { at: number; velocity: number }[],
  startAt: number,
  beatMs: number,
  range: VelocityRange,
): { label: string; dyn: Dyn; level: number | null; ok: boolean | null }[] {
  const out: { label: string; dyn: Dyn; level: number | null; ok: boolean | null }[] = [];
  piece.sectionLabels.forEach((label, b) => {
    if (b && piece.sectionLabels[b - 1] === label) return;
    let end = b;
    while (end < piece.sectionLabels.length && piece.sectionLabels[end] === label) end++;
    const from = startAt + b * 4 * beatMs - beatMs / 8;
    const to = startAt + end * 4 * beatMs - beatMs / 8;
    const mine = hits.filter((h) => h.at >= from && h.at < to);
    const dyn = piece.dyn[b];
    if (!mine.length) return void out.push({ label, dyn, level: null, ok: null });
    const levels = mine.map((h) => inRange(h.velocity, range));
    const level = mean(levels);
    if (dyn === "rising") {
      const g = gradeBuild(mine, from + beatMs / 8, beatMs, (end - b) * 4, range);
      return void out.push({ label, dyn, level, ok: g.rising });
    }
    const [lo, hi] = DYN_BANDS[dyn];
    out.push({ label, dyn, level, ok: level >= lo - 0.02 && level <= hi + 0.02 });
  });
  return out;
}

/** A section passes with 90% of its notes, few extras, and its band when measured. */
export const SECTION_PASS = { matched: 0.9, extraShare: 0.1 } as const;
export function sectionPasses(
  tally: { matched: number; missed: number; extra: number },
  dynOk: boolean | null,
): boolean {
  const total = tally.matched + tally.missed;
  return (
    total > 0 &&
    tally.matched / total >= SECTION_PASS.matched &&
    tally.extra <= Math.max(1, Math.round(total * SECTION_PASS.extraShare)) &&
    dynOk !== false
  );
}

// ---------------------------------------------------------------------------
// A piece you write (pads path 11.9, the set): sections in order from the
// app's grooves at any level, a chop section on the slices, a solo over a
// loop (graded as Improvise is) and an end, a fill landing on the one or a
// stop. Each section has its bars and its dynamics band, graded in one take.

export type WrittenRole = "intro" | "groove" | "chop" | "solo" | "end";
export interface WrittenSection {
  role: WrittenRole;
  /** Intro, groove: a repertoire groove. Chop: a chop source. Solo: the groove the app loops under it. End: a fill id or "stop". */
  ref: string;
  /** Chop: "order", or an edit id for a written reorder. */
  edit?: string;
  /** An end is 1 bar (a stop) or 2 (the fill, then the one), whatever this says. */
  bars: number;
  dyn: Dyn;
}
export interface WrittenSong {
  id: string;
  label: string;
  bpm: number;
  sections: WrittenSection[];
}
/** Where a section sits in the piece, in bars, under its unique label. */
export interface WrittenSpan {
  label: string;
  role: WrittenRole;
  from: number;
  bars: number;
}
export type WrittenPiece = PadPiece & {
  dyn: Dyn[];
  spans: WrittenSpan[];
  /** The chop source on the slices (every chop section plays the first one's), or null. */
  chop: string | null;
  /** What the app plays under the solos: their loops on the kit. */
  under: Target[];
};

/** Grooves a piece can use: 4/4 on the sixteenth grid (a piece is one grid), any level. */
export const WRITTEN_GROOVES = PAD_REPERTOIRE.filter(
  (r) =>
    r.topic !== "phrases" &&
    (r.groove.beatsPerBar ?? 4) === 4 &&
    (r.groove.stepsPerBeat ?? 4) === 4,
).sort((a, b) => a.level - b.level);
export const WRITTEN_ENDS = [
  { id: "stop", label: m.music_rep_studio_end_stop() },
  ...PAD_FILLS.filter((f) => !f.groove).map((f) => ({
    id: f.id,
    label: m.music_rep_studio_end_fill({ fill: f.label }),
  })),
];
const GROOVE_PADS: Record<string, number> = Object.fromEntries(
  GROOVE_VOICES.map((v) => [v.id, v.midi]),
);

/** A new piece in the set's shape: about three minutes at 90. */
export function newWrittenSong(id: string): WrittenSong {
  return {
    id,
    label: m.music_rep_studio_my_set(),
    bpm: 90,
    sections: [
      { role: "intro", ref: "eighth-hats", bars: 4, dyn: "soft" },
      { role: "groove", ref: "boom-bap-b", bars: 16, dyn: "medium" },
      { role: "groove", ref: "funky-drummer", bars: 16, dyn: "loud" },
      { role: "chop", ref: "boom-bap-b", edit: "flip", bars: 8, dyn: "medium" },
      { role: "groove", ref: "dilla", bars: 16, dyn: "medium" },
      { role: "solo", ref: "boom-bap-b", bars: 8, dyn: "loud" },
      { role: "end", ref: "snare-eighths", bars: 2, dyn: "loud" },
    ],
  };
}

/** The whole piece as one groove, a label and a band per bar; slices are voices `slice-N`. */
export function writtenPiece(song: WrittenSong): WrittenPiece {
  const targets: Target[] = [];
  const under: Target[] = [];
  const labels: string[] = [];
  const dyn: Dyn[] = [];
  const spans: WrittenSpan[] = [];
  const seen: Partial<Record<WrittenRole, number>> = {};
  let chop: string | null = null;
  let bar = 0;
  for (const s of song.sections) {
    seen[s.role] = (seen[s.role] ?? 0) + 1;
    const label =
      song.sections.filter((x) => x.role === s.role).length > 1
        ? `${s.role} ${seen[s.role]}`
        : s.role;
    let bars = Math.max(1, Math.round(s.bars));
    let src: { bars: number; targets: readonly Target[] } | undefined;
    if (s.role === "chop") {
      const source: ChopSource = chopSource(chop ?? s.ref) ?? CHOP_SOURCES[0];
      chop ??= source.id;
      src = chopPiece(source, s.edit && s.edit !== "order" ? "reorder" : "order", s.edit);
    } else if (s.role === "end") {
      bars = s.ref === "stop" ? 1 : 2;
      src = {
        bars,
        targets:
          s.ref === "stop"
            ? [
                { voice: "crash", beat: 0, accent: "accent" },
                { voice: "kick", beat: 0, accent: "accent" },
              ]
            : fillGroove(s.ref)
                .targets.filter((t) => t.beat >= 12)
                .map((t) => ({ ...t, beat: t.beat - 12 })),
      };
    } else src = repertoireFor(s.ref)?.groove;
    if (!src) throw new Error(`${song.id}: ${label} has no groove ${s.ref}`);
    const into = s.role === "solo" ? under : targets;
    for (let b = 0; b < bars; b++) {
      const at = b % src.bars;
      for (const t of src.targets)
        if (Math.floor(t.beat / 4 + 1e-9) === at)
          into.push({ ...t, beat: (bar + b) * 4 + t.beat - at * 4 });
      labels.push(label);
      dyn.push(s.dyn);
    }
    spans.push({ label, role: s.role, from: bar, bars });
    bar += bars;
  }
  targets.sort((a, b) => a.beat - b.beat);
  return {
    value: `song-own-${song.id}`,
    label: song.label,
    bars: bar,
    sectionLabels: labels,
    targets,
    dyn,
    spans,
    chop,
    under,
  };
}

/** The set (pads 11.9): an intro first, grooves from three levels, a chop, a solo, an end last, 3 to 5 minutes. */
export const THE_SET = { levels: 3, minMinutes: 3, maxMinutes: 5 } as const;
export function setCheck(song: WrittenSong, bpm: number) {
  const roles = song.sections.map((s) => s.role);
  const levels = new Set(
    song.sections.filter((s) => s.role === "groove").map((s) => repertoireFor(s.ref)?.level),
  ).size;
  const minutes = (writtenPiece(song).bars * 4) / bpm;
  const missing = [
    ...(roles[0] === "intro" ? [] : [m.music_rep_studio_missing_intro()]),
    ...(levels >= THE_SET.levels ? [] : [m.music_rep_studio_missing_levels({ levels })]),
    ...(roles.includes("chop") ? [] : [m.music_rep_studio_missing_chop()]),
    ...(roles.includes("solo") ? [] : [m.music_rep_studio_missing_solo()]),
    ...(roles.at(-1) === "end" ? [] : [m.music_rep_studio_missing_end()]),
    ...(minutes >= THE_SET.minMinutes - 1e-9 && minutes <= THE_SET.maxMinutes + 1e-9
      ? []
      : [m.music_rep_studio_missing_minutes()]),
  ];
  return { ok: !missing.length, minutes, missing };
}

export interface WrittenSectionGrade extends WrittenSpan {
  matched: number;
  missed: number;
  extra: number;
  /** A solo's time and density, as Improvise grades them. */
  solo: ImproviseGrade | null;
  dyn: ReturnType<typeof sectionDynamics>[number] | null;
  pass: boolean;
}

/**
 * A written piece in one take, section by section: each section's notes on
 * its own pads (the slices share A01 to A16 with the kit, so a chop is graded
 * on its own), a solo on time and density, and every band when velocity was
 * measured (`range` null when it was not).
 */
export function gradeWrittenSong(
  piece: WrittenPiece,
  hits: readonly NoteEvent[],
  startAt: number,
  beatMs: number,
  range: VelocityRange | null,
) {
  const ons = hits.filter((h) => h.kind === "noteon");
  const w = grooveWindowMs(beatMs);
  const dyn = range ? sectionDynamics(piece, ons, startAt, beatMs, range) : null;
  const perTarget: (number | null)[] = piece.targets.map(() => null);
  const metrics: Metric[] = [];
  const sections = piece.spans.map((sp): WrittenSectionGrade => {
    const from = startAt + sp.from * 4 * beatMs;
    const mine = ons.filter((h) => h.at >= from - w && h.at < from + sp.bars * 4 * beatMs - w);
    const d = dyn?.find((x) => x.label === sp.label) ?? null;
    if (sp.role === "solo") {
      const g = gradeImprovise(mine, from, beatMs, sp.bars);
      const base = { ...sp, matched: 0, missed: 0, extra: 0, solo: g, dyn: d };
      return { ...base, pass: g.correct && d?.ok !== false };
    }
    const idx = piece.targets.flatMap((t, i) =>
      t.beat >= sp.from * 4 - 1e-9 && t.beat < (sp.from + sp.bars) * 4 - 1e-9 ? [i] : [],
    );
    const r = gradeGroove({
      targets: idx.map((i) => piece.targets[i]),
      voicePads: sp.role === "chop" ? CHOP_PADS : GROOVE_PADS,
      sectionLabels: [sp.label],
      beatsPerBar: 4,
      beatMs,
      startAt,
      hits: mine,
    });
    if ("error" in r) throw new Error(r.error);
    idx.forEach((i, k) => (perTarget[i] = r.perTarget[k]));
    metrics.push(...r.metrics);
    const tally = { matched: r.matched, missed: r.missed, extra: r.extra };
    return { ...sp, ...tally, solo: null, dyn: d, pass: sectionPasses(tally, d?.ok ?? null) };
  });
  const passed = sections.filter((x) => x.pass).length;
  return {
    sections,
    passed,
    score: passed / Math.max(1, sections.length),
    correct: passed === sections.length,
    perTarget,
    metrics,
  };
}

// ---------------------------------------------------------------------------
// Feel by ear: a groove heard straight, swung, as a shuffle or in 12/8. Each
// feel is played by grooves of its kind at their own tempos, so the kit's
// sound gives nothing away; the answer is in where the off-beats fall.

export const FEELS = [
  {
    id: "straight",
    label: m.music_rep_studio_feel_straight_label(),
    hint: m.music_rep_studio_feel_straight_hint(),
    grooves: ["basic-rock", "rock-open-hat", "boom-bap-b", "house"],
  },
  {
    id: "swung",
    label: m.music_rep_studio_feel_swung_label(),
    hint: m.music_rep_studio_feel_swung_hint(),
    grooves: ["swing-ride"],
  },
  {
    id: "shuffle",
    label: "Shuffle",
    hint: m.music_rep_studio_feel_shuffle_hint(),
    grooves: ["blues-shuffle", "shuffle-ghosts", "purdie"],
  },
  {
    id: "twelve-eight",
    label: "12/8",
    hint: m.music_rep_studio_feel_twelve_eight_hint(),
    grooves: ["slow-blues"],
  },
] as const;
export type FeelId = (typeof FEELS)[number]["id"];

/** A feel to name: one of its grooves at a tempo inside the groove's range. */
export function feelPrompt(rand: () => number, previous?: FeelId) {
  let feel = FEELS[Math.floor(rand() * FEELS.length)];
  if (feel.id === previous)
    feel = FEELS[(FEELS.indexOf(feel) + 1 + Math.floor(rand() * 3)) % FEELS.length];
  const id = feel.grooves[Math.floor(rand() * feel.grooves.length)];
  const r = repertoireFor(id)!;
  const bpm = Math.round(r.bpm.start + rand() * (r.bpm.target - r.bpm.start));
  return { feel: feel.id as FeelId, groove: r.groove, bpm, swing: r.swing ?? 50 };
}
