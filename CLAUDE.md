# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

> **Companion files:** [AGENTS.md](AGENTS.md) is the authoritative root guide (monorepo, packages, workflow); this file mirrors it for Claude Code. If guidance conflicts, the more specific nested file wins for files in its scope.

## Music app rebuild

Read `BRIEF.md` first. The music app is being rebuilt from scratch in this branch; `context/` holds everything known about the previous version and `TASKS.md` is the running status.

## Tech Stack

- **Monorepo**: **VitePlus** workspace (NOT Turborepo). One SvelteKit deployment serves `/` and `/pdf`. Shared code lives in `packages/*` (`@repo/ui`, `@repo/pdf-core`).
- **Framework**: SvelteKit 2 with Svelte 5 (using runes)
- **Styling**: Tailwind CSS 4 with custom UI components (bits-ui based), surfaced via `@repo/ui`
- **Database**: PostgreSQL with Drizzle ORM (site/auth only)
- **Authentication**: Custom session-based auth (Oslo crypto)
- **i18n**: Paraglide-JS with locales: en, es, fr, ht
- **Testing**: Vitest (unit), Playwright (E2E)
- **Content**: MDsveX for markdown processing
- **Deployment**: Node.js (adapter-node)

## Development Commands

### Monorepo workspace (VitePlus)
```bash
vp run -r check          # Type-check every workspace package (use this, not just npm run check)
vp test --run            # Run the full vitest suite once across packages
vp run -r build          # Build all workspace packages
vp run @repo/<pkg>#<task> # Run a task for a single package
```
Use `vp run -r <task>` for recursive workspace tasks. Do NOT add Turborepo or duplicate the workspace orchestration.

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

### Monorepo Structure
- **`packages/ui/`** (`@repo/ui`): shared bits-ui-based primitives (Avatar, Badge, Button, Card, Carousel, Dialog, Dropdown Menu, Input, Label, Popover, Progress, ScrollArea, Select, Separator, Sheet, Sidebar, Skeleton, Slider, Toggle, Toggle Group, Tooltip). Consume these instead of copying shadcn/bits-ui code into route folders.
- **`packages/pdf-core/`** (`@repo/pdf-core`): PDF reader services, stores, and components.
- **`src/lib/components/site/`**: site-only shell components (e.g. `Header`, `Footer`). The global `Header` is `sticky top-0` and `Footer` renders below all routes.
- App routes live in `src/routes/` (`/` and `/pdf`).

### UI Components
- Shared primitives live in **`packages/ui/src/`** and are imported as `@repo/ui/<component>` (NOT `src/lib/components/ui/`, which no longer exists).
- Built on **bits-ui** (headless component library); styled with Tailwind utility classes + theme tokens.
- Do not hardcode colors; drive everything from theme tokens (`bg-background`, `text-foreground`, `bg-primary`, etc.).

### Local Planning & Prototype Files
- The repo contains local-only, often git-excluded files/folders: `docs/`, `old prompts/`, `.codex/`, `.superpowers/`, `.claude/`.
- Read them for context, but do NOT stage, commit, delete, or "clean up" these unless the user explicitly asks for that exact action. They may be excluded via `.git/info/exclude` rather than `.gitignore`.

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

### Git & Commit Workflow
- **Never commit directly to `main`/`master`** — a `PreToolUse` hook blocks it. Work on a feature branch, then merge to `main` locally (`git checkout main && git merge --ff-only <branch>`).
- A **pre-commit hook auto-formats staged files** (`vp fmt`); expect staged files to be reformatted on commit.
- **Do not push unless the user explicitly asks.** `main` is intentionally far ahead of `origin` and kept local.
- One logical commit per unit of work; stage only the relevant files (the working tree may contain unrelated local-only deletions/edits — do not sweep them in).
- Run the verification gates (`vp run -r check`, `vp test --run`, `vp run -r build`) before claiming work complete.

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
