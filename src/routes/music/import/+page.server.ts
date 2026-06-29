import { redirect } from "@sveltejs/kit";

export function load(): never {
  redirect(302, "/music/library?tab=import");
}
