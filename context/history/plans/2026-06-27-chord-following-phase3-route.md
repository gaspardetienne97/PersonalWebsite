# Chord-Following Phase 3 (Live Source + Route) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Wire the live microphone path and a graded `/music/play/chord-progression` drill that grades a player strumming through a known progression in real time, and flip the AGENTS chord-recognition decision to allow this constrained streaming *follower*.

**Architecture:** A `ChordAudioSource` (Web-Audio glue in `audio-in`) emits per-frame `{ chroma, onset, onsetWindow }`. The route converts those into `ChordObservation`s — chroma via a pure threshold (`chromaToPitchClasses`), onsets via the route-level Basic Pitch adapter (`extractBasicPitchNotesFromSamples` → `toPitchClasses`) — and feeds the Phase-1 `createChordFollower`, which grades correctness + timing. Both the audio source and the Basic Pitch analyzer are injectable props, so the route's grading logic is unit-tested headless while the real mic path is verified by a browser smoke.

**Tech Stack:** SvelteKit 2 + Svelte 5 runes, TypeScript, Vitest (`vp test`), preview browser smoke. No new dependency (Web Audio + already-present `@spotify/basic-pitch`).

## Global Constraints

- Reuse, do not re-derive: `computeChroma`/`OnsetDetector`/`FrameRing`/`resampleLinear` (Phase 1+2, `audio-in`), `createChordFollower`/`expectedChordsFromProgression` (Phase 1, `chord-follower`), `toPitchClasses` (`chord-id`), `extractBasicPitchNotesFromSamples` (route Basic Pitch adapter), `JAM_PROGRESSIONS` (`jam`), `useMusicRuntime()` + `runtime.recordPractice`/`runtime.runCountIn`.
- Microphone is user-triggered only: never open `getUserMedia` without an explicit user action; stop capture on route teardown. Pure analysis stays pure/testable; Web-Audio glue stays in `audio-in`.
- **22.05 kHz mono contract:** `ChordAudioSource` MUST hand `extractBasicPitchNotesFromSamples` a window produced by `resampleLinear(raw, ctxRate, 22050)` — Basic Pitch's `Float32Array` path does NO rate/channel validation (verified in Phase 2 review), so construction is the only guarantee.
- The route's audio source and onset analyzer are injectable props (mirror `/music/play/chord-perfect`'s `audioSource`/`analyzeStrum` and `/music/transcribe`'s injected extractor) so route tests never touch a real mic or model.
- Commit on branch `ge/music-practice-lab` ONLY. Do NOT merge to main, do NOT push. Stage only each task's files — NEVER the local-only deletions (IMPLEMENTATIONS.md, "Product Plan.md", two finger-drumming-*.md) or dirs (.claude/.codex/.serena/.superpowers). Pre-commit hook auto-formats.
- New `audio-in` exports go in the EXISTING `./engines/audio-in` barrel (no package.json change).
- Phase 3 of spec `docs/superpowers/specs/2026-06-27-realtime-chord-progression-following-design.md`. Phases 1+2 are done. Phase 4 (real-hardware threshold/hysteresis tuning) stays deferred verification.

---

### Task 1: `chromaToPitchClasses` (threshold a chroma vector)

**Files:**
- Modify: `packages/music-core/src/engines/audio-in/chroma.ts` (append function)
- Modify: `packages/music-core/src/engines/audio-in/index.ts` (export it)
- Test: `packages/music-core/src/engines/audio-in/chroma.test.ts` (append a describe block)

**Interfaces:**
- Consumes: nothing.
- Produces: `chromaToPitchClasses(chroma: Float32Array, threshold?: number): number[]` — pitch classes whose normalized energy is ≥ threshold (default 0.5), ascending.

- [ ] **Step 1: Write the failing test** (append to `chroma.test.ts`)

```ts
import { chromaToPitchClasses } from "./chroma";

describe("chromaToPitchClasses", () => {
  test("keeps pitch classes at or above the threshold", () => {
    const chroma = new Float32Array(12).fill(0.1);
    chroma[0] = 1;
    chroma[4] = 0.8;
    chroma[7] = 0.6;
    expect(chromaToPitchClasses(chroma, 0.5)).toEqual([0, 4, 7]);
  });

  test("returns empty when nothing clears the threshold", () => {
    expect(chromaToPitchClasses(new Float32Array(12).fill(0.2), 0.5)).toEqual([]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `vp test packages/music-core/src/engines/audio-in/chroma.test.ts --run`
Expected: FAIL — `chromaToPitchClasses is not a function`.

- [ ] **Step 3: Write minimal implementation** (append to `chroma.ts`)

```ts
/** Pitch classes whose normalized chroma energy clears `threshold` (ascending). */
export function chromaToPitchClasses(chroma: Float32Array, threshold = 0.5): number[] {
  const out: number[] = [];
  for (let pitchClass = 0; pitchClass < 12; pitchClass++) {
    if ((chroma[pitchClass] ?? 0) >= threshold) out.push(pitchClass);
  }
  return out;
}
```

```ts
// audio-in/index.ts — extend the existing chroma export line:
export { computeChroma, chromaToPitchClasses, type ChromaOptions } from "./chroma";
```

- [ ] **Step 4: Run test to verify it passes**

Run: `vp test packages/music-core/src/engines/audio-in/chroma.test.ts --run`
Expected: PASS (existing 3 + new 2 = 5).

- [ ] **Step 5: Commit**

```bash
git add packages/music-core/src/engines/audio-in/chroma.ts \
        packages/music-core/src/engines/audio-in/chroma.test.ts \
        packages/music-core/src/engines/audio-in/index.ts
git commit -m "feat(music): threshold a chroma vector to pitch classes"
```

---

### Task 2: `ChordAudioSource` (live chroma + onset + onset window)

**Files:**
- Create: `packages/music-core/src/engines/audio-in/chord-source.ts`
- Modify: `packages/music-core/src/engines/audio-in/index.ts` (export)

**Interfaces:**
- Consumes: `computeChroma`, `OnsetDetector`, `FrameRing`, `resampleLinear` (all from `audio-in`); `AudioPitchState`/`AudioPitchStatus` (re-used status shape from `./capture`); the existing `./pitch-worklet.js?raw` worklet.
- Produces:
  - `interface ChordAnalysis { chroma: Float32Array; timestamp: number; onset: boolean; onsetWindow?: Float32Array }` (onsetWindow present only on onset frames; always 22.05 kHz mono).
  - `interface ChordAudioSourceOptions { onset?: OnsetDetectOptions; windowMs?: number }` (windowMs default 600).
  - `class ChordAudioSource { get state; static get supported; start(): Promise<void>; stop(): Promise<void>; subscribeAnalysis(l): () => void; subscribeState(l): () => void }`.

This is Web-Audio glue — like `AudioPitchSource` it has no headless unit test; its verification is the type-check here and the browser smoke in Task 3 (where the route also injects a fake source for logic tests). The worklet/getUserMedia lifecycle is intentionally duplicated from `AudioPitchSource` (ponytail: factor a shared base only if a third source appears).

- [ ] **Step 1: Write the implementation**

```ts
// packages/music-core/src/engines/audio-in/chord-source.ts
/**
 * ChordAudioSource — buffered-streaming capture for chord following.
 *
 * Mirrors AudioPitchSource's getUserMedia/worklet lifecycle, but per frame it
 * computes a chroma vector + onset and keeps recent samples in a FrameRing. On
 * an onset it assembles the last `windowMs` and resamples to 22.05 kHz mono so
 * the route can run Basic Pitch on it. Pure analysis lives in computeChroma /
 * OnsetDetector / FrameRing / resampleLinear; this is only the Web-Audio glue.
 */
import type { MonotonicMs } from "@repo/music-core/domain";

import type { AudioPitchState } from "./capture";
import { computeChroma } from "./chroma";
import { FrameRing } from "./frame-ring";
import { OnsetDetector, type OnsetDetectOptions } from "./onset-detect";
import pitchWorkletSource from "./pitch-worklet.js?raw";
import { resampleLinear } from "./resample";

const BASIC_PITCH_RATE = 22_050;

export interface ChordAnalysis {
  chroma: Float32Array;
  timestamp: number;
  onset: boolean;
  onsetWindow?: Float32Array;
}

export interface ChordAudioSourceOptions {
  onset?: OnsetDetectOptions;
  windowMs?: number;
}

type AnalysisListener = (analysis: ChordAnalysis) => void;
type StateListener = (state: AudioPitchState) => void;

async function loadPitchWorklet(context: AudioContext): Promise<void> {
  const moduleUrl = URL.createObjectURL(
    new Blob([pitchWorkletSource], { type: "text/javascript" }),
  );
  try {
    await context.audioWorklet.addModule(moduleUrl);
  } finally {
    URL.revokeObjectURL(moduleUrl);
  }
}

export class ChordAudioSource {
  #context?: AudioContext;
  #stream?: MediaStream;
  #node?: AudioWorkletNode;
  #source?: MediaStreamAudioSourceNode;

  #state: AudioPitchState = { status: "idle" };
  #onsetDetector: OnsetDetector;
  #windowMs: number;
  #ring = new FrameRing(1);

  #analysisListeners = new Set<AnalysisListener>();
  #stateListeners = new Set<StateListener>();

  constructor(options: ChordAudioSourceOptions = {}) {
    this.#onsetDetector = new OnsetDetector(options.onset);
    this.#windowMs = options.windowMs ?? 600;
  }

  get state(): AudioPitchState {
    return this.#state;
  }

  static get supported(): boolean {
    return (
      typeof navigator !== "undefined" &&
      !!navigator.mediaDevices?.getUserMedia &&
      typeof AudioContext !== "undefined"
    );
  }

  async start(): Promise<void> {
    if (this.#state.status === "running" || this.#state.status === "requesting") return;
    if (!ChordAudioSource.supported) {
      this.#setState({ status: "error", message: "Audio input is not supported here." });
      return;
    }
    this.#setState({ status: "requesting" });
    this.#onsetDetector.reset();
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: false, autoGainControl: false, noiseSuppression: false },
      });
      this.#stream = stream;
      const context = new AudioContext();
      this.#context = context;
      // Ring holds a little more than one window so an onset can look back.
      this.#ring = new FrameRing(Math.ceil((this.#windowMs / 1000) * context.sampleRate * 1.5));
      await loadPitchWorklet(context);
      const source = context.createMediaStreamSource(stream);
      const node = new AudioWorkletNode(context, "pitch-worklet");
      node.port.onmessage = (event: MessageEvent<Float32Array>) => {
        this.#onFrame(event.data, context.sampleRate);
      };
      source.connect(node);
      this.#source = source;
      this.#node = node;
      this.#setState({ status: "running" });
    } catch (err) {
      const denied = err instanceof DOMException && err.name === "NotAllowedError";
      this.#setState({
        status: denied ? "denied" : "error",
        message: denied
          ? "Microphone access was blocked. Allow it to use audio input."
          : err instanceof Error
            ? err.message
            : "Could not start audio input.",
      });
      await this.stop();
    }
  }

  async stop(): Promise<void> {
    this.#node?.port.close();
    this.#node?.disconnect();
    this.#source?.disconnect();
    this.#stream?.getTracks().forEach((track) => track.stop());
    if (this.#context && this.#context.state !== "closed") await this.#context.close();
    this.#node = undefined;
    this.#source = undefined;
    this.#stream = undefined;
    this.#context = undefined;
    this.#onsetDetector.reset();
    if (this.#state.status === "running") this.#setState({ status: "idle" });
  }

  subscribeAnalysis(listener: AnalysisListener): () => void {
    this.#analysisListeners.add(listener);
    return () => this.#analysisListeners.delete(listener);
  }

  subscribeState(listener: StateListener): () => void {
    this.#stateListeners.add(listener);
    listener(this.#state);
    return () => this.#stateListeners.delete(listener);
  }

  #onFrame(frame: Float32Array, sampleRate: number): void {
    if (this.#analysisListeners.size === 0) return;
    this.#ring.push(frame);
    const timestamp = (globalThis.performance?.now() ?? 0) as MonotonicMs;
    const chroma = computeChroma(frame, { sampleRate });
    const detection = this.#onsetDetector.process(frame, timestamp);
    const onset = detection !== undefined;
    let onsetWindow: Float32Array | undefined;
    if (onset) {
      const raw = this.#ring.takeLast(Math.ceil((this.#windowMs / 1000) * sampleRate));
      // Construction guarantees the 22.05 kHz mono contract Basic Pitch won't check.
      onsetWindow = resampleLinear(raw, sampleRate, BASIC_PITCH_RATE);
    }
    const analysis: ChordAnalysis = { chroma, timestamp, onset, ...(onsetWindow ? { onsetWindow } : {}) };
    for (const listener of this.#analysisListeners) listener(analysis);
  }

  #setState(state: AudioPitchState): void {
    this.#state = state;
    for (const listener of this.#stateListeners) listener(state);
  }
}
```

```ts
// audio-in/index.ts — add near the other exports
export {
  ChordAudioSource,
  type ChordAnalysis,
  type ChordAudioSourceOptions,
} from "./chord-source";
```

- [ ] **Step 2: Type-check**

Run: `vp run -r check`
Expected: 0 errors (only the 3 known pre-existing warnings). If formatting fails, `vp check --fix` then re-check.

- [ ] **Step 3: Commit**

```bash
git add packages/music-core/src/engines/audio-in/chord-source.ts \
        packages/music-core/src/engines/audio-in/index.ts
git commit -m "feat(music): add ChordAudioSource live capture (chroma + onset window)"
```

---

### Task 3: `/music/play/chord-progression` route + AGENTS decision flip

**Files:**
- Create: `src/routes/music/play/chord-progression/+page.svelte`
- Create: `src/routes/music/play/chord-progression/page.svelte.test.ts`
- Modify: `src/routes/music/_components/MusicNavigation.svelte` (add a Play link)
- Modify: `src/routes/music/AGENTS.md` (decision flip + route entry)

**Interfaces:**
- Consumes: `ChordAudioSource`/`ChordAnalysis` (Task 2), `chromaToPitchClasses` (Task 1), `createChordFollower`/`expectedChordsFromProgression`/`ChordObservation`/`ChordGrade` (`chord-follower`), `toPitchClasses` (`chord-id`), `extractBasicPitchNotesFromSamples` (`../../transcribe/basic-pitch-extractor`), `JAM_PROGRESSIONS` (`jam`), `useMusicRuntime()`.
- Produces: a route whose two production dependencies are injectable props for tests:
  - `audioSource?: ChordSourceLike` — `{ state; start(); stop(); subscribeAnalysis(cb); subscribeState(cb) }` (default `new ChordAudioSource()`).
  - `analyzeOnsetWindow?: (window: Float32Array) => Promise<number[]>` — returns detected MIDI notes (default wraps `extractBasicPitchNotesFromSamples` → `notes.map(n => n.midiNote)`).

**Route behavior contract (what the test asserts):**
1. Pick a `JamProgression` (default `JAM_PROGRESSIONS[0]`) + a tempo; build `expectedChordsFromProgression(progression)`.
2. "Start" → user-gesture; `runtime.runCountIn()` gives `startAtMs`; `createChordFollower(expected, { bpm, startAtMs })`; `audioSource.start()`.
3. On each `ChordAnalysis`: build a `ChordObservation` and `follower.accept(it)`:
   - chroma → `{ pitchClasses: chromaToPitchClasses(a.chroma), confidence: 0.4, source: "chroma", atMs: a.timestamp }`.
   - if `a.onsetWindow`: `const midi = await analyzeOnsetWindow(a.onsetWindow); follower.accept({ pitchClasses: toPitchClasses(midi), confidence: 0.9, source: "onset", atMs: a.timestamp })`.
   - keep reactive `state` from `follower.state()` for the HUD; when `state.done` (or "Stop"), call `follower.finish()`, `audioSource.stop()`, and record one practice entry.
4. Completion → `runtime.recordPractice({ source: "drill", instrument: "guitar", tags: ["technique", "chord-changes"], scoringEvents: [], xpEarned: Math.round(summary.score * 20), note: \`Chord progression · ${summary.correct}/${summary.total} chords\` })`. No fabricated per-skill mastery events (scoringEvents stays empty for v1).
5. HUD: progression name, tempo, a row per expected chord with its symbol + a grade badge (pending / matched in-time / matched off-time / missed), and the live detected pitch-class labels. Markup follows the `/music/play/chord-perfect` `PracticeScreen` + `Card` + `HudTile` structure; do NOT invent new primitives.

- [ ] **Step 1: Write the failing route test** (drives the follower via an injected source + analyzer — no mic, no model)

```ts
// src/routes/music/play/chord-progression/page.svelte.test.ts
import { afterEach, describe, expect, test, vi } from "vite-plus/test";
import { render } from "vitest-browser-svelte";

import { expectedChordsFromProgression } from "@repo/music-core/engines/chord-follower";
import { JAM_PROGRESSIONS } from "@repo/music-core/engines/jam";

import Page from "./+page.svelte";

afterEach(() => {
  document.body.replaceChildren();
});

function button(label: string): HTMLButtonElement | undefined {
  return [...document.querySelectorAll<HTMLButtonElement>("button")].find(
    (b) => b.textContent?.trim() === label,
  );
}

test("grades a strummed progression from injected onset observations", async () => {
  let analysisCb: ((a: { chroma: Float32Array; timestamp: number; onset: boolean; onsetWindow?: Float32Array }) => void) | undefined;
  const audioSource = {
    state: { status: "idle" as const },
    start: vi.fn(async () => {}),
    stop: vi.fn(async () => {}),
    subscribeState: vi.fn(() => () => {}),
    subscribeAnalysis: vi.fn((cb: typeof analysisCb) => {
      analysisCb = cb;
      return () => {};
    }),
  };
  const expected = expectedChordsFromProgression(JAM_PROGRESSIONS[0]!);
  // Injected analyzer returns, per call, the MIDI of the next expected chord in order.
  let call = 0;
  const analyzeOnsetWindow = vi.fn(async () => {
    const chord = expected[Math.min(call++, expected.length - 1)]!;
    return chord.pitchClasses.map((pc) => 60 + pc);
  });

  render(Page, { audioSource, analyzeOnsetWindow });
  button("Start")?.click();
  await vi.waitFor(() => expect(audioSource.start).toHaveBeenCalled());

  // Emit one onset per expected chord; the follower should advance + grade each.
  for (let i = 0; i < expected.length; i++) {
    analysisCb?.({ chroma: new Float32Array(12), timestamp: 1000 + i, onset: true, onsetWindow: new Float32Array(8) });
    await vi.waitFor(() => expect(analyzeOnsetWindow).toHaveBeenCalledTimes(i + 1));
  }

  await vi.waitFor(() => {
    expect(document.body.textContent).toContain(expected[0]!.symbol);
    expect(document.body.textContent).toContain(expected[expected.length - 1]!.symbol);
  });
  expect(audioSource.subscribeAnalysis).toHaveBeenCalled();
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `vp test src/routes/music/play/chord-progression/page.svelte.test.ts --run`
Expected: FAIL — route module does not exist.

- [ ] **Step 3: Implement the route**

Build `+page.svelte` to satisfy the behavior contract above, following `/music/play/chord-perfect/+page.svelte` for: `$props()` destructure with defaults (`audioSource = new ChordAudioSource()`, `analyzeOnsetWindow = defaultAnalyzeOnsetWindow`), `useMusicRuntime()`, `onMount`/`onDestroy` subscription + teardown (`audioSource.stop()` on destroy), `PracticeScreen`/`PracticeScreenHeader`/`Card`/`HudTile`/`Button`/`SegmentedControl` primitives, and `runtime.recordPractice`. Key wiring:

```ts
const { audioSource = new ChordAudioSource(), analyzeOnsetWindow = defaultAnalyzeOnsetWindow }:
  { audioSource?: ChordSourceLike; analyzeOnsetWindow?: (w: Float32Array) => Promise<number[]> } = $props();

async function defaultAnalyzeOnsetWindow(window: Float32Array): Promise<number[]> {
  const { extractBasicPitchNotesFromSamples } = await import("../../transcribe/basic-pitch-extractor");
  const notes = await extractBasicPitchNotesFromSamples(window);
  return notes.map((note) => note.midiNote);
}

let progression = $state(JAM_PROGRESSIONS[0]!);
let bpm = $state(90);
let followerState = $state<ChordFollowerState | undefined>();
let detected = $state<number[]>([]);
let follower: ChordFollowerRun | undefined;
let unsubscribe: (() => void) | undefined;
let captured = false;

const expected = $derived(expectedChordsFromProgression(progression));

async function start() {
  const startAtMs = await runtime.runCountIn();
  follower = createChordFollower(expected, { bpm, startAtMs });
  followerState = follower.state();
  captured = false;
  unsubscribe = audioSource.subscribeAnalysis(onAnalysis);
  await audioSource.start();
}

async function onAnalysis(a: ChordAnalysis): Promise<void> {
  if (!follower) return;
  if (a.onsetWindow) {
    const midi = await analyzeOnsetWindow(a.onsetWindow);
    followerState = follower.accept({ pitchClasses: toPitchClasses(midi), confidence: 0.9, source: "onset", atMs: a.timestamp });
    detected = toPitchClasses(midi);
  } else {
    followerState = follower.accept({ pitchClasses: chromaToPitchClasses(a.chroma), confidence: 0.4, source: "chroma", atMs: a.timestamp });
  }
  if (followerState.done) await finish();
}

async function finish() {
  if (!follower || captured) return;
  captured = true;
  const summary = follower.finish();
  unsubscribe?.();
  await audioSource.stop();
  void runtime.recordPractice({
    source: "drill",
    instrument: "guitar",
    tags: ["technique", "chord-changes"],
    scoringEvents: [],
    xpEarned: Math.round(summary.score * 20),
    note: `Chord progression · ${summary.correct}/${summary.total} chords`,
  });
}
```

Markup: a setup `Card` (progression `SegmentedControl`/select + tempo), a Start/Stop `Button`, and a HUD `Card` listing `{#each expected as chord, i}` with the chord symbol and a badge derived from `followerState?.grades[i]` (pending if absent; else matched/timingBand or "missed"), plus a detected-tones line (`detected.map(pitchClassLabel)`). Add `pitchClassLabel` locally (same 12-name array used in chord-perfect).

- [ ] **Step 4: Run the route test**

Run: `vp test src/routes/music/play/chord-progression/page.svelte.test.ts --run`
Expected: PASS.

- [ ] **Step 5: Add the nav link**

In `src/routes/music/_components/MusicNavigation.svelte`, add a Play-section link to `/music/play/chord-progression` labeled "Chord Progression" beside the other `/music/play/*` drills.

- [ ] **Step 6: Flip the AGENTS decision + add the route entry**

In `src/routes/music/AGENTS.md`, replace the `**Chord recognition:**` decision so it reads (keep the surrounding bullets):

```
- **Chord recognition:** Do not attempt OPEN real-time polyphonic recognition
  ("what chord is this, out of all chords?"). Two constrained paths are
  sanctioned: (1) buffered analyze-on-demand identification (`chord-id` +
  `recordMicClip`/Basic Pitch); and (2) real-time **chord following** of a KNOWN
  progression — `ChordAudioSource` streams chroma + onset windows, the route
  turns them into `ChordObservation`s (chroma via `chromaToPitchClasses`, onsets
  via buffered Basic Pitch), and `chord-follower` aligns/grades them against the
  expected progression. Following is allowed because it matches against a known
  target set, stays worklet-isolated, and is unit-testable via injected
  observations; do not widen `chord-follower` into open classification.
```

Add a `/music/play/chord-progression` bullet in the Current Routes section describing the graded follower drill (injectable `audioSource`/`analyzeOnsetWindow`; grades correctness + timing; records one journal entry; real-strum accuracy is Phase 4 hardware-pending).

- [ ] **Step 7: Gates + commit**

Run: `vp run -r check` → 0 errors. Run: `vp test --run` → all green. (If formatting, `vp check --fix`.)

```bash
git add src/routes/music/play/chord-progression/ \
        src/routes/music/_components/MusicNavigation.svelte \
        src/routes/music/AGENTS.md
git commit -m "feat(music): add graded chord-progression following drill"
```

- [ ] **Step 8: Browser smoke (controller runs this after the task review, not the implementer)**

Start the preview, open `/music/play/chord-progression`, confirm the page renders (progression + tempo + Start, the per-chord HUD list) with no console errors. Real-mic accuracy is Phase 4 (hardware-pending) — the smoke only proves the page mounts and the source wires without runtime errors.

---

## Self-Review

**Spec coverage (Phase 3):**
- `ChordAudioSource` worklet glue (chroma + onset + ring + resampled onset window, 22.05k-mono by construction) → Task 2. ✓
- Chroma → pitch-class observation seam → Task 1 (`chromaToPitchClasses`). ✓
- Route: known-progression follower drill grading correctness + timing, fed by chroma + buffered-Basic-Pitch onsets through `chord-follower`, journal/XP on completion, injectable for tests → Task 3. ✓
- AGENTS decision flip (allow constrained following; keep open recognition banned) → Task 3 Step 6. ✓
- Out of scope: real-hardware threshold/hysteresis tuning (Phase 4, deferred verification).

**Placeholder scan:** No TBD/TODO. Task 2 is glue (no headless unit test, stated, verified by type-check + Task 3 browser smoke). Task 3's markup is specified by reference to the existing chord-perfect route with the testable logic given as complete code + a complete route test — not a placeholder.

**Type consistency:** `ChordAnalysis` (Task 2) consumed in Task 3's `onAnalysis`. `ChordObservation`/`ChordGrade`/`ChordFollowerRun`/`ChordFollowerState` come from Phase 1 `chord-follower` unchanged. `chromaToPitchClasses` (Task 1) and `toPitchClasses` (`chord-id`) used as defined. The injected `audioSource` shape (`ChordSourceLike`) matches `ChordAudioSource`'s public surface (`state`/`start`/`stop`/`subscribeAnalysis`/`subscribeState`).

## Execution Handoff

After these three tasks: the live chord-following drill is built and its grading logic is unit-tested via injection; the real mic→chroma→onset→Basic Pitch→follower path is wired and renders clean in a browser smoke. What remains is **Phase 4** — real-hardware threshold/hysteresis/smoothing calibration on a physical guitar/uke (deferred verification; cannot be done headless).
