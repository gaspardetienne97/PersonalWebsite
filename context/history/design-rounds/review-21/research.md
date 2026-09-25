# Research: products and learning evidence behind the review

Compiled 17 September 2026 for review 21. Every product observation is **documentation-only** (official help centres, manuals, release notes): no live app was operated. Marketing claims were not used as evidence of learning outcomes. The claim-level sources in Part B are the ones cited from design.md, curriculum.md and implementation-plan.md; a source is listed only where it supports the specific claim.

How this feeds the proposal: Melodics' sequential pad learn and early/late colour bands shape the MPC fixes (O04, O19, O20); Soundslice's drag-to-loop with barline snap and its playhead options shape the range selection and score viewport (O12, O14, O15); Simply Piano's "hint keyboard after a miss" and Piano Marvel's prepare/assess split shape the demo/practice/check states (O06, O09); Rocksmith's plain-language lag sliders and the absence of a documented tap test anywhere shape the calibration copy (O01); Peterson's input boost and manual note mode inform the tuner work (O25).


Access date for every URL: 17 September 2026.
Evidence type: every product entry below is **documentation-only** (official help centers, manuals, product update posts, or vendor knowledge bases). I did not interact with any live app or demo. Pages marked "(proxy)" were fetched through the r.jina.ai reader because the origin returned HTTP 403 to direct fetches; the URL given is the origin page. Pages marked "inaccessible" were not fetched and their content is not relied on beyond search snippets, which I flag.

---

## Part A. Comparison matrix (products x observed patterns)

| Pattern | Melodics | Soundslice | Piano Marvel / Simply Piano | Yousician / JustinGuitar | Modacity | TonalEnergy / Peterson | Ableton / Maschine / Akai MPC |
|---|---|---|---|---|---|---|---|
| Expected note shown vs hidden | Always shown on a note highway; "Listen & Position" preview lights pads before the step | Notation always visible; playhead cursor | Piano Marvel: notes always on staff, red/green after the fact. Simply Piano: hint keyboard appears only after a miss (yellow) | Yousician: tab/chord always shown ahead. JustinGuitar: video + chord boxes, no live feedback | n/a (no note detection) | n/a | n/a |
| Wait-for-correct-note mode | "Wait Mode" pauses "one note at a time" | No | Piano Marvel "Prepare Mode" waits; Simply Piano waits in slow stages | Yousician "self-paced" exercises in Level 0-1 | n/a | n/a | n/a |
| Range / loop selection on score | Loop points on timeline via dropdown + keys ; / [ ] | Click-drag on notation, snaps to notes/rests/barlines; drag edges; click anywhere to clear; "Focus mode" hides everything else and extends to barlines | Piano Marvel "slicings" (pre-cut chunks) | Not documented | Items, not ranges | n/a | n/a |
| Tempo ramp | BPM slider; "Auto BPM" +10 BPM when "nailing it" until natural tempo | "Speed training": start, end, increment, reps per speed; loop plays N times | Piano Marvel: exercises pre-set at increasing tempos | Not documented | Metronome only | n/a | n/a |
| Timing feedback colours | Green perfect, orange early, purple late, red missed; blue/yellow = hand | None (not an assessment tool) | Piano Marvel green/red; Simply Piano blue/yellow/red | Yousician: not documented in fetched pages | None | Tuner: green smiley (TE), strobe stops (Peterson) | n/a |
| Latency / offset calibration | None. Only buffer/ASIO/Exclusive-mode advice; drums have hit-sensitivity, not offset | n/a | Not documented | Yousician: "Latency calibration ... calibrate your device audio to reduce latency" (no UI detail) | n/a | n/a | Rocksmith+: "Audio Lag Correction" and "Visual Lag Correction" sliders in ms, sign convention explained, "will take some experimentation". Rocksmith 2014: Options > Visual Settings > Display Lag Correction (community) |
| MIDI pad mapping / learn | "Map MIDI instrument": pick pad layout, hit each pad sequentially; manual maps lose pad lighting; "Revert all mappings" | n/a | n/a | n/a | n/a | n/a | Ableton MIDI Map Mode: toggle, click parameter, move control, mapping browser lists it. MPC default drum map = Chromatic C1 (pad A01 = note 36) since MPC 2.11; "Classic MPC" legacy preset; pad 1 bottom-left, A01-A04 bottom row |
| Practice organisation / "what next" | Linear courses, pass/fail score /100 | "Practice lists", "Clips" (saved sub-ranges) | Piano Marvel: SASR tests, medals by accuracy | Yousician: all missions unlocked, themes; JustinGuitar: modules + fixed practice routines | Lists, timers, notes, recordings per item, deliberate-practice cycles; explicitly does NOT judge or prescribe; spaced scheduling "in the future" | n/a | n/a |
| Low-register pitch display | n/a | n/a | n/a | n/a | n/a | TE: C0-C8 range, wind/strings/voice modes, damping slow/normal/fast, range wide->ultra-fine. Peterson: 0.1 cent, strobe direction, +24 dB input boost for weak signals, manual note mode Eb0-Eb8 | n/a |

---

## Part A. Per-product notes

### 1. Melodics (pads / finger drumming)
URLs fetched:
- https://support.melodics.com/en/articles/6695766-connecting-your-pad-controller
- https://support.melodics.com/en/articles/6777096-melodics-app-settings
- https://support.melodics.com/en/articles/6777015-audio-latency-setup-windows
- https://support.melodics.com/en/articles/6757566-my-pad-controller-is-connected-but-not-working-in-lessons
- https://support.melodics.com/en/articles/6777027-practice-mode
- https://support.melodics.com/en/articles/6777061-get-started-with-melodics

Observed pattern. Supported controllers are auto-recognised over USB; anything else goes through Settings > "Map MIDI instrument": "choose your pad layout and map each pad sequentially" (hit each pad in order). "Manual mappings do not support pad lighting." Lessons preview each step ("Listen & Position": pads light onscreen and on the device), then you perform; hits are coloured green perfect / orange early / purple late / red missed, blue/yellow for hand. Practice mode has loop points (timeline + ; ' [ ] keys), a BPM slider, "Auto BPM" (+10 BPM when you are "nailing it", up to the track tempo) and "Wait Mode" (pauses "one note at a time" until the right pad).
Latency. No offset or tap-test calibration exists. Latency is framed as "usually caused by your sound setup, not your instrument"; remedies are ASIO, smaller buffers, Windows Exclusive Mode. Drums get a "Hit sensitivity" slider for double-triggering, not timing.
Tradeoffs. Sequential pad learn is fast and needs no knowledge of note numbers, but loses vendor pad-light integration and gives no way to name notes. No offset calibration means MIDI timing scores include whatever audio latency the user hears.
Relevance. Closest analogue for the MPC finger-drumming module. Its early/late colour split, wait mode and Auto BPM ramp are the reference patterns; its lack of an offset tool is a gap Practice OS can fill.

### 2. Soundslice (notation + tab, loops, cursor)
URLs fetched:
- https://www.soundslice.com/help/en/player/basic/4/looping/
- https://www.soundslice.com/help/en/player/basic/286/speed-training/
- https://www.soundslice.com/help/en/player/basic/5/playback-speed/
- https://www.soundslice.com/help/en/player/advanced/116/playhead-scrolling-options/
- https://www.soundslice.com/help/en/player/basic/277/focus-mode/

Observed pattern. Loop = click-drag directly on the notation; "we'll automatically 'snap' to notes, rests and barlines". Resize by dragging either edge; "To clear a loop, just click or tap anywhere in the notation." Mobile: tap Loop icon, then drag handles. A loop menu offers Focus mode, save as Clip, "Play loop only once". Focus mode hides all other bars, extends to the nearest barlines, crops audio to the range, and re-draws clef/key/time as if standalone. Speed controls live in the bottom bar (+/- 10 %, click number to type; 25-200 %; BPM when synthetic). Speed training dialog: initial speed, final speed, increment, repetitions per speed; without a loop the whole slice is the loop. Playhead options: keep at top (default vertical), keep in middle, only scroll when necessary, keep at left (horizontal), disable auto-scroll (for editing).
Tradeoffs. Drag-to-loop is discoverable and precise but conflicts with drag-to-scroll on touch, hence the separate mobile flow. Barline-only focus is simpler but cannot isolate a half-bar.
Relevance. Direct model for the score follower's range selection and for putting transport at the bottom of long scores. "Only scroll when necessary" and "keep playhead in middle" are the two follower behaviours worth offering.

### 3. Piano Marvel and Simply Piano (piano: hints, modes, held-note feedback)
URLs fetched:
- https://pianomarvel.com/en/feature/practice-mode
- https://pianomarvel.com/en/feature/play-mode
- https://pianomarvel.com/en/article/what-makes-a-great-piano-learning-app
- https://musicmarvel.com/2020/12/16/what-is-the-difference-between-assessment-mode-and-book-mode/ (sister product; Prepare/Assess described in comments)
- https://piano-help.hellosimply.com/en/articles/7943490-learning-with-simply-piano-the-basics
Inaccessible: pianomarvel.com/en/feature/prepare-mode and /assess-mode (404).

Observed pattern. Piano Marvel: standard notation only ("no bouncy dots or video game scrolly bars"). Prepare Mode "waits for you to press the correct keys before going on to the next note"; Assess Mode expects tempo and shows "green notes for where your rhythm and notes were correct, or a red note" for timing or wrong pitch; medals at 80/90/96/100 %. Content is pre-cut into "slicings" learned RH, LH, then both, at rising tempos. A commenter notes it "does not detect note duration" (no held-note assessment). Book Mode = no MIDI, self-tracked progress. Simply Piano: the answer is not pre-highlighted; on a miss "a visual keyboard will appear at the bottom of the screen" and "the correct key will be highlighted in yellow"; note colours afterward: blue = correct with no hint, yellow = correct after a hint, red = wrong (moving stages only). Acoustic recognition advice: headphones, quiet room. Neither documents a latency calibration.
Tradeoffs. Piano Marvel's always-visible score with post-hoc colour is honest but gives no hint gradient; Simply Piano's on-demand hint keyboard is closest to "hidden answer, hint on demand" but the hint is automatic after failure, not user-requested. Neither scores duration, so held-note feedback is a differentiator.
Relevance. Supports Practice OS's hidden-by-default + hint design and a two-mode split (wait/prepare vs assess). Recording whether a hint was used (Simply Piano's yellow) is a cheap, useful addition to per-note results.

### 4. Yousician and JustinGuitar (guitar progression)
URLs fetched:
- https://support.yousician.com/hc/en-us/articles/206930639-How-the-guitar-learning-path-works (proxy; direct 403)
- https://support.yousician.com/hc/en-us/articles/203751452-Game-tab (proxy; direct 403)
- https://yousician.com/blog/new-guitar-syllabus-2021
- https://www.justinguitar.com/classes/beginner-guitar-course-grade-one (proxy; direct 403)
- https://community.justinguitar.com/t/beginner-grade-1-expectations-and-assumptions/417639
Inaccessible: support.yousician.com/.../201682971-Playing-guitar-chords (403), justinguitar.com module and practice-routine pages (403), classcentral listing (403).

Observed pattern. Yousician: 10 levels, missions (~10 min: video, self-paced exercise, short song), three themes (Melody/riffs/lead; Chord and rhythm: cowboy -> moveable -> barre chords; Knowledge). Everything is unlocked. Level 0 was rebuilt around string switching because "beginners struggled with switching strings"; Level 1 chords got "an improved self-paced introduction". Game tab has Advanced audio: buffer size, input device/channel, MIDI, and "Latency calibration: Enables you to calibrate your device audio to reduce latency" (no description of the procedure or how the result is shown). JustinGuitar Grade 1 modules: 0 basics; 1 A and D + "trademark trick for fast chord changes"; 2 E chord, rhythm, first riff; 3 capo, minor chords, up strums; 4 metronome, stretches, "THE pattern" (Dm); 5 C chord, theory, strumming development; 6 G chord, 6/8, fast changes, alternate picking; 7 "Air changes", dynamics, consolidation. One-minute changes are the recurring speed drill; community guidance: "Speed will come. Perfect is more important than speed." Each module ends with a timed practice routine (routine pages themselves were 403).
Tradeoffs. Yousician's open structure suits self-direction but relies on gamified scoring; JustinGuitar's fixed module order and per-item minutes are simple to model offline but have no detection.
Relevance. Chord-family ordering (A D E -> Am Em Dm -> C G), one-minute-changes as a countable metric, and per-item timed routines all map onto Practice OS's guitar skill tree and routine engine.

### 5. Modacity (practice organisation)
URLs fetched:
- https://www.modacity.co/
- https://www.modacity.co/support
Observed pattern. Practice items live in lists/folders; each item carries notes, recordings ("Your recordings are saved with your practice items"), a countdown timer, star rating, and time history. "Deliberate practice mode" walks the user through cycles for the highest-priority items. It explicitly refuses prescription: "Modacity doesn't judge your performance"; the musician decides "what to work on". Spaced scheduling is promised "in the future". Free tier limits items/notes/recordings; stats and full history are Premium.
Tradeoffs. Item-centric organisation is instrument-agnostic and low-friction but leaves "what next" to the user.
Relevance. Validates a per-item history + recording + note model without engagement pressure, and shows that a modest "next" suggestion (which Modacity lacks) is an open opportunity rather than a solved problem.

### 6. Tuners: TonalEnergy and Peterson (i)StroboSoft
URLs fetched:
- https://www.tonalenergy.com/tet-user-guide-ios
- https://www.petersontuners.com/support/
- https://www.petersontuners.com/support/stroboSoft
- https://www.petersontuners.com/media/pdf/iStroboSoft_UG.pdf (proxy; direct fetch returned undecodable PDF)
Observed pattern. TonalEnergy: Target Tuner with a green smiley that "gets bigger when you stay in tune for an extended period"; coloured half-circles above/below centre for sharp/flat; alternative Bar Tuner; cents readout; MODE wind/strings/voice; RANGE wide/medium/fine/ultra-fine ("the finer the range, the more exact the pitch must be to be rewarded"); DAMPING slow/normal/fast = "length of time the sound sample is measured"; range C0-C8. Peterson: strobe moves left/right (older: down/up) for flat/sharp; "the frequency/pitch of any instrument is never totally stable", so a slight warble is acceptable; 0.1 cent display accuracy; AUTO vs manual note (Eb0-Eb8); +24 dB input boost for weak clip-on or mic signals; strobe speed slider (fast = see quick changes, slow = steadier); Drop/Capo transposition.
Tradeoffs. Stability rewards (growing smiley, stopped strobe) communicate confidence without a numeric "confidence" field; damping trades response time for steadiness, which matters for low-E guitar where more partials and slower periods make estimates jumpy.
Relevance. For low-register guitar pitch: expose a damping/averaging choice, show a hold-in-tune indicator, allow a manual target note, and treat small wobble as in-tune.

### 7. MIDI learn and MPC pad notes (Ableton, Maschine, Akai)
URLs fetched:
- https://www.ableton.com/en/manual/midi-and-key-remote-control/
- https://docs.native-instruments.com/ni-tech-manuals/maschine-mk3-manual/en/playing-on-the-controller
- https://support.akaipro.com/en/support/solutions/articles/69000867733-akai-pro-mpc-series-how-to-remap-the-mpc-pads
- https://support.akaipro.com/en/support/solutions/articles/69000804211-akai-pro-mpc-series-understanding-and-loading-programs
- https://cdn.inmusicbrands.com/akai/M211PCVI/MPC%202.11%20Desktop%20Software%20and%20Firmware%20Update.pdf (proxy)
- https://www.mpc-tutor.com/re-mapping-midi-notes-on-mpc-drum-kits/
- https://www.mpc-samples.com/article/mpc-pad-perform-101
- https://www.mpc-samples.com/article/mpc-samples-finger-drumming-layout
- https://constantpool.co.uk/mpc-midi-note-map/
Inaccessible: NI support article 209556109 (404); Akai MPC One user guide PDF not fetched.
Observed pattern. Ableton MIDI Map Mode: press the MIDI switch, assignable UI turns blue, click a parameter, send a MIDI message, the mapping appears in the Mapping Browser with control, path, name, min/max; press MIDI again to exit. Maschine: pads 1-16, "the root note is on pad 1"; Keyboard mode root C3 by default; Group mode maps sounds to pads. Akai: official release notes state "Drum Program note map is now Chromatic from C1 by default" (MPC 2.11); the remap article lists presets "Classic MPC" ("the default MIDI note map of classic MPCs"), "Chromatic C1", "Chromatic C-2", and an "Edit Pad Note Map" screen where you pick a pad or hit it, then type the MIDI note. Third-party sources give the numbers: Chromatic C1 = pad A01 -> note 36, ascending; legacy Classic layout is GM-drum-like (mpc-tutor: "pad A1 is note 37, A2 is note 36, A3 is note 42"). Pad A01 is bottom-left; "a kick, snare, closed hat and open hat on the bottom row of pads (A01 to A04)"; Bank A recommended for MIDI tracks; Pad Perform "Start on Root Note" puts the root on "the first pad (bottom left)".
Tradeoffs. Chromatic-from-36 is predictable for a learn flow, but any MPC on firmware < 2.11 or a user-loaded legacy kit sends the scattered Classic map, so pad learn must not assume contiguity.
Relevance. Default Practice OS MPC map to Chromatic C1 (A01 = 36, bottom-left, rows ascending), keep a "Classic MPC" preset, and offer an Ableton-style learn (select target, hit pad, show the captured note number) as the fallback.

### 8. Offset / latency calibration language (Rocksmith, Yousician, Melodics, Synthesia)
URLs fetched:
- https://ubisoft-mobile.helpshift.com/hc/en/54-rocksmith/faq/1911-correcting-audio-lag-in-rocksmith/
- https://www.ubisoft.com/en-us/help/rocksmith-plus/connectivity-and-performance/article/visual-lag-correction-feature-in-rocksmith/000097535 (proxy; direct fetch returned empty body)
- https://www.ubisoft.com/en-gb/game/rocksmith/plus/news-updates/65jASid3d5aWbcCcljkLC9/rocksmith-2014-pc-configuration-and-faq
- https://steamcommunity.com/app/221680/discussions/0/1621724915795640739/ (community, not official)
- http://www.synthesiagame.com/support/faq
Observed pattern. Rocksmith+ names two sliders in ms under Settings > Game Options > Gameplay > Noteway Display: "Audio Lag Correction" and "Visual Lag Correction". Sign convention is spelled out: "If notes hit the string after the audio, set to a number above 0 ms. If notes hit the string before the audio, set to a number below 0 ms." It is framed as trial and error: "Finding the right timing will take some experimentation, so you might need to adjust this setting a few times." No tap test is documented. Rocksmith 2014 documents only buffer sizes officially; the community describes Options > Visual Settings > Display Lag Correction ("adjust it until its match with tone"). Yousician calls it "Latency calibration" (procedure not documented). Melodics has no offset tool. Synthesia's FAQ has nothing on offset; search results indicate no in-app latency setting.
Relevance. Nobody surveyed presents a measured offset as an estimate with a confidence range; the strongest documented pattern is a signed ms slider with a plain-language sign rule. Practice OS can improve on this with a tap test that reports "about N ms, based on K taps" and still exposes the slider.

---

## Part B. Learning research by claim

Sources are listed with what was actually fetched. "Search-found" = the DOI/publisher page appeared in search results with abstract text but a direct fetch was blocked (SAGE 403/ECONNRESET, PubMed cookie wall, Springer redirect). Where a proxy fetch succeeded it is noted.

### Claim 1. Hidden answer + on-demand hint (retrieval practice) beats always-shown answers
- Dunlosky, J., Rawson, K. A., Marsh, E. J., Nathan, M. J., & Willingham, D. T. (2013). Improving students' learning with effective learning techniques: Promising directions from cognitive and educational psychology. Psychological Science in the Public Interest, 14(1), 4-58. https://doi.org/10.1177/1529100612453266 (search-found; SAGE and PubMed direct fetches blocked). Supports: practice testing and distributed practice rated "high utility" across ages and materials. Limits: verbal/declarative learning; no motor or music tasks.
- Karpicke, J. D., & Roediger, H. L. (2008). The critical importance of retrieval for learning. Science, 319(5865), 966-968. https://doi.org/10.1126/science.1152408 (PubMed abstract fetched via proxy). Supports: "Repeated studying after learning had no effect on delayed recall, but repeated testing produced a large positive effect"; learners' predictions were uncorrelated with performance. Limits: Swahili-English vocabulary, university students, one-week retention; transfer to pitch/fingering recall is an inference.
- Chaffin, R., & Imreh, G. (2002). Practicing perfection: Piano performance as expert memory. Psychological Science, 13(4), 342-349. https://doi.org/10.1111/j.0956-7976.2002.00462.x (PubMed abstract fetched via proxy). Supports: the pianist "engaged in extended retrieval practice ... to ensure that retrieval was as rapid and automatic from conceptual (declarative) memory as from motor and auditory memory." Limits: single-case study of one concert pianist.
Verdict: strong for declarative recall; direct music evidence is expert case-study level. Design implication: hide the expected note, make the hint a deliberate action, and log hint use (as Simply Piano's yellow does).

### Claim 2. Audible + synchronised visual demonstration before practice helps beginners
- Dickey, M. R. (1992). A review of research on modeling in music teaching and learning. Bulletin of the Council for Research in Music Education, 113, 27-40. https://eric.ed.gov/?id=EJ458352 (fetch failed ECONNRESET; ERIC abstract in search: modeling "is effective in promoting musical skills across a wide age distribution" and nonverbal instruction is "clearly preferable to verbal description in many situations"). Limits: narrative review, school-music contexts, pre-1992 studies.
- Rosenthal, R. K. (1984). The relative effects of guided model, model only, guide only, and practice only treatments on the accuracy of advanced instrumentalists' musical performance. Journal of Research in Music Education, 32(4), 265-273. (search-found via Semantic Scholar; page body did not load). Supports: aural model conditions outperformed verbal guide or practice only. Limits: advanced (university) instrumentalists, single etude, 1984.
- Hewitt, M. P. (2001). The effects of modeling, self-evaluation, and self-listening on junior high instrumentalists' music performance and practice attitude. Journal of Research in Music Education, 49(4), 307-322. https://doi.org/10.2307/3345614 (search-found). Supports: recorded-model users improved rhythmic accuracy, technique, tempo, interpretation; modeling x self-evaluation interaction. Limits: junior-high wind players, aural model only (no synchronised visual).
- Cash, C. D., Allen, S. E., Simmons, A. L., & Duke, R. A. (2014). Effects of model performances on music skill acquisition and overnight memory consolidation. Journal of Research in Music Education, 62(1), 89-99. https://doi.org/10.1177/0022429413520409 (abstract fetched via proxy). Supports: 32 non-pianist musicians; those who heard 10 model repetitions before practice "made significantly larger gains in performance during training and between the end of training and test." Limits: 13-note left-hand keyboard melody, auditory model only; the synchronised-visual part of the claim is not tested by any of these sources.
Verdict: audible modelling is well supported; "synchronised visual" is an extrapolation (Melodics' lit-pad preview is industry practice, not evidence).

### Claim 3. Slow chunked practice of short segments and error-targeted repetition beats run-throughs
- Duke, R. A., Simmons, A. L., & Cash, C. D. (2009). It's not how much; it's how: Characteristics of practice behavior and retention of performance skills. Journal of Research in Music Education, 56(4), 310-321. https://doi.org/10.1177/0022429408328851 (SAGE blocked; abstract from search). Supports: 17 advanced pianists; retention rank was unrelated to practice time or trial count; top performers located errors precisely, "vary tempo of problem segments systematically", and repeated targets until fixed. Limits: three-measure Shostakovich excerpt, advanced players, next-day retention only.
- Chaffin & Imreh (2002), above: practice concentrated on structurally defined sections and performance cues. Limits: n = 1.
- Allingham, E., & Wöllner, C. (2022). Slow practice and tempo-management strategies in instrumental music learning: Investigating prevalence and cognitive functions. Psychology of Music. https://doi.org/10.1177/03057356211073481 (SAGE 403; search abstract). Nuance: slow practice alone "is unlikely to improve fast performance"; musicians combine gradual increase with alternating fast/slow. Limits: survey/self-report.
Verdict: supported at the "how" level (target errors, segment, vary tempo), with the caveat that slow-only practice has a ceiling.

### Claim 4. Spaced and interleaved practice in motor learning; Stambaugh caveat
- Stambaugh, L. A. (2011). When repetition isn't the best practice strategy: Effects of blocked and random practice schedules. Journal of Research in Music Education, 58(4), 368-383. https://doi.org/10.1177/0022429410385945 (SAGE blocked; ISPS proceedings version fetched at https://digitalcommons.georgiasouthern.edu/music-facpubs/13/). Supports and caveats: 41 beginning clarinettists; no acquisition difference; at 24 h the random group "were able to play significantly faster" (F(1,38) = 24.95, p < .001). The caveat the design brief references is that beginners do NOT show the acquisition-phase blocked advantage predicted by contextual interference theory, and accuracy/evenness did not differ, only speed. Limits: seven-pitch exercises, group instruction, one retention interval.
- Simmons, A. L. (2012). Distributed practice and procedural memory consolidation in musicians' skill learning. Journal of Research in Music Education, 59(4), 357-368. https://eric.ed.gov/?id=EJ951332 (fetch ECONNRESET; ERIC abstract in search). Supports: 29 non-pianists, 9-note sequence; accuracy gains only with 24 h gaps, speed gains with 6 h and 24 h gaps: sleep-based consolidation. Limits: tiny sequence, short study.
- Carter, C. E., & Grahn, J. A. (2016). Optimizing music learning: Exploring how blocked and interleaved practice schedules affect advanced performance. Frontiers in Psychology, 7, 1251. https://pmc.ncbi.nlm.nih.gov/articles/PMC4989027/ (fetched). Supports weakly: 10 advanced clarinettists; "Whenever there was a ratings difference between the conditions, pieces practiced in the interleaved schedule were rated better", but overall not significant; inter-rater correlations 0.02-0.59. Limits: n = 10, subjective ratings.
Verdict: spacing across days is well supported; interleaving is directionally supported for both beginners and advanced players, with small, noisy effects. Design implication: schedule items across sessions and rotate between 2-3 targets within a session rather than blocking one.

### Claim 5. One difficulty dimension at a time; desirable difficulties; tempo follows accuracy
- Bjork, E. L., & Bjork, R. A. (2011). Making things hard on yourself, but in a good way: Creating desirable difficulties to enhance learning. In M. A. Gernsbacher et al. (Eds.), Psychology and the real world (pp. 56-64). Worth. (PDF fetched from UNH but not text-extractable; Semantic Scholar/ResearchGate blocked; citation from search.) Supports: spacing, interleaving, variation and testing raise long-term retention while lowering in-session performance; difficulties are "desirable" only if the learner can overcome them. Limits: essay; no music data.
- Drake, C., & Palmer, C. (2000). Skill acquisition in music performance: Relations between planning and temporal control. Cognition, 74(1), 1-32. https://doi.org/10.1016/S0010-0277(99)00061-X (PubMed abstract fetched via proxy). Supports: novices show "a relative-timing/pitch accuracy trade-off and high incidence of simultaneous pitch/time errors"; tempo and pitch accuracy improve with practice along a power function. Limits: pianists, lab pieces; it documents the trade-off rather than testing an "accuracy first, then tempo" schedule.
- Allingham & Wöllner (2022), above: alternating tempi may beat monotonic ramps. Contradicting nuance to a strict "tempo only after accuracy" rule.
- Wulf, G., & Shea, C. H. (2002). Principles derived from the study of simple skills do not generalize to complex skill learning. Psychonomic Bulletin & Review, 9(2), 185-211. https://doi.org/10.3758/BF03196276 (Springer redirect; search abstract). Caveat: for complex skills, reducing task difficulty early (part practice, guidance) can help because of cognitive load; so "one dimension at a time" is defensible, but not from the desirable-difficulties literature alone.
Verdict: partially supported. The trade-off is real; the literature favours varying tempo (including occasional faster attempts) over a strict gate.

### Claim 6. Immediate vs delayed feedback; guidance hypothesis
- Salmoni, A. W., Schmidt, R. A., & Walter, C. B. (1984). Knowledge of results and motor learning: A review and critical reappraisal. Psychological Bulletin, 95(3), 355-386. https://doi.org/10.1037/0033-2909.95.3.355 (PubMed record fetched via proxy: "No abstract available"). Supports: learning must be measured on no-KR retention/transfer tests; frequent KR can act as a crutch (guidance hypothesis). Limits: simple lab tasks (lever positioning, timing).
- Winstein, C. J., & Schmidt, R. A. (1990). Reduced frequency of knowledge of results enhances motor skill learning. Journal of Experimental Psychology: Learning, Memory, and Cognition, 16(4), 677-691. https://doi.org/10.1037/0278-7393.16.4.677 (PsycNet page did not load; search abstract). Supports: 50 % faded KR matched 100 % KR in acquisition and beat it on delayed no-KR retention. Limits: lever-movement waveform task, undergraduates.
- Wulf & Shea (2002), above. Contradicts for complex skills: "higher frequencies of concurrent feedback during acquisition of complex motor tasks produced increased performance during retention tests compared with lower frequencies." Music performance is a complex skill.
Verdict: mixed. Per-note instant colour is fine for beginners on complex tasks; add an option to fade or summarise feedback (end-of-take report) as skill rises, and measure on unassisted takes.

### Claim 7. Metronome and subdivision for drummers; finger-drumming pedagogy
- Repp, B. H., & Su, Y.-H. (2013). Sensorimotor synchronization: A review of recent research (2006-2012). Psychonomic Bulletin & Review, 20(3), 403-452. https://doi.org/10.3758/s13423-012-0371-2 (PubMed record fetched via proxy). Supports: tapping to a metronome is the canonical timing task; non-musicians show negative mean asynchrony (taps lead by tens of ms); "real or imagined subdivision was shown to extend the tactus beat to slower rates" (from search summary of the review). Limits: finger tapping, not pad striking with velocity.
- Fujii, S., Hirashima, M., Kudo, K., Ohtsuki, T., Nakamura, Y., & Oda, S. (2011). Synchronization error of drum kit playing with a metronome at different tempi by professional drummers. Music Perception, 28(5), 491-503. https://doi.org/10.1525/mp.2011.28.5.491 (UC Press page 403; search abstract). Supports: professional drummers' mean asynchronies ranged 0-13 ms depending on instrument and tempo, i.e. a realistic "tight" window is around 10-15 ms, not 0. Limits: acoustic kit, professionals, small n.
- Finger-drumming pedagogy: no peer-reviewed study found. Search returned only vendor guides (Melodics blog, MPC-Samples layout guide) and general drummer-timing neuroscience (e.g. PMC5387751 on posterior parietal cortex in drummers). Treat pad-specific pedagogy (row-centred hand placement, 5-10 BPM ramps) as practitioner consensus, not evidence.
Verdict: metronome synchronisation and subdivision are well grounded in tapping research; pad-specific pedagogy is an evidence gap.

---

## Gaps and honesty notes
- No hands-on evidence anywhere in Part A; all claims about UI are from documentation.
- JustinGuitar, Yousician and several SAGE/UC Press pages blocked direct fetches; where a proxy was used it is marked. JustinGuitar's per-module practice-routine minute counts and Yousician's calibration procedure were not verifiable.
- Akai's official pages confirm the "Chromatic from C1" default and the preset names but not the literal "36"; the 36 = C1 on A01 figure comes from mpc-tutor and constantpool (third-party).
- Synthesia: no documented latency or offset control found; treat as "none" pending a check inside the app.
