// Learning paths (catalog 5.8): the five paths in one shape, on the new routes, with status
// from independent evidence only. `guided-accepted` is gone: every drill has a Check mode now.
import { isMasteryEligible, type Instrument, type Modality, type ScoringEvent } from "../types";
import pathData from "../data/learning-paths.json";
import earData from "../data/ear-training.json";
import jazzData from "../data/jazz.json";
import { SKILL_GRAPH, withDescendants, type SkillGraph } from "./graph";

export type PathId = "ear" | "jazz" | "guitar" | "piano" | "mpc";

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
  requires?: string[];
  applies?: string | { only?: string[] };
}

/** P-I4 and P-A1 open the comping route (catalog weakness 3) instead of the two-hand stand-in. */
const COMPING = (pattern: string) => `/music/comping?pattern=${pattern}&instrument=piano&bpm=90`;
const OVERRIDES: Record<string, Partial<PathStep>> = {
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
    requires: raw.requires ?? [],
    instruments: typeof applies === "object" ? (applies.only as Instrument[]) : undefined,
    content: applies === "pitched" || applies === "polyphonic" ? applies : undefined,
  };
  return { ...step, ...OVERRIDES[raw.id] };
}

const path = (id: PathId, title: string, subtitle: string, steps: RawStep[]): LearningPath => ({
  id,
  title,
  subtitle,
  steps: steps.map(normaliseStep).sort((a, b) => a.order - b.order),
});

const { guitar, piano, mpc } = pathData.paths;
const ear = earData.learningPathDefinition;

export const LEARNING_PATHS: Record<PathId, LearningPath> = {
  ear: path("ear", ear.title, ear.subtitle, ear.steps as RawStep[]),
  jazz: path(
    "jazz",
    "Jazz Path",
    "Ten lessons from intervals to a Real Book, built on the ii-V-I.",
    jazzData.JAZZ_CURRICULUM as RawStep[],
  ),
  guitar: path("guitar", guitar.title, guitar.subtitle, guitar.steps as RawStep[]),
  piano: path("piano", piano.title, piano.subtitle, piano.steps as RawStep[]),
  mpc: path("mpc", mpc.title, mpc.subtitle, mpc.steps as RawStep[]),
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
      (!step.instruments || !e.instrument || step.instruments.includes(e.instrument)),
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
      done: attempts >= step.minAttempts && sessions >= step.minSessions && mean >= DONE_THRESHOLD,
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
