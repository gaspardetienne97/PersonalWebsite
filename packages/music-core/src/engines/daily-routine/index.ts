import type { ExerciseRunRecord, ScoringEvent, UnixMs } from "@repo/music-core/domain";

export interface DailyRoutineRecommendation {
  skillId: string;
  skillName: string;
  href: string;
}

export interface DailyRoutineStep {
  id: string;
  label: string;
  href: string;
  description: string;
  skillId?: string;
}

export interface DailyRoutineCapture {
  scoringEvents: ScoringEvent[];
  xpEarned: number;
  note?: string;
  runs?: ExerciseRunRecord[];
  tags?: string[];
}

export interface DailyRoutineStepResult extends DailyRoutineCapture {
  accuracy: number;
  completedAt: UnixMs;
}

export interface DailyRoutineStepState extends DailyRoutineStep {
  status: "pending" | "active" | "completed";
  result?: DailyRoutineStepResult;
}

export interface DailyRoutineSummary {
  completedSteps: number;
  totalSteps: number;
  totalXp: number;
  accuracy: number;
  durationMs: number;
  scoringEvents: ScoringEvent[];
  runs: ExerciseRunRecord[];
  tags: string[];
}

export interface DailyRoutineState {
  id?: string;
  status: "ready" | "active" | "summary";
  startedAt?: UnixMs;
  endedAt?: UnixMs;
  currentIndex: number;
  currentStep?: DailyRoutineStepState;
  steps: DailyRoutineStepState[];
  summary?: DailyRoutineSummary;
}

const DEFAULT_STEPS: DailyRoutineStep[] = [
  {
    id: "ear",
    label: "Ear training review",
    href: "/music/learn/ear/mixed",
    description: "Recognition and weak-spot review.",
  },
  {
    id: "reading",
    label: "Note Reading",
    href: "/music/learn/reading",
    description: "Read notes with MIDI or on-screen input.",
  },
  {
    id: "rhythm",
    label: "Rhythm",
    href: "/music/learn/rhythm",
    description: "Lock timing to a steady pulse.",
  },
  {
    id: "scales",
    label: "Scales & Technique",
    href: "/music/play/scales",
    description: "Finish with a clean technique run.",
  },
];

const RECOMMENDED_STEPS: DailyRoutineStep[] = [
  {
    id: "voicings",
    label: "ii-V-I Voicings",
    href: "/music/play/voicings",
    description: "Cycle the graded ii-V-I drill through all 12 keys.",
  },
  {
    id: "spider",
    label: "String Independence",
    href: "/music/play/spider",
    description: "Run focused fretting permutations and note-finder work.",
  },
  {
    id: "chord-perfect",
    label: "Chord Work",
    href: "/music/play/chord-perfect",
    description: "Clean up chord shapes, recognition, and changes.",
  },
  {
    id: "two-hand",
    label: "Two-Hand Piano",
    href: "/music/play/two-hand",
    description: "Practice hand independence on the keyboard.",
  },
  {
    id: "mpc",
    label: "MPC Rudiments",
    href: "/music/play/mpc",
    description: "Build pad timing and rudiment control.",
  },
  {
    id: "aerophone",
    label: "Aerophone Technique",
    href: "/music/learn/aerophone",
    description: "Shape breath, articulation, dynamics, and interval landings.",
  },
  ...DEFAULT_STEPS,
];

export function buildDailyRoutinePlan(
  recommendations: DailyRoutineRecommendation[],
): DailyRoutineStep[] {
  const stepsByHref = new Map(RECOMMENDED_STEPS.map((step) => [hrefRouteKey(step.href), step]));
  const selected: DailyRoutineStep[] = [];
  const seen = new Set<string>();

  for (const recommendation of recommendations) {
    const routeKey = hrefRouteKey(recommendation.href);
    const step = stepsByHref.get(routeKey);
    if (!step || seen.has(routeKey)) continue;
    selected.push({ ...step, href: recommendation.href, skillId: recommendation.skillId });
    seen.add(routeKey);
  }

  for (const step of DEFAULT_STEPS) {
    const routeKey = hrefRouteKey(step.href);
    if (seen.has(routeKey)) continue;
    selected.push({ ...step });
    seen.add(routeKey);
  }

  return selected;
}

export class DailyRoutineSession {
  #state: DailyRoutineState;

  constructor(steps: DailyRoutineStep[]) {
    if (steps.length === 0) throw new Error("Daily routine requires at least one step.");
    this.#state = {
      status: "ready",
      currentIndex: 0,
      steps: steps.map((step, index) => ({
        ...step,
        status: index === 0 ? "active" : "pending",
      })),
    };
  }

  get state(): DailyRoutineState {
    const state = clone(this.#state);
    state.currentStep = state.status === "summary" ? undefined : state.steps[state.currentIndex];
    return state;
  }

  start(id: string, startedAt: UnixMs): void {
    if (!id.trim()) throw new Error("Daily routine id must be nonempty.");
    if (this.#state.status !== "ready") throw new Error("Daily routine has already started.");
    this.#state.id = id;
    this.#state.startedAt = startedAt;
    this.#state.status = "active";
  }

  completeCurrent(capture: DailyRoutineCapture, endedAt: UnixMs): void {
    if (this.#state.status !== "active" || this.#state.startedAt === undefined) {
      throw new Error("Daily routine is not active.");
    }
    const current = this.#state.steps[this.#state.currentIndex];
    if (!current) throw new Error("Daily routine has no current step.");

    current.status = "completed";
    current.result = {
      ...clone(capture),
      runs: clone(capture.runs ?? []),
      accuracy: meanAccuracy(capture.scoringEvents),
      completedAt: endedAt,
    };

    if (this.#state.currentIndex < this.#state.steps.length - 1) {
      this.#state.currentIndex += 1;
      this.#state.steps[this.#state.currentIndex]!.status = "active";
      return;
    }

    this.#state.status = "summary";
    this.#state.endedAt = endedAt;
    const completed = this.#state.steps.flatMap((step) => (step.result ? [step.result] : []));
    const scoringEvents = completed.flatMap((result) => result.scoringEvents);
    this.#state.summary = {
      completedSteps: completed.length,
      totalSteps: this.#state.steps.length,
      totalXp: completed.reduce((total, result) => total + result.xpEarned, 0),
      accuracy: meanAccuracy(scoringEvents),
      durationMs: Math.max(0, endedAt - this.#state.startedAt),
      scoringEvents: clone(scoringEvents),
      runs: clone(completed.flatMap((result) => result.runs ?? [])),
      tags: [...new Set(completed.flatMap((result) => result.tags ?? []))],
    };
  }
}

function meanAccuracy(events: ScoringEvent[]): number {
  if (events.length === 0) return 0;
  return events.reduce((total, event) => total + event.partialCredit, 0) / events.length;
}

function clone<T>(value: T): T {
  return structuredClone(value);
}

/**
 * The route family a link belongs to. Every ear drill (`/music/learn/ear/<slug>`)
 * shares one family so a per-drill recommendation still binds to the routine's
 * single ear step.
 */
function hrefRouteKey(href: string): string {
  const path = href.split(/[?#]/, 1)[0] ?? href;
  return path.startsWith("/music/learn/ear/") ? "/music/learn/ear" : path;
}
