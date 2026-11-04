// How a pitch sits over a chord, named the way a jazz player says it: chord
// tones by their chord degree (R 3 5 b7), everything else as a tension (9 #11 b13).
import { pc } from "@repo/music-core";

/** Degree name of `semitones` above the root, given the chord's intervals. */
export function toneLabel(semitones: number, chordIntervals: readonly number[]): string {
  const s = pc(semitones);
  // Below the octave only: 7alt carries #11 and b13 as 18 and 20, never b5 or #5.
  const has = (i: number) => chordIntervals.includes(i);
  const inChord = has(s);
  switch (s) {
    case 0:
      return "R";
    case 1:
      return "b9";
    case 2:
      return "9";
    case 3:
      return inChord && !has(4) ? "b3" : "#9";
    case 4:
      return "3";
    case 5:
      return "11";
    case 6:
      return inChord && !has(7) ? "b5" : "#11";
    case 7:
      return "5";
    case 8:
      return inChord && !has(7) ? "#5" : "b13";
    case 9:
      return inChord && has(6) && !has(10) ? "bb7" : "13";
    case 10:
      return "b7";
    default:
      return "7";
  }
}

/**
 * The one line that says why a chord's scale fits it, from the scale's own
 * degrees: Lydian's raised 4th, Mixolydian's flat 7th, Dorian's natural 6th.
 * Matched on the whole word, so "Mixolydian" never gets Lydian's tip.
 */
export function scaleTip(scaleLabel: string): string | null {
  if (/\bmixolydian\b/i.test(scaleLabel)) return "Flat 7th: the chord's own 7th";
  if (/\blydian\b/i.test(scaleLabel)) return "Raised 4th: no clash with the 3rd";
  if (/\bdorian\b/i.test(scaleLabel)) return "Natural 6th: the minor's brighter colour";
  return null;
}
