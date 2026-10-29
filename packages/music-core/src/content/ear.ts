// Ear-training prompt generators. Every generator is deterministic for a seeded `rand`.

import { CADENCES_AND_QUALITIES, EAR_TRAINING, SCALE_DATA } from "../data";
import type { Score } from "../types";
import { clamp01, noteName, pc } from "../theory/notes";
import { INTERVALS } from "../theory/intervals";
import { numeralChord, numeralSymbol } from "./loops";
import { pick, randInt, type Rand } from "./random";

export type EarDrillKind =
  | "interval"
  | "interval-compare"
  | "chord-quality"
  | "cadence"
  | "chord-function"
  | "progression"
  | "key-change"
  | "loop"
  | "scale"
  | "inversion"
  | "bass-line"
  | "pitch-compare"
  | "error-detect"
  | "scale-degree"
  | "melody-dictation"
  | "repertoire-transfer";

export interface PlaybackEvent {
  midi: number[];
  /** Seconds from the prompt start. */
  time: number;
  /** Seconds. */
  duration: number;
}

export interface EarPrompt {
  id: string;
  drill: EarDrillKind;
  skillIds: string[];
  playback: PlaybackEvent[];
  answer: string;
  choices: string[];
  difficulty: number;
  /** What a play-back answer must produce, in order (not needed for choice answers). */
  expectedMidi?: number[];
  /** Leading playback events that only set the key (not part of the answer). */
  keyEvents?: number;
  /** Shown under the revealed staff instead of a caption worked out from the notes. */
  caption?: string;
}

// ---------------------------------------------------------------------------
// Drill definitions.

/**
 * The drills from the verified table, plus interval comparison, which the app
 * adds (the table is kept as an exact copy). It sits right after Intervals.
 */
const INTERVAL_COMPARE = {
  slug: "interval-compare",
  title: "Interval comparison",
  description: "Two intervals, one after the other: which is bigger?",
  drill: "interval-compare",
  answerModes: ["choice", "listen-along"],
  usesScaleDegreeLevel: false,
  usesLabels: false,
  queueMode: "balanced",
  skillIds: ["pitch.intervals"],
} as const;
/** Chords by their place in a key, and progressions of them: also added by the app, after Cadences. */
const CHORD_FUNCTION_DRILLS = [
  {
    slug: "chord-functions",
    title: "Chords in a key",
    description: "The key is set with I, IV, V, I; then one chord. Which is it, I to vii°?",
    drill: "chord-function",
    answerModes: ["choice", "play-back", "listen", "listen-along"],
    usesScaleDegreeLevel: false,
    usesLabels: false,
    queueMode: "balanced",
    skillIds: ["ear.chord-functions"],
  },
  {
    slug: "progressions",
    title: "Progression dictation",
    description:
      "Three or four chords starting on I: write down the rest. Or a key change: where it goes, and how.",
    drill: "progression",
    answerModes: ["choice", "play-back", "listen", "listen-along"],
    usesScaleDegreeLevel: false,
    usesLabels: false,
    queueMode: "balanced",
    skillIds: ["ear.progressions"],
  },
  {
    slug: "song-loops",
    title: "Song loops",
    description: "The key is set, then a chord loop plays as a groove: name every chord.",
    drill: "loop",
    answerModes: ["choice", "play-back", "listen", "listen-along"],
    usesScaleDegreeLevel: false,
    usesLabels: false,
    queueMode: "balanced",
    skillIds: ["ear.loops"],
  },
  {
    slug: "scales",
    title: "Scales and modes",
    description: "A scale over its tonic: major, the minors, pentatonics, blues and the modes.",
    drill: "scale",
    answerModes: ["choice", "listen", "listen-along"],
    usesScaleDegreeLevel: false,
    usesLabels: false,
    queueMode: "balanced",
    skillIds: ["ear.scales"],
  },
  {
    slug: "inversions",
    title: "Inversions",
    description: "A chord with its root, third, fifth or seventh in the bass: which inversion?",
    drill: "inversion",
    answerModes: ["choice", "play-back", "listen", "listen-along"],
    usesScaleDegreeLevel: false,
    usesLabels: false,
    queueMode: "balanced",
    skillIds: ["ear.inversions"],
  },
  {
    slug: "bass-lines",
    title: "Bass lines",
    description: "Chords from I: write down the bass, degree by degree.",
    drill: "bass-line",
    answerModes: ["choice", "play-back", "listen", "listen-along"],
    usesScaleDegreeLevel: false,
    usesLabels: false,
    queueMode: "balanced",
    skillIds: ["ear.bass-lines"],
  },
  {
    slug: "fine-pitch",
    title: "Fine pitch",
    description: "Two notes a few cents apart: is the second higher or lower?",
    drill: "pitch-compare",
    answerModes: ["choice"],
    usesScaleDegreeLevel: false,
    usesLabels: false,
    queueMode: "balanced",
    skillIds: ["ear.fine-pitch"],
  },
  {
    slug: "wrong-note",
    title: "Spot the wrong note",
    description: "A written melody plays with one note changed: which one?",
    drill: "error-detect",
    answerModes: ["choice"],
    usesScaleDegreeLevel: true,
    usesLabels: true,
    queueMode: "balanced",
    skillIds: ["ear.error-detection"],
  },
] as const;
type DrillRow = (typeof EAR_TRAINING.drills)[number];
const SUNG = ["intervals", "melody-dictation", "bass-lines", "scales"];
export const EAR_DRILLS = [
  ...EAR_TRAINING.drills.slice(0, 1),
  INTERVAL_COMPARE as unknown as DrillRow,
  ...EAR_TRAINING.drills.slice(1, 3),
  ...(CHORD_FUNCTION_DRILLS as unknown as DrillRow[]),
  ...EAR_TRAINING.drills.slice(3),
].map((d) => ({
  ...d,
  // The app adds singing back to intervals (the second note), melody dictation (the phrase),
  // bass lines (the roots, one at a time) and scales (the scale itself, up or up and down).
  answerModes: (SUNG.includes(d.slug)
    ? [...d.answerModes, "voice"]
    : d.answerModes) as readonly string[],
  route: `/music/ear/${d.slug}`,
}));
export const EAR_DEFAULT_CONFIG = EAR_TRAINING.defaultConfig;
export const EAR_SESSION_LENGTH = 10;

const intervalsHref = (set: string, direction = "ascending") =>
  `/music/learn/ear/intervals?answer=choice&intervals=${set}&direction=${direction}`;

// ---------------------------------------------------------------------------
// Scale degrees

export const SCALE_DEGREES = [
  { label: "1", semitones: 0, solfege: "do" },
  { label: "b2", semitones: 1, solfege: "ra" },
  { label: "2", semitones: 2, solfege: "re" },
  { label: "b3", semitones: 3, solfege: "me" },
  { label: "3", semitones: 4, solfege: "mi" },
  { label: "4", semitones: 5, solfege: "fa" },
  { label: "#4", semitones: 6, solfege: "fi" },
  { label: "5", semitones: 7, solfege: "sol" },
  { label: "b6", semitones: 8, solfege: "le" },
  { label: "6", semitones: 9, solfege: "la" },
  { label: "b7", semitones: 10, solfege: "te" },
  { label: "7", semitones: 11, solfege: "ti" },
] as const;
export type DegreeLabel = (typeof SCALE_DEGREES)[number]["label"];

const ALL_DEGREES = SCALE_DEGREES.map((d) => d.label);
export const SCALE_DEGREE_LEVELS: {
  id: string;
  title: string;
  summary: string;
  degrees: DegreeLabel[];
}[] = [
  {
    id: "anchor",
    title: "Anchor",
    summary: "Hear home and dominant: 1 and 5.",
    degrees: ["1", "5"],
  },
  {
    id: "major-pentachord",
    title: "Major pentachord",
    summary: "Map the first five major degrees around the tonic.",
    degrees: ["1", "2", "3", "4", "5"],
  },
  {
    id: "major-diatonic",
    title: "Major diatonic",
    summary: "Recognize all seven major-key functions.",
    degrees: ["1", "2", "3", "4", "5", "6", "7"],
  },
  {
    id: "minor-diatonic",
    title: "Minor diatonic",
    summary: "Recognize natural-minor functions around the tonic.",
    degrees: ["1", "2", "b3", "4", "5", "b6", "b7"],
  },
  {
    id: "chromatic-color",
    title: "Chromatic color",
    summary: "Add b2 and #4 color tones around the diatonic degree map.",
    degrees: ALL_DEGREES,
  },
  {
    id: "full-current",
    title: "Current full set",
    summary: "Review every scale-degree skill currently seeded in the app.",
    degrees: ALL_DEGREES,
  },
];

const degreeOf = (label: string) => SCALE_DEGREES.find((d) => d.label === label)!;
const levelDegrees = (levelId: string) =>
  (SCALE_DEGREE_LEVELS.find((l) => l.id === levelId) ?? SCALE_DEGREE_LEVELS[0]).degrees;
const degreeSkill = (label: string) => `pitch.scale-degree.${label}`;

/** "3 / mi" in degree mode, "mi" in solfege mode. */
export const degreeLabel = (label: string, mode: "degree" | "solfege") =>
  mode === "solfege" ? degreeOf(label).solfege : `${label} / ${degreeOf(label).solfege}`;

export type ScaleContext =
  | "major"
  | "natural-minor"
  | "harmonic-minor"
  | "melodic-minor"
  | "chromatic";

/** Scale context by difficulty; chromatic when the target degree is outside that scale. */
export function scaleContext(difficulty: number, semitones: number): ScaleContext {
  const ctx =
    difficulty < 0.35
      ? "major"
      : difficulty < 0.6
        ? "natural-minor"
        : difficulty < 0.8
          ? "harmonic-minor"
          : "melodic-minor";
  return SCALE_DATA.semitonesByKind[ctx].includes(semitones) ? ctx : "chromatic";
}

// ---------------------------------------------------------------------------
// Generators

const earRoot = (rand: Rand) => 48 + randInt(rand, 0, 12);
const note = (midi: number | number[], time: number, duration: number): PlaybackEvent => ({
  midi: Array.isArray(midi) ? midi : [midi],
  time,
  duration,
});

export type IntervalDirection = "ascending" | "descending" | "harmonic";

/**
 * The intervals the ear drill can ask: the unison (the same note twice, a
 * first step for beginners; it trains the general interval skill only) and
 * the twelve from the theory table.
 */
export const EAR_INTERVALS = [
  { token: "P1", semitones: 0, name: "Perfect unison" },
  ...INTERVALS,
] as const;

/**
 * Ascending only below difficulty 0.4; above it 60 % ascending, 30 % descending,
 * 10 % harmonic, unless `direction` fixes it. `choices` narrows the answer
 * buttons to the intervals being practised.
 */
export function intervalPrompt(
  rand: Rand,
  opts: {
    difficulty: number;
    token?: string;
    direction?: IntervalDirection;
    choices?: string[];
    /** Fix the first note heard (the lower note when played together), so only the distance changes. */
    root?: number;
  },
): EarPrompt & { direction: IntervalDirection } {
  const interval =
    (opts.token && EAR_INTERVALS.find((i) => i.token === opts.token)) || pick(rand, INTERVALS);
  const root = opts.root ?? earRoot(rand);
  const r = opts.difficulty < 0.4 ? 0 : rand();
  const direction: IntervalDirection =
    opts.direction ?? (r < 0.6 ? "ascending" : r < 0.9 ? "descending" : "harmonic");
  const [first, second] =
    direction === "descending"
      ? opts.root !== undefined
        ? [root, root - interval.semitones]
        : [root + interval.semitones, root]
      : [root, root + interval.semitones];
  return {
    id: `interval-${interval.token}-${direction}-${root}`,
    drill: "interval",
    skillIds:
      interval.token === "P1"
        ? ["pitch.intervals"]
        : ["pitch.intervals", `pitch.interval.${interval.token}`],
    playback:
      direction === "harmonic"
        ? [note([first, second], 0, 0.8)]
        : [note(first, 0, 0.55), note(second, 0.65, 0.55)],
    answer: interval.token,
    choices: opts.choices ?? INTERVALS.map((i) => i.token),
    difficulty: opts.difficulty,
    expectedMidi: [first, second],
    direction,
  };
}

/** How far apart the two compared intervals are: a wider gap is easier to hear. */
export const COMPARE_GAPS = { apart: [3, 4, 5], near: [2], close: [1] } as const;
export type CompareGap = keyof typeof COMPARE_GAPS;

/**
 * Two intervals one after the other; the answer is which is bigger ("first",
 * "second", or "same" from difficulty 0.6, when both can be equal). Below 0.4
 * both rise from the same root; from 0.4 the roots differ, so the top notes
 * alone do not give it away; from 0.7 a pair can be played as chords.
 */
export function intervalComparePrompt(
  rand: Rand,
  opts: { difficulty: number; gap?: CompareGap },
): EarPrompt & { pair: [string, string] } {
  const gaps = COMPARE_GAPS[opts.gap ?? "apart"];
  const withSame = opts.difficulty >= 0.6;
  const same = withSame && rand() < 0.2;
  const d = same ? 0 : pick(rand, gaps as readonly number[]);
  const small = randInt(rand, 1, 12 - d);
  const [a, b] = rand() < 0.5 ? [small, small + d] : [small + d, small];
  const root1 = earRoot(rand);
  const root2 = opts.difficulty < 0.4 ? root1 : root1 + randInt(rand, -4, 4);
  const harmonic = opts.difficulty >= 0.7 && rand() < 0.3;
  const play = (root: number, semis: number, t: number) =>
    harmonic
      ? [note([root, root + semis], t, 0.9)]
      : [note(root, t, 0.5), note(root + semis, t + 0.6, 0.5)];
  const tok = (n: number) => INTERVALS.find((i) => i.semitones === n)!.token;
  return {
    id: `compare-${tok(a)}-${tok(b)}-${root1}-${root2}${harmonic ? "-h" : ""}`,
    drill: "interval-compare",
    skillIds: ["pitch.intervals"],
    playback: [...play(root1, a, 0), ...play(root2, b, 1.8)],
    answer: a > b ? "first" : b > a ? "second" : "same",
    choices: withSame ? ["first", "same", "second"] : ["first", "second"],
    difficulty: opts.difficulty,
    expectedMidi: [root1, root1 + a, root2, root2 + b],
    pair: [tok(a), tok(b)],
  };
}

/** Only the four triads are offered below difficulty 0.65. */
export function chordQualityPrompt(
  rand: Rand,
  opts: { difficulty: number; token?: string; choices?: string[] },
): EarPrompt {
  const all = CADENCES_AND_QUALITIES.chordQualities;
  const offered = all.filter((q) => opts.difficulty >= 0.65 || q.level === "triad");
  // A named quality is asked even below 0.65 (the user picked it); a random one is a triad there.
  const quality = all.find((q) => q.token === opts.token) ?? pick(rand, offered);
  const root = earRoot(rand);
  const midi = quality.intervals.map((i) => root + i);
  return {
    id: `chord-quality-${quality.token}-${root}`,
    drill: "chord-quality",
    skillIds: [quality.level === "triad" ? "harmony.triads" : "harmony.sevenths", quality.skillId],
    playback: [note(midi, 0, 0.9)],
    answer: quality.token,
    choices: opts.choices ?? offered.map((q) => q.token),
    difficulty: opts.difficulty,
    expectedMidi: midi,
  };
}

/** Two block chords from the data, transposed by -5..+6 so the answer is functional. */
export function cadencePrompt(
  rand: Rand,
  opts: { difficulty: number; token?: string; choices?: string[] },
): EarPrompt {
  const all = CADENCES_AND_QUALITIES.cadences;
  const cadence = all.find((c) => c.token === opts.token) ?? pick(rand, all);
  const shift = randInt(rand, -5, 6);
  return {
    id: `cadence-${cadence.token}-${shift}`,
    drill: "cadence",
    skillIds: ["ear.cadences", cadence.skillId],
    playback: cadence.playback.map((c) =>
      note(
        c.midiNotes.map((m) => m + shift),
        c.offsetSeconds,
        c.durationSeconds,
      ),
    ),
    answer: cadence.token,
    choices: opts.choices ?? all.map((c) => c.token),
    difficulty: opts.difficulty,
  };
}

// ---------------------------------------------------------------------------
// Scales and modes

/** The scales the ear drill asks, in the order they are offered (major and minor first, Locrian last). */
export const EAR_SCALES = [
  { token: "major", name: "Major", short: "Major" },
  { token: "natural-minor", name: "Natural minor", short: "Minor" },
  { token: "harmonic-minor", name: "Harmonic minor", short: "Harm. min" },
  { token: "major-pentatonic", name: "Major pentatonic", short: "Maj pent" },
  { token: "minor-pentatonic", name: "Minor pentatonic", short: "Min pent" },
  { token: "blues", name: "Blues", short: "Blues" },
  { token: "melodic-minor", name: "Melodic minor", short: "Mel. min" },
  { token: "mixolydian", name: "Mixolydian", short: "Mixo" },
  { token: "dorian", name: "Dorian", short: "Dorian" },
  { token: "lydian", name: "Lydian", short: "Lydian" },
  { token: "phrygian", name: "Phrygian", short: "Phrygian" },
  { token: "locrian", name: "Locrian", short: "Locrian" },
] as const;
export type ScaleDirection = "ascending" | "both" | "descending";
const SCALE_STEP = 0.3;

/** A low tonic held under the scale, then the scale itself, a note every 0.3 s. */
/** The scale's notes from `tonic` in the direction played (what a sung answer must follow). */
export function scaleRun(tonic: number, token: string, direction: ScaleDirection): number[] {
  const up = (
    SCALE_DATA.semitonesByKind[token as keyof typeof SCALE_DATA.semitonesByKind] ?? MAJOR
  ).map((s) => tonic + s);
  return direction === "ascending"
    ? up
    : direction === "descending"
      ? [...up].reverse()
      : [...up, ...up.slice(0, -1).reverse()];
}

export function scalePlayback(
  tonic: number,
  token: string,
  direction: ScaleDirection,
): PlaybackEvent[] {
  const run = scaleRun(tonic, token, direction);
  return [
    note(tonic - 12, 0, run.length * SCALE_STEP + 0.4),
    ...run.map((m, i) => note(m, 0.2 + i * SCALE_STEP, SCALE_STEP - 0.03)),
  ];
}

/** Up only below difficulty 0.5, up and down below 0.8, then any direction, unless `direction` fixes it. */
export function scalePrompt(
  rand: Rand,
  opts: { difficulty: number; token?: string; choices?: string[]; direction?: ScaleDirection },
): EarPrompt & { direction: ScaleDirection } {
  const scale = EAR_SCALES.find((x) => x.token === opts.token) ?? pick(rand, EAR_SCALES);
  const tonic = earRoot(rand);
  const direction: ScaleDirection =
    opts.direction ??
    (opts.difficulty < 0.5
      ? "ascending"
      : opts.difficulty < 0.8
        ? "both"
        : pick(rand, ["ascending", "both", "descending"] as const));
  return {
    id: `scale-${scale.token}-${direction}-${tonic}`,
    drill: "scale",
    skillIds: ["ear.scales", `ear.scale.${scale.token}`],
    playback: scalePlayback(tonic, scale.token, direction),
    expectedMidi: scaleRun(tonic, scale.token, direction),
    answer: scale.token,
    choices: opts.choices ?? EAR_SCALES.map((x) => x.token),
    difficulty: opts.difficulty,
    direction,
  };
}

// ---------------------------------------------------------------------------
// Inversions

/** Triad positions, then seventh-chord positions ("7-" tokens), in the order they are offered. */
export const EAR_INVERSIONS = [
  { token: "root", name: "Root position", short: "Root", position: 0, seventh: false },
  { token: "first", name: "First inversion", short: "1st", position: 1, seventh: false },
  { token: "second", name: "Second inversion", short: "2nd", position: 2, seventh: false },
  { token: "7-root", name: "Seventh, root position", short: "7 root", position: 0, seventh: true },
  {
    token: "7-first",
    name: "Seventh, first inversion",
    short: "7 1st",
    position: 1,
    seventh: true,
  },
  {
    token: "7-second",
    name: "Seventh, second inversion",
    short: "7 2nd",
    position: 2,
    seventh: true,
  },
  {
    token: "7-third",
    name: "Seventh, third inversion",
    short: "7 3rd",
    position: 3,
    seventh: true,
  },
] as const;
const POSITION_SKILL = ["root", "first", "second", "third"];

/**
 * The chord's tones from `root`, rotated so the asked tone is lowest, close
 * together, with that bass doubled an octave below. Augmented and diminished
 * sevenths are left out: their inversions sound alike.
 */
export function inversionVoicing(root: number, quality: string, position: number): number[] {
  const q = CADENCES_AND_QUALITIES.chordQualities.find((x) => x.token === quality)!;
  const tones = q.intervals.map((i) => root + i);
  const rotated = [...tones.slice(position), ...tones.slice(0, position).map((m) => m + 12)];
  return [rotated[0] - 12, ...rotated];
}

/**
 * Triads are major or minor below difficulty 0.5, then diminished too;
 * sevenths are dominant below 0.6, then major, minor and half-diminished
 * too. Below 0.4 the chord is spelled out from the bass up before it sounds
 * together.
 */
export function inversionPrompt(
  rand: Rand,
  opts: { difficulty: number; token?: string; choices?: string[] },
): EarPrompt {
  const inv =
    EAR_INVERSIONS.find((x) => x.token === opts.token) ?? pick(rand, EAR_INVERSIONS.slice(0, 3));
  const qualities = inv.seventh
    ? opts.difficulty < 0.6
      ? ["dominant-7"]
      : ["dominant-7", "major-7", "minor-7", "half-diminished-7"]
    : opts.difficulty < 0.5
      ? ["major", "minor"]
      : ["major", "minor", "diminished"];
  const quality = pick(rand, qualities);
  const root = earRoot(rand);
  const midi = inversionVoicing(root, quality, inv.position);
  const arpeggio = opts.difficulty < 0.4;
  const spread = midi.map((m, i) => note(m, i * 0.22, 0.2));
  const blockAt = arpeggio ? midi.length * 0.22 + 0.2 : 0;
  return {
    id: `inversion-${inv.token}-${quality}-${root}`,
    drill: "inversion",
    skillIds: [
      "ear.inversions",
      `ear.inversion.${POSITION_SKILL[inv.position]}`,
      ...(inv.seventh ? ["ear.inversion.sevenths"] : []),
    ],
    playback: [...(arpeggio ? spread : []), note(midi, blockAt, 1.2)],
    answer: inv.token,
    choices:
      opts.choices ?? EAR_INVERSIONS.filter((x) => x.seventh === inv.seventh).map((x) => x.token),
    difficulty: opts.difficulty,
    expectedMidi: midi,
  };
}

// ---------------------------------------------------------------------------
// Fine pitch

/** The cent steps of the staircase, widest first (musicians reach about 5; 50 is a quarter tone). */
export const CENT_STEPS = [50, 35, 25, 18, 12, 8, 5] as const;

/**
 * A reference note, then the same note `cents` higher or lower (as a
 * fractional MIDI number). From difficulty 0.6 it can also be in tune, and
 * "same" becomes an answer.
 */
export function finePitchPrompt(
  rand: Rand,
  opts: { difficulty: number; cents: number },
): EarPrompt & { cents: number } {
  const ref = 57 + randInt(rand, 0, 15);
  const withSame = opts.difficulty >= 0.6;
  const answer = withSame && rand() < 0.2 ? "same" : rand() < 0.5 ? "higher" : "lower";
  const off = answer === "same" ? 0 : (answer === "higher" ? 1 : -1) * (opts.cents / 100);
  return {
    id: `fine-pitch-${answer}-${opts.cents}-${ref}`,
    drill: "pitch-compare",
    skillIds: ["ear.fine-pitch"],
    playback: [note(ref, 0, 0.8), note(ref + off, 1.1, 0.8)],
    answer,
    choices: withSame ? ["lower", "same", "higher"] : ["lower", "higher"],
    difficulty: opts.difficulty,
    cents: opts.cents,
  };
}

/** 2-down, 1-up: two right in a row move to the next smaller step, a miss moves back one. */
export function staircase(step: number, streak: number, correct: boolean) {
  if (!correct) return { step: Math.max(0, step - 1), streak: 0 };
  if (streak + 1 >= 2) return { step: Math.min(CENT_STEPS.length - 1, step + 1), streak: 0 };
  return { step, streak: streak + 1 };
}

// ---------------------------------------------------------------------------
// Bass lines

/** Roots on 1, 4 and 5; then 2 and 6 too; then stepwise lines through inversions. */
export const BASS_LEVELS = [
  { id: "roots-primary", title: "Roots on 1, 4 and 5", degrees: ["1", "4", "5"] },
  { id: "roots-diatonic", title: "Roots on 1, 2, 4, 5 and 6", degrees: ["1", "2", "4", "5", "6"] },
  {
    id: "inversions",
    title: "Lines through inversions",
    degrees: ["1", "2", "3", "4", "5", "6", "7"],
  },
] as const;
export type BassLevel = (typeof BASS_LEVELS)[number]["id"];
/** Common lines that step through inversions: [chord, chord tone in the bass (0 root, 1 third, 2 fifth)]. */
export const BASS_PATTERNS: [string, number][][] = [
  [
    ["I", 0],
    ["V", 1],
    ["I", 0],
  ], // 1 7 1
  [
    ["I", 0],
    ["V", 2],
    ["I", 1],
  ], // 1 2 3
  [
    ["I", 0],
    ["V", 1],
    ["vi", 0],
  ], // 1 7 6
  [
    ["I", 0],
    ["I", 1],
    ["IV", 0],
    ["V", 0],
  ], // 1 3 4 5
  [
    ["I", 0],
    ["ii", 1],
    ["V", 0],
    ["I", 0],
  ], // 1 4 5 1
  [
    ["I", 0],
    ["IV", 1],
    ["V", 0],
    ["I", 0],
  ], // 1 6 5 1
  [
    ["I", 0],
    ["vi", 0],
    ["ii", 1],
    ["V", 0],
  ], // 1 6 4 5
  [
    ["I", 0],
    ["V", 1],
    ["vi", 0],
    ["iii", 1],
  ], // 1 7 6 5
];
const FIGURE = ["", "6", "6/4"];
const bassDegree = (token: string, position: number) =>
  String((((parseFunction(token).f?.degree ?? 0) + 2 * position) % 7) + 1);

/**
 * A progression from I with its bass to write down. The roots levels draw
 * from the level's chords (three below difficulty 0.5, else four; `token` is
 * the second bass note); the inversions level plays one of the stepwise lines
 * (`token` "p0" to "p7").
 */
export function bassLinePrompt(
  rand: Rand,
  opts: { difficulty: number; level?: string; token?: string; keyPc?: number },
): EarPrompt & { keyPc: number } {
  const level = BASS_LEVELS.find((l) => l.id === opts.level) ?? BASS_LEVELS[0];
  let chords: [string, number][];
  if (level.id === "inversions") {
    const i = Number(/^p(\d+)$/.exec(opts.token ?? "")?.[1] ?? NaN);
    chords = BASS_PATTERNS[i] ?? pick(rand, BASS_PATTERNS);
  } else {
    const byDegree = (d: string) => CHORD_FUNCTIONS[Number(d) - 1].token;
    const p = progressionPrompt(rand, {
      difficulty: opts.difficulty,
      choices: level.degrees.map(byDegree),
      token: opts.token ? byDegree(opts.token) : undefined,
    });
    chords = p.answer.split(" ").map((t) => [t, 0]);
  }
  const keyPc = opts.keyPc ?? randInt(rand, 0, 11);
  const playback = chords.map(([t, pos], i) => {
    const [, ...upper] = functionChord(keyPc, t);
    const bass = into(
      keyPc + MAJOR[(CHORD_FUNCTIONS.find((f) => f.token === t)!.degree + 2 * pos) % 7],
      43,
    );
    return note([bass, ...upper], i * 0.9, 0.8);
  });
  const degrees = chords.map(([t, pos]) => bassDegree(t, pos));
  return {
    id: `bass-line-${chords.map(([t, p]) => `${t}${p}`).join("_")}-${keyPc}`,
    drill: "bass-line",
    skillIds: [
      "ear.bass-lines",
      ...(level.id === "inversions" ? ["ear.bass-lines.inversions"] : []),
    ],
    playback,
    answer: degrees.join(" "),
    choices: [...level.degrees],
    difficulty: opts.difficulty,
    expectedMidi: playback.map((e) => e.midi[0]),
    caption: `Bass ${degrees.join(", ")}: ${chords.map(([t, p]) => `${functionLabel(t)}${FIGURE[p]}`).join(", ")}`,
    keyPc,
  };
}

// ---------------------------------------------------------------------------
// Chords in a key

/**
 * The seven chords of a key, by degree. The token is the major-key numeral;
 * in prompts it carries the key and chord size too: "IV", "IV7" (sevenths),
 * "m:IV" (a minor key, iv), "m:IV7" (iv7). vii° is written "vii".
 */
export const CHORD_FUNCTIONS = [
  { token: "I", name: "Tonic", degree: 0 },
  { token: "ii", name: "Supertonic", degree: 1 },
  { token: "iii", name: "Mediant", degree: 2 },
  { token: "IV", name: "Subdominant", degree: 3 },
  { token: "V", name: "Dominant", degree: 4 },
  { token: "vi", name: "Submediant", degree: 5 },
  { token: "vii", name: "Leading tone", degree: 6 },
] as const;
/** Numerals and chord-symbol suffixes by degree. Minor uses the natural minor with a major V (the raised leading tone) and the subtonic VII. */
const FUNCTION_TABLE = {
  major: {
    labels: ["I", "ii", "iii", "IV", "V", "vi", "vii°"],
    suffix: ["", "m", "m", "", "", "m", "°"],
  },
  major7: {
    labels: ["Imaj7", "ii7", "iii7", "IVmaj7", "V7", "vi7", "viiø7"],
    suffix: ["maj7", "m7", "m7", "maj7", "7", "m7", "ø7"],
  },
  minor: {
    labels: ["i", "ii°", "III", "iv", "V", "VI", "VII"],
    suffix: ["m", "°", "", "m", "", "", ""],
  },
  minor7: {
    labels: ["i7", "iiø7", "IIImaj7", "iv7", "V7", "VImaj7", "VII7"],
    suffix: ["m7", "ø7", "maj7", "m7", "7", "maj7", "7"],
  },
} as const;

export interface FunctionKind {
  minor?: boolean;
  seventh?: boolean;
}
export const functionToken = (base: string, k: FunctionKind = {}) =>
  `${k.minor ? "m:" : ""}${base}${k.seventh ? "7" : ""}`;
/** A prompt token's degree, key and chord size; `f` is undefined for anything else ("?"). */
export function parseFunction(token: string) {
  const minor = token.startsWith("m:");
  const rest = minor ? token.slice(2) : token;
  const seventh = rest.endsWith("7");
  const f = CHORD_FUNCTIONS.find((x) => x.token === (seventh ? rest.slice(0, -1) : rest));
  return { f, minor, seventh };
}
const tableOf = (k: FunctionKind) =>
  FUNCTION_TABLE[`${k.minor ? "minor" : "major"}${k.seventh ? "7" : ""}`];
/** "IV", "iv7", "viiø7"; anything that is not a chord of a key stays as it is. */
export function functionLabel(token: string): string {
  const p = parseFunction(token);
  return p.f ? tableOf(p).labels[p.f.degree] : token;
}
/** Every token of one key and chord size, I to vii. */
export const functionTokens = (k: FunctionKind = {}) =>
  CHORD_FUNCTIONS.map((f) => functionToken(f.token, k));
export function functionSkill(token: string): string {
  const p = parseFunction(token);
  const base = p.f?.token ?? token;
  return p.minor ? `ear.chord-function.minor.${base}` : `ear.chord-function.${base}`;
}
const functionSkills = (tokens: string[]) => {
  const k = parseFunction(tokens[0]);
  return [
    ...new Set(tokens.map(functionSkill)),
    ...(k.seventh ? ["ear.chord-function.sevenths"] : []),
  ];
};
/** `n` mapped into the octave starting at `from`. */
const into = (n: number, from: number) => from + ((((n - from) % 12) + 12) % 12);

/** The chord's notes above the tonic, root first (minor V and V7 take the raised leading tone). */
function functionSemitones(token: string): number[] {
  const p = parseFunction(token);
  const d = p.f?.degree ?? 0;
  const scale = p.minor ? MINOR : MAJOR;
  return (p.seventh ? [0, 2, 4, 6] : [0, 2, 4]).map((k) => {
    const s = scale[(d + k) % 7];
    return p.minor && d === 4 && s === 10 ? 11 : s;
  });
}

/**
 * One chord of the key whose tonic pitch class is `keyPc`: the root in the
 * bass (G2 to F#3), the chord tones close together from middle C up, so every
 * chord sits in the same place and only its sound changes.
 */
export function functionChord(keyPc: number, token: string): number[] {
  const tones = functionSemitones(token).map((s) => keyPc + s);
  return [into(tones[0], 43), ...tones.map((t) => into(t, 60)).sort((a, b) => a - b)];
}

/** "Am", "Bø7", "Ebmaj7": the chord's symbol in the key whose tonic pitch class is `keyPc`. */
export function functionSymbol(keyPc: number, token: string): string {
  const p = parseFunction(token);
  if (!p.f) return token;
  const root = keyPc + functionSemitones(token)[0];
  return `${noteName(48 + pc(root), "flat", false)}${tableOf(p).suffix[p.f.degree]}`;
}

const pcKey = (ms: readonly number[]) => [...new Set(ms.map(pc))].sort((a, b) => a - b).join();
/** Which chord of the key these notes make, in any octave or inversion (none when they make none). */
export const functionOfNotes = (keyPc: number, midis: readonly number[], k: FunctionKind = {}) =>
  functionTokens(k).find((t) => pcKey(functionChord(keyPc, t)) === pcKey(midis));

/** Chords one after another, 0.9 s apart. */
export function functionPlayback(keyPc: number, tokens: string[], start = 0): PlaybackEvent[] {
  return tokens.map((t, i) => note(functionChord(keyPc, t), start + i * 0.9, 0.8));
}

/** I, IV, V, I (i, iv, V, i in minor): sets the key. */
export const keyCadence = (keyPc: number, minor = false) =>
  functionPlayback(
    keyPc,
    ["I", "IV", "V", "I"].map((t) => functionToken(t, { minor })),
  );

/** After the answer: the chord, then the key's tonic triad, so the ear hears where it goes. */
export const chordResolution = (keyPc: number, token: string) =>
  functionPlayback(keyPc, [token, functionToken("I", { minor: parseFunction(token).minor })]);

/**
 * The key a prompt is heard in, or undefined when it has none. Minor for minor
 * chords, or for a degree set with b3 and no 3 (the minor diatonic level).
 */
export function promptKey(p: EarPrompt & { keyPc?: number; minor?: boolean }) {
  if (p.keyPc === undefined) return undefined;
  const minor =
    p.minor !== undefined
      ? p.minor
      : p.drill === "scale-degree"
        ? p.choices.includes("b3") && !p.choices.includes("3")
        : parseFunction(p.answer.split(" ")[0]).minor;
  return { keyPc: p.keyPc, minor };
}

type FunctionOpts = FunctionKind & {
  difficulty: number;
  /** A full token ("m:IV7"): its key and size win over `minor` and `seventh`. */
  token?: string;
  choices?: string[];
  /** The run's key (tonic pitch class); random when missing. */
  keyPc?: number;
};
const kindOf = (opts: FunctionOpts): FunctionKind =>
  opts.token && parseFunction(opts.token).f ? parseFunction(opts.token) : opts;

/**
 * I, IV, V, I (i, iv, V, i in minor) to set the key, a breath, then the chord
 * to name. Given `keyPc` the run sets the key once (keyCadence): the chord alone.
 */
export function chordFunctionPrompt(rand: Rand, opts: FunctionOpts): EarPrompt & { keyPc: number } {
  const k = kindOf(opts);
  const token =
    opts.token && parseFunction(opts.token).f ? opts.token : pick(rand, functionTokens(k));
  const keyPc = opts.keyPc ?? randInt(rand, 0, 11);
  const setting = opts.keyPc === undefined ? keyCadence(keyPc, k.minor) : [];
  return {
    id: `chord-function-${token}-${keyPc}`,
    drill: "chord-function",
    skillIds: [
      k.minor ? "ear.chord-functions.minor" : "ear.chord-functions",
      ...functionSkills([token]),
    ],
    playback: [
      ...setting,
      note(functionChord(keyPc, token), setting.length ? setting.length * 0.9 + 0.6 : 0, 1.1),
    ],
    keyEvents: setting.length,
    expectedMidi: functionChord(keyPc, token),
    answer: token,
    choices: opts.choices ?? functionTokens(k),
    difficulty: opts.difficulty,
    keyPc,
  };
}

/**
 * Three chords below difficulty 0.5, else four, always starting on I (that
 * sets the key). The rest come from `choices` (all seven when missing) with no
 * chord twice in a row; `token` is the second chord, so a session can aim at it.
 */
export function progressionPrompt(rand: Rand, opts: FunctionOpts): EarPrompt & { keyPc: number } {
  const k = kindOf(opts);
  const tonic = functionToken("I", k);
  const pool: string[] = opts.choices?.length
    ? [...new Set([tonic, ...opts.choices])]
    : functionTokens(k);
  const length = opts.difficulty < 0.5 ? 3 : 4;
  const chords = [tonic];
  if (opts.token && opts.token !== tonic && pool.includes(opts.token)) chords.push(opts.token);
  while (chords.length < length) {
    const fresh = pool.filter((t) => t !== chords.at(-1));
    chords.push(pick(rand, fresh.length ? fresh : pool));
  }
  const keyPc = opts.keyPc ?? randInt(rand, 0, 11);
  return {
    id: `progression-${chords.join("_")}-${keyPc}`,
    drill: "progression",
    skillIds: ["ear.progressions", ...functionSkills(chords)],
    playback: functionPlayback(keyPc, chords),
    answer: chords.join(" "),
    choices: pool,
    difficulty: opts.difficulty,
    keyPc,
  };
}

// ---------------------------------------------------------------------------
// Key changes (Progression dictation's second kind): the old key is set, then a
// few chords take it somewhere else. The answer is where it went, then those
// chords as numerals in the new key.

/** Where a progression can go from the key it starts in (major). */
export const KEY_CHANGES = [
  { id: "up-half", label: "Up a half step", shift: 1, minor: false },
  { id: "up-step", label: "Up a whole step", shift: 2, minor: false },
  { id: "up-min3", label: "Up a minor third", shift: 3, minor: false },
  { id: "down-min3", label: "Down a minor third", shift: 9, minor: false },
  { id: "down-maj3", label: "Down a major third", shift: 8, minor: false },
  { id: "up-4th", label: "Up a fourth", shift: 5, minor: false },
  { id: "relative", label: "To the relative minor", shift: 9, minor: true },
  { id: "parallel", label: "To the parallel minor", shift: 0, minor: true },
] as const;
/** The ways in, as numerals in the new key; the first (a ii-V) is the only one below difficulty 0.5. */
export const KEY_CHANGE_PATHS = {
  major: ["ii7 V7 Imaj7", "V7 Imaj7", "iv7 bVII7 Imaj7"],
  minor: ["iiø7 V7 i7", "V7 i7"],
};
/** The answer buttons after the first slot: every chord the ways in use. */
export const KEY_CHANGE_NUMERALS = ["ii7", "iiø7", "iv7", "V7", "bVII7", "Imaj7", "i7"];
export const keyChangeLabel = (id: string) => KEY_CHANGES.find((k) => k.id === id)?.label ?? id;

/** I, IV, V, I in the old key, then the chords of `answer` in the new one, 0.9 s apart, the arrival held. */
export function keyChangePlayback(fromPc: number, answer: string): PlaybackEvent[] {
  const [dest, ...chords] = answer.split(" ");
  const to = pc(fromPc + (KEY_CHANGES.find((k) => k.id === dest) ?? KEY_CHANGES[0]).shift);
  const all = [
    ...["I", "IV", "V", "I"].map((t) => numeralChord(fromPc, t)),
    ...chords.map((t) => numeralChord(to, t)),
  ];
  return all.map((midi, i) => note(midi, i * 0.9, i === all.length - 1 ? 1.6 : 0.8));
}

/** "C major to A minor, the relative minor: Bø7, E7, Am7": an answer spelled out from its old key. */
export function keyChangeCaption(fromPc: number, answer: string): string {
  const [dest, ...chords] = answer.split(" ");
  const k = KEY_CHANGES.find((x) => x.id === dest) ?? KEY_CHANGES[0];
  const to = pc(fromPc + k.shift);
  const name = (p: number, minor: boolean) =>
    `${noteName(48 + p, "flat", false)} ${minor ? "minor" : "major"}`;
  const where = k.label.replace(/^To t/, "t").toLowerCase();
  return `${name(fromPc, false)} to ${name(to, k.minor)}, ${where}: ${chords.map((t) => numeralSymbol(to, t)).join(", ")}`;
}

/** One key change; `dest` picks where it goes, `keyPc` the key it starts in. */
export function keyChangePrompt(
  rand: Rand,
  opts: { difficulty: number; dest?: string; keyPc?: number },
): EarPrompt & { fromPc: number } {
  const k = KEY_CHANGES.find((x) => x.id === opts.dest) ?? pick(rand, KEY_CHANGES);
  const paths = KEY_CHANGE_PATHS[k.minor ? "minor" : "major"];
  const path = opts.difficulty < 0.5 ? paths[0] : pick(rand, paths);
  const fromPc = opts.keyPc ?? randInt(rand, 0, 11);
  const answer = `${k.id} ${path}`;
  return {
    id: `key-change-${k.id}-${path.replaceAll(" ", "_")}-${fromPc}`,
    drill: "key-change",
    skillIds: ["ear.key-changes", `ear.key-change.${k.id}`],
    playback: keyChangePlayback(fromPc, answer),
    keyEvents: 4,
    answer,
    choices: [...KEY_CHANGES.map((x) => x.id), ...KEY_CHANGE_NUMERALS],
    difficulty: opts.difficulty,
    caption: keyChangeCaption(fromPc, answer),
    fromPc,
  };
}

/** Tonic for 0.55 s, then the target 0.7 s later for 0.65 s. `keyPc` fixes the tonic (C3 to B3). */
export function scaleDegreePrompt(
  rand: Rand,
  opts: { difficulty: number; level: string; degree?: string; keyPc?: number },
): EarPrompt & { context: ScaleContext; keyPc: number } {
  const degrees = levelDegrees(opts.level);
  const degree = degreeOf(
    opts.degree && degrees.includes(opts.degree as DegreeLabel) ? opts.degree : pick(rand, degrees),
  );
  const tonic = opts.keyPc === undefined ? earRoot(rand) : 48 + pc(opts.keyPc);
  const target = tonic + degree.semitones;
  return {
    id: `scale-degree-${degree.label}-${tonic}`,
    drill: "scale-degree",
    skillIds: ["pitch.scale-degrees", degreeSkill(degree.label)],
    playback: [note(tonic, 0, 0.55), note(target, 0.7, 0.65)],
    answer: degree.label,
    choices: [...degrees],
    difficulty: opts.difficulty,
    expectedMidi: [target],
    context: scaleContext(opts.difficulty, degree.semitones),
    keyPc: pc(tonic),
  };
}

/**
 * The degree `semitones` above `tonic`, then stepwise through the scale to the
 * nearest tonic, as MIDI: 5 and above go up (5 6 7 8), below 5 down (4 3 2 1).
 * b3, b6 and b7 step through the natural minor, the rest through the major.
 */
export function resolutionToTonic(tonic: number, semitones: number): number[] {
  const s = pc(semitones);
  const scale = [3, 8, 10].includes(s) ? MINOR : MAJOR;
  const path =
    s < 7 ? scale.filter((x) => x < s).reverse() : [...scale.filter((x) => x > s && x < 12), 12];
  return [s, ...path].map((x) => tonic + x);
}

/** After an answer: the note `last` stepping home to the nearest tonic of the key, short notes then a held one. */
export const stepHome = (keyPc: number, last: number): PlaybackEvent[] => {
  const tonic = last - pc(last - keyPc);
  return resolutionToTonic(tonic, last - tonic).map((m, i, all) =>
    note(m, i * 0.35, i === all.length - 1 ? 0.8 : 0.3),
  );
};

const PHRASE_SPACING = 0.55;
// ponytail: note length inside the 0.55 s spacing is unspecified; 0.5 s leaves a small gap.
const PHRASE_NOTE = 0.5;

function phrasePlayback(tonic: number, notes: number[]): PlaybackEvent[] {
  return [tonic, ...notes].map((m, i) => note(m, i * PHRASE_SPACING, PHRASE_NOTE));
}

/**
 * 3 notes below difficulty 0.65, else 4. Starts on the target degree; a 4-note
 * phrase returns to the target then the tonic. The free slots are drawn from the
 * level's degrees without immediate repeats.
 */
export function melodyDictationPrompt(
  rand: Rand,
  opts: { difficulty: number; level: string; degree?: string; keyPc?: number },
): EarPrompt & { keyPc: number; minor: boolean } {
  const degrees = levelDegrees(opts.level);
  const target =
    opts.degree && degrees.includes(opts.degree as DegreeLabel) ? opts.degree : pick(rand, degrees);
  const other = (prev: string) =>
    pick(rand, degrees.length > 1 ? degrees.filter((d) => d !== prev) : degrees);
  let labels: string[];
  if (opts.difficulty < 0.65) {
    const second = other(target);
    labels = [target, second, other(second)];
  } else {
    labels = [target, other(target), target, "1"];
  }
  const tonic = opts.keyPc === undefined ? earRoot(rand) : 48 + pc(opts.keyPc);
  const midi = labels.map((l) => tonic + degreeOf(l).semitones);
  return {
    id: `melody-${labels.join("_")}-${tonic}`,
    drill: "melody-dictation",
    skillIds: ["pitch.scale-degrees", ...new Set(labels.map(degreeSkill))],
    playback: phrasePlayback(tonic, midi),
    answer: labels.join(" "),
    choices: [],
    difficulty: opts.difficulty,
    expectedMidi: midi,
    keyPc: pc(tonic),
    // A minor level (b3 and no 3) is heard after a minor cadence.
    minor: degrees.includes("b3") && !degrees.includes("3"),
  };
}

/**
 * A melody written in degrees (`written`), heard after its tonic with one
 * note changed; the answer is that note's place, 1-based. Four notes below
 * difficulty 0.4, six below 0.7, else eight. The change is a step to the
 * level's next degree below 0.7, else a semitone; from 0.6 one melody in
 * five is played as written ("none").
 */
export function errorDetectPrompt(
  rand: Rand,
  opts: {
    difficulty: number;
    level: string;
    /** A phrase from a saved song instead of a made-up melody. */
    phrase?: Pick<RepertoirePhrase, "id" | "title" | "midi" | "degrees" | "tonicMidi">;
  },
): EarPrompt & { written: string[]; songTitle?: string } {
  const degrees = levelDegrees(opts.level);
  let written: string[];
  let tonic: number;
  let midi: number[];
  if (opts.phrase) {
    written = [...opts.phrase.degrees];
    tonic = opts.phrase.tonicMidi;
    midi = [...opts.phrase.midi];
  } else {
    const length = opts.difficulty < 0.4 ? 4 : opts.difficulty < 0.7 ? 6 : 8;
    written = [pick(rand, degrees.includes("1") ? ["1"] : degrees)];
    while (written.length < length) {
      const fresh = degrees.filter((d) => d !== written.at(-1));
      written.push(pick(rand, fresh.length ? fresh : degrees));
    }
    tonic = earRoot(rand);
    midi = written.map((d) => tonic + degreeOf(d).semitones);
  }
  const none = opts.difficulty >= 0.6 && rand() < 0.2;
  const at = none ? -1 : randInt(rand, 1, written.length - 1); // never the first note, which follows the tonic
  const heard = [...midi];
  if (at >= 0) {
    if (opts.difficulty < 0.7 && opts.phrase) {
      // The neighbouring note of the major scale, up or down.
      const s = pc(midi[at] - tonic);
      const up = MAJOR.find((x) => x > s)! - s;
      const down = [...MAJOR].reverse().find((x) => x < s);
      heard[at] = midi[at] + (down !== undefined && rand() < 0.5 ? down - s : up);
    } else if (opts.difficulty < 0.7 && degrees.length > 1) {
      // The level's neighbouring degree, up or down.
      const i = degrees.indexOf(written[at] as DegreeLabel);
      const j = i <= 0 ? 1 : i >= degrees.length - 1 ? i - 1 : rand() < 0.5 ? i - 1 : i + 1;
      heard[at] = tonic + degreeOf(degrees[j]).semitones;
    } else heard[at] = midi[at] + (rand() < 0.5 ? -1 : 1);
  }
  return {
    id: opts.phrase
      ? `wrong-note-song-${opts.phrase.id}-${at}`
      : `wrong-note-${written.join("_")}-${at}-${tonic}`,
    drill: "error-detect",
    skillIds: ["ear.error-detection"],
    playback: phrasePlayback(tonic, heard),
    answer: none ? "none" : String(at + 1),
    choices: [...written.map((_, i) => String(i + 1)), ...(opts.difficulty >= 0.6 ? ["none"] : [])],
    difficulty: opts.difficulty,
    expectedMidi: midi,
    written,
    songTitle: opts.phrase?.title,
  };
}

/** The mixed review draws one of the nine recognition drills. */
export function mixedPrompt(rand: Rand, opts: { difficulty: number; level: string }): EarPrompt {
  const kind = pick(rand, [
    "interval",
    "chord-quality",
    "scale-degree",
    "cadence",
    "chord-function",
    "progression",
    "scale",
    "inversion",
    "bass-line",
  ] as const);
  if (kind === "interval") return intervalPrompt(rand, opts);
  if (kind === "inversion") return inversionPrompt(rand, opts);
  if (kind === "bass-line") return bassLinePrompt(rand, { difficulty: opts.difficulty });
  if (kind === "scale") return scalePrompt(rand, opts);
  if (kind === "chord-function") return chordFunctionPrompt(rand, opts);
  if (kind === "progression") return progressionPrompt(rand, opts);
  if (kind === "chord-quality") return chordQualityPrompt(rand, opts);
  if (kind === "cadence") return cadencePrompt(rand, opts);
  return scaleDegreePrompt(rand, opts);
}

// ---------------------------------------------------------------------------
// Repertoire transfer

export interface RepertoirePhrase {
  id: string;
  scoreId: string;
  title: string;
  startBeat: number;
  midi: number[];
  degrees: DegreeLabel[];
  tonicMidi: number;
  /** 0..1 from melodic range, largest leap and chromatic degrees. */
  difficulty: number;
}

const MAJOR = SCALE_DATA.semitonesByKind.major;
const MINOR = SCALE_DATA.semitonesByKind["natural-minor"];

/** Tonic pitch class of a score's key signature (C major when unset). */
export const scoreTonicPc = (score: Pick<Score, "keyFifths" | "keyMode">) =>
  pc((score.keyFifths ?? 0) * 7 + (score.keyMode === "minor" ? 9 : 0));

/**
 * Lift 3-4 note phrases from a score's top line (the highest note at each onset,
 * tie continuations skipped), in consecutive windows of four; a trailing three is kept.
 */
export function phrasesFromScore(score: Score): RepertoirePhrase[] {
  const byOnset = new Map<number, number>();
  for (const v of score.voices)
    for (const n of v.notes)
      if (!n.tieFrom) byOnset.set(n.startBeat, Math.max(byOnset.get(n.startBeat) ?? -1, n.midi));
  const line = [...byOnset.entries()].sort((a, b) => a[0] - b[0]);
  const tonicPc = scoreTonicPc(score);
  const diatonic = score.keyMode === "minor" ? MINOR : MAJOR;
  const out: RepertoirePhrase[] = [];
  for (let i = 0; i + 3 <= line.length; i += 4) {
    const chunk = line.slice(i, i + 4);
    const midi = chunk.map(([, m]) => m);
    const steps = midi.map((m) => pc(m - tonicPc));
    const leaps = midi.slice(1).map((m, j) => Math.abs(m - midi[j]));
    const chromatic = steps.filter((s) => !diatonic.includes(s)).length;
    const difficulty = clamp01(
      ((Math.max(...midi) - Math.min(...midi)) / 12 +
        Math.max(...leaps) / 12 +
        chromatic / midi.length) /
        3,
    );
    const tonicMidi = midi[0] - steps[0];
    out.push({
      id: `${score.id}:${chunk[0][0]}`,
      scoreId: score.id,
      title: score.title,
      startBeat: chunk[0][0],
      midi,
      degrees: steps.map((s) => SCALE_DEGREES[s].label),
      tonicMidi,
      difficulty,
    });
  }
  return out;
}

export type PhraseTag = "new" | "due" | "strong";
export interface RankedPhrase extends RepertoirePhrase {
  tag: PhraseTag;
  weakestMastery: number;
  priority: number;
}
/** Caller-supplied current (decayed) mastery and review-due flag per skill id. */
export type MasteryLookup = (skillId: string) => { mastery: number; due: boolean } | undefined;

// ponytail: the difficulty weight (0.25) and the 0.66 "strong" bar are chosen here; tune with data.
/** Weakest degree first, harder phrases slightly ahead; tagged new / due / strong. */
export function rankPhrases(phrases: RepertoirePhrase[], lookup: MasteryLookup): RankedPhrase[] {
  return phrases
    .map((p) => {
      const states = [...new Set(p.degrees)].map((d) => lookup(degreeSkill(d)));
      const weakestMastery = Math.min(...states.map((s) => s?.mastery ?? 0));
      const tag: PhraseTag = states.some((s) => !s)
        ? "new"
        : states.some((s) => s!.due) || weakestMastery < 0.66
          ? "due"
          : "strong";
      return { ...p, tag, weakestMastery, priority: 1 - weakestMastery + 0.25 * p.difficulty };
    })
    .sort((a, b) => b.priority - a.priority);
}

export interface RepertoirePlan {
  warmup: RankedPhrase[];
  review: RankedPhrase[];
  new: RankedPhrase[];
  stretch: RankedPhrase[];
}

// ponytail: block sizes 2/4/2/2 fill the default 10-prompt session; the catalog does not fix them.
/** Warmup = easiest strong phrases, review = due, new = never practised, stretch = hardest of the rest. */
export function repertoirePlan(ranked: RankedPhrase[]): RepertoirePlan {
  const byEase = (a: RankedPhrase, b: RankedPhrase) => a.difficulty - b.difficulty;
  const warmup = ranked
    .filter((p) => p.tag === "strong")
    .sort(byEase)
    .slice(0, 2);
  const review = ranked.filter((p) => p.tag === "due").slice(0, 4);
  const fresh = ranked.filter((p) => p.tag === "new").slice(0, 2);
  const used = new Set([...warmup, ...review, ...fresh].map((p) => p.id));
  const stretch = ranked
    .filter((p) => !used.has(p.id))
    .sort((a, b) => b.difficulty - a.difficulty)
    .slice(0, 2);
  return { warmup, review, new: fresh, stretch };
}

/** Tonic first, then the phrase at 0.55 s spacing; graded like melody dictation. */
export function repertoirePrompt(phrase: RepertoirePhrase): EarPrompt {
  return {
    id: `repertoire-${phrase.id}`,
    drill: "repertoire-transfer",
    skillIds: ["pitch.scale-degrees", ...new Set(phrase.degrees.map(degreeSkill))],
    playback: phrasePlayback(phrase.tonicMidi, phrase.midi),
    answer: phrase.degrees.join(" "),
    choices: [],
    difficulty: phrase.difficulty,
    expectedMidi: phrase.midi,
  };
}
