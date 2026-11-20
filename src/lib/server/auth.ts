/**
 * Sign-in for the site, with Better Auth and Authentik (OIDC) from the homelab.
 *
 * Configured from the environment (see .env.example):
 * - DATABASE_URL: Postgres for users and sessions. Without it, sign-in is off and
 *   everyone browses signed out (local dev and the e2e preview run this way).
 * - BETTER_AUTH_SECRET: signs session cookies. Required in production.
 * - BETTER_AUTH_URL: the site's public address, e.g. https://example.com.
 * - AUTHENTIK_ISSUER, AUTHENTIK_CLIENT_ID, AUTHENTIK_CLIENT_SECRET: the Authentik
 *   OAuth2/OpenID provider. Its redirect URI is
 *   {BETTER_AUTH_URL}/api/auth/callback/authentik.
 */
import { dev } from "$app/env";
import { getRequestEvent } from "$app/server";

import {
  AUTHENTIK_ISSUER,
  AUTHENTIK_CLIENT_ID,
  AUTHENTIK_CLIENT_SECRET,
  BETTER_AUTH_URL,
  ORIGIN,
  BETTER_AUTH_SECRET,
  DATABASE_URL,
  MUSIC_LOGIN,
} from "$app/env/private";

import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { genericOAuth } from "better-auth/plugins";
import { sveltekitCookies } from "better-auth/svelte-kit";
import { db } from "#lib/server/db/index.ts";
import * as schema from "#lib/server/db/schema.ts";

export const AUTHENTIK = "authentik";

/** The Authentik provider, when its settings are present. */
function authentikProvider() {
  const issuer = AUTHENTIK_ISSUER?.replace(/\/+$/, "");
  if (!issuer || !AUTHENTIK_CLIENT_ID) return [];
  return [
    {
      providerId: AUTHENTIK,
      discoveryUrl: `${issuer}/.well-known/openid-configuration`,
      clientId: AUTHENTIK_CLIENT_ID,
      clientSecret: AUTHENTIK_CLIENT_SECRET,
      scopes: ["openid", "profile", "email"],
      pkce: true,
    },
  ];
}

function createAuth() {
  return betterAuth({
    baseURL: BETTER_AUTH_URL || ORIGIN || undefined,
    secret: BETTER_AUTH_SECRET || undefined,
    database: drizzleAdapter(db, {
      provider: "pg",
      schema: {
        user: schema.authUser,
        session: schema.authSession,
        account: schema.authAccount,
        verification: schema.authVerification,
      },
    }),
    session: {
      // Keep the signed session in a cookie for a few minutes, so most page loads
      // don't need a database round trip to know who's signed in.
      cookieCache: { enabled: true, maxAge: 5 * 60 },
    },
    // Keep Authentik's profile (name, email, picture) current on every sign-in.
    account: { updateAccountOnSignIn: true },
    plugins: [genericOAuth({ config: authentikProvider() }), sveltekitCookies(getRequestEvent)],
  });
}

export type Auth = ReturnType<typeof createAuth>;
export type SessionUser = Auth["$Infer"]["Session"]["user"];
export type Session = Auth["$Infer"]["Session"]["session"];

let instance: Auth | null | undefined;

/**
 * The auth instance, or null when sign-in isn't configured here. Created on first
 * use so builds and prerendering never need a database or secret.
 */
export function getAuth(): Auth | null {
  if (instance !== undefined) return instance;
  if (!DATABASE_URL) return (instance = null);
  if (!dev && !BETTER_AUTH_SECRET) {
    console.error("[auth] BETTER_AUTH_SECRET is not set, so sign-in is turned off.");
    return (instance = null);
  }
  return (instance = createAuth());
}

/** Authentik's origin: the one external place sign-in may redirect the browser to. */
export const authentikOrigin = () => (AUTHENTIK_ISSUER ? new URL(AUTHENTIK_ISSUER).origin : null);

/** Whether the Authentik button can work on this server. */
export const authentikConfigured = () => getAuth() !== null && authentikProvider().length > 0;

/** This deployment keeps the music app behind a login. Off by default, so local dev and the
 * e2e preview run without a database. */
export const musicLoginRequired = () => MUSIC_LOGIN === "required";
