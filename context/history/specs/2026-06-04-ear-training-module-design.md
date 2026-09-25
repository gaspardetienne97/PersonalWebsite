# Ear Training Module Design

## Goal

Build T1.6 as a focused ear-training workflow at `/music/learn/ear` with interval recognition, chord-quality identification, and functional scale-degree identification. Every completed prompt must feed the existing exercise pipeline so mastery, analytics, confusion data, XP, and streaks advance through their current owners.

## Scope

T1.6 includes:

- A Learn hub at `/music/learn`.
- The existing theory library moved to `/music/learn/theory`.
- Ear Training at `/music/learn/ear`.
- Focused 10-prompt sessions for each drill.
- Mixed 10-prompt sessions that interleave all three drills.
- Practice mode with immediate feedback.
- Test mode with feedback deferred until the summary.
- Choice answers and musical play-back answers.
- Prompt replay through the shared sound engine.
- A final session summary with accuracy, XP, drill results, and confusions.

T1.6 does not include sung/audio-input answers, cadence recognition, melodic dictation, inversions, or persisted incomplete sessions.

## Architecture

### Exercise Definitions

Three concrete, framework-independent `ExerciseDefinition`s live in `packages/music-core/src/exercises`:

- `intervalRecognitionExercise`
- `chordQualityRecognitionExercise`
- `scaleDegreeRecognitionExercise`

Each exercise owns prompt generation and grading for its musical domain. Shared helpers may generate normalized click-answer events, extract played notes, and project difficulty into prompt options, but the exercises remain separate definitions with explicit result types and skill IDs.

### Ear Training Session Coordinator

A framework-independent coordinator in `packages/music-core/src/engines/ear-training` manages the 10-prompt workflow. It owns:

- focused or mixed drill selection
- Practice or Test feedback policy
- Choice or Play-back answer mode
- current prompt and prompt number
- recent results
- cumulative session XP
- final summary

The coordinator uses the existing `ExerciseRunHost` and pipeline services. It does not mutate mastery, analytics, or progress directly.

### Routes

- `/music/learn` becomes a Learn hub with Theory Library and Ear Training destinations.
- `/music/learn/theory` contains the existing searchable theory library.
- `/music/learn/ear` renders the ear-training landing state, active session, and summary.

The top-level music navigation keeps one Learn item active for all `/music/learn/*` routes.

## Exercise Behavior

### Interval Recognition

Prompts cover ascending melodic, descending melodic, and harmonic intervals. Difficulty controls the interval pool and when descending or harmonic prompts appear.

Choice answers use stable interval tokens such as `m3`, `P5`, and `M7`. Play-back answers grade the relationship between played notes, not a fixed absolute key. Harmonic play-back accepts the required notes without requiring a particular order.

The result includes a `choice` confusion metric and pitch metrics when the answer came from musical playback.

### Chord-Quality Identification

Prompts cover:

- major, minor, diminished, and augmented triads
- major seventh, dominant seventh, minor seventh, half-diminished seventh, and diminished seventh chords

Seventh chords enter the prompt pool at higher difficulty. T1.6 identifies quality only; inversions are not tested.

Choice answers use stable quality tokens. Play-back answers may use any root and inversion as long as the played pitch-class structure matches the selected quality. Results include `choice` and `chord` metrics so wrong qualities populate analytics confusions.

### Functional Scale-Degree Identification

Prompts establish a tonal context, then play a target degree. Contexts cover:

- major
- natural minor
- harmonic minor
- melodic minor

Answers show both degree and movable-do solfege labels, such as `b6 / le`, `6 / la`, and `7 / ti`. Stable answer tokens use the degree representation.

Choice answers select the degree token. Play-back answers reproduce the heard target relative to the supplied tonic context. Results include choice and pitch metrics.

## Session Experience

### Landing State

The Ear Training landing state offers:

- Mixed Session as the primary action.
- Focused Interval, Chord Quality, and Scale Degree drills.
- Practice/Test mode selection.
- Choice/Play-back answer-mode selection.
- A compact weak-skill summary from analytics.

### Active Session

The active session uses the approved Focus + Session Rail layout.

The main workspace contains:

- drill and mode label
- listening prompt
- replay action
- current answer interface
- immediate feedback in Practice mode

The compact rail contains:

- prompt number out of 10
- recent answers
- session XP
- current streak

Test mode accepts answers without revealing correctness. The summary reveals all results after prompt 10.

### Summary

The final summary shows:

- overall accuracy
- XP earned
- per-drill accuracy
- recurring confusion substitutions
- recent answer review

Actions allow the user to retry mistakes, repeat the same session type, or return to Learn.

## Input And Audio Flow

Prompts carry their playback MIDI notes and answer metadata. The route sends those MIDI notes to the existing `SoundEngine`.

Choice buttons create normalized click events containing stable answer codes. MIDI and on-screen keyboard input remain normalized `NoteEvent`s from the shared input router. The coordinator collects enough notes for the selected prompt before finishing the run.

Replay does not affect grading or prompt count.

Audio must be enabled before a new listening prompt begins. If audio cannot be enabled, the route keeps the session state intact and exposes the shared audio error. MIDI failures fall back to choice or on-screen input.

## Persistence

Completed prompts persist immediately through the current exercise pipeline:

- `SkillGraphStore` owns mastery mutation.
- `AnalyticsEngine` owns statistics and confusion data.
- `ProgressEngine` owns XP, streaks, levels, and achievements.

Incomplete active sessions are intentionally not persisted. Reloading or abandoning a session discards the active queue, while already completed prompt events remain persisted.

Practice-session journaling is deferred to T1.10.

## Error Handling

- A session cannot advance until audio is enabled and the current prompt has been played at least once.
- Invalid or incomplete play-back answers remain ungraded until enough notes arrive.
- Unexpected coordinator or persistence failures preserve the current prompt and surface a short recoverable status message.
- Unsupported prompt definitions fail focused engine tests rather than falling back silently.

## Testing

### Exercise Tests

- Prompt generation across difficulty levels.
- Choice, MIDI, and on-screen grading for every exercise.
- Ascending, descending, and harmonic interval grading.
- Triad and seventh-chord quality grading and confusion metrics.
- Major and all three minor scale contexts with degree/solfege labels.

### Coordinator Tests

- Focused and mixed 10-prompt queues.
- Practice feedback shown immediately.
- Test feedback deferred until summary.
- Choice and Play-back answer collection.
- Prompt replay does not advance the session.
- XP, recent results, accuracy, and confusion summary calculations.

### Integration And Route Tests

- Every completed prompt flows through mastery, analytics, and progress.
- Learn hub links to Theory Library and Ear Training.
- Existing theory library remains functional at `/music/learn/theory`.
- Ear Training route starts focused and mixed sessions, switches modes, replays prompts, answers prompts, and renders the final summary.
- Music navigation remains active throughout Learn subroutes.

