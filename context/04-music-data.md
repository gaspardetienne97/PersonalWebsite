# Music data: the content tables

Every table below was extracted by evaluating the live source, so the JSON files
in `data/` are exact copies, not transcriptions. Where a table is small it is
also written out here; where it is large the markdown gives the shape, the
counts and the gotchas, and points at the JSON.

---

## 1. Aerophone fingering chart — `data/aerophone-fingerings.json`

Roland Aerophone AE-10/AE-20, **sax fingering mode, written pitch**. Range
charted: MIDI 58 (Bb3) through 78 (F#/Gb5), 21 notes.

The file holds three things: the 27-entry key registry (id + human label), the
per-MIDI fingering map, and a pre-expanded ascending chart. Each fingering is
`{ keys: [...], octave: boolean }`.

The whole table, for readability:

| MIDI | Note | Keys | Octave |
|------|------|------|--------|
| 58 | Bb3 | k1 k2 k3 k4 k5 k6 lowBb | no |
| 59 | B3 | k1 k2 k3 k4 k5 k6 lowB | no |
| 60 | C4 | k1 k2 k3 k4 k5 k6 lowC | no |
| 61 | C#4 | k1 k2 k3 k4 k5 k6 lowCsharp | no |
| 62 | D4 | k1 k2 k3 k4 k5 k6 | no |
| 63 | Eb4 | k1 k2 k3 k4 k5 eb | no |
| 64 | E4 | k1 k2 k3 k4 k5 | no |
| 65 | F4 | k1 k2 k3 k4 | no |
| 66 | F#4 | k1 k2 k3 k5 (long F#) | no |
| 67 | G4 | k1 k2 k3 | no |
| 68 | G#4 | k1 k2 k3 gsharp | no |
| 69 | A4 | k1 k2 | no |
| 70 | Bb4 | k1 bisBb (bis) | no |
| 71 | B4 | k1 | no |
| 72 | C5 | sideC | no |
| 73 | C#5 | (open, no keys) | no |
| 74 | D5 | k1 k2 k3 k4 k5 k6 | **yes** |
| 75 | Eb5 | k1 k2 k3 k4 k5 eb | **yes** |
| 76 | E5 | k1 k2 k3 k4 k5 | **yes** |
| 77 | F5 | k1 k2 k3 k4 | **yes** |
| 78 | F#5 | k1 k2 k3 k5 (long F#) | **yes** |

**Verification status is part of the data.** Verified against manual charts and
live use on the owner's own instrument: C4, D4, E4, F4, G4, A4, B4, C#5, D5, Eb5.
Still to confirm: the low pinkies (Bb3, B3, C#4), Eb4, the long F# (F#4 and F#5),
G#4, the bis Bb4, and the C5 side-C. The six main tone keys plus the octave key
are reliable throughout; the side and pinky keys around the register break are
best-effort.

---

## 2. Tunings — `data/tunings.json`

Open strings are listed in conventional string-number order, string 1 first
(highest pitch first). `notationTransposition` is what notation must apply
(guitar sounds an octave below written).

**Guitar** (6 strings, 22 frets, transposition −12):

| Id | Name | Open strings (1→6) |
|----|------|--------------------|
| guitar.standard | Standard | 64, 59, 55, 50, 45, 40 |
| guitar.drop-d | Drop D | 64, 59, 55, 50, 45, 38 |
| guitar.dadgad | DADGAD | 62, 57, 55, 50, 45, 38 |
| guitar.open-g | Open G | 62, 59, 55, 50, 43, 38 |

**Ukulele** (4 strings, 15 frets, transposition 0):

| Id | Name | Open strings (1→4) |
|----|------|--------------------|
| ukulele.high-g | High G | 69, 64, 60, 67 |
| ukulele.low-g | Low G | 69, 64, 60, 55 |
| ukulele.baritone | Baritone DGBE | 64, 59, 55, 50 |

Custom tunings must use an id prefixed `custom.`, need exactly 6 (guitar) or 4
(ukulele) MIDI notes in 0..127, and a fret count 1..36.

Note the re-entrant case: ukulele high G has string 4 higher than string 3, which
means there is no true bass string, so any rule that says "the lowest sounding
string must be the root" has to be skipped for it.

---

## 3. Chord shapes and positions

**`data/chord-shapes.json`** — 16 curated open shapes: guitar C, G, D, Em, Am,
E, A, Dm, F, B7, Bm, G7; ukulele C, F, G, Am. Each carries frets per string
(null = muted), fingers, and metadata.

**`data/chord-positions-guitar-standard.json`** and
**`data/chord-positions-ukulele-high-g.json`** — for every curated shape, the
other places on the neck where the same chord can be fretted, generated from the
shape's pitch classes and the tuning.

Generation rules, which are the real content here:

- **Position 0 is always the curated shape itself with its id unchanged**, so
  persisted prompt and run ids never move. Higher positions get `<shapeId>@<n>`.
- Defaults: at most **5 positions** including position 0, max stretch **3 frets**,
  max **4 fingers** (a barre counts as one), and the lowest sounding string must
  play the chord root.
- Open strings are only allowed in first position; higher up the hand cannot
  reach the nut.
- Minimum sounding strings: 4 on a 6-string, 3 on a ukulele.
- The bass-must-be-root rule is skipped on re-entrant tunings.
- Each position is labelled "Open position", "Barre at fret N", or "Fret N".

---

## 4. Fretboard patterns: pentatonic boxes and CAGED — `data/fretboard-patterns.json`

Ten patterns, all expressed as `(stringNumber, fretOffset)` pairs relative to a
root fret, so they transpose by sliding.

- **`minor-pentatonic`** family: `minor-pentatonic-box-1` … `box-5`.
- **`caged-major`** family: `caged-major-e-shape`, `-d-shape`, `-c-shape`,
  `-a-shape`, `-g-shape`. Each CAGED grip is arpeggiated low string to high and
  carries a `baseOffset` saying where the shape sits relative to the root:
  E shape 0, D shape 2, C shape 4, A shape 7, G shape 9.

---

## 5. String spider (fretting permutations) — `data/string-spider.json`

24 patterns in three groups, each a 4-fret permutation:

- **classic**: `ascending-1234` [0,1,2,3], `descending-4321` [3,2,1,0],
  `inside-out-1324` [0,2,1,3], `outside-in-1423` [0,3,1,2].
- **permutation**: the remaining 1-2-3-4 orderings (`perm-1243`, `perm-1342`, …).
- Plus the span options table (`STRING_SPIDER_SPANS`) the drill offers.

---

## 6. Scales — `data/scales.json`

Ascending semitone offsets from the tonic, **octave inclusive**:

| Kind | Semitones |
|------|-----------|
| major | 0 2 4 5 7 9 11 12 |
| natural-minor | 0 2 3 5 7 8 10 12 |
| harmonic-minor | 0 2 3 5 7 8 11 12 |
| dorian | 0 2 3 5 7 9 10 12 |
| phrygian | 0 1 3 5 7 8 10 12 |
| lydian | 0 2 4 6 7 9 11 12 |
| mixolydian | 0 2 4 5 7 9 10 12 |
| locrian | 0 1 3 5 6 8 10 12 |
| melodic-minor | 0 2 3 5 7 9 11 12 |
| major-pentatonic | 0 2 4 7 9 12 |
| minor-pentatonic | 0 3 5 7 10 12 |
| blues | 0 3 5 6 7 10 12 |
| altered | 0 1 3 4 6 8 10 12 |
| bebop-major | 0 2 4 5 7 8 9 11 12 |
| bebop-dominant | 0 2 4 5 7 9 10 11 12 |
| whole-tone | 0 2 4 6 8 10 12 |
| diminished | 0 1 3 4 6 7 9 10 12 |

**Jazz scale kinds** (the subset presented as jazz vocabulary): dorian,
mixolydian, lydian, melodic-minor, altered, bebop-major, bebop-dominant,
whole-tone, diminished.

Spans: `pentascale`, `one-octave`, `two-octave`. Motions: `up`, `down`,
`up-down`. A descending line walks the scale *down* from the root using mirrored
degree offsets — negating the ascending semitones leaves the key (from C5 you
get Bb4/Ab4/Eb4/Db4 instead of B4/A4/E4/D4).

---

## 7. Rhythm and strum patterns — `data/rhythm-patterns.json`

11 patterns, each with a meter, default bar count, timed events (beat, voice,
accent) and explicit rests:

`quarter-pulse`, `eighths`, `sixteenths`, `eighth-rests`, `triplets`,
`off-beats`, `dotted-quarters`, `swing-eighths`, `gap-click-1-on-1-off`,
`guitar-four-on-the-floor`, `guitar-island-strum`.

Two things carried in the data that matter to grading: **rests are explicit**
(a tap inside a rest window is a penalty, never credited to a neighbouring beat),
and guitar patterns can carry a `stroke` of `mute` (a muted stroke is an onset
with no pitch) and chord spans to grade the chord identity over.

---

## 8. MPC rudiments — `data/mpc-rudiments.json`

Seven patterns, each a hand-alternation unit:

| Id | Label | Unit | Notes |
|----|-------|------|-------|
| single-strokes | Single strokes | L R | |
| double-strokes | Double strokes | L L R R | |
| paradiddle | Paradiddle | L R L L R L R R | |
| moving-accent | Moving accent | L R | accentMode: moving |
| single-16ths | Sixteenth singles | L R | subdivision 4 |
| triple-strokes | Triple strokes | L L L R R R | subdivision 3 |
| flam | Flam | L R | flam: true |

Subdivisions offered: 2 (Eighths), 3 (Triplets), 4 (Sixteenths).
**Flam grace note lead: 30 ms.**
Velocity bands: accent 0.75–1.0, tap below that.

---

## 9. MPC grooves — `data/mpc-grooves.json`

Kit voices (the "boom bap" kit), in kit order, with their canonical notes:
kick 36, snare 38, hats 42, open hat 46, 808 **35**, perc 39. Note the 808 sits
*below* bank A, which is why the accepted pad range is widened to
min(36, kit notes) … max(51, kit notes).

Five catalog entries; onsets are in beats from the start of the phrase, 4 beats
per bar, and every bar carries a section label so a fill is scored separately
from the groove.

- **backbeat** (1 bar) — kick 0, 2; snare 1, 3.
- **eighth-hats** (1 bar) — kick 0, 2; snare 1, 3; hats on all eight eighths.
- **syncopated** (1 bar) — kick 0, 1.5, 2.75; snare 1, 3; hats all eighths.
- **boom-bap-2bar** (2 bars, both labelled `groove`) — **curriculum M2**:
  - bar 1: kick 0 and 2.5; hats 0, 0.5, 1, 1.5, 2, 2.5, 3 (they stop at 3 to
    leave the last eighth to the open hat); snare accented on 1 and 3; open hat
    3.5.
  - bar 2: kick 0, 2, 2.75 (a sixteenth pickup before beat 4); hats on all eight
    eighths; snare accented on 1 and 3.
- **turnaround-fill** (4 bars, labels `groove groove groove fill`) — **curriculum
  M3**; the fill bar is: snare accented on 0 and 1 with sixteenths at 0.25, 0.5,
  0.75, 1.25, 1.5, 1.75; kick 2 and 3; perc accented at 2 and 2.5; snare accented
  at 3; open hat accented at 3.5.

---

## 10. Jazz content — `data/jazz.json`

One file, many tables:

- **JAZZ_CHORD_TYPES** (8): maj7, m7, dom7, mMaj7, m7b5, dim7, and two more,
  each with its chord-tone intervals.
- **CHORD_EXTENSIONS** (7).
- **CHORD_SCALE_MAP** (22 rows) — `{ family, scale, label, recommended, hint }`,
  e.g. maj7 → lydian, "Brighter than major — #11 instead of 11."
- **DOMINANT_VOICINGS** (3), by semitone offsets above the root:
  - `rootless9` "Rootless (3 5 7 9)" → [4, 7, 10, 14]
  - `rootlessB9` "Rootless b9 (3 7 b9 5)" → [4, 10, 13, 19]
  - `altered` "Altered (7 b9 3 b13)" → [10, 13, 16, 20]
- **UPPER_STRUCTURES** (7): us-II, us-bIII, us-bIII-min, us-bV, us-bV-min,
  us-bVI, …
- **TWELVE_KEY_CYCLE** (12) — the key order drills cycle through.
- **IMPROV_TECHNIQUES** (10): chord-tone-soloing, parent-scale, half-step-below,
  chromatic-enclosure, v7-scale-change, bebop-scale, …
- **JAZZ_CURRICULUM** (10 ordered steps) — each with order, title, one-sentence
  summary, source citations (`JT1`, …), a route, and a skill id. Step 1 is
  "Memorize your intervals … set a 30–60 day deadline".
- **JAZZ_REPERTOIRE** (33 tunes) — title + feel.
- **JAZZ_BACKING_TRACKS** (5): swing-125, swing-115, swing-40, ballad-65,
  bossa-125, each with bpm, label, the songs it suits, and an audio path.
- **JAZZ_LICK_CATEGORIES** (5): major-ii-V-I, major-ii-V-I-VI, minor-ii-V-i,
  minor-chord, guitar-pentatonic.
- **JAZZ_LICKS** (31) — number, category, progression, scales, techniques, tip.
  Standard progressions used: major `Dm7 G7 Cmaj7`, minor `Dm7b5 G7 Cm7`.
- **LICK_PHRASES** — the playable notes for each lick number, as
  `[midi, beats]` tuples, or `[midi, beats, { string, fret, finger }]` where the
  lick is fretboard-specific.
  - **Lick 30** (curriculum G3, "Box one, twelfth fret"): E minor pentatonic box
    1, strings 2–4, frets 12–15 in standard tuning, two bars of 4 beats, with a
    string/fret/finger on every note.
  - **Lick 31**: the same shape, fingers and strings at the fifth fret in A minor
    — explicitly framed as a transfer, not a new lick.

---

## 11. Voicing drill (ii-V-I) targets — `data/voicing-drill.json`

Default config: piano, variant `major`, start position `A`, strict off, auto
advance on. That default expands to **36 targets** (12 keys × 3 chords).

Each target is `{ id, skillIds, symbol, expectedPitchClasses, expectedBassPc,
mode, displayMidi }`, e.g. the first one:

```
{ id: "C-Dm7", skillIds: ["harmony.ii-v-i", "harmony.ii-v-i.voicings.major"],
  symbol: "Dm7", expectedPitchClasses: [2,5,9,0,4], expectedBassPc: 2,
  mode: "chord", displayMidi: [62,65,69,72,76] }
```

Positions alternate A-B-A (or B-A-B) so the voicings stay close together on the
keyboard. "Closest chords" matching uses a **2-semitone** tolerance.

---

## 12. Two-hand piano patterns — `data/two-hand-patterns.json`

Six patterns: `lh-pulse-rh-line` (Pulse + line), `rh-pulse-lh-line` (Role swap),
`lh-shell-rh-line` (Shell + line), `alberti-rh-holds` (Alberti + holds),
`contrary-motion-scale` (Contrary scale), `contrary-five` (Mirror hands).
Hand modes: both / left / right.

Generation constants, exactly:

- Major step ladder used by the running lines: `[0, 2, 4, 5, 7, 9, 11]`.
- Left shell (one per beat): `[0, 7, 10, 7]`.
- Right fragment (two per beat): `[0, 2, 4, 7, 9, 7, 4, 2]`.
- Alberti (two per beat): `[0, 7, 4, 7]`; right-hand holds: `[0, 4, 7, 12]`.
- **contrary-five ("Mirror hands", curriculum P1)** — C major five-finger, out
  and back, one note per beat in *each* hand:
  - right steps `[0, 2, 4, 5, 7, 5, 4, 2]`
  - left steps `[0, -1, -3, -5, -7, -5, -3, -1]`
  - fingers `[1, 2, 3, 4, 5, 4, 3, 2]` (authored, displayed, never graded — MIDI
    cannot see fingers)
  - **Mirror hands is the only pattern that puts both thumbs on the same letter
    an octave apart** (C3/C4, left root = right root − 12). Every other pattern
    puts the accompaniment two octaves down (− 24).
  - It is also the only pattern that measures simultaneity; the others
    deliberately move the hands at different rates, so reporting "together" for
    them would be noise.
- Hand split for grading is by register: `splitMidi = floor((lhRoot + rhRoot) / 2)`.

The file also contains fully expanded target-event lists for all six patterns at
tonic C4, 80 BPM, 2 bars, as a reference rendering.

---

## 13. Ear training — `data/ear-training.json`

Seven drills: `intervals`, `chord-qualities`, `cadences`, `scale-degrees`,
`melody-dictation`, `repertoire-transfer`, `mixed`.

Default config: `{ drill: "mixed", answerMode: "choice", feedbackMode:
"practice", scaleDegreeSet: "anchor", scaleDegreeLabelMode: "degree" }`.

The file also carries the ear-training learning path definition (6 steps) and
the capability list each drill advertises.

Scale-degree sets progress from an "anchor" set upward; the twelve degrees are
named 1, b2, 2, b3, 3, 4, #4, 5, b6, 6, b7, 7.

---

## 14. Cadences and chord qualities — `data/cadences-and-chord-qualities.json`

**Cadences** — four, each two chords, played as literal MIDI with the second
chord starting at 1.1 s:

| Token | Label | Roman | Chord 1 | Chord 2 |
|-------|-------|-------|---------|---------|
| authentic | Authentic | V–I | 55 59 62 65 | 48 52 55 60 |
| plagal | Plagal | IV–I | 53 57 60 65 | 48 52 55 60 |
| half | Half | I–V | 48 52 55 60 | 55 59 62 67 |
| deceptive | Deceptive | V–vi | 55 59 62 65 | 57 60 64 69 |

**Chord qualities** — nine, by semitone intervals from the root:

triad level — major [0,4,7], minor [0,3,7], diminished [0,3,6], augmented [0,4,8];
seventh level — major-7 [0,4,7,11], dominant-7 [0,4,7,10], minor-7 [0,3,7,10],
half-diminished-7 [0,3,6,10], diminished-7 [0,3,6,9].

Each carries the skill id it feeds (`harmony.triad.*`, `harmony.seventh.*`).

---

## 15. Note reading and sight-reading levels — `data/reading-levels.json`

Four levels, each with a recommended difficulty, clefs, MIDI range and key set:

| Id | Label | Rhythm | Difficulty | Clefs | Range | Keys |
|----|-------|--------|-----------|-------|-------|------|
| primer | Primer | quarters and halves | 0.2 | treble | 60–72 | C major |
| level-1 | Level 1 | quarters, halves, simple eighths | 0.4 | treble | 55–79 | C, G, F major |
| level-2 | Level 2 | eighth-note motion | 0.55 | treble, bass | 48–84 | C, G, F major; A, E minor |
| level-3 | Level 3 | eighths and syncopation | 0.7 | treble, bass | 43–88 | C, G, D, F, Bb major; D minor |

The single-note flashcard default is piano, treble clef, C major, MIDI 60–72.
Bass clef maps to the left-hand voice, treble to the right-hand voice.
Answer choices are drawn from a chromatic list that includes both spellings
(C, C#, Db, D, D#, Eb, E, F, F#, …).

---

## 16. Daily routine templates — `data/daily-routine.json`

Steps are 5 minutes each; the default budget is 20 minutes (clamped 1–120), and
the plan is truncated to fit the budget.

**Default steps**, in order: `ear` (Ear training review →
`/music/learn/ear/scale-degrees?level=anchor`), `reading` (`/music/learn/reading`),
`rhythm` (`/music/learn/rhythm`), `scales` (`/music/play/scales`).

**Recommended step pool** adds: `chord-scales`, `licks`, `voicings`, `spider`,
`chord-perfect`, `two-hand`, `mpc`, `aerophone`.

**Per-instrument default order:**

| Instrument | Steps |
|-----------|-------|
| piano | scales, ear, reading, rhythm |
| guitar | spider, ear, chord-perfect, rhythm |
| ukulele | spider, ear, chord-perfect, rhythm |
| mpc | mpc, rhythm |
| aerophone | aerophone, ear, rhythm, scales |
| voice | ear, rhythm |

**Which steps an instrument is even allowed:** chord-scales and licks →
piano/guitar/ukulele/aerophone; reading → piano/guitar/ukulele; scales →
piano/guitar/ukulele/aerophone; voicings → piano only; spider and chord-perfect →
guitar/ukulele; two-hand → piano only; mpc → mpc; aerophone → aerophone.

Weak-skill recommendations are inserted first (deduplicated by route), then the
instrument defaults fill the rest of the budget.

The file contains the resolved plan for each instrument plus the generic plan.

---

## 17. Challenges — `data/challenges.json`

Four daily challenges with default targets: hit 100 XP today; 3 reps on the
weakest skill; touch 2 distinct capability areas; keep the streak alive. Days are
UTC days keyed by ISO date prefix; the weekly summary reports XP, sessions and
completed challenges.

---

## 18. Skill graph seed — `data/skill-graph-seed.json`

**122 skills, 108 relationships.**

Skill id convention is `<capability>.<topic>[.<detail>]`: `pitch.intervals`,
`pitch.interval.m2` … `pitch.interval.P8` (12 interval nodes), `pitch.scale-degrees`
plus `pitch.scale-degree.{1,b2,2,b3,3,4,#4,5,b6,6,b7,7}`, `harmony.triads` and
`harmony.triad.{major,minor,diminished,augmented}`, `harmony.seventh.*`,
`harmony.ii-v-i` and its voicing children, `technique.mpc` and
`technique.mpc.groove.<family>`, `technique.piano.two-hand-independence`,
`technique.piano.independence.shell-line`, `technique.aerophone.breath-steadiness`,
`ear.cadences.*`, and so on.

Each node has: id, name, capability, difficulty level (`beginner`,
`early-intermediate`, `intermediate`, `advanced`), tags, a schema `version`, and
optional `deprecated` / `replacedBy` for when a node is split or merged.

Relationships are `{ from, to, kind, threshold? }` with three kinds:

- `prerequisite` — `from` must be reasonably mastered before `to` unlocks.
  **Default unlock threshold 0.6** when a relationship does not state one.
- `component` — `to` is a sub-part of `from` (this is what draws the tree).
- `related` — suggestion only, never gates.

---

## 19. Learning paths — `data/learning-paths.json`

Three instrument paths: **guitar** (9 steps), **piano** (9 steps), **mpc**
(8 steps). Plus a separate ear-training path (6 steps) living in the ear-training
data.

Each step carries: `id`, `order`, `title`, a one-sentence `summary`, an optional
`detail` saying what "done" means to the learner, source `resources`, a `kind`
(`drill` / `review` / `reference`), an in-app `href` with the drill setup encoded
as query parameters, optional extra `links`, `requires` (step ids that must be
done first), `evidence`, `skillIds`, `modalities`, `exerciseIds`, `minSessions`,
`minAttempts`, and `applies` (how it generalises across instruments).

Two rules to keep:

- **`LEARNING_PATH_DONE_THRESHOLD = 0.66`** — mean mastery over a step's skills
  at or above this is "done".
- **`evidence`** is `independent` by default (only unaided Check answers count,
  the same rule as mastery). Some steps are marked `guided-accepted` purely
  because their drill has no Check mode yet, which would otherwise lock the step
  and everything behind it forever. Hinted attempts never count either way, and
  `guided-accepted` **never** affects skill-graph mastery, which keeps the strict
  rule. Each of these is meant to be removed when Check mode lands on its drill.
- A step with an unfinished prerequisite is `locked`; the lowest-order open step
  is `next`. Reference steps with no skills never block "Continue".

---

## 20. Comping patterns — `data/comping-patterns.json`

Piano comping rhythms with a left-hand voice and a right-hand voice, plus the
"blue third" C7 reference voicing. The timing window for a comping hit is derived
from the shared score-follower window with a half-beat duration.

---

## 21. Default settings — `data/default-settings.json`

```
echoCancellation: false
reduceMotion: false
instrumentColorCoding: true
audioInputLabel: "Default input"
audioOffsetMs: 0
midiOffsetMs: 0
preferredPlaybackSound: "salamander-piano"
playbackLevel: 0.8
metronomeLevel: 0.7
masterLevel: 1
muted: false
metronomeEnabled: true
countInBars: 1
activeInstrument: "piano"
tempoByVariant: {}
```

Playback sounds: `salamander-piano` (Sampled Piano), `warm-synth` (Warm Synth),
`synth` (Synth), `e-piano` (E-Piano), `square` (Square), `saw` (Saw).

Other defaults worth carrying:

- Rhythm drill: 100 BPM, 4 beats, pattern `quarter-pulse`, mode `pulse`;
  BPM clamped 40–220, beats clamped 2–16.
- Technique tempo ladder base: **100 BPM**.
- Instruments the app knows: piano, guitar, ukulele, aerophone, mpc, voice.
- Input sources: midi, audio, onscreen, click.
