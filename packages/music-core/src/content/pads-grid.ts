// Drum grooves written as step grids: one line per voice, sixteen steps a
// bar, bars joined with "|". "X" accent, "x" normal, "g" ghost, "." rest.
// Swing (MPC style, 50 straight to 75) delays every off-sixteenth: at 66 it
// sits on the triplet. Rhythm patterns are not recordings; nothing here is
// sampled or copied audio.

import type { DrumVoiceId, GrooveDef } from "../data";

export type Lanes = Partial<Record<DrumVoiceId, string>>;

/** Where step `i` (a sixteenth from the downbeat) sounds with `swing` (50..75). */
export function swungBeat(step: number, swing = 50): number {
  const eighth = Math.floor(step / 2) * 0.5;
  return step % 2 ? eighth + 0.5 * (swing / 100) : eighth;
}

/**
 * A groove from its grid. Every lane must have the same number of bars and
 * sixteen steps a bar; `sections` names each bar ("groove" when missing).
 */
export function gridGroove(
  value: string,
  label: string,
  lanes: Lanes,
  opts: { swing?: number; sections?: string[] } = {},
): GrooveDef {
  const rows = Object.entries(lanes) as [DrumVoiceId, string][];
  const bars = rows[0][1].split("|").length;
  const targets: GrooveDef["targets"] = [];
  for (const [voice, line] of rows) {
    const parts = line.split("|");
    if (parts.length !== bars)
      throw new Error(`${value}: ${voice} has ${parts.length} bars, not ${bars}`);
    parts.forEach((bar, b) => {
      const steps = bar.replace(/\s/g, "");
      if (steps.length !== 16)
        throw new Error(`${value}: ${voice} bar ${b + 1} has ${steps.length} steps`);
      [...steps].forEach((c, i) => {
        if (c === ".") return;
        if (!"Xxg".includes(c)) throw new Error(`${value}: unknown step "${c}"`);
        targets.push({
          voice,
          beat: b * 4 + swungBeat(i, opts.swing),
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
    targets,
  };
}
