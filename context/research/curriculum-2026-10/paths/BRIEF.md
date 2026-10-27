# Brief: full mastery paths (round 2)

The owner read the first plan (context/research/curriculum-2026-10/*.md, and the doc "Woodshed curriculum research and plan") and said: the paths are still too short to build real mastery. They want: if they go through a path, they can play that instrument PRETTY WELL. More songs in every path, more gradual steps, MORE SONG CHOICES AT EVERY LEVEL, and for guitar and ukulele much more fingerpicking. They have a MuseScore account and will download scores from musescore.com, so MuseScore is the preferred source; only if a song is not on MuseScore, give another source (Songsterr, Ultimate Guitar, IMSLP, a lesson page, a book).

## The owner
- Beginner on guitar, ukulele, Aerophone AE-20 (taught with a saxophone curriculum) and MPC finger drumming; intermediate on piano (reads treble and bass).
- Goals: play songs they like, improvise, read music, play by ear and write. Practice time varies (10 to 90 minutes a day).
- Targets ("pretty well"): guitar about JustinGuitar Grade 6 / RGT Grade 5; ukulele intermediate (fingerstyle solo arrangements, chord melody); piano from intermediate to about ABRSM Grade 7 plus solid jazz and pop playing; Aerophone intermediate sax (about grade 5, jazz heads, blues improvisation); pads about Melodics Stage 10; ear and reading matching those levels.

## What to produce
Write ONE file: context/research/curriculum-2026-10/paths/<your-path>.md in the repo /Users/gaspard/orca/workspaces/PersonalWebsite/rebuild. That is the ONLY file you may create or edit. Do not edit any other file, do not commit, do not run builds or tests.

Structure:
1. Target and scope: what "done" means for this path, with an external benchmark (grade, method level), and an honest estimate of how long at about 30 minutes a day.
2. The path as LEVELS (typically 8 to 12), each level with:
   - A one-line goal and the skills it adds.
   - 6 to 15 gradual STEPS. Each step: title; the app drill and setup it uses (see the app notes below), or NEW if the app lacks it (one line on what the new drill needs); "done means" with a concrete, measurable criterion (tempo, accuracy, number of clean runs, on two days); and which song(s) it feeds.
   - A SONG SHELF for the level: 4 to 10 song choices at that level (the owner picks any 2 or 3 to pass the level), mixed genres and eras, each with: song and artist; what it teaches; key, tempo, chords or technique; difficulty within the level; the MuseScore URL of a specific score that fits the instrument and level (open the page to confirm it exists and is the right arrangement: instrument, level, not a full band score unless that is what is wanted); and a fallback source if MuseScore has none or only poor ones.
   - A level test (the "boss": e.g. play two shelf songs at tempo plus one technical check).
3. Cross-links to other paths (ear, reading, theory) at the right moments.
4. New drills or app changes this path needs, ranked, with size S/M/L.
5. Open questions for the owner.

Aim for a path a dedicated learner could follow for 12 to 24 months. Thoroughness matters more than length limits here, but keep each line tight (tables are good).

## Finding scores on MuseScore (use the Orca browser, a real Chromium)
- Create your OWN tab and only use it: `orca tab create --url "https://musescore.com/sheetmusic?text=<song>%20<instrument>" --json` returns browserPageId; pass `--page <id>` on EVERY later command. Never touch other tabs. Close yours when done (`orca tab list --json`, then `orca tab close --index <n> --json`).
- `orca goto --url <url> --page <id> --json`; read results with `orca eval --expression '(() => [...document.querySelectorAll("a[href*=\"/scores/\"]")].slice(0,15).map(a => a.textContent.trim().slice(0,80) + " | " + a.href).join("\n"))()' --page <id> --json` (always wrap eval code in an IIFE); `orca snapshot --page <id> --json` for refs.
- Prefer scores whose title or tags name the instrument ("easy guitar", "fingerstyle", "ukulele", "alto sax", "piano easy", "drum"), with many views or favourites, and arrangements matching the level. Record the score URL (https://musescore.com/user/<id>/scores/<id>) and note "official" scores (paid) versus community ones.
- If MuseScore blocks or shows a captcha, slow down; if it keeps blocking, record the search URL and use the fallback sources, and say so.
- Be polite: a few seconds between page loads.

## The app (Woodshed), for mapping steps to drills
Read context/research/curriculum-2026-10/<your area>.md (the round-1 report) and context/research/<area>.md first; they describe the drills. Key drills: chords?mode=build|pick|strum|changes|fingerpick (fingerpicking has 15 guitar and 13 ukulele patterns incl. pinches, holds, 3/4 and 6/8, song presets, chord cycles of 2 to 8 chords with chosen positions), strum (strum a progression), fretboard?mode=spider|positions|find|interval|legato|bends, scales (piano/guitar/uke/Aerophone, fingering on piano), two-hand, voicings, licks, comping, chord-scales, reading (flashcards, sight-reading), rhythm, ear (15 drills), circle, pads?mode=..., aerophone?mode=..., phrases (short melodies/riffs, graded on notes and timing), jam (backing progressions), Song Studio (import MusicXML/MIDI from MuseScore, wait/performance modes, fix-the-spot loops). Code: packages/music-core/src/content/*.ts, progress/paths.ts. The app may be browsed at http://localhost:5173/music in your own tab, but do NOT change the instrument in the top bar or other settings (they are shared across tabs).

## Writing rules
Plain sentence case. No em dashes or en dashes as punctuation (use a period, comma, or colon). Never "it's not just X, it's Y". No forced three-item lists. Never the words delve, underscore, tapestry, crucial, pivotal, load bearing, load-bearing.

Reply to the coordinator with under 250 words: the path's shape (levels, step and song counts), how many MuseScore links you confirmed versus fallbacks, and the owner's open questions.
