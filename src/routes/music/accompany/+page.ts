import { redirect } from "@sveltejs/kit";

// This drill is a mode of Play over changes now. Old links keep their query.
export function load({ url }) {
  redirect(308, `/music/changes/accompany${url.search}`);
}
