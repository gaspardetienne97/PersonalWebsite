import type { Post } from "$lib/types";
import * as config from "$lib/config";

export async function load({ fetch }) {
  const response = await fetch("/blog");
  const posts: Post[] = await response.json();

  return { posts, projects: config.projects };
}
