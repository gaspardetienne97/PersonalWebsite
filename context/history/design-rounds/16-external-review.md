# Practice OS external review

Reviewed 5 September 2026. Source: `6c12c511`. Recommendations and implementation details are in [17-review-backlog.md](17-review-backlog.md). Ticket identifiers below refer to that file.

## 1. Environment and coverage

I read the architecture guidance, redesign record, curriculum, active backlog and relevant engines, then used Chromium through Playwright. The existing development server at `localhost:5199` rendered Guide but failed when navigating to Practice: an uncaught Svelte DOM error, `Cannot read properties of undefined (reading 'call')`, left a blank body. The existing production output worked through `npm run preview -- --port 5200`. Its files were built on September 4, immediately before the latest test-only commit. I did not rebuild, change application code, run the database, or commit. The development failure is an environment limitation, not a confirmed production defect.

The preview used an isolated browser context with initially empty storage. Guide, audio activation, Practice and a ten-question mixed ear session took **42.232 seconds**. This is an automation elapsed-time observation, including tool pauses and arbitrary answers, not a human usability benchmark or evidence that I correctly heard the prompts. The four-step routine completed and persisted one journal entry: 597 XP, 22 scoring attempts, 27% accuracy. These intentionally imperfect test results are not the owner's progress.

All 19 drill routes and the listed hubs were visited. Completed runs included Reading, Rhythm, all seven ear routes, Scales, Spider, Chord-Perfect, Two-Hand, Voicings, MPC, Licks, Chord-Scales and Chord Progression. The strongest coverage was ten questions per recognition/melody route, 36 voicing chords, 24 two-hand notes, 23 lick notes, 24 chord-scale notes, 16 pad hits, 12 spider notes and two five-string chord builds. Repertoire used three four-note phrases from a synthetic imported MIDI file; Scales used eight notes; Chord Progression included timed misses. Aerophone long-tone Start/Stop was exercised without a sustaining controller. Retry controls were sampled, including Reading Again, Rhythm Repeat, Chord-Perfect Again and ear Retry mistakes, but every retry was not completed.

**The requested ten-prompts-by-every-supported-instrument matrix is incomplete.** Piano/choice and guitar fretboard paths received the main end-to-end coverage. Ukulele, alternate ear surfaces, all drill variants and physical two-hand technique remain unverified. This is a review with explicit coverage limits, not a comprehensive release certification.

Web MIDI permission and enumeration worked: two Akai Network ports appeared. No incoming physical performance was observed. A separate Chromium with a generated 440 Hz WAV as its microphone detected A4/440.0 Hz; Intonation reported 100% in tune and 98% steadiness; Voice mode accepted one deliberately mismatched answer. These establish synthetic input plumbing, not microphone performance in a room, acoustic chord recognition, MPC velocity feel, LEDs or Aerophone sensors. Desktop captures are 1280 px; phone checks used 375 px and dark mode. Accessibility evidence is the browser tree, DOM focus and keyboard operation, not a spoken screen-reader session. Captures live in [the review screenshot directory](../screenshots/review/).

## 2. Ten changes that matter most

1. **Make mastery describe the skill actually demonstrated (R09).** After the major voicing run, Jazz Path showed four different lessons at the same 92% mastery, including altered voicings that I had never practised. The curriculum, Licks and Chord-Scales reuse `harmony.ii-v-i`. Shared musical foundations are reasonable; declaring separate capabilities complete from the same evidence is not. The path should require relevant variant evidence before promising transfer.

2. **Repair hub tab navigation (R04).** On Library, clicking Reference changed the URL to `?tab=reference` but left Song Library visible. Create's Recorder similarly changed `?mode=recorder` while retaining the beat grid. Direct navigation to those URLs worked. This obstructs reference and recording, two essentials of the learning loop. The route-state helper and URL-reading effects need one coherent authority.

3. **Give Reading a useful correction (R05).** Ten choice answers produced a 10% summary, but each answer advanced immediately without showing the submitted note beside the expected note. A learner needs to understand the mistake while the staff is still present, then retry it. [Simply Piano's documented feedback](https://piano-help.hellosimply.com/en/articles/7943490-learning-with-simply-piano-the-basics) supports explicit correction and distinguishes hinted success.

4. **Remove invented piano fingerings (R02).** Two-Hand labels G4, A4 and B4 with finger 5 because `suggestedFingerings` clamps an ascending pitch index to five. That is not a sequence fingering. Show only authored, pattern-specific suggestions; omit unknown ones. Alfred's scale method supports teaching actual fingering systems, not deriving them from sorted pitch sets.

5. **Expose fretboard keyboard focus (R06).** I focused String 6, fret 5 and played the spider exercise with Enter. No focus location appeared on the visible fretboard: the actual buttons live in an `sr-only` grid. Mirror focus onto the existing visual surface. This is a direct [Focus Visible](https://www.w3.org/WAI/WCAG21/Understanding/focus-visible.html) issue, not a request to replace the fretboard design.

6. **Make results honest about their input (R07).** Mouse taps earned MPC “Velocity 100%” because the router emits constant velocity. Chord-Perfect called pointer answers “strings rang clean.” On-screen recognition is valuable, but it cannot verify touch dynamics, buzzing strings or actual fingering. Mark unavailable dimensions unmeasured and keep practice credit separate from physical technique evidence.

7. **Make the routine serve today's instrument and available time (R10).** The first routine was a generic four-block mix; its engine receives recommendations but no instrument or time budget. It starts mixed ear vocabulary before the tonic-first path. Offer a short guitar, piano or pads block with a stated reason and one transfer activity. The interleaving study supports experimentation, not compulsory switching between four instruments.

8. **Recommend tempo from performance (R03).** A 0% Rhythm result prominently offered “Increase to 110 BPM.” Repeat or slower should lead after failure, with faster still available as a deliberate choice. [Melodics Practice Mode](https://support.melodics.com/en/articles/6777027-practice-mode) supports speed increases contingent on successful play.

9. **Keep ear feedback attached to its question (R08).** Practice mode shows the next question while the preceding answer's feedback sits beneath it. Preserve the answered prompt, selected answer and correct sound until the learner continues, or clearly label a separate previous-answer block. Test mode can continue withholding corrections.

10. **Send the completed routine to its actual journal (R01).** “Open journal” points to `/music/progress?tab=journal`; Progress has no such tab. `/music/track` contains the saved entry. This small fix restores confidence that the work was recorded.

## 3. Per-drill notes

### `/music/learn/reading`

The staff and compact answer controls make the task apparent. Choice errors need immediate, specific correction and a mistake queue. Play-back currently highlights the target before an attempt; make that an explicit hint and distinguish assisted from independent reading (R05, R16).

### `/music/learn/rhythm`

The count-in, pulse stage and signed-offset metrics are useful. My deliberately late run exposed the unconditional faster recommendation. Keep absolute phase scoring, explain a missed start, and lead with repeat/slower after poor results (R03).

### `/music/learn/aerophone`

The fingering target and breath envelope are focused. Long-tone mode correctly waits for sustaining input; I could not finish it with on-screen taps. It nevertheless exposes an “in-tune” zero-cent graphic without an observed pitch. Distinguish waiting from measured zero, calibrate model/controller settings, and interpret bend data before claiming continuous intonation (R26).

### `/music/learn/ear/intervals`

Ten questions, result summary and Retry mistakes worked. Twelve interval choices are a steep first task; use a bounded subset through the plan. Show readable confusion names and preserve answered-question feedback (R08, R10, R11).

### `/music/learn/ear/chord-qualities`

Triads and sevenths provide useful depth. A new account immediately receives diminished seventh material. Keep this advanced vocabulary available, but introduce a smaller diagnostic set and display human labels rather than `diminished-7` (R10, R11).

### `/music/learn/ear/cadences`

Four named choices and a stated tonal task work. Choice mode still says the user can play the answer on an instrument, although this route offers Choice/Pocket. Match instructions to the supported answer mode (R08).

### `/music/learn/ear/scale-degrees`

The 1/5 anchor and unscored tonic exploration are strong foundations. The 50% run provided interpretable confusion counts. Keep the progression; make Pocket reveal follow recall and record answer modality honestly (R15, R09).

### `/music/learn/ear/melody-dictation`

Three-note phrase slots and per-position Expected/Played results are the best corrective detail in the ear group. Octave-equivalent C4/C3 matches deserve an explicit pitch-class explanation; confusion tokens such as `11` should use musical degree names (R11).

### `/music/learn/ear/repertoire-transfer`

The empty state correctly links to Library. Saving a synthetic melody made three phrases available and produced per-note results. Preserve this bridge to real music; fix import navigation and let future review use the existing weak/decayed-degree queue (R04, R19).

### `/music/learn/ear/mixed`

Ten questions completed with 40% accuracy and 300 XP; Retry mistakes started successfully. Switching between interval, chord and cadence tasks gives useful variety, but a cold beginner meets advanced vocabulary without preparation. Start from demonstrated categories and keep each correction attached to its answered question (R08, R10).

### `/music/play/chord-perfect`

Five positions for C major and low-to-high string order are practical. Correct and deliberately wrong builds returned 100% and 80%. The summary does not name the failed string, and “rang clean” exceeds on-screen evidence. Add expected/played string detail with input-qualified language (R07).

### `/music/play/chord-progression`

Current/next chords and “matched off-time” distinguish pitch from rhythm. A late-start run finished with 1/4 matched. Keep this timed performance mode and offer a clear slower retry; physical microphone matching remains untested.

### `/music/play/chord-scales`

Hearing then rebuilding each scale is coherent; three runs yielded 100/88/88%. The next highlighted key permits visual following, and this is note-order practice rather than proof of improvisational scale choice. Qualify mastery and add later guide-tone transfer (R09, R23).

### `/music/play/licks`

Call-and-response material is valuable, but the first example is 23 notes at 150 BPM. I followed highlights to 22/23 with deliberately unrelated timing. The “notes matched” label is appropriately narrow. Add short selectable chunks, then a full unaided phrase and transposition (R18).

### `/music/play/scales`

The tempo ladder, pitch accuracy and evenness feedback work. Eight correct notes produced a next rung and 119 ms evenness error. Preserve both dimensions; authored fingerings and independent attempts should precede stronger mastery claims (R02, R09).

### `/music/play/spider`

The three-string, twelve-note fretboard is clearer than a detached chip sequence. Pitch and timing are separated. Keep all 24 permutations and the fret window; repair keyboard focus and extend Note Finder with positional interval recall (R06, R22).

### `/music/play/two-hand`

Separate hand accuracies correctly identified my weaker right hand, 19% versus 100%. Hand labels work without colour. Replace invented fingers and make phone practice hand-specific because both regions cannot fit together (R02, R17).

### `/music/play/voicings`

The 36-chord sequence and held/lenient choices are useful. In lenient mode, wrong extra notes followed by targets still produced 100%. Preserve this documented beginner mode, but label it assisted note collection and require suitable evidence for independent, held or altered-voicing mastery (R07, R09).

### `/music/play/mpc`

Current pad, sequence and immediate timing feedback support rudiments. Sixteen alternating taps produced 74% total and 100% velocity. Distinguish simulated dynamics, move key assignment away from performance taps, and add a musical groove response rather than more permutations first (R07, R24, R28).

## 4. Paths, routine and coach

Ear Path's tonic-to-melody sequence is a sound default, consistent with [Sonofield's functional approach](https://sonofield.com/blog/sonofield-ear-trainer-method). Its written completion rules mention modalities and session counts that the shared path projection does not enforce. Jazz Path additionally counts skill-less steps in its denominator, so some can never become done (R09, R14).

The coach explains weak evidence numerically, but treats tiny samples confidently and crosses instrument boundaries. Journal displays a separate hardcoded “Today's routine,” including “long tones” linked to Scales, unlike the routine just completed (R10, R12). Memory-only active routines are a documented decision; I would first unify their plan and journal handoff, rather than introduce a second scheduler.

## 5. Hubs

Practice, Library, Create and Progress remain sensible daily destinations. Library import successfully analysed and saved twelve MIDI notes. Song Studio's staff then rejected their ordinary 0.6-beat durations. Switching to the existing Waterfall worked; make that recovery explicit and offer a notation-only projection without changing original timing (R30). Existing last-practised sorting should stay.

Create already has recording, sequencing and comparison. Two ten-note on-screen takes with one changed note produced 90%, 9/10 notes aligned. Repair its tabs before adding another studio. Connect detected Akai ports; advanced SysEx diagnostics can stay secondary. Tuner's synthetic check passed. Settings clearly separates sound, input and timing, but journal export is not a restorable whole-app backup (R25). Guide's setup checklist makes first audio activation understandable. Progress favours XP, streaks and broad percentages; relevant skill evidence and a brief next-session reflection would make it more useful (R09, R21).

## 6. Phone and accessibility

The twelve-route 375 px dark sweep found no document-wide horizontal overflow. Create's sequencer, Connect's routing table and Two-Hand's keyboard have internal scrolling. The last prevents simultaneous on-screen two-hand practice. Site navigation visibly clips “Home” and “Narrator” even though document overflow is suppressed (R29). Fixed navigation crossing a full-page screenshot is not, by itself, an overlap defect.

Fretboard Enter input works but focus is hidden. MPC assignment buttons measure 20×20 px and sit within pad hit areas; move them to setup instead of merely shrinking musical pads (R28). The accessibility tree includes hand labels and result text. Aerophone's waiting graphic and Voice's “On-screen” source label deserve input-state correction (R07, R26). I did not establish a general duplicate-live-region regression or perform full contrast certification.

## 7. Learning design

Immediate correction is uneven; melody results are a good internal model. Retrieval is weakened by visible target answers and undifferentiated assistance. Spacing exists in repertoire review, but general path/dashboard mastery reads stored values without that time projection (R19). Interleaving should follow the learner's task and level: [Carter and Grahn's ten-clarinetist study](https://www.frontiersin.org/journals/psychology/articles/10.3389/fpsyg.2016.01251/full) had mixed statistical results, not proof of one universal schedule. Recording exists; connect it to a goal and reflection. Keep motivation grounded in identifiable improvement rather than raising XP targets.

## 8. New drills and features

Prioritise fretboard interval recall (R22), piano guide-tone voice leading (R23), and MPC groove copy-back (R24). Add Aerophone bend-centre return only after calibration (R27). These extend existing engines and surfaces. Full local backup (R25), attached reflection (R21), and bounded instrument-specific routines (R10) matter more than a new gamification system.

## 9. Aerophone research

[Roland Aerophone Lesson](https://www.roland.com/global/products/aerophone_lesson/) explicitly supports AE-20/AE-30 and offers fingering lessons, play-alongs and breath guidance. I found no basis to promise AE-10 compatibility with that app. Roland confirms bite sensors on AE-10 and AE-20 can affect pitch/vibrato; the AE-20 also supports alternative fingering systems and sensor adjustment. Confidence is high in those manufacturer statements, lower in translating a particular user's settings into MIDI grading.

The app already has long tones, swells, articulation and interval landing. Do not rebuild those. First record model, fingering/transposition assumptions, breath-controller range and pitch-bend range. Current traces sample note attacks and ignore bend events; they cannot describe continuous bite control. Physical AE testing would materially change confidence here. MPC/piano input and simultaneous holds also need a hardware follow-up; port enumeration alone is insufficient.

## 10. Leave alone

Keep the four hubs, local-only architecture, shared shell, native selects, neutral palette, musical tokens, fret windows, authored chord positions and tonic-first ear path. Keep the generous playable surfaces and the distinction between Wait and Performance. Retain deliberately lenient practice with clearer measurement labels. Repair learning evidence, input truth and navigation before commissioning another visual redesign.
