// The finger-drumming skills beyond rudiments and grooves (docs/research/
// pads-aerophone-gaps.md): dynamics on a velocity ladder, fills that land on the
// one, playing a groove back by ear, an ostinato under a reading line,
// rudiments spread across the kit, and improvising over a loop. Patterns are
// grooves (so the groove grader scores them); the measures it lacks are here.
// Every threshold is a proposal to tune on the owner's controller.

import type { DrumVoiceId, GrooveDef } from "../data";
import { gridGroove, type Lanes } from "./pads-grid";
import { m } from "@repo/i18n/messages.js";

// ---------------------------------------------------------------------------
// Fills: three bars of a rock groove, a fill, crash and kick on the next one.

const ROCK: Lanes = {
  kick: "X.......x.x.....",
  snare: "....X.......X...",
  hats: "x.x.x.x.x.x.x.x.",
};
const EMPTY = "................";
/** The shuffle under the triplet fills: eighth triplets, twelve steps a bar. */
const SHUFFLE: Lanes = {
  kick: "X.....x.....",
  snare: "...X.....X..",
  hats: "x.xx.xx.xx.x",
};

export interface PadFill {
  id: string;
  label: string;
  /** The fill bar, voice by voice (missing voices rest). */
  bar: Lanes;
  /** The groove before it: rock when missing. */
  groove?: Lanes;
}
export const PAD_FILLS: PadFill[] = [
  {
    id: "snare-eighths",
    label: m.music_rep_padskills_fill_snare_eighths(),
    bar: { kick: "X...............", snare: "....X...x.x.x.x.", hats: "x.x.x.x........." },
  },
  {
    id: "down-the-toms",
    label: m.music_rep_padskills_fill_down_toms(),
    bar: {
      kick: "X...............",
      snare: "....X...xxxx....",
      hats: "x.x.x.x.........",
      "tom-mid": "............xx..",
      "tom-low": "..............xx",
    },
  },
  {
    id: "whole-bar",
    label: m.music_rep_padskills_fill_whole_bar(),
    bar: {
      kick: "X...............",
      snare: "xxxx............",
      "tom-high": "....xxxx........",
      "tom-mid": "........xxxx....",
      "tom-low": "............xxxx",
    },
  },
  {
    id: "triplet-snare",
    label: m.music_rep_padskills_fill_triplet_snare(),
    groove: SHUFFLE,
    bar: { kick: "X...........", snare: "...X..xxxxxx", hats: "x.xx.x......" },
  },
  {
    id: "triplet-toms",
    label: m.music_rep_padskills_fill_triplet_toms(),
    groove: SHUFFLE,
    bar: {
      kick: "X...........",
      snare: "...X..xxx...",
      hats: "x.xx.x......",
      "tom-high": ".........x..",
      "tom-mid": "..........x.",
      "tom-low": "...........x",
    },
  },
];

/**
 * The fill's groove: 3 bars of rock, the fill, and the landing (crash and kick)
 * on beat 17. `fill` indexes the fill's own notes: what the fill bar plays that
 * the groove bar would not (its kick on the one and hats are the groove's).
 */
export function fillGroove(id: string): GrooveDef & { landing: number[]; fill: number[] } {
  const fill = PAD_FILLS.find((f) => f.id === id) ?? PAD_FILLS[0];
  const base = fill.groove ?? ROCK;
  const width = Object.values(base)[0]!.length;
  const empty = ".".repeat(width);
  const voices = [...new Set([...Object.keys(base), ...Object.keys(fill.bar)])] as (keyof Lanes)[];
  const lanes: Lanes = {};
  for (const v of voices)
    lanes[v] = [base[v] ?? empty, base[v] ?? empty, base[v] ?? empty, fill.bar[v] ?? empty].join(
      "|",
    );
  const g = gridGroove(`fill-${fill.id}`, fill.label, lanes, {
    sections: ["groove", "groove", "groove", "fill"],
  });
  const targets = [
    ...g.targets,
    { voice: "crash" as const, beat: 16, accent: "accent" as const },
    { voice: "kick" as const, beat: 16, accent: "accent" as const },
  ];
  const inRock = (t: { voice: string; beat: number }) =>
    (base[t.voice as keyof Lanes]?.[Math.round(((t.beat - 12) * width) / 4)] ?? ".") !== ".";
  const own = targets.flatMap((t, i) => (t.beat >= 12 && t.beat < 16 && !inRock(t) ? [i] : []));
  return { ...g, targets, landing: [targets.length - 2, targets.length - 1], fill: own };
}

/**
 * How the fill went: its own notes' mean signed error (negative = rushed;
 * students rush fills) and how far the landing was from the one.
 */
export function fillReport(
  g: GrooveDef & { landing: number[]; fill: number[] },
  perTarget: readonly (number | null)[],
) {
  const inFill = g.fill.flatMap((i) => (perTarget[i] !== null ? [perTarget[i]!] : []));
  const land = g.landing.map((i) => perTarget[i]).filter((e): e is number => e !== null);
  const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);
  const fillMean = mean(inFill);
  return {
    fillMeanMs: fillMean,
    rushed: fillMean !== null && fillMean < -FILL.rushMs,
    landingMs: mean(land),
    landed: land.length === g.landing.length && land.every((e) => Math.abs(e) <= FILL.landMs),
  };
}
export const FILL = { rushMs: 15, landMs: 40 } as const;

// ---------------------------------------------------------------------------
// Rudiments on the kit: a paradiddle spread across the pads (Quest for Groove).

export type Stroke = "R" | "L";
/** The paradiddle the orchestrate drill spreads over the kit: two groups of four, the right hand leading. */
export const PARADIDDLE: Stroke[] = ["R", "L", "R", "R", "L", "R", "L", "L"];

export const ORCHESTRATIONS = [
  {
    id: "hats-snare",
    label: m.music_rep_padskills_orch_hats_snare(),
    detail: m.music_rep_padskills_orch_hats_snare_detail(),
  },
  {
    id: "ride-snare",
    label: m.music_rep_padskills_orch_ride_snare(),
    detail: m.music_rep_padskills_orch_ride_snare_detail(),
  },
  {
    id: "toms-lead",
    label: m.music_rep_padskills_orch_toms_lead(),
    detail: m.music_rep_padskills_orch_toms_lead_detail(),
  },
] as const;

/** Two bars of sixteenth paradiddles, voiced by the orchestration. */
export function orchestrationGroove(id: string): GrooveDef {
  const o = ORCHESTRATIONS.find((x) => x.id === id) ?? ORCHESTRATIONS[0];
  const targets: GrooveDef["targets"] = [];
  for (let i = 0; i < 32; i++) {
    const hand = PARADIDDLE[i % 8];
    const lead = i % 4 === 0;
    const beat = i / 4;
    const right = o.id === "ride-snare" ? "ride" : "hats";
    const voice =
      o.id === "toms-lead" && lead
        ? hand === "R"
          ? "tom-mid"
          : "tom-low"
        : hand === "R"
          ? right
          : "snare";
    targets.push({ voice, beat, accent: lead ? "accent" : "normal" });
    if (lead && o.id !== "toms-lead") targets.push({ voice: "kick", beat, accent: "normal" });
  }
  return {
    value: `orch-${o.id}`,
    label: m.music_rep_padskills_orch_groove_label({ name: o.label.toLowerCase() }),
    bars: 2,
    sectionLabels: ["paradiddles", "paradiddles"],
    targets,
  };
}

// ---------------------------------------------------------------------------
// Ostinato and a reading line: the hats keep eighths alone for two bars (the
// baseline), then hold them while the left hand reads a snare line (Ted Reed's
// Syncopation, Tim Kroker's split hands).

export const READING_LINES = [
  { id: "quarters", label: m.music_rep_padskills_line_quarters(), line: "x...x...x...x..." },
  {
    id: "backbeat-push",
    label: m.music_rep_padskills_line_backbeat_push(),
    line: "....x..x....x.x.",
  },
  { id: "offbeats", label: m.music_rep_padskills_line_offbeats(), line: "..x...x...x...x." },
  { id: "sixteenths", label: m.music_rep_padskills_line_sixteenths(), line: "...x..x..x...x.x" },
  // Generated each run: four new bars to read (Reed's Syncopation, one bar at a time).
  { id: "read", label: m.music_rep_padskills_line_read(), line: "" },
  // The clave is the ostinato here (on the rim) while the kick moves under it.
  { id: "clave", label: m.music_rep_padskills_line_clave(), line: "" },
] as const;

/** Who reads the line under the hats: the left hand on the snare, or the kick. */
export const INTERPRETATIONS = [
  { id: "snare", label: m.music_rep_padskills_interp_snare() },
  { id: "kick", label: m.music_rep_padskills_interp_kick() },
] as const;

/** One beat of a Syncopation-style line on sixteenths: quarters, eighths, dotted figures, rests. */
const READ_CELLS = [
  "x...",
  "x.x.",
  "..x.",
  "....",
  "x..x",
  "x.x.",
  "..x.",
  "x...",
  "xx..",
  "..xx",
] as const;

/**
 * `n` one-bar lines to read, each beat a cell, at least three notes a bar and
 * never a bar of plain quarters (that is a groove, not a reading line).
 */
export function readingLines(rand: () => number, n = 4): string[] {
  const out: string[] = [];
  while (out.length < n) {
    const bar = Array.from(
      { length: 4 },
      () => READ_CELLS[Math.floor(rand() * READ_CELLS.length)],
    ).join("");
    const notes = [...bar].filter((c) => c === "x").length;
    if (notes >= 3 && bar !== "x...x...x...x..." && !out.includes(bar)) out.push(bar);
  }
  return out;
}

/** The clave on the rim, and the four kick bars that move under it. */
const CLAVE = "x..x..x...x.x...";
const CLAVE_KICKS = [
  "x.......x.......",
  "x.....x.x.......",
  "...x..x....x..x.",
  "x..x....x.x...x.",
];

/**
 * Two bars of the ostinato alone (the baseline), then four with the line: the
 * hats in eighths with the snare (or the kick) reading, or the son clave on the
 * rim with the kick moving under it. `lines` are the four bars for "read".
 */
export function ostinatoGroove(
  id: string,
  opts: { interp?: string; lines?: string[] } = {},
): GrooveDef & { ostinato: DrumVoiceId } {
  const r = READING_LINES.find((x) => x.id === id) ?? READING_LINES[0];
  const clave = r.id === "clave";
  const ostinato: DrumVoiceId = clave ? "rim" : "hats";
  const reader: DrumVoiceId = clave || opts.interp === "kick" ? "kick" : "snare";
  const bars = clave
    ? CLAVE_KICKS
    : r.id === "read"
      ? (opts.lines ?? readingLines(Math.random))
      : [r.line, r.line, r.line, r.line];
  const lanes: Lanes = {
    [ostinato]: Array.from({ length: 6 }, () => (clave ? CLAVE : "x.x.x.x.x.x.x.x.")).join("|"),
    [reader]: [EMPTY, EMPTY, ...bars].join("|"),
  };
  const g = gridGroove(`ostinato-${r.id}`, r.label, lanes, {
    sections: [
      m.music_rep_padskills_section_alone(),
      m.music_rep_padskills_section_alone(),
      m.music_rep_padskills_section_with_line(),
      m.music_rep_padskills_section_with_line(),
      m.music_rep_padskills_section_with_line(),
      m.music_rep_padskills_section_with_line(),
    ],
  });
  return { ...g, ostinato };
}

/**
 * The ostinato's hit rate alone and under the line; held when it drops no more
 * than OSTINATO.maxDrop below the baseline (a proposal).
 */
export function ostinatoReport(
  g: GrooveDef,
  perTarget: readonly (number | null)[],
  ostinato: string = "hats",
) {
  const rate = (pred: (t: GrooveDef["targets"][number]) => boolean) => {
    const idx = g.targets.flatMap((t, i) => (pred(t) ? [i] : []));
    return idx.length ? idx.filter((i) => perTarget[i] !== null).length / idx.length : 0;
  };
  const alone = rate((t) => t.voice === ostinato && t.beat < 8);
  const together = rate((t) => t.voice === ostinato && t.beat >= 8);
  const line = rate((t) => t.voice !== ostinato);
  return { alone, together, line, held: together >= alone - OSTINATO.maxDrop };
}
export const OSTINATO = { maxDrop: 0.1 } as const;

// ---------------------------------------------------------------------------
// Play it back: the app plays a bar, you play it back in the next (Rockschool
// and Trinity playback tests). Four rounds; each call bar is followed by its answer.

export const ECHO_LEVELS = [
  {
    id: "kick-snare",
    label: m.music_rep_padskills_echo_kick_snare(),
    calls: [
      { kick: "X.......X.......", snare: "....X.......X..." },
      { kick: "X.....X.X.......", snare: "....X.......X..." },
      { kick: "X...X...X.......", snare: "....X.......X..." },
      { kick: "X.......X.X.....", snare: "....X.......X..." },
    ],
  },
  {
    id: "with-hats",
    label: m.music_rep_padskills_echo_with_hats(),
    calls: [
      { kick: "X.......X.......", snare: "....X.......X...", hats: "x.x.x.x.x.x.x.x." },
      { kick: "X.....X...X.....", snare: "....X.......X...", hats: "x.x.x.x.x.x.x.x." },
      { kick: "X.......X.X.....", snare: "....X.......X..x", hats: "x.x.x.x.x.x.x.x." },
      { kick: "X..X......X.....", snare: "....X.......X...", hats: "x.x.x.x.x.x.x.x." },
    ],
  },
  {
    id: "sixteenths",
    label: m.music_rep_padskills_echo_sixteenths(),
    calls: [
      { kick: "X.........X.....", snare: "....X..g.g..X...", hats: "xxxxxxxxxxxxxxxx" },
      { kick: "X..X..X...X.....", snare: "....X.......X...", hats: "x.x.x.x.x.x.x.x." },
      { kick: "X.......XX......", snare: "....X..g....X.g.", hats: "x.x.x.x.x.x.x.x." },
      { kick: "X.X.......X..X..", snare: "....X.......X...", hats: "xxxxxxxxxxxxxxxx" },
    ],
  },
] as const;

/**
 * Eight bars: call, answer, four times. Targets are only the answers (the
 * calls are played by the app), so the grader scores what you played back.
 */
export function echoGroove(levelId: string): GrooveDef & { calls: GrooveDef["targets"] } {
  const level = ECHO_LEVELS.find((l) => l.id === levelId) ?? ECHO_LEVELS[0];
  const calls: GrooveDef["targets"] = [];
  const targets: GrooveDef["targets"] = [];
  level.calls.forEach((lanes, r) => {
    for (const t of gridGroove("echo", "echo", lanes as Lanes).targets) {
      calls.push({ ...t, beat: t.beat + r * 8 });
      targets.push({ ...t, beat: t.beat + r * 8 + 4 });
    }
  });
  return {
    value: `echo-${level.id}`,
    label: m.music_rep_padskills_echo_groove_label({ level: level.label }),
    bars: 8,
    sectionLabels: Array.from({ length: 8 }, (_, b) =>
      b % 2
        ? m.music_rep_padskills_section_answer({ n: b / 2 + 0.5 })
        : m.music_rep_padskills_section_listen({ n: b / 2 + 1 }),
    ),
    targets,
    calls,
  };
}
/** A round's answer passes at this share of its notes matched (and no extras). */
export const ECHO_PASS = 0.9;

// ---------------------------------------------------------------------------
// Dynamics: velocity against the player's own range (each controller differs),
// set once by playing four soft and four loud hits.

export interface VelocityRange {
  soft: number;
  loud: number;
}
/** The range a drill assumes until the player has set their own on Dynamics. */
export const DEFAULT_RANGE: VelocityRange = { soft: 0.2, loud: 0.9 };
/** Where a velocity sits in the player's range, 0 (softest) to 1 (loudest). */
export const inRange = (v: number, r: VelocityRange) =>
  Math.max(0, Math.min(1, (v - r.soft) / Math.max(0.05, r.loud - r.soft)));

/** The calibration: the mean of the softest hits and of the loudest. */
export function velocityRange(
  soft: readonly number[],
  loud: readonly number[],
): VelocityRange | null {
  if (!soft.length || !loud.length) return null;
  const m = (xs: readonly number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;
  const r = { soft: m(soft), loud: m(loud) };
  return r.loud - r.soft >= 0.15 ? r : null;
}

export const DYNAMICS_EXERCISES = [
  { id: "ladder", label: m.music_rep_padskills_dyn_ladder(), notes: 16, perBeat: 2 },
  { id: "crescendo", label: m.music_rep_padskills_dyn_crescendo(), notes: 16, perBeat: 4 },
  { id: "even", label: m.music_rep_padskills_dyn_even(), notes: 16, perBeat: 2 },
] as const;
export type DynamicsId = (typeof DYNAMICS_EXERCISES)[number]["id"];
export const DYNAMICS = {
  inBandPass: 0.8,
  crescendoRho: 0.8,
  crescendoSpan: 0.5,
  evenSpread: 0.08,
} as const;

/** The band (0..1 of the range) note `i` of the ladder should land in. */
export const ladderBand = (i: number): [number, number] => {
  const b = Math.min(3, Math.floor(i / 4));
  return [b / 4, (b + 1) / 4];
};

const ranks = (xs: readonly number[]) => {
  const order = xs.map((x, i) => [x, i] as const).sort((a, b) => a[0] - b[0]);
  const r: number[] = Array(xs.length).fill(0);
  order.forEach(([, i], k) => (r[i] = k));
  return r;
};
/** Spearman's rank correlation of the levels with time. */
export function rankCorrelation(levels: readonly number[]): number {
  const n = levels.length;
  if (n < 3) return 0;
  const r = ranks(levels);
  const d2 = r.reduce((a, rk, i) => a + (rk - i) ** 2, 0);
  return 1 - (6 * d2) / (n * (n * n - 1));
}

/**
 * `levels`: each slot's velocity in the player's range (null = no hit there).
 * Ladder: share of hits in their band. Crescendo: rank correlation with time
 * and how much of the range it covers. Even: the spread (standard deviation).
 */
export function gradeDynamics(id: DynamicsId, levels: readonly (number | null)[]) {
  const hit = levels.filter((v): v is number => v !== null);
  const played = hit.length / Math.max(1, levels.length);
  if (id === "ladder") {
    const inBand =
      levels.filter(
        (v, i) => v !== null && v >= ladderBand(i)[0] - 0.02 && v <= ladderBand(i)[1] + 0.02,
      ).length / levels.length;
    return { score: inBand, correct: inBand >= DYNAMICS.inBandPass, inBand, played };
  }
  if (id === "crescendo") {
    const rho = rankCorrelation(hit);
    const span = hit.length ? Math.max(...hit) - Math.min(...hit) : 0;
    const score = Math.max(0, rho) * 0.6 + Math.min(1, span / DYNAMICS.crescendoSpan) * 0.4;
    return {
      score: score * played,
      correct: rho >= DYNAMICS.crescendoRho && span >= DYNAMICS.crescendoSpan && played === 1,
      rho,
      span,
      played,
    };
  }
  const mean = hit.reduce((a, b) => a + b, 0) / Math.max(1, hit.length);
  const spread = Math.sqrt(hit.reduce((a, b) => a + (b - mean) ** 2, 0) / Math.max(1, hit.length));
  const score = Math.max(0, 1 - spread / (DYNAMICS.evenSpread * 3)) * played;
  return { score, correct: spread <= DYNAMICS.evenSpread && played === 1, spread, mean, played };
}

// ---------------------------------------------------------------------------
// Improvise over a loop: described, not passed or failed (Trinity's improvising
// option; Melodics' listen-back; Maschine's partial quantise).

export interface ImproviseReport {
  hits: number;
  /** Standard deviation of each hit's distance from its nearest sixteenth, ms. */
  timingSpreadMs: number | null;
  /** Where the off-sixteenths sat, MPC swing % (50 straight, 66 triplet). */
  swing: number | null;
  /** 10th to 90th percentile velocity, 0..1. */
  velocity: [number, number] | null;
  pads: number[];
}
export function improviseReport(
  hits: readonly { at: number; midi: number; velocity: number }[],
  startAt: number,
  beatMs: number,
): ImproviseReport {
  const six = beatMs / 4;
  const offs = hits.map((h) => {
    const s = (h.at - startAt) / six;
    return { off: (s - Math.round(s)) * six, step: Math.round(s), raw: s };
  });
  const sd = (xs: number[]) => {
    const m = xs.reduce((a, b) => a + b, 0) / xs.length;
    return Math.sqrt(xs.reduce((a, b) => a + (b - m) ** 2, 0) / xs.length);
  };
  // Swing from hits nearer an off-sixteenth than a straight eighth: where in the eighth they fell.
  const offbeat = hits.flatMap((h) => {
    const e = ((h.at - startAt) / (beatMs / 2)) % 1;
    return e > 0.3 && e < 0.85 ? [e] : [];
  });
  const vs = hits.map((h) => h.velocity).sort((a, b) => a - b);
  const q = (f: number) => vs[Math.min(vs.length - 1, Math.floor(f * vs.length))];
  return {
    hits: hits.length,
    timingSpreadMs: offs.length > 1 ? sd(offs.map((o) => o.off)) : null,
    swing:
      offbeat.length >= 4
        ? Math.round((offbeat.reduce((a, b) => a + b, 0) / offbeat.length) * 100)
        : null,
    velocity: vs.length ? [q(0.1), q(0.9)] : null,
    pads: [...new Set(hits.map((h) => h.midi))].sort((a, b) => a - b),
  };
}
/**
 * Improvise graded on time and density (Check runs): how close hits sit to the
 * loop's grid, whether the tempo held (a line through the hits against the
 * grid, its slope the tempo played), and whether every bar kept going. With a
 * fill every `fillEvery` bars, each fill bar must be busier than the groove
 * bars and land a hit on the next bar's one.
 */
export interface ImproviseGrade {
  score: number;
  correct: boolean;
  /** 1 at 15 ms mean distance from the grid or closer, 0 at 60 ms; halved past 2 BPM of drift. */
  time: number;
  meanAbsMs: number | null;
  driftBpm: number | null;
  /** Bars with at least two hits, out of the bars. */
  density: number;
  fills: { expected: number; landed: number } | null;
  /** Different hit patterns among the busier bars (the fills). */
  distinctFills: number;
}
export const IMPROVISE_DRIFT_BPM = 2;

export function gradeImprovise(
  hits: readonly { at: number; midi: number }[],
  startAt: number,
  beatMs: number,
  bars: number,
  opts: { stepsPerBeat?: number; fillEvery?: number } = {},
): ImproviseGrade {
  const step = beatMs / (opts.stepsPerBeat ?? 4);
  const barMs = beatMs * 4;
  const rel = hits
    .map((h) => ({ ...h, t: h.at - startAt }))
    .filter((h) => h.t > -step / 2 && h.t < bars * barMs + step / 2);
  const offs = rel.map((h) => Math.abs(h.t - Math.round(h.t / step) * step));
  const meanAbsMs = offs.length ? offs.reduce((a, b) => a + b, 0) / offs.length : null;
  // Drift: each hit takes the grid step the line so far predicts, and the line is refitted as
  // it goes, so a steady rush is followed rather than snapped back to the nearest sixteenth.
  const pts: { x: number; y: number }[] = [];
  let slope = 1;
  let intercept = 0;
  for (const h of [...rel].sort((a, b) => a.t - b.t)) {
    pts.push({ x: Math.round((h.t - intercept) / slope / step) * step, y: h.t });
    if (pts.length < 2 || pts[pts.length - 1].x - pts[0].x < beatMs) continue;
    const mx = pts.reduce((a, p) => a + p.x, 0) / pts.length;
    const my = pts.reduce((a, p) => a + p.y, 0) / pts.length;
    const varx = pts.reduce((a, p) => a + (p.x - mx) ** 2, 0);
    // ponytail: clamped to a fifth either way, as tempoDrift does, so two close hits cannot throw it.
    slope = varx
      ? Math.min(1.25, Math.max(0.8, pts.reduce((a, p) => a + (p.x - mx) * (p.y - my), 0) / varx))
      : 1;
    intercept = my - slope * mx;
  }
  const driftBpm = pts.length >= 8 ? 60000 / beatMs / slope - 60000 / beatMs : null;
  const drifted = driftBpm !== null && Math.abs(driftBpm) >= IMPROVISE_DRIFT_BPM;
  let time = meanAbsMs === null ? 0 : Math.max(0, Math.min(1, 1 - (meanAbsMs - 15) / 45));
  if (drifted) time = Math.min(time, 0.5);
  const perBar = Array.from({ length: bars }, (_, b) =>
    rel.filter((h) => Math.floor((h.t + step / 2) / barMs) === b),
  );
  const density = perBar.filter((x) => x.length >= 2).length / Math.max(1, bars);
  const counts = perBar.map((x) => x.length).sort((a, b) => a - b);
  const median = counts[Math.floor(counts.length / 2)] ?? 0;
  const pattern = (b: number) =>
    perBar[b]
      .map((h) => `${h.midi}@${Math.round((h.t - b * barMs) / step)}`)
      .sort()
      .join(",");
  let fills: ImproviseGrade["fills"] = null;
  let fillBars: number[];
  if (opts.fillEvery) {
    fillBars = Array.from({ length: bars }, (_, b) => b).filter(
      (b) => (b + 1) % opts.fillEvery! === 0,
    );
    const groove = perBar
      .filter((_, b) => !fillBars.includes(b))
      .map((x) => x.length)
      .sort((a, b) => a - b);
    const typical = groove[Math.floor(groove.length / 2)] ?? 0;
    const window = Math.max(40, step * 0.6);
    const landed = fillBars.filter(
      (b) =>
        perBar[b].length > typical && rel.some((h) => Math.abs(h.t - (b + 1) * barMs) <= window),
    ).length;
    fills = { expected: fillBars.length, landed };
  } else fillBars = perBar.flatMap((x, b) => (x.length > Math.max(2, median * 1.5) ? [b] : []));
  const distinctFills = new Set(fillBars.filter((b) => perBar[b].length).map(pattern)).size;
  const parts = [time, density, ...(fills ? [fills.landed / Math.max(1, fills.expected)] : [])];
  const score = rel.length ? parts.reduce((a, b) => a + b, 0) / parts.length : 0;
  const correct =
    time >= 0.8 && !drifted && density === 1 && (!fills || fills.landed === fills.expected);
  return { score, correct, time, meanAbsMs, driftBpm, density, fills, distinctFills };
}
/** A take nudged `amount` (0..1) of the way to the nearest sixteenth (50% keeps some feel). */
export const quantise = <T extends { at: number }>(
  hits: readonly T[],
  startAt: number,
  beatMs: number,
  amount = 0.5,
): T[] =>
  hits.map((h) => {
    const six = beatMs / 4;
    const grid = startAt + Math.round((h.at - startAt) / six) * six;
    return { ...h, at: h.at + (grid - h.at) * amount };
  });
