# Practice OS UI and drill audit

Date: 2026-09-04. Branch `feat/practice-ui-pass` (worktree at `/Users/gaspard/orca/workspaces/PersonalWebsite/main`, same commit as `main`, 320209a7). Nothing has been changed yet; this document only records findings.

Method: every drill route plus the Practice home, Jazz reference, Jazz Path, Jam and the Library reference tab was loaded in headless Chromium at 1280 and 375 px, light and dark, in setup phase, and again after pressing Start where the start does not need a live audio clock. Page `scrollWidth` was compared with the viewport on every load. Screenshots: `docs/screenshots/ui-pass/before/<route>--<width>-<theme>.png` and `<route>--stage--<width>-<theme>.png`, with the numeric report in `report.json` and `stage-report.json` in the same folder. Code was read for all 17 routes and the shared shell. Path shorthand below: `R` = `src/routes/music`, `C` = `src/routes/music/_components`.

Companion research: [ux-research.md](ux-research.md). Proposal: [proposal.md](proposal.md).

## 0. Ranked summary

Ranked by impact on the one user (intermediate jazz pianist, Aerophone, short sessions, desktop and a phone propped on the piano).

1. **Starting a drill takes too long and looks like a settings page.** Four chrome layers (site header, music top bar, floating practice capsule, page header) take 160 to 190 px before the drill on desktop and roughly 40 percent of a 375 px screen. Below that sits a configuration card with 4 to 30 controls, then a Start button in its footer. Sight-reading, ear training and the daily routine then ask for a second Start. Only Scales and Two-hand collapse setup into a remembered summary line. See section 3.
2. **The stage does not read as one instrument surface.** Chord-Scale and Jam show two keyboards (a tone-role strip and an input keyboard); Licks and Chord-Scale never highlight the next expected note on the input keyboard; the Two-hand ready stage clips the right hand off screen inside a 22 rem aside with no scroll cue; hands are hue only at the key level and the hues change meaning between light and dark. See sections 1 and 3.
3. **Summaries are inconsistent and thin.** Six of the drills never show the delta against the last run; seven never show a next-up suggestion; XP appears in five different places or not at all; Spider and Aerophone summaries are one sentence plus XP; Reading and Ear render two headers and two action rows because a sub-component rebuilds what `DrillSummaryCard` already frames. See section 3.
4. **Five routes overflow horizontally at 375 px, Jam also at 1280 px.** Root causes are two components: `SegmentedControl` cannot wrap (`C/SegmentedControl.svelte:29`) and `AerophoneFingering` renders a fixed-width SVG (`C/AerophoneFingering.svelte:35-36`). Ear training's stage also overflows through a fixed 160 px orb in a three-column grid. See section 2.
5. **Token drift.** `primary`, `practice-accent`, `success` and `chart-*` are used interchangeably for "selected", "target", "done" and "hand"; three different stat-tile styles, hand-styled native selects, one invalid `hsl(var(--practice-accent))` shadow and hex fallbacks remain. See section 1.
6. **Copy has no single voice.** Start, Cancel and Retry each have five different labels; status sentences use a mechanical template with em dashes; engineering words (CC2 envelope, expected-target verifier, summary dimensions, listbox ids like JT9) appear in headings. See section 3.5.
7. **Accessibility basics are mostly present but fragile.** Every drill has a persistent live region and moves focus on phase change, but `aria-label` sits on plain `div`s in nine files, two to five live regions compete on most routes, tabs are `aria-pressed` buttons, two stage headings are `sr-only` while focused, and `animate-ping` has no reduced-motion guard. See section 4.
8. **Drill depth.** Every piano drill runs a fixed target set in one key with no timing grade except Rhythm and Chord Progression; nothing adapts beyond the Scales tempo ladder. See section 3.6.

Section 5 lists the prior decisions I intend to overturn, with the current rationale and mine.

## Per-route snapshot

| Route | Setup controls before Start | Remembered setup collapsed | Preview before Start | Stage surface | Delta vs last run | Next up | 375 px overflow | Shell use |
|---|---|---|---|---|---|---|---|---|
| `R/+page` (home) | 3 tabs, 2 filter rows | n/a | n/a | n/a | n/a | n/a | no | n/a |
| `play/voicings` | 5 segmented | no | text list of notes | `PracticeStage` + `InstrumentView` + latch `PianoSurface` | yes | yes | no | full |
| `play/two-hand` | 4 segmented + dynamics | yes (`<details>`) | keyboard, clipped | `PracticeStage`, one keyboard | no | no | no | full |
| `play/scales` | 4 selects + instrument | yes (`<details>`) | `InstrumentView` | `PracticeStage`, keyboard | yes | yes | no | full |
| `play/licks` | 1 segmented + 11 lick buttons | no | notes as text, audio | `PracticeStage`, keyboard, no next-note cue | yes | yes | no | full |
| `play/chord-scales` | 1 segmented | no | static chord list | chart stage + Card with second keyboard | yes | yes | no | full |
| `play/chord-perfect` | 4 to 8 controls, 4 modes | no | fretboard | fretboard in aside | no | no | yes (386) | partial |
| `play/chord-progression` | 3 segmented (11-option transpose) | no | chart stage | chart stage, mic only | no | no | yes (552) | partial |
| `play/mpc` | 1 segmented + 2 selects + hits | no | none | `PadRudimentStage` | no | no | yes (391) | full |
| `play/spider` | ~10 | no | none | `FrettedSequenceStage` | no | no | no | full |
| `learn/reading` | 10 to 14 | no | none | staff + keyboard, nested shell | no | no | no | partial |
| `learn/rhythm` | 3 + mode | no | none | `PracticeStage`, tap button | yes | yes | no (16 beats would) | full |
| `learn/ear` | 30+ | no | free play | bespoke session view | no | no | stage yes (419) | partial |
| `learn/aerophone` | 4 modes, 2 to 5 each, 21 chart buttons | no | 170 px fingering | plain `Card`, five identical bars | no | no | yes (416) | partial |
| `jam` | 4 segmented + select | n/a | n/a | chart stage + second keyboard | n/a | n/a | yes (577; 1521 at 1280) | none |
| `learn/jazz`, `learn/path` | reference | n/a | n/a | n/a | n/a | n/a | no | n/a |

## 1. Visual system inconsistencies

Ordered by how often the user sees them.

1. **Chrome stack.** Site header (48 px, `src/routes/+layout.svelte`), music top bar with search and streak chip (44 px, `C/MusicTopBar.svelte:33`), floating practice capsule row (52 px, `R/+layout.svelte:78-86`), then a 30 px h1 with a subtitle sentence (`C/PracticeScreenHeader.svelte:19-22`). Four visual bands of equal weight before the content. Screenshot: `play-voicings--1280-light.png`, `home--375-dark.png` (the capsule and top bar cover the first 40 percent of the phone screen).
2. **Selection and target colours drift across three tokens.** `primary` marks the tempo-ladder target (`play/scales/+page.svelte:459-463`), the selected fingering-chart cell (`learn/aerophone/+page.svelte:1023`), the recommended mixed-session card (`learn/ear/_components/EarTrainingLanding.svelte:271`), chord tones in the legend (`C/ProgressionChartStage.svelte:98-102`), fingering badges (`C/piano/PianoSurface.svelte:527`), the active change target (`play/chord-perfect/+page.svelte:1073`), and done path steps (`learn/path/+page.svelte:77-89`). `practice-accent` marks the current beat and the accented note in Rhythm (`learn/rhythm/+page.svelte:586-628`), target keys, the current chord symbol, the staff highlight, and the active lick number. The design-system doc (`03-design-system.md`) reserved `practice-accent` for target/focus on the stage and `primary` for chrome; the code no longer follows that. Note that the music scope in `src/app.css:237-259` re-tints `--primary` to the same violet as `--practice-accent` (light `oklch(0.52 0.2 277)`, dark `0.58` vs `0.62`), so inside `/music` the two tokens are visually one hue and a target key, a selected tab, a Start button and a done step all read as "violet thing". The fix is role discipline plus form (ring vs fill), not a new hue.
3. **Hand colours ride the chart palette.** Left hand = `chart-4`, right hand = `chart-2` (`C/piano/PianoSurface.svelte:345-355`, waterfall `:494-500`, legends in `play/two-hand/+page.svelte:388-397`). In `src/app.css:30-33` chart-4 is yellow and chart-2 teal; in `.dark` (`:108-111`) chart-4 is purple and chart-2 green. The same drill therefore has different hand colours in each theme (compare `play-two-hand--1280-light.png` with `play-two-hand--375-dark.png`). Hue is the only carrier at the key level; the text summary is `sr-only`.
4. **Three stat-tile styles.** `C/HudTile.svelte` (rounded-xl, 2xl value), `C/DrillProgressRail.svelte` rows (label left, value right), and hand-rolled tiles in Rhythm (`learn/rhythm/+page.svelte:440-457, 600-607`), Ear (`EarTrainingSessionView.svelte:157-184` rounded-2xl, `EarTrainingSessionRail.svelte:13-20`), Aerophone summary dimensions (`learn/aerophone/+page.svelte:851`), Two-hand score panel (`play/two-hand/+page.svelte` summary, 7xl number). Chord Progression uses `HudTile` as a text badge (`play/chord-progression/+page.svelte:501, 625`).
5. **Dead tiles before a run.** Voicings rail shows Accuracy 0%, XP 0, Skill (`play/voicings/+page.svelte` setup aside); Scales shows a Streak 0 days card; Chord-Perfect shows Strings 0/–, Clean 0%. The 09 design brief already called this out; it was not fixed.
6. **Hand-styled native `<select>`** in Scales (`:533`), Spider (`:629`), Chord-Perfect (`:1229, 1242`), MPC (`:424, 437`), Reading (`ReadingSetup.svelte` Key/Level/Transpose), Rhythm pattern (`:525`). Not `@repo/ui/select`. P2.8 deferred this deliberately; the inconsistency is visible next to segmented controls on the same card.
7. **Bespoke segmented groups** built from `Button` + `grid` in Ear (`EarTrainingLanding.svelte:97, 113, 137`) and Reading (`ReadingSetup.svelte` answer/prompt/instrument rows), next to `SegmentedControl` elsewhere on the same routes. The lick picker reimplements a wrapping segmented control (`play/licks/+page.svelte:451-461`).
8. **Two meter styles on one screen.** Aerophone hand-builds `bg-success` and `bg-primary/80` bars (`learn/aerophone/+page.svelte:1085-1125`) and uses `Progress` 40 lines later (`:1164-1190`). Five bars there render the same `breathLevel` under five names.
9. **Hardcoded colour remnants.** `C/StaffNotation.svelte:329` uses `shadow-[0_0_0_1px_hsl(var(--practice-accent)/0.22)]`; the token is OKLCH so the shadow resolves to nothing. `C/StaffNotation.svelte:128` patches VexFlow to `stroke="#444"`. `learn/reading/_components/FretboardInput.svelte:80-90, 145-176` keeps hex fallbacks (`#ef4444`, `#22c55e`, `#7c5cff`, `#d97706`, `#888`); the AGENTS rule permits documented `themeColor()` fallbacks, but these are the third-party-canvas exception leaking into a first-party colour role.
10. **Ad hoc typography.** `text-[10px]` and `text-[11px]` outside the `eyebrow` utility in MPC stage components (`C/PadRudimentStage.svelte:91, 94`, `C/MpcPadGrid.svelte:107`), Aerophone (`:917, 1100, 1127`), Ear (`:162`, Landing `:224, 237`), the staff highlight tag. Card titles sit at four sizes (`text-base`, default, `text-2xl`, `text-3xl h1`).
11. **Four callout styles for "what next".** `RoutineContinueAction` (`border-primary/30 bg-primary/5`), `NextUpSuggestion` (plain border), `SessionFeedback` (success/destructive tint), and the Mixed Session card (`border-primary/40`).
12. **Cover art on Drills cards** makes each card about 300 px tall (`C/MusicToolCard.svelte:59-61`), so the 16-card grid is a long single column on the phone; Paths cards are forced to `hue="reading"` regardless of content (`R/+page.svelte:159`).
13. **Dead code.** `learn/theory/_components/ChordDiagram.svelte` is imported nowhere and pins the `svguitar` dependency (`package.json`).

## 2. Layout and mobile problems

Measured `document.documentElement.scrollWidth` at 375 px (both themes identical):

| Route | scrollWidth | Widest offender | Cause |
|---|---|---|---|
| `jam` | 577 (1521 at 1280) | Style aside Card | `SegmentedControl` Transpose with 11 options and Progression with long names inside an aside with no `min-w-0` (`jam/+page.svelte:509-536`); intrinsic width blows the grid column at every width |
| `play/chord-progression` | 552 | `.inline-flex.items-center.gap-0.5` | same 11-option Transpose control (`:555`) |
| `learn/aerophone` | 416 | setup `section.grid` and both Cards | fingering chart `grid-cols-3` cells are 93 px but each button holds a fixed `width=84` SVG plus padding = 98 px (`:1012`, `C/AerophoneFingering.svelte:35-36`); drill segmented control with four options is about 450 px (`:950`); Landing interval control five options (`:967`) |
| `learn/ear` (stage) | 419 | combo / orb / accuracy row | `grid-cols-[1fr_auto_1fr]` with a fixed `size-40` orb (`EarTrainingSessionView.svelte:156-169`) |
| `play/mpc` | 391 | `.inline-flex` and `sm:grid-cols-2` | pattern segmented control (`:411`), Hit count + tempo row |
| `play/chord-perfect` | 386 | setup Card | four-option mode control plus Enable MIDI in the header row (`:1197-1203`) |

Other layout findings:

- **`SegmentedControl` is `inline-flex` without `flex-wrap`** (`C/SegmentedControl.svelte:29`). Any control with four or more options overflows at 375 px. Same root cause on home style chips, Jazz tabs, Path instrument picker, Licks category.
- **Two-hand ready stage clips the keyboard.** The setup aside is 22 rem (`play/two-hand/+page.svelte` setup grid `xl:grid-cols-[minmax(0,1fr)_22rem]`); the material spans C3 to C5 (15 white keys at the 36 px floor = 540 px), so `PianoSurface` scrolls inside `overflow-x-auto` and the right hand is off screen with no scroll affordance (`play-two-hand--1280-light.png`). Same risk in any aside that holds a keyboard.
- **Rhythm beat dots** are `size-11` with `gap-3` in a non-wrapping flex (`learn/rhythm/+page.svelte:586`); at 16 beats that is about 900 px. Summary tiles `grid-cols-3` and read-and-tap target `grid-cols-4` never collapse (`:439, 618`).
- **Reading staff highlight drift.** `StaffNotation.svelte:313` forces `min-w-[320px]` on the SVG inside an `overflow-x-auto` box, but the range highlight overlay (`:323-345`) is positioned against the wrapper, not the scrolled SVG, so the highlight moves off the notes when the staff scrolls.
- **MPC sequence lane** is 16 cells at `min-w-9` (`C/PadRudimentStage.svelte:84`) and the pad grid is a non-shrinking `inline-grid` (`C/MpcPadGrid.svelte:85`); both scroll instead of collapsing.
- **Ear setup is several screens long** before the primary Start (`learn-ear--375-dark.png`): setup card, free-play card, repertoire queue, then the Mixed Session card.
- **Aerophone fingering chart** renders 21 figures at about 259 px tall each on the phone (`learn-aerophone--375-light.png`, 3985 px tall page).
- **Floating capsule at 375 px** collapses to icons only (instrument icon, metronome icon, 96, timer icon 1), which is fine, but it sits over the h1 area on every route and covers content when scrolled.
- **Fixed viewport chrome on mobile** (site header 48 + top bar 44 + capsule 52 + bottom tabs 53) leaves about 615 px of a 812 px screen for the drill.

## 3. Drill UX problems

### 3.1 Setup friction

- **Config wall by default.** Only Scales and Two-hand hide setup behind a remembered summary (`<details>`, `play/scales/+page.svelte:512-522`, `play/two-hand/+page.svelte:392`). The other twelve show every control on every visit even though `initialDrillSearch` (`C/route-state.ts:36-58`) already restores the last setup on all of them.
- **Two Starts.** Sight-reading: Start Sight-Reading, then "Start count-in" (`learn/reading/_components/SightReadingSession.svelte:173-176`), and the button says count-in even in wait mode where none exists. Chord-Scale: Start drill, then "Play it back" per chord (`play/chord-scales/+page.svelte:333`). Home: Start routine sets state without navigating (`C/TodayPlan.svelte:64-67`), then "Start Ear Training", then the drill's own Start. Reading via the routine is four clicks from landing to playing.
- **Tempo is read-only text** in Scales (`:596-602`), Spider (`:706`), Chord-Perfect (`:1222`), Chord Progression (`:560`), MPC (`:452`), Aerophone (`:985`), Reading (`ReadingSetup.svelte:140-142`). It lives in the floating capsule, and nothing on the card says so.
- **Primary action buried.** Ear's "Start Mixed Session" is the fourth card down (`EarTrainingLanding.svelte:271-289`). Home with history puts the single most relevant action ("Practice Rhythm") as an outline button in the aside (`C/TodayPlan.svelte:223-225`).
- **Raw inputs where a picker belongs.** Reading Difficulty is a 0..1 number field, Measures a number field (`ReadingSetup.svelte:325-333`); Rhythm Beats a number field.
- **Start affordance drift.** `StartShortcut` (Space) is present on nine drills and absent on Reading, Aerophone, Ear, Chord Progression.
- **Instrument race in the capsule.** On piano-pinned drills the capsule shows the previous route's instrument until `registerPracticeContext` resolves (`play-two-hand--1280-light.png` shows Guitar on a piano-only drill; a later capture shows Piano).

### 3.2 Unclear targets on the stage

- **No next-note cue on the input keyboard** in Licks (`play/licks/+page.svelte:541`, screenshot `play-licks--stage--1280-dark.png`) and Chord-Scale (`:643`). The user plays 8 to 23 notes against a text list.
- **Two keyboards, one target.** Chord-Scale stacks the `ProgressionChartStage` tone strip (target tones lit) above a Card with a blank input keyboard (`play-chord-scales--stage--1280-light.png`). Voicings shows an `InstrumentView` target keyboard above a blank input keyboard (`play-voicings--stage--375-dark.png`), and on the phone the 12-key reference list still renders below the stage in focus mode. Jam does the same at every width. The tone roles and targets never reach the keyboard the user plays.
- **Hands.** Sight-reading shows hands three ways (text hint, key hue, fingering number) but the hue legend exists only in the waterfall's mute buttons (`PianoSurface.svelte:545-565`); the staff view has none. Two-hand's legend is a route-level snippet (`play/two-hand/+page.svelte:388-397`), so every route re-invents it.
- **Wait mode with a mouse.** `PianoSurface` `pointerMode="hold"` releases on pointer up, so a mouse cannot build a chord; only Enter/Space latching does (`C/piano/PianoSurface.svelte:389-392`, `piano-input.ts:129-137`). Voicings opts into `pointerMode="latch"` but shows no affordance until the first latch ("Clear held notes" appears after, `:569-577`). Sight-reading stays in hold mode, so a mouse user cannot pass a two-note group.
- **Repeated notes need a fresh attack** across consecutive groups (`packages/music-core/src/engines/score-follower/index.ts:107-160`, `clearHold()` on advance). This is correct for a real repeated note, but the stage never says why the still-held key does not count.
- **Microphone hint placement.** `MicrophoneGatePanel` sits above the session card (`learn/reading/+page.svelte:800-807`), detached from the keyboard whose keys it tints `bg-info/20` (`PianoSurface.svelte:358`); the required fallback sentence is the third line of a card, not next to the keys.
- **Aerophone stage** is a plain `Card` (`:1036`), not `PracticeStage`; five bars show one value; the swell envelope is a constant (`:205`); articulation cells draw a static target (`:1121-1130`); no pitch readout though `CentsMeter` and `PitchTrace` exist.
- **Stage headings hidden.** MPC (`play/mpc/+page.svelte:468`) and Spider (`:725`) focus an `sr-only` h2 on stage entry, so a sighted keyboard user sees focus vanish.
- **Focus mode is inconsistent.** In the stage sweep, Two-hand, Voicings, Scales, MPC, Spider, Rhythm and Licks set `drill-focus`; Chord-Scale, Reading, Ear and Aerophone keep all four chrome bands while running (`stage-report.json`).

### 3.3 Weak live feedback

- Voicings, Licks, Chord-Scale, Scales, Two-hand show a progress bar and a count; no per-note correct/wrong on the keys during the run except through `PianoSurface` `active`/`wrong` roles where the route wires them (Reading does; Licks and Chord-Scale do not).
- Rhythm shows no timing meter during the run; `TimingMeter` appears only in the summary (`learn/rhythm/+page.svelte:438`).
- Ear's combo tile with an emoji (`EarTrainingSessionView.svelte:162`) is the most prominent live element and carries no information about the answer.
- Status sentences do the work of state: "Play the voicing, then press Check.", "Hear the scale for each chord, then play it back.", "Play the lick…". Two to five `aria-live` regions per route compete (see section 4).

### 3.4 Summaries

- **Contents differ per drill.** Delta vs last run: Voicings, Scales, Licks, Chord-Scale, Rhythm only. Next-up: same five. Slower: Two-hand, MPC, Scales, Rhythm (tempo ladder). Per-item breakdown: Chord-Scale (per chord), Two-hand (per hand), Reading (last 5), Ear (by drill + confusions). None: Spider, Aerophone, Chord-Perfect, Chord Progression (also no XP though it is recorded, `:399`).
- **XP appears in five places**: heading (Voicings, MPC), `SessionFeedback` badge (Two-hand, Chord-Perfect), status string only (Licks, Chord-Scale), rail tile (Ear), nowhere (Chord Progression). The research note on single-user gamification applies (ux-research.md, section 5).
- **Duplicated frames.** Reading renders its own eyebrow + h2 + subline inside `DrillSummaryCard` under the card's h2 (`learn/reading/_components/ReadingSummary.svelte:51-57`, `+page.svelte:719`) and puts actions in the body while the footer holds Change setup. Ear hides its embedded header with `[&>section>header]:hidden` (`learn/ear/+page.svelte:743`) and shows two action rows. Chord-Perfect restates the same percentage twice (`:1135, 1146`). Spider shows a red X beside "Spider complete" whenever the run was imperfect (`:547-554`) and prints raw MIDI numbers (`:549`).
- **"Change setup" means different things**: Rhythm wires it to repeat (`learn/rhythm/+page.svelte:429`); elsewhere it returns to the config card.

### 3.5 Copy

One voice is missing. Collected from all routes:

- Start: "Start drill", "Start Scale", "Start Rhythm", "Start rudiment", "Start spider", "Start changes", "Start verifier", "Start long tone", "Start Flashcards", "Start Mixed Session", "Play it back", "Start".
- Cancel: "Cancel drill", "Cancel rhythm", "Cancel spider", "Cancel rudiment", "Cancel long tone" (four mode variants), "End run", "End session", "Stop".
- Retry: "Repeat drill", "Repeat voicings", "Repeat lick", "Repeat rudiment", "Repeat spider", "Repeat", "Practice again", "Practice next tempo", "Retry mistakes", "Repeat session".
- Source readout label: "Input", "Playing on", "Answer by", "Active input", "Soloing on"; device: "On-screen", "On-screen keys", "On-screen pads", "On-screen fretboard", "Playing · piano", "Waiting for Aerophone".
- Status template: "Preparing your X history." / "Ready for X practice." / "Setup ready. Change the X settings or start again." on eight routes; em dashes inside status strings that tests assert verbatim (`play/chord-scales/+page.svelte:431`, `play/chord-progression/+page.svelte:298`).
- Engineering vocabulary in headings: "Breath CC2 · MIDI", "Target CC2 envelope", "Summary dimensions", "Drone interval lane", "Articulation attack grid" (Aerophone); "Expected-target verifier", "Chord-perfect check", "Open chord ID scored" (Chord-Perfect); "matched in-time" (Chord Progression); "JT9", "JT10–11", "Julian's pick" (Jazz); "Signed offset", "Through pattern" (Rhythm).
- Mode names differ between setup, rail and code: Learn/Assess vs wait/performance vs "Learn mode"/"Assess mode" (Reading); Pocket vs listen; Pulse vs Rhythm vs pattern.
- Every `PracticeScreenHeader` subtitle contains an em dash (`R/+page.svelte:88`, `play/voicings/+page.svelte`, `learn/rhythm/+page.svelte:391`, …).
- Discouraging or redundant lines: "Results are logged only after the full routine is complete." (`C/TodayPlan.svelte:165`); "Every chord implies a scale…" twice on one screen (`play/chord-scales/+page.svelte:584, 611`); step-list "1. Hear it, 2. Play it back" beside the same two buttons (`play/licks/+page.svelte:498-500`); changelog prose "The path now treats scale-degree function as the spine" (`EarTrainingLanding.svelte:295-298`).
- Catalog verbs vary per card: "Open the lab", "Open fingerings", "Start rudiments", "Practice scales" (`C/musicCatalog.ts`).

### 3.6 Depth and repetition

- Voicings: 36 fixed chords, always the same order of keys, no timing.
- Licks: fixed 150 BPM (`:55`), pitch order only, octave-lenient, no transposition.
- Chord-Scale: two change sets, always in C, eight ascending notes per chord, no click.
- Scales: one scale per run; the tempo ladder is the only adaptation.
- Two-hand: five patterns, two bars, per-hand accuracy and evenness; no dynamics feedback beyond a contrast number.
- Rhythm: one bar, one tap target, no subdivision display, no swing.
- Ear: strongest engine (adaptive mix, confusion retry, repertoire transfer) behind the heaviest setup.
- Aerophone: one held note per run, static targets, no pitch feedback.
- Jam: chords advance only by clicking "Next chord" (`jam/+page.svelte:246-249`); the backing track and the chart are not linked; no chorus loop, no chord-tone hit rate.
- Chord Progression is microphone-only and guitar-only (`:396`); a pianist cannot use it. Spider, Chord-Perfect and MPC are string or pad drills.

## 4. Accessibility

- **`aria-label` on elements without a role** (dropped by assistive tech): `ReadingSetup.svelte:90, 123, 147, 165, 197, 214, 247, 264`; `learn/rhythm/+page.svelte:611`; `C/ProgressionChartStage.svelte:69`; `play/scales/+page.svelte:454`; `learn/aerophone/+page.svelte:847, 985, 1060, 1096, 1104, 1131`; `EarTrainingLanding.svelte:97, 113, 137, 153`; `learn/ear/+page.svelte:760, 794`; `learn/reading/+page.svelte:759`.
- **Competing live regions.** Reading has five (`aria-live` count from the sweep), Rhythm five, Scales four, Ear four, MPC three including one inside `MpcPadGrid` (`:121`). Announcements overlap when a run starts.
- **Tabs without tab semantics.** Home Today/Drills/Paths, Jazz sections, Reading activity and Ear answer modes are `aria-pressed` buttons (`C/SegmentedControl.svelte`), not `tablist`/`tab`.
- **Wrong role.** Jazz chord list is `role="listbox"` containing `button aria-pressed` (`learn/jazz/+page.svelte:137-151`); icon-only Play buttons there have no name (`:252-259, 293-300`).
- **Hue-only meaning.** Hands at the key level (section 1.3); chord/scale/avoid legend dots (`C/ProgressionChartStage.svelte:98-102`); tempo-ladder lock state (`play/scales/+page.svelte:466`); confusion heat intensity (`EarTrainingSummary.svelte:18`).
- **Focus.** MPC and Spider focus an invisible heading (section 3.2). Reading's staff highlight and expected-note buttons carry no `aria-current`. Ear's `animate-ping` orb (`EarTrainingSessionView.svelte:171`) is not gated by the global reduced-motion rule because the rule neutralises transitions and animations by duration but the orb is a continuous keyframe; verify in browser.
- **Redundant announcements.** Aerophone chart buttons announce three times (button label, inner `svg role="img" aria-label`, figcaption; `:1016`, `C/AerophoneFingering.svelte:39-50`). Ear combo emoji is read aloud.
- **Orphan labels.** `id="change-format-label"`, `change-repetitions-label` (`play/chord-perfect/+page.svelte:1249, 1264`) and `spider-order-label` (`play/spider/+page.svelte:692`) are never referenced.
- **Good and worth keeping**: one `sr-only` polite region per route for phase changes; route-owned focus moves to a heading on each phase; `PianoSurface` keys are named buttons with `aria-pressed` and visible focus rings; static diagrams contribute one text summary and no tab stops (`PianoSurface.svelte.test.ts:107-116`); floating capsule buttons have names and pressed state.

## 5. Prior decisions I intend to overturn

Each entry: current decision, where it comes from, what I would change, why it is better for a practising musician. Behaviour changes ship as separate commits with tests updated in the same commit. Items marked **needs your yes** are the ones the brief reserves for you.

1. **Setup is a full card, expanded, with Start in its footer.**
   Source: `R/AGENTS.md` "Structured drills must use PracticeDrillShell with setup → stage → summary; setup is the only phase that renders setup controls"; `08-usability-plan.md` deferred "collapsed setup cards" after U1 because remembered configs made it lower value.
   Change: the shell owns a compact setup phase: one line summary of the remembered setup with an Edit toggle, the stage rendered in ready state underneath (target visible, keyboard live), and one large Start with the Space hint. Editing expands the controls in place. `<details>` already does this on two routes; it becomes the shell default.
   Why: the target is what a musician needs to see before starting, not the settings. Research: Tenuto and Functional Ear Trainer keep parameters one tap away, Simply Piano and flowkey show the material before play (ux-research.md, section 2).

2. **Per-page header with h1 + subtitle sentence + source pill.**
   Source: `R/AGENTS.md` "The Practice OS shell uses per-page headers, not a global status bar. A big h1, subtitle, and right-aligned controls."
   Change: drill routes use a compact header: h1 at `text-2xl`, no subtitle sentence (the description already lives on the Drills card and the catalog), source pill and mode chips on the same row. The music top bar (search + streak chip) hides on drill routes below `lg` and during any run; streak/XP move to the Practice home only.
   Why: the four-band chrome stack is the first thing the user sees on every visit and is the main reason the app feels like a settings page. The subtitle is marketing copy for a single user who wrote it.

3. **Wait mode on-screen chords require Enter/Space latching; pointer is press-and-hold.**
   Source: `PianoSurface` `pointerMode` default `hold`; brief's known open items.
   Change: when a wait-mode group has more than one note and the pointer is the input, `PianoSurface` latches automatically and shows a "Holding: D4 F4 A4 · Clear" chip on the stage; a single-note group keeps hold. Voicings' silent latch gets the same chip from the first press. Repeated notes across groups keep requiring a fresh attack (that is how the instrument works), but the stage says "Play D4 again" when the still-held key is the next target.
   Why: a mouse has one pointer; a chord is several notes. The current model makes a two-note sight-reading group impossible with a mouse and invisible with a trackpad. The re-strike rule is correct and should be explained rather than changed. Tests to update: `PianoSurface.svelte.test.ts` "a plain activation plays one momentary note", "pointerMode=latch builds a chord from sequential clicks"; `score-follower.test.ts` stays as is.

4. **Hand colours are `chart-4` and `chart-2`.**
   Source: `PianoSurface.svelte:345-355`, `piano-timeline.ts`.
   Change: two theme-stable tokens `--hand-left` and `--hand-right` (light and dark values, named by role, registered in `@theme inline`), plus a form marker: left-hand targets carry a stripe or outline and a small "L" glyph, right-hand a solid fill and "R", and `PianoSurface` renders its own legend whenever any highlight carries a hand. Own commit for the tokens.
   Why: hue is the only carrier today, and the hue flips between themes. Hard constraint in the brief. Two-hand and Reading each hand-roll a legend; one legend in the component removes both.

5. **XP and streak in the top bar and in every drill heading.**
   Source: P1b (`PROGRESS.md`): "slim persistent header chip shows streak · XP · Level".
   Change: summaries lead with accuracy or the drill's own primary metric, then the delta against the last run, then one next-up action; XP becomes a small muted line. The header chip leaves drill routes (see 2) and stays on Practice home and Progress. Engines, persistence and journal records are untouched.
   Why: ux-research.md section 5 and the anti-pattern list: for a single user, XP adds load without information; the trend against the last run is what motivates. Streak stays visible where planning happens.

6. **Free-text `status` strings drive the stage and the live region.**
   Source: every route keeps a `status` `$state` string and 2 to 5 live regions.
   Change: one live region per route (already present), fed by a short state-to-sentence map in the route; MIDI status, mic status and preview messages become plain text, not live. Copy is unified: Start / Stop / Again / Slower / Change setup; source pill "Input: MIDI · Piano" everywhere; status lines are sentence case, no em dashes, no template.
   Why: competing live regions talk over each other for screen-reader users, and the visible sentences are the reason the drills feel wordy. Tests that assert the old sentences are updated in the same commit.

7. **"Start routine" on Today sets state and stays on the page.**
   Source: `C/TodayPlan.svelte:64-67` (P2.1).
   Change: Start routine navigates to the first step with `routine=1`, landing in the compact setup of that drill; Today's card while a routine is active shows the current step with one Continue button; the "Results are logged only after the full routine is complete." line goes.
   Why: today the primary button appears to do nothing, and the routine costs three clicks before sound. Behaviour change, own commit, `R/page.svelte.test.ts` and `music-routine.spec.ts` updated.

8. **Focus mode is opted into per route via `DrillFocusScope active={…}`.**
   Source: U8 (`08-usability-plan.md`).
   Change: `PracticeDrillShell` mounts `DrillFocusScope` itself with `active = phase === "stage"`; routes drop their own copy. Shell stays presentation-only (it reads the phase it is given).
   Why: the sweep shows only Licks entering focus mode among the drills that started; the others keep four chrome bands while the user plays.

9. **Chord-Scale and Jam render a tone-role strip and a separate input keyboard.**
   Source: `ProgressionChartStage` design (P3.1 "visualizers on the stage").
   Change: one `PianoSurface` per stage: the input keyboard carries `toneRoles` and the target highlights; the chart stage keeps the chord cells and legend only. `InstrumentView` grows a `hands` input so Theory and Jazz upper structures can show left/right (data already exists in `learn/jazz`).
   Why: the one-keyboard rule in the brief, and the user's eyes should land on the keys they play.

10. **Drill catalogue.** **Needs your yes.** Chord Progression is guitar and microphone only, Spider and Chord-Perfect are string drills, MPC is a pad drill. I do not propose deleting any of them (the catalog documents that you also play guitar, ukulele and MPC). I do propose: give Chord Progression a MIDI/on-screen input path so a pianist can use it; leave Spider, Chord-Perfect and MPC restyled but unchanged in behaviour in this round.

11. **Navigation and IA.** Keep the four hubs and the URLs (tests, bookmarks and `musicCatalog.ts` depend on them). Change only: Practice home tab state moves into the URL (`?tab=drills`), Drills cards lose the cover band on the phone and become compact rows, and the Learn/Play split in URLs stays invisible to the user. Not overturning the "no Home" and "four hubs" decisions.

12. **Colour system.** Keep chrome on the site theme (hard constraint). Tighten roles rather than redesign: `practice-accent` = the one thing to play or hear now; `success`/`warn`/`destructive` = judgement; `primary` = chrome actions only; `info` = a hint that never grades (microphone, upcoming). Add `--hand-left`/`--hand-right` (item 4) and a `--stage-target` alias only if the accent proves too strong on the light stage. Own commit, every token with light and dark values.

## 6. What I am leaving alone and why

- The wait-mode rules "one source owns a chord" and "repeated notes need a fresh attack" (`score-follower/index.ts`): both match how a piano behaves and are covered by seven tests; item 3 above explains them on the stage instead.
- Microphone gate: hint only, fallback sentence unchanged, thresholds untouched (hard constraint).
- Engines, scoring, persisted shapes, journal records, XP formulas: no change; only where XP is displayed.
- `SegmentedControl` stays a `role="group"` of `aria-pressed` buttons for real toggles (instrument, variant); it gains `flex-wrap`. Where it is used as tabs (home, Jazz, Reading activity) it becomes a `tablist`, in the same slice as that route.
- Native `<select>` for long option lists (keys, scales, pads, tunings): accessible and mobile-friendly, per the P2.8 deferral; they get the shared input styling rather than a popover swap.

## 7. Verification data

- `docs/screenshots/ui-pass/before/report.json`: 72 loads, per-route `scrollWidth`, `innerWidth`, button and live-region counts, console errors. The only console error was a dev-server "Outdated Optimize Dep" 504 on the first home load, not a product issue.
- `docs/screenshots/ui-pass/before/stage-report.json`: 44 start attempts; drills that use the transport count-in (Two-hand, Voicings, Scales, MPC, Spider, Rhythm, Aerophone) stayed in "Starting" for a 2.5 s wait and were re-captured with an 8 s wait (`*--stage--*` files); Licks, Chord-Scale, Reading, Ear started immediately. At 375 px the running stage still overflowed on MPC (391), Ear (419) and Aerophone (416).
- Unit and Playwright suites were not run for this document; nothing was changed.
