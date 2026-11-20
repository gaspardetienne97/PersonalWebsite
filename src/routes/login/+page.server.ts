import { fail, redirect } from "@sveltejs/kit";
import { AUTHENTIK, authentikConfigured, getAuth } from "$lib/server/auth";
import type { Actions, PageServerLoad } from "./$types";

/** A same-site path to come back to after signing in; anything else goes to /private. */
const returnTo = (url: URL) => {
  const to = url.searchParams.get("redirectTo") ?? "";
  return to.startsWith("/") && !to.startsWith("//") && !to.startsWith("/\\") ? to : "/private";
};

export const load: PageServerLoad = ({ locals, url }) => {
  if (locals.user) redirect(303, returnTo(url));
  return { available: authentikConfigured(), error: url.searchParams.get("error") };
};

export const actions: Actions = {
  // Ask Authentik to sign us in, then send the browser there.
  default: async ({ request, url }) => {
    const auth = getAuth();
    if (!auth || !authentikConfigured())
      return fail(503, { message: "Sign-in isn't set up on this server." });

    const to = returnTo(url);
    let target: string;
    try {
      const result = await auth.api.signInWithOAuth2({
        body: {
          providerId: AUTHENTIK,
          callbackURL: to,
          errorCallbackURL: `/login?redirectTo=${encodeURIComponent(to)}`,
        },
        headers: request.headers,
      });
      target = result.url;
    } catch (error) {
      console.error("[auth] Could not start the Authentik sign-in", error);
      return fail(502, { message: "Authentik didn't answer. Check it's running, then try again." });
    }
    redirect(303, target);
  },
};
