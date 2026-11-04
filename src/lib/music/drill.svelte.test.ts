import { describe, expect, it } from "vite-plus/test";
import { assistanceText } from "./drill.svelte";

describe("assistanceText", () => {
  it("says why a run is practice or a check", () => {
    expect(assistanceText("practice")).toBe(
      "Practice run: targets were shown, so it is saved as practice.",
    );
    expect(assistanceText("check")).toBe(
      "Checked run: targets were hidden, so it counts toward mastery.",
    );
    expect(assistanceText("check", true)).toBe(
      "You used a hint, so this run is practice, not a check.",
    );
    expect(assistanceText("check", { hinted: true })).toBe(assistanceText("check", true));
  });
  it("does not claim targets were shown when Practice hides them", () => {
    expect(assistanceText("practice", { shown: false })).toBe(
      "Practice run: saved as practice, not counted.",
    );
  });
});
