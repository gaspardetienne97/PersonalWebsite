# AGENTS.md

This file provides guidance for agents working on the Music app under
`src/routes/music/` and the related core package in `packages/music-core/`.

## Product Context

- The Music app is the `/music` route inside the personal website. It is not a
  separate root website and should not replace the personal homepage.
- The current product is "Musicianship OS": a MIDI-first, offline-capable
  practice app for ear training, theory, note reading, sight-reading, rhythm,
  scales/technique, journaling, analytics, progress, XP, streaks, and a skill
  tree.
- The app is built as one SvelteKit deployment that serves `/`, `/music`, and
  `/pdf`. Do not split Music into a separate deployment unless the user makes a
  new explicit decision.
- The implementation follows `IMPLEMENTATION_PLAN.md` and
  `music-practice-app-plan.md`. The current implementation has completed the
  Phase 0 foundations and most Phase 1 route features through the first T1.12
  UI/UX polish slice.

## Core Decisions Already Made

- **Monorepo tool:** Use VitePlus workspace support. Do not add Turborepo.
- **Build engine:** VitePlus should use the Vite/Rolldown setup already in this
  repo. Existing Vite/Rolldown beta warnings are expected unless a task is
  specifically about fixing them.
- **Deployment shape:** Keep the Music app inside the root SvelteKit site under
  `/music`.
- **UI system:** Use `@repo/ui` components and the root site's Tailwind/shadcn
  Svelte theme tokens. Do not hardcode a separate Music color palette or font
  stack.
- **Design source:** `docs/music-practice-app/` is a Claude Design handoff. Use
  it for interaction patterns, layout ideas, and component consistency, but
  adapt it to the existing SvelteKit app and inherited theme tokens.
- **Input strategy:** MIDI first, audio second, on-screen last. Web MIDI devices
  route through `MusicRuntime`, `MidiEngine`, and `InputRouter`.
- **Known hardware:** MIDI events were recognized from a Roland FP-30X and an
  MPC One+. Keep exercise input wired through the shared router so real MIDI can
  advance sessions, not only the home route.
- **Audio scope:** Browser audio is currently only for playback/metronome. Audio
  pitch detection is Phase 2 and should not be added in Phase 1.
- **Chord recognition:** Do not attempt real-time polyphonic chord detection in
  the browser. For future chord practice, use expected-target matching or
  monophonic audio only when Phase 2 is intentionally started.
- **Notation:** Use VexFlow for Phase 1 notation. Defer OpenSheetMusicDisplay to
  Phase 3 when MusicXML import and score-following over real scores are needed.
- **Persistence:** Phase 1 persists client-side practice state through
  `PracticeStore`/IndexedDB. This app is not live yet, so do not create database
  migrations for Music features unless the user explicitly asks for server
  persistence.
- **Dependencies:** Do not add Phase 2+ dependencies such as pitchy,
  pitchfinder, opensheetmusicdisplay, or basic-pitch until the relevant phase is
  active.
- **Licensing:** Avoid Essentia.js in any closed-source build because it is
  AGPL-v3.

## Architecture Map

### Route App

- `src/routes/music/+layout.svelte` creates the shared `MusicRuntime`, registers
  the PWA, renders `MusicNavigation`, and docks the persistent
  `MusicTransportBar` at the bottom of every screen.
- `src/routes/music/_runtime.svelte.ts` owns the shared runtime:
  - `InputRouter`
  - `MidiEngine`
  - `SoundEngine`
  - audio enable state and cleanup
  - active instrument + reactive input source/confidence
  - the shared metronome (`transportBpm`, `metronomeRunning`, `toggleMetronome`)
    that drives the transport bar
- `src/routes/music/_components/MusicNavigation.svelte` is the persistent Music
  app navigation (Practice OS sidebar with grouped IA + user-card footer on
  desktop; bottom tab bar on mobile).
- The Practice OS shell uses **per-page headers**, not a global status bar.
  `PracticeScreen` + `PracticeScreenHeader` wrap each route: a big `h1`,
  subtitle, and right-aligned controls (a `SegmentedControl` and/or a
  `SourceReadout` input pill). There is no `MusicTopbar`; XP/streak/level live on
  the `/music` dashboard, and input/source lives in each page header.
- `src/routes/music/_components/MusicTransportBar.svelte` is the persistent
  transport: tempo + slider, count-in, play/skip/repeat, volume, and the audio
  enable gate. It reads/writes the shared metronome on `MusicRuntime`.
- `src/routes/music/_components/OnScreenKeyboard.svelte` is the fallback input
  surface and should push normalized `NoteEvent`s through the shared router.

### Current Routes

- `/music`: instrument hub, MIDI status, metronome, on-screen input, and a daily
  mixed session demo.
- `/music/learn`: entry point for learning tools.
- `/music/learn/ear`: interval/chord/scale-degree ear training.
- `/music/learn/reading`: note flashcards and generated sight-reading.
- `/music/learn/rhythm`: pulse timing trainer.
- `/music/learn/theory`: chord and theory library.
- `/music/play`: play/practice entry point.
- `/music/play/scales`: scales and technique trainer.
- `/music/track`: practice journal and routine/session tracking.
- `/music/progress`: dashboard, skill tree, weak spots, achievements, streaks,
  and practice-next picks.

### Core Package

Music domain, engines, exercises, and storage live in `packages/music-core/`.
Route code should import public exports from `@repo/music-core/...`; do not
reach through private file paths when an export exists.

Important areas:

- `src/domain/`: canonical types such as `NoteEvent`, `ScoringEvent`, `Skill`,
  `PracticeSession`, `InstrumentId`, and pipeline types.
- `src/exercises/`: exercise definitions and scoring input adapters.
- `src/engines/input-router/`: source arbitration and normalized input stream.
- `src/engines/midi/`: Web MIDI support and device/event normalization.
- `src/engines/sound/`: Tone-backed playback and metronome sounds.
- `src/engines/transport/`: metronome/transport scheduling.
- `src/engines/notation/`: VexFlow-based notation rendering data.
- `src/engines/skills/`: seeded skill graph and mastery.
- `src/engines/analytics/`: confusion matrix, weak skills, and practice-next
  data.
- `src/engines/progress/`: XP, level, streak, achievements.
- `src/engines/sessions/`: practice journal/session records.
- `src/engines/dashboard/`: dashboard and skill tree view projections.
- `src/engines/store/`: IndexedDB-backed local persistence.

If you add a new engine or public exercise, update
`packages/music-core/package.json` exports and add focused tests.

## Development Rules

### Test First

- For new behavior or bug fixes, write a failing test before production code.
- Core behavior belongs in `packages/music-core` tests first when possible.
- Route behavior belongs in colocated `.svelte.test.ts` files.
- Cross-route user workflows belong in `e2e/*.spec.ts`.

### Keep Core Logic Out of Svelte

- Put scoring, projections, analytics, progression, and routing decisions in
  `packages/music-core`.
- Svelte components should orchestrate runtime state and render UI. Avoid
  embedding domain algorithms inside route components.
- Prefer pure projection functions for dashboard-like views, then test those
  functions with unit tests.

### Use the Shared Runtime

- Inside Music routes and components, use `useMusicRuntime()` rather than
  creating new `InputRouter`, `MidiEngine`, or `SoundEngine` instances.
- Only `src/routes/music/+layout.svelte` should create the shared runtime with
  `createMusicRuntime()`.
- Always unsubscribe router, MIDI, transport, and runtime listeners in
  `onDestroy`.
- When testing isolated components, it is acceptable to instantiate
  `MusicRuntime` directly and dispose it at the end of the test.

### Input Handling

- Every playable exercise must accept input from the shared `InputRouter`.
- On-screen controls should call router APIs or push normalized domain events.
- MIDI events should advance the same sessions as on-screen events. Do not build
  exercise logic that only works for clicks.
- Preserve source confidence and active-source UI where relevant.
- Audio input is a future path. Do not fake audio pitch detection in Phase 1.

### Persistence and Data

- Use `PracticeStore` for browser-only persisted state.
- Guard browser-only storage with SvelteKit's `browser` flag when needed.
- Call `load()` on engines/stores before projecting persisted state.
- Do not add server DB tables or migrations for Music until the app has a
  server persistence requirement.
- Local state must remain offline-friendly and PWA-compatible.

### UI and Theming

- Use `@repo/ui` components for Button, Card, Badge, Input, Label, Progress,
  Slider, Select, Toggle, Dialog, and related primitives.
- Use Tailwind utility classes and theme tokens such as `bg-background`,
  `text-foreground`, `bg-card`, `text-muted-foreground`, `border`, `bg-primary`,
  and `text-primary-foreground`.
- Do not copy the Claude Design handoff colors/fonts directly into route code.
  Port the structure and UX, then let the site theme drive color and type.
- Avoid custom component palettes unless they are implemented as tokens in the
  UI package and used consistently.
- Keep card radii and spacing aligned with the existing shadcn Svelte
  components.
- Route pages own their semantic `h1`. Shared chrome should use non-heading
  text for route labels unless there is a specific accessibility reason.
- Ensure desktop and mobile layouts do not introduce horizontal overflow.

### Extending Routes

When adding a new Music feature:

1. Add or extend a domain/exercise/engine test in `packages/music-core` if the
   feature has scoring, state, analytics, or persistence logic.
2. Implement the minimal core behavior and export it from `@repo/music-core`
   when route code needs it.
3. Add or update the Svelte route/component with `@repo/ui` primitives.
4. Add a colocated browser component test for rendered behavior.
5. Add Playwright coverage if the feature is a user-facing route workflow.
6. Run the verification gates listed below.

### Verification Gates

Use these before claiming a Music change is complete:

```bash
vp run -r check
vp test --run
vp run -r build
./node_modules/.bin/playwright test
./node_modules/.bin/tsx packages/music-core/src/domain/validate.ts
./node_modules/.bin/tsx packages/music-core/src/domain/pipeline-trace.ts
```

For focused work, run the smallest relevant test first, then the full gates
before commit or completion.

### Browser Verification

- After meaningful UI changes, inspect the affected `/music` route in the
  in-app browser.
- Check desktop and mobile widths for overlap and horizontal overflow.
- Toggle the root site theme and confirm the Music app changes through tokens.
- If the existing dev server has stale generated-type errors, use the verified
  build/preview or start a temporary dev server on another port, then stop it
  when finished.

## Current Implementation Notes

- `/music/progress` renders real persisted progress projections through
  `buildDashboardView` and `buildSkillTreeView`.
- The skill tree renders the full seeded graph so rhythm and other later-sorted
  skills are visible.
- XP/streak/level render on the `/music` dashboard from persisted progress; the
  active input source shows in each page header's `SourceReadout`. The persistent
  `MusicTransportBar` drives the shared metronome.
- MIDI was previously fixed so hardware note events advance reading exercises.
  Preserve that path when refactoring reading or input code.
- The practice journal stores sessions and notes locally. It is intentionally
  client-side for now.

## Things Not To Do

- Do not move Music back to the website root.
- Do not introduce Turborepo.
- Do not add Music server migrations for Phase 1 client-local features.
- Do not bypass `@repo/ui` by creating one-off component systems in route files.
- Do not hardcode Claude Design colors, fonts, or global CSS into Music routes.
- Do not implement real-time polyphonic chord recognition.
- Do not add Phase 2+ audio/import dependencies early.
- Do not revert unrelated local docs, plans, `.codex`, `.superpowers`, or other
  user-owned files.
