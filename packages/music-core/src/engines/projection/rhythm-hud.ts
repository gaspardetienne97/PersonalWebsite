import type { RhythmSessionState } from "@repo/music-core/engines/rhythm-session";

/**
 * Display-ready rhythm HUD derived from {@link RhythmSessionState}. Keeps the
 * route components free of timing math: `live` drives the in-progress readouts,
 * `summary` drives the completed-run readouts.
 */
export interface RhythmHudData {
  /** Live playhead progress, 0-100. */
  progressPct: number;
  /** Live running score, 0-100. */
  runningScorePct: number;
  /** Signed mean timing error from the summary (+ ahead, - behind); 0 while active. */
  offsetMs: number;
  /** Mean absolute timing error from the summary. */
  avgAbsOffsetMs: number;
  /** Final accuracy, 0-100, from the summary. */
  accuracyPct: number;
}

export function rhythmHudProjection(state: RhythmSessionState): RhythmHudData {
  const { live, summary } = state;
  return {
    progressPct: live ? Math.round(live.progress * 100) : summary ? 100 : 0,
    runningScorePct: live ? Math.round(live.runningScore * 100) : 0,
    offsetMs: summary ? Math.round(summary.meanSignedErrorMs) : 0,
    avgAbsOffsetMs: summary ? Math.round(summary.meanAbsoluteErrorMs) : 0,
    accuracyPct: summary ? Math.round(summary.accuracy * 100) : 0,
  };
}
