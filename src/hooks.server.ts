import { building } from "$app/environment";
import { sequence } from "@sveltejs/kit/hooks";
import { svelteKitHandler } from "better-auth/svelte-kit";
import * as auth from "$lib/server/auth";
import { json, type Handle } from "@sveltejs/kit";
import { paraglideMiddleware } from "$lib/paraglide/server";

const handleParaglide: Handle = ({ event, resolve }) =>
  paraglideMiddleware(event.request, ({ request, locale }) => {
    event.request = request;

    return resolve(event, {
      transformPageChunk: ({ html }) => html.replace("%paraglide.lang%", locale),
    });
  });

// Better Auth answers its own routes (/api/auth/*) and tells every page who's
// signed in. Where sign-in isn't configured, everyone is simply signed out.
const handleAuth: Handle = async ({ event, resolve }) => {
  event.locals.user = null;
  event.locals.session = null;

  const instance = auth.getAuth();
  if (!instance) {
    return event.url.pathname.startsWith("/api/auth/")
      ? json({ message: "Sign-in isn't set up on this server" }, { status: 503 })
      : resolve(event);
  }

  try {
    const found = await instance.api.getSession({ headers: event.request.headers });
    event.locals.user = found?.user ?? null;
    event.locals.session = found?.session ?? null;
  } catch (error) {
    // A database hiccup shouldn't take the site down: carry on signed out.
    console.error("[auth] Could not read the session", error);
  }

  return svelteKitHandler({ event, resolve, auth: instance, building });
};

// Music endpoints (e.g. bundled licks) need a signed-in user when MUSIC_LOGIN=required;
// the music pages check it in routes/music/+layout.server.ts.
const handleMusicApi: Handle = ({ event, resolve }) =>
  event.url.pathname.startsWith("/api/music") && auth.musicLoginRequired() && !event.locals.user
    ? json({ message: "Sign in first" }, { status: 401 })
    : resolve(event);

export const handle: Handle = sequence(handleParaglide, handleAuth, handleMusicApi);
