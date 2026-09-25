# Real-Time Chord-Progression Following — Design (Option C, hybrid)

Status: draft for review · Branch: `ge/music-practice-lab` · 2026-06-27

## Goal

Grade a player strumming through a **known** chord progression in real time: for
each expected chord, score whether it was voiced correctly and on time, and
advance through the progression as the player moves. Reuse the existing jam
progressions and the monophonic score-follower's architecture.

This deliberately revisits the AGENTS rule "no real-time streaming polyphonic
chord detection." The escape the rule already names — "extend only when the
exercise contract is explicit and testable" — applies: a **known progression**
turns open recognition into a constrained *alignment* problem (chord
**following**, not chord recognition).

## The core idea (why this is tractable)

We never ask "what chord is this, out of all chords?" We ask "is the player
voicing the **expected** chord, and have they moved to the next one?" Matching a
live signal against a tiny known set (current chord + neighbors) is far more
robust than open classification — the same constraint that made target
verification easy.

## Architecture — hybrid (Option C)

Two cooperating layers:

- **Cheap, continuous (chroma):** every audio frame (~46 ms, the existing 2048
  worklet frame), compute a 12-bin pitch-class energy vector and an onset
  signal. Gives "are we currently on the expected chord?" and "a strum just
  landed" at frame rate.
- **Accurate, sparse (Basic Pitch confirm):** on each onset, run the existing
  buffered Basic Pitch adapter over a short window around the strum to get a
  high-confidence pitch-class set. Used to *grade* the chord; chroma fills the
  gaps between onsets and detects change.

The follower fuses them: onset-confirmed observations are strong evidence
(grade + advance); chroma is continuous low-weight evidence (track / detect
change). Timing is graded from the **onset timestamp** (cheap, accurate); chord
identity is confirmed slightly later by Basic Pitch — a clean split that keeps
timing tight despite model latency.

### Data flow

```
mic → AudioWorklet (2048-sample frames, posted to main thread as today)
   main thread, per posted frame:
        ├─ computeChroma(frame)         → Float32Array(12)   [pure]
        └─ OnsetDetector.process(frame) → onset?             [existing]
   ChordAudioSource emits { chroma, onset?, timestamp }
        on onset: assemble ~0.5 s ring-buffer window → Basic Pitch (raw PCM)
                  → confirmed pitchClasses
   → ChordFollower.accept(observation)  [pure state machine]
        observation = { pitchClasses, confidence, source: "chroma" | "onset", t }
   → follower state (current chord, match, per-chord grade, advance)
   → HUD + on completion → runtime.recordPractice (XP / mastery / journal)
```

## Components

### 1. `computeChroma(frame, sampleRate, options?) → Float32Array(12)` — pure, in `audio-in`
- **Goertzel-based**, not full FFT: evaluate energy at the exact target pitch
  frequencies across ~4 octaves (e.g. MIDI 40–88), fold into 12 pitch classes,
  normalize. Goertzel is ~exact energy at chosen frequencies, ~48 evaluations
  per frame — lazy, cheap, and trivially testable (no FFT dependency to add).
- Test: synthetic 440 Hz sine → energy concentrated in pitch class 9 (A); a
  C-major triad mix → peaks at {0,4,7}.

### 2. `ChordAudioSource` — worklet glue, in `audio-in`
- Mirrors `AudioPitchSource` (same getUserMedia/worklet lifecycle). The worklet
  keeps posting raw frames (as today); on each posted frame the **main thread**
  runs `computeChroma(frame)` + `OnsetDetector.process(frame)` — the same
  main-thread pattern the existing `detectPitch` path uses, so `computeChroma`
  stays one pure, tested TS function rather than duplicated worklet JS. Goertzel
  is cheap enough that this is fine; revisit only if profiling says otherwise.
- Maintains a small ring buffer of recent raw frames so an onset can assemble a
  ~0.5 s window for confirmation.
- Emits `{ chroma, onset?, timestamp }`; exposes `subscribeAnalysis()`,
  `start()`, `stop()`, `subscribeState()`.

### 3. Raw-PCM Basic Pitch entry point — route adapter
- Today's `extractBasicPitchNotes(file)` decodes a `File`. Add a sibling that
  accepts a `Float32Array` @ 22.05 kHz mono (the onset window, resampled),
  skipping decode. Keeps the single shared Basic Pitch adapter (no duplication).

### 4. `engines/chord-follower` — pure alignment + grading state machine (the heart)
- **Expected input:** `ExpectedChord[]` = `{ symbol, pitchClasses, startBeat,
  durationBeats }`, derived from a `JamProgression` via `theory.chordNotes(symbol)`
  → `pitchClass` (reuse; do not re-derive chord spelling).
- **`accept(observation)`** streaming:
  - `match(observed, expected)` = pitch-class overlap score (coverage − extra
    penalty), reusing the `chord-verification` scoring shape.
  - **Advance** when an onset-confirmed match to the next chord exceeds a
    threshold, OR chroma match to the next chord dominates the current for N
    consecutive frames (hysteresis to stop flicker).
  - **Grade** each chord: correctness (was the expected chord voiced) + timing
    (onset vs expected downbeat, reusing `score-follower`'s `beatToMs` /
    `timingWindowMs` + strictness).
- **Live state + summary** mirror `ScoreFollowerLiveState` / `...Answer`
  (progress, per-chord pass/timing band, score), so HUD + journal reuse existing
  projections.
- Pure & headless-testable: feed a scripted observation timeline → assert
  advancement, per-chord correctness, and timing bands.

### 5. Route / UI — graded progression drill
- New `/music/play/chord-progression` (sibling of the technique drills): pick a
  `JamProgression` + tempo, count-in via `runtime.runCountIn()`, then strum
  through it. HUD: current expected chord, detected chord, per-chord pass +
  timing. Completion → `runtime.recordPractice` (XP/mastery to a
  `technique.{guitar,ukulele}.chord-changes` skill + journal), like other drills.
- **Injectable analyzer seam** (like chord-perfect's `analyzeStrum`): the route
  takes an observation source; the default wires `ChordAudioSource` + Basic Pitch
  confirm, tests inject a scripted timeline. Keeps the route test off the mic.
- Reuse `FretboardInput` to show the expected shape; route input through
  `InputRouter` so MIDI can drive the same follower (a MIDI player grades too).

## Phasing

1. **Pure core (headless-verifiable, the bulk of the value):** `computeChroma`,
   `chord-follower` engine, `ExpectedChord` derivation from `JamProgression`,
   full unit tests. Ships green with no hardware.
2. **Worklet glue:** `ChordAudioSource` (chroma + onset + ring buffer) + raw-PCM
   Basic Pitch entry point. Browser glue; hardware-pending.
3. **Route + UI:** graded progression drill + route test with injected analyzer.
4. **Tuning:** real-hardware threshold/hysteresis/smoothing calibration —
   deferred verification (cannot be done headless).

Phases 1 and 3 are fully testable in CI; phases 2 and 4 carry the
hardware-pending caveat.

## Testing

- **Pure:** `computeChroma` (synthetic tones), `chord-follower` (scripted
  observation timelines → advancement + grading), expected-template derivation.
- **Route:** inject a fake analyzer emitting a scripted timeline → assert the
  drill advances, grades, and records one practice entry.
- **Deferred/hardware:** real-strum chroma accuracy + threshold tuning on a
  physical guitar/uke (mic, instrument, room all need calibration — like any
  real sensor).

## Risks / open questions

- **Chroma noise on real guitars** (open-string ring, overtones, bass,
  distortion). Mitigated by the known-progression constraint, but thresholds /
  smoothing / hysteresis are **hardware-tuned knobs** — leave them as named
  constants, not hard-coded magic, and expect a calibration pass.
- **Latency split:** grade timing off the onset (~tens of ms); confirm identity
  via Basic Pitch ~0.3–0.8 s later. Acceptable for chord-change grading; not for
  sub-beat rhythmic feedback.
- **Voicing ambiguity** (Am7 vs C6, inversions): mostly dissolves because we
  match against the *expected* chord, not openly.
- **Compute budget:** main-thread Goertzel over ~48 bins per 46 ms frame is
  light, but confirm it holds on weak hardware; fall back to chroma-only grading
  if the per-onset Basic Pitch confirm can't keep up.
- **AGENTS decision change:** this introduces real-time streaming chroma
  *following*. Update the decision: allow constrained expected-progression
  following (testable, worklet-isolated); keep **open** real-time polyphonic
  recognition banned.

## Out of scope

- Open real-time chord recognition (still banned).
- Strumming-pattern / rhythm-fidelity grading beyond chord-change timing.
- Non-guitar/uke instruments for the audio path (MIDI works for any).
