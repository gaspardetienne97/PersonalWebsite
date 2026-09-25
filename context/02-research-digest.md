# Research digest: the durable knowledge behind Practice OS

Distilled from `docs/music-redesign/` (rounds 0 to 5, external review 16, second review 18, review 21), `docs/superpowers/specs/`, `music-practice-app-plan.md` and `IMPLEMENTATION_PLAN.md` in the PersonalWebsite repo. Every claim names the document it came from. This file is knowledge, not instruction: nothing here is a rule for a rebuild.

---

## (a) Who the owner is and how he practises

### The person

One user. No social layer, no accounts, no other players. Every research document repeats this and draws conclusions from it.

- "The reader is the single intermediate adult user of Practice OS, practising alone in short sessions on desktop and on a phone propped at the piano, with Web MIDI (keyboard and Aerophone), an on-screen piano, and a hint-only microphone." (`ux-research.md`, scope line)
- The audit ranks findings "by impact on the one user (intermediate jazz pianist, Aerophone, short sessions, desktop and a phone propped on the piano)". (`audit.md` §0)
- Production work (MPC drum creation, sequencing, DAW work) is "one of your explicitly stated personal goals, not a market bet". (`music-practice-app-plan.md` §7, scope note)

### The instruments

| Instrument | Status in the docs | Input path |
|---|---|---|
| **Piano** (Roland FP-30X is named in the changelog) | Primary. Jazz piano is the owner's stated centre of gravity (`audit.md` §0). | Web MIDI, note on/off/velocity; on-screen `PianoSurface`; QWERTY A to L white, W to P black |
| **Guitar** | Priority 1 for new drills in the second review (`18-second-review.md` §D, R22). | Microphone monophonic pitch; on-screen fretboard (string and fret are known only on-screen) |
| **Akai MPC One+** | "Treat MPC connection, routing, mappings, feedback and exercises as one high-priority reliability investigation, not disconnected cosmetic fixes." (owner item O21, `20-next-review-prompt.md`) | Web MIDI over the Private port, **only while the host keeps a Controller Mode handshake alive** (see below) |
| **Roland Aerophone** (AE-10, per the session memory; the docs note Roland's own lesson app lists AE-20/AE-30 and not AE-10) | Explicitly **deferred** as of review 21: "Aerophone calibration and new Aerophone work are deliberately deferred" (`20-next-review-prompt.md`). | MIDI note on/off plus breath CC2 and pitch bend (bite sensor) |
| **Ukulele** | "supported", not prioritised (`20-next-review-prompt.md`). | Same as guitar |
| **Voice** | A token and an ear-training answer mode; never a first-class instrument. | Microphone, hint only |

The 2026-09-17 brief states the order plainly: "The owner prioritizes guitar, piano and MPC One+, with ukulele supported."

### The goal, in the owner's framing

- "The goal is short, focused sessions that improve real playing: understand the task, hear/see a useful demonstration, practise with appropriate assistance, receive actionable feedback, and know what to practise next. Keep the tool playable when both hands are occupied. No social ranking, hearts, gems, engagement pressure or feature accumulation for its own sake." (`20-next-review-prompt.md`)
- The design brief he wrote for the visual round names two problems in his own voice: "Drills feel clunky and unpolished" and "The color system is one-dimensional... I want **variety with meaning**, not rainbow noise." (`09-open-design-brief.md` §2)
- On the stage: "It's a bordered gray div. It should feel like hardware/stage." On results: "A drill you just completed deserves a moment." On setup: "Setup dominates." (`09-open-design-brief.md`)

### Direct owner requests recorded verbatim

- Spider, after round 4: "for the spider exercises all we need is the fretboard, and more patterns involving different finger orders." (`CHANGELOG.md`, slice 36)
- Jazz decomposition, 2026-06-29: "Full scope" (build the new jazz drills, not just retag). (`05-jazz-decomposition.md`)
- Pad map, 18 Sep: the learned map "never stuck" and pads were unresponsive on other routes. (`CHANGELOG.md` and `review-21/findings.md`)
- MPC, 18 Sep: the Connect live monitor showed nothing from the Private port until the Private *output* was selected and "Connect (init + heartbeat)" was pressed; on drills the input pill stayed On-screen. (`review-21/findings.md`)
- MPC, 18 Sep 02:05, after the fix: confirmed on the real MPC One+ that Rudiments responds once the Private output is kept linked. (`review-21/findings.md`)
- Engine changes were gated on his yes each time ("you can change the engine", changelog slice 21; "go ahead" opened round 3).

### The owner's own 25-item usability review (O01 to O25)

Recorded in full in `20-next-review-prompt.md` and dispositioned in `review-21/findings.md`. Grouped by what they say about how he practises:

**At the instrument, hands busy**
- O04 MPC computer-key presses leave pad highlights stuck after release; simultaneous keys do not all highlight.
- O07 Mark middle C for orientation; physical MIDI playing, including simultaneous notes in Two-Hand, should highlight on-screen while notes are held.
- O02 A pressed white key between black keys covers part of the black keys.
- O09 Reading should keep the input keyboard and live played-note feedback but hide expected answers by default, with an explicit expandable hint; put wrong-note feedback on the staff because accumulated red keyboard notes obscure ongoing feedback.
- O06 Add audible and synchronised visual demonstrations: scales, chords, Two-Hand, contrary motion, pulse lines. "Show which notes happen together and in what order so the learner understands the task."

**Reading and scores**
- O12 Long scores force whole-page scrolling and preview/start sit at the bottom; keep transport and practice actions reachable.
- O14 Replace the score cursor with a clean vertical line spanning the staff/system.
- O15 Range selection should be start and end on the score, not individual notes; he suggested green start / red end.
- O13 The library's Tab view does not actually show guitar or ukulele tab.
- O08 The Waterfall keyboard looks different from the other on-screen keyboard.

**Hardware reliability**
- O19 MPC MIDI appeared in Connect but Rudiments advanced from an unexpected physical pad; he expected notes 36/38 to be pads 1/3, pad 6 advanced instead.
- O20 Groove copy-back registered none of his hits.
- O21 Treat the whole MPC chain as one reliability investigation.
- O25 Tuner works with piano but sometimes misidentifies low guitar notes that another tuner reads as in tune.
- O01 Settings needs a better MIDI/audio offset calibration than guessing numbers.

**Recording**
- O22 Microphone recordings save but play back very quietly.
- O23 Takes cannot be played from their cards.
- O16 Create needs a clearer representation of captured MIDI notes, distinct from audio takes.
- O24 Recording is "a distinct job"; consider its own destination outside Create.
- O17 Sample-kit pad assignment dropdowns do not open or offer assignments.

**Layout and looks**
- O05 Make the Music sidebar collapsible, filling app height, with Connect/Tuner/Settings/Guide anchored at the bottom.
- O03 On the ukulele surface, restrict the fretboard treatment to the fretboard, not the whole view.
- O11 Dark-mode contrast against a purple background is poor.
- O18 Keep the useful Progress information but design genuinely different alternatives to compare.

---

## (b) User research and usability findings that still hold

### About the app's own screens (from direct observation)

From `audit.md` (2026-09-04, headless Chromium at 1280 and 375, light and dark, 72 setup loads and 44 stage loads):

1. **Chrome ate the screen.** Four bands (site header 48px, music top bar 44px, floating practice capsule 52px, page header with subtitle) took 160 to 190px on desktop and about 40% of a 375px phone. With bottom tabs, a 812px phone left about 615px for the drill.
2. **Starting a drill looked like a settings page.** Only two of fourteen drills collapsed their setup behind a remembered summary, even though the app already restored the last setup on all of them. Sight-reading, ear training and the daily routine each demanded a second Start; the routine cost four clicks before sound.
3. **Two keyboards, one target.** Chord-Scale, Voicings and Jam stacked a tone-role strip or a target keyboard above a blank input keyboard; the tone roles never reached the keys the player touched.
4. **Summaries were inconsistent.** Six drills never showed a delta against the last run, seven never showed a next step, XP appeared in five different places or nowhere.
5. **Overflow at 375px** on five routes and Jam at 1280 too. Two root causes: `SegmentedControl` was `inline-flex` with no wrap, and a fixed-width SVG in the Aerophone fingering chart.
6. **Copy had no single voice**: five labels each for Start, Cancel and Retry; engineering words in headings ("Breath CC2", "Expected-target verifier", "Summary dimensions").
7. **Accessibility basics present but fragile**: every drill had a live region and moved focus on phase change, but two to five live regions competed per route, `aria-label` sat on plain divs in nine files, and two stage headings were `sr-only` while being focused, so a sighted keyboard user watched focus vanish.
8. **Depth was thin**: fixed target sets in one key, no timing grade outside Rhythm and Chord Progression, no adaptation beyond the Scales tempo ladder.

### About the hubs (from `13-hub-references.md` §4, round 5 survey)

Library nested a second page shell and second `<title>`; tabs never wrote back to the URL; Create's piano roll was 746px wide at 375; Progress was titled "Dashboard & Skill Tree" under a nav item called "Progress" with every stat at equal weight; Connect still said "(Phase 2)" and split setup state across three pages; Tuner's A4 control appeared in Drone mode where it did nothing.

### From the external review (`16-external-review.md`, Chromium walkthrough of all 19 drill routes)

- **Mastery over-claimed transfer.** After a major-voicing run, Jazz Path showed four different lessons at 92% mastery including altered voicings never practised, because the curriculum, Licks and Chord-Scales all wrote to `harmony.ii-v-i`.
- **Results were dishonest about their input.** Mouse taps earned "Velocity 100%" because the router emits constant velocity; Chord-Perfect called pointer answers "strings rang clean". On-screen input cannot verify touch dynamics, buzzing strings or fingering.
- **Reading gave no correction.** Ten wrong answers advanced immediately with no sight of the submitted note beside the expected one.
- **Feedback detached from its question.** Practice mode showed the next ear question while the previous answer's feedback sat beneath it.
- **Tempo advice ignored performance.** A 0% rhythm run prominently offered "Increase to 110 BPM".
- **Invented fingerings.** Two-Hand labelled G4, A4, B4 all finger 5 because a helper clamped an ascending pitch index to five.
- **Invisible focus.** Fretboard Enter input worked, but the real buttons lived in an `sr-only` grid, so focus location was invisible on the drawn fretboard.
- **The coach crossed instrument boundaries and trusted tiny samples.** `weakestSkills` had no minimum attempts and no instrument filter, so one missed piano rep became the guitar user's focus (`18-second-review.md` R32).
- **XP measured participation, not work.** A wrong Reading answer earned about 18 XP; a 27% routine earned 597 XP (`18-second-review.md` C2, R31). Left as an open owner decision.

### What the reviewers said to leave alone

`16-external-review.md` §10: the four hubs, the local-only architecture, the shared shell, native selects, the neutral palette, musical tokens, fret windows, authored chord positions, the tonic-first ear path, generous playable surfaces, the Wait versus Performance distinction, and deliberately lenient practice with clearer labels. "Repair learning evidence, input truth and navigation before commissioning another visual redesign."

`review-21/README.md` "What to retain": token discipline and the contrast test, the three drill phases, one keyboard component, the `assistance` and `source` provenance fields, the backup formats and guards, range as start/end beats, and `rhythm-pattern` / `score-follower` / `technique-ladder` as the timing and tempo engines every new exercise can reuse.

---

## (c) Pedagogy research, with the citations as the docs give them

### Deliberate practice and error-targeted repetition

- **Duke, Simmons and Cash (2009), "It's not how much; it's how"**, JRME 56(4) 310-321, doi 10.1177/0022429408328851. 17 advanced pianists; retention rank was unrelated to practice time or trial count. Top performers located errors precisely, varied tempo on problem segments systematically, and repeated targets until fixed. Limits: three-measure Shostakovich excerpt, advanced players, next-day retention. (`review-21/research.md` claim 3, `18-second-review.md` §F)
- **Chaffin and Imreh (2002)**, Psychological Science 13(4) 342-349. A concert pianist's practice concentrated on structurally defined sections with performance cues and extended retrieval practice. Limits: n = 1.
- **Allingham and Wöllner (2022)**, Psychology of Music, doi 10.1177/03057356211073481. Slow practice alone "is unlikely to improve fast performance"; musicians combine gradual increase with alternating fast and slow. Survey and self-report.

### Spaced repetition and interleaving

- **Stambaugh (2011)**, JRME 58(4) 368-383, doi 10.1177/0022429410385945. 41 beginning clarinettists; no acquisition difference between blocked and random; at 24 hours the random group played significantly faster (F(1,38) = 24.95, p < .001). Accuracy and evenness did not differ.
- **Simmons (2012)**, ERIC EJ951332. 29 non-pianists, nine-note sequence; accuracy gains only with 24-hour gaps, speed gains at 6 and 24 hours. Sleep-based consolidation.
- **Carter and Grahn (2016)**, Frontiers in Psychology 7:1251, PMC4989027. Ten advanced clarinettists; interleaved pieces were rated better whenever there was a difference, but not significantly; inter-rater correlations 0.02 to 0.59. Eight of ten commented favourably on goal setting, focus and mistake identification.
- **No spacing effect for piano motor sequences**: PLOS One 2017, doi 10.1371/journal.pone.0182986, 100 participants, gaps of 0 to 15 minutes, "no spacing effect", concluding the effect "may not always be demonstrable for complex motor skills".
- **Dunlosky et al. (2013)**, Psychological Science in the Public Interest 14(1) 4-58, doi 10.1177/1529100612453266. Practice testing and distributed practice rated high utility; interleaving moderate. Verbal and declarative materials only.
- **Anki manual** (docs.ankiweb.net/studying.html): Good should be used 80 to 95% of the time and using only Again and Good is acceptable. Four-button grading is overkill.

The conclusion the docs drew: schedule declarative items (chord spellings, scale degrees, interval and quality labels, theory facts) as flashcards with per-item intervals and two grades; do not apply forgetting curves to motor drills, rotate 2 to 4 of them within a session instead and surface items by recency and last score. (`ux-research.md` §6)

### Feedback timing, the guidance hypothesis

- **Salmoni, Schmidt and Walter (1984)**, Psychological Bulletin 95(3) 355-386. Frequent extrinsic knowledge of results helps acquisition and can degrade retention; learning must be measured on no-KR retention or transfer tests.
- **Winstein and Schmidt (1990)**, JEP:LMC 16(4) 677-691. 50% faded KR matched 100% in acquisition and beat it on delayed retention.
- **Bandwidth KR** (feedback only outside a tolerance), doi 10.1080/14640749008401249.
- **Counter-evidence**: Wulf and Shea (2002), Psychonomic Bulletin & Review 9(2) 185-211. For complex motor tasks, higher concurrent-feedback frequency produced better retention; principles from simple skills do not generalise. Also PMC4893479 (2016): more auditory augmented feedback was better on a novel limb coordination pattern.
- **Self-controlled feedback** helps, but the benefit disappears under secondary cognitive load (PMC7283715), which argues for keeping the feedback UI itself cheap to read.
- Verdict recorded in `review-21/research.md` claim 6: mixed. Per-note instant colour is defensible for beginners on complex tasks; offer a fade or summary-only mode as skill rises and measure on unassisted takes.

### Modelling before practice

- **Cash, Allen, Simmons and Duke (2014)**, JRME 62(1) 89-99, doi 10.1177/0022429413520409. 32 non-pianist musicians; those who heard ten model repetitions before practice made significantly larger gains during training and between end of training and test. 13-note left-hand melody, auditory model only.
- **Rosenthal (1984)**, JRME 32(4) 265-273. Aural model conditions beat verbal guide or practice-only for advanced instrumentalists.
- **Hewitt (2001)**, JRME 49(4) 307-322. Recorded-model users improved rhythmic accuracy, technique, tempo and interpretation.
- **Dickey (1992)**, ERIC EJ458352, review: modelling "is effective in promoting musical skills across a wide age distribution" and nonverbal instruction is "clearly preferable to verbal description in many situations".
- Honesty note in `review-21/research.md` claim 2: audible modelling is well supported; **synchronised visual** modelling is an extrapolation. Melodics' lit-pad preview is industry practice, not evidence.

### Hidden answers, hints and provenance

- **Karpicke and Roediger (2008)**, Science 319(5865) 966-968. "Repeated studying after learning had no effect on delayed recall, but repeated testing produced a large positive effect"; learners' own predictions were uncorrelated with performance. Swahili-English vocabulary.
- Design implication recorded: hide the expected note, make the hint a deliberate act, and log that it was used. Simply Piano already encodes this visually (blue = correct unaided, yellow = correct after a hint, red = wrong), per its help centre.
- The app's own version: `ScoringEvent` gained `assistance` and `source` fields (`18-second-review.md` R33) so every honesty fix shares one mechanism, and Dunlosky's high-utility "practice testing" becomes a short unaided check run reusing each drill's test mode.

### Tempo, difficulty dimensions

- **Drake and Palmer (2000)**, Cognition 74(1) 1-32. Novices show a relative-timing versus pitch-accuracy trade-off and frequent simultaneous pitch/time errors; both improve along a power function.
- **Bjork and Bjork (2011)**, desirable difficulties: spacing, interleaving, variation and testing raise long-term retention while lowering in-session performance, but only where the learner can overcome the difficulty. Essay, no music data.
- Verdict in `review-21/research.md` claim 5: partially supported. The trade-off is real; the literature favours varying tempo, including occasional faster attempts, over a strict accuracy gate. The curriculum's own rule is tempo rises after two clean runs at the current tempo.

### Rhythm and pads

- **Repp and Su (2013)**, Psychonomic Bulletin & Review 20(3) 403-452. Tapping to a metronome is the canonical timing task; non-musicians tap ahead by tens of ms (negative mean asynchrony); real or imagined subdivision extends the tactus to slower rates.
- **Fujii et al. (2011)**, Music Perception 28(5) 491-503. Professional drummers' mean asynchronies were 0 to 13 ms, so a realistic "tight" window is roughly 10 to 15 ms, not zero.
- **Finger-drumming pedagogy: no peer-reviewed study found.** Only vendor guides. Treat row-centred hand placement and 5 to 10 BPM ramps as practitioner consensus. (`review-21/research.md` claim 7)

### Motivation and streaks

- **Duolingo's own blog** on streaks: the Weekend Amulet made users 4% more likely to return a week later and 5% less likely to lose their streak; a Streak Wager raised Day-7 retention by 14%. Stated lesson: "giving users permission to rest actually increases long-term engagement." Third-party analysis attributes a 21% churn reduction to Streak Freeze for at-risk users (strivecloud.io).
- **Critique**: the Duolingo loop is deliberately easy so users keep logging days (dev.to/yaptech).
- Applied conclusion in `ux-research.md` §6 and §9: if a streak exists, make it forgiving by default, count practice days with a built-in weekly freeze and a pause state, and show it as a calendar (Melodics) rather than a flame that resets to zero. Skip XP, multipliers and combo bonuses; for one user they add load without information, and the attempt trend is the honest signal.
- The app shipped XP anyway and the second review flagged the consequence (R31, above): XP measured participation and was the headline number. Never resolved.

### Cognitive load and accessibility standards

- **Cognitive load theory applied to instrumental performance** (Price 2010 EdD; CLT and music instruction, ResearchGate 247513607): reading, motor control and interpretation compete for working memory. Practical implication: do not show staff, keyboard highlight, chord symbol, fingering and a scrolling waterfall at once.
- **WCAG 1.4.1** (Level A): colour must not be the only visual means of conveying information. Most piano apps fail this with green/red.
- **WCAG 2.4.7** and **WCAG 2.2 Focus Appearance**: visible focus, at least a 1px perimeter or 4px on the shortest side, 3:1 against the unfocused state.
- **WCAG 2.5.8**: 24 x 24 CSS px target minimum at AA. **Apple HIG** 44 x 44 pt; **Material** 48 x 48 dp with 8pt spacing.
- **Situationally induced impairments** (arxiv 1904.06128; Wobbrock EICS-19): hands on the keys with a phone at arm's length is the same class of impairment as encumbered hands; the design response is larger targets, more spacing, and layout adapted to the situation.

---

## (d) Competitive and visual references named in the docs

### Information architecture references (`01-research.md` §A)

| App | What it does | What was taken |
|---|---|---|
| **Melodics** | Guided vs Explore; "Practice" is a mode you enter on a lesson, not a place | The cleanest split-by-intent, and the verbal frame the app was missing |
| **Soundslice** | Overview / Practice / Manager / Courses; any slice drops into a practice list; reference and drill are the same object in different containers | The "Practice tab as command centre" model, and "one content object, many containers" |
| **EarMaster** | The same exercise type exists as a graded course step and a configurable custom drill | Reference-versus-drill done right |
| **Yousician** | Path / Workouts / Songs / Tools; the Songs tab splits Play vs Learn by background colour | The cautionary twin of the app's own Learn/Play problem; its Tools tab cleanly quarantines tuner and metronome |
| **flowkey** | Radically flat, search first | Flatness has a ceiling past beginner |
| **Moises** | Tools live on the track, not in a global menu | Contextual tools, few top-level items |
| **TonalEnergy** | One tab per capability | Model for laying out tools without overlap |
| **Ultimate Guitar** | Tools buried in per-tab overflow | Discoverability failure |
| **Simply Piano** | Practice Mode auto-triggers on mistakes | Practice as a modifier, not a tab |
| **Trala** | Deliberately removed a top-level Lessons tab | Precedent for merging |

Cross-cutting motifs of the best music apps, from the same doc: one big central target per screen; a persistent transport bar; a moving cursor binding notation to sound; loop-a-section plus slow-down as universal primitives; immediate affective feedback; wait/forgiving mode versus performance/graded mode; difficulty knobs up front; per-session progress always visible plus an end summary; "always a next step"; just-in-time device onboarding with mic and MIDI fallback. The single highest-leverage constraint named: Web MIDI permission gating plus a mandatory mic fallback for Safari and iOS.

### Behaviour references (`ux-research.md`)

- **Wait mode is universal**: Simply Piano Practice mode, flowkey Wait Mode, Yousician Wait To Play, Melodics Wait, Piano Marvel Prepare, Synthesia Melody Practice all pause until the right note.
- **Melodics** timing bands: green correct, orange early, purple late, red missed, blue/yellow for hand; a results breakdown by band with personal best and attempts; Auto BPM adds +10 when you are "nailing it"; a 5-minute daily goal; practice history as a calendar. Its "Map MIDI instrument" flow has you hit each pad sequentially, and manual mappings lose vendor pad lighting.
- **Soundslice**: drag on the notation to loop, snapping "to notes, rests and barlines"; 25 to 200% speed; a speed-training dialog with start, end, increment and reps per speed; Focus mode hides other bars and redraws clef/key as standalone; five playhead-scrolling options including "keep in middle" and "only scroll when necessary".
- **Piano Marvel**: Prepare (waits) vs Assess (expects tempo); medals at 80/90/96%; SASR advances at 80%, three strikes ends the set; content pre-cut into Minced / Chopped / Whole chunks. A commenter notes it does not detect note duration.
- **Simply Piano**: the answer is not pre-highlighted; a keyboard appears after a miss with the correct key in yellow; note colours afterwards encode hinted versus unaided. The documented failure: you can "play the wrong rhythm entirely and still get all green notes".
- **Tenuto / musictheory.net**: 24 highly customisable exercises, a Challenge Mode with a time or question limit, and permanent customised-exercise links (the source of the shareable drill-config idea).
- **Functional Ear Trainer**: explicit granularity ladder (lower tetrachord, upper tetrachord, full octave, random keys), a I-IV-V-I cadence before each question, and resolution to the tonic after the answer.
- **Complete Rhythm Trainer**: 252 drills, 4 levels, 30 chapters, five drill types, 3 stars per drill to complete a chapter.
- **iReal Pro**: chord chart as the canvas, per-instrument mixer to mute the part you will play, loop a section, automatic tempo increase, automatic transposition.
- **Rocksmith+**: the only surveyed product that names its calibration clearly, with "Audio Lag Correction" and "Visual Lag Correction" sliders in ms and an explicit sign rule. Nobody surveyed presents a measured offset with a confidence range.
- **TonalEnergy / Peterson**: a green face that grows the longer you stay in tune, an arc of neighbouring notes, wind/strings/voice modes, damping slow/normal/fast, range wide to ultra-fine; Peterson has 0.1-cent display, +24 dB input boost for weak signals, manual note mode, and the observation that pitch "is never totally stable" so a slight warble is acceptable.
- **Akai MPC pad maps**: since MPC 2.11 the default drum program is Chromatic from C1 (A01 = note 36, bottom-left, rows ascending); a legacy "Classic MPC" preset is GM-drum-like with A01 = 37, A02 = 36, A03 = 42, A06 = 38. This exactly explains the owner's "pad 6 advanced" report.

### Visual references (`10-visual-references.md`, 48 App Store screenshots and 22 web captures)

| App | What it does well | What was borrowed |
|---|---|---|
| **Sonofield Ear Trainer** | Near-black background, one glowing answer wheel, degrees on a circle of fifths each with its own colour, a path that names the degrees each level adds ("1 3", "1 3 5") | The degree wheel as the scale-degree answer surface; colour bound to musical meaning; a path that states what each step adds |
| **ChordBank** | Warm wood and paper, realistic vertical fretboard, finger dots labelled with finger and note, voicings grouped by fret position | One position at a time; finger plus note on the dot; the neck drawn as material |
| **Fretonomy** | Dark fretboard, amber strings, inlays at 3/5/7, a fret window of 0 to 8, one red target dot, big round answer buttons, consistent interval colours | The fret window with position markers; big round targets; tone-role colour coding |
| **Melodics** | Charcoal timeline, coloured hit blocks, a green bloom on a good hit, a results screen of Good/Early/Late/Missed/Misplayed bars with personal best | Hit feedback as a bloom; results as a band breakdown; a bold display face with one accent |
| **Perfect Ear** | Calm two-tone pages, a progress bar as the only chrome, the exercise owning the whole page | Quiet single-purpose exercise screens; two-colour restraint |
| **Justin Guitar** | Module pages with a measurable outcome ("hit 30 chord changes per One Minute Changes exercise") | Path steps that state the measurable outcome; One Minute Changes as the guitar transfer metric |
| **ToneGym** | A daily workout of five short games | The daily-workout framing for the Today routine |
| **Yousician, Simply Piano** | Only the affective feedback moment and colour commitment | The rest is game retention the docs rejected |

Shared traits of the good ones (§2): a dark or warm stage with one glowing accent; one target per screen, drawn large; colour that carries musical meaning first, with correctness as a second channel; the instrument drawn as material; generous round targets; paths that say what each step adds; results as a breakdown, not a sentence; a display typeface with personality.

Explicitly not copied (§3): leagues, coins, multipliers, combos; flame streaks that reset to zero; full-neck fretboards during a drill; video-of-hands layers and 3D highways; a saturated brand colour flooding every surface.

### Hub references (`13-hub-references.md`)

forScore (one record per song with musical metadata, everything attached to it; setlists as the library's path), MuseScore (a song card that opens into a reader, not a form), Koala Sampler and Ableton Note (pads that show their content, kit colour driving step colour, row labels and a playhead, one fixed transport strip), GarageBand (transport, ruler and track view in one strip), Duolingo (a header strip that always says where you are; the streak as a real calendar), Strava (weekly bars; recent sports as round chips), Modacity (a practice timer with concentric rings as a quiet hero; it explicitly refuses to judge, which the docs read as leaving "what next" open as an opportunity), GuitarTuna (per-string pegs, a direction hint), Fender Tune (ring backdrop, one instruction line before sound arrives), iOS Settings (grouped rows, one control per row, value on the right, footnote under the group).

---

## (e) Curriculum thinking

The full text lives in `docs/music-redesign/review-21/curriculum.md` (327 lines) and is being copied alongside this digest. Summary:

### What existed (inventory, §1)

22 chords, 19 scales and one tab voicing in the library; 5 guitar and 4 ukulele chord shapes with a positions generator (finger, barre, stretch rules); 17 scale kinds x 12 tonics x 3 motions x 3 spans; 24 spider finger permutations; 5 two-hand patterns; 29 jazz licks, all in C; 9 authored 4/4 rhythm patterns; 4 MPC rudiments on two pads at eighths; 3 computed one-bar grooves; generated stepwise sight-reading (guitar reading used open strings only); 12 intervals, 9 qualities, 4 cadences, 12 degrees in 6 sets; about 110 seeded skills with only 8 prerequisite edges, none for guitar, piano or MPC technique.

### The gaps that mattered (§2)

- Guitar: no strum pattern with stroke direction or mutes; chord changes had no clock; five shapes only; no pentatonic or CAGED positions; no guitar licks; no guitar path.
- Piano: no inversion drill; no arpeggios; no comping in time; no simultaneity metric between hands.
- MPC: rudiments locked to eighths and timed relative to the first hit rather than the click; grooves one bar, three voices, accents never graded.

### The three progressions (§3)

Nine steps each for **guitar** (G-B1 to G-A2: open shapes clean, downstrokes on the beat, changes on the bar, island strum with a mute, fretboard notes, pentatonic box 1, a lick in the box, barre changes, the lick transposed over a vamp), **piano** (P-B1 to P-A2: five-finger patterns, contrary motion hands together, reading in C position, triads and inversions, I IV V I with minimal voice movement, scales hands together at 80, a blues lick over a C7 shell with a Charleston left hand, transposition, sight-reading a two-hand phrase) and **MPC** (M-B1 to M-A2: two-pad singles on the click, sixteenths and doubles, one-bar kick/snare/hat, a two-bar groove with an open hat and accented snare, paradiddles at sixteenths, ghost notes, a four-bar piece with a fill, the same at +8 BPM with the reference muted).

Difficulty is sequenced on named dimensions, one at a time: density (subdivision), tempo, coordination, span, harmony, syncopation, length, memory. Every step runs the same loop: **model** (hear and see it, unscored) then **chunk** (slow, short, targets shown) then **guided** (whole exercise, targets shown, hints recorded as assisted) then **check** (targets hidden, unaided, counts as independent) then **spaced review** (due when the estimate drops ten points) then **transfer** (a new key, a song range, a different groove).

### The nine specified exercises (§5)

Each is fully specified: objective, prerequisite, meter, key, tempo range, every pitch with MIDI number and onset in beats, duration, fingering or sticking where shown, prompt copy, demonstration behaviour, accepted answers per input, grading weights and tolerances, hint behaviour, success/repeat/advance rules, variations, the engine that would run it, and a hand-checked bar total.

1. **G1** "Four on the floor, D to A" (guitar beginner): downstrokes on every beat, chord change on the bar line, 4 bars at 60 to 84 BPM.
2. **G2** "Island strum with a mute, G to C" (guitar intermediate): D DU UDU with a palm mute drawn as an x-head rest, 4 bars at 72 to 100.
3. **G3** "Box one, twelfth fret" (guitar intermediate-advanced): a two-bar E minor pentatonic lick with string, fret and finger per note, 88 to 120, transposable to A minor at fret 5.
4. **P1** "Mirror hands" (piano beginner): a contrary-motion five-finger pattern with matching finger numbers in both hands, 8 beats, plus a new **together** metric (both hands within 40 ms).
5. **P2** "Closest chords: I IV V I in C" (piano intermediate): inversions chosen for minimal voice movement, with the total semitone movement worked out in the doc.
6. **P3** "Blue third over a C7 shell" (piano intermediate-advanced): a two-bar swung blues line over a Charleston left-hand shell, with a swing tolerance from straight 0.5 to swung 0.67.
7. **M1** "Two pads on the click" (MPC beginner): 16 alternating eighths anchored to the click, not to the first hit.
8. **M2** "Two-bar boom bap with an open hat" (MPC intermediate): four voices, accented backbeats, a sixteenth kick pickup; accents graded only when velocity is measured.
9. **M3** "Turnaround with a fill" (MPC advanced): a four-bar phrase scored per section so the result can say "groove clean, fill late", landing the downbeat of bar 5.

### The honesty rule that runs through all of it (§1 and §6)

MIDI gives pitch, onset, release and velocity, never fingering, string, stroke direction or hand (hand is inferred from register). Microphone gives a dominant pitch or an onset at roughly 43 ms granularity, never chord voicing, string or finger. On-screen gives exactly what was tapped, plus string and fret when the surface is a fretboard, and no velocity. Fingering and sticking are therefore shown and never graded, and the copy says so. Bar totals, pitch spelling, playable ranges and string/fret feasibility were hand-verified; two arithmetic errors in the drum counts were found and corrected on 18 September.

---

## (f) Design principles the reviews converged on (about the user, not the code)

These are the conclusions that survived multiple rounds. Each is stated as what it does for the player.

**One keyboard look.** The player should see the same instrument everywhere. Round 4 and 5 removed the "tone strip above a blank input keyboard" pattern from Voicings, Chord-Scale, Chord Progression and Jam so the keys the player touches carry the targets and tone roles (`proposal.md` decision 9, `CHANGELOG.md` slices 12, 17b, 18b). Owner item O08 then found the remaining gap: the song Waterfall looked different from the drill keyboard because it was the same component in a different wrapper with no note names and no router (`review-21/findings.md`).

**Targets shown, then hidden: Demo, Practice, Check.** A demonstration you can hear and see, then practice with targets and an explicit hint, then a check with nothing shown. Only a clean check counts as independent mastery, and the demo control is removed (not disabled) inside Check (`review-21/design.md` §3). Hints write `assistance: "hinted"`, so the journal can tell assisted work from unaided work.

**A single cursor.** One 2px line spanning every staff of the system, standing at the group's onset, with the label available to screen readers only. Before this a grand staff showed two translucent boxes and two "NOW" pills (owner item O14, `review-21/findings.md`).

**Wrong-note lifetime.** Played, expected, hint, correct, wrong and demo are distinct states with distinct lifetimes: held while down, target for the current group, wrong as a short flash plus a mark on the staff, never a growing red set. The score follower's `wrong` set only ever grew, so one mis-hit key stayed red for the whole phrase and buried the live feedback the player needed (owner item O09).

**Honest tab, honest everything.** If the tab view cannot render a score, say so and offer the alternatives instead of silently falling through to the staff with Tab still pressed (O13). The same principle covers "Not measured" for pointer velocity, "target notes matched" rather than "strings rang clean", "Notes collected" for lenient voicings, and one shared source badge instead of a copy-pasted MIDI/On-screen ternary in about ten routes (`18-second-review.md` C5).

**Range as start and end.** Bar-snapped, a green Start handle and a red End handle, each labelled with the word and a bar number, a readout above ("Start, bar 3. End, bar 6. 4 bars, 10 s at 96 BPM"), the first tap drawing its handle immediately. The colour is paired with the label text and the position so the ends are distinguishable without colour (O15, `review-21/design.md` §3).

**Colour is never the only cue.** Hands carry a form marker and a glyph as well as a hue, and the component renders its own legend (`CHANGELOG.md` slice 1). Correctness always has a second channel: bloom, ring, glyph or a live text line. Degrees, tone roles and hands get fixed colours that are identical in both themes; instrument hue means identity only; semantic tokens mean judgement only. This is both WCAG 1.4.1 and the glance-from-the-piano case, so it is not accessibility-only work (`ux-research.md` §8, `11-drill-patterns.md`).

**44 px.** Every primary control at least 44 px, because the player reaches over from an instrument. The prototype critique found nav rows at 40, capsule buttons at 38, the hint disclosure at 28 and "Edit setup" at 22, and raised them all (`review-21/design.md` §5). Piano keys keep a 36 px white-key minimum with horizontal scroll, matching the app.

**Phone-first layouts for a hands-busy player.** Landscape phone at the piano is a situational impairment: the target area on top, the keyboard strip below, one status band legible from 60 cm, no settings or navigation inside the drill view, and the primary action reachable from the instrument (a MIDI note or pedal) rather than a tap (`ux-research.md` §7). Wide surfaces scroll inside their own container so the page never scrolls sideways (`14-hub-patterns.md`).

**Other convergent principles worth carrying**

- **Three drill states, three looks**: calm setup collapsed to a one-line summary with the stage already showing the target, immersive playing where chrome yields, and a results moment that leads with the metric and the delta.
- **The stage is the screen during a run**, with chrome down to a thin progress bar, Stop and a status line.
- **One hero per page.** Tuner: the readout. Progress: today. Create: the grid. Connect: the device list with a live signal.
- **The object is the card**: a song, a kit, a take, a device, a skill, each with its state on it.
- **One route-owned live region**, because two to five competing regions talk over each other.
- **Results are a breakdown**: the metric, then per-band or per-item bars, then the delta and personal best, then Again / Change setup / Next up.
- **Paths state what each step adds and what done means.**

---

## (g) Open questions the docs never settled

1. **What XP means.** Raised as R31 in `18-second-review.md`: `10 + partialCredit*30 + difficulty*20 + improvement*25` awards about 18 XP for a wrong Reading answer, and a 27%-accuracy routine earned 597 XP. The choice named was to scale the whole award by correctness, or keep it and rename the number "practice points". Review 21 lists it as an open owner decision that Progress view C depends on (`review-21/implementation-plan.md` §F). Never decided.
2. **Whether Record gets its own destination.** Prototype 2 recommends a standalone `/music/record`; the owner's O24 asked the question; `review-21/design.md` §4 lists it as his decision.
3. **Whether the dark primary with dark ink is acceptable.** Changed in the tree to `oklch(0.68 0.19 290)` with dark ink so `text-primary` passes contrast, at the cost of primary buttons reading violet with dark text in dark mode. Listed for the owner to accept or revert (`review-21/design.md` §7).
4. **Whether the canvas wash should carry the instrument hue at all.** Round 4 tinted the whole music canvas with `--instr`; review 21 changed it to the practice accent after O03 and marked it reversible in one token.
5. **The MPC's actual pad map** on the owner's program, and whether the 1-second heartbeat interval matches what MPC 3 sends. The handshake is a literal capture replayed in full; which frames the hardware strictly needs is unknown (`review-21/findings.md`, third follow-up).
6. **Whether the library preview cut-out (O10) is the sampler.** Not reproduced; no audio device in the review browser. The named check is Warm Synth versus Sampled Piano on the same song.
7. **Whether the quiet-microphone problem (O22) is capture level, stored amplitude or playback gain.** Three candidates traced, none confirmed; a meter comes first, then optional non-destructive gain.
8. **Low-string pitch detection (O25)** is backed only by synthetic fixtures. Eight real recordings are listed and never taken. The mechanism identified is sub-multiple flips (a 60 Hz hum flipping A2 to A1 in 14 of 35 frames; a still-ringing string making G3 plus C4 read as C2) and sub-50 Hz rumble biasing accepted frames 2.5 to 6 cents sharp.
9. **Aerophone calibration**: model, fingering and transposition assumptions, breath-controller range and pitch-bend range are all unrecorded. Current traces sample note attacks and ignore bend events, so they cannot describe continuous bite control. Deferred by decision, not answered.
10. **Whether "summary only" feedback helps here.** The literature is mixed (guidance hypothesis versus Wulf and Shea on complex skills); the docs propose an option and never tested which the owner prefers.
11. **What the app should do about `inversionCorrect`, comping, and per-exercise success rules as data.** Ledgered as follow-ups in `CHANGELOG.md` after the review-21 implementation, along with Check mode for Two-Hand/Scales/MPC and a comping route with no UI.
12. **Whether interleaving should be compulsory.** The external review pushed back on it: Carter and Grahn "had mixed statistical results, not proof of one universal schedule", and the routine should serve today's instrument and available time rather than forcing four instruments in one session.
13. **Whether a ⌘K palette earns its place.** `01-research.md` rates it low-to-medium confidence: "No researched app ships one, opportunity, not table stakes."
14. **What "adaptive Today" should actually compute.** Also flagged medium confidence: "No researched app nails what to practice next; most just resume a path." It was adopted as the differentiator on the strength of being a gap rather than a proven pattern.
