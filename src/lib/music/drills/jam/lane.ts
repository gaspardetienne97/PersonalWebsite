// The form lane on the Jam stage: chords laid out by their length in beats,
// sliding past a fixed playhead, plus the spelled tones of the chord you're on.
import { parseChordSymbol } from "@repo/music-core/theory/chords";
import { spellAbove } from "@repo/music-core/content/jazz-voicings";
import { degreeLabel } from "./backing";

export type LaneState = "past" | "now" | "next" | "later";
export interface LaneBlock {
  /** Unique across choruses, for keyed rendering. */
  key: string;
  /** The chord's index in the form. */
  index: number;
  /** Beats from the top of the first chorus. */
  start: number;
  beats: number;
  state: LaneState;
}

/** How wide a beat is and where the playhead sits, for a lane `width` px wide. */
export function laneScale(width: number) {
  // About twelve beats across a phone, never so tight a half-bar chord loses its name.
  const pxPerBeat = Math.min(44, Math.max(24, width / 12));
  return { pxPerBeat, playheadX: Math.round(width * 0.22) };
}

/** Beats from the top of the first chorus to the start of `chordIndex` in chorus `chorus` (1-based). */
export function formPosition(lengths: number[], chorus: number, chordIndex: number) {
  const total = lengths.reduce((n, l) => n + l, 0);
  return (chorus - 1) * total + lengths.slice(0, chordIndex).reduce((n, l) => n + l, 0);
}

/**
 * The chords (`lengths` in beats, one chorus) that show between `at - behind` and
 * `at + ahead`, repeating the form for later choruses. Nothing before the first
 * chorus: in the count-in the first chord waits ahead as "next".
 */
export function laneBlocks(
  lengths: number[],
  at: number,
  behind: number,
  ahead: number,
): LaneBlock[] {
  const total = lengths.reduce((n, l) => n + l, 0);
  if (total <= 0) return [];
  const out: LaneBlock[] = [];
  const from = at - behind;
  const to = at + ahead;
  let nextFound = false;
  for (let cycle = Math.max(0, Math.floor(from / total)); cycle * total < to; cycle++) {
    let start = cycle * total;
    lengths.forEach((beats, index) => {
      const end = start + beats;
      let state: LaneState = "later";
      if (end <= at) state = "past";
      else if (start <= at) state = "now";
      else if (!nextFound) {
        state = "next";
        nextFound = true;
      }
      if (end > from && start < to)
        out.push({ key: `${cycle}:${index}`, index, start, beats, state });
      start = end;
    });
  }
  return out;
}

const DEGREE: Record<string, number> = { R: 1, "9": 2, "11": 4, "13": 6 };

/** The chord's own tones from the root up, as degree labels and spelled names: G7 is R G, 3 B, 5 D, b7 F. */
export function chordToneNames(symbol: string): { label: string; name: string }[] {
  const c = parseChordSymbol(symbol);
  if (!c) return [];
  const seen = new Set<number>();
  return c.intervals.flatMap((i) => {
    const semi = i % 12;
    if (seen.has(semi)) return [];
    seen.add(semi);
    const label = degreeLabel(symbol, c.rootPc + semi);
    const digits = label.replace(/[^0-9R]/g, "");
    return [{ label, name: spellAbove(c.rootName, semi, DEGREE[digits] ?? Number(digits)) }];
  });
}
