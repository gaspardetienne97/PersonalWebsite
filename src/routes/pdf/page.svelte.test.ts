import { describe, expect, it } from "vite-plus/test";
import { render } from "vitest-browser-svelte";
import Page from "./+page.svelte";

describe("/pdf/+page.svelte", () => {
  it("renders the PDF reader route app", async () => {
    render(Page);

    expect(document.querySelector("h1")?.textContent).toContain("PDF Reader & Narrator");
  });
});
