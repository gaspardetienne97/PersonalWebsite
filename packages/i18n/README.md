# @repo/i18n

The site's translations, shared by the app and the workspace packages.

- `paraglide/` is compiled from `project.inlang` and `messages/` by the Paraglide
  Vite plugin (dev and build) and by `pnpm run i18n` at the repo root. It is
  generated and gitignored: never edit it.
- `@repo/i18n/messages.js` gives `m`, one function per message.
- `@repo/i18n/runtime.js` gives `getLocale`, `setLocale`, `locales`.
- `@repo/i18n/format` formats dates, numbers and lists for the current locale,
  including Haitian Creole, which most `Intl` data lacks.

See the i18n section of the root `AGENTS.md` for how to add and translate text.
