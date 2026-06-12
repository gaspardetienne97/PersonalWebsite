# Music App Verification

This file tracks verification that requires physical instruments or browser
capabilities that automated tests cannot reproduce faithfully.

## Pending Hardware Checks

### Aerophone Long Tone Trainer

- Status: Pending
- Added: 2026-06-12
- Route: `/music/learn/aerophone`
- Hardware: Roland Aerophone with breath data mapped to MIDI CC2
- Build: `5602f83 feat(music): add Aerophone long-tone trainer`

Steps:

1. Connect the Aerophone and enable MIDI.
2. Select a target note and start a 3-second long tone.
3. Play the target note with steady breath through the full duration.
4. Confirm Breath, Steadiness, and Hold update continuously.
5. Confirm the exercise completes, awards XP, and appears in the practice journal.
6. Repeat with uneven breath and confirm the steadiness score falls.
7. Start another attempt, cancel it, and confirm a new attempt can start.

Expected:

- Incoming note events select and highlight the matching fingering.
- CC2 drives the breath meter and hold progress.
- A steady, on-target hold completes successfully.
- Cancellation does not leave the exercise session locked.

Automated coverage already passing:

- CC2 filtering, duration, pitch, and steadiness scoring.
- Technique session completion, persistence pipeline, cancellation, and restart.
- Route rendering and start/cancel controls.

### Aerophone Dynamic Swell Trainer

- Status: Pending
- Added: 2026-06-12
- Route: `/music/learn/aerophone`
- Hardware: Roland Aerophone with breath data mapped to MIDI CC2

Steps:

1. Select Dynamic swell and start a 4-second attempt.
2. Sustain the target note while moving from soft to loud and back to soft.
3. Confirm breath level, shape score, and progress update continuously.
4. Confirm a smooth swell completes and is recorded in the journal.
5. Repeat with a flat or abruptly changing breath envelope and confirm the score falls.

Expected:

- The target curve is soft-loud-soft over the selected duration.
- Shape and smoothness affect the final control score.
- Wrong-note or incomplete attempts do not pass.

## Completed Hardware Checks

Move entries here after testing and record the date, hardware/firmware, browser,
and any corrections made.
