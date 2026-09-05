import { describe, expect, test, vi } from "vite-plus/test";
import { render } from "vitest-browser-svelte";

import StreakCalendar from "./StreakCalendar.svelte";

describe("StreakCalendar", () => {
  test("shows the month with practised days filled, and a 12-week heatmap on request", async () => {
    const today = new Date(2026, 8, 26);
    render(StreakCalendar, {
      practised: new Set(["2026-09-02", "2026-09-26", "2026-07-15"]),
      today,
    });

    expect(document.body.textContent).toContain("Practised 2 of 26 days");
    expect(document.querySelector('[data-day="2026-09-02"][data-practised]')).not.toBeNull();
    expect(document.querySelector('[data-day="2026-09-03"][data-practised]')).toBeNull();

    [...document.querySelectorAll<HTMLButtonElement>("button")]
      .find((button) => button.textContent?.trim() === "12 weeks")
      ?.click();
    await vi.waitFor(() => expect(document.body.textContent).toContain("last 12 weeks"));
    expect(document.querySelector('[data-day="2026-07-15"][data-practised]')).not.toBeNull();
    expect(document.body.textContent).toContain("Practised 3 of");
  });
});
