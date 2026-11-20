import { redirect } from "@sveltejs/kit";
import { getAuth } from "#lib/server/auth.ts";
import type { Actions, PageServerLoad } from "./$types";

export const load: PageServerLoad = ({ locals, url }) => {
  if (!locals.user) redirect(303, `/login?redirectTo=${encodeURIComponent(url.pathname)}`);
  const { name, email, image } = locals.user;
  return { user: { name, email, image } };
};

export const actions: Actions = {
  signOut: async ({ request }) => {
    await getAuth()?.api.signOut({ headers: request.headers });
    redirect(303, "/");
  },
};
