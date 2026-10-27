// Drum grooves written as step grids: one line per voice, bars joined with
// "|". "X" accent, "x" normal, "g" ghost, "." rest. A bar has `beats` clicks
// (4 unless said) and the same number of steps on every click: 4 (sixteenths),
// 3 (eighth triplets: a shuffle), 6 (sixteenth triplets) or 2 (eighths, or
// 7/8's sixteenths when it clicks eighths). Swing (MPC style, 50 straight to
// 75) delays the second step of every pair on an even grid: at 66 it sits on
// the triplet. Rhythm patterns are not recordings; nothing here is sampled
// or copied audio.

import type { DrumVoiceId, GrooveDef } from "../data";

export type Lanes = Partial<Record<DrumVoiceId, string>>;

/** Where step `i` (from the downbeat, `per` steps a click) sounds with `swing` (50..75). */
export function swungBeat(step: number, swing = 50, per = 4): number {
  const pair = 2 / per;
  const start = Math.floor(step / 2) * pair;
  return step % 2 ? start + pair * (swing / 100) : start;
}

/**
 * A groove from its grid. Every lane must have the same number of bars and
 * every bar the same steps, a whole number (2, 3, 4 or 6) on each of `beats`
 * clicks; `sections` names each bar ("groove" when missing).
 */
export function gridGroove(
  value: string,
  label: string,
  lanes: Lanes,
  opts: { swing?: number; sections?: string[]; beats?: number; meter?: string } = {},
): GrooveDef {
  const rows = Object.entries(lanes) as [DrumVoiceId, string][];
  const bars = rows[0][1].split("|").length;
  const beats = opts.beats ?? 4;
  const width = rows[0][1].split("|")[0].replace(/\s/g, "").length;
  const per = width / beats;
  if (![2, 3, 4, 6].includes(per))
    throw new Error(`${value}: ${width} steps do not split into ${beats} clicks`);
  if (opts.swing && per % 2) throw new Error(`${value}: a triplet grid can't swing`);
  const targets: GrooveDef["targets"] = [];
  for (const [voice, line] of rows) {
    const parts = line.split("|");
    if (parts.length !== bars)
      throw new Error(`${value}: ${voice} has ${parts.length} bars, not ${bars}`);
    parts.forEach((bar, b) => {
      const steps = bar.replace(/\s/g, "");
      if (steps.length !== width)
        throw new Error(`${value}: ${voice} bar ${b + 1} has ${steps.length} steps, not ${width}`);
      [...steps].forEach((c, i) => {
        if (c === ".") return;
        if (!"Xxg".includes(c)) throw new Error(`${value}: unknown step "${c}"`);
        targets.push({
          voice,
          beat: b * beats + swungBeat(i, opts.swing, per),
          accent: c === "X" ? "accent" : c === "g" ? "ghost" : "normal",
        });
      });
    });
  }
  targets.sort((a, b) => a.beat - b.beat);
  return {
    value,
    label,
    bars,
    sectionLabels: opts.sections ?? Array.from({ length: bars }, () => "groove"),
    ...(beats !== 4 ? { beatsPerBar: beats } : {}),
    ...(per !== 4 ? { stepsPerBeat: per } : {}),
    ...(opts.meter ? { meter: opts.meter } : {}),
    targets,
  };
}

/** The meter a groove is written in: 4/4, 5/4, 7/8 or 12/8. */
export const grooveMeter = (g: GrooveDef) =>
  g.meter ?? (g.stepsPerBeat === 2 ? `${g.beatsPerBar ?? 4}/8` : `${g.beatsPerBar ?? 4}/4`);

/** Where a hit sits inside its pair of steps (0 on the pair's first step). */
function inPair(beat: number, per: number) {
  const pair = 2 / per;
  return beat - Math.floor(beat / pair + 1e-9) * pair;
}

/**
 * Whether a groove written at `from` swing can take another: an even grid,
 * every hit on a pair's first step or its swung second one (no rolls, no
 * pushed snare).
 */
export function canSwing(g: GrooveDef, from = 50): boolean {
  const per = g.stepsPerBeat ?? 4;
  if (per % 2) return false;
  const off = (2 / per) * (from / 100);
  return g.targets.every((t) => {
    const x = inPair(t.beat, per);
    return x < 1e-6 || Math.abs(x - off) < 1e-6 || Math.abs(x - 2 / per) < 1e-6;
  });
}

/** The groove at another swing: every second step of a pair moved from `from` to `to`. */
export function reswing(g: GrooveDef, from: number, to: number): GrooveDef {
  if (from === to || !canSwing(g, from)) return g;
  const per = g.stepsPerBeat ?? 4;
  const pair = 2 / per;
  const off = pair * (from / 100);
  return {
    ...g,
    targets: g.targets.map((t) =>
      Math.abs(inPair(t.beat, per) - off) < 1e-6
        ? { ...t, beat: t.beat - off + pair * (to / 100) }
        : t,
    ),
  };
}
