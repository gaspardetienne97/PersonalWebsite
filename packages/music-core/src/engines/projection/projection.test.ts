import { describe, expect, test } from "vitest";

import { curatedTunings } from "@repo/music-core/engines/tunings";

import { filterScoreVoices, projectFretboard, projectPiano, projectPlayableGroup } from "./index";

const guitarStandard = curatedTunings("guitar")[0]!;
const ukuleleHighG = curatedTunings("ukulele")[0]!;

describe("music-core/projection", () => {
  test("filters a score to selected voices without mutating global score lanes", () => {
    const score = {
      id: "parts",
      origin: "musicxml" as const,
      tempoMap: [{ atBeat: 0, bpm: 120 }],
      timeSignatures: [{ atBeat: 0, numerator: 4, denominator: 4 }],
      voices: [
        { id: "P1:voice:1", name: "Piano · Voice 1", role: "other" as const },
        { id: "P2:voice:1", name: "Bass · Voice 1", role: "bass" as const },
      ],
      notes: [
        {
          midiNote: 60,
          startBeat: 0,
          durationBeats: 1,
          velocity: 0.8,
          voiceId: "P1:voice:1",
        },
        {
          midiNote: 40,
          startBeat: 0,
          durationBeats: 4,
          velocity: 0.8,
          voiceId: "P2:voice:1",
        },
      ],
      rests: [
        { startBeat: 1, durationBeats: 1, voiceId: "P1:voice:1" },
        { startBeat: 4, durationBeats: 4, voiceId: "P2:voice:1" },
      ],
      chords: [{ symbol: "C", startBeat: 0 }],
      sections: [{ id: "full", name: "Full", startBeat: 0, endBeat: 8 }],
      markers: [{ id: "a", beat: 2, label: "A", kind: "annotation" as const }],
      lyrics: [{ text: "La", startBeat: 0 }],
    };

    const filtered = filterScoreVoices(score, ["P2:voice:1"]);

    expect(filtered.voices.map(({ id }) => id)).toEqual(["P2:voice:1"]);
    expect(filtered.notes.map(({ midiNote }) => midiNote)).toEqual([40]);
    expect(filtered.rests).toEqual([{ startBeat: 4, durationBeats: 4, voiceId: "P2:voice:1" }]);
    expect(filtered.chords).toEqual(score.chords);
    expect(filtered.sections).toEqual(score.sections);
    expect(filtered.markers).toEqual(score.markers);
    expect(filtered.lyrics).toEqual(score.lyrics);
    expect(score.notes).toHaveLength(2);
  });

  test("projects exact piano keys with a stable hand split", () => {
    expect(projectPiano([48, 60, 72])).toEqual([
      { midiNote: 48, hand: "left" },
      { midiNote: 60, hand: "right" },
      { midiNote: 72, hand: "right" },
    ]);
  });

  test("projects every valid fretboard location in conventional string order", () => {
    expect(projectFretboard([64], guitarStandard)).toEqual(
      expect.arrayContaining([
        { midiNote: 64, string: 1, fret: 0 },
        { midiNote: 64, string: 2, fret: 5 },
      ]),
    );
    expect(projectFretboard([67], ukuleleHighG)).toEqual(
      expect.arrayContaining([{ midiNote: 67, string: 4, fret: 0 }]),
    );
  });

  test("finds a compact grouped-note solution using distinct strings", () => {
    const group = projectPlayableGroup([60, 64, 67], guitarStandard);

    expect(group?.positions).toHaveLength(3);
    expect(new Set(group?.positions.map(({ string }) => string)).size).toBe(3);
    expect(group?.span).toBeLessThanOrEqual(5);
  });

  test("respects the requested fret-span limit", () => {
    expect(projectPlayableGroup([60, 64, 67], guitarStandard, 1)).toBeUndefined();
  });

  test("rejects groups outside the selected instrument range", () => {
    expect(projectPlayableGroup([40, 41, 42], ukuleleHighG)).toBeUndefined();
  });
});
