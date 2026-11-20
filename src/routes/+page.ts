import { getPosts } from "$lib/posts";
import type { PageLoad } from "./$types";

export const load: PageLoad = () => {
  const posts = getPosts();
  return { posts: posts.slice(0, 4), postCount: posts.length };
};
