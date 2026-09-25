# Ear Training Module Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build T1.6 as focused and mixed 10-prompt ear-training sessions at `/music/learn/ear`, with interval, chord-quality, and functional scale-degree exercises feeding the existing mastery, analytics, and progress pipeline.

**Architecture:** Three explicit `ExerciseDefinition`s own prompt generation and grading. A framework-independent `EarTrainingSession` coordinator chooses each exercise and target skill, drives `ExerciseRunHost`, and exposes landing/session/summary state. Svelte routes render the Learn hub and Focus + Session Rail UI, while a scheduled `SoundEngine.playPattern` API plays prompts without timers.

**Tech Stack:** TypeScript, Svelte 5 runes, SvelteKit, VitePlus/Vitest browser tests, Tonal, Tone.js, Dexie, Playwright, Tailwind CSS 4, `@repo/ui`

---

## File Structure

- `packages/music-core/src/exercises/ear-training.ts`: shared ear-training prompt, answer, playback, and grading helpers.
- `packages/music-core/src/exercises/interval-recognition.ts`: interval prompt generation and grading.
- `packages/music-core/src/exercises/chord-quality-recognition.ts`: triad/seventh quality prompt generation and grading.
- `packages/music-core/src/exercises/scale-degree-recognition.ts`: major and minor-context scale-degree prompt generation and grading.
- `packages/music-core/src/engines/ear-training/index.ts`: focused/mixed queue and session coordinator.
- `packages/music-core/src/engines/sound/index.ts`: scheduled multi-step prompt playback.
- `src/routes/music/learn/+page.svelte`: Learn hub.
- `src/routes/music/learn/theory/*`: moved theory-library workflow.
- `src/routes/music/learn/ear/+page.svelte`: ear-training landing, active session, and summary.
- `src/routes/music/learn/ear/_components/*`: focused session workspace, session rail, and summary components.

### Task 1: Ear-Training Skills And Shared Exercise Primitives

**Files:**
- Create: `packages/music-core/src/exercises/ear-training.ts`
- Create: `packages/music-core/src/exercises/ear-training.test.ts`
- Modify: `packages/music-core/src/engines/skills/index.ts`
- Modify: `packages/music-core/src/engines/skills/skills.test.ts`

- [ ] **Step 1: Write failing shared-helper and skill-seed tests**

Test stable choice encoding, played-note extraction, pitch-class normalization, and target-skill selection. Extend the skill seed test to require `pitch.scale-degrees` plus child skills for `1`, `2`, `b3`, `3`, `4`, `5`, `b6`, `6`, `b7`, and `7`.

```ts
expect(choiceAnswerEvent("m6", ["P5", "m6"]).raw?.midiData1).toBe(1);
expect(decodeChoiceAnswer(event, ["P5", "m6"])).toBe("m6");
expect(pitchClasses([60, 64, 67, 72])).toEqual([0, 4, 7]);
expect(seedCoreSkills().skills.map(({ id }) => id)).toContain("pitch.scale-degree.b6");
```

- [ ] **Step 2: Run focused tests and verify red**

Run:

```bash
vp test packages/music-core/src/exercises/ear-training.test.ts packages/music-core/src/engines/skills/skills.test.ts --run
```

Expected: FAIL because the shared helpers and scale-degree skills do not exist.

- [ ] **Step 3: Implement shared primitives and scale-degree skills**

Export these framework-independent contracts and helpers:

```ts
export type EarTrainingDrill = "interval" | "chord-quality" | "scale-degree";
export type EarTrainingAnswerMode = "choice" | "play-back";
export type EarTrainingFeedbackMode = "practice" | "test";
export interface PromptPlaybackStep {
  midiNotes: number[];
  offsetSeconds: number;
  durationSeconds: number;
}
export interface EarTrainingPromptBase {
  drill: EarTrainingDrill;
  targetSkillId: string;
  answerToken: string;
  answerLabel: string;
  choices: { token: string; label: string }[];
  playback: PromptPlaybackStep[];
  requiredPlayedNotes: number;
}
export function choiceAnswerEvent(token: string, choices: string[]): NoteEvent;
export function decodeChoiceAnswer(input: NoteEvent[], choices: string[]): string | undefined;
export function playedMidiNotes(input: NoteEvent[]): number[];
export function pitchClasses(midiNotes: number[]): number[];
export function earTrainingRun<P extends EarTrainingPromptBase>(
  prompt: P,
  grade: (input: NoteEvent[]) => ExerciseResult,
): ExerciseRun;
```

`earTrainingRun` reports live progress as `1` after a click answer or after the required number of
note-on events. Add the scale-degree parent/child skills as component relationships in
`seedCoreSkills()`.

- [ ] **Step 4: Run focused tests and verify green**

Run:

```bash
vp test packages/music-core/src/exercises/ear-training.test.ts packages/music-core/src/engines/skills/skills.test.ts --run
```

Expected: PASS.

### Task 2: Interval Recognition Exercise

**Files:**
- Replace: `packages/music-core/src/exercises/interval-recognition.ts`
- Create: `packages/music-core/src/exercises/interval-recognition.test.ts`

- [ ] **Step 1: Write failing interval generation and grading tests**

Use contexts targeting a single interval skill and inject deterministic random values through
`createIntervalRecognitionExercise({ random })`. Assert:

```ts
expect(createIntervalRecognitionExercise({ random: () => 0 }).generate(easy).payload.direction)
  .toBe("ascending");
expect(createIntervalRecognitionExercise({ random: () => 0.75 }).generate(hard).payload.direction)
  .toBe("descending");
expect(createIntervalRecognitionExercise({ random: () => 0.95 }).generate(hard).payload.direction)
  .toBe("harmonic");
```

Grade the same target through:

- a choice answer
- ascending play-back
- descending play-back
- harmonic play-back in either note order

Assert wrong answers produce a `choice` metric such as `{ expected: "m6", actual: "P5" }`.

- [ ] **Step 2: Run focused test and verify red**

Run:

```bash
vp test packages/music-core/src/exercises/interval-recognition.test.ts --run
```

Expected: FAIL because the current exercise only supports one fixed m6 click-answer prompt.

- [ ] **Step 3: Implement interval prompt generation and grading**

Define:

```ts
export interface IntervalRecognitionPrompt extends EarTrainingPromptBase {
  drill: "interval";
  interval: string;
  semitones: number;
  direction: "ascending" | "descending" | "harmonic";
  rootMidi: number;
}
```

Generate from `ctx.targetSkillIds[0]`, use deterministic difficulty bands for direction, and grade choice or relative played-note distance. Keep the definition’s `skillIds` equal to all interval child skills so the coordinator can target one through context.
Export `createIntervalRecognitionExercise({ random? })` for deterministic tests and
`intervalRecognitionExercise` as its default instance.

- [ ] **Step 4: Run focused test and verify green**

Run:

```bash
vp test packages/music-core/src/exercises/interval-recognition.test.ts --run
```

Expected: PASS.

### Task 3: Chord-Quality And Scale-Degree Exercises

**Files:**
- Create: `packages/music-core/src/exercises/chord-quality-recognition.ts`
- Create: `packages/music-core/src/exercises/chord-quality-recognition.test.ts`
- Create: `packages/music-core/src/exercises/scale-degree-recognition.ts`
- Create: `packages/music-core/src/exercises/scale-degree-recognition.test.ts`
- Modify: `packages/music-core/package.json`

- [ ] **Step 1: Write failing chord-quality tests**

Assert low difficulty presents the four triads and high difficulty includes seventh qualities. Grade correct and incorrect choice answers and any-root/inversion play-back answers. Require a chord metric containing expected and actual pitch classes.

```ts
expect(prompt.payload.choices.map(({ token }) => token)).toContain("major");
expect(highPrompt.payload.choices.map(({ token }) => token)).toContain("dominant-7");
expect(result.metrics).toContainEqual({
  kind: "choice",
  expected: "minor",
  actual: "major",
});
```

- [ ] **Step 2: Run chord-quality test and verify red**

Run:

```bash
vp test packages/music-core/src/exercises/chord-quality-recognition.test.ts --run
```

Expected: FAIL because the exercise module does not exist.

- [ ] **Step 3: Implement chord-quality exercise**

Use the target skill ID to select quality. Generate a root, playback chord, answer choices, and required note count. Normalize played pitch classes against the played root and accept inversions. Export a deterministic `createChordQualityRecognitionExercise({ random? })` factory and a default concrete instance.

- [ ] **Step 4: Write failing scale-degree tests**

Assert prompts cover major, natural minor, harmonic minor, and melodic minor at increasing difficulty. Require degree plus solfege labels:

```ts
expect(prompt.payload.choices).toContainEqual({ token: "b6", label: "b6 / le" });
expect(harmonicMinor.payload.answerToken).toBe("7");
```

Grade correct/wrong choice and play-back answers relative to the supplied tonic.

- [ ] **Step 5: Run scale-degree test and verify red**

Run:

```bash
vp test packages/music-core/src/exercises/scale-degree-recognition.test.ts --run
```

Expected: FAIL because the exercise module does not exist.

- [ ] **Step 6: Implement scale-degree exercise and package exports**

Use a deterministic `createScaleDegreeRecognitionExercise({ random? })` factory to choose a valid
key context containing the targeted degree, and export a default concrete instance. Export both
exercises from `packages/music-core/package.json`:

```json
"./exercises/chord-quality-recognition": "./src/exercises/chord-quality-recognition.ts",
"./exercises/scale-degree-recognition": "./src/exercises/scale-degree-recognition.ts"
```

- [ ] **Step 7: Run all ear-exercise tests**

Run:

```bash
vp test packages/music-core/src/exercises/ear-training.test.ts packages/music-core/src/exercises/interval-recognition.test.ts packages/music-core/src/exercises/chord-quality-recognition.test.ts packages/music-core/src/exercises/scale-degree-recognition.test.ts --run
```

Expected: PASS.

### Task 4: Scheduled Prompt Playback

**Files:**
- Modify: `packages/music-core/src/engines/sound/index.ts`
- Modify: `packages/music-core/src/engines/sound/sound.test.ts`

- [ ] **Step 1: Write failing `playPattern` test**

Extend the fake Tone module with `now()`. Assert playback steps schedule chords/notes at `now + offsetSeconds` and do nothing before audio is enabled.

```ts
sound.playPattern([
  { midiNotes: [60, 64, 67], offsetSeconds: 0, durationSeconds: 0.6 },
  { midiNotes: [71], offsetSeconds: 0.8, durationSeconds: 0.5 },
]);
expect(triggerAttackRelease).toHaveBeenNthCalledWith(2, ["B4"], 0.5, 10.8, 0.8);
```

- [ ] **Step 2: Run sound test and verify red**

Run:

```bash
vp test packages/music-core/src/engines/sound/sound.test.ts --run
```

Expected: FAIL because `SoundEngine.playPattern` and `ToneSoundModule.now` do not exist.

- [ ] **Step 3: Implement scheduled pattern playback**

Add `now(): number` to `ToneSoundModule`, define this sound-engine-local structural type, and
implement:

```ts
export interface SoundPatternStep {
  midiNotes: number[];
  offsetSeconds: number;
  durationSeconds: number;
}
playPattern(steps: SoundPatternStep[], velocity = 0.8): void
```

Schedule every step on the existing poly synth with Tone times. Do not use `setTimeout`, `setInterval`, or `requestAnimationFrame`.

- [ ] **Step 4: Run sound test and verify green**

Run:

```bash
vp test packages/music-core/src/engines/sound/sound.test.ts --run
```

Expected: PASS.

### Task 5: Ear-Training Session Coordinator

**Files:**
- Create: `packages/music-core/src/engines/ear-training/index.ts`
- Create: `packages/music-core/src/engines/ear-training/ear-training.test.ts`
- Modify: `packages/music-core/src/engines/exercise/index.ts`
- Modify: `packages/music-core/src/engines/exercise/exercise.test.ts`
- Modify: `packages/music-core/package.json`

- [ ] **Step 1: Write failing scheduler-variety and focused/mixed queue tests**

First require `ExerciseScheduler` to rank each unlocked target skill as a separate candidate rather
than collapsing every multi-skill exercise to one primary target. Then construct the coordinator
with deterministic definitions and assert:

```ts
expect(focused.queue).toHaveLength(10);
expect(focused.queue.every((item) => item.drill === "interval")).toBe(true);
expect(new Set(focused.queue.map((item) => item.targetSkillId)).size).toBeGreaterThan(1);
expect(new Set(mixed.queue.map((item) => item.drill))).toEqual(
  new Set(["interval", "chord-quality", "scale-degree"]),
);
```

- [ ] **Step 2: Run coordinator test and verify red**

Run:

```bash
vp test packages/music-core/src/engines/ear-training/ear-training.test.ts --run
```

Expected: FAIL because the coordinator does not exist.

- [ ] **Step 3: Expand scheduler candidates and expose finished results**

Change `ExerciseScheduler` to create one candidate per unlocked `definition.skillIds` entry, retain
the existing weakness/review ranking, and interleave candidates without losing their individual
`targetSkillIds`. Add an optional `inputs` override to `StartExerciseRunArgs`; the host must accept
only those sources for that active run. Extend `ExerciseRunHost.finish()` and
`runExerciseThroughPipeline()` to return `{ event, xp, result }`, preserving existing callers that
read only `event` and `xp`.

- [ ] **Step 4: Implement coordinator state and prompt start**

Export:

```ts
export interface EarTrainingSessionOptions {
  drill: EarTrainingDrill | "mixed";
  answerMode: EarTrainingAnswerMode;
  feedbackMode: EarTrainingFeedbackMode;
  length?: number;
}
export class EarTrainingSession {
  get state(): EarTrainingSessionState;
  start(): Promise<EarTrainingPromptBase>;
  replay(): EarTrainingPromptBase;
  answerChoice(token: string): Promise<void>;
  abandon(): void;
  dispose(): void;
}
```

Construct the coordinator with an `InputRouter`, registry, scheduler, and pipeline services. Create
the `ExerciseRunHost` before subscribing the coordinator to the router. Choose the target skill
before `ExerciseRunHost.start()` and pass exactly that skill in `context.targetSkillIds`.
`answerChoice()` pushes the normalized choice event through the same router used by MIDI and
on-screen input. Start the host with `inputs: ["click"]` in Choice mode or
`inputs: ["midi", "onscreen"]` in Play-back mode.

- [ ] **Step 5: Write failing feedback, summary, and pipeline tests**

Assert Practice mode exposes feedback after each prompt, Test mode defers it, replay leaves prompt count unchanged, and prompt 10 produces a summary with XP, per-drill accuracy, recent results, and confusion substitutions. Verify mastery, analytics, and progress move after a completed prompt.

- [ ] **Step 6: Implement completion and summary behavior**

Use the coordinator's router subscription to inspect the host's live progress after each accepted
event. Require `replay()` to mark the prompt as heard before accepting answers. Finish the active
`ExerciseRunHost` only when choice input arrives or play-back input reaches the prompt’s
`requiredPlayedNotes`. Store the returned `ExerciseResult`, scoring event, and XP in coordinator
result views before advancing to the next queued target.

- [ ] **Step 7: Export and run coordinator tests**

Add:

```json
"./engines/ear-training": "./src/engines/ear-training/index.ts"
```

Run:

```bash
vp test packages/music-core/src/engines/ear-training/ear-training.test.ts --run
```

Expected: PASS.

### Task 6: Learn Hub And Theory Route Move

**Files:**
- Replace: `src/routes/music/learn/+page.svelte`
- Replace: `src/routes/music/learn/page.svelte.test.ts`
- Move: `src/routes/music/learn/_components/ChordDiagram.svelte` to `src/routes/music/learn/theory/_components/ChordDiagram.svelte`
- Move: `src/routes/music/learn/_components/PianoKeyboard.svelte` to `src/routes/music/learn/theory/_components/PianoKeyboard.svelte`
- Move: `src/routes/music/learn/_components/PianoKeyboard.svelte.test.ts` to `src/routes/music/learn/theory/_components/PianoKeyboard.svelte.test.ts`
- Move: existing theory page to `src/routes/music/learn/theory/+page.svelte`
- Move: existing theory page test to `src/routes/music/learn/theory/page.svelte.test.ts`
- Modify: `e2e/route-apps.spec.ts`

- [ ] **Step 1: Write failing Learn hub and theory-route tests**

The hub test requires links to `/music/learn/theory` and `/music/learn/ear`. Update the theory test imports/path and require the existing Cmaj7 workflow at `/music/learn/theory`. Update the E2E shell test to expect the Learn hub heading.

- [ ] **Step 2: Run route tests and verify red**

Run:

```bash
vp test src/routes/music/learn --run
```

Expected: FAIL because `/music/learn` still contains the theory library and the theory subroute does not exist.

- [ ] **Step 3: Implement hub and move theory workflow**

Build a compact Learn hub using shared `@repo/ui` cards and theme tokens. Move the theory files without changing their behavior. Keep all `/music/learn/*` paths active under the existing Learn navigation item.

- [ ] **Step 4: Run Learn route tests and verify green**

Run:

```bash
vp test src/routes/music/learn --run
```

Expected: PASS.

### Task 7: Ear Training Route And Focus Session UI

**Files:**
- Create: `src/routes/music/learn/ear/+page.svelte`
- Create: `src/routes/music/learn/ear/page.svelte.test.ts`
- Create: `src/routes/music/learn/ear/_components/EarTrainingLanding.svelte`
- Create: `src/routes/music/learn/ear/_components/EarTrainingSessionView.svelte`
- Create: `src/routes/music/learn/ear/_components/EarTrainingSessionRail.svelte`
- Create: `src/routes/music/learn/ear/_components/EarTrainingSummary.svelte`
- Modify: `src/routes/music/_runtime.svelte.ts`
- Modify: `src/routes/music/+page.svelte`
- Modify: `src/routes/music/page.svelte.test.ts`
- Modify: `vite.config.ts`

- [ ] **Step 1: Write failing route workflow test**

Render the route and assert:

- Mixed Session is the primary action.
- Interval, Chord Quality, and Scale Degree focused actions exist.
- Practice/Test and Choice/Play-back selectors switch.
- Starting a session plays the current prompt.
- Choice answers advance progress and show immediate Practice feedback.
- Test mode hides correctness until the summary.
- The rail shows `1 / 10`, recent answers, session XP, and streak.

- [ ] **Step 2: Run route test and verify red**

Run:

```bash
vp test src/routes/music/learn/ear/page.svelte.test.ts --run
```

Expected: FAIL because the ear route does not exist.

- [ ] **Step 3: Implement landing and active-session UI**

Instantiate browser-only `PracticeStore`, `SkillGraphStore`, `AnalyticsEngine`, and `ProgressEngine`;
seed/load them before allowing session start. Add one shared `MidiEngine` to `MusicRuntime`, route
its events into the runtime router, expose an Enable MIDI action on the Ear Training landing state,
dispose it with the runtime, and replace the music home page's route-local MIDI engine with
`runtime.midi`. Create the coordinator with the shared music runtime router and pipeline services.
Use the approved Focus + Session Rail layout and shared UI components.

Wire replay to:

```ts
runtime.sound.playPattern(session.replay().playback);
```

Before starting the first prompt, require `runtime.enableAudio()`, then call `session.start()` and
play `session.replay().playback`. Wire choice answers through the coordinator. In Play-back mode,
render `OnScreenKeyboard` and let the shared router deliver MIDI/on-screen events.

- [ ] **Step 4: Implement summary UI and recovery states**

Render accuracy, XP, per-drill results, confusions, retry mistakes, repeat session, and return-to-Learn actions. Keep the active prompt when audio enablement or persistence fails and display the recoverable status.

- [ ] **Step 5: Stabilize optimizer imports and run focused route tests**

Add newly used Lucide icon imports to `vite.config.ts` only if the focused browser test reports an optimizer reload.

Run:

```bash
vp test packages/music-core/src/exercises packages/music-core/src/engines/ear-training src/routes/music/learn --run
```

Expected: PASS.

### Task 8: Browser Verification, Full Gates, And Commit

**Files:**
- Verify all T1.6 files above

- [ ] **Step 1: Run repository checks**

Run sequentially:

```bash
vp run -r check
vp test --run
vp run -r build
playwright test
```

Expected: all commands pass.

- [ ] **Step 2: Verify in the in-app browser**

Open `/music/learn`, verify the hub and theory link, then open `/music/learn/ear`. Confirm:

- mixed and focused session starts
- Practice/Test and Choice/Play-back switching
- interval, chord, and scale-degree prompt playback
- Focus + Session Rail responsive layout
- immediate Practice feedback
- deferred Test feedback
- 10-prompt summary
- persisted mastery, analytics, XP, and streak after reload

- [ ] **Step 3: Stage only T1.6 implementation files**

Do not stage excluded docs, `.superpowers/`, `.codex/`, `AGENTS.md`, or existing planning-file deletions.

- [ ] **Step 4: Commit**

```bash
git commit -m "feat(T1.6): add ear training sessions"
```
