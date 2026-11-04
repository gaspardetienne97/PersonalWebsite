import { describe, expect, it } from "vite-plus/test";
import { assistanceText, modeText } from "./drill.svelte";

describe("modeText", () => {
  it("says what the run counts toward, one sentence per mode", () => {
    expect(modeText("check")).toBe("Check run: it counts toward your skill scores.");
    expect(modeText("practice", { moves: "tempo" })).toBe(
      "Practice run: it moves your tempo on, not your skill scores.",
    );
    expect(modeText("practice", { moves: "steps" })).toBe(
      "Practice run: it counts toward moving on, not your skill scores.",
    );
    expect(modeText("practice")).toBe("Practice run: it does not count toward your skill scores.");
    expect(modeText("check", { hinted: true })).toBe("You used a hint: practice, not a check.");
  });
  it("never says a run both counts and does not", () => {
    for (const m of ["practice", "check"] as const)
      for (const moves of ["tempo", "steps", null] as const) {
        const t = modeText(m, { moves });
        expect(t).not.toMatch(/saved as practice|Counts toward moving on/);
      }
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
