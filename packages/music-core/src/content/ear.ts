// Ear-training prompt generators. Every generator is deterministic for a seeded `rand`.

import { CADENCES_AND_QUALITIES, EAR_TRAINING, SCALE_DATA, type EarPathStepDef } from "../data";
import type { Score } from "../types";
import { clamp01, pc } from "../theory/notes";
import { INTERVALS, intervalByToken } from "../theory/intervals";
import { pick, randInt, type Rand } from "./random";

export type EarDrillKind =
  | "interval"
  | "chord-quality"
  | "cadence"
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
}

// ---------------------------------------------------------------------------
// Drill definitions and the Ear Training Path, with routes rewritten to /music/ear/[drill].

const earRoute = (href: string) =>
  href === "/music/learn/ear"
    ? "/music?tab=paths"
    : href.replace("/music/learn/ear/", "/music/ear/");

export const EAR_DRILLS = EAR_TRAINING.drills.map((d) => ({ ...d, route: `/music/ear/${d.slug}` }));
export const EAR_DEFAULT_CONFIG = EAR_TRAINING.defaultConfig;
export const EAR_SESSION_LENGTH = 10;

const def = EAR_TRAINING.learningPathDefinition;
export const EAR_PATH = {
  ...def,
  href: earRoute(def.href),
  steps: def.steps.map(
    (s): EarPathStepDef => ({
      ...s,
      href: earRoute(s.href),
      links: s.links?.map((l) => ({ ...l, href: earRoute(l.href) })),
    }),
  ),
};

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

/** Ascending only below difficulty 0.4; above it 60 % ascending, 30 % descending, 10 % harmonic. */
export function intervalPrompt(
  rand: Rand,
  opts: { difficulty: number; token?: string },
): EarPrompt & { direction: IntervalDirection } {
  const interval = (opts.token && intervalByToken(opts.token)) || pick(rand, INTERVALS);
  const root = earRoot(rand);
  const r = opts.difficulty < 0.4 ? 0 : rand();
  const direction: IntervalDirection = r < 0.6 ? "ascending" : r < 0.9 ? "descending" : "harmonic";
  const [first, second] =
    direction === "descending"
      ? [root + interval.semitones, root]
      : [root, root + interval.semitones];
  return {
    id: `interval-${interval.token}-${direction}-${root}`,
    drill: "interval",
    skillIds: ["pitch.intervals", `pitch.interval.${interval.token}`],
    playback:
      direction === "harmonic"
        ? [note([first, second], 0, 0.8)]
        : [note(first, 0, 0.55), note(second, 0.65, 0.55)],
    answer: interval.token,
    choices: INTERVALS.map((i) => i.token),
    difficulty: opts.difficulty,
    expectedMidi: [first, second],
    direction,
  };
}

/** Only the four triads are offered below difficulty 0.65. */
export function chordQualityPrompt(
  rand: Rand,
  opts: { difficulty: number; token?: string },
): EarPrompt {
  const offered = CADENCES_AND_QUALITIES.chordQualities.filter(
    (q) => opts.difficulty >= 0.65 || q.level === "triad",
  );
  const quality = offered.find((q) => q.token === opts.token) ?? pick(rand, offered);
  const root = earRoot(rand);
  const midi = quality.intervals.map((i) => root + i);
  return {
    id: `chord-quality-${quality.token}-${root}`,
    drill: "chord-quality",
    skillIds: [quality.level === "triad" ? "harmony.triads" : "harmony.sevenths", quality.skillId],
    playback: [note(midi, 0, 0.9)],
    answer: quality.token,
    choices: offered.map((q) => q.token),
    difficulty: opts.difficulty,
    expectedMidi: midi,
  };
}

/** Two block chords from the data, transposed by -5..+6 so the answer is functional. */
export function cadencePrompt(rand: Rand, opts: { difficulty: number; token?: string }): EarPrompt {
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
    choices: all.map((c) => c.token),
    difficulty: opts.difficulty,
  };
}

/** Tonic for 0.55 s, then the target 0.7 s later for 0.65 s. */
export function scaleDegreePrompt(
  rand: Rand,
  opts: { difficulty: number; level: string; degree?: string },
): EarPrompt & { context: ScaleContext } {
  const degrees = levelDegrees(opts.level);
  const degree = degreeOf(
    opts.degree && degrees.includes(opts.degree as DegreeLabel) ? opts.degree : pick(rand, degrees),
  );
  const tonic = earRoot(rand);
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
  };
}

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
  opts: { difficulty: number; level: string; degree?: string },
): EarPrompt {
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
  const tonic = earRoot(rand);
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
  };
}

/** The mixed review draws one of the four recognition drills. */
export function mixedPrompt(rand: Rand, opts: { difficulty: number; level: string }): EarPrompt {
  const kind = pick(rand, ["interval", "chord-quality", "scale-degree", "cadence"] as const);
  if (kind === "interval") return intervalPrompt(rand, opts);
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
