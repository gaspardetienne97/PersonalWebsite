# Usability pass — make daily practice faster and stickier

The top three items from the UI/UX usability review (2026-07-03), each one shippable slice. Focus: reduce friction to *start* a drill, close the loop *after* a drill, and remove the mouse from answering.

| Step | What | How | Status |
|---|---|---|---|
| U1 | **Per-drill config persistence** — a drill remembers your last setup; plain visits restore it, URL params still win | Central, not 15 bespoke sweeps: `syncRouteQuery` already receives every drill's full normalized config in the href — persist `search` keyed by `pathname` (localStorage). New `initialDrillSearch()` returns explicit URL params when present, else the stored search. Pages swap `new URLSearchParams(window.location.search)` → `initialDrillSearch()`. `setTestUrl("/")` (every drill test's afterEach idiom) clears the storage prefix for test isolation. | ✅ |
| U2 | **Comparison-to-last-run in drill summaries** — "82% · +6% vs last run" | Small engine helper over the practice journal: latest prior session accuracy for the same drill tag(s); drill summaries append the delta when a prior run exists. Start with the drills whose summaries already show accuracy (rhythm, scales, voicings, licks, chord-scales). | ✅ |
| U3 | **QWERTY-as-piano input** — answer any keyboard drill without mouse/MIDI: A S D F G H J K = white keys, W E T Y U = black keys | A keyboard adapter on `OnScreenKeyboard`: window keydown/keyup → `router.noteOn/noteOff` mapped to the visible octave; ignores repeats and events targeting inputs/selects/textareas; hint line in the component. | ✅ |

**Second slice (2026-07-03, later):**

| Step | What | Status |
|---|---|---|
| U4 | **Brand unification** — sidebar said "Practice OS", 28 titles said "Musicianship OS". Unified on Practice OS everywhere; also modernized the stale music e2e specs (they asserted the pre-redesign home) — 6/6 e2e pass against the built app. | ✅ `7de49d5` |
| U5 | **Summary keyboard shortcuts** — `R` retries, `−` slows down, on every drill with an `AdaptiveRetryBar`; hint beside the buttons. Keys chosen OUTSIDE the QWERTY-piano map (S would play a D). | ✅ `7de49d5` |

| U6 | **"Next up" after non-routine drills** — one coach suggestion (weakest skill at its own drill) on the five comparison-enabled summaries; self-path filtered; silent while a routine owns "next". | ✅ `796c735` |
| U7 | **Space-to-start** on nine drill pages — completes the keyboard loop (Space start · QWERTY answer · R/− at summary). Guards: repeats, modifiers, focused buttons/links, form fields; licks/chord-scales gate on phase. | ✅ `4b9c259` |
| U8 | **Focus mode** — sidebar/topbar/site chrome disappear while a run is active (transport stays); returns on finish/cancel/unmount. `runtime.drillFocus` + renderless `DrillFocusScope` + `.drill-focus` html class. Also hardened chord-scales' inter-chord test sync. | ✅ `b85bae5` |

**Backlog (deliberately deferred):** collapsed setup cards + presets (post-U1 the marginal value is lower — configs are remembered and Space starts), first-run instrument/goal setup, instrument-hue tinting pass, transport slimming.

**Gates per step:** focused tests → `vp run -r check` · `vp test --run` · `vp run -r build`; browser-verify each (persistence round-trip, delta line, typing notes).

## Outcome (2026-07-03)

- **U1** `fade0ec` — drills remember your last setup (localStorage keyed by
  pathname inside `syncRouteQuery`; `initialDrillSearch()` at init; URL params
  win; `setTestUrl("/")` clears for test isolation). Browser-verified round
  trip on rhythm (triplets/104/8 restored + re-stamped into the URL).
- **U2** `aa1393a` — summaries on rhythm/scales/voicings/licks/chord-scales
  compare to the last run via `lastRunReference` + `meanPartialCredit`
  (engines/sessions) and the `LastRunDelta` component; page-visit-time cutoff
  keeps the baseline stable. Verified across two visits.
- **U3** `f86fbe5` — QWERTY-as-piano on `OnScreenKeyboard` (DAW mapping, anchored at the
  drill's lowest highlighted octave, repeat/shortcut/typing guards, hint line).
  Verified by typing a 100% D Dorian into the chord-scale drill.

Gates after U1–U3: check clean · 1061 tests · build ✓ · 0 console errors.
Gates after U4–U5: check clean · 1062 unit + 6 e2e · browser-verified.
Gates after U6: check clean · 1066 unit · build ✓ · browser-verified (suggestion renders on chord-scales, self-filter suppresses on rhythm).
Gates after U7: check clean · 1068 unit · build ✓ · browser-verified (Space starts the rhythm run).
Gates after U8: check clean · 1069 unit · build ✓ · browser-verified (full-bleed stage during runs, chrome returns at summary).
