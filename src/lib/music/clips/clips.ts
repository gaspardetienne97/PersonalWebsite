// The detection test clips (the list in .recordings/detection/README.md) as
// data: what to play, how long, what the page draws for it, and a synthesized
// example for Hear it. Nothing here is scored and nothing is saved to practice
// data: the page at /music/clips records these to WAV files in a folder.
import { noteName, showChord, type PlaybackSound } from "@repo/music-core";
import { m } from "@repo/i18n/messages.js";
import type { Locale } from "@repo/i18n/runtime.js";
import { strumSlots, type Slot, type Stroke } from "../drills/guitar/strum-slots";

export const SECTIONS = ["Room", "Guitar", "Ukulele", "Piano", "Aerophone", "Voice"] as const;
export type Section = (typeof SECTIONS)[number];
/** A section's name on screen; `Section` itself is an id. */
export const sectionLabel = (s: Section): string =>
  ({
    Room: m.music_runtime_clips_section_room,
    Guitar: m.music_runtime_clips_section_guitar,
    Ukulele: m.music_runtime_clips_section_ukulele,
    Piano: m.music_runtime_clips_section_piano,
    Aerophone: m.music_runtime_clips_section_aerophone,
    Voice: m.music_runtime_clips_section_voice,
  })[s]();
export type Fretted = "guitar" | "ukulele";

/** Open strings as MIDI, string 1 (highest) first, as the fretboard and the chord data use. */
export const OPEN_STRINGS: Record<Fretted, number[]> = {
  guitar: [64, 59, 55, 50, 45, 40],
  ukulele: [69, 64, 60, 67],
};

/** A chord shape, string 1 (highest) first; null is a muted string. */
export interface Shape {
  name: string;
  frets: (number | null)[];
  fingers: (number | null)[];
}

/** One sounding note of the example. `step` and `slot` say what the page lights while it sounds. */
export interface ClipNote {
  midi: number;
  /** Seconds from the start of the example. */
  time: number;
  duration: number;
  velocity?: number;
  voice?: "click" | "drum";
  step: number;
  /** The strum slot it falls on, when the clip has a strum row. */
  slot?: number;
}

export interface ClipVisual {
  instrument?: Fretted;
  /** Chord boxes, one per step when there are several. */
  shapes?: Shape[];
  /** One bar of strumming as slots ("1 & 2 & 3 & 4 &"). */
  strum?: Slot[];
  /** Notes on the neck, one per step (a position can come back). */
  fret?: { from: number; to: number; notes: { string: number; fret: number; label: string }[] };
  /** One bar of tab: `slot` counts eighth notes from the bar's start. */
  tab?: { notes: { string: number; fret: number; slot: number; finger: string }[] };
  /** Piano keys per step; `left` lists the keys the left hand plays. */
  keys?: { low: number; high: number; steps: number[][]; left?: number[] };
  /** Aerophone: the written note per step. */
  written?: number[];
  /** Voice: the syllable per step. */
  syllables?: string[];
}

export interface Clip {
  n: number;
  /** File name stem after the number: `05-guitar-g.wav`. */
  slug: string;
  section: Section;
  /** The title on screen, in the current language. */
  title: string;
  /** The title in English, as the manifest file records it. */
  fileTitle: string;
  /** What to play, in one or two plain sentences. */
  play: string;
  /** Target length of the whole clip, with a second of silence at each end. */
  seconds: number;
  bpm?: number;
  /** Where the click sounds: through the speakers when the click is what the clip tests. */
  click?: "speakers" | "headphones";
  /** The sound of the example's pitched notes. */
  sound: PlaybackSound;
  /** A name per step (a chord, a note, a syllable), shown as a row the example walks along. */
  steps: string[];
  visual: ClipVisual;
  /** The synthesized example; empty when there is nothing to hear. */
  example: ClipNote[];
}

// The app has no plucked-string voice: the tine decays like a string, so it stands in.
const PLUCK: PlaybackSound = "e-piano";
const REED: PlaybackSound = "saw";
const PIANO: PlaybackSound = "salamander-piano";
const SUNG: PlaybackSound = "warm-synth";

const shape = (name: string, low: string, fingering: string): Shape => {
  // Written low string first ("320003"), stored string 1 first.
  const read = (c: string) => (c === "x" || c === "-" ? null : Number(c));
  return {
    name,
    frets: [...low].map(read).reverse(),
    fingers: [...fingering].map(read).reverse(),
  };
};

/** Guitar shapes (standard tuning), written low E to high E. */
export const GUITAR_SHAPES = {
  G: shape("G", "320003", "21---3"),
  G33: shape("G", "320033", "21--34"),
  C: shape("C", "x32010", "-32-1-"),
  D: shape("D", "xx0232", "---132"),
  Em: shape("Em", "022000", "-23---"),
  Am: shape("Am", "x02210", "--231-"),
  E: shape("E", "022100", "-231--"),
  A: shape("A", "x02220", "--123-"),
  Dm: shape("Dm", "xx0231", "---231"),
} satisfies Record<string, Shape>;

/** Ukulele shapes (high G: G C E A), written G string to A string. */
export const UKULELE_SHAPES = {
  C: shape("C", "0003", "---3"),
  Am: shape("Am", "2000", "2---"),
  F: shape("F", "2010", "2-1-"),
  G: shape("G", "0232", "-231"),
  G7: shape("G7", "0212", "-213"),
} satisfies Record<string, Shape>;

/** The shape's sounding notes, lowest string first. */
export function shapeMidis(s: Shape, instrument: Fretted): number[] {
  const open = OPEN_STRINGS[instrument];
  const out: number[] = [];
  for (let i = s.frets.length - 1; i >= 0; i--) {
    const f = s.frets[i];
    if (f !== null) out.push(open[i] + f);
  }
  return out;
}

const STRUM_GAP = 0.018;
function strum(
  s: Shape,
  instrument: Fretted,
  time: number,
  duration: number,
  step: number,
  stroke: Stroke = "down",
  slot?: number,
): ClipNote[] {
  if (stroke === "mute") return [{ midi: 42, time, duration: 0.1, voice: "drum", step, slot }];
  const all = shapeMidis(s, instrument);
  // An up-strum catches the high strings; a down-strum crosses them all from the bass.
  const midis = stroke === "up" ? all.slice(-Math.min(4, all.length)).reverse() : all;
  return midis.map((midi, i) => ({
    midi,
    time: time + i * STRUM_GAP,
    duration,
    velocity: stroke === "up" ? 0.55 : 0.75,
    step,
    slot,
  }));
}

const clicks = (bpm: number, beats: number): ClipNote[] =>
  Array.from({ length: beats }, (_, i) => ({
    midi: 0,
    time: (i * 60) / bpm,
    duration: 0.05,
    // The engine accents a click at 0.9 or more: the first beat of each bar.
    velocity: i % 4 === 0 ? 1 : 0.7,
    voice: "click" as const,
    step: 0,
  }));

const line = (midis: number[], gap: number, hold = gap): ClipNote[] =>
  midis.map((midi, i) => ({ midi, time: i * gap, duration: hold, step: i }));

const chords = (groups: number[][], gap: number, hold = gap): ClipNote[] =>
  groups.flatMap((g, i) => g.map((midi) => ({ midi, time: i * gap, duration: hold, step: i })));

const names = (midis: number[], octave = false) => midis.map((m) => noteName(m, "flat", octave));

const DOWNS = strumSlots([0, 1, 2, 3].map((beat) => ({ beat, stroke: "down" as const }))).slots;
/** Down, down-up, up-down-up: D on 1, D on 2, U on 2&, U on 3&, D on 4, U on 4&. */
const PATTERN: { beat: number; stroke: Stroke }[] = [
  { beat: 0, stroke: "down" },
  { beat: 1, stroke: "down" },
  { beat: 1.5, stroke: "up" },
  { beat: 2.5, stroke: "up" },
  { beat: 3, stroke: "down" },
  { beat: 3.5, stroke: "up" },
];
const PATTERN_SLOTS = strumSlots(PATTERN).slots;
const MUTED_SLOTS = strumSlots(
  [0, 1, 2, 3].map((beat) => ({ beat, stroke: "mute" as const })),
).slots;

/** A title in a given language (the current one when left out). */
type Text = (locale?: Locale) => string;
const text =
  (msg: (inputs?: Record<string, never>, options?: { locale?: Locale }) => string): Text =>
  (locale) =>
    msg({}, { locale });

/** Note and chord names as the player reads them ("C4" may read "Do4"). */
const shownNames = <T extends Record<string, string>>(names: T): T =>
  Object.fromEntries(Object.entries(names).map(([k, v]) => [k, showChord(v)])) as T;
/**
 * A title with note or chord names in it. On screen the names follow the note-name setting;
 * in a given language (the manifest's English title) they stay letters.
 */
const named =
  <T extends Record<string, string>>(
    msg: (inputs: T, options?: { locale?: Locale }) => string,
    names: T,
  ): Text =>
  (locale) =>
    msg(locale ? names : shownNames(names), { locale });
/** Instructions with note or chord names in them, named when shown. */
const say =
  <T extends Record<string, string>>(msg: (inputs: T) => string, names: T) =>
  () =>
    msg(shownNames(names));

/** Read when shown, so names follow the note-name setting (applied after this module loads). */
type Lazy<T> = T | (() => T);
const read = <T>(v: Lazy<T>): T => (typeof v === "function" ? (v as () => T)() : v);

type Draft = Omit<
  Clip,
  "n" | "section" | "sound" | "steps" | "example" | "visual" | "title" | "fileTitle" | "play"
> &
  Partial<Pick<Clip, "sound" | "example" | "visual">> & {
    title: Text;
    play: Lazy<string>;
    steps?: Lazy<string[]>;
  };

function slowStrums(
  instrument: Fretted,
  s: Shape,
  slug: string,
  seconds: number,
  extra?: Text,
): Draft {
  const ring = instrument === "guitar" ? 2 : 1.5;
  return {
    slug,
    title: (locale) =>
      extra
        ? m.music_runtime_clips_chord_title_extra(
            { chord: locale ? s.name : showChord(s.name), extra: extra(locale) },
            { locale },
          )
        : m.music_runtime_clips_chord_title(
            { chord: locale ? s.name : showChord(s.name) },
            { locale },
          ),
    play:
      ring === 2
        ? m.music_runtime_clips_slow_strums_guitar_play()
        : m.music_runtime_clips_slow_strums_ukulele_play(),
    seconds,
    visual: { instrument, shapes: [s] },
    example: [0, 1, 2, 3].flatMap((i) => strum(s, instrument, i * ring, ring, 0)),
  };
}

function progression(instrument: Fretted, shapes: Shape[], slug: string): Draft {
  const beat = 60 / 80;
  return {
    slug,
    title: (locale) =>
      m.music_runtime_clips_progression_title(
        { chords: shapes.map((s) => (locale ? s.name : showChord(s.name))).join(", ") },
        { locale },
      ),
    play: () =>
      m.music_runtime_clips_progression_play({
        chords: shapes.map((s) => showChord(s.name)).join(", "),
      }),
    seconds: 15,
    bpm: 80,
    click: "headphones",
    steps: shapes.map((s) => s.name),
    visual: { instrument, shapes, strum: DOWNS },
    example: shapes.flatMap((s, bar) =>
      [0, 1, 2, 3].flatMap((b) =>
        strum(s, instrument, (bar * 4 + b) * beat, beat, bar, "down", b * 2),
      ),
    ),
  };
}

function pattern(instrument: Fretted, s: Shape, slug: string, title: Text): Draft {
  const beat = 60 / 80;
  return {
    slug,
    title,
    play: () => m.music_runtime_clips_pattern_play({ chord: showChord(s.name) }),
    seconds: 15,
    bpm: 80,
    click: "headphones",
    visual: { instrument, shapes: [s], strum: PATTERN_SLOTS },
    example: [0, 1, 2, 3].flatMap((bar) =>
      PATTERN.flatMap((p) =>
        strum(s, instrument, (bar * 4 + p.beat) * beat, beat * 0.9, 0, p.stroke, p.beat * 2),
      ),
    ),
  };
}

function scale(
  instrument: Fretted,
  path: [string: number, fret: number][],
  gap: number,
  d: Pick<Draft, "slug" | "title" | "play" | "seconds">,
): Draft {
  const open = OPEN_STRINGS[instrument];
  const midis = path.map(([s, f]) => open[s - 1] + f);
  return {
    ...d,
    steps: names(midis),
    visual: {
      instrument,
      fret: {
        from: 0,
        to: 3,
        notes: path.map(([string, fret], i) => ({
          string,
          fret,
          label: noteName(midis[i], "flat", false),
        })),
      },
    },
    example: line(midis, gap, gap * 1.1),
  };
}

const upAndDown = <T>(xs: T[]) => [...xs, ...xs.slice(0, -1).reverse()];

// C major in open position on guitar, low C to the C an octave up.
const GUITAR_C_SCALE: [number, number][] = [
  [5, 3],
  [4, 0],
  [4, 2],
  [4, 3],
  [3, 0],
  [3, 2],
  [2, 0],
  [2, 1],
];
// C major on ukulele from the open C string.
const UKULELE_C_SCALE: [number, number][] = [
  [3, 0],
  [3, 2],
  [2, 0],
  [2, 1],
  [2, 3],
  [1, 0],
  [1, 2],
  [1, 3],
];

const openStrings = (
  instrument: Fretted,
  order: number[],
  slug: string,
  seconds: number,
  play: Lazy<string>,
): Draft => {
  const open = OPEN_STRINGS[instrument];
  const midis = order.map((s) => open[s - 1]);
  return {
    slug,
    title: text(m.music_runtime_clips_open_strings_title),
    play,
    seconds,
    steps: names(midis),
    visual: {
      instrument,
      fret: {
        from: 0,
        to: 3,
        notes: order.map((string, i) => ({
          string,
          fret: 0,
          label: noteName(midis[i], "flat", false),
        })),
      },
    },
    example: line(midis, 2, 2.2),
  };
};

const G = GUITAR_SHAPES;
const U = UKULELE_SHAPES;

const C4_TO_C5 = [60, 62, 64, 65, 67, 69, 71, 72];
const TWO_OCTAVES = upAndDown([60, 62, 64, 65, 67, 69, 71, 72, 74, 76, 77, 79, 81, 83, 84]);
const TRIADS = [
  [60, 64, 67],
  [65, 69, 72],
  [67, 71, 74],
  [69, 72, 76],
];
const SEVENTHS = [
  [60, 64, 67, 71],
  [62, 65, 69, 72],
  [55, 59, 62, 65],
];
const BASS = [36, 41, 43];
const OCTAVE_JUMP = [60, 72, 60, 72, 60, 72, 60];
// The bend on the G string at fret 7: D, up a half step to D#, back; D, up a whole step to E, back.
const BEND = [62, 63, 62, 62, 64, 62];
// Fingerpicking C: the thumb alternates strings 5 and 4 on the beats, fingers answer on 3 and 2.
const PICK: { string: number; fret: number; slot: number; finger: string }[] = [
  { string: 5, fret: 3, slot: 0, finger: "T" },
  { string: 3, fret: 0, slot: 1, finger: "i" },
  { string: 4, fret: 2, slot: 2, finger: "T" },
  { string: 2, fret: 1, slot: 3, finger: "m" },
  { string: 5, fret: 3, slot: 4, finger: "T" },
  { string: 3, fret: 0, slot: 5, finger: "i" },
  { string: 4, fret: 2, slot: 6, finger: "T" },
  { string: 2, fret: 1, slot: 7, finger: "m" },
];

/** The syllables of the major scale, as sung in the current language. */
const SOLFEGE = m.music_runtime_clips_solfege_syllables().split(" ");

const DRAFTS: Record<Section, Draft[]> = {
  Room: [
    {
      slug: "room-silence",
      title: text(m.music_runtime_clips_room_silence_title),
      play: m.music_runtime_clips_room_silence_play(),
      seconds: 10,
    },
    {
      slug: "room-click-speakers",
      title: text(m.music_runtime_clips_room_click_title),
      play: m.music_runtime_clips_room_click_play(),
      seconds: 15,
      bpm: 80,
      click: "speakers",
      example: clicks(80, 16),
    },
    {
      slug: "room-talking",
      title: text(m.music_runtime_clips_room_talking_title),
      play: m.music_runtime_clips_room_talking_play(),
      seconds: 10,
    },
  ],
  Guitar: [
    openStrings(
      "guitar",
      [6, 5, 4, 3, 2, 1],
      "guitar-open-strings",
      15,
      say(m.music_runtime_clips_open_strings_guitar_play, { e: "E" }),
    ),
    slowStrums("guitar", G.G, "guitar-g", 10, () => "320003"),
    {
      ...slowStrums(
        "guitar",
        G.G33,
        "guitar-g-320033",
        10,
        named(m.music_runtime_clips_g33_extra, { b: "B" }),
      ),
      play: say(m.music_runtime_clips_g33_play, { g: "G", b: "B" }),
    },
    slowStrums("guitar", G.C, "guitar-c", 10),
    slowStrums("guitar", G.D, "guitar-d", 10),
    slowStrums("guitar", G.Em, "guitar-em", 10),
    slowStrums("guitar", G.Am, "guitar-am", 10),
    slowStrums("guitar", G.E, "guitar-e", 10),
    slowStrums("guitar", G.A, "guitar-a", 10),
    slowStrums("guitar", G.Dm, "guitar-dm", 10),
    progression("guitar", [G.G, G.C, G.D, G.G], "guitar-g-c-d-g"),
    pattern(
      "guitar",
      G.G,
      "guitar-g-strum-pattern",
      named(m.music_runtime_clips_pattern_guitar_title, { g: "G" }),
    ),
    {
      slug: "guitar-g-click-speakers",
      title: named(m.music_runtime_clips_guitar_click_title, { g: "G" }),
      play: say(m.music_runtime_clips_guitar_click_play, { g: "G" }),
      seconds: 10,
      bpm: 80,
      click: "speakers",
      visual: { instrument: "guitar", shapes: [G.G] },
      example: [
        ...clicks(80, 8),
        ...[0, 1, 2, 3].flatMap((i) => strum(G.G, "guitar", i * 1.5, 1.5, 0)),
      ],
    },
    {
      slug: "guitar-muted-strums",
      title: text(m.music_runtime_clips_muted_title),
      play: m.music_runtime_clips_muted_play(),
      seconds: 6,
      visual: { instrument: "guitar", strum: MUTED_SLOTS },
      example: [0, 1, 2, 3].flatMap((i) => strum(G.G, "guitar", i, 0.1, 0, "mute", i * 2)),
    },
    scale("guitar", upAndDown(GUITAR_C_SCALE), 1, {
      slug: "guitar-c-scale-slow",
      title: named(m.music_runtime_clips_c_scale_slow_title, { c: "C" }),
      play: say(m.music_runtime_clips_c_scale_slow_play, { c: "C" }),
      seconds: 18,
    }),
    scale("guitar", upAndDown(GUITAR_C_SCALE), 0.5, {
      slug: "guitar-c-scale-fast",
      title: named(m.music_runtime_clips_c_scale_fast_title, { c: "C" }),
      play: m.music_runtime_clips_c_scale_fast_play(),
      seconds: 10,
    }),
    {
      slug: "guitar-bends",
      title: named(m.music_runtime_clips_bends_title, { g: "G" }),
      play: say(m.music_runtime_clips_bends_play, { g: "G", d: "D", d_sharp: "D#", e: "E" }),
      seconds: 10,
      steps: () => [
        "D",
        m.music_runtime_clips_step_bend_to({ note: showChord("D#") }),
        m.music_runtime_clips_step_back_to({ note: showChord("D") }),
        "D",
        m.music_runtime_clips_step_bend_to({ note: showChord("E") }),
        m.music_runtime_clips_step_back_to({ note: showChord("D") }),
      ],
      visual: {
        instrument: "guitar",
        fret: { from: 5, to: 9, notes: BEND.map(() => ({ string: 3, fret: 7, label: "D" })) },
      },
      example: line(BEND, 1.1, 1.15),
    },
    {
      slug: "guitar-fingerpick-c",
      title: named(m.music_runtime_clips_fingerpick_title, { c: "C" }),
      play: say(m.music_runtime_clips_fingerpick_play, { c: "C" }),
      seconds: 15,
      bpm: 70,
      click: "headphones",
      visual: { instrument: "guitar", shapes: [G.C], tab: { notes: PICK } },
      example: [0, 1, 2, 3].flatMap((bar) =>
        PICK.map((p) => ({
          midi: OPEN_STRINGS.guitar[p.string - 1] + p.fret,
          time: (bar * 8 + p.slot) * (30 / 70),
          duration: 0.9,
          velocity: p.finger === "T" ? 0.8 : 0.6,
          step: p.slot,
        })),
      ),
    },
  ],
  Ukulele: [
    openStrings(
      "ukulele",
      [4, 3, 2, 1],
      "ukulele-open-strings",
      10,
      say(m.music_runtime_clips_open_strings_ukulele_play, { g: "G", a: "A" }),
    ),
    slowStrums("ukulele", U.C, "ukulele-c", 8),
    slowStrums("ukulele", U.Am, "ukulele-am", 8),
    slowStrums("ukulele", U.F, "ukulele-f", 8),
    slowStrums("ukulele", U.G, "ukulele-g", 8),
    slowStrums("ukulele", U.G7, "ukulele-g7", 8),
    progression("ukulele", [U.C, U.Am, U.F, U.G], "ukulele-c-am-f-g"),
    pattern(
      "ukulele",
      U.C,
      "ukulele-c-island-strum",
      named(m.music_runtime_clips_pattern_ukulele_title, { c: "C" }),
    ),
    scale("ukulele", UKULELE_C_SCALE, 1, {
      slug: "ukulele-c-scale",
      title: named(m.music_runtime_clips_uke_scale_title, { c: "C" }),
      play: say(m.music_runtime_clips_uke_scale_play, { c: "C" }),
      seconds: 10,
    }),
  ],
  Piano: [
    {
      slug: "piano-c4-to-c5",
      title: named(m.music_runtime_clips_piano_white_title, { c4: "C4", c5: "C5" }),
      play: say(m.music_runtime_clips_piano_white_play, { c: "C" }),
      seconds: 10,
      steps: names(C4_TO_C5, true),
      visual: { keys: { low: 57, high: 76, steps: C4_TO_C5.map((m) => [m]) } },
      example: line(C4_TO_C5, 1),
    },
    {
      slug: "piano-low-notes",
      title: named(m.music_runtime_clips_piano_low_title, {
        c2: "C2",
        e2: "E2",
        g2: "G2",
        c3: "C3",
      }),
      play: say(m.music_runtime_clips_piano_low_play, {
        c2: "C2",
        e2: "E2",
        g2: "G2",
        c3: "C3",
        c: "C",
      }),
      seconds: 10,
      steps: names([36, 40, 43, 48], true),
      visual: { keys: { low: 33, high: 52, steps: [[36], [40], [43], [48]] } },
      example: line([36, 40, 43, 48], 2),
    },
    {
      slug: "piano-triads",
      title: named(m.music_runtime_clips_piano_triads_title, { c: "C", f: "F", g: "G", am: "Am" }),
      play: m.music_runtime_clips_piano_triads_play(),
      seconds: 10,
      steps: ["C", "F", "G", "Am"],
      visual: { keys: { low: 57, high: 79, steps: TRIADS } },
      example: chords(TRIADS, 2),
    },
    {
      slug: "piano-seventh-chords",
      title: (locale) => ["Cmaj7", "Dm7", "G7"].map((c) => (locale ? c : showChord(c))).join(", "),
      play: m.music_runtime_clips_piano_sevenths_play(),
      seconds: 8,
      steps: ["Cmaj7", "Dm7", "G7"],
      visual: { keys: { low: 53, high: 76, steps: SEVENTHS } },
      example: chords(SEVENTHS, 2),
    },
    {
      slug: "piano-scale-two-octaves",
      title: named(m.music_runtime_clips_piano_two_octaves_title, { c: "C" }),
      play: say(m.music_runtime_clips_piano_two_octaves_play, { c: "C" }),
      seconds: 15,
      bpm: 100,
      click: "headphones",
      steps: names(TWO_OCTAVES),
      visual: { keys: { low: 57, high: 86, steps: TWO_OCTAVES.map((m) => [m]) } },
      example: line(TWO_OCTAVES, 0.3),
    },
    {
      slug: "piano-bass-and-triads",
      title: named(m.music_runtime_clips_piano_bass_title, { c: "C", f: "F", g: "G" }),
      play: say(m.music_runtime_clips_piano_bass_play, {
        c2: "C2",
        f2: "F2",
        g2: "G2",
        c: "C",
        f: "F",
        g: "G",
      }),
      seconds: 8,
      steps: ["C", "F", "G"],
      visual: {
        keys: { low: 36, high: 76, steps: BASS.map((b, i) => [b, ...TRIADS[i]]), left: BASS },
      },
      example: chords(
        BASS.map((b, i) => [b, ...TRIADS[i]]),
        2,
      ),
    },
  ],
  Aerophone: [
    {
      slug: "aerophone-c-scale",
      title: named(m.music_runtime_clips_aero_scale_title, { c: "C" }),
      play: say(m.music_runtime_clips_aero_scale_play, { c: "C" }),
      seconds: 10,
      steps: names(C4_TO_C5, true),
      visual: { written: C4_TO_C5 },
      example: line(C4_TO_C5, 1),
    },
    {
      slug: "aerophone-long-note",
      title: text(m.music_runtime_clips_aero_long_title),
      play: say(m.music_runtime_clips_aero_long_play, { g: "G" }),
      seconds: 10,
      steps: ["G4"],
      visual: { written: [67] },
      example: line([67], 8),
    },
    {
      slug: "aerophone-tongued",
      title: named(m.music_runtime_clips_aero_tongued_title, {
        c: "C",
        d: "D",
        e: "E",
        f: "F",
        g: "G",
      }),
      play: say(m.music_runtime_clips_aero_tongued_play, {
        c: "C",
        d: "D",
        e: "E",
        f: "F",
        g: "G",
      }),
      seconds: 5,
      steps: names(C4_TO_C5.slice(0, 5), true),
      visual: { written: C4_TO_C5.slice(0, 5) },
      example: line(C4_TO_C5.slice(0, 5), 0.5, 0.4),
    },
    {
      slug: "aerophone-octave-jump",
      title: named(m.music_runtime_clips_aero_octave_title, { c4: "C4", c5: "C5" }),
      play: say(m.music_runtime_clips_aero_octave_play, { c4: "C4", c5: "C5" }),
      seconds: 8,
      steps: names(OCTAVE_JUMP, true),
      visual: { written: OCTAVE_JUMP },
      example: line(OCTAVE_JUMP, 0.9),
    },
  ],
  Voice: [
    {
      slug: "voice-solfege",
      title: text(m.music_runtime_clips_solfege_title),
      play: m.music_runtime_clips_solfege_play(),
      seconds: 10,
      steps: SOLFEGE,
      visual: { syllables: SOLFEGE },
      example: line(
        C4_TO_C5.map((m) => m - 12),
        1,
      ),
    },
    {
      slug: "voice-hum",
      title: text(m.music_runtime_clips_hum_title),
      play: m.music_runtime_clips_hum_play(),
      seconds: 6,
      steps: [m.music_runtime_clips_step_hum()],
      visual: { syllables: ["mmm"] },
      example: line([55], 4),
    },
  ],
};

const SOUND: Record<Section, PlaybackSound> = {
  Room: PIANO,
  Guitar: PLUCK,
  Ukulele: PLUCK,
  Piano: PIANO,
  Aerophone: REED,
  Voice: SUNG,
};

/** Every clip, numbered 1 to 42 in the README's order. */
export const CLIPS: Clip[] = SECTIONS.flatMap((section) =>
  DRAFTS[section].map((d) => ({ section, d })),
).map(({ section, d }, i) => {
  const { title, play, steps = [], ...rest } = d;
  return {
    visual: {},
    example: [],
    sound: SOUND[section],
    ...rest,
    // Read when shown: the note names follow the setting, which is applied after this module loads.
    get title() {
      return title();
    },
    fileTitle: title("en"),
    get play() {
      return read(play);
    },
    get steps() {
      return read(steps).map((s) => showChord(s));
    },
    n: i + 1,
    section,
  };
});

export const pad2 = (n: number) => String(n).padStart(2, "0");
/** `05-guitar-g.wav`. */
export const clipFile = (c: Pick<Clip, "n" | "slug">) => `${pad2(c.n)}-${c.slug}.wav`;
/** Length of the example in seconds. */
export const exampleSeconds = (c: Clip) =>
  c.example.reduce((m, n) => Math.max(m, n.time + n.duration), 0);

/**
 * A folder name from a device label: "Logitech BRIO (046d:085e)" is
 * `logitech-brio`, "Scarlett 2i2 USB (1235:8210)" is `scarlett-2i2`.
 */
export function inputSlug(label: string): string {
  const slug = label
    .replace(/\([^)]*\)/g, " ")
    .replace(/^\s*(default|communications)\s*-\s*/i, "")
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/(-usb)?(-audio)?(-device)?$/, "");
  return slug || "input";
}
