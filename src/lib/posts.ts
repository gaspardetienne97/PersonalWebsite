import type { Post, PostHeading } from "#lib/types.ts";
import { m } from "@repo/i18n/messages.js";

type PostModule = { metadata?: Omit<Post, "slug" | "readingMinutes"> };

const modules = import.meta.glob<PostModule>("/src/lib/blog-posts/*.md", { eager: true });
const sources = import.meta.glob<string>("/src/lib/blog-posts/*.md", {
  eager: true,
  query: "?raw",
  import: "default",
});

const slugOf = (path: string) => path.split("/").at(-1)?.replace(/\.md$/, "") ?? "";

/** Rough reading time at 230 words a minute, ignoring front matter and code fences. */
export function readingMinutes(source: string): number {
  const body = source.replace(/^---[\s\S]*?---/, "").replace(/```[\s\S]*?```/g, " ");
  const words = body.split(/\s+/).filter(Boolean).length;
  return Math.max(1, Math.round(words / 230));
}

/**
 * Newest first. Posts of one date fall back to the slug, descending, so the order
 * is the same on every page and never depends on how the files were read.
 */
export function comparePosts(a: Pick<Post, "date" | "slug">, b: Pick<Post, "date" | "slug">) {
  const byDate = parseDate(b.date).getTime() - parseDate(a.date).getTime();
  return byDate || (a.slug < b.slug ? 1 : a.slug > b.slug ? -1 : 0);
}

/**
 * Whether the first post of a newest-first list is the latest one for certain:
 * the only post, or strictly newer than the second. Two posts of one date say
 * nothing about which came last, so the list does not call either "Latest".
 */
export function hasLatest(posts: Pick<Post, "date">[]): boolean {
  if (posts.length < 2) return posts.length === 1;
  return parseDate(posts[0].date).getTime() > parseDate(posts[1].date).getTime();
}

/** Categories every post carries. A tag they all share tells none of them apart. */
export function sharedCategories(posts: Pick<Post, "categories">[]): string[] {
  if (posts.length < 2) return [];
  return posts[0].categories.filter((name) =>
    posts.every((post) => post.categories.includes(name)),
  );
}

/**
 * The h2 and h3 headings of a post's Markdown, each with an id for a link.
 * ponytail: read from the source text, so smart punctuation and inline HTML in a
 * heading are not applied here. If that matters, turn on mdsvex's `heading_ids`
 * and read the headings from the rendered page instead.
 */
export function headingsOf(source: string): PostHeading[] {
  const body = source.replace(/^---[\s\S]*?---/, "").replace(/```[\s\S]*?```/g, "");
  const seen = new Map<string, number>();
  return [...body.matchAll(/^(#{2,3})[ \t]+(.+?)[ \t]*#*$/gm)].map(([, marks, raw]) => {
    const text = raw.replace(/\[([^\]]*)\]\([^)]*\)/g, "$1").replace(/[`*_]/g, "");
    const slug =
      text
        .normalize("NFKD")
        .replace(/[\u0300-\u036f]/g, "")
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-|-$/g, "") || "section";
    const count = (seen.get(slug) ?? 0) + 1;
    seen.set(slug, count);
    return { depth: marks.length as 2 | 3, text, id: count > 1 ? `${slug}-${count}` : slug };
  });
}

/** The headings of one published post, in reading order. */
export const postHeadings = (slug: string) =>
  headingsOf(sources[`/src/lib/blog-posts/${slug}.md`] ?? "");

/** Published posts, newest first. */
export function getPosts(): Post[] {
  const posts: Post[] = [];
  for (const [path, file] of Object.entries(modules)) {
    const slug = slugOf(path);
    if (!slug || !file.metadata?.published) continue;
    posts.push({
      ...file.metadata,
      categories: file.metadata.categories ?? [],
      slug,
      readingMinutes: readingMinutes(sources[path] ?? ""),
    });
  }
  return posts.sort(comparePosts);
}

/**
 * A category is an id in a post's front matter. The ones listed here are shown
 * in the visitor's language; any other shows as written.
 */
const CATEGORY_LABELS: Record<string, () => string> = {
  blog: m.blog_category_blog,
  personal: m.blog_category_personal,
};
export const categoryLabel = (category: string) => CATEGORY_LABELS[category]?.() ?? category;

/** Dates in front matter look like 2024-9-16; Safari wants slashes. */
export function parseDate(date: string): Date {
  return new Date(date.replaceAll("-", "/"));
}
