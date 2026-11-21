import type { Post } from "#lib/types.ts";
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
  return posts.sort((a, b) => parseDate(b.date).getTime() - parseDate(a.date).getTime());
}

/**
 * A category is an id in a post's front matter. The ones listed here are shown
 * in the visitor's language; any other shows as written.
 */
const CATEGORY_LABELS: Record<string, () => string> = {
  blog: m.nav_blog,
  personal: m.blog_category_personal,
};
export const categoryLabel = (category: string) => CATEGORY_LABELS[category]?.() ?? category;

/** Dates in front matter look like 2024-9-16; Safari wants slashes. */
export function parseDate(date: string): Date {
  return new Date(date.replaceAll("-", "/"));
}
