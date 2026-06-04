import { describe, expect, test } from "vitest";

import { curatedTunings, validateTuning, type TuningProfile } from "./index";

const customGuitar: TuningProfile = {
  id: "custom.guitar.open-d",
  name: "Open D",
  instrument: "guitar",
  openStrings: [64, 61, 57, 52, 45, 38],
  fretCount: 22,
  notationTransposition: -12,
  source: "custom",
};

describe("music-core/tunings", () => {
  test("provides curated guitar profiles in conventional string-number order", () => {
    expect(curatedTunings("guitar").map(({ id }) => id)).toEqual([
      "guitar.standard",
      "guitar.drop-d",
      "guitar.dadgad",
      "guitar.open-g",
    ]);
    expect(curatedTunings("guitar")[0]?.openStrings).toEqual([64, 59, 55, 50, 45, 40]);
  });

  test("provides high-G, low-G, and baritone ukulele profiles", () => {
    expect(curatedTunings("ukulele").map(({ id }) => id)).toEqual([
      "ukulele.high-g",
      "ukulele.low-g",
      "ukulele.baritone",
    ]);
    expect(curatedTunings("ukulele")[0]?.openStrings).toEqual([69, 64, 60, 67]);
  });

  test("returns independent copies of curated profiles", () => {
    const first = curatedTunings("guitar");
    first[0]!.openStrings[0] = 0;

    expect(curatedTunings("guitar")[0]?.openStrings[0]).toBe(64);
  });

  test("validates a complete custom tuning", () => {
    expect(validateTuning(customGuitar)).toEqual({ valid: true, errors: {} });
  });

  test("rejects malformed custom tuning fields", () => {
    expect(
      validateTuning({
        ...customGuitar,
        id: "guitar.standard",
        name: " ",
        openStrings: [40, 45],
        fretCount: 0,
      }),
    ).toEqual({
      valid: false,
      errors: {
        id: "Custom tuning ids must start with custom.",
        name: "Tuning name is required.",
        openStrings: "Guitar tunings need exactly 6 valid MIDI notes.",
        fretCount: "Fret count must be an integer from 1 to 36.",
      },
    });
  });
});
