import { describe, expect, test, vi } from "vite-plus/test";
import { render } from "vitest-browser-svelte";

import Page from "./+page.svelte";

describe("/music/library/+page.svelte", () => {
  test("consolidates songs, reference, and import workflows into one Library shell", async () => {
    render(Page);

    expect(document.querySelector("h1")?.textContent).toContain("Library");
    for (const tab of ["Songs", "Reference", "Import"]) {
      expect(document.body.textContent).toContain(tab);
    }
    expect(document.body.textContent).toContain("Song Library");

    [...document.querySelectorAll<HTMLButtonElement>("button")]
      .find((button) => button.textContent?.trim() === "Reference")
      ?.click();
    await vi.waitFor(() => expect(document.body.textContent).toContain("Chord & Scale Reference"));
    expect(document.body.textContent).toContain("Jazz chord-scale matches");

    [...document.querySelectorAll<HTMLButtonElement>("button")]
      .find((button) => button.textContent?.trim() === "Import")
      ?.click();
    await vi.waitFor(() => expect(document.body.textContent).toContain("Drop a score file"));
    expect(document.body.textContent).toContain("Transcribe audio");
    expect(document.querySelector('input[aria-label="Score file"]')).not.toBeNull();
  });
});
