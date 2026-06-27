import { describe, expect, test, vi } from "vite-plus/test";
import { render } from "vitest-browser-svelte";

import Page from "./+page.svelte";

describe("/music/progress/+page.svelte", () => {
  test("renders dashboard and skill tree views", async () => {
    render(Page);

    expect(document.querySelector("h1")?.textContent).toContain("Dashboard");
    await vi.waitFor(() => expect(document.body.textContent).toContain("Today's XP"));
    expect(document.body.textContent).toContain("Practice next");
    expect(document.body.textContent).toContain("Skill Tree");
    await vi.waitFor(() => expect(document.body.textContent).toContain("Quarter-Note Pulse"));
  });

  test("shows analytics, achievements, and streak calendar sections", async () => {
    render(Page);

    await vi.waitFor(() => expect(document.body.textContent).toContain("Weak spots"));
    expect(document.body.textContent).toContain("Achievements");
    expect(document.body.textContent).toContain("Streak calendar");
    expect(document.body.textContent).toContain("Capability summary");
  });

  test("shows personal daily challenges", async () => {
    render(Page);

    await vi.waitFor(() => expect(document.body.textContent).toContain("Daily challenges"));
    expect(document.body.textContent).toContain("Hit today's XP");
    expect(document.body.textContent).toContain("Cross-train two skills");
    expect(document.body.textContent).toContain("This week");
  });
});
