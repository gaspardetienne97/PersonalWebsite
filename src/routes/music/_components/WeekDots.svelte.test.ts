import { describe, expect, test } from "vite-plus/test";
import { render } from "vitest-browser-svelte";

import WeekDots from "./WeekDots.svelte";

describe("WeekDots", () => {
  test("renders 7 day dots", () => {
    render(WeekDots, { completedDays: [0, 1, 2, 3, 4], todayIndex: 5 });
    expect(document.querySelectorAll("[data-dot]").length).toBe(7);
  });
});
