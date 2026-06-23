import { describe, expect, test } from "vite-plus/test";
import { render } from "vitest-browser-svelte";

import Page from "./+page.svelte";

describe("/music/learn/path/+page.svelte", () => {
  test("renders the ordered jazz path with an instrument toggle and step links", async () => {
    render(Page);

    expect(document.querySelector("h1")?.textContent).toContain("Jazz Path");

    const instruments = [...document.querySelectorAll('[aria-label="Instrument"] button')].map(
      (button) => button.textContent?.trim(),
    );
    expect(instruments).toEqual(["Piano", "Guitar", "Ukulele", "Aerophone"]);

    // First and last lessons are present, in order.
    expect(document.body.textContent).toContain("Memorize your intervals");
    expect(document.body.textContent).toContain("Learn repertoire from a Real Book");

    // Steps deep-link into real tools.
    const practiceLinks = [...document.querySelectorAll('a[href^="/music/"]')].map((a) =>
      a.getAttribute("href"),
    );
    expect(practiceLinks).toContain("/music/play/voicings");
  });
});
