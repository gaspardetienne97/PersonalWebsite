// Generated jam backing: a drum groove and/or comped chords for a progression,
// as one sequence for audio.playSequence, plus where in the form a beat falls.
import { parseChordSymbol } from "@repo/music-core/theory/chords";
import { barBeats, swings, type Progression } from "@repo/music-core/content/jam";
import { callPhrase } from "@repo/music-core/content/call-response";
import type { Rand } from "@repo/music-core/content/random";
import { bandBar, type Windows } from "@repo/music-core/scoring/improv";
import type { SequenceNote } from "#lib/music/runtime/index.ts";

/** "rhythm" is drums and bass with no chords, for comping over. */
export type BackingMode = "none" | "drums" | "chords" | "both" | "rhythm";
export const BEATS_PER_BAR = 4;

/** Where `beats` (from the start of chord `fromChord`) lands in the form. */
export function positionAt(p: Progression, fromChord: number, beats: number) {
  let chord = fromChord;
  let passed = 0;
  let left = Math.max(0, beats);
  for (let guard = 0; guard < 100_000; guard++) {
    const len = p.chords[chord].bars * barBeats(p);
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
 * Chords comp on 1 and 3 (a half-bar chord once), the bass root then fifth. In 3/4 the
 * ride plays the waltz (1, 2 and the and of 2, 3), chords on 1 and the and of 2, the bass on 1.
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
  const bpb = barBeats(p);
  const drums = opts.mode === "drums" || opts.mode === "both" || opts.mode === "rhythm";
  const chords = opts.mode === "chords" || opts.mode === "both";
  const bassOn = chords || opts.mode === "rhythm";
  const comp = bpb === 3 ? [0, 1.5] : [0, 2];
  const breakAt = (b: number) =>
    opts.windows?.bandPlays === "drums" && bandBar(opts.windows, Math.floor(b / bpb + 1e-9));
  let at = 0;
  const count = p.chords.length * opts.choruses;
  for (let k = 0; k < count; k++) {
    const ch = p.chords[((opts.fromChord ?? 0) + k) % p.chords.length];
    const len = ch.bars * bpb;
    const v = chordVoicing(ch.symbol);
    for (let bar = 0; bassOn && bar < len - 1e-9; bar += bpb)
      for (const h of comp) {
        const off = bar + h;
        if (off >= len - 1e-9 || breakAt(at + off)) continue;
        const dur = Math.min(bpb === 3 ? 1.4 : 1.9, len - off - 0.1);
        const t = (at + off) * beat;
        if (chords)
          for (const m of v.upper)
            out.push({ midi: m, time: t, duration: dur * beat, velocity: 0.45 });
        if (bpb === 3 && h) continue;
        out.push({
          midi: h ? v.bass + 7 : v.bass,
          time: t,
          duration: (bpb === 3 ? Math.min(2.8, len - off - 0.1) : dur) * beat,
          velocity: 0.6,
        });
      }
    at += len;
  }
  for (let bar = 0; drums && bar < Math.round(at / bpb); bar++) {
    const t0 = bar * bpb * beat;
    const hit = (midi: number, when: number, velocity: number) =>
      out.push({ midi, time: t0 + when * beat, duration: 0.1, velocity, voice: "drum" });
    if (bpb === 3) {
      for (const w of swing ? [0, 1, 1 + 2 / 3, 2] : [0, 0.5, 1, 1.5, 2, 2.5])
        hit(swing ? 51 : 42, w, w % 1 ? 0.35 : 0.55);
      hit(44, 1, 0.45);
      hit(44, 2, 0.45);
      hit(36, 0, 0.45);
    } else if (swing) {
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
    for (const n of callPhrase(rand, { groove: p, bar, bars: windows.band })) {
      // Calls are written in 4/4 bars; in 3/4 a note past the third beat is dropped.
      const inBar = n.startBeat % 4;
      if (inBar >= barBeats(p)) continue;
      out.push({
        midi: n.midi,
        time: ((bar + Math.floor(n.startBeat / 4)) * barBeats(p) + inBar) * beat,
        duration: n.durationBeats * beat * 0.9,
        velocity: 0.85,
      });
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
