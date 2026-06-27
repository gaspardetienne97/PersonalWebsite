import { describe, expect, test } from "vitest";

import {
  identifyScaleDegreeFromMidi,
  scaleDegreeFreePlayChoices,
} from "./scale-degree-recognition";

describe("scale degree free play", () => {
  test("projects tonic-relative choices for the selected degree set", () => {
    const choices = scaleDegreeFreePlayChoices({ tonicMidi: 60, scaleDegreeSet: "anchor" });

    expect(choices).toEqual([
      {
        token: "1",
        label: "1 / do",
        solfege: "do",
        semitones: 0,
        midiNote: 60,
        playback: [
          { midiNotes: [60], offsetSeconds: 0, durationSeconds: 0.45 },
          { midiNotes: [60], offsetSeconds: 0.55, durationSeconds: 0.6 },
        ],
      },
      {
        token: "5",
        label: "5 / sol",
        solfege: "sol",
        semitones: 7,
        midiNote: 67,
        playback: [
          { midiNotes: [60], offsetSeconds: 0, durationSeconds: 0.45 },
          { midiNotes: [67], offsetSeconds: 0.55, durationSeconds: 0.6 },
        ],
      },
    ]);
  });

  test("labels played notes against the active tonic and degree set", () => {
    expect(
      identifyScaleDegreeFromMidi({ tonicMidi: 60, midiNote: 67, scaleDegreeSet: "anchor" }),
    ).toMatchObject({
      token: "5",
      label: "5 / sol",
      midiNote: 67,
    });
    expect(
      identifyScaleDegreeFromMidi({ tonicMidi: 60, midiNote: 64, scaleDegreeSet: "anchor" }),
    ).toBeUndefined();
    expect(
      identifyScaleDegreeFromMidi({
        tonicMidi: 60,
        midiNote: 76,
        scaleDegreeSet: "major-pentachord",
      }),
    ).toMatchObject({ token: "3", label: "3 / mi" });
  });
});
