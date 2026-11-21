# AGENTS.md

This file provides guidance for agents working on the Narrator app under
`src/routes/pdf/` and the related core package in `packages/pdf-core/`.

> The route lives at `/pdf` for historical reasons (it replaced an old PDF
> reader). The product is **"narrator"** — do not rename the route.

## Product Context

- Narrator is the `/pdf` route inside the personal website. It is not a separate
  root website and should not replace the personal homepage.
- The product is a **read-aloud reader**: upload a PDF, EPUB, or text file — or
  paste text — and have it read aloud with word-synced "karaoke" highlighting.
- It is **client-only**. There is no server, database, or auth for narrator.
  Everything (extraction, narration, library, settings, playback position) runs
  in the browser and persists to `localStorage`. The `/pdf` page sets
  `ssr = false` for this reason.
- The app was built from a Claude Design handoff ("text-narator") that was a
  *simulated* mock. It has since been made real: real file parsing and real
  text-to-speech. Do not reintroduce the mock pipeline, fake "upload banks", or
  canned narration text.
- One SvelteKit deployment serves `/`, `/music`, and `/pdf`. Do not split
  narrator into its own deployment.

## Core Decisions Already Made

- **Monorepo tool:** VitePlus workspace. Do not add Turborepo. Vite/Rolldown
  beta warnings are expected.
- **Domain in the package, UI in the route.** Framework-agnostic logic and the
  reactive stores live in `@repo/pdf-core`; Svelte components live in
  `src/routes/pdf/_components`. Mirror the `@repo/music-core` split.
- **Scoped design tokens.** Narrator ports the handoff's dark "Gaspard Etienne"
  design system as CSS variables prefixed `--n-*`, scoped under `.narrator` in
  `src/routes/pdf/narrator.css`. This is a deliberate exception to the site's
  shadcn theme: keep narrator's tokens prefixed and scoped so they never collide
  with `bg-background`/`text-foreground` etc. Do **not** wire narrator to the
  global site theme, and do not leak `--n-*` tokens outside `/pdf`.
- **Icons:** use `lucide-svelte/icons/<name>` (already a dependency). New
  narrator icons must be added to `optimizeDeps.include` in `vite.config.ts`
  (there is a "Narrator (/pdf) icons" block) to avoid dev-server reload churn.
- **Two TTS engines, system is the default.** See "TTS engines" below. The
  default must stay the instant OS voice; the neural voice is opt-in.
- **Realistic content only.** Sample library documents are public-domain texts
  in `domain/data.ts`. Uploaded files are parsed for real.

## Architecture Map

### Route App (`src/routes/pdf/`)

- `+page.svelte` is the whole app shell: it owns the `NarratorLibrary` and
  `ReaderSettings` instances and switches between `LibraryView`, `ReaderView`,
  and the `AddDocumentModal`. The reader is keyed by `doc.id`.
- `+page.ts` sets `export const ssr = false`.
- `narrator.css` defines the `--n-*` tokens and keyframes (`n-spin`, `n-eq`,
  `n-pulse`) under `.narrator`.
- `_components/`:
  - `LibraryView.svelte` — app bar, search, continue-listening / add-first hero,
    document grid (`DocCard`), add tile, empty state.
  - `AddDocumentModal.svelte` — two tabs, "File" and "Paste text". The file tab
    takes PDF, EPUB and text files through one input and drag-drop, and the kind
    is detected (`kindForFile`). It also holds the extraction progress (steps,
    and "page 12 of 240" for a PDF) and the voice picker. A failed file offers
    pasting unless the error's `code` says there is no text to copy.
  - `ReaderView.svelte` — the reader shell with three layouts (immersive /
    audiobook / document), the Flow ↔ Document text toggle, the settings
    popover, and the audio player. Constructs the `NarrationPlayer` and disposes
    it in `onDestroy`. Syncs `settings.engine` / `settings.naturalVoice` into the
    player via `$effect`.
  - `PlayerBar.svelte` — transport, scrubber, speed/chapters/voice popovers, and
    the engine-aware voice list (system voices vs Kokoro voices). Shows model
    download progress and the fallback note.
  - `TextBody.svelte` (scrolling document karaoke) and `Teleprompter.svelte`
    (sentence-focused "flow" karaoke). Both highlight via the player's
    `wordIndex` / `sentenceIndex`.
  - `SettingsPanel.svelte` — the reader's settings in three tabs, one in view at
    a time: Text (size, line spacing and the reading face, Sans or Serif, saved
    as `settings.font`), Colour (accent, "Match each document") and "Voice and
    language" (engine, the link to the full Settings page, and the menus'
    language under its own heading). Each slider shows its value as a share of
    the default ("110%", from `shareOfDefault`) and a Reset button while it is
    not the default (`settings.isDefault(key)`, `settings.reset(key)`).
  - `Notice.svelte`: the one look for every error and status message. Every
    tone draws on the same neutral raised surface; the meaning is in the left
    rule and the icon: `tone` `"error"` is red and draws `role="alert"`,
    `"warn"` is amber, for "fell back and still works", `"info"` is blue (both
    draw `role="status"`). So a primary button never sits on a red panel.
    `variant` is `"block"`, a card inside the page, or `"line"`, one 48 px row
    on the edge of something else whose sentence cuts with an ellipsis (the
    whole sentence is in its tooltip and for screen readers). `short` (line
    only) is a shorter sentence shown under 480 px. `title`, `actions`
    (`{ label, onclick, primary? }[]`: the one primary is a `Btn`, the others
    are 44 px outlined buttons), `ondismiss` (draws a close button; the caller
    removes the notice) and the body as children. Use it instead of a bare
    error paragraph. One notice per cause: a failure that shares a cause with
    a notice already shown adds its sentence to that notice. The reader's
    notices (resume, the jump notice with "Back to", fallback) are line
    notices above the dock; the library's Undo is a line notice in a bar on
    the bottom edge.
  - Presentational primitives: `Cover` (the generated cover carries the title
    and author, in one of `COVER_HUES` hues from `coverHue(title)`),
    `Equalizer`, `Pill`, `Btn`, `ChapterList`.

### Core Package (`packages/pdf-core/`)

Route code imports public exports from `@repo/pdf-core/...`; do not reach
through private file paths when an export exists. Current export map:

- `@repo/pdf-core` — barrel (re-exports domain + the stores/services below).
- `@repo/pdf-core/domain` — `src/domain/`: framework-agnostic types and the
  narration timeline.
  - `types.ts` — `NarratorDoc`, `NarratorChapter`, `WordToken`, `SentenceSpan`,
    `ChapterSpan`, `NarrationModel`, `DocKind`.
  - `model.ts` — `buildModel(doc)` tokenizes a document onto a virtual 1× word
    timeline (ms); `fmt(ms)` (also exported as `fmtClock`, `m:ss` or
    `h:mm:ss`), `wordIndexAt(model, pos)` and `sentenceAt(model, pos)` (the
    sentence being read at a position) are pure helpers.
    `fmtLong(ms)` writes a length of time in words through messages ("3 min",
    "1 h 4 min"): use it wherever "3:40" could be read as minutes or hours.
    `chapterHeading(model, ci)` gives the words of a chapter's opening heading
    when they repeat its title, so Flow shows them as a title and not as a
    sentence. Unit-tested in `model.test.ts`.
  - `data.ts` — `SAMPLE_DOCS` (public-domain seed library), and what a card or
    the reader says about a document: `isSample`, `sampleGenre`, `kindLabel`,
    `formatLabel`, `byline` and `authorName(doc)`. The extractors store the
    format's name as `doc.author` when a file names no author, so show
    `authorName(doc)`, never `doc.author`. `byline(doc)` is the line under a
    card's title: the author, with a sample's genre, and empty when the document
    names no author. `lengthLine(total, progress)` says a document's length once
    ("4 min", then "1 min left of 4 min"), and `leftLine` the continue card's
    "2 min left". `listenTime(ms)` says a short text's time in seconds under a
    minute ("about 15 s"). `coverHue(title)` picks one of `COVER_HUES` cover
    hues from the title. `suggestTitle(text)` is the title pasted text gets:
    its first six words, cut on a word. `matchesQuery` and `markMatches`
    are the library search and the marks on what matched.
- `@repo/pdf-core/services/extract` — `src/services/extract/`: real File →
  `NarratorDoc`. `extractFile()` dispatches by kind to `pdf.ts` (pdf.js),
  `epub.ts` (JSZip + spine walk), or `txt.ts` (txt/markdown). `extractPaste()`
  handles pasted text. `normalize.ts` holds pure cleanup
  (hyphenation join, paragraph/heading splitting) — unit-tested. An
  `ExtractError` carries a message written for the listener and an optional
  `code` (`"pdf-no-text"` for a scan, `"pdf-locked"`). The progress callback's
  second argument is `{ page, pages }` while a PDF's pages are read.
- `@repo/pdf-core/services/tts` — `src/services/tts/`: Web Speech helpers
  (`getSynth`, `resolveVoice`, `speechAvailable`) and the Kokoro neural engine
  (`kokoro.ts`: `loadKokoro`, `synthesize`, `KOKORO_VOICES`, `mapAudioToPos`).
  For the settings page: `kokoroStatus(quality)` (`"idle"`, `"loading"` or
  `"ready"`), `kokoroDownloadMb(quality)` (the download's size for the device
  in use: the model file's real size, and the loader's own total once
  `noteDownloadBytes` has recorded it, so every size on the page agrees) and
  `downloadTracker()` (turns the loader's progress events into one running
  total). Pure parts unit-tested in `kokoro.test.ts`.
- `@repo/pdf-core/stores/narration` — `NarrationPlayer` (`*.svelte.ts`): the
  dual-engine playhead. See below. `seekSentence(pos)` moves to the start of
  the sentence at a position and `replaySentence()` says the current one again.
- `@repo/pdf-core/stores/library` — `NarratorLibrary`: the document list +
  per-doc live progress, persisted to `localStorage`. `startOver(id)` forgets
  where listening stopped.
- `@repo/pdf-core/stores/settings` — `ReaderSettings`: persisted reader prefs
  (`engine`, `naturalVoice`, layout, highlight, font (`"sans"` or `"serif"`),
  fontSize, lineHeight, accent, accentAuto), with `isDefault(key)` and
  `reset(key)`. `shareOfDefault(key, value)` is a slider's value as a share
  of its default.
- `@repo/pdf-core/stores/voices` — `VoiceCatalog` / `voiceCatalog`: reactive
  list of the system's Web Speech voices.

If you add a new service or store, update `packages/pdf-core/package.json`
exports and the barrel, and add focused tests.

### TTS engines

`NarrationPlayer` drives one virtual word timeline (from `buildModel`) with two
interchangeable engines, selected by `engineMode`:

- **`system`** (default) — the OS **Web Speech API**. Speaks sentence by
  sentence; `onboundary` word events snap the playhead, an rAF loop glides
  between them.
- **`natural`** — **Kokoro-82M** neural TTS in the browser via `kokoro-js` +
  `@huggingface/transformers` (WebGPU, WASM fallback). Each sentence is
  synthesized to a WAV blob, played through an `<audio>` element; the rAF loop
  maps `audio.currentTime` onto the sentence's word span (`mapAudioToPos`), so
  the highlight tracks the real voice. The next sentence is prefetched.

Both degrade gracefully: a watchdog detects a silent Web Speech engine, and any
natural-engine failure (no WebGPU/WASM, blocked/failed model download, synthesis
error) calls the internal fallback → reverts to `system` and sets
`usingFallback` for the UI. **Never let a TTS failure dead-end playback.**

The heavy neural runtime is **lazily imported** (`await import("kokoro-js")`
inside `kokoro.ts`) so it never enters SSR or the default path, and is grouped
into one named lazy chunk via `build.rollupOptions.output.advancedChunks`
(`name: "kokoro-tts"`) in `vite.config.ts`. Because that chunk exceeds the
default Workbox precache size and the `/music` PWA can't name-exclude a
hash-named client chunk, `pwa.config.ts` raises `maximumFileSizeToCacheInBytes`.
Keep these two settings together if you touch either.

## Development Rules

### Test First

- For new behavior or bug fixes, prefer a failing test before production code.
- Pure/core logic (extraction normalize, timeline model, audio mapping, voice
  lists) belongs in `packages/pdf-core` unit tests first.
- Route render behavior belongs in colocated `.svelte.test.ts`.
- User workflows belong in `e2e/narrator.spec.ts`.

### Keep Logic Out of Svelte

- Parsing, timeline math, persistence, and engine orchestration live in
  `@repo/pdf-core`. Components orchestrate stores and render UI.
- Extract pure functions (like `mapAudioToPos`, `normalize` helpers) and test
  them directly rather than asserting through the DOM.

### Stores and Lifecycle

- Only `ReaderView` constructs a `NarrationPlayer`, and it must `dispose()` it in
  `onDestroy` (cancels rAF, stops speech/audio, revokes blob URLs, persists
  position). Always revoke object URLs you create.
- `+page.svelte` owns the single `NarratorLibrary` and `ReaderSettings`.
- Guard all `localStorage`/`speechSynthesis`/`navigator` access for the
  non-browser case (the stores already do — keep it that way).

### TTS / Audio

- `system` stays the default and the universal fallback. Do not make the neural
  voice load on page open or on first play without the user opting in via
  Settings → Voice → Natural.
- Keep the neural runtime behind a dynamic import and inside the `kokoro-tts`
  chunk. Do not import `kokoro-js` / `@huggingface/transformers` from any
  eagerly-loaded module.
- Word-boundary sync: `system` uses real `onboundary` events; `natural` derives
  position from audio time. Don't assume neural models emit word events.
- Surface long work: model download (`modelLoading`/`modelProgress`) and the
  fallback state (`usingFallback`) must remain visible in the player UI.

### UI and Theming

- Narrator uses its **own** scoped `--n-*` tokens, not `@repo/ui` / shadcn
  tokens. This is intentional and local to `/pdf`. Keep new styles on the
  `--n-*` tokens and inside `.narrator`-scoped component CSS.
- Do not pull `bg-background`/`text-foreground` or `@repo/ui` primitives into
  narrator components, and do not push `--n-*` tokens into the rest of the site.
- Match the existing radii, glass surfaces, and motion (`var(--n-ease-out)`,
  the `n-*` keyframes).
- Tokens to reach for before adding a colour: `--n-fg-2` and `--n-fg-3`
  (secondary and quiet text; the quiet one is for 14 px or more, and labels,
  chips and eyebrows use `--n-fg-2` at 12 px or more), `--n-fg-read` (reading
  text already read aloud), `--n-primary-veil` (laid over the brand gradient on
  the one primary button, `Btn`, so its white label keeps 4.5:1), `--n-warn`
  (amber, "fell back"; red stays for "failed"),
  `--n-on-accent` (text and icons on an accent fill), `--n-accent-app` (the one
  accent for progress and playing state unless "Match each document" is on; read
  it as `var(--n-accent, var(--n-accent-app))`), `--n-bar-bg` (the reader's top
  bar) and `--n-dock-h` (the height the player dock takes, set on the reader
  root from the dock's real size; the reading area ends there).
- `narrator.css` also owns the focus ring for buttons, links and sliders, and
  the current word's styles (`.word.current` with `underline`, `fill`, `glow`).
  Every style underlines the word, so colour is never the only mark.
- Never name a class `ring`. Tailwind has a `ring` utility, and it adds its own
  box shadow to the element.
- Keep desktop and mobile widths free of horizontal overflow; the reader is
  `position: fixed` chrome over a scrolling text area.
- Do not close a menu with a `position: fixed` backdrop. The player dock and the
  top bars have a `backdrop-filter`, which holds a fixed element inside them, so
  the backdrop never covers the page. `PlayerBar` and `ReaderView` close their
  menus from a `svelte:window` `onpointerdown` listener instead.
- Menus in the dock and the side panel open above the whole player, never from
  their chip: the chips sit under the transport and a menu must not cover Play.
- A document's short kind ("Novel", "PDF") comes from `kindLabel(doc)` in
  `domain/data.ts`, which translates the samples' kinds by id. Progress comes
  only from the saved playhead; documents carry no authored progress.

### Dependencies

- `pdf-core` owns `pdfjs-dist`, `jszip`, and `kokoro-js`. Add narrator deps to
  `packages/pdf-core/package.json`, not the root, and run `pnpm install`.
- pdf.js needs its worker; `pdf.ts` imports `pdfjs-dist/build/pdf.worker.min.mjs?url`
  (the `?url` ambient type is declared in `src/ambient.d.ts`). Do not reintroduce
  the old `static/pdfjs` copy.

## Extending the Narrator

1. Add/extend a unit test in `packages/pdf-core` for any parsing, timeline,
   persistence, or audio-mapping logic.
2. Implement the minimal core behavior and export it from `@repo/pdf-core`
   (update the package `exports` map + barrel).
3. Build/adjust the Svelte component under `_components` using `--n-*` tokens.
4. Add a colocated `.svelte.test.ts` if render behavior is non-trivial.
5. Add/extend `e2e/narrator.spec.ts` for user-facing flows.
6. Run the verification gates.

## Verification Gates

Run before claiming a narrator change is complete:

```bash
vp run -r check
vp test --run
vp run -r build
./node_modules/.bin/playwright test e2e/narrator.spec.ts e2e/route-apps.spec.ts
```

For focused work, run the smallest relevant package test first
(`vp test --run packages/pdf-core src/routes/pdf`), then the full gates before
commit.

### Browser Verification

- The neural engine cannot be fully exercised by unit tests (it needs a real
  browser, WebGPU/WASM, and a ~90 MB model download from Hugging Face). After
  TTS changes, verify in a real browser: the **system** voice must still speak
  by default, and toggling **Natural** must download the model, synthesize, and
  play real audio with the highlight tracking it (or fall back cleanly).
- The dev server runs on a pinned port in `.claude/launch.json` (`vp dev` does
  not honor the injected `PORT`). Stop temporary servers when done.

## Things Not To Do

- Do not rename or move the `/pdf` route, and do not move narrator to the site
  root or its own deployment.
- Do not reintroduce the simulated pipeline, fake upload banks, or canned
  narration content — uploads are parsed for real.
- Do not make the neural voice the default or load it eagerly; `system` is the
  default and fallback.
- Do not import the Kokoro/transformers runtime outside the lazy `kokoro-tts`
  chunk, and do not remove the paired `advancedChunks` + PWA precache-size
  settings.
- Do not wire narrator to the global shadcn theme or hardcode colors outside the
  `--n-*` tokens; do not leak `--n-*` tokens into the rest of the site.
- Do not add server DB tables, migrations, or auth for narrator — it is
  client-only.
- Do not re-add `static/pdfjs` or duplicate the pdf.js worker.
- Do not revert unrelated local docs, plans, `.codex`, `.superpowers`, or other
  user-owned files.
