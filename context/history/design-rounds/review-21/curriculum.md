# Curriculum: what exists, three progressions, and nine specified exercises

17 September 2026. Inventory from the working tree (`packages/music-core/src/exercises/`, `engines/library`, `engines/jazz`, `engines/ear-training`, `engines/learning-path`, `engines/skills`, `engines/projection/technique-ladder.ts`). All musical material below is original. Nothing is transcribed from a commercial recording or lesson library.

## 1. What exists today

| Area | Content | Instruments | Input | Grading and limits |
|---|---|---|---|---|
| Chords (library) | 22 chords, 19 scales, 1 tab voicing (Cmaj7) | all | reference only | none |
| Chord-Perfect / chord-change | 5 guitar and 4 ukulele shapes (`frets[]`, string 1 first); positions generator with finger, barre and stretch rules | guitar, ukulele | mic pitch, on-screen | ordered pick grading; change trainer clusters strums by a 350 ms gap, **no clock**; per-string cleanliness never rendered |
| Scales and technique | 17 scale kinds × 12 tonics × 3 motions × 3 spans, one note per beat | piano, guitar (no fretboard awareness) | MIDI, on-screen | pitch 0.85 + evenness 0.15; tempo ladder (100 → 180 in +10 steps, session-scoped, gates Scales only) |
| Spider | 24 finger permutations, spans, crossing | guitar | MIDI, on-screen | positional MIDI + evenness |
| Two-Hand | 5 generated patterns (pulse + line, etc.) | piano | MIDI, on-screen | hands graded separately, **no simultaneity metric** |
| Voicings / Chord-scales / Licks (jazz) | 8 families, 22 chord-scale entries, 4+3+7 voicing formulas, **29 licks, all in C**, 33 repertoire titles (names only), 5 backing tracks, 10-lesson Jazz path | piano (voicings), any (licks) | MIDI, on-screen | pitch-class set grading (lenient/held/arpeggio); licks graded on note order only, no timing; `inversionCorrect` never set |
| Rhythm | 9 authored 4/4 patterns with click schedule and rests | any (tap, pads, mic onsets) | MIDI, onset, on-screen | half-spacing window, score 1 − MAE/160; `accent` exists but is never graded |
| MPC rudiments | 4 rudiments (single, double, paradiddle, moving accent) on two pads, 8 or 16 hits, **eighths only, timing relative to the first hit, not the click** | MPC | MIDI, keys, pointer | pad .45 + timing .30 + velocity .15 + completion .10 |
| MPC groove | 3 computed **one-bar** grooves, kick/snare/hats only, copy-back within one bar | MPC | MIDI, keys | omissions/extras/timing per voice; accents explicitly not graded |
| Reading | flashcards + generated sight-reading (stepwise), guitar reading uses **open strings only** | piano, guitar, ukulele | MIDI, on-screen, answer buttons | follower windows scaled by tempo and duration |
| Ear | 12 intervals, 9 qualities, 4 cadences, 12 degrees in 6 sets, dictation, repertoire transfer; 6-step Ear path | any | answer buttons, MIDI, mic | choice/pitch |
| Progression | ~110 seeded skills, **8 prerequisite edges** (none for guitar, piano or MPC technique); learning-path done rule = mean partial credit ≥ 0.66 over unaided attempts with minimum attempts and sessions; daily routine = fixed 5-minute steps per instrument, weak skills first | | | |

Feasibility helpers that exist: `TuningProfile.openStrings` (MIDI, string 1 first), `projectFretboard` / `projectPlayableGroup` (span ≤ 5, one note per string), `chord-positions.ts` (fingers, barre, stretch 3, bass = root). Drum voices exist in three unlinked vocabularies (`BOOM_BAP_KIT`: kick 36, snare 38, hats 42, openhat 46, 808 35, perc 39; sample-kit filename tokens; `DrumArticulation` on `ScoreNote`).

What MIDI, microphone and on-screen input can and cannot establish, which every exercise below respects: **MIDI** gives pitch, onset, release and velocity, never fingering, string, stroke direction or hand (hand is inferred from register only). **Microphone** gives a dominant pitch or an onset with 43 ms granularity at 48 kHz, never chord voicing, string, or which finger; strums give onsets and a coarse chroma. **On-screen** gives exactly what was tapped, with a string and fret when the surface is a fretboard, and no velocity. Fingering and sticking are therefore *suggested and shown*, never *graded*, and the copy says so.

## 2. Gaps that matter for the three instruments

- **Guitar.** No strumming pattern with stroke direction or muted strokes; chord changes have no clock, so "changes per minute" is the only tempo measure; only five shapes (E, A, Dm, F, B7 missing); no pentatonic or CAGED positions; no guitar licks; no guitar path.
- **Piano.** No inversion drill (`inversionCorrect` unused); no arpeggios; no comping in time; hands-together reading is stepwise generated lines only; no simultaneity metric.
- **MPC.** Rudiments locked to eighths and first-hit timing; grooves one bar, three voices, no accents; no fills, no multi-bar pieces; velocity from pointer is "Not measured" (correct), from MIDI graded in two bands only.

## 3. Three progressions

Difficulty is sequenced on named dimensions, one step at a time: **density** (subdivision), **tempo**, **coordination** (hands, limbs, voices), **span** (register, frets, pads), **harmony** (vocabulary), **syncopation**, **length**, **memory** (targets shown → hidden). A step raises one, occasionally two. Faster is never the same as better: tempo rises only after two clean runs at the current tempo (the existing ladder rule, Duke, Simmons and Cash 2009 on error-targeted repetition; see research.md claims 3 and 5).

Each step has the same loop: **model** (hear it and see it, unscored) → **chunk** (slow, short segment, targets shown) → **guided** (whole exercise, targets shown, hints recorded as assisted) → **check** (targets hidden, unaided, counts as independent) → **spaced review** (the estimate decays; review is due when it drops ten points) → **transfer** (the same skill in a fresh musical context: a new key, a song range, a different groove). Demonstrations never run during check; hints are recorded.

### Guitar

| Step | Skill | Dimension raised | Exercise | Check |
|---|---|---|---|---|
| G-B1 | Open E, A, D, G, C shapes, clean strings | span | Chord-Perfect build (existing) + add E, A, Dm, F, B7 shapes | 5 of 6 strings clean by pitch on 3 tries |
| G-B2 | Downstrokes on 1 2 3 4 over one chord | tempo | **G1** below at 60 to 84 | 90 % on time at 72 |
| G-B3 | Change on the bar: D↔A, E↔A, G↔C | coordination | chord-change with a clock (ticket P3-04) | ≥ 40 changes/min unaided |
| G-I1 | Island strum D DU UDU with mute | density + syncopation | **G2** below | 85 % on time at 84, mutes as rests |
| G-I2 | Fretboard notes strings 1 to 3, frets 0 to 5 | memory | interval recall (existing R22) | 12 of 15 in 60 s |
| G-I3 | Minor pentatonic box 1, up and down | span | positions-driven Spider variant (ticket P3-05) | clean at 90 |
| G-I4 | A short lick in the box, in time | harmony + memory | **G3** below | 14 of 14 notes, 80 % on time at 96 |
| G-A1 | Barre F and Bm, changes with open shapes | coordination | chord-change | ≥ 30 changes/min |
| G-A2 | Lick transposed to a new key and played over a two-chord vamp | transfer | G3 in A minor at fret 5 over Am to D | same rule as G-I4 in the new key |

### Piano

| Step | Skill | Dimension raised | Exercise | Check |
|---|---|---|---|---|
| P-B1 | Five-finger pattern, each hand alone, C position | span | Scales (existing, one octave off) | pitch 100 % at 60 |
| P-B2 | Hands together in contrary motion | coordination | **P1** below | 80 % of beats within 40 ms between hands |
| P-B3 | Reading treble then bass in C position | memory | flashcards with hidden targets (existing R16) | 9 of 10 cards |
| P-I1 | Triads and inversions, one hand | harmony | voicings (existing) with `inversionCorrect` (ticket P3-06) | root, first, second on three tries |
| P-I2 | I IV V I with minimal movement, LH roots | harmony + coordination | **P2** below | every move ≤ 2 semitones per voice |
| P-I3 | One-octave scale hands together at 80 | tempo | Scales, both hands (ticket P3-07) | evenness ≥ 0.85 |
| P-I4 | A blues lick over a C7 shell with the Charleston rhythm | syncopation + memory | **P3** below | 12 of 12 notes, LH on 1 and the and-of-2 |
| P-A1 | Same lick over F7 and G7 (transposed) with rootless LH | transfer | P3 in two keys | unaided in both |
| P-A2 | Sight-read a four-bar two-hand phrase from the library | transfer | Song Studio range practice | wait mode → performance at 60 |

### MPC / finger drums

| Step | Skill | Dimension raised | Exercise | Check |
|---|---|---|---|---|
| M-B1 | Two-pad singles on the click, eighths | tempo | **M1** below at 60 to 80 | mean |error| ≤ 60 ms |
| M-B2 | Singles at sixteenths; doubles at eighths | density | M1 subdivision 4 (ticket P3-02) | ≤ 60 ms at 70 |
| M-B3 | Kick, snare, hat in one bar (existing groove), all three pads | coordination | groove copy-back (existing) | 0 omissions, 0 extras |
| M-I1 | Two-bar groove with open hat and an accented snare | length + harmony (voices) | **M2** below | ≤ 1 omission, accents right on 6 of 8 snares (MIDI only) |
| M-I2 | Paradiddle and moving accent at sixteenths | density + coordination | rudiments (existing) with click anchor | ≤ 50 ms at 80 |
| M-I3 | Ghost notes: quiet snare between backbeats | dynamics | M2 variant with ghosts (MIDI velocity) | ghosts under 40 % of accent velocity |
| M-A1 | Four-bar piece with a fill | length + memory | **M3** below | ≤ 2 omissions over 4 bars, fill in time |
| M-A2 | Same piece at +8 BPM and with the reference muted after bar 1 | tempo + memory | M3 in check mode | unaided, ≤ 2 omissions |

## 4. Prioritised expansion catalog

1. **Guitar strum patterns with stroke and mute** (4 to 6 patterns) through `rhythm-pattern.ts` + a display-only `stroke` field: fills the largest guitar gap with the existing timing engine. Owner priority 1.
2. **Chord-change with a clock** (`chord-change.ts` + `bpm`, `beatsPerChord`): turns changes into a timed skill and makes G-B3/G-A1 real. Add E, A, Dm, F, B7, Bm shapes.
3. **MPC rudiment subdivision and click anchor** (`mpc-single-stroke.ts`): unblocks the whole MPC beginner path and makes timing honest.
4. **Authored multi-bar grooves with voices and accents** (`mpc-groove.ts` targets as data with `bars`, widened `GrooveVoice`, accents graded when velocity is measured). Catalog of six grooves.
5. **Piano inversions and voice leading** (`voicing-drill.ts`: set `inversionCorrect`, 3-voice leading).
6. **Two-Hand simultaneity metric and new pattern kinds** (contrary motion, LH broken chord + RH melody).
7. **Pentatonic and CAGED positions** as a positions-driven Spider variant.
8. **Comping in time** as a generated `Score` graded by the follower in performance mode.
9. **Guitar licks in the pentatonic boxes** (six licks, two keys each) reusing the lick engine plus timing from the follower.
10. **Instrument learning paths** (guitar, piano, MPC) in `learning-path` with the prerequisite edges above; today only Ear and Jazz exist.

## 5. Nine specified exercises

Notation: pitches as name and MIDI; onsets in beats from the bar's first beat (beat 1 = 0.0); durations in beats; velocity bands where the input can measure them. Tolerances follow the existing rule `window = min(180 ms, beatMs/4)` for "on time", with "early/late" up to `beatMs/2`, then "missed". Hints are always recorded as assisted; check mode hides targets and hints.

### G1 · Guitar, beginner: "Four on the floor, D to A"

- **Objective.** Keep downstrokes on every beat while changing between open D and open A on the bar line.
- **Prerequisite.** G-B1 (D and A shapes clean).
- **Meter, key, tempo.** 4/4, D major context, 60 to 84 BPM; start at 66.
- **Material (4 bars).** Bar 1 and 2: D major (strings 4 to 1: D3 A3 D4 F#4 = 50 57 62 66; strings 6 and 5 not played). Bar 3 and 4: A major (strings 5 to 1: A2 E3 A3 C#4 E4 = 45 52 57 61 64; string 6 not played). Strum onsets at 0, 1, 2, 3 in every bar, all downstrokes, duration 1 beat each.
- **Prompt.** "Down on every beat. Change to A on bar 3 without stopping the arm."
- **Demonstration.** Click plus a strummed model (the synth plays the chord's pitches at each onset); the chord box for the *coming* bar lights one beat early.
- **Accepted answers.** Microphone: an onset within the window on each beat; chroma of the strum must match the chord's pitch classes on at least 3 of 4 beats per bar (lenient, the engine's existing `chord-follower` bands). On-screen: a strum tap per beat. MIDI: not applicable for acoustic guitar.
- **Grading.** Timing per onset; chord identity per bar; score = 0.6 timing + 0.4 identity. Success: ≥ 90 % on time and both chords identified in every bar. Repeat: below 75 %. Advance: two clean runs → +6 BPM, or move to G2.
- **Hint.** Shows the next chord's shape one bar early with finger numbers (assisted).
- **Fingering (shown, not graded).** D: 1 on string 3 fret 2, 2 on string 1 fret 2, 3 on string 2 fret 3. A: 1 2 3 on strings 4 3 2 at fret 2. Standard beginner fingerings; the app cannot see fingers.
- **Variation.** E ↔ A, G ↔ C; upstroke on beat 4 once stable.
- **Engine.** `rhythm-pattern.ts` pattern with `stroke: "down"` per event (new display field) and a per-bar chord from `CHORD_SHAPES` (add D and A open shapes if missing from the five). Chord identity via `chord-follower` chroma bands when a mic is present, otherwise timing only and the result says "chord not verified".
- **Checked.** 4 bars × 4 beats = 16 quarter onsets; all pitches on open-position frets 0 to 3; string sets exclude muted low strings.

### G2 · Guitar, intermediate: "Island strum with a mute, G to C"

- **Objective.** Play D DU UDU with a muted stroke, then keep it through a chord change.
- **Prerequisite.** G1 at 72; G-B3 for G ↔ C.
- **Meter, key, tempo.** 4/4, G major, 72 to 100 BPM; start at 80.
- **Material (4 bars).** Pattern per bar (onset, stroke, duration): 0.0 down 1.0 · 1.0 down 0.5 · 1.5 up 0.5 · 2.5 up 0.5 · 3.0 down 0.5 · 3.5 up 0.5. Beat 2.0 to 2.5 is a **muted stroke** (palm on strings): an onset with no pitch, drawn as a rest with an × head. Bars 1 to 2: G (strings 6 to 1: G2 B2 D3 G3 B3 G4 = 43 47 50 55 59 67). Bars 3 to 4: C (strings 5 to 1: C3 E3 G3 C4 E4 = 48 52 55 60 64).
- **Prompt.** "Down, down-up, mute, up-down-up. The mute is a stroke too: keep the arm moving."
- **Demonstration.** Model plays the pattern with a short noise burst for the mute; the lane shows D and U glyphs and an × on the mute.
- **Accepted answers.** Microphone onsets at the six pattern points per bar (the mute counts as an onset with low chroma confidence, accepted as a mute); chroma matches the chord on ≥ 3 pitched strokes per bar. On-screen: tap for each stroke including the mute.
- **Grading.** Timing per stroke (window as above at 80 BPM ≈ 180 ms, so 150 ms); mute present or not (onset with no stable pitch). Success: ≥ 85 % on time, mutes present in 3 of 4 bars. Repeat below 70 %. Advance: two clean runs → +8 BPM.
- **Hint.** Slows the demo to half tempo for one bar and shows stroke letters over the lane (assisted).
- **Variation.** Same pattern over Am ↔ Em; add an upstroke on beat 4.
- **Engine.** `rhythm-pattern.ts` with `stroke: "down" | "up" | "mute"`; a mute is an `onset` event accepted without a pitch (extension: `RhythmPatternEvent.mute?: true`, graded as timing only).
- **Checked.** Per bar 1 + 0.5 + 0.5 + (0.5 rest/mute) + 0.5 + 0.5 + 0.5 = 4.0 beats; six pitched onsets plus one mute.

### G3 · Guitar, intermediate to advanced: melodic lick "Box one, twelfth fret"

- **Objective.** Play a two-bar E minor pentatonic lick in time, then transpose it.
- **Prerequisite.** G-I3 (box 1 clean at 90).
- **Meter, key, tempo.** 4/4, E minor (over Em, or an Em to D vamp), straight eighths, 88 to 120 BPM; start at 96.
- **Material (2 bars).** String/fret in standard tuning E2 A2 D3 G3 B3 E4, box 1 at fret 12.

| Bar | Onset | Pitch | MIDI | String / fret | Finger | Duration |
|---|---|---|---|---|---|---|
| 1 | 0.0 | E4 | 64 | 4 / 14 | 3 | 0.5 |
| 1 | 0.5 | G4 | 67 | 3 / 12 | 1 | 0.5 |
| 1 | 1.0 | A4 | 69 | 3 / 14 | 3 | 0.5 |
| 1 | 1.5 | B4 | 71 | 2 / 12 | 1 | 0.5 |
| 1 | 2.0 | D5 | 74 | 2 / 15 | 4 | 1.0 |
| 1 | 3.0 | B4 | 71 | 2 / 12 | 1 | 0.5 |
| 1 | 3.5 | A4 | 69 | 3 / 14 | 3 | 0.5 |
| 2 | 0.0 | G4 | 67 | 3 / 12 | 1 | 0.5 |
| 2 | 0.5 | A4 | 69 | 3 / 14 | 3 | 0.5 |
| 2 | 1.0 | G4 | 67 | 3 / 12 | 1 | 0.5 |
| 2 | 1.5 | E4 | 64 | 4 / 14 | 3 | 0.5 |
| 2 | 2.0 | D4 | 62 | 4 / 12 | 1 | 0.5 |
| 2 | 2.5 | rest | | | | 0.5 |
| 2 | 3.0 | E4 | 64 | 4 / 14 | 3 | 1.0 |

- **Prompt.** "One box, three fingers. Land the D on beat 3 of bar 1 and let it ring."
- **Demonstration.** Audible model at 60 % tempo then full tempo; the fret window (frets 11 to 16) lights each dot as it sounds with the finger number.
- **Accepted answers.** Microphone pitch (monophonic, fine for single notes); on-screen fretboard taps with the exact string and fret; MIDI guitar if present. Pitch matching accepts any string producing the pitch on mic input and says "position not verified"; on-screen input verifies string and fret.
- **Grading.** Notes in order (existing lick grading) **plus** timing from the follower in performance mode. Success: 13 of 13 pitched notes and ≥ 80 % on time. Repeat: any two notes wrong, or half-speed chunk if bar 1 fails twice (existing chunk loop). Advance: two clean runs → +8 BPM; then G-A2 (transposed).
- **Hint.** Shows finger numbers on the dots for the next four notes (assisted); check mode shows only the empty window.
- **Variation.** Transpose to A minor at fret 5 (same fingers, strings and relative frets); swing the eighths at 100.
- **Engine.** `jazz` lick format `LickNote = [midi, beats]` extended with an optional `{ string, fret, finger }` position per note (display and on-screen verification), plus follower timing (ticket P3-08). Fret window from `fretWindowAround`.
- **Checked.** Bar 1: 0.5×4 + 1 + 0.5×2 = 4.0; bar 2: 0.5×5 + 0.5 rest + 1 = 4.0. Range E4 to D5 all inside frets 12 to 15 on strings 2 to 4; pentatonic spelling E G A B D; standard tuning.

### P1 · Piano, beginner: "Mirror hands" (contrary motion five-finger pattern)

- **Objective.** Move both hands together in contrary motion with matching finger numbers.
- **Prerequisite.** P-B1.
- **Meter, key, tempo.** 4/4, C major, 60 to 84 BPM; start at 66. Two bars.
- **Material.** Quarter notes, both hands on every beat.

| Onset (bar.beat) | RH pitch | MIDI | RH finger | LH pitch | MIDI | LH finger |
|---|---|---|---|---|---|---|
| 1.0 | C4 | 60 | 1 | C3 | 48 | 1 |
| 1.1 | D4 | 62 | 2 | B2 | 47 | 2 |
| 1.2 | E4 | 64 | 3 | A2 | 45 | 3 |
| 1.3 | F4 | 65 | 4 | G2 | 43 | 4 |
| 2.0 | G4 | 67 | 5 | F2 | 41 | 5 |
| 2.1 | F4 | 65 | 4 | G2 | 43 | 4 |
| 2.2 | E4 | 64 | 3 | A2 | 45 | 3 |
| 2.3 | D4 | 62 | 2 | B2 | 47 | 2 |

Each note one beat; a final C4 / C3 whole note in an optional bar 3 for the cadence.
- **Prompt.** "Both thumbs on C. Walk outward, then back. Same finger in both hands on every beat."
- **Demonstration.** Model plays both hands; keys light in the hand colours together, the lane shows the mirrored contour, and the finger number sits on each key.
- **Accepted answers.** MIDI (hand inferred by register: below 54 = left); on-screen keyboard with QWERTY (single hand at a time, so the on-screen run is graded per hand and says "together not measured").
- **Grading.** Per hand: pitch and timing (existing). New **together** metric: |onset RH − onset LH| ≤ 40 ms counts as together; success = ≥ 80 % of beats together, both hands ≥ 90 % pitch. Repeat below 60 % together. Advance: two clean runs → +6 BPM, then P-I1.
- **Hint.** Shows the next beat's two keys and fingers (assisted).
- **Variation.** G position (G3/G4 outward), parallel motion, dotted rhythm.
- **Engine.** `two-hand-independence.ts` new `TwoHandPatternKind: "contrary-five"` in `buildTargetEvents`, plus a `togetherWindowMs` metric (ticket P3-09). Fingering from an authored map (R02 rule: never inferred).
- **Checked.** 8 beats in 2 bars, 4 per bar; ranges F2 to G4; finger numbers match across hands by construction.

### P2 · Piano, intermediate: "Closest chords: I IV V I in C"

- **Objective.** Move between triads with the least motion, choosing the inversion that keeps voices close; LH plays roots.
- **Prerequisite.** P-I1 (inversions of C, F, G alone).
- **Meter, key, tempo.** 4/4, C major, 60 to 90 BPM, one chord per bar held for four beats; four bars.
- **Material.**

| Bar | Chord | RH (low to high) | MIDI | Inversion | LH root | MIDI | Max voice move |
|---|---|---|---|---|---|---|---|
| 1 | C | C4 E4 G4 | 60 64 67 | root | C3 | 48 | |
| 2 | F | C4 F4 A4 | 60 65 69 | second (F/C) | F2 | 41 | 2 semitones |
| 3 | G | B3 D4 G4 | 59 62 67 | first (G/B) | G2 | 43 | 3 semitones (F4→D4 is 3; alternative D4 F4 G4? not a G triad, so 3 is the minimum here) |
| 4 | C | C4 E4 G4 | 60 64 67 | root | C3 | 48 | 2 |

Onsets at beat 0 of each bar, duration 4 beats, RH three notes together, LH root together with them.
- **Prompt.** "Keep the top note near G. Move each voice the shortest way."
- **Demonstration.** Model plays the four chords; keys light with tone-role colours (chord tones) and the moving voices draw a short arrow from the previous key.
- **Accepted answers.** MIDI held chord (all three RH notes down within 60 ms, LH root within 60 ms); on-screen in latch mode (existing) with "together not measured". Octave-equivalent RH is **not** accepted in strict mode: the inversion is the point.
- **Grading.** `chord` metric strict with `inversionCorrect` (lowest RH pitch class equals the expected bass of the inversion) and a `voice-leading` metric (sum of voice moves ≤ 7 semitones across the four bars). Success: all four inversions correct and total movement minimal. Repeat: any inversion wrong. Advance: two clean runs → the same in G major, then P-I3.
- **Hint.** Shows the next chord's three keys with the moving voice highlighted (assisted).
- **Variation.** I vi IV V; minor key i iv V i; add the seventh on V.
- **Engine.** `voicing-drill.ts` with `expectedBassPc`, `strict: true`, `inversionCorrect` set from the lowest held MIDI (ticket P3-06), `voiceLeading` widened from two to three voices.
- **Checked.** Four whole-note chords; all RH pitches within C4 to A4 (span ≤ a sixth, one hand); voice moves: bar 1→2: E4→F4 (+1), G4→A4 (+2), C4 stays; 2→3: C4→B3 (−1), F4→D4 (−3), A4→G4 (−2); 3→4: B3→C4 (+1), D4→E4 (+2), G4 stays. Total 12 semitones. The alternative G voicing D4 G4 B4 would move 2, 3, 2 = 7 and lift the top to B4; both are accepted as "minimal" when the total is within 2 of the best.

### P3 · Piano, intermediate to advanced: lick "Blue third over a C7 shell"

- **Objective.** Play a two-bar blues phrase in the right hand while the left hand keeps a Charleston comp on a shell voicing.
- **Prerequisite.** P-I2; a comfortable swing at 80.
- **Meter, key, tempo.** 4/4, C7 (blues in C), swung eighths, 76 to 104 BPM; start at 84.
- **Material.**

Right hand:

| Bar | Onset | Pitch | MIDI | Finger | Duration |
|---|---|---|---|---|---|
| 1 | 0.0 | G4 | 67 | 2 | 0.5 |
| 1 | 0.5 | Bb4 | 70 | 3 | 0.5 |
| 1 | 1.0 | C5 | 72 | 4 | 1.0 |
| 1 | 2.0 | Bb4 | 70 | 3 | 0.5 |
| 1 | 2.5 | G4 | 67 | 2 | 0.5 |
| 1 | 3.0 | E4 | 64 | 1 | 1.0 |
| 2 | 0.0 | Eb4 | 63 | 1 | 0.5 |
| 2 | 0.5 | E4 | 64 | 2 | 0.5 |
| 2 | 1.0 | G4 | 67 | 3 | 1.0 |
| 2 | 2.0 | C4 | 60 | 1 | 2.0 |

Left hand (shell C3 + Bb3 = 48 + 58), Charleston in both bars: onset 0.0 duration 1.0; onset 1.5 duration 0.5 (the "and of 2"); rest until the next bar.
- **Prompt.** "Left hand: one, and-of-two, nothing else. Right hand: slide from the E-flat into the E and let the C sit."
- **Demonstration.** Model at 60 % then full tempo, swing applied; LH keys in the left colour, RH in the right colour, the Eb→E slide drawn as a short arrow.
- **Accepted answers.** MIDI both hands (hand by register: ≤ 59 left); on-screen QWERTY plays one hand, so the on-screen run grades the RH line and says the LH was not measured.
- **Grading.** RH: notes in order plus follower timing in performance mode (swing tolerance: the off-beat eighth is accepted from straight 0.5 to swung 0.67). LH: the two onsets per bar within the window, both shell notes present, nothing on beats 3 and 4 (an extra LH onset counts as an extra). Success: 10 of 10 RH notes, ≥ 80 % on time, LH 4 of 4 onsets with no extras. Repeat: RH order broken or LH extras. Advance: two clean runs → +6 BPM; then P-A1 (F7, G7 transposition).
- **Hint.** Shows the RH finger numbers for the next four notes and lights the LH shell (assisted).
- **Fingering (shown, not graded).** RH as tabled; LH 5 on C3 and 2 on Bb3 (shell). Suggested fingerings; the app cannot see fingers.
- **Variation.** Rootless LH (E3 Bb3 = 52 58); straight eighths at 96; transpose to F7 (RH C5 Eb5 F5 … , LH F2 Eb3).
- **Engine.** A generated `Score` with a right-hand voice (the lick) and a left-hand voice (the shell rhythm), graded by `score-follower` in performance mode with a swing tolerance option (ticket P3-10); no new grading engine.
- **Checked.** Bar 1: 0.5 + 0.5 + 1 + 0.5 + 0.5 + 1 = 4.0; bar 2: 0.5 + 0.5 + 1 + 2 = 4.0. LH per bar 1 + 0.5 + 2.5 rest = 4.0. Spelling: Bb as the seventh of C7, Eb as the blue third resolving to E natural. RH span C4 to C5, one hand.

### M1 · MPC, beginner: "Two pads on the click"

- **Objective.** Alternate hands on two pads in even eighths, anchored to the click, not to the first hit.
- **Prerequisite.** Pads mapped in Connect (learn flow); metronome audible.
- **Meter, tempo.** 4/4, 60 to 80 BPM; start at 66. Two bars.
- **Material.** Pads A01 (kick voice, canonical note 36, left hand) and A03 (snare voice, 38, right hand), alternating L R L R… on every eighth: onsets 0, 0.5, 1, 1.5, 2, 2.5, 3, 3.5 in each bar, 16 hits.
- **Prompt.** "Left on A01, right on A03. Eighths, with the click, not ahead of it."
- **Demonstration.** One bar of click, one bar of the model with pads lighting in turn and the lane showing L R letters.
- **Accepted answers.** MIDI note-on from the mapped pads (after the pad-map rewrite); computer keys Z and C; on-screen taps (velocity not measured).
- **Grading.** Timing per hit against the click grid (`errorMs = hit − expected`, positive late), pad correctness (which of the two pads), completion. Score = 0.5 timing + 0.4 pad + 0.1 completion. Success: mean |error| ≤ 60 ms and 15 of 16 pads right. Repeat: mean |error| > 90 ms. Advance: two clean runs → +6 BPM; at 80 move to sixteenths (M-B2).
- **Hint.** Count-in extended to two bars; the next pad pulses (assisted).
- **Sticking (shown, not graded).** L R alternation as labelled; the app cannot tell which hand struck a pad from MIDI, so hands are a suggestion.
- **Variation.** R L start; sixteenths (subdivision 4); doubles (L L R R).
- **Engine.** `mpc-single-stroke.ts` with `subdivision` and a `startTimestampMs` click anchor (ticket P3-02); patterns unchanged in shape.
- **Checked.** 8 eighths per bar × 2 bars = 16 hits; two pads; canonical notes after the device map.

### M2 · MPC, intermediate: "Two-bar boom bap with an open hat"

- **Objective.** Hold a two-bar groove across four voices with an accented backbeat and one open hat.
- **Prerequisite.** M-B3 (one-bar kick/snare/hat copy-back clean).
- **Meter, tempo.** 4/4, 80 to 95 BPM; start at 86. Reference two bars, one bar count-in, response two bars.
- **Material.** Voices: kick A01 (36), snare A03 (38), closed hat A07 (42), open hat A11 (46). Velocity bands where MIDI is measured: accent ≥ 90, normal 50 to 89.

| Bar | Beat | Voice | Accent |
|---|---|---|---|
| 1 | 0.0 | kick | normal |
| 1 | 0.0, 0.5, 1.0, 1.5, 2.0, 2.5, 3.0 | closed hat | normal |
| 1 | 1.0 | snare | accent |
| 1 | 2.5 | kick | normal |
| 1 | 3.0 | snare | accent |
| 1 | 3.5 | open hat | normal |
| 2 | 0.0 | kick | normal |
| 2 | 0.0, 0.5, 1.0, 1.5, 2.0, 2.5, 3.0, 3.5 | closed hat | normal |
| 2 | 1.0 | snare | accent |
| 2 | 2.0 | kick | normal |
| 2 | 2.75 | kick | normal (a sixteenth pickup) |
| 2 | 3.0 | snare | accent |

- **Prompt.** "Kick on one, snares on two and four, hats on every eighth. Bar one opens the hat on the last eighth; bar two has a kick pickup before four."
- **Demonstration.** Reference two bars with the count-in, pads lighting; the lane shows the four voice rows.
- **Accepted answers.** MIDI pads (velocity measured), keys and on-screen (velocity "Not measured", accents excluded from the score and said so).
- **Grading.** Per voice: matched, omitted, extra, timing (existing voice-aware scoring, extended to two bars); accents graded only with measured velocity (`accentAssessed: true`). Success: ≤ 1 omission, ≤ 1 extra, ≥ 80 % on time, and with MIDI 6 of 8 snares accented. Repeat: ≥ 3 omissions. Advance: two clean runs → +5 BPM; then M-I2/M-I3.
- **Hint.** Reference replays once more before the response; the response bar highlights the current voice row (assisted).
- **Variation.** Trap hats (sixteenths), half-time (snare on 3 only), shuffle (swing 0.6).
- **Engine.** `mpc-groove.ts` targets as authored data with `bars: 2`, `GrooveVoice` widened to `BOOM_BAP_KIT` ids, `responseEnd = start + bars × barMs`, accents graded in two bands (ticket P3-03).
- **Checked.** Bar 1: 12 hits (1 kick + 7 hats + 2 snares + 1 kick + 1 open hat, hats stop at 3.0 to make room for the open hat at 3.5; the earlier "15" was an arithmetic slip, corrected 2026-09-18 against the authored table); bar 2: 8 hats + 3 kicks + 2 snares = 13 hits. All onsets on eighth or sixteenth grid within 0 to 3.75.

### M3 · MPC, advanced: four-bar piece "Turnaround with a fill"

- **Objective.** Play a four-bar phrase from memory: three bars of groove and a fill that lands the downbeat of bar 5.
- **Prerequisite.** M2 clean at 90; M-I2.
- **Meter, tempo.** 4/4, 88 to 100 BPM; start at 90. Reference four bars, one bar count-in, response four bars.
- **Material.** Voices as M2 plus perc/clap A04 (39). Bars 1 to 3 = M2 bar 1, M2 bar 2, M2 bar 1. Bar 4 (fill):

| Beat | Voice | Accent |
|---|---|---|
| 0.0, 0.25, 0.5, 0.75 | snare | accent on 0.0, others normal |
| 1.0, 1.25, 1.5, 1.75 | snare | accent on 1.0, others normal |
| 2.0 | kick | normal |
| 2.0, 2.5 | clap (A04) | accent |
| 3.0 | kick | normal |
| 3.0 | snare | accent |
| 3.5 | open hat | accent |

Then a kick on beat 0.0 of bar 5 closes the phrase (graded as the last target).
- **Prompt.** "Three bars you know, then eight snares, two claps, and land the kick on one."
- **Demonstration.** Full four-bar model with pads lighting; the lane scrolls one bar at a time with the fill bar marked.
- **Accepted answers.** As M2.
- **Grading.** As M2 over four bars plus the bar-5 downbeat; the fill bar is scored separately so the result can say "groove clean, fill late". Success: ≤ 2 omissions over the phrase, fill ≥ 75 % on time, downbeat of bar 5 within the window. Repeat: fill < 50 %. Advance: two clean runs → +4 BPM; then M-A2 (reference muted after bar 1, check mode).
- **Hint.** The fill bar alone loops at 70 % tempo three times before the full run (assisted, the existing chunk loop).
- **Sticking (shown, not graded).** Fill snares R L R L; claps both hands; suggestion only.
- **Variation.** Fill on toms if the kit has them (A05/A06 voices); half-time bars 1 to 3.
- **Engine.** Same data format as M2 with `bars: 4`, a `sectionLabel` per bar ("groove", "fill"), and per-section scoring (ticket P3-03); shares the `DrumVoice → padMidi` map so a later `Score`-based play-along uses the same pads.
- **Checked.** Bar 4: 8 snares (16ths on beats 1 and 2) + 1 kick + 2 claps + 1 kick + 1 snare + 1 open hat = 14 hits, all on the sixteenth grid within 0 to 3.5; total phrase 12 + 13 + 12 + 14 + 1 = 52 targets (corrected 2026-09-18; the engine's authored catalog asserts these counts).

## 6. Verification performed on this content

- Bar totals summed by hand for every table above (recorded under each exercise).
- Pitch spelling checked against the stated key or chord (E minor pentatonic E G A B D; C7 with Bb and the Eb blue note; C major diatonic triads).
- Guitar string and fret feasibility checked against standard tuning E2 A2 D3 G3 B3 E4 (G3: strings 2 to 4, frets 12 to 15; G1/G2 open shapes).
- Piano spans within one hand (P2 RH ≤ a sixth; P3 RH C4 to C5).
- Drum voices restricted to the existing `BOOM_BAP_KIT` ids so the sequencer, groove engine and kit builder agree once the shared map exists.
- Not verified: any physical technique (fingering, sticking, stroke direction, string cleanliness). The exercises show these and say they are not graded.
