import { describe, expect, test, vi } from "vite-plus/test";
import { render } from "vitest-browser-svelte";

import Page from "./+page.svelte";

describe("/music/learn/rhythm/+page.svelte", () => {
  test("shows pulse setup with MIDI, microphone, and tap-tempo controls", async () => {
    render(Page);

    expect(document.querySelector("h1")?.textContent).toContain("Rhythm Trainer");
    expect(button("Enable MIDI")).not.toBeUndefined();
    expect(button("Start microphone")).not.toBeUndefined();
    expect(button("Tap tempo")).not.toBeUndefined();
    await vi.waitFor(() => expect(button("Start Pulse")?.disabled).toBe(false));
  });

  test("starts a pulse run and accepts on-screen taps", async () => {
    render(Page);
    await vi.waitFor(() => expect(button("Start Pulse")?.disabled).toBe(false));
    button("Start Pulse")?.click();

    await vi.waitFor(() => expect(button("Tap beat")).not.toBeUndefined());
    button("Tap beat")?.click();
    await vi.waitFor(() => expect(document.body.textContent).toContain("Progress"));
  });
});

function button(label: string): HTMLButtonElement | undefined {
  return [...document.querySelectorAll<HTMLButtonElement>("button")].find(
    (candidate) => candidate.textContent?.trim() === label,
  );
}
