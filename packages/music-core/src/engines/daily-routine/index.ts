import type {
  ExerciseRunRecord,
  ScoringEvent,
  UnixMs,
  InstrumentId,
} from "@repo/music-core/domain";

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
  minutes: number;
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

const DEFAULT_STEPS: Omit<DailyRoutineStep, "minutes">[] = [
  {
    id: "ear",
    label: "Ear training review",
    href: "/music/learn/ear/scale-degrees?level=anchor",
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

const RECOMMENDED_STEPS: Omit<DailyRoutineStep, "minutes">[] = [
  {
    id: "chord-scales",
    label: "Chord-scale review",
    href: "/music/play/chord-scales",
    description: "Review the scale for each chord.",
  },
  {
    id: "licks",
    label: "Lick recall",
    href: "/music/play/licks",
    description: "Recall a phrase over the changes.",
  },
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

export interface DailyRoutineOptions {
  instrument?: InstrumentId;
  budgetMinutes?: number;
}

const INSTRUMENT_STEPS: Record<InstrumentId, string[]> = {
  piano: ["scales", "ear", "reading", "rhythm"],
  guitar: ["spider", "ear", "chord-perfect", "rhythm"],
  ukulele: ["spider", "ear", "chord-perfect", "rhythm"],
  mpc: ["mpc", "rhythm"],
  aerophone: ["aerophone", "ear", "rhythm", "scales"],
  voice: ["ear", "rhythm"],
};
const STEP_INSTRUMENTS: Record<string, InstrumentId[]> = {
  "chord-scales": ["piano", "guitar", "ukulele", "aerophone"],
  licks: ["piano", "guitar", "ukulele", "aerophone"],
  reading: ["piano", "guitar", "ukulele"],
  scales: ["piano", "guitar", "ukulele", "aerophone"],
  voicings: ["piano"],
  spider: ["guitar", "ukulele"],
  "chord-perfect": ["guitar", "ukulele"],
  "two-hand": ["piano"],
  mpc: ["mpc"],
  aerophone: ["aerophone"],
};

export function buildDailyRoutinePlan(
  recommendations: DailyRoutineRecommendation[],
  options: DailyRoutineOptions = {},
): DailyRoutineStep[] {
  const stepsByHref = new Map(RECOMMENDED_STEPS.map((step) => [hrefRouteKey(step.href), step]));
  const selected: DailyRoutineStep[] = [];
  const seen = new Set<string>();

  for (const recommendation of recommendations) {
    const routeKey = hrefRouteKey(recommendation.href);
    const step = stepsByHref.get(routeKey);
    if (
      !step ||
      seen.has(routeKey) ||
      (options.instrument &&
        STEP_INSTRUMENTS[step.id] &&
        !STEP_INSTRUMENTS[step.id]!.includes(options.instrument))
    )
      continue;
    selected.push({
      ...step,
      minutes: 5,
      href: recommendation.href,
      skillId: recommendation.skillId,
    });
    seen.add(routeKey);
  }

  const defaults = options.instrument
    ? INSTRUMENT_STEPS[options.instrument].map(
        (id) => RECOMMENDED_STEPS.find((step) => step.id === id)!,
      )
    : DEFAULT_STEPS;
  for (const step of defaults) {
    const routeKey = hrefRouteKey(step.href);
    if (seen.has(routeKey)) continue;
    selected.push({ ...step, minutes: 5 });
    seen.add(routeKey);
  }

  const budget = Number.isFinite(options.budgetMinutes)
    ? Math.max(1, Math.min(120, Math.floor(options.budgetMinutes!)))
    : 20;
  let remaining = budget;
  return selected.flatMap((step) => {
    if (remaining <= 0) return [];
    const minutes = Math.min(step.minutes, remaining);
    remaining -= minutes;
    const url = new URL(step.href, "https://routine.local");
    if (options.instrument) url.searchParams.set("instrument", options.instrument);
    if (options.instrument === "voice" && step.id === "ear") {
      url.pathname = "/music/learn/ear/scale-degrees";
      url.searchParams.set("answer", "voice");
    }
    return [{ ...step, minutes, href: `${url.pathname}${url.search}${url.hash}` }];
  });
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
