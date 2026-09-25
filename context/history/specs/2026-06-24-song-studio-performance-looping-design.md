# Song Studio Performance Mode And Section Looping Design

## Goal

Turn `/music/songs/[id]` into a timed practice surface that can grade a complete
score, several formal sections, or a custom notation range across one or more
repetitions.

The milestone adds:

- wait and performance practice modes;
- whole-score, multi-section, or custom notation-range selection;
- selectable measure or note-group snapping in VexFlow and OSMD;
- sequence and per-section loop ordering;
- configurable practice BPM and timing strictness;
- a configured count-in before every performance repetition;
- finite section looping with per-take and aggregate results;
- one persisted practice-journal entry for the completed session.

The existing canonical `Score`, shared Music runtime, MIDI/on-screen input path,
VexFlow/OSMD renderers, preview playback, and IndexedDB persistence remain the
system boundaries.

## User Workflow

1. Open a stored song in Song Studio.
2. Choose Wait or Performance mode.
3. Choose the whole score, one or more formal sections, or a custom notation
   range.
4. For multiple sections, choose whether to loop the combined sequence or
   finish all takes for each section before moving to the next.
5. For a custom range, choose measure or note-group snapping and select the
   range directly on the score. Measure/beat fields remain available as a
   keyboard-accessible fallback.
6. In Performance mode, choose BPM (40-240), timing strictness, count-in bars
   (0, 1, or 2), and the number of takes.
7. Start practice.
8. Wait mode advances whenever the expected pitch group is held. Performance
   mode counts in, keeps the metronome running, and grades timestamped input
   against the selected range.
9. When a take ends, the app either counts into the next repetition or shows
   the final session summary.
10. The final summary reports aggregate score, pitch completion, timing, missed
   notes, extra notes, and the result of each take.

Wait mode supports every range-selection type but always traverses the resolved
segment queue once. Repetition controls are specific to Performance mode
because an unpaced wait-mode loop has no useful automatic boundary.

## Practice Range Contract

Add a pure score-practice projection in `@repo/music-core`.

```ts
type LoopSnap = "measure" | "note-group";
type LoopOrder = "sequence" | "per-section";

type ScorePracticeSelection =
  | { kind: "full" }
  | {
      kind: "sections";
      sectionIds: string[];
      order: LoopOrder;
    }
  | {
      kind: "custom";
      startBeat: number;
      endBeat: number;
      snap: LoopSnap;
    };

interface PracticeSegment {
  id: string;
  label: string;
  startBeat: number;
  endBeat: number;
  durationBeats: number;
  groups: ExpectedNoteGroup[];
  midiNotes: number[];
}

interface ScorePracticePlan {
  selection: ScorePracticeSelection;
  segments: PracticeSegment[];
  durationBeats: number;
  expectedGroups: number;
}
```

`buildScorePracticePlan(score, selection)` resolves and validates the range.
Ranges use half-open semantics: `[startBeat, endBeat)`. A note belongs to the
range when its onset is inside that interval. A note beginning before the range
is excluded even if it sustains into the range. A note beginning inside the
range is retained and its sounding duration is clamped at `endBeat`.

Every segment's groups are rebased so the segment starts at beat zero. Source
note indexes remain stable for grading and diagnostics. Empty, reversed,
non-finite, missing, overlapping, duplicate, and unknown-section selections
return explicit errors. Named sections are always normalized into score order,
regardless of click order. If a score has no formal sections, the Sections mode
is unavailable.

Full-score end time is the latest note end. Formal sections use their declared
`endBeat`, with note duration clamping at that boundary.

The custom selection is one contiguous range. Named sections and a custom range
cannot be mixed in the same plan. This keeps persistence and result attribution
unambiguous while still supporting both selection styles.

## Selection Boundary Projection

Add `buildScoreSelectionMap(score)`, a pure projection used by both renderers:

```ts
interface ScoreSelectionBoundary {
  id: string;
  beat: number;
  kind: "score-start" | "measure" | "note-group" | "score-end";
  measureIndex: number;
}

interface ScoreSelectionMap {
  measureBoundaries: ScoreSelectionBoundary[];
  noteGroupBoundaries: ScoreSelectionBoundary[];
}
```

Measure boundaries are derived from the canonical time-signature map, including
mid-score changes. Note-group boundaries include score start, every canonical
note-group onset, and score end. Boundaries are sorted, deduplicated, and
identified independently of either renderer.

Pointer selection is inclusive from the user's perspective but stored as a
half-open range:

- the start hit snaps to the selected measure start or note-group onset;
- the end hit snaps to the selected measure end or the next note-group
  boundary after the hit group;
- reverse drags are normalized;
- a single hit does not create a range; the user must choose distinct start and
  end boundaries.

The resulting custom range must contain at least one note group.

## Renderer Selection Adapters

`StaffNotation` and `MusicXmlScore` expose the same optional interaction
contract:

```ts
interface NotationSelectionProps {
  selectionMap: ScoreSelectionMap;
  highlightedRanges: {
    id: string;
    startBeat: number;
    endBeat: number;
    active?: boolean;
  }[];
  customSelection?: { startBeat: number; endBeat: number };
  snap: LoopSnap;
  selectionEnabled: boolean;
  onSelectionChange?: (range: { startBeat: number; endBeat: number }) => void;
}
```

The components own only graphical hit testing and range overlays. They emit
canonical beat ranges and never create practice plans or follower state.
`highlightedRanges` supports several named-section overlays; only
`customSelection` exposes editable handles.

For VexFlow:

- rendered measures and `.vf-stavenote` groups receive canonical boundary data;
- pointer coordinates resolve against their SVG bounding boxes;
- the overlay spans the selected range across every visible staff row.

For OSMD:

- keep the `OpenSheetMusicDisplay` instance after rendering;
- use `GraphicSheet` graphical measures and staff entries for hit testing;
- translate OSMD source timestamps to the nearest canonical boundary;
- render a separate theme-token overlay over the OSMD SVG rather than mutating
  OSMD's source model.

Both adapters support:

- pointer drag on desktop;
- tap start, then tap end on touch devices;
- hover/focus preview;
- moving either start or end handle after a range exists;
- clearing the selection;
- measure and note-group snap modes.

Measure/beat start and end controls mirror the same canonical range. They are
the keyboard-accessible input path and the fallback if graphical hit testing is
unavailable. Changing either the notation selection or numeric controls updates
the other through the route-owned canonical range.

## Performance Timing

Performance mode uses one constant user-selected BPM for the complete practice
run. The initial value is the score's first tempo marker, clamped to the
supported practice range. Changing BPM is deliberate slow-down or speed-up
practice and does not mutate the stored score.

Imported tempo maps continue to drive normal score preview playback. Grading
against arbitrary tempo-map changes is deferred because the current
`ScoreFollower` contract accepts one BPM.

The count-in downbeat and incoming `NoteEvent.timestamp` values must use the
same monotonic clock. Extend the transport/runtime boundary so
`MusicRuntime.runCountIn()` resolves with the monotonic timestamp of the first
practice downbeat. The first expected group in the rebased plan is scheduled at
that timestamp.

The metronome continues after the count-in for the duration of the take and is
stopped on completion, cancellation, navigation, or error. Performance mode
accepts input only after the practice downbeat, so count-in bleed and early
notes are not graded.

A single-segment performance take ends automatically after:

```text
selected range duration at practice BPM + final timing window
```

This grace window allows the final expected notes to match before the follower
is finalized. Wait mode ends when all selected groups advance.

## Repetition And Session Orchestration

Add a framework-agnostic `ScorePracticeSession` engine over
`ScoreFollowerRun`. It owns:

- the immutable practice plan;
- mode, BPM, strictness, and total take count;
- current segment, take number, and status;
- the active follower;
- completed segment/take results;
- aggregate live and final projections.

The route owns browser lifecycle work: awaiting audio enablement, running the
count-in, scheduling the take-end timer, subscribing to `InputRouter`, and
stopping runtime audio. It passes the count-in downbeat timestamp to the
session, forwards normalized input events, and ticks the session clock while a
performance take is active.

The engine expands the plan into a deterministic execution queue:

- **Sequence:** the engine concatenates the selected segments into one rebased
  group timeline and creates one fresh follower per sequence take. Source-score
  gaps between noncontiguous sections are removed.
- **Per section:** segment 1 runs for every configured take, followed by segment
  2 for every configured take, and so on. Every section take gets a fresh
  follower.
- **Full/custom:** the single segment runs for every configured take.

Follower state never carries matched notes, held notes, wrong notes, or
timestamps into a new take. Sequence mode uses one count-in at the start of
each sequence take and the metronome remains continuous across its concatenated
segments. Each following segment starts when the prior segment's declared
duration ends. Per-section mode uses a new count-in before every section take.

After an execution:

- if another queued execution remains, the route starts a count-in when the
  queue marks a new take boundary;
- otherwise, the session produces the final aggregate result.

Looping is finite. Loop Off means one take. Loop On exposes 2, 4, and 8 total
takes. In Sequence mode this is the number of complete sequence takes. In Per
Section mode it is the number of takes for each selected section. The value is
the total take count, not the number of repeats after the first take.

Cancellation finalizes nothing and writes no journal entry. Restarting after
completion creates a new practice session.

## Result Projections

Each follower execution preserves the existing `ScoreFollower` result. In
Sequence mode, the session also partitions that result by the source-index
ranges belonging to each selected segment. Add a pure aggregate projection
with:

- expected-note-weighted aggregate score across all segment executions;
- matched and expected note counts;
- pitch completion percentage;
- mean absolute timing error from matched timing metrics;
- early, on-time, and late note counts;
- missed-note count;
- extra-note count;
- best take number and score for full, custom, and sequence practice;
- best take per section for per-section practice;
- per-segment score and timing summary;
- per-take score and timing summary;
- per-section aggregate when named sections are selected.

In Sequence mode, a take score is weighted by each segment's expected-note
count. In Per Section mode, each section aggregate is the arithmetic mean of
that section's configured takes, while the overall score remains weighted by
expected-note count across all executions. Empty segments are rejected before
practice, so every weight is positive.

“On time” means an absolute timing error of 20 ms or less, matching the existing
live follower feedback. Early and late counts include matched notes outside that
band.

Live UI state comes from the current follower plus session repetition state.
Performance-mode score position and progress are time-based, so a missed note
does not leave the HUD stuck on an earlier group while the metronome continues.
`ScorePracticeSession.tick(timestamp)` derives the current temporal group and
range progress from the same downbeat and BPM used for grading. Wait-mode
progress remains completion-based. The route must not recalculate score
position, scoring, or aggregate metrics.

## Playback And Rendering

The existing Play Preview action remains tempo-map-aware and plays the complete
stored score.

Practice mode does not play the score as accompaniment. Performance mode uses
the metronome after count-in so the user's input remains the graded performance.
A later backing-track or score-accompaniment feature can register a synchronized
playback source without changing the session contract.

The current notation renderer remains visible:

- MusicXML-backed songs continue to render the complete original document with
  OSMD.
- MIDI/generated songs continue to use the canonical VexFlow renderer.
- The renderer shows the selected custom range or named-section overlays.
- The practice card identifies the selected segment, expected note group, take,
  and progress.

Playback cursor synchronization and visual cropping are not required for this
milestone. The canonical plan, not renderer internals, remains the source of
truth for score position and selection.

## Song Studio UI

Keep the existing Practice OS shell and inherited site theme. Compose controls
from `@repo/ui` and existing music components.

The page adds:

- a Wait/Performance segmented control;
- Whole Score, Sections, and Custom Range selection modes;
- multi-select named-section controls and Sequence/Per Section ordering;
- selectable Measure/Note Group snapping;
- direct notation selection with accessible start/end measure and beat fields;
- selected-range handles, overlay, and Clear Selection action;
- Performance-only BPM, strictness, count-in, loop, and take-count controls;
- a single Start Practice action and a visible Cancel action while active;
- current take and selected-range progress;
- expected note names and the existing on-screen keyboard;
- `TimingMeter` and live early/late feedback in Performance mode;
- a final `SessionFeedback`-style summary with per-take rows.

Configuration controls are disabled while a session is active. Starting
practice scrolls no global page state and does not replace the persistent Music
transport bar. The route restores the runtime's prior BPM and count-in values
after practice so Song Studio does not silently alter global transport
preferences.

The UI must remain usable without MIDI. On-screen note events use the same
shared `InputRouter` path and timestamps as hardware events.

## Persistence

Record one `source: "song"` practice session after all configured takes finish.
Include:

- tags for song id, score following, mode, and selected range;
- one `ExerciseRunRecord` per segment execution;
- run params containing BPM, strictness, selection kind, section id or custom
  beat range, snap mode, loop order, segment number, take number, and total
  takes;
- XP calculated once as `5 + round(aggregateScore * 15)`, producing 5-20 XP
  regardless of repetition count;
- a human-readable journal note containing song, range, mode, takes, aggregate
  score, and mean timing error when available.

This milestone does not emit `ScoringEvent`s or update skill mastery. A stored
song has no validated mapping to seeded reading, rhythm, technique, or
instrument skills, so inventing one would corrupt analytics. The per-take run
records and aggregate journal note are the persisted evidence until song-part
skill tagging is designed.

Wait-mode logging remains compatible but includes the same selection metadata.
If journal persistence fails, the completed result remains visible and the
status reports that only logging failed.

No server database or migration is added.

## Error Handling And Cleanup

- Invalid or empty score ranges disable Start and show a specific message.
- Overlapping or duplicate named sections are rejected rather than silently
  merging their notes.
- Renderer hit-testing failure preserves the numeric measure/beat controls and
  reports that direct score selection is unavailable.
- A selection is not committed until both canonical boundaries are valid.
- Audio enablement or count-in failure leaves the session idle and reports the
  runtime error.
- A renderer failure still leaves practice controls available.
- Input arriving while idle, counting in, between takes, or completed is
  ignored.
- The take timer is cleared on cancellation, restart, and component teardown.
- Input subscriptions are removed and the metronome is stopped on teardown.
- Starting a second session while one is active is rejected.
- Journal failure does not discard the in-memory result.

## Testing

### Core Unit Tests

- Full-score and section plans use half-open boundaries and rebase groups.
- Multi-section plans normalize score order and expand Sequence and Per Section
  execution queues correctly.
- Duplicate, overlapping, missing, and unknown sections fail explicitly.
- Selection maps handle time-signature changes, measure boundaries, note-group
  boundaries, deduplication, and score end.
- Pointer end hits include the selected measure or note group while producing a
  half-open canonical range.
- Sustaining notes are excluded or clamped according to the range contract.
- Custom ranges reject zero-width and note-empty selections.
- Performance timing starts at the supplied count-in downbeat.
- Performance clock ticks advance temporal group/progress despite missed notes.
- Every repetition creates an isolated follower.
- Aggregate summaries calculate score, pitch completion, timing bands, misses,
  extras, and best take deterministically.
- One, two, four, and eight-take sessions stop at the configured total.
- Cancellation produces no completed aggregate.
- Existing wait and performance follower tests remain green.

### Runtime Tests

- Count-in returns a monotonic practice-downbeat timestamp.
- Metronome stop is idempotent and clears reactive runtime state.
- Count-in and stop cleanup work when transport creation or audio enablement
  fails.

### Svelte Component Tests

- Song Studio defaults to Wait and whole score.
- Formal sections support multi-selection and both loop-order modes.
- Custom selection supports measure and note-group snapping.
- VexFlow drag and touch-tap selection emit canonical ranges and render the
  overlay.
- OSMD drag and touch-tap selection emit the same canonical ranges and render
  the overlay.
- Numeric measure/beat controls stay synchronized with notation selection.
- Performance controls configure BPM, strictness, count-in, and takes.
- Input is ignored during count-in and advances/scores after the downbeat.
- Wait mode completes the resolved full, multi-section, or custom plan from
  shared input.
- Performance mode advances through multiple takes and renders the aggregate
  summary.
- Cancellation stops practice without logging.
- Completed sessions log one journal entry with per-take run metadata.
- Existing OSMD/VexFlow rendering and preview behavior remains intact when
  selection is disabled.

### Playwright

- Import or open a score, multi-select sections, choose both loop-order modes,
  and verify the expected practice order.
- Select a custom range directly in VexFlow and OSMD using both snap modes.
- Complete a selected range in Wait mode and see a persisted result.
- Run a two-take Performance loop with on-screen input and see timing plus
  aggregate feedback.
- Verify MIDI/on-screen input still shares the same route behavior.
- Verify desktop and 375 px mobile layouts have no horizontal overflow and keep
  practice controls and persistent transport reachable.

## Deferred

- Tempo-map-aware performance grading
- Voice/part filtering
- Infinite looping
- Backing-track or score accompaniment during grading
- Playback cursor synchronization and selected-range cropping
- Compressed `.mxl` import
- Server-side song or result persistence
