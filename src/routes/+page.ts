import { getPosts } from "#lib/posts.ts";
import type { PageLoad } from "./$types";

export const load: PageLoad = () => {
  const posts = getPosts();
  return { posts: posts.slice(0, 4), postCount: posts.length };
};
