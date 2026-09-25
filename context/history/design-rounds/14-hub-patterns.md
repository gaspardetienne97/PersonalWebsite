# 14 · Hub patterns: how each hub page should look and work

Round 5, 2026-09-04. For each of the seven pages: what reference apps do, the pattern to adopt, and the concrete change to our page. The round-4 rules stand (tokens only, `@repo/ui` primitives, one live region per route, hue never the only carrier, display face on titles and numbers, stage as hardware where sound happens).

## Cross-cutting

- **One header, one tab strip, tabs in the URL.** `PracticeScreenHeader` with a `SegmentedControl` whose value round-trips through `?tab=` (Library, Create) or `?mode=` (Tuner). Sub-views never mount their own `PracticeScreen` or `<title>`.
- **One section heading.** A `SectionHeading` component (eyebrow + display-face title + optional action) replaces the three styles in use (`Card.Title` only, `h2.eyebrow`, bare `h2.text-xl`).
- **The object is the card.** Songs, kits, takes, devices and skills each get one card with their state on it; empty states have one action.
- **Hero first.** Each page has one element at the top that carries the page: Library the shelf, Create the grid or roll, Progress today's ring and week bars, Connect the device list with a live signal, Tuner the readout and needle, Settings the audio row, Guide the setup checklist.
- **Controls from the kit.** `@repo/ui` Slider, Select, Toggle and Input replace native `<select>` and `<input type=range>`.
- **Phone.** Wide surfaces (grid, roll, mastery grid) scroll inside their own container; the page never scrolls sideways.

## Library (`/music/library`)

| References | Pattern | Our page |
|---|---|---|
| forScore metadata, MuseScore grid, Soundslice practice lists | A shelf of song cards with musical metadata; open goes to practice; a reference explorer; import as a short flow | Tabs Songs / Reference / Import written to the URL. **Songs**: a shelf of cards (hue plate by instrument, title, key, tempo, instrument, last practised, mastery bar, "Practise" opens Song Studio, secondary "Log practice"); a detail drawer on the right at desktop; empty state with one "Import a song" action. **Reference**: search on the left, chord/scale toggle, saved list; detail card with name, notes and intervals as degree-coloured chips (round-4 tokens), `InstrumentView` on a stage panel, "Hear it" and "Save". **Import**: one flow, drop zone → parsed preview (tracks, key, bars) → "Save to repertoire" and "Practise now"; Transcribe as its sub-mode with the same preview. Nested `PracticeScreen` and titles removed; dead subtitles become card descriptions. |

## Create (`/music/create`)

| References | Pattern | Our page |
|---|---|---|
| Ableton Note grid, Koala pads, GarageBand transport | Transport strip fixed above the surface; the surface on a hardware stage; pads show their content; kit colour drives the step colour | One **transport strip** (Play, Stop, BPM chip from the shared practice context, bars, Clear, Export, Save) above every mode. **Beat grid** on a `PracticeStage`: row labels left, beat numbers and a playhead on top, steps in the MPC hue with velocity as opacity, kit picker as a horizontal strip of pad tiles (name plus a small waveform glyph). **Piano roll** on the stage, the grid scrolling inside its own container (fixes the 746 px phone overflow), track chips coloured per track, velocity lane under it. **Recorder**: takes as cards with a waveform bar, duration, source; Take A / Take B compare as two cards side by side; the on-screen keyboard on the stage. The "Studio" panel header rows become the transport strip. |

## Progress (`/music/progress`)

| References | Pattern | Our page |
|---|---|---|
| Modacity rings, Strava week bars, Duolingo streak calendar, Melodics personal best | Today's ring as the hero, the week as bars, streak as a calendar, everything else as actions | Title "Progress" (nav and page agree). **Hero row**: today's XP ring (display-face number), streak with the week dots, level, and one "Practice next" action. **This week**: seven bars of XP with the best day marked. **Skill map**: the capability graph as today, on a stage panel. **Practice next**: weak spots and the daily challenge as one list of actions with drill deep links. **Challenges**: compact rows with a progress bar each. **Mastery**: the grid as today (two-up on the phone, Show all). **Streak calendar**: a real month grid with practised days filled in the success token. Recent instruments as round chips in the instrument hue. |

## Connect (`/music/connect`)

| References | Pattern | Our page |
|---|---|---|
| Device sheets in Note and GarageBand, hardware apps | Status dots, a live signal, a setup checklist, routing as a table | **Setup checklist** at the top: Audio (enabled or waiting), MIDI (n devices or not requested), Microphone (allowed, denied, not requested), each row with its one action. **Devices**: a card per device with a `led` status dot, alias input, instrument select, ignore toggle; the last MIDI message under the card as a live signal line; empty state with "Enable MIDI". **MPC hardware**: one card, same anatomy, its diagnostic buttons in a row. **Routing**: a table (instrument rows, source columns MIDI / Audio / On-screen, surface select) replacing the two-column pill wall. **On-screen fallback** collapsed behind "Try the on-screen surface". Remove "(Phase 2)". |

## Tuner (`/music/tuner`)

| References | Pattern | Our page |
|---|---|---|
| TonalEnergy arc and analysis, GuitarTuna pegs and direction hint, Fender rings and one instruction | The readout is the page; a needle or arc; per-string targets for fretted instruments; modes in the header | Modes Tune / Intonation / Drone in `?mode=`. **Tune**: the note in the display face at 96 px with the octave small, cents in mono under it, an **arc gauge** with the neighbouring notes at the ends and a direction word ("tune up", "in tune", "tune down") that is text as well as colour; for guitar and ukulele a **string strip** (six or four chips, the nearest string lit, tap to target it); the dark grid stage; "Pluck a note" before sound arrives. **Intonation**: the arc gauge plus the pitch trace and the four tiles as today. **Drone**: tonic chips, timbre, volume, one Play button; no microphone controls and no A4 row. A4 reference sits in Tune only, as a small segmented row under the stage. Microphone start on the stage, not in the header. |

## Settings (`/music/settings`)

| References | Pattern | Our page |
|---|---|---|
| iOS Settings, Spotify, forScore prefs | Grouped rows, one control per row, value visible, footnotes | Groups **Audio** (enable and test, playback sound select, three volume sliders, mute), **Input** (audio input label, echo cancellation, MIDI enable with device count), **Latency** (audio and MIDI offsets as steppers with a "measure" hint), **Appearance** (reduce motion, instrument colour coding), **Data** (export journal as JSON, reset local data behind a confirm). Each row: label, help text, control on the right from `@repo/ui`. The attribution stays as the Audio footnote. |

## Guide (`/music/guide`)

| References | Pattern | Our page |
|---|---|---|
| Duolingo onboarding, in-app tips | A checklist that reflects state, then short cards | **Get set up**: three live rows (Enable audio, Connect an instrument or use on-screen, Run your first drill) that read the runtime and the journal and tick themselves, each with its action. **How practice works**: one card (the practice loop). **Around the app**: six cards using the hub hue plates (Practice, Library, Create, Progress, Connect, Tuner) with one line each. Works offline as a footnote. Gains a unit test. |

## Component work implied

- `SectionHeading.svelte` (eyebrow, title, action slot) and its use across the seven pages.
- `SongCard.svelte`, `DeviceCard.svelte`, `TakeCard.svelte`, `SetupChecklist.svelte`, `ArcGauge.svelte`, `StringStrip.svelte`, `WeekBars.svelte`, `StreakCalendar.svelte`, `SettingsRow.svelte`, `TransportStrip.svelte`.
- `useRouteTab(param, values, default)` helper on top of `syncRouteQuery` and `initialDrillSearch` so every hub tab round-trips the same way.
