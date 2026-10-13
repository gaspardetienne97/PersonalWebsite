# Context for the rebuild

Everything in this folder describes the app as built so far (the previous version, then what a clean-room rebuild added on top), the people and research behind it, and the hardware it must talk to. None of it is code. Each of the six files ends with a section on what the rebuild added; treat those as part of the target. Read in the order below; the first six files are the distilled knowledge, the rest is source material to consult when you want the detail or the evidence.

## Read first

| File | What it is |
|---|---|
| `01-feature-catalog.md` | Every screen, hub, drill and cross-cutting system of the previous app, described as behaviour: inputs, what the user does, how it is scored, what persists, plus the authored content tables. Feature parity is measured against this file. Section 7 lists what was weak or unfinished. |
| `02-research-digest.md` | Who the owner is and how they practise (their own words where recorded), the usability and user-research findings that still hold, the learning research with citations, the products and visual references earlier rounds studied, the curriculum thinking, the design principles the reviews converged on, and the questions never settled. |
| `03-hardware-and-devices.md` | The Akai MPC One+ Controller Mode handshake (exact sysex, 1 s heartbeat), pad maps and ports, the Roland Aerophone's MIDI behaviour, piano over MIDI, guitar over microphone, Web MIDI and audio permission lifecycles, the three clocks and the lights-versus-audio lookahead, offset calibration, the microphone pitch-detection settings that work on low strings, and the MPC sample-kit export format. Months of debugging live here. |
| `04-music-data.md` and `data/` | The verified content: Aerophone fingerings, tunings, chord shapes and positions, CAGED and pentatonic patterns, scales, strum patterns, MPC rudiments and the authored grooves, licks with positions, voicings, two-hand patterns, ear-training sets, reading levels, cadences and chord qualities, the daily routine, challenges, the skill-graph seed, learning paths, comping patterns, default settings. The JSON was produced by evaluating the real modules, so values are exact. |
| `05-scoring-rules.md` | Provenance (only unaided attempts count as mastery; demos are never scored), the mastery estimate and decay model, review-due rules, timing zones and windows, evenness, the together window, chord-change clusters, groove matching, accent bands, the tempo ladder, pitch clarity floors, backup format versions and the storage layout. Keep these unless you can show one is wrong; the file notes one place where the docs and the implementation disagreed. |
| `06-lessons-learned.md` | What kept coming back in reviews, the bugs that cost the most and their real root causes, what made the old UI feel dull, what the owner liked, which testing approaches caught real bugs and which did not, and why earlier agents changed too little. Facts and lessons only. |

## Rebuild research and data

| Path | What it is |
|---|---|
| `research/` | The rebuild's own research notes, in full with every source: `aerophone.md` (Roland PDFs, MIDI, Roland's lesson app), `piano-drills.md` (practice evidence, evenness, ABRSM and RCM tempo tables), `guitar-ukulele-drills.md` (what a microphone can measure, ranked drills), `pads-aerophone-gaps.md` (missing pad and Aerophone drills), `finger-drumming.md` (technique, levels, repertoire sources, Latin grooves), `ear-drills-sequencing.md`, `eq-frequency-training.md`, `circle-of-fifths.md`, `drill-progression.md` (the next-run rule), `phrases.md` (public-domain phrases and their scores). Digested in `02-research-digest.md` section (h). |
| `data/` (new files) | `phrases.json`, `pad-repertoire.json`, `pad-skills.json`, `aero-skills.json`, `fingerpick-legato-patterns.json`, exported from the rebuild's modules; `aerophone-fingerings.json`, `chord-shapes.json`, `chord-positions-*.json` and `rhythm-patterns.json` replaced by the rebuild's extended versions. Described in `04-music-data.md` sections 22 to 30. |

## Source material

| Folder | Contents |
|---|---|
| `history/design-rounds/` | Every design and review document from the previous version in order: research (`01-research.md`, `ux-research.md`), information architecture, design system, drill and hub pattern studies, the four proposals, two external reviews, and the review-21 package (`review-21/`: findings, design, curriculum with the nine specified exercises and three instrument progressions, research with the product comparison matrix, implementation plan, three interactive HTML prototypes under `review-21/prototypes/`, and the execution record of the last implementation under `review-21/execution/`). `CHANGELOG.md` is the running history of what shipped and why. |
| `history/specs/` and `history/plans/` | The design specs and implementation plans of individual features as they were built (ear training, theory library, note reading, MPC rudiments, string spider, Song Studio and MusicXML, sample kits, chord following), plus the original app plan (`plans/00-original-app-plan.md`) and the long-running implementation backlog. Useful for the intent behind a feature when the catalog is not enough. |
| `references/app-screens/` | Screenshots of other apps studied for reference (Melodics, Simply Piano, Piano Marvel, Yousician, JustinGuitar, Modacity, Duolingo, Strava, Ableton Note, Koala Sampler, GarageBand, ChordBank, Fretonomy, GuitarTuna, TonalEnergy, Fender Tune, forScore, MuseScore, Perfect Ear, Sonofield, and web references). `02-research-digest.md` says what was liked about each. |
| `references/design-brief-screens/` | Mockups from an earlier design brief (light and dark). |
| `screenshots/review-21/current/` | The previous app as it was at the last review, every route, phone and laptop widths. This is what you are replacing. `after/` shows the fixes from that review, `prototypes/` the three HTML prototypes rendered. |
| `screenshots/current-ui/` | Two earlier screenshot sweeps of the previous app (round 4 and the hub redesign), for the routes review-21 did not re-shoot. |

## What is deliberately not here

The previous music app's code (its routes, components and `packages/music-core`), its folder rules and its agent instructions. The site around it, including the shared `@repo/ui` primitives, is intact and is what the rebuild builds on. The rebuild is meant to make its own decisions about everything inside the music app.
