import { describe, expect, it } from "vite-plus/test";
import { render } from "vitest-browser-svelte";

import Page from "./+page.svelte";

describe("/music/+page.svelte (Practice hub)", () => {
  it("renders the Practice hub with Today/Drills/Paths and today's plan", () => {
    render(Page);

    expect(document.querySelector("h1")?.textContent).toContain("Practice");
    for (const tab of ["Today", "Drills", "Paths"]) {
      expect(document.body.textContent).toContain(tab);
    }
    // Today's view links to the daily-routine runner.
    expect(document.querySelector('a[href="/music/routine"]')).not.toBeNull();
  });
});
