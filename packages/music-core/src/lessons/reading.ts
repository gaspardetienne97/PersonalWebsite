// Lessons for the reading drills (flashcards, sight-reading), the rhythm drill's echo and dictation
// modes, and the mixing-ear drills. Pitches come from the clef's bottom line and letter steps, the
// rhythm examples from the drill's own cells, the sounds and bands from the studio module.
import { EAR_RHYTHM_LEVELS, RHYTHM_CELLS, type RhythmCell } from "../content/rhythm";
import {
  BAND_SETS,
  DELAY_SETS,
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
import { FLAT_ORDER, SHARP_ORDER } from "../theory/spelling";
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
  const landmark = clef === "treble" ? staffNote(clef, 1) : staffNote(clef, 6);
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

export function readingLessons(
  kind: "flashcards" | "sight-reading",
  clef: Clef | "both",
  opts: { fifths?: number; accidentals?: boolean } = {},
): Lesson[] {
  const clefs: Clef[] = clef === "both" ? ["treble", "bass"] : [clef];
  if (kind === "flashcards")
    return [...clefs.map(linesSpaces), ...(opts.accidentals ? [accidentalsLesson()] : [])];
  return [
    valuesLesson(clefs[0]),
    ...(opts.fifths ? [keySignatureLesson(clefs[0], opts.fifths)] : []),
  ];
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

function keySignatureLesson(clef: Clef, fifths: number): Lesson {
  const n = Math.abs(fifths);
  const sharp = fifths > 0;
  const word = sharp ? "sharp" : "flat";
  const order = (sharp ? SHARP_ORDER : FLAT_ORDER).slice(0, n);
  const first = order[0];
  // The first accidental's letter on a line or space of the staff, with the signature's accidental.
  const step = [0, 1, 2, 3, 4, 5, 6, 7, 8].find((s) => letter(staffNote(clef, s)) === first)!;
  const shown = staffNote(clef, step) + (sharp ? 1 : -1);
  const sig = (reveal?: number): LessonFigure => ({
    kind: "signature",
    clef,
    fifths,
    ...(reveal === undefined ? {} : { reveal }),
  });
  return {
    id: "reading.key-signature",
    title: "The key signature",
    screens: [
      {
        title: "Signs at the start of the staff",
        text: "The sharps or flats right after the clef are the key signature. They hold for every bar, so no sign is written beside each note.",
        figure: sig(),
      },
      {
        title: `This key has ${plural(n, word)}`,
        text: `Tap Next to add the ${plural(n, word)} one at a time, in the order they are written.`,
        figure: sig(0),
        steps: order.map((l, i) => ({
          text: `${l} ${word}: every ${l}, in every octave, is played a half step ${sharp ? "higher" : "lower"}.`,
          figure: sig(i + 1),
        })),
      },
      {
        title: "On the staff",
        text: `With this key signature the note shown is ${first} ${word}, though no sign is written beside it. Every ${first} in the piece is played the same way, unless a sign beside a note says otherwise.`,
        figure: staff(clef, [{ midi: shown, beats: 1 }], { fifths }),
        sound: run([shown]),
      },
    ],
  };
}

// ---------------------------------------------------------------------------
// Rhythm: echo and dictation

/** The count names on the grid: a number on the beat, then these. */
const SUBS = { 2: ["&"], 3: ["&", "a"], 4: ["e", "&", "a"] } as const;
type PerBeat = 2 | 3 | 4;

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
/** "1", "2 &", "3 e": the count a note at `beat` falls on. */
export function countName(beat: number, perBeat: PerBeat, beatsPerBar: number): string {
  const i = Math.round(beat * perBeat);
  const sub = i % perBeat;
  const num = (Math.floor(i / perBeat) % beatsPerBar) + 1;
  return sub ? `${num} ${SUBS[perBeat][sub - 1]}` : String(num);
}
/** A bar as it is said: "1 e & a 2 e & a". */
const allCounts = (perBeat: PerBeat, beatsPerBar: number) =>
  Array.from(
    { length: perBeat * beatsPerBar },
    (_, i) =>
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

function countingLesson(g: keyof typeof GROUPS): Lesson {
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
  return {
    id: t.id,
    title: t.title,
    screens: [
      { title: t.title, text: t.text, figure: fig(every), sound: tick(every, spacing) },
      {
        title: "One bar of notes",
        text: `${t.ex} In this bar the notes fall on ${exNames.join(", ")}.`,
        figure: fig(ex.onsets),
        sound: tick(ex.onsets, spacing),
      },
      {
        title: "Count while you listen",
        text: "Count the beats out loud while the rhythm plays over the click. Notice which counts get a note, and which stay silent.",
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

export function rhythmLessons(
  mode: "echo" | "dictation",
  levelId = EAR_RHYTHM_LEVELS[0].id,
): Lesson[] {
  const g = groupOf(levelId);
  return [
    ...(g === "sixteenths" ? [countingLesson("eighths")] : []),
    countingLesson(g),
    ...(mode === "dictation" ? [gridLesson(g)] : []),
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

const orList = (xs: string[]) =>
  xs.length < 2 ? xs.join("") : `${xs.slice(0, -1).join(", ")} or ${xs.at(-1)}`;

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
  const bands = [...BAND_SETS[drill === "boost-or-cut" ? "5" : s.bands]];
  const eq = (gainDb: number, matched = false) =>
    bands.map((freq) =>
      hear(
        `${bandLabel(freq)} ${gainDb > 0 ? "boosted" : "cut"}`,
        { eq: { freq, gainDb, q: 1.41 } },
        matched,
      ),
    );
  const lesson = (title: string, screens: LessonScreen[]): Lesson[] => [
    { id: `listening.${drill}`, title, screens },
  ];
  const g = s.gainDb;
  switch (drill as StudioExercise) {
    case "peak":
      return lesson("Hearing a boosted band", [
        {
          title: "Flat, then Changed",
          text: `Each prompt gives you one loop in two versions. Flat is untouched, and Changed has one band boosted by ${g} dB. Flip between them as often as you like, then name the band.`,
        },
        {
          title: "Hear each band",
          text: `Tap Flat, then each band in turn, and listen for what gets louder. Every boost here is ${g} dB and about one octave wide.`,
          options: [flat, ...eq(g)],
        },
        {
          title: "What to listen for",
          text: "Boosting a low band makes the sound heavier or boomier, and boosting a high band makes it brighter or hissier. A band you miss comes back more often.",
        },
      ]);
    case "cut":
      return lesson("Hearing a cut band", [
        {
          title: "Flat, then Changed",
          text: `Each prompt gives you one loop in two versions. Flat is untouched, and Changed has one band cut by ${g} dB. Flip between them as often as you like, then name the band.`,
        },
        {
          title: "Hear each band",
          text: `Tap Flat, then each band in turn, and listen for what goes missing. Every cut here is ${g} dB and about one octave wide.`,
          options: [flat, ...eq(-g)],
        },
        {
          title: "What to listen for",
          text: "Cutting a low band makes the sound thinner, and cutting a high band makes it duller. Go back to Flat often, because you are listening for what has gone.",
        },
      ]);
    case "boost-or-cut":
      return lesson("Boost or cut", [
        {
          title: "Flat, then Changed",
          text: `Changed has one band either boosted or cut by ${g} dB. You decide which, and the band does not matter for the answer.`,
        },
        {
          title: "Boosts",
          text: `Tap Flat, then each band boosted by ${g} dB, and notice that the sound gains something.`,
          options: [flat, ...eq(g, true)],
        },
        {
          title: "Cuts",
          text: `Now each band cut by ${g} dB. The sound loses something, and each cut sounds different from the boost at the same band.`,
          options: [flat, ...eq(-g, true)],
        },
        {
          title: "Matched loudness",
          text: "Changed is turned up or down to match Flat's loudness, so a louder sound is not the clue. Listen to the tone instead.",
        },
      ]);
    case "level": {
      const steps = s.levels.map((db) => `${db} dB`);
      return lesson("How many dB", [
        {
          title: "Flat, then Changed",
          text: `Changed is Flat made louder by ${orList(steps)}. You name how much.`,
        },
        {
          title: "Hear each step",
          text: "Tap Flat, then each step, and notice how the size of the jump changes.",
          options: [flat, ...s.levels.map((db) => hear(`Louder by ${db} dB`, { levelDb: db }))],
        },
        {
          title: "What to listen for",
          text: "The smaller the step, the harder it is to tell from Flat. Flip back and forth quickly, because a level is easier to compare in a moment than from memory.",
        },
      ]);
    }
    case "pan": {
      const spots = PAN_SETS[s.pans];
      return lesson("Where is it panned", [
        {
          title: "Flat, then Changed",
          text: "Changed is Flat moved to one place between the left and the right speaker. Centre is an answer too, and then Changed sounds in the same place as Flat.",
        },
        {
          title: "Hear each position",
          text: "Tap Flat, then each position, and notice where the sound sits.",
          options: [flat, ...spots.map((p) => hear(panLabel(p), { pan: p }))],
        },
        {
          title: "What to listen for",
          text: "Headphones or two speakers both work, but headphones make the position clearest. Left means the sound sits more in your left ear.",
        },
      ]);
    }
    case "compression":
      return lesson("How compressed", [
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
      ]);
    case "delay": {
      const times = DELAY_SETS[s.delays];
      return lesson("Delay time", [
        {
          title: "Flat, then Changed",
          text: `Changed has an echo, a repeat of the sound a short time later. The loop runs at 90 BPM, so the times are note values: ${times.map((ms) => delayLabel(ms)).join("; ")}.`,
        },
        {
          title: "Hear each time",
          text: "Tap Flat, then each echo time, and listen for how long after a hit the repeat lands.",
          options: [flat, ...times.map((ms) => hear(delayLabel(ms), { delayMs: ms }))],
        },
        {
          title: "What to listen for",
          text: "The longer the delay, the further the echo lands from the hit. Listen for where the repeat falls against the beat.",
        },
      ]);
    }
  }
  return [];
}
