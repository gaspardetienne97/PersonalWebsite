# AGENTS.md

This file provides guidance to Codex (Codex.ai/code) when working with code in this repository.

## Tech Stack

- **Framework**: SvelteKit 2 with Svelte 5 (using runes)
- **Styling**: Tailwind CSS 4 with custom UI components (bits-ui based)
- **Database**: PostgreSQL with Drizzle ORM
- **Authentication**: Custom session-based auth (Oslo crypto)
- **i18n**: Paraglide-JS with locales: en, es, fr, ht
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
- **Paraglide-JS** generates i18n code at build time into [src/lib/paraglide/](src/lib/paraglide/)
- Middleware in [hooks.server.ts:6-13](src/hooks.server.ts#L6-L13) sets locale per request
- Message files in [project.inlang/messages/](project.inlang/messages/)
- Supported locales: en (base), es, fr, ht
- HTML lang attribute injected via `%paraglide.lang%` placeholder in [src/app.html](src/app.html)

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
- The root SvelteKit app is the single deployment and serves `/`, `/music`, and `/pdf`.
- Reusable UI lives in [packages/ui/](packages/ui/).
- Music domain, engines, and exercises live in [packages/music-core/](packages/music-core/).
- PDF reader services, stores, and reusable components live in [packages/pdf-core/](packages/pdf-core/).
- Site-only shell components live in [src/lib/components/site/](src/lib/components/site/).
- Use `vp run -r <task>` for recursive workspace tasks and `vp run @repo/<package>#<task>` for package-targeted tasks.
- Do not add Turborepo or duplicate VitePlus workspace orchestration.

### Nested Agent Guidance
- Root-level guidance applies across the repo.
- Music-specific work under [src/routes/music/](src/routes/music/) should also follow [src/routes/music/AGENTS.md](src/routes/music/AGENTS.md).
- Package work in [packages/music-core/](packages/music-core/) is part of the Music app architecture and should follow the Music guidance when changes affect Music domain, engines, exercises, persistence, input, analytics, progress, or practice workflows.
- If nested guidance conflicts with this file, follow the more specific nested guidance for files in that scope.

### App Boundaries
- The personal website remains the root user experience at `/`.
- The Music app is mounted under `/music` inside the same SvelteKit deployment.
- The PDF app is mounted under `/pdf` inside the same SvelteKit deployment.
- Do not move a project app to the site root unless the user explicitly changes that product decision.
- Keep project-specific reusable logic in the matching package (`packages/music-core`, `packages/pdf-core`) and shared visual primitives in `packages/ui`.

### Local Planning And Prototype Files
- The repo may contain local-only planning/prototype folders such as `docs/`, `domain/`, `old prompts/`, `.codex/`, and `.superpowers/`.
- These may be intentionally excluded through `.git/info/exclude` rather than `.gitignore`.
- Do not stage, commit, delete, or "clean up" those files unless the user explicitly asks for that exact action.
- If a task asks you to read those folders for context, read them as source material without assuming they should become tracked code.

### Content & Routing
- Blog posts in [src/lib/blog-posts/](src/lib/blog-posts/) (markdown with frontmatter)
- MDsveX processes `.md`, `.mdx`, `.svx` files (configured in [svelte.config.js:11](svelte.config.js#L11))
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
- Import from `$lib/server/*` in `+page.server.ts`, `+server.ts`, or `hooks.server.ts` only

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
