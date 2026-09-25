# 07 - Drill Depth Research And Expansion Plan

Research date: 2026-06-30. Scope: expand the Music app's drills from narrow
single-pattern experiences into deeper, generated practice families.

This plan complements `06-drill-ux-research-plan.md`. That document is about
the UI shell. This document is about what each drill should actually practice.

## Goal

Turn each limited drill into a progression-aware exercise family:

- Spider: beyond one `1-2-3-4` pattern on one string.
- Two-hand independence: beyond left-hand pulse plus right-hand scale.
- Scales: beyond the current C-root page behavior.
- Chord progression: beyond the small static progression catalog.
- Rhythm and MPC: beyond quarter pulse and alternating single strokes.
- Ear/reading: beyond isolated identification into function, cadence,
  dictation, rhythm reading, and repertoire transfer.
- Aerophone/intonation: beyond long tone, swell, and staccato/legato into
  register, drone, interval, vibrato, bend, and controller-specific control.

## Research Basis

Primary product and pedagogy patterns:

- RCM piano syllabus: scales, chords, arpeggios, inversions, dominant 7ths,
  diminished 7ths, contrary/formula patterns, minimum tempos, and memorization
  expectations ([source](https://rcmusic-production-strapi-media.s3.ca-central-1.amazonaws.com/piano_syllabus_2022_edition_9c6a49bb96.pdf)).
- flowkey, Synthesia, Yousician, and Piano Marvel: immediate note/timing
  feedback, wait mode, loop/slow practice, hands-separate practice, assessment,
  and progress tracking ([flowkey](https://www.flowkey.com/en),
  [Synthesia](https://synthesiagame.com/),
  [Yousician](https://yousician.com/piano),
  [Piano Marvel](https://www.pianomarvel.com/)).
- Yousician, Simply Guitar, and Rocksmith+: real-time string-instrument
  feedback, repeat/slow-down loops, adaptive difficulty, and timing/accuracy
  scoring ([Yousician Guitar](https://yousician.com/guitar),
  [Simply Guitar](https://www.hellosimply.com/simply-guitar),
  [Rocksmith+](https://www.ubisoft.com/en-us/game/rocksmith/plus)).
- Complete Rhythm Trainer, Soundbrenner, Melodics, and Vic Firth/PAS rudiment
  materials: generated rhythm chapters, subdivisions, rests, polyrhythms,
  setlists, pad lessons, stars/streaks, and 40 rudiments
  ([Complete Rhythm Trainer](https://play.google.com/store/apps/details?hl=en_US&id=com.binaryguilt.completerhythmtrainer),
  [Soundbrenner](https://apps.apple.com/us/app/the-metronome-by-soundbrenner/id1048954353),
  [Melodics](https://melodics.com/),
  [Vic Firth rudiments](https://ae.vicfirth.com/education/40-essential-rudiments/)).
- Functional ear, Kodaly, Gordon music-learning theory, EarMaster, GNU Solfege,
  and AP Music Theory: hear function, sing/play it, read/write it, then transfer
  into repertoire; include cadence, harmonic dictation, rhythm dictation, and
  sight singing ([Kodaly](https://en.wikipedia.org/wiki/Kod%C3%A1ly_method),
  [Gordon](https://en.wikipedia.org/wiki/Gordon_music_learning_theory),
  [AP Music Theory assessment](https://apstudents.collegeboard.org/courses/ap-music-theory/assessment),
  [GNU Solfege](https://www.gnu.org/software/solfege/)).
- TonalEnergy, Web MIDI, MIDI CC2, and Roland Aerophone product patterns:
  tuner, drone, reference tone, analysis pages, interval/scale exercises,
  waveform/pitch/tone shape, breath controller data, and wind-controller
  fingering/breath/bite sensors ([TonalEnergy](https://www.tonalenergy.com/),
  [TonalEnergy guide](https://www.tonalenergy.com/tet-user-guide-ios),
  [MIDI CC list](https://midi.org/midi-1-0-control-change-messages),
  [Web MIDI API](https://developer.mozilla.org/en-US/docs/Web/API/Web_MIDI_API),
  [Roland AE-20](https://www.roland.com/us/products/aerophone_ae-20/)).

## Current Code Reality

The user concern is accurate, but the gap is different per drill:

| Drill | Current state | Main limitation |
|---|---|---|
| Scales | `scale-pattern.ts` already supports many scale kinds; route starts everything from `C4` | UI and session options do not expose key, span, motion, hands, arpeggios, or fingering-aware variants |
| Spider | `string-spider.ts` generates only ascending `1-2-3-4` on one string | No pattern catalog, no reverse/permutation/string-crossing/hold-down variants |
| Two-hand | `two-hand-independence.ts` generates LH root pulse + RH scalar eighths | No independence pattern catalog: Alberti, stride-lite, shell+line, role swap, polyrhythm |
| Rhythm | `rhythm-pulse.ts` scores only evenly spaced pulse hits | No generic rhythm event grid for subdivisions, rests, accents, clave, swing, gap click, or polyrhythm |
| MPC | `mpc-single-stroke.ts` scores alternating two-pad singles | No rudiment model: doubles, paradiddles, accents, flams, ghost/accent velocity bands |
| Chord progression | `JAM_PROGRESSIONS` has ii-V-I, minor ii-V-i, blues, modal vamp | Needs richer progression catalog, loop/range/transposition, difficulty metadata, and chord-change-specific scoring |
| Ear | Existing interval/chord/scale-degree/melody dictation/repertoire queue is good | Needs cadence ID, harmonic function ID, functional solfege, rhythm ear/read, and repertoire ladder |
| Reading | Existing flashcard/sight-reading setup is useful | Needs explicit level metadata for clef/range/key/rhythm progression and transposition |
| Aerophone | Long tone, swell, articulation, fingering chart are in place | Needs register ladders, interval/drone/scale intonation, bends, vibrato, CC2 calibration, and note-tendency history |

## Architecture Direction

Add depth as data-driven generators in `packages/music-core`, then expose them
in route setup controls.

Do not put exercise generation or scoring rules in Svelte pages. Route code
should select a pattern, start a session, render the target, and record the
journal entry.

Data should live in small pure modules:

- Pattern catalogs: named variations, difficulty, applicable instruments,
  default tempo, target notes/events.
- Prompt builders: convert a selected pattern and setup into an exercise prompt.
- Scorers: grade pitch, timing, velocity, CC2, chord coverage, or function.
- Route projections: concise display metadata for setup controls and summary.

## Priority Order

Ship in this order:

1. **Expose scale key + existing scale kinds properly.** Core mostly exists; UI
   bottleneck is obvious.
2. **String spider pattern catalog.** Deterministic and high value; guitar/uke
   friendly; easy to test.
3. **Generic rhythm-pattern engine.** Unlocks rhythm, gap click, clave, and
   later MPC reuse.
4. **MPC rudiment pattern engine.** Extends current single-stroke scorer with
   pad, timing, and velocity targets.
5. **Two-hand independence pattern catalog.** Adds real piano technique depth.
6. **Chord progression/jam catalog upgrade.** More progressions, loop ranges,
   transposition, and chord-change metrics.
7. **Ear/reading expansion.** Cadence ID and rhythm read-and-tap first, then
   harmonic function and repertoire ladders.
8. **Aerophone/intonation expansion.** MIDI-only CC2 improvements first, then
   audio+CC2 combined analysis.

## Exercise Families

### 1. Scales And Technique

Best variations:

- Keys: C/G/D/A/E/B/F#/F/Bb/Eb/Ab/Db/Gb, plus minor relatives.
- Scale kinds: major, natural minor, harmonic minor, melodic minor, modes,
  major/minor pentatonic, blues, whole tone, diminished, altered, bebop major,
  bebop dominant.
- Span: pentascale, one octave, two octaves, four octaves later.
- Motion: ascending, descending, up-down, contrary motion, formula pattern.
- Hands: right only, left only, hands together, alternating hands.
- Patterns: thirds, triads, arpeggios, broken chords, 3-note and 4-note cells.
- Expression: legato, staccato, accent every 2/3/4, swing eighths later.

First implementation:

- Add key selection on `/music/play/scales`, since `createScalePatternExercise`
  already accepts `tonic`.
- Add `harmonic-minor`, `major-pentatonic`, `minor-pentatonic`, `blues`,
  `bebop-major` to `ScalePatternKind`.
- Add a `ScaleMotion` option: `up`, `down`, `up-down`.
- Add `ScaleSpan`: `pentascale`, `one-octave`, `two-octave`.
- Keep hands/fingering as stage 2, after route controls and tests are stable.

Scoring:

- Pitch correctness.
- Evenness error.
- Completion.
- Optional articulation/duration later.
- Optional fingering only after real fingering metadata exists.

Files:

- Modify `packages/music-core/src/exercises/scale-pattern.ts`.
- Modify `packages/music-core/src/exercises/scale-pattern.test.ts`.
- Modify `packages/music-core/src/engines/technique-session/index.ts`.
- Modify `src/routes/music/play/scales/+page.svelte`.
- Modify `src/routes/music/play/scales/page.svelte.test.ts`.

### 2. Spider And Fretted Finger Independence

Best variations:

- Single-string chromatic: `1-2-3-4`, `4-3-2-1`.
- Permutations: `1-3-2-4`, `1-4-2-3`, `2-4-1-3`, `3-1-4-2`.
- Adjacent-string spider: move same pattern across strings.
- String skips: pattern on string 6 then 4, 5 then 3, etc.
- Hold-down spider: previous finger must stay down until the sequence finishes.
- Position shifts: start frets 1, 3, 5, 7, 9.
- Fretboard note finder: prompt note + optional string/position constraint.

First implementation:

- Add `StringPatternKind` to `string-spider.ts`.
- Rename display language from only "Spider 1-2-3-4" to "String independence".
- Keep the existing route URL and catalog title if desired, but the setup should
  include a `Pattern` selector.
- Add patterns:
  - `ascending-1234`
  - `descending-4321`
  - `inside-out-1324`
  - `outside-in-1423`
- Add `direction`/`pattern` to prompt ID and journal note.

Scoring:

- Pitch order accuracy.
- Timing/evenness.
- Extra notes.
- Completion.
- Later: sustain/hold-down using `noteOff` durations if available.

Files:

- Modify `packages/music-core/src/exercises/string-spider.ts`.
- Modify `packages/music-core/src/exercises/string-spider.test.ts`.
- Modify `packages/music-core/src/engines/technique-session/index.ts`.
- Modify `src/routes/music/play/spider/+page.svelte`.
- Modify `src/routes/music/play/spider/page.svelte.test.ts`.

Stage 2:

- Add `createFretboardNoteFinderExercise()` as a separate exercise rather than
  overloading spider.
- Add chord-change trainer after chord-perfect has transition metadata.

### 3. Rhythm Pattern Engine

Best variations:

- Subdivisions: quarter, eighth, sixteenth, triplet, mixed.
- Rests: expected silence with extra-hit penalty.
- Syncopation: offbeats, ties, anticipations, tresillo.
- Swing: long-short eighth ratio and consistency.
- Clave: son 3-2, son 2-3, rumba 3-2, rumba 2-3.
- Gap click: 1 bar on / 1 bar off, then longer or random gaps.
- Polyrhythm: 3:2, 2:3, 4:3; one layer audible, user taps the other.
- Two-voice reading: tap one voice while hearing another.

First implementation:

- Keep `rhythm-pulse.ts` for compatibility, but add
  `rhythm-pattern.ts` as the new general exercise.
- Model expected events as beat-relative targets.
- Include rests by representing expected silence windows and scoring extra
  input inside them.
- Use a `clickSchedule` for gap-click: audible bars versus silent bars.

Suggested types:

```ts
export interface RhythmPatternEvent {
  id: string;
  beat: number;
  voice: "tap" | "left" | "right";
  accent?: "normal" | "accent" | "ghost";
}

export interface RhythmPatternPrompt {
  id: string;
  label: string;
  bpm: number;
  meter: { beats: number; beatUnit: number };
  bars: number;
  events: RhythmPatternEvent[];
  rests: { startBeat: number; endBeat: number }[];
  swingRatio?: number;
  clickSchedule?: { bar: number; audible: boolean }[];
}
```

First patterns:

- `quarter-pulse`
- `eighths`
- `sixteenths`
- `eighth-rests`
- `triplets`
- `gap-click-1-on-1-off`

Scoring:

- Timing mean absolute error.
- Signed bias.
- Jitter.
- Missed events.
- Extra hits during rests.
- Swing ratio consistency later.
- Gap re-entry drift later.

Files:

- Create `packages/music-core/src/exercises/rhythm-pattern.ts`.
- Create `packages/music-core/src/exercises/rhythm-pattern.test.ts`.
- Modify `packages/music-core/package.json` exports.
- Modify `packages/music-core/src/engines/rhythm-session/index.ts`.
- Modify `packages/music-core/src/engines/rhythm-session/rhythm-session.test.ts`.
- Modify `src/routes/music/learn/rhythm/+page.svelte`.
- Modify `src/routes/music/learn/rhythm/page.svelte.test.ts`.

### 4. MPC Rudiments

Best variations:

- Single strokes: `RLRL`, `LRLR`, orchestrated across 2 or 4 pads.
- Double strokes: `RRLL`, `LLRR`.
- Paradiddles: `RLRR LRLL`, double paradiddle, paradiddle-diddle.
- Accent grids: accent every 4, moving accents, offbeat accents.
- Ghost/accent control: target velocity bands.
- Flams/drags: grace-note timing before primary hit.
- Rolls: 5-, 7-, 9-stroke measured rolls.
- Groove rudiments: kick/snare/hat pad studies.

First implementation:

- Generalize `mpc-single-stroke.ts` into a rudiment pattern model while keeping
  the existing export as a compatibility wrapper if useful.
- Add named `MpcRudimentKind`.
- Add target events with `hand`, `padMidi`, `beat`, and optional velocity band.

Suggested first kinds:

- `single-stroke`
- `double-stroke`
- `paradiddle`
- `moving-accent`

Scoring:

- Pad/order accuracy.
- Timing error.
- Velocity consistency.
- Accent/ghost velocity band accuracy.
- Completion.
- Later: flam grace-note spacing.

Files:

- Modify or replace `packages/music-core/src/exercises/mpc-single-stroke.ts`.
- Modify `packages/music-core/src/exercises/mpc-single-stroke.test.ts`.
- Modify `packages/music-core/src/engines/technique-session/index.ts`.
- Modify `packages/music-core/src/engines/technique-session/technique-session.test.ts`.
- Modify `src/routes/music/play/mpc/+page.svelte`.
- Modify `src/routes/music/play/mpc/page.svelte.test.ts`.

### 5. Two-Hand Independence

Best variations:

- Current: LH pulse + RH scalar eighths.
- Role swap: RH pulse + LH line.
- Alberti bass + RH held tones.
- LH shell voicing + RH scale fragment.
- LH walking roots + RH chord tones.
- LH syncopated comp + RH held tones.
- Contrary-motion scales.
- 2:3 and 3:4 coordination patterns.
- Call/response between hands.

First implementation:

- Add `TwoHandPatternKind`.
- Keep current pattern as `lh-pulse-rh-line`.
- Add:
  - `rh-pulse-lh-line`
  - `lh-shell-rh-line`
  - `alberti-rh-holds`
  - `contrary-motion-scale`
- Add a `handMode`: `left`, `right`, `both`.
- Generate prompt lanes explicitly instead of inferring everything from register.

Scoring:

- LH pitch accuracy.
- RH pitch accuracy.
- LH timing.
- RH timing.
- Inter-hand alignment.
- Role consistency.
- Evenness.

Files:

- Modify `packages/music-core/src/exercises/two-hand-independence.ts`.
- Modify `packages/music-core/src/exercises/two-hand-independence.test.ts`.
- Modify `packages/music-core/src/engines/technique-session/index.ts`.
- Modify `src/routes/music/play/two-hand/+page.svelte`.
- Modify `src/routes/music/play/two-hand/page.svelte.test.ts`.

### 6. Chord Progressions, Chord Changes, And Jam

Best variations:

- Common pop loops: `I-V-vi-IV`, `vi-IV-I-V`, `I-vi-IV-V`.
- Guitar-friendly loops: `G-D-Em-C`, `C-G-Am-F`, `D-A-Bm-G`.
- Ukulele-friendly loops: `C-G-Am-F`, `F-G-C-Am`.
- Jazz: major ii-V-I, minor ii-V-i, I-vi-ii-V turnaround, tritone sub ii-bII-I,
  rhythm changes A section, blues turnarounds.
- Chord-change pairs: `G <-> C`, `G <-> D`, `C <-> Am`, `Am <-> E`,
  uke `C <-> F`, `F <-> G`.
- Progression practice modes:
  - listen and strum in time
  - chord-change timed reps
  - loop one bar pair
  - transpose next chorus
  - slower retry for failed chord

First implementation:

- Expand `JAM_PROGRESSIONS` into a richer catalog with:
  - `difficulty`
  - `instrumentFit`
  - `tags`
  - `defaultBpm`
  - `keyRoot`
  - `transposable`
- Add a `transposeProgression(progression, semitones)` helper in
  `engines/jam`.
- Add progression groups in the route: Pop, Guitar/Uke, Jazz, Blues, Modal.
- Keep audio chord following constrained to known progressions.

Scoring:

- Chord coverage.
- Missing/extra tones.
- Timing band against chord onset.
- Chord-change latency.
- Continuity through the switch.
- Later: strum pattern match.

Files:

- Modify `packages/music-core/src/engines/jam/index.ts`.
- Modify `packages/music-core/src/engines/jam/jam.test.ts`.
- Modify `packages/music-core/src/engines/chord-follower/index.ts` only if
  metadata requires changes to expected chord generation.
- Modify `src/routes/music/play/chord-progression/+page.svelte`.
- Modify `src/routes/music/play/chord-progression/page.svelte.test.ts`.
- Modify `src/routes/music/jam/+page.svelte`.
- Modify `src/routes/music/jam/page.svelte.test.ts`.

### 7. Chord-Perfect And Chord Changes

Best variations:

- More open chords:
  - Guitar: Em, Am, C, G, D, A, E, Dm, E7, A7, G7, Cadd9.
  - Ukulele: C, Am, F, G, Dm, Em, A7, G7, C7.
- Arpeggiate strings low-to-high.
- Strum once and verify chord pitch classes.
- Muted-string target drills.
- Chord diagram recall: hide diagram after preview.
- Chord-change trainer: two chords, one-minute changes, clean-first-strum.

First implementation:

- Expand shape catalogs in `chord-perfect.ts`.
- Add shape metadata:
  - `difficulty`
  - `fingers`
  - `mutedStrings`
  - `openStrings`
  - `commonTransitions`
- Add two-chord change exercise only after shape metadata exists.

Scoring:

- Required pitch classes.
- Forbidden strings.
- String-by-string arpeggio cleanliness.
- Clean first strum after switch.
- Change latency.
- Retry count.

Files:

- Modify `packages/music-core/src/exercises/chord-perfect.ts`.
- Modify `packages/music-core/src/exercises/chord-perfect.test.ts`.
- Create `packages/music-core/src/exercises/chord-change.ts` in stage 2.
- Create `packages/music-core/src/exercises/chord-change.test.ts` in stage 2.
- Modify `src/routes/music/play/chord-perfect/+page.svelte`.

### 8. Ear Training And Reading

Best variations:

- Functional solfege answer mode: movable-do degree labels and syllables.
- Cadence ID: authentic, half, plagal, deceptive.
- Harmonic function ID: bass root, Roman numeral, next likely chord.
- Rhythm read-and-tap: visual rhythm prompt, tap it back.
- Rhythm dictation: hear rhythm, reconstruct it.
- Melody dictation variants: missing note, changed note, contour first,
  degree sequence second.
- Transposition: read/sing/play a phrase in another key.
- Repertoire ladder: listen, sing degrees, play by ear, read notation,
  transpose phrase.

First implementation:

- Cadence ID is the fastest low-risk addition.
- Rhythm read-and-tap should reuse the new `rhythm-pattern.ts`.
- Functional solfege should extend existing scale-degree recognition labels
  without replacing numeric degree tokens.
- Repertoire ladder should build on existing
  `buildRepertoireReviewPlanSchedule`.

Scoring:

- Degree/function correctness.
- Cadence type correctness.
- Roman numeral correctness.
- Ordered pitch accuracy.
- Rhythm timing/duration.
- Response latency.
- Transfer across keys.

Files:

- Create `packages/music-core/src/exercises/cadence-recognition.ts`.
- Create `packages/music-core/src/exercises/cadence-recognition.test.ts`.
- Modify `packages/music-core/package.json` exports.
- Modify `packages/music-core/src/engines/ear-training/index.ts`.
- Modify `packages/music-core/src/engines/ear-training/ear-training.test.ts`.
- Modify `packages/music-core/src/engines/ear-training/curriculum.ts`.
- Modify `src/routes/music/learn/ear/+page.svelte`.
- Modify `src/routes/music/learn/ear/page.svelte.test.ts`.
- For reading progression metadata, modify
  `packages/music-core/src/exercises/sight-reading.ts`,
  `packages/music-core/src/exercises/note-reading.ts`, and related tests.

### 9. Aerophone, Wind, And Intonation

Best variations:

- Long tone: 4/8/12/16 seconds, register ladders, random notes, problem-note
  repeat.
- Dynamic swells: crescendo, diminuendo, soft-loud-soft, terraced dynamics.
- Breath control: low-flow start, no-bump sustain, tapered release, phrase
  chain.
- Articulation: quarter/eighth/sixteenth repeated attacks, tenuto, staccato,
  legato, accents, silent-bar entries.
- Pitch bends: scoop, fall-off, half-step bend and return.
- Vibrato: delayed vibrato, target rate/depth, stable pitch center.
- Interval intonation: land P4/P5/octave, then 3rds/6ths/2nds/7ths against
  drone.
- Scale intonation: per-degree holds against tonic or chord drone.
- Wind-controller specific: CC2 calibration, bite/pitch bend, breath-trigger
  latency.

First implementation:

- MIDI CC2 long-tone lab: no audio dependency; scores breath curve reliably.
- Audio tuner long tone: cents timeline, hold score, note tendency.
- Dynamic swell trainer: target envelope overlay plus pitch stability.
- Drone interval lander: musical intonation practice with existing sound engine.

Scoring:

- Cents mean absolute error.
- Time in tolerance.
- Cents standard deviation.
- Drift slope.
- CC2 curve error.
- CC2 jitter.
- Attack overshoot.
- Release tail.
- Duration.
- Vibrato rate/depth later.

Files:

- Modify `packages/music-core/src/exercises/aerophone-long-tone.ts`.
- Modify `packages/music-core/src/exercises/aerophone-long-tone.test.ts`.
- Modify `packages/music-core/src/exercises/aerophone-swell.ts`.
- Modify `packages/music-core/src/exercises/aerophone-swell.test.ts`.
- Create `packages/music-core/src/exercises/aerophone-bend.ts` in stage 3.
- Create `packages/music-core/src/exercises/aerophone-vibrato.ts` in stage 3.
- Modify `packages/music-core/src/engines/intonation-session/index.ts`.
- Modify `packages/music-core/src/engines/intonation-session/intonation-session.test.ts`.
- Modify `src/routes/music/learn/aerophone/+page.svelte`.
- Modify `src/routes/music/tuner/+page.svelte`.

## Implementation Plan

### Phase 1 - Core Pattern Catalogs

Goal: add pure, tested pattern data before route UI changes.

- [x] Add scale variation options to `scale-pattern.ts`: key, motion, span, and
  missing scale kinds.
- [x] Add spider pattern options to `string-spider.ts`.
- [x] Add generic `rhythm-pattern.ts`.
- [x] Generalize MPC rudiments.
- [x] Add `TwoHandPatternKind`.
- [x] Expand `JAM_PROGRESSIONS` metadata and helper projections.

Required tests:

- `packages/music-core/src/exercises/scale-pattern.test.ts`
- `packages/music-core/src/exercises/string-spider.test.ts`
- `packages/music-core/src/exercises/rhythm-pattern.test.ts`
- `packages/music-core/src/exercises/mpc-single-stroke.test.ts`
- `packages/music-core/src/exercises/two-hand-independence.test.ts`
- `packages/music-core/src/engines/jam/jam.test.ts`

Milestone status:

- **2026-07-02 — Rhythm-pattern core built:** added
  `packages/music-core/src/exercises/rhythm-pattern.ts` and its package export.
  The new pure exercise catalog covers `quarter-pulse`, `eighths`,
  `sixteenths`, `eighth-rests`, `triplets`, and `gap-click-1-on-1-off`.
  Prompts expose beat-relative events, rest windows, absolute expected times,
  and click schedules. Scoring now reports timing mean absolute error, signed
  bias, jitter, missed events, and extra hits during rests. Focused
  `rhythm-pattern.test.ts` passed.
- **Next:** wire `RhythmSession` and `/music/learn/rhythm` to select
  `RhythmPatternId`, expose `?pattern=`, and render pattern/rest/gap-click
  targets without replacing the existing quarter-pulse compatibility path.
- **2026-07-02 — Rhythm-pattern route exposure built:** `RhythmSession` now
  normalizes and accepts `RhythmPatternId`, keeps `quarter-pulse` on the legacy
  `rhythm-pulse` exercise for compatibility, and runs non-quarter patterns
  through `rhythm-pattern.ts`. `/music/learn/rhythm` now exposes a Pattern
  selector, persists `?pattern=`, starts selected patterns, and shows the active
  pattern label in the stage and progress rail. Focused rhythm session and route
  tests passed.
- **2026-07-02 — Spider acoustic input built:** `string-spider.ts` and
  `TechniqueSession.startSpider()` now accept normalized `audio` note events.
  `/music/play/spider` exposes microphone start/stop controls via the shared
  `AudioPitchSource`, routes clear pitch events into the same scoring path as
  MIDI/on-screen input, and cleans up the mic source on destroy. Focused spider
  route tests passed.
- **2026-07-02 — Spider multi-string span built:** `string-spider.ts` now
  supports `StringSpiderSpan` values for single-string, two adjacent strings,
  three adjacent strings, and all strings from the selected start string.
  Prompts include ordered string numbers plus string/fret/midi positions, and
  `/music/play/spider` exposes a shareable `String span` selector through
  `?span=`. The fretted stage now renders the selected string set and scores
  the full multi-string sequence through the same MIDI/on-screen/mic path.
  Focused spider core, session, and route tests passed.
- **2026-07-02 — MPC moving-accent rudiment built:** `mpc-single-stroke.ts`
  now includes `moving-accent` in the rudiment catalog, with target events that
  expose hand, pad, beat, accent state, and accent/tap velocity bands. Scoring
  keeps the older velocity-consistency behavior for non-accent rudiments, while
  moving-accent runs grade velocity control against target bands. `/music/play/mpc`
  restores and syncs `pattern=moving-accent`, and `PadRudimentStage` renders
  Accent/Tap cues in the sequence lane. Focused MPC core, session, and route
  tests passed.
- **2026-07-02 — Two-Hand pattern and hand-mode depth built:**
  `two-hand-independence.ts` now has a `TwoHandPatternKind` catalog with the
  default pulse+line pattern plus role-swap, shell+line, Alberti+holds, and
  contrary-motion scale variants. Prompts now carry explicit left/right target
  events with beat positions, and `handMode` can isolate left, right, or both
  hands. `TechniqueSession` normalizes and passes `pattern`/`hand`, and
  `/music/play/two-hand` restores/syncs shareable pattern and hand-mode
  controls while preserving the existing default route. Focused two-hand core,
  session, and route tests passed.
- **2026-07-02 — Chord-progression/Jam groups, default BPM, and transposition
  built:** `engines/jam` now exposes grouped progression metadata
  (`pop`, `guitar-uke`, `jazz`, `blues`, `modal`), catalog default BPM,
  instrument-fit/tags/difficulty fields, and `transposeProgression()`.
  Generated backing-track projection accepts transposition so synth backing
  follows the displayed progression. `/music/play/chord-progression` and
  `/music/jam` now expose group and transpose controls, sync `group` and
  `transpose` in shareable URLs, and adopt progression default BPM when a new
  progression/group is selected. Focused jam, backing-track, chord-follower,
  chord-progression route, and jam route tests passed.
- **2026-07-02 — Cadence recognition family built:** added
  `cadence-recognition.ts` with authentic, plagal, half, and deceptive cadence
  prompts, choice grading, playback metadata, package export, and public
  `ear.cadences.*` skill seeds. `EarTrainingSession` now normalizes
  `drill=cadence`, includes cadence in mixed choice/listen queues, and can
  schedule cadence confusions for retry. `/music/learn/ear` registers cadence,
  exposes a Focused Cadence card, labels the session prompt correctly, and keeps
  cadence out of MIDI play-back/voice modes. Focused cadence, skills,
  ear-training engine, and ear route tests passed.
- **2026-07-02 — Functional solfege mode built:** scale-degree recognition now
  accepts `scaleDegreeLabelMode` metadata so prompts can display movable-do
  syllables while preserving numeric degree answer tokens for scoring, mastery,
  and confusions. `EarTrainingSession` normalizes shareable `labels=solfege`
  config and passes it into scale-degree prompt metadata. `/music/learn/ear`
  exposes a Degree/Solfege label selector, persists it in the URL, restores it
  from shared links, and updates focused scale-degree choice buttons to show
  `do`/`sol` style labels. Focused scale-degree, ear-training engine, and ear
  route tests passed.
- **2026-07-02 — Fretboard note finder built:** added
  `fretboard-note-finder.ts` as a separate string-technique exercise that
  prompts for an exact fretted note, accepts MIDI/on-screen/microphone note
  input, and scores the first answer against the target pitch. `TechniqueSession`
  now has a `startFretboardNoteFinder()` path, shareable string-technique
  `mode=note-finder` config, and `technique.strings.note-finder` plus
  guitar/ukulele child skill seeds. `/music/play/spider` now has a Spider/Note
  Finder mode toggle, persists `mode=`, uses the existing fretboard input
  without revealing the target position, and can complete a one-note finder run.
  Focused note-finder, technique-session, skills, and spider route tests passed.
- **2026-07-02 — Rhythm read-and-tap built:** `RhythmSession` now has a
  shareable `RhythmDrillMode` with `mode=read-and-tap`, and quarter-note
  read-and-tap runs use the generic `rhythm-pattern.ts` event/rest model rather
  than the legacy pulse prompt. `/music/learn/rhythm` exposes Pulse/Read & Tap
  mode controls, persists `mode=`, starts read-and-tap sessions, and shows a
  visible rhythm target lane with accent cues before the tap button. Focused
  rhythm-session and rhythm route tests passed; full `vp test --run`,
  `vp run -r check`, and `vp run -r build` also passed with the known existing
  warnings.
- **2026-07-02 — Drone interval lander built:** added
  `aerophone-interval-landing.ts` as a MIDI-first interval intonation drill:
  the prompt carries a tonic drone note, interval definition, target landing
  note, hold time, and CC2 breath controller. `TechniqueSession` now exposes
  `startIntervalLanding()`, and the skill graph includes
  `technique.aerophone.interval-landing` plus `intonation.interval-landing`.
  `/music/learn/aerophone` now has an Interval landing mode, shareable
  `mode=interval-landing&interval=...` state, a drone/landing stage, and starts
  the existing tonic drone when audio is enabled. Focused exercise, session,
  skills, and route tests passed; full `vp test --run`, `vp run -r check`, and
  `vp run -r build` also passed with the known existing warnings.
- **2026-07-02 — Chord-change trainer built:** `CHORD_SHAPES` now carries
  `difficulty`, `mutedStrings`, `openStrings`, and same-instrument
  `commonTransitions` metadata. Added `chord-change.ts` as a pure two-shape
  transition exercise with alternating chord targets, clean-change coverage,
  first-change latency, pitch/chord metrics, package export, and
  `technique.strings.chord-changes` plus guitar/ukulele child skills.
  `TechniqueSession` exposes `startChordChange()`, and
  `/music/play/chord-perfect` now has a shareable `mode=changes&shape=&to=`
  Change trainer workflow with target-chord selection, fretboard sequence
  scoring, summary feedback, and `Repeat changes`. Focused exercise,
  chord-perfect metadata, technique-session, skills, and route tests passed;
  full `vp run -r check`, `vp test --run`, and `vp run -r build` also passed
  with the known existing warnings.
- **2026-07-02 — Reading level metadata and transposition prompts built:**
  `sight-reading.ts` now exports a named `READING_LEVELS` catalog and carries
  selected level metadata on generated prompts and score practice markers.
  Sight-reading generation accepts `transposeSemitones`, shifts the sounding
  MIDI notes for play-back/scoring, and preserves the written key/spelling for
  the notation view. `ReadingSession` normalizes shareable `level=` and
  `transpose=` params, and `/music/learn/reading` exposes Level and Transpose
  setup controls, syncs them to the URL, passes them into sight-reading prep,
  and shows the active level/transposition in the sight-reading session header.
  Focused sight-reading, reading-session, and route tests passed; full
  `vp run -r check`, `vp test --run`, and `vp run -r build` also passed with
  the known existing warnings.
- **Next:** Phase 4 should start connecting the expanded drill dimensions to
  adaptive practice and review projections.

Commands:

```bash
env PATH=/Users/gaspard/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin:/Users/gaspard/Code/PersonalWebsite/node_modules/.bin:/usr/bin:/bin:/usr/sbin:/sbin vp test --run packages/music-core/src/exercises/scale-pattern.test.ts packages/music-core/src/exercises/string-spider.test.ts packages/music-core/src/exercises/rhythm-pattern.test.ts packages/music-core/src/exercises/mpc-single-stroke.test.ts packages/music-core/src/exercises/two-hand-independence.test.ts packages/music-core/src/engines/jam/jam.test.ts
env PATH=/Users/gaspard/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin:/Users/gaspard/Code/PersonalWebsite/node_modules/.bin:/usr/bin:/bin:/usr/sbin:/sbin vp test --run packages/music-core/src/exercises/cadence-recognition.test.ts packages/music-core/src/exercises/scale-degree-recognition.test.ts packages/music-core/src/engines/ear-training/ear-training.test.ts src/routes/music/learn/ear/page.svelte.test.ts
env PATH=/Users/gaspard/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin:/Users/gaspard/Code/PersonalWebsite/node_modules/.bin:/usr/bin:/bin:/usr/sbin:/sbin vp test --run packages/music-core/src/engines/rhythm-session/rhythm-session.test.ts src/routes/music/learn/rhythm/page.svelte.test.ts
env PATH=/Users/gaspard/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin:/Users/gaspard/Code/PersonalWebsite/node_modules/.bin:/usr/bin:/bin:/usr/sbin:/sbin vp test --run packages/music-core/src/exercises/aerophone-interval-landing.test.ts packages/music-core/src/engines/technique-session/technique-session.test.ts packages/music-core/src/engines/skills/skills.test.ts src/routes/music/learn/aerophone/page.svelte.test.ts
env PATH=/Users/gaspard/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin:/Users/gaspard/Code/PersonalWebsite/node_modules/.bin:/usr/bin:/bin:/usr/sbin:/sbin vp test --run packages/music-core/src/exercises/chord-perfect.test.ts packages/music-core/src/exercises/chord-change.test.ts packages/music-core/src/engines/technique-session/technique-session.test.ts packages/music-core/src/engines/skills/skills.test.ts src/routes/music/play/chord-perfect/page.svelte.test.ts
env PATH=/Users/gaspard/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin:/Users/gaspard/Code/PersonalWebsite/node_modules/.bin:/usr/bin:/bin:/usr/sbin:/sbin vp test --run packages/music-core/src/exercises/sight-reading.test.ts packages/music-core/src/engines/reading-session/reading-session.test.ts src/routes/music/learn/reading/page.svelte.test.ts
env PATH=/Users/gaspard/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin:/Users/gaspard/Code/PersonalWebsite/node_modules/.bin:/usr/bin:/bin:/usr/sbin:/sbin vp test --run
env PATH=/Users/gaspard/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin:/Users/gaspard/Code/PersonalWebsite/node_modules/.bin:/usr/bin:/bin:/usr/sbin:/sbin vp run -r check
env PATH=/Users/gaspard/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin:/Users/gaspard/Code/PersonalWebsite/node_modules/.bin:/usr/bin:/bin:/usr/sbin:/sbin vp run -r build
```

### Phase 2 - Route Exposure For Existing/Low-Risk Depth

Goal: make depth visible without changing scoring architecture.

- [x] `/music/play/scales`: expose key, scale, motion, span.
- [x] `/music/play/spider`: expose pattern selector.
- [x] `/music/play/spider`: expose microphone input for acoustic guitar/ukulele.
- [x] `/music/play/spider`: expose single/multi-string span selector.
- [x] `/music/learn/rhythm`: expose subdivision/rest/gap-click patterns.
- [x] `/music/play/mpc`: expose rudiment selector.
- [x] `/music/play/two-hand`: expose pattern and hand mode.
- [x] `/music/play/chord-progression` and `/music/jam`: expose progression
  groups, default BPM, transposition where supported.

Required route tests:

- `src/routes/music/play/scales/page.svelte.test.ts`
- `src/routes/music/play/spider/page.svelte.test.ts`
- `src/routes/music/learn/rhythm/page.svelte.test.ts`
- `src/routes/music/play/mpc/page.svelte.test.ts`
- `src/routes/music/play/two-hand/page.svelte.test.ts`
- `src/routes/music/play/chord-progression/page.svelte.test.ts`
- `src/routes/music/jam/page.svelte.test.ts`

### Phase 3 - New Exercise Families

Goal: add genuinely new drills once the core pattern model is proven.

- [x] Cadence recognition.
- [x] Functional solfege mode.
- [x] Fretboard note finder.
- [x] Rhythm read-and-tap mode.
- [x] Drone interval lander.
- [x] Chord-change trainer.
- [x] Reading level metadata and transposition prompts.

Each new exercise needs:

- Domain test first.
- Public export in `packages/music-core/package.json`.
- Session integration if it participates in a route session.
- Route test proving the new option is visible and can complete a minimal run.

### Phase 4 - Adaptive Practice And Review

Goal: make the expanded drills feed daily practice intelligently.

- [x] Add tags/skill IDs for new drill dimensions.
- [x] Update `seedCoreSkills()` for new children:
  - [x] `technique.strings.spider.permutations`
  - [x] `technique.strings.chord-changes`
  - [x] `rhythm.subdivision.eighths`
  - [x] `rhythm.subdivision.sixteenths`
  - [x] `rhythm.gap-click`
  - [x] `technique.mpc.paradiddles`
  - [x] `technique.piano.independence.shell-line`
  - [x] `ear.cadences`
  - [x] `intonation.interval-landing`
- [x] Update daily routine and practice-next projections so expanded drills
  appear when their parent skill is weak.

**Milestone 2026-07-02 - Phase 4 skill-child seed/wiring:** expanded drill
dimensions now have seeded adaptive-practice skill IDs and component
relationships. Spider permutations, eighth/sixteenth subdivisions, gap click,
MPC paradiddles, and piano shell+line independence are stable child skills;
MPC paradiddle and piano shell+line exercise variants now emit their narrower
child IDs. Focused skill/exercise tests cover the seed graph and emitted IDs.

**Milestone 2026-07-02 - Phase 4 adaptive projection wiring:** weak parent
skills now project to expanded drill targets in the dashboard skill-tree
`practiceNext` list, daily challenge, coach focus, and Today routine. Specific
child targets include Spider Permutations, rhythm subdivision/gap-click
variants, MPC Paradiddles, piano Shell + line independence, chord changes,
cadence practice, and aerophone interval landing. Daily routine planning now
matches recommendations by route path while preserving drill query params such
as `?pattern=paradiddle`, and Today appends `routine=1` without clobbering
those params.

**Next:** run any deferred manual browser validation for query-param routine
steps, then decide whether to commit this Phase 4 slice or continue into the
next plan/document item.

## Recommended First Build Slice

Implement this as the first concrete slice:

1. Add `ScaleMotion` and `ScaleSpan` plus missing scale kinds. ✅ Built
   2026-07-02: `scale-pattern.ts` now supports harmonic minor, pentatonics,
   blues, bebop major, descending motion, up-down motion, pentascales, and
   two-octave spans.
2. Expose key/motion/span on `/music/play/scales`. ✅ Built 2026-07-02:
   `/music/play/scales` exposes span and motion controls, keeps them in the URL,
   and passes them through `TechniqueSession.startScale()`.
3. Add `StringPatternKind` with four spider permutations. ✅ Built
   2026-07-02: `string-spider.ts` now supports `ascending-1234`,
   `descending-4321`, `inside-out-1324`, and `outside-in-1423`, with
   pattern-specific MIDI targets, fret numbers, prompt IDs, and skill tagging.
4. Expose pattern selector on `/music/play/spider`. ✅ Built 2026-07-02:
   `/music/play/spider` exposes a Pattern selector, persists it in the URL, and
   renders the selected fret order in `FrettedSequenceStage`.

Why this slice:

- It directly addresses the user's two clearest examples: C-major-only scales
  and one spider pattern.
- It avoids hard audio problems.
- It is deterministic and easy to test in `music-core`.
- It proves the pattern-catalog approach before heavier rhythm/MPC work.

Suggested Claude prompt:

> Read `docs/music-redesign/07-drill-depth-expansion-plan.md`,
> `docs/music-redesign/06-drill-ux-research-plan.md`, and
> `src/routes/music/AGENTS.md`. Implement only the recommended first build
> slice: scale key/motion/span plus spider pattern variants. Keep scoring in
> `packages/music-core`, update focused tests first, then expose controls in
> the Svelte routes. Do not touch rhythm, MPC, chord progression, or aerophone
> yet. Run the focused tests, then `vp test --run`, `vp run -r check`, and
> `vp run -r build`.

## Verification Gates

Per completed slice:

```bash
env PATH=/Users/gaspard/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin:/Users/gaspard/Code/PersonalWebsite/node_modules/.bin:/usr/bin:/bin:/usr/sbin:/sbin vp test --run
env PATH=/Users/gaspard/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin:/Users/gaspard/Code/PersonalWebsite/node_modules/.bin:/usr/bin:/bin:/usr/sbin:/sbin vp run -r check
env PATH=/Users/gaspard/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin:/Users/gaspard/Code/PersonalWebsite/node_modules/.bin:/usr/bin:/bin:/usr/sbin:/sbin vp run -r build
```

For UI-heavy route exposure, also run the relevant browser component tests and
manually inspect desktop and 375px mobile for overflow.

## Guardrails

- Keep open real-time chord recognition out of scope. Known progression
  following is allowed; open classification is not.
- Do not fake fingering or breath-analysis data. Render numbers/envelopes only
  when the exercise data actually contains them.
- Avoid adding a new dependency for these expansions unless a future phase
  demonstrates that existing Web MIDI, audio-in, Tone, VexFlow, piano-chart, and
  fretboard.js cannot cover the task.
- Do not create route-local scoring. Routes select patterns and display state;
  exercises and engines score.
- Preserve on-screen fallback for every playable drill.
- Preserve journal capture through `runtime.recordPractice`.
