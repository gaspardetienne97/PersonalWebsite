# Research brief: make the owner the best musician, fastest

## The owner (from their answers)
- Instruments, in priority order: guitar and ukulele, piano, Roland Aerophone AE-20 (a digital wind instrument with sax fingering), MPC One+ pads (finger drumming).
- Intermediate on piano; beginner on guitar, ukulele, Aerophone and pads.
- Goals: all four. Play songs they like, improvise (jazz, blues, rock), read music, play by ear and write.
- Practice time varies day to day: plans must flex (10 to 90 minutes).
- Popular licks and riffs may be bundled (personal app; served only to the logged-in owner). Find concrete ones, with links to MusicXML, MIDI or tab sources where they exist.

## The app (Woodshed)
- Repo: /Users/gaspard/orca/workspaces/PersonalWebsite/rebuild (branch music-rebuild). READ-ONLY for you: do not edit files, do not commit.
- Running at http://localhost:5173/music (dev server). Drive it with the Orca CLI's embedded browser:
  - Open your OWN tab and only use it: `orca tab create --url http://localhost:5173/music/<route> --json` returns `browserPageId`; pass `--page <browserPageId>` on every later command (goto, snapshot, click, eval, screenshot). Never touch other tabs.
  - `orca goto --url <url> --page <id> --json`, `orca snapshot --page <id> --json` (refs @eN), `orca click --element @eN --page <id> --json`, `orca eval --expression '(() => ...)()' --page <id> --json` (wrap code in an IIFE).
  - Screenshots: `orca screenshot --page <id> --json` returns base64 PNG in result.data; save to your folder under the scratchpad and Read it if you need to see it.
  - Close your tab when done: `orca tab list --json`, then `orca tab close --index <n> --json` for yours.
- Key routes: /music (Today), /music?tab=drills, /music?tab=paths, and drills under /music/<drill> (scales, two-hand, voicings, licks, comping, chord-scales, reading, rhythm, ear, fretboard?mode=spider|positions|find|interval|legato|bends, chords?mode=build|pick|strum|changes|fingerpick, strum, pads?mode=..., aerophone?mode=..., phrases, circle, studio, create, library, songs).
- Code pointers: learning paths in packages/music-core/src/progress/paths.ts; drill catalog packages/music-core/src/content/catalog.ts; content generators in packages/music-core/src/content/*.ts (technique.ts, piano.ts, reading.ts, winds-pads.ts, phrases.ts, ...); scheduler, routine builder, mastery in packages/music-core/src/progress/*.ts.

## Read first (existing research and context; build on it, don't redo it)
- context/02-research-digest.md, context/01-feature-catalog.md, context/05-scoring-rules.md, context/06-lessons-learned.md, BRIEF.md, TASKS.md.
- context/research/*.md (aerophone, circle-of-fifths, drill-progression, ear-drills-sequencing, eq-frequency-training, finger-drumming, guitar-ukulele-drills, pads-aerophone-gaps, phrases, piano-drills).
- Also look under context/history and context/references if relevant.

## What to deliver
Write your report to /private/tmp/claude-501/-Users-gaspard-orca-workspaces-PersonalWebsite-rebuild/e4b95e62-1a0a-47e6-988b-3ce56cf3fc59/scratchpad/research2/<your-area>.md (max ~2500 words), with:
1. The best programs, methods and books for your area, and what specifically makes them work (sequence, drills, feedback, pacing). Prefer evidence (studies, completion data, expert consensus) over marketing. Cite URLs.
2. What the app has today in your area (paths, drills, content), seen in the app via Orca and in code, and how it compares.
3. Concrete, ranked recommendations: path changes (new steps, reorder, merges), drill improvements (more substance, better progression, better feedback), and NEW drills worth adding. For each: what, why (source), rough size (S/M/L), and how it fits the app's existing pieces.
4. Content lists where relevant: songs, licks, riffs, etudes, with source links (MusicXML/MIDI/tab where available) and difficulty.
5. Open questions for the owner.

## Writing rules
Plain sentence case. No em dashes or en dashes as punctuation (use a period, comma, or colon). Never "it's not just X, it's Y". No forced three-item lists. Never the words delve, underscore, tapestry, crucial, pivotal, load bearing, load-bearing.

Reply to the coordinator with a summary under 300 words: your top 5 recommendations and anything the owner must decide.
