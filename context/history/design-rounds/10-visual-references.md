# 10 · Visual references: what makes a music training app look like one

Round 4 research, 2026-09-04. Real screens, not marketing copy: App Store screenshots pulled through the iTunes lookup API (`references/<app>--ipad-N.jpg`, up to six per app) and Playwright captures of the public web UIs (`references/web--<site>.png`, plus `--full` for the whole page). Prior research on structure and behaviour lives in [01-research.md](01-research.md) and [ux-research.md](ux-research.md); this document is about look, feel and the shape of the drill screen.

## 1. The board

| App | Screens | What it does well | What to borrow |
|---|---|---|---|
| **Sonofield Ear Trainer** (`sonofield-ear-trainer--ipad-1..6`) | Guided path (Path of the Sun, Path of the Moon), Degrees, Melodies, Voice, Pocket | Near-black background, one glowing answer wheel: the scale degrees sit on a circle of fifths, each degree with its own colour, the answer swells with a soft bloom. The path is a plain list of levels naming the degrees each adds ("1 3", "1 3 5", "1 2 3 5"), with three-gem difficulty markers. Nothing else on the screen. | The degree wheel as the scale-degree answer surface; colour bound to musical meaning (degree, not correctness); one target per screen; a path that states what each step adds. |
| **ChordBank** (`chordbank-learn-guitar-chords--ipad-1..6`) | Chords, Lessons, Drills and Games | Warm wood and paper: a circle-of-fifths chord wheel, a realistic vertical fretboard with fret numbers, finger dots labelled with the finger and the note, and a "1st fret · 2 chords / 2nd fret · 1 chord" list of voicings grouped by position. | One position at a time with fret-position grouping; finger number plus note on the dot; the neck drawn as material (wood grain, nut, inlays) rather than a wireframe. |
| **Fretonomy** (`fretonomy-learn-fretboard--ipad-1..6`) | Note finder game, chord and scale calculator | A dark fretboard with amber strings and inlay markers at 3, 5, 7; the game shows only frets 0 to 8 (a window), one red target dot, and a row of generous round answer buttons; interval dots use consistent colours (R red, P5 orange, M3 green). | The fret window with position markers and fret numbers above the board; big round answer targets; interval and tone-role colour coding on dots. |
| **Melodics** (`melodics-for-ipad--ipad-1..6`) | Practice lane, results | Charcoal timeline, coloured hit blocks (yellow hi-hat, blue snare), a glowing green burst on a good hit, a vertical playhead; results screen with Good / Early / Late / Missed / Misplayed bars, personal best, attempts, passed. | Hit feedback as a bloom on the stage; the results breakdown by timing band; a bold display face for headings and one accent (yellow) against charcoal. |
| **Perfect Ear** (`perfect-ear-music-rhythm--ipad-1..6`) | Home, interval exercise, rhythm exercise | Calm two-tone pages (olive, sage, cream), a progress bar as the only chrome, staff plus keyboard with the two sounding keys marked, two large answer buttons, a single round tap target for rhythm. | Quiet single-purpose exercise screens; the exercise owns the whole page; two-colour restraint. |
| **Yousician** (`yousician-learn-play-guitar--ipad-1..6`) | Song play | Dark 3D highway with coloured finger numbers, a white ball tracing pitch, "Perfect!" callouts; bright brand colours around it. | Only the affective feedback moment ("Perfect!" over the stage); the rest is game retention we decided against. |
| **Simply Piano** (`simply-piano-learn-piano-fast--ipad-1..6`) | Courses, songs | Saturated brand purple everywhere, poster-like cards. | A confident brand colour used with commitment; not the saturation. |
| **Justin Guitar** (`justin-guitar-lessons-songs--ipad-1..6`) | Modules, songs library, practice | Module pages with an outcome statement ("hit 30 chord changes per One Minute Changes exercise"), a plain lesson list; orange brand on white. | Path steps that state the measurable outcome; One Minute Changes as the change-trainer benchmark. |
| **ToneGym** (`web--tonegym-home`) | Home, workout | Dark charcoal with a teal band, flat illustration of a player at an instrument, "Train Your Ears. Play Better.", daily workout of five short games. | The daily workout framing (five short drills) maps onto our Today routine; dark base with one warm illustration accent. |
| **Soundslice** (`web--soundslice-features`) | Player | Notation plus tab plus video plus fretboard in one player, persistent transport with loop, speed, fretboard toggle. | The persistent transport row; fretboard as a toggleable view under notation for the reading drills. |
| **EarMaster**, **Functional Ear Trainer** (`web--earmaster-home`, `web--functional-ear-trainer`) | Home | Dated web chrome; the method (functional, tonic-anchored) is what matters, not the look. | Nothing visual. |

## 2. What the good ones share

1. **A dark or warm stage with one glowing accent.** Sonofield, Melodics, Fretonomy, ToneGym and Yousician all put the exercise on a near-black or charcoal surface and let one hue glow (violet, yellow, amber, teal). Light pages exist (Perfect Ear, ChordBank) but they are warm cream and wood, never cool grey.
2. **One target per screen, drawn large.** The degree wheel, the highway, the tap circle, the fret window. Chrome disappears during the exercise; a thin progress bar is the only remnant.
3. **Colour carries musical meaning first.** Degrees have colours (Sonofield), intervals have colours (Fretonomy), drum voices have colours (Melodics). Correctness is a second channel: bloom, check mark, red outline. Our token discipline already separates identity and judgement; the gap is that nothing in our app gives musical objects a colour of their own.
4. **The instrument is drawn as material.** ChordBank's wood neck, Fretonomy's amber strings and inlays, Melodics' dark hardware panel. Our stage is a bordered card with a grid; the keyboard is flat.
5. **Generous, round answer targets** (Fretonomy, Perfect Ear, Sonofield) instead of small pills.
6. **Paths are lists that state what each step adds** and the measurable outcome (Sonofield levels, Justin modules). Ours are cards with badges and mastery bars but no "what you will hear or play" line.
7. **Results are a breakdown, not a sentence.** Melodics' Good / Early / Late / Missed bars; personal best beside the score.
8. **A display typeface with personality.** Every app on the board uses a heavy geometric or humanist grotesque for headings and numbers; system UI text is reserved for body copy.

## 3. What we will not copy

- Leagues, coins, multipliers, combos (ToneGym contests, Melodics combo bonus, Yousician score): single-user, no information (ux-research.md section 5).
- Flame streaks that reset to zero; we keep the calendar.
- Full-neck fretboards during a drill (ChordBank's chord page shows the whole neck; fine as a reference, wrong for a drill).
- Video-of-hands layers and 3D highways.
- Saturated brand colour flooding every surface (Simply Piano); our chrome stays neutral and the accent stays on the stage.

## 4. How this feeds the design

- Palette: warm neutrals (paper light, walnut-charcoal dark), one cool violet stage light, tone-role and degree colours as a small fixed set that reads on both themes.
- Type: one display grotesque for titles, stage headings and result numbers; Fira Mono for live readouts; system sans for body.
- Stage: inset panel with grain, a hue rail for the instrument, glow on the target, bloom on a hit; the keyboard gets key depth and the fretboard gets wood, nut, inlays and fret numbers.
- Drill screens: the answer surface fills the stage (degree wheel, fret window, chord position), chrome collapses to a progress bar plus Stop during the run.
- Paths: numbered steps that say what the step adds and what "done" means, with one Practice button each.
- Results: breakdown bars by band, score beside personal best and last-run delta.

Files: 48 App Store screenshots and 22 web captures under `references/`, 31 MB. Sources: iTunes lookup API (`https://itunes.apple.com/lookup?id=…`) for app ids 6740409139 (Sonofield), 397602509 (ChordBank), 1176125504 (Justin Guitar), 1474895145 (Melodics for iPad), 1440768353 (Perfect Ear), 1279576225 (Fretonomy), 959883039 (Yousician), 1019442026 (Simply Piano); public pages tonegym.co, sonofield.com, melodics.com, soundslice.com/features, chordbank.com/guides, fretonomy.com, justinguitar.com, earmaster.com, perfectear.app, miles.be.
