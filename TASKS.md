# Tasks

The builder keeps this file current. Sections: Needs the owner · In progress · Done · Dropped (with reason) · Needs hardware · Decisions made.

## Needs the owner

(nothing yet)

## In progress

Phase 2, drills and hubs (parallel, one agent per area):

- Ear training (7 drills), note reading and sight-reading, rhythm
- Piano and jazz: two-hand, comping (new route), voicings, licks, chord-scales
- Guitar and ukulele: fretboard (spider, positions, note finder, interval recall), chords (build, pick, strum and identify, changes), strum a progression
- MPC pads (rudiments, grooves), Aerophone (4 modes), Connect
- Library (songs, reference, import, transcribe), Song Studio, Jam, Practice Lab
- Create (beat grid, sample kits, MPC kit export, piano roll), Record, Tuner, Settings, Guide

## Done

- Domain contract and IO boundary in `packages/music-core` (types, MIDI parsing, device profiles and pad maps, MPC Controller Mode frames, input router)
- Theory, content generators and the drill catalog (90 tests; the two-hand and voicing generators reproduce the verified JSON exactly; every emitted skill id exists in the seed)
- Scoring engines (110 tests), including an order-following scale grader so a late start or tempo drift costs only the notes actually missed
- Progress engine: mastery with decay, analytics, scheduler, rewards, coach, the one routine builder, learning paths, journal projections (50 tests)
- Signal analysis and formats: McLeod pitch detection with the measured settings, high-pass, onsets, chroma, known-target note gate, monophonic transcription, calibration, MIDI and MusicXML/MXL, MPC kit export, WAV, backups (99 tests; the pitch fixtures reproduce the 0.85 cliff: at 0.9 hum flips A2 to A1 in 14 of 40 frames, at 0.8 a weak fundamental flips up)
- Browser runtime: Dexie (with a proxy-safe write path), OPFS, settings, Tone audio engine (look-ahead scheduling, lights follow audio), Web MIDI with SysEx fallback, auto re-enable on load and the MPC link owned by the app shell, microphone worklet, QWERTY maps, the single input router (9 tests)
- Notation: VexFlow staff and tab, waterfall, Aerophone fingering row, one cursor, start/end range selection (16 tests)
- Shell: layout, practice strip, command palette, focus mode, piano, fretboard, pads, Aerophone keys, drill shell, results, practice recorder
- Hubs: Today, Drills, Paths, Progress (what next, skills, sessions), Journal
- Scales drill, verified in the browser through on-screen input in Practice and Check (clean check: 100%, independent evidence, personal best, ladder)

## Dropped

## Needs hardware

## Decisions made

### Architecture

- **Domain package** `packages/music-core` (`@repo/music-core`), framework-free TypeScript. Import paths are `@repo/music-core` (types and note helpers) and `@repo/music-core/<folder>/<module>` for everything else. Folders: `theory/`, `data/` (the verified JSON from `context/data`, copied verbatim, plus `data/index.ts` typed exports), `content/` (prompt and target generators), `scoring/`, `progress/`, `signal/`, `io/`.
- **Browser runtime** lives in `src/lib/music/` (Svelte 5 runes, `.svelte.ts`): `runtime/` (storage, audio, MIDI, microphone, the practice recorder), `components/` (surfaces, notation, shell pieces), `drills/` (per-drill stage components when a route file would get too big).
- **Routes** (the old paths are not kept; the app is new):
  - `/music` Today (hero: today's plan), `?tab=drills`, `?tab=paths`
  - Ear: `/music/ear/[drill]` for intervals, chord-qualities, cadences, scale-degrees, melody-dictation, repertoire-transfer, mixed
  - `/music/reading`, `/music/rhythm`
  - Piano: `/music/scales`, `/music/two-hand`, `/music/comping`, `/music/voicings`, `/music/licks`, `/music/chord-scales`
  - Guitar and ukulele: `/music/fretboard` (spider, positions, note finder, interval recall), `/music/chords` (build, pick, strum and identify, changes), `/music/strum` (progression through the microphone)
  - `/music/pads` (MPC rudiments and grooves), `/music/aerophone`
  - `/music/lab` (free play), `/music/jam`
  - `/music/library` (`?tab=songs|reference|import`), `/music/songs/[id]` (Song Studio)
  - `/music/create` (`?mode=beat|roll`), `/music/record`
  - `/music/progress` (`?view=next|skills|sessions`), `/music/journal`
  - `/music/connect`, `/music/tuner` (`?mode=tune|intonation|drone`), `/music/settings`, `/music/guide`
- **Libraries**: Tone.js for audio scheduling, the sampled piano and synth voices (its Transport look-ahead is the "lights follow audio" clock); VexFlow 5 for staff and tab engraving from the canonical score (MusicXML is parsed into the canonical score by our own parser, so OSMD is not needed); `@tonejs/midi` for MIDI file read and write; Dexie for IndexedDB; JSZip for `.mxl`, kit ZIPs and full backups; pitch detection is our own McLeod implementation (the settings in `context/03` are measured against it).
- **Storage**: Dexie database `woodshed` (new name; there is no old data to migrate on this branch) with the ten catalog tables plus `midiTakes` (catalog weakness 12: MIDI takes now persist and are in backups). Binaries in OPFS. No localStorage for app data; the only localStorage use is the nav rail collapse flag.

### Product and scoring

- **Name**: the app is called **Woodshed** (jazz slang for practising alone). Nav and titles use it; routes stay under `/music`.
- **Every graded drill has Practice and Check.** Practice shows targets and records `guided`; Check hides targets and hints and records `independent`; a hint in Practice records `hinted`; Demo is never a run. This closes catalog weakness 2, so the `guided-accepted` workaround on path steps is removed (those steps now require independent evidence like every other step).
- **XP**: the catalog formula paid about 18 XP for a wrong answer (open question R31). XP now scales with the work: `round(5 + partialCredit × 35 + difficulty × partialCredit × 20 + improvement × 25)`. A wrong answer earns 5, a perfect hard answer 60 plus improvement. Level stays `floor(xp / 250) + 1`. Mastery is untouched by this.
- **Tempo ladder**: two consecutive clean runs at or above the current rung promote it (the curriculum's stated rule; the old code promoted on one). Step, base, ceiling and never-drop are unchanged.
- **Streak**: forgiving by default, one freeze granted per week of practice (cap 2), shown as a week calendar, never a flame that resets.
- **Comping** gets its own route (catalog weakness 3), so path steps P-I4 and P-A1 open it.
- The four "stored but unused" settings now do something (catalog weakness 1): reduce motion is applied app-wide, instrument colour coding switches the hue identity, echo cancellation and the input device are passed to `getUserMedia`.

### Design

- **Direction: the lit bench.** The one bold element is the instrument, drawn as material on a dark stage panel that stays dark in both themes (ivory and ebony keys under a felt strip in the instrument hue, a rosewood neck with nickel frets and thickening strings, rubber pads with LEDs, the Aerophone key layout). The stage carries one spotlight in the instrument hue; the chrome around it is quiet.
- **Palette**: a cool mist page (light) or deep plum ink (dark), white or plum surfaces, and ten identity hues (piano brass, guitar coral, ukulele lime, MPC magenta, Aerophone teal, voice and ear violet, reading sky, rhythm green, create periwinkle). Hue means identity only; judgement is success/warn/destructive plus a glyph or a sentence. Tone roles (chord/scale/avoid) and hands have fixed colours plus a form marker (fill, ring, dashed).
- **Type**: Outfit for titles and big numbers, the system sans for reading, tabular numerals for readouts (no monospace labels).
- **Layout**: a left rail on desktop (collapsible, remembered), a bottom tab bar with More on phones, a sticky practice strip (instrument, metronome, tempo, count-in, beat dots, input source, search). A running drill hides the rail, the tab bar and the site header and footer.
- **Drills**: one shell. Setup collapses to a one-line summary with "Change setup"; the stage shows the target before Start in Practice; Practice and Check are a two-way toggle; "Hear it first" is the demo and is removed in Check; Space starts, Esc stops; one `role=status` line per page. Results lead with one sentence and a big number, then the delta vs the last run with the same setup, a breakdown with "Not measured" rows, XP, the tempo ladder where relevant, and a next step. A clean Check or a personal best gets a bloom and a short chime.
- **Today**: the set drawn as a strip of blocks sized by minutes and coloured by what you will play, then the numbered steps, one primary Start, and a side column with the streak as a week calendar (freezes shown as dashed), the coach's honest note and today's challenges.
- **Rendering**: the music app is client-only (`ssr = false` in `src/routes/music/+layout.ts`) because everything it shows lives in IndexedDB.
