import { describe, expect, test } from "vite-plus/test";
import { render } from "vitest-browser-svelte";

import Page from "./+page.svelte";

describe("/music/play/+page.svelte", () => {
  test("links to scale technique practice", () => {
    render(Page);

    expect(document.querySelector("h1")?.textContent).toContain("Play");
    expect(document.querySelector('a[href="/music/play/scales"]')?.textContent).toContain(
      "Scales & Technique",
    );
  });

  test("links to MPC rudiment practice", () => {
    render(Page);

    expect(document.querySelector('a[href="/music/play/mpc"]')?.textContent).toContain(
      "MPC Rudiments",
    );
  });
});
