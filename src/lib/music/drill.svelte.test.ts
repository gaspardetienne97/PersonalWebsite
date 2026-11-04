import { describe, expect, it } from "vite-plus/test";
import { assistanceText, modeText } from "./drill.svelte";

describe("modeText", () => {
  it("says what the run counts toward, one sentence per mode", () => {
    expect(modeText("check")).toBe("Check run: counted in your skill scores.");
    expect(modeText("practice")).toBe("Practice run: your skill scores move on Check runs only.");
    expect(modeText("check", { hinted: true })).toBe(
      "You used a hint, so this run counts as practice.",
    );
  });
  it("never says a Practice run counts toward skill scores", () => {
    expect(modeText("practice")).not.toMatch(/counted in your skill/);
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
