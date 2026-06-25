import { describe, expect, test, vi } from "vite-plus/test";
import { render } from "vitest-browser-svelte";

import Page from "./+page.svelte";

describe("/music/connect/+page.svelte", () => {
  test("renders device, routing, and fallback sections", async () => {
    render(Page);

    expect(document.querySelector("h1")?.textContent).toContain("Connect Instruments");
    expect(document.body.textContent).toContain("MIDI devices");
    expect(document.body.textContent).toContain("MPC One+ pad LEDs");
    expect(document.body.textContent).toContain("Preferred source per instrument");
    expect(document.body.textContent).toContain("On-screen fallback");
    expect(
      document.querySelector('[role="group"][aria-label="On-screen keyboard"]'),
    ).not.toBeNull();
  });

  test("persists a per-instrument source preference", async () => {
    render(Page);
    // Wait until the store has loaded (initialize resolves and toggles `ready`).
    await vi.waitFor(() =>
      expect(document.body.textContent).toMatch(/Enable MIDI|Devices connected/),
    );

    const audio = [...document.querySelectorAll<HTMLButtonElement>("button")].find(
      (button) => button.textContent?.trim() === "Audio",
    );
    expect(audio).not.toBeUndefined();
    audio?.click();
    // The selected source reflects back through persisted preferences.
    await vi.waitFor(() => expect(audio?.getAttribute("aria-pressed")).toBe("true"));
  });
});
