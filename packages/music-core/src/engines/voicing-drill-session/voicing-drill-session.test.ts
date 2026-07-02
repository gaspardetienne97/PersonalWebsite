import { describe, expect, it } from "vitest";

import { buildVoicingDrillTargets, normalizeVoicingDrillConfig } from "./index";

describe("buildVoicingDrillTargets", () => {
  it("produces 36 chord targets (12 keys × ii-V-I) for a polyphonic instrument", () => {
    const targets = buildVoicingDrillTargets("piano");
    expect(targets).toHaveLength(36);
    expect(targets.every((t) => t.mode === "chord")).toBe(true);

    // Dm7 rootless A = F A C E, with the root D in the bass (LH root + RH
    // rootless), so the full target is {2, 5, 9, 0, 4}.
    const first = targets[0]!;
    expect(first.symbol).toBe("Dm7");
    expect(new Set(first.expectedPitchClasses)).toEqual(new Set([2, 5, 9, 0, 4]));
    expect(first.expectedBassPc).toBe(2); // D in the bass
  });

  it("grades as an arpeggio on a monophonic instrument, in ascending pitch order", () => {
    const targets = buildVoicingDrillTargets("aerophone");
    expect(targets.every((t) => t.mode === "arpeggio")).toBe(true);
    // Dm7 rootless A with bass D: D F A C E → ascending pcs 2,5,9,0,4.
    expect(targets[0]!.expectedPitchClasses).toEqual([2, 5, 9, 0, 4]);
  });

  it("builds the minor variant: iiø7 → V7alt → i-m7 across 12 keys", () => {
    const targets = buildVoicingDrillTargets("piano", { variant: "minor" });
    expect(targets).toHaveLength(36);
    expect(targets.slice(0, 3).map((t) => t.symbol)).toEqual(["Dm7b5", "G7alt", "Cm7"]);
    // Dm7b5 rootless A = F Ab C E, bass D → {2, 5, 8, 0, 4}.
    expect(new Set(targets[0]!.expectedPitchClasses)).toEqual(new Set([2, 5, 8, 0, 4]));
  });

  it("builds the altered variant: V7b9, V7alt, and upper-structure V7 across 12 keys", () => {
    const targets = buildVoicingDrillTargets("piano", { variant: "altered" });
    expect(targets).toHaveLength(36);
    expect(targets.slice(0, 3).map((t) => t.symbol)).toEqual([
      "G7b9",
      "G7alt",
      "G7 · II maj upper",
    ]);
    expect(targets.every((target) => target.symbol.includes("7"))).toBe(true);
    expect(targets[2]!.displayMidi).toEqual([67, 71, 77, 81, 85, 88]);
    expect(new Set(targets[2]!.expectedPitchClasses)).toEqual(new Set([7, 11, 5, 9, 1, 4]));
  });
});

describe("normalizeVoicingDrillConfig", () => {
  it("normalizes shareable voicing drill config values", () => {
    const params = new URLSearchParams(
      "instrument=guitar&variant=altered&start=B&strict=held&advance=manual",
    );

    expect(normalizeVoicingDrillConfig(params)).toEqual({
      instrument: "guitar",
      variant: "altered",
      startPosition: "B",
      strict: true,
      autoAdvance: false,
    });

    expect(
      normalizeVoicingDrillConfig({
        instrument: "drums",
        variant: "unknown",
        start: "C",
        strict: "no",
        advance: "auto",
      }),
    ).toEqual({
      instrument: "piano",
      variant: "major",
      startPosition: "A",
      strict: false,
      autoAdvance: true,
    });
  });
});
