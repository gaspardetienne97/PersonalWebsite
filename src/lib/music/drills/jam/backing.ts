// Generated jam backing: a drum groove and/or comped chords for a progression,
// as one sequence for audio.playSequence, plus where in the form a beat falls.
import { parseChordSymbol } from "@repo/music-core/theory/chords";
import { swings, type Progression } from "@repo/music-core/content/jam";
import { callPhrase } from "@repo/music-core/content/call-response";
import type { Rand } from "@repo/music-core/content/random";
import { bandBar, type Windows } from "@repo/music-core/scoring/improv";
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

/**
 * `choruses` repeats of the form starting at `fromChord`, `bpm` quarter notes.
 * Swung tunes get hats on 2 and 4 with a swung ride; the rest a straight rock beat.
 * Chords comp on 1 and 3 (a half-bar chord once), the bass root then fifth.
 * With `windows`, the band's bars drop the chords for a drum break when trading
 * (`bandPlays: "drums"`); a call is added by the page (`callNotes`).
 */
export function backingNotes(
  p: Progression,
  opts: { bpm: number; mode: BackingMode; choruses: number; fromChord?: number; windows?: Windows },
): SequenceNote[] {
  const beat = 60 / opts.bpm;
  const out: SequenceNote[] = [];
  const swing = swings(p);
  const drums = opts.mode === "drums" || opts.mode === "both";
  const chords = opts.mode === "chords" || opts.mode === "both";
  const breakAt = (b: number) =>
    opts.windows?.bandPlays === "drums" &&
    bandBar(opts.windows, Math.floor(b / BEATS_PER_BAR + 1e-9));
  let at = 0;
  const count = p.chords.length * opts.choruses;
  for (let k = 0; k < count; k++) {
    const ch = p.chords[((opts.fromChord ?? 0) + k) % p.chords.length];
    const len = ch.bars * BEATS_PER_BAR;
    const v = chordVoicing(ch.symbol);
    for (let off = 0; chords && off < len - 1e-9; off += 2) {
      if (breakAt(at + off)) continue;
      const dur = Math.min(1.9, len - off - 0.1);
      const t = (at + off) * beat;
      for (const m of v.upper) out.push({ midi: m, time: t, duration: dur * beat, velocity: 0.45 });
      out.push({
        midi: off % 4 ? v.bass + 7 : v.bass,
        time: t,
        duration: dur * beat,
        velocity: 0.6,
      });
    }
    at += len;
  }
  for (let bar = 0; drums && bar < Math.round(at / BEATS_PER_BAR); bar++) {
    const t0 = bar * BEATS_PER_BAR * beat;
    const hit = (midi: number, when: number, velocity: number) =>
      out.push({ midi, time: t0 + when * beat, duration: 0.1, velocity, voice: "drum" });
    if (swing) {
      for (const w of [0, 1, 1 + 2 / 3, 2, 3, 3 + 2 / 3]) hit(42, w, w % 1 ? 0.35 : 0.55);
      hit(44, 1, 0.5);
      hit(44, 3, 0.5);
      hit(36, 0, 0.45);
      // The drummer's four: snare and toms on the last two beats of each break bar.
      if (breakAt(bar * BEATS_PER_BAR))
        for (const [m, w] of [
          [38, 2],
          [38, 2 + 2 / 3],
          [45, 3],
          [41, 3 + 2 / 3],
        ] as const)
          hit(m, w, 0.6);
    } else {
      for (let e = 0; e < 8; e++) hit(42, e / 2, e % 2 ? 0.35 : 0.5);
      hit(36, 0, 0.8);
      hit(36, 2.5, 0.6);
      hit(38, 1, 0.7);
      hit(38, 3, 0.7);
      if (breakAt(bar * BEATS_PER_BAR))
        for (const [m, w] of [
          [45, 3],
          [43, 3.5],
        ] as const)
          hit(m, w, 0.6);
    }
  }
  return out;
}

/** The band's calls in call and response: a phrase in each of its windows, over the chords there. */
export function callNotes(
  p: Progression,
  windows: Windows,
  bars: number,
  bpm: number,
  rand: Rand,
): SequenceNote[] {
  const beat = 60 / bpm;
  const out: SequenceNote[] = [];
  for (let bar = 0; bar < bars; bar++) {
    if (!bandBar(windows, bar) || (bar > 0 && bandBar(windows, bar - 1))) continue;
    for (const n of callPhrase(rand, { groove: p, bar, bars: windows.band }))
      out.push({
        midi: n.midi,
        time: (bar * BEATS_PER_BAR + n.startBeat) * beat,
        duration: n.durationBeats * beat * 0.9,
        velocity: 0.85,
      });
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
