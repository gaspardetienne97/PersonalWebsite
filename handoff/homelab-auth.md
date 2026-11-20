# Deploying sign-in (Better Auth with Authentik)

For the agent that runs the homelab. The personal site now signs people in with
**Better Auth**, using **Authentik as an OpenID Connect provider**. This file says
what to set up so it works in production, and how to check it.

Branch: `ge/personal-website-redesign` (not merged or pushed yet). Code:
`src/lib/server/auth.ts`, `src/hooks.server.ts`, `src/routes/login/`,
`src/routes/private/`, schema in `src/lib/server/db/schema.ts`.

## What the site does

- `/login` has one button, "Continue with Authentik". It starts an OIDC
  authorization-code flow with PKCE and returns to where the visitor was going
  (default `/private`).
- `/private` is only shown to a signed-in user; everyone else is sent to `/login`.
- Better Auth serves its own endpoints under `/api/auth/*`.
- A user's first Authentik sign-in creates their account in the site's database.
  Anyone Authentik lets into the application can sign in.
- Sessions last 7 days (Better Auth's default) and are cached in a signed cookie
  for 5 minutes, so most requests don't hit the database.
- If `DATABASE_URL` is missing, sign-in turns itself off: the site still serves,
  everyone is signed out, `/login` says sign-in isn't set up, and `/api/auth/*`
  answers 503. In production a missing `BETTER_AUTH_SECRET` does the same and
  logs `[auth] BETTER_AUTH_SECRET is not set, so sign-in is turned off.`

## 1. Authentik

1. **Applications > Providers > Create > OAuth2/OpenID Provider.**
   - Client type: **Confidential**.
   - Redirect URI (strict): `https://<site-host>/api/auth/callback/authentik`
     (the provider id `authentik` is part of the path).
   - Scopes: the defaults that cover `openid`, `email` and `profile`.
   - Signing key: any RSA key (the default certificate is fine).
2. **Applications > Applications > Create**, linked to that provider. Note its slug.
3. **Restrict who can sign in** (recommended: this is a personal site). Bind a
   policy, group or user to the application so only the owner is allowed. Without
   a binding, every Authentik user can sign in and gets an account.
4. Note these values for step 2:
   - **Issuer**: shown on the provider as "OpenID Configuration Issuer", in the form
     `https://<authentik-host>/application/o/<app-slug>/`. The site appends
     `.well-known/openid-configuration` to it, so
     `https://<authentik-host>/application/o/<app-slug>/.well-known/openid-configuration`
     must be reachable **from the site's server**.
   - **Client ID** and **Client Secret**.

## 2. Environment for the site's service

| Variable | Value |
|---|---|
| `DATABASE_URL` | Postgres connection string, e.g. `postgresql://user:pass@host:5432/db` |
| `BETTER_AUTH_SECRET` | 32+ random characters: `openssl rand -base64 32`. Keep it stable: changing it signs everyone out. |
| `BETTER_AUTH_URL` | The site's public URL, e.g. `https://<site-host>` (no trailing slash). Used to build the redirect URI. |
| `ORIGIN` | Same public URL. SvelteKit's adapter-node needs it behind a reverse proxy, or the `/login` form post is rejected as cross-site. |
| `AUTHENTIK_ISSUER` | The issuer from step 1.4 |
| `AUTHENTIK_CLIENT_ID` | From step 1.4 |
| `AUTHENTIK_CLIENT_SECRET` | From step 1.4 |
| `MUSIC_LOGIN` | Optional. `required` keeps the music app (`/music`) behind the same sign-in. |

Keep the secrets out of the Nix store (agenix, sops-nix or an `EnvironmentFile`).
`.env.example` in the repo lists the same variables. adapter-node listens on
`PORT` (default 3000) and `HOST` (default `0.0.0.0`).

The site must be served over **HTTPS** in production: Better Auth sets `Secure`
cookies when `BETTER_AUTH_URL` is https.

## 3. Database tables

Better Auth uses four tables, named `auth_*` so they sit beside anything already
there. Create them once, either from a repo checkout with dependencies installed:

```sh
DATABASE_URL=... npx drizzle-kit push
```

or by running this SQL (generated from the schema with `drizzle-kit export`):

```sql
CREATE TABLE "auth_account" (
	"id" text PRIMARY KEY NOT NULL,
	"account_id" text NOT NULL,
	"provider_id" text NOT NULL,
	"user_id" text NOT NULL,
	"access_token" text,
	"refresh_token" text,
	"id_token" text,
	"access_token_expires_at" timestamp with time zone,
	"refresh_token_expires_at" timestamp with time zone,
	"scope" text,
	"password" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE "auth_session" (
	"id" text PRIMARY KEY NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"token" text NOT NULL,
	"ip_address" text,
	"user_agent" text,
	"user_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "auth_session_token_unique" UNIQUE("token")
);

CREATE TABLE "auth_user" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"email" text NOT NULL,
	"email_verified" boolean DEFAULT false NOT NULL,
	"image" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "auth_user_email_unique" UNIQUE("email")
);

CREATE TABLE "auth_verification" (
	"id" text PRIMARY KEY NOT NULL,
	"identifier" text NOT NULL,
	"value" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

ALTER TABLE "auth_account" ADD CONSTRAINT "auth_account_user_id_auth_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."auth_user"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "auth_session" ADD CONSTRAINT "auth_session_user_id_auth_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."auth_user"("id") ON DELETE cascade ON UPDATE no action;
CREATE INDEX "auth_account_user_id_idx" ON "auth_account" USING btree ("user_id");
CREATE INDEX "auth_session_user_id_idx" ON "auth_session" USING btree ("user_id");
CREATE INDEX "auth_verification_identifier_idx" ON "auth_verification" USING btree ("identifier");
```

**Old tables.** The template's previous login used tables named `user` and
`session`. Nothing reads them any more and they're no longer in the schema, so
`drizzle-kit push` will offer to **drop** them. They hold the old music-app
logins. Only accept once the owner has confirmed nothing in them is needed;
otherwise answer no and leave them.

## 4. Nix build

- **`pnpmDeps` hash.** `pnpm-lock.yaml` changed a lot (Better Auth, and every
  dependency updated to its latest version), so the fixed-output hash in
  `flake.nix` is stale. Build once, take the `got: sha256-...` value from the
  hash-mismatch error, and put it in `pnpmDeps.hash`. It couldn't be computed
  here because Nix isn't installed on the machine that made the change.
- **The `apps/` lines are gone.** `installPhase` used to copy `apps/pdf` and
  `apps/drums`, which no longer exist (removed in commit `43cf68e4`), along with
  the `pdf` and `drums` packages built from them. They've been removed;
  `/pdf` is served by the main `web` build.
- **Node.** The site now needs Node `^22.18 || ^24.11 || >=26` (`package.json`
  `engines`); the flake's `nodejs_24` qualifies if nixpkgs has 24.11 or later.
- **SvelteKit 3.** There's no `svelte.config.js` any more; its settings live in
  `vite.config.ts`. Environment variables are declared in `src/env.ts`.

Build with the frozen lockfile. The toolchain (Vite+, Vite, Vitest) is now pinned
to exact versions, so installs no longer drift on their own.

## 5. Check it works

1. `curl https://<site-host>/api/auth/get-session` returns `200` with `null`
   (a `503` means `DATABASE_URL` or `BETTER_AUTH_SECRET` isn't reaching the app).
2. `https://<site-host>/login` shows **Continue with Authentik** (not "Sign-in
   isn't set up").
3. Click it, sign in at Authentik, and land on `/private` showing your name and
   email. `auth_user`, `auth_account` and `auth_session` each gain a row.
4. **Sign out** returns to the home page; `/private` then redirects to `/login`.

## Troubleshooting

| Symptom | Likely cause |
|---|---|
| `/login` says "Sign-in isn't set up" | `DATABASE_URL`, `BETTER_AUTH_SECRET`, `AUTHENTIK_ISSUER` or `AUTHENTIK_CLIENT_ID` missing |
| "Authentik didn't answer" on `/login` | The site's server can't fetch the discovery URL (DNS, TLS, firewall) |
| Authentik says the redirect URI is invalid | Redirect URI in Authentik doesn't exactly match `{BETTER_AUTH_URL}/api/auth/callback/authentik` |
| `403 Cross-site POST form submissions are forbidden` | `ORIGIN` not set, or not the public URL |
| Signed in, but bounced back to `/login` | Cookies not sticking: site not on HTTPS, or `BETTER_AUTH_URL` points at a different host |
| Back on `/login` with "didn't work" | Look in the site's logs for `[auth]` lines and in Authentik's event log |
