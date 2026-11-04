import { describe, expect, it } from "vite-plus/test";
import { assistanceText, modeText } from "./drill.svelte";

describe("modeText", () => {
  it("says what the run counts toward, one sentence per mode", () => {
    expect(modeText("check")).toBe("Check run: counts toward your skill scores.");
    expect(modeText("practice", { moves: "tempo" })).toBe(
      "Practice run: counts toward speeding up. Check runs, from memory, raise your skill scores.",
    );
    expect(modeText("practice", { moves: "steps" })).toBe(
      "Practice run: counts toward moving on. Check runs, from memory, raise your skill scores.",
    );
    expect(modeText("practice")).toBe(
      "Practice run: only Check runs, from memory, raise your skill scores.",
    );
    expect(modeText("check", { hinted: true })).toBe("You used a hint, so this run is practice.");
  });
  it("never says a Practice run counts toward skill scores", () => {
    for (const moves of ["tempo", "steps", null] as const)
      expect(modeText("practice", { moves })).not.toMatch(
        /^Practice run: counts toward your skill/,
      );
  });
});

describe("assistanceText (deprecated)", () => {
  it("reads the same sentences as modeText", () => {
    expect(assistanceText("check")).toBe(modeText("check"));
    expect(assistanceText("practice", { shown: false })).toBe(modeText("practice"));
    expect(assistanceText("check", true)).toBe(modeText("check", { hinted: true }));
    expect(assistanceText("check", { hinted: true })).toBe(assistanceText("check", true));
  });
});
