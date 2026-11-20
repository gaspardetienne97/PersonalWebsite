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
import { englishTuneName, TUNES } from "./tunes";
import { formatList } from "@repo/i18n/format";
import { m } from "@repo/i18n/messages.js";

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
    label: m.music_content_jv_sevenths_label(),
    key: "major",
    about: m.music_content_jv_sevenths_about(),
    skillId: "harmony.voicings.diatonic-sevenths",
  },
  {
    id: "so-what",
    label: m.music_content_jv_so_what_label(),
    key: "dorian",
    about:
      m.music_content_jv_so_what_about(),
    skillId: QUARTAL,
  },
  {
    id: "quartal",
    label: m.music_content_jv_quartal_label(),
    key: "dorian",
    about:
      m.music_content_jv_quartal_about(),
    skillId: QUARTAL,
  },
  {
    id: "sus",
    label: m.music_content_jv_sus_label(),
    key: "dorian",
    about:
      m.music_content_jv_sus_about(),
    skillId: QUARTAL,
  },
  {
    id: "two-hand",
    label: m.music_content_jv_two_hand_label(),
    key: "major",
    about:
      m.music_content_jv_two_hand_about(),
    skillId: TWO_HANDED,
  },
  {
    id: "close",
    label: m.music_content_jv_close_label(),
    key: "major",
    about:
      m.music_content_jv_close_about(),
    skillId: BLOCK,
  },
  {
    id: "drop2",
    label: m.music_content_jv_drop2_label(),
    key: "major",
    about: m.music_content_jv_drop2_about(),
    skillId: BLOCK,
  },
  {
    id: "locked",
    label: m.music_content_jv_locked_label(),
    key: "major",
    about:
      m.music_content_jv_locked_about(),
    skillId: BLOCK,
  },
  {
    id: "garland",
    label: m.music_content_jv_garland_label(),
    key: "blues",
    about:
      m.music_content_jv_garland_about(),
    skillId: BLOCK,
  },
  {
    id: "evans",
    label: m.music_content_jv_evans_label(),
    key: "major",
    about:
      m.music_content_jv_evans_about(),
    skillId: TWO_HANDED,
  },
  {
    id: "monk",
    label: m.music_content_jv_monk_label(),
    key: "blues",
    about:
      m.music_content_jv_monk_about(),
    skillId: TWO_HANDED,
  },
  {
    id: "upper",
    label: m.music_content_jv_upper_label(),
    key: "tune",
    about:
      m.music_content_jv_upper_about(),
    skillId: TWO_HANDED,
  },
  {
    id: "quartal-tune",
    label: m.music_content_jv_quartal_tune_label(),
    key: "tune",
    about:
      m.music_content_jv_quartal_tune_about(),
    skillId: QUARTAL,
  },
  {
    id: "slash-tune",
    label: m.music_content_jv_slash_tune_label(),
    key: "tune",
    about:
      m.music_content_jv_slash_tune_about(),
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

/** `groupId` is the group's English name, which the id is built from; `group` is what is shown. */
function chord(
  type: JazzVoicingType,
  groupId: string,
  index: number,
  c: Omit<JazzVoicingChord, "id" | "group" | "skillIds" | "order"> & { order?: boolean },
  group = groupId,
): JazzVoicingChord {
  return {
    id: `${type.id}-${groupId.replace(/\s+/g, "-")}-${index + 1}`,
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
    const label = m.music_content_jv_group_major({ key: keyName });
    return upAndBack(7).map((d, i) => {
      const root = scaleMidi(tonic, MAJOR, d);
      const notes = [0, 2, 4, 6].map((s) => scaleMidi(tonic, MAJOR, d + s));
      const symbol = `${name(root)}${SEVENTH[d % 7]}`;
      const numeral = NUMERALS[d % 7];
      return chord(
        type,
        group,
        i,
        {
          symbol,
          left: [],
          right: notes,
          name: m.music_content_jv_sevenths_name({ symbol, numeral }),
          ask: m.music_content_jv_sevenths_ask({ symbol }),
        },
        label,
      );
    });
  }

  if (id === "so-what" || id === "quartal") {
    const group = `${keyName} dorian`;
    const label = m.music_content_jv_group_dorian({ key: keyName });
    const tonic = above(k, id === "so-what" ? 50 : 48);
    const steps = id === "so-what" ? [0, 3, 6, 9, 11] : [0, 3, 6];
    const bottoms = id === "so-what" ? upAndBack(7) : Array.from({ length: 15 }, (_, i) => i);
    return bottoms.map((d, i) => {
      const notes = steps.map((s) => scaleMidi(tonic, DORIAN, d + s));
      const names = notes.map(name).join(" ");
      const bottom = name(notes[0]);
      return chord(
        type,
        group,
        i,
        {
          symbol: m.music_content_jv_on({ note: bottom }),
          left: id === "so-what" ? notes.slice(0, 2) : notes,
          right: id === "so-what" ? notes.slice(2) : [],
          name:
            id === "so-what"
              ? m.music_content_jv_so_what_name({
                  bottom,
                  notes: names,
                  group: label,
                  left: names.split(" ").slice(0, 2).join(" "),
                })
              : m.music_content_jv_quartal_name({ bottom, notes: names, group: label }),
          ask:
            id === "so-what"
              ? m.music_content_jv_so_what_ask({ group: label, bottom })
              : m.music_content_jv_quartal_ask({ group: label, bottom }),
        },
        label,
      );
    });
  }

  if (id === "sus") {
    // The Maiden Voyage set from its first chord: up a minor 3rd, then down a whole step twice.
    const roots = [0, 3, 1, -1].map((r) => pc(k + r));
    const group = `${keyName}7sus set`;
    const label = m.music_content_jv_group_sus({ key: keyName });
    let rh: number[] = [];
    return roots.map((r, i) => {
      const nm = speller(r, "major");
      const left = stack([r, r + 7], 43);
      const triad = [r + 10, r + 14, r + 17].map(pc);
      // The triad in whichever inversion sits nearest the last one, from Bb3 up.
      rh = nearestTriad(triad, Math.max(58, left[1] + 1), rh);
      const symbol = `${nm(r)}7sus`;
      const slash = `${nm(r + 10)}/${nm(r)}`;
      return chord(
        type,
        group,
        i,
        {
          symbol,
          left,
          right: rh,
          name: m.music_content_jv_sus_name({
            symbol,
            slash,
            root: nm(r),
            fifth: nm(r + 7),
            triad: nm(r + 10),
          }),
          ask: m.music_content_jv_sus_ask({ symbol }),
          order: false,
        },
        label,
      );
    });
  }

  if (id === "two-hand" || id === "evans" || id === "close" || id === "drop2") {
    const group = `${keyName} major`;
    const label = m.music_content_jv_group_major({ key: keyName });
    const chords = twoFiveOne(k, name);
    if (id === "two-hand" || id === "evans") {
      // Left- and right-hand tones above each root; the V takes the B form.
      const forms: Record<string, [number[], number[], string]> =
        id === "two-hand"
          ? {
              m7: [[3, 10], [14, 7, 9], m.music_content_jv_how_37_9513()],
              "7": [[10, 4], [14, 7, 9], m.music_content_jv_how_73_9513()],
              maj7: [[4, 11], [14, 7, 9], m.music_content_jv_how_37_9513()],
            }
          : {
              m7: [
                [3, 10, 14],
                [7, 12],
                m.music_content_jv_how_379_51(),
              ],
              "7": [
                [10, 4, 9],
                [14, 7],
                m.music_content_jv_how_7313_95(),
              ],
              maj7: [
                [4, 11, 14],
                [9, 4],
                m.music_content_jv_how_379_63(),
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
        return chord(
          type,
          group,
          i,
          {
            symbol: c.symbol,
            left,
            right,
            name: m.music_content_jv_no_root_name({ symbol: c.symbol, how }),
            ask: (id === "evans"
              ? m.music_content_jv_ask_spread
              : m.music_content_jv_ask_two_handed)({ symbol: c.symbol }),
          },
          label,
        );
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
        const spelled = notes.map(name).join(" ");
        return chord(
          type,
          group,
          ci * 4 + ti,
          {
            symbol: `${symbol} (${mel})`,
            left: id === "close" ? [] : [notes[0]],
            right: id === "close" ? notes : notes.slice(1),
            name: (id === "close" ? m.music_content_jv_close_name : m.music_content_jv_drop2_name)(
              { symbol, mel, notes: spelled },
            ),
            ask: (id === "close" ? m.music_content_jv_close_ask : m.music_content_jv_drop2_ask)({
              symbol,
              mel,
            }),
          },
          label,
        );
      }),
    );
  }

  if (id === "locked") {
    const group = `${keyName} major`;
    const label = m.music_content_jv_group_major({ key: keyName });
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
      const spelled = right.map(spell).join(" ");
      return chord(
        type,
        group,
        i,
        {
          symbol: `${symbol} (${mel})`,
          left: [melody - 12],
          right,
          name:
            set === six
              ? m.music_content_jv_locked_name_tone({ mel, chord: `${keyName}6`, notes: spelled })
              : m.music_content_jv_locked_name_passing({ mel, chord: dimName, notes: spelled }),
          ask: m.music_content_jv_locked_ask({ mel }),
        },
        label,
      );
    });
  }

  if (id === "garland" || id === "monk") {
    const group = `${keyName} blues`;
    const label = m.music_content_jv_group_blues({ key: keyName });
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
        const inputs = { symbol, bar: i + 1, notes: right.map(tone).join(" ") };
        return chord(
          type,
          group,
          i,
          {
            symbol,
            left,
            right,
            name: onI
              ? m.music_content_jv_monk_name_i(inputs)
              : m.music_content_jv_monk_name_other(inputs),
            ask: (onI ? m.music_content_jv_monk_ask_i : m.music_content_jv_monk_ask_other)({
              bar: i + 1,
              symbol,
            }),
          },
          label,
        );
      }
      const third = quality === "m7" ? 3 : 4;
      const melody = above(pc(k + GARLAND_MELODY[i]), 76);
      const right = [melody - 12, melody - 5, melody];
      let left = stack([root + third, root + 10, root + 14], 45);
      while (left[left.length - 1] >= right[0]) left = left.map((m) => m - 12);
      const mel = tone(melody);
      return chord(
        type,
        group,
        i,
        {
          symbol: `${symbol} (${mel})`,
          left,
          right,
          name: m.music_content_jv_garland_name({
            bar: i + 1,
            left: left.map(tone).join(" "),
            mel,
            inner: tone(melody - 5),
          }),
          ask: m.music_content_jv_garland_ask({ bar: i + 1, symbol, mel }),
        },
        label,
      );
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
      chord(
        type,
        englishTuneName(tune.id) ?? tune.name,
        out.length,
        {
          symbol: c.symbol,
          left,
          right,
          name: m.music_content_jv_upper_name({
            symbol: c.symbol,
            numeral: us.label,
            triad: nm(r + us.triad),
            adds: us.adds,
          }),
          ask: m.music_content_jv_upper_ask({ symbol: c.symbol }),
          order: false,
        },
        tune.name,
      ),
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
  if (has(10)) return { at: 10, kind: "", adds: has(3) ? "b7 9 11" : m.music_content_jv_adds_9sus() };
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
        chord(
          type,
          englishTuneName(tune.id) ?? tune.name,
          out.length,
          {
            symbol: c.symbol,
            left,
            right: [],
            name: m.music_content_jv_quartal_tune_name({
              symbol: c.symbol,
              from: nm(r + st[0]),
              notes: left.map((n) => nm(n)).join(" "),
            }),
            ask: m.music_content_jv_quartal_tune_ask({ symbol: c.symbol }),
          },
          tune.name,
        ),
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
      chord(
        type,
        englishTuneName(tune.id) ?? tune.name,
        out.length,
        {
          symbol: c.symbol,
          left,
          right: rh,
          name: (t.kind === ""
            ? m.music_content_jv_slash_name_major
            : t.kind === "m"
              ? m.music_content_jv_slash_name_minor
              : m.music_content_jv_slash_name_diminished)({
            symbol: c.symbol,
            slash,
            left: formatList(left.map((n) => nm(n))),
            triad: nm(r + t.at),
            adds: t.adds,
          }),
          ask: m.music_content_jv_slash_ask({ symbol: c.symbol }),
          order: false,
        },
        tune.name,
      ),
    );
  }
  return out;
}

/** Tunes the upper-structure type can run on: those with at least one dominant. */
export const UPPER_TUNES = TUNES.filter(
  (t) => jazzVoicingChords("upper", 0, { tune: t.id }).length,
);
