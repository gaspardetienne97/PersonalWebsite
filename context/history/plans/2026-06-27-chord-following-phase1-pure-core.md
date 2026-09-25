# Chord-Following Phase 1 (Pure Core) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the headless-testable pure core for real-time chord-progression following — a chromagram extractor, an expected-chord derivation from jam progressions, and the streaming chord-follower grading state machine.

**Architecture:** Three pure pieces in `@repo/music-core`. `computeChroma` turns an audio frame into a 12-bin pitch-class energy vector (Goertzel, no FFT dependency). `expectedChordsFromProgression` turns a `JamProgression` into timed `ExpectedChord[]` via the existing `theory.chordNotes`. `createChordFollower` is a streaming state machine that accepts pitch-class observations and grades each chord on correctness + timing, mirroring the monophonic `score-follower`.

**Tech Stack:** TypeScript, Vitest (`vp test <path> --run`), pnpm workspace (`vp` CLI). No new runtime dependency.

## Global Constraints

- No new dependency: chroma uses Goertzel (no FFT lib); `pitchClass`/`chordNotes` come from `@repo/music-core/engines/theory`.
- Pure/framework-agnostic: no Svelte, no Web Audio, no DOM in these files (that is Phase 2). Files live in `packages/music-core/src/engines/`.
- Test-first (repo "Test First" rule). Run focused tests with `vp test <path> --run`.
- Commit on the branch only (`ge/music-practice-lab`); do NOT merge to main, do NOT push, do NOT stage the local-only root deletions or `.claude/.codex/.serena/.superpowers`.
- New engine exports must be added to `packages/music-core/package.json`.
- This is Phase 1 of the spec `docs/superpowers/specs/2026-06-27-realtime-chord-progression-following-design.md`. Phases 2 (worklet glue), 3 (route/UI), 4 (hardware tuning) are separate plans.

---

### Task 1: `computeChroma` (pitch-class energy via Goertzel)

**Files:**
- Create: `packages/music-core/src/engines/audio-in/chroma.ts`
- Modify: `packages/music-core/src/engines/audio-in/index.ts` (add export)
- Test: `packages/music-core/src/engines/audio-in/chroma.test.ts`

**Interfaces:**
- Consumes: nothing (leaf utility).
- Produces: `computeChroma(frame: Float32Array, options: ChromaOptions): Float32Array` (length 12, normalized 0..1, all-zero for silence); `interface ChromaOptions { sampleRate: number; minMidi?: number; maxMidi?: number }`.

- [ ] **Step 1: Write the failing test**

```ts
// packages/music-core/src/engines/audio-in/chroma.test.ts
import { describe, expect, test } from "vitest";

import { computeChroma } from "./chroma";

const SAMPLE_RATE = 44_100;
const SIZE = 2048;

function tone(freqs: number[]): Float32Array {
  const frame = new Float32Array(SIZE);
  for (let n = 0; n < SIZE; n++) {
    const t = n / SAMPLE_RATE;
    let sum = 0;
    for (const freq of freqs) sum += Math.sin(2 * Math.PI * freq * t);
    frame[n] = sum / freqs.length;
  }
  return frame;
}

describe("computeChroma", () => {
  test("concentrates energy in the played pitch class", () => {
    // 440 Hz = A = pitch class 9.
    const chroma = computeChroma(tone([440]), { sampleRate: SAMPLE_RATE });
    const argmax = [...chroma].indexOf(Math.max(...chroma));
    expect(argmax).toBe(9);
  });

  test("ranks a C-major triad's tones highest", () => {
    // C4 261.63 (pc 0), E4 329.63 (pc 4), G4 392.00 (pc 7).
    const chroma = computeChroma(tone([261.63, 329.63, 392.0]), { sampleRate: SAMPLE_RATE });
    const top3 = [...chroma.keys()].sort((a, b) => chroma[b]! - chroma[a]!).slice(0, 3).sort((a, b) => a - b);
    expect(top3).toEqual([0, 4, 7]);
  });

  test("returns all zeros for silence", () => {
    expect([...computeChroma(new Float32Array(SIZE), { sampleRate: SAMPLE_RATE })]).toEqual(
      Array.from({ length: 12 }, () => 0),
    );
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `vp test packages/music-core/src/engines/audio-in/chroma.test.ts --run`
Expected: FAIL — cannot resolve `./chroma` / `computeChroma is not a function`.

- [ ] **Step 3: Write minimal implementation**

```ts
// packages/music-core/src/engines/audio-in/chroma.ts
/**
 * computeChroma — a 12-bin pitch-class energy vector for one audio frame.
 *
 * Uses the Goertzel algorithm to read energy at the exact target pitch
 * frequencies across a few octaves and folds them into 12 pitch classes. This
 * avoids adding an FFT dependency and stays a pure, testable function (the
 * streaming glue lives in Phase 2). Normalized so the strongest class is 1.
 */

export interface ChromaOptions {
  sampleRate: number;
  /** Lowest MIDI note probed (default 40 = E2). */
  minMidi?: number;
  /** Highest MIDI note probed (default 88 = E6). */
  maxMidi?: number;
}

export function computeChroma(frame: Float32Array, options: ChromaOptions): Float32Array {
  const minMidi = options.minMidi ?? 40;
  const maxMidi = options.maxMidi ?? 88;
  const chroma = new Float32Array(12);

  for (let midi = minMidi; midi <= maxMidi; midi++) {
    const frequency = 440 * 2 ** ((midi - 69) / 12);
    chroma[midi % 12]! += goertzelPower(frame, frequency, options.sampleRate);
  }

  let max = 0;
  for (const value of chroma) if (value > max) max = value;
  if (max > 0) for (let i = 0; i < 12; i++) chroma[i]! /= max;
  return chroma;
}

/** Generalized Goertzel power at `frequency` over the frame. */
function goertzelPower(frame: Float32Array, frequency: number, sampleRate: number): number {
  const k = (frequency / sampleRate) * frame.length;
  const omega = (2 * Math.PI * k) / frame.length;
  const coeff = 2 * Math.cos(omega);
  let s1 = 0;
  let s2 = 0;
  for (let n = 0; n < frame.length; n++) {
    const s0 = frame[n]! + coeff * s1 - s2;
    s2 = s1;
    s1 = s0;
  }
  return s1 * s1 + s2 * s2 - coeff * s1 * s2;
}
```

```ts
// packages/music-core/src/engines/audio-in/index.ts — add near the other exports
export { computeChroma, type ChromaOptions } from "./chroma";
```

- [ ] **Step 4: Run test to verify it passes**

Run: `vp test packages/music-core/src/engines/audio-in/chroma.test.ts --run`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add packages/music-core/src/engines/audio-in/chroma.ts \
        packages/music-core/src/engines/audio-in/chroma.test.ts \
        packages/music-core/src/engines/audio-in/index.ts
git commit -m "feat(music): add Goertzel chromagram for chord following"
```

---

### Task 2: `expectedChordsFromProgression` (timed expected chords)

**Files:**
- Create: `packages/music-core/src/engines/chord-follower/index.ts`
- Modify: `packages/music-core/package.json` (add `"./engines/chord-follower"` export)
- Test: `packages/music-core/src/engines/chord-follower/chord-follower.test.ts`

**Interfaces:**
- Consumes: `chordNotes(symbol: string): string[]` and `pitchClass(note: string): number` from `@repo/music-core/engines/theory`; `JamProgression` / `JamChord` from `@repo/music-core/engines/jam` (`JamChord = { symbol, roman, scale, bars }`).
- Produces: `interface ExpectedChord { symbol: string; pitchClasses: number[]; startBeat: number; durationBeats: number }`; `expectedChordsFromProgression(progression: JamProgression, options?: { beatsPerBar?: number }): ExpectedChord[]`.

- [ ] **Step 1: Write the failing test**

```ts
// packages/music-core/src/engines/chord-follower/chord-follower.test.ts
import { describe, expect, test } from "vitest";

import type { JamProgression } from "@repo/music-core/engines/jam";

import { expectedChordsFromProgression } from "./index";

const II_V_I: JamProgression = {
  id: "ii-v-i",
  name: "ii–V–I",
  key: "C",
  style: "jazz",
  chords: [
    { symbol: "Dm7", roman: "ii", scale: "D dorian", bars: 2 },
    { symbol: "G7", roman: "V", scale: "G mixolydian", bars: 2 },
    { symbol: "Cmaj7", roman: "I", scale: "C major", bars: 2 },
  ],
};

describe("expectedChordsFromProgression", () => {
  test("derives timed pitch-class templates from a jam progression", () => {
    const expected = expectedChordsFromProgression(II_V_I);
    expect(expected).toEqual([
      { symbol: "Dm7", pitchClasses: [0, 2, 5, 9], startBeat: 0, durationBeats: 8 },
      { symbol: "G7", pitchClasses: [2, 5, 7, 11], startBeat: 8, durationBeats: 8 },
      { symbol: "Cmaj7", pitchClasses: [0, 4, 7, 11], startBeat: 16, durationBeats: 8 },
    ]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `vp test packages/music-core/src/engines/chord-follower/chord-follower.test.ts --run`
Expected: FAIL — cannot resolve `./index` / `expectedChordsFromProgression is not a function`.

- [ ] **Step 3: Write minimal implementation**

```ts
// packages/music-core/src/engines/chord-follower/index.ts
/**
 * chord-follower — pure streaming grader for a known chord progression.
 *
 * It never does open chord recognition: it aligns a stream of pitch-class
 * observations (from chroma + onset-confirmed Basic Pitch, supplied by Phase 2)
 * against an expected progression, grading each chord on correctness + timing.
 * Mirrors the monophonic `score-follower`'s shape.
 */

import { chordNotes, pitchClass } from "@repo/music-core/engines/theory";
import type { JamProgression } from "@repo/music-core/engines/jam";

export interface ExpectedChord {
  symbol: string;
  /** Sorted, deduped chord-tone pitch classes. */
  pitchClasses: number[];
  startBeat: number;
  durationBeats: number;
}

export function expectedChordsFromProgression(
  progression: JamProgression,
  options: { beatsPerBar?: number } = {},
): ExpectedChord[] {
  const beatsPerBar = options.beatsPerBar ?? 4;
  let startBeat = 0;
  return progression.chords.map((chord) => {
    const durationBeats = chord.bars * beatsPerBar;
    const pitchClasses = [...new Set(chordNotes(chord.symbol).map((note) => pitchClass(note)))].sort(
      (left, right) => left - right,
    );
    const expected: ExpectedChord = { symbol: chord.symbol, pitchClasses, startBeat, durationBeats };
    startBeat += durationBeats;
    return expected;
  });
}
```

```jsonc
// packages/music-core/package.json — add in the exports map, alphabetically
//   between "./engines/challenges" and "./engines/chord-id":
"./engines/chord-follower": "./src/engines/chord-follower/index.ts",
```

- [ ] **Step 4: Run test to verify it passes**

Run: `vp test packages/music-core/src/engines/chord-follower/chord-follower.test.ts --run`
Expected: PASS (1 test).

- [ ] **Step 5: Commit**

```bash
git add packages/music-core/src/engines/chord-follower/index.ts \
        packages/music-core/src/engines/chord-follower/chord-follower.test.ts \
        packages/music-core/package.json
git commit -m "feat(music): derive timed expected chords from a progression"
```

---

### Task 3: `createChordFollower` (streaming alignment + grading)

**Files:**
- Modify: `packages/music-core/src/engines/chord-follower/index.ts` (append the follower)
- Test: `packages/music-core/src/engines/chord-follower/chord-follower.test.ts` (append a describe block)

**Interfaces:**
- Consumes: `ExpectedChord` (Task 2); `beatToMs(beat, bpm)` and `timingWindowMs({ bpm, durationBeats, strictness })` and `type TimingStrictness` from `@repo/music-core/engines/score-follower`.
- Produces:
  - `type ChordObservationSource = "chroma" | "onset"`
  - `interface ChordObservation { pitchClasses: number[]; confidence: number; source: ChordObservationSource; atMs: number }`
  - `type ChordTimingBand = "early" | "in-time" | "late" | "missed"`
  - `interface ChordGrade { symbol: string; matched: boolean; coverage: number; timingBand: ChordTimingBand; atMs?: number }`
  - `interface ChordFollowerOptions { bpm: number; startAtMs: number; strictness?: TimingStrictness; matchThreshold?: number; advanceThreshold?: number }`
  - `interface ChordFollowerState { currentIndex: number; done: boolean; grades: ChordGrade[]; detectedPitchClasses: number[] }`
  - `interface ChordFollowerSummary { grades: ChordGrade[]; correct: number; total: number; score: number }`
  - `interface ChordFollowerRun { accept(observation: ChordObservation): ChordFollowerState; state(): ChordFollowerState; finish(): ChordFollowerSummary }`
  - `createChordFollower(expected: ExpectedChord[], options: ChordFollowerOptions): ChordFollowerRun`

- [ ] **Step 1: Write the failing test**

```ts
// append to packages/music-core/src/engines/chord-follower/chord-follower.test.ts
import { beatToMs } from "@repo/music-core/engines/score-follower";

import { createChordFollower, type ChordObservation } from "./index";

function onset(pitchClasses: number[], atMs: number): ChordObservation {
  return { pitchClasses, confidence: 1, source: "onset", atMs };
}

describe("createChordFollower", () => {
  const expected = expectedChordsFromProgression(II_V_I); // Dm7, G7, Cmaj7
  const bpm = 120;
  const startAtMs = 1_000;
  const downbeat = (index: number) => startAtMs + beatToMs(expected[index]!.startBeat, bpm);

  test("grades a clean, in-time run as all correct", () => {
    const run = createChordFollower(expected, { bpm, startAtMs });
    run.accept(onset(expected[0]!.pitchClasses, downbeat(0)));
    run.accept(onset(expected[1]!.pitchClasses, downbeat(1)));
    run.accept(onset(expected[2]!.pitchClasses, downbeat(2)));
    const summary = run.finish();

    expect(summary.correct).toBe(3);
    expect(summary.total).toBe(3);
    expect(summary.grades.map((grade) => grade.timingBand)).toEqual(["in-time", "in-time", "in-time"]);
    expect(summary.score).toBe(1);
  });

  test("advances when the next chord is detected and marks a wrong chord unmatched", () => {
    const run = createChordFollower(expected, { bpm, startAtMs });
    run.accept(onset(expected[0]!.pitchClasses, downbeat(0))); // Dm7 correct
    run.accept(onset([1, 3, 6, 8], downbeat(1))); // garbage where G7 should be
    run.accept(onset(expected[2]!.pitchClasses, downbeat(2))); // Cmaj7 correct → advances past G7
    const summary = run.finish();

    expect(summary.grades[0]!.matched).toBe(true);
    expect(summary.grades[1]!.matched).toBe(false);
    expect(summary.grades[2]!.matched).toBe(true);
    expect(summary.correct).toBe(2);
  });

  test("flags a late chord", () => {
    const run = createChordFollower(expected, { bpm, startAtMs, strictness: "strict" });
    run.accept(onset(expected[0]!.pitchClasses, downbeat(0) + 2_000)); // way late
    run.accept(onset(expected[1]!.pitchClasses, downbeat(1)));
    run.finish();
    expect(run.state().grades[0]!.timingBand).toBe("late");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `vp test packages/music-core/src/engines/chord-follower/chord-follower.test.ts --run`
Expected: FAIL — `createChordFollower is not a function`.

- [ ] **Step 3: Write minimal implementation**

```ts
// append to packages/music-core/src/engines/chord-follower/index.ts

import {
  beatToMs,
  timingWindowMs,
  type TimingStrictness,
} from "@repo/music-core/engines/score-follower";

export type ChordObservationSource = "chroma" | "onset";

export interface ChordObservation {
  pitchClasses: number[];
  confidence: number;
  source: ChordObservationSource;
  atMs: number;
}

export type ChordTimingBand = "early" | "in-time" | "late" | "missed";

export interface ChordGrade {
  symbol: string;
  matched: boolean;
  coverage: number;
  timingBand: ChordTimingBand;
  atMs?: number;
}

export interface ChordFollowerOptions {
  bpm: number;
  /** Wall-clock time of beat 0 (the progression downbeat). */
  startAtMs: number;
  strictness?: TimingStrictness;
  /** Coverage of the expected template needed to count a chord as voiced. */
  matchThreshold?: number;
  /** Coverage of the NEXT chord that triggers advancing. */
  advanceThreshold?: number;
}

export interface ChordFollowerState {
  currentIndex: number;
  done: boolean;
  grades: ChordGrade[];
  detectedPitchClasses: number[];
}

export interface ChordFollowerSummary {
  grades: ChordGrade[];
  correct: number;
  total: number;
  score: number;
}

export interface ChordFollowerRun {
  accept(observation: ChordObservation): ChordFollowerState;
  state(): ChordFollowerState;
  finish(): ChordFollowerSummary;
}

function coverage(observed: number[], template: number[]): number {
  if (template.length === 0) return 0;
  const set = new Set(observed);
  let matched = 0;
  for (const pitchClass of template) if (set.has(pitchClass)) matched++;
  return matched / template.length;
}

export function createChordFollower(
  expected: ExpectedChord[],
  options: ChordFollowerOptions,
): ChordFollowerRun {
  const matchThreshold = options.matchThreshold ?? 0.75;
  const advanceThreshold = options.advanceThreshold ?? 0.6;
  const strictness = options.strictness ?? "normal";

  const grades: ChordGrade[] = [];
  let currentIndex = 0;
  let currentBest = 0;
  let firstHitMs: number | undefined;
  let detected: number[] = [];

  function timingBand(chord: ExpectedChord, atMs: number | undefined): ChordTimingBand {
    if (atMs === undefined) return "missed";
    const downbeat = options.startAtMs + beatToMs(chord.startBeat, options.bpm);
    const window = timingWindowMs({
      bpm: options.bpm,
      durationBeats: chord.durationBeats,
      strictness,
    });
    const delta = atMs - downbeat;
    if (Math.abs(delta) <= window) return "in-time";
    return delta < 0 ? "early" : "late";
  }

  function finalizeCurrent(): void {
    const chord = expected[currentIndex];
    if (!chord) return;
    const matched = currentBest >= matchThreshold;
    grades.push({
      symbol: chord.symbol,
      matched,
      coverage: currentBest,
      timingBand: matched ? timingBand(chord, firstHitMs) : "missed",
      ...(matched && firstHitMs !== undefined ? { atMs: firstHitMs } : {}),
    });
    currentBest = 0;
    firstHitMs = undefined;
  }

  function applyTo(index: number, observation: ChordObservation): void {
    const cover = coverage(observation.pitchClasses, expected[index]!.pitchClasses);
    if (cover > currentBest) currentBest = cover;
    if (cover >= matchThreshold && firstHitMs === undefined) firstHitMs = observation.atMs;
  }

  function snapshot(): ChordFollowerState {
    return {
      currentIndex,
      done: currentIndex >= expected.length,
      grades: [...grades],
      detectedPitchClasses: [...detected],
    };
  }

  return {
    accept(observation) {
      detected = [...observation.pitchClasses];
      if (currentIndex >= expected.length) return snapshot();

      const next = expected[currentIndex + 1];
      const coverNext = next ? coverage(observation.pitchClasses, next.pitchClasses) : 0;
      const coverCurrent = coverage(observation.pitchClasses, expected[currentIndex]!.pitchClasses);

      if (next && coverNext >= advanceThreshold && coverNext > coverCurrent) {
        finalizeCurrent();
        currentIndex += 1;
        applyTo(currentIndex, observation);
      } else {
        applyTo(currentIndex, observation);
      }
      return snapshot();
    },
    state: snapshot,
    finish() {
      while (currentIndex < expected.length) {
        finalizeCurrent();
        currentIndex += 1;
      }
      const correct = grades.filter((grade) => grade.matched).length;
      const total = expected.length;
      const score =
        total === 0
          ? 0
          : grades.reduce(
              (sum, grade) =>
                sum + (grade.matched ? (grade.timingBand === "in-time" ? 1 : 0.6) : 0),
              0,
            ) / total;
      return { grades: [...grades], correct, total, score };
    },
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `vp test packages/music-core/src/engines/chord-follower/chord-follower.test.ts --run`
Expected: PASS (4 tests total in the file).

- [ ] **Step 5: Run the verification gates**

Run: `vp run -r check`
Expected: 0 errors (the 3 known pre-existing warnings only). If formatting fails, run `vp check --fix` then re-run.

Run: `vp test --run`
Expected: all green, +8 tests vs the prior total.

- [ ] **Step 6: Commit**

```bash
git add packages/music-core/src/engines/chord-follower/index.ts \
        packages/music-core/src/engines/chord-follower/chord-follower.test.ts
git commit -m "feat(music): add streaming chord-progression follower"
```

---

## Self-Review

**Spec coverage (Phase 1 rows):**
- `computeChroma` (spec component 1) → Task 1. ✓
- `expectedChordsFromProgression` from `JamProgression` via `theory.chordNotes` (spec component 4, expected input) → Task 2. ✓
- `chord-follower` alignment + grading state machine, timing via `beatToMs`/`timingWindowMs`, summary mirroring score-follower (spec component 4) → Task 3. ✓
- Out of Phase 1 (correctly deferred to later plans): `ChordAudioSource` worklet glue + raw-PCM Basic Pitch (Phase 2), route/UI (Phase 3), hardware tuning (Phase 4), and the AGENTS decision change (lands with Phase 3 when the streaming path becomes real). ✓

**Placeholder scan:** No TBD/TODO; every code step has complete code. ✓

**Type consistency:** `ExpectedChord` (Task 2) consumed unchanged in Task 3. `ChordObservation`/`ChordGrade`/`ChordFollowerRun` names match between the Interfaces blocks, the Task 3 test, and the implementation. `coverage()` is the single matching helper. `createChordFollower` signature identical in interface, test, and impl. ✓

## Execution Handoff

After all three tasks: Phase 1 is complete — pure chroma + expected-chord derivation + streaming follower, all unit-tested, no hardware needed. Phase 2 (worklet glue) is the next plan.
