# Implementation Plan — Cross-Instrument Practice App

**Audience:** an autonomous coding agent (Codex / Claude Code).
**Goal:** build the "Musicianship OS" core (Phase 0 + Phase 1) of a SvelteKit practice app, on top of an already-validated TypeScript domain model, then leave clean seams for later phases.

Read this whole file before writing code. Work ticket by ticket in order. Each ticket has explicit **Acceptance** criteria — do not mark a ticket done until all of them pass. Run the typecheck + test gates after every ticket.

---

## 0. Context you must not re-decide

These were settled deliberately. Treat them as constraints, not open questions.

- **The domain model already exists and is validated.** A `domain/` folder of strict-typechecked TypeScript (v1.2) ships with this plan: `time, capability, modality, instrument, note-event, skill, score, scoring, exercise, practice-session, pipeline` plus `validate.ts` and `pipeline-trace.ts`. **Drop it in unchanged as `src/lib/domain/` and build around it.** Do not redesign these types. If something genuinely cannot be expressed, raise it as a note and propose a minimal additive change — never a rewrite.
- **Input is MIDI-first, audio-second, on-screen-last**, mediated by one Input Router. Web MIDI (MPC One Plus, Roland Aerophone, keyboards) is reliable; guitar/uke audio pitch detection comes in Phase 2. Everything normalizes to the domain `NoteEvent`.
- **No real-time polyphonic chord detection.** It is not solved in-browser. Use monophonic detection (Phase 2) and _expected-target_ matching for chord practice. Do not attempt open polyphonic recognition.
- **The Skill Graph owns mastery.** Mastery state is mutated ONLY through `applyScoringEventToSkillState` in `domain/pipeline.ts`. Analytics produces evidence; it never writes mastery directly. No other code path may mutate `SkillMastery`.
- **Every graded attempt flows through the pipeline:** `ExerciseResult → resultToScoringEvent → ScoringEvent → scoringEventToEvidence → applyScoringEventToSkillState`, and `updateConfusion` for analytics. Do not invent a second path.
- **PWA-first.** Target Chromium browsers (Web MIDI works there). Degrade gracefully where `navigator.requestMIDIAccess` is absent (Safari/iOS): show a banner, offer on-screen keyboard + (later) audio. Never hard-fail. A Tauri/Electron desktop wrapper is explicitly out of scope for now.
- **Persistence:** IndexedDB (via Dexie) for structured state; OPFS for large binaries (recordings, samples, models). **Never use `localStorage`/`sessionStorage` for app data.**
- **Engines are framework-agnostic TypeScript.** Anything in `src/lib/engines/*` and `src/lib/domain/*` must not import Svelte. UI consumes engines, never the reverse. This keeps engines unit-testable and reusable.
- **Capability-first, instrument-second.** Build each capability (ear, reading, rhythm, technique…) once and project it per instrument. Do not build per-instrument silos.

---

## 1. Tech stack

Install **latest stable** of each and **pin the resolved version** in `package.json` (do not trust the example majors below blindly — resolve at install time). Rationale in parentheses.

- **SvelteKit + Svelte 5 (runes)** + **Vite** + **TypeScript** (app framework; runes for reactive state).
- **Tailwind CSS** + CSS custom properties for design tokens (supports the two themes).
- **tonal** (music theory: notes, intervals, chords, scales, transposition).
- **tone** (Transport, samplers, synths, look-ahead scheduling).
- **webmidi** (WEBMIDI.js v3 — friendly MIDI events, TS types).
- **vexflow** (notation: staves, generated prompts, sight-reading). OSMD is added later in Phase 3, not now.
- **svguitar** (guitar/uke chord diagrams). Piano keyboard is a custom Svelte component.
- **dexie** (IndexedDB wrapper).
- Dev/test: **vitest** (unit), **@testing-library/svelte** (component), **Playwright** (e2e, optional in Phase 1), **eslint** + **prettier** + **svelte-check**.
- Phase 2+ only (do not install yet): **pitchy**/**pitchfinder** (monophonic pitch), **@tonejs/midi** (MIDI file parse), **opensheetmusicdisplay** (MusicXML), **@spotify/basic-pitch** (offline transcription, Apache-2.0). **Avoid Essentia.js in any closed-source build (AGPL-v3).**

---

## 2. Repository layout

Single SvelteKit app. Engine "packages" are folders under `src/lib`, exposed via path aliases (no separate monorepo tooling needed for a solo build; revisit if it grows).

```
src/
  lib/
    domain/            # the validated v1.2 model — dropped in unchanged
      index.ts, time.ts, skill.ts, exercise.ts, pipeline.ts, ... validate.ts, pipeline-trace.ts
    engines/
      theory/          # @app/theory   — wraps tonal
      midi/            # @app/midi      — wraps webmidi → NoteEvent
      audio-in/        # @app/audio-in  — Phase 2 (stub now)
      input-router/    # @app/input-router
      transport/       # @app/transport — wraps tone Transport + metronome
      sound/           # @app/sound     — wraps tone synths/samplers
      notation/        # @app/notation  — wraps vexflow
      skills/          # @app/skills    — Skill Graph store (owns mastery)
      analytics/       # @app/analytics — confusion matrix, weak-spot picker
      exercise/        # @app/exercise  — registry + scheduler + run host
      progress/        # @app/progress  — XP/streak over skill graph
      store/           # @app/store     — Dexie schema + OPFS wrapper
    exercises/         # concrete ExerciseDefinitions (interval, spider, reading…)
    components/        # shared UI (PianoKeyboard, Fretboard, ExerciseCard…)
    theme/             # design tokens, Studio Light + Neon Arcade
  routes/             # SvelteKit routes (dashboard, library, ear, reading, rhythm, …)
tests/                # cross-cutting tests
static/               # PWA icons, manifest
```

Configure `vite.config.ts`/`tsconfig.json` aliases: `@app/theory` → `src/lib/engines/theory`, `@domain` → `src/lib/domain`, etc. Enable strict TS plus `exactOptionalPropertyTypes`, `noUnusedLocals`, `noUnusedParameters`, `noImplicitReturns` (the domain model already satisfies these).

---

## 3. Conventions & gates

- **Language:** TypeScript everywhere, strict. No `any` without a `// reason:` comment.
- **State:** Svelte 5 runes (`$state`, `$derived`, `$effect`) in UI; engines expose plain classes/functions and a small reactive store wrapper where needed (`.svelte.ts`).
- **IDs & time:** use the domain's branded `UnixMs`/`MonotonicMs`. Wall-clock for history, monotonic for timing. Never mix.
- **Mastery:** mutated only via `domain/pipeline.ts`. Add a unit test asserting no engine other than `skills` imports the mutators.
- **Testing:** every engine ships with Vitest unit tests. Pure functions (pipeline, scoring, theory) get table-driven tests. Target meaningful coverage of engine logic, not UI pixels.
- **Per-ticket gate (must pass before "done"):**
  1. `pnpm typecheck` (svelte-check + tsc) clean.
  2. `pnpm test` green.
  3. `pnpm lint` clean.
  4. The domain harnesses still run: `pnpm tsx src/lib/domain/validate.ts` and `pnpm tsx src/lib/domain/pipeline-trace.ts`.
  5. Ticket-specific Acceptance below.
- **Commits:** one logical commit per ticket, message `feat(<ticket-id>): …`.
- **Accessibility:** keyboard-navigable, ARIA on interactive controls, color-contrast safe in both themes. Audio features behind a user-gesture "enable audio" gate (Web Audio autoplay).

---

## 4. PHASE 0 — Foundations ✅ COMPLETE

> All T0.x tickets shipped: the app shell, domain model, `PracticeStore`,
> theory/transport/sound/MIDI/input-router engines, on-screen keyboard, and audio
> gate are built and in use across every Music route.

Goal: a running PWA where you can connect a MIDI device, see normalized `NoteEvent`s, and hear an in-time metronome.

### T0.1 — Project scaffold

- Create the SvelteKit app, TypeScript strict config, Tailwind, ESLint/Prettier, Vitest, Playwright, `svelte-check`. PWA via `@vite-pwa/sveltekit` with a manifest + service worker (precache app shell).
- Set up path aliases and the `src/lib` structure from §2 (empty stubs OK).
- Add `pnpm` scripts: `dev, build, preview, typecheck, test, test:e2e, lint, format`.
- **Acceptance:** `pnpm dev` serves a blank shell; `pnpm build` succeeds; installable as a PWA; all gates pass on an empty project.

### T0.2 — Drop in & wire the domain model

- Copy the provided `domain/` files to `src/lib/domain/`. Add `@domain` alias. Add `tsx` as a dev dep.
- Add npm scripts `domain:validate` and `domain:trace` running the two harnesses; wire both into CI.
- **Acceptance:** typecheck clean; both harnesses run and print their expected output (four exercises grade; pipeline trace shows mastery rising 0→~0.78 and confusion `m6: P5=4, m6=4`).

### T0.3 — Persistence (`@app/store`)

- Dexie schema (versioned) for: `sessions` (PracticeSession), `scoringEvents`, `skillMastery`, `skills`, `chordLibrary`, `songs`, `settings`. Use the domain types as row shapes; store branded timestamps as `number`.
- OPFS wrapper module: `putBinary(key, blob)`, `getBinary(key)`, `list(prefix)` — for future recordings/samples/models. Feature-detect OPFS; no-op-with-warning fallback.
- Repository functions (typed) for each table; no raw Dexie calls in UI.
- **Acceptance:** unit tests insert/read a `PracticeSession` and a `SkillMastery` round-trip; OPFS wrapper stores/reads a blob in a Chromium test env (or is cleanly skipped where unavailable).

### T0.4 — Theory engine (`@app/theory`)

- Thin typed wrapper over `tonal`: `noteToMidi/midiToNote`, `frequency`, `intervalBetween`, `chordNotes(symbol)`, `scaleNotes(name)`, `transpose`, `romanNumeral` helpers. Return domain-friendly shapes.
- **Acceptance:** table-driven tests for a dozen known conversions/chords/scales; no Svelte import.

### T0.5 — Transport + Sound (`@app/transport`, `@app/sound`)

- `@app/sound`: wrap `Tone` — synth + `Tone.Sampler`/`Tone.Players`; manage the `Tone.start()` gesture gate; expose `playNote`, `playChord`, `loadDrumKit`.
- `@app/transport`: wrap `Tone.Transport` — BPM, time signature, count-in, loop points, quantization grid, and a **metronome** using look-ahead scheduling (schedule against the audio clock; never `setInterval`). Emit beat/subdivision events for UI.
- **Acceptance:** a metronome page ticks audibly and in time at 60/120/180 BPM with a visible beat indicator; tempo changes apply cleanly; unit test asserts scheduled tick spacing is sample-accurate (mock the clock).

### T0.6 — MIDI engine (`@app/midi`)

- Wrap `webmidi`: enumerate inputs/outputs, hot-plug events, permission flow. Detect absence of Web MIDI and expose a capability flag.
- Normalize all incoming messages to domain `NoteEvent`s (`noteOn/noteOff/cc/pitchBend/aftertouch`), with `source:"midi"`, monotonic `timestamp` + `clock`, `deviceId`, normalized velocity/value, optional `raw`. Include device profiles for MPC pad banks and Aerophone breath-CC (CC2) / bite (pitch-bend).
- **Acceptance:** with a connected device (or a mocked MIDIAccess in tests), `noteOn/off` and CC produce correctly-shaped `NoteEvent`s; a debug page lists devices and live-logs normalized events; capability flag is `false` under a stubbed Safari env.

### T0.7 — Input Router (`@app/input-router`)

- One subscribe-able stream of `NoteEvent`s. Strategy: prefer MIDI when a device for the active instrument is sending; else on-screen; (audio added Phase 2). Expose the active source + a confidence signal to the UI.
- **Acceptance:** unit tests verify source arbitration (MIDI present → MIDI; absent → on-screen); UI shows the active source.

### T0.8 — App shell, on-screen keyboard, audio gate

- Persistent nav (sidebar desktop / bottom tabs mobile) grouped Home · Learn · Play · Track · Progress (most routes are stubs now). Global "enable audio" gate. An `<OnScreenKeyboard>` component emitting `NoteEvent`s via the router.
- **Acceptance:** keyboard plays through `@app/sound`; nav works on mobile widths; audio gate satisfies autoplay policy.

**Phase 0 done when:** connect a keyboard/MPC/Aerophone (or on-screen), see normalized events, hear an in-time metronome; PWA installs and loads offline; all gates green.

---

## 5. PHASE 1 — Musicianship OS (shippable core) ✅ COMPLETE

> All T1.x tickets shipped: skills, analytics, exercise runtime, progress/XP,
> chord & theory library, ear training, note reading + sight-reading, rhythm,
> scales/technique, practice journal, dashboard + skill tree, and theming. The
> full daily-practice loop runs offline with real mastery movement.

Goal: a complete daily-practice loop — pick a session, run exercises across ear/reading/rhythm/technique with MIDI or on-screen input, earn XP/streak, and watch real mastery move — all offline-capable.

### T1.1 — Skill Graph engine (`@app/skills`)

- A store that loads/persists `Skill`, `SkillRelationship`, and `SkillMastery` (via `@app/store`). Seed an initial graph: intervals (m2…P8), triad qualities, seventh chords, ii–V–I, rhythm cells (quarter/eighth/triplet/sixteenth), treble/bass note reading, basic scales. Namespaced ids (`pitch.interval.m6`, `harmony.triad.major`, …) with prerequisite/component links and `level`/`tags`.
- Expose `getMastery(skillId)`, `unlockedSkills()`, and `ingest(event: ScoringEvent)` which calls `applyScoringEventToSkillState` and persists. **This is the only mastery mutator.**
- **Acceptance:** seeding is idempotent; `ingest` of a correct event raises the touched skill's mastery and persists; a test asserts no other engine imports the pipeline mutators.

### T1.2 — Analytics engine (`@app/analytics`)

- Maintain the `ConfusionMatrix` (via `updateConfusion`) and derived stats: per-skill accuracy, reaction time, chord-switch speed, consistency. Expose `weakestSkills(n)` and `confusions(skillId)` to drive the scheduler. Persist incrementally.
- **Acceptance:** after feeding the m6/P5 sequence from `pipeline-trace`, `confusions("pitch.interval.m6")` reports the P5 substitution and `weakestSkills` ranks it appropriately.

### T1.3 — Exercise framework runtime (`@app/exercise`)

- An `ExerciseRegistry` (register/lookup `ExerciseDefinition`s). A **Scheduler** that builds a session queue using: spaced repetition (SM-2-style), adaptive difficulty (raise/lower on rolling accuracy), interleaving (rotate trouble spots), and analytics weak-spots. A **Run host** that drives `createRun → accept(NoteEvent) → getLiveState → finish`, wires input from `@app/input-router`, then runs the pipeline: `resultToScoringEvent` → `@app/skills.ingest` → `@app/analytics` → `@app/progress`.
- **Acceptance:** a fake exercise run end-to-end produces a `ScoringEvent`, moves mastery, updates analytics, and awards XP — verified in one integration test. Live state updates during a streaming run.

### T1.4 — Progress / Gamification (`@app/progress`)

- One XP currency derived from `ScoringEvent`s (weight by difficulty + improvement), daily **streak** with a streak-freeze, levels, and achievement unlocks tied to skill-graph milestones. Persist. Framing: "daily practice drives improvement."
- **Acceptance:** XP accrues from events; streak increments once per UTC-local day and freezes correctly; unit tests cover day-boundary logic.

### T1.5 — Chord & Theory Library (UI + data)

- Searchable chord/scale browser. For a selected chord: notes/intervals (theory engine), **guitar & ukulele diagrams (SVGuitar)** with voicings, a **piano voicing** on a custom `<PianoKeyboard>`, audible playback (`@app/sound`), and "add to my library" (persisted).
- **Acceptance:** selecting Cmaj7 renders correct notes, at least one guitar + one uke voicing, a piano voicing, and plays it; saved chords persist across reload.

### T1.6 — Ear Training module

- Concrete `ExerciseDefinition`s (discrete): interval recognition, chord-quality ID, **functional scale-degree** ID in a key context. Answerable by click, on-screen, or MIDI. Rich `ScoringMetric`s (`choice`/`pitch`) so analytics gets confusion data. Tag each with its skill ids + `modality:"heard"`.
- **Acceptance:** each exercise generates, accepts all input modes, and grades via the framework; wrong answers populate the confusion matrix; a session of 10 prompts advances mastery and XP.

### T1.7 — Note Reading + Sight-reading

- **Flashcards** (discrete): a note on a staff (VexFlow) → name it or **play it** (answer-by-play via router). Show the note's location on the chosen instrument (`<PianoKeyboard>`/`<Fretboard>`). Clef/key filters, spaced repetition.
- **Sight-reading** (streaming): generate a short melody, render in VexFlow, advance a playhead, and grade with a **Score-Follower** run (`domain` streaming run) on pitch + timing. Wait-mode (pause until correct) + performance-mode.
- **Acceptance:** flashcard answer-by-play grades from MIDI/on-screen and highlights instrument location; sight-reading scores a played-back-correct melody at 1.0 and degrades sensibly on wrong/late notes; both feed the pipeline.

### T1.8 — Rhythm Trainer

- Metronome-anchored: tap-tempo, rhythm dictation, and **play-along scoring** comparing input timestamps to the Transport grid (report ms error + ahead/behind). Use `OnsetEvent`/`noteOn` timestamps. Streaming run.
- **Acceptance:** tapping a quarter-note pulse in time scores high; consistent rushing is detected and reported; timing metrics recorded on the event.

### T1.9 — Scales & Technique (MIDI/basic)

- Scale/arpeggio selector; play the pattern on a MIDI instrument or on-screen; score note accuracy + evenness; tempo-progression target ("clean at 100 → unlock 110"). Streaming run. (String-instrument audio version is Phase 2.)
- **Acceptance:** a correctly-played C major scale scores high with an evenness readout; tempo unlock advances on success.

### T1.10 — Practice Journal + Sessions

- Wrap each practice run in a `PracticeSession` with `ExerciseRunRecord`s, `source`, tags, XP, and a free-text journal note. Persist. Provide query views: by skill, by instrument, by date range; `summarizeSession` rollups.
- **Acceptance:** completing a session writes a queryable record; "sessions touching `harmony.ii-v-i`" and "this week vs last week" queries return correct results.

### T1.11 — Dashboard + Skill Tree

- **Dashboard:** streak, today's XP ring/goal, "continue practice" CTA, daily-challenge card, recent instruments, today's routine.
- **Skill Tree:** visualize the Skill Graph (nodes, prerequisites, mastery rings), an analytics view (confusion matrix, weak spots, "practice next" picks), achievements, streak calendar.
- **Acceptance:** dashboard reflects real persisted state; skill tree renders the seeded graph with live mastery and surfaces weakest skills from analytics.

### T1.12 — Theming + UI/UX polish

- Design tokens + two themes over one component set: both pass contrast checks. use the themes of the whole app.
- Read the docs/music-practice-app folder at the root of the repo and the README inside. that is a claude design folder use it to make the UI and UX more consistent. Don't worry much about color and fonts or other things that should come from the parent site or it's theme but do use it to try and build better components for the app more consistent and polished UI/UX. Evaluate what we already have and what claude design created for each parts or areas and judge which implementation has a better UI/UX and implement that, ask me if there are questions.

- **Acceptance:** toggling theme restyles the whole app with no layout breakage; tokens (not hardcoded colors) drive components. and the app implements the design from claude design

**Phase 1 done when:** a user connects an instrument, runs a mixed daily session, sees XP/streak grow, and watches a specific skill's mastery move from one value to a higher one across sessions — entirely offline as a PWA. All gates green; engines have unit tests; one integration test covers the full input→pipeline→mastery→progress loop.

---

## 5A. PHASE 1.5 — Practice depth, input surfaces & polish (live-use backlog)

Goal: deepen the shipped Phase-1 screens based on real use. These tickets are **not started**; pick them up in any order (dependencies noted). Phase 0/1 above is complete — do not reopen those tickets.

> **Tooling note (repo has moved since §1–§2 were written).** The app is now a **VitePlus monorepo** (NO Turborepo). Engines live in package **`@repo/music-core`** (e.g. `@repo/music-core/engines/{input-router,sound,midi,device-profiles,recording,sequencer,reading-session,…}`, `@repo/music-core/domain`); shared UI primitives in **`@repo/ui`**; the music app under `src/routes/music`. Persistence is client-side via `PracticeStore`/IndexedDB (NO DB migrations). Gates are `vp run -r check`, `vp test --run`, `vp run -r build`. TDD with atomic commits; the shared runtime is `src/routes/music/_runtime.svelte.ts` (`MusicRuntime`). Keep the §0/§3/§7 constraints (semantic theme tokens, no hardcoded colors, no Svelte in engines, mastery only via the pipeline). Visual references live in `docs/music-practice-app/` (Claude design) and `docs/screenshots/`.

### T1.5a — Multi-surface on-screen input (keyboard / fretboards / MPC grid)

> **Slice 1 ✅ DONE** (`25679d0`): `MpcPadGrid` (4×4 bank-A pads, MIDI 36–51, assignable QWERTY keys) + `InputSurface` selector (keyboard/guitar/uke/MPC, reusing `OnScreenKeyboard`/`FretboardInput`); wired into Connect's on-screen fallback. +3 component tests.
> **Slice 2 ✅ DONE** (`1e6d875`): surface persisted **per instrument** via `DeviceProfileStore.surfaces` (`InputSurfaceId`, `defaultSurfaceForInstrument`, `setSurface`/`surface`); Connect shows a per-instrument "On-screen surface" control; `MusicRuntime.surfaceFor()` exposes it and the **ear-training session** renders the player's preferred surface as its in-session fallback. +4 engine tests. (Reading already routes input by exercise instrument; rhythm is tap-based — ear is the meaningful consumer.)
> **Remaining:** none required for the ticket; optional polish — let reading/rhythm honor the per-instrument surface if those screens grow on-screen note entry, and an e2e completing a play-back ear drill to lock the surface swap behind a trusted gesture.

- Today the on-screen fallback is a single `<OnScreenKeyboard>`. Replace it with a **selectable surface** so the player can choose, per active instrument: a **piano keyboard**, a **guitar fretboard**, a **ukulele fretboard**, and an **MPC pad grid** with **assignable QWERTY key mappings** (type letters to trigger pads). Match the surfaces shown on the Connect screen mock (`docs/screenshots/`, `docs/music-practice-app/`).
- All surfaces emit domain `NoteEvent`s through `runtime.router` exactly like the current keyboard (`source:"onscreen"`, correct `instrument`). The MPC grid emits pad `noteOn` (and respects the active-channel filter added in the transport work).
- Surface choice is selectable in **Connect** (per instrument, persisted via device profiles / `PracticeStore.settings`) and is the fallback used inside sessions when MIDI/audio aren't live.
- **Acceptance:** each surface renders, is keyboard-accessible, and produces correctly-shaped `NoteEvent`s verified by unit tests; selecting a surface in Connect persists and is honoured by the reading/ear/rhythm sessions; QWERTY→pad mapping is editable and persisted.

### T1.5b — Aerophone fingering visualizer ✅ DONE (first pass)

> Built per the user's redirect (they supplied the AE-10 manual + sax fingering chart) — this is the §6 "Aerophone fingering visualizer" item. Shipped (`cfe0541`): `aerophone-fingering` engine (key layout + per-note table Bb3–F#5, `fingeringForMidi`/`aerophoneChart`, +7 tests); `AerophoneFingering.svelte` (theme-token SVG, fills pressed keys + octave indicator); `/music/learn/aerophone` (large selected view + prev/next, full-range chart grid, **live highlight from incoming MIDI/on-screen** via the runtime router), linked under Learn. **Data caveat:** main keys + octave verified on screen; side/pinky keys on the break (C5/C#5), bis Bb, and long F# are best-effort — flagged in `AEROPHONE_FINGERINGS` for user verification against the physical unit. The original piano/guitar chord-fingering idea below is **not yet done** and remains available.

### T1.5b (original) — Chord/scale visualizer upgrade with fingering suggestions

- Improve the piano visualizer in the Chord Library (and reuse it in reading/scales) and add **fingering suggestions** for both **chords and scales** — finger numbers on the piano keys and on the guitar/uke diagrams (lean on `svguitar` for fretted shapes; compute sensible piano fingerings for scales/arpeggios).
- Keep instrument-accent theming; no hardcoded colors.
- **Acceptance:** selecting a chord shows recommended fingering on piano + at least one fretted diagram; selecting a scale shows a playable fingering pattern; fingerings are unit-tested for a representative set (e.g. C/G/F major scales, Cmaj7, common open chords).

### T1.5c — Auto-captured, editable Practice Journal & sessions ✅ DONE

> Shipped: `PracticeSessionStore.remove`; `/music/track` per-entry Edit (notes+tags) & Delete; `MusicRuntime.attachJournal` + `recordPractice`; auto-capture wired into reading, ear, rhythm, and scales on session completion. Verified end-to-end (a finished reading session appears in the journal and is editable).

- Let the user **start a practice session**; everything practiced anywhere in the app (ear, reading, rhythm, scales, jam, studio, recording) is captured into that session and surfaced in the **Practice Journal**. Builds on T1.10's `PracticeSession`/`ExerciseRunRecord` plumbing.
- The journal entries must be **editable**: add/remove entries, edit fields, and attach **free-text notes**. Persist via `PracticeStore` (no server).
- **Acceptance:** starting a session and completing activities writes linked records that appear in the journal; the user can add, edit, delete entries and notes and the changes persist across reload; existing query views (by skill/instrument/date) still pass.

### T1.5d — Semantic in-component color system ✅ DONE

> Shipped (`500e9f8`): `--success`/`--warn`/`--info` (+ `-foreground`) tokens in `app.css` for light+dark (registered as Tailwind utilities; `--destructive` = error); a pure, tested `semantic-color` engine (`masteryTone`/`accuracyTone`/`timingZone`/`intensityStep`, 8 tests). Applied to mastery rings (SkillRing), ear accuracy readout, TimingMeter (diverging), the confusion list (sequential intensity heatmap), SessionFeedback, WeekDots, Live/MIDI/record/Web-MIDI status badges. Audit: **zero** hardcoded semantic palette colors remain in `src/routes/music`. Browser-verified token resolution + ring contrast in both themes. The Phase-2 tuner reuses `timingZone` for sharp/flat/in-tune.

- Keep the **theme palette** for chrome/consistency, but give **data-bearing components** colors that encode meaning: heat maps, the tuner (sharp/flat/in-tune), accuracy/timing (ahead/behind), mastery rings, confusion intensity, pad colors, etc.
- Implement as **semantic scales derived from theme tokens / OKLCH ramps** (success/warn/error/info + sequential/diverging scales) exposed as CSS variables — **not** hardcoded hex. Must remain contrast-safe in both light/dark and respect the Settings reduce-motion/color-coding toggles.
- **Acceptance:** heatmap + tuner (at minimum) render meaningful color scales sourced from tokens; a quick audit shows no new hardcoded colors; contrast checks pass in both themes.

### T1.5e — Research-driven chord & exercise/drill libraries (use deep research)

> **DEFERRED → see §5B.** (Needs the deep-research skill; revisit after the engine-gated pages.)

### T1.5f — Ear-training exercise & schedule redesign (research)

> **DEFERRED → see §5B.** (Needs research; revisit after the engine-gated pages.)

### T1.5g — User-facing docs: "How to use the Music app" ✅ DONE

> Shipped (`d81962c`): an **in-app** `/music/guide` page (NOT under `docs/`, which is git-excluded and so wouldn't be discoverable). Covers quick-start (enable audio → Connect/on-screen → drill → finish → journal), the practice loop, the four areas (Learn/Play/Track/Progress), the transport bar, devices & input surfaces, and offline/PWA. Linked from the sidebar; uses live route links so it stays current. Theme-token styled, gates green, browser-verified.

- Write end-user docs (under `docs/`) covering setup (MIDI/Connect), the practice loop, each screen, the transport bar, and offline/PWA use. Link from the app where helpful.
- **Acceptance:** a discoverable doc walks a new user from "plug in a device" to "complete a session and read the journal"; screenshots current.

### T1.5h — Dependency / code-reduction audit ✅ DONE (first pass)

> **Audit outcome:** the dependency footprint is already lean — `svguitar` (static chord diagrams in ChordDiagram), `vexflow` (StaffNotation), `@tonejs/midi`, `tone`, and `@spotify/web-api-ts-sdk` (the unrelated `/listplay` site route) are all genuinely used; `tailwind-variants`/`clsx`/`tailwind-merge`/`mode-watcher`/`embla-carousel-svelte` all used.
>
> **Wins implemented (shipped, gates green):**
>
> 1. **Removed dead dependency `@inlang/paraglide-sveltekit`** — referenced _only_ in package.json (zero code/config usage; i18n runs through the generated `$lib/paraglide` + `paraglideMiddleware` from `@inlang/paraglide-js`). `pnpm install` pruned **143 packages** from the tree. Build + 284 tests green; i18n verified intact (root 200, `html lang` still injected).
> 2. **Consolidated the semantic tone→Tailwind-class map** (duplicated by T1.5d across SkillRing + EarTrainingSessionView) into one route-layer helper `src/routes/music/_components/semantic-color.ts` (`toneTextClass`), keeping class strings out of the framework-agnostic engine.
>
> **Recommend KEEP (no clean swap):** the interactive `FretboardInput` is distinct from `svguitar`'s static diagrams (don't merge); the token-derived `semantic-color` scales (T1.5d) need no color library (`culori`/`chroma-js` would be heavier); engine state stores stay bespoke per §7 (no Svelte/3rd-party state lib in engines).
>
> **Future candidate (low priority):** `lucide-svelte@0.561` is deprecated → migrate to `@lucide/svelte` (mechanical import rename across many files; defer until it blocks something).

- Identify bespoke code that a **well-scoped library/package/module can cleanly replace** to lower maintenance (e.g. fretboard/diagram rendering, color scales, state helpers, MIDI file handling). Propose swaps with size/maintenance tradeoffs; only adopt where it genuinely reduces code without violating §7 (licensing, no AGPL like Essentia.js, client-only).
- **Acceptance:** a short audit doc lists candidates with recommendations; at least the clear wins are implemented behind green gates with net-negative LOC and no regressions.

---

## 5B. DEFERRED — revisit after the engine-gated pages

Parked by user decision (2026-06): do these later, after §5C ships.

### D1 — Finish the Aerophone fingering data

- The visualizer (§T1.5b) is built and looks right, but the **per-note fingering table** still needs verification against the physical AE-10. Confirm/correct the approximate notes (C5/C#5 side-C, the bis Bb, long F#4/F#5, eb/lowC) and the low pinkies.
- The illustration now exposes **all** keys (palm1–4, front, blackL1–3, blackR1–3 — see `AEROPHONE_KEYS`). **Add charts** that actually use them once the user supplies the note→keys data. Fix the approximate `eb`/`lowC` highlight centers in `aerophone-art.ts`.
- **Acceptance:** the user signs off each note vs the instrument; new-key fingerings render correctly.

### D2 — Aerophone live-practice integration

- Surface the fingering visualizer **beyond its own page**: show it live (driven by incoming MIDI / on-screen input) when Aerophone is the active instrument — e.g. in the transport area or a practice panel, "Roland practice-app style".
- **Acceptance:** playing an Aerophone note anywhere lights its fingering in a persistent panel.

### D3 — Research-driven chord & exercise/drill libraries _(was T1.5e)_

- Use the **`deep-research` skill** to build out the chord/scale library content + a per-instrument exercise/drill library (guitar, uke, piano, aerophone, MPC One). Structured data + `ExerciseDefinition`s tagged with skill ids + modality, feeding the existing pipeline. Cite sources; client-side, copyright-safe.
- **Acceptance:** library materially expanded from real sources; each instrument has a starter drill set that runs through the exercise framework and moves mastery; data unit-tested; research note records sources.

### D4 — Ear-training exercise & schedule redesign _(was T1.5f)_

- Study **sonofield.com/blog**; redesign the ear-training exercise set + practice schedule/progression (curriculum ordering, spacing, difficulty ramp). Refines T1.6 + the scheduler without changing the pipeline contract.
- **Acceptance:** a design note maps principles to concrete changes; the ear module reflects the new progression; scheduler tests cover the new ordering/spacing.

---

## 5C. NEXT — Pages gated by the engines (active)

The engines exist; these surfaces are missing or stubbed. Each is "gated" by an
engine that's already built — this is wiring UI onto ready capability, not new
engine work. Ordered by value/effort. Shared rules: `@repo/ui` primitives +
theme tokens (no hardcoded colors), `PracticeScreen`/`Header` layout, capture
finished work to the journal via `runtime.recordPractice`, gates green
(`vp run -r check`, `vp test --run`, `vp run -r build`) + svelte-autofixer.

> **Coverage audit (engine → page) — updated:** built & full — Home, Connect,
> Guide, Import, Jam, Studio, Recording, Track (journal), Progress (skill tree),
> Settings, Learn/{Ear,Reading,Rhythm,Theory,Aerophone,Jazz,Path}, Play/{Lab,
> Scales,MPC,Voicings}, Tuner, Intonation, Routine. The `SessionSource` union is
> `free-practice | daily-routine | song | drill | jam`; **`free-practice`
> (✅ P1 Practice Lab), `daily-routine` (✅ P2 Routine runner), `song`
> (✅ P3 Song Library), `drill`, and `jam` all have flows now.**

### P1 — Practice Lab (free-practice sandbox) — `/music/play` ✅ DONE

> Built: `/music/play` is now a full free-practice sandbox (~674 lines) — instrument
> picker → live input surface, audio + source readout, backing tracks, recorded
> `free-practice` sessions to the journal, and a Play hub linking Scales / MPC /
> Tuner / Intonation / Jam / Studio / Recording. _(Original task below.)_

- **Today:** a 34-line stub with a single "Scales" card. The nav calls it
  "Practice Lab" (FlaskConical). **Gap:** there is no free-play surface even
  though `MusicRuntime` (input-router, sound, midi, on-screen `InputSurface`),
  the transport/metronome, and `SessionSource:"free-practice"` are all ready.
- **Build:** instrument picker (`runtime.setActiveInstrument`) → live `InputSurface`
  (the per-instrument surface from Connect) + audio + source readout + optional
  metronome (transport bar). A **"Record this session"** toggle that captures
  played notes and writes a `free-practice` entry to the journal on stop
  (`runtime.recordPractice`). Keep the existing Scales link as a sub-tool.
- **Engines:** runtime, input-router, sound, midi, transport, sessions/journal.
- **Acceptance:** pick an instrument, play (MIDI or on-screen) and hear it; start/stop a recorded free-practice session and see it appear in `/music/track`.

### P2 — Daily Routine runner — `/music/routine` (+ Home CTA) ✅ DONE

> Built: `/music/routine` runs a `daily-routine` session chaining ear/reading/
> rhythm/scales from the practice-next projection (`buildDailyRoutinePlan`,
> `DailyRoutineSession`); real drill completions advance via tag-matched
> `recordPractice` + a shared `RoutineContinueAction`, finishing with one combined
> journal entry. Home + nav link to it. _(Original task below.)_

- **Today:** the Home dashboard shows "today's routine" copy but there's **no
  runner**; `SessionSource:"daily-routine"` is unused.
- **Build:** a routine = an ordered list of drills (ear/reading/rhythm/scales)
  chosen from the Skill Graph's "practice next" (progress engine). A runner
  screen steps through each drill in sequence, threading one `daily-routine`
  session, showing progress + a combined summary at the end (total XP, per-drill
  accuracy). Home's "continue practice" CTA launches it.
- **Engines:** progress/skills (what to practice), exercise + the existing
  ear/reading/rhythm/scales sessions, sessions/journal, dashboard.
- **Acceptance:** start the daily routine from Home → complete 3–4 chained drills → one routine entry with a roll-up summary lands in the journal and moves mastery.

### P3 — Songs / Repertoire — `/music/songs` ✅ DONE

> Built: `@repo/music-core/engines/song-library` converts imported MIDI models
> into persisted domain `Score`s in the existing Dexie `songs` store. `/music/import`
> can save an imported MIDI file to repertoire, and `/music/songs` lists saved
> songs, reopens them, registers transport playback from the stored score, and
> logs a `SessionSource:"song"` journal entry. The first slice is list + replay +
> practice logging; deeper score-following over arbitrary files remains Phase 3.

- **Today:** `/music/import` imports + plays a MIDI file, the Dexie `songs`
  table + `SessionSource:"song"` exist, and the journal has a repertoire rail —
  but there's **no library of saved songs** to revisit.
- **Build:** a repertoire list backed by the `songs` store (persist imported
  songs), each row opening a play/practice view (reuse the import engine +
  score-follower); log practice against a song as a `song` session. Import flows
  into "save to repertoire".
- **Engines:** import, store (`songs`), score-follower, sessions/journal.
- **Acceptance:** import a file → save to repertoire → reopen it later from `/music/songs` → practice it → a `song` journal entry is written. _(If score-follower depth over arbitrary files is too thin, scope P3 to list+replay first and defer follow-along to Phase 3.)_

### P4 — Hub polish (quick) ✅ DONE

> Built: `/music/learn` now links every learn-facing child route and adjacent
> drill entry point: Jazz Path, Ear Training, Note Reading, Rhythm Trainer,
> Theory Library, Aerophone, Scales & Drills, and Jazz Piano. Play hub coverage
> was already folded into P1.

- **Learn hub** (`/music/learn`): ✅ DONE — added the missing **Aerophone** and
  **Scales & Drills** cards so the hub matches the sidebar/Practice OS IA.
- **Play hub** (`/music/play`): ✅ DONE — folded into P1 (Practice Lab with
  sub-tools linking Scales / MPC / Tuner / Intonation / Songs / Jam / Studio / Recording).
- **Acceptance:** both hubs list every child route; no dead/missing tiles.

**Suggested order:** P1 (Practice Lab) → P4 (hubs, trivial alongside P1) → P2
(Daily Routine) → P3 (Songs/Repertoire). P1+P2 complete the core practice loop;
P3 is the largest and leans on Phase-3 seams.

---

## 5D. PAGES THAT NEED NEW ENGINES (not built yet)

The inverse of §5C: surfaces we want where the **backing engine does not exist**.
These are the Phase 2–5 features (§6) reframed as page → missing engine, so the
gap is explicit and trackable. Build the engine first (framework-agnostic, in
`packages/music-core/src/engines/*`, no Svelte), then the page. Respect §7
(client-only, no AGPL, Dexie/OPFS, Tone look-ahead, no polyphonic audio in P1).

| Page / surface                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  | Missing engine (new)                                                                                                                                                                      | Builds on                                                                     | Phase |
| ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------- | ----- |
| ✅ **Tuner** (`/music/tuner`) — **DONE**                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        | ✅ `audio-in` — mic capture + monophonic pitch (**McLeod Pitch Method**, AudioWorklet) → `TunerReading` + audio `NoteOnEvent`                                                             | input-router (audio source), semantic-color (flat/in-tune/sharp)              | 2     |
| ✅ **Intonation / Drone trainer** (`/music/intonation`) — **DONE**                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              | ✅ reuses `audio-in` pitch + a drone generator in `sound`                                                                                                                                 | audio-in, sound, transport                                                    | 2     |
| ✅ **Technique drills** — **DONE** (Scales/Technique `/music/play/scales`, MPC Rudiments `/music/play/mpc`, guitar/ukulele Spider `/music/play/spider`, per-string Chord-Perfect `/music/play/chord-perfect`, piano two-hand independence `/music/play/two-hand`, Aerophone long-tone/swell `/music/learn/aerophone`, Aerophone articulation `/music/play/articulation` (CC analysis), graded ii-V-I voicing drill `/music/play/voicings`, and microphone audio-onset timing in `/music/learn/rhythm`)                                                                                                                                                                                                                                                                                                                                                                                                                                          | ✅ `technique-session` + `audio-in` onset/pitch                                                                                                                                           | technique-session, audio-in, midi (CC), aerophone-fingering                   | 2     |
| ◑ **Song Studio / score view** (`/music/songs/[id]`) — **FEATURE + AUTOMATED RELEASE GATES COMPLETE; MANUAL FOLLOW-UP PENDING** (`score-import` MIDI/uncompressed MusicXML/compressed `.mxl` → canonical `Score`, original extracted MusicXML persistence, lazy OSMD/VexFlow rendering, tempo-aware non-overlapping preview, canonical voice/MusicXML part selection, Staff/Tab/Aerophone fingering projections, direct measure/note-group selection, whole/multi-section/custom ranges, Wait/Performance, Sequence/Per Section finite loops, monotonic count-in, take/section summaries, structured practice logging, import-to-practice Playwright coverage, mobile containment, and complete check/test/build/E2E/domain gates; ⏳ deferred hardware/manual verification remains)                                                                                                                                                            | ✅ `score-import` + ✅ lazy **OSMD** + ✅ `score-practice` + ✅ instrument/voice projections + ✅ monotonic transport + ✅ renderer selection + ✅ route orchestration + ✅ release gates | import, score-follower, transport, notation renderers, store(`songs`)         | 3     |
| ✅ **Instrument score projections** — **BUILT**: guitar/ukulele VexFlow TAB in Song Studio and opt-in sight-reading reveal (`projectScoreToFretboard` + `TabNotation`, including range selection); Aerophone monophonic fingering view (`projectScoreToAerophone`); piano LH/RH sight-reading guidance (`projectScoreToPiano`). Theory/scales retain the existing interactive fretboard because a pitch-set reference is more useful there than linear TAB. MPC groove mapping moves with Phase 4 sample kits/sequencer.                                                                                                                                                                                                                                                                                                                                                                                                                        | ✅ framework-agnostic `InstrumentProjection` helpers + shared renderers                                                                                                                   | notation, projection, tunings, score-follower                                 | 3     |
| ✅ **MPC sample kits** (auto-map, plug-and-play) — **BUILT** (`@repo/music-core/engines/sample-kit`: Banks A-D / MIDI 36-99 auto-map + assignment model, two-layer soft/hard velocity layers, choke groups, sample rename/delete editing, `SampleKitStore` OPFS persistence, XPM 2.1 directory/ZIP export with velocity layer slots + mute groups, `SampleKitPlaybackController` velocity-based playback + same-group stop behavior, bank-switching `SampleKitPanel` in `/music/studio`, hybrid sample/synth sequencing + MIDI audition; no DB migration). ⏳ Deferred: physical MPC One+ verification and bank-aware pad-LED behavior (see handoff checklist). Future polish: waveform trim/fade editing.                                                                                                                                                                                                                                                                           | ✅ `sample-kit` engine + persistence + export + Studio wiring                                                                                                                             | sound (`loadDrumKit`/`stopDrum`), sequencer, store/OPFS                       | 4     |
| ✅ **Piano-roll / multitrack / export** — **BUILT**. Export: `midi-export` (`scoreToMidiFile`/`scoreToMidiBlob` via `@tonejs/midi`, Export MIDI on `/music/studio` + `/music/songs/[id]` + recorded takes via `recording.takeToScore`); `audio-export` (`renderEventsToWav`/`encodeWav` offline-render via `OfflineAudioContext` → 16-bit PCM WAV, Export WAV on `/music/studio`). Editor: **`/music/piano-roll`** — pitch×time grid over the canonical `Score`, dynamic voices (add/remove tracks via `addVoice`/`removeVoice`), per-track mute + clear, note-length selector, velocity lane/control (`setVoiceVelocity`), horizontal visual zoom, explicit Resize mode for dragging note ends (`resizeNoteAt`), and continuous bar expansion via `buildPianoRollGrid()` plus route-level **Add bar**. Playback + MIDI/WAV export reuse `scoreToPattern`/`midi-export`/`audio-export`; persists across reloads; track colours from theme `--chart-*` tokens. | ✅ MIDI + audio export + piano-roll engines                                                                                                                                               | recording, sequencer, transport                                               | 4     |
| ◑ **Pad-color sync** (app ↔ hardware LEDs) — **PROTOCOL CAPTURED** (`4a4d752`): reverse-engineered the real MPC One+ controller-mode SysEx by tracing MPC 3's CoreMIDI output (local `docs/tools/run-mpc-usb-trace.sh`). Product id is **`0x56`**; pad color is `F0 47 7F 56 65 00 04 [pad] [R] [G] [B] F7` (RGB 7-bit) — named swatches decode cleanly (fire `3F 00 00`, lime `04 3F 00`, midnight `00 08 3F`, apricot `3F 22 00`). Also captured: `52` heartbeat (~1/sec) + `62` enter-mode handshake. Replaced the disproven `0x3B` ping/pong guess. `pad-color` engine + Connect diagnostic (init+heartbeat / light pad / rainbow / all-off, user-driven) shipped with full gates. ⏳ Remaining: confirm the browser→hardware WebMIDI path lights real pads (preview Chromium has no Web MIDI).                                                                                                                                            | ✅ `pad-color` captured protocol + `MidiEngine.send` + Connect diagnostic; ⏳ on-device browser confirmation                                                                              | midi (output enum/raw messages), device-profiles (capability), semantic-color | 4     |
| ✅ **Jam backing tracks** (`/music/jam`) — **BUILT**: `@repo/music-core/engines/backing-track` owns generated progression playback and audio-backed selections; `/music/jam` wires bundled jazz drum tracks plus generated chord backing through the shared transport playback source and `BrowserBackingPlayer`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  | ✅ `backing-track` playback engine                                                                                                                                                         | jam, sound, transport, jazz                                                   | 4     |
| ◑ **Active Transcription Trainer** (`/music/transcribe`) — **BASIC PITCH EXTRACTOR + PLAYBACK + SCORE FOLLOWER BUILT**: `@repo/music-core/engines/transcription` parses manual note rows into draft notes, adapts second-based extractor notes via `extractedNotesToDraft()` with default cleanup (low-confidence/short-speck filtering, chronological sorting, and nearby same-pitch fragment merging), and turns drafts into canonical `Score`s with `origin:"audio-transcription"`; route attaches source audio metadata, runs the default browser-local `@spotify/basic-pitch` extractor or an injected extractor, previews/summarizes the draft, registers generated-score playback with the shared `MusicRuntime` transport via `scoreToPattern()`, exposes direct Preview transcription playback, starts a wait-mode `ScorePracticeSession` over the generated score through the shared input router, and saves to repertoire. The browser adapter patches bundled model/shard URLs, resamples audio to 22.05 kHz mono, and build verification emits both model assets. ⏳ Remaining: manual real-audio validation and threshold tuning.                                                                                                              | ✅ `@spotify/basic-pitch` runtime + `transcription` scaffold + extractor adapter + transport playback + score-practice wiring + release gates; ⏳ real-audio validation                                  | import (audio), sound, transport, score-follower, song-library                | 5     |
| ✅ **AI Practice Coach** (`/music/coach`) — **BUILT**: local deterministic `coach` projection over Skill Graph, Analytics weak spots, Progress, and Sessions; route shows focus, rationale signals, and a short routine by reusing `daily-routine`. No external AI/API dependency.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              | ✅ `coach`                                                                                                                                                                                | skills, analytics, progress, sessions, daily-routine                          | 5     |
| ✅ **Adaptive ear-training progression + curriculum spine** (`/music/learn/ear`) — **RESEARCHED + CHROMATIC DEGREE LEVELS + FREE-PLAY + POCKET + VOICE + MELODY DICTATION + SCORED REPERTOIRE TRANSFER BUILT**: mixed ear sessions now pass `queueMode:"adaptive"` into `EarTrainingSession`; the engine consumes scheduler order so weakness/review/new priorities are preserved while rotating interval, chord-quality, and scale-degree drills to avoid back-to-back drill repeats. Product/curriculum research sets the path as tonic-first functional scale-degree learning: anchor tonic, build diatonic degrees, sing/play targets, transfer into melodies, add chromatic color, then attach harmony/interval vocabulary. `@repo/music-core/engines/ear-training` exports the current capability map and learning path projection; `scale-degree-recognition` exports explicit degree sets (Anchor, Major pentachord, Major diatonic, Minor diatonic, Chromatic color, Current full set), sessions filter scale-degree queues to the selected set, prompts narrow answer choices to that set, and `/music/learn/ear` surfaces the level selector plus an unscored C-tonic drone/free-play warmup using shared `SoundEngine` drone/playback. The skill graph and exercises now include b2 and #4 chromatic colors. Pocket listening mode uses `EarTrainingSession.answerListening()` to record heard/missed self-assessments through the same Exercise pipeline. Focused Scale Degree sessions support Voice mode through `AudioPitchSource` → `MusicRuntime.router` → `EarTrainingSession` with `audio` input only. Focused Melody Dictation sessions play short tonic-relative phrases from the selected degree set, including Chromatic color, and grade MIDI/on-screen play-back in order with partial credit. Repertoire transfer projects saved-song melody phrases into scale-degree cards with Tone preview and scored play-back dictation via `createRepertoireTransferExercise()`; `buildRepertoireReviewQueue()` ranks phrases across saved songs, `buildRepertoireReviewPlan()` groups them into warmup/review/new/stretch blocks, and `buildRepertoireReviewPlanSchedule()` lets `/music/learn/ear` run the whole plan as one multi-prompt transfer session. Focused verification passed for the new exercise, ear-training session, curriculum, route, and recursive check gates. | ✅ `ear-training` adaptive queue planner + ✅ curriculum projection + ✅ learning-path UI + ✅ chromatic degree-set levels + ✅ drone/free-play warmup + ✅ pocket mode + ✅ voice mode + ✅ melody dictation + ✅ scored repertoire-transfer dictation + ✅ repertoire review plan session                | exercise scheduler, analytics, skills, audio-in, sound, song-library          | 5     |
| ✅ **Guitar/uke chord verification + scored open chord ID** — **EXPECTED-TARGET CORE + MIC UX BUILT**: `@repo/music-core/engines/chord-verification` compares accumulated MIDI/on-screen/monophonic notes against the selected target chord tones by pitch class and reports matched/missing/extra tones, coverage, score, and correctness. `/music/play/chord-perfect` includes a verifier panel alongside the per-string drill and a mic verifier that starts `AudioPitchSource`, routes audio `noteOn` events through `InputRouter`, and reuses the same target-matching engine. The buffered `Strum & identify` panel records one strum, runs Basic Pitch + `chord-id/identifyChord()`, then scores the result through `createOpenChordIdentificationExercise()` so XP/mastery/analytics/journal advance for `technique.strings.open-chord-id` and the guitar/uke child skill. This remains buffered analyze-on-demand, not live open polyphonic recognition. ⏳ Remaining: real guitar/uke validation and threshold tuning. | ✅ `chord-verification` + ✅ `chord-id` + ✅ scored open-ID exercise + audio capture UX; ⏳ physical validation                                                                            | audio-in, chord-perfect, chord-id, tunings                                    | 5     |
| ✅ **Personal daily challenges** (`/music/progress`) — **BUILT**: `@repo/music-core/engines/challenges` projects non-competitive daily practice goals from existing Progress, Sessions, Analytics, and Skill Graph state: daily XP, weak-skill reps, capability variety, and streak continuity, plus a neutral weekly summary. No leagues.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            | ✅ `challenges` projection + Progress page wiring                                                                                                                                          | progress, sessions, analytics, skills                                         | 5     |

> **Guardrails for these:** the engine is the unit of work — each ships
> framework-agnostic with unit tests before any page. `audio-in` unblocks the
> most (Tuner, Intonation, Technique drills, and later verification), so it's the
> highest-leverage missing engine. The Aerophone visualizer that §6 lists under
> Phase 2 is **already built** (§T1.5b) ahead of schedule.
>
> **Status (shipped):** `audio-in` is **built** —
> `packages/music-core/src/engines/audio-in` includes the pure MPM pitch
> detector, tuner helpers, and an adaptive RMS onset detector, plus a thin
> AudioWorklet capture layer emitting `TunerReading`, audio-source
> `NoteOnEvent`, and `OnsetEvent`. Tuner, Intonation / Drone, Aerophone CC
> analysis, and microphone-driven rhythm timing are live. The onset path gates
> events until the scored start timestamp so the app's count-in cannot complete
> the exercise through speaker-to-microphone bleed. Physical microphone and
> acoustic-instrument calibration remains a deferred manual verification item.

---

## 5E. JAZZ PACK & CROSS-INSTRUMENT INTEGRATION

Source: Julian Bradley's "Ultimate Guide to Jazz Piano" pack (JT1–JT18). The goal
was to fold the pack's lessons/drills/theory into the app's existing
capability-first, instrument-agnostic architecture rather than build a silo, and
to honour the "play it on multiple instruments" rule (generalize what can be
generalized; pin what can't).

**Shipped (✅ DONE):**

- **Jazz content engine** `@repo/music-core/engines/jazz` — chord vocabulary
  (JT2/JT3), chord→scale map (JT4), voicing recipes (`realizeVoicing`,
  `realizeDominantVoicing`, `realizeUpperStructure`; shell/rootless A-B, JT6-12),
  the 12-key ii-V-I drill, 29 licks with playable MIDI phrases
  (`LICK_PHRASES`/`lickTimeline`, JT5), improv techniques, repertoire (JT13),
  backing-track catalogue (JT14-18), and the curriculum/lesson-path projection.
- **Library** extended with the jazz chord/scale vocabulary + `chordVoicings`
  (root/inversions/drop-2). **Jam** extended with minor ii-V-i.
- **Shared `InstrumentView`** (`src/routes/music/_components/`) — one pitch-set →
  per-instrument display (piano keyboard / fretboard / Aerophone arpeggio).
  Consumed by the chord library, jazz voicings, scales reference.
- **Chord library redesign** — instrument toggle + computed voicings/inversions
  (replaced the fixed guitar/uke chart pair).
- **Graded ii-V-I drill** `/music/play/voicings` — input-scored on any instrument
  via `ExerciseRunHost` → XP + `harmony.ii-v-i`; **Major + Minor (JT7) variants**;
  Aerophone graded on the arpeggio. Engines: `exercises/voicing-drill`,
  `engines/voicing-drill-session` (`buildDrillVoicings`).
- **Jazz Path** `/music/learn/path` — the ordered curriculum, deep-linking real
  tools, progress derived from live skill mastery (`buildJazzLessonPath`).
- **Applicability primitive** `domain/applicability.ts` —
  `VIEWABLE_INSTRUMENTS`, `isMonophonic`, `ContentApplicability`,
  `instrumentsForApplicability`, `degradesToArpeggio`. One source of truth;
  content carries its own `applies` tag (e.g. `CurriculumLesson.applies`).
- **Backing tracks** — JT14-18 MP3s served from `static/audio/jazz/` (gitignored),
  wired as the default backing on `/music/jam` via a `builtin` backing kind.

**Nice-to-haves (open backlog):**

### J1 — Lick & voicing transcription fidelity pass ⏸ DEFERRED

> Gated on having the original JT5 sheet to compare against note-for-note — defer
> until that's to hand. The optional LH-comping-under-licks half can be done
> independently of the sheet, but is parked here with the fidelity pass.

- The 29 lick phrases in `LICK_PHRASES` were transcribed from the JT5 renders to
  be correct over the changes and faithful to each lick's documented
  scale/technique — they have **not** been verified note-for-note against the
  sheet. Do a pass against JT5 and correct any wrong pitches/rhythms (each lick is
  a plain `[midi, beats][]` array, so fixes are one-line).
- Lick playback is **melody-only**. Add optional left-hand comping under the line
  (rootless voicing per chord of `lick.progression`) so the lick is heard in
  context. Small: reuse `realizeVoicing` + the existing scheduling in the licks
  tab.
- Acceptance: spot-check ~5 licks against JT5; comping toggle on the licks tab
  plays melody + chords.

### J2 — Jazz drills in the Daily Routine rotation

- The graded voicing drill (`drill` session) is standalone. Fold it (and the
  ear/reading jazz steps) into the **Daily Routine runner** (§5C-P2) so a routine
  can include "ii-V-I voicings · 12 keys" as a step that threads one
  `daily-routine` session and rolls up XP/accuracy.
- Depends on P2 existing. When P2 lands, register the voicing drill as a
  routine-eligible drill keyed to `harmony.ii-v-i`, instrument-aware (arpeggio
  fallback on Aerophone). Acceptance: a daily routine can include the ii-V-I
  drill and its result lands in the combined routine summary + moves mastery.

### J3 — Upper-structure & altered voicings as a graded drill ✅ DONE

> Built: the graded `/music/play/voicings` route now has a third **Altered V7**
> variant. The core jazz engine exposes `buildAlteredDominantVoicings()` and
> `DrillVariant` now includes `altered`; the variant cycles V7b9, V7alt, and a
> favorite II-major upper-structure voicing across the 12-key cycle. It reuses
> the existing `VoicingDrillSession` pipeline, instrument-aware chord/arpeggio
> grading, XP, mastery, and journal capture.

- The advanced V7 voicings (JT10-12, `DOMINANT_VOICINGS`/`UPPER_STRUCTURES`) are
  no longer reference-only for the primary favorite upper-structure path.
  Additional upper-structure choices remain reference material in `/music/learn/jazz`.
  Acceptance: a third drill variant grades upper-structure voicings over V7
  across 12 keys.

### J4 — Real chord-input grading polish ✅ DONE

> Built: the voicing drill now supports **held-together (strict) grading** —
> `gradeHeld` in `exercises/voicing-drill` replays the noteOn/noteOff stream and
> credits the best overlap while notes are _physically held_ (taps that never
> overlap don't count), threaded via `VoicingTarget.strict` /
> `VoicingDrillSession({ strict })`. The route adds a **Grading** toggle (Lenient
> ⇄ Held; hidden on monophonic instruments) and an **Auto-advance** toggle
> (default on) that moves to the next chord the instant the target is matched —
> no manual "Check" (a "Skip chord" button remains). Auto-advance defers its
> match check to a microtask so the exercise host has processed the event first.
> Lenient stays the default/beginner mode (on-screen friendly). +3 grading tests.

- _(Original task below.)_ The drill grades the **set of played pitch classes**
  over the run window (lenient: extras tolerated, no timing/simultaneity
  requirement). Optional upgrade: require the notes to be held _together_ (true
  chord detection via held-note tracking) and/or auto-advance when the target is
  matched, removing the manual "Check". Keep the lenient mode as a beginner
  setting.

### J5 — Minor-key chord/scale coverage in the library ✅ DONE

> Audited: the full minor ii-V-i vocabulary is browsable in the chord library —
> m7b5, dim7, mMaj7, **and the previously-missing Cm6** (added; tonic-minor i),
> plus V7alt — and the minor scales (locrian, altered, melodic minor, both
> diminished modes) are all present and project cleanly. The chord→scale map
> covers the `m7b5`/`dim7`/`mMaj7`/`min6` families. Verified across instruments via
> `InstrumentView` (Cm6 arpeggiates on Aerophone; Locrian renders on the guitar
> fretboard; dim7's `Bbb` displays without error). Library test covers the minor
> vocabulary's presence + clean projection.

- _(Original task below.)_ The chord library + chord→scale map lean major. Confirm
  minor-ii-V-i coverage (m7b5 → altered/diminished → mMaj7/m6) reads cleanly in
  the library and Jazz Path, and that the minor scales (locrian, altered, melodic
  minor, diminished) all render across instruments.

---

## 6. Later phases (build seams now, implement later)

Keep these in mind so Phase 0–1 interfaces don't block them, but do **not** implement yet.

- **Phase 2 — Instrument Intelligence:** `@app/audio-in` (AudioWorklet + pitchy/pitchfinder, monophonic), tuner, audio path in the Input Router, Intonation/Drone trainer, and instrument-specific drills (guitar/uke spider + per-string Chord-Perfect, piano two-hand independence, Aerophone breath/articulation via CC analysis, MPC rudiments). Add `OnsetEvent` production from audio.
  - **Aerophone fingering visualizer (from live use):** build an **SVG representation of the Roland Aerophone** and **highlight the keys to play from incoming MIDI** (Roland practice-app style) — drives both free-play feedback and the per-instrument drills above. Pairs with the Aerophone breath/articulation CC analysis. The runtime drills seeded as data in **T1.5e** plug in here.
  - The tuner and intonation/drone UI consume the **semantic color system from T1.5d** (sharp/flat/in-tune), not hardcoded colors.
- **Phase 3 — Song Studio ("One Score, Many Projections"):** ◑ IN PROGRESS.
  MIDI, uncompressed MusicXML, and compressed `.mxl` import into the canonical `Score` through
  public `@repo/music-core/engines/score-import`. MusicXML source is retained
  for lazy OSMD engraving; MIDI/generated scores continue through shared
  VexFlow. Saved scores open at `/music/songs/[id]` with tempo-aware preview,
  wait-mode score following, on-screen/MIDI input, and practice logging.
  `score-practice` now derives measure/note-group boundaries and validated
  whole-score, multi-section, and custom half-open ranges as rebased canonical
  segments. Its `ScorePracticeSession` expands sequence/per-section queues,
  isolates followers per take, drives time-based performance progress, and
  projects weighted take/section summaries. Transport events now expose
  monotonic scheduled timestamps, and `MusicRuntime.runCountIn()` returns the
  first practice downbeat with idempotent practice-clock cleanup. Remaining:
  the shared notation-selection contract normalizes renderer hit targets, beat
  ranges, and row overlays; both VexFlow and OSMD now expose direct measure or
  note-group selection through it. `/music/songs/[id]` now composes the complete
  setup and lifecycle: Wait/Performance, whole/multi-section/custom selection,
  Sequence/Per Section finite takes, monotonic count-ins, timers, cleanup,
  summaries, and one structured journal capture. Playwright now verifies MIDI
  and MusicXML import-to-practice flows, direct custom range selection,
  zero-count-in two-take Performance, persistence, and 375px document
  containment for both renderers. Song Studio now also groups MusicXML voices
  by source part (while leaving MIDI voices individually selectable), projects
  the selected voices into one canonical score subset, and filters a temporary
  copy of the original MusicXML for OSMD. The filtered score drives notation,
  preview, practice planning, grading, counts, and on-screen input without
  mutating persistence. Guitar/ukulele scores now project to VexFlow TAB in
  Song Studio and sight-reading, Aerophone scores project to a monophonic
  fingering line, and piano sight-reading projects each canonical source note
  to a left/right-hand hint using semantic voice roles with a register fallback.
  The current baseline is 617 unit/component tests, production build, both
  domain harnesses, and the 5-test reading Playwright workflow. Remaining:
  deferred manual/hardware verification. MPC groove mapping moves with Phase 4
  sample-kit/sequencer work.
  - **Preview playback restart semantics — ✅ FIXED:** `SoundEngine.playPattern`
    owns a dedicated pattern synth and replaces its previous schedule on every
    call. Repeated Song Studio `Play preview` clicks restart the score instead
    of layering playback; direct input, samplers, metronome, and drone use
    independent voices. Recursive check, 606 unit/component tests, production
    build, the 4-test Song Studio/import workflow, and all 45 Playwright tests
    pass.
  - **Voice/part selection — ✅ BUILT:** the canonical
    `filterScoreVoices(score, voiceIds)` projection filters voices, notes, and
    rests without mutating the score or removing global score lanes. Song Studio
    exposes session-local controls, groups MusicXML voices by source part, and
    uses the filtered score for notation, preview, practice planning, grading,
    counts, and on-screen input. `filterMusicXmlParts(xml, partIds)` gives OSMD
    a filtered temporary source while preserving the persisted original.
    Focused core/route coverage, the MusicXML part-selection E2E workflow, 609
    unit/component tests, production build, both domain harnesses, and all 46
    Playwright tests pass.
  - **Compressed MusicXML (`.mxl`) — ✅ BUILT:**
    1. ✅ Added a browser-safe `extractCompressedMusicXml(ArrayBuffer)` helper in
       `score-import`. Resolve the score path from
       `META-INF/container.xml`; if the container is absent, fall back to the
       first non-`META-INF` `.musicxml`/`.xml` entry. Reject malformed archives,
       missing score entries, and unsafe archive paths with stable messages.
    2. ✅ Extended `/music/import` to accept `.mxl`, extract its MusicXML, parse it
       through the existing canonical parser, and persist the extracted XML as
       the existing `{ format: "musicxml" }` source. Song Studio rendering and
       storage schemas remain unchanged.
    3. ✅ Covered the extractor, route save behavior, and `.mxl`
       import-to-Song Studio flow. Recursive check, 605 unit/component tests,
       production build, both domain harnesses, and all 45 Playwright tests
       pass.
  - **Guitar/ukulele TAB in sight-reading & library — ✅ BUILT where useful:**
    VexFlow TAB is available in Song Studio and as an opt-in reveal in
    sight-reading, derived from the same canonical `Score`. Theory and scales
    keep their interactive fretboard pitch-set reference rather than duplicating
    it with linear TAB.
- **Phase 4 — Creator Tools:** step sequencer + sample kits for MPC pads ✅, MIDI recording (persisted — Dexie local state, not OPFS, since takes are small JSON) ✅, piano-roll + multitrack-lite ✅, export to MIDI/audio ✅ (patterns + songs + recorded takes); Recording & Self-Review; Jam Mode backing tracks. Remaining: physical MPC pad-color protocol verification. Most optional; sequenced last on purpose.
  - **MPC plug-and-play samples (from live use):** **load samples to the MPC** and **auto-assign a sound to each pad** so the user can plug in and play with zero setup (default kit auto-mapped; samples stored in OPFS per §0). Builds on the existing `sequencer`/`sound` (`loadDrumKit`) engines.
  - **Pad-color sync, app ↔ hardware (from live use) — ◑ PROTOCOL CAPTURED, ON-DEVICE BROWSER CONFIRMATION PENDING:** the real protocol was reverse-engineered by tracing MPC 3's CoreMIDI output via a DYLD-interposed disposable copy (local `docs/tools/run-mpc-usb-trace.sh`; hooks `MIDISend`/`MIDISendSysex` + libusb sync wrappers). MPC 3 drives LEDs over **CoreMIDI**, not raw USB — so the browser can replicate it. Verified frames: product **`0x56`**, pad color `F0 47 7F 56 65 00 04 [pad] [R] [G] [B] F7` (RGB 7-bit, channels reach `7F`), `52` heartbeat, `62` enter-mode, plus a captured init handshake replayed verbatim in `mpcControllerInitSysex`. The prior `00/01` ping/pong + `0x3B` assumption was wrong on both counts. Confirmed lighting real pads on the One+ Private port. **Next: wire `kitPadColors` into Studio so the active kit's pads glow (see follow-ups below).**

  **Phase 4 — remaining follow-ups (next up, before Phase 5):**
  - **① Light MPC pads from the Studio kit — ✅ BUILT** (`StudioPadLeds` on `/music/studio`): "Light pads" enables MIDI+SysEx, sends `mpcControllerInitSysex` + starts the `mpcHeartbeatSysex` keep-alive, then pushes `padLayoutSysex(kitPadColors(assignedPads))` (assigned sounds glow green, empty pads dim); re-pushes on kit change while lit; "Pads off" → `padsOffSysex` + clears on teardown; prefers the MPC "Private" output; user-triggered only. 3 component tests; full check/test gates green. ⏳ Confirm the lit colors on the physical MPC One+ (same browser path the Connect diagnostic already proved).
  - **② Polish the piano-roll editor — ✅ BUILT.** Velocity lane/control, horizontal zoom, drag-resize note ends, add/remove tracks, and continuous bar rendering are built (`setVoiceVelocity`, `resizeNoteAt`, `addVoice`, `removeVoice`, `buildPianoRollGrid`, selected velocity for new notes, active-track lane + bulk apply, visual grid scaling over unchanged `STEP_BEATS`, explicit Resize mode, Add bar).
  - **③ Clear the deferred verifications.** Run `vp run -r build` once the live dev server on :5173 is free (a build rewrites `.svelte-kit` and kills running dev servers), and tap-test the on-screen fretboard pitch mapping in a real browser (the fretboard.js visual click path vs. the unit-tested button layer). Both also tracked in the handoff checklist.
  - **Create cross-surface browser validation — ⏳ DEFERRED:** manually validate `/music/create?mode=beat|piano-roll|recorder` on desktop and 375px mobile; verify refresh/deep-link/back behavior, no horizontal overflow, recorder MIDI take → Piano Roll import add/replace/discard, recorder MIDI take → Song Studio, beat grid → Song Studio, Piano Roll sections rename/resize → Song Studio, and opening the saved Song Studio pages.

- **Phase 5 — Adaptive & AI:** local Practice Coach ✅; Transcription Trainer + Basic Pitch extractor + score-following trainer ✅; adaptive ear-training queue progression + tonic-first curriculum projection + degree-set levels + drone/free-play warmup + voice mode + melody dictation ✅; expected-target chord verification core + mic UX + scored buffered open chord ID ✅; personal daily challenges ✅; remaining: manual Basic Pitch real-audio validation/tuning and physical instrument verification.

---

## 7. Guardrails — do NOT

- Do **not** rewrite or restructure `src/lib/domain/*`; only additive, justified changes.
- Do **not** mutate `SkillMastery` anywhere except through `domain/pipeline.ts` via `@app/skills`.
- Do **not** attempt real-time polyphonic chord detection, or any audio chord recognition in Phase 1.
- Do **not** use `localStorage`/`sessionStorage` for app data (Dexie/OPFS only).
- Do **not** import Svelte into `engines/*` or `domain/*`.
- Do **not** schedule audio/timing with `setInterval`/`setTimeout`/`requestAnimationFrame`; use Tone Transport look-ahead.
- Do **not** add Essentia.js (AGPL-v3) without an explicit licensing decision.
- Do **not** introduce a server/back-end; this is a client-only PWA (keeps user-uploaded content client-side and avoids copyright handling).
- Do **not** hardcode colors; use theme tokens.

---

## 8. How to verify the whole thing (smoke test for the agent)

After Phase 1, this scripted path must work end-to-end in a Chromium browser:

1. Launch PWA, enable audio, open Instrument Hub → connect a MIDI keyboard (or use on-screen).
2. Start a daily session → an Ear Training interval prompt appears.
3. Answer several prompts (some wrong on purpose) via the keyboard.
4. Finish the session → see XP awarded, streak updated, and a journal entry written.
5. Open Skill Tree → the practiced interval skill's mastery has changed and the confusion matrix shows your wrong substitutions.
6. Reload the app offline → all progress persists.

If any step fails, the corresponding engine's tests are insufficient — add them.

---

## 9. First actions for the agent

1. Execute T0.1, commit.
2. Execute T0.2 (drop in domain, wire harnesses), confirm both harnesses print expected output, commit.
3. Proceed through Phase 0 in order, running gates after each ticket.
4. Then Phase 1 in order. Open a short note listing any domain-model friction encountered (for human review) rather than editing the model unilaterally.
