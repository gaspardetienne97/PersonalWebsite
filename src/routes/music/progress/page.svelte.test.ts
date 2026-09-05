import { describe, expect, test, vi } from "vite-plus/test";
import { render } from "vitest-browser-svelte";

import Page from "./+page.svelte";

describe("/music/progress/+page.svelte", () => {
  test("renders dashboard and skill tree views", async () => {
    render(Page);

    expect(document.querySelector("h1")?.textContent).toContain("Progress");
    await vi.waitFor(() => expect(document.body.textContent).toContain("Today's XP"));
    expect(document.body.textContent).toContain("Practise next");
    expect(document.body.textContent).toContain("Skill map");
    expect(document.querySelector('[data-testid="week-bars"]')).not.toBeNull();
    // The mastery grid shows eight skills until expanded.
    await vi.waitFor(() =>
      expect(
        [...document.querySelectorAll<HTMLButtonElement>("button")].find((button) =>
          button.textContent?.trim().startsWith("Show all"),
        ),
      ).not.toBeUndefined(),
    );
    [...document.querySelectorAll<HTMLButtonElement>("button")]
      .find((button) => button.textContent?.trim().startsWith("Show all"))
      ?.click();
    await vi.waitFor(() => expect(document.body.textContent).toContain("Quarter-Note Pulse"));
  });

  test("shows analytics, achievements, and streak calendar sections", async () => {
    render(Page);

    await vi.waitFor(() => expect(document.body.textContent).toContain("Weak spots"));
    expect(document.body.textContent).toContain("Achievements");
    expect(document.body.textContent).toContain("Streak calendar");
    // The calendar toggles between one month and a 12-week heatmap.
    const weeks = [...document.querySelectorAll<HTMLButtonElement>("button")].find(
      (button) => button.textContent?.trim() === "12 weeks",
    );
    weeks?.click();
    await vi.waitFor(() => expect(document.body.textContent).toContain("last 12 weeks"));
    expect(
      document.querySelectorAll('[data-testid="streak-calendar"] [data-day]').length,
    ).toBeGreaterThan(80);
  });

  test("shows personal daily challenges", async () => {
    render(Page);

    await vi.waitFor(() => expect(document.body.textContent).toContain("Daily challenges"));
    expect(document.body.textContent).toContain("Hit today's XP");
    expect(document.body.textContent).toContain("Cross-train two skills");
    expect(document.body.textContent).toContain("This week");
  });
});
