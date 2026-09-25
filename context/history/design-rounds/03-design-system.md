# 03 — Design System

How the Music app looks after the redesign. **Chrome inherits the site theme unchanged; the practice canvas gets a scoped visual language.** All values are tokens — no hardcoded hex in components.

## Color architecture — four layers

| Layer | What it colors | Source | Light/dark |
|---|---|---|---|
| **1. Chrome** | sidebar, page bg, cards, primary buttons, text, borders | **Existing `app.css` tokens** (`--background`, `--card`, `--primary`, `--sidebar*`, slate/OKLCH) — **unchanged** | Follows site `.dark` |
| **2. Stage** | the interactive practice surface behind keyboard/fretboard/staff/sequencer/gauges | **New scoped `--stage-*` tokens** | Adaptive (charcoal dark / soft-neutral inset light) |
| **3. Instrument hue** | instrument badges, the instrument switcher, "now playing", a thin active-instrument accent line | **New `--instr-*`** (from prototype) | Same hue both modes, contrast-tuned |
| **4. Semantic data** | mastery up/down, in-tune/sharp/flat, correct/early/late/missed | **Existing `--success/--warn/--info/--destructive`** (already in `app.css`) | Already tuned per mode |

**The guardrail:** layers 3 and 4 never collide. Instrument hue is identity ("you're on guitar"); data color is judgment ("green = good"). A drill never uses an instrument hue to mean "correct."

### Layer 2 — the Stage (new tokens to add to `app.css`)
A distinct surface that reads as "the place you play" in both themes. Scope with `[data-surface="stage"]` (or a `.practice-stage` wrapper).

```css
:root {                 /* light: a soft neutral inset, NOT stark white */
  --stage:            oklch(0.94 0.006 256);
  --stage-2:          oklch(0.90 0.008 256);   /* raised cells, keys */
  --stage-foreground: oklch(0.20 0.03 264);
  --stage-muted:      oklch(0.50 0.02 258);
  --stage-line:       oklch(0.86 0.01 256);
  --practice-accent:  oklch(0.52 0.20 277);    /* indigo — focus/target/progress */
  --practice-accent-foreground: oklch(0.99 0 0);
}
.dark {                 /* dark: charcoal "instrument panel" */
  --stage:            oklch(0.20 0.02 265);
  --stage-2:          oklch(0.25 0.025 265);
  --stage-foreground: oklch(0.97 0.003 248);
  --stage-muted:      oklch(0.70 0.02 257);
  --stage-line:       oklch(0.30 0.03 265);
  --practice-accent:  oklch(0.62 0.20 290);    /* violet */
  --practice-accent-foreground: oklch(0.99 0 0);
}
```
Register in `@theme inline` as `--color-stage`, `--color-stage-2`, `--color-stage-foreground`, `--color-stage-line`, `--color-practice-accent`, etc., so Tailwind utilities (`bg-stage`, `text-stage-foreground`, `ring-practice-accent`) work.

### Layer 3 — instrument hues (port from the prototype)
```css
:root {
  --instr-piano:     oklch(0.55 0.20 277);  /* indigo  */
  --instr-guitar:    oklch(0.72 0.16 70);   /* amber   */
  --instr-ukulele:   oklch(0.70 0.12 185);  /* teal    */
  --instr-aerophone: oklch(0.58 0.20 300);  /* violet  */
  --instr-mpc:       oklch(0.63 0.22 12);   /* rose    */
  --instr-voice:     oklch(0.70 0.14 162);  /* emerald */
  --instr: var(--instr-piano);
}
[data-instr="guitar"]   { --instr: var(--instr-guitar); }
/* …one per instrument; set data-instr on the practice screen subtree */
```
Usage: `InstrumentBadge`, the switcher's active pill, a 2px accent line under the active-instrument header, the "now playing" dot. **Not** on the stage background, **not** on data feedback.

**Contrast guardrail (required).** Several of these hues (amber, teal, emerald, rose) fail AA as small text on the light stage. So instrument hues are used **only as dots, borders, fills, and tinted badge backgrounds — never as small text on `--stage`.** Where a hue must back text (a solid badge), pair it with a tested `--instr-*-foreground` token (white or near-black, chosen per hue) and verify ≥4.5:1 in **both** themes. Default badges use a tinted background (`hue / ~12%`) with `--stage-foreground` text rather than solid hue + colored text. The fixed `--practice-accent` (used for focus/progress) is the one hue allowed as an accent fill behind `--practice-accent-foreground`, and is contrast-checked in both modes.

> These are the prototype's exact hues (piano=indigo, guitar=amber, ukulele=teal, aerophone=violet, mpc=rose, voice=emerald), re-expressed in OKLCH to match `app.css`'s color space.

## Typography
**No new fonts** (decision: keep the site's). Practice screens get emphasis through:
- **Tabular numerals** (`font-variant-numeric: tabular-nums`) on every changing number — BPM, cents, timer, XP, accuracy, mastery % — so HUD values don't jitter (ui-typography `number-tabular`).
- A clear scale reuse: big "target/now-playing" value uses the existing display size + weight; labels are uppercase-letterspaced eyebrows (existing pattern in `MusicNavigation`).
- Butterick basics enforced in any new copy: curly quotes/apostrophes, en/em dashes, one space after punctuation, `&times;` for dimensions, no underlines for emphasis.

## Spacing, radius, motion
- Reuse existing `--radius*` and Tailwind 4px scale; no new spacing system.
- Motion: 120/200/320 ms, `ease-out`; **respect `prefers-reduced-motion`** (mastery rings, falling notes, count-in pulse all gate on it). One well-orchestrated reveal per screen, not scattered micro-animations.

## Component plan

### shadcn-svelte components to ADD to `@repo/ui` (not yet present)
Current `@repo/ui`: avatar, badge, button, card, carousel, dialog, dropdown-menu, input, label, popover, progress, scroll-area, select, separator, sheet, sidebar, skeleton, slider, toggle, toggle-group, tooltip.

| Add | For |
|---|---|
| **command** | ⌘K command palette (Command inside Dialog) |
| **tabs** | Practice (Today/Drills/Paths), Tuner, Create mode toggle, setup screens |
| **empty** | empty states (no songs, no journal entries, no devices) |
| **sonner** (toast) | save/export/record confirmations + error recovery |
| **breadcrumb** *(optional)* | deep Library/Song Studio orientation |

Install via `npx shadcn-svelte@latest add command tabs empty sonner` and re-export from `packages/ui/src`.

### Existing components to USE consistently (audit found bespoke markup)
- `Card.*` full composition (Header/Title/Description/Content/Footer) for every drill/info card — replace ad-hoc `MusicToolCard` divs where they diverge.
- `ToggleGroup` for all 2–7-option selectors (instrument switcher, mode toggles, articulation) — replaces the bespoke `SegmentedControl` over time, or keep `SegmentedControl` as the styled wrapper around `ToggleGroup`.
- `Badge` for status/tags; `Separator` not `<hr>`/border divs; `Skeleton` for loading; `Empty` for empty states; `Tooltip` for icon-only controls; `Sheet` for the mobile utilities drawer.

### New shared components to build
| Component | Role |
|---|---|
| **`PracticeStage`** | The `[data-surface="stage"]` wrapper that establishes stage tokens + `data-instr`. Every instrument/sheet/gauge visualizer renders inside it. The single place the canvas palette lives. |
| **`CommandPalette`** | ⌘K — searches drills, songs, tools; "Start Today's plan"; recent. |
| **`PracticeHub`** | Today/Drills/Paths tab shell. |
| **`TodayPlan`** | Adaptive plan list + Start runner + Coach insights panel (merges Coach + Routine UIs). |
| **`DrillIndex`** | Filterable (skill + instrument) drill grid. |
| **`InstrumentSwitcher`** | ToggleGroup with instrument hues; sets `data-instr` on the stage. |
| **`HeaderStats`** | streak · XP · level chip. |
| **`Tuner` (unified)** | Tuner + Intonation + Drone, tabbed. |
| **`CreateEditor`** | Beat ⇄ Piano-roll mode toggle + shared transport/kit/recorder. |

Keep the existing strong primitives: `MusicTransportBar`, `HudTile`, `ProgressRing`/`SkillRing`, `CentsMeter`/`CentsGauge`, `InstrumentView`, `StaffNotation`/`TabNotation`, `OnScreenKeyboard`, `MpcPadGrid`, `PitchTrace`, `TimingMeter` — they move *inside* `PracticeStage` and read stage tokens.

## Composition discipline (vercel-composition-patterns, adapted to Svelte)
- Prefer **explicit variant components + snippets/children** over boolean-prop proliferation. e.g. don't grow `MusicToolCard` with `isDrill`/`isPath`/`isSong` flags — compose with `Card.*` slots.
- Lift shared session state into the runtime/engine, not the page; pages stay thin (already the project rule).

---

## Proposed `src/routes/music/AGENTS.md` theming-rule changes

The current rules say *inherit the parent site theme, never fork a Music palette, never hardcode colors.* Update to:

> **Theming (updated).** The Music app's **chrome** (sidebar, page, cards, primary actions, text) inherits the site theme via `@repo/ui` tokens — unchanged. The Music app additionally defines a scoped **practice-canvas** palette, used **only inside `PracticeStage`**:
> - `--stage-*` — the adaptive instrument-panel surface (charcoal in dark, soft-neutral inset in light). Never used for chrome.
> - `--practice-accent` — the single focus/target/progress accent on the stage (indigo light / violet dark).
> - `--instr-*` / `data-instr` — instrument **identity** only (badge, switcher, now-playing, accent line). Never used to convey data/judgment.
> - `--success/--warn/--info/--destructive` — data/judgment only (mastery, tuner, timing). Never collide with instrument hue.
>
> Still forbidden: hardcoded hex in components, a second font family, restyling chrome per-page, or using stage tokens outside `PracticeStage`. Semantic data colors come from the `semantic-color` engine / tokens, not literals.

This keeps the "no hardcoded colors / tokens-only" discipline while permitting the deliberate canvas identity the redesign needs.
