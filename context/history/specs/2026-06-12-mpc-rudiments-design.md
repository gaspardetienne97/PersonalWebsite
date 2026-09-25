# MPC Rudiments Design

**Date:** 2026-06-12
**Status:** Approved
**Route:** `/music/play/mpc`

## Objective

Add the first MPC-specific technique workflow to the Music app: an alternating
single-stroke drill that works with both an MPC One+ and the existing on-screen
pad grid. The drill must use the shared input, exercise, scoring, mastery, XP,
and journal pipelines rather than introducing an MPC-only execution path.

This is the first small slice of the Phase 2 instrument-specific technique
backlog. It does not attempt to recreate the previous standalone drums app.

## Scope

### Included

- Alternating single strokes across two configurable MIDI pads.
- Default pads 36 and 38, representing kick and snare in the General MIDI drum
  map.
- Configurable run length of 8 or 16 hits.
- Configurable tempo using a small set of practical BPM presets.
- MIDI input through the shared `MusicRuntime` and `InputRouter`.
- On-screen input through the existing `MpcPadGrid`.
- Scoring for pad order, timing, completion, and velocity consistency.
- Live progress and performance feedback.
- XP, skill mastery, and journal capture through the existing pipeline.
- Start, cancel, and repeat behavior.
- Play-hub and Music-navigation links.
- Automated core, route, and end-to-end tests.
- A deferred MPC One+ hardware checklist in the Music verification document.

### Excluded

- Audio onset detection.
- Sample loading or sample-kit management.
- MIDI output, pad LED color synchronization, or SysEx.
- Flams, drags, paradiddles, rolls, subdivisions beyond alternating eighth
  notes, or multi-pad grooves.
- A lesson library, campaign, or standalone drums application.
- Server persistence or database migrations.

## User Flow

1. Open `/music/play/mpc` from the Play hub or Music navigation.
2. Choose the left and right pads, hit count, and tempo.
3. Enable MIDI when using hardware, or use the visible MPC pad grid.
4. Start the drill.
5. Alternate the two target pads in the displayed order at the selected tempo.
6. Review live hit count, current expected pad, running quality, and timing
   feedback.
7. On completion, review the score, XP, and focused feedback.
8. Repeat the drill or open the journal to review the recorded practice entry.

Cancellation returns the session to a restartable state without recording an
attempt.

## Architecture

### Exercise

Create a public exercise module:

`packages/music-core/src/exercises/mpc-single-stroke.ts`

The exercise is a streaming `ExerciseDefinition` with:

- exercise id `technique.mpc.single-strokes`
- skill id `technique.mpc.single-strokes`
- `Capability.Technique` and `Capability.Rhythm`
- accepted inputs `midi` and `onscreen`
- instrument context `mpc`

The prompt contains:

- `leftPadMidi`
- `rightPadMidi`
- `hitCount`
- `bpm`
- the generated alternating target sequence
- expected timestamps relative to the first accepted target hit

The answer contains accepted pad MIDI notes, velocities, and relative
timestamps. A note from either configured pad consumes the current target. If
the configured pad is played out of order, that target is marked wrong and the
run advances. Notes outside the configured pair are ignored and do not advance
progress.

### Scoring

The final score combines four normalized values:

- **Pad accuracy, 45%:** expected pad versus played pad for each target.
- **Timing accuracy, 30%:** absolute error from the expected eighth-note grid.
- **Velocity consistency, 15%:** consistency across accepted hit velocities.
- **Completion, 10%:** completed targets divided by requested targets.

The normalized dimensions use these formulas:

- `padAccuracy = correctPadHits / hitCount`
- `meanTimingErrorMs = mean(abs(actualMs - expectedMs))`
- `timingAccuracy = clamp(1 - meanTimingErrorMs / 180)`
- `velocityConsistency = clamp(1 - velocityStandardDeviation / max(meanVelocity, 0.01))`
- `completion = consumedTargets / hitCount`

MIDI velocity is normalized to `0..1` by the existing input layer. The first
hit's timing error is zero because it establishes the relative grid; subsequent
hits determine timing accuracy.

The drill passes when:

- all requested targets are attempted,
- pad accuracy is at least 87.5%,
- mean absolute timing error is no greater than 90 ms, and
- velocity consistency is at least 65%.

The existing `ExerciseLiveState` remains unchanged. It exposes progress,
running score, and transient timing/order feedback. The route derives the next
expected pad from the prompt sequence and completed-target count. Detailed
timing and velocity values appear in the final result.

The first accepted target hit establishes time zero. This avoids requiring the
browser and hardware MIDI clocks to share an absolute epoch while preserving
relative timing.

### Technique Session

Extend `TechniqueSession` with:

```ts
startMpcRudiment(options: {
  leftPadMidi: number;
  rightPadMidi: number;
  hitCount: 8 | 16;
  bpm: number;
}): Promise<MpcSingleStrokePrompt>
```

The session continues to use `ExerciseRunHost`, the shared router, and existing
pipeline services. It must reject a second start while active and support the
existing `abandon`, `retrySave`, and `dispose` behavior.

### Skills

Seed:

- `technique.mpc` as the parent skill.
- `technique.mpc.single-strokes` as the first component skill.

The parent component mapping includes the single-stroke skill so attempts move
both the focused skill and the broader MPC technique view through the normal
mastery pipeline.

### Route

Create:

`src/routes/music/play/mpc/+page.svelte`

The page uses:

- `PracticeScreen`
- `PracticeScreenHeader`
- `SourceReadout`
- `SegmentedControl`
- `HudTile`
- `SessionFeedback`
- `MpcPadGrid`
- `@repo/ui` cards, buttons, progress, and labels

The page must use `useMusicRuntime()` and must not instantiate a separate MIDI,
input-router, or sound engine.

The setup area provides:

- two pad selectors limited to the 16 visible Bank A pads,
- hit count selector: 8 or 16,
- tempo selector: 60, 80, 100, or 120 BPM,
- MIDI enable control,
- start control.

During an active run, the page shows:

- expected next pad,
- completed hits,
- running quality score,
- current timing/order feedback,
- target sequence with current-position emphasis,
- the on-screen pad grid,
- cancel control.

On completion, it shows:

- total score,
- pad accuracy,
- mean timing error,
- velocity consistency,
- XP,
- feedback,
- repeat control.

### Journal Capture

Completed attempts call `runtime.recordPractice()` with:

- source `drill`
- instrument `mpc`
- tags `mpc`, `rudiment`, and `single-strokes`
- the exercise scoring event
- awarded XP
- a concise note containing hit count, BPM, accuracy, and timing error

Cancelled runs are not recorded.

### Navigation

- Add an `MPC Rudiments` card to `/music/play`.
- Add an `MPC Rudiments` entry under the Play navigation group.
- Preserve the existing personal-site root and Music route structure.

## State And Error Handling

- The Start button remains disabled until practice stores and pipeline services
  are ready.
- Starting while a run is active is rejected by `TechniqueSession`.
- MIDI permission errors remain visible through the shared MIDI state.
- If persistence fails after grading, the existing session retry path remains
  available and the result is not silently discarded.
- Route teardown unsubscribes router/session listeners and disposes the
  `TechniqueSession`.
- Changing setup controls is disabled while a run is active.
- Selecting the same MIDI note for both pads is rejected with a clear setup
  message.

## Testing

### Core Tests

- A correct alternating sequence at the target grid completes and passes.
- A wrong-pad sequence lowers pad accuracy and fails.
- Early/late hits lower timing accuracy.
- Uneven velocity lowers velocity consistency.
- Unrelated MIDI events do not incorrectly complete the run.
- `TechniqueSession.startMpcRudiment()` completes through the shared pipeline
  and emits the MPC skill id.
- Cancellation allows a subsequent run to start.
- Seeded skills include the MPC parent and component relationship.

### Component Tests

- The route renders setup controls and the MPC pad grid.
- Starting the drill changes the page to the active state.
- On-screen pad clicks advance the same session used by MIDI.
- Cancel returns to a restartable state.
- Setup rejects identical left and right pads.

### End-to-End Tests

- Open the Play hub and navigate to MPC Rudiments.
- Start an 8-hit run.
- Complete it using the on-screen pad grid.
- Confirm the summary appears and the run can be repeated.
- Confirm there is no horizontal overflow at desktop and mobile widths.

### Hardware Verification

Add a pending checklist to `src/routes/music/VERIFICATION.md` for MPC One+:

- MIDI notes from the hardware advance the drill.
- Bank A mapping matches the displayed pad notes.
- Timing and velocity feedback respond plausibly to deliberate variation.
- A completed run writes one journal entry.
- Cancel and restart do not leave the input session locked.

## Acceptance Criteria

- `/music/play/mpc` is discoverable from the Play hub and Music navigation.
- Hardware MIDI and on-screen pads use the same exercise/session path.
- A correct 8-hit alternating run completes, awards XP, moves mastery, and
  records one drill journal entry.
- Wrong order, poor timing, and uneven velocity each affect the final result.
- Cancellation records nothing and permits an immediate restart.
- The page inherits the site theme and uses existing shared UI components.
- Core tests, route tests, Playwright tests, recursive checks, production build,
  and domain validators pass.
