// Learning paths: an ordered list of steps that each open one drill (or a
// reference page) with the right setup, projected against skill mastery so a
// path knows what is done and where to continue. The Ear Training Path and the
// Jazz Path are both definitions fed through `buildLearningPath`; the drills
// themselves stay independent routes.
import {
  degradesToArpeggio,
  isMasteryEligible,
  type ScoringEvent,
  type PracticeModality,
  type ContentApplicability,
  type InstrumentId,
} from "@repo/music-core/domain";

export type LearningPathStepKind = "drill" | "review" | "reference";
export type LearningPathStepStatus =
  | "todo"
  | "not-assessed"
  | "in-progress"
  | "done"
  | "locked"
  | "next";

export interface LearningPathLink {
  label: string;
  href: string;
}

export interface LearningPathStepDefinition {
  id: string;
  order: number;
  title: string;
  /** What this step adds, in one sentence. */
  summary: string;
  /** What "done" means for the learner, in one sentence. */
  detail?: string;
  /** Resource sheets or citations this step is drawn from. */
  resources?: string[];
  /** `drill` opens a drill with its setup, `review` a mixed review, `reference` a reading page. */
  kind?: LearningPathStepKind;
  /** In-app route (with query parameters carrying the drill setup), if any. */
  href?: string;
  /** Secondary routes worth opening from this step. */
  links?: LearningPathLink[];
  /**
   * Step ids that must be `done` before this one opens. A step with an
   * unfinished prerequisite is `locked`; the lowest-order open step is `next`.
   * Paths that declare none keep their existing statuses.
   */
  requires?: string[];
  /**
   * Which attempts count as evidence for this step.
   *
   *  - `independent` (the default) is the mastery rule: only unaided Check
   *    answers count, exactly as `isMasteryEligible` defines it.
   *  - `guided-accepted` also counts `guided` attempts. It exists for steps
   *    whose drill has no Check mode yet and therefore records every run as
   *    guided, which would otherwise leave the step — and everything behind it
   *    — locked for good. Hinted attempts never count either way, and this
   *    never affects Skill Graph mastery, which keeps the strict rule.
   *
   * TODO: remove each `guided-accepted` when Check mode lands on its drill.
   */
  evidence?: "independent" | "guided-accepted";
  /** Skill Graph nodes whose mean mastery drives this step's status. */
  skillIds?: string[];
  /** Evidence must match each required skill, modality and exercise. */
  modalities?: PracticeModality[];
  exerciseIds?: string[];
  minSessions?: number;
  minAttempts?: number;
  /** How this step generalises across instruments. Defaults to `all`. */
  applies?: ContentApplicability;
}

export interface LearningPathDefinition<
  S extends LearningPathStepDefinition = LearningPathStepDefinition,
> {
  id: string;
  title: string;
  subtitle: string;
  /** The path page itself. */
  href: string;
  steps: readonly S[];
}

export interface LearningPathStepState {
  kind: LearningPathStepKind;
  applies: ContentApplicability;
  /** 0-1 mean mastery over `skillIds` (0 when none map or nothing is started). */
  mastery: number;
  status: LearningPathStepStatus;
  /** Instrument-specific note, e.g. how a voicing step adapts on a monophonic instrument. */
  instrumentNote?: string;
}

export type LearningPathStep<S extends LearningPathStepDefinition = LearningPathStepDefinition> =
  S & LearningPathStepState;

export interface LearningPath<S extends LearningPathStepDefinition = LearningPathStepDefinition> {
  steps: LearningPathStep<S>[];
  done: number;
  total: number;
  /** The first unfinished step that can be practised: where "Continue" lands. Reference steps without skills never block it. */
  next?: LearningPathStep<S>;
}

export interface LearningPathOptions {
  /** `SkillGraphStore.getMastery(id).mastery`, kept outside the engine so it stays storage-free. */
  mastery?: (skillId: string) => number;
  /** Immutable attempts; aggregate historical mastery cannot establish independence. */
  events?: readonly ScoringEvent[];
  instrument?: InstrumentId;
}

export const LEARNING_PATH_DONE_THRESHOLD = 0.66;

export function buildLearningPath<S extends LearningPathStepDefinition>(
  steps: readonly S[],
  opts: LearningPathOptions = {},
): LearningPath<S> {
  const events = [
    ...new Map((opts.events ?? []).map((event) => [event.id, event])).values(),
  ].filter((event) => !opts.instrument || event.instrument === opts.instrument);
  const projected = [...steps]
    .sort((a, b) => a.order - b.order)
    .map((step): LearningPathStep<S> => {
      const applies = step.applies ?? "all";
      const relevant = events.filter(
        (event) =>
          counts(step, event) &&
          (!step.modalities || (event.modality && step.modalities.includes(event.modality))) &&
          (!step.exerciseIds ||
            step.exerciseIds.some(
              (id) => event.exerciseId === id || event.exerciseId.startsWith(`${id}.`),
            )),
      );
      const evidence = (step.skillIds ?? []).map((id) =>
        relevant.filter((event) => event.skillIds.includes(id)),
      );
      const scores = evidence.map((attempts) =>
        attempts.length
          ? attempts.reduce((sum, event) => sum + clamp01(event.partialCredit), 0) / attempts.length
          : 0,
      );
      const mastery = scores.length
        ? scores.reduce((sum, score) => sum + score, 0) / scores.length
        : 0;
      const complete =
        evidence.length > 0 &&
        evidence.every(
          (attempts, index) =>
            scores[index]! >= LEARNING_PATH_DONE_THRESHOLD &&
            attempts.length >= (step.minAttempts ?? 1) &&
            new Set(attempts.map((event) => event.sessionId)).size >= (step.minSessions ?? 1),
        );
      const status: LearningPathStepStatus = complete
        ? "done"
        : evidence.some((attempts) => attempts.length)
          ? "in-progress"
          : step.skillIds?.length
            ? "not-assessed"
            : "todo";
      return {
        ...step,
        ...(step.links ? { links: step.links.map((link) => ({ ...link })) } : {}),
        ...(step.skillIds ? { skillIds: [...step.skillIds] } : {}),
        ...(step.resources ? { resources: [...step.resources] } : {}),
        kind: step.kind ?? "drill",
        applies,
        mastery,
        status,
        instrumentNote:
          opts.instrument && degradesToArpeggio(applies, opts.instrument)
            ? "On a monophonic instrument these voicings are played as arpeggios."
            : undefined,
      };
    });
  // Prerequisite edges are opt-in per path: a path that declares none keeps
  // exactly the statuses it had before `locked`/`next` existed.
  if (projected.some((step) => step.requires?.length)) {
    // A step with no skills of its own is never measured, so it can never be
    // `done` and must not gate anything. `projected` is sorted by order and
    // every `requires` points backwards, so one forward pass that writes its
    // own result back is enough for locking to propagate down the chain.
    const done = new Map(
      projected.map((step) => [step.id, step.status === "done" || !step.skillIds?.length]),
    );
    for (const step of projected) {
      if (step.requires?.some((id) => !done.get(id))) {
        step.status = "locked";
        done.set(step.id, false);
      }
    }
    const open = projected.find(
      (step) => step.skillIds?.length && step.status !== "done" && step.status !== "locked",
    );
    if (open) open.status = "next";
  }

  const measured = projected.filter((step) => step.skillIds?.length);
  return {
    steps: projected,
    done: measured.filter((step) => step.status === "done").length,
    total: measured.length,
    next: measured.find((step) => step.status !== "done" && step.status !== "locked"),
  };
}

/** Whether one attempt is evidence for this step (see `evidence`). */
function counts(step: LearningPathStepDefinition, event: ScoringEvent): boolean {
  return (
    isMasteryEligible(event) ||
    (step.evidence === "guided-accepted" && event.assistance === "guided")
  );
}

function clamp01(value: number): number {
  return Number.isFinite(value) ? Math.min(1, Math.max(0, value)) : 0;
}

// Import cycle by design: `instrument-paths` imports `buildLearningPath` from
// here, and only ever calls it from inside a function. Do not read a `const`
// exported from this file at `instrument-paths` module scope — it would be in
// its temporal dead zone at import time.
export * from "./instrument-paths";
