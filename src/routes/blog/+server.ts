import { json } from "@sveltejs/kit";
import { getPosts } from "$lib/posts";

/** Published posts as JSON, newest first. */
export function GET() {
  return json(getPosts());
}
