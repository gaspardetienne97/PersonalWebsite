import type { Score } from "@repo/music-core/domain";
import { projectScoreToPiano } from "@repo/music-core/engines/projection";

export type PianoHand = "left" | "right";

/**
 * Score notes as the waterfall reads them. Beats stay canonical: the surface
 * positions a note from `startBeat - positionBeat` and never converts to time.
 */
export interface PianoTimelineNote {
  midiNote: number;
  startBeat: number;
  durationBeats: number;
  hand?: PianoHand;
}

/** `projectScoreToPiano` stays the only hand authority; this just renames it. */
export function scoreTimelineNotes(score: Score): PianoTimelineNote[] {
  return projectScoreToPiano(score).notes.map(({ midiNote, startBeat, durationBeats, hand }) => ({
    midiNote,
    startBeat,
    durationBeats,
    ...(hand === undefined ? {} : { hand }),
  }));
}

/**
 * Drop the muted hands' notes so the route can reschedule playback from the
 * same hand assignment the waterfall shows. Beats are untouched, so the
 * remaining notes keep their original offsets.
 */
export function scoreWithoutHands(score: Score, mutedHands: readonly PianoHand[]): Score {
  if (mutedHands.length === 0) return score;
  const muted = new Set(
    projectScoreToPiano(score)
      .notes.filter(({ hand }) => hand !== undefined && mutedHands.includes(hand))
      .map(({ sourceIndex }) => sourceIndex),
  );
  if (muted.size === 0) return score;
  return { ...score, notes: score.notes.filter((_, index) => !muted.has(index)) };
}
