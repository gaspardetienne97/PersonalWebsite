import { describe, expect, it } from "vite-plus/test";
import { render } from "vitest-browser-svelte";
import Header from "./Header.svelte";

describe("Header", () => {
  it("links to route apps", async () => {
    render(Header);

    expect(document.querySelector<HTMLAnchorElement>('a[href="/music"]')?.textContent).toContain(
      "Music",
    );
    expect(document.querySelector<HTMLAnchorElement>('a[href="/pdf"]')?.textContent).toContain(
      "PDF",
    );
  });
});
