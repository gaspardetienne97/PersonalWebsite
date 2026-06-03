import { describe, expect, it } from "vite-plus/test";
import { render } from "vitest-browser-svelte";
import Page from "./+page.svelte";

describe("/+page.svelte", () => {
  it("keeps the personal website at the root route", async () => {
    render(Page, { data: { posts: [], projects: [] } });

    expect(document.querySelector("h1")?.textContent).toContain("welcome!");
  });
});
