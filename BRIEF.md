# Practice OS, rebuilt from scratch

You are building a music practice app for one person, from scratch, inside their personal website's repository. The previous music app was deleted on purpose; the rest of the site is intact and is the stack you build on. What you have is everything else: a catalog of what the previous version did, the research it was built on, the hardware knowledge it took months to learn, screenshots of what it looked like, and the lessons from six review rounds. Read `context/README.md` first; it indexes all of it.

## Who this is for

One musician who practises piano (a MIDI keyboard), guitar (acoustic, through the laptop microphone), finger drums on an Akai MPC One+ (MIDI pads, needs a controller handshake, see `context/03-hardware-and-devices.md`), and a Roland Aerophone (MIDI wind controller, breath and fingering). They practise in short sessions, several instruments a week, and they want to keep coming back. They will run this on a laptop at the instrument and glance at it on a phone.

## The task

Build a complete, working practice app at `/music` that reaches feature parity with the catalog in `context/01-feature-catalog.md`, looks and feels like a great practice app, and makes practising feel worth returning to. Colour, motion, sound and celebration are welcome; the previous version was reviewed as dull and templated (see `context/06-lessons-learned.md`). The UI and UX are yours to design. You are not bound by any layout, naming, navigation, component or visual decision the old app made; the screenshots show what existed, not what to copy.

You may:

- drop a feature from the catalog when you judge it unnecessary, as long as you say so in `TASKS.md` with a one-line reason;
- add features the catalog never had when they make the app better for this musician;
- choose the architecture inside the stack, the libraries for notation, audio and MIDI, and the tooling; and
- redesign any drill's interaction as long as it still teaches the same skill and grades it honestly.

Keep the verified content and the hardware facts: the fingering charts, chord shapes, scale and pattern tables, groove tables, the MPC handshake bytes, the pitch-detection settings that work on low guitar strings, and the scoring rules that decide what counts as mastered. They are in `context/data/`, `context/03-hardware-and-devices.md`, `context/04-music-data.md` and `context/05-scoring-rules.md`. Change them only if you can show they are wrong.

## Where it will live, and the stack

This repository is the owner's personal website: a SvelteKit 2 + Svelte 5 (runes) monorepo built with VitePlus, Tailwind CSS 4, shadcn-svelte style primitives on bits-ui in `packages/ui` (imported as `@repo/ui/<component>`), Vitest with a browser project for component tests, Playwright for end-to-end tests, and the Node adapter for deployment. The site's own pages and a PDF reader at `/pdf` are here and working; the music app was removed from `src/routes/music` and its old `packages/music-core` was deleted, so those paths are yours. The site's shared header and footer wrap every route.

Use this stack. Build the music app as `src/routes/music/**` (a `+layout.svelte` of its own inside the site shell is fine) with a framework-free domain package under `packages/` for engines, scoring and content, the way the rest of the monorepo splits UI from logic. Reach for `@repo/ui` primitives first and extend that package when you need a primitive it lacks, rather than inventing a second component library; add new primitives there in the shadcn-svelte style so the rest of the site can use them. Everything the app stores is client-side (IndexedDB, Origin Private File System); there is no server for the music app and no accounts. The root `CLAUDE.md` and `AGENTS.md` describe the monorepo commands and the commit workflow; they apply. If you conclude a different tool is genuinely better for one job (notation rendering, audio scheduling, pitch detection), use it and say why in `TASKS.md`; the stack itself is settled.

## How to work

Do your own research before you design. Look at how the best practice, tuner, notation, drum and habit apps present drills, feedback, progress and streaks today; `context/02-research-digest.md` and `context/references/` record what earlier rounds found, and they are a starting point, not a boundary. Read the learning research summarised in the digest and decide for yourself which findings you build on.

Use the browser to check your work. Open the app, run each drill with on-screen input, take screenshots at phone and laptop widths, and read what you took. Drive the MIDI paths with a fake Web MIDI port in your end-to-end tests the way the lessons file describes; drive the microphone paths with synthetic audio. The owner will do the real-hardware checks at the end; list what they need to check in `TASKS.md` under "Needs hardware".

Split large, independent pieces across subagents when it speeds you up (for example one per instrument's drill set, or one for notation rendering). When a subagent reports back, check its evidence before you accept it.

Keep `TASKS.md` current as you go: what is done, what is in progress, what you dropped and why, what needs the owner. It survives context resets and it is how the owner follows along.

Mark anything you could not confirm, and say where you looked.

## Design guardrails

Do not use a cream or off-white background with a terracotta accent, a near-black page with one acid-green accent, italic accent words in headings, numbered section labels on things that are not sequences, tracked-out all-caps eyebrow labels, monospace labels for small data, middle-dot-separated meta strings, identical rounded cards with one radius and one grey shadow for everything, or an arrow appended to link and button text. Do keep 44 px touch targets, a keyboard path for everything a pointer can do, live-region announcements for status, visible focus, reduced-motion respect, and never let colour be the only cue. Keys, pads and frets must show held, target, correct and wrong as distinct states with distinct lifetimes; a wrong note must clear when its moment passes.

## Done means

- Every catalog feature is either present and working, or listed as dropped with a reason.
- A first-time user can connect a MIDI device or the microphone, run a drill on every instrument, see honest scoring, and see their progress and what to practise next.
- Unit tests cover the scoring and content tables; end-to-end tests cover each hub and one drill per instrument with fake MIDI and synthetic audio; both suites pass.
- `TASKS.md` lists the hardware checks the owner must run.
- The app builds for production and runs from the built output.

## When to stop and ask

Stop and ask the owner only when you cannot continue without them: a product decision you cannot make from the context (say what you would choose and why), a blocker you cannot fix after a real attempt, or before anything destructive or outside this repository. Everything else, decide and record the decision in `TASKS.md`.
