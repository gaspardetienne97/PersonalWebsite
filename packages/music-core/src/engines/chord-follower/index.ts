/**
 * chord-follower — pure streaming grader for a known chord progression.
 *
 * It never does open chord recognition: it aligns a stream of pitch-class
 * observations (from chroma + onset-confirmed Basic Pitch, supplied by Phase 2)
 * against an expected progression, grading each chord on correctness + timing.
 * Mirrors the monophonic `score-follower`'s shape.
 */

import { chordNotes, pitchClass } from "@repo/music-core/engines/theory";
import type { JamProgression } from "@repo/music-core/engines/jam";

export interface ExpectedChord {
  symbol: string;
  /** Sorted, deduped chord-tone pitch classes. */
  pitchClasses: number[];
  startBeat: number;
  durationBeats: number;
}

export function expectedChordsFromProgression(
  progression: JamProgression,
  options: { beatsPerBar?: number } = {},
): ExpectedChord[] {
  const beatsPerBar = options.beatsPerBar ?? 4;
  let startBeat = 0;
  return progression.chords.map((chord) => {
    const durationBeats = chord.bars * beatsPerBar;
    const pitchClasses = [
      ...new Set(chordNotes(chord.symbol).map((note) => pitchClass(note))),
    ].sort((left, right) => left - right);
    const expected: ExpectedChord = {
      symbol: chord.symbol,
      pitchClasses,
      startBeat,
      durationBeats,
    };
    startBeat += durationBeats;
    return expected;
  });
}
