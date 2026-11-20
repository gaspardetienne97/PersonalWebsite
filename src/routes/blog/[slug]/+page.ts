import { error } from "@sveltejs/kit";
import type { Component } from "svelte";
import { getPosts } from "$lib/posts";
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
    // Posts are newest first, so the next one is older.
    newer: posts[index - 1] ?? null,
    older: posts[index + 1] ?? null,
  };
};
