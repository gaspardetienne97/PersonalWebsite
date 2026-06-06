import { describe, expect, test } from "vite-plus/test";
import { render } from "vitest-browser-svelte";

import SegmentProgress from "./SegmentProgress.svelte";

describe("SegmentProgress", () => {
  test("renders correct count of segments", () => {
    render(SegmentProgress, { total: 10, current: 6 });
    expect(document.querySelectorAll("[data-segment]").length).toBe(10);
  });

  test("marks done segments", () => {
    render(SegmentProgress, { total: 5, current: 3 });
    expect(document.querySelectorAll('[data-segment="done"]').length).toBe(3);
  });

  test("renders the count with spaces around the slash", () => {
    render(SegmentProgress, { total: 10, current: 1 });
    expect(document.body.textContent).toContain("1 / 10");
  });
});
