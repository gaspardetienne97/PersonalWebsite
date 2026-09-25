# Chord-Following Phase 2 (Capture Seams) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the headless-testable capture seams the real-time chord follower needs — a linear resampler, a sample ring buffer for assembling onset windows, and a raw-PCM entry point into the existing Basic Pitch adapter.

**Architecture:** Two pure modules in the `audio-in` engine (`resampleLinear`, `FrameRing`) plus a behavior-preserving refactor of the route-level Basic Pitch adapter so a `Float32Array` (already 22.05 kHz mono) can be analyzed without decoding a `File`. These are the pieces `ChordAudioSource` will wire together — but the Web-Audio glue class itself moves to Phase 3, where the route exercises it via an injectable seam and a browser smoke (a glue class with no proving ground has no place in a TDD plan).

**Tech Stack:** TypeScript, Vitest (`vp test <path> --run`), pnpm workspace (`vp`). `@spotify/basic-pitch` is already a dependency. No new dependency.

## Global Constraints

- No new dependency. Pure modules are framework-agnostic: no Svelte, no Web Audio, no DOM in `resample.ts` / `frame-ring.ts`. The Basic Pitch adapter is route-level browser code (it already imports `@spotify/basic-pitch`); keep it there.
- Test-first for the two pure modules. Run focused tests with `vp test <path> --run`.
- Commit on branch `ge/music-practice-lab` ONLY. Do NOT merge to main, do NOT push. Stage only each task's own files — NEVER stage the local-only deletions (IMPLEMENTATIONS.md, "Product Plan.md", two finger-drumming-*.md) or dirs (.claude/.codex/.serena/.superpowers). A pre-commit hook auto-formats staged files.
- New engine exports go in `packages/music-core/package.json` only if a new subpath is added; `resampleLinear`/`FrameRing` are added to the EXISTING `./engines/audio-in` barrel (`src/engines/audio-in/index.ts`), so no package.json change.
- Phase 2 of spec `docs/superpowers/specs/2026-06-27-realtime-chord-progression-following-design.md`. Phase 1 (pure core) is done. `ChordAudioSource` + route + the AGENTS decision flip are Phase 3; hardware tuning is Phase 4.

---

### Task 1: `resampleLinear` (linear-interpolation resampler)

**Files:**
- Create: `packages/music-core/src/engines/audio-in/resample.ts`
- Modify: `packages/music-core/src/engines/audio-in/index.ts` (add export)
- Test: `packages/music-core/src/engines/audio-in/resample.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: `resampleLinear(samples: Float32Array, fromRate: number, toRate: number): Float32Array` — linear-interpolated resample; returns a copy when rates are equal; empty in → empty out.

- [ ] **Step 1: Write the failing test**

```ts
// packages/music-core/src/engines/audio-in/resample.test.ts
import { describe, expect, test } from "vitest";

import { resampleLinear } from "./resample";

describe("resampleLinear", () => {
  test("returns a copy when the rate is unchanged", () => {
    const input = new Float32Array([0, 1, 2, 3]);
    const output = resampleLinear(input, 100, 100);
    expect([...output]).toEqual([0, 1, 2, 3]);
    expect(output).not.toBe(input);
  });

  test("halves the length when downsampling 2:1", () => {
    // 44.1k → 22.05k is exactly this ratio.
    const output = resampleLinear(new Float32Array([0, 2, 4, 6]), 4, 2);
    expect([...output]).toEqual([0, 4]);
  });

  test("linearly interpolates between samples when upsampling", () => {
    const output = resampleLinear(new Float32Array([0, 10]), 2, 3);
    expect(output.length).toBe(3);
    expect(output[0]).toBeCloseTo(0, 5);
    expect(output[1]).toBeCloseTo(6.6667, 3);
    expect(output[2]).toBeCloseTo(10, 5);
  });

  test("returns empty for empty input", () => {
    expect(resampleLinear(new Float32Array(), 44_100, 22_050).length).toBe(0);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `vp test packages/music-core/src/engines/audio-in/resample.test.ts --run`
Expected: FAIL — cannot resolve `./resample`.

- [ ] **Step 3: Write minimal implementation**

```ts
// packages/music-core/src/engines/audio-in/resample.ts
/**
 * resampleLinear — linear-interpolation resampler for mono PCM.
 *
 * Used to bring captured mic frames (at the AudioContext sample rate) down to
 * Basic Pitch's 22.05 kHz. Pure and testable; the Web-Audio capture that feeds
 * it lives in Phase 3.
 */
export function resampleLinear(
  samples: Float32Array,
  fromRate: number,
  toRate: number,
): Float32Array {
  if (samples.length === 0) return new Float32Array();
  if (fromRate === toRate) return samples.slice();

  const ratio = toRate / fromRate;
  const outLength = Math.max(1, Math.round(samples.length * ratio));
  const out = new Float32Array(outLength);
  for (let i = 0; i < outLength; i++) {
    const sourcePos = i / ratio;
    const i0 = Math.floor(sourcePos);
    const i1 = Math.min(i0 + 1, samples.length - 1);
    const frac = sourcePos - i0;
    out[i] = samples[i0]! * (1 - frac) + samples[i1]! * frac;
  }
  return out;
}
```

```ts
// packages/music-core/src/engines/audio-in/index.ts — add near the other exports
export { resampleLinear } from "./resample";
```

- [ ] **Step 4: Run test to verify it passes**

Run: `vp test packages/music-core/src/engines/audio-in/resample.test.ts --run`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add packages/music-core/src/engines/audio-in/resample.ts \
        packages/music-core/src/engines/audio-in/resample.test.ts \
        packages/music-core/src/engines/audio-in/index.ts
git commit -m "feat(music): add linear resampler for chord-capture windows"
```

---

### Task 2: `FrameRing` (sample ring buffer + window assembly)

**Files:**
- Create: `packages/music-core/src/engines/audio-in/frame-ring.ts`
- Modify: `packages/music-core/src/engines/audio-in/index.ts` (add export)
- Test: `packages/music-core/src/engines/audio-in/frame-ring.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: `class FrameRing { constructor(capacity: number); push(frame: Float32Array): void; takeLast(count: number): Float32Array; get size(): number }` — a fixed-capacity ring of the most recent samples; `takeLast(n)` returns up to the last `n` samples in chronological order.

- [ ] **Step 1: Write the failing test**

```ts
// packages/music-core/src/engines/audio-in/frame-ring.test.ts
import { describe, expect, test } from "vitest";

import { FrameRing } from "./frame-ring";

describe("FrameRing", () => {
  test("returns the most recent samples in order", () => {
    const ring = new FrameRing(4);
    ring.push(new Float32Array([1, 2, 3]));
    expect(ring.size).toBe(3);
    expect([...ring.takeLast(2)]).toEqual([2, 3]);
  });

  test("overwrites oldest samples past capacity", () => {
    const ring = new FrameRing(4);
    ring.push(new Float32Array([1, 2, 3]));
    ring.push(new Float32Array([4, 5]));
    // capacity 4 keeps the last four: 2,3,4,5
    expect(ring.size).toBe(4);
    expect([...ring.takeLast(4)]).toEqual([2, 3, 4, 5]);
  });

  test("clamps takeLast to what is stored", () => {
    const ring = new FrameRing(8);
    ring.push(new Float32Array([7, 8, 9]));
    expect([...ring.takeLast(100)]).toEqual([7, 8, 9]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `vp test packages/music-core/src/engines/audio-in/frame-ring.test.ts --run`
Expected: FAIL — cannot resolve `./frame-ring`.

- [ ] **Step 3: Write minimal implementation**

```ts
// packages/music-core/src/engines/audio-in/frame-ring.ts
/**
 * FrameRing — fixed-capacity ring of the most recent mono PCM samples.
 *
 * Lets the Phase 3 capture grab the last ~0.5 s around an onset for buffered
 * Basic Pitch confirmation without holding the whole session in memory. Pure
 * and testable; sized by the caller to its window length.
 */
export class FrameRing {
  #buffer: Float32Array;
  #size = 0;
  #write = 0;

  constructor(capacity: number) {
    this.#buffer = new Float32Array(Math.max(1, Math.floor(capacity)));
  }

  push(frame: Float32Array): void {
    for (let i = 0; i < frame.length; i++) {
      this.#buffer[this.#write] = frame[i]!;
      this.#write = (this.#write + 1) % this.#buffer.length;
      if (this.#size < this.#buffer.length) this.#size++;
    }
  }

  /** Up to the last `count` samples, oldest-first. */
  takeLast(count: number): Float32Array {
    const n = Math.min(Math.max(0, Math.floor(count)), this.#size);
    const out = new Float32Array(n);
    let read = (this.#write - n + this.#buffer.length) % this.#buffer.length;
    for (let i = 0; i < n; i++) {
      out[i] = this.#buffer[read]!;
      read = (read + 1) % this.#buffer.length;
    }
    return out;
  }

  get size(): number {
    return this.#size;
  }
}
```

```ts
// packages/music-core/src/engines/audio-in/index.ts — add near the other exports
export { FrameRing } from "./frame-ring";
```

- [ ] **Step 4: Run test to verify it passes**

Run: `vp test packages/music-core/src/engines/audio-in/frame-ring.test.ts --run`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add packages/music-core/src/engines/audio-in/frame-ring.ts \
        packages/music-core/src/engines/audio-in/frame-ring.test.ts \
        packages/music-core/src/engines/audio-in/index.ts
git commit -m "feat(music): add sample ring buffer for onset windows"
```

---

### Task 3: Raw-PCM Basic Pitch entry point (adapter refactor)

**Files:**
- Modify: `src/routes/music/transcribe/basic-pitch-extractor.ts`
- Test (regression, unchanged): `src/routes/music/transcribe/basic-pitch-extractor.test.ts`

**Interfaces:**
- Consumes: the existing `@spotify/basic-pitch` model path in this file.
- Produces: `extractBasicPitchNotesFromSamples(samples: Float32Array, onProgress?: BasicPitchProgressCallback): Promise<ExtractedTranscriptionNote[]>` — runs Basic Pitch on samples that are ALREADY 22.05 kHz mono (the Phase 3 capture resamples before calling). The existing `extractBasicPitchNotes(file)` keeps its behavior by sharing the same model-eval core.

This task is a behavior-preserving refactor that adds a raw-samples entry. The model path cannot be unit-tested headless (it needs the browser TF runtime + a real clip); its verification is the existing extractor tests staying green plus the Phase 3 browser smoke. So the test cycle here is "the regression suite still passes after the refactor", not a new unit test.

- [ ] **Step 1: Refactor — extract the shared model-eval core**

In `src/routes/music/transcribe/basic-pitch-extractor.ts`, replace the body of `extractBasicPitchNotes` and add the new functions so the model-eval block is shared. The decode-from-File path and the raw-samples path both call one core:

```ts
export async function extractBasicPitchNotes(
  file: File,
  onProgress: BasicPitchProgressCallback = () => undefined,
): Promise<ExtractedTranscriptionNote[]> {
  if (typeof AudioContext === "undefined" || typeof OfflineAudioContext === "undefined") {
    throw new Error("Basic Pitch extraction requires browser audio APIs.");
  }
  return evaluateBasicPitchAudio(await decodeToBasicPitchAudio(file), onProgress);
}

/**
 * Analyze samples that are ALREADY 22.05 kHz mono (e.g. a resampled onset
 * window from the live capture). Skips File decode; shares the model-eval core.
 */
export async function extractBasicPitchNotesFromSamples(
  samples: Float32Array,
  onProgress: BasicPitchProgressCallback = () => undefined,
): Promise<ExtractedTranscriptionNote[]> {
  return evaluateBasicPitchAudio(samples, onProgress);
}

async function evaluateBasicPitchAudio(
  audio: Float32Array,
  onProgress: BasicPitchProgressCallback,
): Promise<ExtractedTranscriptionNote[]> {
  const { BasicPitch, addPitchBendsToNoteEvents, noteFramesToTime, outputToNotesPoly } =
    await import("@spotify/basic-pitch");

  const frames: number[][] = [];
  const onsets: number[][] = [];
  const contours: number[][] = [];
  const model = new BasicPitch(createBasicPitchModelUrl(modelShardUrl));
  try {
    try {
      await model.evaluateModel(
        audio,
        (nextFrames, nextOnsets, nextContours) => {
          frames.push(...nextFrames);
          onsets.push(...nextOnsets);
          contours.push(...nextContours);
        },
        onProgress,
      );
    } catch (error) {
      throw new Error(
        `Could not run Basic Pitch locally. ${error instanceof Error ? error.message : "Model evaluation failed."}`,
      );
    }
    const notes = noteFramesToTime(
      addPitchBendsToNoteEvents(contours, outputToNotesPoly(frames, onsets, 0.25, 0.25, 5)),
    );
    return basicPitchNotesToExtracted(notes);
  } finally {
    void model.model.then((graphModel) => graphModel.dispose()).catch(() => undefined);
  }
}
```

Leave `decodeToBasicPitchAudio`, `basicPitchNotesToExtracted`, `withPatchedWeightManifestPaths`, `createBasicPitchModelUrl`, `tensorFlowWeightPathForModelEndpoint`, and the helpers unchanged.

- [ ] **Step 2: Run the regression test to confirm the refactor preserved behavior**

Run: `vp test src/routes/music/transcribe/basic-pitch-extractor.test.ts --run`
Expected: PASS (4 tests — note conversion, manifest patching, weight paths, model endpoint).

- [ ] **Step 3: Type-check**

Run: `vp run -r check`
Expected: 0 errors (only the 3 known pre-existing warnings). If formatting fails, run `vp check --fix` then re-run.

- [ ] **Step 4: Commit**

```bash
git add src/routes/music/transcribe/basic-pitch-extractor.ts
git commit -m "refactor(music): add raw-PCM Basic Pitch entry for live capture"
```

---

## Self-Review

**Spec coverage (Phase 2 rows):**
- Resample captured frames to 22.05 kHz (spec component 3, data flow "resampled") → Task 1. ✓
- Ring buffer of recent frames to assemble a ~0.5 s onset window (spec component 2, "maintains a small ring buffer") → Task 2. ✓
- Raw-`Float32Array` Basic Pitch entry point that skips File decode (spec component 3) → Task 3. ✓
- Deliberately moved to Phase 3 (documented above): `ChordAudioSource` Web-Audio glue, because it is only meaningfully verifiable when the route injects/exercises it. The pure seams it depends on are all delivered here. ✓
- Out of scope (later phases): route/UI + AGENTS decision flip (Phase 3), hardware tuning (Phase 4).

**Placeholder scan:** No TBD/TODO; every code step has complete code. Task 3 is explicitly a refactor whose verification is the regression suite, not a fabricated unit test — stated, not hidden. ✓

**Type consistency:** `resampleLinear` and `FrameRing` signatures match between Interfaces, tests, and impl. `extractBasicPitchNotesFromSamples` reuses the existing `BasicPitchProgressCallback` / `ExtractedTranscriptionNote` types; `evaluateBasicPitchAudio` is the single shared core both public functions call. ✓

## Execution Handoff

After these three tasks: Phase 2's testable seams are in place (resampler + ring buffer unit-tested; raw Basic Pitch entry refactored with the regression suite green). Phase 3 (`ChordAudioSource` + `/music/play/chord-progression` route + the AGENTS decision flip) is the next plan and is where the end-to-end mic path gets its browser smoke; real-hardware tuning is Phase 4.
