import { describe, expect, it } from "vite-plus/test";
import { render } from "vitest-browser-svelte";

import Page from "./+page.svelte";

describe("/pdf/+page.svelte", () => {
  it("renders the narrator library", async () => {
    localStorage.clear();
    await render(Page);

    expect(document.querySelector("h1")?.textContent).toContain("narrator");
    expect(document.body.textContent).toContain("Your Library");
    // Sample library is seeded on first load.
    expect(document.body.textContent).toContain("The Time Machine");
    // A first visit says what the documents are and offers two ways in, with no fake progress.
    expect(document.body.textContent).toContain("These are samples to try.");
    expect(document.body.textContent).toContain("Listen to a 2 min sample");
    expect(document.body.textContent).not.toContain("Continue listening");
  });
});
