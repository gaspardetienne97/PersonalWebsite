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
import { SUBS, countName, type PerBeat } from "./count";
import { keys } from "./tier1";
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
const letters = (ms: number[]) => ms.map(letter).join(" ");
/** "F#" as it is said: "F sharp". */
const say = (n: string) => (n.length > 1 ? `${n[0]} ${n[1] === "#" ? "sharp" : "flat"}` : n);

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;

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

const MNEMONIC: Record<Clef, { lines: string; spaces: string }> = {
  treble: { lines: "Every Good Boy Does Fine", spaces: "They spell the word FACE" },
  bass: { lines: "Good Boys Do Fine Always", spaces: "All Cows Eat Grass" },
};
/** The first letters of a phrase, spaced: "Every Good Boy" is "E G B". */
export const initials = (phrase: string) =>
  phrase
    .replace(/^They spell the word /, "")
    .split(/\s+/)
    .flatMap((w) => (w === w.toUpperCase() && w.length > 1 ? [...w] : [w[0]]))
    .join(" ");

function linesSpaces(clef: Clef): Lesson {
  const Name = clef === "treble" ? "Treble" : "Bass";
  const lines = staffLines(clef);
  const spaces = staffSpaces(clef);
  const landmark = clef === "treble" ? staffNote(clef, 2) : staffNote(clef, 6);
  const below = staffNote(clef, -2);
  const above = staffNote(clef, 10);
  const other = clef === "treble" ? above : below;
  return {
    id: `reading.lines-spaces.${clef}`,
    title: `${Name} clef: lines and spaces`,
    screens: [
      {
        title: "Five lines",
        text: `A staff has five lines, counted from the bottom. In the ${clef} clef they are ${letters(lines)}. ${MNEMONIC[clef].lines} gives you the order.`,
        figure: quarters(clef, lines),
        sound: run(lines),
      },
      {
        title: "Four spaces",
        text: `The four spaces between the lines, from the bottom, are ${letters(spaces)} in the ${clef} clef. ${MNEMONIC[clef].spaces}.`,
        figure: quarters(clef, spaces),
        sound: run(spaces),
      },
      {
        title: `A landmark: ${letter(landmark)}`,
        text:
          clef === "treble"
            ? `The treble clef curls around the second line, so that line is ${letter(landmark)}. Count up or down from it to find any other note.`
            : `The two dots of the bass clef sit either side of the fourth line, so that line is ${letter(landmark)}. Count up or down from it to find any other note.`,
        figure: quarters(clef, [landmark]),
        sound: run([landmark]),
      },
      {
        title: "Ledger lines",
        text: `A note too high or too low for the five lines sits on short extra lines called ledger lines. Middle C is on the first ledger line ${clef === "treble" ? "below" : "above"} the ${clef} staff, and ${letter(other)} is on the first one ${clef === "treble" ? "above" : "below"}. The figure shows two notes on ledger lines on each side.`,
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
    title: "Sharps, flats and naturals",
    screens: [
      {
        title: "Sharp: up a half step",
        text: `A sharp sign raises a note by a half step, the next key up on the piano. Here ${letter(60)} is followed by ${say(letter(61))}, in C major.`,
        figure: quarters("treble", [60, 61], 0),
        sound: run([60, 61]),
      },
      {
        title: "Flat: down a half step",
        text: `A flat sign lowers a note by a half step, the next key down. Here ${letter(62)} is followed by ${say(flat(61))}, in F major.`,
        figure: quarters("treble", [62, 61], -1),
        sound: run([62, 61]),
      },
      {
        title: "Natural: back to plain",
        text: `In F major every B is played as ${say(flat(70))}, so the first B has no sign. A natural sign cancels that flat for the note it sits beside, and the second note is a plain ${letter(71)}.`,
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

function stackedLesson(kind: "chord" | "satb"): Lesson {
  return {
    id: `reading.stacked.${kind === "chord" ? "triad" : "satb"}`,
    title: kind === "chord" ? "Reading a triad" : "Reading four notes",
    screens: [
      kind === "chord"
        ? {
            title: "Three notes stacked",
            text: "A triad is three notes stacked in thirds, so they sit on three lines in a row or three spaces in a row. Name it by its three notes from the bottom, like C-E-G.",
            figure: keys({ 60: "C", 64: "E", 67: "G" }),
          }
        : {
            title: "Four notes, one triad",
            text: "Four notes are stacked across the grand staff, and the lowest is the root of the chord. The root is doubled above it. Name the triad by its three notes from the root up, like C-E-G, with the doubled note once.",
            figure: keys({ 48: "C", 55: "G", 64: "E", 72: "C" }),
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
    { name: "whole", beats: 4, text: "A whole note lasts 4 beats, so one fills the bar." },
    { name: "half", beats: 2, text: "A half note lasts 2 beats, so two fill the bar." },
    { name: "quarter", beats: 1, text: "A quarter note lasts 1 beat, so four fill the bar." },
    {
      name: "eighth",
      beats: 0.5,
      text: "An eighth note lasts half a beat, so eight fill the bar. Counted 1 & 2 & 3 & 4 &, two fit in each beat.",
    },
  ];
  const steps: LessonStep[] = VALUES.map((v) => ({
    text: v.text,
    figure: bar(v.beats),
    sound: hear(v.beats),
  }));
  return {
    id: "reading.values",
    title: "Note values and counting",
    screens: [
      {
        title: "How long a note lasts",
        text: "In 4/4 a bar has 4 beats, counted 1 2 3 4. Tap Next to see how long each note value lasts.",
        figure: bar(4),
        steps,
      },
      {
        title: "The time signature",
        text: "The top number of a time signature says how many notes of one length fit in a bar, and the bottom number names that length. 4/4 holds four quarter notes, 3/4 three, and 6/8 six eighth notes. This bar is 3/4, counted 1 2 3.",
        figure: staff(
          clef,
          [1, 1, 1].map((beats) => ({ midi: pitch, beats })),
          { meter: { beats: 3, beatUnit: 4 } },
        ),
        sound: { notes: [0, 1, 2].map((i) => ({ midi: [pitch], at: i * BEAT, dur: BEAT * 0.9 })) },
      },
      {
        title: "Dots and rests",
        text: "A dot adds half the note's length. In this bar the dotted half note lasts 3 beats, and the quarter rest is the last beat of silence.",
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
  const word = sharp ? "sharp" : "flat";
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
      title: "The key signature",
      screens: [
        {
          title: "Signs at the start of the staff",
          text: "The sharps or flats right after the clef are the key signature. They hold for every bar, so no sign is written beside each note.",
          figure: sig(),
        },
      ],
    },
    {
      id: `reading.key-signature.${fifths}`,
      title: `${plural(n, word)} in the signature`,
      screens: [
        {
          title: `This key has ${plural(n, word)}`,
          text:
            n === 1
              ? `Tap Next to add the ${word}.`
              : `Tap Next to add the ${plural(n, word)} one at a time, in the order they are written.`,
          figure: sig(0),
          steps: order.map((l, i) => ({
            text: `${l} ${word}: every ${l}, in every octave, is played a half step ${sharp ? "higher" : "lower"}.`,
            figure: sig(i + 1),
          })),
        },
        ...clefs.map((c) => ({
          title: clefs.length > 1 ? `On the ${c} staff` : "On the staff",
          text: `With this key signature the note shown is ${last} ${word}, though no sign is written beside it. Every ${last} in the piece is played the same way, unless a sign beside a note says otherwise.`,
          figure: staff(c, [{ midi: onStaff(c, last), beats: 1 }], { fifths }),
          sound: run([onStaff(c, last)]),
        })),
      ],
    },
  ];
}

const VALUE_METERS: Partial<Record<ReadingMeter, string>> = {
  compound:
    "In 6/8 the beat is a dotted quarter, so a bar has two beats of three eighth notes, counted 1 & a 2 & a.",
  "3/8": "3/8 has three eighth notes in a bar, counted 1 2 3.",
  "9/8": "9/8 has nine eighth notes in a bar, in three beats of three, counted 1 & a 2 & a 3 & a.",
  "2/2":
    "2/2 has two half-note beats in a bar, so a half note is one beat and a quarter note is half a beat.",
  "5/4": "5/4 has five quarter notes in a bar, grouped as three and two or as two and three.",
  "7/8": "7/8 has seven eighth notes in a bar, grouped in twos and threes.",
  "5/8": "5/8 has five eighth notes in a bar, grouped as two and three or as three and two.",
};
const CHECK_METER = "Check the time signature before you start, and at every bar where it changes.";
/** One bar of the meter, a note on every count of its bottom number (beats in quarters). */
export function meterBar(m: ReadingMeter): LessonFigure {
  const { beats, beatUnit } = READING_METERS[m];
  return staff(
    "treble",
    Array.from({ length: beats }, () => ({ midi: staffNote("treble", 4), beats: 4 / beatUnit })),
    { meter: { beats, beatUnit } },
  );
}
function meterLesson(m: ReadingMeter): Lesson {
  const label = READING_METERS[m].label;
  return {
    id: `reading.meter.${m.replace("/", "-")}`,
    title: `${label} time`,
    screens: [
      {
        title: `Counting ${label}`,
        text: `${VALUE_METERS[m]} ${CHECK_METER}`,
        figure: meterBar(m),
      },
    ],
  };
}
/** The meters a changing-meter phrase of the chosen length goes through, in order. */
function changingMeterLesson(parts: ReadingMeter[]): Lesson {
  const labels = parts.map((m) => READING_METERS[m].label);
  return {
    id: "reading.meter.changing",
    title: "Changing meters",
    screens: [
      {
        title: "The meter changes",
        text: `The time signature changes every 2 bars, through ${labels.slice(0, -1).join(", ")} and ${labels.at(-1)} in turn. ${CHECK_METER}`,
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
const BASS_CHORDS: ItemText = {
  title: "Chords in the left hand",
  text: "On some strong beats the left hand plays the melody note with one or two lower notes. Play them together.",
  figure: keys({ 43: "G", 48: "C" }),
};
const ITEM_TEXT: Record<string, ItemText> = {
  ties: {
    title: "Ties",
    text: "A tie is a curved line joining two notes of the same pitch. Play the first, hold through the second, and don't play it again.",
    // The middle half note crosses the bar line, so it is written as two tied quarters.
    bar: { beats: 2, notes: [1, 2, 1] },
  },
  "dotted-quarter": {
    title: "Dotted quarter notes",
    text: "A dotted quarter note is a quarter note plus an eighth note, so it's as long as three eighth notes. A dot always adds half of the note's own length.",
    bar: { beats: 2, notes: [1.5, 0.5] },
  },
  syncopation: {
    title: "Syncopation",
    text: "In syncopation a long note starts halfway between two quarter-note pulses and is held across the next pulse. Nothing new starts in that line on that pulse, so keep counting through the held note.",
    bar: { beats: 2, notes: [0.5, 1, 0.5] },
  },
  sixteenths: {
    title: "Sixteenth notes",
    text: "Four sixteenth notes make one quarter note, and two make an eighth note. Sixteenths are written with two beams or two flags.",
    bar: { beats: 1, notes: [0.25, 0.25, 0.25, 0.25] },
  },
  "dotted-eighth": {
    title: "Dotted eighth and sixteenth",
    text: "A dotted eighth note is an eighth note plus a sixteenth note. A dotted eighth and a sixteenth together are as long as a quarter note.",
    bar: { beats: 1, notes: [0.75, 0.25] },
  },
  triplets: {
    title: "Triplets",
    text: "A triplet puts three even notes in the time of two of the same kind. Three eighth note triplets take the time of one quarter note.",
    bar: { beats: 2, notes: [1 / 3, 1 / 3, 1 / 3, 1] },
  },
  pickup: {
    title: "Pickup bar",
    text: "Some phrases open with a pickup: the first bar opens with rests, and only its last note is played. Count the rests silently and come in on that note.",
    bar: { beats: 4, notes: [-3, 1] },
  },
  chords: {
    title: "Chords in the right hand",
    text: "On some strong beats the right hand plays the melody note with one or two lower notes. Play them together.",
    figure: keys({ 67: "G", 72: "C", 76: "E" }),
  },
  "clef-change": {
    title: "Clef changes",
    text: "For a bar or two the left hand may read in the treble clef. A small clef sign on the staff marks the change, and a bass clef sign marks the return.",
    // Notes around middle C as the left hand reads them in the treble clef.
    figure: quarters("treble", [60, 62, 64, 65]),
  },
  swing: {
    title: "Swing",
    text: "Swing eighths are written straight but played long and short, about two to one. Lean on the first of each pair.",
    bar: { beats: 2, notes: [0.5, 0.5, 0.5, 0.5] },
  },
};
function valueItemLesson(id: string, clef: Clef): Lesson {
  const t = id === "chords" && clef === "bass" ? BASS_CHORDS : ITEM_TEXT[id];
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
/** "an eighth", "a half". */
const an = (name: string, a: "A" | "a") => `${/^[aeiou]/.test(name) ? `${a}n` : a} ${name}`;
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
      title: "Long rests",
      text: "A rest is a silence as long as the note it's named after. The whole rest hangs below a line and the half rest sits on top of one. Tap Next to see each rest after its note.",
    },
    {
      title: "Shorter rests",
      text: "A dot after a rest adds half its length, as it does after a note. Tap Next to see each one.",
    },
    {
      title: "The shortest rests",
      text: "More flags make a shorter rest. Tap Next to see each one.",
    },
  ];
  return {
    id: "reading.values.rests",
    title: "Rests",
    screens: REST_VALUES.map((group, i) => ({
      ...SCREENS[i],
      figure: pair(group[0].beats),
      steps: group.map((r) => ({
        text: `${an(r.name, "A")} rest is silent as long as ${an(r.name, "a")} note, ${r.length}.`,
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
      title: "Counting the beat",
      text: `Count 1 2 3 4 with the click, one number on each click. Between two numbers sits an &, the second half of the beat, so a bar is counted ${countLine(names)}.`,
      ex: "A note on a number starts on the beat, and a note on an & starts in the second half of it.",
    },
    sixteenths: {
      id: "rhythm.counting.sixteenths",
      title: "Counting sixteenths",
      text: `Sixteenth notes split each beat in four, counted with e, & and a after the number. A bar is counted ${countLine(names)}.`,
      ex: "Each beat has four places to put a note, and the number comes first.",
    },
    compound: {
      id: "rhythm.counting.compound",
      title: "Counting 6/8",
      text: `In 6/8 the beat is a dotted quarter, so a bar has two beats. Each beat splits in three, so a bar is counted ${countLine(names)}.`,
      ex: "A note on a number starts on the beat, and the & and the a are the two places after it.",
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
        title: "One bar of notes",
        text: `${t.ex} In this bar the notes fall on ${exNames.join(", ")}.`,
        figure: fig(ex.onsets),
        sound: tick(ex.onsets, spacing),
      },
      echo
        ? {
            // The echo shown before the first try: a bar heard, then the same bar tapped back on the grid.
            title: "Hear it, then tap it back",
            text: "One bar plays over the click, then you tap the same rhythm on the next bar. Tap Next to see it.",
            figure: fig([]),
            sound: both,
            steps: [
              { text: "Listen and count: the bar plays once.", figure: fig([]), sound: both },
              {
                text: `Your turn: tap on ${exNames.join(", ")}. Each tap lands on its count.`,
                figure: fig(ex.onsets),
                sound: both,
              },
            ],
          }
        : {
            title: "Count while you listen",
            text: "Count the beats out loud while the rhythm plays over the click. Notice which counts get a note, and which stay silent.",
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
    title: "Writing a rhythm on the grid",
    screens: [
      {
        title: "The grid is the count",
        text: `Each column is one count, with the number on the beat and ${SUBS[perBeat].join(", ")} after it. You mark a cell where a note starts.`,
        figure: fig([]),
      },
      {
        title: "From the ear to the grid",
        text: `Say the count as the rhythm plays, and mark the cell for every note you hear. These notes fall on ${exNames.join(", ")}.`,
        figure: fig(ex.onsets),
        sound: tick(ex.onsets, spacing),
      },
      {
        title: "Rests and held notes",
        text: "Mark only where a note starts. A rest, or the rest of a held note, leaves its cells empty.",
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
      "Rests and half notes",
      `A rest is a silent beat, and ${g === "compound" ? "a dotted half note is held through both beats of the bar" : "a half note is held through two beats"}. ${g === "compound" ? `In this bar one note starts on ${e.names} and is held to the end.` : `In this bar a note starts on ${e.names}.`}`,
      { figure: e.fig, sound: e.sound },
    );
  }
  if (has("dotted-quarter")) {
    const e = ex(g, ["dotted-quarter", "half"]);
    card(
      "dotted-quarter",
      "Dotted quarters",
      `A dotted quarter note lasts one and a half beats, so the next note falls on an &. In this bar notes start on ${e.names}.`,
      { figure: e.fig, sound: e.sound },
    );
  }
  if (has("syncopation")) {
    const e = ex(g, ["syncopation", "rest", "quarter"]);
    card(
      "syncopation",
      "Syncopation",
      `Syncopation puts a note on an & and holds it over the next number, so that number has no note starting on it. In this bar notes start on ${e.names}.`,
      { figure: e.fig, sound: e.sound },
    );
  }
  if (has("dotted-eighth")) {
    const e = ex(g, ["dotted-eighth", "quarter", "half"]);
    card(
      "dotted-eighth",
      "Dotted eighths",
      `A dotted eighth note lasts three sixteenths, so the note after it falls on the a of the same beat. In this bar notes start on ${e.names}.`,
      { figure: e.fig, sound: e.sound },
    );
  }
  if (has("triplet") && g !== "compound")
    card(
      "triplets",
      "Triplets",
      "A triplet fits three even notes into one beat. They fall between the counts of the e, & and a grid, so tap them evenly across the beat.",
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
      "Swung eighths",
      "Swung eighths are played long and short, about two to one, but counted and written as straight eighths 1 &. The second note of each pair comes late.",
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
    ? "the weight and rumble"
    : hz <= 500
      ? "the body and warmth"
      : hz <= 2000
        ? "the presence in the middle"
        : hz <= 8000
          ? "the bite and brightness"
          : "the air and sparkle";

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
  const flat = hear("Flat", {});
  const g = s.gainDb;
  /** The EQ drawn: one bell at `band`, or a flat line at 0 dB. */
  const eqFig = (band: number, gainDb: number): LessonFigure => ({ kind: "eq", band, gainDb });
  // Flat draws a flat curve, so stepping back to it clears the bell the last band drew.
  const eqFlat = { ...flat, figure: eqFig(1000, 0) };
  const bands = [...BAND_SETS[drill === "boost-or-cut" ? "5" : s.bands]];
  const eqOption = (freq: number, gainDb: number, matched = false) => ({
    ...hear(
      `${bandLabel(freq)} ${gainDb > 0 ? "boosted" : "cut"}`,
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
      { title: "Flat, then Changed", text, ...(figure ? { figure } : {}) },
      { title: "What to listen for", text: tip },
    ]);
  switch (drill as StudioExercise) {
    case "peak":
    case "cut": {
      const sign = drill === "peak" ? 1 : -1;
      const verb = drill === "peak" ? "boosted" : "cut";
      return [
        drill === "peak"
          ? intro(
              "Hearing a boosted band",
              "Each question gives you one loop in two versions. Flat is untouched, and Changed has one band boosted, like the bump drawn here. Flip between them as often as you like, then name the band.",
              "Boosting a low band makes the sound heavier or boomier, and boosting a high band makes it brighter or hissier. A band you miss comes back more often.",
              eqFig(1000, g),
            )
          : intro(
              "Hearing a cut band",
              "Each question gives you one loop in two versions. Flat is untouched, and Changed has one band cut, like the dip drawn here. Flip between them as often as you like, then name the band.",
              "Cutting a low band makes the sound thinner, and cutting a high band makes it duller. Go back to Flat often, because you're listening for what's gone.",
              eqFig(1000, -g),
            ),
        card(
          `gain.${g}`,
          `A ${g} dB ${drill === "peak" ? "boost" : "cut"}`,
          `Here every band is ${verb} by ${g} dB, about one octave wide. Tap Flat, then the 1 kHz band at that size.`,
          [eqFlat, eqOption(1000, sign * g)],
          eqFig(1000, sign * g),
        ),
        ...bands.map((hz) =>
          card(
            `band.${hz}`,
            `${bandLabel(hz)}`,
            `Tap Flat, then ${bandLabel(hz)} ${verb} by ${g} dB. Listen for ${bandWord(hz)}.`,
            [eqFlat, eqOption(hz, sign * g)],
            eqFig(hz, sign * g),
          ),
        ),
      ];
    }
    case "boost-or-cut":
      return [
        lesson("listening.boost-or-cut", "Boost or cut", [
          {
            title: "Flat, then Changed",
            text: "Changed has one band either boosted or cut. You decide which, and the band doesn't matter for the answer. Changed is turned up or down to match Flat's loudness, so a louder sound isn't the clue.",
            figure: eqFig(1000, g),
          },
          {
            title: "Boosts",
            text: `Tap Flat, then each band boosted by ${g} dB, and notice that the sound gains something.`,
            options: [eqFlat, ...bands.map((hz) => eqOption(hz, g, true))],
          },
          {
            title: "Cuts",
            text: `Now each band cut by ${g} dB. The sound loses something, and each cut sounds different from the boost at the same band.`,
            options: [eqFlat, ...bands.map((hz) => eqOption(hz, -g, true))],
          },
        ]),
        card(
          `gain.${g}`,
          `A ${g} dB change`,
          `Here every change is ${g} dB. Tap Flat, then the 1 kHz band boosted and cut by that much.`,
          [eqFlat, eqOption(1000, g, true), eqOption(1000, -g, true)],
        ),
      ];
    case "level": {
      return [
        intro(
          "How many dB",
          "Changed is Flat made louder by a few dB. You name how much.",
          "The smaller the step, the harder it is to tell from Flat. Flip back and forth quickly, because a level is easier to compare in a moment than from memory.",
        ),
        ...s.levels.map((db) =>
          card(
            `${db}`,
            `Louder by ${db} dB`,
            `Tap Flat, then a step of ${db} dB, and notice the size of the jump.`,
            [flat, hear(`Louder by ${db} dB`, { levelDb: db })],
          ),
        ),
      ];
    }
    case "pan":
      return [
        intro(
          "Where is it panned",
          "Changed is Flat moved to one place between the left and the right speaker. Centre is an answer too, and then Changed sounds in the same place as Flat.",
          "Headphones or two speakers both work, but headphones make the position clearest. Left means the sound sits more in your left ear.",
        ),
        ...PAN_SETS[s.pans].map((p) =>
          card(
            `${p}`,
            panLabel(p),
            `Tap Flat, then ${panLabel(p)}, and notice where the sound sits.`,
            [flat, hear(panLabel(p), { pan: p })],
          ),
        ),
      ];
    case "compression":
      return [
        lesson("listening.compression", "How compressed", [
          {
            title: "Flat, then Changed",
            text: "A compressor turns down the loudest parts so the sound is more even. Changed is Flat with light compression, heavy compression, or none, and you name which.",
          },
          {
            title: "Hear each setting",
            text: `Tap Flat, then ${compLabel("light")} and ${compLabel("heavy")}. The levels are matched, so each is as loud as Flat overall.`,
            options: [
              flat,
              hear(compLabel("light"), { comp: "light" }, true),
              hear(compLabel("heavy"), { comp: "heavy" }, true),
            ],
          },
          {
            title: "What to listen for",
            text: "Listen to the hits. Heavy compression flattens them more than light compression does, so the loop sounds smaller and more even.",
          },
        ]),
      ];
    case "delay":
      return [
        intro(
          "Delay time",
          `Changed has an echo, a repeat of the sound a short time later. The loop runs at ${LOOP_BPM} BPM, so the times are note values.`,
          "The longer the delay, the further the echo lands from the hit. Listen for where the repeat falls against the beat.",
        ),
        ...DELAY_SETS[s.delays].map((ms) =>
          card(
            `${Math.round(ms)}`,
            delayLabel(ms),
            `Tap Flat, then an echo of ${delayLabel(ms).replace(/^D/, "d")}, and listen for how long after a hit the repeat lands.`,
            [flat, hear(delayLabel(ms), { delayMs: ms })],
          ),
        ),
      ];
  }
  return [];
}
