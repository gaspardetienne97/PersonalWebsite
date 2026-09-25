# Prompt for an external UX and learning review of Practice OS

Paste everything below the line into the reviewing model. It assumes the model can drive a browser and read the repository on disk.

---

You are reviewing **Practice OS**, a personal music practice app, as a senior product designer who also knows music pedagogy and practice science. Your job is to find what stands between this app and a top-tier learning tool, then propose concrete changes: UX fixes, better drills, new drills, and features. You review; you do not change code. Write your findings to files (section 7).

## 1. Who this is for

One user, the owner of the repo. Instruments and priorities, in order:

1. **Guitar** (current focus). Chord changes, scales, fretboard knowledge, technique.
2. **Piano** (current focus). Reading, two-hand coordination, voicings, jazz harmony.
3. **MPC One+ drum machine** (current focus). Rhythm, finger drumming, pad rudiments, beat making.
4. **Roland Aerophone** (AE-10/AE-20 digital wind instrument). Secondary. The owner has found little reference material for it; anything you can find or design for Aerophone practice is welcome but not required.
5. Ukulele is supported but not a focus.

Goal: get better at all of these through short, frequent, well-structured practice, with the app telling the user what to do next and showing real progress. Single user, no accounts, everything stored in the browser. No leagues, hearts, gems or social ranking.

## 2. How to run it

Repository root: the directory containing `package.json` with `"dev": "vp dev"`. The app is a SvelteKit site; the music app lives under `/music`.

```bash
pnpm install
./node_modules/.bin/paraglide-js compile --project ./project.inlang --outdir ./src/lib/paraglide
npm run dev -- --port 5199
```

Then open `http://localhost:5199/music`. If the dev server is already running on another port, use that. Do not run the database; the music app needs none.

## 3. Hardware and input

The app takes input three ways: MIDI (Web MIDI), microphone (pitch detection) and on-screen surfaces (keyboard, fretboard, pad grid). Work out first what you can do in your environment and say so in the report:

- If you can expose a virtual MIDI device or drive the browser's Web MIDI, use it and test the MIDI path.
- If you can give Chromium a fake microphone (for example launching with `--use-fake-device-for-media-stream --use-file-for-fake-audio-capture=<wav>`), use it to test the tuner, intonation and voice answers.
- Otherwise use the on-screen surfaces for every drill and reason about the hardware paths from the UI copy, the code and the docs. Say clearly which paths you exercised and which you only read.

The owner can plug in a MIDI piano and the MPC if you find a way to use them; ask in your report if that would change a finding.

## 4. Where the context lives

Read these before the walkthrough. Paths are relative to the repo root.

- `AGENTS.md` and `CLAUDE.md`: monorepo layout, commands, rules.
- `src/routes/music/AGENTS.md`: the music app's architecture, every route's contract, design rules (tokens, one display face, stage as hardware, one live region per route, hub contracts, fret window and chord positions).
- `docs/music-redesign/`: the redesign record. Read in this order: `README.md`, `ux-research.md`, `audit.md`, `proposal.md`, `01-research.md`, `03-design-system.md`, `06-drill-ux-research-plan.md`, `07-drill-depth-expansion-plan.md`, `09-open-design-brief.md`, `10-visual-references.md`, `11-drill-patterns.md`, `12-round-4-proposal.md`, `13-hub-references.md`, `14-hub-patterns.md`, `15-round-5-proposal.md`, then `CHANGELOG.md` (one entry per commit, five rounds). `references/` holds about 160 real screenshots of reference apps (Yousician, Melodics, Sonofield, TonalEnergy, GuitarTuna, Justin Guitar, Soundslice, Duolingo, Modacity and others) that earlier rounds borrowed from.
- `docs/screenshots/ui-pass/before/` and `after/<slice>/`: how every screen looked before and after each round, at 1280 and 375 px in light and dark. `after/22-round-4/`, `after/23-spider-fretboard/` and `after/24-hubs/` are the current state.
- `docs/music-ear-training-curriculum-research.md`: the ear-training curriculum the drills follow.
- `IMPLEMENTATION_PLAN.md` and `music-practice-app-plan.md` (repo root, local files): the original product plan and backlog. Section 5A of the implementation plan is the active backlog.
- `docs/superpowers/plans/` and `specs/`: earlier feature specs, including the Aerophone work.
- Engines: `packages/music-core/src/` (domain, exercises, engines for skills, mastery, sessions, analytics, dashboard, challenges, coach, learning paths, ear training, technique sessions, chord positions). Read the engine when you want to know what a drill actually measures and how mastery moves.

Treat documented decisions as decisions, not as errors, unless you argue against one explicitly with evidence.

## 5. The app map

Hubs: `/music` (Practice home: drills, learning paths, daily routine, coach), `/music/library` (songs, chord and scale reference, import), `/music/create` (beat grid, piano roll, recorder), `/music/progress`, `/music/connect`, `/music/tuner`, `/music/settings`, `/music/guide`, `/music/track` (journal), `/music/jam`, `/music/play` (play tools index), `/music/songs/[id]` (song studio).

Drills: `/music/learn/reading`, `/music/learn/rhythm`, `/music/learn/aerophone`, `/music/learn/ear/{intervals,chord-qualities,cadences,scale-degrees,melody-dictation,repertoire-transfer,mixed}`, `/music/play/{chord-perfect,chord-progression,chord-scales,licks,scales,spider,two-hand,voicings,mpc}`.

Paths: `/music/learn/ear` (Ear Training Path), `/music/learn/path` (Jazz Path), `/music/learn/jazz` (jazz reference).

Every drill shares one shell: collapsed setup behind "Edit setup", a ready stage with Start, a focus mode while playing, a results card with metrics. Drills accept setup in the URL query string.

## 6. What to do

Work in this order and keep notes with screenshots as you go.

1. **First session.** Arrive at `/music/guide` and `/music` as a new user with no data. Can you tell what to do first, how to get sound, how to pick an instrument, and what "progress" will mean? Time how long it takes to complete one drill from a cold start.
2. **Every drill, end to end.** For each drill route: read the setup, start, answer at least ten prompts on the on-screen surface (deliberately get some wrong), finish, read the results, try "Again" and "Retry mistakes" where offered, then check `/music/progress` and `/music/track` to see what the run did to mastery and the journal. Do this for each instrument the drill supports (the floating controls switch the instrument). Judge each drill on: clarity of the task, quality and timing of feedback, whether difficulty adapts, whether the on-screen surface is playable, whether the metrics mean anything to a learner, and whether the drill would transfer to the real instrument.
3. **Paths and routine.** Follow the Ear Training Path and the Jazz Path as a learner would. Does the ordering make sense? Does the app tell you what is next and why? Run the daily routine from `/music`.
4. **Hubs.** Library, Create, Progress, Connect, Tuner, Settings, Guide. Evaluate as a returning user: what would you open daily, what is noise, what is missing.
5. **Phone and accessibility.** Repeat the key flows at 375 px wide, in dark mode, and with keyboard only (Tab, Enter, Space). Report anything unreachable, any horizontal scroll, any state carried by colour alone, and anything the screen reader would announce wrongly (use the accessibility tree).
6. **Learning design.** Judge the whole against what is known to work: deliberate practice with immediate specific feedback, spaced repetition and interleaving, difficulty that tracks the learner, chunking, slow-to-fast tempo progression, recording and self-review, clear goals per session, and motivation through visible mastery rather than streak pressure. Name the principle each finding rests on.
7. **Drills and features to add.** For guitar, piano and MPC first, then Aerophone: propose drills the app lacks, each with the skill it trains, the prompt and answer format, the input surface, how it is scored, how mastery should move, and a reference (a method book, a well-known exercise, an app that does it well). Propose features the same way. For Aerophone, look for method material and existing practice approaches for digital wind instruments (breath control, articulation, fingering systems, bite and lip sensors on the AE series) and say what you found and how sure you are of it.

8. **Validate with web research.** Before you write up a UX change, a new drill or a feature, check it against the outside world: how the best apps in the space do it (Yousician, Simply Piano, Melodics, Soundslice, Tonal Energy, Sonofield, Justin Guitar, Modacity, Fretonomy, Piano Marvel, iReal Pro, Anki for the spaced-repetition side), what practice research and respected method books say, and what wind-instrument players and Roland's own material say about the Aerophone. Search for it, read the sources, and cite them in the ticket (URL and one line on what it showed). If research contradicts your proposal, change or drop the proposal and say so. If you find nothing either way, say the proposal is your judgement alone. Screenshots of reference apps you find can go in `docs/screenshots/review/references/`.

Look at the engines when a finding depends on what the code actually does (for example how mastery is computed, how the coach picks the next drill, how the routine is built). Do not guess where you can read.

## 7. Deliverables

Write two files into `docs/music-redesign/` and screenshots into `docs/screenshots/review/` (app captures) and `docs/screenshots/review/references/` (reference material you found). Do not modify anything else in the repository and do not commit.

**`16-external-review.md`**: a narrative report, at most about 3,000 words, in this order:

1. What you could and could not test (hardware, environment).
2. The ten changes that would matter most, ranked, one paragraph each with the evidence.
3. Per-drill notes: one short section per drill route with what works, what does not, and the fix.
4. Paths, routine and coach.
5. Hubs.
6. Phone and accessibility.
7. Learning design assessment against the principles in section 6.
8. Proposed new drills and features (summary; details in the backlog file).
9. Aerophone: what you found and what you recommend.
10. What you would leave alone.

**`17-review-backlog.md`**: one ticket per finding or proposal, using exactly this template so the items can be sliced into commits:

```
### <short title>
- Type: fix | improvement | new drill | new feature
- Area: <route or component>
- Impact: high | medium | low, with one sentence on who benefits and how
- Effort: S | M | L (S under half a day, M one to two days, L more)
- Evidence: <screenshot path or steps to reproduce, or the code you read>
- Principle: <the learning or UX principle it rests on, one line>
- Research: <sources you checked, with URLs, and whether they support, qualify or contradict the proposal>
- Proposal: <what to build, concrete enough to start; for drills include skill, prompt, answer, surface, scoring, mastery, reference>
- Depends on: <other tickets, or none>
```

Order the backlog by impact then effort. Prefer thirty well-evidenced tickets over a hundred vague ones.

## 8. Rules

- Evidence over opinion. Every finding names the route, the state you were in and what you saw; attach a screenshot when it helps.
- Rank. Say which ten things matter most and why the rest matter less.
- Be specific enough to build from. "Improve feedback" is not a finding; "the Reading drill shows Correct 400 ms after the note with no indication of which note was wrong; show the wrong note in red on the staff at hit time" is.
- Respect the constraints the docs record: single user, local data only, theme tokens only, one shared drill shell, engines framework-free in `packages/music-core`. Propose against a constraint only when you say so and why.
- Keep existing decisions in view. The CHANGELOG records what was tried and why; do not propose something that was removed on purpose without addressing the reason.
- Say what you are unsure of. If you could not exercise a path, say you read it rather than tested it.
- Research is part of the job, not a footnote. A proposal without a checked source is marked as judgement alone in its ticket.
- Plain prose. No em-dashes.
