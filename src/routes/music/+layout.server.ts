import { redirect } from "@sveltejs/kit";
import { musicLoginRequired } from "$lib/server/auth";
import type { LayoutServerLoad } from "./$types";

// A server load, so client-side navigation into /music asks the server too.
export const load: LayoutServerLoad = ({ locals, url }) => {
  if (musicLoginRequired() && !locals.user)
    redirect(302, `/demo/lucia/login?redirectTo=${encodeURIComponent(url.pathname + url.search)}`);
  return {};
};
