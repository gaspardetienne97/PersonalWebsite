import { afterEach, describe, expect, test, vi } from "vite-plus/test";
import { render } from "vitest-browser-svelte";
import { page } from "vitest/browser";

import "../../../app.css";

import { setTestUrl } from "../_components/test-url";
import Page from "./+page.svelte";

afterEach(async () => {
  await page.viewport(1280, 900);
});

function tab(label: string): HTMLButtonElement | undefined {
  return [...document.querySelectorAll<HTMLButtonElement>("button")].find(
    (button) => button.textContent?.trim() === label,
  );
}

describe("/music/progress/+page.svelte", () => {
  test("opens on What next: the reasoning, the budget, the routine and the three lists", async () => {
    setTestUrl("/music/progress");
    render(Page);

    expect(document.querySelector("h1")?.textContent).toContain("Progress");
    await vi.waitFor(() => expect(document.body.textContent).toContain("Practise next"));
    // The hero reasons in prose from the weak-spot projection.
    expect(document.body.textContent).toContain("no verdict");
    expect(document.body.textContent).toContain("Falling");
    expect(document.body.textContent).toContain("Holding");
    expect(document.body.textContent).toContain("Not measured yet");
    expect(document.body.textContent).toContain("Fewer than five unaided attempts");
    expect(document.querySelector('[aria-label="Today\'s routine"]')).not.toBeNull();
    expect(tab("20")?.getAttribute("aria-pressed")).toBe("true");
    // The streak and the week bars stay in the header row.
    expect(document.querySelector('[data-testid="week-bars"]')).not.toBeNull();
    // The XP ring has left the hero; practice points live in Sessions.
    expect(document.body.textContent).not.toContain("Today's XP");
  });

  test("the time budget rebuilds the routine", async () => {
    setTestUrl("/music/progress");
    render(Page);

    await vi.waitFor(() => expect(tab("10")).not.toBeUndefined());
    const steps = () => document.querySelectorAll('[aria-label="Today\'s routine"] li').length;
    const before = steps();
    tab("10")?.click();
    await vi.waitFor(() => expect(steps()).toBeLessThan(before));
    expect(tab("10")?.getAttribute("aria-pressed")).toBe("true");
  });

  test("switches to Skills and writes the view to the URL", async () => {
    setTestUrl("/music/progress");
    render(Page);

    await vi.waitFor(() => expect(tab("Skills")).not.toBeUndefined());
    tab("Skills")?.click();
    await vi.waitFor(() => expect(document.body.textContent).toContain("Reading the estimate"));
    expect(new URLSearchParams(window.location.search).get("view")).toBe("skills");
    expect(document.body.textContent).toContain("Skill map");
    expect(document.body.textContent).toContain("Review due, dropped 10+ points");
    // One row per skill, each with an estimate track and a last-practised line.
    expect(document.querySelectorAll('[data-testid="skill-row"]').length).toBeGreaterThan(8);
    expect(document.body.textContent).toContain("Never practised unaided");
  });

  test("opens the view named in the URL, on this visit and the next", async () => {
    setTestUrl("/music/progress?view=sessions");
    const sessions = render(Page);

    await vi.waitFor(() => expect(document.body.textContent).toContain("Journal"));
    expect(document.body.textContent).toContain("Practice points");
    expect(document.body.textContent).toContain("Streak calendar");
    expect(document.body.textContent).toContain("This week");
    expect(tab("Sessions")?.getAttribute("aria-pressed")).toBe("true");
    sessions.unmount();

    // Coming back to the route (the real Back path: view changes replaceState,
    // so returning re-mounts and re-reads the address bar) lands on that view.
    setTestUrl("/music/progress?view=skills");
    render(Page);
    await vi.waitFor(() => expect(document.body.textContent).toContain("Reading the estimate"));
    expect(tab("Skills")?.getAttribute("aria-pressed")).toBe("true");
  });

  test("normalises a view nobody can render", async () => {
    setTestUrl("/music/progress?view=bogus");
    render(Page);

    await vi.waitFor(() =>
      expect(new URLSearchParams(window.location.search).get("view")).toBe("next"),
    );
    expect(tab("What next")?.getAttribute("aria-pressed")).toBe("true");
  });

  test("every view fits 375 px without horizontal overflow", async () => {
    await page.viewport(375, 812);
    for (const view of ["next", "skills", "sessions"]) {
      setTestUrl(`/music/progress?view=${view}`);
      const screen = render(Page);
      await vi.waitFor(() =>
        expect(document.querySelector('[data-testid="week-bars"]')).not.toBeNull(),
      );
      expect(document.documentElement.scrollWidth).toBeLessThanOrEqual(
        document.documentElement.clientWidth,
      );
      screen.unmount();
    }
  });

  test("keeps the participation record in Sessions", async () => {
    setTestUrl("/music/progress?view=sessions");
    render(Page);

    await vi.waitFor(() => expect(document.body.textContent).toContain("Daily challenges"));
    expect(document.body.textContent).toContain("Hit today's XP");
    expect(document.body.textContent).toContain("Achievements");
    expect(
      document.querySelectorAll('[data-testid="streak-calendar"] [data-day]').length,
    ).toBeGreaterThan(27);
  });
});
