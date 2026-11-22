# AGENTS.md: the personal site's design

Read this before you change how any site page looks or behaves: home (`/`), About,
Writing (`/blog`), the Studio, Listplay, sign-in, the private page and the error page,
plus the shell in this folder (header, footer, intro, board). Woodshed (`/music`) and
Narrator (`/pdf`) have their own look; Narrator's rules are in
[src/routes/pdf/AGENTS.md](../../../routes/pdf/AGENTS.md).

The look came out of a screenshot-judged UI climb in November 2026 (four rounds,
three judge models, about 450 screens per round, scored against the best personal
sites). The owner liked the result. Keep it, and build new work out of the same parts.

## What the site is

One person's site: software, music, writing and visual work, with every kind of work
given the same weight. Its identity is fixed. Do not change any of these without the
owner asking:

- **The GME logo intro** on a first visit to `/` ([SplashScreen.svelte](SplashScreen.svelte)).
- **The circuit board** grown from the logo's ring, kept as the background on every page.
- **Home as intro, then the newest work, then a door for every kind.**
- **The Studio with every kind equal.** A kind with no work yet gets a door the same size
  as one with work. Kinds with work may come first; empty ones are never drawn smaller.
- **Two typefaces**: Bricolage Grotesque for display and interface
  (`var(--font-gm-display)`), Newsreader for reading (`var(--font-gm-serif)`).

## Where things live

- Tokens and shared classes: [src/lib/styles/site.css](../../styles/site.css). Theme
  colours come from the shadcn tokens in `src/app.css` (`--background`, `--foreground`,
  `--muted-foreground`, `--card`, `--border`, `--accent`, `--primary`, `--ring`).
  Site pages override two of them through `:root:has([data-site-chrome])`: a darker
  `--muted-foreground` (7:1 on the page) and the cobalt `--ring`.
- Primitives: `@repo/ui/*` (bits-ui). Import bits-ui parts **only through `@repo/ui`**,
  never from `bits-ui` directly in site code. The app and the ui package resolve separate
  copies of bits-ui, and a menu built from parts of both lost its context in the
  production build (the phone menu was dead). If you need a part `@repo/ui` doesn't
  export yet, export it there (as `ContentStatic` and `PlainRadioItem` were).
- Studio content: [src/lib/content/studio.ts](../../content/studio.ts) (how to add a piece
  is at the top of the file). Projects: `src/lib/content/projects.ts`. Nav and socials:
  `src/lib/config.ts`.

## The parts to reuse

Reach for these before writing new CSS. They are in `site.css` unless named.

| Job | Use |
| --- | --- |
| Page frame (76rem column, fluid side padding) | `.gm-page` |
| Page title, section heading | `.gm-title`, `.gm-h2` |
| Lead paragraph under a title (serif, muted, 38ch) | `.gm-lede` |
| Running text (serif, 62ch) | `.gm-text` |
| A link that stands alone ("More about me", "All posts") | `.gm-link`, with a trailing lucide icon that nudges on hover |
| A link inside a sentence | `.gm-inline-link` |
| An icon-only or icon-plus-word control | `.gm-icon-btn` (44px bordered square on the card surface) |
| What a control does, on hover and keyboard focus | `.gm-tip` (`.start`, `.wide`); inside the control it is part of its name |
| A card that is one big link | `.stretch` on the card, `.stretch-link` on its title link |
| Blog post body | `.gm-prose` (code blocks keep their language label and Copy button) |
| Brand gradient bar (current nav link, phone menu row) | `var(--gm-brand)`, `var(--gm-brand-down)` |
| A drawing's paper mat | `var(--gm-paper)`, `var(--gm-paper-edge)` (same in both themes) |
| Anything placed under the sticky header | `var(--gm-header-h)` |
| Cover art for something with no picture | `CircuitArt` (seeded by slug, so server and browser match) |
| A Studio piece's picture | `StudioCover`; a tile on the wall `StudioTile`; the doors `StudioDoors` |
| Language picker, theme control | `LanguageMenu` (`named`, `rows`), `ThemeSwitch` (Light and Dark, no System) |

The `--gm-red`, `--gm-blue` and other marker colours are for artwork (traces, dots,
swatches), never for text.

## Layout and chrome

- **One breakpoint for the shell: 860px.** At 860px and up the header shows the links,
  the language pill, the two-part theme control and the sign-in button. Under it the
  header is the brand, the sign-in button and one Menu button that opens a full-width
  sheet (pages, language, theme, then "Elsewhere" at its foot).
- **Phone width is 390px** and must work fully: no sideways scroll, nothing cut, no label
  wrapping inside a button. Check 320px for the header.
- **The board stays out from behind text.** [CircuitBackground.svelte](CircuitBackground.svelte)
  draws it as a band hanging from the header that fades out within a couple of rem, down
  the margins for the first part of the screen at 1200px and up, and as full side strips
  only where each margin is 160px or more (1536px and up). The footer draws the same board
  along its top edge. Never put traces behind or beside content below that band. Text that
  used to need a veil carries `.gm-clear` as a marker; it draws nothing now.
- **Footer**: name and note with "Replay the intro", projects with small covers, the site's
  pages, Elsewhere. On a phone it also repeats the language menu and theme control, since the
  header keeps them inside the menu there.
- **Sign-in** is the header button (an icon to `/login`; signed in, the owner's avatar to
  `/private`). The root `+layout.server.ts` passes only the user's name and picture.
  Sign-in pages have one way out, "Back to home", at every width.
- **Errors** render inside the layout ([src/routes/+error.svelte](../../../routes/+error.svelte)):
  what happened, the address asked for, a "Did you mean" main button when the address looks
  like a typo (`src/lib/nearest.ts`), ways on, and three Studio pieces.

## The intro

- It waits on a first visit and never lifts by itself. Any input starts it: a press on the
  logo or anywhere, a key, a scroll. There is no "Play" button (the owner removed it).
- "Skip intro", then "Explore the site" once it has played, lifts it at any time, as do
  Escape and a scroll after it has played. Ctrl+Shift+G, M, E replays it from any page.
- A head script hides it before first paint for returning visitors, so it never flashes.
- **Motion quality comes first here.** The logo's letters unfold on the shared
  `--ease` curve in `GmeMark.svelte`. A climb round once swapped it for a fast-start curve
  so a still frame wouldn't catch the letters overlapping; it made the unfold jump about
  22px a frame and the owner noticed at once. Judge animation by watching it, or by
  measuring per-frame movement, never by a single screenshot.

## Rules every change follows

- **Same thing at both widths.** A control, label or piece of help you add at 1280px exists
  at 390px too, and the other way round, unless there is a stated reason.
- **Check every new label at 390px in French and in English.** French and Spanish run about
  a third longer. If it wraps in a button or chip, shorten it in all four languages.
- **One mark, one meaning.** Before adding a check mark, dot, ring or colour, look at what
  that mark already means on the screen and its neighbours.
- **One notice per cause, one way to do a job per screen.** Look for the existing button or
  notice before adding another.
- **Touch targets look 44px.** A visible shape of that size, not a small glyph with invisible
  padding.
- **Every response has a still state and respects reduced motion.** Hover, press and notices
  must show in a screenshot, and be still or instant under `prefers-reduced-motion`.
- **Focus is always visible**: 2px `var(--ring)` outline. Colour is never the only cue.
  Nothing under 12px.
- **Theme tokens only, both themes.** No hard-coded colours outside artwork. Dark theme's
  `--primary` is the bright foreground so the main button never reads as disabled grey.
- **Honest content.** Never invent facts about the owner or their work (dates, media, job
  history, a portrait, an email). Where owner content is missing, build the slot so it shows
  nothing when empty. Don't edit the posts in `src/lib/blog-posts/` or rewrite the owner's
  sentences about themselves.
- **Never remove a feature.** Moving, merging and renaming are fine when it stays reachable.
- **Every visible string is a message** in all four locales (see the root `AGENTS.md`).
  Copy: plain words, no em or en dashes as punctuation, no "it's not just X, it's Y", none
  of delve, underscore, tapestry, crucial, pivotal, load bearing.

## Lessons from the climb

- **A fix must not leave a new first flaw.** Almost half of what the judges put first after
  round 2 was about round 2's own additions: a control given to desktop only, a new label
  that wrapped at 390px, a new mark that meant two things, a notice three rows tall. A small
  change finished at both widths, both themes and in French beats a large one left with a
  fault in one screenshot.
- **Don't trade the experience for a still.** Screenshot judges can't see motion, timing or
  feel. When a judge's complaint is about a frame mid-animation, leave the animation alone.
- **Know what's capped.** On the site about half the remaining flaws are owner decisions or
  owner content (the placeholder posts, Listplay, empty Studio kinds, no portrait or email,
  no year or medium on the drawings). Design polish can't move those; ask the owner.
- **The harness can rerun a climb**: see [scripts/ui-climb/README.md](../../../../scripts/ui-climb/README.md).

## Checking your work

- Look at your screens in a fresh headless Playwright context at 1280x800 and 390x844, light
  and dark (`localStorage` key `mode-watcher-mode`), English and French (cookie
  `PARAGLIDE_LOCALE=fr`). Set `localStorage` `gm.intro.seen` to skip the intro on `/`.
  Read the screenshots and check for sideways overflow.
- Start your own dev server on a free port (`vp dev --port <n> --strictPort`), never 5173
  (the owner's). New message keys need `node packages/i18n/compile.js` (or `vp run i18n`)
  and a server restart, or the page 500s with "m.key is not a function".
- Run the site e2e on a production build (`vp run -r build`, `vp preview --port 4174`, then
  `PW_BASE_URL=http://localhost:4174 npx playwright test e2e/route-apps.spec.ts e2e/site.spec.ts`).
  On a dev server two of them can fail by clicking before hydration.
- Gates: `vp run -r check`, `npx svelte-check --threshold error`, `vp test --run`.
