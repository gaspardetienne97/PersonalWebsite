import { describe, expect, test } from "vite-plus/test";
import { render } from "vitest-browser-svelte";

import Page from "./+page.svelte";

describe("/music/studio/+page.svelte", () => {
  test("renders the sequencer grid and pad bank", () => {
    render(Page);
    expect(document.querySelector("h1")?.textContent).toContain("Studio");
    expect(document.body.textContent).toContain("Sequencer");
    expect(document.body.textContent).toContain("Pad bank");
    // 6 rows x 16 steps of step buttons
    expect(document.querySelectorAll('button[aria-label^="Kick step"]').length).toBe(16);
  });

  test("toggles a step cell", async () => {
    render(Page);
    const cell = document.querySelector<HTMLButtonElement>('button[aria-label="Snare step 1"]');
    expect(cell).not.toBeNull();
    const before = cell?.getAttribute("aria-pressed");
    cell?.click();
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(cell?.getAttribute("aria-pressed")).not.toBe(before);
  });
});
