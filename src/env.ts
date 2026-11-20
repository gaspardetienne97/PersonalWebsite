import { defineEnvVars } from "@sveltejs/kit/env";

// Environment variables the app reads at runtime (SvelteKit 3's $app/env). All are
// optional on purpose: without DATABASE_URL and the Authentik settings the site
// runs signed out, and MUSIC_LOGIN / MUSIC_SCORES_DIR have defaults where used.
// See .env.example and handoff/homelab-auth.md.
export const variables = defineEnvVars({
  PUBLIC_SPOTIFY_CLIENT_ID: { public: true, schema: (input) => input },
  AUTHENTIK_ISSUER: { schema: (input) => input },
  AUTHENTIK_CLIENT_ID: { schema: (input) => input },
  AUTHENTIK_CLIENT_SECRET: { schema: (input) => input },
  BETTER_AUTH_URL: { schema: (input) => input },
  ORIGIN: { schema: (input) => input },
  BETTER_AUTH_SECRET: { schema: (input) => input },
  DATABASE_URL: { schema: (input) => input },
  MUSIC_LOGIN: { schema: (input) => input },
  MUSIC_SCORES_DIR: { schema: (input) => input },
});
