import { afterEach, describe, expect, test, vi } from "vite-plus/test";
import { render } from "vitest-browser-svelte";

import Page from "./+page.svelte";

afterEach(() => {
  vi.restoreAllMocks();
  document.body.replaceChildren();
});

describe("/music/play/two-hand/+page.svelte", () => {
  test("completes a two-hand drill from the on-screen keys", async () => {
    render(Page);

    expect(document.querySelector("h1")?.textContent).toContain("Two-Hand Independence");
    await vi.waitFor(() => expect(button("Start drill")?.disabled).toBe(false));

    button("Start drill")?.click();
    await vi.waitFor(() => expect(button("Cancel drill")).not.toBeUndefined());

    // 2 bars: left hand = 8 beats, right hand = 16 eighth notes → 24 notes total.
    for (let beat = 0; beat < 8; beat += 1) button("C2")?.click();
    for (let eighth = 0; eighth < 16; eighth += 1) button("C4")?.click();

    await vi.waitFor(() => {
      expect(document.body.textContent).toContain("Drill complete");
      expect(button("Repeat drill")).not.toBeUndefined();
    });
  });
});

function button(label: string): HTMLButtonElement | undefined {
  return [...document.querySelectorAll<HTMLButtonElement>("button")].find(
    (candidate) => candidate.textContent?.trim() === label,
  );
}
