# Practice OS review backlog

5 September 2026. Evidence comes from source `6c12c511` and the existing September 4 production preview. See [coverage and limitations](16-external-review.md#1-environment-and-coverage). Screenshots are relative to the repository root. IDs are stable references, not implementation order. Items are ordered by impact, then effort; dependent work follows its prerequisite. S means under half a day, M one to two days, L more. Research supports the stated principle or reference pattern, not the effectiveness of an untested proposed drill. No tickets have been implemented.

### R01 Open the real journal after a routine

- Type: fix
- Area: `src/routes/music/_components/TodayPlan.svelte`
- Impact: high, the learner can immediately inspect the work that the routine says it saved.
- Effort: S
- Evidence: Complete a routine and click Open journal; the URL is `/music/progress?tab=journal`, which displays Progress. `/music/track` contains the saved daily-routine entry. `docs/screenshots/review/09-journal-link-progress.png`; TodayPlan line 124.
- Principle: A completion action must lead to the promised outcome.
- Research: [Modacity](https://www.modacity.co/home/) supports reviewing practice history and notes. The exact destination correction follows the app's own routes, not a research hypothesis.
- Proposal: Point Open journal to `/music/track`, preferably with the saved entry identifiable. Verify the completed routine's actual entry is visible after clicking; keep one aggregate entry.
- Depends on: none

### R02 Stop deriving piano fingering from sorted pitch rank

- Type: fix
- Area: `src/routes/music/_components/piano/piano-fingering.ts`, Two-Hand and its callers
- Impact: high, piano practice stops teaching arbitrary finger assignments.
- Effort: S
- Evidence: Two-Hand Pulse + line labels G4, A4 and B4 as finger 5. `suggestedFingerings` clamps each ascending unique pitch index to 1–5. Inspect `docs/screenshots/review/mobile-play-two-hand.png` and the helper's callers.
- Principle: Instructional cues must describe an executable technique.
- Research: [Alfred's Complete Book of Scales, Chords, Arpeggios & Cadences](https://www.alfred.com/products/the-complete-book-of-scales-chords-arpeggios-cadences-00-5743) explicitly provides a fingering guide. This supports authored fingering; the publisher description does not validate specific replacement sequences.
- Proposal: Immediately omit unsupported suggestions rather than repeating the last finger. Preserve L/R labels. Allow authored fingering per exercise sequence, key, direction and hand; only show numbers when that mapping exists. Include the seven-note right-hand counterexample in the focused check.
- Depends on: none

### R03 Recommend repeat or slower after a failed rhythm run

- Type: improvement
- Area: `/music/learn/rhythm` results
- Impact: high, learners receive a useful next action after timing failure.
- Effort: S
- Evidence: `docs/screenshots/review/06-rhythm-result.png` shows 0% accuracy and Increase to 110 BPM as the primary action. The result buttons are unconditional in `src/routes/music/learn/rhythm/+page.svelte`.
- Principle: Increase difficulty after stable success, not after any completion.
- Research: [Melodics Practice Mode](https://support.melodics.com/en/articles/6777027-practice-mode) supports successful-repeat-driven Auto BPM. [iReal Pro](https://www.irealpro.com/learn/advanced-practicing-techniques/) qualifies this: unconditional increases can be useful for deliberately finding a limit.
- Proposal: Make Repeat or Slow primary after low accuracy or large timing error; make Faster primary after a clean run. Leave all choices available and explain the recommendation. Treat the exact success threshold as tunable product judgment, not a scientific constant.
- Depends on: none

### R04 Keep hub tabs and their URLs in agreement

- Type: fix
- Area: `route-state.ts`, `/music/library`, `/music/create`; audit Tuner's corresponding pattern
- Impact: high, reference, import and recording become reachable through their visible controls.
- Effort: M
- Evidence: On Library Songs, click Reference: URL becomes `?tab=reference`, but Song Library remains visible. On Create, Recorder changes `?mode=recorder`, but Studio stays visible. Hard navigation to the same destinations works. `docs/screenshots/review/library-tab-url-mismatch.png`. Source: URL-reading effects in both pages and `writeRouteTab`/`syncRouteQuery`.
- Principle: Navigation state, selected control and visible content must have one consistent meaning.
- Research: [SvelteKit shallow routing](https://svelte.dev/docs/kit/shallow-routing) distinguishes history state from navigation. It supports reconciling the route's state model; it does not by itself prove which line causes this reproduction.
- Proposal: Trace shallow history updates against the `$page`-driven effects and remove the stale overwrite. Retain bookmarkable query parameters and existing controls. Add browser checks for clicking every tab, then reload and Back/Forward; verify both panel content and selected state. Reproduce against a fresh build before changing source, given this review's preview limitation.
- Depends on: none

### R05 Explain and retry Reading mistakes

- Type: improvement
- Area: `/music/learn/reading`, `FlashcardSession.svelte`
- Impact: high, incorrect answers become a learning opportunity instead of an unexplained score loss.
- Effort: M
- Evidence: Ten choice answers advanced without visible per-answer correction; the 10% result listed targets and Review markers but not submitted notes. `docs/screenshots/review/05-reading-result.png`; `FlashcardSession.svelte` renders the current prompt and error state, without the previous scored answer.
- Principle: Give specific feedback while the learner still remembers the attempt.
- Research: [Simply Piano's feedback description](https://piano-help.hellosimply.com/en/articles/7943490-learning-with-simply-piano-the-basics) supports showing wrong notes and corrective hints. It does not establish an ideal delay duration.
- Proposal: In practice mode, preserve the staff briefly with Expected D and You chose C, using text and distinct notation marks. Let Continue dismiss it; offer Retry mistakes after the run. Reuse stored attempts and the existing session owner, without a second scoring path. In tests, verify a wrong choice remains associated with the answered staff and retries only missed prompts.
- Depends on: none

### R06 Make fretboard keyboard focus visible

- Type: fix
- Area: `src/routes/music/learn/reading/_components/FretboardInput.svelte` and all consuming routes
- Impact: high, sighted keyboard users can locate and play the selected string/fret.
- Effort: M
- Evidence: Focused String 6 fret 5 and used Enter through a twelve-note Spider run; the visible fretboard never showed a focus cursor. The accessible buttons are inside `class="sr-only grid gap-1"`. `docs/screenshots/review/spider-invisible-keyboard-focus.png`.
- Principle: An operable control needs a visible focus location.
- Research: [WCAG Focus Visible](https://www.w3.org/WAI/WCAG21/Understanding/focus-visible.html) directly supports this correction.
- Proposal: Mirror the focused button's exact string/fret onto the existing fretboard with a distinct outline and text cue; clear it on blur. Preserve target and correctness colours. Ensure Tab, Shift+Tab, Enter and Space work at desktop and phone widths; do not expose a second competing visual fretboard.
- Depends on: none

### R07 Qualify scores by what the input can measure

- Type: improvement
- Area: MPC, Chord-Perfect, Voicings, Voice source readouts and result presentation
- Impact: high, the owner can distinguish screen practice from physical instrumental technique.
- Effort: M
- Evidence: `docs/screenshots/review/mpc-result.png` reports Velocity 100%; `InputRouter.noteOn` hardcodes velocity 1. Chord-Perfect pointer runs say strings rang clean. Lenient Voicings returned 100% despite extra notes. Synthetic Voice input was accepted while the source badge said On-screen. Read `mpc-single-stroke.ts`, `voicing-drill.ts` and route summaries.
- Principle: A measurement label must match its evidence and limitations.
- Research: [Simply Piano](https://piano-help.hellosimply.com/en/articles/7943490-learning-with-simply-piano-the-basics) distinguishes hinted from unhinted success; [Melodics](https://support.melodics.com/en/articles/6777027-practice-mode) separates practice assistance from full-speed performance. These support transparency, not a universal weighting formula.
- Proposal: Display velocity as Not measured for fixed-velocity input and exclude it from the displayed assessed-dimension total. Say Target notes matched for on-screen chord builds; show expected/played string detail. Name lenient voicing results Notes collected and explain that extras are tolerated. Derive Voice's source badge from its active answer source. Preserve practice XP; defer stricter mastery credit to R09.
- Depends on: none

### R08 Keep ear corrections attached to the answered prompt

- Type: improvement
- Area: `EarTrainingSessionView.svelte` and the shared ear session flow
- Impact: high, beginners can associate the correction with the sound and choice that produced it.
- Effort: M
- Evidence: Practice-mode answers immediately change the main question while the preceding feedback appears below the new answer surface. Cadences says to choose or play on an instrument although its modes are Choice/Pocket. Inspect the shared feedback rendering and reproduce with two consecutive different question types in Mixed.
- Principle: Temporal and spatial contiguity make corrective feedback intelligible.
- Research: [Sonofield's method](https://sonofield.com/blog/sonofield-ear-trainer-method) supports context-rich tonal listening; [Anki's active recall explanation](https://docs.ankiweb.net/background.html) supports an answer-then-check cycle. The exact presentation and Continue interaction are design judgment.
- Proposal: Keep the answered sound, selected option, correct option and replay together until Continue in practice mode. Alternatively, label a persistent Previous answer block unmistakably and prevent its sound from competing with the next prompt. Keep Test mode's delayed feedback. Generate instructions from drill and answer mode, removing unsupported promises.
- Depends on: none

### R10 Fit the daily routine to instrument, time and readiness

- Type: improvement
- Area: TodayPlan and `packages/music-core/src/engines/coach` / `daily-routine`
- Impact: high, short sessions directly support the owner's guitar, piano and MPC priorities.
- Effort: M
- Evidence: The cold plan was Mixed, Reading, Rhythm, Scales, each labelled approximately five minutes. `buildPracticeCoachView` supplies recommendations to `buildDailyRoutinePlan` without an instrument or time budget; recommended routes are followed by generic defaults. Mixed introduced advanced vocabulary before the tonic-first path.
- Principle: Set a feasible goal and choose difficulty from relevant evidence.
- Research: [Modacity](https://www.modacity.co/home/) supports planned practice lists. [Carter and Grahn](https://www.frontiersin.org/journals/psychology/articles/10.3389/fpsyg.2016.01251/full) qualifies compulsory interleaving: ten advanced clarinetists and mixed statistical results do not justify one schedule for every learner.
- Proposal: Add Today: Guitar/Piano/Pads and a 5/10/20-minute budget. Build at most the blocks that fit: one relevant technique goal, one review item, optionally a musical application. Cold ear review should use the anchor set. Show the reason and sample count; describe sparse evidence as Try this, not a confident diagnosis. Reuse the current routine engine and preserve manual drill choice.
- Depends on: none

### R09 Require relevant evidence before completing a learning milestone

- Type: fix
- Area: Jazz curriculum, ear path definitions, learning-path projection and mastery ingestion
- Impact: high, progress stops claiming skills the learner has never demonstrated.
- Effort: L
- Evidence: Jazz Path showed Chord-scales, Rootless, Altered and Licks all at 92% after major voicing practice; Altered was never attempted. `JAZZ_CURRICULUM` maps them to `harmony.ii-v-i`; Licks and Chord-Scales ingest that same skill. `buildLearningPath` uses mean mastery >=0.66, without checking the session/modality requirements printed on Ear Path. Domain evidence weighting uses difficulty/partial credit, not assistance or source.
- Principle: Assessment validity requires evidence specific to the promised capability.
- Research: [Piano Marvel](https://pianomarvel.com/en/) separates sight-reading assessment from assisted practice; [Simply Piano](https://piano-help.hellosimply.com/en/articles/7943490-learning-with-simply-piano-the-basics) identifies hinted success. These support differentiated evidence, not any particular numerical threshold.
- Proposal: Keep shared parent skills for recommendations, but require route/variant-specific evidence for milestone completion. Separate major, altered, chord-scale and lick demonstrations; enforce or rewrite Ear Path's printed session/modality criteria. Record assistance and relevant input dimensions on attempts. Do not retroactively infer altered or independent performance from old aggregate history; show Not assessed where provenance is unavailable. Stage the change with migration and focused counterexamples, including a perfect major-only run that cannot finish Altered.
- Depends on: R07

### R11 Render musical names in confusion summaries

- Type: fix
- Area: Shared ear result/confusion presentation
- Impact: medium, review instructions remain understandable without learning internal identifiers.
- Effort: S
- Evidence: Results display `diminished-7 → major`, `m3 → m2`, and melody substitutions involving `11` or `0`. `docs/screenshots/review/ear-chord-qualities-result.png` and `ear-melody-result.png`. These are internal answer/degree representations.
- Principle: Prefer recognition and familiar musical vocabulary to decoding implementation tokens.
- Research: [Sonofield](https://sonofield.com/blog/sonofield-ear-trainer-method) supports degree/function vocabulary. It does not validate this exact summary design.
- Proposal: Format both expected and actual tokens through the existing drill-specific label maps. Distinguish zero-based pitch classes from degree labels before rendering. For octave-lenient matching, say Pitch class matched, octave differs when showing C3 versus C4. Preserve raw tokens in stored data for compatibility.
- Depends on: none

### R12 Show one daily plan in Practice and Journal

- Type: fix
- Area: `/music/track`, TodayPlan, routine projections
- Impact: medium, returning users do not encounter two contradictory instructions for today's work.
- Effort: S
- Evidence: After completing Ear/Reading/Rhythm/Scales, Journal displays a static list with Warm-up · long tones pointing to Scales, then Ear, Rhythm and Jazz voicings pointing to Library. `src/routes/music/track/+page.svelte:41` defines a separate literal routine.
- Principle: The same named plan should have the same content wherever it appears.
- Research: [Modacity](https://www.modacity.co/home/) supports coherent practice lists and history; this duplicate-plan correction is primarily code-grounded judgment.
- Proposal: Reuse the routine/coach projection or remove the static card and link to Practice. Keep the actual completed routine in session history. Do not add a second plan store or alter the documented memory-only execution decision as part of this ticket.
- Depends on: none

### R13 Respect a pinned instrument after settings hydration

- Type: fix
- Area: `src/routes/music/_runtime.svelte.ts` initialization and pinned practice contexts
- Impact: medium, the displayed instrument and input routing agree with fixed-instrument drills.
- Effort: S
- Evidence: Direct visits displayed Piano (pinned) on MPC/Aerophone and Guitar (pinned) on Two-Hand; later phone MPC also showed Guitar (pinned). `initializeSettings` assigns `loaded.activeInstrument` directly, while context registration separately reconciles pinned instruments. `docs/screenshots/review/mobile-mpc-playing.png` plus the accessible control name.
- Principle: System status should accurately describe the active task.
- Research: [Melodics getting started](https://support.melodics.com/en/articles/6777061-get-started-with-melodics) supports instrument-specific setup. The hydration ordering diagnosis is an inference from the observed mismatch and the two assignment paths.
- Proposal: Reproduce cold direct navigation with a saved conflicting instrument, then reconcile loaded settings with the current context before assigning active instrument/router state. Preserve the user's saved preference for unpinned routes. Check MPC, Aerophone and Two-Hand independently; do not merely relabel the button.
- Depends on: none

### R14 Make every counted path step completable

- Type: fix
- Area: `packages/music-core/src/engines/learning-path/index.ts`, Jazz Path
- Impact: medium, a diligent learner can understand and eventually finish the path.
- Effort: S
- Evidence: Jazz shell voicings, improvisation and repertoire have no skill IDs. `meanMastery` returns zero without IDs, while `total` counts every projected step. Skill-less references are skipped by Continue but remain in the denominator; skill-less non-reference steps can remain the unfinished destination indefinitely.
- Principle: Goals need an attainable and explicit completion condition.
- Research: [Anki active recall](https://docs.ankiweb.net/background.html) supports observable review responses. Counting optional reading separately is product judgment rather than an experimentally validated path metric.
- Proposal: Count only assessed steps in the mastery fraction; show references as optional resources or offer an explicitly self-reported Read marker. Give improvisation/repertoire a logged-practice condition labelled participation, or move them out of the mastery denominator. Do not award skill mastery for merely opening a page.
- Depends on: none

### R15 Put recall before Pocket answer reveal

- Type: improvement
- Area: Ear Pocket/listening mode
- Impact: medium, low-friction listening can train retrieval instead of recognition of a visible answer.
- Effort: M
- Evidence: `EarTrainingSessionView.svelte` renders `answerLabel` immediately in listen mode alongside I heard it and Missed it. Path step 1 directs the learner into listening mode.
- Principle: Attempt retrieval before seeing the solution.
- Research: [Anki's background](https://docs.ankiweb.net/background.html) directly supports recall before reveal. [Sonofield](https://sonofield.com/blog/sonofield-ear-trainer-method) qualifies removing the current mode entirely: passive/pocket listening has a legitimate warm-up role.
- Proposal: Preserve an explicitly unscored Listen along option. For Pocket recall, play, let the learner think/sing, then Reveal and self-rate. Label self-reported evidence and keep it distinct from a detected pitch or independently selected answer. Avoid forcing phone touches for an intentionally passive warm-up.
- Depends on: R07

### R16 Make Reading target highlights an explicit hint

- Type: improvement
- Area: Reading Play-back, keyboard and fretboard targets
- Impact: medium, independent reading accuracy becomes distinguishable from following lit keys.
- Effort: M
- Evidence: `FlashcardSession.svelte` builds `pianoHighlights` directly from the current target and sends target MIDI notes to FretboardInput before an answer. A learner can copy the highlight without interpreting the staff. This is source-inspected; the main live Reading run used Choice.
- Principle: Fade scaffolding and measure unaided retrieval separately.
- Research: [Simply Piano](https://piano-help.hellosimply.com/en/articles/7943490-learning-with-simply-piano-the-basics) supports offering keyboard hints after errors and distinguishing hinted outcomes.
- Proposal: Start independent play-back with neutral playable keys. Reveal the target after Help or an error in guided practice. Record the hint on that attempt; keep explicit demonstration/warm-up available. Avoid hiding the playable keyboard itself or penalizing exploration before Start.
- Depends on: R05, R07

### R17 Offer a workable two-hand phone layout

- Type: improvement
- Area: `/music/play/two-hand` at 375 px
- Impact: medium, phone users can practise a meaningful hand task without scrolling between notes during a run.
- Effort: M
- Evidence: The keyboard spans approximately 828 CSS pixels inside a roughly 309-pixel region. The phone view shows the low left-hand area while right-hand targets are offscreen. `docs/screenshots/review/mobile-play-two-hand.png`. There is no page-wide overflow; the limitation is simultaneous playability.
- Principle: The interaction surface must support the motor task it asks for.
- Research: [Simply Piano](https://piano-help.hellosimply.com/en/articles/7943490-learning-with-simply-piano-the-basics) supports separate-hand practice. [WCAG target size](https://www.w3.org/WAI/WCAG22/Understanding/target-size-minimum) qualifies shrinking the whole keyboard to fit.
- Proposal: On narrow on-screen input, make Left or Right the recommended practice choice and frame Both as best with an external keyboard. For Both on-screen, evaluate two stacked bounded hand regions using existing piano primitives. Keep keys comfortably playable and verify required simultaneous targets are visible. Do not equate pointer success with actual two-hand coordination.
- Depends on: R07

### R18 Chunk licks before full call-and-response

- Type: improvement
- Area: `/music/play/licks`, jazz sequence exercise setup
- Impact: medium, piano and guitar learners can isolate a difficult fragment of a long phrase.
- Effort: M
- Evidence: Lick 1 begins with 23 notes at 150 BPM. Results show the whole line after an error, with Again but no fragment selection. `docs/screenshots/review/licks-result.png`; `gradeLickSequence` evaluates note sequence, not performed timing.
- Principle: Practise a small error-bearing chunk, then reintegrate it into the musical phrase.
- Research: [Soundslice looping](https://www.soundslice.com/help/en/player/basic/286/speed-training/) supports repeated sections with controlled tempo. [Yousician Practice mode](https://support.yousician.com/hc/en-us/articles/201558362-Practice-and-Play-modes-in-guitar) supports sectional practice and performance-sensitive speed.
- Proposal: Offer authored phrase boundaries or select a contiguous note range, Hear chunk, slow replay and looped response. Suggest the chunk containing a missed note, then return to the full line. Add an optional hidden-target recall pass. Preserve existing note-only scoring labels until performed rhythm is actually assessed; reuse the shared transport.
- Depends on: none

### R19 Project current mastery consistently when choosing review

- Type: improvement
- Area: Skills/dashboard/path reads and the existing repertoire review queue
- Impact: medium, previously strong but stale material can return to practice without contradictory mastery displays.
- Effort: M
- Evidence: `SkillGraphStore.getMastery` returns stored state; dashboard and path use its mastery directly. `ear-training/repertoire.ts` explicitly applies `applyDecay(..., now)` while ranking phrases. Domain ingestion decays on a new event, so time is treated differently across read surfaces.
- Principle: Retrieval practice should respond to elapsed time and uncertainty.
- Research: [Anki](https://docs.ankiweb.net/background.html) supports spaced review. It does not validate the app's fixed musical decay rate or justify importing a second scheduling framework.
- Proposal: Reuse `applyDecay` in a pure now-aware read projection used for review priority and current estimates. Preserve historical earned achievements rather than silently revoking them. Explain Last practised and Due for review; keep the current rate visibly heuristic. Verify an old strong skill changes priority without mutating history or double-applying decay.
- Depends on: none

### R20 Compare results under comparable setups

- Type: improvement
- Area: `LastRunDelta.svelte`, session reference lookup and drill result metadata
- Impact: medium, improvement statements compare equivalent tasks rather than unrelated difficulty settings.
- Effort: M
- Evidence: LastRunDelta looks up sessions by required tags and a before-visit timestamp. For example, Scales uses broad drill tags while key, direction, span and tempo can change. The component deliberately excludes mid-visit retries; it can still say First logged run after Again within that visit.
- Principle: A progress comparison needs a stable task and honest baseline.
- Research: [Modacity](https://www.modacity.co/home/) supports comparison and reflection across practice. Exact variant matching and the baseline wording are product judgment, not a validated statistical model.
- Proposal: Match existing stored variant/setup metadata where available and show the baseline's tempo and input mode. Otherwise say Previous scales session, different setup instead of implying a controlled comparison. Keep the documented before-visit baseline; reword the empty message to First visit with a logged run, or explicitly state that comparisons update on a later visit. Do not reconstruct missing metadata from tags.
- Depends on: none

### R21 Attach a goal and reflection to the completed practice

- Type: new feature
- Area: Routine/drill summaries, Practice Journal and existing Recorder links
- Impact: medium, the owner leaves each short session knowing what to change next time.
- Effort: M
- Evidence: Routine summary stores one aggregate note; Journal offers a separate free-text entry. Create already supports takes and comparison, but the tested drill summaries do not connect a specific performance to an intended improvement.
- Principle: Deliberate practice combines a goal, observation and a next adjustment.
- Research: [Modacity](https://www.modacity.co/home/) supports practice notes, recording and iterative improvement. This supports the workflow, not automated diagnosis from arbitrary audio.
- Proposal: Add optional one-line Goal before a block and Next time after it, attached to the existing session ID. Link an existing take or Open Recorder with the session context. Prompt for one observation, not a compulsory questionnaire. Show that reflection when the same practice recipe returns. Self-reflection records participation and context, not automatic mastery.
- Depends on: R01

### R22 Add fretboard interval recall within a position

- Type: new drill
- Area: Spider's existing Note Finder mode and fretboard-note-finder exercise
- Impact: medium, guitar practice connects fretboard knowledge to movable musical relationships.
- Effort: M
- Evidence: Existing Note Finder trains target notes, while Spider trains fixed permutations. Neither asks the learner to locate an interval from an unlabelled anchor. Reuse `fretboard-note-finder.ts` and FretboardInput; do not create another fretboard renderer.
- Principle: Retrieve relationships and vary context to support transfer.
- Research: [Fretonomy](https://fretonomy.com/) supports customizable interval/fretboard games and instrument practice. The precise scoring and progression below are design judgment; its marketing is not an efficacy study.
- Proposal: Skill: locate thirds, fifths and octaves from an anchor. Prompt: marked anchor plus Find its major third within this fret window, with answer labels hidden. Answer/surface: choose a string/fret or play a note through MIDI/monophonic audio. Score exact position only when on-screen position evidence exists; hardware without string identity receives pitch-only credit. Mastery: track interval, region and independent accuracy, introducing new regions after repeated success. Start with guitar, reuse tuning for ukulele later. Reference: Fretonomy's interval games.
- Depends on: R06, R07

### R23 Add guide-tone voice-leading practice

- Type: new drill
- Area: Voicings as a new constrained variant, with existing jazz/voicing engines
- Impact: medium, piano learners connect static chord knowledge to smooth comping.
- Effort: M
- Evidence: Current Voicings grades pitch classes, tolerates extra notes in lenient mode and does not require a particular register or economical movement. Two-Hand has shell patterns, but does not ask the learner to choose the next guide-tone connection.
- Principle: Practise a musical decision under a narrow, measurable constraint.
- Research: [iReal Pro advanced practice](https://www.irealpro.com/learn/advanced-practicing-techniques/) supports sparse accompaniment, transposition and focused changes. Existing JT8/JT9 material supports shell/rootless context. Neither validates an exact minimum-motion grading threshold.
- Proposal: Skill: connect the third and seventh through ii-V-I. Prompt: current two-note voicing, next chord symbol and a bounded register, initially one key. Answer: play two tones on the piano surface or MIDI. Score chord membership and movement of matched voices separately, accepting musically equivalent minimum-motion solutions; do not grade expressive rhythm yet. Mastery: independent voice-leading evidence, separate from generic ii-V-I recognition, then additional keys and rhythms. Reuse Voicings' lifecycle and transport. Reference: guide-tone/shell practice, with iReal-style sparse backing.
- Depends on: R09

### R24 Add one-bar MPC groove copy-back

- Type: new drill
- Area: MPC Rudiments, rhythm-pattern engine and existing pad kit
- Impact: medium, pad technique transfers into hearing and performing an actual groove.
- Effort: M
- Evidence: MPC offers single strokes, doubles, paradiddle and moving accent, all built around left/right pad targets. Create has kick/snare/hat sounds and a beat grid, but the reviewed drill set lacks a multi-voice groove memory response.
- Principle: Integrate component technique into a short musical task.
- Research: [Percussive Arts Society rudiments](https://pas.org/rudiments/) supports the existing technical foundation. [Melodics](https://support.melodics.com/en/articles/6777027-practice-mode) supports looped, slowed pad practice. The ear-copy format and scoring are a proposed extension, not proven by those sources.
- Proposal: Skill: retain and reproduce kick/snare/hat placement. Prompt: hear one bar, then one count-in and one response bar, starting with kick/snare before hats. Answer/surface: mapped MPC pads or on-screen grid. Score onset windows, omissions and extra hits by voice; grade accent contrast only with variable-velocity evidence. Mastery: store groove family, tempo and independent response accuracy, then add syncopation. Reuse the transport and kit map; optionally open the result in the existing beat grid for inspection. Reference: Melodics musical pad lessons and PAS rudiment-to-music progression.
- Depends on: R07

### R26 Calibrate Aerophone input before grading its sensors

- Type: improvement
- Area: Connect profiles, Aerophone setup, `aerophone-traces.ts`
- Impact: medium, wind practice measures the configured controller rather than assumptions about its defaults.
- Effort: M
- Evidence: Aerophone drills hardcode breath controller 2; `pitchCents` reads attack frequency or quantized note number. MIDI parses pitchBend, but the Aerophone traces do not use it. The waiting long-tone stage exposes an in-tune zero-cent graphic before any pitch. No physical sensor run was completed.
- Principle: Calibrate the measurement channel and distinguish absent data from zero error.
- Research: [Roland AE-20](https://www.roland.com/us/products/aerophone_ae-20/) supports configurable fingering and sensors. [Roland's reed explanation](https://support.roland.com/hc/en-us/articles/360055300471-Aerophone-How-Does-the-Reed-on-the-Aerophone-Work) confirms bite-driven pitch/vibrato. [TonalEnergy](https://www.tonalenergy.com/tet-user-guide-android) supports time-based pitch feedback; it does not establish MIDI bend range.
- Proposal: Record model, concert/written pitch convention, transposition, fingering system, breath CC and configured bend range in the existing instrument profile. Show incoming note/CC/bend values and a short calibration capture. Use Waiting for pitch before any valid sample; do not display MIDI attack quantization as continuous intonation. Reference diagrams must name their supported fingering convention. Verify note-off, breath and bend on the owner's AE before enabling full sensor mastery.
- Depends on: R07

### R27 Add Aerophone bend-centre return practice

- Type: new drill
- Area: Aerophone as a new calibrated technique variant
- Impact: medium, the secondary instrument gains a targeted bite-control exercise absent from existing long tones and interval landings.
- Effort: M
- Evidence: Existing exercises cover steady breath, swell, articulation and note-to-note landing. `aerophone-traces.ts` does not grade pitchBend movement, although the MIDI engine normalizes it.
- Principle: Isolate expressive control while holding other variables steady.
- Research: [Roland's reed explanation](https://support.roland.com/hc/en-us/articles/360055300471-Aerophone-How-Does-the-Reed-on-the-Aerophone-Work) supports pitch/vibrato control by bite. [Aerophone Lesson](https://www.roland.com/global/products/aerophone_lesson/) supports instrument-specific practice but does not prescribe this exercise; the exercise design is judgment alone.
- Proposal: Skill: return to calibrated pitch centre without changing the fingered note. Prompt: sustain a comfortable note, follow a modest bend-and-return envelope, then hold centre. Answer/surface: MIDI bend plus breath trace; on-screen demonstration is unscored. Score centre error, settling time and breath continuity separately against configured sensor range. Mastery: only complete calibrated hardware captures, advancing consistency before envelope size. Reuse long-tone presentation and exercise hosting. Reference: Roland's bite-sensor capability, with modest targets chosen after physical validation.
- Depends on: R26

### R30 Keep imported expressive MIDI readable

- Type: improvement
- Area: Song Studio notation projection and `packages/music-core/src/engines/notation`
- Impact: medium, imported performances remain readable without requiring the learner to diagnose the failed staff view.
- Effort: M
- Evidence: A synthetic 90 BPM MIDI with twelve 0.4-second notes imported and saved successfully; Song Studio's default staff displayed Unsupported notation duration: 0.6 beats. Switching to the existing Waterfall rendered the notes successfully. `notation/index.ts` throws when duration is not in its supported set. `docs/screenshots/review/song-unquantized-staff.png`.
- Principle: Recover gracefully when valid source data exceeds a view's representation.
- Research: [Soundslice](https://www.soundslice.com/help/en/player/basic/286/speed-training/) supports practising an intelligible score section, but provides no evidence for a specific MIDI quantization algorithm. This fallback and projection proposal is judgment alone.
- Proposal: Preserve original canonical note timing. Explain the staff limitation in plain language and link to the existing Waterfall directly beside the error. Add optional notation-only quantization with explicit grid choice and a preview; do not silently rewrite performance data. Check triplets, expressive durations and overlapping voices before advertising broad automatic transcription.
- Depends on: none

### R25 Export and restore the whole local practice collection

- Type: new feature
- Area: Settings and existing PracticeStore/media persistence
- Impact: medium, long-term learning history and repertoire can survive a browser move or storage loss.
- Effort: L
- Evidence: Settings offers Export journal, implemented as session JSON, plus Reset local data. There is no corresponding whole-app restore action; songs, mastery, takes and settings extend beyond the exported sessions. `src/routes/music/settings/+page.svelte:56`.
- Principle: Durable personal learning depends on recoverable local data.
- Research: [Anki backups](https://docs.ankiweb.net/backups.html) supports a restorable collection and explicitly distinguishes media-inclusive exports from data-only backups. This supports local backup, not adding accounts or mandatory cloud sync.
- Proposal: Add a versioned collection export/import using existing stores and installed archive support. Include scores, sessions, mastery, settings and a manifest of optional media. Show size and excluded media before export. Validate an import before writing, show replacement/merge consequences and provide recovery on failure. Test a complete round trip in a fresh isolated browser, including a saved song and take. Keep journal JSON as a separate lightweight export.
- Depends on: none

### R28 Move MPC key assignment out of the playing surface

- Type: improvement
- Area: `MpcPadGrid.svelte` key mapping controls
- Impact: low, phone pad taps are less likely to enter key assignment accidentally.
- Effort: S
- Evidence: During mobile MPC play, Assign key for pad controls measure 20×20 CSS pixels and occupy the pad corners. `docs/screenshots/review/mobile-mpc-playing.png`; each assignment button uses `size-5`.
- Principle: Separate performance gestures from configuration and provide adequate targets.
- Research: [WCAG Target Size Minimum](https://www.w3.org/WAI/WCAG22/Understanding/target-size-minimum) supports 24-pixel targets or applicable spacing exceptions. This review does not claim every 20-pixel control automatically fails; the overlapping performance context is the practical concern.
- Proposal: Display key labels as non-interactive cues during a run. Put remapping in a single Edit key map control in setup, with comfortable targets and keyboard access. Preserve existing mappings and pad sizes; no new mapping system.
- Depends on: none

### R29 Prevent clipped site navigation on narrow Music pages

- Type: fix
- Area: Shared site header as displayed above Music
- Impact: low, phone users can read and reach the surrounding site's navigation reliably.
- Effort: S
- Evidence: The 375 px dark captures clip Home and Narrator in the top site bar. `docs/screenshots/review/mobile-practice.png` and `mobile-create.png`. Document scroll width does not exceed the viewport, so overflow suppression hides the symptom rather than fitting the content.
- Principle: Reflow should preserve readable, operable navigation.
- Research: [WCAG Focus Visible](https://www.w3.org/WAI/WCAG21/Understanding/focus-visible.html) supports visible keyboard location, but does not prescribe a particular header. The proposed compact navigation is design judgment.
- Proposal: Use the existing site's compact navigation pattern if available; otherwise collapse the text links behind one labelled menu at narrow widths. Keep the site's root experience and Music's four-tab navigation. Verify all site links by keyboard and pointer without relying on horizontal page scrolling.
- Depends on: none
