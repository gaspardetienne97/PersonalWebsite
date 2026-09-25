# 13 · Hub references: how music apps present library, studio, progress, devices, tuner, settings and help

Round 5 research, 2026-09-04. Same method as [10-visual-references.md](10-visual-references.md): real App Store screens through the iTunes lookup API (`references/<app>--ipad-N.jpg`, `--iphone-N.jpg` where the app has no iPad set) and Playwright captures of public sites (`references/web--<site>.png`). The "before" state of our seven pages is in `docs/screenshots/ui-pass/before/hubs-round5/`.

## 1. The board

| Page | App (files) | What it does well | What to borrow |
|---|---|---|---|
| Library | **forScore** (`forscore--ipad-1..6`) | The score is the object: a metadata sheet per piece (title, composer, genre, tags, rating, difficulty, duration, tempo, key), setlists, audio and MIDI attached to the piece. | One record per song with musical metadata and everything attached to it; setlists as the "path" of a library. |
| Library | **MuseScore** (`musescore--ipad-1..6`, `web--musescore-sheetmusic`) | Sheet music opens straight into a reader with a moving cursor and a settings gear; the library is a grid of covers with title, composer, instrument. | A song card that opens into practice, not into a form; covers as hue plates with key and instrument. |
| Library | **Soundslice** (`web--soundslice-features`, round 4) | Practice lists rank what to work on. | The repertoire shelf ordered by what is stale. |
| Create | **Koala Sampler** (`koala-sampler--ipad-1..6`) | Sample / Sequence / Perform tabs; pads as coloured tiles with the waveform drawn on them; three big knobs; hardware feel without skeuomorphic chrome. | Pads that show their content; one bold panel colour per section; controls that read as a device. |
| Create | **Ableton Note** (`ableton-note--ipad-1..6`) | Step grid with one accent colour per kit, the row label on the left, the playhead across the top, note-length picker as a column, transport at the bottom. | Row labels and a playhead in the grid; kit colour drives the step colour; transport in one fixed strip. |
| Create | **GarageBand** (`garageband--ipad-1..6`) | Transport, ruler and track view share one strip; the instrument surface fills the rest. | The transport strip and the ruler above the grid or roll. |
| Progress | **Duolingo** (`duolingo--ipad-1..8`) | A thin progress bar and one counter at the top of every screen; streak as a calendar; leagues we do not copy. | The header strip that always says where you are; the streak calendar as a real month. |
| Progress | **Strava** (`strava--iphone-1..10`) | Weekly bars of activity, a map as the hero, "your top sports" as round chips. | Weekly practice bars; recent instruments as round chips with the instrument hue. |
| Progress | **Modacity** (`modacity--ipad-1..8`, `web--modacity-home`) | A practice timer as the hero with concentric rings, recording under it, a quote; goals and streaks in the tracker. | Concentric rings for today's goal; a quiet single-purpose hero. |
| Progress | **Melodics** (`melodics-iphone--iphone-1..6`, round 4) | Results by band, personal best. | Personal best beside every stat. |
| Tuner | **GuitarTuna** (`guitartuna--ipad-1..9`, `web--guitartuna-home`) | A headstock with six pegs; the target string lights; a needle with a "Tune up" hint; dark grid stage; tuning name and Auto toggle in the header. | Per-string pegs for guitar and ukulele; the direction hint ("tune up"); a grid stage with one green target. |
| Tuner | **TonalEnergy** (`tonalenergy-tuner--ipad-1..5`, `web--tonalenergy-home`) | Big note name, cents readout, an arc of neighbouring notes, a green face when in tune; analysis tab with a pitch trace over time; tabs Tuner / Sound / Analysis / Metro / Prefs. | The arc gauge with neighbours; the analysis view is our Intonation mode; a large readout in a display face. |
| Tuner | **Fender Tune** (`fender-tune--ipad-1..9`) | Concentric grey rings, one instruction ("Pluck a string"), six string chips, a row of dots showing closeness. | Ring backdrop; one instruction line before sound arrives; string chips. |
| Connect | Ableton Note, GarageBand (device sheets); Roland Aerophone app (round 4, `docs/superpowers`) | Device rows with a status dot, a signal meter that moves when you play, a single "set up" checklist. | Status LEDs, live signal, a setup checklist that says what is ready. |
| Settings | iOS Settings, Spotify, forScore prefs | Grouped rows, one control per row, the value on the right, a footnote under the group. | Grouped rows with `@repo/ui` controls instead of native inputs. |
| Guide | Duolingo onboarding, Ableton Note tips | A checklist that reflects real state, then short cards. | A live setup checklist (audio, device, first drill) instead of static steps. |

## 2. What the good ones share

1. **The object is the card.** A song, a kit, a device, a string: each is one card with its state on it (key, tempo, last practised, connected, in tune). Our Library and Connect show forms and lists around the object instead.
2. **One hero per page.** Tuner: the needle. Progress: today's ring. Create: the grid. Connect: the device list with a signal. Ours put every section at the same weight.
3. **Hardware where sound happens.** Koala, Note and GarageBand draw the studio as a panel; tuners draw a dark grid stage. Our Create page is white cards; our Tuner stage is right but the readout is small.
4. **Tabs live in the URL and the header.** Every reference app keeps its mode in the top strip; ours mixes URL-backed tabs (Create), read-only tabs (Library) and local state (Tuner).
5. **Settings are grouped rows, never a form.** One control per row, the value visible, footnotes below.
6. **Help is a checklist that knows what you did.** Not a wall of cards.

## 3. What we will not copy

- Leagues, hearts, gems, paywalls (Duolingo, GuitarTuna). Single user, no information.
- Marketing gradients as page backgrounds (Modacity). The stage carries colour, the chrome stays neutral.
- Skeuomorphic knobs and wood panels in chrome (GarageBand). Depth belongs to the stage and the instruments, as decided in round 4.
- A metadata sheet with twelve fields per song (forScore). We keep title, key, tempo, instrument, source, last practised, mastery.

## 4. Findings on our pages (from the survey and the before screenshots)

- Library sub-views nest a second `PracticeScreen` and a second `<title>`; `subtitle` strings are dead because the sub-headers are `compact`; tabs never write back to the URL; the reference tab logged a console error under load ("Cannot read properties of undefined (reading 'call')"), to be reproduced during the build.
- Create panels overflow the phone (piano roll 746 px wide at 375); three section heading styles across the hubs; native `<select>` and `<input type=range>` in Connect, Settings and the recorder.
- Progress is titled "Dashboard & Skill Tree" under a nav item called "Progress"; every stat sits at the same weight; the 14-day strip is a row of numbers.
- Connect still says "(Phase 2)"; the setup state (audio, MIDI, microphone) is spread over three pages.
- Tuner modes are local state; A4 reference shows in Drone mode where it does nothing; the note readout is small.
- Guide has no unit test and does not know what the user has already done.
- `LIBRARY_ITEMS` and `CREATE_ITEMS` in the catalog are used only by the command palette.

Files: 76 App Store screenshots and 8 web captures added to `references/` (146 files, 68 MB total). Sources: iTunes lookup API for ids 527588389 (GuitarTuna), 497716362 (TonalEnergy), 1107017950 (Fender Tune), 363738376 (forScore), 1449584007 (Koala), 1633243177 (Ableton Note), 408709785 (GarageBand), 570060128 (Duolingo), 835731296 (MuseScore), 426826309 (Strava), 1351617981 (Modacity), 6504540940 (Melodics), 1016751878 (Piano Marvel); public pages tonalenergy.com, forscore.co, koalasampler.com, ableton.com/en/note, modacity.co, musescore.com/sheetmusic, yousician.com/guitartuna, duolingo.com.
