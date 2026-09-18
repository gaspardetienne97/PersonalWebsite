import { describe, expect, test } from "vitest";

import { suggestedFingerings } from "./piano-fingering";

describe("suggestedFingerings", () => {
  test("does not invent fingering for an arbitrary seven-note sequence", () => {
    expect(suggestedFingerings([60, 62, 64, 65, 67, 69, 71], "right")).toEqual({});
  });

  test("keeps an authored fingering map", () => {
    expect(suggestedFingerings([60, 62], "right", { 60: 1, 62: 2 })).toEqual({ 60: 1, 62: 2 });
  });

  test("empty input yields no fingerings", () => {
    expect(suggestedFingerings([], undefined)).toEqual({});
  });
});
