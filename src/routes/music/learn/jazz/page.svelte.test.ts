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
    expect(document.body.textContent).toContain("Rootless ii-V-I drill preview");
    expect(document.body.textContent).toContain("Practice major");
    expect(document.body.textContent).toContain("Upper structures");
    const drillLink = [...document.querySelectorAll("a")].find((anchor) =>
      anchor.textContent?.includes("Practice major"),
    );
    expect(drillLink?.getAttribute("href")).toBe("/music/play/voicings?variant=major");
    // The 12-key reference grid now lives on the graded drill page as its preview;
    // the remaining instrument views belong to the advanced altered/upper-structure reference.
    expect(document.querySelectorAll('[aria-label="Piano voicing"]').length).toBeLessThan(36);
    expect(document.body.textContent).not.toContain("C major  Play Dm7");

    tabButton("Repertoire")?.click();
    await Promise.resolve();
    expect(document.body.textContent).toContain("Autumn Leaves");
    expect(document.body.textContent).toContain("Blue Bossa");
  });
});
