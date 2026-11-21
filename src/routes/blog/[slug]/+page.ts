import { error } from "@sveltejs/kit";
import type { Component } from "svelte";
import { getPosts, postHeadings } from "#lib/posts.ts";
import type { PageLoad } from "./$types";

const modules = import.meta.glob<{ default: Component }>("/src/lib/blog-posts/*.md");

export const load: PageLoad = async ({ params }) => {
  const posts = getPosts();
  const index = posts.findIndex((post) => post.slug === params.slug);
  const load = modules[`/src/lib/blog-posts/${params.slug}.md`];
  if (index === -1 || !load) error(404, `No post called “${params.slug}”`);

  const { default: Content } = await load();
  return {
    post: posts[index],
    Content,
    headings: postHeadings(params.slug),
    // The posts before and after this one in the list, which is newest first.
    newer: posts[index - 1] ?? null,
    older: posts[index + 1] ?? null,
  };
};
