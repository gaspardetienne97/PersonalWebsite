import { describe, expect, it } from "vitest";

import {
  degradesToArpeggio,
  instrumentsForApplicability,
  isMonophonic,
  VIEWABLE_INSTRUMENTS,
} from "./applicability";

describe("instrument applicability", () => {
  it("treats the Aerophone and voice as monophonic", () => {
    expect(isMonophonic("aerophone")).toBe(true);
    expect(isMonophonic("voice")).toBe(true);
    expect(isMonophonic("piano")).toBe(false);
    expect(isMonophonic("guitar")).toBe(false);
  });

  it("offers all viewable instruments for non-specific content", () => {
    expect(instrumentsForApplicability("all")).toEqual(VIEWABLE_INSTRUMENTS);
    expect(instrumentsForApplicability("pitched")).toEqual(VIEWABLE_INSTRUMENTS);
    expect(instrumentsForApplicability("polyphonic")).toEqual(VIEWABLE_INSTRUMENTS);
  });

  it("filters instrument-specific content to its instruments", () => {
    expect(instrumentsForApplicability({ only: ["aerophone"] })).toEqual(["aerophone"]);
    expect(instrumentsForApplicability({ only: ["mpc"] })).toEqual([]); // mpc has no pitched view
  });

  it("degrades polyphonic content to an arpeggio only on monophonic instruments", () => {
    expect(degradesToArpeggio("polyphonic", "aerophone")).toBe(true);
    expect(degradesToArpeggio("polyphonic", "piano")).toBe(false);
    expect(degradesToArpeggio("pitched", "aerophone")).toBe(false);
  });
});
