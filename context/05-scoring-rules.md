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
  cycling. The rebuild groups clusters first (section 24): a cluster that sounds
  more like the current chord than the next joins it, so a re-strum or a chord
  picked string by string is one arrival, not a change.
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

---

## Added in the rebuild

Every rule below has unit tests in `packages/music-core`. Thresholds without a published source are tuning knobs for the owner's hardware (listed in `TASKS.md` "Needs hardware").

## 16. The next run (`progress/advance.ts`)

`ADVANCE = { pass: 0.85, fail: 0.7, runs: 2, stepPct: 0.05, minStep: 2, resetPct: 0.75, easierAfter: 2 }`. Plan per drill: `{ bpm?, tempo?: { min, goal, max? }, steps?: { label, goal?, start? }[], step? }`.

- **Pass** = the drill's own `correct` and score ≥ 0.85. **Fail** = not a pass and score < 0.70. In between holds.
- Counts belong to one setup (tempo and step); any change starts over. Ignoring an offer keeps it: Again offers it again.
- Two passes in a row at a tempo below the step's goal: **faster** by max(2 BPM, 5%), capped at the goal.
- Two passes at the goal with a harder step: **harder**, at that step's `start` or max(min, 75% of its goal). On the last step, keep going faster up to `max`, then "top".
- A fail above the floor tempo: **slower** by one step (one bad run is enough to slow down).
- Two fails in a row at the floor (or untimed): **easier** step. The variation never drops on one bad run.
- Untimed drills (no tempo) move through steps only, same two-in-a-row rule.
- Persistence: per ladder id (exercise plus fixed setup, never the tempo or the step) under the setting `advance.v1`. Pads also save a groove's start tempo as the tempo the offer would use.

## 17. Pad skills (`content/pad-skills.ts`)

- **Fills**: `FILL = { rushMs: 15, landMs: 40 }`. The fill rushed when the mean signed error of the fill bar's own notes (not the groove's kick and hats under it) is under -15 ms; it landed when crash and kick on the one are within 40 ms. Correct = groove correct, landed and not rushed.
- **Ostinato**: the hats under the line may drop at most 10 points below the hats alone (`OSTINATO.maxDrop 0.1`).
- **Play it back (echo)**: only answer bars are scored; a round passes at ≥ 90% of its targets (`ECHO_PASS`); correct = all four rounds and no extra hits.
- **Dynamics** against the calibrated range (`velocityRange` needs soft and loud clearly apart): ladder correct at ≥ 80% of hits in their band; crescendo needs Spearman ρ ≥ 0.8 and ≥ 50% of the range covered (score ρ × 0.6 + span × 0.4); even needs spread (SD ÷ mean within the range) ≤ 0.08.
- **Grooves**: tier pass at 90% good and 70% perfect, good capped at 40% of the closest same-pad spacing; Hold the tempo drifting 3 BPM or more costs 40% and fails. Drift is read from raw hits, not grid-matched ones (`tempoDrift`): each target claims the nearest same-pad hit within the groove window of a running line fit (slope clamped to 0.8 to 1.25), and the played tempo is that line's slope; a steady rush leaves a fixed grid window within a bar or two, so grid-matched errors never showed drift. With no readable drift the run fails unless nothing was played. Stars: 3 when passed, 2 at ≥ 0.8, 1 at ≥ 0.6.
- **Improvise**: described, not graded (hits, grid spread, swing %, velocity range, pads used).

## 18. Aerophone skills (`content/aero-skills.ts`, `scoring/aerophone.ts`)

- **Scales, tonguing lines, crossings**: graded by `gradeLine` (pitch × 0.85 + evenness × 0.15, correct at 0.9). A note an octave off names the octave key (`octaveSlip`).
- **Tonguing joins**: a join is tongued (T) when the previous note was released at least 25 ms before the next note-on, or the breath dipped under 45% of the phrase's median CC 2 between them (`JOIN = { dip: 0.45, gapMs: 25 }`); otherwise slurred. The first note is T. Tonguing score = share of joins matching the pattern; run score = pitch score × 0.5 + tonguing × 0.5; correct needs the line correct and tonguing ≥ 0.8. With no CC 2 seen, the line grade stands alone and the tonguing row reads "not measured" (`tonguingVerdict`); it used to be scored as zero and fail every run.
- **Register crossings**: glitches = note-ons that are neither of the pair. Correct = the line correct (pitch and evenness) and at most 1 glitch. Evenness was ignored until the review.
- **Trills** (4 s from the first note): notes a second from the mean gap of in-pair notes, evenness = 1 - SD ÷ mean of the gaps, strays = out-of-pair notes. Score = min(1, rate ÷ 8) × 0.4 + evenness × 0.5 + (no strays ? 0.1 : 0). Correct at ≥ 4 a second, evenness ≥ 0.7, no strays.
- **Bite vibrato** (4 s of pitch bend from the first note): rate from zero crossings around the mean, evenness = 1 - SD ÷ mean of half periods, depth from the 5th to 95th percentile. Target rate = pulses × bpm ÷ 60. Score = (1 - relative rate error) × 0.6 + evenness × 0.4; correct within 15% of the rate and evenness ≥ 0.6 (`VIBRATO`). No bend: "set the bite to send pitch bend".
- **Long tone at a level**: share of CC 2 samples inside the level's band during the hold, the window starting on the first note that is the target and ending `holdMs` later (not at the release, and a fumbled first note costs nothing); score = long-tone score × 0.5 + share × 0.5; correct needs the long tone correct and share ≥ 0.7.
- **Fingering lessons**: flash cards; a note moves on only when right; score = share right first try.

## 19. Piano additions

- **Blocked chords**: notes of one chord count as together within 40 ms (`CHORD_TOGETHER_MS`); reported as count and mean spread.
- **Scales grade speeds**: ABRSM 2025-26 tempos with two or four notes a click (`ABRSM_SPEEDS`, `gradeSpeed`).
- **Pedal** (`scoring/piano.ts` `PEDAL`): CC 64 ≥ 0.5 is down (half pedal counts as down); per chord the lift must come within 400 ms after the chord's first note (a lift up to 30 ms early still counts) and the pedal back down within 600 ms. Verdicts clean, early, blurred, late, no chord.
- **Sight-reading climb**: `CLIMB = { pass: 0.8, strikes: 3, measures: 4 }`.
- **Fix the trouble spot** (`drills/studio/studio.ts` `SPOT`): start the loop at 85% tempo, three clean in a row to return to full tempo, 5% slower after a slip (floor 50%), then widen by a bar.

## 20. Guitar and ukulele additions

- **Bends** (`scoring/bends.ts` `BEND`): in tune within 15 cents of the target, close within 30; a bend counts as held after 250 ms steady within 20 cents.
- **Vibrato** (microphone): rate, width and evenness described, not passed (no guitar norms; strings typically 4 to 7 a second).
- **Legato**: a note whose onset has no picked attack within the 50 ms attack window reads as hammered or pulled; reported, not failed.
- **Fingerpicking and lines**: `gradeLine` on the pattern's notes.
- **Strum ladder** was replaced by the next-run rule.

## 21. Phrases

- Graded by `gradeLick` (`scoring/piano.ts`): played note-ons matched to the phrase in order by pitch class; score = matched ÷ total; on time within min(180 ms, beat ÷ 4) of the grid anchored on the count-in; correct at 0.9. Fretted phrases also report string and fret when the taps carry them. Drum phrases use the groove grader (section 17).

## 22. Microphone note events

- Re-strike: an onset with the same pitch sounding, more than 120 ms after that note began, then the same pitch stable for 2 frames, emits note-off and note-on.
- The capture follows the louder channel (decay 0.995, switch at 4×).

## Phrases with chords (scoring/phrases.ts)

- **Steps:** notes that start on the same beat form one step (`phraseEvents`).
- **Matching** (`matchEvents`): played note-ons are walked through the steps in order.
  - A step takes notes while their pitch class is in it, up to its note count.
  - Once every pitch class is in, a doubled note only joins if it is within `CHORD_SPREAD_MS` (150 ms) of the step's first note.
  - A note outside the step is a wrong step of its own, so later steps stay aligned.
- **Score** (`gradePhrase`): steps right divided by all steps; correct at 0.9.
- **On time:** a step's first note is within min(180 ms, beat/4) of the count-in grid.
- **String and fret:** checked only for on-screen taps.
- **Known gap:** tapping a doubled string slowly can spill into the next step.


## Added after the UI and correctness review (2026-10-13 to 10-27)

## 23. Out of tune is not wrong (`signal/pitch.nearMiss`)

- A microphone note that missed a target only by rounding: its pitch (`midi + cents / 100`) is within 65 cents of a wanted note it was not rounded to. `nearMiss(midi, cents, wanted)` returns the wanted note and how far off it is; a right note, a clean wrong note (5 cents off the wrong semitone) or a note with no cents is not a near miss.
- Scales use it: the note still scores as missed, the status names the tuning ("That C is 55 cents sharp, so it reads as C#"), Practice moves past it when one note is wanted (Check waits), and the results say "tune your guitar in Tuner, then try again" with the mean cents. MIDI never produces a near miss.
- Why 65: a string 45 to 50 cents sharp rounds its notes to the next semitone while sitting 50 to 55 cents from the target; 65 leaves room and stays clear of a clean neighbour.

## 24. Chord cycles (`scoring/technique.gradeChanges`, `scoring/timing.alignChangeClusters`)

- `gradeChanges` takes `chords` (two to eight, in order) in place of `from` and `to`; untimed clusters go round the cycle (`target = i % count`), timed ones take the chord of their slot (`slot % count`). `alignChangeClusters(clusters, clock, count = 2)`.
- Unclocked grouping (`drills/guitar/chords.groupChanges`): clusters split by the 350 ms gap; a cluster joins the current group unless its pitch-class likeness (Jaccard) to the next chord of the cycle is higher than to the current one. Before this, every 350 ms silence counted as a change, so re-strumming or plucking string by string flipped the target.
- History and the next run are keyed by the shape ids joined with `>`; for two chords that equals the old pair key (`from>to`), so the pair history carries on.
- Strum and identify accepts a chord with fewer than three tones when the chord has fewer (`min(3, expected)`), so power chords grade.

## 25. Fingerpicking time steps

- Each note keeps its step (`FretTarget.slot`): a pattern step is one slot whatever it sounds, so a muted string or a hold ("-") keeps its time and a pinch ("B+2") puts two or three notes in one slot. `gradeLine` gets one beat per slot with every note of the slot in it; a pinch's notes match in either order.
- "B" is the shape's lowest sounding string, "A" the alternate bass (string 4 under a string-6 root, else the next string up); a step on a muted string is dropped from that bar. The default shape for a chord is its first position on which every step lands on a sounding string (`fingerpickable`).
- Six-step patterns are a bar of three: 3/4 at two notes a click, 6/8 at three (the click on each dotted quarter). Spider at 3 or 6 notes a click is written in 12/8 (`quartersPerClick = 1.5`).

## 26. Timed drills hear the first note

- The shell flips to running half a beat before the downbeat (a timer at `downbeat - beatMs / 2`), the same window drills capture from (`capture(downbeat - beatMs / 2)`). The beat callback fires at or after the beat, so a first note on the downbeat, or a hair early, used to arrive while the phase still read count-in and was dropped, in every timed drill and on every input.
- Rhythm also accepts taps during the count-in phase and starts its capture before the microphone (opening the microphone awaits the browser and can run past the downbeat). In an echo, listening starts at the response bar.

## 27. Smaller scoring fixes from the review

- **Cadence keys**: prompt ids end in `-<shift>` with shift -5 to +6; the parser must read the hyphen as a separator (`/-(-?\d+)$/`), not a minus sign, or every upward shift plays downward.
- **Ear mixes in play-back**: cadence and scale have no play-back, so they sit out; if nothing playable remains the mix falls back to the seven playable drills instead of hanging on an empty list.
- **Fine pitch** resumes from one step easier than the last saved step (`CENT_STEPS = [50, 35, 25, 18, 12, 8, 5]`), read fresh on every run.
- **Studio ears**: pan centre is an answer; boost or cut always uses the five-band set.
- **Reading ranges** (`content/reading.readingRange(level, clefs)`): each clef gets its own side of middle C, at least 12 semitones: treble `[60, 60 + max(12, high - 60)]`, bass `[60 - max(12, 60 - low), 60]`, both clefs the union. Primer treble 60 to 72, bass 48 to 60. A clef with an empty pool is dropped and the other reads the whole range. Then clamped to the instrument (fretted written range, the Aerophone's 58 to 85).
- **Voicings in register** (`content/piano.ts`): left hand root on F2 to E3 (`41 + pc(root - 5)`), right hand placed by `placeVoicing` in the octave that costs least (100 per semitone outside `VOICING_REGISTER = [52, 79]` plus the distance from the previous chord's mean), so later keys no longer climb.
- **Chord scales** grade against `accepted`, the go-to scale and its alternatives: a plain dominant takes Mixolydian (not Lydian dominant) and excludes altered, half-whole and whole-tone; b9 takes half-whole, #11 Lydian dominant, alt the altered scale.
- **Voicing moves on screen** keep the last-played note of each target pitch class, so a stray or repeated key does not spoil the move.
- **Pyramid rudiment** is timed on its own grid (four a beat), not the chosen subdivision.
- **Not recorded**: Improvise, and dynamics the input cannot measure (on-screen pads have no velocity).
- **Bends** are always guided (no Check); vibrato counts as clean when it is heard.
