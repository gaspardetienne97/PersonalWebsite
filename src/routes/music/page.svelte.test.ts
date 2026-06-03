import { describe, expect, it } from "vite-plus/test";
import { render } from "vitest-browser-svelte";
import Page from "./+page.svelte";

describe("/music/+page.svelte", () => {
  it("renders the music practice app on its own route", async () => {
    render(Page);

    expect(document.querySelector("h1")?.textContent).toContain("Musicianship OS");
  });
});
