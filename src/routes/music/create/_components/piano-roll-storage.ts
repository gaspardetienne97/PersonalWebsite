import type { Take } from "@repo/music-core/engines/recording";

export const PIANO_ROLL_SCORE_ID = "music.piano-roll.score";
export const PIANO_ROLL_PENDING_TAKE_IMPORT_ID = "music.piano-roll.pending-take-import";

export interface PianoRollPendingTakeImport {
  take: Take;
  bpm: number;
}
