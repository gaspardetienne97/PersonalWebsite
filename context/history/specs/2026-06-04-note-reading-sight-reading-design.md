# Note Reading And Sight-Reading Design

## Goal

Build T1.7 as a complete reading workflow at `/music/learn/reading`. The feature teaches written
pitch recognition through flashcards and develops fluent reading through generated sight-reading
for piano, guitar, and ukulele. Every completed exercise feeds the existing mastery, analytics, XP,
and streak pipeline.

## Scope

T1.7 includes:

- A reusable notation foundation rendered with VexFlow.
- Curated and custom tuning profiles for guitar and ukulele.
- Piano, guitar, and ukulele note-location projections.
- Single-note and chord flashcards.
- Flashcard answers by note-name choice, MIDI, on-screen piano, or on-screen fretboard.
- Instrument-specific polyphonic sight-reading.
- Wait mode and performance mode.
- All major and minor keys with correct written spelling.
- Broad rhythmic support: simple and compound meters, rests, dotted values, ties, triplets, and
  sixteenth notes.
- Adaptive timing tolerance with Relaxed, Normal, and Strict presets.
- Local persistence for custom tuning profiles.

T1.7 does not include microphone pitch detection, imported scores, MusicXML, OSMD, tablature
rendering, or general-purpose score playback.

## Delivery Strategy

Use a layered, foundation-first implementation:

1. Build notation, tuning, and projection foundations.
2. Build flashcards on those foundations.
3. Build generated polyphonic sight-reading and score following.

Each layer is independently tested and reusable by later scales, technique, and imported-score
features.

## Architecture

### Notation Engine

A framework-independent notation engine converts canonical score data and written pitches into a
VexFlow-neutral notation view model. It owns:

- written pitch spelling
- clef and staff assignment
- key signatures
- note groups and voices
- durations, rests, dotted values, ties, and tuplets
- measure boundaries and beam groups

VexFlow remains a rendering dependency in the Svelte notation component. Exercise and scoring
engines never depend on DOM nodes or VexFlow objects.

Written pitch spelling is stored separately from sounding MIDI pitch. This allows the same sounding
pitch to render correctly as, for example, F-sharp or G-flat according to its key context.

### Tuning Engine

A tuning engine provides immutable curated presets and validates custom profiles.

Curated presets include:

- guitar standard, Drop D, DADGAD, and Open G
- ukulele high-G, low-G, and baritone DGBE

Users may create custom guitar and ukulele tunings. A tuning profile contains:

- stable id and display name
- instrument
- open-string sounding MIDI pitches in conventional string-number order, string 1 first
- fret count
- written-to-sounding notation transposition
- source type: curated or custom

Custom profiles persist through `PracticeStore`. Curated profiles cannot be edited or deleted.

### Projection Engine

An instrument-neutral projection API maps a written or sounding pitch target onto an instrument
profile.

- Piano projection identifies exact keys and hand assignment when available.
- Guitar and ukulele projection identify every playable string/fret position under the selected
  tuning.
- Polyphonic projection verifies that a note group can be played together before it is presented.

Projection results are derived and never mutate the source score.

### Exercises

`note-reading` owns generated flashcards and discrete grading.

`sight-reading` owns instrument-specific canonical score generation and declares the reading skills
it advances.

The score follower owns streaming pitch and timing grading for generated sight-reading. It consumes
normalized `NoteEvent`s from the shared input router and emits standard `ExerciseResult` metrics.

### Route And Components

`/music/learn/reading` hosts Flashcards and Sight-Reading tabs.

Shared Svelte components render:

- notation
- piano locations
- guitar and ukulele fretboards
- tuning selection and the custom tuning editor
- reading setup controls
- live score-following feedback
- exercise summaries

All visual styling and theming come from `@repo/ui` and the website's shared theme.

## Flashcard Behavior

Flashcard setup supports these filters:

- instrument
- tuning for guitar or ukulele
- clef
- key signature
- note range
- single-note or chord mode
- note-name choice or answer-by-play

Prompts cover all major and minor keys and preserve correct written spelling.

Note-name choices accept enharmonic equivalents. Feedback still displays the spelling implied by
the staff and key signature. Answer-by-play requires the exact sounding pitch and octave.

Single-note prompts complete after one valid answer. Chord prompts complete only after the complete
expected note group is supplied.

After grading, every valid instrument location for the expected pitch or group is highlighted.
Completed prompts feed the existing pipeline immediately. Spaced repetition comes from the existing
skill scheduler and reading skill mastery.

## Sight-Reading Generation

### Piano

Piano phrases use grand staff and independently generated left- and right-hand voices. Notes that
begin at the same score position form a single expected note group for score following.

### Guitar And Ukulele

Guitar and ukulele phrases use a single staff and the selected tuning profile. Phrases may include
melodies, dyads, and triads. Every generated note group must have at least one playable fretboard
projection.

### Musical Range

Generated phrases support:

- all major and minor keys
- simple and compound meters
- whole, half, quarter, eighth, and sixteenth values
- dotted values
- rests
- ties
- triplets
- instrument-appropriate polyphony

Difficulty controls phrase length, range, rhythmic density, accidental frequency, leaps, voice
independence, and chord complexity. Generation rejects and retries unplayable or unsupported
phrases before presentation.

## Score-Follower Behavior

### Wait Mode

Wait mode ignores timing. A note group advances only when every expected pitch is held together.
Wrong notes are highlighted and recorded but do not advance the playhead.

### Performance Mode

Performance mode begins after an audible count-in and follows score time continuously. Each played
note is matched to an expected note group using pitch and timing.

The base timing window adapts to tempo and expected note value. The user-selected timing preset
scales that window:

- Relaxed: widest window
- Normal: default window
- Strict: narrowest window

Timing feedback reports early or late error in milliseconds. Correct-but-imprecise notes receive
partial credit. Wrong, missed, extra, and late notes reduce the final score sensibly.

The final result includes:

- per-note pitch metrics
- per-note timing metrics in performance mode
- expected and actual note groups
- pitch accuracy
- timing accuracy
- early or late tendency
- overall continuous score

A perfectly played phrase scores `1.0`.

## Session Experience

The reading route opens on a compact setup screen with Flashcards and Sight-Reading tabs. Shared
controls expose instrument, tuning, clef, key, range, and difficulty. Sight-reading adds mode,
tempo, and timing-preset controls.

The custom tuning editor opens in a reusable dialog. It previews the selected open strings and
shows field-level validation before allowing a profile to be saved.

During practice, notation is the primary workspace. Instrument projection appears beside it on
larger screens and below it on mobile.

Flashcard sessions show the current prompt, answer controls, feedback, projection, progress, and
session XP.

Sight-reading sessions show transport controls, count-in state, playhead, progress, live accuracy,
current expected group, wrong notes, and early or late feedback.

Summaries report pitch accuracy, timing accuracy when relevant, early or late tendency, recurring
confusions, XP, and problem measures.

## Data Flow

1. Setup options select instrument, tuning, musical filters, and mode.
2. The exercise generates a prompt or canonical score.
3. The notation engine creates a renderable notation view model.
4. The projection engine derives valid instrument locations.
5. The input router sends normalized note events to the active run.
6. The flashcard grader or score follower produces an `ExerciseResult`.
7. The existing exercise host converts the result into a `ScoringEvent`.
8. Skills, analytics, and progress persist mastery, metrics, XP, and streak updates.

No T1.7 engine mutates mastery, analytics, or progress directly.

## Persistence

Custom tuning profiles persist through `PracticeStore`. Completed exercise results persist through
the existing pipeline.

Active flashcard and sight-reading sessions are not persisted. Reloading discards an incomplete
exercise while preserving already completed results.

## Error Handling

- Invalid custom tunings cannot be saved and show field-level errors.
- Unplayable generated phrases are rejected and regenerated before presentation.
- Unsupported notation combinations fail generation tests instead of degrading silently.
- MIDI loss leaves note-name choices and on-screen instrument input available.
- Persistence failures preserve the active prompt for retry.
- Performance mode cannot begin until audio and count-in are ready.
- Rendering failures surface a recoverable message without grading or advancing the prompt.

## Testing

### Unit Tests

- Written spelling and enharmonic grading across all major and minor keys.
- Tuning validation, curated profiles, custom profiles, and persistence.
- Piano, guitar, and ukulele projection.
- Playability checks for polyphonic note groups.
- Notation view models for clefs, grand staff, rests, dotted values, ties, tuplets, beams, and
  simple and compound meters.
- Flashcard generation and grading through choices, MIDI, on-screen piano, and on-screen fretboard.
- Instrument-specific sight-reading generation.
- Perfect playback scoring `1.0`.
- Wrong, extra, missed, early, and late notes reducing scores sensibly.
- Adaptive timing windows and Relaxed, Normal, and Strict presets.
- Wait-mode complete-chord advancement.

### Component And Route Tests

- VexFlow renders representative notation view models.
- Setup filters and tabs update available controls.
- Custom tuning editor validates, saves, selects, and deletes custom profiles.
- Flashcard sessions accept every supported input mode and highlight instrument locations.
- Sight-reading sessions render count-in, playhead, live feedback, and summaries.
- Completed runs feed mastery, analytics, XP, and streaks.

### End-To-End And Manual Tests

- Playwright covers complete piano, guitar, and ukulele flashcard and sight-reading flows.
- Manual MIDI testing verifies answer-by-play and polyphonic group recognition.
- Manual visual review verifies notation readability and fretboard usability on desktop and mobile.
- Manual audio review verifies count-in and performance-mode timing.

## Acceptance Criteria

- Flashcard answer-by-play grades MIDI and on-screen input and highlights valid piano or fretboard
  locations.
- Enharmonic note-name choices are accepted while feedback preserves the intended written spelling.
- Curated and custom guitar and ukulele tunings project pitches correctly and persist custom
  profiles.
- Piano sight-reading generates playable grand-staff polyphony.
- Guitar and ukulele sight-reading generate playable single-staff melodies, dyads, and triads for
  the selected tuning.
- Wait mode advances only when the complete expected note group is held together.
- Performance mode scores a correct phrase at `1.0` and degrades sensibly for pitch and timing
  errors.
- Adaptive timing tolerance responds to tempo, note value, and selected strictness.
- Flashcards and sight-reading both feed the existing scoring pipeline.
