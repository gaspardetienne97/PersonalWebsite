import { describe, expect, test } from "vite-plus/test";

import type { Score } from "@repo/music-core/domain";

import { scoreTimelineNotes, scoreWithoutHands } from "./piano-timeline";

function score(): Score {
  return {
    id: "s1",
    origin: "generated",
    tempoMap: [{ atBeat: 0, bpm: 120 }],
    timeSignatures: [],
    voices: [
      { id: "melody", name: "Melody", role: "melody" },
      { id: "bass", name: "Bass", role: "bass" },
    ],
    notes: [
      { midiNote: 72, startBeat: 0, durationBeats: 1, velocity: 0.8, voiceId: "melody" },
      { midiNote: 48, startBeat: 0, durationBeats: 2, velocity: 0.8, voiceId: "bass" },
      { midiNote: 74, startBeat: 2, durationBeats: 1, velocity: 0.8, voiceId: "melody" },
    ],
    chords: [],
    sections: [],
    markers: [],
  };
}

describe("piano timeline", () => {
  test("carries the score's own beats and hand assignment", () => {
    expect(scoreTimelineNotes(score())).toEqual([
      { midiNote: 72, startBeat: 0, durationBeats: 1, hand: "right" },
      { midiNote: 48, startBeat: 0, durationBeats: 2, hand: "left" },
      { midiNote: 74, startBeat: 2, durationBeats: 1, hand: "right" },
    ]);
  });

  test("muting a hand drops only its notes and leaves the others' beats alone", () => {
    const muted = scoreWithoutHands(score(), ["left"]);

    expect(muted.notes.map(({ midiNote, startBeat }) => [midiNote, startBeat])).toEqual([
      [72, 0],
      [74, 2],
    ]);
    // Same score object back when nothing is muted, so playback is unchanged.
    const original = score();
    expect(scoreWithoutHands(original, [])).toBe(original);
    expect(scoreWithoutHands(original, ["left", "right"]).notes).toEqual([]);
  });
});
