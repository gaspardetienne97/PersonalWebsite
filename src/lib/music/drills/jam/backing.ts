// Generated jam backing: a drum groove and/or comped chords for a progression,
// as one sequence for audio.playSequence, plus where in the form a beat falls.
import { parseChordSymbol } from "@repo/music-core/theory/chords";
import type { Progression } from "@repo/music-core/content/jam";
import type { SequenceNote } from "$lib/music/runtime";

export type BackingMode = "none" | "drums" | "chords" | "both";
export const BEATS_PER_BAR = 4;

/** Where `beats` (from the start of chord `fromChord`) lands in the form. */
export function positionAt(p: Progression, fromChord: number, beats: number) {
  let chord = fromChord;
  let passed = 0;
  let left = Math.max(0, beats);
  for (let guard = 0; guard < 100_000; guard++) {
    const len = p.chords[chord].bars * BEATS_PER_BAR;
    if (left < len) return { chordIndex: chord, choruses: passed, beatInChord: left };
    left -= len;
    chord = (chord + 1) % p.chords.length;
    if (chord === 0) passed++;
  }
  return { chordIndex: chord, choruses: passed, beatInChord: 0 };
}

/** A close voicing near middle C with the root in the bass. */
export function chordVoicing(symbol: string): { bass: number; upper: number[] } {
  const c = parseChordSymbol(symbol);
  if (!c) return { bass: 48, upper: [] };
  const bass = 36 + c.rootPc + (c.rootPc < 4 ? 12 : 0);
  const upper = c.pcs
    .filter((p) => p !== c.rootPc || c.pcs.length < 4)
    .map((p) => 55 + ((p - 7 + 12) % 12));
  return { bass, upper: [...new Set(upper)].sort((a, b) => a - b) };
}

const SWING = new Set(["jazz", "blues"]);

/**
 * `choruses` repeats of the form starting at `fromChord`, `bpm` quarter notes.
 * Swing groups get hats on 2 and 4 with a swung ride; the rest a straight rock beat.
 */
export function backingNotes(
  p: Progression,
  opts: { bpm: number; mode: BackingMode; choruses: number; fromChord?: number },
): SequenceNote[] {
  const beat = 60 / opts.bpm;
  const out: SequenceNote[] = [];
  const swing = SWING.has(p.group);
  const drums = opts.mode === "drums" || opts.mode === "both";
  const chords = opts.mode === "chords" || opts.mode === "both";
  let bar = 0;
  const count = p.chords.length * opts.choruses;
  for (let k = 0; k < count; k++) {
    const ch = p.chords[((opts.fromChord ?? 0) + k) % p.chords.length];
    const v = chordVoicing(ch.symbol);
    for (let b = 0; b < ch.bars; b++, bar++) {
      const t0 = bar * BEATS_PER_BAR * beat;
      if (chords) {
        // Comp on 1 and 3; the bass walks root then fifth.
        for (const [at, len] of [
          [0, 1.9],
          [2, 1.9],
        ] as const) {
          for (const m of v.upper)
            out.push({ midi: m, time: t0 + at * beat, duration: len * beat, velocity: 0.45 });
          out.push({
            midi: at === 0 ? v.bass : v.bass + 7,
            time: t0 + at * beat,
            duration: len * beat,
            velocity: 0.6,
          });
        }
      }
      if (drums) {
        const hit = (midi: number, at: number, velocity: number) =>
          out.push({ midi, time: t0 + at * beat, duration: 0.1, velocity, voice: "drum" });
        if (swing) {
          for (const at of [0, 1, 1 + 2 / 3, 2, 3, 3 + 2 / 3]) hit(42, at, at % 1 ? 0.35 : 0.55);
          hit(44, 1, 0.5);
          hit(44, 3, 0.5);
          hit(36, 0, 0.45);
        } else {
          for (let e = 0; e < 8; e++) hit(42, e / 2, e % 2 ? 0.35 : 0.5);
          hit(36, 0, 0.8);
          hit(36, 2.5, 0.6);
          hit(38, 1, 0.7);
          hit(38, 3, 0.7);
        }
      }
    }
  }
  return out;
}

const IN_CHORD: Record<number, string> = {
  0: "R",
  1: "b9",
  2: "9",
  3: "b3",
  4: "3",
  5: "11",
  6: "b5",
  7: "5",
  8: "#5",
  9: "6",
  10: "b7",
  11: "7",
};
const TENSION: Record<number, string> = {
  0: "R",
  1: "b9",
  2: "9",
  3: "#9",
  4: "3",
  5: "11",
  6: "#11",
  7: "5",
  8: "b13",
  9: "13",
  10: "b7",
  11: "7",
};

/** The degree a pitch class plays over a chord: "b3" in the chord, "#9" as a tension. */
export function degreeLabel(symbol: string, pitchClass: number): string {
  const c = parseChordSymbol(symbol);
  if (!c) return "";
  const semi = (((pitchClass - c.rootPc) % 12) + 12) % 12;
  return (c.intervals.some((i) => i % 12 === semi) ? IN_CHORD : TENSION)[semi];
}
