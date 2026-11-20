// Lessons for the reading drills (flashcards, sight-reading), the rhythm drill's echo and dictation
// modes, and the mixing-ear drills. Pitches come from the clef's bottom line and letter steps, the
// rhythm examples from the drill's own cells, the sounds and bands from the studio module.
import { EAR_RHYTHM_LEVELS, RHYTHM_CELLS, type RhythmCell } from "../content/rhythm";
import {
  BAND_SETS,
  DELAY_SETS,
  LOOP_BPM,
  PAN_SETS,
  bandLabel,
  compLabel,
  delayLabel,
  panLabel,
  type BandSet,
  type StudioChange,
  type StudioExercise,
  type StudioMaterial,
} from "../content/studio";
import { noteName, octaveOf, parseNote, pc } from "../theory/notes";
import { FLAT_ORDER, SHARP_ORDER } from "../theory/circle";
import {
  READING_METERS,
  changingMeterParts,
  readingLevelId,
  sightReadingItems,
  type ReadingMeter,
  type SightItem,
} from "../content/reading";
import { m } from "@repo/i18n/messages.js";
import { formatList } from "@repo/i18n/format";
import { SUBS, countName, type PerBeat } from "./count";
import { keys } from "./tier1";
import { getNoteNaming, showKeyName } from "../theory/note-names";
import type { Lesson, LessonFigure, LessonScreen, LessonSound, LessonStep } from "./types";

type Clef = "treble" | "bass";

// ---------------------------------------------------------------------------
// The staff

const NATURAL = [0, 2, 4, 5, 7, 9, 11];
/** The bottom line of each clef: E4 in the treble, G2 in the bass. */
const BOTTOM_LINE: Record<Clef, number> = { treble: parseNote("E4")!, bass: parseNote("G2")! };

/** The natural note on a staff position: 0 is the bottom line, 1 the first space, and so on; negative is below. */
export function staffNote(clef: Clef, step: number): number {
  const base = BOTTOM_LINE[clef];
  const i = (octaveOf(base) + 1) * 7 + NATURAL.indexOf(pc(base)) + step;
  return Math.floor(i / 7) * 12 + NATURAL[((i % 7) + 7) % 7];
}
export const staffLines = (clef: Clef) => [0, 2, 4, 6, 8].map((s) => staffNote(clef, s));
export const staffSpaces = (clef: Clef) => [1, 3, 5, 7].map((s) => staffNote(clef, s));

const letter = (midi: number) => noteName(midi, "sharp", false);
/**
 * A note's name as shown. Reading names a staff position, which is the same in every key, so
 * movable do reads as fixed do here.
 */
const shown = (n: string) => showKeyName(n);
const named = (midi: number) => shown(letter(midi));
const letters = (ms: number[]) => ms.map(named).join(" ");
/** "F#" as it is said: "F sharp". */
const say = (n: string) =>
  n.length > 1
    ? n[1] === "#"
      ? m.music_lessons_reading_say_sharp({ note: shown(n[0]) })
      : m.music_lessons_reading_say_flat({ note: shown(n[0]) })
    : shown(n);
/** The mnemonics spell the letters, so with solfège the lines and spaces are named without them. */
const lettersNamed = () => getNoteNaming() === "letters";

const staff = (
  clef: Clef,
  notes: { midi: number | null; beats: number }[],
  extra: { fifths?: number; meter?: { beats: number; beatUnit: number } } = {},
): LessonFigure => ({ kind: "staff", clef, notes, ...extra });
const quarters = (clef: Clef, midis: number[], fifths?: number) =>
  staff(
    clef,
    midis.map((midi) => ({ midi, beats: 1 })),
    fifths === undefined ? {} : { fifths },
  );
/** The notes one after another, 0.6 s apart. */
const run = (midis: number[]): LessonSound => ({
  notes: midis.map((m, i) => ({ midi: [m], at: i * 0.6, dur: 0.5 })),
});

/** The first letters of a phrase, spaced: "Every Good Boy" is "E G B". */
export const initials = (phrase: string) =>
  phrase
    .replace(/^They spell the word /, "")
    .split(/\s+/)
    .flatMap((w) => (w === w.toUpperCase() && w.length > 1 ? [...w] : [w[0]]))
    .join(" ");

function linesSpaces(clef: Clef): Lesson {
  const treble = clef === "treble";
  const lines = staffLines(clef);
  const spaces = staffSpaces(clef);
  const landmark = clef === "treble" ? staffNote(clef, 2) : staffNote(clef, 6);
  const below = staffNote(clef, -2);
  const above = staffNote(clef, 10);
  const other = treble ? above : below;
  return {
    id: `reading.lines-spaces.${clef}`,
    title: treble
      ? m.music_lessons_reading_ls_title_treble()
      : m.music_lessons_reading_ls_title_bass(),
    screens: [
      {
        title: m.music_lessons_reading_ls_lines_title(),
        text: (lettersNamed()
          ? treble
            ? m.music_lessons_reading_ls_lines_text_treble
            : m.music_lessons_reading_ls_lines_text_bass
          : treble
            ? m.music_lessons_reading_ls_lines_text_treble_named
            : m.music_lessons_reading_ls_lines_text_bass_named)({ letters: letters(lines) }),
        figure: quarters(clef, lines),
        sound: run(lines),
      },
      {
        title: m.music_lessons_reading_ls_spaces_title(),
        text: (lettersNamed()
          ? treble
            ? m.music_lessons_reading_ls_spaces_text_treble
            : m.music_lessons_reading_ls_spaces_text_bass
          : treble
            ? m.music_lessons_reading_ls_spaces_text_treble_named
            : m.music_lessons_reading_ls_spaces_text_bass_named)({ letters: letters(spaces) }),
        figure: quarters(clef, spaces),
        sound: run(spaces),
      },
      {
        title: m.music_lessons_reading_ls_landmark_title({ note: named(landmark) }),
        text: (treble
          ? m.music_lessons_reading_ls_landmark_text_treble
          : m.music_lessons_reading_ls_landmark_text_bass)({ note: named(landmark) }),
        figure: quarters(clef, [landmark]),
        sound: run([landmark]),
      },
      {
        title: m.music_lessons_reading_ls_ledger_title(),
        text: (treble
          ? m.music_lessons_reading_ls_ledger_text_treble
          : m.music_lessons_reading_ls_ledger_text_bass)({
          note: named(other),
          middle: shown("C"),
        }),
        figure: quarters(
          clef,
          [-4, -2, 10, 12].map((s) => staffNote(clef, s)),
        ),
        sound: run([-4, -2, 10, 12].map((s) => staffNote(clef, s))),
      },
    ],
  };
}

function accidentalsLesson(): Lesson {
  const flat = (n: number) => noteName(n, "flat", false);
  return {
    id: "reading.accidentals",
    title: m.music_lessons_reading_acc_title(),
    screens: [
      {
        title: m.music_lessons_reading_acc_sharp_title(),
        text: m.music_lessons_reading_acc_sharp_text({
          note: named(60),
          next: say(letter(61)),
          key: shown("C"),
        }),
        figure: quarters("treble", [60, 61], 0),
        sound: run([60, 61]),
      },
      {
        title: m.music_lessons_reading_acc_flat_title(),
        text: m.music_lessons_reading_acc_flat_text({
          note: named(62),
          next: say(flat(61)),
          key: shown("F"),
        }),
        figure: quarters("treble", [62, 61], -1),
        sound: run([62, 61]),
      },
      {
        title: m.music_lessons_reading_acc_natural_title(),
        text: m.music_lessons_reading_acc_natural_text({
          flat: say(flat(70)),
          plain: named(71),
          key: shown("F"),
          b: shown("B"),
        }),
        figure: quarters("treble", [70, 71], -1),
        sound: run([70, 71]),
      },
    ],
  };
}

/** The order item cards are taught in. */
const ITEM_ORDER: SightItem[] = [
  "ties",
  "dotted-quarter",
  "syncopation",
  "sixteenths",
  "dotted-eighth",
  "triplets",
  "rests",
  "pickup",
  "accidentals",
  "chords",
  "clef-change",
  "swing",
];
/** What a sight-reading level and meter can write, in teaching order; from the generator's configuration. */
export function levelItems(
  levelId: string,
  meter: string,
  who: { piano?: boolean; grand?: boolean; measures?: number } = {},
): SightItem[] {
  const found = sightReadingItems(readingLevelId(levelId), meter, who);
  return ITEM_ORDER.filter((i) => found.includes(i));
}

export interface ReadingOptions {
  /** Key signature of the run (circle-of-fifths position). */
  fifths?: number;
  /** Flashcards with accidentals on. */
  accidentals?: boolean;
  /** Flashcards of triads or four-part chords. */
  stack?: "chord" | "satb";
  /** Sight-reading: the level and the meter its phrase is written in. */
  level?: string;
  meter?: string;
  /** The instrument is the piano. */
  piano?: boolean;
  /** A piano reading both clefs (the left hand then accompanies). */
  grand?: boolean;
  /** Sight-reading: the phrase length in bars (without one, the longest phrase). */
  measures?: number;
}

export function readingLessons(
  kind: "flashcards" | "sight-reading",
  clef: Clef | "both",
  opts: ReadingOptions = {},
): Lesson[] {
  const clefs: Clef[] = clef === "both" ? ["treble", "bass"] : [clef];
  const sig = opts.fifths ? keySignatureLessons(clefs, opts.fifths) : [];
  if (kind === "flashcards")
    return [
      ...clefs.map(linesSpaces),
      ...sig,
      ...(opts.accidentals ? [accidentalsLesson()] : []),
      ...(opts.stack ? [stackedLesson(opts.stack)] : []),
    ];
  const items = opts.level
    ? levelItems(opts.level, opts.meter ?? "simple", {
        piano: opts.piano,
        grand: opts.grand,
        measures: opts.measures,
      })
    : [];
  // A changing-meter phrase of 2 bars or fewer is one part in one meter.
  const parts = [...new Set(changingMeterParts(opts.measures ?? 16))];
  const meter =
    opts.meter === "changing"
      ? parts.length > 1
        ? [changingMeterLesson(parts)]
        : []
      : opts.meter && VALUE_METERS[opts.meter as ReadingMeter]
        ? [meterLesson(opts.meter as ReadingMeter)]
        : [];
  return [
    ...clefs.map(linesSpaces),
    valuesLesson(clefs[0]),
    ...items.map((i) =>
      i === "accidentals"
        ? accidentalsLesson()
        : i === "rests"
          ? restsLesson(clefs[0])
          : valueItemLesson(i, clefs[0]),
    ),
    ...meter,
    ...sig,
  ];
}

/** "C-E-G": a triad named from the root up. */
const TRIAD = () => ["C", "E", "G"].map(shown).join("-");

function stackedLesson(kind: "chord" | "satb"): Lesson {
  return {
    id: `reading.stacked.${kind === "chord" ? "triad" : "satb"}`,
    title:
      kind === "chord"
        ? m.music_lessons_reading_triad_title()
        : m.music_lessons_reading_satb_title(),
    screens: [
      kind === "chord"
        ? {
            title: m.music_lessons_reading_triad_screen_title(),
            text: m.music_lessons_reading_triad_text({ triad: TRIAD() }),
            figure: keys({ 60: shown("C"), 64: shown("E"), 67: shown("G") }),
          }
        : {
            title: m.music_lessons_reading_satb_screen_title(),
            text: m.music_lessons_reading_satb_text({ triad: TRIAD() }),
            figure: keys({ 48: shown("C"), 55: shown("G"), 64: shown("E"), 72: shown("C") }),
          },
    ],
  };
}

// ---------------------------------------------------------------------------
// Sight-reading: note values, counting and the key signature

const BEAT = 60 / 90;

function valuesLesson(clef: Clef): Lesson {
  const pitch = staffNote(clef, 4);
  const bar = (beats: number): LessonFigure =>
    staff(
      clef,
      Array.from({ length: 4 / beats }, () => ({ midi: pitch, beats })),
      {
        meter: { beats: 4, beatUnit: 4 },
      },
    );
  const hear = (beats: number): LessonSound => ({
    notes: Array.from({ length: 4 / beats }, (_, i) => ({
      midi: [pitch],
      at: i * beats * BEAT,
      dur: beats * BEAT * 0.9,
    })),
  });
  const VALUES: { name: string; beats: number; text: string }[] = [
    { name: "whole", beats: 4, text: m.music_lessons_reading_val_whole() },
    { name: "half", beats: 2, text: m.music_lessons_reading_val_half() },
    { name: "quarter", beats: 1, text: m.music_lessons_reading_val_quarter() },
    { name: "eighth", beats: 0.5, text: m.music_lessons_reading_val_eighth() },
  ];
  const steps: LessonStep[] = VALUES.map((v) => ({
    text: v.text,
    figure: bar(v.beats),
    sound: hear(v.beats),
  }));
  return {
    id: "reading.values",
    title: m.music_lessons_reading_values_title(),
    screens: [
      {
        title: m.music_lessons_reading_values_length_title(),
        text: m.music_lessons_reading_values_length_text(),
        figure: bar(4),
        steps,
      },
      {
        title: m.music_lessons_reading_values_time_sig_title(),
        text: m.music_lessons_reading_values_time_sig_text(),
        figure: staff(
          clef,
          [1, 1, 1].map((beats) => ({ midi: pitch, beats })),
          { meter: { beats: 3, beatUnit: 4 } },
        ),
        sound: { notes: [0, 1, 2].map((i) => ({ midi: [pitch], at: i * BEAT, dur: BEAT * 0.9 })) },
      },
      {
        title: m.music_lessons_reading_values_dots_title(),
        text: m.music_lessons_reading_values_dots_text(),
        figure: staff(
          clef,
          [
            { midi: pitch, beats: 3 },
            { midi: null, beats: 1 },
          ],
          { meter: { beats: 4, beatUnit: 4 } },
        ),
        sound: { notes: [{ midi: [pitch], at: 0, dur: 3 * BEAT * 0.95 }] },
      },
    ],
  };
}

/** An intro that applies to every key, then one card for the accidentals this key adds. */
function keySignatureLessons(clefs: Clef[], fifths: number): Lesson[] {
  const clef = clefs[0];
  const n = Math.abs(fifths);
  const sharp = fifths > 0;
  const order = (sharp ? SHARP_ORDER : FLAT_ORDER).slice(0, n);
  const sig = (reveal?: number): LessonFigure => ({
    kind: "signature",
    clef,
    fifths,
    ...(reveal === undefined ? {} : { reveal }),
  });
  // The last accidental's letter on a line or space of each clef, with the signature's accidental.
  const onStaff = (c: Clef, l: string) => {
    const step = [0, 1, 2, 3, 4, 5, 6, 7, 8].find((s) => letter(staffNote(c, s)) === l)!;
    return staffNote(c, step) + (sharp ? 1 : -1);
  };
  const last = order[n - 1];
  return [
    {
      id: "reading.key-signature",
      title: m.music_lessons_reading_ks_title(),
      screens: [
        {
          title: m.music_lessons_reading_ks_intro_title(),
          text: m.music_lessons_reading_ks_intro_text(),
          figure: sig(),
        },
      ],
    },
    {
      id: `reading.key-signature.${fifths}`,
      title: (sharp
        ? m.music_lessons_reading_ks_count_title_sharp
        : m.music_lessons_reading_ks_count_title_flat)({ count: n }),
      screens: [
        {
          title: (sharp
            ? m.music_lessons_reading_ks_has_sharp
            : m.music_lessons_reading_ks_has_flat)({ count: n }),
          text:
            n === 1
              ? sharp
                ? m.music_lessons_reading_ks_add_one_sharp()
                : m.music_lessons_reading_ks_add_one_flat()
              : (sharp
                  ? m.music_lessons_reading_ks_add_many_sharp
                  : m.music_lessons_reading_ks_add_many_flat)({ count: n }),
          figure: sig(0),
          steps: order.map((l, i) => ({
            text: (sharp
              ? m.music_lessons_reading_ks_step_sharp
              : m.music_lessons_reading_ks_step_flat)({ letter: shown(l) }),
            figure: sig(i + 1),
          })),
        },
        ...clefs.map((c) => ({
          title:
            clefs.length > 1
              ? c === "treble"
                ? m.music_lessons_reading_ks_on_treble()
                : m.music_lessons_reading_ks_on_bass()
              : m.music_lessons_reading_ks_on_staff(),
          text: (sharp
            ? m.music_lessons_reading_ks_note_sharp
            : m.music_lessons_reading_ks_note_flat)({ letter: shown(last) }),
          figure: staff(c, [{ midi: onStaff(c, last), beats: 1 }], { fifths }),
          sound: run([onStaff(c, last)]),
        })),
      ],
    },
  ];
}

/** How each meter with its own lesson is counted. */
const VALUE_METERS: Partial<Record<ReadingMeter, () => string>> = {
  compound: m.music_lessons_reading_meter_compound,
  "3/8": m.music_lessons_reading_meter_3_8,
  "9/8": m.music_lessons_reading_meter_9_8,
  "2/2": m.music_lessons_reading_meter_2_2,
  "5/4": m.music_lessons_reading_meter_5_4,
  "7/8": m.music_lessons_reading_meter_7_8,
  "5/8": m.music_lessons_reading_meter_5_8,
};
/** One bar of the meter, a note on every count of its bottom number (beats in quarters). */
export function meterBar(m: ReadingMeter): LessonFigure {
  const { beats, beatUnit } = READING_METERS[m];
  return staff(
    "treble",
    Array.from({ length: beats }, () => ({ midi: staffNote("treble", 4), beats: 4 / beatUnit })),
    { meter: { beats, beatUnit } },
  );
}
function meterLesson(meter: ReadingMeter): Lesson {
  const label = READING_METERS[meter].label;
  return {
    id: `reading.meter.${meter.replace("/", "-")}`,
    title: m.music_lessons_reading_meter_title({ label }),
    screens: [
      {
        title: m.music_lessons_reading_meter_counting({ label }),
        text: `${VALUE_METERS[meter]!()} ${m.music_lessons_reading_check_meter()}`,
        figure: meterBar(meter),
      },
    ],
  };
}
/** The meters a changing-meter phrase of the chosen length goes through, in order. */
function changingMeterLesson(parts: ReadingMeter[]): Lesson {
  const labels = parts.map((p) => READING_METERS[p].label);
  return {
    id: "reading.meter.changing",
    title: m.music_lessons_reading_changing_title(),
    screens: [
      {
        title: m.music_lessons_reading_changing_screen_title(),
        text: `${m.music_lessons_reading_changing_text({ list: formatList(labels) })} ${m.music_lessons_reading_check_meter()}`,
        figure: meterBar(parts[0]),
      },
    ],
  };
}

/** An item card: its words, and a bar of 1 to `beats` quarters (`notes` are lengths, negative a rest) or its own figure. */
interface ItemText {
  title: string;
  text: string;
  bar?: { beats: number; notes: number[] };
  figure?: LessonFigure;
}
const BASS_CHORDS = (): ItemText => ({
  title: m.music_lessons_reading_item_chords_lh_title(),
  text: m.music_lessons_reading_item_chords_lh_text(),
  figure: keys({ 43: shown("G"), 48: shown("C") }),
});
const ITEM_TEXT = (): Record<string, ItemText> => ({
  ties: {
    title: m.music_lessons_reading_item_ties_title(),
    text: m.music_lessons_reading_item_ties_text(),
    // The middle half note crosses the bar line, so it is written as two tied quarters.
    bar: { beats: 2, notes: [1, 2, 1] },
  },
  "dotted-quarter": {
    title: m.music_lessons_reading_item_dotted_quarter_title(),
    text: m.music_lessons_reading_item_dotted_quarter_text(),
    bar: { beats: 2, notes: [1.5, 0.5] },
  },
  syncopation: {
    title: m.music_lessons_reading_item_syncopation_title(),
    text: m.music_lessons_reading_item_syncopation_text(),
    bar: { beats: 2, notes: [0.5, 1, 0.5] },
  },
  sixteenths: {
    title: m.music_lessons_reading_item_sixteenths_title(),
    text: m.music_lessons_reading_item_sixteenths_text(),
    bar: { beats: 1, notes: [0.25, 0.25, 0.25, 0.25] },
  },
  "dotted-eighth": {
    title: m.music_lessons_reading_item_dotted_eighth_title(),
    text: m.music_lessons_reading_item_dotted_eighth_text(),
    bar: { beats: 1, notes: [0.75, 0.25] },
  },
  triplets: {
    title: m.music_lessons_reading_item_triplets_title(),
    text: m.music_lessons_reading_item_triplets_text(),
    bar: { beats: 2, notes: [1 / 3, 1 / 3, 1 / 3, 1] },
  },
  pickup: {
    title: m.music_lessons_reading_item_pickup_title(),
    text: m.music_lessons_reading_item_pickup_text(),
    bar: { beats: 4, notes: [-3, 1] },
  },
  chords: {
    title: m.music_lessons_reading_item_chords_rh_title(),
    text: m.music_lessons_reading_item_chords_rh_text(),
    figure: keys({ 67: shown("G"), 72: shown("C"), 76: shown("E") }),
  },
  "clef-change": {
    title: m.music_lessons_reading_item_clef_change_title(),
    text: m.music_lessons_reading_item_clef_change_text(),
    // Notes around middle C as the left hand reads them in the treble clef.
    figure: quarters("treble", [60, 62, 64, 65]),
  },
  swing: {
    title: m.music_lessons_reading_item_swing_title(),
    text: m.music_lessons_reading_item_swing_text(),
    bar: { beats: 2, notes: [0.5, 0.5, 0.5, 0.5] },
  },
});
function valueItemLesson(id: string, clef: Clef): Lesson {
  const t = id === "chords" && clef === "bass" ? BASS_CHORDS() : ITEM_TEXT()[id];
  return {
    id: `reading.values.${id}`,
    title: t.title,
    screens: [
      {
        title: t.title,
        text: t.text,
        ...(t.bar
          ? {
              figure: staff(
                "treble",
                t.bar.notes.map((beats) => ({
                  midi: beats < 0 ? null : staffNote("treble", 4),
                  beats: Math.abs(beats),
                })),
                { meter: { beats: t.bar.beats, beatUnit: 4 } },
              ),
            }
          : t.figure
            ? { figure: t.figure }
            : {}),
      },
    ],
  };
}

/**
 * Every rest the staff can draw (the engraver writes each silence as the longest of these that
 * fits), longest first, with its length in shorter notes, three screens of steps.
 */
export const REST_VALUES: { name: string; beats: number; length: string }[][] = [
  [
    { name: "whole", beats: 4, length: "four quarter notes" },
    { name: "dotted half", beats: 3, length: "three quarter notes" },
    { name: "half", beats: 2, length: "two quarter notes" },
  ],
  [
    { name: "dotted quarter", beats: 1.5, length: "three eighth notes" },
    { name: "quarter", beats: 1, length: "two eighth notes" },
    { name: "eighth", beats: 0.5, length: "two sixteenth notes" },
  ],
  [
    { name: "dotted eighth", beats: 0.75, length: "three sixteenth notes" },
    { name: "sixteenth", beats: 0.25, length: "two thirty-second notes" },
    { name: "dotted sixteenth", beats: 0.375, length: "three thirty-second notes" },
    { name: "thirty-second", beats: 0.125, length: "half a sixteenth note" },
  ],
];
/** "A whole rest is silent as long as a whole note, four quarter notes.", by the rest's name. */
const REST_TEXT: Record<string, () => string> = {
  whole: m.music_lessons_reading_rest_whole,
  "dotted half": m.music_lessons_reading_rest_dotted_half,
  half: m.music_lessons_reading_rest_half,
  "dotted quarter": m.music_lessons_reading_rest_dotted_quarter,
  quarter: m.music_lessons_reading_rest_quarter,
  eighth: m.music_lessons_reading_rest_eighth,
  "dotted eighth": m.music_lessons_reading_rest_dotted_eighth,
  sixteenth: m.music_lessons_reading_rest_sixteenth,
  "dotted sixteenth": m.music_lessons_reading_rest_dotted_sixteenth,
  "thirty-second": m.music_lessons_reading_rest_thirty_second,
};
function restsLesson(clef: Clef): Lesson {
  const pitch = staffNote(clef, 4);
  /** The note, then its rest. */
  const pair = (beats: number) =>
    staff(clef, [
      { midi: pitch, beats },
      { midi: null, beats },
    ]);
  const SCREENS = [
    {
      title: m.music_lessons_reading_rests_long_title(),
      text: m.music_lessons_reading_rests_long_text(),
    },
    {
      title: m.music_lessons_reading_rests_shorter_title(),
      text: m.music_lessons_reading_rests_shorter_text(),
    },
    {
      title: m.music_lessons_reading_rests_shortest_title(),
      text: m.music_lessons_reading_rests_shortest_text(),
    },
  ];
  return {
    id: "reading.values.rests",
    title: m.music_lessons_reading_rests_title(),
    screens: REST_VALUES.map((group, i) => ({
      ...SCREENS[i],
      figure: pair(group[0].beats),
      steps: group.map((r) => ({
        text: REST_TEXT[r.name](),
        figure: pair(r.beats),
      })),
    })),
  };
}

// ---------------------------------------------------------------------------
// Rhythm: echo and dictation

/** Where cells put their notes (as written), in beats, one after another. */
export function cellOnsets(cells: RhythmCell[]): { onsets: number[]; beats: number } {
  let at = 0;
  const onsets: number[] = [];
  for (const c of cells) {
    const cell = RHYTHM_CELLS[c];
    for (const o of cell.written ?? cell.onsets) onsets.push(at + o);
    at += cell.beats;
  }
  return { onsets, beats: at };
}
/** A bar as it is said: "1 e & a 2 e & a". */
const allCounts = (perBeat: PerBeat, beatsPerBar: number) =>
  Array.from({ length: perBeat * beatsPerBar }, (_, i) =>
    countName(i / perBeat, perBeat, beatsPerBar)
      .split(" ")
      .at(-1)!,
  );
const countLine = (names: string[]) => names.join(" ");

const tick = (onsets: number[], spacing: number): LessonSound => ({
  notes: onsets.map((b) => ({
    midi: [42],
    at: b * spacing,
    dur: 0.1,
    drum: true,
    velocity: Number.isInteger(b) ? 0.8 : 0.5,
  })),
});

/** A click on each beat (the side stick the rhythm drill taps with), `bars` bars of `beatsPerBar`. */
const click = (beatsPerBar: number, spacing: number): LessonSound["notes"] =>
  Array.from({ length: beatsPerBar }, (_, b) => ({
    midi: [37],
    at: b * spacing,
    dur: 0.1,
    drum: true,
    velocity: b === 0 ? 0.8 : 0.5,
  }));

interface Group {
  perBeat: PerBeat;
  beatsPerBar: 2 | 4;
  /** The example's cells, from the drill's cell list. */
  cells: RhythmCell[];
}
const GROUPS: Record<"eighths" | "sixteenths" | "compound", Group> = {
  eighths: { perBeat: 2, beatsPerBar: 4, cells: ["quarter", "eighths", "eighths", "quarter"] },
  sixteenths: {
    perBeat: 4,
    beatsPerBar: 4,
    cells: ["quarter", "sixteenths", "eighths", "quarter"],
  },
  compound: { perBeat: 3, beatsPerBar: 2, cells: ["quarter", "triplet"] },
};
const groupOf = (levelId: string) => {
  const p = (EAR_RHYTHM_LEVELS.find((l) => l.id === levelId) ?? EAR_RHYTHM_LEVELS[0]).perBeat;
  return p === 3 ? "compound" : p === 4 ? "sixteenths" : "eighths";
};

function countingLesson(g: keyof typeof GROUPS, echo = false): Lesson {
  const { perBeat, beatsPerBar, cells } = GROUPS[g];
  const names = allCounts(perBeat, beatsPerBar);
  const every = Array.from({ length: perBeat * beatsPerBar }, (_, i) => i / perBeat);
  const ex = cellOnsets(cells);
  const exNames = ex.onsets.map((b) => countName(b, perBeat, beatsPerBar));
  const spacing = 60 / 90;
  const fig = (onsets: number[]): LessonFigure => ({
    kind: "rhythm",
    bars: 1,
    perBeat,
    beatsPerBar,
    onsets,
  });
  const intro: Record<typeof g, { id: string; title: string; text: string; ex: string }> = {
    eighths: {
      id: "rhythm.counting",
      title: m.music_lessons_reading_count_eighths_title(),
      text: m.music_lessons_reading_count_eighths_text({ counts: countLine(names) }),
      ex: m.music_lessons_reading_count_eighths_ex(),
    },
    sixteenths: {
      id: "rhythm.counting.sixteenths",
      title: m.music_lessons_reading_count_sixteenths_title(),
      text: m.music_lessons_reading_count_sixteenths_text({ counts: countLine(names) }),
      ex: m.music_lessons_reading_count_sixteenths_ex(),
    },
    compound: {
      id: "rhythm.counting.compound",
      title: m.music_lessons_reading_count_compound_title(),
      text: m.music_lessons_reading_count_compound_text({ counts: countLine(names) }),
      ex: m.music_lessons_reading_count_compound_ex(),
    },
  };
  const t = intro[g];
  const both: LessonSound = {
    notes: [...click(beatsPerBar, spacing), ...tick(ex.onsets, spacing).notes],
  };
  return {
    id: t.id,
    title: t.title,
    screens: [
      {
        title: t.title,
        text: t.text,
        figure: fig(every),
        sound: { notes: click(beatsPerBar, spacing) },
      },
      {
        title: m.music_lessons_reading_one_bar_title(),
        text: `${t.ex} ${m.music_lessons_reading_notes_fall_on({ names: exNames.join(", ") })}`,
        figure: fig(ex.onsets),
        sound: tick(ex.onsets, spacing),
      },
      echo
        ? {
            // The echo shown before the first try: a bar heard, then the same bar tapped back on the grid.
            title: m.music_lessons_reading_echo_title(),
            text: m.music_lessons_reading_echo_text(),
            figure: fig([]),
            sound: both,
            steps: [
              { text: m.music_lessons_reading_echo_listen(), figure: fig([]), sound: both },
              {
                text: m.music_lessons_reading_echo_your_turn({ names: exNames.join(", ") }),
                figure: fig(ex.onsets),
                sound: both,
              },
            ],
          }
        : {
            title: m.music_lessons_reading_listen_title(),
            text: m.music_lessons_reading_listen_text(),
            figure: fig(ex.onsets),
            sound: both,
          },
    ],
  };
}

function gridLesson(g: keyof typeof GROUPS): Lesson {
  const { perBeat, beatsPerBar, cells } = GROUPS[g];
  const ex = cellOnsets(cells);
  const exNames = ex.onsets.map((b) => countName(b, perBeat, beatsPerBar));
  const spacing = 60 / 90;
  const fig = (onsets: number[]): LessonFigure => ({
    kind: "rhythm",
    bars: 1,
    perBeat,
    beatsPerBar,
    onsets,
  });
  const id = g === "eighths" ? "rhythm.grid" : `rhythm.grid.${g}`;
  return {
    id,
    title: m.music_lessons_reading_grid_title(),
    screens: [
      {
        title: m.music_lessons_reading_grid_count_title(),
        text: m.music_lessons_reading_grid_count_text({ subs: SUBS[perBeat].join(", ") }),
        figure: fig([]),
      },
      {
        title: m.music_lessons_reading_grid_ear_title(),
        text: m.music_lessons_reading_grid_ear_text({ names: exNames.join(", ") }),
        figure: fig(ex.onsets),
        sound: tick(ex.onsets, spacing),
      },
      {
        title: m.music_lessons_reading_grid_rests_title(),
        text: m.music_lessons_reading_grid_rests_text(),
        figure: fig(ex.onsets),
      },
    ],
  };
}

const ex = (g: keyof typeof GROUPS, cells: RhythmCell[]) => {
  const { perBeat, beatsPerBar } = GROUPS[g];
  const { onsets } = cellOnsets(cells);
  const names = onsets.map((b) => countName(b, perBeat, beatsPerBar));
  const fig: LessonFigure = { kind: "rhythm", bars: 1, perBeat, beatsPerBar, onsets };
  return { names: names.join(", "), fig, sound: tick(onsets, 60 / 90) };
};

/** The cells a level adds that need their own explaining, in the order they are met. */
function cellItems(g: keyof typeof GROUPS, cells: readonly string[]): Lesson[] {
  const has = (c: string) => cells.includes(c);
  const out: Lesson[] = [];
  const card = (id: string, title: string, text: string, extra: Partial<LessonScreen> = {}) =>
    out.push({ id: `rhythm.${id}`, title, screens: [{ title, text, ...extra }] });
  if (has("rest") || has("half")) {
    const e = ex(g, g === "compound" ? ["half"] : ["quarter", "rest", "half"]);
    card(
      "rests-halves",
      m.music_lessons_reading_cell_rests_title(),
      (g === "compound"
        ? m.music_lessons_reading_cell_rests_text_compound
        : m.music_lessons_reading_cell_rests_text_simple)({ names: e.names }),
      { figure: e.fig, sound: e.sound },
    );
  }
  if (has("dotted-quarter")) {
    const e = ex(g, ["dotted-quarter", "half"]);
    card(
      "dotted-quarter",
      m.music_lessons_reading_cell_dotted_quarter_title(),
      m.music_lessons_reading_cell_dotted_quarter_text({ names: e.names }),
      { figure: e.fig, sound: e.sound },
    );
  }
  if (has("syncopation")) {
    const e = ex(g, ["syncopation", "rest", "quarter"]);
    card(
      "syncopation",
      m.music_lessons_reading_item_syncopation_title(),
      m.music_lessons_reading_cell_syncopation_text({ names: e.names }),
      { figure: e.fig, sound: e.sound },
    );
  }
  if (has("dotted-eighth")) {
    const e = ex(g, ["dotted-eighth", "quarter", "half"]);
    card(
      "dotted-eighth",
      m.music_lessons_reading_cell_dotted_eighth_title(),
      m.music_lessons_reading_cell_dotted_eighth_text({ names: e.names }),
      { figure: e.fig, sound: e.sound },
    );
  }
  if (has("triplet") && g !== "compound")
    card(
      "triplets",
      m.music_lessons_reading_item_triplets_title(),
      m.music_lessons_reading_cell_triplets_text(),
      {
        // Written as a triplet: the drill's grid has no place for them.
        figure: staff(
          "treble",
          [1 / 3, 1 / 3, 1 / 3, 1].map((beats) => ({ midi: staffNote("treble", 4), beats })),
          { meter: { beats: 2, beatUnit: 4 } },
        ),
        sound: tick([0, 1 / 3, 2 / 3], 60 / 90),
      },
    );
  if (has("swing")) {
    const e = ex(g, ["eighths", "eighths", "eighths", "eighths"]);
    card(
      "swing",
      m.music_lessons_reading_cell_swing_title(),
      m.music_lessons_reading_cell_swing_text(),
      {
        // Written straight on the grid; the sound plays them swung.
        figure: e.fig,
        sound: tick([0, 2 / 3, 1, 1 + 2 / 3, 2, 2 + 2 / 3], 60 / 90),
      },
    );
  }
  return out;
}

export function rhythmLessons(
  mode: "echo" | "dictation",
  levelId = EAR_RHYTHM_LEVELS[0].id,
): Lesson[] {
  const level = EAR_RHYTHM_LEVELS.find((l) => l.id === levelId) ?? EAR_RHYTHM_LEVELS[0];
  const g = groupOf(level.id);
  // Dictation leaves out the cells its grid cannot write (triplets on a sixteenth grid).
  const onGrid = (c: string) =>
    (RHYTHM_CELLS[c].written ?? RHYTHM_CELLS[c].onsets).every(
      (o) => Math.abs(o * level.perBeat - Math.round(o * level.perBeat)) < 1e-6,
    );
  const cells = level.cells.filter((c) => mode === "echo" || onGrid(c));
  return [
    ...(g === "sixteenths" ? [countingLesson("eighths")] : []),
    countingLesson(g, mode === "echo"),
    ...(mode === "dictation" ? [gridLesson(g)] : []),
    ...cellItems(g, cells),
  ];
}

// ---------------------------------------------------------------------------
// Listening: the mixing-ear drills

export interface ListeningSetup {
  material: StudioMaterial;
  bands: BandSet;
  gainDb: number;
  levels: number[];
  pans: "3" | "5";
  delays: "3" | "4";
}
const DEFAULT_SETUP: ListeningSetup = {
  material: "noise",
  bands: "3",
  gainDb: 12,
  levels: [6, 3],
  pans: "3",
  delays: "3",
};

/** What a band sounds like, in a few words true of every boost or cut there. */
const bandWord = (hz: number) =>
  hz <= 125
    ? m.music_lessons_reading_eq_word_weight()
    : hz <= 500
      ? m.music_lessons_reading_eq_word_body()
      : hz <= 2000
        ? m.music_lessons_reading_eq_word_presence()
        : hz <= 8000
          ? m.music_lessons_reading_eq_word_bite()
          : m.music_lessons_reading_eq_word_air();

/** A label mid-sentence: "Dotted 1/8, 500 ms" becomes "dotted 1/8, 500 ms". */
const lowerFirst = (label: string) => label.charAt(0).toLocaleLowerCase() + label.slice(1);

/**
 * The intro for a mixing-ear drill, then one card for each item its current set uses (a band, a gain,
 * a level step, a pan position or an echo time), so a bigger set teaches only what is new.
 */
export function listeningLessons(drill: string, setup: Partial<ListeningSetup> = {}): Lesson[] {
  const s = { ...DEFAULT_SETUP, ...setup };
  const hear = (label: string, change: StudioChange, matched = false) => ({
    label,
    sound: {
      notes: [],
      effect: { material: s.material, change, ...(matched ? { matched } : {}) },
    } as LessonSound,
  });
  const flat = hear(m.music_lessons_reading_eq_flat(), {});
  const g = s.gainDb;
  /** The EQ drawn: one bell at `band`, or a flat line at 0 dB. */
  const eqFig = (band: number, gainDb: number): LessonFigure => ({ kind: "eq", band, gainDb });
  // Flat draws a flat curve, so stepping back to it clears the bell the last band drew.
  const eqFlat = { ...flat, figure: eqFig(1000, 0) };
  const bands = [...BAND_SETS[drill === "boost-or-cut" ? "5" : s.bands]];
  const eqOption = (freq: number, gainDb: number, matched = false) => ({
    ...hear(
      (gainDb > 0 ? m.music_lessons_reading_eq_band_boosted : m.music_lessons_reading_eq_band_cut)({
        band: bandLabel(freq),
      }),
      { eq: { freq, gainDb, q: 1.41 } },
      matched,
    ),
    figure: eqFig(freq, gainDb),
  });
  const lesson = (id: string, title: string, screens: LessonScreen[]): Lesson => ({
    id,
    title,
    screens,
  });
  const card = (
    id: string,
    title: string,
    text: string,
    options: LessonScreen["options"],
    figure?: LessonFigure,
  ): Lesson =>
    lesson(`listening.${drill}.${id}`, title, [
      { title, text, options, ...(figure ? { figure } : {}) },
    ]);
  const intro = (title: string, text: string, tip: string, figure?: LessonFigure) =>
    lesson(`listening.${drill}`, title, [
      { title: m.music_lessons_reading_eq_intro_title(), text, ...(figure ? { figure } : {}) },
      { title: m.music_lessons_reading_eq_listen_for_title(), text: tip },
    ]);
  switch (drill as StudioExercise) {
    case "peak":
    case "cut": {
      const peak = drill === "peak";
      const sign = peak ? 1 : -1;
      return [
        peak
          ? intro(
              m.music_lessons_reading_eq_peak_title(),
              m.music_lessons_reading_eq_peak_text(),
              m.music_lessons_reading_eq_peak_tip(),
              eqFig(1000, g),
            )
          : intro(
              m.music_lessons_reading_eq_cut_title(),
              m.music_lessons_reading_eq_cut_text(),
              m.music_lessons_reading_eq_cut_tip(),
              eqFig(1000, -g),
            ),
        card(
          `gain.${g}`,
          (peak
            ? m.music_lessons_reading_eq_gain_title_boost
            : m.music_lessons_reading_eq_gain_title_cut)({ db: g }),
          (peak
            ? m.music_lessons_reading_eq_gain_text_boost
            : m.music_lessons_reading_eq_gain_text_cut)({ db: g }),
          [eqFlat, eqOption(1000, sign * g)],
          eqFig(1000, sign * g),
        ),
        ...bands.map((hz) =>
          card(
            `band.${hz}`,
            `${bandLabel(hz)}`,
            (peak
              ? m.music_lessons_reading_eq_band_text_boost
              : m.music_lessons_reading_eq_band_text_cut)({
              band: bandLabel(hz),
              db: g,
              what: bandWord(hz),
            }),
            [eqFlat, eqOption(hz, sign * g)],
            eqFig(hz, sign * g),
          ),
        ),
      ];
    }
    case "boost-or-cut":
      return [
        lesson("listening.boost-or-cut", m.music_lessons_reading_boc_title(), [
          {
            title: m.music_lessons_reading_eq_intro_title(),
            text: m.music_lessons_reading_boc_intro_text(),
            figure: eqFig(1000, g),
          },
          {
            title: m.music_lessons_reading_boc_boosts_title(),
            text: m.music_lessons_reading_boc_boosts_text({ db: g }),
            options: [eqFlat, ...bands.map((hz) => eqOption(hz, g, true))],
          },
          {
            title: m.music_lessons_reading_boc_cuts_title(),
            text: m.music_lessons_reading_boc_cuts_text({ db: g }),
            options: [eqFlat, ...bands.map((hz) => eqOption(hz, -g, true))],
          },
        ]),
        card(
          `gain.${g}`,
          m.music_lessons_reading_boc_gain_title({ db: g }),
          m.music_lessons_reading_boc_gain_text({ db: g }),
          [eqFlat, eqOption(1000, g, true), eqOption(1000, -g, true)],
        ),
      ];
    case "level": {
      return [
        intro(
          m.music_lessons_reading_level_title(),
          m.music_lessons_reading_level_text(),
          m.music_lessons_reading_level_tip(),
        ),
        ...s.levels.map((db) =>
          card(
            `${db}`,
            m.music_lessons_reading_level_louder({ db }),
            m.music_lessons_reading_level_card_text({ db }),
            [flat, hear(m.music_lessons_reading_level_louder({ db }), { levelDb: db })],
          ),
        ),
      ];
    }
    case "pan":
      return [
        intro(
          m.music_lessons_reading_pan_title(),
          m.music_lessons_reading_pan_text(),
          m.music_lessons_reading_pan_tip(),
        ),
        ...PAN_SETS[s.pans].map((p) =>
          card(`${p}`, panLabel(p), m.music_lessons_reading_pan_card_text({ pos: panLabel(p) }), [
            flat,
            hear(panLabel(p), { pan: p }),
          ]),
        ),
      ];
    case "compression":
      return [
        lesson("listening.compression", m.music_lessons_reading_comp_title(), [
          {
            title: m.music_lessons_reading_eq_intro_title(),
            text: m.music_lessons_reading_comp_intro_text(),
          },
          {
            title: m.music_lessons_reading_comp_hear_title(),
            text: m.music_lessons_reading_comp_hear_text({
              light: compLabel("light"),
              heavy: compLabel("heavy"),
            }),
            options: [
              flat,
              hear(compLabel("light"), { comp: "light" }, true),
              hear(compLabel("heavy"), { comp: "heavy" }, true),
            ],
          },
          {
            title: m.music_lessons_reading_eq_listen_for_title(),
            text: m.music_lessons_reading_comp_tip(),
          },
        ]),
      ];
    case "delay":
      return [
        intro(
          m.music_lessons_reading_delay_title(),
          m.music_lessons_reading_delay_text({ bpm: LOOP_BPM }),
          m.music_lessons_reading_delay_tip(),
        ),
        ...DELAY_SETS[s.delays].map((ms) =>
          card(
            `${Math.round(ms)}`,
            delayLabel(ms),
            m.music_lessons_reading_delay_card_text({ delay: lowerFirst(delayLabel(ms)) }),
            [flat, hear(delayLabel(ms), { delayMs: ms })],
          ),
        ),
      ];
  }
  return [];
}
