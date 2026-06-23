import { describe, expect, test } from "vite-plus/test";
import { render } from "vitest-browser-svelte";

import Page from "./+page.svelte";

describe("/music/learn/jazz/+page.svelte", () => {
  test("renders the learning path and switches between tabs", async () => {
    render(Page);

    expect(document.querySelector("h1")?.textContent).toContain("Jazz Piano");
    // Learning path is the default tab.
    expect(document.body.textContent).toContain("Memorize your intervals");
    expect(document.body.textContent).toContain("Rootless voicings");

    const tabButton = (label: string) =>
      [...document.querySelectorAll('[aria-label="Jazz section"] button')].find(
        (button) => button.textContent?.trim() === label,
      ) as HTMLButtonElement | undefined;

    tabButton("Voicings")?.click();
    await Promise.resolve();
    expect(document.body.textContent).toContain("Rootless ii-V-I");
    expect(document.body.textContent).toContain("Upper structures");
    // 12 keys × 3 voiced chords, plus the advanced-voicing keyboards.
    expect(document.querySelectorAll('[aria-label="Piano voicing"]').length).toBeGreaterThanOrEqual(
      36,
    );

    tabButton("Repertoire")?.click();
    await Promise.resolve();
    expect(document.body.textContent).toContain("Autumn Leaves");
    expect(document.body.textContent).toContain("Blue Bossa");
  });
});
