# Song Studio Performance And Loop Selection Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add timed Song Studio practice with whole-score, multi-section, and direct notation-range selection, finite looping, per-take grading, and persisted session summaries.

**Architecture:** A new framework-agnostic `score-practice` engine turns canonical `Score` data into validated segments, selection boundaries, execution queues, and aggregate summaries over the existing `ScoreFollower`. VexFlow and OSMD implement a shared Svelte renderer-selection contract that emits canonical beat ranges; the Song Studio route owns browser lifecycle, count-in, timers, shared input routing, and journal persistence.

**Tech Stack:** TypeScript, SvelteKit 2, Svelte 5 runes, VitePlus/Vitest, VexFlow, OpenSheetMusicDisplay 2, Tone transport, `@repo/ui`, Playwright.

## Global Constraints

- Keep Music mounted under `/music` in the existing SvelteKit deployment.
- Use VitePlus workspace commands; do not add Turborepo.
- Use `@repo/ui` primitives and inherited theme tokens; do not introduce a Music-only palette.
- Use the shared `MusicRuntime`, `InputRouter`, `SoundEngine`, and transport; do not instantiate route-local engines.
- Keep score selection and grading canonical and renderer-independent.
- Support VexFlow and MusicXML/OSMD direct selection.
- Custom notation selection supports both `measure` and `note-group` snapping.
- Multi-section practice supports `sequence` and `per-section` ordering.
- Practice BPM is constant from 40-240; imported tempo maps remain preview-only.
- Count-in choices are 0, 1, or 2 bars; take choices are 1, 2, 4, or 8.
- Range semantics are half-open: `[startBeat, endBeat)`.
- Do not emit `ScoringEvent`s or update mastery for imported-song practice.
- Persist one `source: "song"` session with one `ExerciseRunRecord` per follower execution.
- Award XP once as `5 + round(aggregateScore * 15)`.
- No Music database migration or server persistence.
- Write failing focused tests before production changes.
- Do not stage unrelated root deletions or local `.claude`, `.codex`, `.serena`, or `.superpowers` directories.

---

## File Structure

### Core

- Create `packages/music-core/src/engines/score-practice/index.ts`
  - Selection types, boundary projection, practice-plan construction, execution queue, session state, and aggregate summaries.
- Create `packages/music-core/src/engines/score-practice/score-practice.test.ts`
  - Range, boundary, queue, session, and aggregation tests.
- Modify `packages/music-core/src/engines/score-follower/index.ts`
  - Expose stable expected-note identity and result counts needed by segment summaries.
- Modify `packages/music-core/src/engines/score-follower/score-follower.test.ts`
  - Lock result-count and source-index behavior.
- Modify `packages/music-core/package.json`
  - Export `./engines/score-practice`.

### Runtime

- Modify `packages/music-core/src/engines/transport/index.ts`
  - Emit scheduled monotonic timestamps.
- Modify `packages/music-core/src/engines/transport/transport.test.ts`
  - Verify audio-clock to monotonic-clock conversion.
- Modify `src/routes/music/_runtime.svelte.ts`
  - Return the first practice downbeat from `runCountIn()` and expose idempotent `stopPracticeClock()`.
- Modify `src/routes/music/_runtime.svelte.test.ts`
  - Verify count-in timing and cleanup.

### Renderer Selection

- Create `src/routes/music/_components/notation-selection.ts`
  - Shared renderer prop types plus pure hit/snap and overlay geometry helpers.
- Create `src/routes/music/_components/notation-selection.test.ts`
  - Geometry and snapping tests without Svelte.
- Modify `src/routes/music/_components/StaffNotation.svelte`
  - VexFlow measure/note-group hit targets, pointer/touch interaction, and overlays.
- Modify `src/routes/music/_components/StaffNotation.svelte.test.ts`
  - Direct selection and disabled-selection regressions.
- Modify `src/routes/music/_components/MusicXmlScore.svelte`
  - OSMD `GraphicSheet` hit targets, interaction, and overlays.
- Modify `src/routes/music/_components/MusicXmlScore.svelte.test.ts`
  - OSMD canonical range emission and fallback behavior.

### Song Studio

- Create `src/routes/music/songs/[id]/_components/ScorePracticeSetup.svelte`
  - Mode, selection, snap, section, BPM, count-in, order, loop, and take controls.
- Create `src/routes/music/songs/[id]/_components/ScorePracticeSummary.svelte`
  - Aggregate, take, and section feedback.
- Create `src/routes/music/songs/[id]/_components/score-practice-ui.test.ts`
  - Focused setup and summary component tests if the route test becomes too broad.
- Modify `src/routes/music/songs/[id]/+page.svelte`
  - Compose planning, renderer selection, session lifecycle, shared input, count-in, timers, and persistence.
- Modify `src/routes/music/songs/[id]/page.svelte.test.ts`
  - Wait, performance, looping, selection, cancellation, logging, and renderer regressions.
- Modify `e2e/music-import.spec.ts`
  - End-to-end VexFlow/OSMD selection, loop ordering, performance summary, and mobile overflow.

### Milestone Documentation

- Modify `IMPLEMENTATION_PLAN.md`
- Modify `docs/music-practice-lab-handoff.md`
- Modify `src/routes/music/AGENTS.md`

---

### Task 1: Canonical Practice Plans And Selection Boundaries

**Files:**
- Create: `packages/music-core/src/engines/score-practice/index.ts`
- Create: `packages/music-core/src/engines/score-practice/score-practice.test.ts`
- Modify: `packages/music-core/package.json`

**Interfaces:**
- Consumes: `Score`, `ScoreSection`, and `ExpectedNoteGroup` from existing core modules.
- Produces:

```ts
export type LoopSnap = "measure" | "note-group";
export type LoopOrder = "sequence" | "per-section";
export type ScorePracticeSelection =
  | { kind: "full" }
  | { kind: "sections"; sectionIds: string[]; order: LoopOrder }
  | { kind: "custom"; startBeat: number; endBeat: number; snap: LoopSnap };

export interface PracticeSegment {
  id: string;
  label: string;
  startBeat: number;
  endBeat: number;
  durationBeats: number;
  groups: ExpectedNoteGroup[];
  midiNotes: number[];
}

export interface ScoreSelectionBoundary {
  id: string;
  beat: number;
  kind: "score-start" | "measure" | "note-group" | "score-end";
  measureIndex: number;
}

export interface ScoreSelectionMap {
  measureBoundaries: ScoreSelectionBoundary[];
  noteGroupBoundaries: ScoreSelectionBoundary[];
}

export interface ScorePracticePlan {
  selection: ScorePracticeSelection;
  segments: PracticeSegment[];
  durationBeats: number;
  expectedGroups: number;
}

export function buildScoreSelectionMap(score: Score): ScoreSelectionMap;
export function buildScorePracticePlan(
  score: Score,
  selection: ScorePracticeSelection,
): ScorePracticePlan;
```

- [ ] **Step 1: Write failing boundary and range tests**

Add tests that use a score with a `4/4` measure, a `3/4` time-signature change at beat 4, sections `A [0,4)`, `B [4,7)`, and notes on beats `0, 1, 3, 4, 6`.

```ts
test("builds measure and note-group boundaries across time-signature changes", () => {
  const map = buildScoreSelectionMap(changingMeterScore());
  expect(map.measureBoundaries.map(({ beat }) => beat)).toEqual([0, 4, 7]);
  expect(map.noteGroupBoundaries.map(({ beat }) => beat)).toEqual([0, 1, 3, 4, 6, 7]);
});

test("normalizes selected sections into score order and rebases each segment", () => {
  const plan = buildScorePracticePlan(changingMeterScore(), {
    kind: "sections",
    sectionIds: ["b", "a"],
    order: "sequence",
  });
  expect(plan.segments.map(({ id }) => id)).toEqual(["a", "b"]);
  expect(plan.segments[1]?.groups.map(({ startBeat }) => startBeat)).toEqual([0, 2]);
});

test("uses half-open custom ranges and clamps notes at the end boundary", () => {
  const plan = buildScorePracticePlan(changingMeterScore(), {
    kind: "custom",
    startBeat: 1,
    endBeat: 4,
    snap: "note-group",
  });
  expect(plan.segments[0]?.groups.map(({ startBeat }) => startBeat)).toEqual([0, 2]);
  expect(plan.segments[0]?.groups.some(({ startBeat }) => startBeat === 3)).toBe(false);
});
```

Also assert duplicate, overlapping, unknown, reversed, zero-width, non-finite, and note-empty selections throw exact messages.

- [ ] **Step 2: Run the focused test and confirm failure**

Run:

```bash
vp test packages/music-core/src/engines/score-practice/score-practice.test.ts --run
```

Expected: FAIL because `@repo/music-core/engines/score-practice` does not exist.

- [ ] **Step 3: Implement the pure selection projection**

Implement:

```ts
export function buildScoreSelectionMap(score: Score): ScoreSelectionMap {
  const endBeat = scoreEndBeat(score);
  const measures = measureStarts(score.timeSignatures, endBeat);
  const groupStarts = expectedGroups(score).map(({ startBeat }) => startBeat);
  return {
    measureBoundaries: boundaries([...measures, endBeat], "measure", measures),
    noteGroupBoundaries: boundaries([0, ...groupStarts, endBeat], "note-group", measures),
  };
}
```

`measureStarts()` must walk sorted time signatures, apply the active
`numerator * (4 / denominator)` duration, and terminate exactly at score end.
`boundaries()` must sort and deduplicate with an epsilon of `1e-6`.

- [ ] **Step 4: Implement plan validation and segment projection**

Resolve full, named, and custom ranges, reject overlaps before projection, and
project notes whose onset satisfies `startBeat <= onset < endBeat`. Rebase
`ExpectedNoteGroup.startBeat` by subtracting segment start and clamp
`durationBeats` to `endBeat - originalStartBeat`.

- [ ] **Step 5: Export and run tests**

Add:

```json
"./engines/score-practice": "./src/engines/score-practice/index.ts"
```

Run:

```bash
vp test packages/music-core/src/engines/score-practice/score-practice.test.ts --run
vp run @repo/music-core#check
```

Expected: all score-practice tests PASS and Music core type-checks.

- [ ] **Step 6: Commit**

```bash
git add packages/music-core/package.json packages/music-core/src/engines/score-practice
git commit -m "feat(music): add canonical song practice ranges"
```

---

### Task 2: Execution Queue, Session State, And Aggregate Results

**Files:**
- Modify: `packages/music-core/src/engines/score-practice/index.ts`
- Modify: `packages/music-core/src/engines/score-practice/score-practice.test.ts`
- Modify: `packages/music-core/src/engines/score-follower/index.ts`
- Modify: `packages/music-core/src/engines/score-follower/score-follower.test.ts`

**Interfaces:**
- Consumes: `ScorePracticePlan`, `createScoreFollower()`, `NoteEvent`, and `MonotonicMs`.
- Produces:

```ts
export interface ScorePracticeOptions {
  mode: ScoreFollowerMode;
  bpm: number;
  strictness: TimingStrictness;
  totalTakes: 1 | 2 | 4 | 8;
}

export interface PracticeExecution {
  id: string;
  take: number;
  segmentIds: string[];
  groups: ExpectedNoteGroup[];
  durationBeats: number;
  startsNewTake: boolean;
}

export interface ScorePracticeSummary {
  aggregateScore: number;
  matchedNotes: number;
  expectedNotes: number;
  pitchCompletion: number;
  meanAbsoluteTimingErrorMs?: number;
  earlyNotes: number;
  onTimeNotes: number;
  lateNotes: number;
  missedNotes: number;
  extraNotes: number;
  bestTake?: number;
  takes: ScorePracticeTakeSummary[];
  sections: ScorePracticeSectionSummary[];
}

export interface ScorePracticeTakeSummary {
  take: number;
  score: number;
  expectedNotes: number;
  matchedNotes: number;
  meanAbsoluteTimingErrorMs?: number;
  segmentIds: string[];
}

export interface ScorePracticeSectionSummary {
  segmentId: string;
  label: string;
  score: number;
  expectedNotes: number;
  matchedNotes: number;
  bestTake?: number;
}

export type ScorePracticeExecutionResult = ReturnType<ScoreFollowerRun["finish"]>;

export interface ScorePracticeState {
  status: ScorePracticeStatus;
  executionIndex: number;
  execution?: PracticeExecution;
  take: number;
  currentSegmentId?: string;
  progress: number;
  live?: ScoreFollowerLiveState;
  completedResults: ScorePracticeExecutionResult[];
  summary?: ScorePracticeSummary;
}

export function buildPracticeExecutions(
  plan: ScorePracticePlan,
  options: Pick<ScorePracticeOptions, "totalTakes">,
): PracticeExecution[];

export class ScorePracticeSession {
  constructor(plan: ScorePracticePlan, options: ScorePracticeOptions);
  get state(): ScorePracticeState;
  markCountingIn(): ScorePracticeState;
  startExecution(startTimestampMs: MonotonicMs): ScorePracticeState;
  accept(event: NoteEvent): ScorePracticeState;
  tick(timestampMs: MonotonicMs): ScorePracticeState;
  finishExecution(): ScorePracticeState;
  cancel(): ScorePracticeState;
}
```

- [ ] **Step 1: Lock follower result identity and counts with failing tests**

Extend `ScoreFollowerAnswer`:

```ts
export interface ScoreFollowerAnswer {
  completedGroups: number;
  expectedGroups: number;
  matchedNotes: number;
  expectedNotes: number;
  missedNotes: number;
  extraNotes: number;
  playedMidiNotes: number[];
  wrongMidiNotes: number[];
}
```

Add assertions for perfect and partial performance runs. Run:

```bash
vp test packages/music-core/src/engines/score-follower/score-follower.test.ts --run
```

Expected: FAIL because the new counts are absent.

- [ ] **Step 2: Add follower counts without changing scoring**

Populate the counts in wait and performance `finish()` results. Preserve all
existing metric order and score formulas.

- [ ] **Step 3: Write failing queue and isolation tests**

```ts
test("sequence mode concatenates sections into one execution per take", () => {
  const executions = buildPracticeExecutions(sectionPlan("sequence"), { totalTakes: 2 });
  expect(executions.map(({ take, segmentIds }) => ({ take, segmentIds }))).toEqual([
    { take: 1, segmentIds: ["a", "b"] },
    { take: 2, segmentIds: ["a", "b"] },
  ]);
});

test("per-section mode completes all takes before moving sections", () => {
  const executions = buildPracticeExecutions(sectionPlan("per-section"), { totalTakes: 2 });
  expect(executions.map(({ take, segmentIds }) => ({ take, segmentIds }))).toEqual([
    { take: 1, segmentIds: ["a"] },
    { take: 2, segmentIds: ["a"] },
    { take: 1, segmentIds: ["b"] },
    { take: 2, segmentIds: ["b"] },
  ]);
});
```

Add a session test proving a note matched in take 1 is missed in take 2 unless
played again.

- [ ] **Step 4: Implement queue expansion and sequence rebasing**

For sequence mode, concatenate segment groups by accumulating each segment's
declared `durationBeats`; preserve source indexes and attach segment identity
to execution metadata. For per-section mode, emit one execution per
section/take pair.

- [ ] **Step 5: Write failing timing and aggregate tests**

Test:

- `tick()` advances performance progress with no input.
- input before `startExecution()` is ignored;
- `finishExecution()` advances or completes the queue;
- cancellation returns `status: "cancelled"` with no summary;
- overall score is expected-note weighted;
- sequence take scores partition by segment source indexes;
- per-section summaries average that section's takes;
- timing counts use `abs(errorMs) <= 20` for on-time.

- [ ] **Step 6: Implement `ScorePracticeSession` and summary projection**

Use statuses:

```ts
export type ScorePracticeStatus =
  | "ready"
  | "count-in"
  | "running"
  | "between"
  | "complete"
  | "cancelled";
```

`startExecution()` creates a fresh follower. `tick()` calculates beat position
from `(timestampMs - startTimestampMs) / beatToMs(1, bpm)` and uses time-based
progress only in performance mode. `finishExecution()` stores the immutable
result and either moves to `between` or computes the final summary.
`markCountingIn()` is valid only from `ready` or `between`, and input is ignored
until `startExecution()` changes the status to `running`.

- [ ] **Step 7: Run core verification and commit**

```bash
vp test packages/music-core/src/engines/score-follower/score-follower.test.ts packages/music-core/src/engines/score-practice/score-practice.test.ts --run
vp run @repo/music-core#check
git add packages/music-core/src/engines/score-follower packages/music-core/src/engines/score-practice
git commit -m "feat(music): add looping score practice session"
```

Expected: focused tests PASS and core type-checks.

---

### Task 3: Monotonic Count-In And Practice Clock Cleanup

**Files:**
- Modify: `packages/music-core/src/engines/transport/index.ts`
- Modify: `packages/music-core/src/engines/transport/transport.test.ts`
- Modify: `src/routes/music/_runtime.svelte.ts`
- Modify: `src/routes/music/_runtime.svelte.test.ts`

**Interfaces:**
- Produces `TransportEvent.atMonotonicMs: MonotonicMs`.
- Changes `MusicRuntime.runCountIn(): Promise<MonotonicMs>`.
- Adds `MusicRuntime.stopPracticeClock(): void`.

- [ ] **Step 1: Write failing transport-clock conversion tests**

Inject deterministic clocks:

```ts
const engine = new TransportEngine(clock, {
  audioNowSeconds: () => 10,
  monotonicNowMs: () => monotonicMs(5_000),
});
clock.fire(10.25);
expect(events[0]?.atMonotonicMs).toBe(5_250);
```

Run:

```bash
vp test packages/music-core/src/engines/transport/transport.test.ts --run
```

Expected: FAIL because transport events do not expose monotonic timestamps.

- [ ] **Step 2: Implement scheduled monotonic timestamps**

Add optional clock functions to `TransportEngineOptions`. In `#emitTick()`:

```ts
const atMonotonicMs = monotonicMs(
  this.#monotonicNowMs() + (atSeconds - this.#audioNowSeconds()) * 1_000,
);
```

`createToneTransportEngine()` supplies `tone.now` and `performance.now`.

- [ ] **Step 3: Write failing runtime count-in and stop tests**

Update the fake transport event with `atMonotonicMs`. Assert:

```ts
await expect(ready).resolves.toBe(1_500);
rt.stopPracticeClock();
expect(transport.stop).toHaveBeenCalledOnce();
expect(rt.metronomeRunning).toBe(false);
expect(rt.activeBeat).toBe(-1);
```

Also test zero count-in starts the metronome and immediately resolves from an
injectable runtime monotonic clock.

- [ ] **Step 4: Implement runtime practice-clock APIs**

`runCountIn()` must:

- enable audio;
- ensure transport;
- set current BPM and count-in;
- start the transport;
- return the first non-counting-in beat's `atMonotonicMs`;
- with zero bars, start transport and return the injected `now()` immediately.

`stopPracticeClock()` stops an active transport and always clears
`metronomeRunning` and `activeBeat`.

- [ ] **Step 5: Run tests and commit**

```bash
vp test packages/music-core/src/engines/transport/transport.test.ts src/routes/music/_runtime.svelte.test.ts --run
vp run -r check
git add packages/music-core/src/engines/transport src/routes/music/_runtime.svelte.ts src/routes/music/_runtime.svelte.test.ts
git commit -m "feat(music): expose monotonic practice count-in"
```

---

### Task 4: Shared Renderer Selection Geometry

**Files:**
- Create: `src/routes/music/_components/notation-selection.ts`
- Create: `src/routes/music/_components/notation-selection.test.ts`

**Interfaces:**
- Consumes `LoopSnap` and `ScoreSelectionMap`.
- Produces:

```ts
export interface BeatRange {
  startBeat: number;
  endBeat: number;
}

export interface NotationRangeHighlight extends BeatRange {
  id: string;
  active?: boolean;
}

export interface NotationHitTarget {
  boundaryId: string;
  beat: number;
  startBeat: number;
  endBeat: number;
  rect: { left: number; top: number; right: number; bottom: number };
}

export function nearestHit(
  point: { x: number; y: number },
  targets: NotationHitTarget[],
): NotationHitTarget | undefined;

export function rangeFromHits(
  start: NotationHitTarget,
  end: NotationHitTarget,
): BeatRange | undefined;

export function overlayRects(
  range: BeatRange,
  targets: NotationHitTarget[],
): Array<{ left: number; top: number; width: number; height: number }>;
```

- [ ] **Step 1: Write failing pure geometry tests**

Cover forward and reverse drags, zero-width rejection, nearest target,
multi-system overlays, and complete-measure versus note-group target ranges.

- [ ] **Step 2: Run and confirm failure**

```bash
vp test src/routes/music/_components/notation-selection.test.ts --run
```

Expected: FAIL because the helper module does not exist.

- [ ] **Step 3: Implement minimal geometry helpers**

Use squared point-to-rectangle distance for `nearestHit()`. Normalize
`rangeFromHits()` with:

```ts
const startBeat = Math.min(start.startBeat, end.startBeat);
const endBeat = Math.max(start.endBeat, end.endBeat);
return endBeat > startBeat ? { startBeat, endBeat } : undefined;
```

Merge overlay rectangles only when they share the same visual row and overlap.

- [ ] **Step 4: Run and commit**

```bash
vp test src/routes/music/_components/notation-selection.test.ts --run
git add src/routes/music/_components/notation-selection.ts src/routes/music/_components/notation-selection.test.ts
git commit -m "feat(music): add notation selection geometry"
```

---

### Task 5: VexFlow Direct Range Selection

**Files:**
- Modify: `src/routes/music/_components/StaffNotation.svelte`
- Modify: `src/routes/music/_components/StaffNotation.svelte.test.ts`

**Interfaces:**
- Consumes:

```ts
selectionMap?: ScoreSelectionMap;
highlightedRanges?: NotationRangeHighlight[];
customSelection?: BeatRange;
snap?: LoopSnap;
selectionEnabled?: boolean;
onSelectionChange?: (range: BeatRange) => void;
```

- [ ] **Step 1: Load required Svelte guidance**

Read `svelte:svelte-code-writer` and `svelte:svelte-core-bestpractices`, then run
the Svelte analyzer on the component before editing.

- [ ] **Step 2: Write failing VexFlow interaction tests**

Render a two-measure `NotationView`, enable selection, and simulate:

- drag from a first-measure note to a second-measure note;
- reverse drag;
- tap start then tap end;
- switch from note-group to measure snapping;
- render two named-section highlights;
- render with selection disabled and confirm existing active/error classes.

Assert `onSelectionChange` receives canonical beats, not pixel values.

- [ ] **Step 3: Run and confirm failure**

```bash
vp test src/routes/music/_components/StaffNotation.svelte.test.ts --run
```

- [ ] **Step 4: Add canonical data to rendered VexFlow groups**

Record each stave's measure bounds and each `.vf-stavenote` event's
`startBeat/endBeat`. Build `NotationHitTarget[]` after SVG draw using
`getBoundingClientRect()`.

- [ ] **Step 5: Add pointer/touch selection and overlays**

Use pointer capture for drag. For touch/keyboard activation, retain the first
hit until a distinct second hit arrives. Render overlays as absolutely
positioned theme-token elements above the SVG with `pointer-events-none`.

- [ ] **Step 6: Analyze, test, and commit**

Run the Svelte analyzer after edits, then:

```bash
vp test src/routes/music/_components/StaffNotation.svelte.test.ts src/routes/music/_components/notation-selection.test.ts --run
vp run -r check
git add src/routes/music/_components/StaffNotation.svelte src/routes/music/_components/StaffNotation.svelte.test.ts
git commit -m "feat(music): add VexFlow loop selection"
```

---

### Task 6: OSMD Direct Range Selection

**Files:**
- Modify: `src/routes/music/_components/MusicXmlScore.svelte`
- Modify: `src/routes/music/_components/MusicXmlScore.svelte.test.ts`

**Interfaces:**
- Implements the same props and callback as Task 5.
- Uses public OSMD `GraphicSheet` data only inside this browser component.

- [ ] **Step 1: Run the Svelte analyzer and write failing OSMD tests**

Mock or use the existing lightweight MusicXML fixture and verify:

- measure snapping emits `[0, 4)`;
- note-group snapping emits the canonical onset range;
- reverse pointer selection normalizes;
- named-section overlays render;
- a hit-map construction failure calls `onError` but leaves the score visible;
- selection-disabled rendering retains the existing OSMD SVG behavior.

- [ ] **Step 2: Run and confirm failure**

```bash
vp test src/routes/music/_components/MusicXmlScore.svelte.test.ts --run
```

- [ ] **Step 3: Retain OSMD and build canonical hit targets**

After `osmd.render()`:

```ts
const containers = osmd.GraphicSheet.VerticalGraphicalStaffEntryContainers;
```

For each visible staff entry, use `getAbsoluteTimestamp().RealValue` and
`PositionAndShape.AbsolutePosition`; map OSMD units into host pixels from the
rendered SVG view box. Snap each timestamp to the nearest boundary from
`selectionMap`. For measure mode, use `GraphicSheet.MeasureList`.

- [ ] **Step 4: Add shared interaction and overlays**

Reuse `nearestHit()`, `rangeFromHits()`, and `overlayRects()`. Do not mutate
OSMD source notes, cursor state, or generated SVG classes.

- [ ] **Step 5: Analyze, test, and commit**

```bash
vp test src/routes/music/_components/MusicXmlScore.svelte.test.ts src/routes/music/_components/notation-selection.test.ts --run
vp run -r check
git add src/routes/music/_components/MusicXmlScore.svelte src/routes/music/_components/MusicXmlScore.svelte.test.ts
git commit -m "feat(music): add MusicXML loop selection"
```

---

### Task 7: Song Studio Setup And Wait-Mode Range Practice

**Files:**
- Create: `src/routes/music/songs/[id]/_components/ScorePracticeSetup.svelte`
- Modify: `src/routes/music/songs/[id]/+page.svelte`
- Modify: `src/routes/music/songs/[id]/page.svelte.test.ts`

**Interfaces:**
- Setup emits a complete immutable configuration:

```ts
export interface ScorePracticeSetupValue {
  mode: ScoreFollowerMode;
  selection: ScorePracticeSelection;
  bpm: number;
  strictness: TimingStrictness;
  countInBars: 0 | 1 | 2;
  totalTakes: 1 | 2 | 4 | 8;
}
```

- [ ] **Step 1: Load Svelte guidance and write failing route tests**

Add tests that:

- default to Wait + Whole Score;
- show formal sections and select several;
- toggle Sequence/Per Section;
- enter Custom Range and synchronize renderer callback with measure/beat fields;
- reject start with no selected sections or incomplete custom range;
- complete a multi-section Wait plan from shared router input;
- preserve VexFlow/OSMD renderer choice and preview playback.

- [ ] **Step 2: Run and confirm failure**

```bash
vp test 'src/routes/music/songs/[id]/page.svelte.test.ts' --run
```

- [ ] **Step 3: Build the setup component from existing primitives**

Use `SegmentedControl`, `@repo/ui` Button, Select, Slider, Toggle, Input, Label,
and Card. Disable performance-only controls in Wait mode and disable all setup
controls while practice is active.

- [ ] **Step 4: Integrate canonical selection and renderer props**

Derive:

```ts
const selectionMap = $derived(score ? buildScoreSelectionMap(score) : undefined);
const practicePlan = $derived.by(() => {
  if (!score) return undefined;
  try {
    return buildScorePracticePlan(score, setup.selection);
  } catch (error) {
    return { error: message(error, "Invalid practice range.") };
  }
});
```

Pass named ranges or custom range to either renderer through the shared prop
contract. Keep route state canonical; do not read renderer DOM in the route.

- [ ] **Step 5: Replace ad hoc Wait follower lifecycle with `ScorePracticeSession`**

For Wait mode, traverse the resolved execution queue once. Feed the shared
router into `session.accept()`, finish each execution when its live progress is
1, and show segment/take identity in the practice card.

- [ ] **Step 6: Analyze, test, and commit**

```bash
vp test 'src/routes/music/songs/[id]/page.svelte.test.ts' --run
vp run -r check
git add 'src/routes/music/songs/[id]/+page.svelte' 'src/routes/music/songs/[id]/page.svelte.test.ts' 'src/routes/music/songs/[id]/_components/ScorePracticeSetup.svelte'
git commit -m "feat(music): add Song Studio range setup"
```

---

### Task 8: Performance Lifecycle, Looping, Summary, And Persistence

**Files:**
- Create: `src/routes/music/songs/[id]/_components/ScorePracticeSummary.svelte`
- Modify: `src/routes/music/songs/[id]/+page.svelte`
- Modify: `src/routes/music/songs/[id]/page.svelte.test.ts`

**Interfaces:**
- Consumes `ScorePracticeSession`, `MusicRuntime.runCountIn()`, and
  `MusicRuntime.stopPracticeClock()`.
- Produces one `PracticeCaptureEntry` after a complete session.

- [ ] **Step 1: Write failing performance lifecycle tests**

Use fake timers and an injected runtime transport. Assert:

- input during count-in is ignored;
- downbeat timestamp starts performance grading;
- timer calls `tick()` and finalizes at duration plus final timing window;
- Sequence uses one count-in per sequence take;
- Per Section uses one count-in per section take;
- 2/4/8 take queues stop exactly;
- Cancel clears timers, stops metronome, restores prior BPM/count-in, and logs nothing;
- completion logs once even if the persistence promise is retried by rendering;
- logging failure leaves the summary visible.

- [ ] **Step 2: Add performance orchestration**

Implement one route function:

```ts
async function startCurrentExecution(): Promise<void> {
  session?.markCountingIn();
  const downbeat = await runtime.runCountIn();
  session?.startExecution(downbeat);
  schedulePerformanceTicks(downbeat);
}
```

Use one interval only for UI/session ticks and one timeout for execution end.
Clear both before every transition and in `onDestroy`.

Define the scheduler in the route:

```ts
function schedulePerformanceTicks(downbeat: MonotonicMs): void {
  clearPracticeTimers();
  tickTimer = setInterval(() => {
    if (!session) return;
    practiceState = session.tick(monotonicMs(performance.now()));
  }, 50);
  const durationMs = beatToMs(session?.state.execution?.durationBeats ?? 0, setup.bpm);
  endTimer = setTimeout(() => void finishCurrentExecution(), durationMs + finalWindowMs());
}

function finalWindowMs(): number {
  const groups = session?.state.execution?.groups ?? [];
  const last = groups.at(-1);
  return last
    ? timingWindowMs({
        bpm: setup.bpm,
        durationBeats: last.durationBeats,
        strictness: setup.strictness,
      })
    : 0;
}
```

- [ ] **Step 3: Build the summary component**

Render aggregate score, pitch completion, mean absolute timing error, early/on
time/late counts, misses, extras, best take, per-take rows, and per-section rows.
Reuse `TimingMeter` for the latest live offset; use theme tokens and semantic
text, not copied Claude colors.

- [ ] **Step 4: Build deterministic journal payloads**

Create one run per follower execution:

```ts
const run: ExerciseRunRecord = {
  id: `${captureId}-take-${execution.take}-${execution.id}`,
  exerciseId: "song.score-practice",
  startedAt,
  endedAt,
  promptIds: execution.groups.map(({ id }) => id),
  targetSkillIds: [],
  instrument: runtime.activeInstrument,
  difficulty: strictnessDifficulty(setup.strictness),
  params: {
    bpm: setup.bpm,
    strictness: setup.strictness,
    selection: setup.selection.kind,
    segmentIds: execution.segmentIds,
    take: execution.take,
    totalTakes: setup.totalTakes,
  },
};
```

Record zero scoring events, bounded XP, and tags:
`["song", song.id, "score-following", mode, selection.kind]`.

Define difficulty locally and keep it stable:

```ts
function strictnessDifficulty(strictness: TimingStrictness): number {
  return { relaxed: 0.35, normal: 0.6, strict: 0.85 }[strictness];
}
```

- [ ] **Step 5: Run tests, analyze, and commit**

```bash
vp test 'src/routes/music/songs/[id]/page.svelte.test.ts' --run
vp run -r check
git add 'src/routes/music/songs/[id]'
git commit -m "feat(music): add Song Studio performance loops"
```

---

### Task 9: End-To-End Coverage And Responsive Verification

**Files:**
- Modify: `e2e/music-import.spec.ts`

**Interfaces:**
- Exercises real IndexedDB import/save/open flows and on-screen input.

- [ ] **Step 1: Add deterministic score fixtures**

Extend the MIDI and MusicXML fixtures to contain at least two formal sections
or inject sections into the saved score through browser-side IndexedDB setup.
Keep one VexFlow-backed score and one OSMD-backed score.

- [ ] **Step 2: Add VexFlow multi-section and custom-range flows**

Cover:

- select A+B;
- switch Sequence and Per Section;
- verify displayed execution order;
- drag a note-group custom range;
- complete Wait mode with on-screen notes.

- [ ] **Step 3: Add OSMD direct selection and performance flow**

Cover measure snapping, touch-style start/end taps, a two-take performance loop,
visible timing/aggregate summary, and one journal entry.

Use a zero-bar count-in and a short 240 BPM fixture to keep the test fast.

- [ ] **Step 4: Add desktop/mobile overflow and cleanup checks**

At 1280 px and 375 px:

```ts
expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
```

Navigate away during an active run and assert the persistent transport is no
longer in a playing state.

- [ ] **Step 5: Run focused and full verification**

```bash
./node_modules/.bin/playwright test e2e/music-import.spec.ts
vp run -r check
vp test --run
vp run -r build
./node_modules/.bin/tsx packages/music-core/src/domain/validate.ts
./node_modules/.bin/tsx packages/music-core/src/domain/pipeline-trace.ts
```

Expected: all commands exit 0. Then run the full browser suite:

```bash
./node_modules/.bin/playwright test
```

- [ ] **Step 6: Browser-inspect the route**

Use the in-app browser to verify:

- VexFlow and OSMD drag selection;
- touch start/end behavior at 375 px;
- measure/note-group snap changes;
- section overlays;
- Sequence/Per Section ordering;
- count-in, cancellation, and transport cleanup;
- root light/dark theme inheritance.

- [ ] **Step 7: Commit**

```bash
git add e2e/music-import.spec.ts
git commit -m "test(music): cover Song Studio performance loops"
```

---

### Task 10: Milestone Documentation And Final Verification

**Files:**
- Modify: `IMPLEMENTATION_PLAN.md`
- Modify: `docs/music-practice-lab-handoff.md`
- Modify: `src/routes/music/AGENTS.md`

**Interfaces:**
- Documents shipped behavior, deferred work, verification results, and manual checks.

- [ ] **Step 1: Update the tracked implementation status**

Mark performance mode, multi-section/custom range selection, both loop orders,
renderer adapters, count-in, summaries, and persistence complete. Leave
tempo-map grading, voice filtering, infinite loops, accompaniment, cursor
synchronization, cropping, and `.mxl` deferred.

- [ ] **Step 2: Update Music agent guidance**

Document:

- `score-practice` owns selection plans, execution queues, and summaries;
- renderers emit canonical ranges only;
- direct selection must work in both VexFlow and OSMD;
- route code owns lifecycle and shared runtime cleanup;
- imported songs do not update mastery without explicit skill tagging.

- [ ] **Step 3: Update the local handoff**

Record commit hashes, exact test counts, browser verification, known residual
risks, and the next recommended milestone. Keep this file local-only because
`docs/` is excluded through `.git/info/exclude`.

- [ ] **Step 4: Run final clean-room gates**

```bash
vp run -r check
vp test --run
vp run -r build
./node_modules/.bin/playwright test
./node_modules/.bin/tsx packages/music-core/src/domain/validate.ts
./node_modules/.bin/tsx packages/music-core/src/domain/pipeline-trace.ts
git status --short
```

Expected: all gates pass. `git status` contains no uncommitted tracked Music
changes and still shows only the pre-existing unrelated root deletions/tool
directories.

- [ ] **Step 5: Commit tracked documentation**

Stage only tracked files:

```bash
git add IMPLEMENTATION_PLAN.md src/routes/music/AGENTS.md
git commit -m "docs(music): document Song Studio looping"
```

Do not force-add `docs/music-practice-lab-handoff.md`.
