import { fail, redirect } from "@sveltejs/kit";
import { AUTHENTIK, authentikConfigured, authentikOrigin, getAuth } from "#lib/server/auth.ts";
import { m } from "@repo/i18n/messages.js";
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
    if (!auth || !authentikConfigured()) return fail(503, { message: m.login_unavailable() });

    const to = returnTo(url);
    let target: string;
    try {
      // Better Auth 1.7 serves generic OAuth providers through the social sign-in endpoint.
      const result = await auth.api.signInSocial({
        body: {
          provider: AUTHENTIK,
          callbackURL: to,
          errorCallbackURL: `/login?redirectTo=${encodeURIComponent(to)}`,
        },
        headers: request.headers,
      });
      if (!result.url) throw new Error("Better Auth returned no Authentik URL");
      target = result.url;
    } catch (error) {
      console.error("[auth] Could not start the Authentik sign-in", error);
      return fail(502, { message: m.login_unreachable() });
    }
    // SvelteKit 3 only redirects off-site when told where to: Authentik, nowhere else.
    const origin = authentikOrigin();
    redirect(303, target, { external: origin ? [origin] : false });
  },
};
