# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

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
- Located in [src/lib/components/ui/](src/lib/components/ui/)
- Built on **bits-ui** (headless component library)
- Components: Avatar, Button, Card, Carousel, Dialog, Input, ScrollArea, Separator, Sheet, Sidebar, Skeleton, Tooltip
- Use Tailwind for styling with utility classes

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
