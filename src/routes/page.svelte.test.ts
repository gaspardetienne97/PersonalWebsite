import { describe, expect, it } from "vite-plus/test";
import { render } from "vitest-browser-svelte";
import Page from "./+page.svelte";

describe("/+page.svelte", () => {
  it("shows the newest post and piece, then a door for every kind", async () => {
    await render(Page, {
      data: {
        posts: [
          {
            slug: "hello",
            title: "Hello",
            description: "First words.",
            date: "2024-9-16",
            categories: ["personal"],
            published: true,
            readingMinutes: 2,
          },
        ],
        postCount: 1,
      },
    });

    const headings = [...document.querySelectorAll("h2")].map((h) => h.textContent?.trim());
    expect(headings).toEqual(expect.arrayContaining(["Newest", "Everything I make"]));
    // The newest post, and the newest piece (Woodshed, the latest project).
    expect(document.querySelector('a[href="/blog/hello"]')?.textContent).toContain("Hello");
    expect(document.querySelector<HTMLAnchorElement>('a[href="/music"]')?.textContent).toContain(
      "Woodshed",
    );
    // One door per kind, with Writing as the last.
    const doors = [...document.querySelectorAll('.doors [role="heading"]')].map((h) =>
      h.textContent?.trim(),
    );
    expect(doors).toEqual([
      "Doodles",
      "Drawings",
      "Music",
      "Paintings",
      "Photos",
      "Projects",
      "Videos",
      "Writing",
    ]);
    expect(document.querySelector('a[href="/blog"]')?.textContent).toContain("Hello");
  });
});
