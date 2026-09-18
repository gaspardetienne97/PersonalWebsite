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
export type LearningPathStepStatus = "todo" | "not-assessed" | "in-progress" | "done";

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
  ].filter(
    (event) =>
      isMasteryEligible(event) && (!opts.instrument || event.instrument === opts.instrument),
  );
  const projected = [...steps]
    .sort((a, b) => a.order - b.order)
    .map((step): LearningPathStep<S> => {
      const applies = step.applies ?? "all";
      const relevant = events.filter(
        (event) =>
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
  const measured = projected.filter((step) => step.skillIds?.length);
  return {
    steps: projected,
    done: measured.filter((step) => step.status === "done").length,
    total: measured.length,
    next: measured.find((step) => step.status !== "done"),
  };
}

function clamp01(value: number): number {
  return Number.isFinite(value) ? Math.min(1, Math.max(0, value)) : 0;
}
