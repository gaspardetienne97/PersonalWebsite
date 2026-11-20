// Fixed colour identity for scale degrees: a musical object's own colour, always
// drawn with its text label (colour is never the only cue). The hue walks the
// chromatic circle so neighbouring degrees differ and 1 is always the same gold.
import { m } from "@repo/i18n/messages.js";
import { noteName } from "@repo/music-core";
import { SCALE_DEGREES } from "@repo/music-core/content/ear";

/** Each degree's role, in the current language (getters, so they read the locale when shown). */
export const DEGREE_ROLE: Record<string, string> = {
  get "1"() {
    return m.music_drills_ear_role_1();
  },
  get b2() {
    return m.music_drills_ear_role_b2();
  },
  get "2"() {
    return m.music_drills_ear_role_2();
  },
  get b3() {
    return m.music_drills_ear_role_b3();
  },
  get "3"() {
    return m.music_drills_ear_role_3();
  },
  get "4"() {
    return m.music_drills_ear_role_4();
  },
  get "#4"() {
    return m.music_drills_ear_role_s4();
  },
  get "5"() {
    return m.music_drills_ear_role_5();
  },
  get b6() {
    return m.music_drills_ear_role_b6();
  },
  get "6"() {
    return m.music_drills_ear_role_6();
  },
  get b7() {
    return m.music_drills_ear_role_b7();
  },
  get "7"() {
    return m.music_drills_ear_role_7();
  },
};

export const semitonesOf = (label: string) =>
  SCALE_DEGREES.find((d) => d.label === label)?.semitones ?? 0;

/** Diatonic degrees are brighter than the chromatic colour tones. */
export function degreeColor(label: string): string {
  const s = semitonesOf(label);
  const chromatic = label.startsWith("b") || label.startsWith("#");
  return `oklch(${chromatic ? 0.74 : 0.83} ${chromatic ? 0.1 : 0.13} ${(80 + s * 30) % 360})`;
}

const LETTERS = "CDEFGAB";
const NATURAL = [0, 2, 4, 5, 7, 9, 11];
/**
 * A note spelled as its degree in the key of `tonic` (named with flats, as the
 * drill names the key): degree 4 of Gb major is Cb4, not B3. Falls back to a
 * flat name when the spelling would need more than a double accidental.
 */
export function spellDegree(midi: number, tonic: number, degree: string): string {
  const step = Number(degree.replace(/[b#]/g, "")) - 1;
  const tonicName = noteName(tonic, "flat", false);
  if (!(step >= 0 && step < 7)) return noteName(midi, "flat");
  const li = (LETTERS.indexOf(tonicName[0]) + step) % 7;
  let diff = (((midi - NATURAL[li]) % 12) + 12) % 12;
  if (diff > 6) diff -= 12;
  if (Math.abs(diff) > 2) return noteName(midi, "flat");
  const octave = Math.floor((midi - diff) / 12) - 1;
  return LETTERS[li] + (diff > 0 ? "#" : "b").repeat(Math.abs(diff)) + octave;
}

/** A played note spelled in the key of `tonic`, by the degree it is there: F#3 in E, not Gb3 (as the answer chips spell it). */
export const spellInKey = (midi: number, tonic: number): string =>
  spellDegree(midi, tonic, SCALE_DEGREES[(((midi - tonic) % 12) + 12) % 12].label);

/** The letter `steps` letters from `root` (signed), with the accidental that makes `midi`; null past a double. */
function letterFor(rootName: string, steps: number, midi: number): string | null {
  const li = (((LETTERS.indexOf(rootName[0]) + steps) % 7) + 7) % 7;
  let diff = (((midi - NATURAL[li]) % 12) + 12) % 12;
  if (diff > 6) diff -= 12;
  return Math.abs(diff) > 2 ? null : LETTERS[li] + (diff > 0 ? "#" : "b").repeat(Math.abs(diff));
}
const accidentals = (names: string[]) => names.join("").replace(/[A-G]/g, "").length;
/** Spell notes letter by letter from a root, trying it as a flat and a sharp name; the one with fewer accidentals wins. */
function spellFrom(root: number, notes: { midi: number; steps: number }[]): string[] {
  const options = [noteName(root, "flat", false), noteName(root, "sharp", false)].map((r) => [
    r,
    ...notes.map((n) => letterFor(r, n.steps, n.midi) ?? noteName(n.midi, "flat", false)),
  ]);
  return options.sort((a, b) => accidentals(a) - accidentals(b))[0];
}

/** Letter steps per half step above the first note (the tritone as an augmented 4th). */
const INTERVAL_STEPS = [0, 1, 1, 2, 2, 3, 3, 4, 5, 5, 6, 6];
/**
 * Both notes of an interval, spelled as the interval: A up a major 3rd is A and C#, not Db.
 * Descending intervals count letters down.
 */
export function spellInterval(from: number, to: number): [string, string] {
  const way = to < from ? -1 : 1;
  const [a, b] = spellFrom(from, [
    { midi: to, steps: way * INTERVAL_STEPS[Math.abs(to - from) % 12] },
  ]);
  return [a, b];
}

/** Letter steps above a chord's root (b5 and #5 stay 5ths, a dim 7th a 7th). */
const CHORD_STEPS: Record<number, number> = {
  0: 0,
  1: 1,
  2: 1,
  3: 2,
  4: 2,
  5: 3,
  6: 4,
  7: 4,
  8: 4,
  9: 6,
  10: 6,
  11: 6,
};
const TRIADS = [
  [4, 7],
  [3, 7],
  [3, 6],
  [4, 8],
];
/** A triad or seventh chord's root: the note every other note stacks on in thirds; the bass when none does. */
export function chordRoot(midis: number[]): number {
  const lo = Math.min(...midis);
  for (const r of [...new Set(midis)].sort((a, b) => a - b)) {
    const above = new Set(midis.map((m) => (((m - r) % 12) + 12) % 12));
    if (TRIADS.some(([t, f]) => above.has(t) && above.has(f))) return r;
  }
  return lo;
}
/** A chord's notes, bass to top, each spelled by its place above the root: E aug is E G# B#, not E Ab C. */
export function spellChord(midis: number[]): string[] {
  const sorted = [...midis].sort((a, b) => a - b);
  const root = chordRoot(sorted);
  return spellFrom(
    root,
    sorted.map((m) => ({ midi: m, steps: CHORD_STEPS[(((m - root) % 12) + 12) % 12] })),
  ).slice(1);
}

/** A label to place: its left edge, its baseline above the note and the one under it, its width. */
export interface TagBox {
  x: number;
  above: number;
  below: number;
  w: number;
}
/**
 * Baselines for note labels: each sits above its note unless that lands within `gap` px of a
 * label already placed (or a fixed one in `taken`), then under it. 13 px text, so a box is 13 tall.
 */
export function placeTags(
  tags: readonly TagBox[],
  taken: readonly { x: number; y: number; w: number }[] = [],
  gap = 8,
): number[] {
  const placed = [...taken];
  const clear = (x: number, y: number, w: number) =>
    placed.every(
      (p) =>
        x + w + gap <= p.x || p.x + p.w + gap <= x || y + gap <= p.y - 13 || p.y + gap <= y - 13,
    );
  return tags.map((t) => {
    const y = clear(t.x, t.above, t.w) ? t.above : t.below;
    placed.push({ x: t.x, y, w: t.w });
    return y;
  });
}
