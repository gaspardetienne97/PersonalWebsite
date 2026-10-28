// Layout maths for falling notes: lanes over the keyboard's keys, where a beat
// sits above the hit line, which bars and notes are in view. Fractions of the
// lane (x across, y up from the hit line) so the view and the keys share one grid.

import type { Score, ScoreNote } from "@repo/music-core";
import { bars, scoreGroups, voiceSides, type KeyBox } from "./groups";

export interface FallingNote {
  /** Stable across frames: voice, onset and pitch. */
  key: string;
  midi: number;
  start: number;
  dur: number;
  /** The onset group it belongs to (indexes groupStates). */
  group: number;
  side: "left" | "right";
  finger?: number | string;
  x: number;
  width: number;
  black: boolean;
}

/** Height above the hit line, as a fraction of the lane, of `beat` when the clock reads `now`. */
export const beatY = (beat: number, now: number, lookahead: number) => (beat - now) / lookahead;

/**
 * Guide lines down the lanes where two white keys meet with no black key
 * between: before each C (an octave line) and each F. The left edge has none.
 */
export function laneGuides(keys: Record<number, KeyBox>) {
  return Object.values(keys)
    .filter((k) => !k.black && k.x > 1e-6 && (k.midi % 12 === 0 || k.midi % 12 === 5))
    .map((k) => ({ x: k.x, octave: k.midi % 12 === 0 }));
}

/** Every drawable note of the selected voices on its key's lane; notes off the keyboard are left out. */
export function fallingNotes(
  score: Score,
  voiceIds: string[] | null | undefined,
  keys: Record<number, KeyBox>,
): FallingNote[] {
  const side = voiceSides(score, voiceIds);
  return scoreGroups(score, voiceIds).flatMap((g) =>
    g.notes.flatMap((n) => {
      const k = keys[n.midi];
      return k
        ? [
            {
              key: `${n.voiceId}:${n.startBeat}:${n.midi}`,
              midi: n.midi,
              start: n.startBeat,
              dur: n.durationBeats,
              group: g.index,
              side: side[n.voiceId],
              finger: n.finger,
              x: k.x,
              width: k.width,
              black: k.black,
            },
          ]
        : [];
    }),
  );
}

/** A note is drawn from a lookahead above the hit line until it has fallen past it. */
export const inView = (n: Pick<FallingNote, "start" | "dur">, now: number, lookahead: number) =>
  n.start + n.dur > now - 0.25 && n.start < now + lookahead;

/** Sounding at `now`: its bar is crossing the hit line. */
export const sounding = (n: Pick<FallingNote, "start" | "dur">, now: number) =>
  n.start <= now + 1e-6 && now < n.start + n.dur - 1e-6;

/** Bar lines (with their numbers) and beat lines in view. */
export function gridInView(
  score: Pick<Score, "meter" | "lengthBeats" | "meterChanges">,
  now: number,
  lookahead: number,
) {
  const all = bars(score);
  const near = (b: number) => b > now - 1 && b < now + lookahead + 1;
  const barLines = all
    .filter((b) => near(b.startBeat))
    .map((b) => ({ number: b.number, beat: b.startBeat }));
  const beatLines = all.flatMap((b) =>
    near(b.startBeat) || near(b.endBeat)
      ? Array.from(
          { length: Math.ceil(b.endBeat - b.startBeat - 1e-6) - 1 },
          (_, i) => b.startBeat + i + 1,
        ).filter(near)
      : [],
  );
  return { barLines, beatLines };
}

/** A drill's line as a score: one voice per hand when the notes carry hands, else one line. */
export function lineScore(
  notes: readonly (Pick<ScoreNote, "midi" | "startBeat" | "durationBeats" | "finger"> & {
    hand?: "left" | "right";
  })[],
  meter: Score["meter"] = { beats: 4, beatUnit: 4 },
): Score {
  const strip = ({
    midi,
    startBeat,
    durationBeats,
    finger,
  }: (typeof notes)[number]): ScoreNote => ({
    midi,
    startBeat,
    durationBeats,
    ...(finger !== undefined ? { finger } : {}),
  });
  const voices = notes.some((n) => n.hand)
    ? (["right", "left"] as const).flatMap((hand) => {
        const own = notes.filter((n) => (n.hand ?? "right") === hand).map(strip);
        return own.length
          ? [
              {
                id: hand === "right" ? "rh" : "lh",
                name: hand === "right" ? "Right hand" : "Left hand",
                hand,
                notes: own,
              },
            ]
          : [];
      })
    : [{ id: "line", name: "Line", notes: notes.map(strip) }];
  const barLen = (meter.beats * 4) / meter.beatUnit;
  const end = notes.reduce((m, n) => Math.max(m, n.startBeat + n.durationBeats), 0);
  return {
    id: "line",
    title: "Line",
    bpm: 90,
    meter,
    voices,
    lengthBeats: Math.max(barLen, Math.ceil(end / barLen - 1e-9) * barLen),
    source: { kind: "generated" },
  };
}

/** The views a piano drill offers its line in, kept in the address as `?view=`. */
export const NOTE_VIEWS = [
  { id: "staff", label: "Staff" },
  { id: "falling", label: "Falling notes" },
] as const;
