// The one daily routine builder (catalog 5.7). Nothing else defines routine steps.
import type { Instrument, PracticeSession, RunRecord, ScoringEvent } from "../types";
import { clamp } from "../theory/notes";
import routineData from "../data/daily-routine.json";

export type StepId =
  | "ear"
  | "reading"
  | "rhythm"
  | "scales"
  | "spider"
  | "chord-perfect"
  | "two-hand"
  | "comping"
  | "mpc"
  | "aerophone"
  | "voicings"
  | "licks"
  | "chord-scales";

/** "none" marks steps allowed in the plan built without an instrument. */
type Slot = Instrument | "none";

interface StepDef {
  label: string;
  description: string;
  route: string;
  for: Slot[];
}

const fromData = (id: string) => {
  const s =
    routineData.genericPlan.find((x) => x.id === id) ??
    Object.values(routineData.plansByInstrument)
      .flat()
      .find((x) => x.id === id)!;
  return { label: s.label, description: s.description };
};

const PITCHED: Slot[] = ["piano", "guitar", "ukulele", "aerophone"];

export const STEPS: Record<StepId, StepDef> = {
  ear: { ...fromData("ear"), route: "/music/ear/mixed", for: ["none", ...PITCHED, "mpc", "voice"] },
  reading: { ...fromData("reading"), route: "/music/reading", for: ["none", ...PITCHED] },
  rhythm: {
    ...fromData("rhythm"),
    route: "/music/rhythm",
    for: ["none", ...PITCHED, "mpc", "voice"],
  },
  scales: { ...fromData("scales"), route: "/music/scales", for: ["none", "piano", "aerophone"] },
  spider: { ...fromData("spider"), route: "/music/fretboard", for: ["guitar", "ukulele"] },
  "chord-perfect": {
    ...fromData("chord-perfect"),
    route: "/music/chords",
    for: ["guitar", "ukulele"],
  },
  mpc: { ...fromData("mpc"), route: "/music/pads", for: ["mpc"] },
  aerophone: { ...fromData("aerophone"), route: "/music/aerophone", for: ["aerophone"] },
  "two-hand": {
    label: "Two-Hand Piano",
    description: "Independent hands, locked to one pulse.",
    route: "/music/two-hand",
    for: ["piano"],
  },
  comping: {
    label: "Comping",
    description: "A line over a left-hand comp rhythm.",
    route: "/music/comping",
    for: ["piano"],
  },
  voicings: {
    label: "ii-V-I Voicings",
    description: "Rootless voicings through the keys.",
    route: "/music/voicings",
    for: ["piano"],
  },
  licks: {
    label: "Lick recall",
    description: "Hear a line, play it back.",
    route: "/music/licks",
    for: ["none", ...PITCHED],
  },
  "chord-scales": {
    label: "Chord-scale review",
    description: "One go-to scale per chord in a ii-V-I.",
    route: "/music/chord-scales",
    for: ["none", ...PITCHED],
  },
};

const DEFAULTS: Record<Slot, StepId[]> = {
  none: routineData.genericPlan.map((s) => s.id as StepId),
  ...(Object.fromEntries(
    Object.entries(routineData.plansByInstrument).map(([k, v]) => [
      k,
      v.map((s) => s.id as StepId),
    ]),
  ) as Record<Instrument, StepId[]>),
};

/** Which routine step practises a skill. Every ear skill binds to the single ear step. */
export function stepForSkill(skillId: string): StepId | undefined {
  const rules: [RegExp, StepId][] = [
    [/^(pitch\.|ear\.|harmony\.(triad|seventh))/, "ear"],
    [/^reading\./, "reading"],
    [/^rhythm\./, "rhythm"],
    [/^technique\.scale/, "scales"],
    [/chord-perfect|chord-changes|open-chord-id/, "chord-perfect"],
    [/^technique\.(strings|guitar|ukulele)/, "spider"],
    [/^technique\.piano\.comping/, "comping"],
    [/^technique\.piano/, "two-hand"],
    [/^technique\.mpc/, "mpc"],
    [/^(technique\.aerophone|intonation\.)/, "aerophone"],
    [/^harmony\.ii-v-i\.licks/, "licks"],
    [/^harmony\.ii-v-i\.chord-scales/, "chord-scales"],
    [/^harmony\.ii-v-i/, "voicings"],
  ];
  return rules.find(([re]) => re.test(skillId))?.[1];
}

export const stepAllowed = (step: StepId, instrument?: Instrument) =>
  STEPS[step].for.includes(instrument ?? "none");

export interface RoutineStep {
  /** 1-based position, also the `step` query parameter. */
  n: number;
  id: StepId;
  label: string;
  description: string;
  minutes: number;
  href: string;
  reason: "weak-spot" | "default";
  skillId?: string;
}

export interface Routine {
  id: string;
  instrument?: Instrument;
  budgetMinutes: number;
  steps: RoutineStep[];
}

export const MINUTES_PER_STEP = routineData.minutesPerStep;
export const BUDGET_OPTIONS = [5, 10, 20, 30] as const;

export function stepHref(step: StepId, n: number, routineId: string, instrument?: Instrument) {
  const q = new URLSearchParams();
  if (instrument) q.set("instrument", instrument);
  if (step === "ear" && instrument === "voice") q.set("answer", "voice");
  q.set("routine", routineId);
  q.set("step", String(n));
  return `${STEPS[step].route}?${q}`;
}

/**
 * Weak-skill steps first (deduped by step, so every ear drill shares one slot), then the
 * instrument's defaults, truncated to the budget. Each step is 5 minutes; a budget under 5
 * still gets one step of that length.
 */
export function buildRoutine(input: {
  id: string;
  instrument?: Instrument;
  budgetMinutes?: number;
  weakSkillIds?: string[];
}): Routine {
  const { id, instrument } = input;
  const budget = clamp(Math.round(input.budgetMinutes ?? routineData.defaultBudgetMinutes), 1, 120);
  const count = Math.max(1, Math.floor(budget / MINUTES_PER_STEP));
  const picks: { id: StepId; reason: RoutineStep["reason"]; skillId?: string }[] = [];
  const add = (step: StepId | undefined, reason: RoutineStep["reason"], skillId?: string) => {
    if (step && stepAllowed(step, instrument) && !picks.some((p) => p.id === step))
      picks.push({ id: step, reason, skillId });
  };
  for (const skillId of input.weakSkillIds ?? []) add(stepForSkill(skillId), "weak-spot", skillId);
  for (const step of DEFAULTS[instrument ?? "none"]) add(step, "default");
  return {
    id,
    instrument,
    budgetMinutes: budget,
    steps: picks.slice(0, count).map((p, i) => ({
      n: i + 1,
      id: p.id,
      label: STEPS[p.id].label,
      description: STEPS[p.id].description,
      minutes: Math.min(MINUTES_PER_STEP, budget),
      href: stepHref(p.id, i + 1, id, instrument),
      reason: p.reason,
      skillId: p.skillId,
    })),
  };
}

/** The step a finished run belongs to: its routine params, else the ear prefix, else its skills. */
function runMatchesStep(run: RunRecord, routine: Routine, step: RoutineStep): boolean {
  if (run.params.routine === routine.id && Number(run.params.step) === step.n) return true;
  if (step.id === "ear") return run.exerciseId.startsWith("ear.");
  if (run.exerciseId.startsWith("ear.")) return false;
  return [run.exerciseId, ...run.skillIds].some((s) => stepForSkill(s) === step.id);
}

const routineSessions = (routine: Routine, sessions: PracticeSession[]) =>
  sessions.filter((s) => s.routineId === routine.id);

/** Completed step numbers from the finished runs of this routine's sessions. */
export function completedSteps(routine: Routine, sessions: PracticeSession[]): number[] {
  const runs = routineSessions(routine, sessions).flatMap((s) => s.runs);
  return routine.steps
    .filter((step) => runs.some((r) => r.endedAt > 0 && runMatchesStep(r, routine, step)))
    .map((s) => s.n);
}

export interface RoutineSummary {
  completedSteps: number;
  totalSteps: number;
  xp: number;
  /** Correct fraction of the routine's scoring events; undefined with no events. */
  accuracy?: number;
  durationMs: number;
  runs: RunRecord[];
  eventIds: string[];
  tags: string[];
}

export function routineSummary(
  routine: Routine,
  sessions: PracticeSession[],
  events: ScoringEvent[],
): RoutineSummary {
  const own = routineSessions(routine, sessions);
  const eventIds = own.flatMap((s) => s.eventIds);
  const ids = new Set(eventIds);
  const mine = events.filter((e) => ids.has(e.id));
  const end = (s: PracticeSession) =>
    s.endTime ?? Math.max(s.startTime, ...s.runs.map((r) => r.endedAt));
  return {
    completedSteps: completedSteps(routine, sessions).length,
    totalSteps: routine.steps.length,
    xp: own.reduce((sum, s) => sum + s.xp, 0),
    accuracy: mine.length ? mine.filter((e) => e.correct).length / mine.length : undefined,
    durationMs: own.reduce((sum, s) => sum + (end(s) - s.startTime), 0),
    runs: own.flatMap((s) => s.runs),
    eventIds,
    tags: [...new Set(own.flatMap((s) => s.tags))],
  };
}
