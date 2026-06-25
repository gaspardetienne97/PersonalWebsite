import type { ScorePracticeSelection } from "@repo/music-core/engines/score-practice";
import type { ScoreFollowerMode, TimingStrictness } from "@repo/music-core/engines/score-follower";

export interface ScorePracticeSetupValue {
  mode: ScoreFollowerMode;
  selection: ScorePracticeSelection;
  bpm: number;
  strictness: TimingStrictness;
  countInBars: 0 | 1 | 2;
  totalTakes: 1 | 2 | 4 | 8;
}
