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
  state: TechniqueSessionState,
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
