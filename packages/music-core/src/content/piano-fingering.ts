// Standard piano scale fingerings, both hands, for the scales drill: keys and staff
// carry the finger for each note. Research and sources below.
import { SCALE_DATA } from "../data";

/**
 * Standard one-octave piano scale fingerings, both hands.
 *
 * Sources checked (each kind against at least two):
 * - pianoscales.org major, natural minor and harmonic minor tables, including two-octave major fingerings:
 *   https://www.pianoscales.org/major.html
 *   https://www.pianoscales.org/minor.html
 *   https://www.pianoscales.org/minor-harmonic.html
 * - University of Miami chart (Prof. Escadon), fourth finger placement per key for
 *   major, natural, harmonic and melodic minor: https://www.cs.miami.edu/~burt/music/finger-charts.html
 * - Beatrice Wilder, Melodic Minor Scale Fingering Charts (Music Fun, 2002), all 12 keys both hands:
 *   https://www.musicfun.net.au/pdf_files/scale_fingering_mm.pdf
 * - ABRSM start finger alternatives (Eb may start on 2) and the 123 1234 grouping:
 *   https://forum.modartt.com/viewtopic.php?id=10790
 * - Chromatic: https://stratos.hoffmanacademy.com/blog/the-chromatic-scale-piano-playing-tips-solfege-fingering
 *   and https://www.instructables.com/How-to-Play-Chromatic-Scales-on-the-Piano
 *
 * These match the fingerings printed in the ABRSM, Trinity and RCM scale books as far as the sources above show.
 * The exam books themselves were not read directly.
 *
 * Arrays store the repeating pattern. Where a source starts the first note on a different finger
 * (for example Bb major RH 2 1 2 3 1 2 3 4), that is a start-only convenience given in `note`; the
 * octave join still uses the pattern finger, which is what pianoscales.org"s two-octave Bb shows
 * (2 1 2 3 1 2 3 4 1 2 3 1 2 3 4, the middle Bb on 4).
 */

/** Fingers 1 thumb to 5 little finger, for one octave ascending from the tonic to the tonic an octave up (8 notes); descending reverses. */
export interface ScaleFingering {
  rh: number[];
  lh: number[];
  note?: string;
}

const C_TYPE: ScaleFingering = { rh: [1, 2, 3, 1, 2, 3, 4, 5], lh: [5, 4, 3, 2, 1, 3, 2, 1] };
const F_TYPE: ScaleFingering = { rh: [1, 2, 3, 4, 1, 2, 3, 4], lh: [5, 4, 3, 2, 1, 3, 2, 1] };
const B_TYPE: ScaleFingering = { rh: [1, 2, 3, 1, 2, 3, 4, 5], lh: [4, 3, 2, 1, 4, 3, 2, 1] };

const HARMONIC_MINOR: Record<number, ScaleFingering> = {
  0: C_TYPE,
  1: {
    rh: [3, 4, 1, 2, 3, 1, 2, 3],
    lh: [3, 2, 1, 4, 3, 2, 1, 3],
  },
  2: C_TYPE,
  3: {
    rh: [3, 1, 2, 3, 4, 1, 2, 3],
    lh: [2, 1, 4, 3, 2, 1, 3, 2],
    note: "Eb or D# minor. The RH first note may be played with 2 instead of 3.",
  },
  4: C_TYPE,
  5: F_TYPE,
  6: {
    rh: [3, 4, 1, 2, 3, 1, 2, 3],
    lh: [4, 3, 2, 1, 3, 2, 1, 4],
    note: "pianoscales.org starts the RH on 2 (2 3 1 2 3 1 2 3); the Miami chart puts RH 4 on G#. Both share the pattern from the second note on.",
  },
  7: C_TYPE,
  8: {
    rh: [3, 4, 1, 2, 3, 1, 2, 3],
    lh: [3, 2, 1, 4, 3, 2, 1, 3],
    note: "G# minor. pianoscales.org starts the RH on 2. LH puts 4 on C# and the thumb on F double sharp (pianoscales.org and the Miami chart agree); natural minor differs here.",
  },
  9: C_TYPE,
  10: {
    rh: [4, 1, 2, 3, 1, 2, 3, 4],
    lh: [2, 1, 3, 2, 1, 4, 3, 2],
    note: "Bb minor. The RH first note is often played with 2 (pianoscales.org gives 2 1 2 3 1 2 3 4).",
  },
  11: B_TYPE,
};

/** Keyed by kind then tonic pitch class 0..11 (0 = C). kind: "major" | "harmonic-minor" | "melodic-minor" | "natural-minor". */
export const SCALE_FINGERINGS: Record<string, Record<number, ScaleFingering>> = {
  major: {
    0: C_TYPE,
    1: {
      rh: [2, 3, 1, 2, 3, 4, 1, 2],
      lh: [3, 2, 1, 4, 3, 2, 1, 3],
      note: "Db or C# major.",
    },
    2: C_TYPE,
    3: {
      rh: [3, 1, 2, 3, 4, 1, 2, 3],
      lh: [3, 2, 1, 4, 3, 2, 1, 3],
      note: "The RH first note may be played with 2 (ABRSM shows this alternative per the modartt thread); the octave join stays 3.",
    },
    4: C_TYPE,
    5: {
      ...F_TYPE,
      note: "RH 4 on Bb, never 5 at the top, so the pattern runs 1234 1234.",
    },
    6: {
      rh: [2, 3, 4, 1, 2, 3, 1, 2],
      lh: [4, 3, 2, 1, 3, 2, 1, 4],
      note: "F# or Gb major. pianoscales.org prints the two-octave LH ending on 3; the one-octave tables and the join rule give 4, which is used here.",
    },
    7: C_TYPE,
    8: {
      rh: [3, 4, 1, 2, 3, 1, 2, 3],
      lh: [3, 2, 1, 4, 3, 2, 1, 3],
    },
    9: C_TYPE,
    10: {
      rh: [4, 1, 2, 3, 1, 2, 3, 4],
      lh: [3, 2, 1, 4, 3, 2, 1, 3],
      note: "The RH first note is commonly played with 2 (pianoscales.org: 2 1 2 3 1 2 3 4); the middle Bb of two octaves is still 4.",
    },
    11: B_TYPE,
  },
  "harmonic-minor": HARMONIC_MINOR,
  /** Ascending form only. Descending uses the natural minor notes and fingering. */
  "melodic-minor": {
    0: C_TYPE,
    1: {
      rh: [2, 3, 1, 2, 3, 4, 1, 2],
      lh: [3, 2, 1, 4, 3, 2, 1, 3],
      note: "RH differs from harmonic because A# would land under the thumb. Wilder and the Miami chart (RH 4 on A#) agree. Wilder ends the one-octave RH on 3 to turn into the natural minor descent.",
    },
    2: C_TYPE,
    3: {
      rh: [3, 1, 2, 3, 4, 1, 2, 3],
      lh: [2, 1, 4, 3, 2, 1, 3, 2],
      note: "Wilder starts the RH on 2 (2 1 2 3 4 1 2 3).",
    },
    4: C_TYPE,
    5: F_TYPE,
    6: {
      rh: [2, 3, 1, 2, 3, 4, 1, 2],
      lh: [4, 3, 2, 1, 3, 2, 1, 4],
      note: "RH differs from harmonic because D# would land under the thumb. Wilder and the Miami chart (RH 4 on D#) agree. Wilder ends the one-octave RH on 3 and LH on 2 to turn into the natural minor descent.",
    },
    7: C_TYPE,
    8: {
      rh: [3, 4, 1, 2, 3, 1, 2, 3],
      lh: [3, 2, 1, 4, 3, 2, 1, 3],
      note: "Wilder (as Ab minor) starts the RH on 2. LH 4 on C# per Wilder and the Miami chart.",
    },
    9: C_TYPE,
    10: {
      rh: [4, 1, 2, 3, 1, 2, 3, 4],
      lh: [2, 1, 3, 2, 1, 4, 3, 2],
      note: "Wilder starts the RH on 2 (2 1 2 3 1 2 3 4). LH 4 on G natural.",
    },
    11: B_TYPE,
  },
  /** Same as harmonic minor in every key except G#, where the LH 4 moves to F#. */
  "natural-minor": {
    ...HARMONIC_MINOR,
    8: {
      rh: [3, 4, 1, 2, 3, 1, 2, 3],
      lh: [3, 2, 1, 3, 2, 1, 4, 3],
      note: "G# natural minor LH puts 4 on F# (pianoscales.org and the Miami chart agree). RH may start on 2.",
    },
  },
};

/**
 * Two or more octaves. Both hands repeat the 7-note pattern; only the outer notes change.
 * RH: the tonic inside the run takes the octave"s first finger, the top note takes rh[7]
 *     (C major: 1 2 3 1 2 3 4 1 2 3 1 2 3 4 5).
 * LH: the bottom note takes lh[0] and each tonic above it the octave"s last finger, lh[7]
 *     (C major: 5 4 3 2 1 3 2 1 4 3 2 1 3 2 1; B major: 4 3 2 1 4 3 2 1 3 2 1 4 3 2 1).
 * Checked against every two-octave major on pianoscales.org (F# LH aside, see its note).
 * A start-only alternative finger from `note` applies to the very first note only.
 */
export function fingeringForOctaves(
  f: ScaleFingering,
  hand: "rh" | "lh",
  octaves: number,
): number[] {
  const out: number[] = [];
  if (hand === "rh") {
    for (let i = 0; i < octaves; i++) out.push(...f.rh.slice(0, 7));
    out.push(f.rh[7]);
  } else {
    out.push(f.lh[0]);
    for (let i = 0; i < octaves; i++) out.push(...f.lh.slice(1));
  }
  return out;
}

/**
 * Chromatic scale finger per pitch class 0..11, same fingers up and down.
 * Black keys 3, white keys 1, and 2 on the second of each white pair:
 * RH 2 on F and C (after E and B), LH 2 on E and B (ascending, before F and C).
 * A RH run that starts on C or F may begin with 1.
 */
export const CHROMATIC_FINGERING: { rh: number[]; lh: number[] } = {
  rh: [2, 3, 1, 3, 1, 2, 3, 1, 3, 1, 3, 1],
  lh: [1, 3, 1, 3, 2, 1, 3, 1, 3, 1, 3, 2],
};

/**
 * A finger for each pitch of a scale line in one hand, from its lowest note: the
 * standard fingering over the octaves the line covers (a five-note pentascale is
 * simply 1 to 5, or 5 to 1 in the left hand). Melodic minor descends on the natural
 * minor's notes, so those fill in. Null for a kind with no standard fingering here.
 */
export function scaleFingerMap(
  kind: string,
  low: number,
  hand: "rh" | "lh",
  octaves: number | "pentascale",
): Map<number, number> | null {
  const out = new Map<number, number>();
  // Chromatic: the same finger on each pitch class, up and down.
  if (kind === "chromatic") {
    const top = octaves === "pentascale" ? low + 4 : low + 12 * octaves;
    for (let m = low; m <= top; m++) out.set(m, CHROMATIC_FINGERING[hand][((m % 12) + 12) % 12]);
    return out;
  }
  const steps = (SCALE_DATA.semitonesByKind as Record<string, number[]>)[kind];
  const f = SCALE_FINGERINGS[kind]?.[((low % 12) + 12) % 12];
  if (!steps) return null;
  if (octaves === "pentascale") {
    steps.slice(0, 5).forEach((st, i) => out.set(low + st, hand === "rh" ? i + 1 : 5 - i));
    return out;
  }
  if (!f) return null;
  const add = (k: string, fing: ScaleFingering) => {
    const semis = (SCALE_DATA.semitonesByKind as Record<string, number[]>)[k];
    const pitches = Array.from({ length: octaves }, (_, o) =>
      semis.slice(0, 7).map((st) => low + o * 12 + st),
    )
      .flat()
      .concat(low + octaves * 12);
    const fingers = fingeringForOctaves(fing, hand, octaves);
    pitches.forEach((m, i) => out.has(m) || out.set(m, fingers[i]));
  };
  add(kind, f);
  if (kind === "melodic-minor")
    add("natural-minor", SCALE_FINGERINGS["natural-minor"][((low % 12) + 12) % 12]);
  return out;
}
