// Pure helpers over the canonical score, shared by every notation view.
// Beats are quarter notes: a bar of `meter` lasts beats * 4 / beatUnit beats
// (6/8 is 3 beats long). Change `barBeats` if the score contract says otherwise.

import { isBlackKey, type Score, type ScoreGroup, type ScoreNote } from "@repo/music-core";

export interface BeatRange {
  startBeat: number;
  endBeat: number;
}

export interface Bar extends BeatRange {
  /** 1-based bar number, as a musician counts. */
  number: number;
}

export interface TabTuning {
  /** String 1 (highest pitched) first. */
  openStrings: number[];
  fretCount: number;
}

export interface TabPos {
  string: number;
  fret: number;
}

const EPS = 1e-6;
const key = (beat: number) => Math.round(beat * 1e4);

export const barBeats = (meter: Score["meter"]) => (meter.beats * 4) / meter.beatUnit;
export const beatToMs = (beat: number, bpm: number) => (beat * 60000) / bpm;

export function bars(score: Pick<Score, "meter" | "lengthBeats">): Bar[] {
  const len = barBeats(score.meter);
  const count = Math.max(1, Math.ceil(score.lengthBeats / len - EPS));
  return Array.from({ length: count }, (_, i) => ({
    number: i + 1,
    startBeat: i * len,
    endBeat: (i + 1) * len,
  }));
}

/** The bars a range touches, widened to whole bars. */
export function barsIn(all: Bar[], range?: BeatRange | null): Bar[] {
  if (!range) return all;
  return all.filter((b) => b.endBeat > range.startBeat + EPS && b.startBeat < range.endBeat - EPS);
}

/** Fold tie continuations into the note they continue, so each note is one attack. */
export function mergeTies(notes: ScoreNote[]): ScoreNote[] {
  const sorted = [...notes].sort((a, b) => a.startBeat - b.startBeat || a.midi - b.midi);
  const out: ScoreNote[] = [];
  for (const n of sorted) {
    if (n.tieFrom) {
      const prev = out.findLast(
        (p) => p.midi === n.midi && Math.abs(p.startBeat + p.durationBeats - n.startBeat) < 1e-3,
      );
      if (prev) {
        prev.durationBeats += n.durationBeats;
        continue;
      }
    }
    out.push({ ...n, tieFrom: undefined });
  }
  return out;
}

export function selectedVoices(score: Score, voiceIds?: string[] | null) {
  return voiceIds?.length ? score.voices.filter((v) => voiceIds.includes(v.id)) : score.voices;
}

/** Notes grouped by onset: the units a follower waits for. Ties are not attacks. */
export function scoreGroups(
  score: Score,
  voiceIds?: string[] | null,
  range?: BeatRange | null,
): ScoreGroup[] {
  const byOnset = new Map<number, ScoreGroup["notes"]>();
  for (const voice of selectedVoices(score, voiceIds)) {
    for (const n of mergeTies(voice.notes)) {
      if (range && (n.startBeat < range.startBeat - EPS || n.startBeat >= range.endBeat - EPS))
        continue;
      const k = key(n.startBeat);
      const list = byOnset.get(k) ?? [];
      list.push({ ...n, voiceId: voice.id });
      byOnset.set(k, list);
    }
  }
  return [...byOnset.values()]
    .sort((a, b) => a[0].startBeat - b[0].startBeat)
    .map((notes, index) => ({
      index,
      startBeat: notes[0].startBeat,
      durationBeats: Math.max(...notes.map((n) => n.durationBeats)),
      notes: notes.sort((a, b) => a.midi - b.midi),
    }));
}

/** Index of the group starting at `beat`, or -1. */
export function groupAt(groups: ScoreGroup[], beat: number) {
  return groups.findIndex((g) => key(g.startBeat) === key(beat));
}

/**
 * Tab positions, aligned with `notes`. Keeps a given string/fret when it is
 * playable; otherwise the lowest fret on a string no other note of the same
 * onset uses. Out of range gives null.
 * ponytail: lowest fret per note, no hand-position window; add one if shapes read badly.
 */
export function assignTab(
  notes: Pick<ScoreNote, "midi" | "startBeat" | "string" | "fret">[],
  tuning: TabTuning,
  maxFret = tuning.fretCount,
): (TabPos | null)[] {
  const used = new Map<number, Set<number>>();
  const order = notes.map((_, i) => i).sort((a, b) => notes[b].midi - notes[a].midi);
  const out: (TabPos | null)[] = notes.map(() => null);
  for (const i of order) {
    const n = notes[i];
    const taken = used.get(key(n.startBeat)) ?? new Set<number>();
    used.set(key(n.startBeat), taken);
    const playable = (s: number, f: number) =>
      s >= 1 && s <= tuning.openStrings.length && f >= 0 && f <= maxFret && !taken.has(s);
    let pos: TabPos | null = null;
    if (
      n.string != null &&
      n.fret != null &&
      playable(n.string, n.fret) &&
      tuning.openStrings[n.string - 1] + n.fret === n.midi
    ) {
      pos = { string: n.string, fret: n.fret };
    } else {
      tuning.openStrings.forEach((open, s) => {
        const fret = n.midi - open;
        if (playable(s + 1, fret) && (!pos || fret < pos.fret)) pos = { string: s + 1, fret };
      });
    }
    if (pos) taken.add(pos.string);
    out[i] = pos;
  }
  return out;
}

export interface KeyBox {
  midi: number;
  /** Fractions of the keyboard width. */
  x: number;
  width: number;
  black: boolean;
}

/**
 * Horizontal key boxes for a piano from `low` to `high`, as fractions of the
 * full width, so a keyboard and a waterfall line up column for column.
 * A black edge key widens the range to its white neighbour.
 */
export function whiteKeyLayout(low: number, high: number): Record<number, KeyBox> {
  const lo = isBlackKey(low) ? low - 1 : low;
  const hi = isBlackKey(high) ? high + 1 : high;
  let whites = 0;
  for (let m = lo; m <= hi; m++) if (!isBlackKey(m)) whites++;
  const w = 1 / whites;
  const blackW = w * 0.6;
  const out: Record<number, KeyBox> = {};
  let i = 0;
  for (let m = lo; m <= hi; m++) {
    if (isBlackKey(m)) out[m] = { midi: m, x: i * w - blackW / 2, width: blackW, black: true };
    else out[m] = { midi: m, x: i++ * w, width: w, black: false };
  }
  return out;
}
