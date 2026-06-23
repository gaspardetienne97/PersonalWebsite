import { describe, expect, test } from "vite-plus/test";
import { render } from "vitest-browser-svelte";

import Page from "./+page.svelte";

describe("/music/learn/+page.svelte", () => {
  test("links to every learn child route", () => {
    render(Page);

    expect(document.querySelector("h1")?.textContent).toContain("Learn");
    expect(document.querySelector('a[href="/music/learn/path"]')?.textContent).toContain(
      "Jazz Path",
    );
    expect(document.querySelector('a[href="/music/learn/ear"]')?.textContent).toContain(
      "Ear Training",
    );
    expect(document.querySelector('a[href="/music/learn/theory"]')?.textContent).toContain(
      "Theory Library",
    );
    expect(document.querySelector('a[href="/music/learn/reading"]')?.textContent).toContain(
      "Note Reading",
    );
    expect(document.querySelector('a[href="/music/learn/rhythm"]')?.textContent).toContain(
      "Rhythm Trainer",
    );
    expect(document.querySelector('a[href="/music/learn/aerophone"]')?.textContent).toContain(
      "Aerophone",
    );
    expect(document.querySelector('a[href="/music/play/scales"]')?.textContent).toContain(
      "Scales & Drills",
    );
    expect(document.querySelector('a[href="/music/learn/jazz"]')?.textContent).toContain(
      "Jazz Piano",
    );
  });
});
