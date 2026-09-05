import { describe, expect, test, vi } from "vite-plus/test";
import { render } from "vitest-browser-svelte";

import Page from "./+page.svelte";

describe("/music/guide/+page.svelte", () => {
  test("shows a live three-row setup checklist and the seven hubs", async () => {
    render(Page);

    expect(document.querySelector("h1")?.textContent).toContain("How to use Practice OS");

    const checklist = document.querySelector('[data-testid="setup-checklist"]');
    const rows = [...(checklist?.querySelectorAll("li") ?? [])];
    expect(rows.length).toBe(3);
    expect(rows[0]?.textContent).toContain("Enable audio");
    expect(rows[1]?.textContent).toContain("Connect an instrument, or play on-screen");
    expect(rows[2]?.textContent).toContain("Run your first drill");
    // Nothing is done on a fresh device: audio waits for a tap, no MIDI, no journal.
    expect(rows[0]?.getAttribute("data-setup-state")).toBe("warn");
    expect(rows[1]?.getAttribute("data-setup-state")).toBe("off");
    await vi.waitFor(() => expect(rows[2]?.textContent).toContain("Finishing one session"));
    expect(rows[2]?.getAttribute("data-setup-state")).toBe("off");
    expect(rows[1]?.querySelector('a[href="/music/connect"]')).not.toBeNull();
    expect(rows[2]?.querySelector('a[href="/music"]')).not.toBeNull();

    const hubs = [...document.querySelectorAll('[data-testid="guide-hubs"] a')].map((a) =>
      a.getAttribute("href"),
    );
    expect(hubs).toEqual([
      "/music",
      "/music/library",
      "/music/create",
      "/music/progress",
      "/music/connect",
      "/music/tuner",
      "/music/settings",
    ]);
    expect(document.body.textContent).toContain("The practice loop");
    expect(document.body.textContent).toContain("offline");
  });
});
