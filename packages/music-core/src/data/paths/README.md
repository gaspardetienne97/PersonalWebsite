# Levelled paths: how the JSON is written

Each file here is one path from `context/research/curriculum-2026-10/paths/<path>.md`, turned into data the app reads (`progress/levels.ts` `RawLevelPath`). The markdown is the source; keep its levels, steps, shelves and tests, its wording where it fits, and its order. `levels.test.ts` validates every file: run `vp test --run packages/music-core/src/progress/levels.test.ts`.

| File | Path id | Source |
|---|---|---|
| guitar.json | guitar | paths/guitar.md |
| ukulele.json | ukulele | paths/ukulele.md |
| piano.json | piano | paths/piano.md |
| jazz.json | jazz | paths/jazz.md |
| aerophone.json | aerophone | paths/aerophone.md |
| pads.json | mpc | paths/pads.md |
| ear-theory.json | ear | paths/ear-theory.md |
| reading.json | reading | paths/reading.md |


## Shape

```json
{
  "id": "guitar", "title": "Guitar Path", "subtitle": "One sentence.", "benchmark": "JustinGuitar Grade 6",
  "instruments": ["guitar"],
  "levels": [{
    "id": "1", "title": "...", "goal": "...", "adds": "...", "pick": 2,
    "steps": [{ "id": "1.2", "title": "...", "strand": "S", "href": "/music/...", "setup": "...", "done": "...", "...criteria": 0 }],
    "shelf": [{ "id": "three-little-birds", "title": "...", "artist": "...", "strand": "S", "teaches": "...", "detail": "A, 74 BPM, A D E", "bpm": 74, "diff": 1,
                "scores": [{ "label": "Official, Easy Guitar with TAB", "url": "https://musescore.com/user/.../scores/...", "official": true }],
                "fallback": { "label": "Songsterr", "url": "https://..." } }],
    "test": "The level test, as one paragraph."
  }]
}
```

- Step `id` is the markdown's number ("1.2", or "P.3" for a placement level); unique in the file. The app prefixes the path id.
- `instruments`: the path's instruments (evidence from another instrument does not count). Leave it out for paths that span instruments (ear, reading, jazz when it allows any).
- Level `pick`: songs from the shelf to pass, usually 2 (the markdown says "pick any 2 or 3": use 2).
- Shelf song `id`: a slug of the title, unique within the path (not only the level). `bpm` is the record's tempo as a number when the markdown gives one. `scores` are the MuseScore links (official ones flagged), `fallback` the other source. A shelf song whose only source is an app phrase uses an `/music/...` fallback URL.

## Steps: how a step is judged

A step with an `href` to a drill is judged on that drill's **checked runs** (Check mode, never hinted): each run's score, its tempo (`bpm` param) and its setup (run params). The app derives the drill's exercise ids from the href (route and `mode`), so do not list them, except when the drill records something the href can't say.

Criteria (all optional):
- `threshold`: the mean score of the latest runs to pass, 0 to 1 ("90%" is 0.9). Default 0.66; most paths ask for 0.9 for "clean".
- `minAttempts`: checked runs needed, and the window the mean is taken over (at least 3). "3 clean runs" is 3; "20 answers at 90%" is one run of 20 questions, so 1; "5 times running" on a chord is 5.
- `minDays`: default 2 ("on two days"); 1 only when the markdown clearly allows one sitting.
- `minBpm`: the tempo the step names as its pass ("clean at 80": 80). A start tempo in the setup goes in the href's `bpm`, not here.
- `match`: run params a run must carry, e.g. `{ "phrase": "guitar.twinkle" }`, `{ "pattern": "boom-chick" }`, `{ "progression": "guitar-g-d-em-c" }`. A value ending in `*` matches any value that starts with the rest: a shelf link matches its own song, and `{ "shelf": "reading/*" }` widens it to any of the path's shelf songs (sight-reading several pieces). A Song Studio step on `/music/library?tab=songs` needs `exerciseIds: ["song.studio"]` to be judged.
- `each`: one pass per value of a run param, e.g. `{ "param": "shape", "values": ["guitar.a-major", "guitar.d-major"] }`. Use it when a step lists several shapes, pairs, keys or patterns that each must pass. Put the other setups in `links` so each is one tap away.
- `skillIds`: only when the step is about skills the drill records per prompt (ear drills: `pitch.interval.M3`), and then it is judged on scoring events instead of runs. Every id must exist in `data/skill-graph-seed.json`.
- `requires`: step ids this one builds on. The step is locked until they pass, and passing it marks them review.
- `covers`: step ids a pass here tests out, without locking anything first (the piano check-in: passing check 0.1 marks 1.1 and 1.2 review).
- `ladder`: judged on the tune ladder (`progress/ladder.ts`) instead of one drill's runs, with `href` `/music/tunes`: `{ "rungs": ["a", "c", "d", "e"], "tunes": 2 }` passes when two tunes have those rungs; `among` limits it to named shelf ids (`["ruby-my-dear", "peace"]`). Rungs: a, Song Studio Performance or No-stop on the tune's jazz shelf score, 90% at 90% of the shelf tempo on two days; b, Jam guide-tones on `tune-<id>`, two choruses, 90%, at 80% of the shelf tempo; c, Accompaniment lead sheet on a shelf score (its `shelf` param) with shells, 90%; d, Accompaniment comping on `tune-<id>`, rootless or root and rootless, 90%; e, Jam make-the-changes on `tune-<id>` with every chorus meeting its aims; f, a transposed rung a and rung c run, 85% each. All untransposed except f.

A step whose drill or setting does not exist yet (the markdown says NEW): leave out `href` and write `needs` in one line ("A Riffs set in Phrases"). It shows as Coming and never blocks. If an existing drill covers it in part, give that `href` and no `needs`, and say the gap in `setup`.

A step with an `href` to a page that is not a drill (the tuner, a library page) shows as Open and is not judged.

## Run params the drills record (what `match` and `each` can use)

Read the drill's `params:` in its file before using one; the setup's URL keys are not always the run's. As of 2026-10-27:

| Drill (route) | Run params |
|---|---|
| chords?mode=build, pick (ShapeDrill) | shape, position, bpm (pick only); guitar shells are `shell.guitar.<root>.<maj7, m7 or 7>`, positions 0 to 3: 1-3-7 and 1-7-3 with the root on 6, then on 5 |
| chords?mode=strum (StrumIdentify) | shape, position |
| chords?mode=changes (ChangesDrill) | from, to, chords (shape ids joined with `>`; shells as `shell.guitar.*`), timed, trips, bpm, beatsPerChord, hardest (true when the pair was one of the five slowest at the start; `?hardest` in a link opens the slowest) |
| chords?mode=fingerpick (LineDrill) | bpm, perBeat, pattern (also `blackbird-pinch`; ukulele `uke-tremolo-im` and `uke-tremolo-pami`, graded half on evenness), shapes |
| fretboard?mode=spider | bpm, perBeat, pattern, tuning, strings, startFret, crossing, burst (speed bursts, only when on) |
| fretboard?mode=positions | bpm, perBeat, pattern (box, CAGED, `minor-pentatonic-connected`, a `triads-...` id, `bb-box`; ukulele `ukulele-minor-pentatonic-1` to `-5`, root on string 1), rootFret; tuning on ukulele |
| fretboard?mode=harmonics | bpm, tuning (frets 12, 7 and 5 on every string) |
| fretboard?mode=legato | bpm, perBeat, pattern (`slide`, `slide-shift` for slides), string, startFret |
| fretboard?mode=note-finder, interval-recall | tuning, region, questions, interval |
| fretboard?mode=bends | exercise, string, fret, reps |
| strum | progression (also chart-1 to chart-3, a generated chart), bpm, strictness, choruses, pattern (a strum from Rhythm, only when one is picked), seed (a generated chart's draw); its runs are guided, so they do not count yet |
| rhythm | read-and-tap: mode, pattern, bpm; pulse: mode, beats, bpm; by ear: mode, level (groove dictation: rock, offbeats, sixteenths, trap), bpm |
| phrases | bpm, phrase (piano riffs in each key as `<id>-c`, `-f`, `-g`); your licks also user (true) and transpose (-5 to 6) |
| scales | bpm, kind (also chromatic), tonic, span, motion, hands, pattern (scale, thirds, octaves, arpeggio, broken, blocked), chord, perBeat, apart (octave, contrary, third, sixth; with both hands), inversion (an arpeggio from the root 0, 3rd 1, 5th 2, 7th 3) |
| two-hand | bpm, pattern, tonic, hand, dynamics |
| comping | bpm, pattern, lh, feel |
| accompany?mode=patterns | bpm, pattern, progression (also chart-1 to chart-3, a generated chart), hands, key (the key's pitch class, 0 to 11) |
| accompany?mode=comping | bpm, voicing (also octave-stabs), rhythm (also hard-bop; waltz and waltz-23 in 3/4), feel, progression (also a standard `tune-<id>`), key, meter (3 or 4), choruses (times through: 1, 2, 4), band (click, rhythm: drums and bass); reharm (the one device used, or mixed) and swaps (`2:tritone,7:backdoor`) when reharmonised in Jam |
| accompany?mode=lead-sheet | bpm, tune (lead-1 and lead-2 are generated jazz heads, swung; a generated melody is generated-<progression>), lh (roots, shells, rootless, chords), hands, key, progression (a generated chart only), shelf (a library score added from a shelf), transpose (when not 0) |
| voicings | variant (also gospel; the jazz types from `content/jazz-voicings.ts`, among them upper, quartal-tune and slash-tune on a tune), key, keys, arpeggio, progression (gospel: slash-walk, four-five-one, passing-dim), tune (a `tune-<id>`, on a tune's changes only) |
| licks | bpm, lick (number), transpose, first, last; byEar (true when the line was learned by ear, the transcription loop) |
| chord-scales | bpm, changes, key, beatsPerChord |
| pedal | key, progression, bars, bpm |
| reading (flashcards) | instrument, kind (note, chord, satb), key, answer, low, high, clefs (crossed for the crossed clefs), accidentals |
| reading (sight-reading) | instrument, level (primer to level-3, piano-4 to piano-9, line-4 to line-6, line-jazz), key, follower (wait, performance, tap: the rhythm only), bpm, measures, meter (simple is 4/4, compound 6/8, else 2/4, 3/4, 3/8, 9/8, 2/2, 5/4, 7/8, 5/8; changing is 4/4, 3/4 and 5/8 every 2 bars, piano-9 only), climb, low, high, mask, look, position (guitar open, 2, 5; ukulele open, up); kick (true with the kick lane under Tap the rhythm, `?kick=true`) |
| ear/* | answer (voice also in bass-lines and scales), level, labels, drill; tune (cents, voice answers only); scales also scales (the set); song-loops also loops (the set, its prompts record `ear.loops.<set>`); progressions also changes (`key` for key changes, its prompts record `ear.key-changes` and `ear.key-change.<where>`: up-half, up-step, up-min3, down-min3, down-maj3, up-4th, relative, parallel) |
| by-ear | find home: mode, recording, from, to (judged); learn: mode, recording, from, to, speed, notes, sections (self-rated, so link it with `exerciseIds: []`); sing along: mode (sing), part (head, roots), recording, from, to, speed, tune (judged) |
| call-response | mode, groove, bpm, bars |
| circle | mode, band, minor, clefs; Analyse a tune (`mode=analysis`) records mode and tune instead (a `tune-<id>`: autumn-leaves, fly-me-to-the-moon, blue-bossa, satin-doll, rhythm-changes, all-the-things-you-are, just-friends, stella-by-starlight, giant-steps), score half key centre and half function a chord |
| pads | grooves: bpm, groove, mode, and fade (2 when a Check run's guide faded after two plays; only the plays after count); rudiments: bpm, pattern (Stick Control's are `stick-rlrl` to `stick-llll`), sub, hits, padL, padR; pad skills: skill, bpm, setup; Improvise also bars, fillEvery (0, 4 or 8), graded on time and density in Check; Ostinato also line (`read` for four generated bars, `clave` for son clave on the rim) and interp (snare or kick, for `read`); Note repeat (skill `repeat`) also exercise, setup `repeat-build` or `repeat-rolls`; Song form (skill `song`) also form, setup `song-<form>`; a piece you write records form `own`, setup `song-own-<id>`, sections, minutes, and set (true when it has an intro first, grooves from three levels, a chop, a solo, an end last and lasts 3 to 5 minutes at the run's tempo) |
| pads?mode=chop | bpm, exercise (order, reorder, free), source (boom-bap-b, funky-drummer, keys, amen, file), edit (reorder: flip, stutter, backwards, hook, jungle), bars (an imported loop) |
| create?live=1 (link it with `exerciseIds: ["technique.mpc.live-loop"]`) | bpm, bars, swing, quantise (0, 0.5, 1), repeat (true when Note Repeat played a hit), passes, undos, minutes |
| ear/feel | mode, questions |
| aerophone | mode, target, drone, interval, direction; fingering also lesson; set-up check (mode=calibrate): mode, key, received, floor, ceiling; skills (scales, tonguing, register, trills, vibrato, swing, long-scale): skill, bpm, setup, and scale, key (scales, swing, long-scale), perBeat, octaves (1 or 2), pattern (straight, thirds, 1231, triads) for scales, level for long-scale, pair for register |
| jam | progression (a loop, a standard `tune-<id>` from content/tunes.ts, or one of your scores with chords and a melody as `song-<id>`; `?shelf=<path>/<song>` in a link opens a shelf song's score), key, bpm, transpose, backing, notes, choruses (graded choruses in Check); checked runs also game (scoring/improv `IMPROV_GAMES`: free, changes, chord-tones, guide-tones, thirds, three-notes, blues-scale, pentatonic-1, -2, -5, motif, approach, off-beat, space, space-1, call-response, bridge, displacement, side-slip; on your score's melody quote and melody-fills), trade (0, 2, 4); meter (3 or 4), and reharm (tritone, related-ii, backdoor, secondary, passing-dim, chromatic-ii-v, or mixed) with swaps when the chart was reharmonised |
| Song Studio | song, mode (wait, performance, no-stop, sight-read: a 30 second look, then one no-stop pass), bpm, takes, strictness, range, shelf, firstRun (true when no earlier run played this song: a sight-read counts only then); memory (look, bars) and hiddenBars when from memory; transpose (semitones, when not 0); tap (true when tapping the rhythm, graded on timing only); partner (true when the app played the parts left out); no-stop and sight-read also continuity (bars played, 0 to 1) and kept (true when every bar was played and no slip ran past a beat); grade (dynamics, vibrato or balance: the melody louder than the notes struck with it, by MIDI velocity) only when every take could be measured, and then half the score is that measure. A shelf link passes Song Studio's setup keys through (`?mode=sight-read&tap=true`), and `?tempo=70` opens at 70% of the score's tempo |

Ids for shapes, patterns, phrases, grooves, rhythm patterns and so on live in `packages/music-core/src/content/*.ts` and `src/data/*.json`; use real ones only. Routes are the catalog's (`content/catalog.ts`); the old `/music/play/*` and `/music/learn/*` routes are gone.

## Writing

Plain sentence case. No em dashes or en dashes as punctuation (a period, comma or colon instead). Never "it's not just X, it's Y". No forced three-item lists. Never the words delve, underscore, tapestry, crucial, pivotal, load bearing.
