# VitePlus Route-App Monorepo Design

## Goal

Restructure the repository so it remains one SvelteKit website deployment while treating major projects as route-level apps with package-level boundaries. The personal website stays the root experience. The music practice app and PDF reader are served as routes, but their reusable code moves into workspace packages. The repo uses VitePlus for monorepo execution, not Turborepo.

## Current State

The workspace already has the ingredients for this structure, but they are unevenly applied:

- The root package is the deployable SvelteKit website app.
- `packages/ui` exists and exports ShadCN Svelte/Bits UI-based components.
- `apps/pdf` exists, but PDF code also still lives in root `src/routes/pdf`, `src/lib/components/pdf-reader`, `src/lib/services/pdf`, and `src/lib/stores/pdf-reader`.
- The music app currently lives at `src/routes/music`, while music domain, engines, and exercises live under root `src/lib/domain`, `src/lib/engines`, and `src/lib/exercises`.
- Site-only components such as `Header`, `Footer`, and `SplashScreen` live directly under `src/lib/components`.
- Root `components.json` points ShadCN Svelte UI aliases at `packages/ui/src`, but this should be clarified for a workspace package model.

## Decision

Use one deployable SvelteKit app and route-level app entrypoints:

- `/` personal website
- `/music` music practice app
- `/pdf` PDF reader app

Move reusable app code into packages:

- `packages/ui`
- `packages/music-core`
- `packages/pdf-core`

The root SvelteKit app remains responsible for routing, layout, app composition, SEO metadata, and shared site navigation. Packages remain framework-light where possible and expose stable APIs through package exports.

This keeps deployment simple while preserving an escape hatch: if `/music` or `/pdf` later needs a separate deployment, its domain and UI logic will already be separated from the website route shell.

## Documentation Basis

This design follows current primary documentation:

- VitePlus `vp run` supports workspace-aware execution, recursive runs, package filters, caching, and dependency ordering based on normal `package.json` workspace dependencies: <https://viteplus.dev/guide/run>
- SvelteKit routes are filesystem-based under `src/routes`, and `+layout` files apply to child routes, so `/music` and `/pdf` should remain normal route folders in the single deployment: <https://svelte.dev/docs/kit/routing>
- SvelteKit package guidance treats `src/lib` as the public surface for package-style code, which maps well to workspace packages that export their own `src` entrypoints: <https://svelte.dev/docs/kit/packaging>
- shadcn-svelte is an open-code component system, so `packages/ui` should be the owned design-system implementation rather than a wrapper around a closed component library: <https://www.shadcn-svelte.com/docs>
- shadcn-svelte `components.json` uses aliases to route generated components, utilities, hooks, and UI paths, so the repo should keep aliases explicit and point new UI work toward `packages/ui`: <https://shadcn-svelte.com/docs/components-json>
- Storybook’s SvelteKit framework supports isolated SvelteKit component development and provides SvelteKit module mocks, which fits testing `packages/ui` and route app components outside full app navigation: <https://storybook.js.org/docs/8/get-started/frameworks/sveltekit>
- Storybook testing supports component/visual/a11y workflows through stories and addons, which should cover reusable UI states before Playwright tests full routes: <https://storybook.js.org/docs/writing-tests/index>
- Playwright remains the end-to-end test layer for route smoke tests and cross-route behavior: <https://playwright.dev/docs/intro>

## Target Structure

```txt
.
├── apps/
│   └── pdf/                         # temporary legacy/standalone PDF app until reconciled
├── packages/
│   ├── ui/
│   │   ├── src/
│   │   │   ├── button/
│   │   │   ├── card/
│   │   │   ├── ...
│   │   │   ├── app-shell/           # reusable route-app shell primitives
│   │   │   └── index.ts
│   │   ├── components.json
│   │   └── package.json
│   ├── music-core/
│   │   ├── src/
│   │   │   ├── domain/
│   │   │   ├── engines/
│   │   │   ├── exercises/
│   │   │   └── index.ts
│   │   └── package.json
│   └── pdf-core/
│       ├── src/
│       │   ├── components/
│       │   ├── services/
│       │   ├── stores/
│       │   └── index.ts
│       └── package.json
├── src/
│   ├── lib/
│   │   ├── components/
│   │   │   └── site/
│   │   │       ├── Header.svelte
│   │   │       ├── Footer.svelte
│   │   │       └── SplashScreen.svelte
│   │   ├── config.ts
│   │   ├── blog-posts/
│   │   └── server/
│   └── routes/
│       ├── +layout.svelte
│       ├── +page.svelte
│       ├── music/
│       │   └── +page.svelte
│       └── pdf/
│           └── +page.svelte
├── .storybook/
├── components.json
├── package.json
├── pnpm-workspace.yaml
├── svelte.config.js
└── vite.config.ts
```

## Package Responsibilities

### `packages/ui`

Owns the design system.

Responsibilities:

- Export ShadCN Svelte components and shared UI utilities.
- Export reusable app-shell pieces only when they are generic across website, music, and PDF.
- Own shared component stories for Storybook.
- Use theme tokens such as `bg-background`, `text-foreground`, `border-border`, `primary`, `muted`, and radius utilities.
- Avoid app-specific business logic.

Non-goals:

- Do not import `@repo/music-core` or `@repo/pdf-core`.
- Do not contain route-specific copy or feature state.
- Do not create a second theme system for music.

Expected exports:

```json
{
  "exports": {
    ".": "./src/index.ts",
    "./button": "./src/button/index.ts",
    "./card": "./src/card/index.ts",
    "./progress": "./src/progress/index.ts",
    "./app-shell": "./src/app-shell/index.ts",
    "./utils": "./src/utils.ts"
  }
}
```

### `packages/music-core`

Owns music practice domain and framework-agnostic engines.

Responsibilities:

- Move current root `src/lib/domain` into `packages/music-core/src/domain`.
- Move current root `src/lib/engines` into `packages/music-core/src/engines`.
- Move current root `src/lib/exercises` into `packages/music-core/src/exercises`.
- Keep domain and engines free of Svelte component imports.
- Keep browser-specific logic isolated behind capability-detected adapters.
- Export stable APIs consumed by `src/routes/music/+page.svelte`.

Expected exports:

```json
{
  "exports": {
    ".": "./src/index.ts",
    "./domain": "./src/domain/index.ts",
    "./engines/*": "./src/engines/*/index.ts",
    "./exercises/*": "./src/exercises/*.ts"
  }
}
```

Allowed dependencies:

- `tonal`, `webmidi`, `vexflow`, `tone`, `dexie`, `svguitar` only where required.
- `svelte` only if a future adapter is explicitly a Svelte adapter package or module. Core engines should not need it.

### `packages/pdf-core`

Owns PDF-specific reusable code.

Responsibilities:

- Move PDF components from `src/lib/components/pdf-reader` when they are specific to the reader app but reusable across route shells.
- Move PDF services from `src/lib/services/pdf`.
- Move PDF stores from `src/lib/stores/pdf-reader`.
- Keep route composition in `src/routes/pdf/+page.svelte`.
- Expose typed APIs for upload, extraction, viewing state, audio controls, and worker setup.

Expected exports:

```json
{
  "exports": {
    ".": "./src/index.ts",
    "./components/*": "./src/components/*.svelte",
    "./services/*": "./src/services/*.ts",
    "./stores/*": "./src/stores/*.ts"
  }
}
```

### Root SvelteKit App

Owns the website deployment and route composition.

Responsibilities:

- Root personal website routes.
- Site layout, navigation, SEO, auth hooks, database/server-only code.
- Thin route app pages that import from `@repo/ui`, `@repo/music-core`, and `@repo/pdf-core`.
- Route-level tests confirming `/`, `/music`, `/pdf`, and header links render.

Non-goals:

- Do not keep music domain logic in root `src/lib`.
- Do not keep reusable PDF services in root `src/lib`.
- Do not create new app-local ShadCN components outside `packages/ui` unless they are truly route-only.

## Route App Composition

### `/music`

`src/routes/music/+page.svelte` should become a thin route shell:

- Imports `Button`, `Card`, `Progress`, `Slider`, and any app-shell primitives from `@repo/ui`.
- Imports music APIs from `@repo/music-core`.
- Uses site theme classes, not custom `.practice-shell` variables.
- Keeps only route-specific state, copy, and event handlers.

The current custom music CSS in `src/app.css` should be removed or reduced as UI package components replace it.

### `/pdf`

`src/routes/pdf/+page.svelte` should become a thin route shell:

- Imports PDF reader components/services from `@repo/pdf-core`.
- Imports shared controls from `@repo/ui`.
- Keeps route metadata, composition, and any page-specific loading/error state.

### Personal Site

Site components move to `src/lib/components/site`:

- `Header.svelte`
- `Footer.svelte`
- `SplashScreen.svelte`
- `SpaceColonizationCircuit.svelte` if it remains splash-only

Header links include:

- `/`
- `/about`
- `/gallery`
- `/blog`
- `/music`
- `/pdf`

## VitePlus Monorepo Model

The repo should use VitePlus workspace commands instead of Turborepo.

Root scripts should delegate through `vp`:

```json
{
  "scripts": {
    "dev": "vp dev",
    "build": "vp build",
    "build:all": "vp run -r build",
    "check": "vp check",
    "check:all": "vp run -r check",
    "test": "vp test",
    "test:all": "vp run -r test",
    "storybook": "storybook dev -p 6006",
    "build-storybook": "storybook build"
  }
}
```

Package scripts should be real package tasks where possible:

```json
{
  "scripts": {
    "check": "tsc --noEmit",
    "test": "vp test src/**/*.test.ts",
    "build": "tsc --noEmit"
  }
}
```

VitePlus dependency ordering should come from package dependencies:

- Root app depends on `@repo/ui`, `@repo/music-core`, and `@repo/pdf-core`.
- `@repo/music-core` does not depend on `@repo/ui`; it is domain and engine code.
- `@repo/pdf-core` depends on `@repo/ui` only for exported Svelte reader components. Its non-component services and stores stay UI-free.
- `@repo/ui` depends on no feature packages.

## ShadCN Svelte and UI Package Rules

`packages/ui` is the only place to add reusable ShadCN Svelte components.

Rules:

- Root `components.json` keeps `aliases.ui` pointed at `packages/ui/src` for the shadcn-svelte CLI install target.
- `packages/ui/components.json` exists with package-local aliases so the package can be a first-class ShadCN target.
- New reusable UI starts in `packages/ui/src/<component>`.
- Route-specific composed blocks may live beside routes only if they are not reused.
- Music UI should not define custom CSS variables like `--practice-bg`; it should consume existing app tokens and UI components.

Preferred import style in apps:

```ts
import { Button } from "@repo/ui/button";
import * as Card from "@repo/ui/card";
```

## Storybook Strategy

Storybook remains root-configured with `@storybook/sveltekit`.

Story coverage should move toward packages:

- `packages/ui/src/**/*.stories.svelte`: reusable UI components and app-shell primitives.
- `packages/pdf-core/src/components/**/*.stories.svelte`: PDF reader components with mocked files/states.
- `src/lib/components/site/**/*.stories.svelte`: Header/Footer/Splash if visual coverage is useful.
- Avoid stories for pure music engines; use unit tests instead.

Storybook should be used for:

- Visual review of UI states.
- Accessibility addon checks for shared components.
- Component interaction tests when a component has meaningful local behavior.

Storybook should not replace Playwright route tests.

## Playwright Strategy

Playwright remains the end-to-end layer.

Core flows:

- Home route renders personal website content and header links.
- `/music` route renders the music app shell, can click a simple interval answer, and shows state change.
- `/pdf` route renders the PDF app shell, displays the upload/reader controls, and can load a committed fixture only after one exists in the repo.
- Navigation between `/`, `/music`, and `/pdf` works in the shared layout.

Playwright should use the existing `vp build && vp preview` web server command unless a dev-server-specific behavior is being tested.

## Unit and Browser Test Strategy

Package tests:

- `packages/music-core`: domain, engines, exercises, sessions, store tests.
- `packages/pdf-core`: parser/extractor/store tests.
- `packages/ui`: component tests only where behavior matters; Storybook covers visual states.

Root route tests:

- `/+page.svelte` keeps the personal website root.
- `/music/+page.svelte` composes music APIs.
- `/pdf/+page.svelte` composes PDF APIs.
- `Header.svelte` links to `/music` and `/pdf`.

## Migration Plan Overview

This spec should be implemented in small, verifiable steps:

1. Create `packages/music-core` and `packages/pdf-core` package skeletons.
2. Add package `package.json` files and exports.
3. Move music domain files and update imports.
4. Move music engines and exercises and update imports.
5. Move PDF services/stores/components and update imports.
6. Move site-only components into `src/lib/components/site`.
7. Refactor `/music` to consume `@repo/ui` and remove custom music theme CSS.
8. Add or update Storybook stories for moved UI components.
9. Add Playwright route smoke tests.
10. Remove or reconcile legacy `apps/pdf` after root `/pdf` is confirmed as the canonical deployment path.

## Acceptance Criteria

The refactor is complete when:

- `/` still renders the personal website.
- `/music` still renders the music app.
- `/pdf` still renders the PDF reader.
- Root route files are thin composition layers.
- Music domain/engines/exercises live in `packages/music-core`.
- PDF reader services/stores/reusable components live in `packages/pdf-core`.
- Shared UI lives in `packages/ui`.
- Music app styling uses website/theme/UI package tokens, not a separate custom theme system.
- VitePlus commands pass:
  - `vp check`
  - `vp test`
  - `vp build`
  - package-filtered or recursive package checks where added
- Storybook builds successfully.
- Playwright smoke tests pass for `/`, `/music`, and `/pdf`.

## Risks and Constraints

- The current worktree is dirty and contains deliberate deletions of the old drums app and other existing changes. Implementation must not revert unrelated user changes.
- Moving package paths will touch many imports. Do this incrementally and keep tests green between moves.
- `apps/pdf` may contain code not currently represented in root `/pdf`. Reconciliation must compare both before deleting either.
- Some current Storybook and Svelte warnings predate this spec. The refactor should not expand their scope; fixing them is allowed only where touched.
- Browser tests with VitePlus may need localhost binding permissions in this environment.

## Open Decisions

- Whether to keep `apps/pdf` as a standalone development target after `packages/pdf-core` is created. Default recommendation: keep it temporarily, then remove or mark legacy once `/pdf` is canonical.
- Whether `packages/pdf-core` should export Svelte components directly or only services/stores with components remaining in root route folders. Default recommendation: export reusable PDF reader components from `pdf-core`.
- Whether to add `packages/site-content` for blog/project data. Default recommendation: defer until site content becomes reused outside the root app.
