import { describe, expect, it } from "vite-plus/test";
import { render } from "vitest-browser-svelte";

import Page from "./+page.svelte";

describe("/pdf/+page.svelte", () => {
  it("renders the narrator library", async () => {
    localStorage.clear();
    render(Page);

    expect(document.querySelector("h1")?.textContent).toContain("narrator");
    expect(document.body.textContent).toContain("Your Library");
    // Sample library is seeded on first load.
    expect(document.body.textContent).toContain("The Time Machine");
  });
});
