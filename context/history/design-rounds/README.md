# Music App Redesign — Plan Set

A research-backed plan to make the Music app coherent: dissolve the arbitrary Learn/Play split, remove duplicate surfaces, and give the practice screens a distinctive-but-on-brand look. **Nothing here is implemented yet** — this is the plan to approve before any code changes.

## Documents

| # | Doc | What it is |
|---|---|---|
| 01 | [research.md](01-research.md) | How leading music apps structure IA + per-feature UX patterns, cited. The evidence base. |
| 02 | [information-architecture.md](02-information-architecture.md) | The new IA: 4 hubs, hub-by-hub specs, and a full old→new route map for every current feature. |
| 03 | [design-system.md](03-design-system.md) | Tokens (chrome vs stage vs instrument-hue vs practice-accent vs data), typography, components to build/add, and the proposed `music/AGENTS.md` theming-rule changes. |
| 04 | [refactor-plan.md](04-refactor-plan.md) | The phased implementation plan (P0 foundations → P3 polish), with files, effort, risk, and verification gates. |

Companion inputs: [music-app-feature-catalog.md](../music-app-feature-catalog.md), [music-app-feature-consolidation.md](../music-app-feature-consolidation.md).

## How this was produced

Per the design skills' methodology (design-audit, product-ux-research, frontend-design, bencium, ui/ux-pro-max, ui-typography, vercel web/composition, shadcn-svelte): loaded each skill's guidance → ran two web-research agents on music-app IA + per-feature UX → audited the live shell/nav/theme → surfaced the decisions and **grilled them with the user**. The resolved decisions below are the contract the rest of the docs build on.

## Resolved decisions (the contract)

### Information architecture
- **4 top-level hubs:** **Practice · Library · Create · Progress**, plus a **utilities drawer** (Connect · Tuner · Settings · Guide).
- **No Home.** `/music` lands on **Practice → Today**.
- **Split by intent, not content type** — the Learn/Play split is removed entirely. Same drills/engines, reframed.
- **Practice** has three tabs: **Today** (adaptive plan — Coach + Daily Routine folded in), **Drills** (filterable index by skill + instrument, with ⌘K), **Paths** (Guided curricula: Jazz Path + learning paths).
- **Progress** is purely retrospective (skill tree + journal + achievements).
- **Library** = Songs + one unified chord/scale **Reference** (Theory Library absorbs the Jazz "Chords & Scales" tab) + Import/Transcribe.
- **Create** = one editor with a **Beat-grid ⇄ Piano-roll** mode toggle, shared transport + sample kit, and **one** recording primitive; export MIDI/WAV.
- Individual drills keep their URLs but leave top-level nav; reached via Drills index, ⌘K, or Today.
- A slim persistent header chip shows **streak · XP · Level**. The old Home's instrument hub (MIDI list, on-screen keyboard, live log) moves to **Connect**. The interval "demo" is dropped.

### Visual direction
- **Chrome stays on the site theme** — neutral slate, light/dark, existing `@repo/ui` tokens. Same fonts. Sidebar, page background, primary buttons unchanged.
- **Practice canvas = an adaptive "stage"** surface: charcoal in dark mode, a soft neutral inset (not stark white) in light mode — reads as "the place you play" in both. New scoped `--stage-*` tokens.
- **Instrument hue = identity marker only** (badges, instrument switcher, "now playing", a thin active-instrument accent line). Not a six-hue rainbow across the UI.
- **One fixed practice accent** for canvas focus/target/progress (indigo in light / violet in dark, from the prototype).
- **Semantic data colors stay fixed** (`--success/--warn/--info/--destructive`, already in `app.css`) so "green = good" never collides with "amber = guitar."
- The `music/AGENTS.md` "inherit parent theme, never fork" rule is **updated** to permit the stage + instrument-hue + practice-accent system (see [03](03-design-system.md)).

### Scope & context
- **Aggressive consolidation:** also merge Piano Roll+Studio, unify the 3 recording paths, and remove the Home/Progress duplication. Plus engine dedup (chord-follower reuses chord-verification grading; one central Basic Pitch extractor).
- **Desktop-first, hardware-connected:** sidebar-led, denser dashboards, **⌘K command palette**, MIDI/Aerophone/MPC assumed. Mobile stays responsive (bottom-tab) but secondary.
- **All catalogued features are preserved.** This is reorganization + visual work, not feature removal. **One deliberate exception:** the Home screen's *interval-answer demo* (the "Answer P5 / Answer m6" widget) is a throwaway demo — not a catalogued feature — and it writes real mastery from fake input, so it is dropped, not relocated. Nothing in [music-app-feature-catalog.md](../music-app-feature-catalog.md) is removed.
