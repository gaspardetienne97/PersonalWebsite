# MPC Rudiments Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an engine-backed alternating single-stroke MPC drill at `/music/play/mpc` that accepts hardware MIDI and on-screen pads, scores order/timing/velocity, advances mastery, awards XP, and records completed attempts.

**Architecture:** A new framework-agnostic `mpc-single-stroke` exercise owns prompt generation and scoring. `TechniqueSession` hosts it through the existing `ExerciseRunHost`, while the Svelte route only manages setup, runtime wiring, live rendering, and journal capture. Existing `MpcPadGrid`, Practice OS composites, `@repo/ui`, `MusicRuntime`, and the canonical scoring pipeline remain the integration points.

**Tech Stack:** SvelteKit 2, Svelte 5 runes, TypeScript, VitePlus/Vitest, Playwright, `@repo/music-core`, `@repo/ui`, IndexedDB through `PracticeStore`.

---

## File Map

- Create `packages/music-core/src/exercises/mpc-single-stroke.ts`: prompt generation, event acceptance, live feedback, and final scoring.
- Create `packages/music-core/src/exercises/mpc-single-stroke.test.ts`: deterministic exercise scoring tests.
- Modify `packages/music-core/package.json`: export the new exercise.
- Modify `packages/music-core/src/engines/skills/index.ts`: seed MPC technique skills.
- Modify `packages/music-core/src/engines/skills/skills.test.ts`: verify the MPC skill family.
- Modify `packages/music-core/src/engines/technique-session/index.ts`: add `startMpcRudiment`, velocity summary, and scale-only tempo progression.
- Modify `packages/music-core/src/engines/technique-session/technique-session.test.ts`: verify pipeline completion, restart, and no scale-tempo side effect.
- Create `src/routes/music/play/mpc/+page.svelte`: setup, live drill, summary, and journal capture.
- Create `src/routes/music/play/mpc/page.svelte.test.ts`: route interaction and validation coverage.
- Modify `src/routes/music/play/+page.svelte`: add the MPC Rudiments card.
- Modify `src/routes/music/play/page.svelte.test.ts`: verify the new hub link.
- Modify `src/routes/music/_components/MusicNavigation.svelte`: add the Play navigation entry.
- Modify `src/routes/music/_components/MusicNavigation.svelte.test.ts`: verify route discoverability and active state.
- Create `e2e/music-mpc-rudiments.spec.ts`: complete an on-screen run.
- Modify `src/routes/music/VERIFICATION.md`: record deferred MPC One+ checks.

## Task 1: Build The Single-Stroke Exercise

**Files:**
- Create: `packages/music-core/src/exercises/mpc-single-stroke.test.ts`
- Create: `packages/music-core/src/exercises/mpc-single-stroke.ts`
- Modify: `packages/music-core/package.json`

- [ ] **Step 1: Write failing scoring tests**

Create `packages/music-core/src/exercises/mpc-single-stroke.test.ts`:

```ts
import { describe, expect, test } from "vitest";

import { monotonicMs, type NoteOnEvent } from "@repo/music-core/domain";

import { createMpcSingleStrokeExercise } from "./mpc-single-stroke";

describe("createMpcSingleStrokeExercise", () => {
  test("passes a steady alternating eighth-note sequence", () => {
    const run = createRun();
    [36, 38, 36, 38, 36, 38, 36, 38].forEach((midi, index) => {
      run.accept(note(midi, index * 375, 0.8));
    });

    expect(run.getLiveState()).toMatchObject({
      progress: 1,
      runningScore: expect.any(Number),
    });

    const result = run.finish();
    expect(result.correct).toBe(true);
    expect(result.score).toBeGreaterThan(0.95);
    expect(result.target?.midiNotes).toEqual([36, 38, 36, 38, 36, 38, 36, 38]);
    expect(result.response?.midiNotes).toEqual([36, 38, 36, 38, 36, 38, 36, 38]);
    expect(result.metrics.filter((metric) => metric.kind === "timing")).toHaveLength(8);
    expect(result.metrics.filter((metric) => metric.kind === "velocity")).toHaveLength(8);
  });

  test("consumes an out-of-order configured pad but ignores unrelated notes", () => {
    const run = createRun();
    run.accept(note(42, 0));
    expect(run.getLiveState().progress).toBe(0);

    run.accept(note(38, 0));
    expect(run.getLiveState().progress).toBe(0.125);

    [38, 36, 38, 36, 38, 36, 38].forEach((midi, index) => {
      run.accept(note(midi, (index + 1) * 375));
    });

    const result = run.finish();
    expect(result.correct).toBe(false);
    expect(result.score).toBeLessThan(0.95);
    expect(result.metrics[0]).toMatchObject({
      kind: "pitch",
      expectedMidi: 36,
      actualMidi: 38,
    });
    expect(result.input.some((event) => event.type === "noteOn" && event.midiNote === 42)).toBe(
      false,
    );
  });

  test("penalizes late and uneven hits", () => {
    const run = createRun();
    const times = [0, 560, 750, 1310, 1500, 2060, 2250, 2810];
    const velocities = [0.2, 1, 0.25, 0.95, 0.2, 1, 0.25, 0.95];
    [36, 38, 36, 38, 36, 38, 36, 38].forEach((midi, index) => {
      run.accept(note(midi, times[index]!, velocities[index]!));
    });

    const result = run.finish();
    expect(result.correct).toBe(false);
    expect(result.score).toBeLessThan(0.85);
    expect(result.feedback.map(({ message }) => message).join(" ")).toMatch(
      /timing|velocity/i,
    );
  });
});

function createRun() {
  const exercise = createMpcSingleStrokeExercise({
    leftPadMidi: 36,
    rightPadMidi: 38,
    hitCount: 8,
    bpm: 80,
  });
  const context = {
    targetSkillIds: exercise.skillIds,
    difficulty: 0.4,
    instrument: "mpc" as const,
  };
  const prompt = exercise.generate(context);
  return exercise.createRun(prompt, context);
}

function note(midiNote: number, atMs: number, velocity = 0.8): NoteOnEvent {
  return {
    type: "noteOn",
    midiNote,
    velocity,
    instrument: "mpc",
    source: "midi",
    timestamp: monotonicMs(atMs),
    clock: "midi",
  };
}
```

- [ ] **Step 2: Run the test and verify RED**

Run:

```bash
vp test --run packages/music-core/src/exercises/mpc-single-stroke.test.ts
```

Expected: FAIL because `./mpc-single-stroke` does not exist.

- [ ] **Step 3: Implement the exercise**

Create `packages/music-core/src/exercises/mpc-single-stroke.ts`:

```ts
import {
  Capability,
  type ExerciseDefinition,
  type ExerciseRun,
  type FeedbackItem,
  type NoteEvent,
  type NoteOnEvent,
  type ScoringMetric,
} from "@repo/music-core/domain";
import { beatDurationMs } from "@repo/music-core/engines/transport";

export type MpcHitCount = 8 | 16;

export interface MpcSingleStrokeOptions {
  leftPadMidi?: number;
  rightPadMidi?: number;
  hitCount?: MpcHitCount;
  bpm?: number;
}

export interface MpcSingleStrokePrompt {
  label: string;
  leftPadMidi: number;
  rightPadMidi: number;
  hitCount: MpcHitCount;
  bpm: number;
  targetSpacingMs: number;
  targetSequence: number[];
}

export interface MpcSingleStrokeAnswer {
  playedPads: number[];
  velocities: number[];
  relativeTimestampsMs: number[];
  padAccuracy: number;
  meanTimingErrorMs: number;
  velocityConsistency: number;
}

interface Analysis {
  consumed: NoteOnEvent[];
  padAccuracy: number;
  meanTimingErrorMs: number;
  timingAccuracy: number;
  velocityConsistency: number;
  completion: number;
  score: number;
  metrics: ScoringMetric[];
}

export function createMpcSingleStrokeExercise(
  options: MpcSingleStrokeOptions = {},
): ExerciseDefinition<MpcSingleStrokePrompt, MpcSingleStrokeAnswer> {
  const leftPadMidi = options.leftPadMidi ?? 36;
  const rightPadMidi = options.rightPadMidi ?? 38;
  if (leftPadMidi === rightPadMidi) throw new Error("Choose two different MPC pads");

  const hitCount = options.hitCount ?? 8;
  const bpm = Math.max(30, Math.min(240, options.bpm ?? 80));
  const targetSequence = Array.from(
    { length: hitCount },
    (_, index) => (index % 2 === 0 ? leftPadMidi : rightPadMidi),
  );

  return {
    id: "technique.mpc.single-strokes",
    name: "MPC Alternating Single Strokes",
    capabilities: [Capability.Technique, Capability.Rhythm],
    skillIds: ["technique.mpc.single-strokes"],
    inputs: ["midi", "onscreen"],
    streaming: true,
    generate: () => ({
      id: `mpc-single-strokes-${leftPadMidi}-${rightPadMidi}-${hitCount}-${bpm}`,
      payload: {
        label: `${hitCount} alternating hits at ${bpm} BPM`,
        leftPadMidi,
        rightPadMidi,
        hitCount,
        bpm,
        targetSpacingMs: beatDurationMs(bpm) / 2,
        targetSequence,
      },
    }),
    createRun(prompt) {
      return singleStrokeRun(prompt.payload);
    },
  };
}

function singleStrokeRun(
  prompt: MpcSingleStrokePrompt,
): ExerciseRun<MpcSingleStrokeAnswer> {
  const consumed: NoteOnEvent[] = [];

  return {
    accept(event) {
      if (
        event.type !== "noteOn" ||
        consumed.length >= prompt.hitCount ||
        (event.midiNote !== prompt.leftPadMidi && event.midiNote !== prompt.rightPadMidi)
      ) {
        return;
      }
      consumed.push(event);
    },
    getLiveState() {
      const analysis = analyze(prompt, consumed);
      return {
        progress: analysis.completion,
        runningScore: analysis.score,
        feedback: liveFeedback(prompt, analysis),
      };
    },
    finish() {
      const analysis = analyze(prompt, consumed);
      const playedPads = consumed.map(({ midiNote }) => midiNote);
      const velocities = consumed.map(({ velocity }) => velocity);
      const firstAt = Number(consumed[0]?.timestamp ?? 0);
      const relativeTimestampsMs = consumed.map(({ timestamp }) => Number(timestamp) - firstAt);
      const correct =
        analysis.completion >= 1 &&
        analysis.padAccuracy >= 0.875 &&
        analysis.meanTimingErrorMs <= 90 &&
        analysis.velocityConsistency >= 0.65;

      return {
        correct,
        score: analysis.score,
        metrics: analysis.metrics,
        feedback: finalFeedback(analysis),
        target: {
          label: prompt.label,
          midiNotes: prompt.targetSequence,
        },
        response: { midiNotes: playedPads },
        answer: {
          playedPads,
          velocities,
          relativeTimestampsMs,
          padAccuracy: analysis.padAccuracy,
          meanTimingErrorMs: analysis.meanTimingErrorMs,
          velocityConsistency: analysis.velocityConsistency,
        },
        input: [...consumed],
      };
    },
  };
}

function analyze(prompt: MpcSingleStrokePrompt, consumed: NoteOnEvent[]): Analysis {
  const completion = consumed.length / prompt.hitCount;
  const correctPads = consumed.filter(
    ({ midiNote }, index) => midiNote === prompt.targetSequence[index],
  ).length;
  const padAccuracy = correctPads / prompt.hitCount;
  const firstAt = Number(consumed[0]?.timestamp ?? 0);
  const timingErrors = consumed.map(
    ({ timestamp }, index) => Number(timestamp) - (firstAt + index * prompt.targetSpacingMs),
  );
  const meanTimingErrorMs =
    timingErrors.length === 0
      ? prompt.targetSpacingMs
      : timingErrors.reduce((sum, error) => sum + Math.abs(error), 0) /
        timingErrors.length;
  const timingAccuracy = clamp(1 - meanTimingErrorMs / 180);
  const velocities = consumed.map(({ velocity }) => velocity);
  const meanVelocity =
    velocities.length === 0
      ? 0
      : velocities.reduce((sum, velocity) => sum + velocity, 0) / velocities.length;
  const variance =
    velocities.length === 0
      ? 1
      : velocities.reduce(
          (sum, velocity) => sum + Math.pow(velocity - meanVelocity, 2),
          0,
        ) / velocities.length;
  const velocityConsistency =
    velocities.length === 0
      ? 0
      : clamp(1 - Math.sqrt(variance) / Math.max(meanVelocity, 0.01));
  const score =
    padAccuracy * 0.45 +
    timingAccuracy * 0.3 +
    velocityConsistency * 0.15 +
    completion * 0.1;
  const metrics: ScoringMetric[] = [];

  consumed.forEach((event, index) => {
    metrics.push({
      kind: "pitch",
      expectedMidi: prompt.targetSequence[index]!,
      actualMidi: event.midiNote,
    });
    metrics.push({
      kind: "timing",
      expectedMs: firstAt + index * prompt.targetSpacingMs,
      actualMs: Number(event.timestamp),
      errorMs: timingErrors[index]!,
    });
    metrics.push({
      kind: "velocity",
      expected: meanVelocity,
      actual: event.velocity,
    });
  });

  return {
    consumed,
    padAccuracy,
    meanTimingErrorMs,
    timingAccuracy,
    velocityConsistency,
    completion,
    score,
    metrics,
  };
}

function liveFeedback(
  prompt: MpcSingleStrokePrompt,
  analysis: Analysis,
): FeedbackItem[] {
  if (analysis.consumed.length === 0) return [];
  const index = analysis.consumed.length - 1;
  const last = analysis.consumed[index]!;
  const expected = prompt.targetSequence[index]!;
  if (last.midiNote !== expected) {
    return [{ severity: "warn", message: `Expected pad ${expected}.` }];
  }
  const timing = analysis.metrics
    .filter((metric) => metric.kind === "timing")
    .at(-1);
  if (!timing || timing.kind !== "timing" || Math.abs(timing.errorMs) <= 45) {
    return [{ severity: "good", message: "Centered hit." }];
  }
  return [{
    severity: "warn",
    message: timing.errorMs < 0
      ? `${Math.round(Math.abs(timing.errorMs))}ms early.`
      : `${Math.round(timing.errorMs)}ms late.`,
  }];
}

function finalFeedback(analysis: Analysis): FeedbackItem[] {
  const dimensions = [
    {
      value: analysis.padAccuracy,
      message: `Pad order ${Math.round(analysis.padAccuracy * 100)}%.`,
    },
    {
      value: analysis.timingAccuracy,
      message: `Mean timing error ${Math.round(analysis.meanTimingErrorMs)}ms.`,
    },
    {
      value: analysis.velocityConsistency,
      message: `Velocity consistency ${Math.round(analysis.velocityConsistency * 100)}%.`,
    },
  ].sort((a, b) => a.value - b.value);
  return [{
    severity: analysis.score >= 0.85 ? "good" : "warn",
    message: dimensions[0]!.message,
  }];
}

function clamp(value: number): number {
  return Math.max(0, Math.min(1, value));
}
```

- [ ] **Step 4: Export the exercise**

Add to `packages/music-core/package.json`:

```json
"./exercises/mpc-single-stroke": "./src/exercises/mpc-single-stroke.ts",
```

Keep the exports alphabetized with the other exercise entries.

- [ ] **Step 5: Run the focused tests and verify GREEN**

Run:

```bash
vp test --run packages/music-core/src/exercises/mpc-single-stroke.test.ts
vp run @repo/music-core#check
```

Expected: the new exercise tests pass and `music-core` type-checks.

- [ ] **Step 6: Commit the exercise**

```bash
git add packages/music-core/package.json \
  packages/music-core/src/exercises/mpc-single-stroke.ts \
  packages/music-core/src/exercises/mpc-single-stroke.test.ts
git commit -m "feat(music): add MPC single-stroke exercise"
```

## Task 2: Wire Skills And Technique Session

**Files:**
- Modify: `packages/music-core/src/engines/skills/index.ts`
- Modify: `packages/music-core/src/engines/skills/skills.test.ts`
- Modify: `packages/music-core/src/engines/technique-session/index.ts`
- Modify: `packages/music-core/src/engines/technique-session/technique-session.test.ts`

- [ ] **Step 1: Add failing skill and session tests**

In `packages/music-core/src/engines/skills/skills.test.ts`, add these ids to the
existing `arrayContaining` assertion:

```ts
"technique.mpc",
"technique.mpc.single-strokes",
```

Then add:

```ts
expect(seed.relationships).toContainEqual({
  from: "technique.mpc",
  to: "technique.mpc.single-strokes",
  kind: SkillRelationKind.Component,
});
```

In `packages/music-core/src/engines/technique-session/technique-session.test.ts`,
add:

```ts
test("completes an MPC rudiment without changing the scale tempo ladder", async () => {
  const dependencies = await setup();
  const session = new TechniqueSession(dependencies);

  await session.startMpcRudiment({
    leftPadMidi: 36,
    rightPadMidi: 38,
    hitCount: 8,
    bpm: 80,
  });
  [36, 38, 36, 38, 36, 38, 36, 38].forEach((midiNote, index) => {
    dependencies.router.push(mpcNote(midiNote, index * 375, 0.8));
  });

  await vi.waitFor(() => expect(session.state.status).toBe("summary"));
  expect(session.state.summary).toMatchObject({
    total: 1,
    correct: 1,
    noteAccuracy: 1,
    meanEvennessErrorMs: 0,
    velocityConsistency: 1,
    highestUnlockedBpm: 100,
    nextTargetBpm: 100,
  });
  expect(session.state.results[0]?.event.skillIds).toContain(
    "technique.mpc.single-strokes",
  );
  expect(
    dependencies.services.skills.getMastery("technique.mpc.single-strokes").observations,
  ).toBeGreaterThan(0);
  expect(dependencies.services.progress.state.xp).toBeGreaterThan(0);
  session.dispose();
});

test("abandons an MPC rudiment and allows a restart", async () => {
  const dependencies = await setup();
  const session = new TechniqueSession(dependencies);

  await session.startMpcRudiment({
    leftPadMidi: 36,
    rightPadMidi: 38,
    hitCount: 8,
    bpm: 80,
  });
  session.abandon();

  expect(session.state.status).toBe("abandoned");
  await expect(
    session.startMpcRudiment({
      leftPadMidi: 40,
      rightPadMidi: 42,
      hitCount: 16,
      bpm: 100,
    }),
  ).resolves.toMatchObject({
    leftPadMidi: 40,
    rightPadMidi: 42,
    hitCount: 16,
    bpm: 100,
  });
  session.dispose();
});
```

Add this helper near the existing note helpers:

```ts
function mpcNote(
  midiNote: number,
  atMs: number,
  velocity: number,
): NoteOnEvent {
  return {
    ...note(midiNote, atMs),
    velocity,
    instrument: "mpc",
    channel: 10,
  };
}
```

- [ ] **Step 2: Run tests and verify RED**

Run:

```bash
vp test --run \
  packages/music-core/src/engines/skills/skills.test.ts \
  packages/music-core/src/engines/technique-session/technique-session.test.ts
```

Expected: FAIL because MPC skills, `startMpcRudiment`, and
`velocityConsistency` are missing.

- [ ] **Step 3: Seed the MPC skill family**

In `seedCoreSkills()` after the Aerophone skills, add:

```ts
skill("technique.mpc", "MPC Technique", Capability.Technique, "beginner", [
  "mpc",
  "pads",
  "finger-drumming",
]),
skill(
  "technique.mpc.single-strokes",
  "MPC Alternating Single Strokes",
  Capability.Technique,
  "beginner",
  ["mpc", "pads", "rudiment", "single-strokes"],
),
```

Add to the `components` map:

```ts
"technique.mpc": ["technique.mpc.single-strokes"],
```

- [ ] **Step 4: Extend TechniqueSession**

At the imports in
`packages/music-core/src/engines/technique-session/index.ts`, add:

```ts
import {
  createMpcSingleStrokeExercise,
  type MpcHitCount,
  type MpcSingleStrokePrompt,
} from "@repo/music-core/exercises/mpc-single-stroke";
```

Add:

```ts
export interface TechniqueMpcRudimentOptions {
  leftPadMidi: number;
  rightPadMidi: number;
  hitCount: MpcHitCount;
  bpm: number;
}

export type TechniquePrompt =
  | ScalePatternPrompt
  | AerophoneLongTonePrompt
  | AerophoneSwellPrompt
  | MpcSingleStrokePrompt;
```

Add `velocityConsistency` to `TechniqueSummary`:

```ts
velocityConsistency: number;
```

Add this method after `startSwell`:

```ts
async startMpcRudiment(
  options: TechniqueMpcRudimentOptions,
): Promise<MpcSingleStrokePrompt> {
  this.#assertUsable();
  if (this.#status === "active") {
    throw new Error("A technique session is already active");
  }

  const exercise = createMpcSingleStrokeExercise(options);
  const prompt = this.#host.start({
    exercise,
    sessionId: this.#sessionId,
    runId: `${this.#sessionId}-mpc-single-strokes-${options.bpm}`,
    inputs: ["midi", "onscreen"],
    context: {
      targetSkillIds: ["technique.mpc.single-strokes"],
      difficulty: difficultyForBpm(options.bpm),
      instrument: "mpc",
    },
  });

  this.#status = "active";
  this.#currentPrompt = prompt.payload as MpcSingleStrokePrompt;
  this.#results = [];
  this.#summary = undefined;
  this.#error = undefined;
  this.#notify();
  return this.#currentPrompt;
}
```

Replace the broad tempo-unlock check:

```ts
if ("bpm" in prompt && outcome.result.correct && prompt.bpm >= this.#highestUnlockedBpm) {
```

with:

```ts
if (isScalePrompt(prompt) && outcome.result.correct && prompt.bpm >= this.#highestUnlockedBpm) {
```

Add:

```ts
function isScalePrompt(prompt: TechniquePrompt): prompt is ScalePatternPrompt {
  return "noteLabels" in prompt && "targetSpacingMs" in prompt;
}
```

In `summarize`, collect velocity metrics and return their consistency:

```ts
const velocities = results.flatMap(({ result }) =>
  result.metrics
    .filter((metric) => metric.kind === "velocity")
    .map((metric) => metric.actual),
);
```

Add to the returned summary:

```ts
velocityConsistency: consistency(velocities),
```

Add:

```ts
function consistency(values: number[]): number {
  if (values.length === 0) return 0;
  const mean = values.reduce((sum, value) => sum + value, 0) / values.length;
  const variance =
    values.reduce((sum, value) => sum + Math.pow(value - mean, 2), 0) /
    values.length;
  return Math.max(
    0,
    Math.min(1, 1 - Math.sqrt(variance) / Math.max(mean, 0.01)),
  );
}
```

- [ ] **Step 5: Run focused tests and verify GREEN**

Run:

```bash
vp test --run \
  packages/music-core/src/engines/skills/skills.test.ts \
  packages/music-core/src/engines/technique-session/technique-session.test.ts
vp run @repo/music-core#check
```

Expected: both files pass and `music-core` type-checks.

- [ ] **Step 6: Commit skills and session wiring**

```bash
git add packages/music-core/src/engines/skills/index.ts \
  packages/music-core/src/engines/skills/skills.test.ts \
  packages/music-core/src/engines/technique-session/index.ts \
  packages/music-core/src/engines/technique-session/technique-session.test.ts
git commit -m "feat(music): run MPC rudiments through technique sessions"
```

## Task 3: Build The MPC Rudiments Route

**Files:**
- Create: `src/routes/music/play/mpc/page.svelte.test.ts`
- Create: `src/routes/music/play/mpc/+page.svelte`

- [ ] **Step 1: Write the failing route tests**

Create `src/routes/music/play/mpc/page.svelte.test.ts`:

```ts
import { afterEach, describe, expect, test, vi } from "vite-plus/test";
import { render } from "vitest-browser-svelte";

import Page from "./+page.svelte";

afterEach(() => {
  vi.restoreAllMocks();
  document.body.replaceChildren();
});

describe("/music/play/mpc/+page.svelte", () => {
  test("completes an eight-hit run through the on-screen MPC grid", async () => {
    render(Page);

    expect(document.querySelector("h1")?.textContent).toContain("MPC Rudiments");
    expect(document.querySelector('[aria-label="MPC pad grid"]')).not.toBeNull();
    await vi.waitFor(() => expect(button("Start rudiment")?.disabled).toBe(false));

    button("Start rudiment")?.click();
    await vi.waitFor(() => expect(button("Cancel rudiment")?.disabled).toBe(false));

    for (const midi of [36, 38, 36, 38, 36, 38, 36, 38]) {
      pad(midi)?.click();
    }

    await vi.waitFor(() => {
      expect(document.body.textContent).toContain("Rudiment complete");
      expect(button("Repeat rudiment")).not.toBeUndefined();
    });
  });

  test("rejects identical left and right pads", async () => {
    render(Page);
    await vi.waitFor(() => expect(button("Start rudiment")?.disabled).toBe(false));

    const right = document.querySelector<HTMLSelectElement>('[aria-label="Right pad"]');
    if (!right) throw new Error("Right pad selector not found");
    right.value = "36";
    right.dispatchEvent(new Event("change", { bubbles: true }));

    button("Start rudiment")?.click();
    expect(document.body.textContent).toContain("Choose two different MPC pads");
    expect(button("Cancel rudiment")).toBeUndefined();
  });

  test("cancels an active run and allows a restart", async () => {
    render(Page);
    await vi.waitFor(() => expect(button("Start rudiment")?.disabled).toBe(false));

    button("Start rudiment")?.click();
    await vi.waitFor(() => expect(button("Cancel rudiment")).not.toBeUndefined());
    button("Cancel rudiment")?.click();
    await vi.waitFor(() => expect(button("Start rudiment")?.disabled).toBe(false));
  });
});

function button(label: string): HTMLButtonElement | undefined {
  return [...document.querySelectorAll<HTMLButtonElement>("button")].find(
    (candidate) => candidate.textContent?.trim() === label,
  );
}

function pad(midi: number): HTMLButtonElement | null {
  return document.querySelector<HTMLButtonElement>(`[aria-label="Pad ${midi}"]`);
}
```

- [ ] **Step 2: Run the route test and verify RED**

Run:

```bash
vp test --run src/routes/music/play/mpc/page.svelte.test.ts
```

Expected: FAIL because the route does not exist.

- [ ] **Step 3: Create the route script and state**

Create `src/routes/music/play/mpc/+page.svelte` with these imports and state:

```svelte
<script lang="ts">
  import { browser } from "$app/environment";
  import { onDestroy, onMount } from "svelte";

  import type { MpcSingleStrokeAnswer } from "@repo/music-core/exercises/mpc-single-stroke";
  import { AnalyticsEngine } from "@repo/music-core/engines/analytics";
  import { ProgressEngine } from "@repo/music-core/engines/progress";
  import { seedCoreSkills, SkillGraphStore } from "@repo/music-core/engines/skills";
  import { PracticeStore } from "@repo/music-core/engines/store";
  import {
    TechniqueSession,
    type TechniqueSessionState,
  } from "@repo/music-core/engines/technique-session";
  import { Button } from "@repo/ui/button";
  import * as Card from "@repo/ui/card";
  import { Label } from "@repo/ui/label";
  import { Progress } from "@repo/ui/progress";

  import HudTile from "../../_components/HudTile.svelte";
  import MpcPadGrid, { MPC_PAD_MIDI } from "../../_components/MpcPadGrid.svelte";
  import PracticeScreen from "../../_components/PracticeScreen.svelte";
  import PracticeScreenHeader from "../../_components/PracticeScreenHeader.svelte";
  import SegmentedControl from "../../_components/SegmentedControl.svelte";
  import SessionFeedback from "../../_components/SessionFeedback.svelte";
  import SourceReadout from "../../_components/SourceReadout.svelte";
  import { useMusicRuntime } from "../../_runtime.svelte";

  const runtime = useMusicRuntime();
  const store = browser ? new PracticeStore() : undefined;
  const skills = new SkillGraphStore(store);
  const analytics = new AnalyticsEngine(store);
  const progress = new ProgressEngine(store);
  const padOptions = MPC_PAD_MIDI.flat().sort((a, b) => a - b);
  const hitCountOptions = [
    { value: "8", label: "8 hits" },
    { value: "16", label: "16 hits" },
  ];
  const tempoOptions = [60, 80, 100, 120].map((bpm) => ({
    value: String(bpm),
    label: `${bpm} BPM`,
  }));

  let leftPadMidi = $state("36");
  let rightPadMidi = $state("38");
  let hitCount = $state("8");
  let bpm = $state("80");
  let ready = $state(false);
  let pending = $state(false);
  let captured = false;
  let status = $state("Preparing MPC practice.");
  let midiEnabled = $state(runtime.midi.state.enabled);
  let session = $state<TechniqueSession | undefined>();
  let sessionState = $state<TechniqueSessionState | undefined>();
  let unsubscribeSession: (() => void) | undefined;

  const prompt = $derived(
    sessionState?.currentPrompt && "targetSequence" in sessionState.currentPrompt
      ? sessionState.currentPrompt
      : undefined,
  );
  const summary = $derived(sessionState?.summary);
  const result = $derived(summary?.results[0]);
  const answer = $derived(result?.result.answer as MpcSingleStrokeAnswer | undefined);
  const totalHits = $derived(Number(hitCount));
  const completedHits = $derived(
    Math.min(totalHits, Math.round((sessionState?.live?.progress ?? 0) * totalHits)),
  );
  const nextPad = $derived(prompt?.targetSequence[completedHits]);
  const runningScore = $derived(
    Math.round((sessionState?.live?.runningScore ?? 0) * 100),
  );
  const midiStatus = $derived(
    midiEnabled
      ? `${runtime.midi.state.inputs.length} MIDI input${runtime.midi.state.inputs.length === 1 ? "" : "s"} connected.`
      : runtime.midi.state.error ?? "MIDI permission has not been requested.",
  );

  void initialize();

  const unsubscribeMidiState = runtime.midi.subscribeState(() => {
    midiEnabled = runtime.midi.state.enabled;
  });

  async function initialize(): Promise<void> {
    try {
      await Promise.all([skills.seed(seedCoreSkills()), analytics.load(), progress.load()]);
      session = new TechniqueSession({
        router: runtime.router,
        services: { skills, analytics, progress },
      });
      unsubscribeSession = session.subscribe((state) => {
        sessionState = state;
        status = state.error ?? status;
        if (state.summary && !captured) {
          captured = true;
          const completed = state.summary.results[0];
          const detail = completed?.result.answer as MpcSingleStrokeAnswer | undefined;
          void runtime.recordPractice({
            source: "drill",
            instrument: "mpc",
            tags: ["mpc", "rudiment", "single-strokes"],
            scoringEvents: state.summary.results.map(({ event }) => event),
            xpEarned: state.summary.xp,
            note: detail
              ? `MPC single strokes · ${totalHits} hits at ${bpm} BPM · ${Math.round(detail.padAccuracy * 100)}% pads · ${Math.round(detail.meanTimingErrorMs)}ms timing`
              : "MPC single strokes",
          });
        }
      });
      ready = true;
      status = "Ready for alternating single strokes.";
    } catch (error) {
      status = message(error, "MPC practice could not be prepared.");
    }
  }

  async function enableMidi(): Promise<void> {
    await runtime.midi.enable();
  }

  async function start(): Promise<void> {
    if (!ready || pending || !session) return;
    if (leftPadMidi === rightPadMidi) {
      status = "Choose two different MPC pads.";
      return;
    }

    pending = true;
    captured = false;
    status = "";
    try {
      await session.startMpcRudiment({
        leftPadMidi: Number(leftPadMidi),
        rightPadMidi: Number(rightPadMidi),
        hitCount: Number(hitCount) as 8 | 16,
        bpm: Number(bpm),
      });
      status = `Alternate pads ${leftPadMidi} and ${rightPadMidi}.`;
    } catch (error) {
      status = message(error, "The MPC rudiment could not be started.");
    } finally {
      pending = false;
    }
  }

  function cancel(): void {
    session?.abandon();
    status = "Rudiment cancelled. You can start again.";
  }

  function message(error: unknown, fallback: string): string {
    return error instanceof Error ? error.message : fallback;
  }

  onMount(() => runtime.setActiveInstrument("mpc"));

  onDestroy(() => {
    unsubscribeSession?.();
    unsubscribeMidiState();
    session?.dispose();
  });
</script>
```

- [ ] **Step 4: Add the route markup**

Append this markup to the same route:

```svelte
<svelte:head>
  <title>MPC Rudiments | Practice OS</title>
  <meta
    name="description"
    content="Practice alternating MPC pad strokes with live order, timing, and velocity feedback."
  />
</svelte:head>

<PracticeScreen>
  <PracticeScreenHeader
    title="MPC Rudiments"
    subtitle="Build even alternating strokes on hardware MIDI or the on-screen Bank A pad grid."
  >
    {#snippet controls()}
      <SourceReadout
        label="Input"
        device={runtime.activeSource === "midi" ? "MIDI · MPC" : "On-screen pads"}
        live={sessionState?.status === "active"}
      />
    {/snippet}
  </PracticeScreenHeader>

  <section class="grid gap-6 xl:grid-cols-[minmax(0,1fr)_22rem]">
    <Card.Root>
      <Card.Header class="gap-4 md:flex-row md:items-start md:justify-between">
        <div>
          <Card.Description>Alternating eighth notes</Card.Description>
          <Card.Title>Single strokes</Card.Title>
        </div>
        <Button type="button" variant="outline" disabled={midiEnabled} onclick={enableMidi}>
          {midiEnabled ? "MIDI enabled" : "Enable MIDI"}
        </Button>
      </Card.Header>

      <Card.Content class="grid gap-6">
        <fieldset
          disabled={sessionState?.status === "active"}
          class="grid gap-4 disabled:opacity-70"
        >
          <div class="grid gap-4 sm:grid-cols-2">
            <div class="grid gap-2">
              <Label for="mpc-left-pad">Left pad</Label>
              <select
                id="mpc-left-pad"
                aria-label="Left pad"
                bind:value={leftPadMidi}
                class="h-9 rounded-md border bg-background px-3 text-sm"
              >
                {#each padOptions as midi}
                  <option value={String(midi)}>Pad {midi}</option>
                {/each}
              </select>
            </div>
            <div class="grid gap-2">
              <Label for="mpc-right-pad">Right pad</Label>
              <select
                id="mpc-right-pad"
                aria-label="Right pad"
                bind:value={rightPadMidi}
                class="h-9 rounded-md border bg-background px-3 text-sm"
              >
                {#each padOptions as midi}
                  <option value={String(midi)}>Pad {midi}</option>
                {/each}
              </select>
            </div>
          </div>

          <div class="flex flex-wrap gap-3">
            <SegmentedControl
              ariaLabel="Hit count"
              options={hitCountOptions}
              bind:value={hitCount}
            />
            <SegmentedControl
              ariaLabel="Tempo"
              options={tempoOptions}
              bind:value={bpm}
            />
          </div>
        </fieldset>

        <div class="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <HudTile label="Next pad" value={nextPad ?? leftPadMidi} tone="accent" />
          <HudTile label="Hits" value={completedHits} unit={`/${totalHits}`} />
          <HudTile label="Quality" value={runningScore} unit="%" tone="good" />
          <HudTile label="Tempo" value={bpm} unit="BPM" />
        </div>

        {#if prompt}
          <div class="grid gap-3 rounded-lg border bg-muted/30 p-4">
            <div class="flex items-center justify-between gap-3 text-sm">
              <span class="font-medium">{prompt.label}</span>
              <span class="tabular-nums text-muted-foreground">
                {completedHits}/{prompt.hitCount}
              </span>
            </div>
            <Progress value={completedHits} max={prompt.hitCount} />
            <div class="flex flex-wrap gap-2" aria-label="Target sequence">
              {#each prompt.targetSequence as midi, index}
                <span
                  class="grid size-9 place-items-center rounded-md border text-xs font-semibold
                    {index < completedHits
                      ? 'border-success/30 bg-success/10 text-success'
                      : index === completedHits
                        ? 'border-primary bg-primary/10 text-primary'
                        : 'bg-background text-muted-foreground'}"
                >
                  {midi}
                </span>
              {/each}
            </div>
            <p class="text-sm text-muted-foreground" aria-live="polite">
              {sessionState?.live?.feedback[0]?.message ?? status}
            </p>
          </div>
        {/if}

        {#if summary && answer}
          <div class="grid gap-3">
            <SessionFeedback
              kind={summary.correct === summary.total ? "correct" : "wrong"}
              message="Rudiment complete"
              detail={`${Math.round((result?.result.score ?? 0) * 100)}% total · ${Math.round(answer.padAccuracy * 100)}% pad accuracy · ${Math.round(answer.meanTimingErrorMs)}ms mean timing error · ${Math.round(answer.velocityConsistency * 100)}% velocity consistency`}
              xp={summary.xp}
            />
          </div>
        {/if}
      </Card.Content>

      <Card.Footer class="flex-wrap gap-3">
        {#if sessionState?.status === "active"}
          <Button type="button" variant="outline" onclick={cancel}>Cancel rudiment</Button>
        {:else}
          <Button type="button" disabled={!ready || pending} onclick={start}>
            {pending ? "Starting..." : summary ? "Repeat rudiment" : "Start rudiment"}
          </Button>
        {/if}
        <p class="text-sm text-muted-foreground" aria-live="polite">{status}</p>
      </Card.Footer>
    </Card.Root>

    <Card.Root>
      <Card.Header>
        <Card.Title>Bank A pads</Card.Title>
        <Card.Description>{midiStatus}</Card.Description>
      </Card.Header>
      <Card.Content class="overflow-x-auto">
        <MpcPadGrid router={runtime.router} />
      </Card.Content>
    </Card.Root>
  </section>
</PracticeScreen>
```

- [ ] **Step 5: Run route tests and verify GREEN**

Run:

```bash
vp test --run src/routes/music/play/mpc/page.svelte.test.ts
vp check
```

Expected: the route tests pass and Svelte reports no new errors.

- [ ] **Step 6: Commit the route**

```bash
git add src/routes/music/play/mpc/+page.svelte \
  src/routes/music/play/mpc/page.svelte.test.ts
git commit -m "feat(music): add MPC rudiments practice screen"
```

## Task 4: Add Discoverability

**Files:**
- Modify: `src/routes/music/play/+page.svelte`
- Modify: `src/routes/music/play/page.svelte.test.ts`
- Modify: `src/routes/music/_components/MusicNavigation.svelte`
- Modify: `src/routes/music/_components/MusicNavigation.svelte.test.ts`

- [ ] **Step 1: Write failing hub and navigation assertions**

In `src/routes/music/play/page.svelte.test.ts`, extend the existing test:

```ts
expect(document.querySelector('a[href="/music/play/mpc"]')?.textContent).toContain(
  "MPC Rudiments",
);
```

In `src/routes/music/_components/MusicNavigation.svelte.test.ts`, add:

```ts
test("links to MPC rudiments and marks it active", () => {
  render(MusicNavigation, { currentPath: "/music/play/mpc" });
  const link = document.querySelector<HTMLAnchorElement>('a[href="/music/play/mpc"]');
  expect(link?.textContent).toContain("MPC Rudiments");
  expect(link?.getAttribute("aria-current")).toBe("page");
});
```

- [ ] **Step 2: Run tests and verify RED**

Run:

```bash
vp test --run \
  src/routes/music/play/page.svelte.test.ts \
  src/routes/music/_components/MusicNavigation.svelte.test.ts
```

Expected: FAIL because the links do not exist.

- [ ] **Step 3: Add the Play hub card**

In `src/routes/music/play/+page.svelte`, import:

```ts
import Drum from "lucide-svelte/icons/drum";
```

Add this `MusicToolCard` after Scales & Technique:

```svelte
<MusicToolCard
  href="/music/play/mpc"
  title="MPC Rudiments"
  description="Build alternating pad control with order, timing, and velocity feedback from MIDI or the on-screen grid."
  eyebrow="Play"
  meta="Pads"
  action="Start pad practice"
  icon={Drum}
/>
```

- [ ] **Step 4: Add the desktop navigation entry**

In the Play group of
`src/routes/music/_components/MusicNavigation.svelte`, add after Practice Lab:

```ts
{ label: "MPC Rudiments", href: "/music/play/mpc", icon: Drum },
```

The existing `Drum` import is already used for Rhythm and can be reused.

- [ ] **Step 5: Run tests and verify GREEN**

Run:

```bash
vp test --run \
  src/routes/music/play/page.svelte.test.ts \
  src/routes/music/_components/MusicNavigation.svelte.test.ts
```

Expected: both files pass.

- [ ] **Step 6: Commit discoverability**

```bash
git add src/routes/music/play/+page.svelte \
  src/routes/music/play/page.svelte.test.ts \
  src/routes/music/_components/MusicNavigation.svelte \
  src/routes/music/_components/MusicNavigation.svelte.test.ts
git commit -m "feat(music): link MPC rudiments from Play"
```

## Task 5: Add End-To-End And Hardware Verification

**Files:**
- Create: `e2e/music-mpc-rudiments.spec.ts`
- Modify: `src/routes/music/VERIFICATION.md`

- [ ] **Step 1: Write the Playwright workflow**

Create `e2e/music-mpc-rudiments.spec.ts`:

```ts
import { expect, test } from "@playwright/test";

test.describe("music MPC rudiment workflows", () => {
  test("opens from Play and completes an on-screen single-stroke run", async ({
    page,
  }) => {
    await page.goto("/music/play");
    await page.getByRole("link", { name: /MPC Rudiments/ }).click();

    await expect(page).toHaveURL("/music/play/mpc");
    await expect(page.getByRole("heading", { name: "MPC Rudiments" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Start rudiment" })).toBeEnabled();

    await page.getByRole("button", { name: "Start rudiment" }).click();
    for (const [index, midi] of [36, 38, 36, 38, 36, 38, 36, 38].entries()) {
      if (index > 0) await page.waitForTimeout(375);
      await page.getByRole("button", { name: `Pad ${midi}`, exact: true }).click();
    }

    await expect(page.getByText("Rudiment complete", { exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: "Repeat rudiment" })).toBeEnabled();

    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
    );
    expect(overflow).toBe(false);

    await page.goto("/music/track");
    await expect(page.getByText(/MPC single strokes/)).toBeVisible();
  });

  test("fits the MPC workflow on a mobile viewport", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/music/play/mpc");

    await expect(page.getByRole("heading", { name: "MPC Rudiments" })).toBeVisible();
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
    );
    expect(overflow).toBe(false);
  });
});
```

- [ ] **Step 2: Run the focused Playwright test**

Run:

```bash
./node_modules/.bin/playwright test e2e/music-mpc-rudiments.spec.ts
```

Expected: 2 tests pass.

- [ ] **Step 3: Add the deferred hardware checklist**

Append this section before `## Completed Hardware Checks` in
`src/routes/music/VERIFICATION.md`:

```md
### MPC One+ Single-Stroke Trainer

- Status: Pending
- Added: 2026-06-12
- Route: `/music/play/mpc`
- Hardware: Akai MPC One+ over Web MIDI

Steps:

1. Connect the MPC One+, enable MIDI, and open MPC Rudiments.
2. Confirm Bank A pads report notes within the displayed 36-51 range; record
   any different mapping.
3. Configure the two notes sent by the chosen physical pads.
4. Complete an 8-hit alternating run at 80 BPM.
5. Confirm hit progress, next-pad guidance, and timing feedback update from
   physical pad strikes.
6. Repeat with deliberately uneven velocity and confirm the consistency score
   falls.
7. Confirm one completed attempt appears in the journal.
8. Cancel another run and confirm a fresh run can start.

Expected:

- Hardware and on-screen pads use the same exercise path.
- Correct alternating hits complete the run and award XP.
- Wrong order, late/early timing, and uneven velocity affect the result.
- Cancellation does not write a journal entry or lock the session.
```

- [ ] **Step 4: Commit workflow coverage**

```bash
git add e2e/music-mpc-rudiments.spec.ts src/routes/music/VERIFICATION.md
git commit -m "test(music): cover MPC rudiment workflow"
```

## Task 6: Final Verification

**Files:**
- Verify all files changed by Tasks 1-5.

- [ ] **Step 1: Run recursive checks**

```bash
vp run -r check
```

Expected: exit code 0. Existing unrelated warnings may remain, but no new
errors or warnings should point to MPC files.

- [ ] **Step 2: Run the complete unit/component suite**

```bash
vp test --run
```

Expected: all test files pass.

- [ ] **Step 3: Run the production build**

```bash
vp run -r build
```

Expected: exit code 0.

- [ ] **Step 4: Run all Playwright tests**

```bash
./node_modules/.bin/playwright test
```

Expected: the full suite passes, including both MPC tests.

- [ ] **Step 5: Run domain validation**

```bash
./node_modules/.bin/tsx packages/music-core/src/domain/validate.ts
./node_modules/.bin/tsx packages/music-core/src/domain/pipeline-trace.ts
```

Expected: both scripts exit 0 and report the domain/pipeline invariants hold.

- [ ] **Step 6: Inspect the final diff**

```bash
git status --short
git diff --check
git log --oneline -6
```

Expected: only the intended implementation files plus the user's unrelated
local planning deletions/tool directories are present. Do not stage the
unrelated files.

- [ ] **Step 7: Use the branch-finishing workflow**

Invoke `superpowers:verification-before-completion`, then
`superpowers:finishing-a-development-branch`. Do not push unless the user
explicitly requests it.
