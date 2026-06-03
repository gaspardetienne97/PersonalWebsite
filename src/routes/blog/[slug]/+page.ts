import { error } from "@sveltejs/kit";
import { dev } from "$app/environment";
import type { PageLoad } from "./$types";

export const load: PageLoad = async ({ params }) => {
  try {
    const post = await import(`../../../lib/blog-posts/${params.slug}.md`);
    console.error(post);
    return {
      Content: post.default,
      meta: post.metadata,
    };
  } catch (e) {
    if (dev) {
      console.error(e);
    }
    error(404, `Could not find ${params.slug}`);
  }
};
