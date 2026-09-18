import { describe, expect, test } from "vite-plus/test";
import { render } from "vitest-browser-svelte";

import WeekBars from "./WeekBars.svelte";

describe("WeekBars", () => {
  test("marks the best day and summarises the week for assistive tech", () => {
    render(WeekBars, {
      days: [
        { label: "M", value: 40 },
        { label: "T", value: 120 },
        { label: "W", value: 0, today: true },
      ],
    });
    expect(document.querySelector('[role="img"]')?.getAttribute("aria-label")).toBe(
      "160 XP this week: M 40, T 120, W 0",
    );
    expect(document.querySelectorAll("[data-best]").length).toBe(1);
  });

  test("names the unit it is given", () => {
    render(WeekBars, {
      unit: "minutes",
      days: [
        { label: "M", value: 18 },
        { label: "T", value: 22 },
      ],
    });
    expect(document.querySelector('[role="img"]')?.getAttribute("aria-label")).toBe(
      "40 minutes this week: M 18, T 22",
    );
  });
});
