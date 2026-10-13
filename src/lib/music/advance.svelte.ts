// The next run after this one (faster, harder, slower, easier), from the shared
// rule in progress/advance. The counts are kept per ladder id across visits.
import {
  advance,
  type AdvanceNext,
  type AdvancePlan,
  type AdvanceState,
} from "@repo/music-core/progress/advance";
import { readKeyed, writeKeyed } from "./drill.svelte";
import { settings } from "./runtime";

const KEY = "advance.v1";

export interface NextRun extends AdvanceNext {
  /** Set the drill up for the next run. */
  go(): void;
}

/**
 * Fold a run into ladder `id` and return the next run. `apply` sets the drill
 * up for it; tempo defaults to the practice strip's BPM.
 */
export async function nextRun(
  id: string,
  plan: AdvancePlan,
  run: { score: number; correct: boolean },
  apply: (n: { bpm?: number; step?: number }) => void = ({ bpm }) =>
    bpm !== undefined && void settings.update({ bpm }),
): Promise<NextRun> {
  const prev = (await readKeyed<AdvanceState>(KEY))[id];
  const { state, next } = advance(plan, prev, run);
  await writeKeyed(KEY, id, state);
  return { ...next, go: () => apply({ bpm: next.bpm, step: next.step }) };
}

/** Practice-strip tempo, plus a step setter, as one `apply`. */
export const tempoAnd =
  (setStep: (i: number) => void) =>
  ({ bpm, step }: { bpm?: number; step?: number }) => {
    if (bpm !== undefined) void settings.update({ bpm });
    if (step !== undefined) setStep(step);
  };
