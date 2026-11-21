import { describe, expect, it } from "vite-plus/test";
import { comparePosts, headingsOf } from "./posts.ts";

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
