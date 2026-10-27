# MPC One+ finger drumming: what makes beginners good fastest, and how Woodshed compares (2026-10-27)

Builds on `context/research/finger-drumming.md` and `pads-aerophone-gaps.md` (layouts, timing tiers, swing maths, velocity, fills, echo, ostinato, Latin grooves). Those are not repeated. "Thin" marks a forum or marketing source; "proposal" marks my own number.

## 1. The best programs and what makes them work

**Melodics (the market leader for pads).** What it does:
- 15 Stages per instrument, unlocked in order: "lessons are where you practice, Stages are where you prove it" ([Melodics progress](https://support.melodics.com/en/articles/15091765-understanding-your-progress-in-melodics)).
- Lessons are short pieces over a full musical backing, scored on timing precision and note streaks. Scores can pass 100, so mastered lessons still give something to chase.
- Practice mode slows and loops hard sections. Auto BPM adds 10 after a clean pass.
- A 5-minute daily goal with streaks and trophies at 3, 5, 7 and 10 days ([streaks](https://support.melodics.com/en/articles/6777043-what-are-streaks)). Weekly goals pick lessons matched to your Stage.
- Courses group lessons by concept ([DJWORX review](https://djworx.com/melodics-the-online-finger-drumming-classroom/)). Partner bundles (Push, Move, Launchkey) start with "essential dance and hip-hop rhythms", counting and rests, then pad technique ([Push](https://melodics.com/partners/ableton/learn-push)).
- The claim that users are "6x more likely to improve" has no stated basis (marketing). Melodics does not score velocity.

Why it works: you play music on day one (a beat, not an exercise), feedback comes on every note, the loop is tiny, and the tempo ladder is automatic.

**Mad Zach (DJTT).** Start with one beat and loop it to muscle memory, then add variations. Keep time with one or two sounds before adding more. Core drums go on the dominant hand, bass and pads on the other. Keep the wrists still and move the fingers ([DJTT 2016](https://djtechtools.com/2016/07/20/mad-zachs-techniques-learning-fingerdrumming-routine)). His paid tutorial has over 20 beat variations, left-hand technique, fills and a full routine ([store](https://store.djtechtools.com/products/mad-zach-finger-drumming-tutorial)). He says he does no special finger exercises beyond "jamming all the time" ([CDM](https://cdm.link/mad-zach-tips-finger-drumming-production-free-live-pack/)).

**Jeremy Ellis (MPC, Maschine).** He sells a course of warm-ups, fingering systems and dexterity exercises ([Ask.Video, Maschine Virtuosity](https://www.ask.video/course/maschine-virtuosity)); its contents are paid and not public. The community version of his advice (thin, [MPC forums](https://www.mpc-forums.com/viewtopic.php?p=1693529)):
- Right index keeps a steady eighth or sixteenth hat while the left plays kick and snare.
- Record unquantised to a metronome and critique the playback.
- Then make the kicks and snares funkier while the hats stay steady, add open hats and cymbals, and copy your favourite breaks.

**Tim Kroker (Native Instruments).** One hand holds a groove while the other fills. Record against Maschine playback to check timing. "Loop on the fly": slice a 1-bar loop over 16 pads, replay it in order, then reorder it ([NI](https://blog.native-instruments.com/how-to-master-the-art-of-finger-drumming-with-tim-kroker/)).

**Quest for Groove (Robert Mathijs).** Learn stickings first, then spread them over the kit. His three stages: which pads to hit, how to play them (dynamics, feel), and why one choice fits better ([Melodics interview](https://melodics.com/blog/what-finger-drummer-robert-mathijs-has-learned-on-his-quest-for-groove), [forum](https://questforgroove.discourse.group)).

**Spencer Nunamaker.** I found no published finger-drumming material under this name. The owner should send a link if he has one in mind.

**Drumeo (acoustic, adapted).** The Drumeo Method has 10 levels. Level 1 is foundation; level 2 covers rudiments, reading and rock grooves; level 4 is "Moeller and essential grooves"; level 5 is groupings and independence; level 6 is odd time and improvisation ([TOC](https://faq.musora.com/article/808-drumeo-method-table-of-contents)). Its tempo step is 5 BPM. Each style is taught as a named groove first and a family of variations second.

**Stick Control (Stone, 1935) and Syncopation (Reed, 1958).** These are the two standard kit books. Stone's single-beat combinations are pages of R/L permutations, each repeated many times, with a "how to practice" page about progressive, ambidextrous conditioning ([Nexus review](https://www.nexuspercussion.com/?p=7040)). Reed's reading lines are played over many "interpretations": as snare over a fixed ride and kick, as kick under hats, as accents in a sixteenth stream ([Music Teacher](https://musicteachermagazine.co.uk/content/features/ted-reeds-syncopation-interpretations-for-the-modern-drummer)). No finger-drumming adaptation is published, but both map cleanly to pads: one pad per hand makes the sticking *observable*, which acoustic apps cannot see.

**MPC workflow** ([Akai manual](https://www.manualslib.com/manual/1383932/Akai-Mpc.html?page=7)):
- Full Level forces maximum velocity, so it must be off to practise dynamics. 16 Levels copies the last pad across all 16 with velocity (or tune, filter...) rising per pad, a built-in velocity ladder.
- Note Repeat retriggers at the Time Correct rate; Shift latches it.
- Swing runs 50 to 75; producers cite 54 and 57 as common ([forum, thin](https://www.mpc-forums.com/viewtopic.php?p=62156)).

**Learning evidence (rhythm and feedback).**
- Pro drummers sit 1 to 13 ms off a click (Fujii 2011, already in context).
- Guidance hypothesis: frequent concurrent feedback helps during practice but hurts retention when the learner relies on it. Faded or summary feedback retains better ([Winstein et al. 1994](https://experts.nau.edu/en/publications/effects-of-physical-guidance-and-knowledge-of-results-on-motor-le/)).
- Movement sonification beat visual feedback for a 4:3 bimanual rhythm and may avoid that dependence (Dyer, Stapleton, Rodger 2016, [QUB](https://pure.qub.ac.uk/en/publications/transposing-musical-skill-sonification-of-movement-as-concurrent-/)). Hearing your own pads in time is itself the feedback.
- Individual differences in synchronisation are large ([Repp and Su 2013](https://link.springer.com/article/10.3758/s13423-012-0371-2)), so ladders should adapt to the player rather than use fixed tempos.
- No peer-reviewed study of finger-drumming pedagogy exists (as before).

**Consensus across the programs.** A real beat on day one. One hand holds a loop while the other varies. A click, then recording yourself unquantised. Copying famous breaks as the curriculum. Fills as the way out of loop boredom. Jamming over music, not only clicks. Melodics adds automatic tempo ladders and streaks.

## 2. What Woodshed has today (seen in Orca and code)

**MPC Path, 19 steps** (`progress/paths.ts` plus `data/learning-paths.json`), in order: two pads on the click; echo a bar (generic Rhythm echo); hold the tempo; singles at sixteenths; echo sixteenths; two-finger rolls; kick, snare and hat; two-bar boom bap; write a groove down; paradiddle; accents and ghosts; ghost notes between the backbeats; four kicks under one hat; four-bar piece with a fill; swing by hand; the same piece faster and from memory; house, trap and DnB; the breaks; hear the kit in the mix.

**Pads drill (`/music/pads`), nine tabs:** Technique (15 rudiments incl. rolls at 1/16, 1/32 and 1/16T, pyramid, six-stroke, flam); Grooves (level picker, 1-e-&-a grid, fingers, note highway, Wait mode, Plays x4, Hear it first, optional synth band, Check mode hiding the notes); Hold the tempo; Dynamics (calibrate, ladder, crescendo, even); Fills (rush and landing windows); Play it back (four rounds on the kit); Ostinato and a line (4 lines); Rudiments on the kit (3 orchestrations); Improvise (4 bars over a funk vamp, played back raw and half-quantised). Results show perfect and good, swing played, drift and per-voice bias.

**Repertoire** (`content/pads-repertoire.ts`): 39 grooves plus 9 phrases in six levels with tightening tiers (35/70, 25/50, 15/35 ms). It includes Funky Drummer, Impeach, Levee, Think, Amen, Apache, Tony Allen, boom bap variants, Dilla, house, trap rolls, DnB, afrobeats, and 13 Latin, Caribbean and Brazilian grooves. Create's presets are the same list.

**Compared with the best programs, the app is strong on measurement.** Velocity scoring, per-voice bias, swing %, hold-the-tempo and ostinato baselines all go past Melodics. It is weak on these:

1. **The path skips most of the pad skills.** Dynamics, Fills, Play it back on the kit, Ostinato, Rudiments on the kit and Improvise have no path step. Steps 2 and 5 use the generic one-pad Rhythm echo instead of the kit echo.
2. **Gating is inconsistent.** The 8 original steps chain with `requires`; the 11 added steps have none. A beginner sees "The breaks" (Amen, level 6, 110 to 138 BPM) open while "Singles at sixteenths" is Locked (seen in Orca).
3. **Day one is an exercise, not a beat.** Step 1 is alternating singles at eighths. Melodics, Mad Zach and Ellis all start with a groove.
4. **No sampled loops or chops.** Backing is a synth band; Jam can import an MP3 but Pads cannot play over one. There is no slice drill, although Create already builds MPC kits from samples.
5. **No song form.** Every groove is a 1 to 4 bar loop. Melodics lessons are pieces with sections and transitions. Only the fill drill and "turnaround" approach this.
6. **The grid is 16 steps in 4/4 only** (`pads-grid.ts` throws on any other length), and swing is per sixteenth. So shuffles (Purdie, Rosanna, Fool in the Rain), 12/8, eighth-note swing, odd meters (Take Five) and garage or footwork cannot be written.
7. **No live beat making.** Create's grid is click-to-toggle. There is no record-from-pads loop with overdub, input quantise or app Note Repeat.
8. **Thin reading and permutation content.** There are 4 ostinato lines and 3 orchestrations. There is no Stick Control-style permutation generator.
9. **Feedback never fades.** Practice shows Perfect/Early/Late on every note. Check hides the notes but there is no faded or summary stage between them.
10. **Small content issues.**
    - Funky Drummer's feel text says open hats "on the a of 2 and 4", but the grid puts the second on the e of 4. One of the two is wrong; check against a transcription.
    - Billie Jean exists only as a mention in Basic rock's text.
    - The groove card says "Starts at 80 BPM" while the strip runs it at 66. The global strip tempo overrides the groove's start tempo (by design?).

## 3. Recommendations, ranked

1. **Rebuild the MPC Path around pad skills and real beats (M).** Target about 22 steps, all chained with `requires`; side branches (Latin, studio ears) stay unchained links.
   - **Foundations:** basic rock in Wait mode, then in time (first beat); calibrate and dynamics ladder; two pads on the click; hold the tempo; play it back on the kit (pad echo, kick and snare, replacing M-E1); sixteenths and two-finger roll; three level-1 grooves of the player's choice (Back in Black, Be My Baby, boom bap A); one-beat fill and land (pad Fills).
   - **Intermediate:** accents and ghosts, then Funky Drummer or Think; paradiddle, then Rudiments on the kit; ostinato and a line; four kicks under one hat; swing by hand; write a groove down; grooves over a loop (rec. 3); two-beat and whole-bar fills, then the four-bar piece from memory.
   - **Advanced:** house, trap and DnB with rolls or note repeat; the breaks (Impeach, Levee, Amen); chop a loop (rec. 4); improvise 16 bars, recorded; capstone: build a beat live (rec. 5).

   Sources: Melodics and Mad Zach's "beat first"; Drumeo's level order; Kroker. Fits: only `ADDED_STEPS.mpc` and the JSON change. Every target drill exists except recommendations 3 to 5.

2. **Triplet and meter support in the grid (M).**
   - Let `gridGroove` take 12 steps a bar (triplet eighths), 24 steps (sixteenth triplets) and other bar lengths (5/4, 7/8, 6/8), plus eighth-note swing.
   - This unlocks the shuffle canon (Purdie, Rosanna, Fool in the Rain), 12/8 blues, Take Five, UK garage and footwork. It also opens polyrhythm (3:4) from the gaps research.
   - The grader already works on beat positions, so only the parser, the grid view and the step-count test change. Why: about a quarter of the famous-groove list below needs it.

3. **Play over a sampled loop (S to M).** Add a "Backing: band / click only / a loop" choice in Grooves and Improvise. The loop comes from Library, Record or an imported file, with its BPM typed or tapped and its downbeat nudged. Reuse Jam's MP3 backing and the audio engine. Why: Ellis, Kroker and Melodics all train in musical context, and this is how MPC players actually practise.

4. **Chop drill on 16 slices (M).** Load a 1 or 2 bar loop and slice it evenly (or at transients) into A01 to A16 as a kit (reuse `create/kits.ts`). Three exercises:
   - Replay the slices in order to the click (scored by the groove grader, one voice per slice).
   - Play a written reorder.
   - Free chop, recorded and shown on the grid.

   Source: Kroker's "loop on the fly", Melodics' DATSUNN lessons. Bonus: export the chopped kit to the MPC with the existing kit export.

5. **Live beat making in Create (M).** A 2 or 4 bar loop recorded from the pads with overdub per pass (kick, then snare, then hats), input quantise off, 50% or 100% (Maschine's model), undo-last-pass, and an app-side Note Repeat (hold a pad plus a rate of 1/8, 1/16, 1/16T or 1/32). Repeat velocity comes from the pad or from aftertouch if the MPC sends it (verify). Then "play fills over your loop" drops straight into the Fills grader. Why: this is the MPC skill the owner bought the device for. Swing goes in as a loop setting (50 to 75), not as written grid offsets.

6. **Famous grooves as named entries (S per groove).** Add the missing items in section 4 at their levels, with the source in a comment as now. Shuffles and odd meters wait for recommendation 2. Make Billie Jean, Back in Black and Be My Baby level-1 entries: named songs motivate more than "Basic rock".

7. **Stick Control permutations on two pads (S).** Generate every 4- and 8-note R/L sticking (16 and 256 of them). Pages are grouped as Stone does (singles, doubles, paradiddle family), 20 repetitions each, with the sticking graded by which pad was hit. This works because one pad per hand makes the sticking visible to the grader. Unlike acoustic apps, the app can grade it, so say so in the copy. Also offer "orchestrate this sticking" into Rudiments on the kit.

8. **Syncopation-style reading generator (S to M).** Replace the 4 fixed `READING_LINES` with lines from `rhythm.ts` (quarters, eighths, dotted, sixteenths, rests), one bar at a time. Play them in three interpretations: snare over hats and kick, kick under hats, or accents in a sixteenth stream. The last uses the dynamics bands. Source: Reed and teachers' interpretations.

9. **Song-form pieces (M).** 16 to 32 bar arrangements (intro, A, fill, B, break, drop, outro) built from existing grooves and fills, with sections scored separately (the grader already reports per section). Play them over the band or a loop. Melodics' lessons are this shape. Start with 6, one per level.

10. **Faded feedback (S).** Add a middle setting between Practice and Check: live judgements on the first 2 plays, then summary only, with the highway still shown. Source: guidance hypothesis. Results keep the per-voice bias.

11. **Flex plans for MPC days (S).** The routine builder already maps `technique.mpc.*`. Suggested blocks:
    - 10 min: warm-up rudiment, then the current groove ladder.
    - 30 min: add a fill or echo plus a new groove.
    - 60 to 90 min: add chops or loop play and live beat making, ending in 16 bars of improvisation.

    Melodics' 5-minute daily goal suggests a minimum day of 5 to 10 minutes counts as a streak.

12. **Small fixes (S).** Resolve the Funky Drummer open-hat text against the grid. Show the groove's start tempo as a one-tap "use 80" when the strip tempo differs.

## 4. Famous grooves worth bundling (grids, not recordings)

Levels use the app's 1 to 6 scale. "In app" means in `PAD_REPERTOIRE`. Tempos are approximate.

General sources:
- [Ethan Hein's pattern spreadsheet](https://ethanhein.substack.com/p/my-collection-of-transcribed-rhythm-patterns), already used.
- *The Breakbeat Bible* (Adamo, over 90 transcribed breaks with origin and sampling notes, [Hal Leonard](https://www.halleonard.com/product/6620153/the-breakbeat-bible), [sampler PDF](https://hudsonmusic.com/wp-content/uploads/2015/03/Breakbeat-Bible-Sampler.pdf)). Buy one copy for checking; its track list is unconfirmed.
- [Groove Scribe](https://www.mikeslessons.com/gscribe) for building and checking grids.
- The [Magenta Groove MIDI Dataset](https://magenta.tensorflow.org/datasets/groove) (13.6 h of pro drummers on a Roland e-kit, genre-labelled, CC BY 4.0) for human micro-timing and velocity per genre. It has no famous songs, but it suits "humanise" references and dictation material.

| # | Groove | Style, BPM | Level | In app | Source |
|---|---|---|---|---|---|
| 1 | Billie Jean (Jackson) | Pop, 117 | 1 | as Basic rock text | Hein; any pop method |
| 2 | Back in Black (AC/DC) | Rock, 94 | 1 | no | commercial tabs; simple 8ths |
| 3 | Be My Baby intro (Hal Blaine) | Pop, 130 | 1 | no | widely transcribed |
| 4 | We Will Rock You | Stomp-clap, 81 | 1 | yes (stomp-clap) | Ableton [Learning Music](https://learningmusic.ableton.com/make-beats/make-beats.html) |
| 5 | Motown four-on-snare (Funk Brothers) | Soul, 120 | 1 | no | method books |
| 6 | Seven Nation Army | Rock, 124 | 1 | no | simple |
| 7 | Single Ladies | Pop/R&B, 97 | 2 | no | Ableton Learning Music |
| 8 | When Doves Cry (LinnDrum) | Pop, 126 | 2 | no | Hein |
| 9 | The Big Beat (Billy Squier) | Break, 105 | 2 | no | Hein, [MusEDLab](https://wp.nyu.edu/musedlab/tag/visualization/page/2) |
| 10 | Walk This Way (intro) | Break, 108 | 2 | no | Breakbeat Bible (verify) |
| 11 | Impeach the President | Break, 95 | 2 | yes | Hein |
| 12 | When the Levee Breaks | Break, 72 | 2 | yes | Hein |
| 13 | Bo Diddley beat | R&B, 120 | 2 | no | clave relative |
| 14 | Funky Drummer | Funk, 100 | 3 | yes | Hein |
| 15 | Think (Lyn Collins) | Break, 113 | 3 | yes | Hein |
| 16 | Synthetic Substitution (Melvin Bliss) | Break, 96 | 3 | no | Breakbeat Bible (verify) |
| 17 | It's a New Day (Skull Snaps) | Break, 92 | 3 | no | Breakbeat Bible (verify) |
| 18 | Ashley's Roachclip | Break, 94 | 3 | no | Breakbeat Bible (verify) |
| 19 | Planet Rock (808) | Electro, 127 | 3 | no | Hein |
| 20 | Blue Monday (16th kick intro) | Synth-pop, 130 | 3 | no | fan transcriptions (thin) |
| 21 | In the Air Tonight fill | Fill, 96 | 3 | no | commercial only ([SMD](https://www.sheetmusicdirect.com/en-US/se/ID_No/1346609/Product.aspx)) |
| 22 | Cold Sweat (James Brown) | Funk, 112 | 4 | no | Breakbeat Bible (verify) |
| 23 | Cissy Strut (Zigaboo, linear) | Funk, 88 | 4 | no | [Drummer Cafe (free)](https://drummercafe.com/education/lessons/zigaboo-modeliste-cissy-strut-linear-drum-groove) |
| 24 | Superstition (Stevie Wonder) | Funk, 100 | 4 | no | commercial |
| 25 | Dilla swing / Fall in Love feel | Hip hop, 88 | 4 | yes (Dilla) | Linn swing |
| 26 | UK garage 2-step | Garage, 132 | 4 | no (needs 8th swing) | production guides |
| 27 | Jersey club | Club, 140 | 4 | no | production guides |
| 28 | 50 Ways to Leave Your Lover (Gadd) | Linear march, 100 | 5 | no | [Drummer Cafe (free, Gadd's sticking)](https://drummercafe.com/education/lessons/steve-gadd-50-ways-drum-groove) |
| 29 | Fool in the Rain (Bonham) | Half-time shuffle, 130 | 5 | no (needs triplets) | [Wikipedia on its lineage](https://en.wikipedia.org/wiki/Rosanna_shuffle) |
| 30 | Trap with 1/32 and 1/16T rolls | Trap, 140 | 5 | yes | |
| 31 | UK drill (triplet hats, snare on 3) | Drill, 140 | 5 | no (needs triplets) | production guides |
| 32 | Take Five (Morello, 5/4) | Jazz, 172 | 5 | no (needs meter) | method books |
| 33 | Amen break | Break, 138 | 6 | yes | Hein |
| 34 | Apache | Break, 112 | 6 | yes | Hein |
| 35 | Purdie shuffle (Home at Last) | Half-time shuffle, 92 | 6 | no (needs triplets) | [Soundbrenner](https://www.soundbrenner.com/blogs/articles/rhythm-library-purdie-shuffle), [Matt Dudley](https://mattdudleydrumming.com/2017/01/15/the-purdie-shuffle-from-the-hands-perspective/), [Tom Tom](https://tomtommag.com/2011/10/the-purdie-shuffle-part-one) |
| 36 | Rosanna shuffle (Porcaro) | Half-time shuffle, 86 | 6 | no (needs triplets) | [Wikipedia](https://en.wikipedia.org/wiki/Rosanna_shuffle); Porcaro's instructional video |
| 37 | Hook and Sling (James Black) | New Orleans funk, 100 | 6 | no | Breakbeat Bible (verify) |
| 38 | Footwork (triplet kicks) | Footwork, 160 | 6 | no (needs triplets) | production guides |
| 39 | Reggaeton dembow | Reggaeton, 95 | 3 | yes | MusicRadar, NI |
| 40 | Tony Allen afrobeat | Afrobeat, 100 | 6 | yes | Joe the Drummer |

Full-song MIDI files (free MIDI archives carry drum tracks for Billie Jean, Back in Black, Superstition and others) vary in accuracy. Use them only as a cross-check for the owner's private build, never as the grid source. For famous fills (In the Air Tonight, Rosanna's turnarounds), commercial transcriptions are the only reliable source I found.

## 5. Open questions for the owner

1. **The MPC goal.** Is it performing (finger drumming as an instrument) or making beats (chops, sequencing, live loops)? This sets whether recommendations 4 and 5 come before the breaks.
2. **Layout.** Is Woodshed's pad layout the one he uses on the MPC for his own programs? Should the drills follow his program instead?
3. **Songs to play along with.** Which artists or tracks? Is he OK keeping his own audio loops (sampled from records he owns) in the private library for loop practice?
4. **Spencer Nunamaker.** Which material did he mean? I found nothing published.
5. **Aftertouch.** Does his MPC One+ send aftertouch in Controller Mode? An app Note Repeat could then follow pressure as the MPC does.
6. **Breakbeat Bible.** Should he buy one copy (about $25) so the breaks in the table can be checked against a single reliable transcription?
7. **The instrument strip is shared across tabs.** Opening Pads switches it to MPC for every open view. Is that intended?
