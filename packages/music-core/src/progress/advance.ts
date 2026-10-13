// What the next run should be: faster, a harder variation, slower, or the
// same again (docs/research/drill-progression.md, local). One rule for every
// drill. Timed drills climb the tempo to the variation's goal, then move to the
// next variation at a reset tempo; untimed drills move through variations only.
//
// - Pass: a clean run (the drill's own `correct`) scoring 85% or better.
//   Duke, Simmons and Cash 2009: correct trials predict retention.
// - Two passes in a row at one setup raise the tempo 5% (at least 2 BPM),
//   the step Yousician and Guitar Pro's speed trainer use; two in a row tracks
//   about 71% success (Levitt 1971), near the 85% rule's sweet spot.
// - Two passes at the goal move to the next variation at 75% of its goal
//   (the top of the 50 to 70% learning range, for material the player owns).
// - A clearly failed run (under 70%) steps the tempo back once (top players
//   slow down to fix errors; Duke 2009). The variation never drops on one bad
//   run: two fails at the floor tempo, or two in a row untimed, offer the
//   easier one (hysteresis against rubber-banding; Hunicke 2005).

export const ADVANCE = {
  pass: 0.85,
  fail: 0.7,
  runs: 2,
  stepPct: 0.05,
  minStep: 2,
  resetPct: 0.75,
  easierAfter: 2,
} as const;

export interface AdvanceStep {
  label: string;
  /** Goal tempo for this variation; the plan's goal otherwise. */
  goal?: number;
  /** Tempo to start this variation at; 75% of its goal otherwise. */
  start?: number;
}

export interface AdvancePlan {
  /** The tempo just played; omit for untimed drills. */
  bpm?: number;
  /** The slowest tempo offered, the goal before the next variation, and the fastest. */
  tempo?: { min: number; goal: number; max?: number };
  /** Variations from easy to hard, and the one just played. */
  steps?: readonly AdvanceStep[];
  step?: number;
}

export interface AdvanceState {
  /** The setup the counts belong to (tempo and variation); a change starts over. */
  at: string;
  passes: number;
  fails: number;
}

export type AdvanceKind = "faster" | "harder" | "slower" | "easier" | "same" | "top";

export interface AdvanceNext {
  kind: AdvanceKind;
  bpm?: number;
  step?: number;
  /** Plain words: what the next run is and why. */
  label: string;
  reason: string;
}

const round = (n: number) => Math.round(n);

/** Fold one run into the counts and say what the next run should be. */
export function advance(
  plan: AdvancePlan,
  prev: AdvanceState | undefined,
  run: { score: number; correct: boolean },
): { state: AdvanceState; next: AdvanceNext } {
  const timed = plan.bpm !== undefined && plan.tempo !== undefined;
  const steps = plan.steps ?? [];
  const step = Math.max(0, Math.min(steps.length - 1, plan.step ?? 0));
  const at = `${timed ? round(plan.bpm!) : "-"}|${steps.length ? step : "-"}`;
  const same = prev?.at === at;
  const pass = run.correct && run.score >= ADVANCE.pass;
  const fail = !pass && run.score < ADVANCE.fail;
  const state: AdvanceState = {
    at,
    passes: pass ? (same ? prev!.passes : 0) + 1 : 0,
    fails: fail ? (same ? prev!.fails : 0) + 1 : 0,
  };
  const label = (i: number) => steps[i]?.label ?? "";
  const goalOf = (i: number) => steps[i]?.goal ?? plan.tempo?.goal ?? 0;
  const startOf = (i: number) =>
    steps[i]?.start ?? Math.max(plan.tempo?.min ?? 0, round(goalOf(i) * ADVANCE.resetPct));
  const hasHarder = step < steps.length - 1;
  const hasEasier = step > 0;
  // Ignoring an offer keeps it: the counts stay with the setup, so Again offers it again.
  const offer = (n: Omit<AdvanceNext, "label"> & { label?: string }) => ({
    state,
    next: { ...n, label: words(n) },
  });
  function words(n: Omit<AdvanceNext, "label"> & { label?: string }) {
    const tempo = n.bpm !== undefined ? `${n.bpm} BPM` : "";
    if (n.kind === "harder" || n.kind === "easier")
      return [n.label, tempo && `at ${tempo}`].filter(Boolean).join(" ");
    return n.kind === "top" ? "Same again" : tempo || "Same again";
  }

  if (state.passes >= ADVANCE.runs) {
    if (timed) {
      const bpm = round(plan.bpm!);
      const goal = goalOf(step);
      if (bpm < goal)
        return offer({
          kind: "faster",
          bpm: Math.min(goal, bpm + Math.max(ADVANCE.minStep, round(bpm * ADVANCE.stepPct))),
          reason: `${ADVANCE.runs} clean runs at ${bpm} BPM`,
        });
      if (hasHarder)
        return offer({
          kind: "harder",
          step: step + 1,
          bpm: startOf(step + 1),
          label: label(step + 1),
          reason: `clean at the goal, ${goal} BPM`,
        });
      const max = plan.tempo!.max ?? goal;
      if (bpm < max)
        return offer({
          kind: "faster",
          bpm: Math.min(max, bpm + Math.max(ADVANCE.minStep, round(bpm * ADVANCE.stepPct))),
          reason: `past the goal on the hardest version`,
        });
      return offer({ kind: "top", reason: `the hardest version at ${bpm} BPM, the top tempo` });
    }
    if (hasHarder)
      return offer({
        kind: "harder",
        step: step + 1,
        label: label(step + 1),
        reason: `${ADVANCE.runs} clean runs`,
      });
    return offer({ kind: "top", reason: "clean on the hardest version" });
  }

  if (fail) {
    const bpm = timed ? round(plan.bpm!) : 0;
    const floor = timed ? plan.tempo!.min : 0;
    if (timed && bpm > floor)
      return offer({
        kind: "slower",
        bpm: Math.max(floor, bpm - Math.max(ADVANCE.minStep, round(bpm * ADVANCE.stepPct))),
        reason: "slower until it's clean",
      });
    if (state.fails >= ADVANCE.easierAfter && hasEasier)
      return offer({
        kind: "easier",
        step: step - 1,
        bpm: timed ? Math.max(floor, Math.min(bpm, startOf(step - 1))) : undefined,
        label: label(step - 1),
        reason: `${state.fails} runs under ${Math.round(ADVANCE.fail * 100)}%`,
      });
  }

  const need = ADVANCE.runs - state.passes;
  return offer({
    kind: "same",
    bpm: timed ? round(plan.bpm!) : undefined,
    reason: pass
      ? `${need} more clean run${need > 1 ? "s" : ""} to move on`
      : `${ADVANCE.runs} clean runs in a row (${Math.round(ADVANCE.pass * 100)}% or better) move on`,
  });
}
