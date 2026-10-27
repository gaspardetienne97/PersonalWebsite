# Practice OS, rebuilt from scratch

You are building a music practice app for one person, from scratch, inside their personal website's repository. The previous music app was deleted on purpose; the rest of the site is intact and is the stack you build on. What you have is everything else: a catalog of what the previous version did, the research it was built on, the hardware knowledge it took months to learn, screenshots of what it looked like, and the lessons from six review rounds and a seventh on the rebuild itself. Read `context/README.md` first; it indexes all of it.

## Who this is for

One musician who practises piano (a MIDI keyboard), guitar and ukulele (acoustic, through the laptop microphone or an interface input), finger drums on an Akai MPC One+ (MIDI pads, needs a controller handshake, see `context/03-hardware-and-devices.md`), and a Roland Aerophone AE-20 (MIDI wind controller over USB: breath on CC 2, bite as pitch bend, saxophone fingering; see section 9 of that file). They practise in short sessions, several instruments a week, and they want to keep coming back. They will run this on a laptop at the instrument and glance at it on a phone.

## The task

Build a complete, working practice app at `/music` that reaches feature parity with the catalog in `context/01-feature-catalog.md` (sections 1 to 7 are the first version, section 8 what a previous rebuild added, including its design and correctness review and the guitar, fingerpicking and timing work after it in 8.10 to 8.14; all of it is the bar), looks and feels like a great practice app, and makes practising feel worth returning to. Colour, motion, sound and celebration are welcome; the previous version was reviewed as dull and templated (see `context/06-lessons-learned.md`). The UI and UX are yours to design. You are not bound by any layout, naming, navigation, component or visual decision the old app made; the screenshots show what existed, not what to copy.

You may:

- drop a feature from the catalog when you judge it unnecessary, as long as you say so in `TASKS.md` with a one-line reason;
- add features the catalog never had when they make the app better for this musician;
- choose the architecture inside the stack, the libraries for notation, audio and MIDI, and the tooling; and
- redesign any drill's interaction as long as it still teaches the same skill and grades it honestly.

Keep the verified content and the hardware facts: the fingering charts, chord shapes, scale and pattern tables, groove tables, the MPC handshake bytes, the pitch-detection settings that work on low guitar strings, and the scoring rules that decide what counts as mastered. They are in `context/data/`, `context/03-hardware-and-devices.md`, `context/04-music-data.md` and `context/05-scoring-rules.md`. Change them only if you can show they are wrong.

## What the app must get right

These are requirements, learned the hard way. The detail is in the context files named.

- **Honest evidence.** Every graded drill has Practice (targets shown, recorded as guided) and Check (targets hidden, recorded as independent). Demos are never scored. What the input cannot measure reads "Not measured", never a flattering number (`05-scoring-rules.md` sections 1 and 2).
- **Every run leads to the next.** After a graded run, offer one button that sets up and starts the next run: faster, a harder variation, slower or easier, by one shared rule (two clean runs at 85% raise the tempo 5% to the variation's goal, then the next variation at 75% of its goal; a run under 70% steps back; the variation drops only after two fails at the floor). Each drill declares its tempo plan and its ordered variations; do not grow a separate ladder per drill (`05` section 16, research in `context/research/drill-progression.md`).
- **The instrument picked in the practice strip decides what the drill draws.** A drill that makes sense on several instruments draws the picked one from the same targets: a keyboard, a guitar or ukulele fretboard in one hand position, the Aerophone's fingering, or pads for rhythm. A line an instrument cannot reach moves by an octave. Each drill's catalog entry lists every instrument it serves, because the shell switches the strip to the drill's first instrument otherwise (`01` section 8.1).
- **The line is written out above the instrument** wherever a drill plays a line or chords: a staff on piano and Aerophone (grand staff for two hands, in the key's signature, in the written meter), tab on guitar and ukulele in a real hand position, with a cursor that follows the click or the demo. Hidden in Check.
- **Setup is a sentence, and the strip owns the global facts.** A drill's collapsed setup reads as one line whose clauses each open their own control; short lists are buttons, long catalogues a searchable sheet, and the stage is the control where it can be (tap a pad, the neck, a fingering). Tempo, instrument, tuning, sound and inputs live once in the practice strip, never again in a drill. Saved setups merge under a link's keys instead of being replaced (`01` section 8.10).
- **The first note counts.** In every timed drill a note on the downbeat, or a hair early, is heard: listen from half a beat before it, on every input (`05` section 26, `06` section 8).
- **Say what is really wrong.** An out-of-tune string is named as tuning, not graded as a wrong note; an input the app cannot measure is "Not measured". The owner's first guitar report of "not hearing" was a string 45 cents sharp (`05` section 23).
- **Fretted drills show both hands.** Dots take the fretting finger's colour, fingerpicking adds the picking letter and order, barres on chord shapes are one bar, and chord drills go round a cycle of two to eight chords drawn as diagrams above the neck (`01` section 8.13).
- **The Drills tab is grouped by what you practise** (ear, reading and rhythm, technique, grooves, jazz and improvising, theory, studio ears, phrases and songs), with an instrument filter; a drill whose modes practise different things is split into rows in the right groups.
- **Phrases.** Every instrument has popular short phrases to hear and play back (melodies, licks, and on the pads short drum phrases), graded on notes in order and timing.
- **Musical content is public domain or generic.** Traditional tunes, composers dead more than 70 years, or a style's shared vocabulary (a blues lick, a clave cell). No copyrighted songs or recorded solos. A song may appear only as facts (its chords in order, a picking pattern, a tempo), as the fingerpicking presets do, never its melody or tab. Check melodies against a score (IMSLP, Mutopia, Wikipedia's LilyPond) and record the source and any transposition with the data.
- **One list for one thing.** Groove presets in Create come from the pads repertoire; content tables live once in the domain package and are shared.

## Where it will live, and the stack

This repository is the owner's personal website: a SvelteKit 2 + Svelte 5 (runes) monorepo built with VitePlus, Tailwind CSS 4, shadcn-svelte style primitives on bits-ui in `packages/ui` (imported as `@repo/ui/<component>`), Vitest with a browser project for component tests, Playwright for end-to-end tests, and the Node adapter for deployment. The site's own pages and a PDF reader at `/pdf` are here and working; the music app was removed from `src/routes/music` and its old `packages/music-core` was deleted, so those paths are yours. The site's shared header and footer wrap every route.

Use this stack. Build the music app as `src/routes/music/**` (a `+layout.svelte` of its own inside the site shell is fine) with a framework-free domain package under `packages/` for engines, scoring and content, the way the rest of the monorepo splits UI from logic. Reach for `@repo/ui` primitives first and extend that package when you need a primitive it lacks, rather than inventing a second component library; add new primitives there in the shadcn-svelte style so the rest of the site can use them. Everything the app stores is client-side (IndexedDB, Origin Private File System); there is no server for the music app and no accounts. The root `CLAUDE.md` and `AGENTS.md` describe the monorepo commands and the commit workflow; they apply. If you conclude a different tool is genuinely better for one job (notation rendering, audio scheduling, pitch detection), use it and say why in `TASKS.md`; the stack itself is settled.

## How to work

Do your own research before you design. Look at how the best practice, tuner, notation, drum and habit apps present drills, feedback, progress and streaks today; `context/02-research-digest.md` and `context/references/` record what earlier rounds found, and they are a starting point, not a boundary. Read the learning research summarised in the digest and decide for yourself which findings you build on.

Gates, run before you call anything done (commands in the root `CLAUDE.md`): `vp fmt` and `vp lint` clean; `vp run -r check` passes and `svelte-check` shows no new errors (the site carries a few of its own, note them in `TASKS.md`); `vp test --run` passes; `vp run -r build` succeeds; Playwright passes against the production preview (build first; it serves on port 4173). Commit on a branch, one logical change per commit, and never push unless the owner asks.

Test conventions that held: send fake MIDI with an exact timestamp (schedule each event 60 to 100 ms early and stamp it with its real time) so timing grades stay correct under load; have running drill stages expose their downbeat and targets as data attributes, and wait for a fresh downbeat before scheduling; also play one note exactly on the downbeat and a few milliseconds before it, since a first note there was dropped app-wide while every test played later; drive the microphone with synthetic audio; open every authored phrase or score in a test and assert it engraves; screenshot every route at 375 and 1280 in both themes and look at what you took. Unit-test every content table's invariants (ranges, fingerings, string and fret arithmetic, plain note values).

Use the browser to check your work. Open the app, run each drill with on-screen input, take screenshots at phone and laptop widths, and read what you took. Drive the MIDI paths with a fake Web MIDI port in your end-to-end tests the way the lessons file describes; drive the microphone paths with synthetic audio. The owner will do the real-hardware checks at the end; list what they need to check in `TASKS.md` under "Needs hardware".

Split large, independent pieces across subagents when it speeds you up (for example one per instrument's drill set, or one for notation rendering). Give each a written brief and disjoint files; let only one agent build, run Playwright and commit. When a subagent reports back, check its evidence and its diff before you accept it.

Keep `TASKS.md` current as you go: what is done, what is in progress, what you dropped and why, what needs the owner. It survives context resets and it is how the owner follows along.

Mark anything you could not confirm, and say where you looked.

## Design guardrails

Do not use a cream or off-white background with a terracotta accent, a near-black page with one acid-green accent, italic accent words in headings, numbered section labels on things that are not sequences, tracked-out all-caps eyebrow labels, monospace labels for small data, middle-dot-separated meta strings, identical rounded cards with one radius and one grey shadow for everything, or an arrow appended to link and button text. Do keep 44 px touch targets, a keyboard path for everything a pointer can do, live-region announcements for status, visible focus, reduced-motion respect, and never let colour be the only cue. Keys, pads and frets must show held, target, correct and wrong as distinct states with distinct lifetimes; a wrong note must clear when its moment passes.

## Done means

- Every catalog feature is either present and working, or listed as dropped with a reason.
- A first-time user can connect a MIDI device or the microphone, run a drill on every instrument, see honest scoring, and see their progress and what to practise next.
- Unit tests cover the scoring and content tables; end-to-end tests cover each hub, one drill per instrument with fake MIDI and synthetic audio, the next-run offer, the instrument switch, and the written line; both suites pass.
- `TASKS.md` lists the hardware checks the owner must run.
- The app builds for production and runs from the built output.

## When to stop and ask

Stop and ask the owner only when you cannot continue without them: a product decision you cannot make from the context (say what you would choose and why), a blocker you cannot fix after a real attempt, or before anything destructive or outside this repository. Everything else, decide and record the decision in `TASKS.md`.
