# MusicXML and OSMD Song Studio Implementation Plan

**Status:** Completed on `ge/music-practice-lab`; verification recorded in
`docs/music-practice-lab-handoff.md`.

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Import uncompressed MusicXML into the canonical score model and render its original notation lazily with OSMD in Song Studio.

**Architecture:** `score-import` owns a DOM-based MusicXML-to-`Score` parser. `SongLibrary` persists the canonical score plus optional original MusicXML, while a shared Svelte renderer lazy-loads OSMD only for MusicXML-backed songs. MIDI and generated scores continue through VexFlow.

**Tech Stack:** TypeScript, MusicXML 4.0, OpenSheetMusicDisplay 2.x, Svelte 5, Dexie, Vitest/VitePlus, Playwright.

## Global Constraints

- Support uncompressed `.musicxml` and `.xml` only in this slice.
- Keep OSMD out of `packages/music-core`; core engines must remain framework-agnostic.
- Playback and score following consume canonical `Score`, never OSMD internals.
- Preserve existing MIDI import and VexFlow behavior.
- Do not add a Music database migration; source XML is a non-indexed `SongRow` field.
- Lazy-load OSMD only for MusicXML-backed Song Studio routes.

---

### Task 1: MusicXML Canonical Parser

**Files:**
- Create: `packages/music-core/src/engines/score-import/musicxml.ts`
- Modify: `packages/music-core/src/engines/score-import/index.ts`
- Modify: `packages/music-core/src/engines/score-import/score-import.test.ts`

**Interfaces:**
- Produces: `parseMusicXmlScore(xml: string, options: ParseMusicXmlScoreOptions): Score`
- Produces: `ParseMusicXmlScoreOptions { id: string; fallbackName?: string }`

- [ ] Write failing parser tests for part names, notes, chord onsets, rests,
  backup/forward voices, tempo, time signature, key, harmony, lyrics, malformed
  XML, and unsupported roots.
- [ ] Run `vp test packages/music-core/src/engines/score-import/score-import.test.ts --run`
  and confirm failures are caused by the missing parser.
- [ ] Implement a `DOMParser`-based `score-partwise` parser with divisions-based
  beat timing and explicit error messages.
- [ ] Re-run the focused test and `vp run @repo/music-core#check`.

### Task 2: Persist Canonical Score Source

**Files:**
- Modify: `packages/music-core/src/engines/store/index.ts`
- Modify: `packages/music-core/src/engines/song-library/index.ts`
- Modify: `packages/music-core/src/engines/song-library/song-library.test.ts`

**Interfaces:**
- Produces: `SongSource = { format: "musicxml"; content: string }`
- Produces: `SongLibrary.saveScore(score: Score, source?: SongSource): Promise<SongRow>`

- [ ] Write a failing test that saves a MusicXML score and reopens the exact
  source text.
- [ ] Implement the optional non-indexed source field and `saveScore`.
- [ ] Delegate existing `saveImportedSong` persistence through `saveScore`.
- [ ] Run focused song-library and store tests.

### Task 3: MusicXML Import Route

**Files:**
- Modify: `src/routes/music/import/+page.svelte`
- Modify: `src/routes/music/import/page.svelte.test.ts`

**Interfaces:**
- Consumes: `parseMusicXmlScore`, `SongLibrary.saveScore`

- [ ] Write a failing component test that selects a `.musicxml` file, sees its
  canonical summary, and saves the score with original XML.
- [ ] Add a typed MIDI/MusicXML import-state union and extend the file accept
  list.
- [ ] Keep piano-roll projection MIDI-only and show a MusicXML-specific preview
  message before saving.
- [ ] Run import route tests and existing MIDI regression coverage.

### Task 4: Lazy OSMD Renderer

**Files:**
- Create: `src/routes/music/_components/MusicXmlScore.svelte`
- Create: `src/routes/music/_components/MusicXmlScore.svelte.test.ts`
- Modify: `package.json`
- Modify: `pnpm-lock.yaml`

**Interfaces:**
- Produces: `MusicXmlScore` props `{ xml: string; onError?: (message: string) => void }`

- [ ] Install `opensheetmusicdisplay@^2.0.0`.
- [ ] Write a failing browser component test that expects an accessible host and
  rendered SVG from a minimal MusicXML fixture.
- [ ] Implement an on-mount dynamic import, `load(xml)`, `render()`, teardown,
  loading state, and error callback.
- [ ] Run component tests and workspace checks.

### Task 5: Song Studio Renderer Selection

**Files:**
- Modify: `src/routes/music/songs/[id]/+page.svelte`
- Modify: `src/routes/music/songs/[id]/page.svelte.test.ts`
- Modify: `src/routes/music/songs/+page.svelte`

**Interfaces:**
- Consumes: `SongRow.source`, `MusicXmlScore`, existing `StaffNotation`

- [ ] Write failing tests that MusicXML source selects OSMD while MIDI source
  retains VexFlow.
- [ ] Render `MusicXmlScore` only for MusicXML source and preserve canonical
  playback/follow-along controls.
- [ ] Surface renderer errors without disabling practice.
- [ ] Run Song Library and Song Studio component tests.

### Task 6: End-To-End And Documentation

**Files:**
- Modify: `e2e/music-import.spec.ts`
- Modify: `IMPLEMENTATION_PLAN.md`
- Modify: `docs/music-practice-lab-handoff.md`
- Modify: `src/routes/music/AGENTS.md`

- [ ] Extend Playwright with MusicXML import → save → Song Studio → visible OSMD
  SVG → follow-along completion → 375px overflow coverage.
- [ ] Run `vp run -r check`, `vp test --run`, domain validation, pipeline trace,
  `vp run -r build`, and the focused Playwright spec sequentially.
- [ ] Update milestone status, renderer rules, deferred `.mxl`, and verification
  results.
- [ ] Commit only Music feature files; leave unrelated root deletions and tool
  directories untouched.
