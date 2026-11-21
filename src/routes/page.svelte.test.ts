import { describe, expect, it } from "vite-plus/test";
import { render } from "vitest-browser-svelte";
import Page from "./+page.svelte";

describe("/+page.svelte", () => {
  it("shows the newest of each kind in a reel, then a door for every kind", async () => {
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
    // The reel: one slide per kind that holds work and the newest post, newest
    // first (Woodshed is from 2026, the post from 2024, the drawings carry no year).
    const slides = [...document.querySelectorAll(".reel .slide .name")];
    expect(slides.map((link) => link.textContent?.trim())).toEqual([
      "Woodshed",
      "Hello",
      "Trace maze",
    ]);
    expect(slides.map((link) => link.getAttribute("href"))).toEqual([
      "/music",
      "/blog/hello",
      "/studio?type=drawings",
    ]);
    // One pip per slide, and the first is the current one.
    const pips = [...document.querySelectorAll(".reel .pip")];
    expect(pips.map((pip) => pip.getAttribute("aria-current"))).toEqual(["true", null, null]);
    // One door per kind: the kinds with work in them first, then the rest by name.
    const doors = [...document.querySelectorAll('.doors [role="heading"]')].map((h) =>
      h.textContent?.trim(),
    );
    expect(doors).toEqual([
      "Drawings",
      "Projects",
      "Writing",
      "Doodles",
      "Music",
      "Paintings",
      "Photos",
      "Videos",
    ]);
    expect(document.querySelector('a[href="/blog"]')?.textContent).toContain("Hello");
    // A kind with nothing yet says what is coming to screen readers and in a
    // tooltip, not on the door's face.
    const doodles = document.querySelector('.doors a[href="/studio?type=doodles"]');
    expect(doodles?.querySelector(".sr-only")?.textContent).toMatch(/on the way/);
    expect(doodles?.parentElement?.querySelector(".tip")?.textContent).toMatch(/on the way/);
  });
});
