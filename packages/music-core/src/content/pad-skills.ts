// The finger-drumming skills beyond rudiments and grooves (docs/research/
// pads-aerophone-gaps.md): dynamics on a velocity ladder, fills that land on the
// one, playing a groove back by ear, an ostinato under a reading line,
// rudiments spread across the kit, and improvising over a loop. Patterns are
// grooves (so the groove grader scores them); the measures it lacks are here.
// Every threshold is a proposal to tune on the owner's controller.

import type { GrooveDef } from "../data";
import { gridGroove, type Lanes } from "./pads-grid";

// ---------------------------------------------------------------------------
// Fills: three bars of a rock groove, a fill, crash and kick on the next one.

const ROCK: Lanes = {
  kick: "X.......x.x.....",
  snare: "....X.......X...",
  hats: "x.x.x.x.x.x.x.x.",
};
const EMPTY = "................";

export interface PadFill {
  id: string;
  label: string;
  /** The fill bar, voice by voice (missing voices rest). */
  bar: Lanes;
}
export const PAD_FILLS: PadFill[] = [
  {
    id: "snare-eighths",
    label: "Snare eighths on 3 and 4",
    bar: { kick: "X...............", snare: "....X...x.x.x.x.", hats: "x.x.x.x........." },
  },
  {
    id: "down-the-toms",
    label: "Sixteenths down the toms on 3 and 4",
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
    label: "A bar of sixteenths around the kit",
    bar: {
      kick: "X...............",
      snare: "xxxx............",
      "tom-high": "....xxxx........",
      "tom-mid": "........xxxx....",
      "tom-low": "............xxxx",
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
  const voices = [...new Set([...Object.keys(ROCK), ...Object.keys(fill.bar)])] as (keyof Lanes)[];
  const lanes: Lanes = {};
  for (const v of voices)
    lanes[v] = [ROCK[v] ?? EMPTY, ROCK[v] ?? EMPTY, ROCK[v] ?? EMPTY, fill.bar[v] ?? EMPTY].join(
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
    (ROCK[t.voice as keyof Lanes]?.[Math.round((t.beat - 12) * 4)] ?? ".") !== ".";
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

type Stroke = "R" | "L";
const PARADIDDLE: Stroke[] = ["R", "L", "R", "R", "L", "R", "L", "L"];

export const ORCHESTRATIONS = [
  {
    id: "hats-snare",
    label: "Hats and snare",
    detail: "Right on the hats, left on the snare, kick under the accents",
  },
  {
    id: "ride-snare",
    label: "Ride and snare",
    detail: "Right on the ride, left on the snare, kick under the accents",
  },
  {
    id: "toms-lead",
    label: "Toms lead",
    detail: "Each group's first stroke on a tom, the rest hats and snare",
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
    label: `Paradiddle: ${o.label.toLowerCase()}`,
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
  { id: "quarters", label: "Snare on the beats", line: "x...x...x...x..." },
  { id: "backbeat-push", label: "Backbeat with pushes", line: "....x..x....x.x." },
  { id: "offbeats", label: "Off-beat eighths", line: "..x...x...x...x." },
  { id: "sixteenths", label: "Sixteenth syncopations", line: "...x..x..x...x.x" },
] as const;

export function ostinatoGroove(id: string): GrooveDef {
  const r = READING_LINES.find((x) => x.id === id) ?? READING_LINES[0];
  const hats = Array.from({ length: 6 }, () => "x.x.x.x.x.x.x.x.").join("|");
  const snare = [EMPTY, EMPTY, r.line, r.line, r.line, r.line].join("|");
  return gridGroove(
    `ostinato-${r.id}`,
    r.label,
    { hats, snare },
    {
      sections: [
        "hats alone",
        "hats alone",
        "with the line",
        "with the line",
        "with the line",
        "with the line",
      ],
    },
  );
}

/**
 * The hats' hit rate alone and under the line; the ostinato held when it drops
 * no more than OSTINATO.maxDrop below the baseline (a proposal).
 */
export function ostinatoReport(g: GrooveDef, perTarget: readonly (number | null)[]) {
  const rate = (pred: (t: GrooveDef["targets"][number]) => boolean) => {
    const idx = g.targets.flatMap((t, i) => (pred(t) ? [i] : []));
    return idx.length ? idx.filter((i) => perTarget[i] !== null).length / idx.length : 0;
  };
  const alone = rate((t) => t.voice === "hats" && t.beat < 8);
  const together = rate((t) => t.voice === "hats" && t.beat >= 8);
  const line = rate((t) => t.voice === "snare");
  return { alone, together, line, held: together >= alone - OSTINATO.maxDrop };
}
export const OSTINATO = { maxDrop: 0.1 } as const;

// ---------------------------------------------------------------------------
// Play it back: the app plays a bar, you play it back in the next (Rockschool
// and Trinity playback tests). Four rounds; each call bar is followed by its answer.

export const ECHO_LEVELS = [
  {
    id: "kick-snare",
    label: "Kick and snare",
    calls: [
      { kick: "X.......X.......", snare: "....X.......X..." },
      { kick: "X.....X.X.......", snare: "....X.......X..." },
      { kick: "X...X...X.......", snare: "....X.......X..." },
      { kick: "X.......X.X.....", snare: "....X.......X..." },
    ],
  },
  {
    id: "with-hats",
    label: "With hats",
    calls: [
      { kick: "X.......X.......", snare: "....X.......X...", hats: "x.x.x.x.x.x.x.x." },
      { kick: "X.....X...X.....", snare: "....X.......X...", hats: "x.x.x.x.x.x.x.x." },
      { kick: "X.......X.X.....", snare: "....X.......X..x", hats: "x.x.x.x.x.x.x.x." },
      { kick: "X..X......X.....", snare: "....X.......X...", hats: "x.x.x.x.x.x.x.x." },
    ],
  },
  {
    id: "sixteenths",
    label: "Sixteenths and ghosts",
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
    label: `Play it back: ${level.label}`,
    bars: 8,
    sectionLabels: Array.from({ length: 8 }, (_, b) =>
      b % 2 ? `answer ${b / 2 + 0.5}` : `listen ${b / 2 + 1}`,
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
  { id: "ladder", label: "Four levels: four hits each, soft to loud", notes: 16, perBeat: 2 },
  { id: "crescendo", label: "Crescendo: a bar of sixteenths, soft to loud", notes: 16, perBeat: 4 },
  { id: "even", label: "Even: sixteen hits at the same level", notes: 16, perBeat: 2 },
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
