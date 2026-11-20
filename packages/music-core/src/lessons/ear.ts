import { CADENCES_AND_QUALITIES, SCALE_DATA } from "../data";
import {
  BASS_LEVELS,
  CENT_STEPS,
  CHORD_FUNCTIONS,
  EAR_INTERVALS,
  EAR_INVERSIONS,
  EAR_SCALES,
  KEY_CHANGE_PATHS,
  SCALE_DEGREES,
  errorDetectPrompt,
  functionChord,
  functionLabel,
  functionSymbol,
  intervalPrompt,
  inversionVoicing,
  keyCadence,
  keyChangePlayback,
  melodyDictationPrompt,
  parseFunction,
  scaleDegreePrompt,
  scalePlayback,
  type PlaybackEvent,
} from "../content/ear";
import {
  loopPalette,
  loopsIn,
  numeralChord,
  numeralLabel,
  numeralSymbol,
  parseNumeral,
} from "../content/loops";
import { FEELS } from "../content/pads-studio";
import { repertoireFor } from "../content/pads-repertoire";
import { grooveTargetsFor } from "../content/winds-pads";
import { rng } from "../content/random";
import { noteName, pc } from "../theory/notes";
import { keys } from "./tier1";
import type { Lesson, LessonScreen, LessonSound } from "./types";
import { m } from "@repo/i18n/messages.js";
import { formatList } from "@repo/i18n/format";

const QUALITIES = CADENCES_AND_QUALITIES.chordQualities;
const CADENCES = CADENCES_AND_QUALITIES.cadences;
const MAJOR = SCALE_DATA.semitonesByKind.major;

const ORDINAL = [
  m.music_cards_ear_ordinal_1,
  m.music_cards_ear_ordinal_2,
  m.music_cards_ear_ordinal_3,
  m.music_cards_ear_ordinal_4,
  m.music_cards_ear_ordinal_5,
  m.music_cards_ear_ordinal_6,
  m.music_cards_ear_ordinal_7,
  m.music_cards_ear_ordinal_8,
];
const hs = (n: number) => m.music_cards_half_steps({ count: n });
/** A data token as a message key part: "half-diminished-7" is "half_diminished_7". */
const keyPart = (token: string) => token.replaceAll("-", "_");
/** A message by name, for a token that names it; undefined when there is none. */
const byKey = (key: string) =>
  (m as unknown as Record<string, (() => string) | undefined>)[`music_cards_${key}`];
const name = (m: number) => noteName(m, "flat", false);
const sound = (events: PlaybackEvent[], shift = 0): LessonSound => ({
  notes: events.map((e) => ({
    midi: e.midi,
    at: e.time + shift,
    dur: e.duration,
  })),
});
/** The key set with I, IV, V, I, then the chord, as the drill plays them (the chord 0.6 s after the last). */
const afterSetup = (minor: boolean, chord: PlaybackEvent[]): LessonSound => {
  const setup = keyCadence(0, minor);
  return sound([
    ...setup,
    ...chord.map((e) => ({ ...e, time: e.time + setup.length * 0.9 + 0.6 })),
  ]);
};
const marksOf = (midis: number[]) => Object.fromEntries(midis.map((x) => [x, name(x)]));
/** C major from middle C, each key marked with its degree or with the chord built on it. */
const C_DEGREES = keys(Object.fromEntries(MAJOR.map((s, i) => [60 + s, String(i + 1)])));
const C_NUMERALS = keys(
  Object.fromEntries(MAJOR.map((s, i) => [60 + s, ["I", "ii", "iii", "IV", "V", "vi", "vii°"][i]])),
);
const card = (id: string, title: string, ...screens: LessonScreen[]): Lesson => ({
  id,
  title,
  screens,
});

/** The quality's name and whether it is a triad: "major triad", "dominant 7th chord". */
function chordWord(intervals: number[]) {
  const q = QUALITIES.find((x) => x.intervals.join() === intervals.join());
  if (!q) return m.music_cards_ear_chord_word();
  const word = byKey(`ear_quality_word_${keyPart(q.token)}`);
  return word ? word() : `${q.label.toLowerCase()} ${q.level === "triad" ? "triad" : "chord"}`;
}
/** A quality's name as a title ("Major 7th"), from its token. */
const qualityTitle = (q: (typeof QUALITIES)[number]) =>
  byKey(`ear_quality_title_${keyPart(q.token)}`)?.() ??
  q.label.charAt(0) + q.label.slice(1).toLowerCase();
/** Where a chord's root sits above the tonic, in words. */
const rootAbove = (n: number) =>
  n === 0 ? m.music_cards_ear_root_is_tonic() : m.music_cards_ear_root_above({ steps: hs(n) });

// ---------------------------------------------------------------------------
// Intervals

/** The direction the quiz will use: a fixed setting, else up (the quiz also plays others, which the text says). */
type Direction = "ascending" | "descending" | "harmonic";
const fixedDirection = (setting?: string): Direction | null =>
  setting === "ascending" || setting === "descending" || setting === "harmonic" ? setting : null;
const intervalSound = (token: string, direction: Direction = "ascending", root = 60) =>
  sound(intervalPrompt(rng(1), { difficulty: 0.3, token, direction, root }).playback);

const intervals = {
  intro: (o: EarOptions) => {
    const dir = fixedDirection(o.direction) ?? "ascending";
    const sign = dir === "descending" ? -1 : 1;
    /** The start key "0", then every key up to `n` numbered: the half steps counted on the keys. */
    const counted = (n: number) =>
      keys(
        Object.fromEntries(Array.from({ length: n + 1 }, (_, k) => [60 + sign * k, String(k)])),
        [60, 60 + sign * 12],
      );
    return card("ear.intervals", m.music_cards_ear_intervals_title(), {
      title: m.music_cards_ear_intervals_intro_title(),
      text: (sign > 0 ? m.music_cards_ear_intervals_intro_up : m.music_cards_ear_intervals_intro_down)(
        { from: name(60), to: name(60 + sign * 4) },
      ),
      // Two notes with the count between them, from the first screen: the idea drawn before Next.
      figure: counted(4),
      steps: ["m2", "P5", "P8"].map((t) => {
        const i = EAR_INTERVALS.find((x) => x.token === t)!;
        const next = i.semitones === 1;
        return {
          text: (sign > 0
            ? next
              ? m.music_cards_ear_intervals_step_up_next
              : m.music_cards_ear_intervals_step_up
            : next
              ? m.music_cards_ear_intervals_step_down_next
              : m.music_cards_ear_intervals_step_down)({ name: i.name, steps: hs(i.semitones) }),
          figure: counted(i.semitones),
          sound: intervalSound(t, dir),
        };
      }),
    });
  },
  item: (token: string, o: EarOptions = {}) => {
    const i = EAR_INTERVALS.find((x) => x.token === token);
    if (!i) return null;
    const dir = fixedDirection(o.direction);
    const n = hs(i.semitones);
    const text = !i.semitones
      ? m.music_cards_ear_intervals_unison()
      : dir === "descending"
        ? m.music_cards_ear_intervals_descending({ steps: n })
        : dir === "harmonic"
          ? m.music_cards_ear_intervals_harmonic({ steps: n })
          : dir === "ascending"
            ? m.music_cards_ear_intervals_ascending({ steps: n })
            : m.music_cards_ear_intervals_any({ steps: n });
    const second = 60 + (dir === "descending" ? -i.semitones : i.semitones);
    return card(`ear.intervals:${token}`, i.name, {
      title: i.name,
      text,
      figure: keys({ 60: ORDINAL[0](), [second]: ORDINAL[1]() }),
      sound: intervalSound(token, dir ?? "ascending"),
    });
  },
};

const ev = (midi: number, time: number, duration: number): PlaybackEvent => ({
  midi: [midi],
  time,
  duration,
});
/** Two intervals from one root, as the compare drill plays them at first: 0.5 s notes, the second interval at 1.8 s. */
const pair = (a: number, b: number) =>
  sound([ev(60, 0, 0.5), ev(60 + a, 0.6, 0.5), ev(60, 1.8, 0.5), ev(60 + b, 2.4, 0.5)]);
const compare = {
  intro: () =>
    card("ear.interval-compare", m.music_cards_ear_compare_title(), {
      title: m.music_cards_ear_compare_intro_title(),
      text: m.music_cards_ear_compare_intro_text(),
      figure: keys({
        60: m.music_cards_ear_mark_start(),
        64: m.music_cards_ear_mark_4_up(),
        67: m.music_cards_ear_mark_7_up(),
      }),
      options: [
        { label: m.music_cards_ear_compare_first(), sound: pair(7, 4) },
        { label: m.music_cards_ear_compare_second(), sound: pair(4, 7) },
      ],
    }),
};

// ---------------------------------------------------------------------------
// Chord qualities

const THIRDS: Record<number, () => string> = {
  3: m.music_cards_ear_part_minor_3rd,
  4: m.music_cards_ear_part_major_3rd,
};
const FIFTHS: Record<number, () => string> = {
  6: m.music_cards_ear_part_diminished_5th,
  7: m.music_cards_ear_part_perfect_5th,
  8: m.music_cards_ear_part_augmented_5th,
};
const SEVENTHS: Record<number, () => string> = {
  9: m.music_cards_ear_part_diminished_7th,
  10: m.music_cards_ear_part_minor_7th,
  11: m.music_cards_ear_part_major_7th,
};
/** What a cue can name: a chord's 3rd, 5th or 7th (its half steps above the root), or the lack of a 7th. */
export type CueElement =
  | { kind: "third" | "fifth" | "seventh"; n: number }
  | { kind: "none7"; n: 0 };
const elementsOf = (token: string): CueElement[] => {
  const [, third, fifth, seventh] = QUALITIES.find((x) => x.token === token)!.intervals;
  return [
    { kind: "third", n: third },
    { kind: "fifth", n: fifth },
    seventh ? { kind: "seventh", n: seventh } : { kind: "none7", n: 0 },
  ];
};
const hasElement = (token: string, c: CueElement) =>
  elementsOf(token).some((e) => e.kind === c.kind && e.n === c.n);
/**
 * The fewest of a quality's own intervals (3rd, 5th, 7th, or no 7th) that no other quality in `set` has all of,
 * so the cue tells it from every other quality the quiz can ask in that set.
 */
export function qualityCue(token: string, set: readonly string[]): CueElement[] {
  const own = elementsOf(token);
  const others = set.filter((t) => t !== token && QUALITIES.some((q) => q.token === t));
  // Always at least one interval the chord has; "no 7th" only comes with one.
  const subsets = [1, 2, 3].flatMap((size) =>
    [[0], [1], [2], [0, 1], [0, 2], [1, 2], [0, 1, 2]]
      .filter((x) => x.length === size)
      .map((x) => x.map((i) => own[i]))
      .filter((sub) => sub.some((c) => c.kind !== "none7")),
  );
  return subsets.find((sub) => !others.some((t) => sub.every((c) => hasElement(t, c)))) ?? own;
}
const CUE_CODE = {
  third: { 3: "m3", 4: "M3" },
  fifth: { 6: "d5", 7: "P5", 8: "A5" },
  seventh: { 9: "d7", 10: "m7", 11: "M7" },
} as const;
/** The cue as an id part: "M3|P5|no7". */
const cueCode = (cue: CueElement[]) =>
  cue
    .map((c) => (c.kind === "none7" ? "no7" : (CUE_CODE[c.kind] as Record<number, string>)[c.n]))
    .join("|");
const plainList = (xs: (string | number)[]) => formatList(xs.map(String));
const qualities = {
  intro: (o: EarOptions = {}) => {
    const triad = (label: string, midi: number[], marks: Record<number, string>) => ({
      label,
      sound: { notes: [{ midi, at: 0, dur: 0.9 }] },
      figure: keys(marks, [60, 68]),
    });
    // Root, 3rd and 5th on every key: the body text says how far each one sits.
    const RT5 = (r: number, t: number, f: number) => ({
      [r]: m.music_cards_ear_mark_root(),
      [t]: m.music_cards_ear_mark_3rd(),
      [f]: m.music_cards_ear_mark_5th(),
    });
    const major = triad(m.music_cards_ear_qualities_major_label(), [60, 64, 67], RT5(60, 64, 67));
    // Diminished and augmented get their own screen, named by the quality, when the quiz asks them.
    const odd = [
      {
        token: "diminished",
        title: m.music_cards_ear_quality_title_diminished(),
        text: m.music_cards_ear_qualities_dim_text(),
        ...triad(m.music_cards_ear_qualities_dim_label(), [60, 63, 66], RT5(60, 63, 66)),
      },
      {
        token: "augmented",
        title: m.music_cards_ear_quality_title_augmented(),
        text: m.music_cards_ear_qualities_aug_text(),
        ...triad(m.music_cards_ear_qualities_aug_label(), [60, 64, 68], RT5(60, 64, 68)),
      },
    ].filter((x) => o.items?.includes(x.token));
    return card(
      "ear.chord-qualities",
      m.music_cards_ear_qualities_title(),
      {
        title: m.music_cards_ear_qualities_mm_title(),
        text: m.music_cards_ear_qualities_mm_text(),
        figure: major.figure,
        options: [
          major,
          triad(m.music_cards_ear_qualities_minor_label(), [60, 63, 67], RT5(60, 63, 67)),
        ],
      },
      ...odd.map((x) => ({ title: x.title, text: x.text, figure: x.figure, sound: x.sound })),
    );
  },
  item: (token: string, o: EarOptions = {}) => {
    const q = QUALITIES.find((x) => x.token === token);
    if (!q) return null;
    const [, third, fifth, seventh] = q.intervals;
    const parts = [
      m.music_cards_ear_part_root(),
      THIRDS[third](),
      FIFTHS[fifth](),
      ...(seventh ? [SEVENTHS[seventh]()] : []),
    ];
    const cue = qualityCue(token, o.items ?? [token]);
    const heard = cue.filter((c) => c.kind !== "none7");
    const words = heard.map(
      (c) => ({ third: THIRDS, fifth: FIFTHS, seventh: SEVENTHS })[c.kind as "third"][c.n](),
    );
    // The cue is part of the id: a set that needs another cue shows the item again.
    const no7 = cue.some((c) => c.kind === "none7");
    const chord = q.intervals.map((i) => 60 + i);
    const title = qualityTitle(q);
    return card(`ear.chord-qualities:${token}|${cueCode(cue)}`, title, {
      title,
      text: m.music_cards_ear_qualities_item({
        parts: formatList(parts),
        words: plainList(words),
        numbers: plainList(heard.map((c) => c.n)),
        no7: no7 ? m.music_cards_ear_qualities_no7() : "",
      }),
      figure: keys(marksOf(chord)),
      sound: { notes: [{ midi: chord, at: 0, dur: 0.9 }] },
    });
  },
};

// ---------------------------------------------------------------------------
// Cadences

const CADENCE_LINE: Record<string, () => string> = {
  authentic: m.music_cards_ear_cadence_line_authentic,
  plagal: m.music_cards_ear_cadence_line_plagal,
  half: m.music_cards_ear_cadence_line_half,
  deceptive: m.music_cards_ear_cadence_line_deceptive,
};
const cadences = {
  intro: () =>
    card("ear.cadences", m.music_cards_ear_cadences_title(), {
      title: m.music_cards_ear_cadences_intro_title(),
      text: m.music_cards_ear_cadences_intro_text(),
      figure: keys({ 55: "V", 59: "V", 62: "V", 60: "I", 64: "I", 67: "I" }),
      sound: {
        notes: [
          { midi: [55, 59, 62], at: 0, dur: 0.9 },
          { midi: [60, 64, 67], at: 1, dur: 1.2 },
        ],
      },
    }),
  item: (token: string) => {
    const c = CADENCES.find((x) => x.token === token);
    if (!c) return null;
    const title = byKey(`ear_cadence_title_${keyPart(token)}`)?.() ?? `${c.label} cadence`;
    return card(`ear.cadences:${token}`, title, {
      title,
      text: m.music_cards_ear_cadences_item({
        progression: c.romanProgression.join(m.music_cards_ear_to()),
        line: CADENCE_LINE[token]?.() ?? "",
      }),
      sound: {
        notes: c.playback.map((e) => ({
          midi: e.midiNotes,
          at: e.offsetSeconds,
          dur: e.durationSeconds,
        })),
      },
    });
  },
};

// ---------------------------------------------------------------------------
// Chords in a key: chord functions, progressions, song loops

const CALL = "I, IV, V, I";
/** One chord of C (or C minor) after the key is set, from a note list with the root in the bass. */
function chordItem(
  id: string,
  title: string,
  o: {
    minor: boolean;
    chord: number[];
    intervals: number[];
    label: string;
    symbol: string;
  },
) {
  const rootPc = pc(o.chord[0]);
  const key = o.minor ? m.music_cards_ear_key_c_minor() : m.music_cards_ear_key_c_major();
  return card(id, title, {
    title,
    text: m.music_cards_ear_chord_item({
      label: o.label,
      key,
      symbol: o.symbol,
      word: chordWord(o.intervals),
      root: rootAbove(rootPc),
      call: o.minor ? "i, iv, V, i" : CALL,
    }),
    figure: keys(marksOf(o.chord.slice(1))),
    sound: afterSetup(o.minor, [{ midi: o.chord, time: 0, duration: 1.1 }]),
  });
}
const functionItem = (drill: string) => (token: string) => {
  const p = parseFunction(token);
  if (!p.f) return null;
  const chord = functionChord(0, token);
  const intervals = [...new Set(chord.slice(1).map((m) => pc(m - chord[0])))].sort((a, b) => a - b);
  return chordItem(`ear.${drill}:${token}`, functionLabel(token), {
    minor: p.minor,
    chord,
    intervals,
    label: functionLabel(token),
    symbol: functionSymbol(0, token),
  });
};
const functions = {
  intro: () =>
    card("ear.chord-functions", m.music_cards_ear_functions_title(), {
      title: m.music_cards_ear_functions_intro_title(),
      text: m.music_cards_ear_functions_intro_text(),
      figure: C_NUMERALS,
    }),
  item: functionItem("chord-functions"),
};
const progressions = {
  intro: () =>
    card("ear.progressions", m.music_cards_ear_progressions_title(), {
      title: m.music_cards_ear_progressions_intro_title(),
      text: m.music_cards_ear_progressions_intro_text(),
      figure: C_NUMERALS,
    }),
  item: functionItem("progressions"),
};
const loops = {
  intro: () =>
    card("ear.song-loops", m.music_cards_ear_loops_title(), {
      title: m.music_cards_ear_loops_intro_title(),
      text: m.music_cards_ear_loops_intro_text(),
      figure: C_NUMERALS,
    }),
  item: (id: string) => {
    // "min:V" is the numeral heard after a minor setup, "V" after a major one.
    const minor = id.startsWith("min:");
    const numeral = minor ? id.slice(4) : id;
    const n = parseNumeral(numeral);
    if (!n) return null;
    return chordItem(
      `ear.song-loops:${id}`,
      minor
        ? m.music_cards_ear_loops_minor_title({ numeral: numeralLabel(numeral) })
        : numeralLabel(numeral),
      {
        minor,
        chord: numeralChord(0, numeral),
        intervals: n.intervals,
        label: numeralLabel(numeral),
        symbol: numeralSymbol(0, numeral),
      },
    );
  },
};

/** The lesson items of a loop set: each numeral in each kind of key its loops use. */
export function loopLessonItems(set: string): string[] {
  const ids = new Set<string>();
  const loops = loopsIn(set);
  for (const numeral of loopPalette(set))
    for (const minor of [false, true])
      if (loops.some((l) => !!l.minor === minor && l.numerals.includes(numeral)))
        ids.add(minor ? `min:${numeral}` : numeral);
  return [...ids];
}

// ---------------------------------------------------------------------------
// Key changes

const WAYS: Record<string, string> = {
  "ii7 V7 Imaj7": "ii-V",
  "V7 Imaj7": "V7",
  "iv7 bVII7 Imaj7": "Backdoor",
};
const keyChanges = {
  intro: () =>
    card(
      "ear.key-changes",
      m.music_cards_ear_key_changes_title(),
      {
        title: m.music_cards_ear_key_changes_moves_title(),
        text: m.music_cards_ear_key_changes_moves_text(),
        figure: keys({ 60: "C", 64: "E", 67: "G", 62: "D", 66: "F#", 69: "A" }),
      },
      {
        title: m.music_cards_ear_key_changes_ways_title(),
        text: m.music_cards_ear_key_changes_ways_text({
          paths: formatList(
            KEY_CHANGE_PATHS.minor.map((p) => p.replaceAll(" ", ", ")),
            "disjunction",
          ),
        }),
        options: KEY_CHANGE_PATHS.major.map((path) => ({
          label: WAYS[path] ?? path,
          sound: sound(keyChangePlayback(0, `up-step ${path}`)),
        })),
      },
    ),
};

// ---------------------------------------------------------------------------
// Bass lines

const bassLines = {
  intro: () =>
    card("ear.bass-lines", m.music_cards_ear_bass_title(), {
      title: m.music_cards_ear_bass_intro_title(),
      text: m.music_cards_ear_bass_intro_text(),
      figure: keys({ 48: "1", 53: "4", 55: "5" }),
      sound: {
        notes: [
          { midi: [48, 64, 67], at: 0, dur: 0.8 },
          { midi: [53, 65, 69], at: 0.9, dur: 0.8 },
          { midi: [55, 62, 67], at: 1.8, dur: 0.8 },
          { midi: [48, 64, 67], at: 2.7, dur: 1.1 },
        ],
      },
    }),
  item: (degree: string) => {
    const d = Number(degree);
    if (!BASS_LEVELS.at(-1)!.degrees.includes(degree as never)) return null;
    // 3 and 7 are no chord's root here: they are the 3rd of I and of V, as in the drill's stepwise lines.
    const [token, position] =
      d === 3 ? ["I", 1] : d === 7 ? ["V", 1] : [CHORD_FUNCTIONS[d - 1].token, 0];
    const [, ...upper] = functionChord(0, token);
    const semis = MAJOR[d - 1];
    const bass = 43 + ((((semis - 43) % 12) + 12) % 12);
    const above =
      semis === 0
        ? m.music_cards_ear_bass_the_tonic()
        : m.music_cards_ear_bass_above_tonic({ steps: hs(semis) });
    const here = position
      ? m.music_cards_ear_bass_third({ token, degree, above })
      : m.music_cards_ear_bass_root({ degree, chord: functionLabel(token), above });
    const title = m.music_cards_ear_bass_item_title({ degree });
    return card(`ear.bass-lines:${degree}`, title, {
      title,
      text: `${here} ${m.music_cards_ear_key_set_first({ call: CALL })}`,
      figure: keys(marksOf([bass, ...upper])),
      sound: afterSetup(false, [{ midi: [bass, ...upper], time: 0, duration: 0.8 }]),
    });
  },
};

// ---------------------------------------------------------------------------
// Scales and modes

/** What gives each scale its colour: the notes, and which half-step counts are in or out of it. */
const COLOUR: Record<string, () => string> = {
  major: m.music_cards_ear_colour_major,
  "natural-minor": m.music_cards_ear_colour_natural_minor,
  "harmonic-minor": m.music_cards_ear_colour_harmonic_minor,
  "melodic-minor": m.music_cards_ear_colour_melodic_minor,
  "major-pentatonic": m.music_cards_ear_colour_major_pentatonic,
  "minor-pentatonic": m.music_cards_ear_colour_minor_pentatonic,
  blues: m.music_cards_ear_colour_blues,
  mixolydian: m.music_cards_ear_colour_mixolydian,
  dorian: m.music_cards_ear_colour_dorian,
  lydian: m.music_cards_ear_colour_lydian,
  phrygian: m.music_cards_ear_colour_phrygian,
  locrian: m.music_cards_ear_colour_locrian,
};
const scales = {
  intro: () =>
    card("ear.scales", m.music_cards_ear_scales_title(), {
      title: m.music_cards_ear_scales_intro_title(),
      text: m.music_cards_ear_scales_intro_text(),
      figure: C_DEGREES,
      sound: sound(scalePlayback(60, "major", "ascending")),
    }),
  item: (token: string) => {
    const s = EAR_SCALES.find((x) => x.token === token);
    if (!s) return null;
    const run = scaleRun60(token);
    return card(`ear.scales:${token}`, s.name, {
      title: s.name,
      text: m.music_cards_ear_scales_item({ colour: COLOUR[token]?.() ?? "" }),
      figure: keys(marksOf(run)),
      sound: sound(scalePlayback(60, token, "ascending")),
    });
  },
};
const scaleRun60 = (token: string) =>
  (SCALE_DATA.semitonesByKind[token as keyof typeof SCALE_DATA.semitonesByKind] ?? MAJOR).map(
    (s) => 60 + s,
  );

// ---------------------------------------------------------------------------
// Inversions

const BASS_TONE = [
  m.music_cards_ear_bass_tone_root,
  m.music_cards_ear_bass_tone_3rd,
  m.music_cards_ear_bass_tone_5th,
  m.music_cards_ear_bass_tone_7th,
];
const inversions = {
  intro: () =>
    card("ear.inversions", m.music_cards_ear_inversions_title(), {
      title: m.music_cards_ear_inversions_intro_title(),
      text: m.music_cards_ear_inversions_intro_text(),
      figure: keys({
        64: m.music_cards_ear_mark_3rd(),
        67: m.music_cards_ear_mark_5th(),
        72: m.music_cards_ear_mark_root(),
      }),
      sound: { notes: [{ midi: [64, 67, 72], at: 0, dur: 1.2 }] },
    }),
  item: (token: string) => {
    const inv = EAR_INVERSIONS.find((x) => x.token === token);
    if (!inv) return null;
    const quality = inv.seventh ? "dominant-7" : "major";
    const voicing = inversionVoicing(60, quality, inv.position);
    const bass = Math.min(...voicing);
    // Spelled out from the bass up, then together, as the drill starts out.
    const notes = [
      ...voicing.map((m, i) => ({ midi: [m], at: i * 0.22, dur: 0.2 })),
      { midi: voicing, at: voicing.length * 0.22 + 0.2, dur: 1.2 },
    ];
    return card(`ear.inversions:${token}`, inv.name, {
      title: inv.name,
      text: m.music_cards_ear_inversions_item({
        tone: BASS_TONE[inv.position](),
        chord: inv.seventh ? "C7" : m.music_cards_ear_key_c_major(),
        note: name(bass),
      }),
      figure: keys(marksOf(voicing)),
      sound: { notes },
    });
  },
};

// ---------------------------------------------------------------------------
// Fine pitch

const finePitch = {
  intro: () => {
    const cents = CENT_STEPS[0];
    const two = (second: number): LessonSound => ({
      notes: [
        { midi: [69], at: 0, dur: 0.8 },
        { midi: [second], at: 1.1, dur: 0.8 },
      ],
    });
    return card("ear.fine-pitch", m.music_cards_ear_fine_title(), {
      title: m.music_cards_ear_fine_intro_title(),
      text: m.music_cards_ear_fine_intro_text({ cents, smallest: String(CENT_STEPS.at(-1)) }),
      figure: keys({ 69: "A" }),
      options: [
        { label: m.music_cards_ear_fine_higher({ cents }), sound: two(69 + cents / 100) },
        { label: m.music_cards_ear_fine_lower({ cents }), sound: two(69 - cents / 100) },
      ],
    });
  },
};

// ---------------------------------------------------------------------------
// Degrees: scale degrees, wrong note, melody dictation

/** Scale degrees and melody dictation set the key first (promptKey); the wrong note drill has no key setup. */
const degreeItem =
  (drill: string, keyed: boolean) =>
  (label: string, o: EarOptions = {}) => {
    const d = SCALE_DEGREES.find((x) => x.label === label);
    if (!d) return null;
    const p = scaleDegreePrompt(rng(1), {
      difficulty: 0.3,
      level: "chromatic-color",
      degree: label,
      keyPc: 0,
    });
    const [tonic, target] = p.playback.map((e) => e.midi[0]);
    const minor = !!o.minor;
    const setup = keyed
      ? ` ${m.music_cards_ear_key_set_first({ call: minor ? "i, iv, V, i" : CALL })}`
      : "";
    const then = keyed
      ? d.semitones
        ? m.music_cards_ear_degree_next_note()
        : m.music_cards_ear_degree_next_same()
      : d.semitones
        ? m.music_cards_ear_degree_first_note()
        : m.music_cards_ear_degree_first_same();
    const title = m.music_cards_ear_degree_title({ label });
    return card(`ear.${drill}:${label}`, title, {
      title,
      text: `${
        d.semitones
          ? m.music_cards_ear_degree_above({ label, solfege: d.solfege, steps: hs(d.semitones) })
          : m.music_cards_ear_degree_tonic({ solfege: d.solfege })
      }${setup} ${then}`,
      figure: keys({ [tonic]: "1", [target]: label === "1" ? "1" : label }),
      sound: keyed ? afterSetup(minor, p.playback) : sound(p.playback),
    });
  };
const scaleDegrees = {
  intro: () =>
    card("ear.scale-degrees", m.music_cards_ear_degrees_title(), {
      title: m.music_cards_ear_degrees_intro_title(),
      text: m.music_cards_ear_degrees_intro_text(),
      figure: C_DEGREES,
      sound: sound(scalePlayback(60, "major", "ascending")),
    }),
  item: degreeItem("scale-degrees", true),
};
const melodyDictation = {
  intro: (o: EarOptions) => {
    const p = melodyDictationPrompt(rng(3), {
      difficulty: 0.3,
      level: o.level ?? "major-pentachord",
      keyPc: 0,
    });
    const tonic = p.playback[0].midi[0];
    const degrees = p.answer.split(" ");
    const TONIC = m.music_cards_ear_mark_tonic();
    return card("ear.melody-dictation", m.music_cards_ear_melody_title(), {
      title: m.music_cards_ear_melody_intro_title(),
      text: m.music_cards_ear_melody_intro_text({ answer: p.answer }),
      figure: keys({
        ...Object.fromEntries(p.expectedMidi!.map((x, i) => [x, degrees[i]])),
        [tonic]: TONIC,
      }),
      sound: afterSetup(p.minor, p.playback),
      // Next walks the phrase in play order, so the order is drawn, not only the degrees.
      steps: p.expectedMidi!.map((_, i) => {
        const marks: Record<number, string> = { [tonic]: TONIC };
        p.expectedMidi!.slice(0, i + 1).forEach(
          (x, j) =>
            (marks[x] = marks[x] && x !== tonic ? `${marks[x]} ${ORDINAL[j]()}` : ORDINAL[j]()),
        );
        const ordinal = ORDINAL[i]();
        return {
          text: m.music_cards_ear_melody_step({
            ordinal: `${ordinal[0].toUpperCase()}${ordinal.slice(1)}`,
            degree: degrees[i],
          }),
          figure: keys(marks, [tonic, ...p.expectedMidi!]),
          sound: sound(p.playback.slice(0, i + 2)),
        };
      }),
    });
  },
  item: degreeItem("melody-dictation", true),
};
const wrongNote = {
  intro: (o: EarOptions) => {
    const p = errorDetectPrompt(rng(7), {
      difficulty: 0.3,
      level: o.level ?? "major-pentachord",
    });
    const at = Number(p.answer);
    const written = p.playback.map((e, i) =>
      i === 0 ? e : { ...e, midi: [p.expectedMidi![i - 1]] },
    );
    return card("ear.wrong-note", m.music_cards_ear_wrong_title(), {
      title: m.music_cards_ear_wrong_intro_title(),
      text: m.music_cards_ear_wrong_intro_text({ written: p.written!.join(" "), at }),
      figure: keys(Object.fromEntries(p.expectedMidi!.map((x, i) => [x, p.written![i]]))),
      options: [
        { label: m.music_cards_ear_wrong_as_written(), sound: sound(written) },
        { label: m.music_cards_ear_wrong_changed(), sound: sound(p.playback) },
      ],
    });
  },
  item: degreeItem("wrong-note", false),
};

// ---------------------------------------------------------------------------
// Feel

/** A groove of the feel, at its starting tempo, for two bars at least: as the feel drill plays it. */
function feelSound(feel: string): { sound: LessonSound; label: string; bpm: number } | null {
  const f = FEELS.find((x) => x.id === feel);
  const r = f && repertoireFor(f.grooves[0]);
  if (!r) return null;
  const bpm = r.bpm.start;
  const g = grooveTargetsFor(r.groove, bpm);
  const cycles = Math.max(2, Math.ceil(2 / r.groove.bars));
  const notes = Array.from({ length: cycles }, (_, c) =>
    g.targets.map((t) => ({
      midi: [t.pad],
      at: (c * g.lengthMs + t.atMs) / 1000 + 0.05,
      dur: 0.12,
      drum: true,
      velocity: t.accent ? 0.95 : t.ghost ? 0.3 : 0.65,
    })),
  ).flat();
  return { sound: { notes }, label: r.groove.label, bpm };
}
const feel = {
  intro: () =>
    card("ear.feel", m.music_cards_ear_feel_title(), {
      title: m.music_cards_ear_feel_intro_title(),
      text: m.music_cards_ear_feel_intro_text(),
      figure: {
        kind: "rhythm",
        bars: 1,
        perBeat: 2,
        beatsPerBar: 4,
        onsets: [0, 0.5, 1, 1.5, 2, 2.5, 3, 3.5],
      },
    }),
  item: (id: string) => {
    const f = FEELS.find((x) => x.id === id);
    const s = f && feelSound(id);
    if (!f || !s) return null;
    return card(`ear.feel:${id}`, f.label, {
      title: f.label,
      text: m.music_cards_ear_feel_item({ hint: f.hint, groove: s.label, bpm: s.bpm }),
      sound: s.sound,
    });
  },
};

// ---------------------------------------------------------------------------

/** What the drill's setup changes about its items: the intervals' direction, a minor level's key setup. */
export interface EarOptions {
  direction?: string;
  minor?: boolean;
  /** The degree level (melody dictation, wrong note): the intro's example uses its degrees. */
  level?: string;
  /** The items asked, so a cue can be told apart within the set. */
  items?: readonly string[];
}
type Builder = {
  intro: (o: EarOptions) => Lesson;
  item?: (item: string, o?: EarOptions) => Lesson | null;
};
const BUILDERS: Record<string, Builder> = {
  intervals,
  "interval-compare": compare,
  "chord-qualities": qualities,
  cadences,
  "chord-functions": functions,
  progressions,
  "key-changes": keyChanges,
  "song-loops": loops,
  scales,
  inversions,
  "bass-lines": bassLines,
  "fine-pitch": finePitch,
  "wrong-note": wrongNote,
  "scale-degrees": scaleDegrees,
  "melody-dictation": melodyDictation,
  feel,
};

/**
 * What an ear drill teaches before its quiz: an intro with the idea, then one single-screen lesson
 * per item the drill's current level asks (an interval, a chord quality, a cadence, a numeral...),
 * each played with the drill's own sound. Items a drill has no lesson for are left out. The lesson
 * follows the drill and its level, never the answer mode.
 */
export function earLessons(
  drillId: string,
  items: readonly string[],
  o: EarOptions = {},
): Lesson[] {
  const b = BUILDERS[drillId];
  if (!b) return [];
  const all = { ...o, items };
  return [b.intro(all), ...items.flatMap((i) => b.item?.(i, all) ?? [])];
}
