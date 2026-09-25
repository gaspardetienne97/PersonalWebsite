# Unified Web-Based Musical Practice & Production App — Implementation Plan

*A single SvelteKit app, built on shared engines, that lets you connect any instrument (guitar, ukulele, jazz piano, Roland Aerophone, MPC One Plus) and practice ear training, note reading, rhythm, scales, improvisation, chords, transcription, and production — with uploaded songs playable on every instrument.*

---

## TL;DR

- **One app, shared engines.** Everything is built on a small set of reusable TypeScript engines — a theory engine (Tonal.js), a MIDI engine (WEBMIDI.js), an audio/DSP engine (Web Audio + AudioWorklet), a transport/timing engine and sound engine (Tone.js), a generic exercise/scoring framework, and a progress/gamification layer. Every feature module is a thin consumer of these engines, so adding a module is cheap.
- **Organized by capability, rendered per instrument.** The app is structured around musicianship *capabilities* (pitch, rhythm, harmony, fretboard/keyboard geography, technique, ear, repertoire, groove) rather than one silo per instrument; each capability renders differently depending on the instrument in your hands. This is what lets one jazz-piano session reinforce guitar voicings, ukulele reductions, and Aerophone guide tones. It also fills the real market gap — tools like Yousician, Melodics, EarMaster, Soundslice, and Chordify each solve a fragment; the opportunity is one coherent practice environment.
- **MIDI-first input, audio fallback.** MPC One Plus, Roland Aerophone, and MIDI keyboards come in over MIDI — reliable and low-latency. Guitar and ukulele use microphone/interface audio with real-time **monophonic** pitch detection. An input router picks the best available source per instrument and exposes the same normalized note stream to every exercise.
- **The hard problem, named.** Real-time **polyphonic chord detection** from a strummed guitar/uke is not reliably solvable in the browser today. The plan designs around it: monophonic detection for single notes, *expected-target* matching for chord practice, and offline transcription (Spotify basic-pitch) for "record-and-analyze."
- **Upload a song, practice it on every instrument.** MIDI and MusicXML files parse into one canonical Score that is *projected* onto piano, guitar/uke (diagrams + tab), winds (melody line), and drums (pad grid) — with wait-mode and performance-mode play-along scoring. Audio files are transcribed offline.
- **Broad but coherent feature set.** Chord library, ear training, **note reading (flashcards + sight-reading)**, rhythm, **scales/technique**, **instrument-specific drills**, **improv/jam mode**, **active transcription**, drum/production-lite, **recording & self-review**, **intonation/drone**, and a **practice journal** — all sharing the same engines and one XP/streak gamification layer.
- **Ship as a PWA first; treat Tauri/Electron as a later wrapper.** Web MIDI works today in Chrome/Edge/Firefox 108+ on the desktop where you actually plug instruments in — **not Safari or iOS**. A Chromium-browser PWA is the simplest primary target. A desktop shell is a low-regret deferral (same SvelteKit code), but note the trap below: **Tauri does not bundle Chromium**, so on macOS it inherits Safari's missing Web MIDI — a desktop shell that needs Mac MIDI should use native Rust MIDI (`midir`) or Electron, not assume Web MIDI. See §6.

---

## 1. Shared Architecture — the core engines

The whole app rests on framework-agnostic TypeScript modules under `src/lib/engines`, using Svelte 5 runes for reactive state where they touch the UI, so they stay unit-testable and reusable across every instrument module.

1. **Core Music Model (`@app/theory`)** — wraps **Tonal.js**. Canonical `Note` / `Interval` / `Chord` / `Scale` / `Key` types and the single source of truth for note ↔ MIDI ↔ frequency conversion, transposition, chord spelling and voicings, and scale-degree/functional analysis. Everything else depends on it.
2. **MIDI Engine (`@app/midi`)** — wraps **WEBMIDI.js v3**. Device enumeration + hot-plug, permission flow, and normalization of all input into a unified `NoteEvent` stream `{ type, midiNote, velocity, timestamp, channel, source }`. Device profiles for the MPC pad banks, Aerophone breath-CC, and generic keyboards.
3. **Audio Input / DSP Engine (`@app/audio-in`)** — `getUserMedia` → `AudioContext` → **AudioWorklet** running pitch detection off the main thread. Monophonic path emits the *same* `NoteEvent` shape so downstream code never cares whether a note came from MIDI or audio. Polyphonic paths (clearly labeled experimental/offline) live here too.
4. **Input Router (`@app/input-router`)** — the "auto-detect the most reliable source, prefer MIDI" seam. If a MIDI device is connected and sending, use it; else fall back to audio detection; else the on-screen keyboard. Exposes a confidence signal and the active source to the UI. This single seam is what lets guitar/uke use audio while piano/Aerophone/MPC use MIDI, transparently to every exercise.
5. **Transport / Timing Engine (`@app/transport`)** — wraps the **Tone.js** Transport: BPM, time signature, look-ahead-scheduled metronome, count-in, loop points, and a quantization grid. All playback and all rhythmic scoring reference Transport time for sample accuracy (look-ahead scheduling against the audio clock — never `setInterval`).
6. **Sound Engine (`@app/sound`)** — Tone.js synths, `Tone.Sampler` and `Tone.Players` for MPC-style one-shots and pitched samples, plus a small piano/SoundFont set for prompt playback. Manages the `Tone.start()` user-gesture requirement.
7. **Notation Engine (`@app/notation`)** — renders staves, single-note prompts, generated melodies, and full scores. **VexFlow first** — it handles all the early needs (flashcards, generated notation, sight-reading) on its own. **OSMD is introduced later, only when MusicXML import and the play-along cursor are needed** (it's fundamentally a MusicXML renderer, so there's no reason to take on its weight in Phase 1). Shared by Note Reading, Sight-reading, and File Import.
8. **File Ingestion (`@app/import`)** — detects file type and parses uploads into the canonical Score model: **@tonejs/midi** for `.mid`, **OSMD** for MusicXML (`.xml`/`.mxl`), **Spotify basic-pitch** (offline) for audio, optional **abcjs** for ABC.
9. **Exercise & Scoring Framework (`@app/exercise`)** — the reusable heart of all training. A generic `Exercise` interface — `generate(params) → prompt`, `accept(inputEvents) → result`, `score(result) → { correct, latencyMs, accuracyCents, timingMs }` — plus an **adaptive-difficulty controller**, an **SM-2-style spaced-repetition scheduler**, and an **interleaving mode** that rotates between trouble spots rather than only blocked repetition (interleaved practice transfers better than long single-item blocks). Each exercise declares the **Skill Graph nodes it exercises**, so every `ScoringEvent` is tagged with the skills it touched. Because input is normalized, the same exercise works whether answered by clicking, by MIDI, or by audio.
10. **Score-Follower (`@app/follower`)** — a specialized exercise type used by Sight-reading and File Play-Along. A playhead advances through a Score; incoming notes are matched to the expected notes at the current position and scored on pitch + timing (reusing rhythm-scoring). Supports **wait mode** (pause until correct) and **performance mode** (fixed tempo, accuracy %).
11. **Skill Graph (`@app/skills`)** — the canonical model of musicianship as a directed graph of `Skill` nodes, each belonging to one **Capability** (an explicit enum: Pitch, Rhythm, Harmony, Reading, Technique, EarTraining, Improvisation, Repertoire, Production). Relationships are typed (prerequisite/component/related). Crucially, **the Skill Graph owns mastery** — it holds each skill's `SkillMastery { mastery, confidence, decayRate, lastPracticed }` and is the single source of truth for "how good am I at X." Every exercise contributes to specific nodes, so ear training, reading, technique, and song practice all advance *the same* graph that progression, recommendations, the AI coach, achievements, and routines read from.
12. **Analytics & Adaptation Engine (`@app/analytics`)** — consumes every `ScoringEvent` and **computes `LearningEvidence` that it submits to the Skill Graph** (it does not own mastery — it produces the evidence; the graph folds it in). It maintains the derived per-user model — reaction time, an **interval/chord confusion matrix**, scale fluency, chord-switch speed, consistency — and its purpose is **adaptation, not dashboards**: when it detects, say, minor 6ths missed 43% of the time, it weights the scheduler toward minor-6th items. This personalized skill modeling is the real long-term moat.
13. **Progress / Gamification (`@app/progress`)** — a presentation layer over the Skill Graph: one XP currency that feeds streaks, levels, skill-tree unlocks, daily challenges, and achievements, all derived from real mastery gains so the gamification never feels disconnected from actual skill.
14. **Persistence (`@app/store`)** — **IndexedDB** (via Dexie/idb) for structured state: progress, skill-graph mastery, analytics, exercise/spaced-repetition state, the personal chord and song libraries, drum patterns/projects, and the **canonical `PracticeSession` records** (the container that ties exercises, scoring events, journal notes, tags, and XP together — and makes queries like "all sessions where I practiced ii–V–I" or "this week's rhythm practice vs last week" possible). **OPFS (Origin Private File System)** for large binary assets — recordings/takes, cached waveforms, imported audio/score files, and ML models. A PWA service worker handles offline precaching.

**Design rule:** build engines 1–6, 9, and 11 (theory, MIDI, audio, input router, transport, sound, exercise framework, and the Skill Graph) as standalone, tested modules *before* any feature UI. That discipline — and especially anchoring everything to the Skill Graph early — is what makes the multi-module, multi-instrument reuse cheap and keeps progression coherent.

---

## 2. Feature Modules

Each module is a consumer of the engines above. New modules added in this revision are marked **(new)**.

These modules are deliberately **capability-first, not instrument-first**: each one is a musicianship capability (harmony, ear, rhythm, reading, technique, repertoire, groove) that renders and scores differently per connected instrument, rather than a separate course for each instrument. The same Ear Training, Note Reading, or Scales module serves piano, guitar, uke, and Aerophone through the shared engines — which is exactly what keeps a multi-instrument app from fragmenting into silos.

- **Instrument Connection / Input Hub** — connected-device cards with live status, the active-input-source indicator, per-device setup (MPC pad-bank mapping, Aerophone breath sensitivity, mic/interface picker with level meter and tuner), and a capability banner that explains Web MIDI limitations and offers fallbacks on Safari/iOS.
- **Chord & Theory Library** — searchable cross-instrument chord/scale browser. For any chord: notes & intervals (Tonal), guitar & ukulele diagrams (**SVGuitar**) with multiple voicings, a piano voicing on a keyboard component, audible playback, and "add to my library."
- **Ear Training** — interval recognition, chord quality & inversion ID, chord-progression/cadence ID, scale/mode ID, **functional scale-degree training in a key context**, melodic dictation, and relative/perfect-pitch drills. Answer by clicking, by playing the connected instrument, or by singing. Adaptive difficulty + spaced repetition.
- **Note Reading (new)** — two sub-modes that connect the page to the instrument:
  - *Note-ID flashcards*: a note or small cluster appears on a staff; you name it or **play it** on your connected instrument (answer-by-play closes the read → locate → play loop via the input router).
  - *Sight-reading*: scrolling generated melodies played in tempo — this is the Score-Follower fed by procedurally generated exercises rather than uploaded files; wait-mode and performance-mode both apply.
  - Key design point: alongside the staff, **highlight where the note lives on the chosen instrument** (fret/string, piano key, or Aerophone fingering). Progression is per-clef (treble, bass for the left hand, guitar's octave-treble), through landmark notes, ledger lines, key signatures, and accidentals, with spaced repetition. Reuses the notation, theory, exercise, and input-router engines almost entirely.
- **Rhythm Training** — metronome (subdivisions, accents, tap-tempo), rhythm dictation, and play-along scoring that compares input timestamps to the Transport grid and reports timing error in ms with ahead/behind feedback. Works from pads, Aerophone, keyboard, or mic onset detection.
- **Scales, Arpeggios & Technique Trainer (new)** — play scales/modes/arpeggios on the connected instrument to a target tempo, scored for note accuracy and evenness, with **tempo-progression** ("clean at 100 bpm → unlock 110"). Reuses theory + transport + scoring + input router. A basic (MIDI-instrument) version ships early; string-instrument support follows audio input.
- **Instrument-Specific Drills (new)** — technique and fluency drills tailored per instrument (guitar/uke spider & chord drills, piano two-hand independence, Aerophone breath/articulation, MPC rudiments, and more). Mostly data-driven content on the shared engines. See §4 for the full catalogue.
- **Score / File Import & Play-Along (new)** — upload a song and practice it on any instrument. See §3 for the full design.
- **Improv / "Jam Mode" (new)** — generate chord-progression backing tracks (ii–V–I, blues, modal vamps), highlight the target scale/chord tones per chord, and record your solo over the track. Reuses Transport, Sound, theory, and recording. High-motivation and on-genre for jazz/indie playing.
- **Active Transcription Trainer (new)** — the concrete form of "identify melodies and chords by ear": load or clip audio, loop and slow down a phrase, and transcribe it note-by-note, with basic-pitch as an optional hint and your playing/clicks as the answer. Reuses the audio engine, basic-pitch, Score-Follower, and theory engine.
- **Drum / Production-lite** — a **step sequencer** (`Tone.Sequence`) for MPC-style pads with per-pad sample/velocity/swing and pattern chaining; a **piano-roll** for melodic MIDI; multitrack-lite with per-track volume/pan/mute; **MIDI recording** from any device; export to MIDI and audio stems. Scoped as DAW-*lite* that complements your DAW/MPC via export and round-trip — not a DAW replacement.
- **Recording & Self-Review (new)** — record any session (MIDI always, audio optional), play it back, compare takes, and view timing/pitch stats from a take. Self-recording is one of the strongest learning tools; mostly reuses the production module's recording + transport.
- **Intonation / Drone Trainer (new)** — a drone plus a live cents meter for holding pitch against a tonic and for practicing scales/modes in tune. Especially valuable for the Aerophone and for singing. Reuses Sound + monophonic detection.
- **Practice Journal / Repertoire / Routines (new)** — log what you practiced per instrument/piece (auto-detected from sessions), set goals, track pieces you're learning, and assemble a **daily routine** that chains exercises across modules into one streak-earning session. Practice logging is among the most evidence-backed drivers of real improvement and gives the streak something meaningful to count. Reuses Progress + IndexedDB.
- **Progress / Gamification** — dashboard with XP, level, streak (with streak-freeze), per-skill mastery, a multi-instrument **skill tree**, daily challenges, and achievement badges. One XP currency feeds everything.

**Optional / advanced**

- **AI Practice Coach** — because artifacts/Claude can be called from the app, an AI coach could assemble and adapt a daily plan from your goals and progress and answer questions like "what should I work on today?" or "how do I voice this chord?" A genuine differentiator; treat as a later, optional layer.
- **Bite-size Theory Reference** — short explainers (intervals, chord construction, modes, functional harmony) backing the ear/reading drills.
- **Latency-Calibration Wizard** — more necessity than feature; measures round-trip latency so scoring is fair across audio vs MIDI input.

---

## 3. Score / File Import & Play-Along (detail)

Once an uploaded file is parsed into the canonical Score model, playback, rendering, and scoring already exist — so this feature is mostly reuse. The only genuinely new pieces are the file parser, the notation renderer (both already engines above), and the Score-Follower.

**Supported inputs**

| Format | Handling | Practice quality |
|---|---|---|
| **MIDI (.mid)** | `@tonejs/midi` → tracks of `{ midi, time, duration, velocity, name }` + control changes, mapped onto the canonical NoteEvent timeline | Best — exact notes & timing |
| **MusicXML (.xml/.mxl)** | **OSMD** renders the score, supplies a playback cursor + `TransposeCalculator`, and can render guitar tablature from the XML | Best for real sheet music |
| **Audio (mp3/wav/flac)** | **Spotify basic-pitch** (offline) transcribes to MIDI; key/chords via Tonal/Essentia | Approximate, offline only — expect transcription errors |
| **ABC** (optional) | `abcjs` | Niche, cheap to add |
| **PDF sheet music** | Out of scope v1 — requires Optical Music Recognition (e.g., Audiveris, server-side). Recommend exporting MusicXML from notation software instead | N/A |

**One Score, many projections — "play it on all instruments."** The parsed Score is projected onto the selected instrument using components already built:

- **Piano** — full notation (OSMD) + piano-roll; melody, chords, or both hands.
- **Guitar / Ukulele** — chord track → SVGuitar diagrams + tab + a suggested strum pattern; melody → single-note tab; auto-fingering, capo, and transpose-into-a-comfortable-key suggestions (Tonal + OSMD `TransposeCalculator`). **alphaTab** is a strong alternative for this projection — it renders tab from MusicXML/Guitar Pro and has built-in WebAudio/Web MIDI playback.
- **Aerophone & other monophonic leads** — the melody line only (winds are monophonic), transposed into range.
- **MPC / Drums** — a percussion track maps onto the pad grid for play-along, or the whole file becomes a backing track to drum over.

**Play-along modes (Score-Follower).** *Wait mode* (Synthesia/Yousician "wait-for-me": playhead pauses until you play the correct note(s) — best for learning) and *performance mode* (fixed tempo, scores pitch accuracy + timing error, ends with an accuracy % and XP). Plus A–B section looping, count-in, and **slow-down practice** — free for MIDI/MusicXML via Transport; for audio it needs a phase-vocoder (`soundtouchjs` or `Tone.GrainPlayer`) to change tempo without dropping pitch.

Everything else is reuse: Transport + Sound play the file back, the theory engine labels key/chords (feeding the Chord Library), the Exercise framework grades the performance, Progress awards XP/streak, and IndexedDB stores imports as a personal song library.

---

## 4. Instrument-Specific Drills

These are technique and fluency drills tailored to each instrument. Architecturally they are **content, not infrastructure**: a drill is a data-driven definition — a generated target pattern + a scoring spec + an instrument projection — registered against the existing Exercise/Scoring framework, Scales/Technique trainer, Transport, and input router. Only four small **analyzers** are new, each plugging into the scoring framework:

- **Expected-target chord verifier** — compares detected pitch classes against a *known* target chord (a tractable verification task, unlike open chord recognition). Powers Chord Perfect, One-Minute Changes, and timed progression switching.
- **Breath / CC-envelope analyzer** — reads the Aerophone's breath CC stream and grades steadiness and envelope shape. Powers long tones, dynamic swells, and articulation.
- **Pitch-bend tracker** — reads pitch-bend messages from the Aerophone's bite sensor. Powers controlled bends, scoops, and falls.
- **Polyrhythm / velocity-consistency scorer** — grades two independent rhythm streams and/or velocity evenness. Powers piano two-hand independence and MPC rudiments.

### Guitar & Ukulele

- **Spider / chromatic permutations** — 1‑2‑3‑4 across strings and frets; variants for finger-order permutations (1‑3‑2‑4, 1‑4‑2‑3…), ascending/descending, string-skipping, and fixed-position vs shifting. Metronome tempo-progression. Scored note-by-note via *monophonic* detection (reliable — one note at a time).
- **Chord Perfect (placement check)** — place a chord, then pluck each string in turn; each plucked note is checked against the expected chord tone (per-string monophonic = tractable).
- **One-Minute Changes** — count clean changes between two chords in 60 s via expected-target matching; report changes/min and trend over time.
- **Timed progression switching** — switch chords on the beat through a progression; scored on timing + chord correctness.
- **Supporting drills** — strumming & fingerpicking pattern trainer (rhythm engine + onset detection), fretboard note-finder ("play every C" / "name this note"), pentatonic/CAGED box drills, legato (hammer-on/pull-off) and alternate-picking speed.

### Piano

- **Two-hand independence** — contrary-motion scales; hands on different rhythms; **polyrhythms (2:3, 3:4)** graded per-hand by the polyrhythm scorer; LH comping + RH melody.
- **Hanon-style finger evenness** — scored on timing *and* velocity consistency (MIDI).
- **Jazz voicing drills** — shell and rootless ii‑V‑I voicings through all 12 keys (theory engine generates the targets).
- **Supporting drills** — scales/arpeggios in all keys (hands together/separate/contrary motion), interval & octave-leap accuracy, trills/ornaments, five-finger patterns.

### Roland Aerophone

Leverages clean monophonic MIDI plus breath CC and bite/pitch-bend, so expression is directly measurable:

- **Long tones / breath steadiness** — hold a note with even breath pressure; the breath-CC envelope is graded for steadiness.
- **Dynamic swells (messa di voce)** — pp → ff → pp smoothly; scored on breath-curve shape and smoothness.
- **Articulation / tonguing** — staccato vs legato and tonguing-speed drills (note-on rate + gap analysis).
- **Bite / pitch-bend control** — controlled scoops, falls, and bends to a target pitch.
- **Supporting drills** — vibrato regularity/depth, register-leap smoothness, fingering scales/arpeggios/chromatics.

### MPC pads & cross-instrument

- **Drum rudiments** — single strokes, double strokes, paradiddles, flams on the velocity/pressure-sensitive pads; scored on timing + velocity consistency. The percussive analog of the spider exercise, with tempo-progression.
- **Polyrhythm / limb-independence trainer** — reusable beyond piano.
- **Dynamics / velocity control** — for keyboard and pads.

**Where it fits.** Technique and monophonic drills (spider, Hanon, scales, Aerophone breath/articulation, MPC rudiments) land in **Phase 2 (Instrument Intelligence)** alongside audio input. Chord-based guitar/uke drills (Chord Perfect, One-Minute Changes, progression switching) depend on expected-target matching and land in **Phase 5** — except the per-string Chord Perfect check, which is monophonic and can ship in Phase 2.

**Honest limit.** "Does every string ring?" is best verified by plucking strings individually rather than parsing a full strum; one-minute-changes counting via audio works best with expected-target matching and may want a confirm-tap in noisy rooms.

---

## 5. Tech Stack

| Concern | Recommendation | Rationale / tradeoff |
|---|---|---|
| Framework | **SvelteKit + TypeScript**, Svelte 5 runes | Your preference; runes give fine-grained reactivity and `.svelte.ts` shared state for engines |
| Theory | **Tonal.js** | Mature, TS, functional, tiny, MIT; canonical |
| MIDI | **WEBMIDI.js v3** | Friendly events, TS types, per-channel objects; far less error-prone than raw Web MIDI |
| Audio framework / timing | **Tone.js** | Transport, samplers, sequencers, look-ahead scheduling out of the box |
| Monophonic pitch | **Pitchy (MPM)** primary, **Pitchfinder (YIN)** fallback, in an **AudioWorklet** (WASM if needed) | Real-time, accurate (~±2 cents), lightweight |
| Polyphonic / transcription | **Essentia.js** (near-real-time, *experimental* triad hints) + **Spotify basic-pitch** (offline clip → MIDI) | Honest about limits; reserve full transcription for offline. **Licensing: Essentia.js is AGPL-v3** — review before any closed-source/commercial build; basic-pitch (Apache-2.0) is safer for that case |
| Chord diagrams | **SVGuitar** (guitar/uke) + custom Svelte piano keyboard | SVG, themeable, maintained |
| Drill analyzers | Custom, on the scoring framework: expected-target chord verifier, breath/CC-envelope analyzer, pitch-bend tracker, polyrhythm/velocity-consistency scorer | The only new measurement code the instrument drills require |
| Lightweight audio features | **Meyda** (RMS, spectral descriptors, onset cues via Web Audio) | Cheap real-time features for timing/energy feedback before reaching for Essentia; MIT |
| Notation | **VexFlow first** (staves, generated prompts, sight-reading); **OpenSheetMusicDisplay** added later for MusicXML import + play-along cursor + tab; **alphaTab** optional for tab + playback | VexFlow covers Phase 1–2 alone; defer OSMD's weight until song import |
| File parsing | **@tonejs/midi** (MIDI), **OSMD** (MusicXML); **abcjs** (ABC) | Parse uploads into the Score model. *Sequencing tip:* abcjs has built-in playback/MIDI generation, so reach for it first for early drill rendering; add OSMD/VexFlow when you need richer MusicXML import and the play-along cursor |
| Audio slow-down | **soundtouchjs** or **Tone.GrainPlayer** | Tempo change without pitch shift |
| Heavy DSP/ML | **Web Workers + AudioWorklet + WASM**; TensorFlow.js (WebGL/WASM) for basic-pitch | Keep the UI thread free; lazy-load the model |
| Persistence | **IndexedDB** (Dexie/idb) for structured state + **OPFS** for large binaries (recordings, waveforms, imports, models) + PWA service worker | Progress, libraries, projects, recordings offline; OPFS for fast in-place file access |
| Skill Graph & analytics | Custom TypeScript domain model + a confusion-matrix/skill-model store (plain TS, persisted to IndexedDB) | The progression backbone and adaptation moat; no external lib needed |
| Packaging | **PWA first** (Chromium browsers); **Tauri or Electron** later as a desktop wrapper | See §6 — the desktop choice has real MIDI implications |
| Styling | Tailwind or vanilla CSS + design tokens | Supports the two visual themes below |

---

## 6. Deployment & Packaging

The single decision that most shapes the build is **where the app runs**, because it determines how MIDI works.

- **PWA in a Chromium browser (recommended primary target).** Web MIDI is supported in Chrome, Edge, Firefox 108+, Opera, and Samsung Internet — i.e., on the desktop where you actually connect an MPC, Aerophone, or keyboard. It is *not* supported in Safari or any iOS browser. A PWA installs to the dock/taskbar, runs offline (service worker + IndexedDB/OPFS), and is the fastest to ship and iterate. For your real use case — a laptop with instruments plugged in — this covers the scenario and honors the "web tech / Svelte" preference most directly. Always degrade gracefully: detect `navigator.requestMIDIAccess`, and if it's absent fall back to the on-screen keyboard and audio input rather than hard-failing.
- **Electron (heavy but simple cross-platform MIDI).** Electron bundles Chromium on every OS, so Web MIDI works everywhere including macOS. The cost is a large binary and a full browser runtime per app. Choose this for guaranteed Web MIDI on Mac without writing native code.
- **Tauri (light, but mind the MIDI trap).** Tauri is attractive — tiny binaries, Rust backend, the same SvelteKit frontend — but **it does not bundle Chromium**; it uses the OS's native webview (WebView2/Chromium on Windows, WebKitGTK on Linux, and **WKWebView — Safari's WebKit — on macOS**). Because WebKit doesn't implement Web MIDI, a Tauri app on a Mac has *no* `navigator.requestMIDIAccess`. The correct Tauri pattern is to do MIDI **natively in Rust** (the `midir` crate) and emit note events to the frontend over Tauri's IPC — which is actually more robust and lower-latency than Web MIDI, but is real extra work, not a drop-in. So Tauri is a fine long-term target *if* you budget for native Rust MIDI; it is not a free fix for the Web MIDI gap.

**Low-regret path:** build as a PWA now (the SvelteKit frontend is identical under any shell) and defer the desktop decision. If you later wrap it, pick Electron for least effort or Tauri for the smallest/most-native result with a native-MIDI bridge. Audio input (getUserMedia + AudioWorklet) and OPFS/IndexedDB behave consistently across all three, so only the MIDI layer is sensitive to this choice.

---

## 7. Phased Roadmap

The phases are named by the capability layer they unlock, and each one is independently usable — you have a real product after Phase 1, not after the whole vision exists.

- **Phase 0 — Foundations.** SvelteKit + TS, design tokens, PWA scaffold, IndexedDB/OPFS layer. Build `@app/theory`, `@app/transport` + `@app/sound` (a working metronome proves timing), `@app/midi` (device enumeration + normalized `NoteEvent`), the `@app/notation` scaffold (**VexFlow**), and the on-screen-keyboard fallback. *Deliverable:* connect a keyboard/MPC/Aerophone, see/hear normalized notes, working metronome.
- **Phase 1 — Musicianship OS (the core, fully shippable).** Chord & Theory Library, Ear Training, **Note Reading (flashcards + answer-by-play)**, **Sight-reading on generated melodies (VexFlow only — no OSMD yet)**, Rhythm Training, a basic **Scales/Technique** trainer (MIDI instruments), a lightweight **Practice Journal**, the **Skill Graph + Analytics engines**, and Gamification v1 (XP, streak, skill tree) reading from the graph. Input via MIDI / on-screen / click. This alone is a coherent product competitive with dedicated ear-training/reading apps.
- **Phase 2 — Instrument Intelligence (audio + per-instrument depth).** `@app/audio-in` (AudioWorklet + Pitchy/Pitchfinder), tuner, input arbitration, the **Intonation / Drone** trainer, and the **Instrument-Specific Drills** (guitar/uke spider & monophonic chord-perfect checks, piano two-hand independence, Aerophone breath/articulation, MPC rudiments). Enables guitar/uke single-note work, scales, sung answers, and melody dictation by playing.
- **Phase 3 — Song Studio ("One Score, Many Projections").** **Introduce OSMD** for MusicXML; file parser (`@tonejs/midi`, OSMD), the **Score-Follower** (wait + performance modes), and instrument projections (piano notation, guitar tab, uke shapes, Aerophone melody, MPC groove map) from one canonical Score. Reuses everything from Phases 0–2; the differentiator feature lands here.
- **Phase 4 — Creator Tools.** Step sequencer + sample kits for the MPC pads, MIDI recording, piano-roll, multitrack-lite, export; **Recording & Self-Review**; and **Jam Mode** backing tracks. (See the scope note below — this is the most optional layer, sequenced last on purpose.)
- **Phase 5 — Adaptive & AI.** Offline audio → MIDI via basic-pitch (powers audio-file import and the **Active Transcription Trainer**); Essentia.js experimental real-time chord hints; *expected-target* chord verification for guitar/uke chord practice; advanced ear training (progressions, dictation); the **AI Practice Coach** assembling adaptive routines on top of the Skill Graph + Analytics; richer gamification (leagues, daily challenges).

**A note on scope (the "three products" question).** A reasonable critique is that this plan contains three products: a Musicianship Trainer (Phases 1–2), a Song Practice Platform (Phase 3), and a Production Environment (Phase 4) — and that for a *commercial* product the production layer is the least differentiated and most expensive, so a startup should cut it and focus on the unique value (the Practice OS + One Score Many Projections). That's correct *as venture advice*. It does not apply cleanly here because production (MPC drum creation, sequencing, DAW work) is one of your **explicitly stated personal goals**, not a market bet. The resolution is sequencing, not deletion: the production layer stays in scope but sits last (Phase 4), so the differentiated practice core is built and usable long before you invest in the expensive, less-unique creator tooling — and you can stop after any phase with a complete product.

---

## 8. Key Risks & Mitigations

- **Real-time polyphonic chord detection (highest risk).** Do not promise live strumming recognition. Mitigate with: MIDI-first wherever possible; monophonic detection for single notes; **expected-target matching** for chord practice (compare detected pitch classes against the *known* target chord — a far more tractable verification task); offline basic-pitch for "record & analyze"; and clear "experimental" labeling on any real-time chord output.
- **Audio transcription & notation fidelity.** basic-pitch works best on one clear monophonic instrument; expect errors on dense/polyphonic audio. MusicXML rendering fidelity varies on complex scores. Set expectations: a clean MIDI or MusicXML upload always practices far better than an mp3. PDFs need OMR (out of scope v1) — steer users to MusicXML export.
- **Web MIDI support depends on where the app runs (Safari/iOS gap + the Tauri trap).** Detect `navigator.requestMIDIAccess`; if absent, show a friendly banner, offer the on-screen keyboard and audio paths, and recommend a Chromium browser. Note that a Tauri desktop wrapper does *not* solve this on macOS (its WKWebView is WebKit, no Web MIDI) — see §6 for the PWA / Electron / Tauri-with-native-Rust-MIDI decision. Never hard-fail.
- **Latency & timing.** Use AudioWorklet (not the deprecated main-thread ScriptProcessorNode) for DSP and Tone.js look-ahead scheduling for all playback; set `AudioContext` `latencyHint` and disable `echoCancellation`/`noiseSuppression`/`autoGainControl` on instrument `getUserMedia`. Account for the Aerophone's breath-CC delay (~6–20 ms) and jitter (~10 ms) in rhythm-scoring tolerances. Provide the latency-calibration wizard so scoring is fair.
- **MPC One+ MIDI routing.** Pad MIDI to the browser typically needs a USB-MIDI interface on the MPC's USB-A port or the Akai Network MIDI (Ethernet) driver — the USB-B port is controller-mode only. Provide a setup wizard and verify against the user's firmware.
- **Performance & feature sprawl.** Keep AudioWorklet processors lean; lazy-load TensorFlow.js/basic-pitch only when offline transcription runs; cache models/samples in OPFS. Architecturally, keep new modules as siblings of existing ones (shared engines) rather than new pillars.
- **Library licensing.** **Essentia.js is AGPL-v3** — fine for personal/open-source use, but a real constraint for a closed-source or commercial product; decide early and prefer Apache/MIT alternatives (basic-pitch, Meyda, Pitchy) for anything you want to keep proprietary. Tonal (MIT), Tone.js (MIT), WEBMIDI.js, and OSMD are permissive.
- **Audio-context autoplay.** Gate `Tone.start()`/`AudioContext` behind an explicit user gesture (a "tap to enable audio" splash).
- **Copyright (uploads).** Keeping import, transcription, and storage entirely client-side (IndexedDB, PWA) avoids server-side handling of user-uploaded copyrighted material.

---

## 9. UI/UX

### Screen inventory

Grouped into a clear information architecture so the breadth doesn't sprawl:

- **Top-level:** Home/Dashboard · Progress / Skill Tree · Profile / Settings (incl. latency calibration).
- **Connect:** Instrument Connection Hub.
- **Learn:** Chord & Theory Library · Ear Training · **Note Reading** (flashcards + sight-reading) · Rhythm Trainer · **Scales & Technique** · **Instrument Drills** · (optional Theory Reference).
- **Play:** **Import & Play-Along** (song practice) · **Jam / Improv** (backing tracks) · **Transcription Trainer** · Drum / Production Studio · **Recording & Self-Review** · **Intonation / Drone**.
- **Track:** **Practice Journal / Routines**.

Key screen notes:

1. **Home / Dashboard** — greeting, streak flame, today's XP ring/goal, "continue practice" CTA, daily-challenge card, skill-tree snapshot, recent instruments, today's routine.
2. **Instrument Connection Hub** — device cards with status dots, active-input indicator, per-device setup (MPC pad map, Aerophone sensitivity, mic/interface + level meter + tuner), capability/fallback banner.
3. **Chord & Theory Library** — searchable list/filters; large chord card with notes/intervals; instrument tabs (Guitar/Uke/Piano) rendering SVGuitar diagrams or a piano voicing; voicing variants, play, "add to my library."
4. **Ear Training** — focus mode: prompt, big replay button, answer interface (interval/chord buttons, on-screen keyboard, or "play your instrument"), instant feedback, session progress, XP pops.
5. **Note Reading** — staff prompt with the note's location highlighted on the chosen instrument; flashcard and scrolling-sight-reading sub-modes; clef/key filters; answer-by-play.
6. **Rhythm Trainer** — large beat visualizer, tap-tempo, pattern display, real-time ahead/behind meter, play-along scoreline.
7. **Scales, Technique & Drills** — drill picker grouped by instrument; instrument view (fretboard/keyboard/wind fingering or MPC pad grid) with the target pattern lit up; tempo-progression target with a "tempo unlocked" indicator; live readouts per drill type (note accuracy & evenness, changes-per-minute for chord switching, breath-steadiness curve for the Aerophone, velocity consistency for rudiments).
8. **Import & Play-Along** — drop zone; parsed preview (notation/piano-roll + detected key/tempo/chords); instrument-projection tabs (Piano/Guitar/Uke/Wind/Drums); practice controls (tempo slider, A–B loop, wait-mode toggle, count-in); live accuracy HUD with XP on completion; "my imported songs" list.
9. **Jam / Improv** — progression/style picker, backing-track transport, the active chord with target scale/chord tones highlighted on the instrument view, record-solo button.
10. **Transcription Trainer** — waveform with loop/slow-down, transcribe-by-playing input, optional basic-pitch hint overlay, your-vs-detected comparison.
11. **Drum / Production Studio** — step-sequencer grid (pad rows × steps), transport bar, pad/sample browser, piano-roll tab, multitrack lanes, mixer strip, record, export.
12. **Recording & Self-Review** — take list, playback, take comparison, timing/pitch stats.
13. **Intonation / Drone** — drone controls, large cents meter, hold-the-pitch and scale-in-tune drills.
14. **Practice Journal / Routines** — session log per instrument/piece, goals, repertoire list, routine builder.
15. **Progress / Skill Tree** — a visualization of the canonical Skill Graph: a multi-instrument node graph with prerequisites and mastery rings, an analytics view (confusion matrix, fluency, chord-switch speed, consistency), achievements wall, streak calendar, and the "what to practice next" recommendations the Analytics engine surfaces.
16. **Profile / Settings** — audio/MIDI prefs, latency calibration, theme toggle, account.

**Navigation:** persistent left sidebar (desktop) / bottom tab bar (mobile) for the top-level groups (Home, Learn, Play, Track, Progress); a global transport/metronome bar docks at the bottom during a session; the active-input indicator stays in the top bar.

### Two visual themes (one component set)

- **Variant A — "Studio Light" (clean-modern dominant).** Light, airy neutral canvas, one confident accent (indigo or teal), generous whitespace, crisp sans-serif (Inter/Geist), soft shadows, rounded-2xl cards. Gamification is restrained: thin XP rings, a small streak chip, quiet badge pills, micro-confetti only on milestones. Feels like a pro tool (Linear/Ableton-clean) that happens to reward you.
- **Variant B — "Neon Arcade" (gamified dominant).** Dark charcoal base with vibrant gradient accents (electric violet → cyan, lime highlights), glowing pads, bold rounded display type for XP/streak/combo numbers, animated progress bars, level-up bursts, and a game-like glowing skill tree. Energetic "one more rep" feel while keeping layouts uncluttered.

**Shared component language:** instrument-aware color coding (each instrument a hue), a reusable "exercise card," consistent diagram components (fretboard/keyboard/staff), the streak-flame + XP-ring motif, and large touch-friendly targets (pads, answer buttons). Both variants share layout and components so they are a token/theme swap, not two apps.

---

## 10. Recommendations

1. **Build the engines first.** Treat `@app/theory`, `@app/midi`, `@app/transport`, `@app/sound`, `@app/notation`, and `@app/exercise` as standalone, tested TS modules before any feature UI — this is what makes the broad module set cheap.
2. **Organize by capability, render per instrument.** Build each capability (ear, rhythm, reading, harmony, technique) once on the shared engines and project it onto every instrument, rather than maintaining a separate course per instrument. This is the structural choice that keeps a multi-instrument app coherent.
3. **Ship Phase 0–1 against your MIDI instruments.** A complete, satisfying product (library + ears + reading + rhythm + scales + drills + journal + gamification) with zero dependence on the hard audio problems. *Proceed when* metronome timing feels tight and normalized MIDI flows from keyboard, Aerophone, and MPC.
4. **Enforce the MIDI-first → audio → on-screen hierarchy through the single input router** so every exercise is input-agnostic.
5. **For guitar/uke, ship monophonic detection and expected-target chord verification before any open chord recognition.** Use basic-pitch only for offline "record & transcribe."
6. **Make the Skill Graph canonical and build it early.** Anchor exercises, progression, recommendations, achievements, routines, and the AI coach to one explicit graph of skills with prerequisites and mastery. Without it, gamification and progression eventually drift apart; with it, every module's practice advances one coherent model.
7. **Treat personalized skill modeling — not AI or gamification — as the real moat.** The Analytics engine (confusion matrices, fluency, switch-speed, consistency) should feed the scheduler so the app automatically drills your actual weak spots. This is the differentiator competitors lack.
8. **Keep gamification a thin layer over the Skill Graph,** with streak-freeze and "daily practice = improvement" framing; XP derives from real mastery gains, never bolt-on points.
9. **Build two themes, not two apps.**
10. **Ship as a PWA early** (IndexedDB for state, OPFS for recordings/imports/models) so everything survives offline and the app feels native. **Make the desktop-shell decision consciously** (§6): defer it, and if you wrap, remember Tauri needs native Rust MIDI on Mac while Electron gives Web MIDI everywhere at a heavier cost.
11. **Mind library licensing early** — keep proprietary builds on permissive libraries and treat AGPL (Essentia.js) as a deliberate choice, not a default.
12. **The plan is now detailed enough to stop planning and start designing the domain model.** The next concrete step is the core schemas: `Skill` (graph), `Exercise` definition, `NoteEvent`, `Score` (the projection source), and `Progress`/analytics. Those decisions, not more feature planning, are where the remaining architecture is determined.
13. **Resist sprawl.** Every new module should be a sibling of an existing one (shared engines), not a new pillar.

---

## 11. Caveats

- Browser-support facts are time-sensitive; Web MIDI remained unsupported in Safari/iOS as of late 2025 — re-verify before launch.
- "Flawless real-time chord detection" claims from some commercial apps are marketing; real polyphonic accuracy degrades sharply, and even native apps rely on expected-target matching or cloud/offline processing. Set user expectations accordingly.
- MPC One+ USB-MIDI behavior is based on Akai documentation and community reports for the One/One+ line; verify your exact firmware and whether a USB-MIDI interface or the Network MIDI driver is needed for pad MIDI into the browser.
- Aerophone timing figures come from AE-10-era community testing; your specific model/firmware may differ.
- Specific library versions should be re-checked at implementation time.
- This document specifies UX in enough detail to design mockups; the two variants are starting directions, not final designs.
