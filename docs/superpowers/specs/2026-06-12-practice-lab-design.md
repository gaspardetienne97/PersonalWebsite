# Practice Lab Design

**Date:** 2026-06-12
**Status:** Approved
**Route:** `/music/play`

## Objective

Turn the Play hub into a functional free-practice workspace while preserving
its links to focused tools. A musician must be able to choose an instrument,
play through MIDI or an on-screen surface, hear browser audio when monitoring
is enabled, run the shared metronome, record a timed session, and find that
session in the Practice Journal.

The page must use the existing `MusicRuntime`, `InputRouter`, `SoundEngine`,
device preferences, transport, and IndexedDB-backed practice store. It must not
create route-local MIDI, input, audio, transport, or persistence services.

## Scope

### Included

- Instrument selection through `MusicRuntime.setActiveInstrument()`.
- The preferred on-screen surface from Connect, with an in-session surface
  selector through the existing `InputSurface`.
- MIDI and on-screen note input through the shared `InputRouter`.
- Browser synth monitoring with a visible toggle, enabled by default.
- Explicit browser-audio enablement and current source feedback.
- Shared metronome start/stop and tempo controls.
- A framework-independent free-practice recording session in
  `packages/music-core`.
- Live elapsed time, note count, recent notes, and detected pitch range.
- Accurate session start and end times in the existing Practice Journal.
- Secondary cards linking to Scales, MPC Rudiments, Tuner, and Intonation.
- Core, runtime, component, and end-to-end regression coverage.

### Excluded

- Raw MIDI event-log persistence.
- Audio recording, waveform capture, or export.
- Looping, overdubbing, sequencing, or backing tracks.
- Scoring, mastery changes, achievements, or XP awards.
- Microphone pitch/onset input.
- New database tables or migrations.
- Changes to the PDF Narrator app or its branch.

## User Flow

1. Open `/music/play`.
2. Choose the primary instrument.
3. Use the preferred surface from Connect or choose another visible surface.
4. Enable browser audio when playback is desired.
5. Leave Monitor on to hear accepted notes through the browser synth, or turn
   it off when hardware local audio would cause doubled sound.
6. Optionally choose a tempo and start the shared metronome.
7. Start recording.
8. Play through MIDI or the on-screen surface.
9. Review the elapsed time, note count, recent notes, and range while playing.
10. Stop recording to save the session to the Practice Journal.
11. Continue free practice, open the journal, or launch a focused Play tool.

Stopping a recording with no accepted notes discards it and explains that
nothing was saved. Stopping a recording with at least one note saves it
automatically.

## Architecture

### Free Practice Session

Add:

`packages/music-core/src/engines/free-practice/index.ts`

`FreePracticeSession` is a small state machine with no Svelte, browser audio,
MIDI, or persistence dependencies. It accepts normalized `NoteEvent` values
and produces a deterministic summary.

Public types:

```ts
export interface FreePracticeSessionOptions {
  id: string;
  instrument: InstrumentId;
  startedAt: UnixMs;
  startedAtMonotonic: MonotonicMs;
}

export interface FreePracticeNote {
  midiNote: number;
  velocity: number;
  source: InputSource;
  offsetMs: number;
}

export interface FreePracticeState {
  id: string;
  status: "recording" | "stopped";
  instrument: InstrumentId;
  startedAt: UnixMs;
  noteCount: number;
  distinctNoteCount: number;
  lowestMidiNote?: number;
  highestMidiNote?: number;
  recentNotes: FreePracticeNote[];
  sourceCounts: Partial<Record<InputSource, number>>;
}

export interface FreePracticeResult extends FreePracticeState {
  status: "stopped";
  endedAt: UnixMs;
  durationMs: number;
}
```

Public behavior:

```ts
const session = new FreePracticeSession(options);
session.accept(event);
const state = session.state;
const result = session.stop(endedAt);
```

Only `noteOn` events are captured. Other normalized events are ignored. Notes
with invalid MIDI numbers, non-finite velocities, or timestamps earlier than
the session start are ignored.

The engine keeps aggregate counters, a set of distinct MIDI notes, pitch-range
bounds, and an eight-note ring buffer. It does not retain an unbounded raw event
sequence. The stopped result remains available after `stop()`. Calling
`accept()` or `stop()` after the session has stopped throws a clear lifecycle
error.

The engine uses the monotonic event timestamp for note offsets and wall-clock
`UnixMs` values for the persisted session window. Duration is
`max(0, endedAt - startedAt)`.

### Journal Capture

Extend `PracticeCaptureEntry` in `MusicRuntime` with optional timestamps:

```ts
id?: string;
startedAt?: UnixMs;
endedAt?: UnixMs;
```

`recordPractice()` uses supplied timestamps when present and retains its
current generated-ID and `Date.now()` behavior for all existing callers. The
Practice Lab supplies the `FreePracticeSession` id on every save attempt, so a
retry overwrites the same local session instead of creating a duplicate. This
keeps the canonical session lifecycle in `PracticeSessionStore` and avoids
exposing the store directly to the route.

The Practice Lab saves:

- source `free-practice`
- selected instrument
- tags `practice-lab` and the instrument id
- zero XP
- the actual start and stop timestamps
- a concise journal note containing duration, note count, distinct-note count,
  pitch range, and input-source counts

The raw note sequence is not persisted. The current `PracticeSession` model is
a session/run/scoring journal rather than an event log, and free-practice notes
do not constitute an exercise run.

### Input And Monitoring

The route subscribes once to `runtime.router`. That single subscription handles
both hardware MIDI and on-screen notes because every `InputSurface` pushes into
the same router.

For each accepted `noteOn` event, the route:

1. updates the visible last-note activity,
2. forwards the event to the active `FreePracticeSession`, when recording,
3. calls `runtime.sound.playNote()` when Monitor is on and audio is enabled.

The route does not also process `InputSurface.onAccepted`, which would duplicate
on-screen events.

Monitor defaults to on for each page mount. It does not automatically unlock
browser audio from incoming MIDI. The existing explicit audio control remains
the user-gesture gate. When Monitor is on but audio is disabled, input and
recording continue and the page states that monitoring is waiting for audio.

### Instrument And Surface Selection

The instrument selector supports the existing instrument ids: piano, guitar,
ukulele, aerophone, MPC, and voice.

Changing the instrument:

- calls `runtime.setActiveInstrument()`,
- selects `runtime.surfaceFor(instrument)`,
- updates the instrument badge and session context.

Instrument changes are disabled while recording so one journal session has one
unambiguous primary instrument. Surface changes remain available because they
are alternate inputs for the same instrument. A changed surface is persisted
through `runtime.setInputSurface()` when storage is attached.

### Metronome

The page presents compact tempo and metronome controls backed by:

- `runtime.transportBpm`
- `runtime.setTransportBpm()`
- `runtime.metronomeRunning`
- `runtime.toggleMetronome()`

It does not create a route-local transport. The persistent transport bar and
the page controls therefore reflect and operate the same clock.

### Route Composition

Replace the current card-only `/music/play` page with:

- `PracticeScreen`
- `PracticeScreenHeader`
- `SourceReadout`
- `InputSurface`
- `InstrumentBadge`
- `HudTile`
- `SegmentedControl`
- `@repo/ui` cards, buttons, labels, toggles, and inputs

The main workspace contains:

- instrument and surface setup,
- source and audio status,
- Monitor control,
- input surface,
- metronome controls,
- record/stop control,
- live recording HUD,
- save/discard status and a link to `/music/track`.

Below the workspace, retain the existing tool links for:

- `/music/play/scales`
- `/music/play/mpc`
- `/music/tuner`
- `/music/intonation`

The page inherits all colors, typography, spacing tokens, and theme behavior
from the site and `@repo/ui`.

## State And Error Handling

- Route teardown unsubscribes from the shared router.
- If the route is destroyed during a recording, the unfinished session is
  discarded rather than silently saved.
- Input and recording remain functional when browser audio is unavailable.
- Audio-enablement failures use `runtime.audioMessage`.
- MIDI permission and device errors continue through the existing shared MIDI
  state and controls.
- Persistence failures leave the completed summary visible and expose a Retry
  Save action. Retry reuses the same id, result, and timestamps, preventing
  duration drift or duplicate journal entries.
- Record is disabled while a save is pending.
- Instrument selection is disabled during recording and saving.
- A second recording cannot start while one is active.
- Stop with zero notes returns to idle without calling `recordPractice()`.
- Metronome state is not automatically stopped when recording ends because it
  is shared application transport state.

## Testing

### Core Tests

- Captures valid MIDI and on-screen `noteOn` events.
- Ignores note-off, control-change, onset, pitch-bend, and aftertouch events.
- Computes note count, distinct notes, pitch range, recent-note window, source
  counts, offsets, and duration deterministically.
- Rejects invalid notes and timestamps before the recording start.
- Enforces start/stop lifecycle behavior.

### Runtime Tests

- `recordPractice()` preserves explicitly supplied start and end timestamps.
- Existing callers without timestamps retain the current behavior.
- A free-practice capture persists source, instrument, tags, zero XP, and the
  generated note summary.

### Component Tests

- `/music/play` renders the Practice Lab and the existing focused-tool links.
- Instrument selection updates the shared runtime and preferred surface.
- On-screen and injected MIDI notes pass through the same router subscription.
- Monitor on plays accepted notes once when audio is enabled.
- Monitor off captures notes without browser playback.
- Start and stop show the correct recording HUD.
- A non-empty stop saves accurate timestamps and exposes the Journal link.
- A zero-note stop does not save.
- Persistence failure exposes Retry Save without losing the result.

### End-To-End Tests

- Enable audio, start recording, play on-screen notes, stop, and verify the
  session appears under `/music/track`.
- Inject MIDI events and verify that they update the same note count and
  recording flow as on-screen input.
- Verify Monitor off prevents browser synth calls without preventing capture.
- Verify metronome controls use the persistent transport state.
- Check desktop and mobile layouts for visible controls and no horizontal
  overflow.

### Manual Hardware Verification

- Roland FP-30X notes update the HUD and recording.
- Browser monitoring can be disabled to avoid doubling the piano's local sound.
- MPC One+ pads update the HUD and recording under the MPC instrument profile.
- Hardware disconnect during recording does not lose already captured notes.

These checks can be added to the existing deferred Music hardware verification
document when implementation is complete.

## Acceptance Criteria

- `/music/play` is a usable free-practice workspace, not only a navigation hub.
- MIDI and on-screen notes share one normalized input path.
- Browser monitoring defaults on and can be disabled.
- A musician can enable audio, play, and hear accepted notes through the
  existing `SoundEngine`.
- Recorded sessions use accurate start/end timestamps and appear in the
  Practice Journal with source `free-practice`.
- Existing Scales, MPC, Tuner, and Intonation links remain available.
- The implementation adds no Music database migration and does not modify the
  PDF Narrator app.
