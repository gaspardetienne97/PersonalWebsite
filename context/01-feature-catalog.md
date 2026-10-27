# Practice OS — Feature Catalog (behaviour-level, for a clean-room rebuild)

Everything below is read off the existing product. Numbers, thresholds and content tables are
exact. Nothing here describes how the code is organised — only what the user sees, does, and gets.

Sections 1 to 7 are the previous app. Section 8 lists what the rebuild added; treat both as the target.

---

## 1. Product summary and who it is for

Practice OS is a single-owner, offline-first music practice app that lives at `/music` inside a
personal website. It is built for one person who plays **piano**, **guitar** (and ukulele),
**Akai MPC One+ finger drums**, and a **Roland Aerophone** wind controller, and who wants every
minute of practice to be measured, remembered and turned into a recommendation for the next
minute. It combines ear training, note reading and sight-reading, rhythm, scales and technique,
harmony and jazz vocabulary, instrument-specific technique drills, a song library with a
wait-mode/performance score follower, a beat sequencer and piano roll, a recorder for MIDI and
audio takes, a jam/backing-track surface, a tuner and intonation trainer, and a transcription
tool. Every graded attempt flows through one scoring pipeline into a skill graph, an analytics
store, an XP/streak/level system, and a practice journal — all stored locally in the browser,
never uploaded. The app is a PWA and works offline.

Non-goals baked into the current product: no accounts, no server sync, no social/leaderboards
(challenges are personal and non-competitive), no open real-time polyphonic chord recognition.

---

## 2. Navigation and hubs

Persistent shell: a desktop sidebar (grouped) plus a mobile bottom tab bar, a top bar with search,
and a **floating practice-controls capsule** pinned above route content.

**Four primary hubs** (each "owns" sub-routes, so a drill lights up its hub):

| Hub | Path | Owns | Contains |
|---|---|---|---|
| Practice | `/music` | `/music/play/*`, `/music/learn/*`, `/music/jam` | Three tabs: **Today** (daily routine + coach), **Drills** (every drill card, filterable), **Paths** (guided curricula) |
| Library | `/music/library` | `/music/songs/*` | Three tabs: **Songs**, **Reference** (chord/scale + jazz chord-scale matches), **Import** (with a Score import / Transcribe audio sub-toggle) |
| Create | `/music/create` | `/music/record` | Two modes: **Beat grid**, **Piano roll**; Record is a nested destination |
| Progress | `/music/progress` | `/music/track` | Three views: **What next**, **Skills**, **Sessions** |

**Four utility hubs** (sidebar links on desktop, a "More" menu on phones): **Connect**
(`/music/connect`), **Tuner** (`/music/tuner`), **Settings** (`/music/settings`), **Guide**
(`/music/guide`).

**Command palette** — ⌘K / Ctrl-K opens a search over one flat index: "Start today's plan", every
drill, every path, every library item, every create item, plus Tuner, Connect, Progress, Journal,
Settings. Arrow keys move, Enter navigates.

**Floating practice controls** (four controls, always visible and named even on phones):
1. **Instrument** picker (piano / guitar / ukulele / aerophone / MPC / voice), with a "Pinned" hint.
2. **Metronome** toggle (audible preview when idle; reflects the persisted "keep clicking during a run" preference while running).
3. **Tempo** popover — numeric BPM plus common tempos.
4. **Count-in** popover — Off / 1 bar / 2 bars, plus a beat indicator ("Beat 3 of 4").

Instrument, tempo and count-in lock during count-in and while a run is active; the metronome stays
available. When a drill run starts, the app enters **focus mode**: the global site header and
footer are hidden and the stage owns the screen.

**Drill anatomy** — every structured drill uses the same three-phase shell:
- **Setup** — the only phase with setup controls; a Start button; usually a Demo button (demos are never scored).
- **Stage** — a live instrument surface, a HUD tile row, a progress bar, a status line, a side rail of run facts, and a Stop/cancel action above the stage.
- **Summary** — a results card with a big headline metric, a "vs last run" delta for the same setup, per-dimension breakdown, XP earned, retry actions (often "again / faster / slower"), a "Change setup" link, a "continue routine" action when the run came from the daily routine, and a "next up" suggestion.

**Page headers** — each route owns a big `h1`, a subtitle, and right-aligned controls: a segmented
control and/or an **input pill** showing the live input source (MIDI / On-screen / Microphone).

**Hub pages** persist their tab in the URL (`?tab=` on Library, `?mode=` on Create and Tuner,
`?view=` on Progress, `?tab=` on Practice), so bookmarks and the back gesture land on the same view.

---

## 3. Master table of every drill and activity

| Activity | Route | Instrument(s) | Inputs | What the user does | Scoring rule | Feedback | Persists |
|---|---|---|---|---|---|---|---|
| Intervals (ear) | `/music/learn/ear/intervals` | any | click choice, MIDI, on-screen | Hear two notes, name the interval (or play it back) | Binary 1/0; direction must match for asc/desc | "Correct — Minor 6th." / "That was …" | Scoring event, mastery on `pitch.interval.*`, XP, journal tag `["ear","interval"]` |
| Chord qualities (ear) | `/music/learn/ear/chord-qualities` | any | click, MIDI, on-screen | Hear a triad/7th, name the quality or play it | Binary; played chords classified by pitch-class shape | Same-shape feedback | Mastery on `harmony.triad.*` / `harmony.seventh.*` |
| Cadences (ear) | `/music/learn/ear/cadences` | any | click only | Hear two chords, name the cadence | Binary | "That was a Plagal cadence." | Mastery on `ear.cadences.*` |
| Scale degrees (ear) | `/music/learn/ear/scale-degrees` | any + voice | click, MIDI, on-screen, **microphone (voice mode)** | Hear tonic then a note, answer its function | Binary | Correct/target label | Mastery on `pitch.scale-degree.*` |
| Melody dictation (ear) | `/music/learn/ear/melody-dictation` | any | MIDI, on-screen only | Hear a 3–4 note phrase, play it back in order | matched/total by pitch class, position-wise; correct only at 1.0 | Target phrase shown | Mastery on the degrees, per-degree confusions |
| Repertoire transfer (ear) | `/music/learn/ear/repertoire-transfer` | any | MIDI, on-screen | Hear a phrase lifted from one of your saved songs, play it back | Same as melody dictation | Ranked review queue by weakest degree | Mastery on the degrees |
| Ear training review (mixed) | `/music/learn/ear/mixed` | any | click, MIDI, on-screen | Adaptive mix of intervals, chord qualities, scale degrees, cadences | Per-prompt binary | Per-drill accuracy + confusion list | Everything above; the daily routine's ear step |
| Note Reading | `/music/learn/reading` (flashcards) | piano, guitar, ukulele | click choice, MIDI, on-screen | Name or play the note(s) on the staff | Binary, enharmonic-tolerant | Correct/target; "practice missed" retry | Mastery on `reading.treble.*` / `reading.bass.*` |
| Sight-reading | `/music/learn/reading` (sight-reading) | piano, guitar, ukulele | MIDI, on-screen, microphone | Play a generated phrase, wait or performance mode | Score follower (see §5) | Missed/extra notes, missed-group retry | Reading skills, journal |
| Rhythm Trainer | `/music/learn/rhythm` | any | MIDI, on-screen tap button, microphone onsets | Tap the pulse, or read-and-tap a written pattern | Pulse: `max(0, 1 − meanAbsErr/160)`, correct ≥0.85. Pattern: same timing score minus rest/miss/extra penalties | Ahead/behind ms, jitter, per-hit grid | Rhythm skills, journal |
| Scales & Technique | `/music/play/scales` | piano (reference view on guitar/uke/aerophone) | MIDI, on-screen | Play a scale evenly at the target tempo | `pitch×0.85 + evenness×0.15`, correct ≥0.90 | Evenness %, notes clean, hands-together count | Scale skills, **persisted tempo ladder per setup** |
| String Independence (Spider) | `/music/play/spider` | guitar, ukulele | MIDI, on-screen fretboard, microphone | Four sub-modes: Spider, Positions, Note finder, Interval recall | Spider/Positions: `pitch×0.85 + evenness×0.15`, ≥0.90. Note finder / interval recall: binary | Clean count, ms timing error, next position | `technique.strings.*` + per-instrument children |
| Chord-Perfect | `/music/play/chord-perfect` | guitar, ukulele | MIDI, on-screen fretboard, microphone | Four modes: Build, Pick, Strum & identify, Changes | Build: matched/total, correct only if all. Strum: `confidence×0.35 + verification×0.65`. Changes: mean coverage; clean-change rate | Per-string ticks, tone map (missing/extra), changes-per-minute, chord-pair history | `technique.{guitar,ukulele}.{chord-perfect,chord-changes,open-chord-id}` |
| Two-Hand Independence | `/music/play/two-hand` | piano | MIDI, on-screen | Each hand plays its own part | `pitch×0.8 + evenness×0.2` (with dynamics: `0.7/0.15/0.15`), correct ≥0.90 | LH/RH accuracy, together count, spacing error | `technique.piano.two-hand-independence` |
| MPC Rudiments | `/music/play/mpc` (rudiment) | MPC pads | MIDI pads, on-screen pads, QWERTY pad mapping | Alternate pads to a click | `pad×0.45 + timing×0.3 + velocity×0.15 + completion×0.1`; correct = complete, pad ≥0.875, mean timing ≤90 ms, velocity ≥0.65 (≥0.875 with bands) | Pad accuracy, ms error, velocity, "not measured" on on-screen | `technique.mpc.single-strokes` / `.paradiddles` |
| MPC Grooves | `/music/play/mpc` (groove) | MPC pads | MIDI pads, on-screen pads | Copy back a 1/2/4-bar groove | `accuracy` (matched / (targets+extras)); with assessable accents `accuracy×0.85 + dynamics×0.15`; correct = 0 missed, 0 extra, mean timing ≤90 ms | Per-voice and per-section breakdown, expected-groove grid | `technique.mpc.groove.<family>` |
| Aerophone Technique | `/music/learn/aerophone` | aerophone | MIDI note + breath CC2, on-screen chart | Four modes: Long tone, Swell, Articulation, Interval landing | See §4.9 | Breath trace, swell envelope, attack grid, steadiness % | `technique.aerophone.*` |
| ii-V-I Voicings | `/music/play/voicings` | piano (arpeggio on monophonic) | MIDI, on-screen | Play resolved jazz voicings through 12 keys | Chord-hold match with inversion/root gates; voice-leading variant scores membership + minimal movement | Per-chord and per-voice-leading results | `harmony.ii-v-i` + variant children |
| Jazz Licks | `/music/play/licks` | piano, guitar | MIDI, on-screen (taps also verify string/fret) | Hear a transcribed line, play it back | Positional pitch-class match; `matched/total`; correct at ≥0.90 | Notes matched, on-time count, fretted position count, missed-chunk practice window | `harmony.ii-v-i.licks.*` |
| Chord-Scale Drill | `/music/play/chord-scales` | piano (pitched instruments) | MIDI, on-screen | As a ii-V-I moves, play the go-to scale for each chord | Per-chord note sequence match | Chords graded count, target-tone map | `harmony.ii-v-i.chord-scales.{major,minor}` |
| Chord Progression | `/music/play/chord-progression` | guitar, ukulele | **microphone** (chroma + onsets), keys | Strum a known progression in time | Chord-follower alignment: coverage minus extra-tone penalty, timing window per strictness | Matched chords, detected tones readout | One journal entry (no fabricated mastery) |
| Free Play / Practice Lab | `/music/play` | any | MIDI, on-screen, microphone | Record everything played, optionally over a backing track | Unscored | Note count, range, per-source counts, live meter | Free-practice session + audio take |
| Jam / Improv | `/music/jam` | any | MIDI, on-screen, microphone | Solo over a progression with target tones lit | Unscored; a post-chorus tone report | Chord/scale/avoid colouring, chorus tone report | Recorded notes, chorus takes |
| Song Studio | `/music/songs/[id]` | any | MIDI, on-screen | Practise a saved score in wait or performance mode | Score follower per take; aggregate across takes | Per-take and per-section summary, best take, early/on-time/late counts | One journal entry per completed session, one run record per execution |
| Tuner | `/music/tuner?mode=tune` | any | microphone | Tune a note or a string | Not scored | Big note, cents, direction, arc gauge, Hz | Nothing |
| Intonation | `/music/tuner?mode=intonation` | any | microphone | Hold pitch and watch drift | Not scored | In-tune %, hold seconds, steadiness, avg drift, 10 s pitch trace | Nothing |
| Drone | `/music/tuner?mode=drone` | — | — | Hold a tonic drone | — | Tonic, Hz, timbre, volume | Nothing |
| Beat grid | `/music/create?mode=beat` | MPC pads | on-screen grid, pads | Build a 16-step pattern, load samples, export an MPC kit | Not scored | Playing step, pad triggers | Sample kits, patterns |
| Piano roll | `/music/create?mode=piano-roll` | — | mouse/keys | Sketch a multitrack part | Not scored | Grid, velocity lane | Score |
| Record | `/music/record` | any | MIDI, microphone | Capture MIDI and audio takes, compare, rename, annotate, export | Not scored (a compare accuracy % is shown) | Waveform, mini piano roll, level meter with advice | Takes (MIDI in memory/shared list, audio in local storage) |
| Journal | `/music/track` | — | — | Read and edit practice history | — | Week rollups, 12-week heatmap, focus areas, goals | Sessions, notes, next-time reminders, tags |

---

## 4. Drill detail and authored content

### 4.1 Ear training

**Seven drill routes**, each its own page with its own setup. The Ear Training Path orders them.

| Slug | Title | Description | Answer modes (first = default) | Level control | Label control | Queue |
|---|---|---|---|---|---|---|
| `intervals` | Intervals | Two notes, name the distance. Ascending, descending, harmonic. | Choice, Play-back, Pocket, Listen along | no | no | balanced |
| `chord-qualities` | Chord qualities | Triads and seventh chords by ear. | Choice, Play-back, Pocket, Listen along | no | no | balanced |
| `cadences` | Cadences | Authentic, plagal, half and deceptive cadences in a stated key. | Choice, Pocket, Listen along | no | no | balanced |
| `scale-degrees` | Scale degrees | Hear a note over the tonic and answer its function. | Choice, Play-back, **Voice**, Pocket, Listen along | yes | yes | balanced |
| `melody-dictation` | Melody dictation | Hear a short phrase, play it back in order. | Play-back only | yes | yes | balanced |
| `repertoire-transfer` | Repertoire transfer | Phrases from your saved songs, mapped back to scale degrees. | Play-back only | yes | yes | balanced |
| `mixed` | Ear training review | A short adaptive mix of intervals, chord qualities, scale degrees and cadences. | Choice, Play-back, Pocket, Listen along | yes | yes | **adaptive** |

**Answer modes**
- **Choice** — tap one of the offered answer buttons. Input source is `click`.
- **Play-back** — play the answer on MIDI or the on-screen surface.
- **Voice** — sing it; the microphone's detected pitch is the answer (scale-degrees only).
- **Pocket recall** — listening-only: think or sing, tap **Reveal answer**, then self-rate **Heard it** / **Missed it**. Self-rated reps still flow into the pipeline (marked `self-assessed`, so they do **not** advance mastery) and still write journal/XP/analytics.
- **Listen along** — answers are visible, prompts advance automatically, **unscored**.

**Feedback mode** — Practice (per-prompt feedback, wait for Continue) or Test (no feedback, auto-advance).

**Session length** defaults to 10 prompts.

**Scale-degree levels** (the authored degree sets):

| Level id | Title | Summary | Degrees |
|---|---|---|---|
| `anchor` | Anchor | Hear home and dominant: 1 and 5. | 1, 5 |
| `major-pentachord` | Major pentachord | Map the first five major degrees around the tonic. | 1, 2, 3, 4, 5 |
| `major-diatonic` | Major diatonic | Recognize all seven major-key functions. | 1, 2, 3, 4, 5, 6, 7 |
| `minor-diatonic` | Minor diatonic | Recognize natural-minor functions around the tonic. | 1, 2, b3, 4, 5, b6, b7 |
| `chromatic-color` | Chromatic color | Add b2 and #4 color tones around the diatonic degree map. | all 12 |
| `full-current` | Current full set | Review every scale-degree skill currently seeded in the app. | all 12 |

Degrees and solfège: 1/do, b2/ra, 2/re, b3/me, 3/mi, 4/fa, #4/fi, 5/sol, b6/le, 6/la, b7/te, 7/ti.
Labels can show `"3 / mi"` (degree mode) or just `"mi"` (solfège mode).

**Interval set** (12): m2 1, M2 2, m3 3, M3 4, P4 5, TT 6, P5 7, m6 8, M6 9, m7 10, M7 11, P8 12.
Prompt root is MIDI 48 + 0–12. Direction is ascending below difficulty 0.4; above it, 60 %
ascending / 30 % descending / 10 % harmonic. Ascending/descending play 0.65 s apart, 0.55 s each;
harmonic plays both for 0.8 s.

**Chord qualities** (9): Major [0,4,7], Minor [0,3,7], Diminished [0,3,6], Augmented [0,4,8],
Major 7th [0,4,7,11], Dominant 7th [0,4,7,10], Minor 7th [0,3,7,10], Half-Diminished 7th
[0,3,6,10], Diminished 7th [0,3,6,9]. Below difficulty 0.65 only the four triads are offered as
choices. Root MIDI 48 + 0–12; the chord plays for 0.9 s.

**Cadences** (4): Authentic V→I, Plagal IV→I, Half I→V, Deceptive V→vi. Each is two block chords
(1.0 s, then 1.1 s later for 1.2 s), transposed by a random −5…+6 semitones so the answer is
functional, not absolute.

**Scale contexts** by difficulty: <0.35 major, <0.6 natural minor, <0.8 harmonic minor, else
melodic minor; chromatic is used when the target degree needs it. A scale-degree prompt plays the
tonic (0.55 s) then the target (0.7 s later, 0.65 s).

**Melody dictation** — phrase length 3 below difficulty 0.65, else 4; the phrase starts on the
target degree, and a 4-note phrase returns to the target then the tonic. Tonic plays first, then
the notes at 0.55 s intervals.

**Repertoire transfer** — phrases are lifted from saved songs and ranked by the weakest scale-degree
skill after the forgetting curve, plus a phrase-difficulty term from melodic range, leap size and
chromatic degrees. Each phrase is tagged new / due / strong. A plan groups the queue into
**warmup, review, new and stretch** blocks and can be run as one multi-prompt session. The ranking
re-runs after each practice and on level change.

**Free-play warmup** (on the scale-degree drill's landing) — hold a tonic drone and play unscored
tonic→degree comparisons from the selected level. Deliberately writes nothing: no XP, no mastery,
no analytics, no journal.

**Summary** shows total, correct, accuracy, XP, streak days, a per-drill breakdown, and a
**confusion list** ("expected m6, answered P5" with counts). A **retry schedule** can be built from
the top confusions (up to 10, one per skill, at difficulty 0.5).

**Ear Training Path** (six steps, each opening one drill with its setup):

| # | Step | Adds | Done means | Opens |
|---|---|---|---|---|
| 1 | Anchor the tonic | Degrees 1 and 5 over a drone, in listening mode | Listening warmup; self-marked reps are not a mastery assessment | scale-degrees, Listen along, Anchor |
| 2 | Build the diatonic degree map | 2, 3, 4, 6 and 7. Answer by choice | ≥1 unaided choice answer for each major degree, each averaging ≥66 % | scale-degrees, Choice, Major diatonic (+ Minor diatonic link) |
| 3 | Sing or play the target | Same degrees, answered on your instrument or by voice | Each major degree produced in ≥2 sessions without hints, each ≥66 % | scale-degrees, Play-back (+ Voice link) |
| 4 | Transfer into short melodies | Short phrases as degree slots, then your own songs | Each major degree attempted in unaided melody phrases, each ≥66 % | melody-dictation (+ Repertoire transfer link) |
| 5 | Add chromatic color | b2, b3, #4, b6, b7 | ≥1 unaided choice answer for each color degree, each ≥66 % | scale-degrees, Chromatic color |
| 6 | Attach harmony and interval vocabulary | Intervals, chord qualities, cadences mixed in | Unaided heard answers for intervals, triads and cadences, each ≥66 % | mixed review (+ per-drill links) |

### 4.2 Note reading and sight-reading

Two activities on one route, chosen in setup: **Flashcards** and **Sight-reading**.

Setup: activity, instrument (piano / guitar / ukulele, with a tuning for fretted), clefs
(treble / bass / both), key signature, MIDI range (21–108, default 48–84), reading level,
difficulty 0–1, transpose, prompt kind (single note / chord), answer mode (choice / play), follower
mode (wait / performance), BPM 40–200 (default 90), strictness, meter (simple / compound),
measures 1–8 (default 2).

**Reading levels** (authored):

| Id | Label | Description | Rhythm | Difficulty | Clefs | Range | Keys |
|---|---|---|---|---|---|---|---|
| primer | Primer | Landmark notes and stepwise motion. | quarters and halves | 0.20 | treble | 60–72 | C major |
| level-1 | Level 1 | Stepwise phrases in familiar keys. | quarters, halves, simple eighths | 0.40 | treble | 55–79 | C, G, F major |
| level-2 | Level 2 | Wider range, bass-clef option, quicker movement. | eighth-note motion | 0.55 | treble, bass | 48–84 | C, G, F major; A, E minor |
| level-3 | Level 3 | Compound meter, syncopation, mixed rhythmic values. | eighths and syncopation | 0.70 | treble, bass | 43–88 | C, G, D, F, Bb major; D minor |

Selectable keys: C major, G major, F major, D major, Bb major, A minor, E minor, D minor.

Flashcard choices are drawn from a 17-name chromatic list (C, C#, Db, D, D#, Eb, E, F, F#, Gb, G,
G#, Ab, A, A#, Bb, B) spelled to the key; chord prompts join names with hyphens. Answers are
enharmonic-tolerant.

Sight-reading renders a generated score with a local Play/Pause preview. Fretted instruments get an
opt-in **Show/Hide tab** reveal (hidden by default so it cannot short-circuit reading the staff).
Piano sight-reading labels the current target **Left hand / Right hand / Both hands**.

Summary offers **Again**, a faster/slower retry, **Practice the notes you missed** (regenerates from
the missed groups) and a return to Practice.

### 4.3 Rhythm

Two modes: **Pulse** (tap the beat) and **Read and tap** (a written pattern).
Setup: pattern, beats 2–16 (default 4), BPM 40–220 (default 100).

**Rhythm pattern catalog** (all 4/4):

| Id | Label | Bars | Content |
|---|---|---|---|
| quarter-pulse | Quarter-note pulse | 1 | 4 quarters |
| eighths | Eighth notes | 1 | 8 eighths |
| sixteenths | Sixteenth notes | 1 | 16 sixteenths |
| eighth-rests | Eighth-note rests | 1 | Quarters on the beats; rest windows on every off-eighth |
| triplets | Triplets | 1 | 12 eighth-note triplets |
| off-beats | Off-beats (syncopation) | 1 | Tap only the four "&"s; the downbeat halves are rest windows; click audible |
| dotted-quarters | Dotted quarters over 4/4 | 2 | 6 hits every 1.5 beats, accents alternating; click audible both bars |
| swing-eighths | Swing eighths | 1 | 8 hits, off-eighths at 2/3 of the beat, first accented |
| gap-click-1-on-1-off | Gap click: 1 on / 1 off | 2 | 8 quarters; click audible bar 1, silent bar 2 |
| guitar-four-on-the-floor | Guitar: four on the floor (D to A) | 4 | 16 downstrokes, accent every bar line; chords D (bars 1–2) then A (bars 3–4) |
| guitar-island-strum | Guitar: island strum with a mute (G to C) | 4 | Per bar: D(1 beat) D U (mute) U D U; chords G then C |

Pattern scoring: each expected onset claims the nearest unused hit inside a match window derived
from the pattern's smallest event spacing. Timing score `max(0, 1 − meanAbsErr/160)`; penalties are
0.2 per hit inside a rest window (cap 0.5), 0.2 per missed event (cap 0.6), 0.1 per extra hit
(cap 0.3). Correct at ≥0.85. A **mute** stroke counts only when an onset landed in its window and
no pitched note did. When a pattern carries chords and pitch was heard, chord identity is also
graded and reported ("Chords: G held · C missed"); with no pitch it reports timing only.

Pulse feedback names the direction: **ahead** below −20 ms mean signed error, **behind** above
+20 ms, otherwise **centered**.

### 4.4 Scales and technique (piano)

Setup: Scale, Tonic, Span, Motion, Hands, Instrument view, plus a one-tap
**"Hands together, one octave, 80"** preset. Tempo comes from the floating controls (60–180,
default 100).

**Scales** (17): major, natural-minor, harmonic-minor, dorian, phrygian, lydian, mixolydian,
locrian, melodic-minor, major-pentatonic, minor-pentatonic, blues, altered, bebop-major,
bebop-dominant, whole-tone, diminished. The picker groups them as **Modes** and **Jazz / modal**.

Semitone sets (octave inclusive):

| Scale | Intervals |
|---|---|
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

Tonics: the 12 chromatic pitches at octave 4 (C4, Db4, … B4). Spans: pentascale (first five below
the octave), one octave, two octaves. Motions: up, down, up-down (the octave is not repeated).
Hands: right, left (same line an octave down), both (the line doubled an octave apart, in parallel).

Scoring: one pitch metric per expected note, one timing metric per beat against an even grid
anchored on the first onset. `evennessScore = max(0, 1 − meanSpacingError/180)`.
`score = pitch×0.85 + evenness×0.15`, correct at ≥0.90. With **hands together** the app also
reports how many beats landed within **40 ms** between the hands; an on-screen run reports
"Together not measured" rather than a false zero, but a MIDI run that simply missed hands scores
those beats 0. The "Hands together, one octave, 80" preset adds an extra bar: evenness ≥0.85.

**Tempo ladder** — persisted per exact setup (scale · tonic · motion · span · hands). Base rung
100 BPM, step 10, six rungs shown, ceiling 180. A clean run at or above the current rung unlocks
the next; a rung never drops. The summary card is the only place the ladder appears, with rungs
marked Unlocked / Next / Locked and retry buttons "Practice next tempo" and "Slower".

### 4.5 Guitar / ukulele technique

**String Independence** (`/music/play/spider`) has four modes:

1. **Spider** — a finger pattern on one or more strings. Setup: pattern, tuning, string, string span, starting fret (0 … min(9, fretCount−3), default 5), string-crossing toggle. Tempos 60/80/100/120, default 80.
   Patterns: the four **classic spiders** — `1-2-3-4 ascending`, `4-3-2-1 descending`, `1-3-2-4 inside-out`, `1-4-2-3 outside-in` — followed by **all 24 finger orders** under "All finger orders".
   Spans: Single string, 2 adjacent strings, 3 adjacent strings, All strings from start.
   Crossing mode: each pattern step lands on the next string in the span, one pass starting from each string.
2. **Positions** — a box or shape, arpeggiated. Shapes: **Minor pentatonic boxes 1–5** and the five **CAGED major shapes** (E, D, C, A, G), each with a root-fret picker.
3. **Note finder** — find a named note in a region; binary scoring.
4. **Interval recall** — from an unlabelled anchor, find the ascending interval inside a 5-fret window. Intervals: Minor third (3), Major third (4), Perfect fifth (7), Octave (12). Regions: frets 0–4, 5–9, 10–14. No timing or fingering is assessed. Five recent correct independent answers suggest the next region up.

**Tunings** (curated):

| Instrument | Id | Name | Open strings (string 1 first) | Frets |
|---|---|---|---|---|
| guitar | guitar.standard | Standard | 64 59 55 50 45 40 | 22 |
| guitar | guitar.drop-d | Drop D | 64 59 55 50 45 38 | 22 |
| guitar | guitar.dadgad | DADGAD | 62 57 55 50 45 38 | 22 |
| guitar | guitar.open-g | Open G | 62 59 55 50 43 38 | 22 |
| ukulele | ukulele.high-g | High G | 69 64 60 67 | 15 |
| ukulele | ukulele.low-g | Low G | 69 64 60 55 | 15 |
| ukulele | ukulele.baritone | Baritone DGBE | 64 59 55 50 | 15 |

Custom tunings are allowed (ids must start with `custom.`, 6 strings for guitar / 4 for ukulele,
1–36 frets).

**Chord-Perfect** (`/music/play/chord-perfect`) has four modes: **Build** (fret the shape and sound
each string low→high), **Pick**, **Strum & identify**, **Changes**.

Authored open shapes (frets are string-1-first; `x` = muted):

| Id | Name | Instrument | Frets | Fingers | Difficulty | Common transitions |
|---|---|---|---|---|---|---|
| guitar.c-major | C major | guitar | 0 1 0 2 3 x | – 1 – 2 3 – | 2 | G, Am, D, G7, F |
| guitar.g-major | G major | guitar | 3 0 0 0 2 3 | 3 – – – 1 2 | 2 | C, D, Em |
| guitar.d-major | D major | guitar | 2 3 2 0 x x | 2 3 1 – – – | 2 | G, Am, A |
| guitar.e-minor | E minor | guitar | 0 0 0 2 2 0 | – – – 3 2 – | 1 | G, Am |
| guitar.a-minor | A minor | guitar | 0 1 2 2 0 x | – 1 3 2 – – | 2 | C, Em, E, B7 |
| guitar.e-major | E major | guitar | 0 0 1 2 2 0 | – – 1 3 2 – | 2 | A, Am, B7 |
| guitar.a-major | A major | guitar | 0 2 2 2 0 x | – 3 2 1 – – | 2 | D, E, Bm |
| guitar.d-minor | D minor | guitar | 1 3 2 0 x x | 1 3 2 – – – | 2 | G, Am |
| guitar.f-major | F major (full barre) | guitar | 1 1 2 3 3 1 | 1 1 2 4 3 1 | 5 | C, G |
| guitar.b7 | B7 | guitar | 2 0 2 1 2 x | 4 – 3 1 2 – | 4 | E, Am |
| guitar.b-minor | B minor (barre) | guitar | 2 3 4 4 2 x | 1 2 4 3 1 – | 5 | A, Em |
| guitar.g7 | G7 | guitar | 1 0 0 0 2 3 | 1 – – – 2 3 | 2 | C, G |
| ukulele.c-major | C major | ukulele | 3 0 0 0 | 3 – – – | 1 | F, G, Am |
| ukulele.f-major | F major | ukulele | 0 1 0 2 | – 1 – 2 | 2 | C, G |
| ukulele.g-major | G major | ukulele | 2 3 2 0 | 1 3 2 – | 2 | C, F |
| ukulele.a-minor | A minor | ukulele | 0 0 0 2 | – – – 2 | 1 | C, F |

Each shape can also be shown at **other positions up the neck** (position 0 is the curated shape)
through a position stepper. Fretted drills show a **fret window**, not the whole neck, with finger
numbers on the dots; the screen-reader grid keeps absolute "String n fret f, note" labels.

**Build** grades each voiced string in ascending pitch order; correct only when every target note
matched. The UI is explicit that pitch matching measures note selection, not string choice or tone
cleanliness.

**Strum & identify** records one strum through the microphone, transcribes the whole buffer, names
the chord from a ranked candidate list, and checks it against the selected shape. Chord
identification matches a pitch-class set against 18 quality templates across all 12 roots (maj,
m, dim, aug, sus2, sus4, add9, 6, m6, maj7, m7, 7, 7sus4, m7b5, dim7, 9, maj9, m9), ranked by
Jaccard similarity, inversion-agnostic. Score = `confidence×0.35 + verification×0.65`; correct
requires both the right symbol and a full, extra-free verification.

**Chord-tone verification** (used by the mic verifier and chord following): coverage of the expected
pitch-class set minus `0.25 × (extra tones / expected tones)`; correct only at full coverage with
no extra tones. Feedback lists observed, missing and extra tones.

**Changes** — pick a from-chord and a to-chord, 1–8 round trips or a timed one-minute-changes run,
optionally against a clock (BPM plus beats-per-chord, 4 = change on the bar). Reports completed
changes, clean changes, **changes per minute**, on-time changes, and keeps a chord-pair history.

### 4.6 Two-hand independence (piano)

Setup: tonic (C4, G4, F4, D4), tempo (60/80/100/120, default 80), pattern, hand mode
(Both / Left / Right), dynamics toggle.

**Patterns**: Pulse + line (LH steady root, RH eighth-note line), Role swap, Shell + line,
Alberti + holds, Contrary scale, **Mirror hands** (C major five-finger out and back; the only
pattern that asks the hands to strike together, with authored fingering 1 2 3 4 5 4 3 2).

Hands are split by register at a split MIDI note. Each hand is graded independently on pitch order
and spacing evenness. `score = pitch×0.8 + evenness×0.2`; with dynamics on,
`pitch×0.7 + evenness×0.15 + dynamics×0.15`. Correct at ≥0.90. Dynamics credit is full at a 0.2
mean-velocity separation between the melody hand and the accompaniment. Together window is 40 ms;
an on-screen run reports "Together not measured". Authored fingerings are shown on the keys and
never graded.

### 4.7 MPC (finger drums)

Two modes on one route: **Rudiment** and **Groove**. Pads can be played from MIDI, the on-screen
16-pad Bank A grid, or a documented QWERTY pad mapping.

**Rudiment patterns**:

| Id | Label | Unit | Grid |
|---|---|---|---|
| single-strokes | Single strokes | L R | selectable |
| double-strokes | Double strokes | L L R R | selectable |
| paradiddle | Paradiddle | L R L L R L R R | selectable |
| moving-accent | Moving accent | L R with a moving accent | selectable |
| single-16ths | Sixteenth singles | L R | fixed sixteenths |
| triple-strokes | Triple strokes | L L L R R R | fixed triplets |
| flam | Flam | grace note 30 ms before the main hit on the other hand | selectable |

Subdivisions: Eighths (2/beat), Triplets (3), Sixteenths (4) — a pattern's own grid wins.
Hit counts 8 or 16. Tempos 60/80/100/120 (clamped 30–240). Two different pads, defaults 36 and 38.
Velocity bands where used: accent 0.75–1.0, tap 0.25–0.70.

Timing is measured against the count-in downbeat when there is one, otherwise against the first hit
(so a run with no anchor degrades to "even spacing scores well" instead of grading against zero).
`score = pad×0.45 + timing×0.30 + velocity×0.15 + completion×0.10`, where
`timingAccuracy = 1 − meanAbsErr/180`. Correct needs completion 1.0, pad accuracy ≥0.875, mean
timing error ≤90 ms, and velocity ≥0.65 (≥0.875 when the pattern writes velocity bands). On-screen
input has fixed velocity, so the summary shows "Not measured" and reports a velocity-free score.

**Groove catalog** (kick 36, snare 38, hats 42, open hat 46, 808 35, perc 39; velocity bands
accent ≥90/127, normal 50–89/127; match window `min(180 ms, beat/8)`):

| Id | Label | Bars | Sections | Content |
|---|---|---|---|---|
| backbeat | Kick / snare | 1 | groove | kick 1, 3; snare 2, 4 |
| eighth-hats | Eighth-note hats | 1 | groove | kick 1, 3; snare 2, 4; hats all eighths |
| syncopated | Syncopated kick | 1 | groove | kick 1, 2&, 3a; snare 2, 4; hats all eighths |
| boom-bap-2bar | Boom bap · 2 bars | 2 | groove, groove | Bar 1: kick 1 and 3&, hats to beat 4, accented snares 2 and 4, open hat on 4&. Bar 2: kick 1, 3, 3a; hats all eighths; accented snares 2 and 4 |
| turnaround-fill | Turnaround with a fill | 4 | groove ×3, fill | Boom-bap bars 1, 2, 1 again, then a fill bar: eight sixteenth snares accented on each beat, kicks on 3 and 4, two accented percs, accented snare on 4, accented open hat on 4&; the downbeat of bar 5 is graded as the last target |

Groove scoring: each target claims the nearest unused matching hit inside the window.
`accuracy = matched / (targets + extras)`; with assessable accents (variable MIDI velocity present)
`score = accuracy×0.85 + inBandTargets/targets ×0.15`. Correct = zero omissions, zero extras and
mean timing ≤90 ms. Feedback breaks the run down **per voice** (matched / missed / extra / timing)
and **per section** (groove vs fill), and prints the expected groove as a sixteenth-note grid with
1 e & a headers.

### 4.8 Harmony and jazz

**Jazz chord vocabulary** (8 families, all shown on C):

| Symbol | Name | Family | Role | Extensions |
|---|---|---|---|---|
| Cmaj7 | Major 7 | maj7 | The I chord of a major ii-V-I. | Cmaj9, Cmaj7#11, C6, C6/9 |
| Cm7 | Minor 7 | m7 | The ii chord of a major ii-V-I. | Cm9, Cm11 |
| C7 | Dominant 7 | dom7 | The V chord of a ii-V-I. Takes every altered extension (b9 #9 #11 b13). | C9, C13, C7b9, C7#9, C7#11, C7b13, C7alt, C7sus4 |
| CmMaj7 | Minor-major 7 | mMaj7 | The i chord of a minor ii-V-i ("the James Bond chord" with a 9th). | CmMaj9 |
| Cm7b5 | Half-diminished | m7b5 | The ii chord of a minor ii-V-i. | — |
| Cdim7 | Diminished 7 | dim7 | Passing chord; stacks of minor 3rds (C Eb Gb A). | — |
| C6 | Major 6 | maj6 | A brighter tonic than maj7. | C6/9 |
| Cm6 | Minor 6 | min6 | Tonic minor with a major 6th. | Cm6/9 |

**Extension rules**: 9 (=14 st, "the 2nd an octave up"), b9 (13, altered, over V7), #9 (15, altered,
over V7), 11 (17, the 4th an octave up, m7/V7), #11 (18, the lydian colour, maj7/V7), 13 (21, the
6th an octave up, V7 only), b13 (20, altered — "C7b13" means C7 altered).

**Chord-scale map** (recommended first):

| Family | Scales (★ = go-to) |
|---|---|
| maj7 | ★Lydian ("brighter than major — #11 instead of 11"), Major (Ionian), Major bebop (major + #5 passing note), Major pentatonic, Major blues |
| m7 | ★Dorian ("minor with a major 6th"), Minor blues, Minor pentatonic |
| dom7 | ★Lydian dominant ("mixolydian with a #11"), Mixolydian, Dominant bebop (mixolydian + maj7 passing note), Altered ("think Db melodic minor"), Diminished half-whole ("gives b9 #9 #11"), Whole tone ("for 7#5 chords") |
| m7b5 | ★Locrian ("think the major scale a half-step above"), Locrian #2 ("think Eb melodic minor") |
| dim7 | ★Diminished whole-half |
| mMaj7 | ★Melodic minor |
| min6 | ★Dorian, Melodic minor |
| maj6 | ★Major (Ionian), Lydian |

**Voicing recipes**: rooted `1 3 5 7`; shell `1 3 7`; rootless A `3 5 7 9` (use when the melody note
is the 9th); rootless B `7 9 3 5` (use when the melody note is the 5th). Rootless voicings put the
root in the left hand.

**Dominant voicings**: Rootless (3 5 7 9) offsets 4 7 10 14, "plain dominant colour"; Rootless b9
(3 7 b9 5) offsets 4 10 13 19, "diminished tension"; Altered (7 b9 3 b13) offsets 10 13 16 20,
"max tension; resolves strongly".

**Upper structures over a V7** (LH shell 1 3 7, RH triad; ★ = a favourite):

| Id | Triad | Root offset | Quality | Adds |
|---|---|---|---|---|
| us-II ★ | II maj | 2 | maj | 9 #11 13 |
| us-bIII | bIII maj | 3 | maj | #9 |
| us-bIII-min | bIII min | 3 | min | #9 #11 |
| us-bV | #IV maj | 6 | maj | b9 #11 |
| us-bV-min | #IV min | 6 | min | b9 #11 13 |
| us-bVI ★ | bVI maj | 8 | maj | #9 b13 |
| us-VI ★ | VI maj | 9 | maj | b9 13 |

**12-key cycle** (the drill order): C, Bb, Ab, Gb, E, D, C#, B, A, G, F, Eb.

**ii-V-I Voicing Drill** (`/music/play/voicings`) has three variants plus an inversions variant:
- **Major** — rootless ii-V-I in all 12 keys, positions alternating A-B-A (or B-A-B) for smooth voice leading.
- **Minor** — iiø7 (rootless A) → V7alt → i-m7 (rootless B), fixed positions, all 12 keys.
- **Altered** — per key: V7b9, V7alt, then the II-major upper structure over V7.
- **Inversions / voice leading** — pick the next chord's third and seventh with the least total semitone movement inside a stated register. Sequential taps count as two notes; timing is not graded.

Polyphonic instruments are graded on the held chord; monophonic (Aerophone) on the arpeggio.
Non-strict chord mode tolerates extra notes and does not require notes to be held together ("notes
collected"). Chord scoring: full credit when every target pitch class is present and the
inversion/root gates pass; half credit for right membership with wrong hands/root. Voice-leading
scoring: 1 if membership is right and movement is minimal within tolerance, 0.5 for right
membership only, otherwise 0.

**Jazz Licks Drill** (`/music/play/licks`) — 31 authored licks with playable transcriptions, in five
categories: `major-ii-V-I` (1–11), `major-ii-V-I-VI` (12–17), `minor-ii-V-i` (18–24),
`minor-chord` (25–29), `guitar-pentatonic` (30–31).

| # | Progression | Scales | Tip |
|---|---|---|---|
| 1 | Dm7 G7 Cmaj7 | chord tones | Solo using only the 1 3 5 7 of each chord. |
| 2 | Dm7 G7 Cmaj7 | C major | The C major scale works over all three chords of a major ii-V-I. |
| 3 | Dm7 G7 Cmaj7 | G dominant bebop | Add a triplet to vary rhythm; the bebop chromatic note is Gb. End lines on 1 3 5 or 7. |
| 4 | Dm7 G7 Cmaj7 | C major | Half-step-below approach into the changes: Bb→B and Eb→E. |
| 5 | Dm7 G7 Cmaj7 | C major | The approach is most effective at the chord change. Aim for the chord's major 3rd. |
| 6 | Dm7 G7b9 Cmaj7 | C major | You can precede all 7 scale notes with the half-step-below approach (F#→G, D#→E). |
| 7 | Dm7 G7#9b9 Cmaj7 | C major, G half-whole diminished | Go IN, then OUT over the V7, then back IN. |
| 8 | Dm7 G7#9b9 Cmaj7 | G half-whole diminished | Diminished line over G7 with a stride left hand. |
| 9 | Dm7 G7alt Cmaj7 | G altered (Ab melodic minor) | Altered scale over G7 with a rootless altered voicing underneath. |
| 10 | Dm7 G7alt Cmaj7 | G altered | Inject 8th-note rests for interesting rhythm. |
| 11 | Dm7 G7alt Cmaj7 | G altered | A sequence: a repeating melodic shape moving up or down. |
| 12 | Dm7 G7 Cmaj7 A7 | C major | ii-V-I-VI loops: the A7 resolves back to Dm7. |
| 13 | Dm7 G7 Cmaj7 A7 | D minor bebop (D dorian + Db) | Start lines from every possible note; chromatic enclosure before the A7. |
| 14 | Dm7 G7alt Cmaj7 A7b9 | G altered | Half-step approach into G7alt; chord-tone solo over A7b9. |
| 15 | Dm7 G7 Cmaj7 A7 | G half-whole diminished | Diminished over G7; chromatic enclosure before the A7. |
| 16 | Dm7 G7#9b9 Cmaj7 A7b9 | G half-whole diminished | Diminished over G7 with a stride left hand. |
| 17 | Dm7 G7b9 Cmaj7 A7 | C major | Half-step approaches Bb→B and Eb→E; chromatic enclosure before the A7. |
| 18 | Dm7b5 G7 Cm7 | chord tones | Chord-tone solo. Over a minor ii-V-i you change scale on each chord. |
| 19 | Dm7b5 G7 Cm7 | D locrian, G diminished, C dorian | The standard minor ii-V-i scale set. |
| 20 | Dm7b5 G7#9b9 Cm7 | D locrian, G diminished, C dorian | Stride left-hand texture. |
| 21 | Dm7b5 G7#9b9 Cm7 | D locrian, G diminished, C dorian | Half-step-below approaches C#→D and F#→G. |
| 22 | Dm7b5 G7b9 Cm7 | chord tones | Inject 8th-note rests; chord-tone solo. |
| 23 | Dm7b5 G7alt Cm7 | D locrian, G altered, C dorian/melodic minor | Altered scale over G7 with a rootless altered voicing. |
| 24 | Dm7b5 G7alt Cm7 | D locrian, G altered, C dorian | Another altered minor ii-V-i line. |
| 25 | Cm7 | C dorian, C minor blues | Minor-chord lick in straight time. Half-step-below approach. |
| 26 | Cm7 Fm7 | C dorian, F dorian | A bossa-nova bass line plays the root and 5th of each chord. |
| 27 | Cm7 | C minor blues | Bluesy, accented minor-blues line. |
| 28 | Cm7 | C dorian | Paradiddle texture — the L/R/L/R pattern works over any chord. |
| 29 | Cm7 | C minor pentatonic | Ascending minor pentatonic in 4-note cells; LH plays the first note of each cell. |
| 30 | Em D | E minor pentatonic | Box 1 at the twelfth fret, three fingers. Land the D on beat 3 of bar 1 and let it ring. |
| 31 | Am D | A minor pentatonic | The same shape, fingers and strings at the fifth fret. Transfer, not a new lick. |

Lick playback: hear the line at tempo, or **at half speed**; pick a contiguous **note range** (first
and last note) to drill a chunk, **loop a chunk 3 times**, or jump to a four-note window around the
first wrong note. Grading is positional pitch-class match (octave-lenient; extras past the phrase
are ignored). Fretted instruments also report **string/fret position** for on-screen taps (MIDI and
microphone measure nothing there) and **on-time** notes within `min(180 ms, beat/4)`. Check mode
hides the targets for a recall pass.

**Improv techniques** (10 cards): Chord-tone soloing; One parent scale; Half-step-below approach;
Chromatic enclosure; Change scale over the V7; Bebop scales; Melodic sequence; Rhythmic variation;
Start from any note; Left-hand textures (stride, bossa bass, paradiddle, 4-note cells).

**Chord-Scale Drill** (`/music/play/chord-scales`) — two change sets, **major** and **minor**. As the
progression moves, play the go-to scale for the current chord; each chord is graded note by note
against the scale, with a chord-tone / scale-tone / avoid-tone colour key and a chord chart.

**Jazz repertoire** — 33 standards, swing first then Latin:
*Swing (26)*: Autumn Leaves, Misty, Satin Doll, Stompin' At The Savoy, All The Things You Are,
Cry Me A River, Afternoon In Paris, Ladybird, Summertime, Taxi Driver, Fly Me To The Moon, Caravan,
Dolphin Dance, They Can't Take That Away From Me, Just Friends, Easy Living, Stella By Starlight,
Georgia On My Mind, All Of Me, Bye Bye Blackbird, In A Sentimental Mood, It Could Happen To You,
My Funny Valentine, My Romance, Night And Day, Night In Tunisia.
*Latin (7)*: Girl From Ipanema, Blue Bossa, Song For My Father, So Nice (Summer Samba),
Slow Hot Wind, Invitation, One Note Samba.

**Backing tracks** (audio files, user-supplied):

| Id | Style | BPM | Label | Suits |
|---|---|---|---|---|
| swing-125 | swing | 125 | Swing — 125 bpm | Autumn Leaves, Afternoon in Paris |
| swing-115 | swing | 115 | Swing — 115 bpm | — |
| swing-40 | swing | 40 | Slow swing — 40 bpm | Georgia On My Mind |
| ballad-65 | ballad | 65 | Ballad — 65 bpm | Misty, Tenderly, Cry Me A River |
| bossa-125 | bossa-nova | 125 | Bossa nova — 125 bpm | Girl from Ipanema, So Nice, Blue Bossa |

### 4.9 Aerophone

One route with four modes. Input is a wind controller sending notes plus **breath controller CC2**;
the on-screen fingering chart can also select a note (but on-screen taps score pitch only —
articulation and breath need the hardware).

Setup: mode, target note (stepper plus the chart), duration/tempo/interval per mode.
Defaults: target MIDI 67 (G4).

| Mode | Setup | Scoring | Correct when |
|---|---|---|---|
| **Long tone** | hold 3 / 5 / 8 s | `steadiness×0.7 + pitch 0.2 + progress 0.1` | full hold, steadiness ≥0.80, right pitch |
| **Swell** | 4 / 6 / 8 s | `shape×0.5 + smoothness×0.2 + pitch 0.2 + progress 0.1` | full duration, shape ≥0.80, smoothness ≥0.75, right pitch |
| **Articulation** | staccato or legato; 70 / 90 / 110 BPM; a repeated-note count (default 8) | `pitch×0.5 + articulation×0.5`, where articulation = `max(0, 1 − |meanSoundingFraction − target| / 0.6)`, target **0.35** of the beat for staccato and **0.95** for legato | every pitch right and articulation ≥0.70 |
| **Interval landing** | interval and direction against a drone | `pitch 0.45 + steadiness×0.45 + progress 0.1` | right pitch, full hold, steadiness ≥0.75 |

Interval-landing intervals: Perfect fourth (5), Perfect fifth (7), Octave (12), Major third (4),
Minor third (3). Direction up or down.

Stage shows a breath trace, a pitch trace (last 64 samples), and mode-specific art: a drone
interval lane, a swell envelope, an articulation attack grid, or a long-tone stage. The current
fingering is drawn beside it.

**Fingering chart** — sax fingering mode, written pitch, covering **Bb3 (58) to F#5 (78)**:

| MIDI | Note | Keys | Octave |
|---|---|---|---|
| 58 | Bb3 | k1 k2 k3 k4 k5 k6 lowBb | – |
| 59 | B3 | k1 k2 k3 k4 k5 k6 lowB | – |
| 60 | C4 | k1 k2 k3 k4 k5 k6 lowC | – |
| 61 | C#4 | k1 k2 k3 k4 k5 k6 lowC# | – |
| 62 | D4 | k1 k2 k3 k4 k5 k6 | – |
| 63 | Eb4 | k1 k2 k3 k4 k5 eb | – |
| 64 | E4 | k1 k2 k3 k4 k5 | – |
| 65 | F4 | k1 k2 k3 k4 | – |
| 66 | F#4 | k1 k2 k3 k5 (long F#) | – |
| 67 | G4 | k1 k2 k3 | – |
| 68 | G#4 | k1 k2 k3 g# | – |
| 69 | A4 | k1 k2 | – |
| 70 | Bb4 | k1 bisBb | – |
| 71 | B4 | k1 | – |
| 72 | C5 | side C | – |
| 73 | C#5 | (open) | – |
| 74 | D5 | k1 k2 k3 k4 k5 k6 | ✓ |
| 75 | Eb5 | k1 k2 k3 k4 k5 eb | ✓ |
| 76 | E5 | k1 k2 k3 k4 k5 | ✓ |
| 77 | F5 | k1 k2 k3 k4 | ✓ |
| 78 | F#5 | k1 k2 k3 k5 (long F#) | ✓ |

Key registry drawn on the instrument: six main tone keys (LH index/middle/ring, RH index/middle/
ring), Bis Bb, G#, Low C#, Low B, Low Bb, Side E, Side C, Side Bb, Eb, Low C, four left palm keys,
a front key, and three black keys on each side (reserved, not yet used by any fingering).
The app labels C4, D4, E4, F4, G4, A4, B4, C#5, D5, Eb5 as verified; the low pinkies, Eb4, both
long F#s, G#4, the bis Bb and the side C are marked best-effort.

### 4.10 Jam / improv

Setup: progression group, progression, backing mode (drums or generated chords), drum track, tempo
(40–220), transpose (±12 semitones).

**Progressions** (5 groups: Pop, Guitar/Uke, Jazz, Blues, Modal):

| Id | Name | Key | Group | Difficulty | Default BPM | Chords (bars) |
|---|---|---|---|---|---|---|
| ii-v-i | ii–V–I | C major | jazz | intermediate | 110 | Dm7 / D dorian (2), G7 / G mixolydian (2), Cmaj7 / C major (2), A7 / A mixolydian (2) |
| minor-ii-v-i | Minor ii–V–i | C minor | jazz | advanced | 96 | Dm7b5 / D locrian (2), G7alt / G altered (2), Cm7 / C dorian (2) |
| blues | 12-bar blues | C | blues | beginner | 95 | C7 (4), F7 (2), C7 (2), G7 (2), C7 (2) — all mixolydian |
| modal | Modal vamp | D dorian | modal | beginner | 84 | Dm7 / D dorian (4), Em7 / E dorian (4) |
| pop-axis | I–V–vi–IV | C major | pop | beginner | 92 | C, G, Am, F (1 each) |
| guitar-g-d-em-c | G–D–Em–C | G major | guitar-uke | beginner | 96 | G, D, Em, C (1 each) |

For the current chord, all 12 pitch classes are labelled **chord tone**, **scale tone** or
**avoid**, and lit on the instrument view. Controls: play the chord, advance manually, play/stop
the backing, record. A HUD shows backing status, tempo, notes recorded, and the chorus count. After
a chorus, a **chorus tone report** says how the solo sat on the changes; chorus takes can be
reviewed.

### 4.11 Song library and Song Studio

**Library ▸ Songs** lists saved repertoire with a preview; opening one goes to Song Studio.
**Library ▸ Import** accepts **MIDI**, uncompressed **MusicXML**, and compressed **.mxl**, previews
the canonical metadata, and saves it to repertoire.
**Library ▸ Transcribe** turns an audio file into a draft score in the browser and can save it to
repertoire; a manual note-row editor is also available. Extractor output is cleaned with a
confidence floor of 0.25, a minimum note length of 0.05 s, chronological sorting, and merging of
same-pitch fragments less than 0.08 s apart.

**Song Studio** setup:
- **Voices/parts** — session-local multi-select; MusicXML voices group by source part, MIDI voices stay individually selectable. An empty selection is not allowed, and selection cannot change during a run.
- **Range** — Whole score, Sections (multi-select, order Sequence or Per section), or Custom range dragged/tapped on the notation with **measure** or **note-group** snap.
- **Mode** — **Wait** (the score waits for the right notes) or **Performance** (real time).
- **BPM**, **strictness** (relaxed / normal / strict), **count-in**, and **1 / 2 / 4 / 8 takes** (performance only; wait mode is always one take).
- **View** — Staff, Tab (with a tuning picker), Fingering (a row of Aerophone diagrams from the monophonic top line), or Waterfall. Staff and Tab both support custom-range drag selection; Fingering is disabled while editing a range.

Actions: play a preview, export MIDI, cancel a run. A "staff preview unavailable" fallback points
at Waterfall when a score contains notation the staff renderer cannot draw.

Results: aggregate score, matched/expected notes, pitch completion, mean absolute timing error,
early / on-time / late / missed / extra counts, **best take**, a per-take table and a per-section
table. Retry buttons set the tempo to +8, same, or −8 BPM (floor 20). One journal entry per
completed session, one run record per execution, and deliberately **no mastery events for imported
songs**.

### 4.12 Create: beat grid, piano roll, recorder

**Beat grid** — a 16-step sequencer over a pad bank with Tone playback and persistent **MPC sample
kits**. Kits cover MPC **Banks A–D**, MIDI 36–99 (A: 36–51, B: 52–67, C: 68–83, D: 84–99); the panel
shows one 16-pad bank at a time with an A/B/C/D selector. Imported samples auto-map by filename,
can be renamed or deleted in place, and each pad can carry a **soft/hard velocity layer split**
(0–0.63 / 0.64–1) and an **MPC choke group** 1–16 (same-group pads cut each other off). Rows whose
MIDI maps to an active pad play the sample; the rest fall back to the synth.
**MPC kit export** writes an XPM 2.1 Drum Program plus a `Samples/` folder (wav, wave, aif, aiff,
flac, mp3, ogg, oga), as a directory or a ZIP.

**Piano roll** — a multitrack note editor over the canonical score: add/remove/clear voices, toggle
notes on a grid, a velocity lane, per-voice velocity, explicit **Resize mode** for drag-resizing,
horizontal zoom, an **Add bar** control for longer sketches, track colours that wrap across voices,
and play / export MIDI / export WAV.

**Record** — one take list shared with the Practice Lab. Per MIDI take: an inline-editable name, a
mini piano-roll thumbnail, note count and duration, an inline note field, Play/Pause, **Export
MIDI**, **Open in Piano Roll**, **Save to Song Studio**, Delete. A **Compare takes** panel shows an
alignment accuracy % and matched/total notes. An **audio take** panel handles microphone arming and
device choice, a live input meter with plain-language advice (**clipping** at ≥ −1 dB, **a little
hot** at ≥ −6 dB, **good level** at ≥ −30 dB, otherwise **quiet**; floor −60 dB), waveform envelopes,
per-take playback gain (**−12 to +18 dB**, never rewriting the recording), rename, note, download
and delete, performance vs backing review volumes, and a retry-save path if a save fails.
Limits: 60 min per take, 250 MB per imported backing track, a 1 GB application budget with an 80 %
quota fraction.

**Practice Lab** (`/music/play`) — free-practice capture with live monitoring and an optional
backing track, plus a synchronized dry audio take for review. It reports note count, distinct
notes, range and per-source counts; it is unscored. The page also links out to the technique drills
(Scales, MPC Rudiments, Spider, Chord-Perfect, Two-Hand, Aerophone Articulation, Tuner, Song
Library).

### 4.13 Tuner, intonation, drone

- **Tune** — start the microphone, get a very large note name + octave, signed cents with a direction word, an arc gauge with flat/sharp neighbours, live Hz and the target Hz. Default A4 = 440 with a reference picker; in-tune tolerance ±5 cents; frames below 0.6 detector clarity are ignored so the readout holds instead of flickering. Fretted instruments get a string strip and a tuning picker.
- **Intonation** — the same readout plus rolling stats: **In tune %**, **Hold** seconds, **Steadiness %**, **Avg drift** in cents, and a 10-second pitch trace with the tolerance band drawn.
- **Drone** — no microphone. Pick a tonic from a 12-button chromatic pad (coloured by scale degree), a timbre (**Sine**, **Cello**, **Shruti** — Shruti stacks the fifth and octave for a tanpura-like bed), and a volume; one Play/Stop.

---

## 5. Cross-cutting systems

### 5.1 Input routing

One router arbitrates every input source. Sources and their confidence: **MIDI 1.0**, **on-screen
0.8**, **microphone** the detector's own confidence (default 0.7, clamped 0–1), **click** 0.6.
Rules:
- MIDI activity suppresses on-screen input for **1.5 s** after the last MIDI attack, so a stray tap cannot steal the active source mid-run. A paired note-off is always delivered so the owning source can let go.
- MIDI can be filtered by active instrument and by **active MIDI channel** (1–16).
- A note-off never becomes the active source.
- Saved **latency offsets** are subtracted from incoming timestamps once, at the router, so every scorer grades against corrected time: an audio offset, a global MIDI offset, and per-device MIDI offsets that override the global one. Offsets are capped at ±500 ms.
- On-screen taps can carry a **string and fret**, so fretted drills can verify position; MIDI and microphone carry pitch only.

**Offset calibration** — a tap-along run at **90 BPM**, **20 clicks**, the first **4 ignored** as
warm-up. Each click claims the nearest unclaimed tap within **200 ms of the run's own median**; the
median difference is the offset. A run is only accepted when at least **14** of the remaining clicks
were answered and the interquartile spread is **≤30 ms**. The UI says plainly that this is an
estimate that includes reaction time, not a hardware measurement. Usable range is ±half a beat
(±333 ms at 90 BPM).

### 5.2 Provenance (every claim the app makes about mastery rests on this)

Every graded attempt records how it was produced:
- **independent** — unaided. **Only independent attempts move skill mastery.**
- **guided** — the drill showed the answer or had no check mode.
- **hinted** — a hint was used mid-run.
- **self-assessed** — the learner rated themselves (Pocket recall).
- Missing (historical records) stays unknown and is never relabelled.

**Demos are never scored.** Listen-along is never scored. The free-play warmup is never scored.

Attempts also record **modality** (played / heard / read / sung / written / tapped / recognized),
**input source**, and **instrument** (never inferred from a default; a mixed-instrument run records
none).

### 5.3 Skill graph and mastery

A seeded graph of ~120 skills across six capabilities (Pitch, Rhythm, Harmony, Reading, Technique,
Ear), each with a difficulty band (beginner / early-intermediate / intermediate / advanced) and
tags. Umbrella skills aggregate children through **component** edges; **prerequisite** edges gate
unlocking.

Seeded families: 12 interval skills under *Intervals*; 12 scale-degree skills under *Functional
Scale Degrees*; 4 triads and 5 sevenths; 4 cadences; *ii-V-I* with 11 jazz children (major/minor/
altered voicings, guide-tone voice leading, major/minor chord-scales, five lick categories); rhythm
(quarter pulse, eighths, sixteenths, triplets, two subdivision nodes, gap click, syncopation,
dotted, swing, two guitar strum patterns); reading (treble and bass landmarks + stepwise,
polyphonic, compound meter); technique (6 scale-fluency skills; aerophone breath steadiness,
dynamic control, articulation, interval landing; string spider + permutations + note finder +
chord-perfect + chord changes + open-chord ID, each with guitar and ukulele children; guitar
interval recall for 3, 4, 7 and 12 semitones; piano two-hand independence, shell+line independence,
comping; MPC single strokes, paradiddles, and five groove families).

**Prerequisites**: major triad → dominant 7th (0.5); dominant 7th → ii-V-I (0.6); quarter pulse →
eighths (0.5); eighths → sixteenths (0.5); treble stepwise → polyphonic (0.5); bass stepwise →
polyphonic (0.5); eighths → compound-meter reading (0.5); major scale → natural minor scale (0.5).
A skill is unlocked when every prerequisite's mastery is at or above its threshold (default 0.6).

**Mastery maths** (per skill):
- Evidence weight `0.5 + difficulty` (so 0.5–1.5); performance is the attempt's partial credit.
- Update is an exponential moving average: `mastery += clamp01(0.3 × weight) × (performance − mastery)`.
- Confidence `= observations / (observations + 8)`.
- **Forgetting**: mastery decays at `exp(−0.02 × days)` since last practice; confidence decays at half that rate. Mastery is decayed to the event time before new evidence folds in.
- A skill is **due for review** when the current decayed estimate is **≥0.10** below the last measured value.

### 5.4 Scheduling and adaptivity

The scheduler builds a queue over every unlocked skill of every registered exercise:
- `reviewIntervalDays = max(1, 2^min(8, max(0, observations − 1)) × (0.75 + mastery))` — a doubling spaced-repetition ladder stretched by mastery.
- `reviewPriority = elapsedDays / reviewIntervalDays`; `weakness = 1 − meanScore` (0.5 with no history); `priority = reviewPriority + weakness×1.5 + weakRank×0.5`.
- Reason: **new** (0 observations), **weakness** (accuracy < 0.70), otherwise **review**.
- Presented difficulty: `clamp(0.4 + mastery×0.4 + adjustment, 0.2, 0.9)`, where the adjustment is +0.1 above 85 % accuracy and −0.1 below 65 % (only after 2 attempts).

Ear sessions consume this queue in one of two ways: **balanced** (round-robin across interval,
chord-quality, scale-degree, cadence) or **adaptive** (scheduler priority preserved, but never two
prompts of the same drill type back to back).

### 5.5 Analytics

Per skill the app tracks attempts, correct attempts, accuracy, mean score, a running **consistency**
measure (`1 − 2×stdev` of score, floored at 0), mean reaction time, chord-switch speed, and last
practiced. It also builds a **confusion matrix** per skill from choice answers and pitch answers
("heard m6, answered P5"; "expected C, played C#").

Weakest-skill queries can be scoped to an instrument and to **independent attempts only**, and
require a minimum attempt count. Coaching requires **at least 5 independent attempts** on the
instrument before it will name a weak spot; until then it says so plainly.

### 5.6 Progress: XP, level, streak, achievements, challenges

**XP per graded attempt** = `round(10 + partialCredit×30 + difficulty×20 + improvement×25)`, where
improvement is the best gain over that skill's previous score. **Level** = `floor(XP / 250) + 1`.

**Streak** counts consecutive practiced UTC days. **Streak freezes** can be granted; when a gap is
no larger than the freezes held, the missing days are frozen and the streak survives.

**Achievements** (six): `first-100-xp`, `level-5`, `seven-day-streak`, `first-skill-50` (any touched
skill reaches 0.50 mastery), `first-skill-mastered` (0.80), `first-freeze-save`.

**Daily challenges** (personal, non-competitive, four of them):

| Id | Title | Target | Measured from |
|---|---|---|---|
| daily-xp | Hit today's XP | 100 XP | XP in today's saved sessions |
| weak-spot-reps | *(named after your weakest skill)* | 3 reps | Attempts against that skill today |
| capability-variety | Cross-train two skills | 2 capabilities | Distinct capability areas in today's scoring events |
| keep-streak | Keep the streak alive | 1 | The same practiced-day record as the streak |

A neutral **weekly summary** reports XP, session count and completed challenges. There are no
leagues and no social ranking.

### 5.7 Daily routine and the practice coach

The **coach** projects the skill graph, analytics, progress and sessions into a deterministic,
entirely local recommendation: a headline ("Coach focus: Minor 7th"), a summary sentence, a focus
skill with its accuracy and attempt count, a routine, a list of insights (accuracy, active streak,
saved session count, a review-due note), and a primary action. It never calls an external service.

The **daily routine** builds a plan from the coach's picks plus a per-instrument default. Each step
is **5 minutes**; the total is capped by an available-time budget (default 20, offered as 5 / 10 /
20 / 30 minutes, clamped 1–120). Every step link carries the active instrument.

Default step order with no instrument: Ear training review → Note Reading → Rhythm → Scales &
Technique.

Per-instrument defaults:

| Instrument | Steps |
|---|---|
| piano | Scales, Ear, Reading, Rhythm |
| guitar | Spider, Ear, Chord-Perfect, Rhythm |
| ukulele | Spider, Ear, Chord-Perfect, Rhythm |
| mpc | MPC, Rhythm |
| aerophone | Aerophone, Ear, Rhythm, Scales |
| voice | Ear (forced into the sung answer mode), Rhythm |

Recommended steps the coach may insert, each restricted to the instruments it suits: Chord-scale
review, Lick recall, ii-V-I Voicings (piano), String Independence (guitar/uke), Chord Work
(guitar/uke), Two-Hand Piano (piano), MPC Rudiments (MPC), Aerophone Technique (aerophone), plus the
four defaults. Every ear drill shares one routine slot, so a per-drill recommendation still binds
to the single ear step.

Running the routine gives each step a Start link, marks it complete when its drill finishes (the
ear step completes by journal tag), and ends with a summary: completed steps, total XP, accuracy,
duration, and the combined scoring events, runs and tags — with **Repeat routine** and **Open
journal**.

### 5.8 Learning paths

A path is an ordered list of steps; each step opens **one drill with its setup** (query parameters
carry the setup, so a shared link lands on the same bar). A step declares the skills it measures,
optional modality and exercise filters, minimum attempts, minimum sessions, and prerequisites.

Status per step: **todo** (no skills), **not-assessed** (skills but no evidence), **in-progress**,
**done**, **locked** (an unfinished prerequisite), **next** (the lowest-order open step).
A step is **done** when each of its skills has enough unaided attempts, across enough distinct
sessions, averaging **≥0.66**. Paths show a done count and a Continue target.

Some steps accept `guided` evidence because their drill has no Check mode yet; hinted attempts never
count either way, and this never affects skill-graph mastery.

Content-applicability is a property of the content, not the page: melodic content is *pitched*,
chord voicings are *polyphonic* (and degrade to an arpeggio on a monophonic instrument, with a note
saying so), and instrument-specific drills are pinned to their instrument.

**Jazz Path** — ten ordered lessons:

| # | Lesson | Summary | Opens | Done means |
|---|---|---|---|---|
| 1 | Memorize your intervals | Every jazz technique is an interval pattern. Learn all ascending intervals first — set a 30–60 day deadline. | Intervals drill | mastery on Intervals |
| 2 | Read every chord symbol | maj7, m7, 7, mMaj7, m7b5, dim7, 6/9 and slash chords. | Reference page (+ Hear the qualities) | reference |
| 3 | Add chord extensions | Build the 9th, 11th, 13th (and b9 #9 #11 b13) from the major scale. | Reference page | reference |
| 4 | Learn the chord-scale relationships | One go-to scale per chord type. | Chord-scale drill, major (+ minor) | ≥3 unaided Check answers in each variant, each ≥66 % |
| 5 | Shell voicings | The guide tones (1 3 7). | Reference (+ voicings drill) | reference; polyphonic |
| 6 | Rootless voicings — ii-V-I in 12 keys | Positions A (3 5 7 9) and B (7 9 3 5). | Voicing drill | ≥36 unaided Check chord answers in each of major and minor, each ≥66 % |
| 7 | Altered & upper-structure V7 voicings | V7b9, V7 altered, upper-structure triads. | Voicing drill, altered | ≥36 unaided Check answers, ≥66 % |
| 8 | Play the licks over ii-V-I | Hear a line, play it back, then take it through the keys. | Licks drill (major, + minor) | ≥1 unaided Check phrase in each of major and minor, ≥66 %; pitch order only |
| 9 | Improvise over ii-V-I | Chord tones + approach patterns + bebop/altered/diminished scales. | Jam | — |
| 10 | Learn repertoire from a Real Book | Apply everything to standards, with the backing tracks. | Jam | — |

**Guitar Path** (nine steps, each unlocking the next):

| Id | Title | What it raises | Check |
|---|---|---|---|
| G-B1 | Open shapes, clean strings | span | 5 of 6 strings clean by pitch on 3 tries (E, A, C shapes) |
| G-B2 | Downstrokes on 1 2 3 4 | tempo | 90 % of strums on time at 72 BPM (D then A) |
| G-B3 | Change on the bar | coordination | ≥40 changes a minute, unaided (D→A, E→A, G→C) |
| G-I1 | Island strum with a mute | density, syncopation | 85 % on time at 84 BPM, mutes landing as rests (G then C) |
| G-I2 | Fretboard notes, strings 1 to 3 | memory | 12 of 15 found in 60 seconds (frets 0–5) |
| G-I3 | Minor pentatonic box 1 | span | a clean run at 90 BPM (root fret 5) |
| G-I4 | A lick in the box, in time | harmony, memory | all 14 notes, 80 % on time at 96 BPM (lick 30, Em→D) |
| G-A1 | Barre F and Bm | coordination | ≥30 changes a minute, unaided, over 2 sessions |
| G-A2 | The same lick in a new key | transfer | the G-I4 rule again in A minor (lick 31) |

**Piano Path** (nine steps):

| Id | Title | What it raises | Check |
|---|---|---|---|
| P-B1 | Five-finger pattern, one hand | span | every pitch right at 60 BPM, each hand |
| P-B2 | Hands together in contrary motion | coordination | 80 % of beats struck within 40 ms between hands |
| P-B3 | Reading treble then bass | memory | 9 of 10 flashcards right (C position, play answers) |
| P-I1 | Triads and inversions, one hand | harmony | root, 1st and 2nd inversion right on three tries |
| P-I2 | I IV V I with minimal movement | harmony, coordination | every voice moves ≤2 semitones between bars (C, then G) |
| P-I3 | One-octave scale, hands together | tempo | evenness ≥0.85 at 80 BPM, 3 attempts across 2 sessions |
| P-I4 | Blues lick over a C7 shell | syncopation, memory | all 12 notes, LH on beat 1 and the and-of-2 |
| P-A1 | The same lick over F7 and G7 | transfer | unaided in both keys |
| P-A2 | Sight-read a four-bar phrase | transfer | wait mode through to performance mode at 60 BPM |

**MPC Path** (eight steps):

| Id | Title | What it raises | Check |
|---|---|---|---|
| M-B1 | Two pads on the click | tempo | mean absolute error ≤60 ms (singles, eighths, 60 BPM) |
| M-B2 | Singles at sixteenths | density | ≤60 ms at 70 BPM (+ doubles at eighths) |
| M-B3 | Kick, snare and hat in one bar | coordination | no omissions, no extras (backbeat, 80 BPM) |
| M-I1 | Two-bar boom bap | length, voices | ≤1 omission and accents right on 6 of 8 snares (MIDI velocity only) |
| M-I2 | Paradiddle at sixteenths | density, coordination | ≤50 ms at 80 BPM (+ moving accent) |
| M-I3 | Ghost notes between the backbeats | dynamics | ghosts under 40 % of accent velocity, on a velocity-sensitive pad |
| M-A1 | Four-bar piece with a fill | length, memory | ≤2 omissions over four bars, fill in time |
| M-A2 | The same piece, faster and from memory | tempo, memory | unaided at 88 BPM, ≤2 omissions |

The **Comping** drill referenced by P-I4 and P-A1 has authored content (a "Blue third over a C7
shell" lick with a Charleston left hand, plus F7 and G7 transpositions) but **no route of its own
yet** — those steps open the closest two-hand drill instead.

### 5.9 Sessions, journal and history

A **practice session** records its start/end, primary instrument, source (free-practice, daily
routine, song, drill, jam), an optional routine id, structured **run records** (exercise id, prompt
ids, target skills, difficulty, instrument, and free-form params such as BPM and loop bars), every
scoring event, XP earned, a free-text note, an optional one-line **next time** reminder, and tags.

The **Journal** page shows: this-week / last-week / delta rollups (XP, sessions, attempts), a
**12-week practice heatmap** with a Less→More legend, a note-and-tags composer, four filters
(skill, instrument, start date, end date), the session list with per-session XP and attempt counts,
an expandable **attempt evidence** list (assistance label, input source, instrument, credit %,
target label), inline edit of note/next-time/tags, delete, today's routine, **focus areas** derived
from session tags, and **weekly goals** (a sessions-per-week target and XP vs last week).

### 5.10 Progress views

- **What next** — what to play in the next few minutes and why: the weak-spot picks (ranked by the decayed estimate, capped at 8), the routine with its time-budget selector, an instrument label, a start link, and a "Not measured yet" section for skills without enough independent evidence.
- **Skills** — one row per skill: mastery %, confidence %, observations, last practiced, unlocked, weak-spot and due-for-review flags, and a practice link. Grouped by capability with a per-capability summary (total, mastered, average mastery). An instrument switcher scopes it.
- **Sessions** — what you actually did and whether the same setup improved: the journal projection, practised days, XP, level, the challenge board and achievements.

Above all three views, a **streak card** (day count plus week dots) and a **this-week XP card** with
per-day bars stay pinned.

### 5.11 Device connection

- **Enable MIDI** / "Add device". If Web MIDI is unavailable the page says so and explains the fallbacks (microphone for guitar and ukulele, on-screen surfaces for everything else).
- A **setup checklist** of what is ready.
- **MIDI devices** — per device: an editable **alias**, an **instrument** assignment, and a Remove action (removed devices are ignored everywhere until a rescan).
- **Pad notes** for an MPC-assigned device: presets **Chromatic from 36 (C1)** (36–51), **Akai Classic MPC map** (37 36 42 82 40 38 46 44 48 47 45 43 49 55 51 53), **Chromatic from 37**, plus **Learn pads** — a guided 16-pad capture that becomes a "Learned from this device" map. Incoming notes are rewritten to the canonical Bank A note before they reach any drill; notes outside the map pass through.
- **Live activity** — a rolling list of the most recent MIDI messages, deliberately not a live region.
- **MPC hardware** — a user-triggered SysEx diagnostic that lights the physical pads, plus a **controller link** toggle that keeps the init handshake and a one-second heartbeat alive on that output (the MPC only sends pad notes while a host is talking to it). Pad output is never an automatic side effect of visiting a route.
- **Routing table** — one row per instrument with a **preferred source** (MIDI / microphone / on-screen) and a **preferred on-screen surface** (keyboard / guitar / ukulele / MPC).
- **On-screen fallback** — collapsed until asked for; "Try the on-screen surface".

Per-device profiles also hold a MIDI channel, an ignore flag, and a per-device latency offset.

### 5.12 Audio engine and sounds

One gain graph: master → output, with the metronome on its own gain into master.
**Playback sounds**: Sampled Piano (the default; a CC BY 3.0 sampled grand, credited in Settings),
Warm Synth, Synth, E-Piano, Square, Saw. Drone timbres: Sine, Cello, Shruti (the last stacks the
fifth and octave).

Rules the product keeps: browsers only allow sound after a tap, so audio is enabled once per visit
from an explicit control; every preview has its own Play/Pause or Stop near it; route-owned playback
stops on navigation; starting a pattern cancels the previous one so repeated taps never layer
copies; scored input is gated until after any audible count-in so the speakers cannot bleed into the
microphone; the microphone is only requested after an explicit user action and is stopped on
summary, abandon and teardown.

### 5.13 Notation

Three renderers over one canonical score: a **staff** view, a **tab** view for guitar and ukulele
(rests and out-of-range notes become spacers so timing stays aligned), and an **Aerophone fingering
row** for the monophonic top line. MusicXML-backed songs keep their original source and are engraved
from it; playback and score following always consume the canonical score. Staff and tab share one
selection model, so drag and two-tap range selection behave identically in both. Renderers scroll
inside their own container rather than widening the page.

### 5.14 Data storage, backup and restore

Everything is local. Ten tables: sessions, scoring events, skill mastery, skills, skill
relationships, chord library, songs, settings, imported backing tracks, audio takes. Audio and
sample blobs live in local file storage alongside them.

- **Export journal** — every practice session as JSON.
- **Data backup** — a versioned JSON of all ten tables (up to 50 MiB). Prepare shows per-table row counts, total rows, byte size, and how many media files are *excluded*. Restoring shows a before→after count per table, warns that all ten tables will be replaced, that media files are not included, that existing media records must be present and unchanged, that imported media will not play unless its files already exist, and to close other tabs first. Site data, PDF data and remembered drill URLs are untouched.
- **Full backup** — a ZIP with the same data plus every referenced audio and sample file (up to 250 MiB, max 10 000 files), each asset hashed. Restore verifies hashes, adds missing files, never overwrites a differing file, and cleans up its own new files if it fails.
- **Reset local data** — behind an inline "Delete everything?" confirm. Nothing else in the app may delete user data.

### 5.15 Settings

Five groups:
- **Audio** — enable/test the engine, playback sound, playback & drill level, metronome level, master volume, mute all (volumes preserved), plus the sampled-piano credit. Defaults: playback 0.80, metronome 0.70, master 1.00, count-in 1 bar, active instrument piano, sound Sampled Piano.
- **Input** — an audio input label and an echo-cancellation toggle. Per-instrument routing lives on Connect.
- **Latency calibration** — a read-only browser-reported output latency (never applied to scoring), then a calibration panel for the microphone, one for MIDI in general, and one per connected MIDI device, each with Run / Save / Reset and a plain-language explanation of what an offset means.
- **Appearance** — reduce motion, instrument colour coding.
- **Your data** — the export/backup/restore/reset controls above.

---

## 6. Accessibility and interaction conventions the app keeps

- **Touch targets** — interactive controls on stages and setup panels use a minimum 44 px (`min-h-11`) height; the practice capsule keeps all four controls visible and named at phone widths.
- **One live region per page** — each route owns a single polite status line; components beneath it are silent. Errors that must interrupt use an alert role. The MIDI activity monitor is deliberately *not* a live region because announcing every message would talk over the status.
- **Semantic headings** — each route owns its `h1`; shared chrome uses non-heading text for route labels. Only the deepest active nav entry is marked as the current page.
- **Focus management** — phase transitions move focus deliberately (the ready heading, the active-run heading, the results heading, a revealed answer). Cancelling a popover returns focus to its trigger.
- **Keyboard paths** — a Start keyboard shortcut on drill stages; ⌘K/Ctrl-K opens the command palette with arrow-key navigation and Enter to go; MPC pads have a documented QWERTY mapping; every on-screen key, fret and pad is a real button with a label (the piano keys are labelled by note, the fretboard grid by "String n fret f, note").
- **Reduced motion** — the OS `prefers-reduced-motion` setting neutralises every transition and animation app-wide.
- **Colour is never the only cue** — degree and tone colours are fixed musical identity, not verdicts; correctness always also carries a ring, a glyph or a sentence. Instrument hue is identity only and never conveys data or judgment; success/warn/info/destructive are reserved for data and judgment. Every text-on-surface pair is asserted at 4.5:1 contrast in both themes by an automated test, in both light and dark.
- **Honest "not measured"** — wherever a dimension cannot be observed (velocity on an on-screen pad, hands-together on a one-note-at-a-time keyboard, articulation without note-offs, fretted position from MIDI), the UI says **"Not measured"** and the displayed score excludes that dimension rather than showing a false zero.
- **Every empty state has exactly one action.**
- **No horizontal page overflow** — wide surfaces (piano roll, routing table, mastery grid, notation) scroll inside their own container.
- **Theme** — the app follows the site's light/dark toggle through tokens; body copy is the system sans, one display face is used for titles and result numbers, and a mono face for live readouts.

---

## 7. Things that exist but are weak or unfinished

Honest list, from visible behaviour:

1. **Four settings are stored but do nothing.** *Reduce motion*, *Instrument colour coding*, *Echo cancellation* and *Audio input label* are persisted and round-trip through backup, but no surface reads them. Reduced motion works only via the OS media query; the microphone capture paths hardcode `echoCancellation: false`.
2. **No Check mode on most technique drills.** Chord-Perfect, the rhythm patterns, the scale drill, two-hand, the fretboard positions drill and the MPC rudiment drill record every run as *guided*, which means they cannot advance skill mastery. The instrument paths work around this by explicitly accepting guided evidence on those steps; remove the workaround when Check mode lands.
3. **The Comping drill has no route.** Piano path steps P-I4 and P-A1 have authored content and a skill node but open the two-hand drill instead, and are flagged as reference steps.
4. **MPC pad-LED output is unverified on hardware.** The controller-mode SysEx was reverse-engineered from a trace; the browser→hardware path has never been confirmed on a physical unit, so it stays behind a manual diagnostic.
5. **MPC kit export is unverified on hardware.** The XPM Drum Program is generated from code and covered by fixture tests, but has not been loaded on a physical MPC One+.
6. **Guitar/ukulele chord shapes are unverified on the instrument.** The curated open voicings carry a standing hardware-verification caveat, as does real-strum chord identification accuracy.
7. **Real-strum grading is a wiring proof, not a graded feature.** The Chord Progression drill proves the microphone → chroma → onset → transcription → follower path renders cleanly; its accuracy on a physical guitar is untested, and it records one journal entry with no per-skill mastery.
8. **Several Aerophone fingerings are best-effort.** The low pinkies (Bb3/B3/C#4), Eb4, both long F#s, G#4, the bis Bb4 and the side C5 are flagged as needing verification against the manual; the reserved black keys are drawn but unused by any fingering.
9. **On-screen input cannot express several graded dimensions.** Velocity (MPC), hands-together simultaneity (scales, two-hand), articulation length (Aerophone), and fretted position (licks) all read "Not measured" without the right hardware — correct behaviour, but it means a keyboard-only user can never complete some path checks.
10. **Transcription quality is untuned.** The in-browser audio-to-MIDI extractor ships with fixed cleanup thresholds (confidence 0.25, 0.05 s minimum note, 0.08 s merge gap) that are documented as still needing manual browser validation.
11. **Chord identification cannot see inversions or slash chords.** It matches pitch-class *sets*, so C/E and C share one answer; the code says so explicitly and forbids adding them as separate qualities.
12. **The MIDI take list lives in memory, not storage.** Audio takes persist; MIDI takes are shared between the Practice Lab and Record but are not in the backup tables, so they are lost on reload.
13. **Song Studio deliberately awards no mastery.** Practising an imported song writes a journal entry and run records, but no skill mastery events — so repertoire practice never shows up on the skill map.
14. **The tempo ladder is per exact setup and never falls.** Changing any one of scale, tonic, motion, span or hands starts a fresh ladder at 100 BPM, and a rung once unlocked is permanent even if the skill decays. A failed ladder write is swallowed (the in-memory rung survives until reload).
15. **Guitar/ukulele "position" grading is pitch-only.** Chord-Perfect explicitly states that pitch matching measures note selection, not which physical string was used or whether the tone was clean.
16. **Weak-spot coaching is silent until there is data.** It needs 5 independent attempts on the current instrument before it names anything, and guided or self-rated practice never counts toward that threshold, so a user who mostly uses guided drills sees "Not measured yet" indefinitely.
17. **The repertoire ear queue has no persistent spaced repetition.** Phrases are re-ranked from mastery and decay each time; there is no per-phrase review schedule, so "due" is recomputed rather than remembered.
18. **Melody dictation and repertoire transfer are play-back only.** They cannot be practised by choice, by voice or in pocket mode, and are excluded from mixed review.
19. **Cadences are choice-only.** No play-back, no voice — the only ear drill with no production mode.
20. **The jazz backing tracks are user-supplied files.** The five track entries point at audio that is not shipped; without those files the repertoire step of the Jazz Path has no audio.

---

## 8. Added in the rebuild (2026-09 to 2026-10)

Sections 1 to 7 describe the previous app. Everything in this section was added by the clean-room rebuild on branch `music-rebuild` and is part of the target now: a fresh rebuild should reach it too. Module paths are where the rebuild put it (`packages/music-core` is `@repo/music-core`; the browser side is `src/lib/music`). Research behind each item is in `context/research/` and digested in `02-research-digest.md` section (h).

### 8.1 Cross-cutting

- **Practice and Check on every graded drill.** Practice shows targets and records `guided`; Check hides targets and records `independent`; Demo ("Hear it first") never records. Closes weakness 2.
- **The next run** (`progress/advance.ts`, `src/lib/music/advance.svelte.ts`). After every graded run, Results offers one button that sets up and starts the next run: "Speed up to 116 BPM", "Move on: Two notes a click at 69 BPM", "Slow down to 104 BPM" or "Step back: ...". Again repeats unchanged. Each drill declares a tempo plan (min, goal, max) and an ordered list of harder variations (notes a click, patterns, grooves, lessons, levels, key bands, fret regions, chord positions). Rule in `05-scoring-rules.md` section 16. It replaced the strum ladder, the pads "Up the ladder", the fret-region suggestion and the ear drills' separate unlock box. Sight reading's level climb, Song Studio's spot loop and the fine-pitch staircase keep their own rules.
- **The practice strip's instrument picks the stage** (`components/InstrumentStage.svelte`). Drills written for the keyboard draw the strip's instrument from the same marks: a keyboard, a guitar or ukulele fretboard window in one hand position, or the Aerophone's fingering for the note now (in Chord scales also the notes that fit, coloured by role). A line the instrument cannot reach moves up an octave (`fitShift`). Used by Scales, Chord scales, Jazz licks, the ear drills' played answers, Note reading and Sight-reading, and Phrases. Rhythm with MPC pads picked shows pads instead of a Tap button (any pad is a tap). A drill opened with an instrument its catalog entry lacks switches the strip to its first instrument, so every catalog entry must list every instrument it serves.
- **Instrument coverage.** Scales and Jazz licks: piano, guitar, ukulele, Aerophone. Note reading and Sight-reading: adds the Aerophone (one treble line in its written range, graded by exact pitch). Phrases: all five. Two hands, Pedal, Comping and ii-V-I voicings stay piano; fretboard and chord drills stay guitar and ukulele; Pads stays MPC.
- **Written line above the instrument** (`notation/LineNotation.svelte`). A staff on piano and Aerophone (both hands on a grand staff when notes carry hands, in the scale's key signature from `theory/circle.signatureFor`), tab on guitar and ukulele, with a cursor that follows the click or the demo and per-note states (done, active). Shown in Practice and after the run, hidden in Check. Used by Scales, Chord scales (each chord's scale in plain note values), Jazz licks, Two hands, Comping (written straight, swing is in the playing), ii-V-I voicings (chords as half notes), Pedal (a chord a bar), the Aerophone's scales, tonguing and crossings, the fretboard drills (tab), Shape Pick and Phrases. Phrases carry their written meter (6/8, 3/8).
- **Hand positions.** Tab and fretboards put a line in one five-fret hand position (`theory/fretboard.positionLine`): C4 to C5 on guitar lands on frets 5 to 8, never up one string.
- **Drills tab grouped by skill** (`hubs/drills-layout.ts`, `hubs/DrillsView.svelte`): Ear training (notes and melody; chords, scales and keys; review), Reading and rhythm, Technique, Grooves and time, Jazz and improvising, Theory, Studio ears, Phrases and songs. The instrument filter narrows. Pads and the Aerophone are split by mode into Pad technique, Pad grooves, Improvise on the pads, Aerophone fingers, and Aerophone breath and tongue. Ear rows show no answer-mode chips (one line under the section says how to answer). A test asserts every catalog entry and every Pads and Aerophone mode is placed.
- **XP scales with the work**: `round(5 + partialCredit × 35 + difficulty × partialCredit × 20 + improvement × 25)`; level `floor(xp / 250) + 1`.
- **Streak** forgiving by default: one freeze per week of practice (cap 2), shown as a week calendar.
- **Name and look**: the app is called Woodshed. Direction "the lit bench": the instrument drawn as material on a dark stage panel in both themes, one spotlight in the instrument hue, quiet chrome. Ten identity hues (piano brass, guitar coral, ukulele lime, MPC magenta, Aerophone teal, ear violet, reading sky, rhythm green, create periwinkle). Outfit for titles, system sans for reading, tabular numerals.

### 8.2 Ear training and listening

- **Interval comparison** (which of two intervals is bigger); intervals, qualities and cadences drawn on a grand staff; items introduced a few at a time in sets, weaker items asked more, a wrong answer played beside the right one.
- **Chords in a key** (I to vii° after I IV V I), **progression dictation** (chords after I into slots, judged per chord), both in minor and with sevenths; **scales and modes**; **inversions**; **bass lines**; **fine pitch** (cents staircase 50 to 5); **spot the wrong note** (including phrases from saved songs); **singing** intervals and melodies with a tolerance (35 or 25 cents).
- **Rhythm by ear**: echo and dictation in Rhythm, 6/8 and swing, and **groove dictation** on kick, snare and hat rows.
- **Studio ears** at `/music/listening`: find the boost or cut, boost or cut at matched loudness, level in dB, pan, compression, delay time, on pink noise, drums or a band loop.
- **Paths**: the Ear Path is 17 steps; a Studio Ears Path; ear steps linked from the instrument paths; steps can set their own threshold and minimum difficulty.

### 8.3 Theory

- **Circle of fifths**: an interactive wheel in Library reference (majors, relative minors, vii°, a picked key's chords as a wedge), the wheel as the key picker in several drills, and a timed fluency drill at `/music/circle` (order of sharps and flats, keys and counts, signatures on the staff, neighbours, a key's chords, a blank wheel); a Circle of Fifths Path.

### 8.4 Piano

- **Scales** grew arpeggios, broken and blocked chords through the inversions, notes a click 1, 2 or 4, and ABRSM 2025-26 grade speeds; blocked chords graded on togetherness.
- **ii-V-I voicings** gained cadences I IV I V7 I and minor in every key, and 1, 3 or 12 keys.
- **Sight-reading level climb** (80% up a rung, three strikes end it).
- **Song Studio "fix the trouble spot"**: loop the first slip slower until three clean, then full tempo, then wider.
- **Pedal** at `/music/pedal`: legato pedalling on CC 64 over progressions.
- **Comping** got its own route (weakness 3).

### 8.5 Guitar and ukulele

- **Every chord in every position** (`theory/voicings.ts`): generated voicings for any root and 19 qualities on any tuning, fingered, marked open, barre or closed, and whether a barre is needed. A **chord finder** in Library reference with diagrams, Hear and Practise; Build and Strum and identify accept any generated chord.
- **Fretboard drawing**: open strings sit on a narrow bone nut; the sounding string glows yellow.
- **New content**: ukulele chords in the London College order (Dm C7 G7 A D Gm A7 E7), guitar barre and power chords (31 curated shapes); strums Old Faithful and the ukulele island and chuck; Rockschool and Trinity grade tempos.
- **New drills**: fingerpicking (grown after the review into 15 guitar and 13 ukulele patterns and song presets, section 8.13), hammer-ons and pull-offs with a legato check, bends to pitch and vibrato by microphone. Tab above the fretboard in Spider, Positions, Fingerpicking, legato, Pick and the guitar licks.
- **Microphone**: the input follows the louder channel of a stereo interface (a guitar on input 2); a re-picked note of the same pitch reads as a new note.

### 8.6 MPC pads

- **Repertoire** (`content/pads-repertoire.ts`): 42 grooves in six levels with timing tiers, stars and a tempo goal per groove (incl. Latin, Caribbean and Brazilian grooves with a cowbell on A12, and the breaks), plus nine **drum phrases** (son and rumba clave, stomp-stomp-clap, tresillo under a backbeat, paradiddle split, one-beat fill and landing, shave-and-a-haircut tag, linear three over four, snare build). The drill plays like Melodics: note highway, live Perfect/Good/Early/Late, streak, glowing pads, Plays and Wait modes, Hold the tempo.
- **Pad skills** (`drills/pads/PadSkills.svelte`): dynamics against the player's calibrated soft-to-loud range (ladder, crescendo, even), fills that land on the one, play it back by ear, ostinato under a reading line, rudiments spread across the kit, improvise over the band (described, not graded; replay as played or nudged half way to the grid).
- **One groove list**: Create's beat presets are the repertoire grouped by level; grooves whose hits fall between sixteenths (the Dilla push, trap rolls) stay drill-only.

### 8.7 Aerophone

- **Drawing** of the AE-20 from Roland's front view with Roland's key names, the four thumb octave keys as crescents, keys coloured by hand (left amber, right cyan, thumb violet) and lit when pressed, held-wrong keys red. Facts in `03-hardware-and-devices.md` section 9.
- **Fingering mode**: Roland's 12 lessons in order as flash cards; a slip names the key difference ("Lift G# (left pinky)").
- **Skills**: scales and arpeggios in 12 keys with NZMEB grade speeds and an octave-slip hint; tonguing patterns read from breath dips and gaps; register crossings counting glitch notes; trills; bite vibrato from pitch bend at so many pulses a click; a dynamic level (pp to f) on Long tone.

### 8.8 Phrases

- `/music/phrases` (`content/phrases.ts`, data copy in `context/data/phrases.json`): popular short phrases on the strip's instrument, heard then played back, graded on notes in order and timing, written above the instrument; the next run climbs to the phrase's tempo, then the next phrase. Piano 15, guitar 14, ukulele 13, Aerophone 20 (band-book first tunes, flute and saxophone repertoire, ragtime, sax vocabulary). Ten of them are chord phrases: piano I-vi-IV-V, the Canon chords and a left-hand blues shuffle; guitar boom-chuck, a boogie shuffle, the blues turnaround and the rock and roll double-stop intro; ukulele island strum, C Am F G and the Hawaiian vamp, graded by the chord grader (`05-scoring-rules.md`, "Phrases with chords"). A pickup starts with rests so its first strong note lands on beat 1 (Happy Birthday, Greensleeves, Amazing Grace, Oh Susanna). On MPC pads the page is the drum phrases, played on the pads.
- **Content rule**: public domain only (traditional, or composer dead more than 70 years) or a style's generic vocabulary. No copyrighted songs or recorded solos. The fingerpicking song presets (section 8.13) are the one exception in kind: they store only facts about a song (its chords in order, a picking pattern, a tempo), never its melody or tab.

### 8.9 Create, record, library

- Create is one page where the beat and melodies loop together; presets and longer beats; an instrument per melody; tracks with volume faders (not only mute); a library of beats and melodies; chord progressions in any key; sample kits at `/music/create/kits`.
- Record: MIDI and audio takes, compare, level meter with advice, non-destructive playback gain; MIDI takes persist (weakness 12).
- Transcribe in a worker with Cancel; a polyphonic engine (Basic Pitch) beside the melody one; tempo found from the notes; hands split at middle C; saved songs editable at `/music/songs/[id]/edit`.
- Song Studio: waterfall with beat lines, sections tinted on the score, songs fitted by octaves to guitar or ukulele, metronome at the song's tempo.

### 8.10 Drill setup, after the UI and correctness review (2026-10-13)

Every page and drill was captured at phone and laptop widths and reviewed in six areas (shell and hubs; ear, circle and studio ears; reading and rhythm; piano and jazz; guitar and ukulele; pads and Aerophone), each by a design reviewer and a correctness reviewer, with a research pass on drill setup. The reports lived in a session scratchpad and are gone; the commits from `338761b` to `173efd2` and `TASKS.md` are the record. The shared pieces it produced, all in `src/lib/music/components`:

- **Exercise tabs** (`DrillShell` `tabs`, `tab`, `ontab`): a drill's exercises or modes as one row of tabs under the title, the one place for "which exercise". Used by Reading (Flashcards, Sight-reading), Rhythm, Voicings, Chord scales (major, minor), Circle, Studio ears, Pads, the Aerophone and the guitar modes (`?mode=` in the URL).
- **A setup sentence that opens its controls** (`DrillShell` `summary` as `SetupClause[]`): the collapsed setup reads as one line ("C major, two octaves, up and down, hands together"), and each clause is a button that opens the setup panel scrolled to its control and focused (`focus` names the control's `setupKey`, rendered as `data-setup`). The panel's toggle reads Setup and Hide setup.
- **Buttons up to a dozen options** (`Choice`): options show as wrapping buttons, all visible and one tap away, up to 12 (or 8 when the caller asks for a list because labels are long); past that it becomes a list. A button can carry a second line (`detail`: a level's degrees, a chord's notes, an artist) and a tooltip (`hint`); list options can carry a `group` heading.
- **A searchable catalogue sheet** (`CatalogPicker`): long catalogues (grooves, phrases, licks, lessons) are picked from a side sheet with a search box, group filter chips, sections by group and the last four picks on top (`catalog-recent.<drill>`). The setup shows the current item with Change. Items carry a title, a one-line meta, a group, a badge (stars, a level) and search keywords.
- **Setup values merge defaults, then saved, then URL** (`setup.svelte.ts` `DrillSetup`): the drill's defaults, then the last setup used, then any keys in the URL on top, so a path link or a mode link sets only what it names and keeps the rest of what the player chose. A later link to the same page applies its keys too, and a change to a key the URL already carries is written back to the URL (`replaceState`), so a reload shows the last pick.
- **Dropdowns went** wherever a better control fits: buttons, the circle `KeyPicker` for every key or tonic, the catalogue sheet, or the stage itself (tap a pad to choose it, tap the neck to place Spider, Legato or a bend, tap the Aerophone chart for the target note). Tempo, instrument and tuning are taken from the practice strip, never repeated in a drill's setup.
- **Popovers and sheets portal into `.woodshed`**, the app's root element, so the app's theme tokens apply inside them (they rendered with the site's colours before).
- **Mode notes** sit under the Practice and Check switch ("Targets shown. Practice, not a test." and "Targets hidden. Counts toward mastery."), and Hear it first sits beside it, hidden in Check unless a demo is playing.

### 8.11 The practice strip and the shell

- **One row** from tablet width up (scrolling sideways only if it must), so pills that appear or vanish never change the strip's height under a click. On phones it wraps, with Count-in, Tuning, the beat dots, Input and Search behind More.
- **Metronome** means one thing, "runs click", on or off, and applies mid-run (the click reads the strip on every beat). Hearing the click without a run lives in the Tempo popover. Tempo and Count-in are dimmed as "Not used here" on untimed pages (ear, circle, listening, voicings, lab, create).
- **A Tuning pill** for guitar and ukulele writes the strip's tuning; fretted drills read it.
- **One Sound and input pill** (`InputPanel.svelte`): sound enabled, on or muted; MIDI on or off, each connected device ticked in or out (the device profile's `ignored` flag, the same one Connect edits) and set to the instrument it "plays as" (Auto from the device name, or any instrument); the microphone on or off with its input device and a level meter. A microphone turned on here is pinned: it stays on across drills, and a drill's own stop leaves it running until it is turned off in the pill.
- **Back links** go to the hub that owns the page (drills to Drills, songs to Library, the journal to Progress, anything else to Today). Drill rows carry the instrument filter as `?instrument=`, applied once and then removed from the URL so a reload cannot undo a later strip change.
- **Results** show one next line: the next-run offer when there is one, else "Next up". A change of zero reads "Same as last time".
- **The count-in** is a semi-transparent overlay on the stage (the beat number large, the bar's clicks as dots, "Play on the next 1"), so nothing shifts when it goes; it fades out in 150 ms. Taps pass through it.
- **A first note on the downbeat counts in every timed drill**: the shell is running from half a beat before the downbeat, the same window drills listen from (lesson in `06-lessons-learned.md` section 8).

### 8.12 What each area gained in the review

- **Ear**: "Answer by" lists only the scored answers (choice, play back, sing); listening and listen-along sit apart as "Or just listen". Degree levels are buttons with their degrees as a second line. Item chips sit behind "Pick your own", which opens by itself when the pick matches no preset. One labels setting for every ear drill. Mixed review takes any set of the nine drills. Hint became Show answer (still recorded as hinted). Interval direction gained a real Mixed (up, down or together at random from the first prompt); the old "Mixed" was the skill-driven Auto.
- **Circle and studio ears**: exercises as tabs. Pan centre is an answer; C is the wheel's visible anchor and is never asked.
- **Reading**: the instrument comes from the strip; the note range comes from the level and the clef (no Lowest and Highest selects); level and key are buttons, the keys limited to the level's. Climbing hides the controls it overrides. Flashcards draw no time signature.
- **Rhythm**: modes as tabs; read-and-tap patterns grouped, with only the strip instrument's strums; the microphone is off in writing modes and Space never taps while writing.
- **Piano and jazz**: Scales setup in two parts, What (play, scale, tonic on the circle) and How (span, direction, hands, one Preset menu holding hands together, one note a click and the ABRSM grades). Licks and phrases are picked from the catalogue sheet; licks chunk by bar. Voicings has its variants as tabs and grades strictly (held on MIDI, collected on screen). Chord scales grade against any fitting scale, not only the go-to one.
- **Guitar and ukulele**: any chord by root and quality (`ChordPicker`: five common qualities as buttons, more behind a toggle), positions as a row of tappable diagrams (`PositionPicker`), the tuning from the strip, Spider, Legato and Bends placed by tapping the neck before a run (the neck widens to fret 12 while placing). Changes stop after 1, 2, 4 or 8 round trips or one minute, with a change every beat, 2 beats, bar or no clock. The neck is one roving tab stop with arrow keys, Home and End.
- **Pads and Aerophone**: exercises as tabs; grooves in the catalogue sheet by level with stars; rudiments grouped (singles and doubles, rolls, accents, paradiddles); the two pads chosen by tapping them (first tap left hand, second right); Pad sounds moved into MidiStatus; all tempos from the strip (30 to 240). The Aerophone's target note is tapped on the fingering chart; trills show both fingerings side by side; each mode has its own blurb.

### 8.13 Guitar and ukulele after the review (2026-10-14 to 10-27)

- **Finger colours.** Every fretted drill colours a dot by the fretting finger (`--finger-1` to `--finger-4` in `woodshed.css`: index blue, middle green, ring yellow, pinky pink), read aloud as "index finger" and so on, with a key under the neck. Chord shapes on the neck take the same colours.
- **Spider**: strings are toggles, any set, always played bass first (strings 1, 3 and 6 play 6, 3, 1). The finger order is tapped in, four taps, so all 24 orders are reachable, with "Next finger order" kept. Notes a click 1, 2, 3, 4 or 6 (also for Positions and Hammer-ons); 3 and 6 are written in 12/8 with the click on each dotted quarter (`quartersPerClick` 1.5). The next run's goal tempo falls as notes a click rise (factors 1, 92/120, 80/120, 72/120, 56/120). Dots show the play order as numbers in the finger's colour, with the order as a key above the neck. Older links with a span still open on that span.
- **A chord cycle** for Chord changes and Fingerpicking: two to eight chords in order (`MAX_CYCLE`), each at a chosen shape and fret (`ChordCycleSetup`: a card per chord with its diagram, tap one to change root, quality and position, add or remove). `cycleRefs` drops a chord identical to the one before it (and a last chord equal to the first), and always keeps two. In Practice the chords are drawn as diagrams above the neck, the one to play now ringed (`ChordStrip`). Two chords go there and back in round trips; more go round. A link naming a pair (`shape` and `to`) still opens on that pair.
- **Fingerpicking** gained pinches (two or three strings together, "B+2" with fingers "p+m"), holds ("-": a step that sounds nothing but keeps its time), and six-step patterns in three (3/4 at two notes a click, 6/8 at three). Notes keep their time step (`FretTarget.slot`), so a muted string or a hold never shifts the rest. Patterns are grouped by kind as buttons: Travis picking, Arpeggios (guitar) or Thumb and fingers (ukulele), Pinches and holds, In three. A pinch's notes count in either order.
- **Start from a song** (`FINGERPICK_SONGS`): 9 guitar and 4 ukulele presets set the pattern, chords, notes a click and tempo in one tap, each with a note on what is simplified (capo, slash chords dropped, verse only) and the lesson page it came from. Changing a chord or the pattern leaves the song. Tempos for Landslide, Tears in Heaven, Hallelujah and Nothing Else Matters are unverified starting points.
- **Fingerpicking on the neck**: dots in the fretting finger's colour carry the picking letter (p i m a); the picking order sits above the neck as a row (bass, alt bass, string 3, bass + 2, hold) with the step now ringed; a key names both hands. Before a run the first chord is shown and the others follow in the run.
- **Barres** on chord shapes are drawn as one rounded bar in the finger's colour from the highest to the lowest string it covers (`Fretboard` `barres`, chord shapes only), under the dots and their feedback and over the strings. A barre with one label carries it once; picking letters stay on each string.

### 8.14 Other fixes from the owner's use (2026-10-14 to 10-27)

- **Note reading** deals cards from a shuffle bag (`content/reading.flashcardDeck`: every note in the range once before any repeats, never the same card twice in a row). A wrong answer stays on screen with the right note shown until Next (focused, so Enter moves on). The card is centred and printed on light paper in both themes (`Staff fill="center"` centres a one-line staff).
- **Scales** mark every note of the line on the instrument before a run (by hand when both play). A note heard within 65 cents of a target it was not rounded to is named as tuning ("That C is 55 cents sharp, so it reads as C#. Your guitar may need tuning."); Practice moves past it, and the results say to tune first.
- **Long lines**: a line longer than 32 notes keeps a 32-note line's size and is engraved on one row (`NotationFrame` `minWidth`) that scrolls sideways with the cursor (when the cursor passes 70% of the view it scrolls to put it at 25%; instant under reduced motion).
- **Piano scale fingering** (`content/piano-fingering.ts`, from pianoscales.org, the University of Miami chart and Wilder's melodic minor charts): major, natural, harmonic and melodic minor in all 12 keys, both hands. Two or more octaves repeat the 7-note pattern; only the outer notes change (right hand: inner tonics take the first finger, the top note the last; left hand: the bottom note takes the first finger, each tonic above it the last). A test checks every key is playable (no thumb on a black key, no finger twice in a row). The scales drill prints the fingers on the staff (above the treble, below the bass, the staff given room for them) and on the keys; a key both hands play shows both, left then right. Pentascales are 1 to 5; other scales have no standard fingering and say so.
- **Follow-ups**: the small chord diagrams and the hammer-on dots take the finger colours (a barre in its own finger's colour); scales offer 1, 2, 3, 4 or 6 notes a click (the ABRSM ladder stays on 1, 2 and 4); the tuning hint also runs in the line drills and the note finder (which asks again instead of marking it wrong); every staff and tab is printed on light paper in both themes (`NotationFrame` sets the paper tokens on its viewport only).

### 8.15 The practice engine, phase 1 of the curriculum plan (2026-10-27)

The plan is in `context/research/curriculum-2026-10/` (round-one reports, then the full paths in `paths/`); phase 1 is the engine the new paths need.

- **Path steps** (`progress/paths.ts`) pass on the mean of their latest attempts (`recentWindow`: the step's `minAttempts`, at least three), so early misses stop counting once you improve. A pass needs evidence on `minDays` days (default 2), so it is confirmed cold. `minBpm` makes a step count only runs at that tempo or faster, read from each run's `bpm` param (`pathProgress(path, events, graph, runs)`). A step that a done step needs, directly or further back, is **review** (tested out: it counts toward the path and never blocks). An open step whose latest attempts already pass, at most one attempt short or only missing a day or session, is **almost there**, and the Paths tab says what is missing. `PATH_FOR_INSTRUMENT` maps the strip's instrument to its path for the Paths tab and Today.
- **Review timing** (`progress/mastery.ts`): each skill's forgetting rate adapts. A pass (0.66 or better) after a day or more away multiplies it by 0.6, a miss under 0.5 by 1.5, within 0.0003 to 0.08 a day; within a day it does not move. At 90% mastery the review gap runs from about 2 days to a year, widening each time the skill holds.
- **Today** (`progress/routine.ts`) is a shaped set. Budgets 10, 20, 30, 45, 60 and 90 minutes (a stored budget snaps to the nearest) split into roles: review (the most overdue due skill, opened in the drill mode that practises it, else a warm-up), path (the instrument path's next step with its setup, else the weak spot), ear or reading on alternate days, a tune from Phrases, a variety drill, and a jam at 90. Minutes: 10 is review 4 and path 6; 20 adds ear 5; 30 adds song 8; 45, 60 and 90 add variety and at 90 create. A role with no fresh drill gives its minutes to the path block; a route's mode counts as its own drill. Every block carries the routine params, and a path block also completes by its skills.
- **Ear in a key** (`content/ear.ts`, `drills/ear`): scale degree, chord function, progression and bass line runs keep one key for the run. I-IV-V-I (i-iv-V-i in minor) plays before the first question of a block and on **Hear the key**; after an answer in Practice or self-assessed listening, the degree steps to the nearest tonic (5 and up resolve up) or the chord goes to I. Not in Check, where it would give answers away, and not when muted.
- **Login gate**: with `MUSIC_LOGIN=required` the music pages redirect to the login page (a server layout load on `/music`, so client navigation is checked too), `/api/music/*` answers 401 without a session, sign-in returns to the page asked for, and registration is closed. Off by default for local dev and the e2e preview. Copyrighted licks and song files belong behind `/api/music`, never in the client bundle.

### 8.16 Levelled paths, phase 2 of the curriculum plan (2026-10-27)

- **The paths** come from `context/research/curriculum-2026-10/paths/*.md` as `packages/music-core/src/data/paths/*.json` (format and judging rules in its README; `progress/levels.ts` reads them; `levels.test.ts` validates every link, mode, skill and shelf). Guitar, ukulele, piano, jazz, Aerophone, finger drumming, ear and harmony, and reading (five tracks, P, G, U, A and R); theory and Studio ears keep their own steps. The Paths tab shows one level at a time, chips named by level id: its goal, its steps (with the strand), its song shelf and its test. A level passes when its judged steps pass and `pick` shelf songs are played.
- **Judging.** A drill step passes on its latest checked (Check mode) runs: the mean score of at least three (`minAttempts`), at `minBpm` or faster, with `match` run params, on two days; `each` asks for one pass per value (shapes A, D and E). Steps naming skills (ear prompts) are judged per prompt. `covers` lets a placement check mark later steps review without locking anything (piano's check-in). Steps waiting for a drill the app lacks show as Coming with what they wait for (`needs`).
- **Songs.** A shelf song counts after Song Studio Performance runs at 80% or better, at 90% of the record's tempo or faster, on two days; Performance runs count as checked now, still with no skills. Import from a shelf tags the saved song with its shelf key (`Song.shelf`), and Song Studio writes it into the run (`shelf`). `/music/songs/shelf/<path>/<song>` opens the song (adding its downloaded score first), and `?bars=3-4` opens a riff's bars in Performance; a path step linking there is judged on those runs.
- **Scores.** `scripts/fetch-scores.mjs --path guitar --levels 1,2` drives the Orca browser, signed in to MuseScore, through each shelf song's score page (Download, MusicXML) into `.music-scores/<path>/<song>.mxl`, git ignored. Official scores are skipped: MuseScore lets them be viewed but never downloaded. A run fetches at most 20, MuseScore's daily download limit per account. `/api/music/scores` lists and serves the files (behind the music login when it is on); the shelf's Add to my songs reads one into the library.
- **Strum a song**: nine songs' whole-bar chord loops (`SONG_PROGRESSIONS` in `content/jam.ts`) in Strum a progression and Jam, each with a note on its capo or simplified chord.
- **Written pitch** (`theory/transposition.ts`, `writtenOffset`): Song Studio draws guitar and ukulele parts at written pitch (guitar an octave up, by the tuning's `notationTransposition`); the Aerophone's reading key (`Settings.aerophoneKey`: C, alto Eb +9, tenor Bb +14; a Reads in pill on the strip and a row in Settings) puts its staffs, fingerings and lessons at written pitch while input, grading and playback stay at the concert pitch it sends. MusicXML parts with a transpose element are read at concert pitch, key included.
- **Drum parts**: MusicXML percussion (`midi-unpitched`) and MIDI channel 10 import as voices with `drums: true` and General MIDI drum numbers, and export back to channel 10. Song Studio draws a drum part as a grid (one row per drum, with its pad), plays it on the app's kit, and grades pad hits by drum (kick and snare exact, any hat for a hat, toms folded). A drums-only song opens on the grid; a mixed song switches with Play the drums. The finger drumming path's first whole song (1.10) is judged there.
- **Community scores**: 112 shelf songs whose only MuseScore link was an Official score got a community score listed first; the 97 left are licensed songs with no community arrangement.
