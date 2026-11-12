// Learning paths (catalog 5.8): the levelled instrument, ear and reading paths (data/paths) and
// the theory and studio-ears paths, with status from independent evidence only.
import {
  isMasteryEligible,
  type Instrument,
  type Modality,
  type RunRecord,
  type ScoringEvent,
} from "../types";
import { SKILL_GRAPH, withDescendants, type SkillGraph } from "./graph";
import { dayKey } from "./rewards";
import { ladderEvidence, type LadderCriterion } from "./ladder";
import {
  levelPath,
  shelfKey,
  songDays,
  type PathLevel,
  type RawLevelPath,
  type ShelfSong,
} from "./levels";
import guitarLevels from "../data/paths/guitar.json";
import ukuleleLevels from "../data/paths/ukulele.json";
import pianoLevels from "../data/paths/piano.json";
import jazzLevels from "../data/paths/jazz.json";
import aerophoneLevels from "../data/paths/aerophone.json";
import padsLevels from "../data/paths/pads.json";
import earLevels from "../data/paths/ear-theory.json";
import readingLevels from "../data/paths/reading.json";

export type PathId =
  | "ear"
  | "jazz"
  | "guitar"
  | "ukulele"
  | "piano"
  | "aerophone"
  | "mpc"
  | "reading"
  | "studio"
  | "theory";

export interface PathLink {
  label: string;
  href: string;
}

export interface PathStep {
  id: string;
  order: number;
  title: string;
  summary: string;
  detail?: string;
  /** new: waits for a drill or setting the app lacks (`needs`). */
  kind: "drill" | "reference" | "review" | "new";
  href: string;
  links: PathLink[];
  skillIds: string[];
  exerciseIds?: string[];
  modalities?: Modality[];
  minAttempts: number;
  minSessions: number;
  /** Distinct days with evidence, so a pass is confirmed cold on another day. */
  minDays: number;
  /** Mean credit of the recent attempts for done; the paths' usual 0.66 when missing. */
  threshold?: number;
  /** Only runs at or above this tempo count (the run's `bpm` param). */
  minBpm?: number;
  /** Only runs at least this hard count, so a step can ask for a harder setup. */
  minDifficulty?: number;
  requires: string[];
  /** Pinned to these instruments; evidence from another instrument does not count. */
  instruments?: Instrument[];
  /** Content applicability: melodic lines are pitched, voicings polyphonic. */
  content?: "pitched" | "polyphonic";
  /** Run params a run must carry for its attempts to count (a phrase, a pattern). */
  match?: Record<string, string>;
  /** One evidence row per value of a run param, each to pass (shapes A, D and E). */
  each?: { param: string; values: string[] };
  /** Steps a pass here tests out (marks review) without being needed first: a placement check. */
  covers?: string[];
  /** Judged on the tune ladder (progress/ladder): rungs done on a number of tunes. */
  ladder?: LadderCriterion;
  /** Levelled paths: the level, strand and what a new step waits for. */
  level?: string;
  strand?: string;
  needs?: string;
}

export interface LearningPath {
  id: PathId;
  title: string;
  subtitle: string;
  steps: PathStep[];
  benchmark?: string;
  levels?: PathLevel[];
}

export const DONE_THRESHOLD = 0.66;

// ---------------------------------------------------------------------------
// Normalisation

interface RawStep {
  id: string;
  order: number;
  title: string;
  summary: string;
  detail?: string;
  kind?: string;
  href: string;
  links?: PathLink[];
  skillIds?: string[];
  skillId?: string;
  exerciseIds?: string[];
  modalities?: string[];
  minAttempts?: number;
  minSessions?: number;
  minDays?: number;
  threshold?: number;
  minBpm?: number;
  minDifficulty?: number;
  requires?: string[];
  applies?: string | { only?: string[] };
}

function normaliseStep(raw: RawStep): PathStep {
  const applies = raw.applies;
  return {
    id: raw.id,
    order: raw.order,
    title: raw.title,
    summary: raw.summary,
    detail: raw.detail,
    kind: raw.kind === "reference" || raw.kind === "review" ? raw.kind : "drill",
    href: raw.href,
    links: raw.links ?? [],
    skillIds: raw.skillIds ?? (raw.skillId ? [raw.skillId] : []),
    exerciseIds: raw.exerciseIds,
    modalities: raw.modalities as Modality[] | undefined,
    minAttempts: raw.minAttempts ?? 1,
    minSessions: raw.minSessions ?? 1,
    minDays: raw.minDays ?? 2,
    threshold: raw.threshold,
    minBpm: raw.minBpm,
    minDifficulty: raw.minDifficulty,
    requires: raw.requires ?? [],
    instruments: typeof applies === "object" ? (applies.only as Instrument[]) : undefined,
    content: applies === "pitched" || applies === "polyphonic" ? applies : undefined,
  };
}

// Studio ears: its own path (timbre and frequency memory, not pitch), in the
// research's order: 3 bands on noise, 5 then 9, loops, cuts, smaller gains,
// then boost or cut, level and pan, then compression and delay. Thresholds stay under the ~78% trained
// students reach on 9 bands of music (Marui and Kamekawa 2018).
// The circle of fifths, in the research's order (Open Music Theory, Levine,
// LearnMusicTheory.net): the order of sharps and flats, keys by how many
// accidentals both ways, signatures on the staff, relative minors, a key's
// chords, the circle from memory, then the circle on the instrument.
// Fluency is right and fast (recall, not working it out): 95% over 20
// prompts on two days.
const CIRCLE = (q: string) => `/music/circle?${q}`;
const THEORY_STEPS: RawStep[] = [
  {
    id: "T-1",
    order: 1,
    title: "The order of sharps and flats",
    summary:
      "F C G D A E B for sharps (Father Charles Goes Down And Ends Battle), backwards for flats.",
    detail: "Twenty prompts over two days, 95% right within 2 seconds.",
    href: CIRCLE("mode=order"),
    exerciseIds: ["theory.circle.order"],
    skillIds: ["theory.circle.order"],
    minAttempts: 20,
    minSessions: 2,
    threshold: 0.95,
  },
  {
    id: "T-2",
    order: 2,
    title: "Keys up to two sharps or flats",
    summary: "C, G, F, D and Bb: from the key to its count, and from the count to the key.",
    detail: "Twenty prompts over two days, 95% right within 2 seconds.",
    href: CIRCLE("mode=count&band=two"),
    links: [{ label: "Start with C, G and F", href: CIRCLE("mode=count&band=near") }],
    exerciseIds: ["theory.circle.count"],
    skillIds: ["theory.circle.count"],
    minAttempts: 20,
    minSessions: 2,
    threshold: 0.95,
    minDifficulty: 0.35,
  },
  {
    id: "T-3",
    order: 3,
    title: "Every key, both ways",
    summary: "Up to four, then all fifteen with the enharmonic keys, sharps and flats mixed.",
    detail: "Twenty prompts on all fifteen keys over two days, 95% right within 2 seconds.",
    href: CIRCLE("mode=count&band=all"),
    links: [{ label: "Up to four", href: CIRCLE("mode=count&band=four") }],
    exerciseIds: ["theory.circle.count"],
    skillIds: ["theory.circle.count"],
    minAttempts: 20,
    minSessions: 2,
    threshold: 0.95,
    minDifficulty: 0.75,
  },
  {
    id: "T-4",
    order: 4,
    title: "Read signatures on the staff",
    summary: "Name the key from its signature, treble clef first, then bass.",
    detail: "Twenty prompts on keys up to four over two days, 95% right within 3 seconds.",
    href: CIRCLE("mode=signature&band=four&clefs=treble"),
    links: [{ label: "Bass and treble", href: CIRCLE("mode=signature&band=all&clefs=both") }],
    exerciseIds: ["theory.circle.signature"],
    skillIds: ["theory.circle.signature"],
    minAttempts: 20,
    minSessions: 2,
    threshold: 0.95,
    minDifficulty: 0.55,
  },
  {
    id: "T-5",
    order: 5,
    title: "Neighbours and relative minors",
    summary:
      "One more sharp, one more flat, the relative minor a minor third down, and the key across.",
    detail: "Twenty prompts on keys up to four, 95% right within 2.5 seconds.",
    href: CIRCLE("mode=neighbours&band=four"),
    links: [{ label: "Minor keys' signatures", href: CIRCLE("mode=count&band=four&minor=both") }],
    exerciseIds: ["theory.circle.neighbours"],
    skillIds: ["theory.circle.neighbours"],
    minAttempts: 20,
    threshold: 0.95,
    minDifficulty: 0.55,
  },
  {
    id: "T-6",
    order: 6,
    title: "A key's chords",
    summary:
      "Read them off the wedge: IV, I and V outside, ii, vi and iii inside, vii° at the centre.",
    detail: "Twenty prompts on keys up to four, 95% right within 5 seconds.",
    href: CIRCLE("mode=chords&band=four"),
    exerciseIds: ["theory.circle.chords"],
    skillIds: ["theory.circle.chords"],
    minAttempts: 20,
    threshold: 0.95,
    minDifficulty: 0.55,
  },
  {
    id: "T-7",
    order: 7,
    title: "The circle from memory",
    summary: "A blank wheel: put each key in its place.",
    detail: "Twenty prompts on all fifteen keys, 95% right within 3 seconds.",
    href: CIRCLE("mode=wheel&band=all"),
    exerciseIds: ["theory.circle.wheel"],
    skillIds: ["theory.circle.wheel"],
    minAttempts: 20,
    threshold: 0.95,
    minDifficulty: 0.75,
  },
  {
    id: "T-8",
    order: 8,
    title: "Round the circle on your instrument",
    summary:
      "Scales clockwise from C (C G D A E share a fingering on piano); ii-V-I counter-clockwise, the way the changes move; chord changes by fourths on guitar.",
    kind: "reference",
    href: "/music/library?tab=reference&section=circle",
    links: [
      {
        label: "Scales",
        href: "/music/play/scales?scale=major&tonic=G4&instrument=piano&bpm=72&motion=up&span=one-octave&hands=both",
      },
      {
        label: "ii-V-I voicings",
        href: "/music/play/voicings?variant=major&instrument=piano&key=0&mode=check",
      },
      {
        label: "Chord changes",
        href: "/music/play/chord-perfect?mode=changes&instrument=guitar&tuning=guitar.standard&shape=guitar.c-major&to=guitar.f-major&timed=1&bpm=60&clock=4",
      },
    ],
  },
];

const L = (q: string) => `/music/ear/studio?${q}`;
const STUDIO_STEPS: RawStep[] = [
  {
    id: "S-1",
    order: 1,
    title: "Three bands on pink noise",
    summary: "250 Hz, 1 kHz or 4 kHz, boosted 12 dB. Flip Flat and Changed as often as you like.",
    detail: "Ten unaided answers at 90% or higher.",
    href: L("exercise=peak&bands=3&gain=12&material=noise"),
    exerciseIds: ["studio.peak"],
    skillIds: ["studio.eq-peak"],
    minAttempts: 10,
    threshold: 0.9,
  },
  {
    id: "S-2",
    order: 2,
    title: "Five bands, then nine",
    summary: "More bands, still 12 dB on noise. Nine is every octave from 63 Hz to 16 kHz.",
    detail: "Twenty unaided answers on five bands or more, at 80% or higher.",
    href: L("exercise=peak&bands=5&gain=12&material=noise"),
    links: [{ label: "All nine octaves", href: L("exercise=peak&bands=9&gain=12&material=noise") }],
    exerciseIds: ["studio.peak"],
    skillIds: ["studio.eq-peak"],
    minAttempts: 20,
    threshold: 0.8,
    minDifficulty: 0.4,
  },
  {
    id: "S-3",
    order: 3,
    title: "Nine bands on loops",
    summary:
      "The drum loop, then the band loop. Music is harder than noise; an octave off counts half.",
    detail: "Twenty unaided answers on nine bands over a loop, at 70% or higher.",
    href: L("exercise=peak&bands=9&gain=12&material=drums"),
    links: [{ label: "The band loop", href: L("exercise=peak&bands=9&gain=12&material=music") }],
    exerciseIds: ["studio.peak"],
    skillIds: ["studio.eq-peak"],
    minAttempts: 20,
    threshold: 0.7,
    minDifficulty: 0.65,
  },
  {
    id: "S-4",
    order: 4,
    title: "Find the cut",
    summary: "A band cut by 12 dB: harder than a boost, since you listen for what is missing.",
    detail: "Twenty unaided answers on nine bands, at 70% or higher.",
    href: L("exercise=cut&bands=9&gain=12&material=noise"),
    links: [{ label: "On the band loop", href: L("exercise=cut&bands=9&gain=12&material=music") }],
    exerciseIds: ["studio.cut"],
    skillIds: ["studio.eq-cut"],
    minAttempts: 20,
    threshold: 0.7,
    minDifficulty: 0.6,
  },
  {
    id: "S-5",
    order: 5,
    title: "Smaller boosts",
    summary: "6 dB, then 3 dB: closer to the moves made in a real mix.",
    detail: "Twenty unaided answers on nine bands at 6 dB or less, at 70% or higher.",
    href: L("exercise=peak&bands=9&gain=6&material=drums"),
    links: [{ label: "3 dB", href: L("exercise=peak&bands=9&gain=3&material=drums") }],
    exerciseIds: ["studio.peak"],
    skillIds: ["studio.eq-peak"],
    minAttempts: 20,
    threshold: 0.7,
    minDifficulty: 0.75,
  },
  {
    id: "S-6",
    order: 6,
    title: "Boost or cut, level and pan",
    summary:
      "Boost or cut at matched loudness, how many dB louder, and where it sits in the stereo field.",
    detail: "Ten unaided answers each, at 80% or higher.",
    href: L("exercise=boost-or-cut&gain=6&material=music"),
    links: [
      { label: "How many dB", href: L("exercise=level&levels=6,3,2&material=music") },
      { label: "Pan position", href: L("exercise=pan&pans=5&material=music") },
    ],
    exerciseIds: ["studio.boost-or-cut", "studio.level", "studio.pan"],
    skillIds: ["studio.boost-or-cut", "studio.level", "studio.pan"],
    minAttempts: 10,
    threshold: 0.8,
  },
  {
    id: "S-7",
    order: 7,
    title: "Compression and delay",
    summary:
      "How hard a drum loop is squashed (at matched loudness), and how long its echo is in note values.",
    detail: "Ten unaided answers each, at 75% or higher.",
    href: L("exercise=compression&material=drums"),
    links: [
      { label: "Delay time", href: L("exercise=delay&material=drums") },
      { label: "With dotted 1/8", href: L("exercise=delay&delays=4&material=music") },
    ],
    exerciseIds: ["studio.compression", "studio.delay"],
    skillIds: ["studio.compression", "studio.delay"],
    minAttempts: 10,
    threshold: 0.75,
  },
];

const path = (id: PathId, title: string, subtitle: string, steps: RawStep[]): LearningPath => ({
  id,
  title,
  subtitle,
  // Sorted, then numbered 1, 2, 3 (steps the app adds sit between the table's).
  steps: steps
    .map(normaliseStep)
    .sort((a, b) => a.order - b.order)
    .map((s, i) => ({ ...s, order: i + 1 })),
});

/** The path each instrument follows (the Paths tab's default and Today's focus block). */
export const PATH_FOR_INSTRUMENT: Record<Instrument, PathId> = {
  piano: "piano",
  guitar: "guitar",
  ukulele: "ukulele",
  mpc: "mpc",
  aerophone: "aerophone",
  voice: "ear",
};

const levelled = (raw: unknown) => levelPath(raw as RawLevelPath);

export const LEARNING_PATHS: Record<PathId, LearningPath> = {
  guitar: levelled(guitarLevels),
  ukulele: levelled(ukuleleLevels),
  piano: levelled(pianoLevels),
  jazz: levelled(jazzLevels),
  aerophone: levelled(aerophoneLevels),
  mpc: levelled(padsLevels),
  ear: levelled(earLevels),
  reading: levelled(readingLevels),
  theory: path(
    "theory",
    "Circle of Fifths Path",
    "Key signatures and the circle, until they come from memory: right and fast, then round the circle on your instrument.",
    THEORY_STEPS,
  ),
  studio: path(
    "studio",
    "Studio Ears Path",
    "Hear EQ, level and pan the way a producer does: noise first, then loops, smaller moves last.",
    STUDIO_STEPS,
  ),
};

// ---------------------------------------------------------------------------
// Status

/** review: not passed itself, but a later step that needs it is done (tested out). */
export type StepStatus =
  | "todo"
  | "not-assessed"
  | "in-progress"
  | "done"
  | "review"
  | "locked"
  | "next";

export interface SkillEvidence {
  skillId: string;
  attempts: number;
  sessions: number;
  days: number;
  /** Mean credit of the recent attempts, the ones a pass is judged on. */
  mean: number;
  done: boolean;
}

export interface StepProgress {
  step: PathStep;
  status: StepStatus;
  evidence: SkillEvidence[];
  /** Open, and the recent attempts already pass: at most one attempt short, or only sessions or days missing. */
  almost: boolean;
}

export interface LevelProgress {
  level: PathLevel;
  /** Graded steps done or tested out, out of graded steps. */
  done: number;
  total: number;
  /** Each shelf song with its days of passing performances. */
  songs: { song: ShelfSong; key: string; days: number; played: boolean }[];
  played: number;
  passed: boolean;
}

export interface PathProgress {
  path: LearningPath;
  steps: StepProgress[];
  levels?: LevelProgress[];
  /** The first level not passed. */
  currentLevel?: string;
  /** Steps with skills that are done or tested out, out of steps with skills. */
  done: number;
  total: number;
  continueHref?: string;
}

/** Attempts a pass is judged on: the latest few, so old misses stop counting once you improve. */
export const recentWindow = (step: PathStep) => Math.max(step.minAttempts, 3);

const meetsMean = (step: PathStep, mean: number) => mean >= (step.threshold ?? DONE_THRESHOLD);

/** A step with evidence to judge: named skills, or a levelled step's drill. */
export const isGraded = (step: PathStep) =>
  step.skillIds.length > 0 ||
  !!step.ladder ||
  (step.level !== undefined && !!step.exerciseIds?.length);

/** One judged item: a scoring event, or a whole checked run for levelled drill steps. */
interface Evidence {
  at: number;
  score: number;
  session: string;
  param: (k: string) => string;
}

function evidenceRows(
  step: PathStep,
  items: Evidence[],
  keyOf: (x: Evidence, key: string) => boolean,
  keys: string[],
) {
  return keys.map((skillId): SkillEvidence => {
    const ev = items.filter((x) => keyOf(x, skillId));
    const recent = [...ev].sort((a, b) => a.at - b.at).slice(-recentWindow(step));
    const attempts = ev.length;
    const sessions = new Set(ev.map((e) => e.session)).size;
    const days = new Set(ev.map((e) => dayKey(e.at))).size;
    const mean = recent.length ? recent.reduce((sum, e) => sum + e.score, 0) / recent.length : 0;
    return {
      skillId,
      attempts,
      sessions,
      days,
      mean,
      done:
        attempts >= step.minAttempts &&
        sessions >= step.minSessions &&
        days >= step.minDays &&
        meetsMean(step, mean),
    };
  });
}

function stepEvidence(
  step: PathStep,
  events: ScoringEvent[],
  graph: SkillGraph,
  runOf: Map<string, RunRecord>,
): SkillEvidence[] {
  // A value ending in * matches any value that starts with the rest ("reading/*": any reading shelf song).
  const matches = (param: (k: string) => string) =>
    !step.match ||
    Object.entries(step.match).every(([k, v]) =>
      v.endsWith("*") ? param(k) !== "" && param(k).startsWith(v.slice(0, -1)) : param(k) === v,
    );
  const eachKeys = step.each?.values.map((v) => `${step.each!.param}=${v}`);
  const eachOf = (x: Evidence, key: string) =>
    !step.each || `${step.each.param}=${x.param(step.each.param)}` === key;

  if (step.ladder) return ladderEvidence(step.ladder, [...runOf.values()]);

  // A levelled step without named skills is judged on its checked runs: each run's score, tempo
  // and setup, as the paths' "three clean runs at 72" reads. Per `each` value when it has one.
  if (step.level !== undefined && !step.skillIds.length) {
    if (!isGraded(step)) return [];
    const runs = [...runOf.values()].filter(
      (r) =>
        r.assistance === "independent" &&
        r.endedAt > 0 &&
        step.exerciseIds!.includes(r.exerciseId) &&
        (!step.instruments || !r.instrument || step.instruments.includes(r.instrument)) &&
        r.difficulty >= (step.minDifficulty ?? 0) - 1e-9 &&
        (step.minBpm === undefined || Number(r.params.bpm ?? 0) >= step.minBpm - 1e-9) &&
        matches((k) => String(r.params[k] ?? "")),
    );
    const items = runs.map(
      (r): Evidence => ({
        at: r.endedAt,
        score: r.score ?? (r.correct ? 1 : 0),
        session: r.id,
        param: (k) => String(r.params[k] ?? ""),
      }),
    );
    return evidenceRows(step, items, eachOf, eachKeys ?? ["drill"]);
  }

  const runParam = (e: ScoringEvent) => (k: string) =>
    String(runOf.get(e.runId ?? "")?.params[k] ?? "");
  const eligible = events.filter(
    (e) =>
      isMasteryEligible(e) &&
      (!step.modalities || step.modalities.includes(e.modality)) &&
      (!step.exerciseIds || step.exerciseIds.includes(e.exerciseId)) &&
      (!step.instruments || !e.instrument || step.instruments.includes(e.instrument)) &&
      e.difficulty >= (step.minDifficulty ?? 0) - 1e-9 &&
      (step.minBpm === undefined || Number(runParam(e)("bpm")) >= step.minBpm - 1e-9) &&
      matches(runParam(e)),
  );
  const items = eligible.map((e): Evidence & { skills: string[] } => ({
    at: e.at,
    score: e.partialCredit,
    session: e.sessionId,
    param: runParam(e),
    skills: e.skillIds,
  }));
  if (eachKeys) return evidenceRows(step, items, eachOf, eachKeys);
  return evidenceRows(
    step,
    items,
    (x, skillId) =>
      (x as (typeof items)[number]).skills.some((id) =>
        withDescendants(skillId, graph).includes(id),
      ),
    step.skillIds,
  );
}

/**
 * done: every skill has minAttempts independent attempts over minSessions sessions and minDays
 * days, and the latest attempts (recentWindow) average at least the threshold; a step with a
 * tempo counts only runs at that tempo or faster (`runs` supplies each run's bpm). A step that a
 * done step needs, directly or further back, is "review". Steps without skills are "todo" and
 * never lock or block anything. "next" is the lowest-order open, unlocked step.
 */
export function pathProgress(
  path: LearningPath,
  events: ScoringEvent[],
  graph: SkillGraph = SKILL_GRAPH,
  runs: RunRecord[] = [],
): PathProgress {
  const runOf = new Map(runs.map((r) => [r.id, r]));
  const base = new Map<string, { status: StepStatus; evidence: SkillEvidence[] }>();
  for (const step of path.steps) {
    const evidence = stepEvidence(step, events, graph, runOf);
    const status: StepStatus = !isGraded(step)
      ? "todo"
      : evidence.every((e) => e.done)
        ? "done"
        : evidence.some((e) => e.attempts > 0)
          ? "in-progress"
          : "not-assessed";
    base.set(step.id, { status, evidence });
  }
  const open = (s?: StepStatus) => s === "not-assessed" || s === "in-progress";
  const byId = new Map(path.steps.map((s) => [s.id, s]));
  const testedOut = (id: string, seen = new Set<string>()): void => {
    const step = byId.get(id);
    for (const r of [...(step?.requires ?? []), ...(step?.covers ?? [])]) {
      if (seen.has(r)) continue;
      seen.add(r);
      const b = base.get(r);
      if (b && open(b.status)) b.status = "review";
      testedOut(r, seen);
    }
  };
  for (const step of path.steps) if (base.get(step.id)!.status === "done") testedOut(step.id);
  let nextFound = false;
  const steps = path.steps.map((step): StepProgress => {
    const { status, evidence } = base.get(step.id)!;
    const almost =
      open(status) &&
      evidence.every(
        (e) => e.attempts > 0 && e.attempts >= step.minAttempts - 1 && meetsMean(step, e.mean),
      );
    if (!open(status)) return { step, status, evidence, almost };
    if (step.requires.some((r) => open(base.get(r)?.status)))
      return { step, status: "locked", evidence, almost };
    if (nextFound) return { step, status, evidence, almost };
    nextFound = true;
    return { step, status: "next", evidence, almost };
  });
  const graded = steps.filter((s) => isGraded(s.step));
  const passedStep = (s: StepProgress) => s.status === "done" || s.status === "review";
  const plays = path.levels ? songDays(path, runs) : new Map<string, number>();
  const levels = path.levels?.map((level): LevelProgress => {
    const mine = graded.filter((s) => s.step.level === level.id);
    const songs = level.shelf.map((song) => {
      const key = shelfKey(path.id, song);
      const days = plays.get(key) ?? 0;
      return { song, key, days, played: days >= 2 };
    });
    const played = songs.filter((x) => x.played).length;
    const done = mine.filter(passedStep).length;
    return {
      level,
      done,
      total: mine.length,
      songs,
      played,
      passed: done === mine.length && played >= Math.min(level.pick, songs.length),
    };
  });
  return {
    path,
    steps,
    levels,
    currentLevel: levels?.find((l) => !l.passed)?.level.id,
    done: graded.filter(passedStep).length,
    total: graded.length,
    continueHref: steps.find((s) => s.status === "next")?.step.href,
  };
}
