import { describe, expect, test } from "vite-plus/test";
import { render } from "vitest-browser-svelte";

import WeekBars from "./WeekBars.svelte";

describe("WeekBars", () => {
  test("marks the best day and summarises the week for assistive tech", () => {
    render(WeekBars, {
      days: [
        { label: "M", xp: 40 },
        { label: "T", xp: 120 },
        { label: "W", xp: 0, today: true },
      ],
    });
    expect(document.querySelector('[role="img"]')?.getAttribute("aria-label")).toBe(
      "160 XP this week: M 40, T 120, W 0",
    );
    expect(document.querySelectorAll("[data-best]").length).toBe(1);
  });
});
