# Practice OS UI pass: change log

Branch `feat/practice-ui-pass`, worktree `/Users/gaspard/orca/workspaces/PersonalWebsite/main`. One entry per commit, appended right after the commit. Screenshot folders: `docs/screenshots/ui-pass/before/` (baseline, captured 2026-09-04 before any change) and `docs/screenshots/ui-pass/after/<slice>/`.

Entry format: commit hash, slice name, files touched, what changed visually or behaviourally, prior decision overturned (if any) and why, tests updated and why, before/after screenshot paths, and anything that can only be verified at the instrument.

## 2026-09-04 · Round 0 · research, audit, proposal (no code changes)

- Commits: none. Nothing in `src/` or `packages/` was modified.
- Written: `docs/music-redesign/ux-research.md`, `audit.md`, `proposal.md`, this file.
- Baseline screenshots: 72 setup-phase captures and 44 stage-phase captures under `docs/screenshots/ui-pass/before/`, with `report.json` and `stage-report.json`.
- Mockups: design canvas "Practice OS Drill Shell", https://claude.ai/code/artifact/3824a2b8-b5c1-49d5-ad7c-788a4865da42
- Worktree setup notes: `pnpm install --frozen-lockfile`, symlinked `node_modules/{vite,vitest,rollup}` into the pnpm store entries, compiled Paraglide messages once (`paraglide-js compile`), dev server on port 5199. Gates were not run in this round because no source changed.
- Waiting on: approval of the proposal before slice 1.

## 33b04db3 · Slice 1 · Hand tokens and form markers on PianoSurface

- Files: `src/app.css`, `src/routes/music/_components/piano/PianoSurface.svelte`, `PianoSurface.svelte.test.ts`, `src/routes/music/play/two-hand/+page.svelte`.
- Visual: hands now use `--hand-left` (teal, hue 195) and `--hand-right` (rose, hue 350), the same hue in both themes. Left-hand keys are an outlined ring over a light tint with an L glyph; right-hand keys are a solid fill with an R glyph. The waterfall lane and the hand-mute swatches use the same forms. The surface renders its own legend ("Left hand, outlined L · Right hand, filled R") whenever any highlight or timeline note carries a hand.
- Behaviour: none. `data-state` values, the sr-only summary text and the router events are unchanged.
- Overturned: hands on `chart-4`/`chart-2` (piano-surface foundation). Reason: those tokens flip hue between light and dark, and hue was the only carrier at the key level. Audit section 5, item 4.
- Tests: added "hand targets carry a form marker and a legend, not hue alone", "a surface without hand data shows no legend or markers", and a source gate "the surface never colours hands from the chart palette". No existing assertion changed. Two-hand's route tests pass unchanged (they never asserted the legend copy).
- Gates: `vp run -r check` clean · `vp test --run` 1496/1496 · `vp run -r build` with precache assertion · Playwright 53/53.
- Screenshots: before `docs/screenshots/ui-pass/before/play-two-hand--{1280,375}-{light,dark}.png` and `play-two-hand--stage--*`; after `docs/screenshots/ui-pass/after/01-hand-tokens/` (same set plus `learn-reading--*` and `kbd-walk--stage-key-focus.png`). No horizontal overflow on either route at 375 px.
- Keyboard walkthrough (two-hand): 24 Tabs from page top to Start (the chrome stack; slice 3 target), Enter starts, focus lands on the stage heading, Tab reaches the first key with a visible ring, Enter latches it (`aria-pressed=true`).
- At the instrument: nothing here depends on MIDI hardware; the L/R glyphs and legend can be judged on screen.

## ab3f078d · Slice 2 · 375 px overflow fixes

- Files: `src/routes/music/_components/SegmentedControl.svelte`, `AerophoneFingering.svelte` (+ new `AerophoneFingering.svelte.test.ts`), `src/routes/music/jam/+page.svelte`, `learn/ear/_components/EarTrainingSessionView.svelte`, `learn/rhythm/+page.svelte`, `e2e/music-jam.spec.ts`, `e2e/music-aerophone.spec.ts`.
- Visual: segmented controls wrap onto extra rows instead of widening the page (Transpose's eleven options, the Aerophone drill picker, MPC patterns, Chord-Perfect modes); Aerophone fingering figures shrink with their chart cell; the jam backing aside can shrink; the ear session's combo / orb / accuracy row is two columns on phones with the orb first and full width; rhythm beat dots wrap.
- Behaviour: none.
- Overturned: nothing. These are the known open items from the brief plus the audit's root-cause fixes (audit section 2).
- Tests: added `AerophoneFingering` unit test for the inline fluid sizing, and Playwright mobile-overflow checks for `/music/jam` and `/music/learn/aerophone` (same pattern as the existing MPC check). No existing assertion changed. Note: vitest browser mode runs without the app stylesheet, so a layout assertion on `SegmentedControl` was not meaningful and was not kept; the end-to-end checks cover it.
- Gates: `vp run -r check` clean · `vp test --run` 1497/1497 · `vp run -r build` with precache assertion · Playwright 55/55 (53 + 2 new).
- Screenshots: before `docs/screenshots/ui-pass/before/{jam,play-chord-progression,learn-aerophone,play-mpc,play-chord-perfect,learn-rhythm,learn-ear}--375-*.png` and `learn-ear--stage--375-*`; after `docs/screenshots/ui-pass/after/02-overflow/` (same routes, `report.json` shows scrollWidth = innerWidth on all 28 loads, plus `learn-ear--stage--375-*` after the orb reorder).
- Keyboard: no focus order changed; segmented buttons keep `aria-pressed` and the group label.
- At the instrument: nothing hardware-dependent.

## 9a1fdfcd · Slice 3a · Shell owns focus mode; top bar yields on phone-width drill routes (behaviour)

- Files: `src/routes/music/_components/PracticeDrillShell.svelte` (+ test), `MusicTopBar.svelte`, `src/routes/music/+layout.svelte`, `learn/reading/_components/{FlashcardSession,SightReadingSession}.svelte`, nine drill routes (`learn/rhythm`, `play/{chord-perfect,chord-scales,licks,mpc,scales,spider,two-hand,voicings}`), `e2e/route-apps.spec.ts`.
- Behaviour: focus mode (chrome hides during a run) is now set by the shell for every drill whose phase is "stage". Reading, Ear, Aerophone and Chord-Scale (outside its listening step) gain focus mode; the nine routes that already had it are unchanged in effect and drop their own `DrillFocusScope` mount. Nested shells (Reading's two session components) pass `focus={false}`. The music top bar (search + streak/XP chip) is hidden below `lg` on `/music/play/*`, `/music/learn/*` and `/music/jam`; the floating capsule's sticky offset follows.
- Overturned: decision 8 (focus opted in per route) and decision 2 (top bar everywhere). Approved 2026-09-04.
- Tests: shell "owns focus mode" and "a nested shell can opt out"; Playwright "music top bar yields to the drill on phone-width drill routes". `DrillFocusScope` test unchanged.
- Gates: check clean · unit 1499/1499 · build ✓ · Playwright 56/56.
- Screenshots: `docs/screenshots/ui-pass/after/03a-focus-topbar/` (home vs scales vs reading at 375, chord-scales stage now in focus mode).

## 7c75ab63 · Slice 3b · Three-state shell anatomy, metric-first summary, compact tiles (restyle)

- Files: `PracticeDrillShell.svelte` (+ test), `DrillSummaryCard.svelte` (+ test), `DrillProgressRail.svelte` (+ test), `HudTile.svelte`, `PracticeScreenHeader.svelte`.
- Visual: the stage phase is one column on every drill (stage, feedback, then "Run details" as compact tiles underneath); the 18 rem side rail is gone. New shell inputs `setupSummary` and `readyStage` give the collapsed-setup Ready state (Edit setup toggle with `aria-expanded`/`aria-controls`); `DrillSummaryCard` gains a `metric` slot with the delta beside it; `HudTile size="sm"`; `PracticeScreenHeader compact`. Routes without the new inputs render as before, so nothing else moved except the rail.
- Behaviour: none.
- Tests: shell "collapses the controls behind Edit setup", "rail renders under the stage"; summary card "leads with the metric"; rail "renders each item as a compact stat tile".
- Gates: check clean · unit 1503/1503 · build ✓ · Playwright 56/56 on the second full run. The first full run failed `music-reading › saves and selects a custom ukulele tuning` (a 10 s wait for the saved tuning button under parallel load); the spec passed 5/5 in isolation and the full suite passed on rerun. Files touched by this slice do not include the tuning editor.
- Screenshots: `docs/screenshots/ui-pass/after/03b-shell/` (two-hand and voicings stage at 1280/375 light+dark; setup shots for two-hand, voicings, scales, rhythm). No overflow.

## 2fafcfed · Slice 4 · Wait-mode auto-latch, Holding chip, repeated-note hint (behaviour)

- Files: `src/routes/music/_components/piano/PianoSurface.svelte` (+ test), `src/routes/music/_components/ScoreFollowerStage.svelte` (+ test).
- Behaviour: `PianoSurface` default pointer mode is now `auto`: a pointer press latches only while a wait-mode group (a `waitGroupKey` is present) lights more than one target note; single-note groups and sequence drills keep press-and-hold. Enter/Space latching and `pointerMode="latch"` (Voicings) are unchanged. A "Holding C4 E4" chip appears whenever notes are latched, next to the existing "Clear held notes" button. In sight-reading, when the current group shares a note with the previous one the stage says "Play D4 again: a repeated note needs a fresh attack."
- Overturned: decision 3 (press-and-hold only; latch via keyboard only; Voicings silent latch). The follower's re-strike and one-source-per-chord rules are kept and now explained on the stage.
- Tests: added the three named in the commit. A first draft latched on "more than one target highlight" and broke seven two-hand route tests (that drill lights its whole sequence as targets); the rule was tightened to wait-mode groups and those tests pass unchanged. No existing assertion changed.
- Gates: check clean · unit 1506/1506 · build ✓ · Playwright 56/56.
- Screenshots: `docs/screenshots/ui-pass/after/04-auto-latch/play-voicings--stage-holding--1280-light.png` (two latched notes, chip visible), `learn-reading--stage-wait--1280-light.png` (wait mode with legend, R marker, focus mode; no overflow). Remaining widths/themes captured in the same folder after the commit.
- At the instrument: MIDI input is unaffected by pointer mode; the repeated-note hint fires for MIDI players too and is worth a check with a real repeated note in a generated phrase.

## b4d15572 · Slice 5 · Voicings adopts the three-state shell

- Files: `src/routes/music/play/voicings/+page.svelte` (+ test), `src/routes/music/_components/LastRunDelta.svelte` (copy only).
- Visual: compact header; setup collapsed to one summary line with Edit setup; ready stage shows the first chord on a live keyboard with Start and the Space hint on it; the 12-key reference sits under the stage and leaves the run; one keyboard during the run carries the target voicing (piano) while guitar/ukulele keep the fretboard and Aerophone keeps fingerings plus the keyboard fallback; run details as compact tiles (Chord, Accuracy, Skill); results lead with the accuracy number and the delta, then a 36-chip per-chord strip, then Again / Change setup / Next up; XP is a muted line.
- Behaviour: none in grading or persistence. "Restart drill" (duplicate of retry) removed. Auto-latch remains explicit (`pointerMode="latch"`) during the run; the ready keyboard uses the default auto mode.
- Copy: Start / Stop / Again; "Play the voicing. It advances on its own."; "Setup ready."; the shared first-run line is now "First logged run. The next one compares here."
- Overturned: decisions 1 (setup card), 5 (XP placement) and 9 (two keyboards) for this route.
- Tests: labels updated ("Start", "Stop", "Again"); five tests open setup with Edit setup before touching controls; the click-to-latch test clicks the shown octave. No assertion dropped; 13/13 route tests, convergence test unchanged.
- Gates: check clean · unit 1506/1506 · build ✓ · Playwright 56/56.
- Screenshots: `docs/screenshots/ui-pass/after/05-voicings/play-voicings--{ready,ready-edit,stage,summary}--{1280,375}-{light,dark}.png`, all with scrollWidth = viewport; `kbd-walk--stage-key-focus.png`.
- Keyboard: 23 Tabs to Start (down from 24; the chrome slice is still the main cost), Enter starts, focus lands on the chord heading, Tab reaches C4 with a visible ring, Enter latches it.
- At the instrument: MIDI grading unchanged; worth checking that the lit target keys match what you hear for a minor and an altered set.

## 006cc33e · Slice 6 · Reading adopts the three-state shell

- Files: `src/routes/music/learn/reading/+page.svelte` (+ test), `_components/{SightReadingSession,FlashcardSession,ReadingSetup,ReadingSummary}.svelte`, `src/routes/music/drill-shell-convergence.test.ts`, `e2e/music-reading.spec.ts`.
- Visual: compact header; setup collapsed behind one summary line; ready stage with a single Start and the Space hint; no nested shell during the run (one reveal, one action row); Stop as the shell's stage action; run details as compact tiles under the stage; microphone control directly under the keyboard; results lead with accuracy and the delta, then a per-prompt chip strip, a muted XP line, and one action row with Next up.
- Behaviour: none in grading, preparation or persistence. The pre-start phrase state is kept (preview, waterfall, retiming depend on it); I had drafted an auto-start for wait mode and reverted it for that reason. Copy is fixed instead: "Phrase ready / Start" in wait mode, "Count-in ready / Start count-in" in Assess mode.
- Copy: Start / Stop / Again; "Ready. Press Start, or Space."; "Setup ready."; ReadingSetup's heading is "Flashcards or sight-reading".
- Overturned: decisions 1 (setup card) and 5 (XP placement) for this route; the nested-shell layout (P2 usability work) is undone.
- Tests: labels updated as listed in the commit; `openSetup()` helper added; lock assertion moved from `closest("fieldset")` to the button plus the controls fieldset; convergence test lists the route alone. 47/47 reading tests; no assertion dropped.
- Gates: check clean · unit 1506/1506 · build ✓ · Playwright 56/56.
- Screenshots: `docs/screenshots/ui-pass/after/06-reading/learn-reading--{ready,ready-edit,phrase-ready,stage,summary}--{1280,375}-{light,dark}.png`, all scrollWidth = viewport; focus mode active during the run.
- Keyboard: 23 Tabs to Start, Enter starts, focus lands on the session wrapper (default focus ring kept), Tab reaches the answer choices or keys.
- At the instrument: MIDI sight-reading unchanged; the repeated-note hint (slice 4) and hand markers are worth a look with a real two-hand phrase.

## da8ddcef · Slice 7 · Two-hand adopts the three-state shell

- Files: `src/routes/music/play/two-hand/+page.svelte` (+ test).
- Visual: compact header; setup collapsed to one summary line; full-width ready stage with both hands visible (fixes the clipped keyboard in the old 22 rem aside); Start and Space hint on the stage; Enable MIDI beside the status; compact tiles during the run; results lead with the two-hand score and the delta, then per-hand tiles, the outcome line, a muted XP line, Again / Slow down / Change setup, Next up.
- Behaviour: none in grading or persistence.
- Overturned: decisions 1 and 5 for this route.
- Tests: labels updated; `openSetup()` helper; focus assertions target `two-hand-ready-heading`. 30/30 route tests; no assertion dropped.
- Gates: check clean · unit 1506/1506 · build ✓ · Playwright 56/56.
- Screenshots: `docs/screenshots/ui-pass/after/07-two-hand/play-two-hand--{ready,ready-edit,stage,summary}--{1280,375}-{light,dark}.png`, all scrollWidth = viewport; `kbd-walk--stage-key-focus.png`.
- Keyboard: 23 Tabs to Start, Enter starts, focus on the stage heading, Tab reaches B1 with a visible ring, Enter latches it.
- At the instrument: MIDI velocity contrast for "Melody louder" cannot be exercised on screen; worth one run with the FP-30X.

## Round 1 stop point (2026-09-04)

Shared shell (slices 1 to 4) plus three drills (Voicings, Reading, Two-hand) are done, as the brief asked before a direction review. Slice 8 (Practice home: Start routine navigates, tab in URL, compact drill rows on phones) is approved (decision 7) and not started; it opens round 2 together with Scales, Licks, Chord-Scale, Rhythm, Ear, Aerophone, MPC, Spider, Chord Progression (MIDI input needs your yes) and Jam.

## Round 2 (started 2026-09-04, after review)

Decisions taken at review: Chord Progression gains a MIDI/on-screen input path; Jam's chart follows the backing transport; order Ear, Scales, Licks, Chord-Scale, then Rhythm, Aerophone, MPC, Spider, Chord Progression, Jam, Practice home.

## 0415c52b · Slice 9 · Ear training adopts the three-state shell

- Files: `src/routes/music/learn/ear/+page.svelte` (+ test), `_components/EarTrainingSetup.svelte` (new), `_components/{EarTrainingLanding,EarTrainingSummary,EarTrainingSessionView,EarTrainingSessionRail}.svelte`.
- Visual: setup collapsed to one line; one primary Start for the mixed session with the five focused drills beside it on the ready stage; warmup, repertoire review and learning path as content underneath; run without the combo tile and pulsing orb (Replay is a compact button, accuracy and correct count are tiles); results metric-first with by-drill tiles, Recent results, Review next and one action row.
- Behaviour: none in scheduling, grading or persistence. The `animate-ping` orb (unguarded continuous animation) is gone.
- Copy: Start / Stop / Again; landing copy without em dashes.
- Overturned: decisions 1 and 5 for this route.
- Tests: labels updated; `openSetup()` after each render; lock assertion on the disabled Start. 43/43; no assertion dropped.
- Gates: check clean · unit 1506/1506 · build ✓ · Playwright 56/56.
- Screenshots: `docs/screenshots/ui-pass/after/09-ear/learn-ear--{ready,ready-edit,stage,summary}--{1280,375}-{light,dark}.png`, all scrollWidth = viewport; focus mode active during the run.
- Keyboard: 23 Tabs to Start, Enter starts, focus lands on the session wrapper, Tab reaches Replay then the answer choices.
- At the instrument: voice mode (microphone) and MIDI answers are unchanged and worth one pass each.

## fe5fe2a4 · Slice 10 · Scales adopts the three-state shell

- Files: `src/routes/music/play/scales/+page.svelte` (+ test), `e2e/music-technique.spec.ts`.
- Visual: setup collapsed to one line (selects and instrument picker behind Edit setup); full-width ready stage with the scale lit on a live keyboard, Start and Space hint; Streak card removed; compact tiles during the run; results metric-first with the tempo ladder as a six-rung row (accent = next target, success = unlocked).
- Behaviour: none in grading, ladder or persistence.
- Copy: Start / Stop; "Ready. Press Start, or Space."; "Setup ready."; the stage subtitle sentence is gone.
- Overturned: decisions 1 and 5 for this route; ladder colours move from `primary` to role tokens (audit section 1, item 2).
- Tests: labels updated; `openSetup()`; ready-heading focus target; slower-retry waits for Stop. 29/29; E2E technique spec updated (Start label, heading role, next-target sentence). No assertion dropped.
- Gates: check clean · unit 1506/1506 · build ✓ · Playwright 56/56 (the technique spec failed once on the old labels before the spec update, then passed alone and in the full run).
- Screenshots: `docs/screenshots/ui-pass/after/10-scales/play-scales--{ready,ready-edit,stage,summary}--{1280,375}-{light,dark}.png`, all scrollWidth = viewport.
- Keyboard: 23 Tabs to Start, Enter starts, focus on the run heading, Tab reaches B3 with a visible ring, Enter latches.
- At the instrument: the tempo ladder unlock (clean run at tempo) is unchanged and worth one MIDI run.

## 4d6bfb81 · Slice 11 · Licks adopts the three-state shell, next-note cue

- Files: `src/routes/music/play/licks/+page.svelte` (+ test).
- Visual: setup collapsed to one line (category behind Edit setup); the lick picker, the line, tip and scales, Hear it and Start live on the ready stage with the lick's notes lit; during the run the keyboard lights the next expected note; compact tiles; results metric-first with notes matched and tempo tiles.
- Behaviour: none in grading or persistence (the next-note highlight is display only).
- Copy: Start / Stop / Again; "Ready. Hear it, then press Start."; "Play the lick."
- Overturned: decisions 1 and 5 for this route; audit section 3.2 item "no next-note cue".
- Tests: labels updated; `openSetup()` for the category control; 11/11; no assertion dropped.
- Gates: check clean · unit 1506/1506 · build ✓ · Playwright 56/56.
- Screenshots: `docs/screenshots/ui-pass/after/11-licks/play-licks--{ready,ready-edit,stage,summary}--{1280,375}-{light,dark}.png`, all scrollWidth = viewport.
- Keyboard: 24 Tabs to Start (Hear it precedes it), Enter starts, focus on the run heading, Tab reaches C4 with a visible ring, Enter latches.
- At the instrument: the 150 BPM playback and the octave-lenient grading are unchanged.

## 40301e56 · Slice 12 · Chord-Scale adopts the three-state shell on one keyboard

- Files: `src/routes/music/play/chord-scales/+page.svelte` (+ test).
- Visual: setup collapsed to one line (Changes behind Edit setup); ready stage shows the chord chart, the first chord's tone roles on the keyboard and Start; during the run the single keyboard carries tone roles (chord filled, scale ring-tinted, avoid muted) plus the next expected note as the target; compact chord strip with now/next; compact tiles; results metric-first with chords graded and tempo tiles and the per-chord strip.
- Behaviour: none in grading, persistence or the per-chord Hear scale / Play it back lifecycle (the target cue is display only).
- Copy: Start / Stop / Again; "Ready. Press Start, or Space."; "Play D Dorian over Dm7."; "100% on Dm7, next chord: G7."; "Done. 100% across 3 chords, +N XP."
- Overturned: decision 9 for this route (tone strip plus blank keyboard becomes one keyboard); decisions 1 and 5. `ProgressionChartStage` remains in use by Chord Progression and Jam.
- Tests: labels updated; `openSetup()` before the Changes control in three tests; ready heading keeps `role="heading"` so the focus-return assertion holds; 11/11; no assertion dropped.
- Gates: check clean · unit 1506/1506 · build ✓ · Playwright 56/56.
- Screenshots: `docs/screenshots/ui-pass/after/12-chord-scales/play-chord-scales--{ready,ready-edit,stage,listening,summary}--{1280,375}-{light,dark}.png`, all scrollWidth = viewport; focus mode active on the stage.
- Keyboard: 23 Tabs to Start, Enter starts, focus lands on "D Dorian over Dm7", Tab reaches C4 ("chord tone" in its name) with a visible ring, Enter latches.
- At the instrument: the count-in before "Play it back" and the octave-strict note grading are unchanged; the target ring on the next scale note is subtler than the chord-tone fill in dark mode, worth a look with real MIDI.

## 7be70926 · Slice 13 · Rhythm adopts the three-state shell, timing meter mid-run

- Files: `src/routes/music/learn/rhythm/+page.svelte` (+ test), `e2e/music-rhythm.spec.ts`.
- Visual: setup collapsed to one line (mode, pattern, beats behind Edit setup); ready stage with pattern heading, BPM chip, Start, beat-dot preview and the MIDI / microphone actions; stage shows the TimingMeter live with running score, offset and progress tiles; beat dots size-9 on phones; read-and-tap target grid 8 columns from sm; Tap beat full width on phones; results metric-first with meter, offset tiles, feedback sentence and XP as one muted line.
- Behaviour: none in grading, session lifecycle or the tempo ladder. The mid-run meter reads the existing HUD projection. MIDI / microphone buttons disable while starting (same as the old setup fieldset).
- Copy: Start / Stop; "Ready. Press Start, or Space."; header subtitle removed.
- Overturned: decisions 1 and 5 for this route; decision 6 partly (two of three live regions removed; one announcer remains). Audit: "Rhythm shows no timing meter during the run" fixed; Beats stays a number field (native select and number input deferred with audit item 6).
- Tests: labels and status updated; `openSetup()` before setup controls (five places); URL test sets the variant tempo inside `waitFor` (it raced the async practice-context re-registration); 13/13; e2e label updated; no assertion dropped.
- Gates: check clean · unit 1506/1506 · build ✓ · Playwright 56/56.
- Screenshots: `docs/screenshots/ui-pass/after/13-rhythm/learn-rhythm--{ready,ready-edit,stage,summary}--{1280,375}-{light,dark}.png`, all scrollWidth = viewport; focus mode active on the stage.
- Keyboard: 23 Tabs to Start, Enter starts, focus lands on the "Quarter-note pulse" heading with a visible ring; Tap beat is the next real button (no piano on this route).
- At the instrument: MIDI and microphone hit scoring unchanged; the on-screen run above shows large "behind" offsets because Playwright taps late, not a grading change.

## fc5e5ce1 · Slice 14 · Aerophone adopts the three-state shell on PracticeStage

- Files: `src/routes/music/learn/aerophone/+page.svelte` (+ test), `e2e/music-aerophone.spec.ts`.
- Visual: setup collapsed to one line (duration / interval / style / tempo readout / Enable MIDI behind Edit setup); trainer picker on the ready stage; target block with note, Live/Preview chip, stepper and fingering; fingering chart card below (six columns from md, accent + ring selection, visible focus ring, figure hidden from assistive tech); stage on PracticeStage with compact tiles, one Progress meter style, completed attacks filled in the articulation grid, current fingering beside the meters; results metric-first with restyled dimension tiles, XP one muted line, Next up.
- Behaviour: none in grading, session lifecycle or persistence. The trainer picker disables while a start is pending (same lock the setup fieldset gave it).
- Copy: Start / Stop / Again replace four per-mode label sets; "Ready. Press Start, or Space."; source pill "Aerophone" / "Waiting for Aerophone"; header subtitle removed.
- Overturned: decisions 1 and 5 for this route. Audit items fixed: plain Card stage, five bars for one value, redundant chart announcements, missing StartShortcut, one-sentence summary. Not done: real pitch and breath traces (the technique session's live state carries only progress and running score; exposing curves is engine work, own slice); engineering sub-headings kept because tests pin them; the engine feedback sentence "No sustained notes — use a wind controller" still carries an em dash (music-core copy).
- Tests: labels unified; `openSetup()` before per-mode controls in six places; 15/15; e2e labels updated; no assertion dropped.
- Gates: check clean · unit 1506/1506 · build ✓ · Playwright 56/56 (Playwright ran before two class-only edits: focus ring restored on the headings, ready fingering 110 px; check re-run clean after them).
- Screenshots: `docs/screenshots/ui-pass/after/14-aerophone/learn-aerophone--{ready,ready-edit,stage,stage-articulation,summary}--{1280,375}-{light,dark}.png`, all scrollWidth = viewport; focus mode active on the stage.
- Keyboard: 23 Tabs to Start, Enter starts, focus lands on "Long Tone Trainer" with the browser ring (the old `outline-none` is gone).
- At the instrument: breath (CC2) meters and the interval-landing drone are unchanged; worth one pass on the AE-10 to confirm the Live chip flips on the first note and the articulation grid fills per attack.

## 19401a45 · Slice 15 · MPC adopts the three-state shell, pad grid fits phones

- Files: `src/routes/music/play/mpc/+page.svelte` (+ test), `src/routes/music/_components/PadRudimentStage.svelte`, `src/routes/music/_components/MpcPadGrid.svelte`, `e2e/music-mpc-rudiments.spec.ts`, `e2e/music-aerophone.spec.ts` (timeout only).
- Visual: setup collapsed to one line (pads, hit count, tempo note, Enable MIDI behind Edit setup); pattern picker on the ready stage; visible stage heading; sequence lane collapses instead of scrolling; pad grid fills its column with square pads, focus ring, accent for the last hit; compact tiles; results metric-first with pad accuracy, timing error, velocity and tempo tiles, XP one muted line, Next up.
- Behaviour: none in grading, session lifecycle or persistence. The pattern picker disables while a start is pending (same lock the setup fieldset gave it).
- Copy: Start / Stop / Again; "Ready. Press Start, or Space."; announcement "Rudiment complete. N% total, N XP."; source pill "MIDI" / "On-screen"; header subtitle removed.
- Overturned: decisions 1 and 5 for this route. Audit items fixed: sr-only stage heading (focus vanished), 391 px stage overflow at 375, non-shrinking pad grid and lane, 10px labels, third live region. Native pad selects kept (audit item 6 deferred).
- Tests: labels unified; `openSetup()` before pad selects (four places); announcement pin updated; 14/14; pad component suites unchanged and green; e2e labels updated, "Rudiment complete" asserted as a heading; aerophone e2e Start to Stop wait 15 s (count-in under load; it failed once in the full run while screenshots were being captured and passed alone).
- Gates: check clean · unit 1506/1506 · build ✓ · Playwright 55/56 in the loaded run, the one failure re-run green alone (aerophone count-in timing, hardened as above).
- Screenshots: `docs/screenshots/ui-pass/after/15-mpc/play-mpc--{ready,ready-edit,stage,summary}--{1280,375}-{light,dark}.png`, all scrollWidth = viewport; focus mode active on the stage.
- Keyboard: 23 Tabs to Start, Enter starts, focus lands on the visible "Single strokes" heading with the browser ring; pads reachable next, QWERTY keys still trigger them.
- At the instrument: pad velocity and timing grading unchanged; worth a pass with the MPC over MIDI to confirm the last-hit accent follows hardware pads too.

## 22c224e1 · Slice 16 · String Independence adopts the three-state shell

- Files: `src/routes/music/play/spider/+page.svelte` (+ test), `e2e/music-spider.spec.ts`.
- Visual: setup collapsed to one line (pattern, tuning, string, span, fret, string order behind Edit setup); exercise and instrument pickers on the ready stage; MIDI and microphone actions with status lines; visible stage heading; compact tiles with Tempo and Input; results metric-first with notes, timing error, tempo and input tiles, XP one muted line, Next up.
- Behaviour: none in grading, session lifecycle or persistence. Pickers disable while a start is pending (same lock the setup fieldset gave them).
- Copy: Start / Stop / Again; "Ready. Press Start, or Space."; header subtitle removed.
- Overturned: decisions 1 and 5 for this route. Audit items fixed: sr-only stage heading, one-sentence summary, two extra live regions, orphan `spider-order-label`. Native selects kept (audit item 6 deferred).
- Tests: labels unified; `openSetup()` in six places; lock assertions moved to the exercise picker; return assertions check Edit setup; 16/16; e2e labels updated; no assertion dropped.
- Gates: check clean (re-run after a class-only edit) · unit 1506/1506 · build ✓ · Playwright 56/56.
- Screenshots: `docs/screenshots/ui-pass/after/16-spider/play-spider--{ready,ready-edit,stage,summary}--{1280,375}-{light,dark}.png`, all scrollWidth = viewport; focus mode active on the stage.
- Keyboard: 23 Tabs to Start, Enter starts, focus lands on the visible "Guitar string 6 · 1-2-3-4 ascending" heading with the browser ring; fret buttons reachable next.
- At the instrument: microphone pitch scoring for acoustic guitar is unchanged; worth one pass to confirm the Input pill flips to "Microphone · guitar" while running.

## 5c948a25 · Slice 17a · Chord Progression: MIDI and on-screen keys input path (behaviour)

- Files: `src/routes/music/play/chord-progression/+page.svelte` (+ test).
- Behaviour: new Input choice (Microphone / MIDI or on-screen keys; keys by default when MIDI is the active source). Keys path subscribes to the shared InputRouter after the downbeat and folds attacks into one chord observation per 150 ms window (the notes still sounding), fed to the unchanged chord follower at onset strength. After each flushed chord the held set clears and the keyboard's wait-group key changes so latched on-screen notes drop. Microphone path unchanged. No persisted shape or config normalizer touched (input mode is route state).
- Visual (interim): a live PianoSurface with the current chord's tone roles and targets appears under the chart in keys mode; the strip and second keyboard go in the restyle commit.
- Copy: status strings on this route lose their em dashes.
- Decision: 10 (approved). Audit: "Chord Progression is microphone-only and guitar-only" fixed.
- Tests: +1 (keys path); 20/20; no assertion changed.
- Gates: check clean · unit 1507/1507 · build ✓ · Playwright 56/56.
- Screenshots: `docs/screenshots/ui-pass/after/17-chord-progression/play-chord-progression--keys-stage--1280-light.png` (interim two-keyboard view, before the restyle).
- At the instrument: play Dm7 then G7 on a MIDI keyboard at 110 BPM; the chart should advance on the second chord and the grade read matched in-time when the first attack lands inside the timing window. Sustained chords across a change are fine (the flush reads the current held set); a held bass note from the previous chord does count as an extra tone.

## 7d1b5b5b · Slice 17b · Chord Progression adopts the three-state shell on one keyboard (restyle)

- Files: `src/routes/music/play/chord-progression/+page.svelte` (+ test).
- Visual: setup collapsed to one line (Transpose and tempo note behind Edit setup); group, progression and input pickers on the ready stage; chord chart with now/next and grade badges; one keyboard over three octaves with the current chord's tone roles and targets (live in keys mode, read-only with the microphone); detected tones under it; compact tiles in run details; results metric-first with the graded chart, matched / tempo / input tiles, XP one muted line. `ProgressionChartStage` no longer used here (Jam remains).
- Behaviour: none beyond 5c948a25. Pickers disable while a start is pending or the source is tearing down (same lock the setup fieldset gave them).
- Copy: Start / Stop / Again; "Ready. Press Start, or Space."; "Setup ready. Choose a progression, then press Start."; header subtitle removed.
- Overturned: decisions 1, 5 and 9 for this route. Audit items fixed: missing StartShortcut, no XP shown, no delta, two keyboards.
- Tests: "Repeat" -> "Again"; `openSetup()` before Transpose (two places); focus test targets the card description; 20/20; no assertion dropped.
- Gates: check clean · unit 1507/1507 · build ✓ · Playwright 56/56.
- Screenshots: `docs/screenshots/ui-pass/after/17-chord-progression/play-chord-progression--{ready,ready-edit,stage,summary}--{1280,375}-{light,dark}.png` (stage in keys mode after two on-screen chords, G7 current), all scrollWidth = viewport; focus mode active on the stage.
- Keyboard: 23 Tabs to Start, Enter starts; during the count-in the disabled Start drops focus to body (Chromium blurs disabled controls), then focus lands on the "ii–V–I" stage heading with a visible ring once the stage mounts. The first keyboard walk read "body" because it looked before the count-in ended.
- At the instrument: microphone path unchanged; the keys path is the one to try with the MIDI keyboard (see 5c948a25).

## 6884eda9 · Slice 18a · Jam: chart follows the backing transport, chorus tone report (behaviour)

- Files: `src/routes/music/jam/+page.svelte` (+ test).
- Behaviour: while the backing plays, the current chord follows elapsed beats at the effective tempo (drum track's own BPM, or the transport BPM for synth chords), looping per chorus, paused time excluded; Next chord disabled while playing; Stop resets the chart. Each solo note during playback is classified against the chord of the moment; a report line per completed chorus (chord / scale / outside percentages, last eight). Route state only, nothing persisted.
- Visual (interim): "Chorus tone report" card under the chart; the two-keyboard layout is replaced in the restyle commit that follows.
- Decision: round 2 (approved). Audit: "Jam: chords advance only by clicking Next chord; backing and chart not linked; no chord-tone hit rate" fixed.
- Tests: +2; 14/14 on the route; no assertion changed.
- Gates: check clean · unit 1509/1509 · build ✓ · Playwright 56/56.
- Screenshots: `docs/screenshots/ui-pass/after/18-jam/jam--transport-chart--1280-light.png` (interim, during playback with a report).
- At the instrument: with a drum track the chart follows the track's stated BPM, not the transport capsule; if a bundled track drifts from its label the chart will drift too. Synth chords follow the transport exactly. Worth one pass with the Aerophone or MIDI keyboard to read a real chorus report.

## fcb94bc5 · Slice 18b · Jam adopts the shell anatomy on one keyboard (restyle)

- Files: `src/routes/music/jam/+page.svelte` (+ test), `e2e/music-jam.spec.ts`.
- Visual: compact header; setup summary line with Transpose and the drum-track select behind a route-local Edit setup toggle (aria-expanded); group, progression and backing source visible; PracticeStage with the now/next chart strip, one three-octave keyboard carrying tone roles and taking the solo, one action row (Play chord, Next chord, Play/Pause backing, Stop), compact tiles; chorus tone report card and take review panel below. `ProgressionChartStage` is no longer used by any route (kept in the tree with its test; candidate for deletion in a cleanup slice).
- Behaviour: none beyond 6884eda9.
- Copy: source pill "Input"; chord symbols and roman numerals keep their case in labels.
- Overturned: decisions 1 (partially, Jam has no phases) and 9 for this route. Audit: two keyboards, 1521 px overflow at 1280 (already fixed by ab3f078d), "Soloing on" label drift.
- Tests: `openSetup()` before Transpose in two tests; e2e opens setup before the Transpose group; 14/14; no assertion dropped.
- Gates: check clean (re-run after the label edits) · unit 1509/1509 · build ✓ · Playwright 56/56 (run before the label-only edits).
- Screenshots: `docs/screenshots/ui-pass/after/18-jam/jam--{idle,setup,playing}--{1280,375}-{light,dark}.png`, all scrollWidth = viewport (the fixed top capsule and bottom nav appear mid-page in the full-page captures; they are fixed elements, not overlaps).
- Keyboard: no Start on this route; Tab order is Record chorus, Edit setup, the pickers, then the stage actions and the keyboard. Not walked with the drill script.
- At the instrument: the Tempo tile reads the effective backing tempo (drum track BPM or transport), which can differ from the capsule when a URL tempo is clamped; worth a look with a real drum track.

## 600bf45e · Fix · Chord symbol case in stage labels

- Files: `src/routes/music/play/chord-progression/+page.svelte`, `src/routes/music/play/chord-scales/+page.svelte`.
- Visual: "Now playing", "First up" and "Target tones" labels no longer uppercase "Dm7" to "DM7" or "ii" to "II". Restyle only, no tests touched. Screenshots for slices 12 and 17 re-captured.
- Gates: check clean; unit and e2e unaffected (class-only change).

## d03ef4ed · Slice 8a · Practice home: Start routine navigates, tab in the URL (behaviour)

- Files: `src/routes/music/+page.svelte` (+ test), `src/routes/music/_components/TodayPlan.svelte` (+ new test), `e2e/music-routine.spec.ts`.
- Behaviour: Start routine starts the daily routine and navigates to its first step with `routine=1`; Today's active card shows the current step with one "Continue routine" button; the Practice tab reads and writes `?tab=` (Today clears it). Routine state stays in-memory as before (a full reload still drops it; unchanged).
- Copy: "Continue routine" replaces "Start <step>"; the "Results are logged only after the full routine is complete." line removed (audit).
- Decision: 7 (approved). Audit items: "Start routine sets state and stays", "Practice home tab state in the URL".
- Tests: +2 (TodayPlan navigation, home URL tab); e2e routine follows the navigation then returns via the sidebar; the first step is asserted by shape because the adaptive plan depends on stored history (it was Rhythm in the full run and Ear alone). No assertion dropped.
- Gates: check clean · unit 1511/1511 · build ✓ · Playwright 55/56 in the full run with the routine spec failing on a too-strict URL match (`$` anchor; the drill appends its config), fixed and re-run green alone.
- Screenshots: captured with the restyle commit that follows.
- At the instrument: none.

## 0b35075f · Slice 8b · Practice home: compact drill rows on the phone (restyle)

- Files: `src/routes/music/+page.svelte`, `src/routes/music/_components/MusicToolCard.svelte`.
- Visual: below md the drill cards drop the cover band and the action line and tighten padding into compact rows; desktop unchanged; home subtitle without the em dash.
- Behaviour: none.
- Tests: card tests unchanged and green (band still in the DOM, hidden responsively).
- Gates: check clean · unit 1511/1511 · build ✓ · Playwright 56/56.
- Screenshots: `docs/screenshots/ui-pass/after/08-home/home{,-drills,-paths}--{1280,375}-{light,dark}.png`, all scrollWidth = viewport.
- Keyboard: Today / Drills / Paths picker, then Start routine; drill rows are single links.

## 755ed88e · Decision 6 · One live region per drill route

- Files: `src/routes/music/learn/reading/_components/ReadingSetup.svelte`, `src/routes/music/learn/ear/_components/EarTrainingFreePlay.svelte`, `src/routes/music/_components/MicrophoneGatePanel.svelte`, `src/routes/music/_components/SessionFeedback.svelte`, `e2e/music-mpc-rudiments.spec.ts` (timeout only).
- Behaviour: accessibility only. Four shared components stop announcing; each drill route keeps its one sr-only announcer. MpcPadGrid keeps the transient key-assignment hint.
- Measured: at setup every drill route has 3 live regions (route + SvelteKit route announcer + notifications region); Jam 2 (no route announcer, nothing to announce). Before the pass the audit counted Reading 5, Rhythm 5, Scales 4, Ear 4, MPC 3.
- Tests: no assertion changed; 1511/1511; MPC e2e Start to Stop wait 15 s (count-in under load).
- Gates: check clean · unit 1511/1511 · build ✓ · Playwright 55/56 in the loaded run (MPC count-in), the spec green alone after the hardening.

## Round 2 closed · 2026-09-04

Commits this round, in order: 0415c52b Ear · fe5fe2a4 Scales · 4d6bfb81 Licks · 40301e56 Chord-Scale · 7be70926 Rhythm · fc5e5ce1 Aerophone · 19401a45 MPC · 22c224e1 Spider · 5c948a25 + 7d1b5b5b Chord Progression · 6884eda9 + fcb94bc5 Jam · 600bf45e chord-symbol case · d03ef4ed + 0b35075f Practice home · 755ed88e live regions. Branch `feat/practice-ui-pass`, not pushed. Fast-forwarded into local `main` on 2026-09-04 (29 commits, main at 2656454a).

## Round 3 · opened 2026-09-04 on "go ahead"

## 09f2d629 · Cleanup · ProgressionChartStage deleted

- Files: `src/routes/music/_components/ProgressionChartStage.svelte` (+ test) removed. No consumer since the Jam restyle; the piano source gate keeps naming it as a legacy visual.
- Gates: check clean · legacy gate, convergence and aerophone suites green (46/46); full gates run with the next slice.

## f7e5f7da · Fix · Aerophone articulation sentence

- Files: `packages/music-core/src/exercises/aerophone-articulation.ts`, `src/routes/music/learn/aerophone/page.svelte.test.ts`.
- Copy: "No sustained notes. Use a wind controller for articulation." (was an em dash). Engine copy, one pinned test updated.

## 15c3a981 · Slice 19 · Chord-Perfect adopts the three-state shell

- Files: `src/routes/music/play/chord-perfect/+page.svelte` (+ test).
- Visual: setup collapsed to one line (format, repetitions, tempo note, Enable MIDI behind Edit setup); workflow, instrument and chord pickers on the ready stage; fingering guide; fretboard inside the stage (aside removed); compact tiles; verifier and strum readouts as plain text blocks; results metric-first with detail sentence, chord / tempo / input tiles, XP one muted line, Next up.
- Behaviour: none in the four workflows, grading or persistence.
- Copy: Start / Stop / Again everywhere ("Start with microphone", "Stop microphone" for the mic verifier); "Ready. Press Start, or Space."; arrow and em dash removed from the change-trainer status.
- Overturned: decisions 1 and 5 for this route. Audit items fixed: dead tiles before a run, fretboard in an aside, orphan labels, four Start labels.
- Tests: labels unified; `openSetup()` in two places; mode-separation test reworded around the affordances that still differ; 26/26; no assertion dropped.
- Gates: check clean · unit 1509/1509 (two ProgressionChartStage tests deleted with the component) · build ✓ · Playwright 56/56.
- Screenshots: `docs/screenshots/ui-pass/after/19-chord-perfect/play-chord-perfect--{ready,ready-edit,stage,summary}--{1280,375}-{light,dark}.png`, all scrollWidth = viewport; focus mode active on the stage.
- Keyboard: 23 Tabs to Start, Enter starts, focus lands on "Build shape" with the browser ring; the fret buttons are a screen-reader grid (the canvas takes pointer input), so keyboard activation is focus + Enter.
- At the instrument: the strum identifier and the mic verifier are unchanged; the guitar is the one to check that the fretboard canvas still registers taps inside the stage on the phone.

## 3a266f8b · Slice 20 · Hub pass: Library, Progress, Connect, Settings

- Files: `src/routes/music/_components/PracticeScreenHeader.svelte` (new `level` prop), the four Library views (+ three tests), `src/routes/music/progress/+page.svelte` (+ test), `src/routes/music/connect/+page.svelte`, `src/routes/music/settings/+page.svelte`, `e2e/music-progress.spec.ts`.
- Visual: Library views at h2 under the route h1 (was two h1s); Progress mastery grid two-up on the phone with "Show all N skills" (page 15,170 px to 4,462 px at 375); Connect and Settings unchanged visually.
- Behaviour: none. Accessibility: Connect stops announcing every MIDI message and its waiting line; Settings' audio message stops announcing. Live regions at load: Library 2, Progress 2, Connect 4, Settings 3 (two of each are SvelteKit's route announcer and the notifications region).
- Tests: three Library component tests h1 to h2; Progress route and e2e expand the mastery list before the deep-skill pin. No assertion dropped.
- Gates: check clean · unit 1509/1509 · build ✓ · Playwright 55/56 in the loaded run (the Progress deep-skill pin, fixed and green alone).
- Screenshots: `docs/screenshots/ui-pass/before/hubs/` and `docs/screenshots/ui-pass/after/20-hubs/{library,progress,connect,settings}--{1280,375}-{light,dark}.png`, all scrollWidth = viewport.

## Round 3 closed · 2026-09-04

Commits: 09f2d629 ProgressionChartStage deleted · f7e5f7da Aerophone sentence · 15c3a981 Chord-Perfect · 3a266f8b hubs · 2656454a Aerophone traces. Branch `feat/practice-ui-pass`, not pushed. Fast-forwarded into local `main` on 2026-09-04 (29 commits, main at 2656454a).

## 2656454a · Slice 21 · Aerophone live pitch and breath traces (engine + route)

- Files: `packages/music-core/src/domain/exercise.ts`, new `packages/music-core/src/exercises/aerophone-traces.ts`, the four Aerophone exercises (+ long-tone test), `src/routes/music/learn/aerophone/+page.svelte` (+ test).
- Behaviour: `ExerciseLiveState.breathTrace` and `.pitchTrace` (optional) filled by the Aerophone exercises; grading, scoring and persistence unchanged. Approved by the user ("you can change the engine").
- Visual: cents meter and pitch trace in the pitch lane (long tone, swell, interval landing); breath envelope polyline under every breath meter; hold timer spans the row.
- Tests: +1 engine case, +1 route case; 1511/1511; no assertion dropped.
- Gates: check clean (re-run after the hold-timer span) · unit 1511/1511 · build ✓ · Playwright 56/56.
- Screenshots: `docs/screenshots/ui-pass/after/21-aerophone-traces/learn-aerophone--stage-{long-tone,swell,interval-landing}--{1280,375}-{light,dark}.png` (lanes empty: headless Chromium has no wind controller; the filled trace is covered by the route test), all scrollWidth = viewport.
- At the instrument: this is the one to try on the AE-10. Hold a G4: the breath line should ride the envelope, the cents needle should sit at 0 for a clean fingering and jump by whole semitones on a mis-finger (MIDI carries no pitch bend here). With the microphone path the needle reads real cents.

## Round 4 · 2026-09-04 · Individual drills, learning paths, fretted drills, visual refresh

Research and mockups first (approved): `10-visual-references.md` (+ `references/`, 70 real screenshots), `11-drill-patterns.md`, `12-round-4-proposal.md`, design canvas https://claude.ai/code/artifact/d2ff71d0-8ccc-4a65-8655-4157ff749ebf. Decisions: Outfit display face (B), today's cool neutrals kept (B), the fixed 12-colour degree set adopted, the mixed drill named "Ear training review".

## bc76fe17 · Slice 22 · Shared learning-path engine

- Files: new `packages/music-core/src/engines/learning-path/` (+ test), `engines/jazz/index.ts` (`buildJazzLessonPath` and new `buildJazzPath` are wrappers), `package.json` export.
- Behaviour: `buildLearningPath(steps, { mastery, instrument })` gives status (0.66 done threshold), mean mastery over `skillIds`, done count and `next` (skill-less reference steps never block Continue). Defensive copies.
- Tests: 4 new engine cases; jazz path pins unchanged; check clean.

## 644e7d99 · Slice 23 · Ear drill definitions and deep links

- Files: new `engines/ear-training/drills.ts` (+ test), `curriculum.ts` (stages gain `summary`, `detail`, `href`, `links`, `skillIds`; new `EAR_TRAINING_LEARNING_PATH_DEFINITION`), `engines/jazz/index.ts` curriculum (intervals links the intervals drill; chord-scales, altered voicings and the new licks step link their drills with setup; chord symbols, extensions and shell voicings are `kind: "reference"` with drill links; ten steps).
- Behaviour: `earTrainingDrillHref` is the only way to build an ear link; `legacyEarTrainingHref` maps `?drill=…` and `?routine=1`; `earTrainingHrefForSkill` maps skills to drills.
- Tests: 6 new drill cases, curriculum "every stage links a known drill", jazz pins updated deliberately (orders 1..10, hrefs); 68/68.

## db38205d · Slice 24 · One route per ear drill, Ear Training Path page

- Files: new `learn/ear/_components/EarTrainingDrillRoute.svelte` (the 933-line page moved, keyed by an `EarTrainingDrillDefinition`), `RepertoireReviewPicker.svelte`, `EarTrainingSetup.svelte` (`answerModes`, `showLevel`, `showLabels`), seven `learn/ear/<slug>/+page.svelte` routes, `learn/ear/+page.svelte` becomes the path page (legacy redirect through an injectable `navigate`), new `_components/LearningPathScreen.svelte` (+ test), `EarTrainingLanding.svelte` deleted.
- Behaviour: each route has one Start, remembers its own setup (storage keyed by pathname), never writes `drill=` to the URL, tags runs `["ear", <drill>]`; the repertoire route's Start runs the review plan; Retry mistakes keeps the mixed queue.
- Tests: the page test split into seven route tests by destination with shared `ear-test-helpers.ts` (27 tests moved, 3 waits fixed deliberately because the route title now says "Repertoire transfer" before the queue loads), path page test (6 cards in order, redirect calls), convergence test points at the drill component and checks each route mounts it; 54/54.

## aeebc30d · Slice 25 · Ear deep links everywhere

- Files: `musicCatalog.ts` (one card per ear drill from `EAR_TRAINING_DRILLS`), dashboard and challenges `hrefForSkill` (ear helper first), daily-routine (`/music/learn/ear/mixed`, `hrefRouteKey` treats every ear route as the one ear family), `track/+page.svelte`, home `COVER_SLUG`, `e2e/music-routine.spec.ts`, new `e2e/music-ear-path.spec.ts`, `AGENTS.md`.
- Tests: dashboard, challenges, coach, daily-routine and home pins updated deliberately to the drill hrefs; 15/15.

## a5f8deec · Slice 26 · Jazz Path on the shared screen

- `learn/path/+page.svelte` renders `LearningPathScreen` with `buildJazzPath`; test pins ten steps and the drill hrefs.
- Gates for slices 22 to 26: check clean · unit 1535/1535 · build ✓ · Playwright 59/59 (after 197eeeaa fixed an ambiguous Start locator in the new e2e).

## d321b9d5 · 9fd079f8 · 43962c4e · Slices 27 to 28 · Fret window helper and chord positions (engine)

- `fretWindowAround(frets, fretCount, { context 1, minWidth 5 })` in `engines/projection` (+ 2 tests).
- `exercises/chord-positions.ts`: `chordPositionsFor(shape, tuning)` generates 2 to 5 positions per curated shape (position 0 is the curated shape with its id; `<shapeId>@n` above), max stretch 3, max 4 fingers with a barre counting once, no inner mutes, lowest sounding pitch is the root (skipped on re-entrant ukulele tuning), open strings only in first position, best per base fret, deduped; labels "Open position" / "Barre at fret n" / "Fret n"; memoised. Tests pin the standard voicings (guitar C at 3 and 8, G at 3, D at 5, Em at 7, Am at 5, ukulele C at 3) and every invariant for all nine shapes; 11/11.

## c47ec162 · 4e308391 · Slices 29 to 30 · Fret window in FretboardInput and Spider

- `FretboardInput` gains `fretWindow` (absolute, inclusive; own offset, not fretboard.js `crop`; fret numbers rewritten to the real neck; thin edge instead of a nut above fret 0; click mapping shifted; screen-reader grid keeps `String n fret f, note`) and `dotLabels`; a neck strip (`role="img"`, "Frets 4 to 9 of 22"). `FrettedSequenceStage` forwards it.
- Spider plays inside `fretWindowAround(prompt frets)`; note finder keeps the whole neck; the ready stage says "Frets 4 to 9 shown".
- Tests: 2 new FretboardInput cases, spider route asserts the window and the range line, e2e adds the range line; 23/23; no assertion dropped.

## 25fe88b8 · Slice 31 · Chord-Perfect shows one position

- `ChordPerfectDrillConfig` gains `position` and `toPosition` (URL `position`, `toPosition`, omitted at 0; route clamps with `chordPositionAt`). New `PositionStepper.svelte`. The route reads the active position for the session, the fingering guide (barre line), the fretboard window (union of both positions in changes mode) and finger numbers on the dots; selecting a chord or instrument resets to position 0; the setup line and HUD name the position.
- Tests: 4 config equality blocks extended plus a round-trip case; new route test steps to position 2, checks the URL and the window, completes the barre voicing; 35/35.
- Gates for slices 27 to 31: check clean · unit 1551/1551 · build ✓ · Playwright 59/59.

## 53c95ac0 · Slice 32 · Tokens and type (own commit)

- `src/app.css`: `@fontsource-variable/outfit` (catalog) as `--font-display`, Fira Mono wired to `--font-mono`; musical colour tokens `--degree-*` (12, fixed in both themes) with `--degree-foreground`, `--tone-chord/scale/avoid`; `--fretboard/--fretboard-fret`; `--stage-shadow/--stage-grain`; ambient tint 10%/18%; utilities `stage-grain`, `hit-correct/hit-wrong/hit-accent` (200 ms bloom), `led`; `reveal-up` 320 ms.
- New `src/app-tokens.contrast.test.ts` (60 pairs, both themes, from the OKLCH values). It found six pre-existing near-misses, fixed as token changes: light success 0.55 to 0.52 L, warn text to dark ink, stage-muted 0.50 to 0.48 L, hands 0.60 to 0.50/0.52 L, dark practice accent 0.70 L with dark ink text.

## b67f6650 · Slice 33 · Stage as hardware, instruments as material, degree colours

- `PracticeStage`: rounded-2xl, `shadow-stage`, grain, stronger stage light, identity rail in the instrument hue. `PianoSurface`: white keys shaded with a bottom lip, black keys with an edge highlight, `hit-correct/hit-wrong` bloom. `FretboardInput`: wood board, light fret wire and strings, Fira Mono fret numbers, target dots in ink (amber now means "needs work" only). Scale-degree answer buttons carry their degree colour. `HudTile` values in mono, `DrillSummaryCard` metric and `PracticeScreenHeader` titles in the display face with a hue underline.
- Tests: 95/95 across the touched components; no assertion changed.

## e3a5147f · Slice 34 · Chrome identity

- `PracticeOsMark` (three level bars in the instrument hue) replaces the lucide note next to "Practice OS"; active nav item gets a hue marker (desktop bar, mobile top edge); `MusicToolCard` draws a 5:2 hue plate with a `HueMotif` per hue instead of the WebP covers (`coverSrc` removed from the card, the home page and Practice Lab; two cover tests deleted deliberately, one rewritten to assert the motif); path and card titles in the display face; segmented control selection on `bg-card` with a border ring.
- Tests: 42/42.

## ec09768e · Slice 35 · Phone wrap, one live region, docs

- `LearningPathScreen` cards wrap on the phone (the Jazz Path measured 391 px wide at 375); `PositionStepper` drops its `aria-live` so Chord-Perfect keeps one route-owned live region; `src/routes/music/AGENTS.md` gains the type rule (one display face, mono readouts), the musical-colour and fretboard tokens, the contrast test, hue plates, the fret window and chord-position contracts.
- Screenshots: `docs/screenshots/ui-pass/after/22-round-4/` (home, Drills and Paths tabs, Ear Training Path, four ear drills, Jazz Path, Spider, Chord-Perfect at positions 1 and 2, Reading, Scales) at 1280 and 375, light and dark; every route scrollWidth = viewport after the fix; live regions 2 on hubs and paths, 3 on drill routes.

## Round 4 closed · 2026-09-04

Commits bc76fe17 … ec09768e (16 commits) on `feat/practice-ui-pass`, not pushed, not merged. Final gates: check clean (no warnings) · unit 1609/1609 · build ✓ · Playwright 59/59. Left for a later round: degree colours on the piano keys and dictation slots (the answer buttons carry them now), a Storybook story for the fret window, CAGED labels on chord positions.

## 2effaa5a · Slice 36 · Spider: fretboard only, every finger order

- User request after round 4: "for the spider exercises all we need is the fretboard, and more patterns involving different finger orders."
- Files: `packages/music-core/src/exercises/string-spider.ts` (+ test), `engines/technique-session/index.ts` (`SPIDER_DRILL_PATTERNS` carry a `group`), `_components/FrettedSequenceStage.svelte` (+ test), `play/spider/+page.svelte`.
- Behaviour: `STRING_SPIDER_PATTERNS` is now all 24 finger orders of 1-2-3-4, the four classic spiders first with their historical ids (exercise ids and saved history unchanged), the other twenty as `perm-<order>` labelled "2-1-4-3" and so on; the Pattern select groups them as "Classic spiders" and "All finger orders".
- Visual: the stage is the fretboard alone (the step-chip list and its label are gone); target dots show finger numbers (finger 1 on the start fret) instead of note names.
- Tests: engine test pins 24 unique orders and the classic ids first; the stage test asserts the lit fretboard instead of the chips (deliberate); 45/45 across engine, session, stage and route.
- Screenshots: `docs/screenshots/ui-pass/after/23-spider-fretboard/play-spider--stage-perm-2143--{1280,375}-{light,dark}.png`, mid-run, all scrollWidth = viewport.
- Gates: check clean · unit suite green · build ✓ · Playwright 59/59.

## Merged · 2026-09-04

Round 4 plus the Spider follow-up (bc76fe17 … 2effaa5a, 17 commits) fast-forwarded into local `main` at the user's request; main at 2effaa5a. Not pushed; `main` stays ahead of origin by design.

## Round 5 · the seven hub pages · 2026-09-04

Research and mockups first ([13-hub-references.md](13-hub-references.md), [14-hub-patterns.md](14-hub-patterns.md), [15-round-5-proposal.md](15-round-5-proposal.md), design canvas), approved with four decisions: Library sorts by last practised, "Your data" ships now, the string strip is guitar and ukulele only, the streak calendar toggles month and 12-week heatmap.

## d891621d · Slice 37 · Route tabs in the URL, SectionHeading

- `route-state.ts` gains `readRouteTab(search, param, values, fallback)` and `writeRouteTab(param, value, { drop })` over `syncRouteQuery`; Library (`?tab=`) and Tuner (`?mode=`) read their tab from the URL on load and write it back on change; pages init from `window.location.search` and guard the `$page.url` effect for tests.
- New `SectionHeading.svelte` (+ test): eyebrow, display-face h2/h3, description, action snippet that wraps on the phone. The one section heading for every hub.
- Library page test adds the tab round trip.

## 4ba238d2 · 187a0e99 · Slices 38 to 39 · Library

- The three sub-views stop mounting their own `PracticeScreen` and `<title>`; one page, one h1, section headings.
- Songs: a shelf of hue-plate cards sorted by last practised (from `PracticeSessionStore` sessions tagged `["song", id]`, `endTime ?? startTime`), sort toggle "Last practised" / "A to Z", `aria-label="Saved songs"`, empty state with one "Import a song" action. Reference: notes and intervals as degree-coloured chips (`degree-classes.ts`, shared with the ear drills), the instrument view on a `PracticeStage`, "Practise it" links to the drills. Import: a three-step strip (`aria-label="Import steps"`) and "Practise now"; Transcribe flattened into the same shell.
- Tests: SongsView shelf order (the mock sessions discriminate `endTime` from `startTime`), reference and import assertions moved from h1 to the section headings. The reference-tab console error from the survey did not reproduce.

## 3cefddbd · Slice 40 · Create

- `TransportStrip.svelte` (+ test, `role="toolbar"`, transport children and an actions snippet) above every mode. Beat grid and pads on `PracticeStage instrument="mpc"`, steps in the MPC hue, the playhead in the practice accent. Piano roll scrolls inside its own track (was 746 px wide at 375). Recorder takes as cards, the playing take highlighted.
- Roots use `grid grid-cols-[minmax(0,1fr)]` with `min-w-0` cards so inner scrollers engage on the phone (the pattern for every hub).

## eeb984b4 · Slice 41 · Progress

- Title "Progress" (nav and page agree). Hero row: today's XP ring, streak with week dots, `WeekBars` (+ test, `role="img"` summary, best day marked) from the journal. "Practise next" merges the daily challenge and the coach's next steps into one list of drill links. Skill map on the stage. `StreakCalendar` (+ test) toggles one month and a 12-week heatmap. Instruments as `InstrumentBadge` chips. The unused `ready` state is gone.
- Tests and `e2e/music-progress.spec.ts` pin "Progress", "Practise next", "Mastery" (deliberate rename from "Dashboard & Skill Tree").

## a2851d3d · 9f657ae1 · Slices 42 to 43 · Connect

- `SetupChecklist.svelte` (+ test): Audio, MIDI, Microphone rows with a `led`, a status word for screen readers, a detail line and one action. Device cards with status LEDs and a live signal line, the MPC card with its diagnostics, routing as a table with segmented source controls, the on-screen fallback behind "Try the on-screen surface". "(Phase 2)" removed.
- Follow-up: the routing table scrolls inside its card at 375 (was 482 px).
- Connect test pins three checklist rows and the collapsed then shown fallback.

## c5c650be · Slice 44 · Tuner

- Modes in `?mode=`. Tune: the note at display size with the octave small, cents in mono, `ArcGauge.svelte` (+ test) with the neighbouring notes and a direction word ("Tune up" / "In tune" / "Tune down"), `StringStrip.svelte` (+ test) for guitar and ukulele with the nearest string lit and tap-to-target, the tuning picker and A4 under the stage, "Pluck a note" before sound arrives. Intonation keeps the trace and the four tiles behind the same gauge. Drone: twelve tonic chips on the degree-1 colour, timbre, volume, one Play or Stop; no microphone controls, no A4 row.
- Tuner test adds the mode round trip and the Tune gauge and A4 row.

## be7716ec · Slice 45 · Settings

- Groups Audio, Input, Latency calibration, Appearance, Your data as `SectionHeading` cards of `SettingsRow.svelte` rows (label, help, control on the right). Latency offsets gain 5 ms steppers. Your data: Export journal (JSON of `PracticeSessionStore` sessions through a Blob download) and Reset local data behind an inline confirm (deletes the Dexie database and `music*` localStorage keys, then reloads).
- Deviation from the proposal, noted: native range, checkbox and select stay. The kit `Slider` pattern in this repo is aria-hidden with an invisible native range beside it, so the native control is the accessible one; swapping would add markup without adding anything for the user.
- Settings test pins the five group headings in order, the row count, export and the confirmed reset, and the stepper; the persistence-failure test is unchanged.

## 7d4ec92f · Slice 46 · Guide

- The quick-start list becomes a live `SetupChecklist` reading the runtime and the journal: Enable audio, Connect an instrument or play on-screen, Run your first drill. One practice-loop card, seven `MusicToolCard` hub cards on hue plates (Practice, Library, Create, Progress, Connect, Tuner, Settings), offline as a footnote.
- New `guide/page.svelte.test.ts` pins the three rows and their fresh-device states (warn, off, off), the actions and the seven hub links.

## da221004 · Slice 47 · Docs, one live region, screenshots, gates

- `src/routes/music/AGENTS.md` gains the hub contract (tabs in the URL through the route-tab helpers, `SectionHeading`, the hub components, the phone grid pattern, one route-owned live region).
- The MPC diagnostic (Connect) and the pad LED hint (Create) stop announcing (`aria-live="off"`); the route status line already does. The guide test deletes the shared Dexie database before rendering, since other test files write sessions to it.
- Screenshots: `docs/screenshots/ui-pass/after/24-hubs/` (Library ×3, Create ×3, Progress, Connect, Tuner ×3, Settings, Guide) at 1280 and 375, light and dark; every route scrollWidth = viewport; live regions: the site shell's two (toast region and its assertive twin) plus at most one route status.
- b6cc14a9: the Settings playback select keeps room for its arrow (the label ran under it in the 1280 shot).
- e2e (own commit): the Progress spec pins "Weak spots and today's challenge" and the Streak calendar heading (the standalone labels are gone); the footer-follows-short-content check runs the tuner at 1280x1000 because the readout stage made the page about 780 px tall (same three assertions); the mobile footer check allows 1 px of sub-pixel text-metric rounding (measured 667.44 against 667).
- Gates for round 5 on the final code: check clean · unit 1624/1624 · build ✓ · Playwright 59/59 (56 on the first full run, the three above rerun green after the spec updates).

## Round 5 closed · 2026-09-04

Commits d891621d … 6c12c511 (14 commits) on `feat/practice-ui-pass`, not pushed, not merged. Waiting for "merge it".
- Left for later: `CentsGauge`/`CentsMeter` still exist (the Aerophone route uses `CentsMeter`); a Library song detail drawer; CAGED labels.

## Merged · 2026-09-05

Round 5 (d891621d … 6c12c511, 14 commits) fast-forwarded into local `main` at the user's request; main at 6c12c511. Not pushed; `main` stays ahead of origin by design.

## Uncommitted · 2026-09-17 · Review 21 (design, usability, curriculum) with in-tree fixes

- Written: `docs/music-redesign/review-21/` (README, findings, design, curriculum, research, implementation-plan, three HTML prototypes, screenshots before/after/prototypes). Review brief: `20-next-review-prompt.md`.
- Code (owner allowed changes mid-review; not committed): `PianoSurface` inset focus (white keys never cover black keys), middle-C mark, router-held highlight for MIDI, QWERTY release on blur; `MpcPadGrid` rewritten around a holders map (key-up, blur, pointer cancel, note-off, MIDI lighting, target ring, MPC-style pads); `DeviceProfile.padNotes` with presets and a Learn pads flow on Connect, canonical note rewrite in the runtime, `ignored` persisted, channel display fixed; `MusicNavigation` fills the viewport and collapses to a 56 px rail; dark music `--primary` lightened with dark ink, canvas wash uses the practice accent (not the instrument hue), kit `Progress` track on `bg-muted`, contrast test extended; `SoundEngine.playPattern` one-second look-ahead scheduler; Song Studio actions above a bounded score viewport, explicit Tab-unavailable branch; `StaffNotation` single cursor line; OSMD glyphs adopt `currentColor`; `FretboardInput` wood, string gauge, inlays; take rows get Play; kit panel explains an empty kit.
- Tests updated for intended behaviour: three PianoSurface label expectations ("middle C"), SongsView preview mock returns an epoch, licks and chord-scales page harnesses dispatch router events to every subscriber.
- Gates at hand-off: `vp check` passes after `vp fmt`; full `vp test --run` 1834 passed / 12 failed before the harness fix (all 12 in licks and chord-scales page tests, re-run recorded in review-21/README); Playwright not run.
- At the instrument: MPC pad map recipe (review-21/findings.md), preview cut-out check on Sampled Piano vs Warm Synth, quiet-take check, low-string tuner recordings.
- 2026-09-18 follow-up: owner reported the learned pad map "never stuck" and pads unresponsive on other routes. Simulated with a fake Web MIDI MPC: the map persisted and client-side navigation graded correctly; a full page load started with MIDI off (only a button ever enabled it). Runtime now remembers a successful enable (`music.midi.wanted`) and re-enables on startup when the browser permission is granted; Connect's pad-map select always lists the learned option. Tests: `_runtime.svelte.test.ts` (+2), runtime and Connect suites 72/72.
- 2026-09-18 second follow-up: Connect "Ignore" replaced by a Remove (×) per device with Rescan restoring all; a port's assigned instrument and pad map are applied once at the runtime boundary (`applyDeviceProfile`); one shared `MidiStatus` line on every drill (listening devices, removed count, last-note trace with the reason a note was not used) replaces the per-drill Enable MIDI buttons. Five-port simulation passes; `vp check` clean.
- 2026-09-18 third follow-up: root cause of the silent MPC on drills was the Controller Mode handshake (init + 1 s heartbeat) living only on the Connect page. It is now a saved link (`DeviceProfile.controllerLink`) the runtime keeps alive app-wide; Connect's panel offers Keep linked / Unlink; the drill MIDI line reports the link. Runtime, Connect, diagnostic and device-profile suites pass (91).
- 2026-09-18 02:05: owner confirmed on the real MPC One+ that Rudiments responds once the Private output is kept linked.
- 2026-09-18 Playwright: full run 76/79; the two backup specs failed on the C4 key's changed accessible name (middle C is now an `aria-description`, name back to "C4") and the footer spec on the sidebar's fixed viewport height (panel now absolutely positioned and sticky inside a stretching column). Re-runs: backup specs pass, route-apps 9/9 across three repeats (one narrow-menu focus failure in between did not reproduce). All 79 specs green across the runs.

## Committed · 2026-09-18 · Review 21 implementation plan executed

- All tickets of `review-21/implementation-plan.md` §A–C landed on `feat/practice-ui-pass` in one commit on top of 071bb37b (17 batches, file-disjoint, each task-reviewed with fix rounds, then a whole-branch review and one final fix batch). Highlights: follower wrong-note lifetime and a staff error mark; sight-reading hint gate recorded as hinted; Song Studio cursor kept in view, honest Tab (unreachable-note count, octave-up view), bar-numbered Start/End range handles; low-string pitch (0.85 clarity, 40 Hz worklet high-pass, wide-window rerun, stale-reading timeout, synthetic fixtures); take rename/note, input meter, playback gain, mini roll, note-off capture; offset calibration with a tap-along test; kit builder drag/assign/audition; Progress as three views; standalone `/music/record`; Demo mode with a beat lane on Two-Hand, Scales, MPC; together metric; MPC subdivision + click anchor, authored M2/M3 grooves with sections and dynamics; chord changes on a clock, positions-driven Spider, lick positions; inversions + 3-voice leading, contrary-motion pattern, comping generator (no route yet); scales hands together + persisted tempo ladder; instrument learning paths with locked/next.
- Defect found by the e2e pass and fixed at the choke point: `MusicRuntime.writeLocalState` now snapshots `$state` values before Dexie's `structuredClone`; MIDI takes previously never persisted.
- Spec corrections: curriculum M2 bar 1 is 12 hits (not 15); M3 totals 52 targets (not 58).
- Gates: `vp check` clean; `vp run -r check` 0; unit 2,209 / 231 files; build 0; Playwright 85/85.
- Follow-ups (ledgered): Check mode for Two-Hand/Scales/MPC (then remove learning-path `evidence: "guided-accepted"`); per-exercise success rules and score weights as data (E, F, G); comping route; `mpc` in `VIEWABLE_INSTRUMENTS`; sub-44 px setup selects, InstrumentSwitcher and rail links; "Record this" links on drill summaries; Practice Lab audio takes into the shared recorder; `timingZone` rename in tuner.ts; MusicXmlScore note-group selection regions when snap is "measure"; wide-window pitch rerun is a removal candidate after hardware recordings; MusicNavigation test cleanup.
- Physical checks (plan §D) still to run by the owner.
