// Learning paths (catalog 5.8): the five paths in one shape, on the new routes, with status
// from independent evidence only. `guided-accepted` is gone: every drill has a Check mode now.
import { isMasteryEligible, type Instrument, type Modality, type ScoringEvent } from "../types";
import pathData from "../data/learning-paths.json";
import earData from "../data/ear-training.json";
import { EAR_ADDED_STEPS, EAR_TABLE_STEPS } from "../content/ear";
import jazzData from "../data/jazz.json";
import { SKILL_GRAPH, withDescendants, type SkillGraph } from "./graph";

export type PathId = "ear" | "jazz" | "guitar" | "piano" | "mpc" | "studio";

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
  kind: "drill" | "reference" | "review";
  href: string;
  links: PathLink[];
  skillIds: string[];
  exerciseIds?: string[];
  modalities?: Modality[];
  minAttempts: number;
  minSessions: number;
  /** Mean credit for done; the paths' usual 0.66 when missing. */
  threshold?: number;
  /** Only runs at least this hard count, so a step can ask for a harder setup. */
  minDifficulty?: number;
  requires: string[];
  /** Pinned to these instruments; evidence from another instrument does not count. */
  instruments?: Instrument[];
  /** Content applicability: melodic lines are pitched, voicings polyphonic. */
  content?: "pitched" | "polyphonic";
}

export interface LearningPath {
  id: PathId;
  title: string;
  subtitle: string;
  steps: PathStep[];
}

export const DONE_THRESHOLD = pathData.doneThreshold;

// ---------------------------------------------------------------------------
// Old hrefs onto the new routes. Query parameters (the setup) are kept.

export const NEW_ROUTES = [
  "/music/ear/",
  "/music/reading",
  "/music/rhythm",
  "/music/scales",
  "/music/fretboard",
  "/music/chords",
  "/music/two-hand",
  "/music/comping",
  "/music/pads",
  "/music/aerophone",
  "/music/voicings",
  "/music/licks",
  "/music/chord-scales",
  "/music/jam",
  "/music/library",
  "/music/listening",
] as const;

const PATH_MAP: Record<string, string> = {
  "/music/learn/reading": "/music/reading",
  "/music/learn/rhythm": "/music/rhythm",
  "/music/learn/aerophone": "/music/aerophone",
  "/music/learn/jazz": "/music/library?tab=reference",
  "/music/play/scales": "/music/scales",
  "/music/play/spider": "/music/fretboard",
  "/music/play/chord-perfect": "/music/chords",
  "/music/play/two-hand": "/music/two-hand",
  "/music/play/mpc": "/music/pads",
  "/music/play/voicings": "/music/voicings",
  "/music/play/licks": "/music/licks",
  "/music/play/chord-scales": "/music/chord-scales",
  "/music/jam": "/music/jam",
  "/music/library": "/music/library",
  "/music/listening": "/music/listening",
};

export function rewriteHref(href: string): string {
  const [path, query = ""] = href.split("?");
  const target = path.startsWith("/music/learn/ear/")
    ? path.replace("/music/learn/ear/", "/music/ear/")
    : PATH_MAP[path];
  if (!target) throw new Error(`No new route for ${href}`);
  const [newPath, newQuery = ""] = target.split("?");
  const q = new URLSearchParams(newQuery);
  for (const [k, v] of new URLSearchParams(query)) q.set(k, v);
  const qs = q.toString();
  return qs ? `${newPath}?${qs}` : newPath;
}

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
  threshold?: number;
  minDifficulty?: number;
  requires?: string[];
  applies?: string | { only?: string[] };
}

/** P-I4 and P-A1 open the comping route (catalog weakness 3) instead of the two-hand stand-in. */
const COMPING = (pattern: string) => `/music/comping?pattern=${pattern}&instrument=piano&bpm=90`;
const REFERENCE = (section: string) => `/music/library?tab=reference&section=${section}`;
const OVERRIDES: Record<string, Partial<PathStep>> = {
  "chord-symbols": { href: REFERENCE("vocabulary") },
  extensions: { href: REFERENCE("vocabulary") },
  "shell-voicings": { href: REFERENCE("voicings") },
  "P-I4": { kind: "drill", href: COMPING("blue-third-c7") },
  "P-A1": {
    kind: "drill",
    href: COMPING("blue-third-f7"),
    links: [{ label: "G7", href: COMPING("blue-third-g7") }],
  },
};

function normaliseStep(raw: RawStep): PathStep {
  const applies = raw.applies;
  const step: PathStep = {
    id: raw.id,
    order: raw.order,
    title: raw.title,
    summary: raw.summary,
    detail: raw.detail,
    kind: raw.kind === "reference" || raw.kind === "review" ? raw.kind : "drill",
    href: rewriteHref(raw.href),
    links: (raw.links ?? []).map((l) => ({ label: l.label, href: rewriteHref(l.href) })),
    skillIds: raw.skillIds ?? (raw.skillId ? [raw.skillId] : []),
    exerciseIds: raw.exerciseIds,
    modalities: raw.modalities as Modality[] | undefined,
    minAttempts: raw.minAttempts ?? 1,
    minSessions: raw.minSessions ?? 1,
    threshold: raw.threshold,
    minDifficulty: raw.minDifficulty,
    requires: raw.requires ?? [],
    instruments: typeof applies === "object" ? (applies.only as Instrument[]) : undefined,
    content: applies === "pitched" || applies === "polyphonic" ? applies : undefined,
  };
  const merged = { ...step, ...OVERRIDES[raw.id] };
  return ADDED_LINKS[raw.id]
    ? {
        ...merged,
        links: [
          ...merged.links,
          ...ADDED_LINKS[raw.id].map((l) => ({ ...l, href: rewriteHref(l.href) })),
        ],
      }
    : merged;
}

// ---------------------------------------------------------------------------
// What the aural-skills research adds to the instrument paths: ear steps where a
// skill is about to be needed, and ear links beside the steps they support.

const EAR = (drill: string, q: string) => `/music/learn/ear/${drill}?answer=choice&${q}`;
const ADDED_LINKS: Record<string, PathLink[]> = {
  "G-B1": [
    { label: "Major or minor by ear", href: EAR("chord-qualities", "qualities=major,minor") },
  ],
  "G-I3": [
    {
      label: "Pentatonics and blues by ear",
      href: EAR("scales", "scales=major-pentatonic,minor-pentatonic,blues"),
    },
  ],
  "G-A2": [
    {
      label: "Play a heard phrase back",
      href: "/music/learn/ear/melody-dictation?answer=play-back&level=major-pentachord",
    },
  ],
  "P-I1": [{ label: "Inversions by ear", href: EAR("inversions", "inversions=root,first,second") }],
  "P-I2": [
    { label: "Follow the bass", href: EAR("bass-lines", "bassLevel=roots-primary") },
    { label: "I, IV, V progressions by ear", href: EAR("progressions", "functions=I,IV,V") },
  ],
  "P-I4": [
    { label: "The blues scale by ear", href: EAR("scales", "scales=major,minor-pentatonic,blues") },
    {
      label: "Sevenths by ear",
      href: EAR("chord-qualities", "qualities=major-7,dominant-7,minor-7"),
    },
  ],
  "chord-symbols": [
    {
      label: "Seventh chords by ear",
      href: EAR(
        "chord-qualities",
        "qualities=major-7,dominant-7,minor-7,half-diminished-7,diminished-7",
      ),
    },
  ],
  "chord-scales": [
    { label: "Modes by ear", href: EAR("scales", "scales=mixolydian,dorian,lydian,locrian") },
  ],
  "rootless-voicings": [
    {
      label: "ii7, V7, Imaj7 by ear",
      href: EAR("progressions", "functions=I,ii,V&chordSize=sevenths"),
    },
    {
      label: "iiø7, V7, i by ear",
      href: EAR("progressions", "functions=I,ii,V&chordSize=sevenths&keyMode=minor"),
    },
  ],
  improv: [
    {
      label: "Sing a phrase back",
      href: "/music/learn/ear/melody-dictation?answer=voice&level=major-pentachord",
    },
  ],
};

const ECHO = (level: string) => `/music/learn/rhythm?mode=echo&earLevel=${level}`;
const ADDED_STEPS: Partial<Record<PathId, RawStep[]>> = {
  mpc: [
    {
      id: "M-E1",
      order: 1.5,
      title: "Echo a bar on the pads",
      summary: "Hear a bar of quarters and eighths over the click, then play it back on a pad.",
      detail: "Five unaided echoes averaging 75% or higher.",
      href: ECHO("quarters-eighths"),
      exerciseIds: ["rhythm.echo"],
      skillIds: ["ear.rhythm-echo"],
      minAttempts: 5,
      threshold: 0.75,
    },
    {
      id: "M-E2",
      order: 2.5,
      title: "Echo sixteenths",
      summary: "Two bars with sixteenths in them: hear them, play them back.",
      detail: "Five unaided echoes at the sixteenths level or harder, averaging 75% or higher.",
      href: ECHO("sixteenths"),
      exerciseIds: ["rhythm.echo"],
      skillIds: ["ear.rhythm-echo"],
      minAttempts: 5,
      threshold: 0.75,
      minDifficulty: 0.59,
    },
    {
      id: "M-E3",
      order: 4.5,
      title: "Write a groove's rhythm down",
      summary: "Hear two bars with sixteenths, then mark every hit on the grid.",
      detail: "Five unaided dictations at the sixteenths level or harder, averaging 75% or higher.",
      href: "/music/learn/rhythm?mode=dictation&earLevel=sixteenths",
      exerciseIds: ["rhythm.dictation"],
      skillIds: ["ear.rhythm-dictation"],
      minAttempts: 5,
      threshold: 0.75,
      minDifficulty: 0.59,
    },
    {
      id: "M-S1",
      order: 8.5,
      title: "Hear the kit in the mix",
      summary: "A drum loop with one band boosted: find it. The Studio ears path goes further.",
      detail: "Twenty unaided answers on five bands or more, averaging 70% or higher.",
      href: "/music/listening?exercise=peak&bands=5&material=drums",
      links: [
        { label: "How many dB louder", href: "/music/listening?exercise=level&material=drums" },
      ],
      exerciseIds: ["studio.peak"],
      skillIds: ["studio.eq-peak"],
      minAttempts: 20,
      threshold: 0.7,
      minDifficulty: 0.45,
    },
  ],
  guitar: [
    {
      id: "G-E1",
      order: 3.5,
      title: "Echo a strum rhythm",
      summary: "Hear two bars with dotted quarters and rests, then strum them back.",
      detail: "Five unaided echoes at the dotted level or harder, averaging 75% or higher.",
      href: ECHO("dotted"),
      exerciseIds: ["rhythm.echo"],
      skillIds: ["ear.rhythm-echo"],
      minAttempts: 5,
      threshold: 0.75,
      minDifficulty: 0.51,
    },
  ],
  piano: [
    {
      id: "P-E1",
      order: 8.5,
      title: "Spot the wrong note",
      summary:
        "Follow a written melody by ear and find the note played wrong, before sight-reading one.",
      detail: "Twenty unaided answers averaging 66% or higher.",
      href: "/music/learn/ear/wrong-note?level=major-diatonic",
      exerciseIds: ["ear.error-detection"],
      skillIds: ["ear.error-detection"],
      minAttempts: 20,
    },
  ],
};

// Studio ears: its own path (timbre and frequency memory, not pitch), in the
// research's order: 3 bands on noise, 5 then 9, loops, cuts, smaller gains,
// then boost or cut, level and pan. Thresholds stay under the ~78% trained
// students reach on 9 bands of music (Marui and Kamekawa 2018).
const L = (q: string) => `/music/listening?${q}`;
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

const { guitar, piano, mpc } = pathData.paths;
const ear = earData.learningPathDefinition;

export const LEARNING_PATHS: Record<PathId, LearningPath> = {
  ear: path("ear", ear.title, ear.subtitle, [
    ...(EAR_TABLE_STEPS as RawStep[]),
    ...(EAR_ADDED_STEPS as RawStep[]),
  ]),
  jazz: path(
    "jazz",
    "Jazz Path",
    "Ten lessons from intervals to a Real Book, built on the ii-V-I.",
    jazzData.JAZZ_CURRICULUM as RawStep[],
  ),
  guitar: path("guitar", guitar.title, guitar.subtitle, [
    ...(guitar.steps as RawStep[]),
    ...ADDED_STEPS.guitar!,
  ]),
  piano: path("piano", piano.title, piano.subtitle, [
    ...(piano.steps as RawStep[]),
    ...ADDED_STEPS.piano!,
  ]),
  mpc: path("mpc", mpc.title, mpc.subtitle, [...(mpc.steps as RawStep[]), ...ADDED_STEPS.mpc!]),
  studio: path(
    "studio",
    "Studio Ears Path",
    "Hear EQ, level and pan the way a producer does: noise first, then loops, smaller moves last.",
    STUDIO_STEPS,
  ),
};

// ---------------------------------------------------------------------------
// Status

export type StepStatus = "todo" | "not-assessed" | "in-progress" | "done" | "locked" | "next";

export interface SkillEvidence {
  skillId: string;
  attempts: number;
  sessions: number;
  mean: number;
  done: boolean;
}

export interface StepProgress {
  step: PathStep;
  status: StepStatus;
  evidence: SkillEvidence[];
}

export interface PathProgress {
  path: LearningPath;
  steps: StepProgress[];
  /** Steps with skills that are done, out of steps with skills. */
  done: number;
  total: number;
  continueHref?: string;
}

function stepEvidence(step: PathStep, events: ScoringEvent[], graph: SkillGraph): SkillEvidence[] {
  const eligible = events.filter(
    (e) =>
      isMasteryEligible(e) &&
      (!step.modalities || step.modalities.includes(e.modality)) &&
      (!step.exerciseIds || step.exerciseIds.includes(e.exerciseId)) &&
      (!step.instruments || !e.instrument || step.instruments.includes(e.instrument)) &&
      e.difficulty >= (step.minDifficulty ?? 0) - 1e-9,
  );
  return step.skillIds.map((skillId) => {
    const ids = new Set(withDescendants(skillId, graph));
    const ev = eligible.filter((e) => e.skillIds.some((id) => ids.has(id)));
    const attempts = ev.length;
    const sessions = new Set(ev.map((e) => e.sessionId)).size;
    const mean = attempts ? ev.reduce((sum, e) => sum + e.partialCredit, 0) / attempts : 0;
    return {
      skillId,
      attempts,
      sessions,
      mean,
      done:
        attempts >= step.minAttempts &&
        sessions >= step.minSessions &&
        mean >= (step.threshold ?? DONE_THRESHOLD),
    };
  });
}

/**
 * done: every skill has minAttempts independent attempts over minSessions sessions averaging
 * >= 0.66. Steps without skills are "todo" and never lock or block anything. A done step stays
 * done even if a prerequisite is unfinished. "next" is the lowest-order open, unlocked step.
 */
export function pathProgress(
  path: LearningPath,
  events: ScoringEvent[],
  graph: SkillGraph = SKILL_GRAPH,
): PathProgress {
  const base = new Map<string, { status: StepStatus; evidence: SkillEvidence[] }>();
  for (const step of path.steps) {
    const evidence = stepEvidence(step, events, graph);
    const status: StepStatus = !step.skillIds.length
      ? "todo"
      : evidence.every((e) => e.done)
        ? "done"
        : evidence.some((e) => e.attempts > 0)
          ? "in-progress"
          : "not-assessed";
    base.set(step.id, { status, evidence });
  }
  const open = (s?: StepStatus) => s === "not-assessed" || s === "in-progress";
  let nextFound = false;
  const steps = path.steps.map((step): StepProgress => {
    const { status, evidence } = base.get(step.id)!;
    if (!open(status)) return { step, status, evidence };
    if (step.requires.some((r) => open(base.get(r)?.status)))
      return { step, status: "locked", evidence };
    if (nextFound) return { step, status, evidence };
    nextFound = true;
    return { step, status: "next", evidence };
  });
  const graded = steps.filter((s) => s.step.skillIds.length);
  return {
    path,
    steps,
    done: graded.filter((s) => s.status === "done").length,
    total: graded.length,
    continueHref: steps.find((s) => s.status === "next")?.step.href,
  };
}
