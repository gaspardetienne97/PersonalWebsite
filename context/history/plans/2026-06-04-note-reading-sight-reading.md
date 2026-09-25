# Note Reading And Sight-Reading Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build T1.7 as a complete note-reading and generated sight-reading workflow for piano,
guitar, and ukulele at `/music/learn/reading`.

**Architecture:** Extend the canonical score model with backward-compatible written-notation
metadata, then build framework-independent notation, tuning, projection, and score-following
engines in `@repo/music-core`. Svelte components render VexFlow and instrument projections while a
reading-session coordinator feeds completed flashcards and sight-reading runs through the existing
exercise pipeline.

**Tech Stack:** TypeScript, Svelte 5 runes, SvelteKit, VexFlow 5, Tonal, Dexie, VitePlus/Vitest,
Vitest Browser, Playwright, Storybook, Tailwind CSS 4, `@repo/ui`

---

## Delivery Checkpoints

1. **Foundations:** canonical notation metadata, notation view model, tuning profiles, persistence,
   and instrument projection.
2. **Flashcards:** generated single-note/chord prompts, session coordination, VexFlow rendering,
   fretboard/piano input, and `/music/learn/reading`.
3. **Sight-reading:** playable polyphonic generation, wait/performance score following, count-in,
   live feedback, summaries, and end-to-end coverage.

The plan uses frequent commits inside T1.7. Do not stage `docs/`, `domain/`, old plans, `.codex/`,
`.superpowers/`, or `AGENTS.md`; they are intentionally local-only through `.git/info/exclude`.

## File Structure

### Music Core

- `packages/music-core/src/domain/score.ts`: backward-compatible written-pitch, rest, tie, and
  tuplet metadata on canonical scores.
- `packages/music-core/src/engines/notation/index.ts`: written spelling and VexFlow-neutral notation
  view models.
- `packages/music-core/src/engines/tunings/index.ts`: curated profiles and custom tuning validation.
- `packages/music-core/src/engines/tunings/tuning-store.ts`: custom tuning persistence through
  `PracticeStore.settings`.
- `packages/music-core/src/engines/projection/index.ts`: piano/fretboard locations and polyphonic
  playability.
- `packages/music-core/src/exercises/note-reading.ts`: generated flashcard prompts and grading.
- `packages/music-core/src/engines/reading-session/index.ts`: flashcard and sight-reading session
  coordination through `ExerciseRunHost`.
- `packages/music-core/src/engines/score-follower/index.ts`: wait and performance-mode grouped-note
  matching.
- `packages/music-core/src/exercises/sight-reading.ts`: instrument-specific canonical score
  generation and score-follower exercise definition.

### Svelte Route

- `src/routes/music/learn/reading/+page.svelte`: shared setup, active session, and summary owner.
- `src/routes/music/learn/reading/_components/StaffNotation.svelte`: VexFlow renderer only.
- `src/routes/music/learn/reading/_components/PianoInput.svelte`: playable piano projection.
- `src/routes/music/learn/reading/_components/FretboardInput.svelte`: playable guitar/ukulele
  projection.
- `src/routes/music/learn/reading/_components/TuningEditor.svelte`: custom tuning dialog.
- `src/routes/music/learn/reading/_components/ReadingSetup.svelte`: flashcard/sight-reading setup.
- `src/routes/music/learn/reading/_components/FlashcardSession.svelte`: flashcard workspace.
- `src/routes/music/learn/reading/_components/SightReadingSession.svelte`: score-follower workspace.
- `src/routes/music/learn/reading/_components/ReadingSummary.svelte`: result summary.

## Checkpoint 1: Foundations

### Task 1: Extend Canonical Score Notation Metadata

**Files:**
- Modify: `packages/music-core/src/domain/score.ts`
- Modify: `packages/music-core/src/domain/domain.test.ts`
- Modify: `packages/music-core/src/engines/skills/index.ts`
- Modify: `packages/music-core/src/engines/skills/skills.test.ts`

- [ ] **Step 1: Write failing domain and reading-skill tests**

Add tests requiring written spelling metadata and the reading skill hierarchy:

```ts
const written: WrittenPitch = { step: "F", accidental: "#", octave: 4 };
expect(written).toEqual({ step: "F", accidental: "#", octave: 4 });
expect(seedCoreSkills().skills.map(({ id }) => id)).toEqual(
  expect.arrayContaining([
    "reading.treble.stepwise",
    "reading.bass.stepwise",
    "reading.polyphonic",
    "reading.rhythm.compound",
  ]),
);
```

- [ ] **Step 2: Run focused tests and verify red**

Run:

```bash
vp test packages/music-core/src/domain/domain.test.ts packages/music-core/src/engines/skills/skills.test.ts --run
```

Expected: FAIL because `WrittenPitch` and the expanded reading skills do not exist.

- [ ] **Step 3: Add backward-compatible notation metadata**

Add these contracts to `score.ts`:

```ts
export type WrittenStep = "A" | "B" | "C" | "D" | "E" | "F" | "G";
export type WrittenAccidental = "bb" | "b" | "natural" | "#" | "##";

export interface WrittenPitch {
  step: WrittenStep;
  accidental?: WrittenAccidental;
  octave: number;
}

export interface TupletMark {
  id: string;
  actual: number;
  normal: number;
}

export interface TieMark {
  id: string;
  start?: boolean;
  stop?: boolean;
}

export interface ScoreRest {
  startBeat: number;
  durationBeats: number;
  voiceId: string;
  tuplet?: TupletMark;
}
```

Extend `ScoreNote` with optional `writtenPitch`, `tie`, and `tuplet`, and extend `Score` with
optional `rests`. Keep every new score property optional so existing scores and persisted data stay
valid.

Add reading child skills and component/prerequisite links:

```ts
skill("reading.treble.stepwise", "Treble Stepwise Reading", Capability.Reading, "beginner", ["staff"]),
skill("reading.bass.stepwise", "Bass Stepwise Reading", Capability.Reading, "beginner", ["staff"]),
skill("reading.polyphonic", "Polyphonic Reading", Capability.Reading, "intermediate", ["staff", "chord"]),
skill("reading.rhythm.compound", "Compound-Meter Reading", Capability.Reading, "intermediate", ["rhythm"]),
```

- [ ] **Step 4: Run focused tests and verify green**

Run the command from Step 2. Expected: PASS.

- [ ] **Step 5: Commit the domain foundation**

```bash
git add packages/music-core/src/domain/score.ts packages/music-core/src/domain/domain.test.ts packages/music-core/src/engines/skills/index.ts packages/music-core/src/engines/skills/skills.test.ts
git commit -m "feat(T1.7): extend score notation domain"
```

### Task 2: Build Written Pitch And Notation View Models

**Files:**
- Create: `packages/music-core/src/engines/notation/index.ts`
- Create: `packages/music-core/src/engines/notation/notation.test.ts`
- Modify: `packages/music-core/package.json`

- [ ] **Step 1: Write failing spelling and notation-view tests**

Cover all key signatures, enharmonic comparison, staff assignment, voices, rests, ties, tuplets,
and measure grouping:

```ts
expect(spellMidiForKey(66, "Gb major")).toEqual({ step: "G", accidental: "b", octave: 4 });
expect(spellMidiForKey(66, "F# major")).toEqual({ step: "F", accidental: "#", octave: 4 });
expect(enharmonicEqual("F#", "Gb")).toBe(true);

const view = notationView(scoreWithGrandStaffTuplet);
expect(view.staves.map(({ clef }) => clef)).toEqual(["treble", "bass"]);
expect(view.measures[0]?.tuplets[0]).toMatchObject({ actual: 3, normal: 2 });
expect(view.measures[0]?.ties).toHaveLength(1);
```

- [ ] **Step 2: Run notation tests and verify red**

Run:

```bash
vp test packages/music-core/src/engines/notation/notation.test.ts --run
```

Expected: FAIL because the notation engine does not exist.

- [ ] **Step 3: Implement the VexFlow-neutral notation engine**

Export focused contracts and pure functions:

```ts
export type Clef = "treble" | "bass";
export type NotationDuration = "w" | "h" | "q" | "8" | "16";

export interface NotationEvent {
  id: string;
  kind: "note" | "rest";
  voiceId: string;
  staff: Clef;
  startBeat: number;
  durationBeats: number;
  duration: NotationDuration;
  dots: number;
  pitches: WrittenPitch[];
  tie?: TieMark;
  tuplet?: TupletMark;
}

export interface NotationView {
  keySignature: string;
  timeSignature: { numerator: number; denominator: number };
  measures: NotationMeasure[];
  staves: { id: string; clef: Clef; voiceIds: string[] }[];
}

export function spellMidiForKey(midi: number, keySignature: string): WrittenPitch;
export function writtenPitchName(pitch: WrittenPitch, includeOctave?: boolean): string;
export function enharmonicEqual(left: string, right: string): boolean;
export function notationView(score: Score): NotationView;
```

Use Tonal for pitch/key spelling where it is reliable, but normalize output into the explicit
domain contracts. Reject durations that cannot be expressed as supported base value plus dots or
an explicit tuplet.

- [ ] **Step 4: Export and verify notation**

Add:

```json
"./engines/notation": "./src/engines/notation/index.ts"
```

Run the command from Step 2. Expected: PASS.

- [ ] **Step 5: Commit notation foundation**

```bash
git add packages/music-core/src/engines/notation packages/music-core/package.json
git commit -m "feat(T1.7): add notation view engine"
```

### Task 3: Build Tuning Profiles And Persistence

**Files:**
- Create: `packages/music-core/src/engines/tunings/index.ts`
- Create: `packages/music-core/src/engines/tunings/tunings.test.ts`
- Create: `packages/music-core/src/engines/tunings/tuning-store.ts`
- Create: `packages/music-core/src/engines/tunings/tuning-store.test.ts`
- Modify: `packages/music-core/package.json`

- [ ] **Step 1: Write failing profile and validation tests**

```ts
expect(curatedTunings("guitar").map(({ id }) => id)).toEqual([
  "guitar.standard",
  "guitar.drop-d",
  "guitar.dadgad",
  "guitar.open-g",
]);
expect(curatedTunings("ukulele").map(({ id }) => id)).toEqual([
  "ukulele.high-g",
  "ukulele.low-g",
  "ukulele.baritone",
]);
expect(validateTuning(customGuitar).valid).toBe(true);
expect(validateTuning({ ...customGuitar, openStrings: [40, 45] }).errors.openStrings).toBeDefined();
```

- [ ] **Step 2: Write failing persistence tests**

Use a fake `PracticeStore.settings` repository and assert:

```ts
await store.save(customGuitar);
expect(await store.list("guitar")).toContainEqual(customGuitar);
await store.delete(customGuitar.id);
expect(await store.list("guitar")).not.toContainEqual(customGuitar);
await expect(store.delete("guitar.standard")).rejects.toThrow("Curated tunings cannot be deleted");
```

- [ ] **Step 3: Run tuning tests and verify red**

Run:

```bash
vp test packages/music-core/src/engines/tunings/tunings.test.ts packages/music-core/src/engines/tunings/tuning-store.test.ts --run
```

Expected: FAIL because the tuning modules do not exist.

- [ ] **Step 4: Implement profiles, validation, and persistence**

Export:

```ts
export type StringInstrumentId = "guitar" | "ukulele";

export interface TuningProfile {
  id: string;
  name: string;
  instrument: StringInstrumentId;
  /** Conventional string-number order: string 1 first. */
  openStrings: number[];
  fretCount: number;
  notationTransposition: number;
  source: "curated" | "custom";
}

export function curatedTunings(instrument: StringInstrumentId): TuningProfile[];
export function validateTuning(profile: TuningProfile): {
  valid: boolean;
  errors: Partial<Record<"id" | "name" | "openStrings" | "fretCount", string>>;
};
```

Use standard MIDI tunings:

```ts
["guitar.standard", [64, 59, 55, 50, 45, 40], -12]
["guitar.drop-d", [64, 59, 55, 50, 45, 38], -12]
["guitar.dadgad", [62, 57, 55, 50, 45, 38], -12]
["guitar.open-g", [62, 59, 55, 50, 43, 38], -12]
["ukulele.high-g", [69, 64, 60, 67], 0]
["ukulele.low-g", [69, 64, 60, 55], 0]
["ukulele.baritone", [64, 59, 55, 50], 0]
```

Persist custom profiles under `settings.id === "music.custom-tunings"` using a
`CustomTuningStore`.

- [ ] **Step 5: Export and verify tunings**

Add:

```json
"./engines/tunings": "./src/engines/tunings/index.ts",
"./engines/tunings/store": "./src/engines/tunings/tuning-store.ts"
```

Run the command from Step 3. Expected: PASS.

- [ ] **Step 6: Commit tuning foundation**

```bash
git add packages/music-core/src/engines/tunings packages/music-core/package.json
git commit -m "feat(T1.7): add tuning profiles"
```

### Task 4: Build Piano And Fretboard Projection

**Files:**
- Create: `packages/music-core/src/engines/projection/index.ts`
- Create: `packages/music-core/src/engines/projection/projection.test.ts`
- Modify: `packages/music-core/package.json`

- [ ] **Step 1: Write failing projection tests**

```ts
expect(projectPiano([48, 60, 72])).toEqual([
  { midiNote: 48, hand: "left" },
  { midiNote: 60, hand: "right" },
  { midiNote: 72, hand: "right" },
]);
expect(projectFretboard([64], guitarStandard)).toEqual(
  expect.arrayContaining([{ midiNote: 64, string: 1, fret: 0 }]),
);
expect(projectFretboard([67], ukuleleHighG)).toEqual(
  expect.arrayContaining([{ midiNote: 67, string: 4, fret: 0 }]),
);
expect(projectPlayableGroup([60, 64, 67], guitarStandard)?.positions).toHaveLength(3);
expect(projectPlayableGroup([40, 41, 42], ukuleleHighG)).toBeUndefined();
```

- [ ] **Step 2: Run projection test and verify red**

Run:

```bash
vp test packages/music-core/src/engines/projection/projection.test.ts --run
```

Expected: FAIL because the projection engine does not exist.

- [ ] **Step 3: Implement projection and playability**

Export:

```ts
export interface PianoLocation {
  midiNote: number;
  hand: "left" | "right";
}

export interface FretboardLocation {
  midiNote: number;
  string: number;
  fret: number;
}

export interface PlayableFretboardGroup {
  positions: FretboardLocation[];
  span: number;
}

export function projectPiano(midiNotes: number[]): PianoLocation[];
export function projectFretboard(midiNotes: number[], tuning: TuningProfile): FretboardLocation[];
export function projectPlayableGroup(
  midiNotes: number[],
  tuning: TuningProfile,
  maxSpan?: number,
): PlayableFretboardGroup | undefined;
```

For grouped string-instrument notes, require one distinct string per pitch, reject duplicate
positions, and select the lowest-fret solution within `maxSpan` (default `5`).

- [ ] **Step 4: Export and verify projection**

Add:

```json
"./engines/projection": "./src/engines/projection/index.ts"
```

Run the command from Step 2. Expected: PASS.

- [ ] **Step 5: Run Checkpoint 1 verification**

Run:

```bash
vp test packages/music-core/src/domain/domain.test.ts packages/music-core/src/engines/notation/notation.test.ts packages/music-core/src/engines/tunings/tunings.test.ts packages/music-core/src/engines/tunings/tuning-store.test.ts packages/music-core/src/engines/projection/projection.test.ts --run
vp run -r check
```

Expected: all focused tests pass and all packages type-check.

- [ ] **Step 6: Commit projection foundation**

```bash
git add packages/music-core/src/engines/projection packages/music-core/package.json
git commit -m "feat(T1.7): add instrument projection"
```

## Checkpoint 2: Flashcards

### Task 5: Replace The Note-Reading Flashcard Exercise

**Files:**
- Replace: `packages/music-core/src/exercises/note-reading.ts`
- Replace: `packages/music-core/src/exercises/note-reading.test.ts`

- [ ] **Step 1: Write failing deterministic generation tests**

Use `createNoteReadingExercise({ random })` and explicit options encoded in `ExerciseContext` target
skill ids plus the factory configuration:

```ts
const exercise = createNoteReadingExercise({
  random: () => 0,
  options: {
    instrument: "piano",
    clefs: ["treble"],
    keys: ["F# major"],
    range: { lowestMidi: 60, highestMidi: 72 },
    promptKind: "single-note",
  },
});
const prompt = exercise.generate(ctx);
expect(prompt.payload.writtenPitches[0]).toMatchObject({ accidental: "#" });
expect(prompt.payload.midiNotes[0]).toBeGreaterThanOrEqual(60);
```

- [ ] **Step 2: Write failing grading tests**

Require:

```ts
expect(gradeChoice(promptForFs, "Gb").correct).toBe(true);
expect(gradePlayed(promptForFs4, [66]).correct).toBe(true);
expect(gradePlayed(promptForFs4, [54]).correct).toBe(false);
expect(chordRun.getLiveState().progress).toBeLessThan(1);
```

Also assert result metrics preserve the intended spelling and actual answer.

- [ ] **Step 3: Run note-reading tests and verify red**

Run:

```bash
vp test packages/music-core/src/exercises/note-reading.test.ts --run
```

Expected: FAIL because the fixed C4 exercise does not support generation options or chord groups.

- [ ] **Step 4: Implement generated flashcards**

Export:

```ts
export type ReadingPromptKind = "single-note" | "chord";
export type ReadingAnswerMode = "choice" | "play";

export interface NoteReadingOptions {
  instrument: "piano" | "guitar" | "ukulele";
  tuning?: TuningProfile;
  clefs: Clef[];
  keys: string[];
  range: { lowestMidi: number; highestMidi: number };
  promptKind: ReadingPromptKind;
}

export interface NoteReadingPrompt {
  instrument: NoteReadingOptions["instrument"];
  clef: Clef;
  keySignature: string;
  midiNotes: number[];
  writtenPitches: WrittenPitch[];
  choices: string[];
  score: Score;
}

export function createNoteReadingExercise(deps: {
  random?: () => number;
  options: NoteReadingOptions;
}): ExerciseDefinition<NoteReadingPrompt, string | number[]>;
```

Choice events use stable answer tokens. Choice grading compares pitch class enharmonically.
Play grading compares exact sounding MIDI note groups. The run reaches progress `1` only after one
choice or the complete expected note group.

- [ ] **Step 5: Run note-reading tests and verify green**

Run the command from Step 3. Expected: PASS.

- [ ] **Step 6: Commit flashcard exercise**

```bash
git add packages/music-core/src/exercises/note-reading.ts packages/music-core/src/exercises/note-reading.test.ts
git commit -m "feat(T1.7): add generated reading flashcards"
```

### Task 6: Build The Reading Session Coordinator

**Files:**
- Create: `packages/music-core/src/engines/reading-session/index.ts`
- Create: `packages/music-core/src/engines/reading-session/reading-session.test.ts`
- Modify: `packages/music-core/src/engines/exercise/index.ts`
- Modify: `packages/music-core/src/engines/exercise/exercise.test.ts`
- Modify: `packages/music-core/src/engines/skills/index.ts`
- Modify: `packages/music-core/src/engines/skills/skills.test.ts`
- Modify: `packages/music-core/package.json`

- [ ] **Step 1: Write failing flashcard session tests**

Construct the coordinator with fake pipeline services and assert:

```ts
expect(session.state.status).toBe("ready");
await session.startFlashcards({ ...options, length: 10, answerMode: "choice" });
expect(session.state.currentPrompt).toBeDefined();
await session.answerChoice("Gb");
expect(session.state.results).toHaveLength(1);
expect(services.skills.ingest).toHaveBeenCalledOnce();
expect(services.analytics.ingest).toHaveBeenCalledOnce();
expect(services.progress.ingest).toHaveBeenCalledOnce();
```

Feed analytics with a weak or overdue reading skill and assert the session queue uses
`ExerciseScheduler` to target that skill before a new/easier reading skill.

Assert a rejected persistence call preserves the current prompt, exposes a retryable error, reuses
the same scoring-event id on retry, and mutates mastery only once.

- [ ] **Step 2: Run session tests and verify red**

Run:

```bash
vp test packages/music-core/src/engines/reading-session/reading-session.test.ts --run
```

Expected: FAIL because the coordinator does not exist.

- [ ] **Step 3: Implement flashcard coordination**

Export state that the Svelte route can render without knowing exercise internals:

```ts
export interface ReadingSessionState {
  status: "ready" | "flashcard" | "sight-reading" | "summary" | "abandoned";
  currentPrompt?: NoteReadingPrompt;
  currentIndex: number;
  total: number;
  live?: ExerciseLiveState;
  results: ReadingResultView[];
  summary?: ReadingSummary;
  error?: string;
}

export class ReadingSession {
  startFlashcards(options: FlashcardSessionOptions): Promise<void>;
  answerChoice(token: string): Promise<void>;
  retrySave(): Promise<void>;
  abandon(): void;
  dispose(): void;
}
```

Use `ExerciseRunHost` so completed flashcards flow through the existing pipeline. Keep the active
prompt and finished outcome in memory until all persistence calls succeed. Build each flashcard
queue through the existing `ExerciseScheduler`, constrained to the active reading exercise and
setup filters, so weak/overdue reading skills receive spaced repetition.

- [ ] **Step 4: Make pipeline retries idempotent**

Add an exercise-engine test where analytics persistence fails once, then succeeds:

```ts
const first = host.finish();
await expect(first).rejects.toThrow("offline");
const outcome = await host.finish();
expect(makeId).toHaveBeenCalledOnce();
expect(outcome.event.id).toBe("stable-event");
expect(skills.getMastery("reading.treble.landmarks").observations).toBe(1);
```

Change `ExerciseRunHost.finish()` to grade and create the `ScoringEvent` once, cache that prepared
outcome while persistence is incomplete, and retry the same event. Clear the active run only after
skills, analytics, and progress all succeed.

Make `SkillGraphStore.ingest()` idempotent by retaining processed scoring-event ids in memory and in
a `PracticeStore.settings` record. Analytics and Progress already deduplicate by event id. Add a
skill-engine test proving two ingests of the same event produce one observation.

- [ ] **Step 5: Export and verify the coordinator**

Add:

```json
"./engines/reading-session": "./src/engines/reading-session/index.ts"
```

Run the command from Step 2. Expected: PASS.

- [ ] **Step 6: Commit the reading coordinator**

```bash
git add packages/music-core/src/engines/reading-session packages/music-core/src/engines/exercise packages/music-core/src/engines/skills packages/music-core/package.json
git commit -m "feat(T1.7): add reading session coordinator"
```

### Task 7: Build Shared Reading Renderers And Inputs

**Files:**
- Create: `src/routes/music/learn/reading/_components/StaffNotation.svelte`
- Create: `src/routes/music/learn/reading/_components/StaffNotation.svelte.test.ts`
- Create: `src/routes/music/learn/reading/_components/PianoInput.svelte`
- Create: `src/routes/music/learn/reading/_components/PianoInput.svelte.test.ts`
- Create: `src/routes/music/learn/reading/_components/FretboardInput.svelte`
- Create: `src/routes/music/learn/reading/_components/FretboardInput.svelte.test.ts`
- Create: `src/routes/music/learn/reading/_components/TuningEditor.svelte`
- Create: `src/routes/music/learn/reading/_components/TuningEditor.svelte.test.ts`
- Modify: `package.json`

- [ ] **Step 1: Add VexFlow to the web app dependency metadata**

Add:

```json
"vexflow": "catalog:"
```

to root `dependencies`. Do not install a different version; use the existing catalog entry.

- [ ] **Step 2: Update the workspace lockfile**

Run:

```bash
pnpm install --lockfile-only
```

Expected: `pnpm-lock.yaml` records `vexflow` in the root importer without changing its catalog
version.

- [ ] **Step 3: Write failing component tests**

Require representative rendering and input behavior:

```ts
render(StaffNotation, { view: grandStaffView, activeEventIds: ["right-1"] });
await vi.waitFor(() => expect(document.querySelector("svg")).not.toBeNull());

render(PianoInput, { midiNotes: [60, 64, 67], activeMidiNotes: [64], router });
expect(document.querySelector('[aria-label="E4, active"]')).not.toBeNull();

render(FretboardInput, { tuning: guitarStandard, targetMidiNotes: [64], router });
let accepted: NoteEvent | undefined;
router.subscribe((event) => {
  accepted = event;
});
document.querySelector<HTMLButtonElement>('[aria-label="String 1 fret 0, E4"]')?.click();
expect(accepted?.midiNote).toBe(64);
```

For `TuningEditor`, assert invalid profiles cannot save, a valid custom profile calls `onSave`, and
only custom profiles expose a working delete action.

- [ ] **Step 4: Run component tests and verify red**

Run:

```bash
vp test src/routes/music/learn/reading/_components --run
```

Expected: FAIL because the reading components do not exist.

- [ ] **Step 5: Implement `StaffNotation.svelte`**

Render from `NotationView` only. On mount and whenever the view changes:

```ts
const factory = new Factory({ renderer: { elementId: host.id, width, height } });
```

Create VexFlow staves, voices, stave notes/rests, beams, tuplets, and ties from the neutral view
model. Destroy and redraw the SVG on update. Apply active/error classes after rendering by stable
event id. Catch rendering errors and call `onError(message)`.

- [ ] **Step 6: Implement playable piano and fretboard inputs**

Both components emit normalized on-screen `NoteEvent`s through `InputRouter`. The fretboard uses
`projectFretboard` and renders only the configured fret count. Both expose target, active, correct,
and wrong visual states through semantic classes and accessible labels.

- [ ] **Step 7: Implement the tuning editor**

Use `@repo/ui/dialog`, `@repo/ui/input`, `@repo/ui/label`, and `@repo/ui/button`. Edit string notes
as note names, convert them to MIDI with the theory engine, validate with `validateTuning`, show
field-level errors, preview open strings, and only call `onSave` for valid custom profiles.
Expose deletion only when editing a custom profile and call `onDelete(profile.id)` after
confirmation.

- [ ] **Step 8: Run component tests and verify green**

Run the command from Step 3. Expected: PASS.

- [ ] **Step 9: Commit shared renderers**

```bash
git add package.json pnpm-lock.yaml src/routes/music/learn/reading/_components/StaffNotation.svelte src/routes/music/learn/reading/_components/StaffNotation.svelte.test.ts src/routes/music/learn/reading/_components/PianoInput.svelte src/routes/music/learn/reading/_components/PianoInput.svelte.test.ts src/routes/music/learn/reading/_components/FretboardInput.svelte src/routes/music/learn/reading/_components/FretboardInput.svelte.test.ts src/routes/music/learn/reading/_components/TuningEditor.svelte src/routes/music/learn/reading/_components/TuningEditor.svelte.test.ts
git commit -m "feat(T1.7): add reading notation and instrument inputs"
```

### Task 8: Build The Flashcard Route Experience

**Files:**
- Create: `src/routes/music/learn/reading/+page.svelte`
- Create: `src/routes/music/learn/reading/_components/ReadingSetup.svelte`
- Create: `src/routes/music/learn/reading/_components/FlashcardSession.svelte`
- Create: `src/routes/music/learn/reading/_components/ReadingSummary.svelte`
- Create: `src/routes/music/learn/reading/page.svelte.test.ts`
- Modify: `src/routes/music/learn/+page.svelte`
- Modify: `src/routes/music/learn/page.svelte.test.ts`

- [ ] **Step 1: Write failing route tests**

Assert the Learn hub links to Reading and that the reading route:

```ts
expect(document.body.textContent).toContain("Note Reading");
expect(document.body.textContent).toContain("Flashcards");
expect(document.body.textContent).toContain("Sight-Reading");
```

Start piano choice flashcards, answer one prompt, and assert progress and XP update. Switch to
guitar, select a tuning, start play mode, click a fret, and assert the prompt completes. Save a
custom tuning and assert it remains selectable after remount; delete it and assert it disappears.

- [ ] **Step 2: Run route tests and verify red**

Run:

```bash
vp test src/routes/music/learn/page.svelte.test.ts src/routes/music/learn/reading/page.svelte.test.ts --run
```

Expected: FAIL because the Reading destination and route do not exist.

- [ ] **Step 3: Implement setup, active flashcard, and summary states**

`ReadingSetup.svelte` uses compact tabs and controls:

```ts
export interface ReadingSetupValue {
  activity: "flashcards" | "sight-reading";
  instrument: "piano" | "guitar" | "ukulele";
  tuningId?: string;
  clefs: Clef[];
  keySignature: string;
  range: { lowestMidi: number; highestMidi: number };
  difficulty: number;
  promptKind: ReadingPromptKind;
  answerMode: ReadingAnswerMode;
}
```

`FlashcardSession.svelte` places notation first and instrument projection beside/below it. Choice
answers use buttons; play answers use `PianoInput` or `FretboardInput`. Feedback highlights every
valid target location.

`+page.svelte` owns `PracticeStore`, `CustomTuningStore`, skill/analytics/progress services, and one
`ReadingSession`. It renders setup, active session, and summary states.

- [ ] **Step 4: Add the Learn hub destination**

Add a third Learn card linking to `/music/learn/reading` with a music-reading icon and description.

- [ ] **Step 5: Run route tests and Checkpoint 2 verification**

Run:

```bash
vp test packages/music-core/src/exercises/note-reading.test.ts packages/music-core/src/engines/reading-session/reading-session.test.ts src/routes/music/learn/reading/_components src/routes/music/learn/page.svelte.test.ts src/routes/music/learn/reading/page.svelte.test.ts --run
vp run -r check
vp run -r build
```

Expected: focused tests, type-check, and build pass.

- [ ] **Step 6: Commit working flashcards**

```bash
git add src/routes/music/learn/+page.svelte src/routes/music/learn/page.svelte.test.ts src/routes/music/learn/reading
git commit -m "feat(T1.7): add note reading flashcard route"
```

## Checkpoint 3: Sight-Reading

### Task 9: Build Wait-Mode Score Following

**Files:**
- Create: `packages/music-core/src/engines/score-follower/index.ts`
- Create: `packages/music-core/src/engines/score-follower/score-follower.test.ts`
- Modify: `packages/music-core/package.json`

- [ ] **Step 1: Write failing expected-group and wait-mode tests**

```ts
const groups = expectedGroups(polyphonicScore);
expect(groups[0]?.midiNotes).toEqual([48, 60, 64]);

const run = createScoreFollower(groups, { mode: "wait", bpm: 90, strictness: "normal" });
run.accept(noteOn(48));
run.accept(noteOn(60));
expect(run.getLiveState().progress).toBe(0);
run.accept(noteOn(64));
expect(run.getLiveState().progress).toBe(1 / groups.length);
```

Assert wrong notes appear in feedback and do not advance. Assert expected notes played
sequentially without being held together do not advance.

- [ ] **Step 2: Run score-follower test and verify red**

Run:

```bash
vp test packages/music-core/src/engines/score-follower/score-follower.test.ts --run
```

Expected: FAIL because the score follower does not exist.

- [ ] **Step 3: Implement expected groups and wait mode**

Export:

```ts
export type ScoreFollowerMode = "wait" | "performance";
export type TimingStrictness = "relaxed" | "normal" | "strict";

export interface ExpectedNoteGroup {
  id: string;
  startBeat: number;
  durationBeats: number;
  midiNotes: number[];
  sourceNoteIndexes: number[];
}

export interface ScoreFollowerLiveState extends ExerciseLiveState {
  currentGroupIndex: number;
  expectedMidiNotes: number[];
  heldMidiNotes: number[];
  wrongMidiNotes: number[];
  timingErrorMs?: number;
}

export function expectedGroups(score: Score): ExpectedNoteGroup[];
export function createScoreFollower(
  groups: ExpectedNoteGroup[],
  options: ScoreFollowerOptions,
): ExerciseRun<ScoreFollowerAnswer>;
```

Track held notes from note-on/note-off events. In wait mode, only advance when every expected pitch
is simultaneously held. Record wrong and extra notes for final metrics.

- [ ] **Step 4: Export and verify wait mode**

Add:

```json
"./engines/score-follower": "./src/engines/score-follower/index.ts"
```

Run the command from Step 2. Expected: PASS.

- [ ] **Step 5: Commit wait-mode score following**

```bash
git add packages/music-core/src/engines/score-follower packages/music-core/package.json
git commit -m "feat(T1.7): add wait mode score follower"
```

### Task 10: Add Performance-Mode Timing Scoring

**Files:**
- Modify: `packages/music-core/src/engines/score-follower/index.ts`
- Modify: `packages/music-core/src/engines/score-follower/score-follower.test.ts`

- [ ] **Step 1: Write failing adaptive timing tests**

```ts
expect(timingWindowMs({ bpm: 60, durationBeats: 1, strictness: "normal" })).toBeGreaterThan(
  timingWindowMs({ bpm: 120, durationBeats: 1, strictness: "normal" }),
);
expect(timingWindowMs({ bpm: 120, durationBeats: 1, strictness: "relaxed" })).toBeGreaterThan(
  timingWindowMs({ bpm: 120, durationBeats: 1, strictness: "strict" }),
);
```

Feed a perfect timestamped phrase and require score `1`. Feed wrong, missed, extra, early, and late
notes and require lower scores plus timing metrics with signed `errorMs`.

- [ ] **Step 2: Run score-follower test and verify red**

Run the command from Task 9 Step 2. Expected: FAIL on performance-mode assertions.

- [ ] **Step 3: Implement performance matching and scoring**

Use injected `startTimestampMs` and normalized event timestamps. Export:

```ts
export function beatToMs(beat: number, bpm: number): number;
export function timingWindowMs(input: {
  bpm: number;
  durationBeats: number;
  strictness: TimingStrictness;
}): number;
```

Match each note-on to the nearest unmatched expected pitch inside the adaptive window. Final score
is the average of pitch credit and timing credit, with missed/extra-note penalties clamped to
`0..1`. A perfect phrase must produce exact score `1`.

- [ ] **Step 4: Run score-follower tests and verify green**

Run the command from Task 9 Step 2. Expected: PASS.

- [ ] **Step 5: Commit performance scoring**

```bash
git add packages/music-core/src/engines/score-follower
git commit -m "feat(T1.7): add performance score following"
```

### Task 11: Build Instrument-Specific Sight-Reading Generation

**Files:**
- Create: `packages/music-core/src/exercises/sight-reading.ts`
- Create: `packages/music-core/src/exercises/sight-reading.test.ts`
- Modify: `packages/music-core/package.json`

- [ ] **Step 1: Write failing piano generation tests**

Require deterministic grand-staff generation:

```ts
const prompt = createSightReadingExercise({ random: () => 0, options: pianoOptions }).generate(ctx);
expect(prompt.payload.score.voices.map(({ id }) => id)).toEqual(["right-hand", "left-hand"]);
expect(notationView(prompt.payload.score).staves.map(({ clef }) => clef)).toEqual(["treble", "bass"]);
expect(expectedGroups(prompt.payload.score).some(({ midiNotes }) => midiNotes.length > 1)).toBe(true);
```

- [ ] **Step 2: Write failing guitar/ukulele and rhythm tests**

For every generated grouped event, assert `projectPlayableGroup` succeeds under the selected
tuning. Across deterministic random sequences, require examples of:

```ts
expect(score.timeSignatures[0]).toEqual(expect.objectContaining({ numerator: 6, denominator: 8 }));
expect(score.rests?.length).toBeGreaterThan(0);
expect(score.notes.some(({ tie }) => tie !== undefined)).toBe(true);
expect(score.notes.some(({ tuplet }) => tuplet?.actual === 3)).toBe(true);
expect(score.notes.some(({ durationBeats }) => durationBeats <= 0.25)).toBe(true);
```

- [ ] **Step 3: Run sight-reading tests and verify red**

Run:

```bash
vp test packages/music-core/src/exercises/sight-reading.test.ts --run
```

Expected: FAIL because the sight-reading exercise does not exist.

- [ ] **Step 4: Implement playable score generation**

Export:

```ts
export interface SightReadingOptions {
  instrument: "piano" | "guitar" | "ukulele";
  tuning?: TuningProfile;
  keySignature: string;
  clefs: Clef[];
  measures: number;
  bpm: number;
  timeSignature: { numerator: number; denominator: number };
  mode: ScoreFollowerMode;
  strictness: TimingStrictness;
  difficulty: number;
}

export interface SightReadingPrompt {
  score: Score;
  notation: NotationView;
  groups: ExpectedNoteGroup[];
  options: SightReadingOptions;
}
```

Use difficulty bands:

- `0.0..0.3`: quarters/halves, stepwise motion, basic dyads
- `0.3..0.6`: eighths, rests, dotted values, larger leaps, triads
- `0.6..0.8`: sixteenths, ties, compound meters, independent piano voices
- `0.8..1.0`: triplets, denser polyphony, wider range, more accidentals

Generate by scale degrees in the selected key, spell each note with the notation engine, and retry
string-instrument groups until projection succeeds. Cap retries and throw a descriptive generation
error rather than returning an unplayable phrase.

- [ ] **Step 5: Create the score-follower exercise run**

The exercise definition delegates streaming grading to `createScoreFollower`. It supports MIDI and
on-screen input, targets treble/bass/polyphonic/compound reading skills according to the generated
score, and returns standard pitch/timing metrics.

- [ ] **Step 6: Export and verify sight-reading**

Add:

```json
"./exercises/sight-reading": "./src/exercises/sight-reading.ts"
```

Run the command from Step 3. Expected: PASS.

- [ ] **Step 7: Commit sight-reading generation**

```bash
git add packages/music-core/src/exercises/sight-reading.ts packages/music-core/src/exercises/sight-reading.test.ts packages/music-core/package.json
git commit -m "feat(T1.7): add generated sight reading"
```

### Task 12: Add Sight-Reading Session Coordination And Count-In

**Files:**
- Modify: `packages/music-core/src/engines/reading-session/index.ts`
- Modify: `packages/music-core/src/engines/reading-session/reading-session.test.ts`
- Modify: `packages/music-core/src/engines/sound/index.ts`
- Modify: `packages/music-core/src/engines/sound/sound.test.ts`

- [ ] **Step 1: Write failing sight-reading session tests**

Require:

```ts
await session.prepareSightReading(options);
expect(session.state.status).toBe("sight-reading");
expect(session.state.countIn).toBe("ready");
await session.startSightReading(startTimestampMs);
expect(session.state.countIn).toBe("playing");
expect(session.state.live?.expectedMidiNotes).toEqual(expect.any(Array));
```

Feed a perfect phrase, finish it, and assert pipeline services receive one completed sight-reading
event. Assert persistence failure preserves the completed result for retry.

- [ ] **Step 2: Write failing count-in sound test**

Add a `playCountIn` test asserting accented/unaccented metronome clicks are scheduled from Tone's
current time and that the returned delay reaches the first phrase beat after the final count-in
beat.

- [ ] **Step 3: Run focused tests and verify red**

Run:

```bash
vp test packages/music-core/src/engines/reading-session/reading-session.test.ts packages/music-core/src/engines/sound/sound.test.ts --run
```

Expected: FAIL because sight-reading coordination and scheduled count-in do not exist.

- [ ] **Step 4: Implement scheduled count-in**

Add:

```ts
export interface CountInSchedule {
  startAudioSeconds: number;
  delayMs: number;
}

playCountIn(input: {
  bpm: number;
  beats: number;
  beatsPerMeasure: number;
}): CountInSchedule
```

Schedule metronome clicks with Tone time and return both the absolute audio start time and the delay
until the phrase begins. The route converts that delay into the normalized input clock with
`monotonicMs(performance.now() + delayMs)`. Do not compare Tone audio-clock timestamps directly to
input-router performance-clock timestamps, and do not use `setTimeout` for audio scheduling.

- [ ] **Step 5: Extend `ReadingSession` for sight-reading**

Add:

```ts
prepareSightReading(options: SightReadingOptions): Promise<void>;
startSightReading(startTimestampMs: number): Promise<void>;
finishSightReading(): Promise<void>;
```

The coordinator starts one streaming `ExerciseRunHost`, exposes score-follower live state, and
persists only after finish. The route controls animation/polling; the engine remains timer-free.
At this step, extend `ReadingSessionState.currentPrompt` to
`NoteReadingPrompt | SightReadingPrompt` and `live` to
`ExerciseLiveState | ScoreFollowerLiveState`.

- [ ] **Step 6: Run focused tests and verify green**

Run the command from Step 3. Expected: PASS.

- [ ] **Step 7: Commit sight-reading coordination**

```bash
git add packages/music-core/src/engines/reading-session packages/music-core/src/engines/sound
git commit -m "feat(T1.7): coordinate sight reading sessions"
```

### Task 13: Build The Sight-Reading Route Experience

**Files:**
- Create: `src/routes/music/learn/reading/_components/SightReadingSession.svelte`
- Modify: `src/routes/music/learn/reading/_components/ReadingSetup.svelte`
- Modify: `src/routes/music/learn/reading/_components/ReadingSummary.svelte`
- Modify: `src/routes/music/learn/reading/+page.svelte`
- Modify: `src/routes/music/learn/reading/page.svelte.test.ts`

- [ ] **Step 1: Write failing sight-reading route tests**

Start piano wait mode and assert grand staff, current group, and no timing control. Start guitar
performance mode and assert tuning, tempo, strictness, count-in, live accuracy, and early/late
feedback. Feed perfect normalized events and assert a `100%` summary.

- [ ] **Step 2: Run route test and verify red**

Run:

```bash
vp test src/routes/music/learn/reading/page.svelte.test.ts --run
```

Expected: FAIL because the route only supports flashcards.

- [ ] **Step 3: Extend setup controls**

When activity is sight-reading, show:

- wait/performance segmented control
- BPM control from `40..200`
- Relaxed/Normal/Strict timing preset
- simple/compound meter choices
- measure count

Keep instrument, tuning, key, range, and difficulty shared with flashcards.

- [ ] **Step 4: Implement the sight-reading workspace**

`SightReadingSession.svelte` renders:

- notation with active/error event highlighting
- count-in and start control
- playhead/progress
- current expected note group
- piano or fretboard on-screen input
- live pitch accuracy
- live early/late timing feedback in performance mode
- end-session action

Use `requestAnimationFrame` only to refresh the visual playhead/live state. Audio and scoring timing
come from the sound engine and normalized event timestamps.

- [ ] **Step 5: Extend summaries**

Show pitch accuracy, timing accuracy, signed early/late tendency, problem measures, XP, and repeat
actions. Omit timing cards for wait mode.

- [ ] **Step 6: Run route test and verify green**

Run the command from Step 2. Expected: PASS.

- [ ] **Step 7: Commit sight-reading UI**

```bash
git add src/routes/music/learn/reading
git commit -m "feat(T1.7): add sight reading workspace"
```

### Task 14: Add Storybook And End-To-End Coverage

**Files:**
- Create: `src/routes/music/learn/reading/_components/StaffNotation.stories.svelte`
- Create: `src/routes/music/learn/reading/_components/FretboardInput.stories.svelte`
- Create: `src/routes/music/learn/reading/_components/ReadingSetup.stories.svelte`
- Create: `tests/music-reading.spec.ts`

- [ ] **Step 1: Add deterministic stories**

Create stories for:

- single treble flashcard
- piano grand staff with active polyphonic group
- guitar and ukulele fretboard targets
- custom tuning editor validation
- reading setup on desktop and narrow widths

Stories must use deterministic view models and mock callbacks, with no IndexedDB or MIDI
requirements.

- [ ] **Step 2: Write Playwright reading flows**

Cover:

```ts
test("completes a piano choice flashcard", async ({ page }) => {});
test("plays a guitar flashcard on the fretboard", async ({ page }) => {});
test("saves and selects a custom ukulele tuning", async ({ page }) => {});
test("completes wait-mode polyphonic sight reading", async ({ page }) => {});
test("completes performance-mode sight reading", async ({ page }) => {});
```

Use on-screen controls and deterministic route behavior; do not require physical MIDI hardware.

- [ ] **Step 3: Run Storybook build and Playwright**

Run:

```bash
vp run build-storybook
./node_modules/.bin/playwright test tests/music-reading.spec.ts
```

Expected: Storybook builds and all reading flows pass.

- [ ] **Step 4: Commit visual and end-to-end coverage**

```bash
git add src/routes/music/learn/reading/_components/*.stories.svelte tests/music-reading.spec.ts
git commit -m "test(T1.7): cover reading workflows"
```

### Task 15: Full Verification And Manual Test Handoff

**Files:**
- Modify only files needed to fix failures discovered by these gates.

- [ ] **Step 1: Run formatting and type checks**

```bash
vp run -r check
```

Expected: all packages pass with no Svelte or TypeScript errors.

- [ ] **Step 2: Run the complete unit and component suite**

```bash
vp test --run
```

Expected: all tests pass.

- [ ] **Step 3: Run production builds**

```bash
vp run -r build
vp run build-storybook
```

Expected: web, packages, and Storybook build successfully. Existing VitePlus experimental and
chunk-size warnings are acceptable; new errors are not.

- [ ] **Step 4: Run the complete Playwright suite**

```bash
./node_modules/.bin/playwright test
```

Expected: all E2E tests pass.

- [ ] **Step 5: Inspect desktop and mobile routes in the in-app browser**

Inspect `/music/learn`, `/music/learn/reading`, an active flashcard, an active wait-mode phrase,
an active performance-mode phrase, and summaries at desktop and mobile widths. Verify no clipping,
overlap, blank VexFlow render, or inaccessible controls.

- [ ] **Step 6: Provide focused manual hardware checks**

Ask the user to verify:

- single-note and chord answer-by-play on the Roland FP-30X
- complete held-chord advancement in wait mode
- performance-mode timing and count-in feel
- guitar/ukulele fretboard position correctness for curated and one custom tuning

- [ ] **Step 7: Commit final T1.7 fixes**

Stage only T1.7 implementation and test files, then:

```bash
git commit -m "feat(T1.7): complete note reading and sight reading"
```
