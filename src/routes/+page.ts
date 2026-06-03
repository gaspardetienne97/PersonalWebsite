import type { Post } from "$lib/types";
import * as config from "$lib/config";
import type { PageLoad } from "./$types";

export const load: PageLoad = async ({ fetch }) => {
  const response = await fetch("/blog");
  const posts: Post[] = await response.json();

  return { posts, projects: config.projects };
};
