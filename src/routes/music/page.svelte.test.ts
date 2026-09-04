import { afterEach, describe, expect, it, vi } from "vite-plus/test";
import { render } from "vitest-browser-svelte";

import Page from "./+page.svelte";
import { setTestUrl } from "./_components/test-url";

describe("/music/+page.svelte (Practice hub)", () => {
  afterEach(() => {
    setTestUrl("/");
    document.body.replaceChildren();
  });

  it("reads the tab from the URL and writes it back", async () => {
    setTestUrl("/music?tab=drills");
    render(Page);

    expect(document.querySelector('[aria-label="Practice drills"]')).not.toBeNull();

    const pathsTab = [...document.querySelectorAll<HTMLButtonElement>("button")].find(
      (button) => button.textContent?.trim() === "Paths",
    );
    pathsTab?.click();
    await vi.waitFor(() => expect(window.location.search).toContain("tab=paths"));

    const todayTab = [...document.querySelectorAll<HTMLButtonElement>("button")].find(
      (button) => button.textContent?.trim() === "Today",
    );
    todayTab?.click();
    await vi.waitFor(() => expect(window.location.search).not.toContain("tab="));
  });

  it("renders the Practice hub with Today/Drills/Paths and today's plan", async () => {
    render(Page);

    expect(document.querySelector("h1")?.textContent).toContain("Practice");
    for (const tab of ["Today", "Drills", "Paths"]) {
      expect(document.body.textContent).toContain(tab);
    }
    await vi.waitFor(() => expect(document.body.textContent).toContain("Ear training review"));
    expect(document.body.textContent).toContain("Adaptive plan");
    expect(document.body.textContent).toContain("Why this plan");
    expect(document.body.textContent).toContain("Start routine");
    expect(document.querySelector('a[href="/music/routine"]')).toBeNull();
    expect(document.querySelector('a[href="/music/coach"]')).toBeNull();
  });

  it("surfaces ear training as a guided path", async () => {
    render(Page);

    const pathsTab = [...document.querySelectorAll<HTMLButtonElement>("button")].find(
      (button) => button.textContent?.trim() === "Paths",
    );
    pathsTab?.click();

    await vi.waitFor(() => expect(document.body.textContent).toContain("Ear Training Path"));
    expect(document.querySelector('a[href="/music/learn/ear"]')).not.toBeNull();
  });
});
