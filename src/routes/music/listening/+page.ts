import { redirect } from "@sveltejs/kit";

// Studio ears is a mode of the Ear trainer now. Old links keep their query (?exercise=peak&bands=3...).
export function load({ url }) {
  redirect(308, `/music/ear/studio${url.search}`);
}
