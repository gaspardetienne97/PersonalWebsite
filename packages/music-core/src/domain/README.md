# Domain Model v1.2

The core schemas + the **end-to-end learning pipeline** the whole architecture is built around. Designed before engines/UI because good domain models survive for years and bad ones are expensive to change.

Everything type-checks under `strict` + `exactOptionalPropertyTypes` + `noUnusedLocals` + `noUnusedParameters` + `noImplicitReturns`, and is validated two ways:
- `validate.ts` — four concrete exercises (interval, guitar spider, sight-reading, Aerophone long tone) express + grade cleanly. Run: `npx tsx validate.ts`
- `pipeline-trace.ts` — the full learning loop runs and behaves correctly. Run: `npx tsx pipeline-trace.ts`

## The pipeline (what v1.2 adds)

The previous versions had the shapes (`ExerciseResult`, `ScoringEvent`, `LearningEvidence`, `SkillMastery`) but the *transformations between them were implicit* — so every exercise could create events slightly differently and the learning system would drift. `pipeline.ts` makes the bridge explicit and canonical with three pure functions:

```
ExerciseResult ──resultToScoringEvent──► ScoringEvent
ScoringEvent   ──scoringEventToEvidence─► LearningEvidence[]
(mastery,event)──applyScoringEventToSkillState──► SkillMastery   (only sanctioned update path)
```

plus `updateConfusion()` building the `ConfusionMatrix` that powers weak-spot detection.

### Verified behavior (from `pipeline-trace.ts`)

A learner who answers P5 instead of m6 four times, then m6 four times:

```
attempt  answered  correct  partial  ->  mastery  confidence
   1     P5        false    0.00     ->  0.000    0.111
   ...
   4     P5        false    0.00     ->  0.000    0.333
   5     m6        true     1.00     ->  0.330    0.385
   ...
   8     m6        true     1.00     ->  0.783    0.500

Confusion matrix:  m6: P5=4, m6=4
```

Wrong answers raise *confidence* (more observations) but not *mastery*; correct answers build a believable curve that doesn't saturate; and the confusion matrix captures the m6↔P5 substitution — the exact signal the adaptive scheduler needs.

## Files

| File | Owns |
|---|---|
| `pipeline.ts` | **The three transformation functions + confusion matrix.** The behavioral core. |
| `time.ts` | Branded `MonotonicMs` vs `UnixMs` + `ClockSource`. |
| `capability.ts` / `modality.ts` | The "what" (capability) and orthogonal "how" (played/heard/read/...). |
| `instrument.ts` | `InstrumentId` + `InstrumentProfile`. |
| `note-event.ts` | Source-agnostic input incl. `OnsetEvent`, `deviceId`, `clock`, raw MIDI. |
| `skill.ts` | Skill Graph + mastery model (graph owns mastery; analytics produces evidence). |
| `score.ts` | `Score` event lanes + derived/cacheable projections. |
| `exercise.ts` | Streaming `ExerciseRun` (+`finish(ctx)`) + rich `ExerciseResult`; `discreteRun` helper. |
| `scoring.ts` | `ScoringEvent` + structured `ScoringMetric[]` (chord metric now carries missing/extra/bass/inversion). |
| `practice-session.ts` | `PracticeSession` + run records + `summarizeSession`. |
| `validate.ts` / `pipeline-trace.ts` | Structural + behavioral validation harnesses. |

## Changes from v1.1 (in response to critique)

Adopted (the structural items that actually block the pipeline): the three explicit transformation functions; a richer **chord metric** (`missing/extra/bass/inversion`) so chord analytics can explain *why* a chord was wrong; optional **`finish(ctx)`** with stop-reason/effort.

Deferred deliberately to keep this round behavioral, not an endless type expansion:
- **Typed `InstrumentProfile` variants** (per-instrument) — wait until device-setup UI exists; `config` stays open for now.
- **Environment metadata on sessions** (latencyCalibrationId, deviceIds, appVersion) — add when latency calibration ships, since that's what makes the metadata meaningful.
- **Removing `Capability.EarTraining`** — still want 10–20 real exercises before committing to capability-vs-modality.
- **Engine-level simulation** (timing under real latency, score-follower on wrong notes, mastery over months, audio under noise) — this is the *right* next validation, but it belongs to the engines, not the domain model.

## Next step

The domain model and its core transformations are now validated. The next risk is no longer schema shape — it's engine behavior under real conditions. Build `music-core/skills` + `music-core/analytics` as thin engines wrapping these functions, then the first exercise UI on the run model, and start feeding them real input.
