# AGENTS.md

This file provides guidance for agents working on the Music app under
`src/routes/music/` and the related core package in `packages/music-core/`.

## Product Context

- The Music app is the `/music` route inside the personal website. It is not a
  separate root website and should not replace the personal homepage.
- The current product is "Musicianship OS": a MIDI-first, offline-capable
  practice app for ear training, theory, note reading, sight-reading, rhythm,
  scales/technique, journaling, analytics, progress, XP, streaks, and a skill
  tree.
- The app is built as one SvelteKit deployment that serves `/`, `/music`, and
  `/pdf`. Do not split Music into a separate deployment unless the user makes a
  new explicit decision.
- The implementation follows `IMPLEMENTATION_PLAN.md` and
  `music-practice-app-plan.md` (both untracked local plans at the repo root).
  Phase 0, Phase 1, §5A Phase 1.5, §5C route migration, and the §5D Phase 2
  tuner/intonation/technique surfaces are complete. The active implementation
  backlog is the Phase 3–5 engine work plus explicitly deferred hardware/source
  verification. Do not reopen completed milestones unless a regression or a
  new product decision requires it.

## Core Decisions Already Made

- **Monorepo tool:** Use VitePlus workspace support. Do not add Turborepo.
- **Build engine:** VitePlus should use the Vite/Rolldown setup already in this
  repo. Existing Vite/Rolldown beta warnings are expected unless a task is
  specifically about fixing them.
- **Deployment shape:** Keep the Music app inside the root SvelteKit site under
  `/music`.
- **UI system:** Use `@repo/ui` components and the root site's Tailwind/shadcn
  Svelte theme tokens. Do not hardcode a separate Music color palette or font
  stack.
- **Design source:** `docs/music-practice-app/` is a Claude Design handoff. Use
  it for interaction patterns, layout ideas, and component consistency, but
  adapt it to the existing SvelteKit app and inherited theme tokens.
- **Input strategy:** MIDI first, audio second, on-screen last. Web MIDI devices
  route through `MusicRuntime`, `MidiEngine`, and `InputRouter`.
- **Known hardware:** MIDI events were recognized from a Roland FP-30X and an
  MPC One+. Keep exercise input wired through the shared router so real MIDI can
  advance sessions, not only the home route.
- **Audio input:** `@repo/music-core/engines/audio-in` owns microphone capture,
  monophonic pitch detection, tuner readings, and transient onset detection.
  Reuse `AudioPitchSource`; do not create route-local `getUserMedia`,
  `AudioContext`, or AudioWorklet implementations.
- **Onset timing:** Subscribe with `AudioPitchSource.subscribeOnsets()` and push
  normalized `OnsetEvent`s through the shared `MusicRuntime.inputRouter`.
  Keep onset analysis pure/testable, require an explicit user action before
  requesting microphone permission, stop capture on route teardown, and gate
  scored input until after any audible count-in to avoid speaker bleed.
- **Chord recognition:** Do not attempt real-time polyphonic chord detection in
  the browser. For future chord practice, use expected-target matching or
  extend the existing monophonic audio path only when the exercise contract is
  explicit and testable.
- **Notation:** Use shared VexFlow `StaffNotation` for generated/MIDI canonical
  scores. MusicXML-backed songs retain their original XML and use the
  dynamically imported OSMD renderer for engraving. Playback and score
  following still consume the canonical `Score`, never OSMD internals.
- **Persistence:** Phase 1 persists client-side practice state through
  `PracticeStore`/IndexedDB. This app is not live yet, so do not create database
  migrations for Music features unless the user explicitly asks for server
  persistence.
- **Dependencies:** The current pitch and onset detectors are implemented
  without a third-party analysis dependency. Do not add `pitchy`,
  `pitchfinder`, OpenSheetMusicDisplay, or Basic Pitch unless a planned engine
  demonstrably needs it and its phase is active.
- **Licensing:** Avoid Essentia.js in any closed-source build because it is
  AGPL-v3.

## Architecture Map

### Route App

- `src/routes/music/+layout.svelte` creates the shared `MusicRuntime`, registers
  the PWA, renders `MusicNavigation`, and docks the persistent
  `MusicTransportBar` at the bottom of every screen.
- `src/routes/music/_runtime.svelte.ts` owns the shared runtime (`MusicRuntime`):
  - `InputRouter`, `MidiEngine`, `SoundEngine`
  - audio enable state and cleanup
  - active instrument + reactive input source/confidence
  - the shared metronome (`transportBpm`, `metronomeRunning`, `toggleMetronome`,
    `setCountIn`) that drives the transport bar
  - master audio: `masterMuted`/`toggleMute`, `metronomeLevel`/`setMetronomeLevel`
    (blend), synth presets (`instrument`/`instruments`/`setInstrument`)
  - a **PlaybackController**: routes register a `PlaybackSource`
    (`setPlaybackSource`) so the transport Play button plays whatever is on
    screen (jam progression, imported MIDI, selected take, sight-reading melody),
    falling back to the metronome when none is registered (`togglePlayback`)
  - MIDI instrument/channel selection from Connect: `attachStorage`,
    `reloadMidiInstruments`, `midiInstruments`, `activeChannel`,
    `setActiveMidiInstrument` (pins both instrument and channel)
- `src/routes/music/_components/MusicNavigation.svelte` is the persistent Music
  app navigation (Practice OS sidebar with grouped IA + user-card footer on
  desktop; bottom tab bar on mobile).
- The Practice OS shell uses **per-page headers**, not a global status bar.
  `PracticeScreen` + `PracticeScreenHeader` wrap each route: a big `h1`,
  subtitle, and right-aligned controls (a `SegmentedControl` and/or a
  `SourceReadout` input pill). There is no `MusicTopbar`; XP/streak/level live on
  the `/music` dashboard, and input/source lives in each page header.
- `src/routes/music/_components/MusicTransportBar.svelte` is the persistent
  transport. It is presentational (all state/handlers are passed from
  `+layout.svelte` off `MusicRuntime`): a metronome toggle (custom
  `MetronomeIcon` — lucide has no metronome glyph), tempo presets popover + BPM
  slider (BPM applies live while running), configurable count-in,
  context-aware Play (plays the registered `PlaybackSource` or falls back to the
  metronome), master mute, metronome blend slider, selectable synth presets, a
  live input readout, a MIDI instrument/channel "Listen to" picker sourced from
  Connect preferences, and the audio enable gate.
- **Locked shell:** the layout pins the chrome and scrolls only content. The
  desktop sidebar is `sticky` under the 48px site header
  (`top-12 h-[calc(100dvh-3rem)] self-start`) and the transport bar is
  `sticky bottom-0`. Preserve this when touching layout.
- `src/routes/music/_components/OnScreenKeyboard.svelte` is the fallback input
  surface and should push normalized `NoteEvent`s through the shared router.
  (Phase 1.5 T1.5a will add selectable fretboard/MPC-grid surfaces alongside it.)
- `src/routes/music/_components/InstrumentView.svelte` is the **shared
  instrument-agnostic display**: given a pitch set (MIDI) + an `InstrumentId`, it
  renders the right view by reusing the existing components — piano →
  `PianoKeyboard`, guitar/ukulele → `FretboardInput` (chord/scale tones lit on
  the neck; tap to hear), aerophone → arpeggiated `AerophoneFingering` (a
  monophonic instrument can't play a chord, so the pitch set degrades to an
  arpeggio). Use this anywhere a chord/scale/voicing is shown so views stay
  instrument-aware instead of hardcoding the keyboard. Consumers: the chord
  library, the jazz advanced-voicing cards, and the scales reference. A page
  passes `router={runtime.router}` so fretted views can sound notes.
- `src/routes/music/_components/StaffNotation.svelte` is the shared VexFlow
  renderer for canonical `NotationView` projections. Reading and Song Studio
  consume it; do not fork route-specific staff renderers.
- `src/routes/music/_components/MusicXmlScore.svelte` is the shared lazy OSMD
  renderer for original MusicXML source. Keep OSMD imports inside this browser
  component and preserve canonical controls when rendering fails. Its optional
  `partIds` input filters a temporary XML copy through
  `score-import/filterMusicXmlParts()`; never rewrite persisted source to hide
  parts.
- `src/routes/music/_components/TabNotation.svelte` is the shared guitar/ukulele
  TAB renderer, built on **VexFlow** (`TabStave`/`TabNote`/`GhostNote`) — the same
  engine as `StaffNotation`, NOT VexTab (VexFlow renders tab natively; VexTab
  would add a second bundled VexFlow). It takes a `NotationView` (durations,
  measures, beat metadata) plus a fretboard `InstrumentProjection` (from
  `projection/projectScoreToFretboard()`, for exact str/fret) and a
  `TuningProfile` (string count). Because it renders real VexFlow geometry it
  reuses the **same `notation-selection.ts` seam** as `StaffNotation`/
  `MusicXmlScore` — accepting the identical selection props (selectionMap,
  highlightedRanges, customSelection, snap, selectionEnabled, onSelectionChange)
  so custom-range drag/tap selection works on tab exactly like the staff. Tab is
  single-staff (first staff); rests + out-of-range notes render as `GhostNote`
  spacers to keep timing aligned.
- `src/routes/music/_components/notation-selection.ts` is the shared
  renderer-independent selection seam. VexFlow and OSMD adapters provide
  canonical beat-backed `NotationHitTarget`s and consume its range/overlay
  helpers. Keep score-plan construction, looping, and follower state out of
  renderer components.
- `StaffNotation` and `MusicXmlScore` accept the same optional selection props:
  canonical selection map, highlighted ranges, custom range, snap mode,
  enabled state, and `onSelectionChange`. Preserve drag and two-tap behavior in
  both renderers. OSMD geometry must come from public `GraphicSheet` data and
  its overlay must remain separate from OSMD's source model/SVG classes.
  Keep each renderer's outer wrapper and scroll host constrained with
  `min-w-0 max-w-full`; their SVGs may be wider than the viewport, but that
  width must remain inside the renderer's horizontal scroller rather than
  widening the Music page.
- **Instrument applicability is one primitive, not per-page literals.** The
  "generalize content across instruments" rule lives in `domain/applicability.ts`
  (re-exported from `@repo/music-core/domain`): `VIEWABLE_INSTRUMENTS` (the
  toggle list — piano/guitar/ukulele/aerophone), `isMonophonic`,
  `ContentApplicability` (`all | pitched | polyphonic | { only }`),
  `instrumentsForApplicability`, and `degradesToArpeggio`. Every instrument
  toggle imports `VIEWABLE_INSTRUMENTS` (do NOT re-declare the literal), and
  monophonic/arpeggio decisions use `isMonophonic`/`degradesToArpeggio`. Content
  carries its own tag — e.g. `CurriculumLesson.applies` drives the lesson path's
  Aerophone arpeggio annotations. Melodic content (scales, licks) is `pitched`;
  chord voicings are `polyphonic` (degrade to arpeggio on monophonic
  instruments); instrument-specific drills (spider, MPC rudiments, Aerophone
  breath) use `{ only: [...] }` and stay pinned.

### Current Routes

- `/music`: instrument hub, MIDI status, metronome, on-screen input, and a daily
  mixed session demo.
- `/music/connect`: device profiles — name MIDI devices, assign instruments, and
  pick the preferred input source per instrument (`DeviceProfileStore`). The
  transport bar's MIDI instrument/channel picker reads these preferences.
- `/music/learn`: entry point for learning tools, with the guided **Jazz Path**
  surfaced at the top.
- `/music/learn/path`: the ordered, instrument-aware jazz lesson path. Each step
  deep-links into a real tool (ear → chord library → scales → the graded ii-V-I
  drill → jam); per-step status/mastery is derived from the live skill graph
  (`SkillGraphStore.getMastery`), so doing the graded drill visibly advances the
  voicing steps. Projection: `buildJazzLessonPath({ mastery, instrument })` in
  `@repo/music-core/engines/jazz` (pure; polyphonic lessons annotate the
  Aerophone arpeggio fallback). The jazz reference page links here via "Open
  tracked path".
- `/music/learn/aerophone`: Aerophone fingering visualizer and live practice
  aid. It uses `@repo/music-core/engines/aerophone-fingering` plus the shared
  runtime router so incoming MIDI/on-screen notes can highlight the matching
  fingering. The Learn hub links here directly; per-note fingering caveats still
  belong in deferred hardware verification until checked on the physical unit.
- `/music/learn/ear`: interval/chord/scale-degree ear training.
- `/music/learn/reading`: note flashcards and generated sight-reading. Registers
  a transport `PlaybackSource` so Play previews the on-screen melody. The guitar/
  ukulele sight-reading session has an opt-in **Show/Hide tab** reveal
  (`projectScoreToFretboard` + `TabNotation`), hidden by default so it doesn't
  short-circuit reading the staff.
- `/music/learn/rhythm`: pulse timing trainer.
- `/music/learn/theory`: chord and theory library. Each chord/scale renders
  through `InstrumentView` with an **instrument toggle** (Piano/Guitar/Ukulele/
  Aerophone, defaulting to the active instrument); chords also expose a
  voicing/inversion selector (`chordVoicings` in `@repo/music-core/engines/library`
  — root position, inversions, drop-2). It no longer shows the old fixed
  guitar+ukulele chord-chart pair.
- `/music/learn/jazz`: jazz-piano content (Julian Bradley pack) — ordered
  curriculum, chord/scale map, the rootless ii-V-I voicing drill across 12 keys
  (piano-only; JT9 is a two-hand piano drill), altered/upper-structure V7
  voicings (instrument-aware via `InstrumentView`), the 29 licks (playable
  transcriptions + improv techniques), and the standards repertoire. Pure data
  lives in `@repo/music-core/engines/jazz`.
- `/music/play`: play/practice entry point.
- `/music/songs`: persisted repertoire list and preview.
- `/music/import`: accepts MIDI, uncompressed MusicXML, and compressed `.mxl`.
  Keep archive extraction in `@repo/music-core/engines/score-import`; resolve
  `META-INF/container.xml` first and persist only the extracted XML through the
  existing MusicXML `SongSource`. Do not add an archive-specific storage format
  or make Song Studio understand ZIP files.
- `/music/songs/[id]`: Phase 3 Song Studio foundation. It loads a stored
  canonical `Score`, renders shared notation when supported, registers preview
  playback, and runs wait-mode `score-follower` through the shared input router.
  Canonical whole-score, multi-section, and custom practice ranges come from
  `@repo/music-core/engines/score-practice`; renderer components must emit
  canonical beats rather than own range or looping state. Keep import parsing
  in `score-import`, persistence in `SongLibrary`, range/session behavior in
  `score-practice`, and note grading in `score-follower`; the route should only
  compose them with shared runtime lifecycle. The route setup supports
  Wait/Performance, Whole/Sections/Custom Range, Sequence/Per Section,
  measure/note-group snap, BPM/strictness/count-in, and 1/2/4/8 finite takes.
  Preserve one journal capture per completed practice session with one
  `ExerciseRunRecord` per execution and no imported-song mastery events.
  Voice/part selection is session-local. Filter the canonical score once with
  `filterScoreVoices()` and use that result for notation, preview, planning,
  grading, counts, and input surfaces. Group MusicXML voices by their canonical
  source part ID and keep MIDI voices individually selectable. Do not allow an
  empty selection or selection changes during an active practice run. A
  session-local Staff/Tab/Fingering toggle projects the same voice-filtered
  canonical score: Tab via `projectScoreToFretboard()` + the VexFlow
  `TabNotation`, Fingering via `projectScoreToAerophone()` (monophonic top-line)
  rendered as a row of `AerophoneFingering` diagrams. Staff and Tab both support
  custom-range drag selection (same `notation-selection` seam); only Fingering is
  disabled while editing a custom range.
  `e2e/music-import.spec.ts` is the regression workflow for MIDI and MusicXML
  import-to-practice behavior. Preserve its direct renderer selection,
  zero-count-in multi-take Performance, persistence, and 375px overflow checks
  when changing Song Studio, notation renderers, setup controls, or transport.
  The completed baseline is 13 notation/selection tests, 6 Song Studio route
  tests, 5 import E2E scenarios (including `.mxl` and MusicXML part selection),
  and a green 46-test full
  Playwright suite.
- `/music/play/scales`: scales and technique trainer. The aside shows a
  reference of the practiced scale on the chosen instrument via `InstrumentView`.
- `/music/play/spider`: graded guitar/ukulele 1-2-3-4 chromatic drill. Setup
  selects a curated tuning, string, starting fret, and tempo; MIDI and the shared
  `FretboardInput` feed the same `TechniqueSession.startSpider()` run. The
  exercise scores pitch order + timing evenness, awards XP/mastery to the shared
  and instrument-specific spider skills, and records a tagged drill journal
  entry.
- `/music/play/articulation`: graded Aerophone articulation drill. Tongue a
  repeated note staccato or legato; `TechniqueSession.startArticulation()` reads
  note length (noteOn/noteOff) for the articulation score and tracks breath CC
  (CC2) for the breath curve, awarding XP/mastery to
  `technique.aerophone(.articulation)`. MIDI/wind-controller first — an on-screen
  tap (noteOn only) completes the pitch dimension but reads as "no sustained
  input" for articulation. Reuses `AerophoneFingering` + an `OnScreenKeyboard`
  fallback.
- `/music/play/chord-perfect`: graded guitar/ukulele Chord-Perfect drill. Pick an
  instrument + a curated open-chord shape; MIDI and the shared `FretboardInput`
  (whole shape lit, next string highlighted) feed `TechniqueSession.startChordPerfect()`,
  which grades each voiced string in ascending-pitch order and awards XP/mastery to
  `technique.{guitar,ukulele}.chord-perfect`. The chord shapes are standard open
  voicings carrying a hardware-verification caveat (see the handoff).
- `/music/play/two-hand`: graded piano two-hand independence drill. The left
  hand holds a steady root pulse (one note per beat) while the right hand runs a
  faster scale line (two notes per beat). MIDI and two on-screen `OnScreenKeyboard`s
  (left/right) feed `TechniqueSession.startTwoHand()`; each hand is graded
  independently by register (a split midi) on pitch order + timing evenness,
  awards XP/mastery to `technique.piano(.two-hand-independence)`, and records a
  tagged drill journal entry.
- `/music/play/voicings`: **graded** voicing drill across all 12 keys, with
  **Major / Minor / Altered V7** variants (major = rootless ii-V-I, JT9; minor =
  iiø7 → V7alt → i-m7, JT7; altered = V7b9 → V7alt → II-major upper structure,
  JT10-12). Input (MIDI or on-screen) is scored per chord through the standard
  exercise pipeline, awarding XP toward the `harmony.ii-v-i` skill and
  journaling the run. Instrument-aware: polyphonic instruments are graded on the
  held chord, monophonic (Aerophone) on the arpeggio. This is the graded
  counterpart to the reference drill on `/music/learn/jazz` (which links to it
  via "Practice (graded)"). Engine:
  `@repo/music-core/engines/voicing-drill-session`; exercise:
  `@repo/music-core/exercises/voicing-drill`. Resolved voicings come from the
  jazz engine's `buildDrillVoicings(variant, startPosition)`, so the session no
  longer re-derives them.
- `/music/import`: parse MIDI or uncompressed MusicXML locally, preview canonical
  metadata, and save it to repertoire. `.mxl` is deferred.
- `/music/songs`: saved repertoire library backed by the `songs` store. It
  reopens imported MIDI songs as domain `Score`s, registers selected-song
  playback with the shared transport, and logs `SessionSource:"song"` practice
  through `runtime.recordPractice`. Selected songs link to `/music/songs/[id]`
  for score preview and follow-along.
- `/music/jam`: chord-progression jam/improv with target tones + recording.
- `/music/studio`: step sequencer with a pad bank and Tone playback.
- `/music/recording`: take list, waveform, compare, and self-review.
- `/music/track`: practice journal and routine/session tracking.
- `/music/settings`: app settings over `PracticeStore.settings`.
- `/music/progress`: dashboard, skill tree, weak spots, achievements, streaks,
  and practice-next picks.

### Core Package

Music domain, engines, exercises, and storage live in `packages/music-core/`.
Route code should import public exports from `@repo/music-core/...`; do not
reach through private file paths when an export exists.

Important areas:

- `src/domain/`: canonical types such as `NoteEvent`, `ScoringEvent`, `Skill`,
  `PracticeSession`, `InstrumentId`, `Score`, and pipeline types.
- `src/exercises/`: exercise definitions and scoring input adapters.
- `src/engines/input-router/`: source arbitration, normalized input stream, and
  the active instrument + **active MIDI channel** filter.
- `src/engines/midi/`: Web MIDI support and device/event normalization.
- `src/engines/sound/`: Tone-backed playback + metronome sounds. Owns the gain
  graph (master → destination; metronome → metronome gain → master), selectable
  synth presets (`SOUND_PRESETS`/`SOUND_PRESET_NAMES`, `setInstrument`), master
  mute / metronome blend, and the pure `scoreToPattern(score, {bpm?})` helper.
- `src/engines/transport/`: metronome/transport scheduling (count-in, BPM).
- `src/engines/notation/`: VexFlow-based notation rendering data.
- `src/engines/skills/`: seeded skill graph and mastery.
- `src/engines/analytics/`: confusion matrix, weak skills, and practice-next
  data.
- `src/engines/progress/`: XP, level, streak, achievements.
- `src/engines/sessions/`: practice journal/session records.
- `src/engines/dashboard/`: dashboard and skill tree view projections.
- `src/engines/projection/`: derived view helpers (journal focus, rhythm HUD,
  technique ladder, journal projections, canonical score voice filtering, and
  guitar/ukulele fretboard + Aerophone projections). `projectScoreToFretboard()`
  turns a canonical `Score` + `TuningProfile` into an `InstrumentProjection` (one
  playable shape per onset, lowest frets; out-of-range notes drop), consumed by
  `TabNotation` for VexFlow tab rendering. `projectScoreToAerophone()`
  reduces a score to a monophonic top-line `InstrumentProjection` (highest note
  per onset, since the Aerophone is monophonic); per-note fingering is derived
  for display by `AerophoneFingering` from the MIDI, not stored in the
  projection. Reuse these for any fretboard/tab/fingering view instead of
  re-deriving positions.
  Use `filterScoreVoices()` when a route needs a subset of score parts; do not
  independently filter notes in notation, playback, and practice code.
- `src/engines/device-profiles/`: MIDI device profiles + per-instrument
  preferred source (drives `/music/connect` and the transport MIDI picker).
- `src/engines/reading-session/`, `rhythm-session/`, `technique-session/`,
  `voicing-drill-session/`: per-capability session orchestrators over the
  exercise framework. `voicing-drill-session` sequences the 12-key ii-V-I through
  `ExerciseRunHost` (XP + `harmony.ii-v-i`) and exports the pure
  `buildVoicingDrillTargets(instrument, { variant, startPosition })` (major,
  minor, and altered V7); its gradable unit is the `exercises/voicing-drill`
  exercise (chord-hold grading for polyphonic instruments, arpeggio-sequence
  grading for monophonic). `technique-session` also owns the string-instrument
  spider run through `startSpider()`, the piano two-hand independence run
  through `startTwoHand()`, the guitar/uke Chord-Perfect run through
  `startChordPerfect()`, and the Aerophone articulation run through
  `startArticulation()`.
- `src/engines/score-follower/`: streaming pitch+timing grading over a `Score`.
- `src/engines/score-practice/`: canonical Song Studio practice selection and
  orchestration. It derives measure/note-group boundaries, validates
  whole-score/multi-section/custom half-open ranges, rebases groups into
  `PracticeSegment`s, expands sequence/per-section execution queues, creates an
  isolated score follower per take, drives clock-based performance progress,
  and owns aggregate take/section summaries. VexFlow/OSMD geometry, count-in
  audio, timers, persistence calls, and Svelte lifecycle do not belong in this
  engine.
- Song Studio performance timing starts from the monotonic downbeat returned by
  `MusicRuntime.runCountIn()`. Always stop it through
  `runtime.stopPracticeClock()` on completion, cancellation, errors, and route
  teardown; do not derive scoring timestamps from wall-clock time or duplicate
  transport instances.
- `SoundEngine.playPattern()` has replacement semantics: each invocation
  cancels the previous scheduled pattern through its dedicated playback synth.
  Preserve this when changing score previews, exercise replay, transport
  playback, or pattern loops; repeated user actions must not layer copies.
- `src/exercises/string-spider.ts`: guitar/ukulele one-string 1-2-3-4 target
  generation and pitch-order/evenness grading. Keep fretboard rendering and
  route state out of this exercise.
- `src/exercises/two-hand-independence.ts`: piano two-hand independence target
  generation (steady LH pulse vs. faster RH line) and per-hand pitch/evenness
  grading (hands split by register). Keep keyboard rendering and route state out
  of this exercise.
- `src/exercises/chord-perfect.ts`: guitar/ukulele Chord-Perfect — curated open
  chord shapes (`CHORD_SHAPES`/`chordShapesFor`), per-string target generation
  from a shape + tuning, and ascending pitch-order grading. Shapes are standard
  open voicings; treat as hardware-pending until verified on the instrument.
- `src/exercises/aerophone-articulation.ts`: Aerophone staccato/legato drill —
  repeated-note target generation and articulation grading from note durations
  (sounding fraction vs. the style target) plus breath-CC tracking. Note-off
  timing and breath CC come from a wind controller; on-screen taps score pitch
  only.
- `src/engines/library/`, `tunings/`: chord/scale data and tuning profiles.
  `library` also exports `chordVoicings(pianoMidi)` — root position, inversions,
  and drop-2 as instrument-agnostic pitch sets for `InstrumentView`.
- `src/engines/import/`: parse MIDI files into `ImportedSong` models (uses
  `@tonejs/midi`) for preview/import UI, including beat-native timing metadata.
- `src/engines/score-import/`: canonical import boundary. It converts raw MIDI,
  `ImportedSong`, and uncompressed `score-partwise` MusicXML into the domain
  `Score`. It also owns non-destructive `filterMusicXmlParts()` source filtering
  for renderers. Keep it framework-agnostic and independent from OSMD.
- `src/engines/song-library/`: persist/reopen canonical scores through
  `PracticeStore.songs` and project stored scores into tempo-map-aware transport
  playback patterns for `/music/songs`.
- `src/engines/jam/`: chord-progression jam sessions + target tones.
- `src/engines/jazz/`: jazz-piano reference content (chord vocabulary,
  chord/scale map, voicing recipes — `realizeVoicing`, `realizeDominantVoicing`,
  `realizeUpperStructure` — the 12-key ii-V-I drill, 29 licks with playable MIDI
  phrases (`LICK_PHRASES`/`lickTimeline`), improv techniques, repertoire, the
  backing-track catalogue, and the curriculum). Pure data + functions; surfaced
  at `/music/learn/jazz`. The backing tracks reference MP3s served from
  `static/audio/jazz/` (gitignored; the user's licensed Julian Bradley files).
- `src/engines/recording/`: take capture, compare, self-review.
- `src/engines/sequencer/`: step sequencer (grid, pads, patterns).
- `src/engines/settings/`: typed app settings over `PracticeStore.settings`.
- `src/engines/store/`: IndexedDB-backed local persistence (`PracticeStore`).

If you add a new engine or public exercise, update
`packages/music-core/package.json` exports and add focused tests.

## Development Rules

### Test First

- For new behavior or bug fixes, write a failing test before production code.
- Core behavior belongs in `packages/music-core` tests first when possible.
- Route behavior belongs in colocated `.svelte.test.ts` files.
- Cross-route user workflows belong in `e2e/*.spec.ts`.

### Keep Core Logic Out of Svelte

- Put scoring, projections, analytics, progression, and routing decisions in
  `packages/music-core`.
- Svelte components should orchestrate runtime state and render UI. Avoid
  embedding domain algorithms inside route components.
- Prefer pure projection functions for dashboard-like views, then test those
  functions with unit tests.

### Use the Shared Runtime

- Inside Music routes and components, use `useMusicRuntime()` rather than
  creating new `InputRouter`, `MidiEngine`, or `SoundEngine` instances.
- Only `src/routes/music/+layout.svelte` should create the shared runtime with
  `createMusicRuntime()`.
- Always unsubscribe router, MIDI, transport, and runtime listeners in
  `onDestroy`.
- When testing isolated components, it is acceptable to instantiate
  `MusicRuntime` directly and dispose it at the end of the test.

### Input Handling

- Every playable exercise must accept input from the shared `InputRouter`.
- On-screen controls should call router APIs or push normalized domain events.
- MIDI events should advance the same sessions as on-screen events. Do not build
  exercise logic that only works for clicks.
- Preserve source confidence and active-source UI where relevant.
- Audio input is a future path. Do not fake audio pitch detection in Phase 1.

### Persistence and Data

- Use `PracticeStore` for browser-only persisted state.
- Guard browser-only storage with SvelteKit's `browser` flag when needed.
- Call `load()` on engines/stores before projecting persisted state.
- Do not add server DB tables or migrations for Music until the app has a
  server persistence requirement.
- Local state must remain offline-friendly and PWA-compatible.

### UI and Theming

- Use `@repo/ui` components for Button, Card, Badge, Input, Label, Progress,
  Slider, Select, Toggle, Dialog, and related primitives.
- Use Tailwind utility classes and theme tokens such as `bg-background`,
  `text-foreground`, `bg-card`, `text-muted-foreground`, `border`, `bg-primary`,
  and `text-primary-foreground`.
- Do not copy the Claude Design handoff colors/fonts directly into route code.
  Port the structure and UX, then let the site theme drive color and type.
- Avoid custom component palettes unless they are implemented as tokens in the
  UI package and used consistently.
- Keep card radii and spacing aligned with the existing shadcn Svelte
  components.
- Route pages own their semantic `h1`. Shared chrome should use non-heading
  text for route labels unless there is a specific accessibility reason.
- Ensure desktop and mobile layouts do not introduce horizontal overflow.

### Extending Routes

When adding a new Music feature:

1. Add or extend a domain/exercise/engine test in `packages/music-core` if the
   feature has scoring, state, analytics, or persistence logic.
2. Implement the minimal core behavior and export it from `@repo/music-core`
   when route code needs it.
3. Add or update the Svelte route/component with `@repo/ui` primitives.
4. Add a colocated browser component test for rendered behavior.
5. Add Playwright coverage if the feature is a user-facing route workflow.
6. Run the verification gates listed below.

### Verification Gates

Use these before claiming a Music change is complete:

```bash
vp run -r check
vp test --run
vp run -r build
./node_modules/.bin/playwright test
./node_modules/.bin/tsx packages/music-core/src/domain/validate.ts
./node_modules/.bin/tsx packages/music-core/src/domain/pipeline-trace.ts
```

For focused work, run the smallest relevant test first, then the full gates
before commit or completion.

### Browser Verification

- After meaningful UI changes, inspect the affected `/music` route in the
  in-app browser.
- Check desktop and mobile widths for overlap and horizontal overflow.
- Toggle the root site theme and confirm the Music app changes through tokens.
- If the existing dev server has stale generated-type errors, use the verified
  build/preview or start a temporary dev server on another port, then stop it
  when finished.

## Current Implementation Notes

- `/music/progress` renders real persisted progress projections through
  `buildDashboardView` and `buildSkillTreeView`.
- The skill tree renders the full seeded graph so rhythm and other later-sorted
  skills are visible.
- XP/streak/level render on the `/music` dashboard from persisted progress; the
  active input source shows in each page header's `SourceReadout`. The persistent
  `MusicTransportBar` drives the shared metronome.
- MIDI was previously fixed so hardware note events advance reading exercises.
  Preserve that path when refactoring reading or input code.
- The practice journal stores sessions and notes locally. It is intentionally
  client-side for now.

## Things Not To Do

- Do not move Music back to the website root.
- Do not introduce Turborepo.
- Do not add Music server migrations for Phase 1 client-local features.
- Do not bypass `@repo/ui` by creating one-off component systems in route files.
- Do not hardcode Claude Design colors, fonts, or global CSS into Music routes.
- Do not implement real-time polyphonic chord recognition.
- Do not add Phase 2+ audio/import dependencies early.
- Do not revert unrelated local docs, plans, `.codex`, `.superpowers`, or other
  user-owned files.
