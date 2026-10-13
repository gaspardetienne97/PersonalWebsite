# Tasks

The builder keeps this file current. Sections: Needs the owner · In progress · Done · Dropped (with reason) · Needs hardware · Decisions made.

## Needs the owner

(nothing yet)

## In progress

Nothing. The build is complete; what remains is the owner's hardware pass (below).

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
- Ear training: all seven drills with Choice, Play-back, Voice (sung degrees through the microphone), Pocket recall (self-assessed) and Listen along; balanced and adaptive queues; the degree wheel; free-play warmup that writes nothing; confusion list and a retry schedule
- Note reading (flashcards by choice or play, wrong answers shown beside the right one, practise-the-missed) and sight-reading (generated staff, one cursor, wait and keep-time modes, hidden-by-default tab for guitar and ukulele, left/right hand labels)
- Rhythm: pulse (tap button, MIDI, microphone onsets) and read-and-tap for all 11 patterns, with rests, strokes, mutes and chord checks only when pitch was heard
- Piano and jazz: two-hand (all six patterns, Mirror hands measures together over MIDI), comping (new route: blue third over C7, F7, G7 with a Charleston shell), voicings (major, minor, altered, closest chords, guide-tone voice leading, arpeggio on monophonic), licks (all 31, half speed, chunks, loops, practice window, 12-key transposition, fretboard licks), chord-scales (tone roles on the keys you play)
- Guitar and ukulele: fretboard (spider with all 24 orders, positions, note finder, interval recall), chords (build, pick, strum and identify, changes with a clock and pair history), strum a progression through the microphone
- MPC pads (rudiments and grooves, velocity honestly not measured when it can't be, "1 e & a" groove grid, per-voice and per-section results, a status line that says what each hardware note became) and Aerophone (long tone, swell, articulation, interval landing with breath and pitch traces and the fingering)
- Connect: devices with alias, instrument, channel, Ignore vs Remove, pad maps (presets and Learn pads), live activity, the MPC panel (keep linked, lights, rainbow, frames in hex, a blocker line), routing table, microphone check
- Library (songs as object cards, the full chord/scale and jazz reference with deep links, import of MIDI/MusicXML/MXL, monophonic transcription with a note editor), Song Studio (voices, range with Start/End handles, wait and performance, 1 to 8 takes, staff/tab/fingering/waterfall views, per-take and per-section results, no mastery for songs), Jam (tone roles on the instrument, drum/chord backing or your own track, chorus reports), Practice Lab (free capture, takes that persist)
- Create (16-step beat grid, MPC sample kits across banks A to D with velocity layers and choke groups, MPC kit export as ZIP or folder, multitrack piano roll with MIDI and WAV export), Record (MIDI and audio takes, compare, level meter with advice, non-destructive playback gain), Tuner (tune, intonation, drone), Settings (sound, input, tap-along latency calibration, appearance, data backup, full backup, reset), Guide
- Gates on the final tree: format and lint clean, 503 unit tests in 70 files pass, the production build succeeds and runs from `node build`, and 85 end-to-end tests pass against the production build (every hub and drill route at 375 and 1280 in both themes with no overflow and no console errors, a drill on every instrument with fake Web MIDI or synthetic microphone audio, plus the site's existing specs)

### Owner review rounds (2026-09-25)

- Instrument picker icon and hue border; Tuner note rows, drone visual and choice hints in tooltips; Connect colours, collapsed ignored devices, microphone choice, sounding on-screen keys; Settings sound switch, cadence test, section notes as hints, highlighted sidebar; Record louder microphone boost, colours, finer waveform, live playback gain, cursor, MIDI takes laid out like audio takes; Guide colours and pictures, highlighted topic list
- Create: one page where the beat and melodies loop together at one tempo; presets and longer beats; an instrument per melody; a play bar, a fold-out Tracks and song panel, play any track alone, Play groove and Play melodies, melodies picked to hear and see, both grids follow their own playhead; songs saved only on Save (a working copy survives a reload); a library of beats and melodies; preset chord progressions in any key; sample kits on their own page (`/music/create/kits`)
- Song Studio: waterfall beat lines and chord joins, no overlapping boxes, keys in their hand's colour, a steady view picker, back link, metronome to the song's tempo, sections tinted on the score, songs fitted by octaves to guitar or ukulele, songs deleted from the library, MusicXML named as preferred
- Ear training: interval comparison; intervals, qualities and cadences on a grand staff; items picked a few at a time with sets, weaker ones asked more, a wrong answer shown and played beside the right one, the next item or degree level offered once a set feels easy; chords in a key (I to vii° after I, IV, V, I) and progression dictation (chords after I tapped into slots, judged chord by chord), drawn in their key, both answerable by playing the chords and both in the mixed review; four steps added to the ear path
- Ear expansion from research (docs/research/, local): chords in a key and progressions in minor and with sevenths; scales and modes; inversions; bass lines; fine pitch (a cents staircase); spot the wrong note; singing intervals and melodies; rhythm echo and dictation in Rhythm; Studio ears at `/music/listening` (find the boost or cut, boost or cut at matched loudness, level in dB, pan) on noise, drums or a band loop. The Ear Path is 17 steps, the instrument paths gain ear steps and links, a new Studio Ears Path; steps can set their own threshold and minimum difficulty. Then: compression and delay time in Studio ears, 6/8 and swing for rhythm by ear, groove dictation on kick, snare and hat rows, spot the wrong note in phrases from saved songs, a singing tolerance (the right note, 35 or 25 cents); the Drills tab lists every drill in smaller groups, with mode chips that open the mode
- Transcribe: runs in a worker with progress and Cancel (it froze the page before); a polyphonic engine (Basic Pitch) beside the melody one; tempo found from the notes; two hands split at middle C; a sensitivity that only redoes the note picking; MIDI takes from Record become songs; drafts fixed in the piano roll; any saved song's notes edited at `/music/songs/[id]/edit`

### Known gaps

- Two timing tests flake under full-suite load and pass alone: the runtime's synthetic-microphone A3 test, and Record's "MIDI take survives a reload". Studio ears and the cents drill are checked in headless Chromium for flow only; how they sound needs real ears and headphones.

- `svelte-check` reports `expect.element` as unknown in the browser tests (the existing site Header test has the same error): `vite-plus/test` does not pick up `@vitest/browser`'s matcher typings. The tests run and pass; only the typing is missing.
- The site's own `Header.svelte` has a pre-existing type error on `DropdownMenu.Root modal`; it was not touched.

- Scales drill, verified in the browser through on-screen input in Practice and Check (clean check: 100%, independent evidence, personal best, ladder)

## Dropped

- **Microphone input for the guitar licks (30, 31)**: the catalog lists MIDI and on-screen for licks; the fretboard and chord drills own the microphone path.
- **Synchronised dry audio take in the Practice Lab**: audio recording has its own destination (Record); the Lab keeps the MIDI take.
- **Pentatonic boxes and CAGED shapes on ukulele**: the shapes are written for six strings with the root on string 6; folding them onto four strings gives wrong notes. The ukulele gets a one-action "Switch to guitar" instead.
- **A microphone device picker on the Tuner**: the input chosen in Settings is used everywhere.
- **A separate hint button**: see the Hints decision below.
- **Chord following through the microphone as mastery evidence**: the Strum drill records a run with no skills until it has been checked on a real guitar (catalog weakness 7).

## Needs hardware

The owner's checks, grouped by instrument. Everything below passed in the browser with fake MIDI or synthetic audio; none of it has been heard or played on the real thing.

**MPC One+**
- Connect: pick the Private output, press "Keep linked (init + heartbeat)", then check pads arrive on every drill page and still arrive after a full reload.
- Which input carries pad notes and which is the control flood: the tests assume notes on Private and ignore Public. If it is the other way round, Ignore the other port on Connect.
- Whether the loaded program is the Akai Classic map (A01 = 37, A06 = 38) or Chromatic from 36; try "Learn pads" and confirm the select then reads "Learned from this device".
- "Light pad 1 red" and "Test rainbow" light the real pads, rainbow starting at A01.
- Full Level on: results say velocity and accents are not measured. Off: moving-accent bands (accent 0.75 to 1, tap 0.25 to 0.70) and groove accents feel fair.
- Whether the MPC itself is silent in Controller Mode ("Pad sounds" on the Pads page defaults on).
- The exported kit (`<Kit>-mpc.zip` or a folder) loads on the MPC: program and Samples folder picked up, soft/hard layers switch at velocity 80/81, choke groups cut each other.
- Beat grid with real pads at 90 to 140 BPM: sample rows stay in time.
- Background tab for over 5 minutes: Chrome's timer throttling could slow the 1 s heartbeat.

**Piano (MIDI keyboard)**
- Mirror hands: both hands together reads "together N of 8"; staggering by about 80 ms should not count.
- Two-hand dynamics: a louder melody hand scores, a flat touch does not.
- Comping: a struck shell (left-hand notes within 100 ms), and whether the swung and-of-two feels right at 84 to 104 BPM.
- Strict voicings with sustain pedal or rolled chords (judged 70 ms after all notes are down).
- Lick timing "on time within min(180 ms, beat/4)" at real tempos.
- Song Studio performance counts (early, on time, late) look plausible; the wait-mode cursor follows.
- Record: a real take records the right durations; Save to Song Studio and Open in piano roll look right.

**Guitar and ukulele (microphone)**
- Tuner: low E2 and A2 read steadily with no octave flips, and the cents agree with a trusted tuner; the nearest-string highlight follows, including high-G ukulele.
- Spider and Positions by microphone: one note per beat detected cleanly on low strings.
- Build and Pick by microphone: each plucked string ticks its target; strings left ringing do not add extras.
- Strum and identify: strum C, G, D, Em, Am, F (and ukulele C, F, G, Am). Watch the chroma threshold 0.5, the -50 dB silence floor and the -45 dB trigger; the chord should be named and all its tones heard.
- Changes by microphone: one strum reads as one cluster, a 350 ms pause splits chords, changes per minute is plausible.
- Strum a progression at 96 BPM on G-D-Em-C: how many chords are followed, and whether metronome clicks leak into the mic as onsets.
- Mic level advice reads "Good level" at normal playing distance; with echo cancellation on and off.
- The curated chord shapes and higher positions are playable and the finger numbers make sense (catalog weakness 6).

**Aerophone AE-10**
- CC 2 breath gives sensible steadiness (the x4 knob) and swell shape; articulation note-offs give a sensible sounding fraction for staccato and legato; the interval-landing drone feels right.
- Fingerings marked best-effort: Bb3, B3, C#4, Eb4, F#4, F#5, G#4, Bb4, C5 (side C).
- Voicings in arpeggio mode.

**Sound (everything; headless tests cannot hear)**
- Sampled Piano loads (needs network the first time) and falls back to Warm Synth until then; each of the six sounds; clicks and accents; the three drones stop without a click; the celebration chime.
- A long song preview never cuts out (compare Sampled Piano and Warm Synth, the old O10), and lit keys stay in step with the sound in every demo.
- Record: a quiet take lifted +6 to +12 dB is audible (O22) and the clip warning is right; takes play after a reload.
- Jam: drum and chord balance, and the chord highlight stays in time over several choruses; an imported MP3 backing track plays and loops.

**Calibration and backups**
- Microphone calibration with real claps or muted strings; per-device offsets on the keyboard, MPC and Aerophone; the output latency Chrome reports (diagnostic only).
- A full backup restore that includes real takes and kit samples.

## Decisions made

### Architecture

- **Domain package** `packages/music-core` (`@repo/music-core`), framework-free TypeScript. Import paths are `@repo/music-core` (types and note helpers) and `@repo/music-core/<folder>/<module>` for everything else. Folders: `theory/`, `data/` (the verified JSON from `context/data`, copied verbatim, plus `data/index.ts` typed exports), `content/` (prompt and target generators), `scoring/`, `progress/`, `signal/`, `io/`.
- **Browser runtime** lives in `src/lib/music/` (Svelte 5 runes, `.svelte.ts`): `runtime/` (storage, audio, MIDI, microphone, the practice recorder), `components/` (surfaces, notation, shell pieces), `drills/` (per-drill stage components when a route file would get too big).
- **Routes** (the old paths are not kept; the app is new):
  - `/music` Today (hero: today's plan), `?tab=drills`, `?tab=paths`
  - Ear: `/music/ear/[drill]` for intervals, interval-compare, chord-qualities, cadences, chord-functions, progressions, scale-degrees, melody-dictation, repertoire-transfer, mixed
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
- **Transcription engine**: Spotify's Basic Pitch (`@spotify/basic-pitch`, Apache-2.0, with `@tensorflow/tfjs` 3.21) for "Chords and parts". It hears several notes at once on any instrument, which the monophonic McLeod path cannot, and it runs in the browser from a 900 KB model. It runs in a module worker (WebGL when the worker can have it, else the CPU), so a whole song never blocks the page; the worker bundle (1.5 MB) loads only when someone transcribes. The McLeod transcriber stays as "One melody line". A full band mix still comes out rough; the Import copy says so and points to MusicXML or MIDI.
- **Storage**: Dexie database `woodshed` (new name; there is no old data to migrate on this branch) with the ten catalog tables plus `midiTakes` (catalog weakness 12: MIDI takes now persist and are in backups). Binaries in OPFS. No localStorage for app data; the only localStorage use is the nav rail collapse flag.

### Product and scoring

- **Name**: the app is called **Woodshed** (jazz slang for practising alone). Nav and titles use it; routes stay under `/music`.
- **Every graded drill has Practice and Check.** Practice shows targets and records `guided`; Check hides targets and hints and records `independent`; a hint in Practice records `hinted`; Demo is never a run. This closes catalog weakness 2, so the `guided-accepted` workaround on path steps is removed (those steps now require independent evidence like every other step).
- **Hints**: Practice mode is the hint (every target shown, recorded `guided`); Check shows nothing and offers no reveal, so a Check result always means unaided. `hinted` stays in the model for drills with a genuine mid-run reveal; none of the rebuilt drills needed one.
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

### Found in the verified data (not changed)

- `jazz.json` `CHORD_SCALE_MAP`: the m7b5 row labelled "Locrian #2" has `scale: "altered"`, a different scale. There is no Locrian #2 kind in `scales.json` to point it at and no drill uses the row, so the reference view shows the label and the data is left as is.
- `review-21/curriculum.md` P2 says the alternative D4 G4 B4 moves 7 semitones; it moves 6, a tie with B3 D4 G4. Ties go to the lower placement, which gives the table's answer.
- The skill graph has no ukulele interval-recall skill, so ukulele interval recall records runs without skills and says so.

### Choices made where the context was silent

- Pick mode (Chord-Perfect): one string per click after the count-in, graded on the chord's notes plus evenness.
- Minor ii-V-i: the iiø7 rootless voicing is b3 b5 b7 1 (a natural 9, E over Dm7b5 in C minor, clashes with the key's Eb).
- Every rudiment records under `technique.mpc.single-strokes`, because the MPC path's paradiddle and sixteenth steps read that id.
- Chord-scale drill: G7 in the major set takes the map's go-to, lydian dominant.
- A beat in every score is a quarter note (6/8 = 3 beats a bar).
- Aerophone swell shape and smoothness formulas, the intonation trainer's steadiness, and the pulse score's matched/beats factor are documented in their modules as tuning knobs, not measurements.

