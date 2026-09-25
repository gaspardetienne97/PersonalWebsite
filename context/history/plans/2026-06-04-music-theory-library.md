# Music Theory Library Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the T1.5 searchable chord and scale library at `/music/learn` with theory projections, SVGuitar diagrams, audio playback, and persisted saved chords.

**Architecture:** A new framework-independent `@repo/music-core/engines/library` module owns catalog projections, search, voicings, and persistence. Route-local Svelte components render piano and string-instrument views while the page coordinates shared UI controls, `PracticeStore`, and `MusicRuntime`.

**Tech Stack:** TypeScript, Svelte 5 runes, SvelteKit, VitePlus/Vitest browser tests, Dexie, Tonal, SVGuitar, Tailwind CSS 4, `@repo/ui`

---

### Task 1: Theory Catalog And Persistence Engine

**Files:**
- Create: `packages/music-core/src/engines/library/index.ts`
- Create: `packages/music-core/src/engines/library/library.test.ts`
- Modify: `packages/music-core/package.json`

- [ ] **Step 1: Write the failing catalog projection and search tests**

Add tests that construct `TheoryLibrary`, assert `get("c-maj7")` returns notes `["C", "E", "G", "B"]`, intervals `["P1", "M3", "P5", "M7"]`, piano MIDI `[60, 64, 67, 71]`, and at least one guitar and ukulele voicing. Assert `search("major seven", "chord")` finds Cmaj7 and scale filtering excludes it.

- [ ] **Step 2: Run the focused test and verify red**

Run: `vp test packages/music-core/src/engines/library/library.test.ts --run`

Expected: FAIL because `@repo/music-core/engines/library` does not exist.

- [ ] **Step 3: Implement the catalog and projections**

Create stable `TheoryCatalogItem`, `TheoryLibraryItem`, and `StringVoicing` types. Define a small curated chord and scale source catalog, derive notes with `chordNotes`/`scaleNotes`, derive intervals with `intervalBetween`, and place notes into a middle-register MIDI projection.

- [ ] **Step 4: Run the focused test and verify green**

Run: `vp test packages/music-core/src/engines/library/library.test.ts --run`

Expected: PASS.

- [ ] **Step 5: Write the failing saved-chord persistence test**

Use `fake-indexeddb` through the existing test setup and a uniquely named `PracticeDatabase`. Assert `save("c-maj7")`, a new library instance `load()`, and `remove("c-maj7")` update `isSaved` and persist the expected row.

- [ ] **Step 6: Implement persistence and export the engine**

Accept an optional `PracticeStore`, load existing rows, save projected chord rows, remove saved chords, and add `"./engines/library"` to `packages/music-core/package.json`.

- [ ] **Step 7: Run music-core tests**

Run: `vp test packages/music-core/src/engines/library/library.test.ts --run`

Expected: PASS.

### Task 2: Theory Visual Components

**Files:**
- Create: `src/routes/music/learn/_components/PianoKeyboard.svelte`
- Create: `src/routes/music/learn/_components/PianoKeyboard.svelte.test.ts`
- Create: `src/routes/music/learn/_components/ChordDiagram.svelte`
- Modify: `package.json`
- Modify: `pnpm-lock.yaml`

- [ ] **Step 1: Write the failing piano component test**

Render notes `["C", "E", "G", "B"]` and assert the keyboard exposes all twelve notes with C, E, G, and B marked as active.

- [ ] **Step 2: Run the focused component test and verify red**

Run: `vp test src/routes/music/learn/_components/PianoKeyboard.svelte.test.ts --run`

Expected: FAIL because the component does not exist.

- [ ] **Step 3: Implement the piano keyboard**

Render a responsive one-octave keyboard with semantic labels and shared theme-token classes. Mark active pitch classes with `aria-pressed="true"` and primary token styles.

- [ ] **Step 4: Add SVGuitar and implement the diagram wrapper**

Add `"svguitar": "catalog:"` to the web package dependencies. Implement a browser-only SVGuitar wrapper that redraws when its voicing changes and labels the generated diagram for assistive technology.

- [ ] **Step 5: Run the focused component test**

Run: `vp test src/routes/music/learn/_components/PianoKeyboard.svelte.test.ts --run`

Expected: PASS.

### Task 3: `/music/learn` Workflow

**Files:**
- Replace: `src/routes/music/learn/+page.svelte`
- Create: `src/routes/music/learn/page.svelte.test.ts`

- [ ] **Step 1: Write the failing route workflow test**

Render the route, assert Cmaj7 details appear by default, filter to scales and search for Dorian, select the result, then return to chords. Verify save and play controls call the library/runtime behavior through observable page state.

- [ ] **Step 2: Run the focused route test and verify red**

Run: `vp test src/routes/music/learn/page.svelte.test.ts --run`

Expected: FAIL because the route still renders the placeholder.

- [ ] **Step 3: Implement the route**

Instantiate `TheoryLibrary` with a browser-only `PracticeStore`, load saved state, and build the responsive search/results/detail workflow using `@repo/ui` components. Wire playback through `runtime.enableAudio()` and `runtime.sound.playChord()`. Render diagrams only for chord selections.

- [ ] **Step 4: Run focused route and engine tests**

Run: `vp test packages/music-core/src/engines/library/library.test.ts src/routes/music/learn --run`

Expected: PASS.

### Task 4: Verification And Commit

**Files:**
- Verify all T1.5 files above

- [ ] **Step 1: Run repository checks**

Run sequentially:

```bash
vp run -r check
vp test --run
vp run -r build
playwright test
```

Expected: all commands pass.

- [ ] **Step 2: Verify in the browser**

Open `/music/learn`, confirm responsive layout and theme inheritance, search/filter behavior, Cmaj7 guitar and ukulele diagrams, piano projection, playback after enabling audio, and saved-chord persistence after reload.

- [ ] **Step 3: Review and commit only T1.5 implementation files**

Do not stage excluded docs, local planning-file deletions, `.codex/`, or `AGENTS.md`.

```bash
git commit -m "feat(T1.5): add chord and theory library"
```

