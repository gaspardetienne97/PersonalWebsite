import type { TechniqueSessionState } from "@repo/music-core/engines/technique-session";

export interface TempoRung {
  bpm: number;
  status: "unlocked" | "target" | "locked";
}

export interface TempoLadderOptions {
  startBpm: number;
  stepBpm: number;
  rungs: number;
}

/**
 * Projects the tempo-progression ladder the scales UI renders. The session
 * already owns `highestUnlockedBpm`/`nextTargetBpm`; this turns those into a
 * concrete list of rungs with per-rung status.
 */
export function tempoLadderProjection(
  state: Pick<TechniqueSessionState, "highestUnlockedBpm" | "nextTargetBpm">,
  options: TempoLadderOptions,
): TempoRung[] {
  const { startBpm, stepBpm, rungs } = options;
  return Array.from({ length: rungs }, (_, index) => {
    const bpm = startBpm + index * stepBpm;
    let status: TempoRung["status"];
    if (bpm <= state.highestUnlockedBpm) status = "unlocked";
    else if (bpm === state.nextTargetBpm) status = "target";
    else status = "locked";
    return { bpm, status };
  });
}

/** Per-run suggestions; these are available practice tempos, not earned achievements. */
export function tempoPracticePlan(bpm: number, clean: boolean, options: TempoLadderOptions) {
  const tempos = Array.from(
    { length: options.rungs },
    (_, index) => options.startBpm + index * options.stepBpm,
  );
  const nextBpm = clean ? (tempos.find((tempo) => tempo > bpm) ?? bpm) : bpm;
  const slowerBpm = tempos.filter((tempo) => tempo < bpm).at(-1) ?? bpm;
  return {
    nextBpm,
    slowerBpm,
    rungs: tempoLadderProjection(
      { highestUnlockedBpm: nextBpm - options.stepBpm, nextTargetBpm: nextBpm },
      options,
    ),
  };
}
