import { describe, expect, test } from "vite-plus/test";
import { render } from "vitest-browser-svelte";

import Page from "./+page.svelte";

describe("/music/learn/path/+page.svelte", () => {
  test("renders the ten ordered jazz steps with an instrument toggle and drill links", async () => {
    render(Page);

    expect(document.querySelector("h1")?.textContent).toContain("Jazz Path");

    const instruments = [...document.querySelectorAll('[aria-label="Instrument"] button')].map(
      (button) => button.textContent?.trim(),
    );
    expect(instruments).toEqual(["Piano", "Guitar", "Ukulele", "Aerophone"]);

    const steps = document.querySelectorAll('[data-testid="jazz-path-steps"] li');
    expect(steps).toHaveLength(10);
    expect(steps[0]?.textContent).toContain("Memorize your intervals");
    expect(steps[7]?.textContent).toContain("Play the licks over ii-V-I");
    expect(steps[9]?.textContent).toContain("Learn repertoire from a Real Book");

    // Steps deep-link into the drill that practises them, with its setup.
    const links = [...document.querySelectorAll('[data-testid="jazz-path-steps"] a')].map((a) =>
      a.getAttribute("href"),
    );
    expect(links).toContain("/music/learn/ear/intervals");
    expect(links).toContain("/music/play/voicings");
    expect(links).toContain("/music/play/chord-scales?changes=major");
    expect(links).toContain("/music/play/licks?category=major-ii-V-I");
    // Reference steps stay in the list and link the drill that hears them.
    expect(links).toContain("/music/learn/ear/chord-qualities");
    expect(document.body.textContent).toContain("Reference");
  });
});
