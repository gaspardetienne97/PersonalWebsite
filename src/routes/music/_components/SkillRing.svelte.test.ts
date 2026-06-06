import { describe, expect, test } from "vite-plus/test";
import { render } from "vitest-browser-svelte";

import SkillRing from "./SkillRing.svelte";

describe("SkillRing", () => {
  test("renders percentage and label", () => {
    render(SkillRing, { percent: 87, label: "Rhythm" });
    expect(document.body.textContent).toContain("87%");
    expect(document.body.textContent).toContain("Rhythm");
  });

  test("clamps out-of-range percent", () => {
    render(SkillRing, { percent: 140 });
    expect(document.body.textContent).toContain("100%");
  });
});
