// Jazz piano voicing types for the Voicings drill, built by rule from a key:
// diatonic sevenths, So What and quartal stacks, sus slash chords, two-handed
// rootless, 4-way close and drop-2, Shearing locked hands, Red Garland block
// chords, Evans spreads, Monk's clusters, upper structures on a tune's
// dominants, and quartal and slash voicings on a tune's changes. Every voicing is standard vocabulary; the blues melodies are
// written for the drill, and tunes give their changes only.

import { pc, pcOf } from "../theory/notes";
import { parseChordSymbol } from "../theory/chords";
import { signatureFor } from "../theory/circle";
import { diatonicNames, spellInKey } from "../theory/spelling";
import { scaleSemitones } from "../theory/scales";
import { TUNES } from "./tunes";

export type JazzVoicingId =
  | "sevenths"
  | "so-what"
  | "quartal"
  | "sus"
  | "two-hand"
  | "close"
  | "drop2"
  | "locked"
  | "garland"
  | "evans"
  | "monk"
  | "upper"
  | "quartal-tune"
  | "slash-tune";

export interface JazzVoicingType {
  id: JazzVoicingId;
  label: string;
  /** What the key picker picks: a major key, a dorian tonic, a blues key, or a tune (no key). */
  key: "major" | "dorian" | "blues" | "tune";
  about: string;
  skillId: string;
}

const QUARTAL = "harmony.voicings.quartal";
const TWO_HANDED = "harmony.voicings.two-handed";
const BLOCK = "harmony.voicings.block-chords";

export const JAZZ_VOICING_TYPES: JazzVoicingType[] = [
  {
    id: "sevenths",
    label: "Diatonic sevenths",
    key: "major",
    about: "The seventh chord on each degree of the key, root position, up the key and back.",
    skillId: "harmony.voicings.diatonic-sevenths",
  },
  {
    id: "so-what",
    label: "So What",
    key: "dorian",
    about:
      "Three 4ths and a major 3rd on top, moved through the dorian mode: two notes in the left hand, three in the right.",
    skillId: QUARTAL,
  },
  {
    id: "quartal",
    label: "Quartal stacks",
    key: "dorian",
    about:
      "Three-note stacks of 4ths in the left hand, moved up the dorian mode for two octaves, as McCoy Tyner comps.",
    skillId: QUARTAL,
  },
  {
    id: "sus",
    label: "Sus and slash",
    key: "dorian",
    about:
      "Each 7sus as a slash chord: the root and 5th in the left hand, the major triad a whole step below the root in the right (C/D for D7sus). The Maiden Voyage set: up a minor 3rd, then down a whole step twice.",
    skillId: QUARTAL,
  },
  {
    id: "two-hand",
    label: "Two-handed rootless",
    key: "major",
    about:
      "ii-V-I with no root: the left hand plays 3-7 (7-3 on the V), the right hand 9, 5 and 13 above it.",
    skillId: TWO_HANDED,
  },
  {
    id: "close",
    label: "4-way close",
    key: "major",
    about:
      "A melody note on top with the next three chord tones close below it, through each chord tone of a ii-V-I. A major chord with the root on top takes the 6th.",
    skillId: BLOCK,
  },
  {
    id: "drop2",
    label: "Drop-2",
    key: "major",
    about: "4-way close with the second voice from the top dropped an octave into the left hand.",
    skillId: BLOCK,
  },
  {
    id: "locked",
    label: "Locked hands",
    key: "major",
    about:
      "George Shearing's block chords up the scale and back: the melody doubled an octave below in the left hand, 4-way close under it in the right, the I6 on chord tones and the diminished seventh on the passing notes.",
    skillId: BLOCK,
  },
  {
    id: "garland",
    label: "Red Garland block chords",
    key: "blues",
    about:
      "A 12-bar blues: the left hand plays 3-7-9, the right hand the melody in octaves with the 5th inside.",
    skillId: BLOCK,
  },
  {
    id: "evans",
    label: "Evans spreads",
    key: "major",
    about:
      "Bill Evans spreads on a ii-V-I: a three-note left hand (3-7-9, then 7-3-13 on the V) and two notes in the right, the melody with one voice under it.",
    skillId: TWO_HANDED,
  },
  {
    id: "monk",
    label: "Monk clusters",
    key: "blues",
    about:
      "Thelonious Monk's shells on a 12-bar blues, the root in the left hand: 3-b7-1 on the I, and on the IV and V the 3rd and 7th with the root and b9 together on top, a half step apart.",
    skillId: TWO_HANDED,
  },
  {
    id: "upper",
    label: "Upper structures on a tune",
    key: "tune",
    about:
      "Every dominant in a tune's changes: a 1-3-7 shell in the left hand and a triad on top. The II triad (9 #11 13) on a dominant going to major, the bVI (#9 b13) on one going to minor or marked altered, the VI (b9 13) on one marked b9.",
    skillId: TWO_HANDED,
  },
  {
    id: "quartal-tune",
    label: "Quartal on a tune",
    key: "tune",
    about:
      "Every chord in a tune's changes as a left-hand stack of two 4ths from the chord's scale, with its 3rd or 7th inside: 7-3-6 on a major 7th, 11-b7-b3 on a minor 7th, 5-1-4 on a 7sus.",
    skillId: QUARTAL,
  },
  {
    id: "slash-tune",
    label: "Slash chords on a tune",
    key: "tune",
    about:
      "Every chord in a tune's changes as a triad over its root, as Herbie Hancock voices them: the major triad a whole step below the root on a minor 7th (m11), a 7sus or a dominant (9sus), the triad on the 5th over a major 7th (maj9), the minor triad on the b3 over a half-diminished.",
    skillId: QUARTAL,
  },
];

export interface JazzVoicingChord {
  id: string;
  symbol: string;
  /** The heading the chart groups by: the key, mode or tune. */
  group: string;
  left: number[];
  right: number[];
  /** How the voicing is built (hidden in Check). */
  name: string;
  /** What Check asks for, with the voicing hidden. */
  ask: string;
  /** Graded on the order of the notes from the bottom, not only on which notes. */
  order: boolean;
  skillIds: string[];
}

const MAJOR = [0, 2, 4, 5, 7, 9, 11];
const DORIAN = [0, 2, 3, 5, 7, 9, 10];
const NUMERALS = ["Imaj7", "ii7", "iii7", "IVmaj7", "V7", "vi7", "viiø7"];
const SEVENTH = ["maj7", "m7", "m7", "maj7", "7", "m7", "m7b5"];

/** The lowest MIDI note at or above `floor` with pitch class `p`. */
export const above = (p: number, floor: number) => floor + pc(p - floor);
/** Each pitch class above the one before, the first at or above `floor`. */
export function stack(pcs: readonly number[], floor: number): number[] {
  const out: number[] = [];
  let at = floor;
  for (const p of pcs) {
    const m = above(p, at);
    out.push(m);
    at = m + 1;
  }
  return out;
}
/** The notes of a scale by step (step 7 is the octave). */
const scaleMidi = (tonic: number, scale: number[], step: number) =>
  tonic + scale[((step % 7) + 7) % 7] + 12 * Math.floor(step / 7);

const speller = (tonicPc: number, kind: "major" | "dorian" | "natural-minor") => {
  const fifths = signatureFor(tonicPc, kind);
  const mode = kind === "natural-minor" ? ("minor" as const) : ("major" as const);
  const base = { name: "", tonic: "C", tonicPc, mode: "major" as const, fifths };
  const tonic = diatonicNames(base).find((n) => pcOf(n) === pc(tonicPc)) ?? "C";
  const k = { ...base, tonic, mode };
  return (p: number) => spellInKey(p, k);
};
const LETTERS = "CDEFGAB";
const NATURAL = [0, 2, 4, 5, 7, 9, 11];
/** The degree (1 to 7) each semitone above the root is spelled as: b9 and #9 as 9ths, #11 as an 11th, b13 as a 13th. */
const DEGREE: Record<"7" | "m7", number[]> = {
  "7": [1, 2, 2, 2, 3, 4, 4, 5, 6, 6, 7, 7],
  m7: [1, 2, 2, 3, 3, 4, 4, 5, 6, 6, 7, 7],
};
/** The note `semis` above a root, spelled as the letter `degree` (1 to 7) steps up from the root's letter (D, 4 semis, degree 3 is F#). */
export function spellAbove(rootName: string, semis: number, degree: number): string {
  const li = (LETTERS.indexOf(rootName[0]) + degree - 1) % 7;
  let diff = pc(pcOf(rootName)! + semis - NATURAL[li]);
  if (diff > 6) diff -= 12;
  return LETTERS[li] + (diff > 0 ? "#".repeat(diff) : "b".repeat(-diff));
}
/** A chord's tones spelled letter by letter from its root's name (Bb7's b9 is Cb, D7's 3rd F#). */
export function chordSpeller(rootName: string, quality: "7" | "m7") {
  const root = pcOf(rootName)!;
  return (p: number) => {
    const semis = pc(p - root);
    return spellAbove(rootName, semis, DEGREE[quality][semis]);
  };
}

/** A triad in whichever inversion sits nearest the last one (the first in root position), from `floor` up. */
function nearestTriad(triad: number[], floor: number, last: number[]): number[] {
  const options = [0, 1, 2].map((inv) =>
    stack([...triad.slice(inv), ...triad.slice(0, inv)], floor),
  );
  if (!last.length) return options[0];
  const centre = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;
  return options.sort(
    (a, b) => Math.abs(centre(a) - centre(last)) - Math.abs(centre(b) - centre(last)),
  )[0];
}

/** Up the scale's degrees and back: 0..top, then top-1..0. */
const upAndBack = (top: number) => [
  ...Array.from({ length: top + 1 }, (_, i) => i),
  ...Array.from({ length: top }, (_, i) => top - 1 - i),
];

function chord(
  type: JazzVoicingType,
  group: string,
  index: number,
  c: Omit<JazzVoicingChord, "id" | "group" | "skillIds" | "order"> & { order?: boolean },
): JazzVoicingChord {
  return {
    id: `${type.id}-${group.replace(/\s+/g, "-")}-${index + 1}`,
    group,
    order: true,
    skillIds: [type.skillId],
    ...c,
  };
}

const typeOf = (id: JazzVoicingId) => JAZZ_VOICING_TYPES.find((t) => t.id === id)!;

/** ii-V-I in a major key: each chord's root and its tones above the root. */
const twoFiveOne = (keyPc: number, name: (p: number) => string) => [
  {
    root: pc(keyPc + 2),
    symbol: `${name(keyPc + 2)}m7`,
    tones: [0, 3, 7, 10],
    quality: "m7" as const,
  },
  {
    root: pc(keyPc + 7),
    symbol: `${name(keyPc + 7)}7`,
    tones: [0, 4, 7, 10],
    quality: "7" as const,
  },
  { root: pc(keyPc), symbol: `${name(keyPc)}maj7`, tones: [0, 4, 7, 11], quality: "maj7" as const },
];

/** A 12-bar blues in a key: each bar's chord as a degree and quality. */
const BLUES: [degree: number, quality: "7" | "m7"][] = [
  [0, "7"],
  [5, "7"],
  [0, "7"],
  [0, "7"],
  [5, "7"],
  [5, "7"],
  [0, "7"],
  [9, "7"],
  [2, "m7"],
  [7, "7"],
  [0, "7"],
  [7, "7"],
];
/** The Red Garland exercise's melody, one note a bar, as semitones above the key's tonic. Written for the drill. */
const GARLAND_MELODY = [7, 0, 9, 3, 7, 2, 0, 4, 5, 2, 0, 9];
/** Blue Monk's form is a plain blues: I IV I I, IV IV I I, V IV I V. */
const MONK_BLUES: number[] = [0, 5, 0, 0, 5, 5, 0, 0, 7, 5, 0, 7];

/** One key's (or one tune's) chords of a voicing type. */
export function jazzVoicingChords(
  id: JazzVoicingId,
  keyPc: number,
  opts: { tune?: string } = {},
): JazzVoicingChord[] {
  const type = typeOf(id);
  const k = pc(keyPc);
  const name = speller(k, type.key === "dorian" ? "dorian" : "major");
  const keyName = name(k);

  if (id === "sevenths") {
    const tonic = above(k, 55);
    const group = `${keyName} major`;
    return upAndBack(7).map((d, i) => {
      const root = scaleMidi(tonic, MAJOR, d);
      const notes = [0, 2, 4, 6].map((s) => scaleMidi(tonic, MAJOR, d + s));
      const symbol = `${name(root)}${SEVENTH[d % 7]}`;
      const numeral = NUMERALS[d % 7];
      return chord(type, group, i, {
        symbol,
        left: [],
        right: notes,
        name: `${symbol}, the ${numeral}: root position, 1 3 5 7 from the bottom.`,
        ask: `Play ${symbol} in root position.`,
      });
    });
  }

  if (id === "so-what" || id === "quartal") {
    const group = `${keyName} dorian`;
    const tonic = above(k, id === "so-what" ? 50 : 48);
    const steps = id === "so-what" ? [0, 3, 6, 9, 11] : [0, 3, 6];
    const bottoms = id === "so-what" ? upAndBack(7) : Array.from({ length: 15 }, (_, i) => i);
    return bottoms.map((d, i) => {
      const notes = steps.map((s) => scaleMidi(tonic, DORIAN, d + s));
      const names = notes.map(name).join(" ");
      const bottom = name(notes[0]);
      return chord(type, group, i, {
        symbol: `on ${bottom}`,
        left: id === "so-what" ? notes.slice(0, 2) : notes,
        right: id === "so-what" ? notes.slice(2) : [],
        name:
          id === "so-what"
            ? `So What chord on ${bottom}: ${names}. 4ths up from ${bottom} in ${group}, a 3rd on top. ${names.split(" ").slice(0, 2).join(" ")} in the left hand.`
            : `Stack of 4ths on ${bottom}: ${names}, all in the left hand, every note in ${group}.`,
        ask:
          id === "so-what"
            ? `${group}: the So What chord with ${bottom} at the bottom.`
            : `${group}: the left-hand stack of 4ths on ${bottom}.`,
      });
    });
  }

  if (id === "sus") {
    // The Maiden Voyage set from its first chord: up a minor 3rd, then down a whole step twice.
    const roots = [0, 3, 1, -1].map((r) => pc(k + r));
    const group = `${keyName}7sus set`;
    let rh: number[] = [];
    return roots.map((r, i) => {
      const nm = speller(r, "major");
      const left = stack([r, r + 7], 43);
      const triad = [r + 10, r + 14, r + 17].map(pc);
      // The triad in whichever inversion sits nearest the last one, from Bb3 up.
      rh = nearestTriad(triad, Math.max(58, left[1] + 1), rh);
      const symbol = `${nm(r)}7sus`;
      const slash = `${nm(r + 10)}/${nm(r)}`;
      return chord(type, group, i, {
        symbol,
        left,
        right: rh,
        name: `${symbol} as ${slash}: ${nm(r)} and ${nm(r + 7)} in the left hand, the ${nm(r + 10)} triad in the right, any inversion.`,
        ask: `Play ${symbol} as a slash chord, the root lowest.`,
        order: false,
      });
    });
  }

  if (id === "two-hand" || id === "evans" || id === "close" || id === "drop2") {
    const group = `${keyName} major`;
    const chords = twoFiveOne(k, name);
    if (id === "two-hand" || id === "evans") {
      // Left- and right-hand tones above each root; the V takes the B form.
      const forms: Record<string, [number[], number[], string]> =
        id === "two-hand"
          ? {
              m7: [[3, 10], [14, 7, 9], "3-7 in the left hand, 9-5-13 in the right"],
              "7": [[10, 4], [14, 7, 9], "7-3 in the left hand, 9-5-13 in the right"],
              maj7: [[4, 11], [14, 7, 9], "3-7 in the left hand, 9-5-13 in the right"],
            }
          : {
              m7: [
                [3, 10, 14],
                [7, 12],
                "3-7-9 in the left hand, the 5th and the root in the right",
              ],
              "7": [
                [10, 4, 9],
                [14, 7],
                "7-3-13 in the left hand, the 9th and the 5th in the right",
              ],
              maj7: [
                [4, 11, 14],
                [9, 4],
                "3-7-9 in the left hand, the 6th and the 3rd in the right",
              ],
            };
      return chords.map((c, i) => {
        const [lh, rh, how] = forms[c.quality];
        const left = stack(
          lh.map((t) => c.root + t),
          48,
        );
        const right = stack(
          rh.map((t) => c.root + t),
          left[left.length - 1] + 1,
        );
        return chord(type, group, i, {
          symbol: c.symbol,
          left,
          right,
          name: `${c.symbol}, no root: ${how}.`,
          ask: `Play ${c.symbol} ${id === "evans" ? "as a spread" : "two-handed"}, no root.`,
        });
      });
    }
    // Close and drop-2: the melody on each chord tone in turn, the next three below.
    return chords.flatMap((c, ci) =>
      [0, 1, 2, 3].map((top, ti) => {
        const tones = c.quality === "maj7" && top === 0 ? [0, 4, 7, 9] : c.tones;
        const symbol = c.quality === "maj7" && top === 0 ? `${name(c.root)}6` : c.symbol;
        const melodyPc = pc(c.root + tones[top]);
        const below = [1, 2, 3].map((d) => pc(c.root + tones[(top + d) % 4]));
        const melody = above(melodyPc, 67);
        const closeV = stack([...below, melodyPc], melody - 11);
        const notes = id === "close" ? closeV : [closeV[2] - 12, closeV[0], closeV[1], closeV[3]];
        const mel = name(melodyPc);
        return chord(type, group, ci * 4 + ti, {
          symbol: `${symbol} (${mel})`,
          left: id === "close" ? [] : [notes[0]],
          right: id === "close" ? notes : notes.slice(1),
          name:
            id === "close"
              ? `${symbol} under a melody ${mel}: ${notes.map(name).join(" ")}, all within an octave.`
              : `${symbol} under a melody ${mel}: drop the second voice from the top an octave, ${notes.map(name).join(" ")}.`,
          ask: `${symbol} with ${mel} on top, ${id === "close" ? "4-way close" : "drop-2"}.`,
        });
      }),
    );
  }

  if (id === "locked") {
    const group = `${keyName} major`;
    const tonic = above(k, 67);
    const six = [0, 4, 7, 9].map((t) => pc(k + t));
    const dim = [11, 2, 5, 8].map((t) => pc(k + t));
    const minorName = speller(k, "natural-minor");
    const dimName = `${name(k + 11)}dim7`;
    const spell = (p: number) => (pc(p) === pc(k + 8) ? minorName(p) : name(p));
    return upAndBack(7).map((d, i) => {
      const melody = scaleMidi(tonic, MAJOR, d);
      const set = six.includes(pc(melody)) ? six : dim;
      const at = set.indexOf(pc(melody));
      const below = [1, 2, 3].map((j) => set[(at + j) % 4]);
      const right = stack([...below, pc(melody)], melody - 11);
      const symbol = set === six ? `${keyName}6` : dimName;
      const mel = name(melody);
      return chord(type, group, i, {
        symbol: `${symbol} (${mel})`,
        left: [melody - 12],
        right,
        name: `Melody ${mel}: ${set === six ? `a chord tone, so ${keyName}6` : `a passing note, so ${dimName}`} close under it (${right.map(spell).join(" ")}), and ${mel} an octave down in the left hand.`,
        ask: `Locked hands on the melody ${mel}.`,
      });
    });
  }

  if (id === "garland" || id === "monk") {
    const group = `${keyName} blues`;
    const bars: [number, "7" | "m7"][] = id === "garland" ? BLUES : MONK_BLUES.map((d) => [d, "7"]);
    return bars.map(([deg, quality], i) => {
      const root = pc(k + deg);
      const symbol = `${name(root)}${quality}`;
      const tone = chordSpeller(name(root), quality);
      if (id === "monk") {
        const onI = deg === 0;
        const left = [above(root, 36)];
        const right = stack(
          (onI ? [4, 10, 12] : [4, 10, 12, 13]).map((t) => root + t),
          52,
        );
        return chord(type, group, i, {
          symbol,
          left,
          right,
          name: `${symbol}, bar ${i + 1}: ${onI ? "3-b7-1, the root on top a whole step above the 7th" : "3-b7, then the root and b9 a half step apart on top"} (${right.map(tone).join(" ")}), the root in the left hand.`,
          ask: `Bar ${i + 1}, ${symbol}: Monk's ${onI ? "3-b7-1" : "3-b7-1-b9 cluster"}.`,
        });
      }
      const third = quality === "m7" ? 3 : 4;
      const melody = above(pc(k + GARLAND_MELODY[i]), 76);
      const right = [melody - 12, melody - 5, melody];
      let left = stack([root + third, root + 10, root + 14], 45);
      while (left[left.length - 1] >= right[0]) left = left.map((m) => m - 12);
      const mel = tone(melody);
      return chord(type, group, i, {
        symbol: `${symbol} (${mel})`,
        left,
        right,
        name: `Bar ${i + 1}: ${left.map(tone).join(" ")} (3-7-9) in the left hand. ${mel} in octaves with ${tone(melody - 5)} inside in the right.`,
        ask: `Bar ${i + 1}, ${symbol} with ${mel} on top: Garland block chord.`,
      });
    });
  }

  const tune = TUNES.find((t) => t.id === opts.tune) ?? TUNES[0];
  if (id === "quartal-tune" || id === "slash-tune") return tuneVoicings(type, tune);

  // Upper structures: every dominant in a tune's changes, once each.
  const seen = new Set<string>();
  const out: JazzVoicingChord[] = [];
  tune.chords.forEach((c, i) => {
    const parsed = parseChordSymbol(c.symbol);
    if (
      !parsed ||
      !parsed.intervals.includes(4) ||
      !parsed.intervals.includes(10) ||
      seen.has(c.symbol)
    )
      return;
    seen.add(c.symbol);
    const next = parseChordSymbol(tune.chords[(i + 1) % tune.chords.length].symbol);
    const toMinor = !!next && next.intervals.includes(3) && pc(next.rootPc - parsed.rootPc) === 5;
    const us =
      /b9/.test(c.symbol) && !/#9|alt|b13/.test(c.symbol)
        ? { triad: 9, adds: "b9 13", label: "VI" }
        : toMinor || /alt|b13|#9/.test(c.symbol)
          ? { triad: 8, adds: "#9 b13", label: "bVI" }
          : { triad: 2, adds: "9 #11 13", label: "II" };
    const r = parsed.rootPc;
    const nm = chordSpeller(parsed.rootName, "7");
    const left = stack([r, r + 4, r + 10], 40);
    const triad = [0, 4, 7].map((t) => r + us.triad + t);
    const right = stack(triad, Math.max(left[2] + 1, 60));
    out.push(
      chord(type, tune.name, out.length, {
        symbol: c.symbol,
        left,
        right,
        name: `${c.symbol}: the ${us.label} triad, ${nm(r + us.triad)} major, over a 1-3-7 shell. It adds ${us.adds}. Any inversion on top.`,
        ask: `${c.symbol}: an upper-structure triad over a 1-3-7 shell.`,
        order: false,
      }),
    );
  });
  return out;
}

/** A chord's 3rd (the 4th of a sus chord) and 7th (the 6th of a sixth or diminished chord), above the root. */
function guideOf(intervals: readonly number[]) {
  const iv = intervals.map((i) => i % 12);
  return {
    // A #9 chord also holds the minor 3rd: the major 3rd wins.
    third: [4, 3, 5].find((i) => iv.includes(i)),
    seventh: [10, 11, 9].find((i) => iv.includes(i)),
  };
}

/**
 * A stack of two perfect 4ths inside the chord's scale with a guide tone in it, as semitones above
 * the root: the lowest note tried on the 7th, the 3rd, the 4th, the 5th, the 9th, the 6th, then the
 * root. A scale with no such stack (diminished, altered) takes the 7th, the 3rd above it and a 4th on top.
 */
export function quartalStack(intervals: readonly number[], scale: readonly number[]): number[] {
  const { third, seventh } = guideOf(intervals);
  const guides = [third, seventh].filter((g): g is number => g !== undefined);
  const inScale = (i: number) => scale.includes(pc(i));
  for (const b of [seventh, third, 5, 7, 2, 9, 0]) {
    if (b === undefined) continue;
    const st = [b, b + 5, b + 10];
    if (st.every(inScale) && st.some((i) => guides.includes(pc(i)))) return st;
  }
  const low = seventh ?? third ?? 0;
  const mid = low + pc((third ?? 7) - low);
  return [low, mid, mid + 5];
}

/** The triad a slash voicing puts over the root: its root above the chord's, and major, minor or diminished. */
function slashTriad(intervals: readonly number[]): {
  at: number;
  kind: "" | "m" | "dim";
  adds: string;
} {
  const iv = intervals.map((i) => i % 12);
  const has = (i: number) => iv.includes(i);
  if (has(3) && has(6) && !has(4))
    return has(9)
      ? { at: 3, kind: "dim", adds: "b3 b5 6" }
      : { at: 3, kind: "m", adds: "b3 b5 b7" };
  if (has(10)) return { at: 10, kind: "", adds: has(3) ? "b7 9 11" : "b7 9 11, a 9sus sound" };
  if (has(3)) return { at: 5, kind: "", adds: "11 13 1" };
  return { at: 7, kind: "", adds: "5 7 9" };
}

/** Quartal or slash voicings on each chord of a tune's changes, once per chord symbol, in order. */
function tuneVoicings(type: JazzVoicingType, tune: (typeof TUNES)[number]): JazzVoicingChord[] {
  const seen = new Set<string>();
  const out: JazzVoicingChord[] = [];
  let rh: number[] = [];
  for (const c of tune.chords) {
    const parsed = parseChordSymbol(c.symbol);
    if (!parsed || parsed.bassPc !== undefined || seen.has(c.symbol)) continue;
    seen.add(c.symbol);
    const r = parsed.rootPc;
    const minor = parsed.intervals.includes(3);
    const nm = chordSpeller(parsed.rootName, minor ? "m7" : "7");
    if (type.id === "quartal-tune") {
      const scale = (scaleSemitones(c.scale.name) ?? []).map((s) => pc(c.scale.rootPc + s - r));
      const st = quartalStack(parsed.intervals, scale.length ? scale : parsed.intervals);
      const left = stack(
        st.map((i) => r + i),
        48,
      );
      out.push(
        chord(type, tune.name, out.length, {
          symbol: c.symbol,
          left,
          right: [],
          name: `${c.symbol}: 4ths from ${nm(r + st[0])}, ${left.map((m) => nm(m)).join(" ")}, in the left hand.`,
          ask: `${c.symbol}: a left-hand stack of 4ths with its 3rd or 7th inside.`,
        }),
      );
      continue;
    }
    const t = slashTriad(parsed.intervals);
    const third = t.kind === "" ? 4 : 3;
    const triad = [0, third, t.kind === "dim" ? 6 : 7].map((i) => pc(r + t.at + i));
    const left = parsed.intervals.includes(7) ? stack([r, r + 7], 43) : [above(r, 43)];
    rh = nearestTriad(triad, Math.max(58, left[left.length - 1] + 1), rh);
    const slash = `${nm(r + t.at)}${t.kind}/${parsed.rootName}`;
    out.push(
      chord(type, tune.name, out.length, {
        symbol: c.symbol,
        left,
        right: rh,
        name: `${c.symbol} as ${slash}: ${left.map((m) => nm(m)).join(" and ")} in the left hand, the ${nm(r + t.at)}${t.kind === "" ? " major" : t.kind === "m" ? " minor" : " diminished"} triad in the right (${t.adds}). Any inversion.`,
        ask: `${c.symbol} as a slash chord, the root lowest.`,
        order: false,
      }),
    );
  }
  return out;
}

/** Tunes the upper-structure type can run on: those with at least one dominant. */
export const UPPER_TUNES = TUNES.filter(
  (t) => jazzVoicingChords("upper", 0, { tune: t.id }).length,
);
