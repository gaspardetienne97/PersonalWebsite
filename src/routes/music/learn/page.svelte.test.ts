import { describe, expect, test } from "vite-plus/test";
import { render } from "vitest-browser-svelte";

import Page from "./+page.svelte";

describe("/music/learn/+page.svelte", () => {
  test("links to ear training, note reading, and the theory library", () => {
    render(Page);

    expect(document.querySelector("h1")?.textContent).toContain("Learn");
    expect(document.querySelector('a[href="/music/learn/ear"]')?.textContent).toContain(
      "Ear Training",
    );
    expect(document.querySelector('a[href="/music/learn/theory"]')?.textContent).toContain(
      "Theory Library",
    );
    expect(document.querySelector('a[href="/music/learn/reading"]')?.textContent).toContain(
      "Note Reading",
    );
  });
});
