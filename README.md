# PersonalWebsite

SvelteKit personal website and route-app monorepo powered by VitePlus.

## Structure

- `src/routes/` is the single deployed SvelteKit site.
- `/` remains the personal website.
- `/pdf` serves the PDF reader app.
- `packages/ui` contains shared ShadCN Svelte/Bits UI components and theme utilities.
- `packages/pdf-core` contains reusable PDF reader components, services, and stores.

## Commands

```bash
pnpm dev
pnpm check
pnpm test
pnpm build
pnpm build-storybook
pnpm test:e2e
```

Use VitePlus recursive workspace tasks when checking packages together:

```bash
vp run -r check
vp run -r test
```
