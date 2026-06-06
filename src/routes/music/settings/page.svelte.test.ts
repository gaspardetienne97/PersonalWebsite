import { describe, expect, test, vi } from "vite-plus/test";
import { render } from "vitest-browser-svelte";

import Page from "./+page.svelte";

describe("/music/settings/+page.svelte", () => {
  test("renders the settings sections", async () => {
    render(Page);

    expect(document.querySelector("h1")?.textContent).toContain("Settings");
    await vi.waitFor(() => expect(document.body.textContent).toContain("Audio & MIDI"));
    expect(document.body.textContent).toContain("Latency calibration");
    expect(document.body.textContent).toContain("Appearance");
  });

  test("toggles reduce motion and persists in-memory", async () => {
    render(Page);
    await vi.waitFor(() => expect(document.body.textContent).toContain("Settings loaded."));

    const toggle = document.querySelector<HTMLInputElement>('input[aria-label="Reduce motion"]');
    expect(toggle).not.toBeNull();
    expect(toggle?.checked).toBe(false);
    toggle?.click();
    await vi.waitFor(() => expect(toggle?.checked).toBe(true));
  });
});
