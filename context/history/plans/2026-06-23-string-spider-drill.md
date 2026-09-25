# String Spider Drill Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [x]`) syntax for tracking.

**Goal:** Add an engine-backed guitar/ukulele 1-2-3-4 spider drill at `/music/play/spider` with MIDI and fretboard input, scoring, XP/mastery, and journal capture.

**Architecture:** Promote the spider prototype from the domain validation harness into a public exercise, then expose it through the existing `TechniqueSession`. The Svelte route composes the shared runtime, existing fretboard input, Practice OS components, and `@repo/ui`; all grading remains framework-agnostic in `packages/music-core`.

**Tech Stack:** TypeScript, SvelteKit 2, Svelte 5 runes, VitePlus/Vitest, `@repo/music-core`, `@repo/ui`, Playwright.

## Global Constraints

- Keep the Music app under `/music` in the single SvelteKit deployment.
- Use the shared `MusicRuntime`; do not create route-local MIDI, input-router, or sound engines.
- Accept MIDI and on-screen fretboard input through the same `InputRouter`.
- Use existing theme tokens and `@repo/ui`; do not add a Music-specific palette.
- Persist only through the existing practice pipeline and IndexedDB-backed stores.
- Do not add dependencies or database migrations.

---

### Task 1: Public String Spider Exercise

**Files:**
- Create: `packages/music-core/src/exercises/string-spider.ts`
- Create: `packages/music-core/src/exercises/string-spider.test.ts`
- Modify: `packages/music-core/package.json`

**Interfaces:**
- Produces: `createStringSpiderExercise(options: StringSpiderOptions)`
- Produces: `StringSpiderPrompt` with `instrument`, `tuningId`, `stringNumber`, `startFret`, `bpm`, `midiNotes`, `noteLabels`, and `targetSpacingMs`
- Produces: `StringSpiderAnswer` with played MIDI notes, pitch accuracy, and mean timing error

- [x] Write failing exercise tests for guitar and ukulele prompt generation, clean scoring, and wrong-order scoring.
- [x] Run `vp test packages/music-core/src/exercises/string-spider.test.ts --run` and verify the missing module failure.
- [x] Implement a four-note ascending chromatic prompt on one string using the selected tuning.
- [x] Score pitch order and inter-note evenness relative to `60_000 / bpm`.
- [x] Export `./exercises/string-spider` from `packages/music-core/package.json`.
- [x] Re-run the focused exercise tests and verify they pass.

### Task 2: Technique Session Integration

**Files:**
- Modify: `packages/music-core/src/engines/technique-session/index.ts`
- Modify: `packages/music-core/src/engines/technique-session/technique-session.test.ts`
- Modify: `packages/music-core/src/engines/skills/index.ts`
- Modify: `packages/music-core/src/engines/skills/skills.test.ts`

**Interfaces:**
- Consumes: `createStringSpiderExercise`
- Produces: `TechniqueSession.startSpider(options: TechniqueSpiderOptions)`
- Records mastery to `technique.strings.spider` and the selected instrument-specific child skill.

- [x] Add a failing session test that completes a guitar spider through `InputRouter`.
- [x] Add a failing skill-seed assertion for string-technique skills.
- [x] Run both focused test files and verify the expected failures.
- [x] Add string spider prompts to `TechniquePrompt` and implement `startSpider`.
- [x] Seed `technique.strings`, `technique.strings.spider`, `technique.guitar.spider`, and `technique.ukulele.spider`.
- [x] Re-run both focused test files and verify they pass.

### Task 3: Practice OS Route

**Files:**
- Create: `src/routes/music/play/spider/+page.svelte`
- Create: `src/routes/music/play/spider/page.svelte.test.ts`
- Modify: `src/routes/music/play/+page.svelte`
- Modify: `src/routes/music/play/page.svelte.test.ts`
- Modify: `src/routes/music/_components/MusicNavigation.svelte`

**Interfaces:**
- Consumes: `TechniqueSession.startSpider`, `curatedTunings`, and shared `FretboardInput`
- Records: `runtime.recordPractice({ source: "drill", tags: ["technique", "spider", instrument] })`

- [x] Add a failing browser component test that selects guitar, starts the drill, clicks the four target frets, and reaches the summary.
- [x] Add failing Play-hub coverage for `/music/play/spider`.
- [x] Run the focused route tests and verify the missing route/link failures.
- [x] Implement setup controls for instrument, tuning, string, starting fret, and tempo.
- [x] Render target/current fret states through the existing `FretboardInput`.
- [x] Record the completed drill through the shared runtime and expose repeat/cancel actions.
- [x] Add Play hub and desktop sidebar links.
- [x] Run the focused route tests and verify they pass.

### Task 4: Documentation And Verification

**Files:**
- Modify: `IMPLEMENTATION_PLAN.md`
- Modify: `docs/music-practice-lab-handoff.md`
- Modify: `src/routes/music/AGENTS.md`

- [x] Mark the guitar/ukulele spider slice complete and retain the remaining §5D technique backlog.
- [x] Add route, engine, scoring, and manual MIDI verification notes to the handoff.
- [x] Document the new route/exercise/session interface in Music AGENTS guidance.
- [x] Run `vp run -r check`.
- [x] Run `vp test --run`.
- [x] Run `vp run -r build`.
- [x] Run the relevant Playwright Music flow.
- [x] Run both domain validation scripts.
- [x] Run `git diff --check`.

