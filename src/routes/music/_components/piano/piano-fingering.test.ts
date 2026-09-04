import { describe, expect, test } from "vitest";

import { suggestedFingerings } from "./piano-fingering";

describe("suggestedFingerings", () => {
  test("right hand counts up from the thumb, capped at the pinky", () => {
    expect(suggestedFingerings([67, 60, 64, 60, 71, 72, 74], "right")).toEqual({
      60: 1,
      64: 2,
      67: 3,
      71: 4,
      72: 5,
      74: 5,
    });
  });

  test("left hand counts down from the pinky, floored at the thumb", () => {
    expect(suggestedFingerings([48, 52, 55, 59, 60, 62], "left")).toEqual({
      48: 5,
      52: 4,
      55: 3,
      59: 2,
      60: 1,
      62: 1,
    });
  });

  test("empty input yields no fingerings", () => {
    expect(suggestedFingerings([], undefined)).toEqual({});
  });
});
