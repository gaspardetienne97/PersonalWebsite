import { render } from "vitest-browser-svelte";
import { describe, expect, test, vi } from "vitest";

import Page from "./+page.svelte";

describe("/music/routine/+page.svelte", () => {
  test("builds and starts an engine-backed daily routine", async () => {
    render(Page);

    expect(document.querySelector("h1")?.textContent).toContain("Daily Routine");
    await vi.waitFor(() => expect(document.body.textContent).toContain("Ear Training"));
    expect(document.body.textContent).toContain("Note Reading");
    expect(document.body.textContent).toContain("Rhythm");
    expect(document.body.textContent).toContain("Scales & Technique");

    const start = [...document.querySelectorAll<HTMLButtonElement>("button")].find((button) =>
      button.textContent?.includes("Start routine"),
    );
    expect(start).toBeDefined();
    await vi.waitFor(() => expect(start?.disabled).toBe(false));
    start?.click();

    await vi.waitFor(() => expect(document.body.textContent).toContain("Up first"));
    const current = document.querySelector<HTMLAnchorElement>(
      'a[href="/music/learn/ear?routine=1"]',
    );
    expect(current?.textContent).toContain("Start Ear Training");
  });
});
