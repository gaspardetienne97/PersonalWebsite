# AGENTS.md

This file provides guidance for agents working on the Music app under
`src/routes/music/` and the related core package in `packages/music-core/`.

## Product Context

- The Music app is the `/music` route inside the personal website. It is not a
  separate root website and should not replace the personal homepage.
- The current product is "Practice OS": a MIDI-first, offline-capable
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
- **MPC controller mode:** `@repo/music-core/engines/pad-color` owns the MPC
  One+ controller-mode SysEx protocol, reverse-engineered by tracing MPC 3's
  CoreMIDI output (local-only `docs/tools/run-mpc-usb-trace.sh`). Every frame is
  a literal capture: product id `0x56`, pad color `F0 47 7F 56 65 00 04 [pad]
  [R] [G] [B] F7` (RGB 7-bit), heartbeat `52`, enter-mode `62`. Use
  `padColorSysex` / `mpcControllerInitSysex` / `mpcHeartbeatSysex`. `MidiEngine`
  owns output enumeration, raw-message subscriptions, and SysEx permission
  fallback. The browser→hardware path still needs on-device confirmation (the
  preview Chromium has no Web MIDI); never turn pad output into an automatic
  route side effect — keep it user-triggered from the Connect diagnostic.
- **Audio input:** `@repo/music-core/engines/audio-in` owns microphone capture,
  monophonic pitch detection, tuner readings, and transient onset detection.
  Reuse `AudioPitchSource` (streaming monophonic pitch) or `ChordAudioSource`
  (streaming chroma + onset windows for chord following); new capture sources
  belong in the `audio-in` engine — never route-local `getUserMedia`/
  `AudioContext`/AudioWorklet.
- **Onset timing:** Subscribe with `AudioPitchSource.subscribeOnsets()` and push
  normalized `OnsetEvent`s through the shared `MusicRuntime.inputRouter`.
  Keep onset analysis pure/testable, require an explicit user action before
  requesting microphone permission, stop capture on route teardown, and gate
  scored input until after any audible count-in to avoid speaker bleed.
- **Chord recognition:** Do not attempt OPEN real-time polyphonic recognition
  ("what chord is this, out of all chords?"). Two constrained paths are
  sanctioned: (1) buffered analyze-on-demand identification (`chord-id` +
  `recordMicClip`/Basic Pitch); and (2) real-time **chord following** of a KNOWN
  progression — `ChordAudioSource` streams chroma + onset windows, the route
  turns them into `ChordObservation`s (chroma via `chromaToPitchClasses`, onsets
  via buffered Basic Pitch), and `chord-follower` aligns/grades them against the
  expected progression. Following is allowed because it matches against a known
  target set, stays worklet-isolated, and is unit-testable via injected
  observations; do not widen `chord-follower` into open classification.
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
  the PWA, renders `MusicNavigation`, and keeps `FloatingPracticeControls`
  sticky above the route content, including during drill focus.
- `src/routes/music/_runtime.svelte.ts` owns the shared runtime (`MusicRuntime`):
  - `InputRouter`, `MidiEngine`, `SoundEngine`
  - audio enable state and cleanup
  - active instrument + reactive input source/confidence
  - one `MusicSettingsStore` for the active instrument, exact-variant BPM,
    count-in, continued metronome preference, playback sound, levels, and mute
  - the shared practice clock (`practicePhase`, `activeBeat`,
    `registerPracticeContext`, `beginPerformance`, `endPerformance`) used by
    counted-in drills
  - the standalone metronome preview (`metronomeRunning`, `toggleMetronome`)
    and persisted continued-click preference (`metronomeEnabled`)
  - MIDI instrument/channel selection from Connect: `attachStorage`,
    `reloadMidiInstruments`, `midiInstruments`, `activeChannel`,
    `setActiveMidiInstrument` (pins both instrument and channel)
- `src/routes/music/_components/MusicNavigation.svelte` is the persistent Music
  app navigation (Practice OS sidebar with grouped IA + user-card footer on
  desktop; bottom tab bar on mobile).
- The Practice OS shell uses **per-page headers**, not a global status bar.
  `PracticeScreen` + `PracticeScreenHeader` wrap each route: a big `h1`,
  subtitle, and right-aligned controls (a `SegmentedControl` and/or a
  `SourceReadout` input pill). `MusicTopBar` is shell chrome for search and
  navigation, not the route heading; XP/streak/level live on the `/music`
  dashboard, and input/source lives in each page header.
- `src/routes/music/_components/FloatingPracticeControls.svelte` is the
  presentational four-control capsule. `+layout.svelte` passes runtime state and
  handlers for instrument, metronome, BPM, and count-in. Instrument, BPM, and
  count-in lock during count-in/running; the metronome remains available. Keep
  all four controls visible and named at mobile widths. Idle metronome pressed
  state reflects audible `metronomeRunning`; active-run state reflects the
  persisted `metronomeEnabled` preference.
- Structured drills must use `PracticeDrillShell` with the route-driven
  `setup` → `stage` → `summary` anatomy. Setup is the only phase that renders
  setup controls; `startPending` disables them only while start preflight
  settles, never for the whole run. Stage renders the stage, feedback, and rail;
  put the route-owned mid-run Cancel/abandon action in `stageAction`, which the
  shell places above the stage column. Summary renders a `DrillSummaryCard` as
  the consistent results frame; the route supplies its heading, body, actions,
  Change setup handler, and optional routine/next-up content. The shell and card
  are presentation-only: routes continue to own phase derivation, start/stop/
  count-in, settled setup, scoring, focus moves, and persistent live-region
  announcements.
- Preview playback is local to its owning route/component. Give each preview a
  nearby Play/Pause or Stop control, call `runtime.ensurePlaybackVoice()` before
  generated sound, and stop route-owned playback on teardown/navigation.
- Audio enable/test, playback sound, playback/metronome/master levels, and mute
  are owned by `/music/settings`; do not put them back in the floating capsule.
- **Locked shell:** keep the floating capsule sticky below normal chrome and at
  the top during drill focus. Preserve min-width constraints and footer flow
  when touching layout; do not move practice controls into or fix the footer.
- `src/routes/music/_components/OnScreenKeyboard.svelte` is the fallback input
  surface and should push normalized `NoteEvent`s through the shared router. It
  renders a real piano via **piano-chart** (SVG) for the visual, with a
  screen-reader/keyboard-accessible `<button>` layer (also the deterministic
  test surface — page tests click those by note label). `FretboardInput` follows
  the same dual-layer pattern over **fretboard.js**. Both read theme tokens as
  complete `oklch()` colors (NOT HSL triples) and load the lib via dynamic
  `import()` in `onMount` to stay SSR-safe.
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
  shared input router reads these preferences.
- `/music`: entry point for practice tools; learning drills and the guided
  **Jazz Path** are surfaced from the Practice hub.
- `/music/learn/path`: the ordered, instrument-aware jazz lesson path. Each step
  deep-links into a real tool (ear → chord library → scales → the graded ii-V-I
  drill → jam); per-step status/mastery is derived from the live skill graph
  (`SkillGraphStore.getMastery`), so doing the graded drill visibly advances the
  voicing steps. Projection: `buildJazzLessonPath({ mastery, instrument })` in
  `@repo/music-core/engines/jazz` (pure; polyphonic lessons annotate the
  Aerophone arpeggio fallback). The jazz reference page links here via "Open
  tracked path".
- `/music/learn/aerophone`: the unified Aerophone technique surface: fingering
  visualizer, long-tone breath drill, dynamic-swell drill, and graded
  staccato/legato articulation mode. It uses
  `@repo/music-core/engines/aerophone-fingering` plus the shared runtime router
  so incoming MIDI/on-screen notes can highlight the matching fingering. The
  articulation mode uses `TechniqueSession.startArticulation()` and grades note
  length plus CC2 breath, awarding XP/mastery to
  `technique.aerophone(.articulation)`. The Learn hub links here directly;
  per-note fingering caveats still belong in deferred hardware verification
  until checked on the physical unit.
- `/music/learn/ear`: interval/chord/scale-degree ear training. Mixed sessions
  use `EarTrainingSession` with `queueMode:"adaptive"` so scheduler
  weakness/review/new priorities are preserved while rotating drill types to
  avoid back-to-back repeats. Focused sessions should keep balanced cycling.
  Keep the curriculum spine tonic-first and scale-degree-first: anchor tonic,
  build diatonic degrees, sing/play targets, transfer into melodies, add
  chromatic color, then attach harmony/interval vocabulary. The route may
  present the path, but ordering belongs in the
  `@repo/music-core/engines/ear-training` curriculum projection. Scale-degree
  level metadata belongs with `scale-degree-recognition` in `@repo/music-core`;
  route controls should consume `SCALE_DEGREE_SETS` and pass `scaleDegreeSet`
  into `EarTrainingSession` instead of duplicating degree lists. Chromatic color
  support includes b2 and #4 in the seeded skill graph and the Chromatic color
  level; add future degree colors in the engine/skill seed first, then surface
  them through the shared set list. The free-play warmup is intentionally
  unscored: it may start/stop the shared `SoundEngine` drone and play tonic→degree
  comparisons, but it must not write XP, mastery, analytics, or practice-journal
  records. Pocket mode is listening-only but still graded by self-assessment:
  call `EarTrainingSession.answerListening()` so heard/missed reps flow through
  the Exercise pipeline, Skill Graph, Analytics, Progress, and journal capture.
  Voice mode is intentionally scoped to focused Scale Degree sessions: start
  `AudioPitchSource` from the user action, push microphone `noteOn` events
  through `MusicRuntime.router`, and let `EarTrainingSession` listen to `audio`
  input for the run. Stop the microphone on summary, abandon, and teardown.
  Melody Dictation is a focused play-back drill only: use
  `@repo/music-core/exercises/melody-dictation`, keep it out of choice-mode mixed
  review, and grade ordered MIDI/on-screen note sequences through the shared
  Exercise pipeline. Repertoire transfer prompts come from
  `@repo/music-core/engines/ear-training/repertoire`: pass saved `Score`s through
  `buildRepertoireEarTransfers()` and keep scale-degree/key parsing there. The
  landing surfaces a ranked review queue across all saved songs via
  `buildRepertoireReviewQueue(scores, getMastery, { now })`, which scores each
  phrase by its weakest scale-degree skill after the shared forgetting curve
  (`applyDecay`) plus `phraseDifficulty` from melodic range, leap size, and
  chromatic degrees, then tags it new/due/strong — no per-phrase SRS persistence.
  `buildRepertoireReviewPlan()` groups that queue into warmup, review, new, and
  stretch blocks; `buildRepertoireReviewPlanSchedule()` converts that plan into
  scheduled `repertoire-transfer` prompts for a multi-prompt session. The route
  may render those sections but must not duplicate the planning rules. The route
  re-ranks after each practice and on level change, and can start either a
  single play-back phrase through `createRepertoireTransferExercise()` or the
  full planned session through the schedule helper. Keep ranking and decay in the
  engine; do not create route-local grading, scale-degree parsing, or microphone
  capture.
- `/music/learn/reading`: note flashcards and generated sight-reading. Its local
  Play/Pause control previews the on-screen melody. The guitar/
  ukulele sight-reading session has an opt-in **Show/Hide tab** reveal
  (`projectScoreToFretboard` + `TabNotation`), hidden by default so it doesn't
  short-circuit reading the staff. Piano sight-reading uses
  `projectScoreToPiano()` and the follower group's canonical
  `sourceNoteIndexes` to show `Left hand`, `Right hand`, or `Both hands` for the
  current target. Do not infer this independently from rendered clefs or DOM
  geometry.
- `/music/learn/rhythm`: pulse timing trainer.
- `/music/library?tab=reference`: chord and theory library. Each chord/scale renders
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
- `/music/library?tab=songs`: persisted repertoire list and preview.
- `/music/library?tab=import`: accepts MIDI, uncompressed MusicXML, and compressed `.mxl`.
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
- `/music/learn/aerophone?mode=articulation`: unified Aerophone articulation
  surface. Keep new Aerophone technique work here.
- `/music/play/chord-perfect`: graded guitar/ukulele Chord-Perfect drill. Pick an
  instrument + a curated open-chord shape; MIDI and the shared `FretboardInput`
  (whole shape lit, next string highlighted) feed `TechniqueSession.startChordPerfect()`,
  which grades each voiced string in ascending-pitch order and awards XP/mastery to
  `technique.{guitar,ukulele}.chord-perfect`. It also includes an expected-target
  verifier backed by `@repo/music-core/engines/chord-verification`: accumulated
  MIDI/on-screen/microphone pitch notes are compared to the selected shape's
  chord tones by pitch class, with coverage/missing/extra tone feedback. The mic
  verifier starts `AudioPitchSource` and pushes audio `noteOn` events through the
  shared `InputRouter` before verification. It also has a **Strum & identify**
  panel: `recordMicClip()` captures one strum, the shared Basic Pitch adapter
  transcribes the whole buffer, and `chord-id/identifyChord()` names the chord
  (ranked candidates) while `chord-verification` checks it against the selected
  shape. The analyzed strum is scored through
  `createOpenChordIdentificationExercise()` and `runExerciseThroughPipeline()`,
  advancing `technique.strings.open-chord-id` plus the guitar/uke child skill and
  recording XP/analytics/journal like every other graded drill. The strum
  analyzer is an injectable prop so route tests stay off the microphone. This is
  buffered analyze-on-demand, not live polyphonic streaming. The chord shapes are
  standard open voicings carrying a hardware-verification caveat (see the
  handoff); real-strum identification accuracy is likewise hardware-pending.
- `/music/play/chord-progression`: graded chord-following drill for a known
  progression (`@repo/music-core/engines/jam`'s `JAM_PROGRESSIONS`). `ChordAudioSource`
  streams chroma + onset windows; onsets are confirmed through the buffered
  Basic Pitch adapter + `chord-id/toPitchClasses` and turned into
  `ChordObservation`s that `chord-follower` aligns/grades against
  `expectedChordsFromProgression()` for correctness and timing. Chroma drives
  only the detected-tones readout; grading/advancement comes from
  onset-confirmed Basic Pitch observations, never chroma. Both the
  audio source and the onset analyzer are injectable props so route tests stay
  off the mic and model. Completion records one journal entry (no fabricated
  per-skill mastery events). Real-strum grading accuracy on a physical
  guitar/ukulele is Phase 4 hardware-pending; this route proves the
  mic→chroma→onset→Basic-Pitch→follower path wires up and renders cleanly.
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
- `/music/library?tab=import`: parse MIDI or uncompressed MusicXML locally, preview canonical
  metadata, and save it to repertoire. `.mxl` is deferred.
- `/music/library?tab=songs`: saved repertoire library backed by the `songs` store. It
  reopens imported MIDI songs as domain `Score`s, registers selected-song
  playback with the shared transport, and logs `SessionSource:"song"` practice
  through `runtime.recordPractice`. Selected songs link to `/music/songs/[id]`
  for score preview and follow-along.
- `/music/jam`: chord-progression jam/improv with target tones + recording.
- `/music/create?mode=beat`: step sequencer with a pad bank, Tone playback, and persistent
  **MPC sample kits**. Sample kits cover MPC Banks A-D (MIDI 36-99); the Studio
  panel renders one 16-pad bank at a time with an A/B/C/D selector. Pads can
  carry a simple soft/hard velocity layer split (0-0.63, 0.64-1) and an MPC
  choke group (1-16) through the panel; imported samples can be renamed or
  deleted in-place. Richer waveform trim/fade editing belongs in the sample-kit
  engine first. Sample-kit metadata belongs in `SampleKitStore`
  (`@repo/music-core/engines/sample-kit`), never in route-local state; sample
  blobs live in OPFS through the shared `putBinary`/`getBinary`/`deleteBinary`
  store helpers (nested `music.sample-kits/{kitId}/…` keys). Browser decode
  probing and object-URL lifecycle live in
  `studio/_components/sample-kit-playback.ts` (`SampleKitPlaybackController`);
  same-choke-group playback stopping happens there via `SoundEngine.stopDrum`.
  Tone ownership stays in `SoundEngine` (`loadDrumKit`/`playDrum`/`stopDrum`/
  `startDrumPatternLoop`). The route projects the grid into a hybrid
  `{ drums, synth }` pattern — rows whose MIDI maps to an active pad play as
  samples, the rest fall back to the synth. MPC export (`buildMpcKitExport` →
  XPM 2.1 Drum Program) is generated from code: any XPM compatibility change
  needs a fixture-based test **and** physical MPC One+ verification before
  claiming hardware compatibility. Never copy or commit user-owned sample packs
  or the local MPC fixture; `static/audio` sample material is gitignored.
- `/music/create?mode=piano-roll`: multitrack-lite editor over the canonical `Score`.
  Editing helpers belong in `@repo/music-core/engines/piano-roll`
  (`toggleNoteAt`, `setVoiceVelocity`, `resizeNoteAt`, `addVoice`,
  `removeVoice`, `clearVoice`, `withoutVoices`, `scoreLoopBeats`,
  `buildPianoRollGrid`); the route should keep playback/export thin by reusing
  `scoreToPattern`,
  `scoreToMidiBlob`, and `renderEventsToWav`. Track colors stay on theme chart
  tokens and wrap across dynamic voices. Velocity lane/control and horizontal
  visual zoom are built; drag-resize uses explicit Resize mode. Longer sketches
  use the core grid projection plus the route-level Add bar control instead of
  fixed two-bar rendering. Do not add route-local playback/export engines for
  future piano-roll polish.
- `/music/create?mode=recorder`: take list, waveform, compare, and self-review.
- `/music/track`: practice journal and routine/session tracking.
- `/music/settings`: the runtime-owned Music settings surface. It owns audio
  enable/test, playback sound, playback/metronome/master levels, mute, latency,
  MIDI, and appearance settings through the single `MusicSettingsStore`.
- `/music/progress`: dashboard, skill tree, weak spots, achievements, streaks,
  practice-next picks, and personal daily challenges. Challenge cards must come
  from `@repo/music-core/engines/challenges`; keep them non-competitive unless
  the user explicitly asks for leagues/social ranking.
- `/music`: the Practice hub includes the Phase 5 local Practice Coach. It uses
  `@repo/music-core/engines/coach` to project Skill Graph, Analytics, Progress,
  Sessions, and `daily-routine` into a deterministic recommendation view. Keep it
  local/offline; do not add an external AI/API dependency unless the user makes
  a new explicit product decision.
- `/music/library?tab=import&mode=transcribe`: Phase 5 Transcription Trainer. It uses
  `@repo/music-core/engines/transcription` to parse manual note rows into a draft
  and convert the draft to a canonical `audio-transcription` score that can be
  practiced through the existing wait-mode `ScorePracticeSession` and saved to
  repertoire. The default browser extractor lives in route code
  (`basic-pitch-extractor.ts`) and uses `@spotify/basic-pitch` by dynamically
  loading the bundled TensorFlow model/shard assets, decoding source audio, and
  resampling it to 22.05 kHz mono. Keep the core transcription engine
  framework-agnostic; Basic Pitch output must adapt to
  `ExtractedTranscriptionNote[]` and then flow through `extractedNotesToDraft()`.
  That core adapter owns default cleanup: confidence/duration filtering,
  chronological sorting, and nearby same-pitch fragment merging. Keep those
  heuristics in `@repo/music-core`, not in route code.
  Generated-score playback must use the shared `SoundEngine` through local
  Play/Pause controls and `scoreToPattern(score)`; do not add another playback
  engine. Keep route input wired through
  `MusicRuntime.router` so MIDI, on-screen, and extractor-backed flows use the
  same score follower. Real-audio extraction quality still needs manual browser
  validation and threshold tuning.

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
- `src/engines/pad-color/`: captured MPC One+ controller-mode SysEx — init
  handshake, heartbeat, verified pad-color frames, app pad palettes, and kit
  color mapping. Hardware diagnostics belong on `/music/connect`; generic MIDI
  output and permission handling stay in `midi`.
- `src/engines/sound/`: Tone-backed playback + metronome sounds. Owns the gain
  graph (master → destination; metronome → metronome gain → master), selectable
  synth presets (`SOUND_PRESETS`/`SOUND_PRESET_NAMES`, `setInstrument`), master
  mute / metronome blend, and the pure `scoreToPattern(score, {bpm?})` helper.
- `src/engines/sample-kit/`: framework-agnostic MPC sample kits — Banks A-D
  (MIDI 36-99) auto-mapping + assignment model (`index.ts`), velocity-layer
  helpers (`setPadVelocityLayers`, `sampleForPadVelocity`), choke groups
  (`setPadChokeGroup`), sample display-name editing (`renameSample`) and
  layer-aware sample deletion (`removeSampleFromKit`), transactional
  metadata/OPFS-blob persistence (`SampleKitStore` in `store.ts`), pure XPM 2.1
  export with layer slots and `MuteGroup` values (`mpc-export.ts`), and the
  browser directory/ZIP writers (`browser-export.ts`). No Tone, Svelte, or
  audio-decode in the engine.
- `src/engines/transport/`: metronome/transport scheduling (count-in, BPM).
- `src/engines/notation/`: VexFlow-based notation rendering data.
- `src/engines/skills/`: seeded skill graph and mastery.
- `src/engines/analytics/`: confusion matrix, weak skills, and practice-next
  data.
- `src/engines/progress/`: XP, level, streak, achievements.
- `src/engines/sessions/`: practice journal/session records.
- `src/engines/dashboard/`: dashboard and skill tree view projections.
- `src/engines/challenges/`: personal practice challenge projection over
  Progress, Sessions, Analytics, and Skill Graph. It is intentionally
  non-competitive: daily XP, weak-skill reps, capability variety, streak
  continuity, and a neutral weekly summary. Do not add leagues or social
  ranking unless the user explicitly changes that product decision.
- `src/engines/coach/`: local practice coach projection over dashboard-style
  weak spots, progress state, sessions, and the daily-routine planner.
- `src/engines/transcription/`: local transcription draft model. Keep parsing
  and draft→Score conversion framework-agnostic. Basic Pitch stays in route-level
  browser adapter code and must adapt extractor output to
  `ExtractedTranscriptionNote[]`, then pass it through `extractedNotesToDraft()`
  before touching UI or score-following. Cleanup heuristics for extractor output
  belong here and must stay pure/tested.
- `src/engines/chord-verification/`: expected-target chord-tone verifier. Keep
  this limited to comparing observed monophonic/MIDI notes against a selected
  target; do not turn it into open browser polyphonic chord recognition.
- `src/engines/chord-id/`: open chord identification — `identifyChord(pitchClasses)`
  matches a pitch-class set against quality templates across all 12 roots and
  ranks by Jaccard similarity (inversion-agnostic, prefers the most complete
  chord); `toPitchClasses()` reduces MIDI to a deduped pitch-class set. Pure;
  extend the quality table here, not at call sites. Feed it pitch classes from
  an analyzed buffer or MIDI — it has no audio/streaming concerns.
- `src/engines/audio-in/` also exports `recordMicClip()` — the buffered
  (MediaRecorder) counterpart to the streaming `AudioPitchSource`, for
  analyze-on-demand capture. The stream factory is injectable for tests.
- `src/engines/projection/`: derived view helpers (journal focus, rhythm HUD,
  technique ladder, journal projections, canonical score voice filtering, and
  piano, guitar/ukulele fretboard, and Aerophone projections).
  `projectScoreToPiano()` preserves source indexes/timing and assigns bass
  voices left, melody voices right, then uses a configurable register split for
  unclassified voices. `projectScoreToFretboard()`
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
- Song Studio registers its exact practice context, then starts performance
  timing from the monotonic downbeat returned by `MusicRuntime.beginPerformance()`.
  Always call `runtime.endPerformance()` on completion, cancellation, errors,
  and route teardown; do not derive scoring timestamps from wall-clock time or
  duplicate transport instances.
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
  from a shape + tuning, ascending pitch-order grading, and scored buffered
  open-chord identification via `createOpenChordIdentificationExercise()`.
  Shapes are standard open voicings; treat as hardware-pending until verified on
  the instrument.
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
  playback patterns for `/music/songs/[id]`.
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
  Port the structure and UX. **Chrome** (sidebar, page, cards, primary actions,
  text) is driven by the site theme tokens. Same fonts as the site — no second
  font family.
- **Practice-canvas palette (scoped, allowed).** The Music app defines a small
  scoped palette used *only* inside `PracticeStage` (the interactive
  keyboard/fretboard/staff/sequencer/gauge surface):
  - `--stage*` — the adaptive instrument-panel surface (charcoal in dark, soft
    neutral inset in light). Never used for chrome.
  - `--practice-accent` — the single focus/target/progress accent on the stage.
  - `--instr-*` / `data-instr` — instrument **identity** only (badge, switcher,
    now-playing, accent line); never to convey data/judgment, and never as small
    text on the stage (use a tinted fill + a tested `--instr-*-foreground`).
  - `--success/--warn/--info/--destructive` — data/judgment only (mastery, tuner,
    timing). Never collide with instrument hue.
  These live as tokens in `src/app.css` (registered in `@theme inline`); use the
  Tailwind utilities (`bg-stage`, `text-stage-foreground`, `ring-practice-accent`,
  `bg-instr`). Do not use stage/instr tokens outside `PracticeStage`.
- Still forbidden: hardcoded hex in components (except documented `themeColor()`
  fallbacks for third-party canvas libs), restyling chrome per-page, or a second
  font family.
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
  active input source shows in each page header's `SourceReadout`. The floating
  practice controls drive the shared practice clock and metronome.
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
