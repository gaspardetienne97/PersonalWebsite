# AGENTS.md

This file provides guidance to Codex (Codex.ai/code) when working with code in this repository.

## Music app rebuild

Read `BRIEF.md` first. The music app is being rebuilt from scratch in this
branch; `context/` holds everything known about the previous version and
`TASKS.md` is the running status.

## Tech Stack

- **Framework**: SvelteKit 3 with Svelte 5 (using runes). No `svelte.config.js`: Kit options live in `vite.config.ts`, and `#lib/...` imports replace `$lib`
- **Styling**: Tailwind CSS 4 with custom UI components (bits-ui based)
- **Database**: PostgreSQL with Drizzle ORM
- **Authentication**: Custom session-based auth (Oslo crypto)
- **i18n**: Paraglide-JS with locales: en, es, fr, ht (compiled into `@repo/i18n`)
- **Testing**: Vitest (unit), Playwright (E2E)
- **Content**: MDsveX for markdown processing
- **Deployment**: Node.js (adapter-node)

## Development Commands

### Core Development
```bash
npm run dev              # Start dev server (default: http://localhost:5173)
npm run build            # Build for production
npm run preview          # Preview production build
npm run check            # Type-check TypeScript and Svelte files
npm run check:watch      # Type-check in watch mode
```

### Code Quality
```bash
npm run lint             # Run prettier check + ESLint
npm run format           # Format all files with prettier
```

### Testing
```bash
npm run test             # Run all tests (unit + E2E)
npm run test:unit        # Run Vitest tests in watch mode
npm run test:unit -- --run  # Run Vitest tests once
npm run test:e2e         # Run Playwright E2E tests
```

### Database
```bash
npm run db:start         # Start PostgreSQL via Docker Compose
npm run db:push          # Push schema changes to database
npm run db:migrate       # Run migrations
npm run db:studio        # Open Drizzle Studio (database GUI)
```

**Database setup**: Set `DATABASE_URL` environment variable (PostgreSQL connection string). The docker-compose.yml provides a local PostgreSQL instance at `postgresql://root:mysecretpassword@localhost:5432/local`.

### Storybook
```bash
npm run storybook        # Start Storybook dev server (port 6006)
npm run build-storybook  # Build static Storybook
```

## Architecture

### Authentication Flow
- **Session-based** auth using SHA256-hashed tokens stored in cookies
- Token validation happens in [hooks.server.ts:15-35](src/hooks.server.ts#L15-L35)
- Session lifecycle: 30-day expiry with automatic renewal after 15 days
- Session/user data attached to `event.locals` for all requests
- Auth functions in [src/lib/server/auth.ts](src/lib/server/auth.ts)

### Database Layer
- **Lazy initialization pattern** in [src/lib/server/db/index.ts:6-23](src/lib/server/db/index.ts#L6-L23) using Proxy to avoid build-time DATABASE_URL requirement
- Schema in [src/lib/server/db/schema.ts](src/lib/server/db/schema.ts) (user + session tables)
- Drizzle ORM with PostgreSQL dialect
- Always use the exported `db` instance, never create new connections

### i18n (Internationalization)
- **Paraglide-JS** compiles messages into the `@repo/i18n` package ([packages/i18n/paraglide/](packages/i18n/paraglide/), generated and gitignored) through its Vite plugin on dev/build, and `pnpm run i18n` (run by `prepare`) for type-checking and the packages' own tests. The app, `@repo/music-core` and `@repo/pdf-core` all import from it
- Middleware in [hooks.server.ts:6-13](src/hooks.server.ts#L6-L13) sets locale per request
- Message files live in [messages/](messages/), one set per area: `messages/{locale}.json` for the site, `messages/narrator/{locale}.json` for Narrator, and `messages/music/<area>/{locale}.json` for Woodshed. Every file is listed in `pathPattern` in [project.inlang/settings.json](project.inlang/settings.json). `en.json` is the source; `es`, `fr`, `ht` must have the same keys and inputs, and no key may appear in two areas, all enforced by `src/lib/i18n.test.ts`. Use them as `m.key()` from `@repo/i18n/messages.js`
- Language comes from the `PARAGLIDE_LOCALE` cookie (set by the header's language menu and the apps' settings), then the browser's preference, then English; URLs are not localized. The site, Woodshed (`/music`) and Narrator (`/pdf`) are translated
- Supported locales: en (base), es, fr, ht
- HTML lang attribute injected via `%paraglide.lang%` placeholder in [src/app.html](src/app.html)

#### Making changes with Paraglide
Every visible string goes through a message: headings, body copy, button labels, `aria-label`, `alt`, `title`, `<svelte:head>` titles and descriptions, placeholders, empty states, toasts and error text. These stay as they are: product and app names (Woodshed, Narrator, Listplay, GitHub, Authentik, Aerophone, MPC, Kokoro), the language names in the language menus, code samples, and musical symbols (note letters C D E, chord symbols like Cmaj7 and G7, Roman numerals like ii–V–I, MIDI, BPM).

- **Adding or changing a string**: add the key to the area's `en.json` first, then add it to `es.json`, `fr.json` and `ht.json` in the same change, translated, not copied English. The Spanish is Latin American: use `tú` (never `vosotros`), the simple past over the perfect ("se canceló", not "se ha cancelado") and Latin American words ("video", "publicación", "computadora", "celular", "manejar"), not Spain's ("vídeo", "entrada", "ordenador", "móvil", "conducir"). The French is Haitian French: standard spelling and grammar with `vous`, in a plain, slightly formal register. Write out words that France clips or slangs ("application", "football", "typographie", "introduction", "synthétiseur", not "appli", "foot", "typo", "intro", "synthé") and avoid Parisian casual phrasing ("sympa", "truc", "Salut, moi c’est"). The Haitian Creole uses standard Kreyòl spelling (IPN orthography: "mizik", "pratike", "nòt", "akò" (chord; "kòd" is a string), "ritm", "son"), addresses the reader as `ou`, and keeps a technical word in French or English only when Haitian musicians would. `src/lib/i18n.test.ts` fails if a locale is missing a key, has an empty value or uses different inputs. When English copy changes meaning, update the other three too; a stale translation passes the test but is wrong.
- **Key names**: snake_case, prefixed by area and then page or component: `nav_`, `home_`, `studio_`, `about_` and so on for the site, `narrator_` for Narrator, `music_<area>_` for Woodshed (`music_shell_`, `music_hubs_`, `music_lessons_`…). Look for an existing key before adding one. Delete keys you stop using, from all four files.
- **Using a message**: `import { m } from "@repo/i18n/messages.js";` then call `m.key()` or `m.key({ name })`. On the server-rendered site, call it where it renders (in markup or a `$derived`), never once at module top level: a module-level `const label = m.nav_home()` is fixed to whichever locale loaded the module first. Woodshed and Narrator render only in the browser (`ssr = false`) and changing language reloads the page, so their module-level calls are safe, but a getter or function is still the better habit.
- **Strings in data modules** (`src/lib/config.ts`, `src/lib/content/*.ts`, `music-core` content): expose them as getters (`get label() { return m.nav_home(); }`) or build them in a function, so they read the current locale. Don't spread or `structuredClone` these objects, which freezes the getter's value; `studio.ts` uses `Object.assign(Object.create(entry), …)` to extend them for this reason.
- **Never translate what code relies on**: ids, slugs, storage and IndexedDB keys, URL paths, analytics names, values compared in logic (`if (label === "Major")`), and anything saved to disk or exported. Translate only what is shown. If code compares or stores a display string today, give it an id and translate the label.
- **Placeholders, not concatenation**: word order differs between languages, so put variables inside the message (`"studio_empty_title": "No {kind} yet"`) instead of joining fragments in code. For a link inside a sentence, pass the anchor HTML as a placeholder and render with `{@html}`, as `src/routes/about/+page.svelte` does with its `link()` helper. Only do that with HTML you build yourself, never with user input.
- **Counts**: use a plural variant rather than adding an "s" in code:
  ```json
  "music_x_half_steps": [{ "declarations": ["input count", "local countPlural = count: plural"], "selectors": ["countPlural"], "match": { "countPlural=one": "{count} half step", "countPlural=other": "{count} half steps" } }]
  ```
  Haitian Creole nouns don't take a plural ending, so its `one` and `other` are usually the same text.
- **Dates, numbers and lists**: use `formatDate`, `formatNumber` and `formatList` from `@repo/i18n/format` (the site also re-exports them from `#lib/utils.ts`). They follow the current locale, format Spanish as `es-419` and French as `fr-HT`, and handle Haitian Creole, which most `Intl` data lacks. For anything else from `Intl`, pass `intlLocale()` from the same module rather than the bare locale. Ordinals ("1st", "2nd") go in messages.
- **Prerendering**: a prerendered page is built once, in English. A page with translated text needs `export const prerender = false` (see `src/routes/about/+page.ts`).
- **Switching language**: call `setLocale()` from `@repo/i18n/runtime.js`, which sets the cookie and reloads. Don't build per-locale URLs or read `navigator.language` yourself.
- **Tests stay in English**: unit tests (Node and the browser runner) and Playwright run with English as the locale, so the English messages must keep the exact wording the tests and the rest of the app expect. Moving a string into a message must not change its English.
- **Not translated**: blog post bodies in `src/lib/blog-posts/`, and content people make themselves (journal entries, uploaded files, song titles).
- **Adding a locale**: add it to `locales` in `project.inlang/settings.json`, create `<locale>.json` next to every `en.json` under `messages/`, add its endonym to the language menus, and add it to `LOCALES` in `src/lib/i18n.test.ts`. If `Intl` lacks data for it, handle it in `packages/i18n/src/format.ts` the way `ht` is.
- **Woodshed's learning paths** (`packages/music-core/src/data/paths/*.json`) are not messages: each language has one dictionary, `packages/music-core/src/data/paths/i18n/<locale>.json`, from the English string to its translation, loaded for the current language by the music layout (`progress/path-text.ts`). A string with no entry shows in English, so editing a path's English never shows a stale translation. After editing path text, run `node packages/music-core/scripts/path-text.mjs` to see what each language is missing, `… <locale> --missing` for the list, and `… <locale> --prune` to drop entries no longer used. Song titles and artists stay as they are.
- **Woodshed and Narrator conventions**: the drill modes are Check (Prueba / Contrôle / Tès) and Practice (Práctica / Pratique / Pratik). Look up a control's existing translation in `messages/music/*/` before naming it in other text, so instructions match the buttons. Display text that code needs to recognise (timing rows, saved lick sources, section labels, strum prefixes) carries an id or `kind` instead: never compare or regex-match translated text.
- **Note names in Woodshed** follow the user's Note names setting: letters (C D E), fixed do (Do Re Mi… Si) or movable do (Do is the key's tonic, minor keys la-based); letters by default in English, fixed do in es/fr/ht. Every note, chord or key name shown goes through `note()`, `chord()`, `keyName()` from `src/lib/music/names.svelte.ts` (app) or `showNote`, `showChord`, `showKeyName` from `packages/music-core/src/theory/note-names.ts` (core). Keep letters for ids, params, parsing, picker values and anything saved. Messages never spell a note: pass it as a placeholder (`"Play {note}"`). A drill with a key calls `useNamingKey(() => ({ tonic, minor }))` so movable do counts from it. Notes inside learning-path text are marked `⟦C⟧`, `⟦Dm7⟧` in the path dictionaries (including `i18n/en.json` for English); mark notes in any path text you add or translate.
- **Adding an area**: create `messages/<area>/{en,es,fr,ht}.json` and add `./messages/<area>/{locale}.json` to `pathPattern` in `project.inlang/settings.json`.
- **Verify**: `pnpm run i18n`, `vp test --run src/lib/i18n.test.ts`, then switch languages (site header menu, or the app's settings) on the screens you touched and look for leftover English and text that overflows (French and Spanish run about a third longer than English).

### Hook Sequence
The app uses **two hooks** in sequence ([hooks.server.ts:37](src/hooks.server.ts#L37)):
1. `handleParaglide` - Sets locale and injects lang attribute
2. `handleAuth` - Validates session and attaches user to `event.locals`

### UI Components
- Located in [packages/ui/src/](packages/ui/src/)
- Built on **bits-ui** (headless component library)
- Components: Avatar, Badge, Button, Card, Carousel, Dialog, Dropdown Menu, Input, Label, Popover, Progress, ScrollArea, Select, Separator, Sheet, Sidebar, Skeleton, Slider, Toggle, Toggle Group, Tooltip
- Use Tailwind for styling with utility classes
- Shared application features should consume `@repo/ui` exports instead of copying shadcn/bits-ui code into route folders

### Monorepo Structure
- This repo uses VitePlus workspace support, not Turborepo.
- The root SvelteKit app is the single deployment and serves `/` and `/pdf`.
- Reusable UI lives in [packages/ui/](packages/ui/).
- PDF reader services, stores, and reusable components live in [packages/pdf-core/](packages/pdf-core/).
- Site-only shell components live in [src/lib/components/site/](src/lib/components/site/).
- Use `vp run -r <task>` for recursive workspace tasks and `vp run @repo/<package>#<task>` for package-targeted tasks.
- Do not add Turborepo or duplicate VitePlus workspace orchestration.

### Nested Agent Guidance
- Root-level guidance applies across the repo.
- Narrator-specific work under [src/routes/pdf/](src/routes/pdf/) (the `/pdf` read-aloud app) should also follow [src/routes/pdf/AGENTS.md](src/routes/pdf/AGENTS.md). Package work in [packages/pdf-core/](packages/pdf-core/) is part of the Narrator architecture and should follow that guidance when changes affect extraction, the narration timeline, TTS engines, the library, or reader settings.
- If nested guidance conflicts with this file, follow the more specific nested guidance for files in that scope.

### App Boundaries
- The personal website remains the root user experience at `/`.
- The PDF app is mounted under `/pdf` inside the same SvelteKit deployment.
- Do not move a project app to the site root unless the user explicitly changes that product decision.
- Keep project-specific reusable logic in the matching package (`packages/pdf-core`) and shared visual primitives in `packages/ui`.

### Local Planning And Prototype Files
- The repo may contain local-only planning/prototype folders such as `docs/`, `domain/`, `old prompts/`, `.codex/`, and `.superpowers/`.
- These may be intentionally excluded through `.git/info/exclude` rather than `.gitignore`.
- Do not stage, commit, delete, or "clean up" those files unless the user explicitly asks for that exact action.
- If a task asks you to read those folders for context, read them as source material without assuming they should become tracked code.

### Content & Routing
- Blog posts in [src/lib/blog-posts/](src/lib/blog-posts/) (markdown with frontmatter)
- MDsveX processes `.md`, `.mdx`, `.svx` files (an mdsvex Vite plugin in [vite.config.ts](vite.config.ts))
- Site config in [src/lib/config.ts](src/lib/config.ts) (title, description, projects array)
- Routes follow SvelteKit conventions in [src/routes/](src/routes/)

### Testing Strategy
- **Vitest**: Two test environments configured in [vite.config.ts:17-44](vite.config.ts#L17-L44)
  - `client`: Browser environment (Playwright) for `.svelte.test/spec.ts` files
  - `server`: Node environment for regular `.test/spec.ts` files
- **Playwright**: E2E tests for full user flows
- Server-side code in `src/lib/server/` is excluded from browser tests

## Key Patterns

### Server-Only Code
- All code in `src/lib/server/` is **server-only** (never sent to client)
- Database operations, auth logic, and sensitive operations stay here
- Import from `#lib/server/*` in `+page.server.ts`, `+server.ts`, or `hooks.server.ts` only

### Type Safety
- Generated types from Drizzle: `User`, `Session` (from schema)
- Auth types: `SessionValidationResult` exported from [src/lib/server/auth.ts:73](src/lib/server/auth.ts#L73)
- SvelteKit types in [src/app.d.ts](src/app.d.ts) for `event.locals`

### Svelte 5 Runes
This project uses Svelte 5 with runes. When working with components:
- Use `$state()`, `$derived()`, `$effect()` instead of stores/reactive statements
- Prefer runes for reactivity in `.svelte` files
- Use `.svelte.ts` for shared reactive logic outside components

### Git & Commit Workflow
- Do **not** commit directly to `main`/`master` (a `PreToolUse` hook blocks it). Work on a feature branch, then merge to `main` locally with `git merge --ff-only <branch>`.
- A pre-commit hook auto-formats staged files (`vp fmt`); expect reformatting on commit.
- Do **not** push unless the user explicitly asks — `main` is intentionally kept ahead of `origin` and local-only.
- One logical commit per unit of work; stage only the files for that change. The working tree may carry unrelated local-only deletions/edits (see "Local Planning And Prototype Files") — never sweep them into a commit.

### Development Discipline
- Prefer the existing package and route boundaries over adding new abstractions.
- Write or update focused tests before changing behavior.
- For UI changes, run the relevant browser component test, then broader `vp test --run` coverage before calling work complete.
- For production-impacting changes, run `vp run -r check`, `vp test --run`, and `vp run -r build`.
- For user-facing route changes, run the relevant Playwright spec or the full `./node_modules/.bin/playwright test` suite.
- When testing local UI in the Codex in-app browser, verify desktop and mobile widths and check for horizontal overflow.
