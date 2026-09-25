# Music Redesign — Progress Trail

A running log of completed milestones (a trail of the work), updated after each. Plan: [04-refactor-plan.md](04-refactor-plan.md). Branch: `feat/music-redesign`.

| Phase | Status | Commit | Date |
|---|---|---|---|
| P0 — Foundations | ✅ Done | `5763db0` | 2026-06-28 |
| P1a — IA shell (nav + hubs) | ✅ Done | `25ca86c` | 2026-06-28 |
| P1b — Header chip + ⌘K palette | ✅ Done | `d28f16d` | 2026-06-28 |
| P2.1 — Today = Coach + Routine | ✅ Done | `078260d` | 2026-06-28 |
| P2.2 — Tuner + Intonation + Drone | ✅ Done | `deace80` | 2026-06-28 |
| P2.3 — Library = Songs + Reference + Import | ✅ Done | `0560bc1` | 2026-06-29 |
| P2.6 — Create = Studio + Piano Roll + Recorder | ✅ Done | `5dd9d42` | 2026-06-29 |
| P2.7 — Instrument hub → Connect | ✅ Done | `d44643f` | 2026-06-29 |
| P2.8 — Primitive dedup & dead-code removal | ✅ Done | `5053d27` | 2026-06-29 |
| P3.1 — Visualizers on the practice stage | ✅ Done | `04876d7` | 2026-06-29 |
| P3.2 — Practice-accent on target highlights | ✅ Done | `b8a37e3` | 2026-06-29 |
| P3.3 — Semantic data colors on meters | ✅ Done | `d5680aa` | 2026-06-29 |
| P3.4a — Empty primitive + first empty/loading states | ✅ Done | `50aae82` | 2026-06-29 |
| P3.4b — sonner toast confirmations | ✅ Done | `7435940` | 2026-06-29 |
| P3.5 — Motion (reduced-motion-gated) | ✅ Done | `96adb60` | 2026-06-29 |
| P3.6 + P3.7 — Hierarchy verified + a11y targets | ✅ Done | `f4ae468` | 2026-06-29 |

**🎉 Redesign complete — P0 → P1 → P2 → P3 all shipped on `feat/music-redesign`.**

---

## Phase 0 — Foundations ✅ (`5763db0`)
Behavior-neutral scaffolding.
- **Tokens** (`src/app.css`): scoped practice-canvas palette — `--stage*`, `--practice-accent`, `--instr-*` (light+dark), registered in `@theme inline`, with `[data-instr=…]` variants.
- **Components**: `PracticeStage.svelte` (adaptive stage wrapper), `InstrumentSwitcher.svelte` (hue-as-identity switcher). Additive; consumed in later phases.
- **Engine dedup (E1)**: `chord-verification` now exports `coverageScore` + `EXTRA_TONE_PENALTY`; `chord-follower` imports them — removed the duplicated `0.25` magic number. Behavior-preserving.
- **`music/AGENTS.md`**: theming rules updated to permit the scoped stage/instrument-hue/practice-accent system.
- **Deferred within P0:** Basic Pitch centralization (E2) — crosses the route↔engine boundary, only browser-verifiable, kept isolated; aerophone breath helper (E4) — low priority.
- **Gates:** `check` 0 errors · 857/857 tests · build ✓ · `pipeline-trace` PASS (mastery 0.783, unchanged) · `validate` clean.

## Phase 1a — IA shell ✅ (`25ca86c`)
Replaces the incoherent Learn/Play nav (the core complaint).
- **`MusicNavigation`**: 4 intent hubs (**Practice · Library · Create · Progress**) + utilities (Connect · Tuner · Settings · Guide). New hub-owned active-state — a drill sub-route lights up its hub, not a 30-item dump. Mobile bottom-tab = the 4 hubs.
- **`/music` → Practice hub** (Today / Drills / Paths). Drills is a skill-filterable index over a shared **`musicCatalog.ts`** (one source of truth for drills/library/create/paths). Today links to the routine runner + coach.
- **New `library/` and `create/` hub pages** over existing routes (no 404s). `/music/learn` redirects to Practice; old Learn hub page + test removed; interval-demo dashboard retired.
- **Tests** updated to the new IA (nav hub-ownership, Practice hub render).
- **Verified**: browser (hubs render, drills filter, `/music/play/scales`→Practice active, `/music/songs`→Library active, redirect lands on `/music`, 0 console errors) + `check` 0 errors · 856/856 tests · build ✓.
- **Transitional notes** (land in later phases): stats chip not yet in the header (P1b); the old Home's instrument hub (on-screen keyboard + live MIDI log) is dropped until it moves to Connect (P2.7); `/music/play` still shows its own tool grid until Free Play is folded in.

## Phase 1b — Header chip + ⌘K palette ✅ (`d28f16d`)
- **`MusicTopBar`**: slim sticky bar with a **streak · XP · level** chip (read from `ProgressEngine`, refreshed via `afterNavigate`) + a ⌘K search trigger. Mounted in `+layout.svelte`.
- **`CommandPalette`** (⌘K / Ctrl-K): jumps to any drill, song, tool, or "Start today's plan". Built on `@repo/ui/dialog` + substring filtering + arrow/Enter keyboard nav over the shared `musicCatalog` — **no new dependency** (the shadcn-svelte CLI rejects the monorepo's `ui` alias `packages/ui/src`, so the heavy Command component was avoided in favor of a lean palette).
- **Verified**: browser (chip = streak 2 · XP 308 · Lv 2 from real data; ⌘K opens/filters/Enter→`/music/tuner`/closes; 0 console errors) + `check` 0 errors · 856 tests · build ✓.
- **Re-scoped:** folding the full Coach + Daily Routine plan into the Today tab moved to **P2.1** (Today already links to the working routine/coach pages, so nothing is broken).

## Phase 2.1 — Today = Coach + Daily Routine ✅ (`078260d`)
- **`TodayPlan`** folds the old Daily Routine runner and Practice Coach insights into Practice ▸ Today. The tab now builds the coach view from the skill graph / analytics / progress / sessions, shows "Why this plan", lists the ordered routine steps, and starts/resumes the shared `MusicRuntime` daily-routine session in place.
- **Retired routes:** `/music/coach` and `/music/routine` now redirect to `/music`; their old page components/tests were removed after redirect coverage landed.
- **Tests:** new `/music` coverage verifies the merged Today surface has adaptive coach signals + routine steps and no longer links out to Coach/Routine; route-load tests verify both retired routes redirect to `/music`.
- **Verified:** `vp run -r check` green with the two pre-existing `unicorn/no-new-array` warnings in unrelated music-core files; `vp test --run` 856/856; `vp run -r build` ✓; browser pass against adapter-node build (`/music` renders merged Today, Start routine advances to first drill, `/music/coach` + `/music/routine` return to `/music`, 0 console errors).

## Phase 2.2 — Tuner + Intonation + Drone ✅ (`deace80`)
- **`/music/tuner`** now owns the unified tool with **Tune / Intonation / Drone** tabs. The page keeps one shared `AudioPitchSource`, preserves the chromatic tuner, folds in the IntonationSession stats/pitch trace, and keeps drone tonic/timbre/level controls in the same surface.
- **Retired route:** `/music/intonation` now redirects to `/music/tuner`; the old page component is redirect-only.
- **Play hub cleanup:** removed the duplicate Intonation & Drone card so the hub exposes one consolidated Tuner entry instead of navigating through a redirect.
- **Tests:** new tuner page coverage verifies the three tabs and merged controls; route-load coverage verifies `/music/intonation` redirects to `/music/tuner`.
- **Verified:** `vp run -r check` green with the two pre-existing `unicorn/no-new-array` warnings in unrelated music-core files; `vp test --run` 858/858; `vp run -r build` ✓; browser pass against adapter-node build with service workers blocked (`/music/tuner` desktop+mobile tabs, no horizontal overflow, `/music/intonation` lands on `/music/tuner`, no page console errors). Raw service-worker-enabled smoke still logs the pre-existing `/music/sw.js` 404.

## Phase 2.3 — Library = Songs + Reference + Import ✅ (`0560bc1`)
- **`/music/library`** is now a tabbed shell with **Songs / Reference / Import**. It embeds the existing saved-song library, the chord/scale reference, score import, and transcription trainer rather than leaving Library as a four-card directory.
- **Reference consolidation:** the theory page title is now **Chord & Scale Reference**, and the Library reference tab adds the jazz chord-scale matches from the Jazz guide so generic theory and jazz chord-scale lookup live in one reference surface.
- **Retired routes:** `/music/songs`, `/music/import`, `/music/transcribe`, and `/music/learn/theory` have server redirects to the relevant Library tab. `/music/songs/[id]` remains the Song Studio detail route; `/music/transcribe/basic-pitch-model.json` remains the Basic Pitch model endpoint.
- **Links/catalog:** Library catalog entries, Play hub, Track recommendations, import/transcribe follow-up buttons, and song-detail back links now point to `/music/library?...` tabs instead of hitting retired routes.
- **Tests:** added Library shell coverage and redirect tests for all retired routes; updated affected page tests for the new reference label and Library tab links.
- **Verified:** `vp run -r check` green with the two pre-existing `unicorn/no-new-array` warnings in unrelated music-core files; affected route suite 30/30; `vp test --run` 863/863; `vp run -r build` ✓; `git diff --check` clean; browser pass against adapter-node build with service workers blocked (`/music/library` desktop+mobile tabs, `/music/songs` + `/music/import` + `/music/transcribe` + `/music/learn/theory` redirects, no page console errors).

## Phase 2.4 — Jazz voicings ref → drill preview ✅ (`0b624c6`)
- **Jazz tab consolidation:** `/music/learn/jazz` no longer renders the duplicate 12-key rootless ii-V-I piano grid. Its Voicings tab now links directly into the graded drill variants (major/minor/altered) and keeps only the advanced altered/upper-structure reference.
- **Drill-owned preview:** `/music/play/voicings` now shows the engine-backed 12-key drill preview before starting, tied to the same variant/start-position state used by the graded run. Query links can seed `?variant=major|minor|altered`.
- **Shared shell fix:** `PracticeScreenHeader` constrains wide controls on mobile so segmented controls scroll inside the content width instead of creating page-level horizontal overflow.
- **Tests:** updated Jazz route coverage for the launcher/no-duplicate-grid behavior and added Voicing Drill preview coverage.
- **Verified:** focused Jazz+Voicing suite 5/5; `vp run -r check` green with the two pre-existing `unicorn/no-new-array` warnings in unrelated music-core files; `vp test --run` 869/869; `vp run -r build` ✓; `git diff --check` clean; browser pass against adapter-node build with service workers blocked (`/music/learn/jazz` Voicings tab + `/music/play/voicings?variant=minor` desktop/mobile, altered switching, no page console errors, no horizontal overflow).

## Phase 2.5 — Aerophone learn + articulation → one ✅ (`4673d46`)
- **Unified Aerophone technique:** `/music/learn/aerophone` now owns **Long tone / Dynamic swell / Articulation** modes in one surface, sharing the selected fingering target and the existing `TechniqueSession`.
- **Articulation merge:** the staccato/legato drill now runs inside the Aerophone page with style + tempo controls, on-screen fallback, CC2/note-length scoring, XP/mastery capture, and journal recording preserved.
- **Retired route:** `/music/play/articulation` is now redirect-only to `/music/learn/aerophone?mode=articulation`; the duplicate page body was removed.
- **Links/catalog:** Play hub and shared drill catalog now point Aerophone Articulation directly to the unified mode; Music route guidance was updated to keep new Aerophone technique work in one place.
- **Tests:** expanded Aerophone page coverage for the merged articulation mode and added redirect coverage for the retired route.
- **Verified:** focused Aerophone+redirect suite 3/3; `vp run -r check` green with the two pre-existing `unicorn/no-new-array` warnings in unrelated music-core files; `vp test --run` 870/870; `vp run -r build` ✓; `git diff --check` clean; browser pass against adapter-node build with service workers blocked (`/music/learn/aerophone?mode=articulation` desktop/mobile mode switching, `/music/play/articulation` redirect, Play hub link, no page console errors, no horizontal overflow).

## Phase 2.6 — Create = Studio + Piano Roll + Recorder ✅ (`5dd9d42`)
- **`/music/create`** is now the real Create workspace with **Beat grid / Piano roll / Recorder** modes instead of a card directory.
- **Editor consolidation:** the existing Studio step sequencer, Piano Roll editor, and Recording/self-review surface were moved into Create-owned panels, preserving their transport registration, local persistence, MIDI/WAV exports, sample-kit/MPC export hooks, take comparison, and audio-take review panel.
- **Retired routes:** `/music/studio`, `/music/piano-roll`, and `/music/recording` now redirect to the matching Create mode.
- **Links/catalog:** Create catalog entries and command-palette targets now point directly to `/music/create?mode=…`.
- **Tests:** added Create shell coverage, panel coverage for the moved Studio/Piano Roll/Recorder surfaces, and redirect tests for all retired routes.
- **Verified:** `vp run -r check` green with the two pre-existing `unicorn/no-new-array` warnings in unrelated music-core files; focused Create suite 30/30; `vp test --run` 868/868; `vp run -r build` ✓; `git diff --check` clean; browser pass against adapter-node build with service workers blocked (`/music/create` desktop+mobile mode switching, `/music/studio` + `/music/piano-roll` + `/music/recording` redirects, no page console errors, no horizontal overflow).

## Phase 2.7 — Instrument hub → Connect ✅ (`d44643f`)
- **Already absorbed:** Connect held MIDI enable, the device list, the on-screen surface, and per-instrument source after P1a. Header stats (P1b) + the Progress dashboard already carry the old Home's stats — so "fold leftover stats into HeaderStats + Progress" needed no work.
- **One dropped piece restored:** a **Live activity** section on Connect that subscribes to `runtime.midi.subscribe` and shows the last 10 events, with a "waiting for a MIDI message" empty state (also seeds the P3.4 Connect empty-state checklist).
- **Verified:** `check` 0 errors · 870 tests · build ✓ · browser (Live activity renders the enable-MIDI empty state, 0 console errors).

## Phase 2.8 — Primitive dedup & dead-code removal ✅ (`5053d27`)
- **Card "merge" was a deletion:** `PracticeActionCard` had **zero** usages (old Home gone), so it + its test were removed; `MusicToolCard` is the surviving drill card.
- **Dead transport buttons removed:** the non-wired Previous / Next / Repeat buttons (and `SkipBack`/`SkipForward`/`Repeat` imports) are gone from `MusicTransportBar`; only the wired Play/Pause remains.
- **Eyebrow → one class:** extracted the copy-pasted `text-[10px] font-bold uppercase tracking-widest text-muted-foreground` into `@utility eyebrow` (`app.css`) and adopted it across 13 files.
- **Deferred (deliberate, ponytail):** raw `<select>`→bits-ui `Select` (15 files — native `<select>` is accessible + mobile-friendly; a popover swap is high-churn, low-value) and `SegmentedControl`→`ToggleGroup` wrapper (the 45-line control already works and is tested; wrapping over bits-ui adds indirection + risks its `aria-pressed` a11y contract for a consistency-only gain). Stat-tile→`HudTile` left as cosmetic. Revisit only if the consistency matters later.
- **Verified:** `check` 0 errors · 869 tests · build ✓ · browser (`.eyebrow` computes 10px/700/uppercase/1px-tracking; no Previous/Next/Repeat buttons; Play/metronome intact; 0 console errors).

## Phase 3.1 — Visualizers on the practice stage ✅ (`04876d7`)
- **`PracticeStage` (created in P0, zero usages) is now wired up.** The interactive visualizers render on the adaptive instrument-panel surface (charcoal dark / soft-neutral inset light) instead of generic cards.
- **Tuner** "Tune" + "Intonation" gauges sit on a `PracticeStage`.
- **`InstrumentView` + `InputSurface`** wrap their rendered visualizer in `PracticeStage` internally — so every call site (theory / scales / voicings / jazz, connect / play / ear-training) gets the stage + instrument hue (`data-instr`) from two edits instead of touching ~7 sites.
- **Validated:** stage look checked in both themes (light inset reads as intended — no `--stage` tuning needed); `check` 0 errors · 869 tests · build ✓ · browser (scales piano-on-stage, no overflow, 0 console errors). HUD numbers already carry `tabular-nums` (HudTile, tuner readouts, progress).

## Phase 3.2 — Practice-accent on target highlights ✅ (`b8a37e3`)
- The on-screen instruments' **target / active note highlights** now use the fixed `--practice-accent` token instead of generic `--primary`, so "play this" reads the same across every instrument and drill.
  - `PianoKeyboard` active keys → `bg-practice-accent` (it has a defined readable foreground, so the **layer-3/4 contrast guardrail holds** — the variable instrument hue would not).
  - `OnScreenKeyboard` vivid-press + highlight colors → `--practice-accent`.
  - `FretboardInput` target/active dots → `--practice-accent`; `correct` → `--success`, `wrong` → `--destructive` (semantic states made explicit, a head-start on P3.3).
- **Instrument hue** stays as *identity* (InstrumentSwitcher from P0 + stage `data-instr` panels from P3.1); **practice-accent** is reserved for *target*. `themeColor()` reads from root, so the fixed practice-accent resolves everywhere (the stage-scoped `--instr` could not).
- **Skipped** `InstrumentBadge` (zero usages — YAGNI).
- **Validated:** `check` 0 errors · 869 tests · build ✓ · browser (Cmaj7 tones render in practice-accent on the piano stage, 0 console errors).

## Phase 3.3 — Semantic data colors on meters ✅ (`d5680aa`)
- Tuner + timing meters were coloring the "off" state with the brand accent (`--primary`) — reads as decoration, not meaning. Now diverging meters use semantic tones: `CentsGauge`/`CentsMeter` + tuner cents-label → in-tune `success`, off-pitch (flat/sharp) `warn`; `TimingMeter` → pocket `success`, behind/ahead `warn`.
- Mastery rings were **already** semantic (`SkillRing` via `masteryTone`; `SkillTreeGraph` delegates). `ProgressRing` stays `--primary` (goal progress, not a mastery zone). FretboardInput correct→success/wrong→destructive landed in P3.2.
- **Validated:** `check` 0 · 869 tests · build ✓ · browser (warn utilities bg/text/stroke/fill resolve to amber).

## Phase 3.4a — Empty primitive + first empty/loading states ✅ (`50aae82`)
- **P0.2 prerequisite (partial):** added `@repo/ui/empty` — a lean `Empty` (icon snippet + title + description + action children, dashed centered panel), hand-written (shadcn CLI rejects the monorepo `ui` alias). `Skeleton` already existed; **`sonner` still to add (P3.4b).**
- **Adopted:** Connect "no MIDI inputs" card → `Empty` + Plug icon + Enable-MIDI action; Songs (Library ▸ Songs) empty repertoire → `Empty` + ListMusic + Import action, loading → 4 `Skeleton` rows.
- **Validated:** `check` 0 · 869 tests · build ✓ · browser (Connect dashed Empty panel renders, 0 console errors).

## Phase 3.4b — sonner toast confirmations ✅ (`7435940`)
- **Finished the P0.2 prerequisite:** added `svelte-sonner` (catalog) + `@repo/ui/sonner` (Toaster wrapper themed via `mode-watcher`, re-exports `toast()`). svelte-sonner ships raw `.svelte` files → added `ssr.noExternal: ["svelte-sonner"]` to `vite.config.ts` so Vite SSR-compiles it (Node otherwise chokes on the `.svelte` extension — was a 500 until this).
- **Toaster** mounted once in the music `+layout` (bottom-center, richColors).
- **Wired** `toast.success`/`toast.error` on Free Play save-to-journal + Studio/Piano Roll export-WAV and save-locally. Inline status strings kept for persistent state; the play page's shared `saveError`/retry card stays (persistent error+retry surface, not a transient confirmation).
- **Validated:** `check` 0 · 869 tests · build ✓ · browser (Export WAV fires the "Exported studio-pattern.wav" toast, Toaster mounts, 0 console errors).

## Phase 3.5 — Motion, reduced-motion-gated ✅ (`96adb60`)
- Global `@media (prefers-reduced-motion: reduce)` guard in `app.css` neutralizes every transition/animation at once (hover scales, ring-fill, Skeleton pulse) — the audit found zero guards before this.
- `reveal-up` entrance utility (fade + rise) as one orchestrated reveal per Practice view; auto-disabled by the guard, so no per-element gating. Music motion is all transition-based (no continuous keyframe gameplay anims), so the global guard is safe.
- **Validated:** `check` 0 · 869 tests · build ✓ · browser (reveal animates in no-preference; reduced-motion guard present in compiled CSS).

## Phase 3.6 + 3.7 — Hierarchy verified + a11y targets ✅ (`f4ae468`)
- **P3.6 hierarchy** was already satisfied — shared header on every page, old Home's competing CTAs gone, HUD numbers already `tabular-nums` (transport/HudTile/tuner/header chip). No code change needed.
- **P3.7 a11y:** bumped the always-visible icon-only transport targets (metronome, mute) 36px → 40px. Count-in chips desktop-only (excluded); strict-44px deferred on the dense desktop-first bar to avoid crowding. Focus rings already from the global `outline-ring` base; transport buttons already have `aria-label`/`aria-pressed`.
- **Validated:** targets measure 40×40; ⌘K opens/filters/Escape-closes; `check` 0 · 869 tests · build ✓ · 0 console errors.

---

## ✅ Redesign complete
**P0 → P1 → P2 → P3 all shipped on `feat/music-redesign`** (17 commits, `5763db0`…`f4ae468`). The Learn/Play incoherence is resolved (4 intent hubs), every duplicate surface is collapsed, the practice stage + instrument-hue + semantic-color system is live, and the empty/loading/error/toast/motion/a11y polish layer is in. Branch is local-only (not pushed); merge to `main` when ready.

**Incremental follow-ups (not blocking):** extend `Empty`/`Skeleton` to the rest of the P3.4 checklist (Journal, Import/Transcribe, Recorder take list, drills audio/device prompts); the two deliberate P2.8 deferrals (`<select>`→`Select`, `SegmentedControl`→`ToggleGroup`); strict-44px transport targets if mobile use grows.
- **P3.3** semantic data colors (mastery / tuner / timing) via the `semantic-color` engine.
- **P3.4** empty / loading / error states everywhere (`Empty` / `Skeleton` / `sonner` — needs the P0.2 add of those primitives to `@repo/ui` first).
- **P3.5** motion (reduced-motion-gated), **P3.6** hierarchy pass, **P3.7** a11y sweep (44px targets, focus rings, tooltips, contrast).
