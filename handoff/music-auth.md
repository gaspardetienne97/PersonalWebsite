# Music app: move the login to Better Auth

For the agent working on the music app (Woodshed, `/music`). The site's sign-in
has been replaced: the template's demo login (`/demo/lucia/login`, username and
password with Argon2 and Oslo) is gone, and the site now uses **Better Auth with
Authentik (OIDC)**. The music app's optional login needs to follow.

Where the change lives: branch `ge/personal-website-redesign` (not merged or
pushed yet). Deployment is covered separately in `handoff/homelab-auth.md`.

## What the music app has to change

**1. The login redirect.** `src/routes/music/+layout.server.ts` sends signed-out
visitors to a page that no longer exists. Point it at `/login`:

```ts
import { redirect } from "@sveltejs/kit";
import { musicLoginRequired } from "$lib/server/auth";
import type { LayoutServerLoad } from "./$types";

// A server load, so client-side navigation into /music asks the server too.
export const load: LayoutServerLoad = ({ locals, url }) => {
  if (musicLoginRequired() && !locals.user)
    redirect(302, `/login?redirectTo=${encodeURIComponent(url.pathname + url.search)}`);
  return {};
};
```

`/login` sends the visitor back to `redirectTo` after signing in. It only follows
same-site paths (starting with a single `/`).

**2. Anything that read the old user's fields.** `locals.user` is now Better
Auth's user:

```ts
{ id, name, email, emailVerified, image, createdAt, updatedAt }
```

There is no `username` (use `name` or `email`) and no `age`. `locals.session` is
Better Auth's session (`id`, `token`, `userId`, `expiresAt`, ...). Both are
`null` when signed out, so `!locals.user` checks keep working.

**3. Anything that used the old auth module or tables directly.** These are gone:

- From `$lib/server/auth`: `sessionCookieName`, `generateSessionToken`,
  `createSession`, `validateSessionToken`, `invalidateSession`,
  `setSessionTokenCookie`, `deleteSessionTokenCookie`, `SessionValidationResult`.
- From `$lib/server/db/schema`: the `user` and `session` tables and the `User` and
  `Session` types.
- The packages `@node-rs/argon2`, `@oslojs/crypto` and `@oslojs/encoding`.

To find uses on your branch:

```sh
grep -rnE "demo/lucia|validateSessionToken|sessionCookieName|auth-session|SessionValidationResult|\.username|argon2|@oslojs|schema\.(user|session)\b|table\.(user|session)\b" src e2e packages
```

## What stays the same

- `musicLoginRequired()` in `$lib/server/auth` (true when `MUSIC_LOGIN=required`).
- `hooks.server.ts` still answers `/api/music/*` with `401 { message: "Sign in first" }`
  when the login is required and nobody is signed in.
- Without `DATABASE_URL` (local dev, the e2e preview) everyone is signed out and
  nothing touches a database, so e2e runs with `MUSIC_LOGIN` unset behave as before.

## The new auth API, if the music app needs more

```ts
import { getAuth } from "$lib/server/auth";

// Server side. null when sign-in isn't configured here.
const auth = getAuth();
const session = await auth?.api.getSession({ headers: request.headers });
```

In pages and endpoints, prefer `locals.user` and `locals.session`, which
`hooks.server.ts` fills on every request. Signing out is a form post to
`/private?/signOut`, or `auth.api.signOut({ headers })` in your own action.

## Merging with this branch

This branch rewrote these files. If your branch also touched them, take this
branch's version and reapply your change on top:

- `src/lib/server/auth.ts`, `src/hooks.server.ts`, `src/app.d.ts`,
  `src/lib/server/db/schema.ts`
- `package.json` (adds `better-auth`, removes the three packages above)
- `pnpm-lock.yaml`: take this branch's version, then run
  `vp install --frozen-lockfile` to confirm it. If your branch added its own
  dependencies, be aware that any non-frozen install re-resolves the workspace's
  `@latest` Vite+ toolchain and bumps it too.
- `src/routes/demo/lucia/` is deleted; don't bring it back.

## Testing the music login locally

Sign-in needs a Postgres database and an OIDC provider. The quickest local setup
used for this change:

1. A throwaway Postgres: `initdb`, start it on a spare port, `createdb`, then
   `DATABASE_URL=... npx drizzle-kit push` to create the `auth_*` tables.
2. A mock OIDC provider with `oauth2-mock-server` (npm), started on
   `http://localhost:8899`. It signs any login in as a fixed test user.
3. `vp dev` with `DATABASE_URL`, `BETTER_AUTH_SECRET` (any 32+ characters),
   `BETTER_AUTH_URL=http://localhost:<port>`, `AUTHENTIK_ISSUER=http://localhost:8899`,
   `AUTHENTIK_CLIENT_ID`, `AUTHENTIK_CLIENT_SECRET` and `MUSIC_LOGIN=required`.
4. Visit `/music`: you should land on `/login`, continue, and come back to `/music`.
