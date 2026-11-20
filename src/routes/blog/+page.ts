import { getPosts } from "#lib/posts.ts";
import type { PageLoad } from "./$types";

export const load: PageLoad = () => ({ posts: getPosts() });
