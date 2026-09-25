# 15 · Round 5 proposal: the seven hub pages

Status: **built 2026-09-04** (slices 1 to 9 on `feat/practice-ui-pass`, d891621d … 7d4ec92f plus docs; see CHANGELOG.md). Approved 2026-09-04 with decisions: Library sorts by last practised, "Your data" (export and reset) is in this round, the string strip is guitar and ukulele only, the streak calendar toggles between one month and a 12-week heatmap. Companions: [13-hub-references.md](13-hub-references.md), [14-hub-patterns.md](14-hub-patterns.md), the design canvas (section 6). Nothing is built until this is approved. Same rules as round 4: tokens only, `@repo/ui` primitives, one live region per route, hue never the only carrier, behaviour and restyle in separate commits, tests updated deliberately and never weakened, gates before each commit.

## 1. What changes, in one screen

- **One shell for the hubs.** Every hub uses `PracticeScreenHeader` plus a URL-backed tab strip (`?tab=` on Library, `?mode=` on Create and Tuner) through one `useRouteTab` helper; one `SectionHeading` component replaces the three heading styles; sub-views stop mounting their own `PracticeScreen` and `<title>`.
- **The object is the card.** Song, kit, take, device, string and skill each get a card with their state on it; every empty state has one action.
- **One hero per page.** Library the shelf, Create the grid on a hardware stage under one transport strip, Progress today's ring with the week bars, Connect the setup checklist, Tuner the note and the arc gauge, Settings grouped rows, Guide a live checklist.
- **Kit controls.** `@repo/ui` Slider, Select and Toggle replace native inputs in Connect, Settings and the recorder.
- **Phone.** The piano roll and the mastery grid scroll inside their containers; no page scrolls sideways.

## 2. Page by page

### Library `/music/library?tab=songs|reference|import`
Songs: `SongCard` shelf (hue plate by instrument, title, key, tempo, instrument, last practised, mastery bar) sorted stale-first with A to Z and instrument sorts; a detail drawer at desktop with Practise in Song Studio, Hear it, Log practice, the repertoire-transfer queue count and mastery by skill. Reference: search, chord/scale toggle, saved list; the detail shows notes as degree-coloured chips (round-4 tokens), the instrument view on a stage panel with inversions, "where it lives", "scales that fit" and "practise it" cards linking drills. Import: a three-step flow (drop, preview with parsed tracks and key, save and practise) with Transcribe as its sub-mode sharing the preview. The reference-tab console error is reproduced and fixed. Engines unchanged; the shelf reads what `SongLibrary` and `SkillGraphStore` already know.

### Create `/music/create?mode=beat|piano-roll|recorder`
One `TransportStrip` (Play, Stop, BPM from the shared practice context, bars, Clear, Export, Save to Song Studio) above every mode. Beat grid on a `PracticeStage` with row labels, beat numbers, a playhead, steps in the MPC hue with velocity as opacity, a kit strip whose tiles show a waveform glyph, pads under the grid. Piano roll on the stage, the grid scrolling inside its container (fixes 746 px at 375), track chips coloured per track. Recorder: `TakeCard`s with a waveform bar, duration and source, Take A / Take B compared side by side. Engines unchanged.

### Progress `/music/progress`
Title "Progress". Hero row: today's XP ring, the streak with week dots, the week as seven bars with the best day marked. Skill map on a stage panel. "Practise next" merges weak spots and the daily challenge into one list of actions with drill deep links (through `earTrainingHrefForSkill` and the dashboard `hrefForSkill`). Challenges as compact rows. Mastery grid as today. A real month calendar (`StreakCalendar`) replaces the 14-day strip. Recent instruments as round chips. The unused `ready` state goes.

### Connect `/music/connect`
`SetupChecklist` at the top (Audio, MIDI, Microphone; each row a `led`, a status line and one action) reading the runtime. `DeviceCard` per device (status LED, alias, instrument select, ignore toggle, last message and a signal bar). MPC hardware as one card with its diagnostic buttons. Routing as a table (instrument rows, MIDI / Audio / On-screen radios, surface select). On-screen fallback collapsed behind one button. "(Phase 2)" removed. Preferences still saved through `DeviceProfileStore`.

### Tuner `/music/tuner?mode=tune|intonation|drone`
Tune: the note at 132 px in the display face with the octave small, cents in mono, an `ArcGauge` with the neighbouring notes and a direction word ("tune up", "in tune", "tune down"), a `StringStrip` for guitar and ukulele (nearest string lit, tap to target, tuning picker), "Pluck a note" before sound arrives, microphone Start and Stop on the stage. Intonation: the arc gauge plus the pitch trace and the four tiles. Drone: twelve tonic chips (degree colour on the tonic), timbre, volume, one Play or Stop; no microphone controls, no A4 row. A4 only under Tune. Engines unchanged (`tunerReading`, `IntonationSession`, the drone methods).

### Settings `/music/settings`
Groups Audio, Input, Latency, Appearance, Your data, each a card of `SettingsRow`s (label, help, control on the right). Sliders, selects and toggles from `@repo/ui`; latency offsets as steppers. Your data adds Export journal (JSON of `PracticeStore` sessions) and Reset local data behind a confirm. Values still flow through `MusicSettingsStore`.

### Guide `/music/guide`
A live `SetupChecklist` (audio enabled, device connected or on-screen chosen, first drill done, read from the runtime and the journal), one "practice loop" card, six hub cards on hue plates, offline as a footnote. Gains a unit test that pins the three checklist rows and their state.

## 3. Components

New in `src/routes/music/_components/`: `SectionHeading`, `SongCard`, `TakeCard`, `DeviceCard`, `SetupChecklist`, `ArcGauge`, `StringStrip`, `WeekBars`, `StreakCalendar`, `SettingsRow`, `TransportStrip`; `useRouteTab` in `route-state.ts`. Each with a component test. `HueMotif` gains nothing; the hub cards reuse `MusicToolCard` plates.

## 4. Slices and order (after approval)

1. ✓ `useRouteTab` and `SectionHeading`; Library and Tuner tabs written to the URL (behaviour).
2. ✓ Library: sub-view shells flattened, `SongCard` shelf and detail drawer, reference detail with degree chips, import flow (behaviour, then restyle).
3. ✓ Create: `TransportStrip`, grid on the stage, kit strip, piano roll container scroll, `TakeCard`s.
4. ✓ Progress: rename, hero row with `WeekBars`, Practise next list, `StreakCalendar`.
5. ✓ Connect: `SetupChecklist`, `DeviceCard`, routing table, fallback collapsed.
6. ✓ Tuner: modes in the URL, `ArcGauge`, `StringStrip`, Drone without mic controls.
7. ✓ Settings: `SettingsRow` groups, Your data. Native controls kept (the kit Slider pattern is aria-hidden); noted in the CHANGELOG.
8. ✓ Guide: live checklist, hub cards, unit test.
9. ✓ Docs: AGENTS.md hub contracts, CHANGELOG, screenshots at 1280 and 375 in both themes.

Gates per commit: `vp run -r check`, `vp test --run`, `vp run -r build`, Playwright; keyboard walk on Library tabs, Tuner modes and Settings rows; one live region per route confirmed by the screenshot sweep.

## 5. Tests that change deliberately

Library page test (tab URL round trip added, sub-view heading assertions move from h1 to the section heading), Create page test (transport strip labels), Progress page and e2e (title "Progress"), Connect page test (checklist rows, routing table cells), Tuner page test (`?mode=` round trip, arc gauge present, no A4 row in Drone), Settings page test (row labels, Your data), new Guide page test. Every existing behavioural assertion stays.

## 6. Mockups

Design canvas: https://claude.ai/code/artifact/126c50b4-ae43-45c0-b537-b820ed1805a5 (static mockups, drawn on the round-4 system). Artboards: Library Songs, Library Reference, Library Import, Create Beat grid, Create Recorder, Progress, Connect, Tuner Tune, Tuner Drone, Settings, Guide, and phone versions of Tuner, Progress and Library.

## 7. Decisions still needed from you

1. Library sort default: stale first (proposed) or last practised.
2. Settings "Your data": include Export journal and Reset local data in this round, or leave data management for later.
3. Tuner string strip: guitar and ukulele only (proposed), or also show it for piano as a note strip.
4. Progress calendar: one month (proposed) or a 12-week heatmap.
