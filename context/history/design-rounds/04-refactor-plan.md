# 04 — Refactor Plan

Phased so each phase is independently shippable and verifiable, and so structure lands before paint. **No code is written until you approve this.** Effort: S/M/L. Risk: Low/Med/High. Every phase ends on the project's gates: `vp run -r check`, `vp test --run`, `vp run -r build`, plus a browser pass.

> **Sequencing principle:** P0 adds the scaffolding with zero behavior change → P1 lands the new IA shell (the big visible win) → P2 does the consolidation merges one at a time → P3 is the visual/canvas/polish pass. You can pause cleanly at **phase boundaries** and have a coherent app. **Mid-phase, the app may be transitional** — some nav links retired before their target lands, a merge half-done. That's acceptable for this personal/local app (no public users), but don't read "independently shippable" as "every individual step is safe to ship": it means *phase boundaries* are the safe pause points.

### Current-state audit baseline (read before starting)
A read-only UI audit of the live tree confirmed the plan's sequencing. Key facts that shape the work:
- **Already solid — don't break:** all 35 pages use `PracticeScreen` + `PracticeScreenHeader` (the per-page header work is effectively done — P3.6 shrinks accordingly); `HudTile`/`SegmentedControl`/`SourceReadout` exist and are reused; semantic data tokens are defined and mode-tuned (`app.css:43-51,86-92`).
- **The 12 hardcoded hex values are defensible** — all are `themeColor()` fallbacks for third-party canvas libs (piano-chart, fretboard.js) or VexFlow SVG-stroke selectors (`OnScreenKeyboard.svelte:84-86`, `StaffNotation.svelte:128`). Not chrome violations; leave them.
- **Primitive gap — two distinct kinds.** Four primitives **already exist** in `@repo/ui` but have **zero** music-tree adoption — `ToggleGroup`, `Select`, `Skeleton`, `Tooltip` (these just need *adopting*). Two more **do not exist yet** and must be *added* — `Empty`, `sonner` — alongside `command` and `tabs` for the new IA. Resolving both kinds clears a cluster of consistency findings (see P0.2 add, P2.8/P3 adopt).
- **Confirmed pain:** Play group alone is 17 nav items (~30 total); desktop and mobile expose *different* IAs; the Home dashboard is a kitchen-sink demo (interval demo writes real mastery from fake input); two divergent drill-card components; raw `<select>` in 15 files; `SegmentedControl` hand-rolls what `ToggleGroup` provides; canvas visualizers read chrome tokens so the "stage" is visually indistinct (esp. dark mode).

---

## Phase 0 — Foundations (no behavior change)
Pure groundwork; nothing user-visible changes yet. Lowest risk, do first.

| Step | Work | Files | Effort/Risk |
|---|---|---|---|
| 0.1 | Add **stage / practice-accent / instrument-hue** tokens (light+dark) and register in `@theme inline` | `src/app.css` | S / Low |
| 0.2 | Add shadcn-svelte **command, tabs, empty, sonner** to `@repo/ui`; re-export. (`select`, `toggle-group`, `skeleton`, `tooltip` already exist but have **zero** music-tree adoption — adoption happens in P2.8/P3.) | `packages/ui/src/*`, `package.json` exports | S / Low |
| 0.3 | Build **`PracticeStage`** wrapper (stage tokens + `data-instr`) and **`InstrumentSwitcher`** (hues) | `src/routes/music/_components/` | M / Low |
| 0.4 | **Engine dedup** (from consolidation doc, invisible): `chord-follower` imports `chord-verification` grading; centralize Basic Pitch into one `engines/transcription` (or `engines/basic-pitch`) entry, remove the chord-perfect→transcribe-route import; shared aerophone breath-analysis helper | `packages/music-core/src/engines/{chord-follower,chord-verification,transcription}`, `exercises/aerophone-*` | M / Low |
| 0.5 | Update **`music/AGENTS.md`** theming rules per [03](03-design-system.md) | `src/routes/music/AGENTS.md` | S / Low |

**Gate:** all existing tests pass unchanged (engine dedup must not move any score); `vp test --run` green.

---

## Phase 1 — Information architecture (the big structural win)
Replace the shell. This is where the Learn/Play overlap dies. Highest visible impact; medium risk (touches routing + every page's home).

| Step | Work | Files | Effort/Risk |
|---|---|---|---|
| 1.1 | Rewrite **`MusicNavigation`**: 4 hubs (Practice/Library/Create/Progress) + utilities group; mobile bottom-tab = the 4 hubs; simplify active-state to prefix-per-hub | `_components/MusicNavigation.svelte` | M / Med |
| 1.2 | **`HeaderStats`** chip (streak·XP·level) + header search button; mount in layout | `_components/`, `+layout.svelte` | S / Low |
| 1.3 | **`CommandPalette`** (⌘K): index drills/songs/tools + "Start Today's plan" | `_components/CommandPalette.svelte`, `+layout.svelte` | M / Med |
| 1.4 | **Practice hub shell** with Today/Drills/Paths tabs; `/music` renders it (Today default) | `src/routes/music/+page.svelte`, new `_components/PracticeHub.svelte` | M / Med |
| 1.5 | **`DrillIndex`** (filter by skill + instrument) listing all existing drills; **Paths** view (move Jazz Path + learning-path cards) | `_components/DrillIndex.svelte`, `+page.svelte` | M / Med |
| 1.6 | **Redirects** for removed hubs: `/music/learn`→Practice/Drills, `/music/learn/*` drills keep URLs, `/music/coach` & `/music/routine`→Practice/Today, `/music/track`→`/music/progress` (Journal tab) | `+page.ts`/`+page.server.ts` redirects or `+layout` | S / Low |

**Gate:** every old route still reachable (direct URL or redirect); nav has no dead links; mobile + desktop nav both work at 375px and desktop; no horizontal overflow.

---

## Phase 2 — Consolidation merges
One merge per step, each independently verifiable. Medium risk (behavior-preserving UI merges). All engines already exist — this is UI assembly.

| Step | Merge | Approach | Effort/Risk |
|---|---|---|---|
| 2.1 | **Today = Coach + Routine** | Practice/Today renders `buildDailyRoutinePlan` runner + Coach insights panel; delete `/coach`, `/routine` pages (redirects from 1.6) | M / Med |
| 2.2 | **Tuner + Intonation + Drone** | One `/music/tuner` with tabs (Tune / Intonation / Drone); shared `AudioPitchSource` + `CentsMeter`; redirect `/intonation` | M / Med |
| 2.3 | **Library: Songs + Reference + Import** | `/music/library` shell; Reference absorbs Jazz "Chords & Scales" (one catalog); Import + Transcribe under one Import tab | M / Med |
| 2.4 | **Jazz voicings ref → drill preview** | Jazz "Voicings" content links into `/play/voicings`; reference becomes that drill's preview, not a parallel render | S / Low |
| 2.5 | **Aerophone: learn + articulation → one** | Single Aerophone-technique surface (fingering + long-tone + swell + articulation modes) | M / Med |
| 2.6 | **Create = Studio + Piano Roll + Recorder** | `/music/create` with Beat⇄Piano-roll mode toggle, shared transport/kit. **Stage the capture merge** (the consolidation doc recommends partial reuse first): (a) extract a shared recorder *primitive* — MIDI + optional audio take — and reuse it in Lab/Jam/Recording with parity verified against [feature-catalog](../music-app-feature-catalog.md); **then** (b) collapse the editor UIs. Don't merge all three capture UXs in one jump. Redirects from `/studio`,`/piano-roll`,`/recording` | L / **Med-High** |
| 2.7 | **Home/Progress dedup** | Home already gone (P1); fold its leftover stats into `HeaderStats` + Progress; instrument hub → Connect | S / Low |
| 2.8 | **Primitive adoption & component dedup** (from audit) | Collapse `MusicToolCard` + `PracticeActionCard` (`+page.svelte:341-372`) into one `Card.*`-composed drill card feeding `DrillIndex`; replace raw `<select>` (15 files, e.g. `play/+page.svelte:530-541`, `connect/+page.svelte`) with `Select`; make `SegmentedControl` (16 pages) a thin wrapper over `ToggleGroup`; standardize bespoke stat tiles (`+page.svelte:223-279`, `play/+page.svelte:547-560`) on `HudTile`; extract the copy-pasted `text-[10px] uppercase tracking-widest` eyebrow (~15 sites) into one token/class; remove the **dead, non-wired** transport buttons (SkipBack/SkipForward/Repeat, `MusicTransportBar.svelte:168-194`) | M / Low |

**Gate after each step:** the merged feature does everything both originals did (check against [feature-catalog](../music-app-feature-catalog.md)); the merged page's tests pass; browser-verify the key flow.

---

## Phase 3 — Canvas, visual pass & polish
The "make it appealing" layer, now that structure is stable. Per design-audit Phase 2/3.

| Step | Work | Effort/Risk |
|---|---|---|
| 3.1 | Wrap all instrument/sheet/gauge visualizers in **`PracticeStage`**; apply stage tokens + `data-instr`; tabular-nums on all HUD numbers | M / Low |
| 3.2 | Apply **practice-accent** to focus/target/progress; **instrument hue** to badge/switcher/now-playing/accent-line; verify the layer-3/4 guardrail | M / Low |
| 3.3 | **Semantic data colors** on mastery rings, tuner (in-tune/near/off), timing (early/on/late) via the `semantic-color` engine — no literals | S / Low |
| 3.4 | **Empty / loading / error states** everywhere — all currently bare status strings (audit: **zero** `Empty`/`Skeleton`/`sonner` usage). `Skeleton` for the ~18 `loading`-gated pages (`songs/+page.svelte:31-34`, `connect/+page.svelte:52`); `Empty` for "no songs" (`songs/+page.svelte:72`), "no devices" (`+page.svelte:416`), no-journal; `sonner` toasts for save/export/record confirmations + error recovery (replaces inline destructive cards like `play/+page.svelte:576-591`) | M / Low |
| 3.5 | **Motion**: count-in pulse, mastery-ring fill, falling-notes, ⌘K open — all `prefers-reduced-motion`-gated. Audit: **zero** motion guards today despite real transforms (`PracticeActionCard.svelte:23-24`, `MusicTransportBar.svelte:181` scale, `MusicToolCard.svelte:44`). One orchestrated reveal per screen | M / Med |
| 3.6 | **Hierarchy consistency** pass — *header pattern already adopted on all 35 pages*, so this is just: one clear primary action per screen (the dashboard's competing CTAs `+page.svelte:281-291` are gone with Home), spacing rhythm, tabular-nums coverage | S / Low |
| 3.7 | **A11y sweep**: 44px targets (transport metronome `size-9`/count-in chips `MusicTransportBar.svelte:100,155` are sub-44px and overlap the mobile tab region), focus rings, `Tooltip` on icon-only controls, contrast on stage + data colors in both themes, ⌘K keyboard nav | M / Med |

**P3.4 surface checklist** (every one needs empty + loading + error states, none have them today):
- **Songs** — empty "no saved songs" + import CTA; loading skeleton; load-failed retry.
- **Connect** — empty "no MIDI devices"/"waiting for a MIDI message"; Web-MIDI-unsupported + mic-fallback messaging; permission-denied state.
- **Journal** (Progress) — empty "no entries yet" + first-entry CTA; loading skeleton.
- **Import / Transcribe** — empty drop-zone; extraction progress; parse-failed / unsupported-file error.
- **Recorder / Create** — empty take list; recording/armed state; save/export toast + save-failed retry.
- **Drills** — empty filtered index ("no drills match"); audio-not-enabled and device-not-connected prompts.
- **Audio/device failures (cross-cutting)** — mic denied, AudioContext blocked, export failed — all via `sonner` with a recovery path.

**Gate:** reduced-motion + dark/light both verified; contrast AA on stage and data tokens; keyboard-only run through a full drill.

---

## Cross-cutting verification
- Run the project gates after every phase: `vp run -r check` · `vp test --run` · `vp run -r build`.
- Browser-verify with the preview tools (no console errors; key flow works) after P1, each P2 step, and P3.
- **Feature-preservation check:** before closing each merge, diff the merged surface's capabilities against [music-app-feature-catalog.md](../music-app-feature-catalog.md) — every listed feature must still be reachable and functional.
- Git: feature branch, one logical commit per step, merge to `main` locally (no push unless asked). Never commit to `main` directly.

## Risk register
| Risk | Mitigation |
|---|---|
| Merges silently drop a feature | Per-step feature-catalog diff gate |
| Engine dedup changes a score | P0 runs full test suite; scores are pinned by existing tests |
| Stage-dark-panel-on-light-page looks off | It's an intentional inset (mix per grill Q1); validate in browser at 3.1, tune `--stage` lightness if needed |
| ⌘K / command scope creep | P1.3 ships drills+songs+tools+Today only; no fuzzy NLP |
| Mobile regressions (desktop-first focus) | Gate every nav/layout step at 375px |
| Big-bang risk | Pause cleanly at **phase boundaries**; mid-phase transitional states are acceptable (personal/local app, no public users) but aren't per-step shippable |

## Suggested first slice
**Phase 0 in full + Phase 1.1–1.4** — adds tokens/components/engine-dedup invisibly, then lands the new 4-hub nav and the Practice/Today landing. That alone resolves the Learn/Play complaint and is shippable before any merges or repaint.
