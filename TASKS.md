# Tasks

The builder keeps this file current. Sections: Needs the owner · In progress · Done · Dropped (with reason) · Needs hardware · Decisions made.

## Needs the owner

(nothing yet)

## In progress

Phase 1, domain and runtime foundation (parallel):

- A. `packages/music-core` theory, typed data index, content generators, drill catalog
- B. `packages/music-core` scoring engines
- C. `packages/music-core` progress engine (mastery, analytics, scheduler, rewards, coach, routine, paths, journal)
- D. `packages/music-core` signal analysis and file formats (MPM, filters, onsets, chroma, note gate, transcription, calibration, MIDI file, MusicXML, MPC kit, WAV, backup)
- E. `src/lib/music/runtime` browser runtime (Dexie, audio engine, Web MIDI + MPC link, microphone)
- Shell: design tokens, layout, instrument surfaces, drill shell (builder)

## Done

- `packages/music-core/src/types.ts`: the shared domain contract (events, scoring, skills, sessions, canonical score, devices, settings)
- `packages/music-core/src/io`: MIDI parsing, device profiles and pad maps, MPC Controller Mode frames, input router, with tests

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
