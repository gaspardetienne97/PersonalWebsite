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
- `match`: run params a run must carry, e.g. `{ "phrase": "guitar.twinkle" }`, `{ "pattern": "boom-chick" }`, `{ "progression": "guitar-g-d-em-c" }`.
- `each`: one pass per value of a run param, e.g. `{ "param": "shape", "values": ["guitar.a-major", "guitar.d-major"] }`. Use it when a step lists several shapes, pairs, keys or patterns that each must pass. Put the other setups in `links` so each is one tap away.
- `skillIds`: only when the step is about skills the drill records per prompt (ear drills: `pitch.interval.M3`), and then it is judged on scoring events instead of runs. Every id must exist in `data/skill-graph-seed.json`.
- `requires`: step ids this one builds on. The step is locked until they pass, and passing it marks them review.
- `covers`: step ids a pass here tests out, without locking anything first (the piano check-in: passing check 0.1 marks 1.1 and 1.2 review).

A step whose drill or setting does not exist yet (the markdown says NEW): leave out `href` and write `needs` in one line ("A Riffs set in Phrases"). It shows as Coming and never blocks. If an existing drill covers it in part, give that `href` and no `needs`, and say the gap in `setup`.

A step with an `href` to a page that is not a drill (the tuner, a library page) shows as Open and is not judged.

## Run params the drills record (what `match` and `each` can use)

Read the drill's `params:` in its file before using one; the setup's URL keys are not always the run's. As of 2026-10-27:

| Drill (route) | Run params |
|---|---|
| chords?mode=build, pick (ShapeDrill) | shape, position, bpm (pick only) |
| chords?mode=strum (StrumIdentify) | shape, position |
| chords?mode=changes (ChangesDrill) | from, to, chords (shape ids joined with `>`), timed, trips, bpm, beatsPerChord |
| chords?mode=fingerpick (LineDrill) | bpm, perBeat, pattern, shapes |
| fretboard?mode=spider | bpm, perBeat, pattern, tuning, strings, startFret, crossing |
| fretboard?mode=positions | bpm, perBeat, pattern (box id), rootFret |
| fretboard?mode=legato | bpm, perBeat, pattern, string, startFret |
| fretboard?mode=note-finder, interval-recall | tuning, region, questions, interval |
| fretboard?mode=bends | exercise, string, fret, reps |
| strum | progression, bpm, strictness, choruses |
| rhythm | read-and-tap: mode, pattern, bpm; pulse: mode, beats, bpm; by ear: mode, level, bpm |
| phrases | bpm, phrase |
| scales | bpm, kind, tonic, span, motion, hands, pattern, chord, perBeat |
| two-hand | bpm, pattern, tonic, hand, dynamics |
| comping | bpm, pattern, lh, feel |
| accompany?mode=patterns | bpm, pattern, progression, hands, key (the key's pitch class, 0 to 11) |
| accompany?mode=comping | bpm, voicing, rhythm, feel, progression, key |
| accompany?mode=lead-sheet | bpm, tune, lh, hands, key |
| voicings | variant, key, keys, arpeggio |
| licks | bpm, lick (number), transpose, first, last |
| chord-scales | bpm, changes, key, beatsPerChord |
| pedal | key, progression, bars, bpm |
| reading (flashcards) | instrument, kind (note, chord, satb), key, answer, low, high, clefs (crossed for the crossed clefs), accidentals |
| reading (sight-reading) | instrument, level (primer to level-3, piano-4 to piano-8, line-4 to line-6), key, follower, bpm, measures, meter (simple is 4/4, compound 6/8, else 2/4, 3/4, 3/8, 9/8, 2/2, 5/4), climb, low, high, mask, look, position (guitar open, 2, 5; ukulele open, up) |
| ear/* | answer, level, labels, drill; song-loops also loops (the set, its prompts record `ear.loops.<set>`) |
| by-ear | find home: mode, recording, from, to (judged); learn: mode, recording, from, to, speed, notes, sections (self-rated, so link it with `exerciseIds: []`) |
| call-response | mode, groove, bpm, bars |
| circle | mode, band, minor, clefs |
| pads | grooves: bpm, groove, mode; rudiments: bpm, pattern, sub, hits, padL, padR; pad skills: skill, bpm, setup |
| aerophone | mode, target, drone, interval, direction; skills: skill, bpm, setup |
| jam | progression, key, bpm, transpose, backing, notes, choruses |
| Song Studio | song, mode, bpm, takes, strictness, range, shelf |

Ids for shapes, patterns, phrases, grooves, rhythm patterns and so on live in `packages/music-core/src/content/*.ts` and `src/data/*.json`; use real ones only. Routes are the catalog's (`content/catalog.ts`); the old `/music/play/*` and `/music/learn/*` routes are gone.

## Writing

Plain sentence case. No em dashes or en dashes as punctuation (a period, comma or colon instead). Never "it's not just X, it's Y". No forced three-item lists. Never the words delve, underscore, tapestry, crucial, pivotal, load bearing.
