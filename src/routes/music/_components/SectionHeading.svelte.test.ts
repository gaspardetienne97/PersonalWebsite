import { describe, expect, test } from "vite-plus/test";
import { render } from "vitest-browser-svelte";

import SectionHeading from "./SectionHeading.svelte";

describe("SectionHeading", () => {
  test("renders an eyebrow and an h2 by default, an h3 at level 3", () => {
    render(SectionHeading, { eyebrow: "Repertoire · 4 songs", title: "Songs", id: "songs" });
    expect(document.querySelector("h2#songs")?.textContent?.trim()).toBe("Songs");
    expect(document.body.textContent).toContain("Repertoire · 4 songs");
    document.body.replaceChildren();
    render(SectionHeading, { title: "Takes", level: 3 });
    expect(document.querySelector("h3")?.textContent?.trim()).toBe("Takes");
    expect(document.querySelector("h2")).toBeNull();
  });
});
