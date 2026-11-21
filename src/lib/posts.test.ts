import { describe, expect, it } from "vite-plus/test";
import { comparePosts, hasLatest, headingsOf, sharedCategories } from "./posts.ts";

describe("hasLatest", () => {
  const dated = (...dates: string[]) => dates.map((date) => ({ date }));

  it("is true for one post, and for a first post newer than the second", () => {
    expect(hasLatest(dated("2024-9-16"))).toBe(true);
    expect(hasLatest(dated("2025-1-2", "2024-9-16"))).toBe(true);
    expect(hasLatest(dated("2024-9-16 18:30", "2024-9-16"))).toBe(true);
  });

  it("is false with no posts, and while the first two share a date", () => {
    expect(hasLatest([])).toBe(false);
    expect(hasLatest(dated("2024-9-16", "2024-9-16", "2024-9-16"))).toBe(false);
  });
});

describe("sharedCategories", () => {
  const tagged = (...lists: string[][]) => lists.map((categories) => ({ categories }));

  it("lists the categories every post carries", () => {
    expect(sharedCategories(tagged(["blog", "personal"], ["personal", "blog"]))).toEqual([
      "blog",
      "personal",
    ]);
    expect(sharedCategories(tagged(["blog", "svelte"], ["blog"], ["blog", "audio"]))).toEqual([
      "blog",
    ]);
  });

  it("is empty when nothing is shared, and for a single post", () => {
    expect(sharedCategories(tagged(["svelte"], ["audio"]))).toEqual([]);
    expect(sharedCategories(tagged(["blog"]))).toEqual([]);
    expect(sharedCategories([])).toEqual([]);
  });
});

describe("comparePosts", () => {
  const sorted = (posts: { date: string; slug: string }[]) =>
    posts.sort(comparePosts).map((post) => post.slug);

  it("puts the newest first, and reads a time on the same day", () => {
    expect(
      sorted([
        { date: "2024-9-16", slug: "a" },
        { date: "2025-1-2", slug: "b" },
        { date: "2024-9-16 18:30", slug: "c" },
      ]),
    ).toEqual(["b", "c", "a"]);
  });

  it("orders posts of one date by slug, whatever order they arrive in", () => {
    const day = (slug: string) => ({ date: "2024-9-16", slug });
    expect(sorted([day("post2"), day("post3"), day("welcome")])).toEqual([
      "welcome",
      "post3",
      "post2",
    ]);
    expect(sorted([day("welcome"), day("post3"), day("post2")])).toEqual([
      "welcome",
      "post3",
      "post2",
    ]);
  });
});

describe("headingsOf", () => {
  it("lists h2 and h3 with ids, skipping front matter, code and other levels", () => {
    const source = [
      "---",
      "title: A post",
      "---",
      "# Title",
      "## Why I built it",
      "```md",
      "## not a heading",
      "```",
      "### The `router` and [its grid](/about)",
      "#### Too deep",
      "## Été à Boston",
    ].join("\n");
    expect(headingsOf(source)).toEqual([
      { depth: 2, text: "Why I built it", id: "why-i-built-it" },
      { depth: 3, text: "The router and its grid", id: "the-router-and-its-grid" },
      { depth: 2, text: "Été à Boston", id: "ete-a-boston" },
    ]);
  });

  it("keeps ids unique when headings repeat", () => {
    expect(headingsOf("## Notes\n\n## Notes\n\n## !!!").map((h) => h.id)).toEqual([
      "notes",
      "notes-2",
      "section",
    ]);
  });
});
