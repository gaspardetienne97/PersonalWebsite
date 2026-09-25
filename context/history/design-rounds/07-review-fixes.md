# Review fixes — `fcdf74a` ("Expand music drill UX coverage")

Fix plan for the findings from the code review of `fcdf74a` (drill-depth expansion). One fix per step, each independently verified (focused tests → gates) and committed. Severity order.

| Step | Finding | Fix | Status |
|---|---|---|---|
| R1 | **M1** Contrary-motion two-hand pattern demands out-of-key notes (`scaleNote(topRoot, index, -1)` negates major-scale offsets → C5 B♭4 A♭4… instead of C5 B4 A4…) | Walk the major scale downward properly (descend the scale degrees, not negate semitone offsets). Add a note-sequence test for `contrary-motion-scale`. | ✅ |
| R2 | **M2** Gap-click drill is a label with no implementation (`clickSchedule` has zero consumers; default beats=4 → bars=1 kills the silent bar) | Wire the rhythm page to schedule audible clicks only for `clickSchedule` bars after count-in; make `RhythmSession` honor the pattern's `defaultBars` minimum. Test both. | ✅ |
| R3 | **M3** `manualChunks` is a silent no-op under rolldown — the named `kokoro-tts` client chunk is gone; pwa.config comment contract broken | Restore `advancedChunks` (keep the new `onLog` warning filters). Verify the named chunk exists in the client build output. | ✅ |
| R4 | **H1** Index/count-paired hit alignment cascades one miss into total misgrade (rhythm `scorableHits[index]` + fabricated `+999` error double-count; chord-change `played.slice(cursor…)` count-chunking) | Rhythm: nearest-unused-hit matching within a tolerance window; misses penalized once (no fabricated timing metrics). Chord-change: segment strums by time-gap clustering instead of note count. Update/extend tests incl. a one-missed-hit case. | ✅ |
| R5 | **H2** Dashboard weak-skill recommendations escalate to harder variants (weak chord-perfect → chord-changes, weak single-strokes → paradiddles) instead of remediating | Remove the weak-skill escalation substitution; recommend the weak skill itself at its own drill/deep-link. Keep the deep-link href routing. Update dashboard/daily-routine tests to assert remediation. | ✅ |
| R6 | **H3** "Change trainer" hardcodes `repetitions: 1` (2 chords total) and never surfaces `firstChangeLatencyMs` | Add a repetitions control (URL-normalized, engine already caps 8, default 4) and show change latency in the summary. | ✅ |
| R7 | **Med** URL-sync `$effect` reads `$page.state` (re-entrancy hazard) and stamps full default params on first visit | Shared `syncDrillQueryParams` helper in `route-state.ts`: no-op when the URL already matches, omit params at default values, don't track page state. Adopt in the drill pages that sync config. | ✅ |
| R8 | **Med** Cadence voicings tell on themselves (authentic resolves to Cmaj7 vs plagal's plain triad; half ends on V7) | Plain triads for resolution chords; half cadence ends on plain V. | ✅ |
| R9 | **Med** Interval landing locks to the *first* noteOn — a flubbed wind attack permanently misgrades the run | Grade the most recent note (player can correct the attack); keep breath-window scoring unchanged. | ✅ |
| R10 | **Med** Journal note says "Rhythm pulse · …" for every pattern; rhythm mode labels don't say what mode actually changes | Note string uses the pattern label; mode labels renamed to "From memory" / "Read & tap" (mode is display-only). | ✅ |
| R11 | **Med** `route-state.ts`/`test-url.ts` duplicate the console.warn suppression and string-match SvelteKit internals with no warning | Dedupe into one helper; comment the brittleness (tied to SvelteKit message text). | ✅ |
| R12 | **Med** pdf-core `check`/`build` downgraded to `tsc --noEmit` — `.svelte` files no longer type-checked | **Resolved as no-change:** pdf-core has no `.svelte` components (only `.svelte.ts` rune modules, which tsc types fine); svelte-check itself reports "No svelte input files were found". | ✅ |

**Explicitly deferred (polish backlog, not this pass):** new drill variations (dotted rhythms/syncopation/swing, string-crossing spiders, timed one-minute-changes, random-key cadences, descending interval landings, dynamics independence); jszip root-dep move review; mdsvex shiki highlighting.

**Gates per step:** focused tests → `vp run -r check` · `vp test --run` · `vp run -r build` before each commit claim; browser-verify UI-visible steps (R2, R6, R7, R10).

## Outcome (2026-07-03)

All steps shipped on `feat/music-redesign`, one commit per step: R1 `a8e3702`,
R2 `0d9ee1a`, R3 `0cf9814` (severity corrected: both chunk configs produced the
same consolidated lazy TTS chunk — hygiene fix, comment restored), R4 `b34db60`,
R5 `4830a83`, R6 `3a1c924`, R7+R11 `c389d36`, R8–R10+R12 `bc302ae`.
Gates at completion: `vp run -r check` clean · **1050 tests** · build ✓ ·
browser-verified (rhythm URL restore/sync, chord-perfect reps control, gap-click
click assertions via mocked runtime).

Deliberate holds: full-config URL stamping kept (pins the drill; tests assert
it); pdf-core stays on tsc (no .svelte components exist there).
