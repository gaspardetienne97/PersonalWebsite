import { describe, expect, test } from "vite-plus/test";
import { render } from "vitest-browser-svelte";

import ProgressRing from "./ProgressRing.svelte";

describe("ProgressRing", () => {
  test("renders value and total", () => {
    render(ProgressRing, { value: 860, total: 1000, label: "Today's XP" });
    expect(document.body.textContent).toContain("860");
    expect(document.body.textContent).toContain("1,000");
  });
});
