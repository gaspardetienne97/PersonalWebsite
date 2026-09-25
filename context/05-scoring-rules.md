# Scoring and pedagogy rules

These are the rules the old build settled on. A rebuild can keep, change or drop
any of them, but each one exists because a simpler version was wrong in practice.
Numbers are exact.

---

## 1. Provenance: what counts as evidence

Every graded attempt records **how it was assisted**, one of four values:

- **`independent`** — unaided. The only value that produces mastery evidence.
- **`hinted`** — the player revealed a hint before answering. Set automatically
  the moment a hint is shown, and it can only be set before the run is prepared.
- **`guided`** — the drill walked the player through it (a follow-along mode,
  a wait-for-the-right-note mode, a demo-led run).
- **`self-assessed`** — the player judged their own answer (listen-only ear modes).

Rules:

- **`isMasteryEligible(event)` is true only for `independent`.** That is the
  single definition, used everywhere.
- An event whose assistance is anything other than `independent` produces **zero
  learning evidence**, so mastery does not move at all. An event with assistance
  *missing* (historical data) is still counted, deliberately, so old records do
  not silently vanish; only the stricter unaided projections apply the predicate.
- **Demos are not runs.** A demo plays the material; it produces no scoring event
  and therefore no evidence, no XP, nothing. Only a run the player performs is
  scored.
- Learning paths may opt a step into `guided-accepted`, which additionally counts
  `guided` attempts. This exists only because some drills have no Check mode yet
  and the step would otherwise lock forever. It never affects skill-graph
  mastery, and each instance is meant to be removed when Check mode lands.
  Hinted attempts never count, either way.
- Practice journals surface the assistance labels per session, so a run's
  provenance stays visible after the fact.

---

## 2. The scoring event

One immutable record per graded attempt, carrying enough to be *diagnosable*,
not just pass/fail:

- `correct` (coarse boolean, kept for quick filters and back-compat).
- `partialCredit` 0–1 — music is rarely binary (3 of 4 chord tones is not zero).
- `difficulty` 0–1 — what level the item was presented at.
- `latencyMs` — prompt shown to completed response, when measured.
- `skillIds` and `capabilities`, copied from the exercise definition at run time
  so every attempt is attributable.
- `modality` (played / heard / read / …), `source` (midi / audio / onscreen /
  click / mixed), `instrument`, `assistance`.
- `metrics[]` — per-dimension structured measurements, discriminated on kind:
  - `pitch`: expectedMidi, actualMidi?, cents?
  - `timing`: expectedMs, actualMs, errorMs
  - `velocity`: expected, actual
  - `choice`: expected, actual?
  - `chord`: expected/actual pitch classes, plus derived missing, extra,
    expected/actual bass, inversion correct
  - `voice-leading`: fromMidi, actualMidi, register, membershipCorrect,
    actualSemitones?, minimumSemitones
  - `chord-changes`: tuning, duration, from/to shape and notes, completed
    changes, clean changes, changes per minute
  - `breath`: steadiness, targetCurve?, actualCurve?
- `target` and `response` — what was asked and what came back, as labels,
  MIDI notes, or choice tokens.

The instrument on an event is only recorded when it is unambiguous: if the run's
inputs came from more than one instrument, the field is left empty rather than
guessed. Likewise `source` becomes `"mixed"` rather than picking one.

A **confusion matrix** is built incrementally from the choice and pitch metrics:
expected label → answered label → count. This is what powers "you confuse m6 with
P5" and what lets the scheduler target a real weakness instead of a generic one.
Pitch confusions are reduced to pitch-class names.

---

## 3. Mastery estimate model

Per skill, the stored state is: `mastery` 0–1, `confidence` 0–1, `decayRate`
per day (default **0.02**), `lastPracticed`, `observations`.

**Evidence from an event.** One evidence item per touched skill:
`performance = partialCredit` (clamped 0–1) and
**`weight = 0.5 + difficulty`**, so difficulty in [0,1] maps to a weight in
[0.5, 1.5] — a clean run on a hard item is stronger evidence than the same on an
easy one.

**Folding evidence in (EMA):**

```
learnRate = clamp01(0.3 * weight)
mastery  := clamp01(mastery + learnRate * (performance − mastery))
observations := observations + 1
confidence := observations / (observations + 8)
lastPracticed := event time
```

The constant 8 means about 8 observations to reach ~0.5 confidence. This is
deliberately a v1 heuristic: ownership and call site are fixed, the math is meant
to be replaceable (a difficulty-aware surprise model, say) without touching
callers. It was left simple on purpose until there was real data to tune against.

**Decay (forgetting), applied before each new evidence item and whenever a
current estimate is read:**

```
days = (now − lastPracticed) / 86_400_000
mastery    *= exp(−decayRate * days)
confidence *= exp(−0.5 * decayRate * days)
```

Confidence decays at **half** the rate of mastery: you forget the skill faster
than you forget that you once had it, but both fade. A skill drilled heavily two
years ago is not treated as reliably known today.

Ordering matters: decay to the event time **first**, then fold in the new
evidence. Never mutate mastery anywhere except through this one path.

Ingestion is idempotent: processed event ids are remembered, so replaying a
session cannot inflate mastery.

**Unlocking.** A skill is unlocked when every `prerequisite` edge into it has
`mastery(from) >= threshold`, default **0.6**.

---

## 4. Review-due rule

One rule, used everywhere: **a ten-point drop is due for review.**

```
dueForReview = (recentAccuracy − currentMastery) >= 0.10
```

with the stricter dashboard variant also requiring **at least five unaided
attempts** before it is allowed to say anything ("measured enough"). Skills
without enough measurement are reported as unmeasured, not as failing.

Per-skill statistics kept for this (all incremental, no re-scan):

- attempts, correct attempts, accuracy
- mean partial-credit score, and **consistency** = `max(0, 1 − 2 × stdev(score))`
- mean reaction time, and a separate mean chord-switch time from events that
  carry a chord metric
- last practiced

Weakest-skill ranking sorts by accuracy, then mean score, then consistency, then
*more* attempts first (a low score with more evidence outranks a low score with
one attempt).

---

## 5. XP, levels, streaks

- Level = `max(1, floor(xp / 250) + 1)`.
- An achievement fires at 100 XP.
- Streaks are counted over UTC day keys (`YYYY-MM-DD`), with a separate list of
  frozen days that do not break a streak.

---

## 6. Timing: zones, verdicts and windows

**Two names for one bucketing.** A signed reading against a ±tolerance window
buckets into three. Timing code reads it as early / pocket / late; the tuner
reads the same function as flat / in-tune / sharp. One implementation, two
vocabularies — worth keeping, it prevented the two from drifting apart.

**Sign convention, everywhere:** `errorMs = hit − expected`. Positive is **late**.

- `timingVerdict(errorMs, pocketMs = 15)` → `early` below −pocket, `pocket`
  within ±pocket, `late` above +pocket. **Default pocket is ±15 ms.**
- Tuner: in-tune window **±5 cents**; the intonation/drone trainer uses
  **±10 cents** over a rolling **10-second** window.

**The tempo- and duration-aware match window** (used by the score follower,
chord follower and comping):

```
multiplier = { relaxed: 0.24, normal: 0.16, strict: 0.10 }[strictness]
windowMs = round(clamp(beatMs * multiplier * sqrt(max(0.25, durationBeats)), 35, 300))
```

Longer notes get a proportionally wider window (the square root), and the result
is always between **35 ms and 300 ms**. Timing credit inside the window is
linear: `1 − |errorMs| / windowMs`.

**Per-drill match windows that differ, and why:**

- **MPC groove:** `min(180, beatMs / 8)` — **half a sixteenth note**, capped at
  180 ms. At 90 BPM that is 83 ms; at 300 BPM it is 25 ms. A groove is a grid, so
  the window scales with the grid, not with the note.
- **Rhythm pattern:** half the pattern's own smallest event spacing.
- **Chord changes:** see §9.

**Claim-based matching, not index-based.** Every expected onset claims the
*nearest unused* hit inside its window. Counting hits in order was the original
approach and it was wrong: one missed note shifted every later hit onto the wrong
slot and fabricated timing errors that never happened. Claiming also means a
flam or double onset cannot answer the same target twice.

---

## 7. Evenness

Evenness is measured on **inter-onset spacings**, one onset per beat (for
two-hand material, the earlier hand's onset):

```
evennessError = mean(|spacing − targetSpacing|)      over consecutive onsets
evennessScore = max(0, 1 − evennessError / 180)
```

180 ms is the point at which evenness scores zero. With no spacings at all the
error defaults to the full target spacing (so an empty run cannot score well).

**Scale drill score:** `pitchScore × 0.85 + evennessScore × 0.15`, correct at
**score ≥ 0.9**. A curriculum checkpoint may additionally demand
`evennessScore >= minEvenness` outright; without one the bar is unchanged.

**Fretboard pattern score** uses the same blend: `accuracy × 0.85 +
evennessScore × 0.15`.

---

## 8. Together window (hands striking as one)

**40 ms.** Two hands count as striking a shared beat together when their onsets
land within 40 ms of each other. Feedback reads "Together N/M beats within 40 ms",
and 80% of beats together is the good/warn boundary.

Only patterns that actually ask the hands to strike together measure it — for
the "Mirror hands" contrary-five pattern it is the whole point; the other
two-hand patterns deliberately move the hands at different rates, so reporting
togetherness for them would be noise.

Note the separate, much looser threshold used to decide **which beat** a pair of
notes belongs to: **half a beat**, by onset gap. A pair played too far apart to
count as "together" still belongs to the same beat. Chunking by gap rather than
by counting means a dropped note costs its own beat instead of shifting every
later one.

When input is the on-screen keyboard, togetherness is simply **not measured**
(one hand at a time), and the UI says so rather than scoring a zero.

---

## 9. Chord-change clusters

Guitar/ukulele chord-change grading works on **clusters split by silence**:

- **`CHANGE_GAP_MS = 350`.** Notes within a strum cluster tightly in time; moving
  to the next shape takes real milliseconds, so a gap longer than 350 ms starts
  the next cluster.
- Count-based chunking was the previous approach and was replaced: a single extra
  or missing string shifted every later chord onto the wrong grading window.
- **Untimed mode:** each cluster grades against the alternating target pair,
  cycling.
- **Timed mode (a BPM given):** each grading window owns a beat, and clusters are
  assigned to windows by nearest beat, anchored at the prompt start (or the first
  cluster if there is none). A cluster grades against the bar line, not against
  its neighbours.
- Reported: completed changes, clean changes, and changes per minute.

---

## 10. Groove grading: accents and extras

Velocity bands, from real MPC pad velocities:

- **Accent: MIDI velocity ≥ 90** (normalized `90/127` … `1.0`).
- **Normal: MIDI velocity 50–89** (normalized `50/127` … `89/127`).

A hit satisfies its target's accent marking only if its velocity falls inside the
band for that marking — a normal-marked hit played at 120 is as wrong as one
played at 20.

Other groove rules:

- Matching is per-voice: a target only accepts hits whose MIDI note equals the
  pad mapped to that voice. Every groove voice must map to a distinct pad 0–127,
  or the drill refuses to start.
- Accepted pad range is bank A widened to include any canonical kit note outside
  it (the 808 lives on 35).
- Capture stays open until `max(responseEnd, lastBeat + matchWindow)`, so a hit
  on the final onset that lands late is still eligible.
- Each bar carries a section label, so a fill is scored separately from the
  groove.
- Extra hits (unmatched, in-window) are counted and penalised separately from
  misses.
- Tempo guard: 20–300 BPM.
- Flam grace note lead: **30 ms**.

**Rhythm pattern score composition:**

```
timingScore  = errors.length === 0 ? 0 : max(0, 1 − meanAbsErrorMs / 160)
restPenalty  = min(0.50, extraRestHits * 0.20)
missedPenalty= min(0.60, missedEvents  * 0.20)
extraPenalty = min(0.30, extraHits     * 0.10)
score        = max(0, timingScore − restPenalty − missedPenalty − extraPenalty)
correct      = score >= 0.85
```

No matched hits means **timing score 0**, not a free pass — an empty performance
must not ride a "0 ms error" to a passing timing score. A muted stroke counts only
when an onset landed in its window **and** nothing pitched did (a strum that rings
out there is a played chord, not a palm mute). Hits inside a rest window are never
eligible targets.

---

## 11. Tempo ladder

Per `(exercise, variant)` rung, persisted, keyed by a variant string built from
scale, tonic, motion, span and hands. Base rung **100 BPM**.

**Implemented rule: one clean run at or above the current rung raises it by the
tempo step.**

```
if (run.correct && prompt.bpm >= highestUnlockedBpm)
    highestUnlockedBpm = min(maxBpm ?? 180, highestUnlockedBpm + (tempoStepBpm ?? 10))
```

So: step **+10 BPM**, ceiling **180 BPM**. (If the intent was *two* consecutive
clean runs before promotion, that was never implemented — the code promotes on
one. Worth deciding explicitly in the rebuild; requiring two is a plausible
tightening and would make the rung mean more.)

Other ladder properties worth keeping:

- **A rung never drops.** Only `writeLadder` with a higher BPM does anything.
- Rungs are merged, not overwritten: another tab may have unlocked a different
  variant since load, so the stored row is re-read and merged before being
  written back.
- An unreadable ladder is a *base* ladder, never a dead Start button, and the
  failure is not cached so a later read retries.
- A failed ladder write never fails the run: the rung is progress, not the
  result. The in-memory rung survives, so the readout only falls back after a
  reload.
- The UI ladder projection marks each rung `unlocked` / `target` / `locked`, and
  separately offers a next/slower practice tempo which are *suggestions*, not
  earned rungs.

---

## 12. Pitch clarity floors and audio gates

- **Detector peak-pick ratio 0.85** (see the hardware notes for why 0.9 flips
  octaves down on low strings and 0.8 flips them up).
- **Tuner clarity floor 0.6** — below it, return nothing so the UI can hold the
  last good reading instead of flickering on noise.
- **RMS silence gate 1e-3** in the detector: below it, no pitch at all.
- **Detector band 50–1500 Hz**; 40 Hz high-pass ahead of it.
- **Audio confidence** feeding the router is the detector clarity, clamped 0–1,
  defaulting to 0.7. MIDI is 1.0, on-screen 0.8, answer buttons 0.6.
- **Known-target note gate** (wait mode), band MIDI 40–88: signal floor 0.01 RMS,
  SNR ratio 2.5 over an adaptive noise floor, noise-floor smoothing 0.9, **3
  consecutive stable frames**, presence ratio 0.25, harmonic margin 0.9, match
  margin 1.4. A target must out-shout confusers at −24, −12, −1, +1, +12, +24
  semitones to prove its own octave, and partials at +12/+19/+24 are treated as
  harmonics rather than played notes. A match only fires after a re-arm boundary
  (silence, or a frame where the target was not fully sounding), so a sustained
  chord cannot re-advance and a repeated identical chord still needs a fresh
  attack.
- **Chord analysis window:** 600 ms, resampled to 22.05 kHz mono.
- **Breath steadiness:** `clamp01(1 − 4 × stdev(breath values))`, needing at
  least two samples. Pass bars: 0.8 for long tones and swells, 0.75 for interval
  landings.

---

## 13. Calibration offsets

Full procedure in the hardware notes. The scoring-relevant parts:

- **Positive offset = the input arrives late.** The router subtracts it from
  incoming timestamps **once, at the boundary**, so no scorer downstream knows
  offsets exist.
- Three stored offsets: global audio, global MIDI, and per-MIDI-device
  (which overrides the global). Each bounded to ±500 ms.
- Acceptance gates for a tap-along run: 20 clicks at 90 BPM, drop the first 4,
  at least 14 of the remaining 16 matched, median as the offset, **IQR ≤ 30 ms**,
  taps claimed nearest-first with a ±half-beat reach and a ±200 ms window around
  a coarse median.
- Browser-reported `outputLatency` / `baseLatency` are **diagnostics only** and
  are never applied to scoring.

---

## 14. Storage layout

### IndexedDB (Dexie), database `musicianship-os`

Version 1 tables (name: indexed fields):

| Table | Primary key + indexes |
|-------|----------------------|
| `sessions` | id, startTime, endTime, instrument, source |
| `scoringEvents` | id, sessionId, exerciseId, at |
| `skillMastery` | skillId, lastPracticed |
| `skills` | id, capability |
| `skillRelationships` | id, from, to, kind |
| `chordLibrary` | id, symbol |
| `songs` | id, title, createdAt, updatedAt |
| `settings` | id |

Version 2 adds:

| Table | Primary key + indexes |
|-------|----------------------|
| `backingTracks` | id, name, createdAt |
| `audioTakes` | id, createdAt, instrument, backingTrackId |

`settings` is a generic key/value table; named rows include the device profiles
(`music.device-profiles`), the sample kits (`music.sample-kits`), the tempo
ladder (`technique.tempo-ladder.v1`), and the processed-event id list
(`skills.processed-events.v1`).

Every read and write clones the row, so callers cannot mutate stored state by
accident.

**No `localStorage` / `sessionStorage` for app data.** Dexie and OPFS only.

### OPFS (binaries)

Audio and sample binaries live in the Origin Private File System, keyed by a
path-like string; nested paths create directories, and deleting prunes empty
parents.

- Backing tracks: `music-backing-<id>`
- Recorded takes: `music-take-<id>`
- Kit samples: `music.sample-kits/<kitId>/<sampleId>-<safeFileName>`

If OPFS is unavailable the store fails loudly ("Local binary storage is
unavailable") rather than silently dropping data.

### Backup formats

**Data backup** — JSON, `format: "practice-os-data-backup"`, current
**version 2** (version 1 still restores; it lacked take gain and note). Limit
**50 MiB**. Contains every Dexie table (`sessions`, `scoringEvents`,
`skillMastery`, `skills`, `skillRelationships`, `chordLibrary`, `songs`,
`settings`, `backingTracks`, `audioTakes`), an `exportedAt` ISO timestamp, and a
`media` block that records `included: false` plus the *counts* of backing-track,
audio-take and sample files that were **not** included. It is validated field by
field on restore, with a named path for every failure.

**Full backup** — ZIP, manifest `format: "practice-os-full-backup"`, current
**version 2** (version 1 still restores). Limit **250 MiB** total (the manifest
itself still capped at 50 MiB), at most 10000 files. Layout:

```
manifest.json         (the data backup verbatim, plus an assets index)
media/0
media/1
...
```

Each asset entry is `{ key, path, size, mimeType, sha256 }`; `path` is exactly
`media/<index>` and the index must match its position. Compression is `STORE`
(the payloads are already compressed audio). On restore, the ZIP directory is
validated against the entry list before anything is read, a referenced file that
is missing or whose size disagrees with its metadata aborts the whole restore,
and the whole operation runs under the media-library mutation lock.

---

## 15. Small rules that were each learned the hard way

- **Apply device profiles once, at the input boundary.** Instrument assignment
  and pad remapping happen before any exercise sees the event.
- **A note-off never activates an input source.** A stale MIDI note-off must not
  steal the visible source back from an on-screen player.
- **Recent MIDI activity window: 1500 ms.** Switching the selected instrument
  does not immediately drop a live MIDI session.
- **Ingestion is idempotent** in both the skill graph and analytics, keyed on
  event id.
- **A demo is never a run.** Playing the material produces no event.
- **An empty performance scores zero, not "no error".** Several metrics had to be
  special-cased for this.
- **Never hardcode a colour for a grade.** Grades map to semantic tones
  (`success` ≥ 67%, `warn` ≥ 34%, `error` below) which map to theme tokens.
- Progress and mastery are separate things: XP and streaks reward showing up,
  mastery only moves on unaided evidence.
