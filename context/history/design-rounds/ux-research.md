# Practice OS redesign: UX research on drill apps and the learning literature

Scope: drill setup and onboarding, target presentation on an on-screen keyboard, real-time feedback and error display, session pacing and end-of-drill summaries, streaks and progression, mobile layouts for hands-busy instrument practice, and accessibility. The reader is the single intermediate adult user of Practice OS, practising alone in short sessions on desktop and on a phone propped at the piano, with Web MIDI (keyboard and Aerophone), an on-screen piano, and a hint-only microphone.

Research date: September 2026. Every product or research claim carries its URL inline. Where no source was found, the claim is marked "unsourced".

## 1. Summary

- Every major piano app converges on the same core interaction for learning material: a "wait for the correct note" mode where playback pauses until the right key is pressed, with a tempo slider and section looping beside it. Simply Piano, flowkey, Yousician, Synthesia, Melodics and Piano Marvel all ship it under different names. This is the baseline Practice OS should match and then improve on with rhythm scoring, which most apps neglect.
- The motor-learning literature (guidance hypothesis) says feedback on every trial helps performance during practice but can hurt retention, because the learner leans on the app instead of their own error detection. Practice OS should default to immediate feedback for new material and offer a "summary only" or reduced-frequency feedback mode for material the user already knows.
- Colour-only feedback (green/red notes) is the industry default and fails both WCAG 1.4.1 and the user's own needs when glancing from a phone. Pair colour with shape, position on the keyboard, and a short text or audio cue.
- Rhythm is the blind spot. Reviewers criticise Simply Piano for letting wrong rhythms pass as all green. Melodics and rhythm trainers show early/late per note. Practice OS already has MIDI timestamps, so per-note timing offsets should be first-class.
- End-of-drill summaries in the better products give a small number of numbers: accuracy percentage, per-note breakdown (correct / close / missed), a tier (bronze/silver/gold or stars), and a per-attempt trend. Duolingo adds XP and a combo bonus. For a single user with no social layer, the trend across attempts is what matters most.
- Streaks work through loss aversion, and Duolingo's own data shows that forgiveness features (streak freeze, weekend amulet) improve retention rather than dilute it. Any streak in Practice OS should be forgiving by default.
- Spaced repetition in the Anki sense (per-item scheduling) is well supported for declarative knowledge (chord spellings, theory, interval labels) but the evidence for spacing motor sequences within a session is weak; interleaving across drills within a session has better support. Schedule theory and ear items like flashcards; schedule motor drills by interleaving, not by forgetting curves.
- Anki's four-button grading is overkill; its own manual says two buttons (Again / Good) are fine. For self-graded items in Practice OS, use two buttons, three at most.
- Mobile at the piano is a situational impairment: hands on the keys, phone at arm's length, landscape. Targets should exceed the 44pt / 48dp platform minimums, state must be readable at a glance, and the primary action must be reachable without leaving the keyboard (a MIDI note or a foot pedal, not a tap).
- Onboarding in commercial apps is a funnel (instrument, level, goals, connect device). For a single known user, the equivalent is a fast per-drill setup with sensible saved defaults and a "last used" resume, plus an unobtrusive input-source check.

## 2. Drill setup and onboarding

### What the products do

Tenuto exposes 24 exercises, each "highly customizable": clefs, range, key signatures, note names, accidentals, and a Challenge Mode that adds a time or question limit so you can beat a previous score. MIDI input works alongside touch. (https://www.musictheory.net/products/tenuto/features, https://thetattooedpianoteacher.com/tenuto-app-review/)

Functional Ear Trainer organises training into a step-by-step path where the granularity is explicit: lower tetrachord, upper tetrachord, full octave, then random keys across octaves. Each question starts with a I-IV-V-I cadence to establish the key, and after the answer the tone resolves to the tonic so the ear hears the function. (https://advancingmusician.com/functional-ear-trainer-app/, https://apps.apple.com/us/app/functional-ear-trainer/id1088761926)

Complete Rhythm Trainer arranges 252 drills into 4 levels and 30 chapters, with five drill types (imitation, reading, dictation, two-voice reading, two-voice dictation) and four notation styles. Chapters are completed by earning 3 stars per drill. (https://completerhythmtrainer.com/)

Piano Marvel splits any piece into Minced, Chopped and Whole steps in its Learn path, so chunk size is a first-class setup choice rather than a manual loop selection. (https://pianistscompass.org/reviews/apps/piano-marvel/)

Soundslice snaps loops to the nearest note, rest or barline, runs from 25% to 200% speed, and saves a bar range as a named clip. (https://www.soundslice.com/blog/199/introducing-enhanced-slowdown-and-perfect-looping/, https://www.soundslice.com/features/)

The Roland Aerophone Lesson app presents 12 fingering and scale lessons in a flash-card format, shows the note for each key press, animates breath, and includes 11 play-along songs with a guide melody and fingering display "without music notation." (https://www.roland.com/global/products/aerophone_lesson/)

Note: tonic.app resolved to a parked domain at research time, so the "Tonic" product could not be inspected. The App Store lists "Daily Tonic: Ear Training Pro" with intervals, chords, scales and progress tracking, but the listing gives no interaction detail. (https://apps.apple.com/us/app/daily-tonic-ear-training-pro/id6758660102)

### What the research says

Interleaving across tasks within a session beats blocked repetition for retention. In a study of ten advanced clarinetists, technical performance measured one day later was rated better for pieces practised in an interleaved schedule (alternating every 3 minutes) than in a blocked one (12 minutes straight), and eight of ten made favourable comments about the effect on goal setting, focus and mistake identification. (https://pmc.ncbi.nlm.nih.gov/articles/PMC4989027/)

### What applies to Practice OS

- Adopt the Tenuto pattern of per-drill parameters (key set, range, hand, voicing type, tempo, question count or time cap) with saved defaults and a Challenge toggle. This maps directly onto chord voicings, scales, progressions and licks.
- Adopt Functional Ear Trainer's explicit granularity ladder for ear training and for scale and spider drills (subset, then full range, then random keys).
- Adopt Piano Marvel's chunk-size choice (Minced/Chopped/Whole) for licks and two-hand coordination rather than asking the user to hand-select loop ranges every time.
- Build a session composer that interleaves 2 to 4 short drills, following the clarinet study, instead of the current one-drill-at-a-time flow.
- Skip commercial onboarding funnels (instrument, goals, skill quiz). There is one user; the only onboarding that matters is an input-source check (MIDI device detected, Aerophone detected, mic hint state) that appears only when the source changes.

## 3. Target presentation on a keyboard

### What the products do

Synthesia uses descending coloured blocks: colour encodes hand, block length encodes duration, and sheet music can be shown alongside or hidden. Melody Practice waits for the correct key regardless of tempo, hand separation lets Synthesia play the other hand, finger hints are one click away, and upcoming notes can be shown on a lighted keyboard. (https://synthesiagame.com/, https://hub.yamaha.com/?p=44644)

Simply Piano shows the target on a visual keyboard as a hint after a wrong note: a note played correctly with no hint is blue, played correctly after a hint is yellow, and an incorrect note in moving stages is red. (https://piano-help.hellosimply.com/en/articles/7943490-learning-with-simply-piano-the-basics)

Yousician colours notes by the finger to use ("yellow means the pointer finger"), not by correctness. (https://support.yousician.com/hc/en-us/articles/204796991-Practice-and-Play-modes-in-piano)

flowkey shows a video of the pianist's hands above the sheet music, with hand selection, loop and slow motion. (https://www.flowkey.com/en, https://www.pianodreamers.com/flowkey-review/)

The Aerophone Lesson app shows the corresponding note for each key press and a fingering diagram alongside the guide melody. (https://www.roland.com/global/products/aerophone_lesson/)

### What the research says

Cognitive load theory applied to instrumental performance identifies music reading, motor control and interpretation as concurrent contributors to load, and overload occurs when working memory cannot process information at the rate it arrives. (https://openscholar.uga.edu/record/15742/files/price_sylvia_t_201005_edd.pdf, https://www.researchgate.net/publication/247513607_Cognitive_load_theory_and_music_instruction) The practical implication: do not show staff, keyboard highlight, chord symbol, fingering and a scrolling waterfall simultaneously by default.

### What applies to Practice OS

- Keep the on-screen keyboard as the primary target surface for voicings, scales and progressions, since those drills are about hand shape rather than reading. Encode hand by colour hue and confirmation by a second channel (fill vs outline, or a check glyph) so colour is never the only signal.
- Show fingering on demand (Synthesia's one-click) rather than always on.
- Offer the waterfall (already present for Reading and Song) as an alternate view, not stacked with the keyboard, to respect load limits.
- For the Aerophone trainer, mirror Roland's approach: show the target note name, a fingering diagram, and the detected note, without staff notation by default.
- Do not build a video-of-hands layer (flowkey). It is expensive and adds nothing for drills on known material.

## 4. Real-time feedback and error display

### What the products do

Wait mode is universal. Simply Piano's Practice mode "will wait for you to play the note correctly before moving on" with hints. (https://piano-help.hellosimply.com/en/articles/7943490-learning-with-simply-piano-the-basics) flowkey's Wait Mode "waits for you to hit the right notes and chords." (https://www.flowkey.com/en) Yousician has a Wait To Play toggle that "pauses the song until you play the correct note," plus a tempo slider in Practice mode. (https://support.yousician.com/hc/en-us/articles/204796991-Practice-and-Play-modes-in-piano) Melodics' Wait feature pauses playback "until you get it correct." (https://melodics.com/how-it-works) Piano Marvel's Prepare mode is described as a "wait for me" mode that assesses note accuracy at your own pace. (https://www.pianodreamers.com/piano-marvel-review/) Synthesia's Melody Practice "waits for you to play the correct note before moving on." (https://synthesiagame.com/)

Colour coding of results: Playground Sessions turns correct notes green and incorrect ones red during play. (https://smarterlearningguide.com/playground-sessions-review/) Skoove shows a green dot above each correct note and a red dot above incorrect ones. (https://pianoers.com/skoove-review/) Piano Marvel shows correct notes green and incorrect red on the staff. (https://pianistscompass.org/reviews/apps/piano-marvel/) Melodics goes further: green for correct timing and length, orange and purple for early and late, red for missed. (https://promusicianhub.com/melodics-review/)

Yousician uses a live points multiplier that starts at 3x and rises to 5x with correct, well-timed notes, visible in the top left during play. (https://support.yousician.com/hc/en-us/articles/204796991-Practice-and-Play-modes-in-piano)

Rhythm apps show timing at note level. Complete Rhythm Trainer is described as correcting timing errors instantly with millisecond accuracy, and the category commonly shows whether each tap landed early, late, short or long. (https://www.beattight.com/rhythm-practice-apps/index.html, https://completerhythmtrainer.com/)

The known failure: a Simply Piano review notes you can "play the wrong rhythm entirely and still get all green notes," and yellow only appears when you hesitate too long. The reviewer calls the three-colour system "too simple for its own good." (https://pianistscompass.org/reviews/apps/simply-piano/)

### What the research says

The guidance hypothesis (Salmoni, Schmidt and Walter, 1984) holds that frequent extrinsic knowledge of results improves performance during acquisition but degrades retention, because learners rely on the external signal instead of building their own error detection. (https://www.semanticscholar.org/paper/Knowledge-of-results-and-motor-learning:-a-review-Salmoni-Schmidt/59f3a052b4b5187a91cb9b8d0813e23f3dffbc03, https://pubmed.ncbi.nlm.nih.gov/7886280/) Reduced KR frequency and summary KR both improved retention in follow-up work. (https://www.researchgate.net/publication/232429606_Reduced_Frequency_of_Knowledge_of_Results_Enhances_Motor_Skill_Learning, https://link.springer.com/chapter/10.1007/978-94-011-3626-6_6) Bandwidth KR (feedback only when error exceeds a tolerance) is a related technique with its own evidence. (https://journals.sagepub.com/doi/10.1080/14640749008401249)

The picture is not uniform. A 2016 study on learning a novel limb coordination pattern with augmented auditory feedback found more feedback was better, so the effect depends on task and feedback modality. (https://www.ncbi.nlm.nih.gov/pmc/articles/PMC4893479/)

Self-controlled feedback (learner decides when to see results) helps motor learning, but the benefit disappears if a secondary cognitive load is imposed during or after the task. (https://www.ncbi.nlm.nih.gov/pmc/articles/PMC7283715/) This argues for keeping the feedback UI itself low-load.

### What applies to Practice OS

- Keep wait mode as the default for new voicings, licks and coordination drills, since every product converges on it and it prevents rehearsing errors.
- Add a "flow" or "assess" mode (Piano Marvel's Prepare vs Assess split) where playback does not wait and feedback is withheld until the end. This is the guidance-hypothesis mode for material the user can already play. (https://www.pianodreamers.com/piano-marvel-review/)
- Add bandwidth feedback as an option: flag only notes outside a timing tolerance (for example 40 ms), which reduces visual noise on near-correct playing and matches the literature.
- Show early/late per note (Melodics' orange/purple) using MIDI timestamps. The app already has the data; the products that skip this are criticised for it.
- Do not use a live points multiplier (Yousician). It is a game-retention device and adds load without information for a solo intermediate user.
- Pair every colour with a second channel: outline vs fill, a small glyph, or the note's position on the keyboard. See section 8.

## 5. Session pacing and end-of-drill summaries

### What the products do

Playground Sessions gives a 0 to 100% score after each exercise, broken down into how many notes were correct, close, and completely off, and converts the percentage to points. (https://smarterlearningguide.com/playground-sessions-review/)

Piano Marvel calculates a percentage at the end of a lesson and awards bronze for 80 to 90%, silver for 90 to 95%, and gold at 96% and above. Its SASR sight-reading test advances you on 80% or better, gives a red strike below 80%, and ends after three strikes with a score out of 1900. (https://pianistscompass.org/reviews/apps/piano-marvel/, https://pianomarvel.com/en/feature/sasr, https://yourmusiclessons.com/piano-marvel-review/)

Simply Piano's end-of-song screen reports the number of correct notes, a timing score, and how much assistance was needed; the reviewer wished this detail existed everywhere in the app. (https://pianistscompass.org/reviews/apps/simply-piano/)

Melodics gives "a breakdown of how you did, and how you're improving with each attempt," lets you watch a playback of the performance, and displays practice history as a calendar. (https://melodics.com/how-it-works)

Duolingo's lesson-end screen awards base XP (typically 10, or 20 for the last lesson in a skill) plus a combo bonus of 1 to 5 XP for the longest run of correct answers. (https://duolingo.fandom.com/wiki/XP, https://duolingo.fandom.com/wiki/Combo_bonus) It is presented as a sequence of celebratory cards (XP, time, accuracy) with sound and animation (https://blakecrosley.com/guides/design/duolingo, https://mobbin.com/explore/screens/57ff71bb-9945-41d6-8d1e-88be5bcb0944); the exact current card set is unsourced beyond that screenshot gallery.

Anki's review loop shows the answer, then four buttons (Again, Hard, Good, Easy), each labelled with the next interval it would produce. The manual says Good should be used 80 to 95% of the time and that using only Again and Good is acceptable. (https://docs.ankiweb.net/studying.html)

### What the research says

Summary KR (feedback aggregated after a block of trials) improved retention over per-trial KR in Schmidt and colleagues' work, which supports an end-of-drill summary as the primary feedback moment for known material. (https://link.springer.com/chapter/10.1007/978-94-011-3626-6_6) Interleaved-practice participants reported that shorter segments made mistakes easier to identify, which supports short drill blocks with a summary between them. (https://pmc.ncbi.nlm.nih.gov/articles/PMC4989027/) Melodics' 5-minute daily goal, justified as "shorter, more regular practice sessions are more effective," is consistent with this. (https://melodics.com/how-it-works)

### What applies to Practice OS

- End-of-drill summary contents, in order: percentage, then a note-level breakdown (correct / early / late / wrong / missed), then a tier (three tiers is enough, matching Piano Marvel's thresholds), then a one-line delta versus the previous attempt and a small trend of the last 5 to 10 attempts. Everything else is secondary.
- Offer a "replay my attempt" (Melodics) on the on-screen keyboard, since the app has the MIDI events.
- Offer a two-button self-grade (Again / Good) for ear and theory items only. Motor drills are graded by the app, so self-grading is redundant there.
- Use SASR-style adaptive difficulty for sight reading: advance on 80%, three strikes ends the set. The app already has a Reading mode with a preview epoch; this gives it a stopping rule.
- Skip XP and combo bonuses. They exist to drive daily returns in a mass-market product; for one user the attempt trend is the honest signal.

## 6. Streaks, progression and spaced repetition

### What the products do

Duolingo's streak counts consecutive days of meeting a daily goal, shown as a flame; missing a day resets it. Its blog reports a Weekend Amulet (freeze) made users 4% more likely to return a week later and 5% less likely to lose their streak, and a Streak Wager raised Day-7 retention by 14%. The stated lesson: "giving users permission to rest actually increases long-term engagement." (https://blog.duolingo.com/how-streaks-keep-duolingo-learners-committed-to-their-language-goals/) Third-party analysis attributes a 21% churn reduction to Streak Freeze for at-risk users. (https://www.strivecloud.io/blog/gamification-examples-boost-user-retention-duolingo)

Critics note the loop is deliberately easy so users keep logging days. (https://dev.to/yaptech/duolingos-shallow-learning-trap-gamified-streaks-harmful-habits-4134) Melodics shows "stops, starts and hottest Streaks" on a calendar. (https://melodics.com/how-it-works) Anki schedules each card by its own interval and grade, with Again as fail and Hard/Good/Easy as pass. (https://docs.ankiweb.net/studying.html) Complete Rhythm Trainer gates chapter completion on 3 stars per drill. (https://completerhythmtrainer.com/)

### What the research says

Spacing for motor sequences on piano: a 100-participant study varying the gap between two practice sessions (0 to 15 minutes) found "no spacing effect," concluding the effect "may not always be demonstrable for complex motor skills." (https://journals.plos.org/plosone/article?id=10.1371/journal.pone.0182986) A review of blocked vs interleaved music practice states there are no extant studies establishing a spacing effect for musical skills, while the contextual interference (interleaving) effect is better supported. (https://www.frontiersin.org/articles/10.3389/fpsyg.2016.01251/full) Perceived fluency during blocked repetition is a poor indicator of long-term learning. (https://www.ncbi.nlm.nih.gov/pmc/articles/PMC4989027/)

### What applies to Practice OS

- Use Anki-style per-item scheduling for declarative items: chord spellings, scale degrees, interval and chord-quality recognition, theory and jazz-lesson facts. Two grades (Again / Good) with the app also recording response latency.
- Do not apply forgetting-curve scheduling to motor drills. Instead, rotate voicings, scales and licks through an interleaved session composer, and surface items by recency and last score rather than a predicted forgetting date.
- If a streak exists, count practice days with a built-in weekly freeze and a "pause" state, per Duolingo's own numbers. Show it on a calendar (Melodics) rather than as a flame that resets to zero.
- Progression gates per chapter (Complete Rhythm Trainer's 3 stars) fit rhythm and ear ladders; avoid gating piano drills, where the user chooses material by taste.

## 7. Mobile layouts for instrument practice

### What the products do

The piano apps run landscape on phones with the note lane on top and a keyboard strip below (layout specifics unsourced beyond product screenshots). Melodics shows accuracy on light-up pads or keys where the hardware allows, so the player need not look at the screen. (https://melodics.com/how-it-works) flowkey's split screen (video above, notation below) is the canonical landscape layout. (https://www.pianodreamers.com/flowkey-review/)

### What the research says

Practising with both hands on the keys and a phone at arm's length is a situationally induced impairment (SIID): the same class as encumbered hands or walking, where contextual factors impair mobile interaction. (https://arxiv.org/pdf/1904.06128, https://faculty.washington.edu/wobbrock/pubs/eics-19.01.pdf) The design response in this literature is larger targets, more spacing, and adapting layout to the situation. (https://www.siteimprove.com/blog/motor-impairments-and-mobile-ui-the-touch-target-problem/)

Platform minimums: Apple HIG 44 x 44 pt, Material 48 x 48 dp, with at least 8 pt spacing; WCAG 2.2 SC 2.5.8 requires 24 x 24 CSS px at AA. (https://tetralogical.com/blog/2022/12/20/foundations-target-size/, https://www.boia.org/blog/understanding-target-size-under-wcag-2.2-and-how-it-affects-people-with-disabilities)

### What applies to Practice OS

- Design the drill screen landscape-first on phone: target area on top, keyboard strip below, one status band (drill name, item N of M, timing state) legible from 60 cm. Portrait should still work but is secondary.
- Make the primary controls (start, next, repeat, stop) at least 48 dp and reachable from MIDI (a designated low key or a sustain pedal press) so the user never has to touch the screen mid-drill. Web MIDI already gives the events; this is a mapping feature.
- Use a glanceable state model: one large state word or icon (Waiting / Listening / Correct / Early / Late) with matching colour and a short audio cue, since the user's eyes are on the keys.
- Keep the hint-only microphone state visible but small (a single indicator), since it is not a scoring source.
- Do not put settings, summaries or navigation in the drill view on phone; move them behind a single "pause" action.

## 8. Accessibility

### What the products do

Most piano apps convey correctness by colour alone (green/red, or Melodics' four-colour scheme), which fails WCAG 1.4.1. (https://promusicianhub.com/melodics-review/, https://pianoers.com/skoove-review/) Notation software shows what is possible: MuseScore is operable almost entirely by keyboard and works with NVDA, and AccessMusic offers measure-by-measure VoiceOver navigation of MusicXML scores. (https://musescore.org/en/node/323036, https://apps.apple.com/us/app/accessmusic/id6747299730)
### What the standards say

WCAG 1.4.1 (Level A): colour must not be the only visual means of conveying information or distinguishing an element; sufficient techniques include a text cue and additional visual cues beyond hue. (https://www.w3.org/WAI/WCAG21/Understanding/use-of-color.html) WCAG 2.4.7 (AA) requires a visible keyboard focus indicator, and WCAG 2.2's Focus Appearance criterion sets a minimum: indicator area of at least a 1 px perimeter or 4 px on the shortest side, and 3:1 contrast against the unfocused state. (https://www.w3.org/TR/UNDERSTANDING-WCAG20/navigation-mechanisms-focus-visible.html, https://www.w3.org/WAI/WCAG22/Understanding/focus-appearance.html) WCAG 2.5.8 sets the 24 px target minimum described above. (https://www.boia.org/blog/understanding-target-size-under-wcag-2.2-and-how-it-affects-people-with-disabilities)

### What applies to Practice OS

- Every correctness state needs a non-colour twin: glyph (check, arrow-left for early, arrow-right for late, cross), fill vs outline on the key, and a live-region text line ("C4 early 38 ms"). This also serves the glance-from-the-piano case, so it is not accessibility-only work.
- The on-screen piano must be keyboard-operable (computer keyboard mapped to keys, already partly present) with a visible focus ring that meets the Focus Appearance minimum. Theme tokens should include a dedicated focus colour with 3:1 contrast in both themes.
- Announce drill state changes through an `aria-live="polite"` region, and use `role="status"` for the timing readout, so a screen reader can follow a drill without reading the keyboard SVG.
- Provide a text alternative for each target (note names, chord symbol, scale degrees) that is rendered as visible text rather than only as an aria-label, because the sighted user at a distance benefits too.

## 9. Anti-patterns to avoid

- Colour-only correctness, especially a two-colour green/red scheme, which fails WCAG 1.4.1 and hides timing errors. (https://www.w3.org/WAI/WCAG21/Understanding/use-of-color.html, https://pianistscompass.org/reviews/apps/simply-piano/)
- Passing wrong rhythms as correct because only pitch is scored. (https://pianistscompass.org/reviews/apps/simply-piano/)
- Per-note feedback in every mode with no summary-only option, which the guidance hypothesis links to weaker retention. (https://www.semanticscholar.org/paper/Knowledge-of-results-and-motor-learning:-a-review-Salmoni-Schmidt/59f3a052b4b5187a91cb9b8d0813e23f3dffbc03)
- Stacking staff, keyboard, waterfall, fingering and chord symbol on screen at once. (https://openscholar.uga.edu/record/15742/files/price_sylvia_t_201005_edd.pdf)
- Unforgiving streaks that reset to zero after one missed day. (https://blog.duolingo.com/how-streaks-keep-duolingo-learners-committed-to-their-language-goals/)
- Applying forgetting-curve scheduling to motor drills, where the spacing evidence is absent. (https://journals.plos.org/plosone/article?id=10.1371/journal.pone.0182986)
- XP, multipliers and combo bonuses for a single user; they add load without information. (https://support.yousician.com/hc/en-us/articles/204796991-Practice-and-Play-modes-in-piano, https://duolingo.fandom.com/wiki/Combo_bonus)
- Requiring a screen tap between items when hands are on the instrument. (https://arxiv.org/pdf/1904.06128)
- Four-button self-grading when two would do. (https://docs.ankiweb.net/studying.html)
- Long blocked repetition of one drill; fluency during the block misleads. (https://pmc.ncbi.nlm.nih.gov/articles/PMC4989027/)

## 10. Sources

Products

- Simply Piano help: https://piano-help.hellosimply.com/en/articles/7943490-learning-with-simply-piano-the-basics
- Simply Piano review (Pianist's Compass): https://pianistscompass.org/reviews/apps/simply-piano/
- flowkey: https://www.flowkey.com/en and https://www.pianodreamers.com/flowkey-review/
- Yousician piano Practice/Play modes: https://support.yousician.com/hc/en-us/articles/204796991-Practice-and-Play-modes-in-piano
- Piano Marvel SASR: https://pianomarvel.com/en/feature/sasr; Practice Mode: https://pianomarvel.com/en/feature/practice-mode; reviews: https://pianistscompass.org/reviews/apps/piano-marvel/, https://www.pianodreamers.com/piano-marvel-review/, https://yourmusiclessons.com/piano-marvel-review/
- Playground Sessions review: https://smarterlearningguide.com/playground-sessions-review/; mic vs cable: https://support.playgroundsessions.com/hc/en-us/articles/40387576759956
- Skoove review: https://pianoers.com/skoove-review/; Skoove vs Pianote: https://www.skoove.com/blog/best-piano-apps/
- Melodics: https://melodics.com/how-it-works; review: https://promusicianhub.com/melodics-review/
- Synthesia: https://synthesiagame.com/; https://hub.yamaha.com/?p=44644
- Soundslice: https://www.soundslice.com/features/; https://www.soundslice.com/blog/199/introducing-enhanced-slowdown-and-perfect-looping/
- Tenuto: https://www.musictheory.net/products/tenuto/features; https://thetattooedpianoteacher.com/tenuto-app-review/
- Functional Ear Trainer: https://apps.apple.com/us/app/functional-ear-trainer/id1088761926; https://advancingmusician.com/functional-ear-trainer-app/
- Daily Tonic (tonic.app was parked): https://apps.apple.com/us/app/daily-tonic-ear-training-pro/id6758660102
- Complete Rhythm Trainer: https://completerhythmtrainer.com/; rhythm app index: https://www.beattight.com/rhythm-practice-apps/index.html
- Roland Aerophone Lesson: https://www.roland.com/global/products/aerophone_lesson/; Aerophone GO Plus: https://www.roland.com/global/products/aerophone_go_plus/
- Duolingo streaks (first party): https://blog.duolingo.com/how-streaks-keep-duolingo-learners-committed-to-their-language-goals/; XP and combo bonus: https://duolingo.fandom.com/wiki/XP, https://duolingo.fandom.com/wiki/Combo_bonus; design analysis: https://blakecrosley.com/guides/design/duolingo; critique: https://dev.to/yaptech/duolingos-shallow-learning-trap-gamified-streaks-harmful-habits-4134; streak freeze figure: https://www.strivecloud.io/blog/gamification-examples-boost-user-retention-duolingo
- Anki manual, Studying: https://docs.ankiweb.net/studying.html

Research

- Salmoni, Schmidt, Walter (1984), KR review: https://www.semanticscholar.org/paper/Knowledge-of-results-and-motor-learning:-a-review-Salmoni-Schmidt/59f3a052b4b5187a91cb9b8d0813e23f3dffbc03
- Guidance hypothesis, physical guidance and KR: https://pubmed.ncbi.nlm.nih.gov/7886280/
- Reduced KR frequency (Winstein and Schmidt): https://www.researchgate.net/publication/232429606_Reduced_Frequency_of_Knowledge_of_Results_Enhances_Motor_Skill_Learning
- Frequent augmented feedback can degrade learning: https://link.springer.com/chapter/10.1007/978-94-011-3626-6_6
- Bandwidth KR: https://journals.sagepub.com/doi/10.1080/14640749008401249
- More feedback is better (auditory augmented feedback): https://www.ncbi.nlm.nih.gov/pmc/articles/PMC4893479/
- Self-controlled KR under cognitive load: https://www.ncbi.nlm.nih.gov/pmc/articles/PMC7283715/
- Cognitive load theory and music reading: https://openscholar.uga.edu/record/15742/files/price_sylvia_t_201005_edd.pdf; CLT and music instruction: https://www.researchgate.net/publication/247513607_Cognitive_load_theory_and_music_instruction; fNIRS load study: https://pmc.ncbi.nlm.nih.gov/articles/PMC6210363/
- Pitch feedback and novice piano learning: https://www.ncbi.nlm.nih.gov/pmc/articles/PMC6261582/; auditory feedback, novices vs experts: https://www.ncbi.nlm.nih.gov/pmc/articles/PMC9671877/
- Blocked vs interleaved practice (Carter and Grahn, 2016): https://pmc.ncbi.nlm.nih.gov/articles/PMC4989027/ and https://www.frontiersin.org/articles/10.3389/fpsyg.2016.01251/full
- Lack of spacing effects during piano learning (PLOS One, 2017): https://journals.plos.org/plosone/article?id=10.1371/journal.pone.0182986
- Situationally induced impairments: https://arxiv.org/pdf/1904.06128; https://faculty.washington.edu/wobbrock/pubs/eics-19.01.pdf; touch targets and motor impairment: https://www.siteimprove.com/blog/motor-impairments-and-mobile-ui-the-touch-target-problem/
- Target sizes (Apple, Material, WCAG): https://tetralogical.com/blog/2022/12/20/foundations-target-size/; https://www.boia.org/blog/understanding-target-size-under-wcag-2.2-and-how-it-affects-people-with-disabilities
- WCAG 1.4.1: https://www.w3.org/WAI/WCAG21/Understanding/use-of-color.html
- WCAG 2.4.7: https://www.w3.org/TR/UNDERSTANDING-WCAG20/navigation-mechanisms-focus-visible.html; Focus Appearance: https://www.w3.org/WAI/WCAG22/Understanding/focus-appearance.html
- Accessible notation: https://musescore.org/en/node/323036; https://apps.apple.com/us/app/accessmusic/id6747299730; https://tobyrush.com/braillemusic/notator/
