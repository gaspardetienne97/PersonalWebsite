# VitePlus Route-App Monorepo Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Refactor the repo into one SvelteKit deployment with route-level apps and reusable VitePlus workspace packages for UI, music core, and PDF core.

**Architecture:** Keep the root SvelteKit app as the only deployment and serve `/`, `/music`, and `/pdf` as routes. Move reusable music and PDF logic into `packages/music-core` and `packages/pdf-core`, keep reusable ShadCN Svelte UI in `packages/ui`, and make route files thin composition layers.

**Tech Stack:** SvelteKit 2, Svelte 5 runes, VitePlus workspace commands, pnpm workspaces/catalogs, shadcn-svelte/Bits UI via `packages/ui`, Storybook SvelteKit, VitePlus browser tests, Playwright E2E.

---

## Reference Spec

Implement this plan against:

`docs/superpowers/specs/2026-06-03-viteplus-route-app-monorepo-design.md`

## Required Command Prefix In This Codex Environment

Use the bundled Node runtime when running VitePlus or TypeScript tools:

```bash
env PATH=/Users/gaspard/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin:/Users/gaspard/Code/PersonalWebsite/node_modules/.bin:/usr/bin:/bin:/usr/sbin:/sbin <command>
```

Browser-mode `vp test` may need escalated sandbox permissions because it binds localhost.

## Target File Map

### Create

- `packages/music-core/package.json`
- `packages/music-core/tsconfig.json`
- `packages/music-core/src/index.ts`
- `packages/music-core/src/domain/**`
- `packages/music-core/src/engines/**`
- `packages/music-core/src/exercises/**`
- `packages/pdf-core/package.json`
- `packages/pdf-core/tsconfig.json`
- `packages/pdf-core/src/index.ts`
- `packages/pdf-core/src/components/**`
- `packages/pdf-core/src/services/**`
- `packages/pdf-core/src/stores/**`
- `packages/ui/components.json`
- `src/lib/components/site/**`
- `e2e/route-apps.spec.ts`

### Modify

- `package.json`
- `pnpm-workspace.yaml`
- `components.json`
- `.storybook/main.ts`
- `svelte.config.js`
- `vite.config.ts`
- `src/routes/+layout.svelte`
- `src/routes/music/+page.svelte`
- `src/routes/pdf/+page.svelte`
- `src/routes/page.svelte.test.ts`
- `src/routes/music/page.svelte.test.ts`
- `src/lib/components/Header.svelte.test.ts`

### Delete After Migration

- `src/lib/domain/**`
- `src/lib/engines/**`
- `src/lib/exercises/**`
- `src/lib/components/pdf-reader/**`
- `src/lib/services/pdf/**`
- `src/lib/stores/pdf-reader/**`
- legacy `apps/pdf/**` only after verifying it is duplicate of root `/pdf`

---

## Task 1: Add Boundary Tests Before Moving Files

**Files:**

- Modify: `src/routes/page.svelte.test.ts`
- Modify: `src/routes/music/page.svelte.test.ts`
- Modify: `src/lib/components/Header.svelte.test.ts`
- Create: `src/routes/pdf/page.svelte.test.ts`

- [ ] **Step 1: Write root route assertion**

Ensure `src/routes/page.svelte.test.ts` asserts that `/` is the personal website, not a route app:

```ts
import { describe, expect, it } from "vite-plus/test";
import { render } from "vitest-browser-svelte";
import Page from "./+page.svelte";

describe("/+page.svelte", () => {
  it("keeps the personal website at the root route", async () => {
    render(Page, { data: { posts: [], projects: [] } });

    expect(document.querySelector("h1")?.textContent).toContain("welcome!");
  });
});
```

- [ ] **Step 2: Write music route assertion**

Ensure `src/routes/music/page.svelte.test.ts` asserts the route app remains mounted at `/music`:

```ts
import { describe, expect, it } from "vite-plus/test";
import { render } from "vitest-browser-svelte";
import Page from "./+page.svelte";

describe("/music/+page.svelte", () => {
  it("renders the music practice app on its own route", async () => {
    render(Page);

    expect(document.querySelector("h1")?.textContent).toContain("Musicianship OS");
  });
});
```

- [ ] **Step 3: Write PDF route assertion**

Create `src/routes/pdf/page.svelte.test.ts`:

```ts
import { describe, expect, it } from "vite-plus/test";
import { render } from "vitest-browser-svelte";
import Page from "./+page.svelte";

describe("/pdf/+page.svelte", () => {
  it("renders the PDF reader route app", async () => {
    render(Page);

    expect(document.querySelector("h1")?.textContent).toContain("PDF Reader & Narrator");
  });
});
```

- [ ] **Step 4: Write header link assertion**

Update `src/lib/components/Header.svelte.test.ts`:

```ts
import { describe, expect, it } from "vite-plus/test";
import { render } from "vitest-browser-svelte";
import Header from "./Header.svelte";

describe("Header", () => {
  it("links to route apps", async () => {
    render(Header);

    expect(document.querySelector<HTMLAnchorElement>('a[href="/music"]')?.textContent).toContain(
      "Music",
    );
    expect(document.querySelector<HTMLAnchorElement>('a[href="/pdf"]')?.textContent).toContain(
      "PDF",
    );
  });
});
```

- [ ] **Step 5: Run tests**

Run:

```bash
env PATH=/Users/gaspard/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin:/Users/gaspard/Code/PersonalWebsite/node_modules/.bin:/usr/bin:/bin:/usr/sbin:/sbin vp test src/routes/page.svelte.test.ts src/routes/music/page.svelte.test.ts src/routes/pdf/page.svelte.test.ts src/lib/components/Header.svelte.test.ts
```

Expected: fails only if `/pdf` or header PDF link is not wired yet. If it fails for unrelated browser binding, rerun with escalation.

- [ ] **Step 6: Commit**

```bash
git add src/routes/page.svelte.test.ts src/routes/music/page.svelte.test.ts src/routes/pdf/page.svelte.test.ts src/lib/components/Header.svelte.test.ts
git commit -m "test: lock route app boundaries"
```

---

## Task 2: Create Package Skeletons and VitePlus Workspace Metadata

**Files:**

- Create: `packages/music-core/package.json`
- Create: `packages/music-core/tsconfig.json`
- Create: `packages/music-core/src/index.ts`
- Create: `packages/pdf-core/package.json`
- Create: `packages/pdf-core/tsconfig.json`
- Create: `packages/pdf-core/src/index.ts`
- Create: `packages/ui/components.json`
- Modify: `package.json`
- Modify: `components.json`

- [ ] **Step 1: Add music package metadata**

Create `packages/music-core/package.json`:

```json
{
  "name": "@repo/music-core",
  "private": true,
  "type": "module",
  "exports": {
    ".": "./src/index.ts",
    "./domain": "./src/domain/index.ts",
    "./engines/analytics": "./src/engines/analytics/index.ts",
    "./engines/exercise": "./src/engines/exercise/index.ts",
    "./engines/input-router": "./src/engines/input-router/index.ts",
    "./engines/midi": "./src/engines/midi/index.ts",
    "./engines/progress": "./src/engines/progress/index.ts",
    "./engines/sessions": "./src/engines/sessions/index.ts",
    "./engines/skills": "./src/engines/skills/index.ts",
    "./engines/sound": "./src/engines/sound/index.ts",
    "./engines/store": "./src/engines/store/index.ts",
    "./engines/theory": "./src/engines/theory/index.ts",
    "./engines/transport": "./src/engines/transport/index.ts",
    "./exercises/interval-recognition": "./src/exercises/interval-recognition.ts",
    "./exercises/note-reading": "./src/exercises/note-reading.ts",
    "./exercises/rhythm-pulse": "./src/exercises/rhythm-pulse.ts",
    "./exercises/scale-pattern": "./src/exercises/scale-pattern.ts"
  },
  "scripts": {
    "check": "tsc --noEmit",
    "test": "vp test \"src/**/*.test.ts\"",
    "build": "tsc --noEmit"
  },
  "dependencies": {
    "dexie": "catalog:",
    "tonal": "catalog:",
    "tone": "^15.3.11",
    "vexflow": "catalog:",
    "webmidi": "catalog:"
  },
  "devDependencies": {
    "@types/node": "catalog:",
    "typescript": "catalog:",
    "vite-plus": "catalog:"
  }
}
```

- [ ] **Step 2: Add music TypeScript config**

Create `packages/music-core/tsconfig.json`:

```json
{
  "extends": "../../tsconfig.json",
  "compilerOptions": {
    "rootDir": "src",
    "noEmit": true
  },
  "include": ["src/**/*.ts"],
  "exclude": ["node_modules"]
}
```

- [ ] **Step 3: Add PDF package metadata**

Create `packages/pdf-core/package.json`:

```json
{
  "name": "@repo/pdf-core",
  "private": true,
  "type": "module",
  "exports": {
    ".": "./src/index.ts",
    "./components/AudioControls.svelte": "./src/components/AudioControls.svelte",
    "./components/FileUploader.svelte": "./src/components/FileUploader.svelte",
    "./components/PdfControls.svelte": "./src/components/PdfControls.svelte",
    "./components/PdfViewer.svelte": "./src/components/PdfViewer.svelte",
    "./services/loader": "./src/services/loader.ts",
    "./services/renderer": "./src/services/renderer.ts",
    "./services/textExtractor": "./src/services/textExtractor.ts",
    "./services/types": "./src/services/types.ts",
    "./stores/pdf": "./src/stores/pdf.svelte.ts"
  },
  "scripts": {
    "check": "tsc --noEmit",
    "test": "vp test \"src/**/*.test.ts\"",
    "build": "tsc --noEmit"
  },
  "dependencies": {
    "@repo/ui": "workspace:*",
    "pdfjs-dist": "^5.4.530",
    "svelte": "catalog:"
  },
  "devDependencies": {
    "@types/node": "catalog:",
    "typescript": "catalog:",
    "vite-plus": "catalog:"
  }
}
```

- [ ] **Step 4: Add PDF TypeScript config**

Create `packages/pdf-core/tsconfig.json`:

```json
{
  "extends": "../../tsconfig.json",
  "compilerOptions": {
    "rootDir": "src",
    "noEmit": true
  },
  "include": ["src/**/*.ts", "src/**/*.svelte"],
  "exclude": ["node_modules"]
}
```

- [ ] **Step 5: Add empty package entrypoints**

Create `packages/music-core/src/index.ts`:

```ts
export {};
```

Create `packages/pdf-core/src/index.ts`:

```ts
export {};
```

These entrypoints are intentionally empty until Tasks 3 and 5 move real source files. Do not reference files that have not been moved yet.

- [ ] **Step 6: Add UI package components.json**

Create `packages/ui/components.json`:

```json
{
  "$schema": "https://shadcn-svelte.com/schema.json",
  "tailwind": {
    "css": "../../src/app.css",
    "baseColor": "slate"
  },
  "aliases": {
    "components": "packages/ui/src",
    "utils": "packages/ui/src/utils",
    "ui": "packages/ui/src",
    "hooks": "packages/ui/src/hooks",
    "lib": "packages/ui/src"
  },
  "typescript": true,
  "registry": "https://shadcn-svelte.com/registry"
}
```

- [ ] **Step 7: Add root package dependencies**

Modify root `package.json` dependencies:

```json
{
  "dependencies": {
    "@repo/music-core": "workspace:*",
    "@repo/pdf-core": "workspace:*",
    "@repo/ui": "workspace:*"
  }
}
```

Keep existing dependencies until imports have moved; remove duplicates in Task 10.

- [ ] **Step 8: Verify package discovery**

Run:

```bash
env PATH=/Users/gaspard/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin:/Users/gaspard/Code/PersonalWebsite/node_modules/.bin:/usr/bin:/bin:/usr/sbin:/sbin vp run -r check
```

Expected: pass, or fail only for an existing unrelated workspace issue. Confirm VitePlus discovers `@repo/music-core` and `@repo/pdf-core` as workspace packages.

- [ ] **Step 9: Commit**

```bash
git add packages/music-core packages/pdf-core packages/ui/components.json package.json components.json
git commit -m "chore: add route app core packages"
```

---

## Task 3: Move Music Domain Into `@repo/music-core`

**Files:**

- Move: `src/lib/domain/**` to `packages/music-core/src/domain/**`
- Modify: `packages/music-core/src/index.ts`
- Modify: music/domain imports in tests and engines
- Delete: old `src/lib/domain/**` after imports are updated

- [ ] **Step 1: Move files**

Move these files as-is:

```txt
src/lib/domain/* -> packages/music-core/src/domain/*
```

- [ ] **Step 2: Update package entrypoint**

Set `packages/music-core/src/index.ts`:

```ts
export * from "./domain";
```

- [ ] **Step 3: Update imports from `$lib/domain`**

Replace imports in remaining music code and tests:

```ts
import { Capability, monotonicMs, type NoteEvent } from "@repo/music-core/domain";
```

Use this command to find remaining root-domain imports:

```bash
rg '"\\$lib/domain"|from \"\\$lib/domain\"|from '\\''\\$lib/domain'\\''' src packages
```

Expected after update: no `$lib/domain` imports.

- [ ] **Step 4: Update domain harness scripts**

Modify root `package.json` scripts:

```json
{
  "domain:validate": "tsx packages/music-core/src/domain/validate.ts",
  "domain:trace": "tsx packages/music-core/src/domain/pipeline-trace.ts"
}
```

- [ ] **Step 5: Run domain tests**

Run:

```bash
env PATH=/Users/gaspard/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin:/Users/gaspard/Code/PersonalWebsite/node_modules/.bin:/usr/bin:/bin:/usr/sbin:/sbin ./node_modules/.bin/tsx packages/music-core/src/domain/validate.ts
env PATH=/Users/gaspard/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin:/Users/gaspard/Code/PersonalWebsite/node_modules/.bin:/usr/bin:/bin:/usr/sbin:/sbin ./node_modules/.bin/tsx packages/music-core/src/domain/pipeline-trace.ts
env PATH=/Users/gaspard/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin:/Users/gaspard/Code/PersonalWebsite/node_modules/.bin:/usr/bin:/bin:/usr/sbin:/sbin vp test packages/music-core/src/domain/domain.test.ts
```

Expected: harnesses print the same validation and pipeline trace output as before; domain test passes.

- [ ] **Step 6: Commit**

```bash
git add package.json packages/music-core src/lib/domain
git commit -m "refactor(music): move domain into music-core"
```

---

## Task 4: Move Music Engines and Exercises Into `@repo/music-core`

**Files:**

- Move: `src/lib/engines/**` to `packages/music-core/src/engines/**`
- Move: `src/lib/exercises/**` to `packages/music-core/src/exercises/**`
- Modify: `src/routes/music/+page.svelte`
- Modify: all music test imports
- Modify: `svelte.config.js` aliases if old aliases become obsolete

- [ ] **Step 1: Move engine and exercise files**

Move:

```txt
src/lib/engines/* -> packages/music-core/src/engines/*
src/lib/exercises/* -> packages/music-core/src/exercises/*
```

- [ ] **Step 2: Update internal music imports**

Inside `packages/music-core/src`, replace:

```ts
from "$lib/domain"
from "$lib/engines/transport"
from "$lib/engines/theory"
```

with:

```ts
from "@repo/music-core/domain"
from "@repo/music-core/engines/transport"
from "@repo/music-core/engines/theory"
```

Use package imports for cross-folder music-core references to catch export-boundary mistakes early.

- [ ] **Step 3: Update route imports**

Modify `src/routes/music/+page.svelte` imports:

```ts
import { Capability, monotonicMs, type NoteEvent } from "@repo/music-core/domain";
import { AnalyticsEngine } from "@repo/music-core/engines/analytics";
import { runExerciseThroughPipeline } from "@repo/music-core/engines/exercise";
import { InputRouter } from "@repo/music-core/engines/input-router";
import { midiCapabilities } from "@repo/music-core/engines/midi";
import { ProgressEngine } from "@repo/music-core/engines/progress";
import { seedCoreSkills, SkillGraphStore } from "@repo/music-core/engines/skills";
import { scheduleMetronomeTicks } from "@repo/music-core/engines/transport";
import { chordNotes, noteToMidi } from "@repo/music-core/engines/theory";
import { intervalRecognitionExercise } from "@repo/music-core/exercises/interval-recognition";
```

- [ ] **Step 4: Remove obsolete Svelte aliases**

In `svelte.config.js`, remove route-app aliases that pointed to root music code:

```ts
"@domain": "./src/lib/domain",
"@app/theory": "./src/lib/engines/theory",
"@app/midi": "./src/lib/engines/midi"
```

Keep aliases only if another route still uses them. Verify with:

```bash
rg '"@domain|@app/' src packages
```

- [ ] **Step 5: Run music tests**

Run:

```bash
env PATH=/Users/gaspard/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin:/Users/gaspard/Code/PersonalWebsite/node_modules/.bin:/usr/bin:/bin:/usr/sbin:/sbin vp test packages/music-core/src/domain/domain.test.ts packages/music-core/src/engines/theory/theory.test.ts packages/music-core/src/engines/input-router/input-router.test.ts packages/music-core/src/engines/midi/midi.test.ts packages/music-core/src/engines/store/store.test.ts packages/music-core/src/engines/skills/skills.test.ts packages/music-core/src/engines/analytics/analytics.test.ts packages/music-core/src/engines/progress/progress.test.ts packages/music-core/src/engines/exercise/exercise.test.ts packages/music-core/src/exercises/note-reading.test.ts packages/music-core/src/exercises/rhythm-pulse.test.ts packages/music-core/src/exercises/scale-pattern.test.ts packages/music-core/src/engines/sessions/sessions.test.ts src/routes/music/page.svelte.test.ts
```

Expected: all pass.

- [ ] **Step 6: Run type check**

Run:

```bash
env PATH=/Users/gaspard/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin:/Users/gaspard/Code/PersonalWebsite/node_modules/.bin:/usr/bin:/bin:/usr/sbin:/sbin ./node_modules/.bin/tsc --noEmit --skipLibCheck
```

Expected: pass.

- [ ] **Step 7: Commit**

```bash
git add packages/music-core src/routes/music svelte.config.js src/lib/engines src/lib/exercises
git commit -m "refactor(music): move engines and exercises into music-core"
```

---

## Task 5: Move PDF Core Code Into `@repo/pdf-core`

**Files:**

- Move: `src/lib/components/pdf-reader/**` to `packages/pdf-core/src/components/**`
- Move: `src/lib/services/pdf/**` to `packages/pdf-core/src/services/**`
- Move: `src/lib/stores/pdf-reader/**` to `packages/pdf-core/src/stores/**`
- Modify: `src/routes/pdf/+page.svelte`
- Modify: PDF component imports

- [ ] **Step 1: Move PDF files**

Move:

```txt
src/lib/components/pdf-reader/* -> packages/pdf-core/src/components/*
src/lib/services/pdf/* -> packages/pdf-core/src/services/*
src/lib/stores/pdf-reader/* -> packages/pdf-core/src/stores/*
```

- [ ] **Step 2: Update PDF internal imports**

Inside `packages/pdf-core/src/components`, replace:

```ts
from "$lib/stores/pdf-reader/pdf.svelte"
from "$lib/services/pdf/loader"
from "$lib/services/pdf/renderer"
from "$lib/services/pdf/textExtractor"
```

with:

```ts
from "../stores/pdf.svelte"
from "../services/loader"
from "../services/renderer"
from "../services/textExtractor"
```

Keep UI imports as package imports:

```ts
import { Button } from "@repo/ui/button";
import { Slider } from "@repo/ui/slider";
import { Label } from "@repo/ui/label";
import { Progress } from "@repo/ui/progress";
import * as Select from "@repo/ui/select";
```

- [ ] **Step 3: Update PDF route imports**

Modify `src/routes/pdf/+page.svelte`:

```ts
import AudioControls from "@repo/pdf-core/components/AudioControls.svelte";
import FileUploader from "@repo/pdf-core/components/FileUploader.svelte";
import PdfControls from "@repo/pdf-core/components/PdfControls.svelte";
import PdfViewer from "@repo/pdf-core/components/PdfViewer.svelte";
import { pdfStore } from "@repo/pdf-core/stores/pdf";
import { Card } from "@repo/ui/card";
```

- [ ] **Step 4: Run PDF tests**

Run:

```bash
env PATH=/Users/gaspard/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin:/Users/gaspard/Code/PersonalWebsite/node_modules/.bin:/usr/bin:/bin:/usr/sbin:/sbin vp test packages/pdf-core/src/services/textExtractor.test.ts src/routes/pdf/page.svelte.test.ts
```

Expected: PDF service test and route test pass.

- [ ] **Step 5: Verify no old PDF imports remain**

Run:

```bash
rg "pdf-reader|services/pdf|stores/pdf-reader" src packages
```

Expected: no references except docs or this plan.

- [ ] **Step 6: Commit**

```bash
git add packages/pdf-core src/routes/pdf src/lib/components/pdf-reader src/lib/services/pdf src/lib/stores/pdf-reader
git commit -m "refactor(pdf): move reader code into pdf-core"
```

---

## Task 6: Move Site-Only Components Under `src/lib/components/site`

**Files:**

- Move: `src/lib/components/Header.svelte` to `src/lib/components/site/Header.svelte`
- Move: `src/lib/components/Footer.svelte` to `src/lib/components/site/Footer.svelte`
- Move: `src/lib/components/SplashScreen.svelte` to `src/lib/components/site/SplashScreen.svelte`
- Move if only splash uses it: `src/lib/components/SpaceColonizationCircuit.svelte` to `src/lib/components/site/SpaceColonizationCircuit.svelte`
- Move: `src/lib/components/Header.svelte.test.ts` to `src/lib/components/site/Header.svelte.test.ts`
- Modify: `src/routes/+layout.svelte`

- [ ] **Step 1: Move files**

Move site-only components:

```txt
src/lib/components/Header.svelte -> src/lib/components/site/Header.svelte
src/lib/components/Footer.svelte -> src/lib/components/site/Footer.svelte
src/lib/components/SplashScreen.svelte -> src/lib/components/site/SplashScreen.svelte
src/lib/components/SpaceColonizationCircuit.svelte -> src/lib/components/site/SpaceColonizationCircuit.svelte
src/lib/components/Header.svelte.test.ts -> src/lib/components/site/Header.svelte.test.ts
```

- [ ] **Step 2: Update SplashScreen local import**

Inside `src/lib/components/site/SplashScreen.svelte`, change:

```ts
import SpaceColonizationCircuit from "../components/SpaceColonizationCircuit.svelte";
```

to:

```ts
import SpaceColonizationCircuit from "./SpaceColonizationCircuit.svelte";
```

If the existing import is already different, use the equivalent same-folder import.

- [ ] **Step 3: Update layout imports**

Modify `src/routes/+layout.svelte`:

```ts
import Header from "$lib/components/site/Header.svelte";
import SplashScreen from "$lib/components/site/SplashScreen.svelte";
import Footer from "$lib/components/site/Footer.svelte";
```

- [ ] **Step 4: Add PDF header link if missing**

Ensure `src/lib/components/site/Header.svelte` has:

```svelte
<li aria-current={currentPath.startsWith('/pdf') ? 'page' : undefined}>
  <a href="/pdf">PDF</a>
</li>
```

- [ ] **Step 5: Run tests**

Run:

```bash
env PATH=/Users/gaspard/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin:/Users/gaspard/Code/PersonalWebsite/node_modules/.bin:/usr/bin:/bin:/usr/sbin:/sbin vp test src/lib/components/site/Header.svelte.test.ts src/routes/page.svelte.test.ts src/routes/music/page.svelte.test.ts src/routes/pdf/page.svelte.test.ts
```

Expected: pass.

- [ ] **Step 6: Commit**

```bash
git add src/lib/components src/routes/+layout.svelte
git commit -m "refactor(site): isolate site components"
```

---

## Task 7: Refactor Music Route UI To Use `@repo/ui` and Theme Tokens

**Files:**

- Modify: `src/routes/music/+page.svelte`
- Modify: `src/app.css`

- [ ] **Step 1: Add UI imports to music route**

At the top of `src/routes/music/+page.svelte`, add:

```ts
import { Button } from "@repo/ui/button";
import * as Card from "@repo/ui/card";
import { Progress } from "@repo/ui/progress";
import { Slider } from "@repo/ui/slider";
```

- [ ] **Step 2: Replace custom panels with Card components**

Replace patterns like:

```svelte
<article class="practice-panel">
  <h2>Input router</h2>
</article>
```

with:

```svelte
<Card.Root>
  <Card.Header>
    <Card.Title>Input router</Card.Title>
  </Card.Header>
  <Card.Content>
    <!-- existing content -->
  </Card.Content>
</Card.Root>
```

- [ ] **Step 3: Replace route buttons with UI Button**

Replace:

```svelte
<button type="button" onclick={() => answerInterval(true)}>Answer m6</button>
```

with:

```svelte
<Button type="button" onclick={() => answerInterval(true)}>Answer m6</Button>
```

- [ ] **Step 4: Replace BPM input with UI Slider**

Replace:

```svelte
<input type="range" min="60" max="180" bind:value={bpm} />
```

with:

```svelte
<Slider type="single" min={60} max={180} bind:value={bpm} />
```

If the current `@repo/ui/slider` API expects an array value, use:

```svelte
<Slider type="single" min={60} max={180} value={[bpm]} onValueChange={(value) => (bpm = value[0] ?? bpm)} />
```

Verify against `packages/ui/src/slider/slider.svelte`.

- [ ] **Step 5: Remove custom music theme CSS**

In `src/app.css`, remove selectors that only support the music route:

```css
.practice-shell
.practice-shell.arcade
.rail
.brand
.brand-mark
.workspace
.topbar
.practice-panel
.session-panel
.module-grid
.skill-panel
```

Keep globally useful Tailwind/shadcn CSS variables and base styles.

- [ ] **Step 6: Ensure music route uses theme tokens**

The outer music route should use classes like:

```svelte
<main class="min-h-screen bg-background text-foreground">
  <section class="container mx-auto space-y-6 px-4 py-8">
    <!-- cards -->
  </section>
</main>
```

Do not add custom `--practice-*` variables.

- [ ] **Step 7: Run music route test and check**

Run:

```bash
env PATH=/Users/gaspard/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin:/Users/gaspard/Code/PersonalWebsite/node_modules/.bin:/usr/bin:/bin:/usr/sbin:/sbin vp test src/routes/music/page.svelte.test.ts
env PATH=/Users/gaspard/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin:/Users/gaspard/Code/PersonalWebsite/node_modules/.bin:/usr/bin:/bin:/usr/sbin:/sbin vp check
```

Expected: pass.

- [ ] **Step 8: Commit**

```bash
git add src/routes/music/+page.svelte src/app.css packages/ui
git commit -m "refactor(music): use shared UI theme"
```

---

## Task 8: Add Storybook Coverage for Shared UI and Route-App Components

**Files:**

- Modify: `.storybook/main.ts`
- Create: `packages/ui/src/card/card.stories.svelte`
- Create: `packages/ui/src/button/button.stories.svelte`
- Create: `packages/pdf-core/src/components/FileUploader.stories.svelte`
- Create: `src/lib/components/site/Header.stories.svelte`

- [ ] **Step 1: Update Storybook stories glob**

Modify `.storybook/main.ts`:

```ts
import type { StorybookConfig } from "@storybook/sveltekit";

const config: StorybookConfig = {
  stories: [
    "../src/**/*.mdx",
    "../src/**/*.stories.@(js|ts|svelte)",
    "../packages/**/*.mdx",
    "../packages/**/*.stories.@(js|ts|svelte)",
  ],
  addons: [
    "@storybook/addon-svelte-csf",
    "@chromatic-com/storybook",
    "@storybook/addon-docs",
    "@storybook/addon-a11y",
    "@storybook/addon-vitest",
  ],
  framework: {
    name: "@storybook/sveltekit",
    options: {},
  },
};
export default config;
```

- [ ] **Step 2: Add Button story**

Create `packages/ui/src/button/button.stories.svelte`:

```svelte
<script module lang="ts">
  import { defineMeta } from "@storybook/addon-svelte-csf";
  import { Button } from "./index";

  const { Story } = defineMeta({
    title: "UI/Button",
    component: Button,
  });
</script>

<Story name="Default">
  <Button>Practice now</Button>
</Story>

<Story name="Secondary">
  <Button variant="secondary">Open PDF</Button>
</Story>
```

- [ ] **Step 3: Add Card story**

Create `packages/ui/src/card/card.stories.svelte`:

```svelte
<script module lang="ts">
  import { defineMeta } from "@storybook/addon-svelte-csf";
  import * as Card from "./index";

  const { Story } = defineMeta({
    title: "UI/Card",
  });
</script>

<Story name="Route App Card">
  <Card.Root class="max-w-md">
    <Card.Header>
      <Card.Title>Daily practice</Card.Title>
      <Card.Description>Shared card styling for route apps.</Card.Description>
    </Card.Header>
    <Card.Content>
      <p class="text-sm text-muted-foreground">Uses the site theme tokens.</p>
    </Card.Content>
  </Card.Root>
</Story>
```

- [ ] **Step 4: Add Header story**

Create `src/lib/components/site/Header.stories.svelte`:

```svelte
<script module lang="ts">
  import { defineMeta } from "@storybook/addon-svelte-csf";
  import Header from "./Header.svelte";

  const { Story } = defineMeta({
    title: "Site/Header",
    component: Header,
  });
</script>

<Story name="Default" />
```

- [ ] **Step 5: Add FileUploader story**

Create `packages/pdf-core/src/components/FileUploader.stories.svelte`:

```svelte
<script module lang="ts">
  import { defineMeta } from "@storybook/addon-svelte-csf";
  import FileUploader from "./FileUploader.svelte";

  const { Story } = defineMeta({
    title: "PDF/FileUploader",
    component: FileUploader,
  });
</script>

<Story name="Default" />
```

- [ ] **Step 6: Build Storybook**

Run:

```bash
env PATH=/Users/gaspard/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin:/Users/gaspard/Code/PersonalWebsite/node_modules/.bin:/usr/bin:/bin:/usr/sbin:/sbin vp run build-storybook
```

If `vp run build-storybook` is not available in the root package context, run:

```bash
env PATH=/Users/gaspard/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin:/Users/gaspard/Code/PersonalWebsite/node_modules/.bin:/usr/bin:/bin:/usr/sbin:/sbin storybook build
```

Expected: Storybook build succeeds.

- [ ] **Step 7: Commit**

```bash
git add .storybook packages/ui packages/pdf-core src/lib/components/site
git commit -m "test: add story coverage for shared route UI"
```

---

## Task 9: Add Playwright Route Smoke Tests

**Files:**

- Create: `e2e/route-apps.spec.ts`
- Modify: `playwright.config.ts` only if needed

- [ ] **Step 1: Create route smoke test**

Create `e2e/route-apps.spec.ts`:

```ts
import { expect, test } from "@playwright/test";

test("personal site links to route apps", async ({ page }) => {
  await page.goto("/");

  await expect(page.getByRole("heading", { name: /welcome/i })).toBeVisible();
  await expect(page.getByRole("link", { name: "Music" })).toHaveAttribute("href", "/music");
  await expect(page.getByRole("link", { name: "PDF" })).toHaveAttribute("href", "/pdf");
});

test("music route app renders", async ({ page }) => {
  await page.goto("/music");

  await expect(page.getByRole("heading", { name: "Musicianship OS" })).toBeVisible();
  await page.getByRole("button", { name: "Answer m6" }).click();
  await expect(page.getByText(/m6 mastery/i)).toBeVisible();
});

test("pdf route app renders", async ({ page }) => {
  await page.goto("/pdf");

  await expect(page.getByRole("heading", { name: "PDF Reader & Narrator" })).toBeVisible();
  await expect(page.getByText(/Upload a PDF/i)).toBeVisible();
});
```

- [ ] **Step 2: Run Playwright**

Run:

```bash
env PATH=/Users/gaspard/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin:/Users/gaspard/Code/PersonalWebsite/node_modules/.bin:/usr/bin:/bin:/usr/sbin:/sbin ./node_modules/.bin/playwright test e2e/route-apps.spec.ts
```

Expected: pass. If browser binaries are missing, report that and run `vp build` as fallback verification.

- [ ] **Step 3: Commit**

```bash
git add e2e/route-apps.spec.ts playwright.config.ts
git commit -m "test: add route app playwright smoke tests"
```

---

## Task 10: Reconcile Legacy `apps/pdf` and Clean Dependencies

**Files:**

- Modify or delete: `apps/pdf/**`
- Modify: `package.json`
- Modify: `pnpm-workspace.yaml`
- Modify: `pnpm-lock.yaml`

- [ ] **Step 1: Compare legacy PDF app**

Run:

```bash
rg --files apps/pdf/src src/routes/pdf src/lib/components/pdf-reader src/lib/services/pdf src/lib/stores/pdf-reader
```

Expected: identify whether `apps/pdf` contains anything not already migrated to `packages/pdf-core` and root `/pdf`. Compare specific duplicate files instead of diffing the whole root `src` tree.

- [ ] **Step 2: If legacy PDF is duplicate, remove it from workspace**

If `apps/pdf` is duplicate of root `/pdf` plus `packages/pdf-core`, delete `apps/pdf`.

Also update `package.json` scripts:

```json
{
  "scripts": {
    "dev": "vp dev",
    "build": "vp build",
    "build:all": "vp run -r build",
    "check": "vp check",
    "check:all": "vp run -r check",
    "test": "vp test",
    "test:all": "vp run -r test"
  }
}
```

Remove `dev:pdf` if `apps/pdf` is deleted.

- [ ] **Step 3: Remove root dependencies that moved exclusively to packages**

Only remove a dependency from root `package.json` if `rg` shows root app no longer imports it.

Check:

```bash
rg "tonal|webmidi|vexflow|dexie|pdfjs-dist" src packages
```

Root should keep dependencies it directly imports. Package-only dependencies should live in the package that imports them.

- [ ] **Step 4: Install/update lockfile with VitePlus or approved pnpm**

Run:

```bash
env PATH=/Users/gaspard/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin:/Users/gaspard/Code/PersonalWebsite/node_modules/.bin:/usr/bin:/bin:/usr/sbin:/sbin /private/tmp/pnpm-macos-arm64/package/pnpm install
```

Expected: `pnpm-lock.yaml` updates cleanly.

- [ ] **Step 5: Commit**

```bash
git add apps/pdf package.json pnpm-workspace.yaml pnpm-lock.yaml
git commit -m "chore: reconcile pdf workspace and dependencies"
```

---

## Task 11: Final Verification and Documentation Update

**Files:**

- Modify: `AGENTS.md` if commands/package structure should be documented there
- Modify: `README.md` if present and relevant

- [ ] **Step 1: Run VitePlus checks**

Run:

```bash
env PATH=/Users/gaspard/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin:/Users/gaspard/Code/PersonalWebsite/node_modules/.bin:/usr/bin:/bin:/usr/sbin:/sbin vp check
env PATH=/Users/gaspard/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin:/Users/gaspard/Code/PersonalWebsite/node_modules/.bin:/usr/bin:/bin:/usr/sbin:/sbin vp test
env PATH=/Users/gaspard/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin:/Users/gaspard/Code/PersonalWebsite/node_modules/.bin:/usr/bin:/bin:/usr/sbin:/sbin vp build
```

Expected: all pass.

- [ ] **Step 2: Run package checks**

Run:

```bash
env PATH=/Users/gaspard/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin:/Users/gaspard/Code/PersonalWebsite/node_modules/.bin:/usr/bin:/bin:/usr/sbin:/sbin vp run -r check
env PATH=/Users/gaspard/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin:/Users/gaspard/Code/PersonalWebsite/node_modules/.bin:/usr/bin:/bin:/usr/sbin:/sbin vp run -r test
```

Expected: all package tasks pass. If recursive root self-reference is pruned by VitePlus, note that in final verification.

- [ ] **Step 3: Run domain harnesses**

Run:

```bash
env PATH=/Users/gaspard/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin:/Users/gaspard/Code/PersonalWebsite/node_modules/.bin:/usr/bin:/bin:/usr/sbin:/sbin ./node_modules/.bin/tsx packages/music-core/src/domain/validate.ts
env PATH=/Users/gaspard/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin:/Users/gaspard/Code/PersonalWebsite/node_modules/.bin:/usr/bin:/bin:/usr/sbin:/sbin ./node_modules/.bin/tsx packages/music-core/src/domain/pipeline-trace.ts
```

Expected: same validation output and pipeline trace as before migration.

- [ ] **Step 4: Run Storybook build**

Run:

```bash
env PATH=/Users/gaspard/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin:/Users/gaspard/Code/PersonalWebsite/node_modules/.bin:/usr/bin:/bin:/usr/sbin:/sbin storybook build
```

Expected: build succeeds.

- [ ] **Step 5: Run Playwright smoke tests**

Run:

```bash
env PATH=/Users/gaspard/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin:/Users/gaspard/Code/PersonalWebsite/node_modules/.bin:/usr/bin:/bin:/usr/sbin:/sbin ./node_modules/.bin/playwright test e2e/route-apps.spec.ts
```

Expected: pass.

- [ ] **Step 6: Update repo docs**

If `AGENTS.md` is tracked as repo guidance, add this section:

```md
## Monorepo Structure

- This repo uses VitePlus workspace support, not Turborepo.
- The root SvelteKit app is the single deployment and serves `/`, `/music`, and `/pdf`.
- Reusable UI lives in `packages/ui`.
- Music domain and engines live in `packages/music-core`.
- PDF reader services/stores/reusable components live in `packages/pdf-core`.
- Use `vp run -r <task>` for recursive workspace tasks and `vp run @repo/<package>#<task>` for package-targeted tasks.
```

- [ ] **Step 7: Commit**

```bash
git add AGENTS.md README.md docs/superpowers/specs docs/superpowers/plans
git commit -m "docs: document viteplus route app monorepo"
```

---

## Final Completion Criteria

Before calling this done:

- [ ] `src/routes/+page.svelte` remains the personal website homepage.
- [ ] `src/routes/music/+page.svelte` imports music APIs from `@repo/music-core`.
- [ ] `src/routes/pdf/+page.svelte` imports PDF APIs from `@repo/pdf-core`.
- [ ] `src/lib/domain`, `src/lib/engines`, and `src/lib/exercises` no longer exist.
- [ ] `src/lib/components/pdf-reader`, `src/lib/services/pdf`, and `src/lib/stores/pdf-reader` no longer exist.
- [ ] `packages/ui` has the reusable UI and Storybook stories.
- [ ] The music route no longer depends on custom `.practice-*` CSS variables.
- [ ] VitePlus check/test/build pass.
- [ ] Storybook build passes.
- [ ] Playwright route smoke tests pass.
- [ ] The final response lists any warnings that remain, especially pre-existing Svelte or chunk-size warnings.
