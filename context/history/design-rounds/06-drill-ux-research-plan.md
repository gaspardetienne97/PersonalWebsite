# 06 - Drill UX Research And Implementation Plan

Research date: 2026-06-30. Scope: every current Music app drill or drill-like
practice surface, with recommendations grounded in competitive product UX and
the current `/music` architecture.

This is a planning document only. It does not change product behavior.

## Executive Direction

The best music apps do not give every drill a unique page grammar. They reuse a
small number of practice patterns, then specialize the central visual target by
task.

Adopt this shared drill anatomy across the Music app:

1. Setup strip: one row for mode, instrument/input, level, tempo, count-in, and
   strictness. Keep advanced controls collapsed.
2. Central target stage: the thing the user must react to now. This can be a
   replay orb, staff cursor, fretboard, piano, tuner gauge, chord chart, or pad
   grid.
3. Live input mirror: always show what the app heard or received, using the same
   instrument projection as the target.
4. Progress rail: current rep, remaining reps, weak spot, and next target.
5. Immediate feedback: one concise result plus the dimension that matters most
   for that drill: pitch, timing, intonation, coverage, evenness, articulation,
   or memory.
6. Summary: accuracy, XP, best/worst dimension, and one next action.

This matches the strongest patterns found in:

- Soundslice: synced notation, visual note highlighting, note-click navigation,
  tempo changes, snapped loops, part focus, visual keyboard/fretboard, pitch
  names, rhythm counts, clips, notebook, shortcuts, and waveform loops
  ([source](https://www.soundslice.com/features/)).
- flowkey: instant feedback, Wait Mode, video plus sheet music, slow motion,
  loop function, and separate-hand practice ([source](https://www.flowkey.com/en)).
- TonalEnergy: target tuner, mode-specific tuner settings, string tuner,
  tone generator, analysis pages for note shapes, advanced metronome, drones,
  recording, and progress tracking ([source](https://www.tonalenergy.com/)).
- musictheory.net/Tenuto: fast, focused drill taxonomy for staff, keyboard,
  fretboard, and ear-training identification, plus permanent customized
  exercise links ([source](https://www.musictheory.net/exercises)).
- ToneGym: short game-like cards for chord, interval, melody, rhythm, solfege,
  chord progression, and sight-reading drills ([source](https://www.tonegym.co/games/index)).
- iReal Pro: chord-chart-first jam practice with style, key, tempo, mixer,
  measure loops, automatic tempo increase, and automatic transposition
  ([source](https://www.irealpro.com/)).
- Ableton Note: capture-first loop creation, 16-pad percussion grid,
  25-pad melody grid, Capture MIDI, variations, quantize/nudge, note repeat,
  sampler, and scene-style continuation ([source](https://www.ableton.com/en/note/)).

## Cross-Cutting Component Plan

### Add a `PracticeDrillShell`

Create one route-level layout component used by drills, not references:

- `setup`: compact controls, using `@repo/ui` Select, ToggleGroup, Slider, and
  Tooltip where possible.
- `stage`: one `PracticeStage` region with an explicit `data-instr`.
- `rail`: current target, progress, recent misses, and optional next action.
- `feedback`: standard `SessionFeedback` slot.
- `summary`: standard score/XP/diagnostics slot.

Do not move scoring into this component. It should only compose route state.

### Add a `DrillProgressRail`

Common rail variants:

- Prompt rail: `3 / 10`, current level, replay count, next prompt.
- Sequence rail: current note/chord/pad, completed/remaining, loop target.
- Timing rail: current beat, average offset, early/on/late histogram.
- Intonation rail: in-tune seconds, average drift, steadiness, pitch trace.

### Add `AdaptiveRetryBar`

A small post-feedback command row:

- Retry this rep
- Slow down
- Practice the weak item
- Continue

This borrows from flowkey's loop/slow/retry grammar and iReal Pro's loop plus
tempo-ramp practice.

### Add shareable drill configs

For non-song drills, encode setup in query params or a serializable config:

- Ear: drill, level, answer mode, feedback mode.
- Reading: activity, clef, key, range, meter, difficulty, instrument.
- Rhythm: bpm, beats, subdivision/accent pattern.
- Technique: instrument, shape/string/key, tempo, strictness.
- Jam: progression, key, style, tempo, loop range.

This is directly supported by the musictheory.net/Tenuto model of permanent
customized exercise links.

## Drill-By-Drill Plan

### Ear Training - `/music/learn/ear`

Research fit: Functional Ear Trainer, EarMaster, Complete Ear Trainer,
ToneGym, musictheory.net/Tenuto.

Current strengths:

- Already has focused and mixed sessions.
- Already supports choice, play-back, pocket/listen, and voice modes.
- Already has adaptive queue, repertoire transfer, and confusion summary.

Recommended UI:

- Make the central stage a single "Hear - Identify - Resolve" surface.
- For scale degrees, always show tonal context: key, tonic drone state, and
  movable-do degree buttons. The button grid should be degree-first, not generic
  interval-first.
- After any answer, play a short resolution to tonic in practice mode.
- Put interval/chord/scale-degree/melody dictation into one drill switcher, but
  keep the answer surface specialized by mode.
- Add a mini "weak confusions" rail during the session: for example `b6 -> 5`,
  `m6 -> P5`.
- Let custom configs be shareable/bookmarkable.

Implementation slices:

1. Refactor `EarTrainingSessionView` into stage + answer-mode components.
2. Add `DrillProgressRail` for prompt count, current level, and weakest
   confusion.
3. Add `AdaptiveRetryBar` after feedback.
4. Add config query serialization.

### Melody Dictation - inside `/music/learn/ear`

Research fit: ToneGym Melody Hunter/Melodix, EarMaster, Soundslice.

Recommended UI:

- Treat this as memory plus reconstruction, not as ordinary multiple choice.
- Stage has replay controls, phrase length, and a blank note-slot strip.
- Input mirror should show the played melody as note chips or a tiny staff.
- Feedback should mark ordered positions: correct pitch, wrong pitch, missing,
  extra.
- Add a "hear tonic again" control separate from "replay phrase".

Implementation slices:

1. Add a melody-slot answer component.
2. Reuse `StaffNotation` only after answer or in an optional scaffold mode.
3. Put phrase misses into repertoire review and weak-degree summary.

### Note Reading Flashcards - `/music/learn/reading`

Research fit: musictheory.net/Tenuto, Soundslice, flowkey.

Current strengths:

- Already supports naming and play answers.
- Already projects to piano or fretboard.

Recommended UI:

- Optimize for speed: one note or chord in the center, answer grid or live
  instrument below, no large setup panels once the session starts.
- Add optional scaffolds: pitch names, keyboard/fretboard location, and "show
  landmark".
- Show response latency in summary, not only accuracy.
- Missed notes should become a "repeat missed notes" set.

Implementation slices:

1. Add a compact `FlashcardStage`.
2. Add scaffold toggles: note names, landmark hints, instrument location.
3. Add latency capture if the engine exposes timestamps; otherwise add route
   timing around prompt display and accepted answer.

### Sight Reading - `/music/learn/reading`

Research fit: Soundslice, Piano Marvel, flowkey, SmartMusic.

Current strengths:

- Already has Wait and Performance modes.
- Already has staff cursor/highlight work, piano/fretboard previews, tab reveal,
  strictness, tempo, and generated score.

Recommended UI:

- Make staff the primary stage, with a visible cursor and horizontal scroll
  containment.
- Put target instrument preview directly below the staff, using the same target
  notes and hand/string state.
- Add loop/slow controls even for generated phrases: repeat current measure,
  repeat missed group, slow to 70%.
- Add mode wording: "Learn" for wait mode, "Assess" for performance mode. Keep
  the engine values as `wait` and `performance`.
- Summary should chart pitch completion and timing separately.

Implementation slices:

1. Move session layout into `PracticeDrillShell`.
2. Promote "current measure/group" and "repeat missed group" commands.
3. Add post-summary "Practice missed groups" if the engine exposes group-level
   misses.

### Rhythm Trainer - `/music/learn/rhythm`

Research fit: Complete Rhythm Trainer, ToneGym rhythm games, Soundbrenner,
TonalEnergy metronome.

Current strengths:

- Already supports BPM, tap tempo, MIDI, mic onset, on-screen tap, and timing
  meter.

Recommended UI:

- Central stage should be a visual pulse lane, not a card grid. Show the next
  beat approaching, then leave early/on/late dots behind it.
- Add subdivisions and accent patterns as next UX layer: quarter, eighth,
  triplet, sixteenth, clave/swing later.
- Add "mute bars" or "gap click" mode after the basic pulse is stable.
- Feedback should prioritize mean signed offset and consistency separately.

Implementation slices:

1. Add `PulseLane` visual component.
2. Extend setup with subdivision/accent presets in the engine before adding UI.
3. Add gap-click mode only after current quarter-pulse UI is stable.

### Tuner / Intonation / Drone - `/music/tuner`

Research fit: TonalEnergy, Cleartune, Soundbrenner.

Current strengths:

- The app already consolidated tuner, intonation, and drone.
- It already has `CentsMeter`, `CentsGauge`, and pitch trace primitives.

Recommended UI:

- Keep a simple default tuner: note name, cents gauge, Hz, clarity, and Start
  mic.
- Advanced drawer: A4 reference, tolerance, temperament placeholder, input
  level, pitch trace.
- Intonation/drone mode should show a target lane: current pitch as a moving
  trace, target zone, hold time, in-tune percent, and average drift.
- Drone volume must never drown drill prompts. Use a visible mix control and
  preset "under prompt" level.

Implementation slices:

1. Audit tuner page after consolidation for one primary target per tab.
2. Move drone controls into a side rail; keep target gauge central.
3. Add persistent input/mix calibration card.

### Scales And Technique - `/music/play/scales`

Research fit: Yousician, Piano Marvel, flowkey.

Current strengths:

- Has target tempo and unlock ladder.
- Uses shared scoring pipeline.

Recommended UI:

- Stage should show the scale as a horizontal note path plus instrument preview,
  not just a static reference.
- Add fingering numbers above piano keys for common scales.
- Add tempo ladder with next unlock condition and "repeat at slower tempo".
- Summary should split pitch accuracy and evenness.
- Expand beyond hardcoded C major only when engine data is ready.

Implementation slices:

1. Build a `ScaleRunStage` using `InstrumentView` or piano-specific projection.
2. Add scale/key selection backed by `music-core` scale data.
3. Add fingering metadata in core before rendering finger numbers.

### Spider Drill - `/music/play/spider`

Research fit: Rocksmith+ riff repeat, fretboard trainers, Yousician guitar.

Current strengths:

- Has instrument, tuning, string, fret, tempo, fretboard target notes, and
  scoring for pitch plus evenness.

Recommended UI:

- Stage should be a single fretboard with the next fret emphasized and the
  whole four-note path visible.
- Add adaptive difficulty: same string same tempo until clean, then add tempo,
  adjacent string, or two-string shift.
- Show string/fret labels and note names in targets.
- Summary should show pitch cleanliness and evenness separately, with "retry
  same string" primary.

Implementation slices:

1. Extract a `FrettedSequenceStage` shared by spider and string reading.
2. Add adaptive next-step projection in `technique-session` or a pure helper.
3. Add query config for string/fret/tempo.

### Chord-Perfect - `/music/play/chord-perfect`

Research fit: Yousician/Simply Guitar, Fender Play, fretboard trainers,
GuitarTuna-style calibration.

Current strengths:

- Combines shape drill, expected-target verifier, and strum identify.
- Uses shared fretboard and mic/on-screen/MIDI routing.

Recommended UI:

- Split the screen into three clear modes: Build shape, Pick strings cleanly,
  Strum and identify. Do not show all verifier panels with equal visual weight.
- Stage should show chord diagram/fretboard, required fingers, muted/open
  strings, and next string.
- Add a calibration preflight: tune/check input level/noise before mic verifier.
- For strum analysis, show detected notes as pitch classes and missing/extra
  tones around the chord name.

Implementation slices:

1. Add internal mode tabs or segmented control for the three chord-perfect
   workflows.
2. Add chord-shape fingering display if the shape data carries finger numbers;
   otherwise add data in core.
3. Collapse verifier results into `SessionFeedback` plus a compact tone map.

### Chord Progression - `/music/play/chord-progression`

Research fit: iReal Pro, Moises, Yousician/Rocksmith phrase practice.

Current strengths:

- Known-progression follower exists with chroma/onset/Basic Pitch guardrails.

Recommended UI:

- Central stage should be the chord chart. The active chord should be visually
  obvious, with a pre-roll marker for the upcoming chord.
- Add loop section, tempo, and "transpose next chorus" controls.
- Show mic confidence and detected pitch classes in a small technical drawer,
  not the main stage.
- Summary should show per-chord coverage and timing band.

Implementation slices:

1. Build `ProgressionChartStage` shared by jam, chord-scale, and chord-follower.
2. Add loop range and transposition to the progression session config.
3. Keep real-time technical diagnostics collapsed by default.

### Two-Hand Independence - `/music/play/two-hand`

Research fit: flowkey, Piano Marvel, Yousician piano.

Current strengths:

- Has left and right hand scoring by register.
- Uses two on-screen keyboards.

Recommended UI:

- Default mode should isolate: left hand only, right hand only, both hands.
- Stage should show two lanes: left pulse below, right scale line above, with
  the current beat aligned vertically.
- Below the lanes, show one piano with hand-color highlights, not two competing
  keyboards unless active input needs it.
- Summary should show hand-specific pitch, timing, and sync.

Implementation slices:

1. Replace two keyboard cards with a two-lane target stage plus shared piano
   input.
2. Add hand-isolation mode to setup and core prompt projection.
3. Add "practice weaker hand" next action.

### MPC Rudiments - `/music/play/mpc`

Research fit: Melodics, Ableton Note, Koala/MPC-style pad workflows.

Current strengths:

- Has left/right pads, hit count, tempo, hardware/on-screen pad grid, and
  scoring for order, timing, velocity, completion.

Recommended UI:

- Stage should be a 4x4 pad grid plus a sequence lane. The next pad pulses, the
  previous hits leave timing/velocity color.
- Add rudiment presets beyond single-stroke when engine supports them: doubles,
  paradiddle, accents.
- Add "note repeat" as a creative/studio control, not as a graded rudiment
  unless the engine measures it.
- Summary should show order, timing, and velocity consistency as separate bars.

Implementation slices:

1. Extract a shared `PadRudimentStage`.
2. Add rudiment pattern data in `music-core` before expanding UI.
3. Integrate MPC pad LED preview only as an explicit connected-device action.

### Aerophone Technique - `/music/learn/aerophone`

Research fit: TonalEnergy analysis, wind-controller context, Yousician drill
shell.

Current strengths:

- Unified fingering, long-tone, swell, and articulation page exists.
- Uses breath CC2 and Aerophone fingering engine.

Recommended UI:

- Central stage changes by mode:
  - Fingering: large fingering diagram plus note picker.
  - Long tone: target pitch lane, breath steadiness lane, hold timer.
  - Swell: target envelope and actual CC2 envelope.
  - Articulation: attack grid with note duration markers and breath starts.
- Show pitch drift and breath stability separately. Do not collapse all success
  into one percent.
- Add replay/compare for the last attempt if recording data is available.

Implementation slices:

1. Extract `AerophoneTechniqueStage` variants.
2. Add standard summary dimensions: pitch, breath, articulation, duration.
3. Keep physical fingering caveats until hardware verification.

### ii-V-I Voicings - `/music/play/voicings`

Research fit: Piano Marvel assessment, flowkey hand isolation, iReal Pro
12-key transposition practice.

Current strengths:

- Graded across 12 keys, variants, instrument-aware, held/lenient modes, manual
  or auto advance.

Recommended UI:

- Stage should be a 12-key journey map plus one active voicing target.
- For piano, show LH/RH responsibility and suggested fingering numbers where
  voicing data can support it.
- For monophonic instruments, explicitly show arpeggio order and do not present
  the chord as if it can be held.
- Add "transpose next" and "loop current key" controls.

Implementation slices:

1. Replace large option block with compact setup strip.
2. Add `VoicingJourneyRail` for 12-key progress.
3. Add fingering metadata to core voicing data before rendering numbers.

### Jazz Licks - `/music/play/licks`

Research fit: Soundslice, flowkey, Rocksmith+ Riff Repeater.

Current strengths:

- Has transcribed lick playback and graded note-by-note phrase work.

Recommended UI:

- Stage should be notation/tab/piano projection with a phrase cursor, not only
  a card list.
- Add loop, slow, and "hide notes after two replays" memory mode.
- Let the user isolate subphrases: first half, second half, trouble bar.
- Summary should show melodic accuracy, rhythm accuracy, and missed notes.

Implementation slices:

1. Use `StaffNotation` plus `OnScreenKeyboard` or `InstrumentView` for the lick
   target.
2. Add phrase loop controls backed by canonical beat ranges.
3. Add memory mode as display-only UI first, then scoring changes later.

### Chord-Scale Drill - `/music/play/chord-scales`

Research fit: iReal Pro, Soundslice, ToneGym progression games.

Current strengths:

- Graded note-by-note against go-to scales over ii-V-I movement.

Recommended UI:

- Use the same `ProgressionChartStage` as jam/chord-progression.
- Active chord should show: chord symbol, target scale, chord tones, color
  tones, avoid notes.
- Instrument preview should light the valid scale tones and emphasize chord
  tones.
- Summary should group results by chord/scale, not just the whole run.

Implementation slices:

1. Share chart and target-tone visualization with `/music/jam`.
2. Add "show chord tones only" and "show full scale" mode.
3. Add per-chord result summary.

### Free Play / Practice Lab - `/music/play`

Research fit: Ableton Note, Moises, Anytune/Transcribe, TonalEnergy recording.

Current strengths:

- Records MIDI/on-screen and optional audio over optional backing tracks.

Recommended UI:

- Make capture the primary task: Arm, Start, Play, Review.
- Add capture-without-arming later if feasible, inspired by Ableton Note's
  Capture MIDI, but do not let it complicate the current recorder.
- Review should show take cards with waveform or MIDI density, notes, duration,
  export, compare, and "practice this idea".
- Move destructive/error states to toasts once `sonner` is adopted.

Implementation slices:

1. Reuse the shared recorder primitive from Phase 2.6.
2. Add take timeline visualization.
3. Add "send take to Song Studio/Piano Roll" after create consolidation.

### Jam / Improv - `/music/jam`

Research fit: iReal Pro, Moises, Soundslice, Ableton Note.

Current strengths:

- Has chord progressions, backing mode, target tones, on-screen keyboard, and
  recording.

Recommended UI:

- Stage should be chord chart first, not keyboard first.
- The instrument preview should be contextual: chord tones bold, scale tones
  muted, avoid tones visually suppressed.
- Add loop section, auto tempo increase, auto transpose, and mute/mix controls
  for backing parts.
- Add "record chorus" and review takes in context.

Implementation slices:

1. Share `ProgressionChartStage` with chord-scale and chord-progression.
2. Add progression loop and transposition controls in engine/session.
3. Add take review panel shared with Free Play.

### Song Studio / Score Practice - `/music/songs/[id]`

Research fit: Soundslice, flowkey, Piano Marvel, Tomplay.

Current strengths:

- Supports MusicXML/OSMD, Staff/Tab/Fingering views, parts, selection ranges,
  Wait/Performance, count-in, strictness, takes, and summary.

Recommended UI:

- Treat score as the central source of truth: cursor, active note, active
  measure, and selected range must remain visible.
- Setup should be a compact side panel; it should not visually compete with the
  score after practice starts.
- Add first-class loop clips: saved full/section/custom ranges with labels.
- Show instrument overlay under score: piano/fretboard/aerophone depending on
  selected view/instrument.
- Summary should include per-section and per-take diagnostics, with "retry worst
  section".

Implementation slices:

1. Keep OSMD and VexFlow cursor parity tests.
2. Add saved practice clips in `score-practice` or song metadata.
3. Add "retry worst section" projection from summary.

### Transcription Trainer - `/music/transcribe`

Research fit: Soundslice transcription, Anytune/Transcribe, Ableton Note
capture, TonalEnergy recording.

Current strengths:

- Has manual entry, Basic Pitch extraction, preview, wait-mode trainer, and save
  to repertoire.

Recommended UI:

- Split into Source, Extract/Edit, Practice.
- Source: file/dropzone and extraction progress.
- Extract/Edit: piano-roll or note-list correction with confidence filtering.
- Practice: reuse Score Practice shell with generated score and wait mode.
- Add waveform/loop region later for correction, not in the first pass.

Implementation slices:

1. Convert current page into a three-step workflow.
2. Reuse score practice stage for trainer rather than a custom practice block.
3. Add confidence visualization to extracted notes.

## Shared Implementation Phases

### Phase A - Drill Shell And Rails

Files likely touched:

- `src/routes/music/_components/PracticeDrillShell.svelte`
- `src/routes/music/_components/DrillProgressRail.svelte`
- `src/routes/music/_components/AdaptiveRetryBar.svelte`
- Existing drill pages only for composition, not scoring changes.

Acceptance:

- Ear, Reading, Rhythm, Spider, MPC, and Voicings each use the shell.
- No scoring snapshot changes.
- Focused route tests still pass.

### Phase B - Notation And Instrument Stages

Files likely touched:

- `StaffNotation.svelte`
- `MusicXmlScore.svelte`
- `TabNotation.svelte`
- `OnScreenKeyboard.svelte`
- `FretboardInput.svelte`
- New stage components: `ScoreFollowerStage`, `FrettedSequenceStage`,
  `ScaleRunStage`, `ProgressionChartStage`, `PadRudimentStage`.

Acceptance:

- Staff/OSMD/Tab cursor parity.
- Piano/fretboard previews always show target notes and suggested fingerings
  only where real data exists.
- No horizontal overflow at 375px.

### Phase C - Drill Configs And Adaptive Retry

Files likely touched:

- Route pages for query param read/write.
- Pure config helpers in `packages/music-core` where a config affects engine
  behavior.

Acceptance:

- Copying a drill URL restores the same setup.
- `Retry this`, `Slow down`, and `Practice weak item` are available where the
  engine can support them.

### Phase D - Specialized Upgrades

Prioritize in this order:

1. Score practice and sight-reading cursor/loop/retry polish.
2. Ear-training degree-first stage and melody dictation slots.
3. Fretboard chord/spider/chord-perfect mode split.
4. Aerophone envelope stages.
5. Progression chart shared by jam, chord-scale, and chord-progression.
6. MPC rudiment stage and additional rudiment data.
7. Free-play/jam/transcribe recorder review improvements.

## Risks And Guardrails

- Do not add open real-time polyphonic chord recognition. Chord-progression
  remains known-progression following; chord-perfect strum ID remains buffered
  analyze-on-demand.
- Do not add route-local scoring. Engine and exercise logic stays in
  `packages/music-core`.
- Do not show fake fingering numbers. If data is missing, add explicit optional
  fingering metadata first.
- Do not let technical audio diagnostics dominate musical tasks. Keep mic/chroma
  confidence in drawers unless the drill is specifically tuner/intonation.
- Do not collapse song practice, transcription, and jam into one mega surface.
  Share stages and recorder primitives, but keep the user intent distinct.

## Implementation Status

- **Phase A — COMPLETE (2026-06-30).** Shipped on `feat/music-redesign`:
  - Foundation (`6f07844`): `PracticeDrillShell`, `DrillProgressRail`,
    `AdaptiveRetryBar` — composition-only, no scoring; the two prop-driven ones
    unit-tested. Shell slots: setup / stage / feedback (main column) + rail
    (aside) + summary (replaces body when `complete`).
  - **All six drills migrated, no scoring change, every route test green:**
    Rhythm `0db4202`, Spider `32335cb`, MPC `5d90ee6`, Voicings `32f5b45`,
    Ear `04eac25`, Reading (Flashcard + SightReading sub-components) `a5fc590`.
    Patterns: Rhythm/Spider/MPC split setup/stage/rail with the visualizer on a
    `PracticeStage`; Voicings/Ear are tightly integrated so the whole drill
    card / session-view sits in one slot + the existing aside → rail; Reading
    delegates to phase sub-components, so the shell went inside Flashcard/
    SightReading. Each browser-verified desktop + 375px, no overflow, 0 console
    errors. Full suite 895 tests, build ✓.
- **Phase B.1 — COMPLETE (2026-06-30, Codex).** First notation/instrument-stage
  extraction:
  - Added `FrettedSequenceStage` in `src/routes/music/_components/`. It wraps
    the existing `FretboardInput` inside `PracticeStage`, renders a compact
    fretted target path, marks complete/current/upcoming steps, preserves note
    names from the fretboard visual layer, and keeps on-screen taps flowing
    through the shared `InputRouter`.
  - Migrated `/music/play/spider` to use `FrettedSequenceStage` instead of its
    route-local stage markup. Scoring, session state, MIDI/on-screen routing,
    journal capture, and the `TechniqueSession.startSpider()` contract are
    unchanged.
  - Focused verification:
    `vp test src/routes/music/_components/FrettedSequenceStage.svelte.test.ts src/routes/music/play/spider/page.svelte.test.ts --run`.
  - Broad verification: `vp run @repo/web#check` (passes with the repo's
    pre-existing `unicorn(no-new-array)` warnings), `vp test --run` (896
    tests), and `vp run -r build` ✓. Preview browser check at 1280px and 375px
    found no page overflow; it also exposed existing PWA noise where nested
    Music routes request `/music/play/sw.js` and receive 404.
- **Phase B.2 — COMPLETE (2026-06-30, Codex).** First score-follower stage
  extraction:
  - Added `ScoreFollowerStage` in `src/routes/music/_components/`. It derives
    active notation event IDs and the current-group range from canonical
    `Score` notes plus `ExpectedNoteGroup`s, then renders `StaffNotation`,
    optional `TabNotation`, expected-note controls, and the matching
    piano/fretboard input mirror. It does not own score-following state,
    count-in timing, scoring, XP, or journal capture.
  - Migrated `/music/learn/reading` sight-reading to use `ScoreFollowerStage`
    for both the pre-count-in notation view and the active expected-note/input
    view. The route still owns start timestamps, wait/performance mode,
    timing feedback, finish/abandon controls, and `ReadingSession` state.
  - Focused verification:
    `vp test src/routes/music/_components/ScoreFollowerStage.svelte.test.ts src/routes/music/learn/reading/page.svelte.test.ts --run`.
  - Check verification: `vp run @repo/web#check` passes with the repo's
    pre-existing `unicorn(no-new-array)` warnings.
  - Broad verification: `vp test --run` (897 tests), `vp run -r build` ✓, and
    preview browser checks at 1280px and 375px on `/music/learn/reading` with
    no page overflow. The same existing PWA nested-route noise appears as
    `/music/learn/sw.js` 404.
- **Phase B.3 — COMPLETE (2026-06-30, Codex).** First progression-chart stage
  extraction:
  - Added `ProgressionChartStage` in `src/routes/music/_components/`. It renders
    the active chord, next chord, full progression grid, and one-octave
    target-tone keyboard from `JamProgression` + `TargetTone` data. It is
    presentational: no backing playback, recording, scoring, or transport state.
  - Migrated `/music/jam` to use `ProgressionChartStage`, removing route-local
    current-chord/progression-grid/target-keyboard markup while preserving the
    solo keyboard, record controls, backing-track controls, and shared transport
    playback registration.
  - Focused verification:
    `vp test src/routes/music/_components/ProgressionChartStage.svelte.test.ts src/routes/music/jam/page.svelte.test.ts --run`.
  - Check verification: `vp run @repo/web#check` passes with the repo's
    pre-existing `unicorn(no-new-array)` warnings.
  - Broad verification: `vp test --run` (898 tests), `vp run -r build` ✓, and
    preview browser checks at 1280px and 375px on `/music/jam` with no page
    overflow. The same existing PWA nested-route noise appears as
    `/music/sw.js` 404.
- **Phase B.4 — COMPLETE (2026-06-30, Codex).** Progression-chart adoption for
  the chord-scale drill:
  - Migrated `/music/play/chord-scales` to use `ProgressionChartStage`,
    projecting its local major/minor ii-V-I chord-scale sets into
    `JamProgression` + `TargetTone` data. Scoring, XP ingestion, run metadata,
    MIDI/on-screen routing, and the jazz sequence capture contract remain
    route-owned and unchanged.
  - Extended `ProgressionChartStage` cells to show each chord's scale label, so
    the shared stage preserves the chord-scale drill's at-a-glance "which scale
    goes with which chord" teaching surface.
  - Focused verification:
    `vp test src/routes/music/_components/ProgressionChartStage.svelte.test.ts src/routes/music/play/chord-scales/page.svelte.test.ts --run`.
  - Check verification: `vp run @repo/web#check` passes with the repo's
    pre-existing `unicorn(no-new-array)` warnings.
  - Broad verification: `vp test --run` (898 tests) and `vp run -r build` ✓.
    Preview browser checks at 1280px and 375px on `/music/play/chord-scales`
    confirmed the shared chart renders, the minor toggle updates the stage, and
    there is no page overflow. The same existing PWA nested-route noise appears
    as `/music/play/sw.js` 404.
- **Phase B.5 — COMPLETE (2026-06-30, Codex).** Progression-chart adoption for
  the chord-progression drill:
  - Migrated `/music/play/chord-progression` to use `ProgressionChartStage` as
    the primary known-progression stage, deriving the current chart index from
    `ChordFollowerState.currentIndex` and target tones from the selected
    `JamProgression`.
  - Kept microphone capture, Basic Pitch onset analysis, chord-follower
    grading, count-in, XP record, detected-tone readout, and chord-by-chord
    grade rail route-owned.
  - Focused verification:
    `vp test src/routes/music/_components/ProgressionChartStage.svelte.test.ts src/routes/music/play/chord-progression/page.svelte.test.ts --run`.
  - Check verification: `vp run @repo/web#check` passes with the repo's
    pre-existing `unicorn(no-new-array)` warnings.
  - Broad verification: `vp test --run` (898 tests) and `vp run -r build` ✓.
    Preview browser checks at 1280px and 375px on
    `/music/play/chord-progression` confirmed the shared chart renders,
    progression selection updates the stage, and there is no page overflow. The
    same existing PWA nested-route noise appears as `/music/play/sw.js` 404.
- **Phase B.6 — COMPLETE (2026-06-30, Codex).** Song-practice
  score-follower-stage parity:
  - Migrated the active `/music/songs/[id]` practice panel to use
    `ScoreFollowerStage`, so song practice now shares the same live staff
    cursor, expected-note buttons, and piano/fretboard input mirror as
    sight-reading.
  - Kept the full Song Studio preview route-owned, including OSMD MusicXML
    rendering, custom range selection, part filtering, tab/fingering preview,
    score-practice setup, count-in, performance timing, XP record, and summary.
  - Added canonical group normalization before passing score-practice execution
    groups to the stage, so selected-range groups still highlight the right
    score positions.
  - Focused verification:
    `vp test src/routes/music/_components/ScoreFollowerStage.svelte.test.ts 'src/routes/music/songs/[id]/page.svelte.test.ts' --run`.
  - Check verification: `vp run @repo/web#check` passes with the repo's
    pre-existing `unicorn(no-new-array)` warnings.
  - Broad verification: `vp test --run` (898 tests) and `vp run -r build` ✓.
    Preview browser checks at 1280px and 375px seeded a saved song in
    IndexedDB, opened `/music/songs/codex-stage-song`, started wait-mode
    practice, and confirmed the shared cursor, current-note readout, expected
    note button, piano input, and no page overflow. The same existing PWA
    nested-route script noise appeared.
- **Phase C.1 — COMPLETE (2026-06-30, Codex).** First shareable drill config
  and adaptive retry wiring:
  - Added `normalizeRhythmDrillConfig()` in
    `@repo/music-core/engines/rhythm-session` so Rhythm setup bounds
    (40-220 BPM, 2-16 beats) are pure/tested instead of route-local.
  - `/music/learn/rhythm` now restores `?bpm=&beats=` from the URL, writes setup
    changes back with `history.replaceState`, and keeps copied/bookmarked URLs
    aligned with the current drill setup.
  - Rhythm's summary `AdaptiveRetryBar` now exposes `Slow down`, lowering the
    next run by 10 BPM while preserving the beat count and returning to setup.
  - Focused verification:
    `vp test packages/music-core/src/engines/rhythm-session/rhythm-session.test.ts src/routes/music/learn/rhythm/page.svelte.test.ts --run`.
- **Phase C.2 — COMPLETE (2026-06-30, Codex).** First technique-drill
  shareable config and retry wiring:
  - Added `normalizeSpiderDrillConfig()` plus `SPIDER_DRILL_TEMPOS` in
    `@repo/music-core/engines/technique-session`, normalizing instrument,
    curated tuning, string, starting fret, and tempo presets from either object
    config or `URLSearchParams`.
  - `/music/play/spider` now restores
    `?instrument=&tuning=&string=&fret=&bpm=`, keeps setup changes reflected in
    the current URL with `history.replaceState`, and starts from the active
    guitar/ukulele instrument when no query is present.
  - Spider's summary `AdaptiveRetryBar` now exposes `Repeat spider` and
    `Slow down`; the slower action drops to the next lower tempo preset and
    immediately starts a new run.
  - Focused verification:
    `vp test packages/music-core/src/engines/technique-session/technique-session.test.ts src/routes/music/play/spider/page.svelte.test.ts --run`.
- **Phase C.3 — COMPLETE (2026-06-30, Codex).** MPC rudiment shareable config
  and retry wiring:
  - Added `normalizeMpcRudimentConfig()` plus `MPC_RUDIMENT_TEMPOS` in
    `@repo/music-core/engines/technique-session`, normalizing Bank A left/right
    pads, `8/16` hit count, tempo preset, and identical-pad fallbacks from
    object config or `URLSearchParams`.
  - `/music/play/mpc` now restores `?left=&right=&hits=&bpm=` and keeps setup
    changes reflected in the current URL with `history.replaceState`.
  - MPC's summary `AdaptiveRetryBar` now exposes `Repeat rudiment` and
    `Slow down`; the slower action drops to the next lower tempo preset and
    immediately starts a new run.
  - Focused verification:
    `vp test packages/music-core/src/engines/technique-session/technique-session.test.ts src/routes/music/play/mpc/page.svelte.test.ts --run`.
- **Phase C.4 — COMPLETE (2026-06-30, Codex).** Voicing-drill shareable config
  and retry wiring:
  - Added `normalizeVoicingDrillConfig()` in
    `@repo/music-core/engines/voicing-drill-session`, normalizing instrument,
    variant, A/B start position, strict grading, and auto/manual advance from
    object config or `URLSearchParams`.
  - `/music/play/voicings` now restores
    `?instrument=&variant=&start=&strict=&advance=` and writes setup edits back
    to the current URL with `history.replaceState`.
  - Voicings summary now exposes `Repeat voicings` through `AdaptiveRetryBar`;
    no `Slow down` action was added because this drill has no tempo-owned
    engine state.
  - Focused verification:
    `vp test packages/music-core/src/engines/voicing-drill-session/voicing-drill-session.test.ts src/routes/music/play/voicings/page.svelte.test.ts --run`.
- **Phase C.5 — COMPLETE (2026-06-30, Codex).** Ear-training shareable config:
  - Added `normalizeEarTrainingConfig()` in
    `@repo/music-core/engines/ear-training`, normalizing the last selected
    setup drill, answer mode, feedback mode, and scale-degree level from object
    config or `URLSearchParams`.
  - `/music/learn/ear` now restores `?drill=&answer=&feedback=&level=` and
    writes setup edits back to the current URL with `history.replaceState`.
    Starting a focused card updates the `drill` param, while repertoire-transfer
    starts deliberately leave the shared setup drill unchanged.
  - Ear summary already exposed repeat/retry actions through
    `EarTrainingSummary`; no `Slow down` action was added because the ear
    engine has no tempo-owned setup state for this route.
  - Focused verification:
    `vp test packages/music-core/src/engines/ear-training/ear-training.test.ts src/routes/music/learn/ear/page.svelte.test.ts --run`.
- **Phase C.6 — COMPLETE (2026-06-30, Codex).** Reading/Sight-reading
  shareable config:
  - Added `normalizeReadingDrillConfig()` in
    `@repo/music-core/engines/reading-session`, normalizing activity,
    instrument/tuning, clefs, key, MIDI range, difficulty, prompt kind, answer
    mode, sight-reading mode, tempo, strictness, meter, and measure count from
    object config or `URLSearchParams`.
  - `/music/learn/reading` now restores
    `?activity=&instrument=&tuning=&clefs=&key=&low=&high=&difficulty=&prompt=&answer=&mode=&bpm=&strict=&meter=&measures=`
    and writes setup edits back to the current URL with `history.replaceState`.
  - No new `AdaptiveRetryBar` action was added in this slice; Reading's current
    engine does not yet expose missed-note/group replay state without adding
    new scoring semantics.
  - Focused verification:
    `vp test packages/music-core/src/engines/reading-session/reading-session.test.ts src/routes/music/learn/reading/page.svelte.test.ts --run`.
- **Phase C.7 — COMPLETE (2026-06-30, Codex).** Progression-drill shareable
  configs:
  - Added `normalizeChordProgressionDrillConfig()` in
    `@repo/music-core/engines/jam`, normalizing known-progression id and tempo
    from object config or `URLSearchParams`.
  - Added `normalizeChordScaleDrillConfig()` in
    `@repo/music-core/engines/jazz`, normalizing the major/minor ii-V-I
    chord-scale changes from object config or `URLSearchParams`.
  - `/music/play/chord-progression` now restores `?progression=&bpm=` and
    writes setup edits back to the current URL with `history.replaceState`.
  - `/music/play/chord-scales` now restores `?changes=` and writes changes
    selection back to the current URL with `history.replaceState`.
  - No new `AdaptiveRetryBar` action was added in this slice; these drills do
    not yet expose a weak-item retry contract without adding new scoring
    semantics.
  - Focused verification:
    `vp test packages/music-core/src/engines/jam/jam.test.ts packages/music-core/src/engines/jazz/jazz.test.ts src/routes/music/play/chord-progression/page.svelte.test.ts src/routes/music/play/chord-scales/page.svelte.test.ts --run`.
- **Phase C.8 — COMPLETE (2026-06-30, Codex).** Jam/backing shareable config:
  - Added `normalizeJamPracticeConfig()` in
    `@repo/music-core/engines/jam`, normalizing known-progression id, backing
    mode (`drums`/`chords`), bundled drum-track id, and BPM from object config
    or `URLSearchParams`. The route supplies the valid drum-track ids so the
    helper validates against the current bundled jazz backing catalog without
    moving that catalog into the jam engine.
  - `/music/jam` now restores `?progression=&backing=&drums=&bpm=` and writes
    setup edits back to the current URL with `history.replaceState`.
  - A bookmarked `bpm`/`tempo` updates the shared transport BPM; opening
    `/music/jam` without a tempo query preserves the user's current transport
    tempo and then syncs that tempo into the URL.
  - Focused verification:
    `vp test packages/music-core/src/engines/jam/jam.test.ts src/routes/music/jam/page.svelte.test.ts --run`.
- **Phase C.9 — COMPLETE (2026-06-30, Codex).** Scales/Technique shareable
  config and retry wiring:
  - Added `normalizeScaleDrillConfig()` plus `SCALE_DRILL_TONICS` in
    `@repo/music-core/engines/technique-session`, normalizing scale kind,
    chromatic tonic, instrument preview, and BPM from object config or
    `URLSearchParams`.
  - `/music/play/scales` now restores `?scale=&tonic=&instrument=&bpm=` and
    writes setup edits back to the current URL with `history.replaceState`.
    The route now starts the selected tonic instead of hardcoding C, while
    still leaving scoring in `TechniqueSession.startScale()`.
  - Scales summary now uses `AdaptiveRetryBar` with `Practice next tempo` and
    `Slow down`; the slower action lowers BPM through the core normalizer and
    immediately starts the retry.
  - Focused verification:
    `vp test packages/music-core/src/engines/technique-session/technique-session.test.ts src/routes/music/play/scales/page.svelte.test.ts --run`.
- **Phase C.10 — COMPLETE (2026-07-01, Codex).** Jazz Licks shareable config
  and retry wiring:
  - Added `normalizeJazzLickDrillConfig()` in
    `@repo/music-core/engines/jazz`, normalizing stable lick category and lick
    number from object config or `URLSearchParams`. A valid lick can derive its
    category, and an out-of-category lick falls back to the first lick in the
    requested category.
  - `/music/play/licks` now restores `?category=&lick=` and writes category or
    lick picker edits back to the current URL with `history.replaceState`.
  - Licks completion feedback now exposes `Repeat lick` through the shared
    `AdaptiveRetryBar`; no `Slow down` action was added because the route's
    reference tempo is currently fixed and not engine-owned setup state.
  - Existing lick grading, XP capture, MIDI/on-screen routing, and jazz sequence
    scoring contracts are unchanged.
  - Focused verification:
    `vp test packages/music-core/src/engines/jazz/jazz.test.ts src/routes/music/play/licks/page.svelte.test.ts --run`.
- **Phase C.11 — COMPLETE (2026-07-01, Codex).** Two-Hand Independence
  shareable config and retry wiring:
  - Added `normalizeTwoHandDrillConfig()` plus `TWO_HAND_DRILL_TONICS` and
    `TWO_HAND_DRILL_TEMPOS` in
    `@repo/music-core/engines/technique-session`, normalizing tonic/key and
    BPM/tempo from object config or `URLSearchParams`.
  - `/music/play/two-hand` now restores `?tonic=&bpm=` and writes setup edits
    back to the current URL with `history.replaceState`.
  - Two-Hand completion feedback now exposes `Repeat drill` and `Slow down`
    through the shared `AdaptiveRetryBar`; `Slow down` moves to the next lower
    tempo preset and immediately starts the retry.
  - Existing two-hand grading, XP capture, MIDI/on-screen routing, fingering
    preview, and practice recording contracts are unchanged.
  - Focused verification:
    `vp test packages/music-core/src/engines/technique-session/technique-session.test.ts src/routes/music/play/two-hand/page.svelte.test.ts --run`.
- **Phase C.12 — COMPLETE (2026-07-01, Codex).** Chord-Perfect shareable
  config and retry wiring:
  - Added `normalizeChordPerfectDrillConfig()` plus `CHORD_PERFECT_MODES` in
    `@repo/music-core/exercises/chord-perfect`, normalizing workflow mode,
    string instrument, derived tuning, and curated chord shape from object
    config or `URLSearchParams`. A valid shape can derive its instrument, while
    an out-of-instrument shape falls back to that instrument's first curated
    chord.
  - `/music/play/chord-perfect` now restores
    `?mode=&instrument=&tuning=&shape=` and writes workflow, instrument, and
    chord picker edits back to the current URL with `history.replaceState`.
  - Build-mode completion feedback now exposes `Repeat chord` through the
    shared `AdaptiveRetryBar`.
  - Existing chord-perfect scoring, open-chord buffered identification,
    verifier modes, XP capture, MIDI/on-screen routing, and practice recording
    contracts are unchanged.
  - Focused verification:
    `vp test packages/music-core/src/exercises/chord-perfect.test.ts src/routes/music/play/chord-perfect/page.svelte.test.ts --run`.
- **Phase C.13 — COMPLETE (2026-07-01, Codex).** Aerophone Technique
  shareable config:
  - Added `normalizeAerophoneDrillConfig()` plus shared mode, duration, style,
    and tempo presets in `@repo/music-core/engines/technique-session`,
    normalizing Aerophone mode, target MIDI note, long-tone/swell duration,
    articulation style, and articulation BPM from object config or
    `URLSearchParams`.
  - `/music/learn/aerophone` now restores
    `?mode=&target=&duration=&style=&bpm=` and writes target-note, mode,
    duration, articulation style, and articulation tempo edits back to the
    current URL with `history.replaceState`.
  - Existing Aerophone long-tone, swell, articulation scoring, MIDI/on-screen
    routing, CC2 capture, XP capture, stage views, and summary dimensions are
    unchanged.
  - Focused verification:
    `vp test packages/music-core/src/engines/technique-session/technique-session.test.ts src/routes/music/learn/aerophone/page.svelte.test.ts --run`.
- **Phase C.14 — COMPLETE (2026-07-01, Codex).** Adaptive retry completion
  cleanup:
  - `/music/learn/aerophone` summary feedback now uses the shared
    `AdaptiveRetryBar` instead of the footer repeat state. Long-tone, swell,
    and articulation summaries expose a repeat action; completed articulation
    summaries also expose `Slow down`, lowering the articulation BPM to the next
    supported preset and immediately restarting the drill.
  - Long-tone and swell intentionally do not expose `Slow down`, because their
    primary control is duration/envelope rather than tempo.
  - Focused verification:
    `vp test src/routes/music/learn/aerophone/page.svelte.test.ts --run`.
- **Phase D.1 — COMPLETE (2026-06-30, Codex).** First sight-reading
  cursor/loop/retry polish:
  - Updated `/music/learn/reading` sight-reading mode wording to the product
    language from the research plan: `wait` remains the engine value but renders
    as **Learn**, and `performance` remains the engine value but renders as
    **Assess**. The active rail mirrors this as Learn/Assess mode.
  - Extended `ReadingSummary` to use the shared `AdaptiveRetryBar`. Sight-reading
    summaries now expose `Repeat session` plus `Slow down`; the slower action
    lowers BPM through `normalizeReadingDrillConfig()`, restarts the
    sight-reading setup immediately, and keeps the shareable URL's `bpm` query
    in sync.
  - Initially deferred "repeat missed group" until `ReadingSession` /
    `score-follower` exposed group-level miss replay state; resolved in D.1b.
  - Focused verification:
    `vp test src/routes/music/learn/reading/page.svelte.test.ts --run`.
- **Phase D.2a — COMPLETE (2026-06-30, Codex).** First ear-training
  degree-first stage:
  - Specialized choice-mode scale-degree prompts inside
    `EarTrainingSessionView`: they now show a tonic-context panel (tonic note +
    scale context) and a degree-first answer grid with large degree tokens and
    solfege labels.
  - Generic interval/chord choice prompts keep the existing answer grid; scoring,
    queueing, prompt playback, and `EarTrainingSession` state are unchanged.
  - Route tests now interact with either the generic answer grid or the
    scale-degree-specific grid, preserving mixed-session coverage.
  - Focused verification:
    `vp test src/routes/music/learn/ear/page.svelte.test.ts --run`.
- **Phase D.2b — COMPLETE (2026-06-30, Codex).** Melody dictation slot stage:
  - Added a dedicated `MelodyDictationStage` for melody-dictation and
    repertoire-transfer playback prompts. The stage shows phrase length, blank
    note slots, local played-note fill states, replay phrase, and a tonic-only
    button when the prompt exposes `tonicMidi`.
  - Kept scoring, prompt generation, and answer completion in
    `@repo/music-core`; the route stage derives slot count from
    `targetMidiNotes` / `requiredPlayedNotes` and only mirrors local input for
    the visible phrase reconstruction UI.
  - Interval/chord playback prompts keep the existing generic `InputSurface`.
  - Focused verification:
    `vp test src/routes/music/learn/ear/page.svelte.test.ts --run`.
- **Phase D.2c — COMPLETE (2026-06-30, Codex).** Ordered phrase-result
  feedback:
  - Added `PhraseResultFeedback`, a presentational strip that reads the engine's
    per-position pitch metrics and renders matched/review/missing positions with
    expected and played note labels.
  - `EarTrainingSessionView` now shows that strip after practice-mode
    melody-dictation and repertoire-transfer reps when the latest result has
    phrase metrics.
  - `EarTrainingSummary` now renders the same strip under recent
    melody-dictation / repertoire-transfer results, so one-prompt transfer
    sessions still show ordered position feedback after completion.
  - Focused verification:
    `vp test src/routes/music/learn/ear/page.svelte.test.ts --run`.
- **Phase D.2d — COMPLETE (2026-07-01, Codex).** Repertoire weak-degree
  capture + retry scheduling:
  - Repertoire-transfer exercises and review-plan schedules now carry all
    unique phrase scale-degree skills, while keeping the first degree as the
    legacy primary `targetSkillId` for existing views.
  - `EarTrainingSession` results now expose plural `targetSkillIds`; summary
    confusions promote melody-dictation / repertoire-transfer pitch mistakes
    into scale-degree pairs such as `3 -> 2`.
  - Added the pure `buildEarTrainingRetrySchedule()` helper. The ear-training
    summary's `Retry mistakes` action now starts a scheduled weak-item session
    from those confusions, using `full-current` only for the retry run so
    out-of-level repertoire degrees are not filtered out.
  - Focused verification:
    `vp test packages/music-core/src/engines/ear-training/repertoire.test.ts packages/music-core/src/engines/ear-training/ear-training.test.ts src/routes/music/learn/ear/page.svelte.test.ts --run`.
- **Phase D.1b — COMPLETE (2026-07-01, Codex).** Core-backed sight-reading
  missed-group replay:
  - `ScoreFollowerAnswer` now includes cloned `missedGroups` for both wait and
    performance runs, giving summaries a group-level retry contract instead of
    route-local score slicing.
  - `ReadingSession.prepareMissedSightReading()` builds a compact retry prompt
    from the latest sight-reading summary's missed groups, rebasing the missed
    groups into a short generated score and keeping target skill/scoring
    semantics in `@repo/music-core`.
  - `/music/learn/reading` summary now exposes `Practice missed groups` through
    `AdaptiveRetryBar` when the engine reports missed groups. Assess-mode
    sight-reading can finish after the run starts, so missed notes can be
    summarized and retried without requiring 100% progress first.
  - Focused verification:
    `vp test packages/music-core/src/engines/score-follower/score-follower.test.ts packages/music-core/src/engines/reading-session/reading-session.test.ts src/routes/music/learn/reading/page.svelte.test.ts --run`.
- **Phase D.3a — COMPLETE (2026-07-01, Codex).** Chord-perfect mode split:
  - `/music/play/chord-perfect` now has internal workflow tabs for **Build
    shape**, **Pick strings cleanly**, and **Strum and identify**, so the
    existing shape drill, expected-target verifier, and buffered strum ID are no
    longer presented as equal peer panels.
  - The split is route-IA only: `TechniqueSession.startChordPerfect()`,
    `verifyChordTarget()`, buffered `createOpenChordIdentificationExercise()`,
    XP capture, MIDI/on-screen routing, and microphone analysis contracts are
    unchanged.
  - The shared fretboard remains visible across modes, while each mode exposes
    only its relevant primary action (`Start drill`, verifier controls, or
    `Strum & identify`).
  - Focused verification:
    `vp test src/routes/music/play/chord-perfect/page.svelte.test.ts --run`.
- **Phase D.3b — COMPLETE (2026-07-01, Codex).** Chord-perfect fingering guide:
  - Curated `ChordShape` data now carries explicit suggested `fingers` arrays
    aligned with `frets`, so finger numbers are core-owned metadata rather than
    route-local guesses.
  - `/music/play/chord-perfect` renders a low-string-to-high-string suggested
    fingering guide for the selected shape, including open and muted strings and
    finger numbers only where the core shape data supplies them.
  - Existing chord-perfect scoring, verifier, strum ID, MIDI/on-screen routing,
    and microphone contracts are unchanged.
  - Focused verification:
    `vp test packages/music-core/src/exercises/chord-perfect.test.ts src/routes/music/play/chord-perfect/page.svelte.test.ts --run`.
- **Phase D.3c — COMPLETE (2026-07-01, Codex).** Chord-perfect compact tone map:
  - The expected-target verifier now summarizes coverage with shared
    `SessionFeedback` and preserves the score percentage while showing a compact
    per-tone map (`matched`, `missing`, `extra`) from the existing
    `ChordVerificationResult`.
  - Buffered strum identification reuses the same tone-map projection under the
    detected chord result, so target coverage and missing/extra tones are
    scannable without adding any new scoring logic.
  - Existing chord-perfect scoring, open-chord ID scoring, MIDI/on-screen routing,
    microphone capture, XP capture, and journal capture are unchanged.
  - Focused verification:
    `vp test src/routes/music/play/chord-perfect/page.svelte.test.ts --run`.
- **Phase D.4a — COMPLETE (2026-07-01, Codex).** Aerophone envelope/stage split:
  - `/music/learn/aerophone` now exposes a persistent central technique stage
    that changes by mode instead of relying only on HUD tiles and the active-run
    progress box.
  - Long-tone mode separates the pitch lane, breath steadiness lane, and hold
    timer; dynamic-swell mode shows a target CC2 envelope plus live actual CC2
    readout; articulation mode shows an attack grid with target duration markers
    and breath-start feedback.
  - Existing Aerophone long-tone, swell, articulation scoring, MIDI/on-screen
    routing, CC2 capture, XP capture, and practice recording contracts are
    unchanged.
  - Focused verification:
    `vp test src/routes/music/learn/aerophone/page.svelte.test.ts --run`.
- **Phase D.4b — COMPLETE (2026-07-01, Codex).** Aerophone summary dimensions:
  - Completion feedback now includes a standard dimension grid for pitch, breath,
    articulation, and duration instead of leaving those signals blended into one
    percentage line.
  - The route derives those dimensions from existing `ScoringMetric` data,
    prompt payloads, and articulation answers: pitch target matches, CC2
    steadiness/sample counts, articulation score/beat fraction, and breath-run
    duration coverage for long-tone/swell.
  - Existing Aerophone scoring, evidence, XP, MIDI/on-screen routing, and CC2
    capture contracts are unchanged.
  - Focused verification:
    `vp test src/routes/music/learn/aerophone/page.svelte.test.ts --run`.
- **Phase D.5 — COMPLETE (2026-07-01, Codex verified).** Shared progression chart:
  - `ProgressionChartStage` is the shared progression stage for Jam,
    Chord-Scale, and Chord Progression, showing the current/next chord, full
    chord chart, and target-tone keyboard roles from the Jam progression/tone
    helpers.
  - `/music/jam`, `/music/play/chord-scales`, and
    `/music/play/chord-progression` all render that shared stage instead of
    maintaining separate progression previews.
  - Focused verification:
    `vp test src/routes/music/_components/ProgressionChartStage.svelte.test.ts src/routes/music/jam/page.svelte.test.ts src/routes/music/play/chord-scales/page.svelte.test.ts src/routes/music/play/chord-progression/page.svelte.test.ts --run`.
- **Phase D.6 — COMPLETE (2026-07-01, Codex).** MPC rudiment stage and pattern data:
  - Added `PadRudimentStage`, a shared MPC practice stage combining the 4x4 Bank
    A pad grid, next-pad cue, BPM chip, and target sequence lane with
    completed/current/upcoming states.
  - `@repo/music-core` now owns reusable rudiment pattern data and sequence
    generation for single strokes, double strokes, and paradiddles; the existing
    single-stroke exercise remains backward-compatible and still owns grading.
  - `TechniqueSession` shareable MPC config now carries `patternId`, and
    `/music/play/mpc` exposes the pattern selector, restores/syncs it through
    the `pattern` query param, and starts the selected pattern.
  - Existing MPC scoring dimensions (order, timing, velocity consistency,
    completion), MIDI/on-screen routing, XP capture, and adaptive retry are
    unchanged.
  - Accent rudiments remain deferred until the engine has explicit velocity
    target/scoring support; no fake accent grading was added.
  - Focused verification:
    `vp test packages/music-core/src/exercises/mpc-single-stroke.test.ts packages/music-core/src/engines/technique-session/technique-session.test.ts src/routes/music/_components/PadRudimentStage.svelte.test.ts src/routes/music/play/mpc/page.svelte.test.ts --run`.
- **Phase D.7 — COMPLETE (2026-07-01, Codex).** Free-play/jam/transcribe recorder review improvements:
  - Added `MidiTakeReviewPanel`, a shared MIDI/on-screen take review panel with
    take cards, duration/note/range metrics, a 16-bucket density timeline, and
    play/practice/delete actions.
  - `@repo/music-core/engines/recording` now owns `buildTakeDensity()` so the
    review timeline is pure/tested and not route-local visualization math.
  - `/music/play` records MIDI/on-screen notes into in-session Practice Lab
    takes alongside the existing journal/audio-take capture. The take review
    panel can replay a MIDI take through the shared sound engine and mark it as
    the idea to practice.
  - `/music/jam` now records "chorus" takes from the shared input router and
    reviews them in context directly under the progression chart, while keeping
    backing/progression playback separate.
  - `/music/transcribe` can pick a saved Practice Lab audio take from the local
    media library as source material for extraction/manual transcription.
  - Existing scoring, media persistence, audio recording, backing playback, and
    transcription trainer contracts are unchanged.
  - Focused verification:
    `vp test packages/music-core/src/engines/recording/recording.test.ts src/routes/music/_components/MidiTakeReviewPanel.svelte.test.ts src/routes/music/play/page.svelte.test.ts src/routes/music/jam/page.svelte.test.ts src/routes/music/transcribe/page.svelte.test.ts --run`.
- **Phase D.8 — COMPLETE (2026-07-01, Codex).** Recorder-to-Piano-Roll follow-up:
  - Added `createPianoRollScoreFromTake()` in
    `@repo/music-core/engines/piano-roll`, converting MIDI/on-screen recorder
    takes into an editable single-track Piano Roll score while preserving the
    take title, tempo, note timing, and velocities.
  - `MidiTakeReviewPanel` now exposes an optional `Open in Piano Roll` action.
    `/music/play` and `/music/jam` use it to write the converted score into the
    existing Piano Roll local-state slot and open `/music/create?mode=piano-roll`.
  - Piano Roll now imports its storage key from a shared route helper and keeps
    loading saved scores through the existing local-state path.
  - Focused verification:
    `vp test packages/music-core/src/engines/piano-roll/piano-roll.test.ts src/routes/music/_components/MidiTakeReviewPanel.svelte.test.ts src/routes/music/play/page.svelte.test.ts src/routes/music/jam/page.svelte.test.ts src/routes/music/create/_components/PianoRollPanel.svelte.test.ts --run`.
- **Phase D.9 — COMPLETE (2026-07-01, Codex).** Piano Roll import merge:
  - Added `mergeTakeIntoPianoRollScore()` in
    `@repo/music-core/engines/piano-roll`, so a recorded take can become a new
    uniquely named Piano Roll track without replacing existing notes.
  - Practice Lab and Jam now write `Open in Piano Roll` actions to a pending
    take-import slot instead of overwriting the current Piano Roll score. The
    Piano Roll consumes that pending import on load, creates a score when none
    exists, or merges the take as a new track when a saved score exists, then
    clears the pending import.
  - Focused verification:
    `vp test packages/music-core/src/engines/piano-roll/piano-roll.test.ts src/routes/music/create/_components/PianoRollPanel.svelte.test.ts src/routes/music/play/page.svelte.test.ts src/routes/music/jam/page.svelte.test.ts --run`.
- **Phase D.10 — COMPLETE (2026-07-01, Codex).** Explicit Piano Roll import
  conflict controls:
  - When a pending recorder take reaches Piano Roll and a saved roll already
    exists, `/music/create?mode=piano-roll` now keeps the saved roll loaded and
    shows an import decision banner instead of silently mutating the score.
  - The banner exposes `Add as track`, `Replace roll`, and `Discard import`.
    Adding still uses `mergeTakeIntoPianoRollScore()` and preserves existing
    notes; replacing converts the take into a single-track score; discarding
    clears only the pending import slot.
  - If no saved score exists, Piano Roll still imports the pending take
    immediately to keep the empty-start path fast.
  - Focused verification:
    `vp test src/routes/music/create/_components/PianoRollPanel.svelte.test.ts --run`.
- **Phase D.11 — COMPLETE (2026-07-01, Codex).** Piano Roll arrangement
  sections:
  - `@repo/music-core/engines/piano-roll` now owns immutable helpers for
    adding, renaming, and removing canonical `Score.sections` from a Piano Roll
    score, including range and overlap validation so the sections remain
    compatible with Song Studio practice ranges.
  - `/music/create?mode=piano-roll` now includes an Arrangement strip above the
    note grid. It can add sequential bar-length sections, show their bar/beat
    ranges, remove sections, and persist everything through the existing
    Piano Roll local-state score slot.
  - Notes, voices, playback, recorder imports, MIDI export, and WAV export are
    unchanged; this is metadata on the same canonical score.
  - Focused verification:
    `vp test packages/music-core/src/engines/piano-roll/piano-roll.test.ts src/routes/music/create/_components/PianoRollPanel.svelte.test.ts --run`.
- **Phase D.12 — COMPLETE (2026-07-01, Codex).** Piano Roll to Song Studio
  insertion:
  - `/music/create?mode=piano-roll` now has a `Save to Song Studio` action that
    writes the current canonical Piano Roll `Score` through `SongLibrary.saveScore()`
    and then exposes a direct `/music/songs/{id}` link.
  - The saved score preserves the current notes, voices, tempo map, and
    arrangement `Score.sections`, so Song Studio can immediately use the same
    canonical practice-range machinery as imported repertoire.
  - The action is injectable for tests and defaults to the existing local
    `PracticeStore`/`SongLibrary` persistence path in the browser; no new server
    storage or alternate score format was added.
  - Focused verification:
    `vp test packages/music-core/src/engines/piano-roll/piano-roll.test.ts packages/music-core/src/engines/song-library/song-library.test.ts src/routes/music/create/_components/PianoRollPanel.svelte.test.ts --run`.
- **Phase D.13 — COMPLETE (2026-07-01, Codex).** Piano Roll section renaming:
  - `/music/create?mode=piano-roll` now supports inline Arrangement section
    rename controls. Each section chip exposes a name field plus a `Rename`
    action, then persists the edited canonical `Score.sections` through the
    existing Piano Roll local-state score slot.
  - The route reuses `renamePianoRollSection()` from
    `@repo/music-core/engines/piano-roll`, so add/remove/rename continue to
    share the same immutable section model that Song Studio practice ranges
    already consume.
  - Focused verification:
    `vp test src/routes/music/create/_components/PianoRollPanel.svelte.test.ts --run`.
- **Phase D.14 — COMPLETE (2026-07-01, Codex).** Piano Roll section resizing:
  - `@repo/music-core/engines/piano-roll` now owns
    `resizePianoRollSection()`, preserving immutable `Score.sections`, rejecting
    invalid ranges, and reusing the same no-overlap validation as section
    creation.
  - `/music/create?mode=piano-roll` now exposes start/end bar controls for each
    Arrangement section. Resizing persists the updated canonical beats through
    the existing Piano Roll local-state score slot and expands visible bars when
    needed.
  - Focused verification:
    `vp test packages/music-core/src/engines/piano-roll/piano-roll.test.ts src/routes/music/create/_components/PianoRollPanel.svelte.test.ts --run`.
- **Phase D.15 — COMPLETE (2026-07-01, Codex).** Beat grid to Song Studio
  handoff:
  - `/music/create?mode=beat` now has a `Save to Song Studio` action that writes
    the current Studio beat-grid pattern through `SongLibrary.saveScore()` and
    then exposes a direct `/music/songs/{id}` link.
  - The saved score uses the existing Studio canonical score projection, including
    row voices, one sixteenth-note per active cell, current transport tempo, and
    a one-bar `Beat loop` section so Song Studio practice ranges can start from a
    named loop immediately.
  - The action is injectable for tests and defaults to the existing local
    `PracticeStore`/`SongLibrary` persistence path in the browser; no server
    storage or alternate beat format was added.
  - Focused verification:
    `vp test src/routes/music/create/_components/StudioPanel.svelte.test.ts --run`.
- **Phase D.16 — COMPLETE (2026-07-01, Codex).** Create mode URL sync:
  - `/music/create` now writes the selected Create surface back into the
    `mode` query param when the segmented control changes, preserving existing
    source/import params and hashes. Deep links, refreshes, and handoffs now
    keep Beat grid, Piano Roll, or Recorder selected consistently.
  - The app path uses SvelteKit's `replaceState()` helper; a narrow fallback
    handles standalone component tests where the router is not initialized.
  - Focused verification:
    `vp test src/routes/music/create/page.svelte.test.ts --run`.
- **Phase D.17 — COMPLETE (2026-07-01, Codex).** Recorder to Piano Roll handoff:
  - `/music/create?mode=recorder` MIDI takes now expose `Open in Piano Roll`,
    matching the existing Practice Lab and Jam take-review handoff.
  - The action stores the selected take in the shared
    `music.piano-roll.pending-take-import` slot with the current transport BPM,
    then routes to `/music/create?mode=piano-roll&source=recorder-take` so the
    Piano Roll import decision banner can add, replace, or discard it.
  - Focused verification:
    `vp test src/routes/music/create/_components/RecorderPanel.svelte.test.ts --run`.
- **Phase D.18 — COMPLETE (2026-07-01, Codex).** Recorder to Song Studio handoff:
  - `/music/create?mode=recorder` MIDI takes now expose `Save to Song Studio`,
    matching the Beat grid and Piano Roll direct-save affordance.
  - The action projects the selected `Take` through `takeToScore()` at the
    current transport BPM, saves it via the existing `SongLibrary.saveScore()`
    path, shows a status message, and exposes a direct `/music/songs/{id}` link.
  - The saver is injectable for tests and defaults to the browser-local
    `PracticeStore`/`SongLibrary`; no new persistence layer or score format was
    added.
  - Focused verification:
    `vp test src/routes/music/create/_components/RecorderPanel.svelte.test.ts --run`.
- **Next:** Phase C shareable-config/adaptive-retry work, Phase D specialized
  upgrades, and recorder-to-Piano-Roll import/merge/conflict controls are
  complete for the listed drills. Create now supports recorder-take import,
  arrangement sections, section renaming/resizing, and Piano Roll insertion into
  Song Studio plus beat-grid insertion into Song Studio. The Create shell now
  preserves the selected surface in the URL, local Recorder MIDI takes can enter
  the same Piano Roll import flow as external takes, and Recorder MIDI takes can
  save directly into Song Studio; remaining Create polish should focus on manual
  browser validation and any cross-surface friction found there.

## Suggested Claude Prompt

Use this prompt to continue implementation:

> Read `docs/music-redesign/06-drill-ux-research-plan.md`,
> `src/routes/music/AGENTS.md`, and the current route code. Implement Phase A
> only: add `PracticeDrillShell`, `DrillProgressRail`, and `AdaptiveRetryBar`,
> then migrate 2-3 low-risk drill pages without changing scoring behavior. Start
> with Rhythm, Spider, and MPC because their flows are simple and tests can prove
> parity. Write/update focused tests first, run the focused tests, then
> `vp test --run`, `vp run -r check`, and `vp run -r build`.
