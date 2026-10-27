# Ukulele: a full path from first chords to solo arrangements (round 2, 2026-10-27)

Builds on the round-1 report (`../ukulele.md`) and `context/research/guitar-ukulele-drills.md` (LCM and RSL syllabi, campanella and split-stroke notes, what a mic can grade). Those are not repeated here.

Assumes a high-G (re-entrant) ukulele in standard GCEA tuning. Steps and scores that need a low-G string are marked **LOW-G**; campanella steps are marked **HIGH-G**.

## 1. Target and scope

**Done means** the owner can, from memory and at tempo:

- play a 10 to 12 minute programme of three solo fingerstyle arrangements (one pop, one classical, one jazz or Hawaiian), with chord melody, campanella and rolls where the piece needs them;
- accompany any song from a chord sheet in 4/4, 3/4, 6/8 and swing, with island, chuck, calypso, triplet and split strokes, using barre and closed shapes in any common key;
- comp and play a chord melody on two jazz standards (ii-V-I, seventh chords, guide tones);
- improvise three choruses on a 12-bar blues and two on a minor tune, up the neck in more than one position;
- read standard notation and tab at about LCM Grade 5 sight-reading level, and play back a short melody by ear.

**Benchmark.** The technical floor is RSL Ukulele Grade 5 and LCM Ukulele Grade 5: partial and full barre chords, C major pentatonic in campanella style at 90 bpm, a triple-stroke or 16th-note dominant-7 study at 90, solo pieces with chord melody (syllabus details in `guitar-ukulele-drills.md`). Reading follows the James Hill Ukulele Initiative to its Level 3 (minor keys, transposition, tremolo). Levels 9 and 10 go past Grade 5 on improvisation and repertoire (LCM Grades 6 to 8 add campanella in minor, harmonics, slurs and a blues with improvisation), so the end point is "solid intermediate" rather than a Grade 8 player.

**How long.** Ten levels, 4 to 10 weeks each, about 76 weeks in all at 30 minutes a day, five or six days a week: roughly 18 months. At 15 minutes a day expect 30 months or more; at 60 minutes about 12. A 30-minute day: 5 minutes of changes or a strum pattern, 8 minutes of the level's fingerpicking step (every day: the owner asked for much more fingerpicking), 8 minutes of the melody, reading or soloing step, 9 minutes on a shelf song.

**Shape.** Four strands run through every level, so no skill waits a year for its turn:

| Strand | Tag | From | To |
|---|---|---|---|
| Chords and strums | C | C Am F G, down strums | barre and seventh chords, split and triple strokes, swing comping |
| Fingerpicking | F | thumb strokes, the claw | p-i-m-a, Travis, rolls, 6/8, tremolo, full solo arrangements and chord melody |
| Melody and reading | M | open-string tunes (James Hill style) | campanella, reading at Grade 5, classical pieces |
| Soloing and blues | S | (from level 5) a pentatonic box | five positions, chord tones, standards |
| Ear | E | cross-links into the Ear path | |

**Totals:** 10 levels, 114 steps, 93 shelf songs. Every shelf song has a MuseScore score; see section 6 for how many were opened and checked.

**How to read the step tables.** "Drill" names the route and setup (`chords?mode=changes` and so on, ukulele on the strip). **NEW** means the app lacks it; the line says what it needs, and section 4 ranks it. "Done means" is measured on two different days unless it says otherwise (the learning-engine report's R1). "80%" is the drill's own score.

**How to read the shelves.** Pick any 2 or 3 songs to pass a level; at least one strummed and one fingerpicked. "Kind": strum, pick (fingerstyle or melody), solo (an arrangement played alone), comp (accompaniment for soloing). "Diff" is 1 to 3 within the level. "Official" means a paid Hal Leonard or ArrangeMe score (MuseScore Pro or a purchase); everything else is a free community score. "Card" means confirmed from the search result card (title, arranger, instrumentation); "opened" means I opened the score page and read its title and instrument. Import a downloaded MusicXML into Song Studio for wait mode, performance mode and fix-the-spot loops.

---

## Level 1. First chords, first strums, first melodies (about 4 weeks)

Goal: strum four chords in time and pick a melody on the open strings. Adds C, Am, F, G7, G; down strums and down-up; thumb strokes; first-position reading.

| # | Strand | Step | Drill and setup | Done means | Feeds |
|---|---|---|---|---|---|
| 1.1 | C | Tune and say high-G or low-G | `tuner`; **NEW** ask high-G or low-G once on first ukulele use and keep it in settings (S) | All four strings within 10 cents in under a minute | all |
| 1.2 | C | C, Am, F | `chords?mode=build`, C then Am then F | 5 clean builds each (every string sounds) | Let It Be, Stand By Me |
| 1.3 | C | G7, then G | `chords?mode=build`, G7, G | 5 clean builds each | La Bamba, Lava |
| 1.4 | C | Down strums on four chords | `phrases`, `ukulele.four-chords`, 60 then 80 | 3 runs at 90% at 80 | Let It Be, Stand By Me |
| 1.5 | C | One-minute changes | `chords?mode=changes`, pairs C-Am, Am-F, F-C, C-G7, F-G7 | 30 changes a minute on each pair (JustinGuitar's bar) | all strummed songs |
| 1.6 | C | Down, down-up | `rhythm` read-and-tap; **NEW** pattern `ukulele-d-du` (D DU D DU) in `rhythm-patterns.json` (S) | 5 runs at 80% at 80 | You Are My Sunshine |
| 1.7 | F | Thumb, then a pinch | `chords?mode=fingerpick`, pattern `uke-two-strings` over C F G7, 60 | 3 runs at 80% at 70 | Saints |
| 1.8 | M | Open-string melodies | `phrases`, `ukulele.twinkle`, `ukulele.mary`, `ukulele.ode-to-joy` | 3 runs at 90% at the phrase tempo, each | Twinkle, Ode to Joy |
| 1.9 | M | Read the first notes | `reading` flashcards, ukulele, first position, frets 0 to 3, tab hidden | 20 notes at 90%, under 3 s each | Twinkle, Ode to Joy |
| 1.10 | E | Major or minor | `ear/chord-qualities?qualities=major,minor` (Ear path) | 20 answers at 80% | |
| 1.11 | C | First whole song | `strum` with the song's chords; **NEW** song preset and strum pattern in Strum a progression (M, round-1 rec 2) | One shelf song start to end, 3 runs at 80% (chord and timing), no stops | shelf |

**Song shelf, level 1**

| # | Song (artist) | Kind | Teaches | Key, tempo, chords or technique | Diff | MuseScore | Fallback |
|---|---|---|---|---|---|---|---|
| 1 | You Are My Sunshine (Jimmie Davis, trad.) | strum | First I IV V7 song | C, about 100, C F G7 (C7), D DU | 1 | [UkeTrek, solo ukulele, high-G, community](https://musescore.com/user/12852721/scores/6689039) (opened) | [LiveUkulele](https://liveukulele.com/tabs/you-are-my-sunshine-ukulele-tab/) |
| 2 | La Bamba (Ritchie Valens) | strum | The three-chord loop | C, about 150 (count it in half time, 75), C F G | 1 | [Hal Leonard, solo ukulele, official](https://musescore.com/user/39593079/scores/15787867) (card) | [UkuTabs](https://ukutabs.com/r/ritchie-valens/la-bamba/) |
| 3 | Lava (Pixar, James Ford Murphy) | strum | Hawaiian lilt, G7 | C, about 90, C G7 F | 1 | [Arr. Dennis McCorkle, beginner, official](https://musescore.com/user/97106398/scores/18630112) (card) | [chords and lyrics, official](https://musescore.com/user/39593079/scores/16013074) (card) |
| 4 | Let It Be (Beatles) | strum | The four first chords | C, about 72, C G Am F | 2 | [Arr. Winter Sparrow, beginner, official](https://musescore.com/user/97106398/scores/18843655) (card) | [UkuTabs](https://ukutabs.com/t/the-beatles/let-it-be/) |
| 5 | Stand By Me (Ben E. King) | strum | Am, steady downs, then island later | C, about 118, C Am F G | 2 | [community duet with ukulele part](https://musescore.com/user/66925/scores/9059096) (opened); [Arr. Winter Sparrow, beginner, official](https://musescore.com/user/97106398/scores/18822262) | [UkuTabs](https://ukutabs.com/b/ben-e-king/stand-by-me/) |
| 6 | Twinkle Twinkle Little Star (trad., Mozart's theme) | pick | Open strings plus frets 2 and 3 | C, 80, single notes | 1 | [Le Grave Musicien, ukulele tab, community](https://musescore.com/user/30473545/scores/5469840) (opened) | app phrase `ukulele.twinkle` |
| 7 | Ode to Joy (Beethoven) | pick | Stepwise melody, C scale | C, 90, single notes | 1 | [taha_, ukulele tab, 4.7 from 82 ratings](https://musescore.com/user/37578363/scores/6648635) (opened) | app phrase `ukulele.ode-to-joy` |
| 8 | When the Saints Go Marching In (trad., New Orleans) | pick | Melody with a thumb pinch | C, 100, melody then C G7 F | 2 | [Jose Manuel Acuna, fingerpicked, community](https://musescore.com/user/30013820/scores/6077813) (opened) | app phrase `ukulele.saints` |

**Boss.** Two shelf songs (one strummed, one picked) start to end at the listed tempo with no stops, recorded in Practice Lab; plus the C-Am-F-G7 cycle at 30 changes a minute.

---

## Level 2. Island strum, chucks and the claw (about 6 weeks)

Goal: the strums most pop ukulele songs use, and the first real fingerpicking patterns. Adds island strum, chuck, reggae offbeat; Dm, C7, A7, D7, E7, Em, D; the claw and alternating thumb; the C major scale.

| # | Strand | Step | Drill and setup | Done means | Feeds |
|---|---|---|---|---|---|
| 2.1 | C | Island strum | `rhythm`, `ukulele-island-strum`, 70 then 90 | 5 runs at 80% at 90 | Riptide, Hey Soul Sister |
| 2.2 | C | Chuck on 2 and 4 | `rhythm`, `ukulele-chuck`, 70 then 90 | 5 runs at 75% at 90 (timing only; the chuck itself is not graded) | I'm Yours |
| 2.3 | C | Reggae offbeat | `rhythm`, `off-beats`; **NEW** `ukulele-reggae` pattern (chucks on the "and", S) | 5 runs at 80% at 74 | Three Little Birds |
| 2.4 | C | Second chord set | `chords?mode=build`: Dm C7 A7 D E7, then Em and D7; **NEW** curated Em and D7 shapes (S) | 5 clean builds each | Count on Me, Aloha 'Oe |
| 2.5 | C | Changes for the new chords | `chords?mode=changes`: C-Em, Am-Dm, C-A7, A7-Dm, G7-C7, F-Em | 30 a minute each | shelf |
| 2.6 | F | The claw | `chords?mode=fingerpick`, `uke-claw` over C Am F G, 60 to 80 | 3 runs at 85% at 80 | You Are My Sunshine (fingerstyle) |
| 2.7 | F | Claw with alternating thumb | `uke-claw-alternating` over C D7 G7 C | 3 runs at 80% at 80 | Love Me Tender |
| 2.8 | F | Outside in | `uke-outside-in` over Am F C G | 3 runs at 80% at 80 | Riptide (picked verse) |
| 2.9 | F | A picked song | **NEW** fingerpick preset You Are My Sunshine (claw, C F G7, S) | 3 runs at 80% at the preset tempo | You Are My Sunshine |
| 2.10 | M | C major scale, first position | `scales`, ukulele, C major one octave, 60 to 80 | 3 runs at 95% notes at 80 | Aloha 'Oe melody |
| 2.11 | M | Read first-position tunes | `reading` sight-reading, ukulele, level climb; `phrases` `ukulele.oh-susanna`, `ukulele.camptown` | Reading level 2; each phrase 3 runs at 90% | Aloha 'Oe |
| 2.12 | C | Strum a song with chucks | `strum`; **NEW** presets I'm Yours and Three Little Birds (S) | 3 full runs at 80% | I'm Yours, Three Little Birds |
| 2.13 | E | Hear I, IV and V | `ear/progressions?functions=I,IV,V` | 20 answers at 80% | |

**Song shelf, level 2**

| # | Song (artist) | Kind | Teaches | Key, tempo, chords or technique | Diff | MuseScore | Fallback |
|---|---|---|---|---|---|---|---|
| 1 | I'm Yours (Jason Mraz) | strum | Chuck, swung 16ths | C, about 76, C G Am F | 2 | [community, ukulele part, 758 views](https://musescore.com/user/4171401/scores/1223786) (opened) | [UkuTabs](https://ukutabs.com/j/jason-mraz/im-yours/) |
| 2 | Three Little Birds (Bob Marley) | strum | Reggae offbeat | C, about 74, C F G | 1 | [The Daily Ukulele, official, 4.9](https://musescore.com/user/39593079/scores/15786154) (card) | [UkuTabs](https://ukutabs.com/b/bob-marley/three-little-birds/) |
| 3 | Riptide (Vance Joy) | strum | Island strum, a change every two beats | Am, about 102, Am G C F | 3 | [The Daily Ukulele, official](https://musescore.com/user/39593079/scores/21386461) (card) | [UkuTabs](https://ukutabs.com/v/vance-joy/riptide/) |
| 4 | Count on Me (Bruno Mars) | strum | Six chords, Em and Dm | C, about 89, C Em Am G F Dm | 2 | [community, "Ukulele" in title](https://musescore.com/user/53375979/scores/11672089) (opened) | [UkuTabs](https://ukutabs.com/b/bruno-mars/count-on-me/) |
| 5 | Hey, Soul Sister (Train) | strum | Island strum plus intro riff | C, about 97, C G Am F | 3 | [Hal Leonard, solo ukulele, official](https://musescore.com/user/39593079/scores/15747361) (card) | [UkuTabs](https://ukutabs.com/t/train/hey-soul-sister/) |
| 6 | Over the Rainbow (IZ, strummed) | strum | Em and E7 in a ballad | C, about 81, C Em Am F G E7 | 2 | [for ukulele and cello, 4.7K views](https://musescore.com/user/17125406/scores/4821206) (opened) | [LiveUkulele](https://liveukulele.com/tabs/somewhere-over-the-rainbow-wonderful-world-iz/) |
| 7 | Aloha 'Oe (Lili'uokalani, 1878) | strum, pick | Hawaiian melody, C7 and D7 | C, about 70, C C7 F G7 D7 | 2 | [pat.anderson, solo ukulele with chords, 786 views](https://musescore.com/user/1630156/scores/1755726) (opened) | [LiveUkulele](https://liveukulele.com/tabs/aloha-oe-queen-liliuokalani/) |
| 8 | Love Me Tender (Elvis; Aura Lee) | pick | Claw with alternating thumb | C, about 72, C D7 G7 | 2 | [community solo ukulele](https://musescore.com/user/34976289/scores/6683555) (opened); [easy, official](https://musescore.com/user/39593079/scores/15936487) | |
| 9 | You Are My Sunshine, fingerstyle | pick | Claw and pinches under a melody | C, about 90 | 3 | [amponin, 4.8 from 137 ratings](https://musescore.com/user/36587406/scores/6583664) (opened) | |

**Boss.** One island-strum song and one chuck or reggae song at the shelf tempo; one fingerpicked song with the claw at 80% of its tempo; the C major scale at 80.

---

## Level 3. Minor keys, three-time and p-i-m-a (about 6 weeks)

Goal: songs in 3/4 and 6/8, minor keys, and four-finger picking. Adds waltz and 6/8 strums; p-i-m-a, rolls, Ohta-San, pinches; Gm and Bb (first partial barre); A natural minor and A minor pentatonic.

| # | Strand | Step | Drill and setup | Done means | Feeds |
|---|---|---|---|---|---|
| 3.1 | C | Waltz strum | **NEW** `ukulele-waltz` pattern D DU DU in 3/4 (S) | 5 runs at 80% at 100 | Edelweiss |
| 3.2 | C | 6/8 strum | **NEW** `ukulele-six-eight` D du du, D du du (S) | 5 runs at 80% at 60 (dotted quarter) | Perfect |
| 3.3 | F | Thumb on 4, then i m a | `chords?mode=fingerpick`, `uke-tima` over Am C D F, 60 to 80 | 3 runs at 85% at 80 | House of the Rising Sun |
| 3.4 | F | Up and down roll in 6/8 | `uke-rolling`, then preset `uke-house-of-the-rising-sun` | Preset at its tempo, 3 runs at 80% | House of the Rising Sun |
| 3.5 | F | Ohta-San 6/8 | `uke-ohta`, then preset `uke-cant-help-falling-in-love` | Preset at its tempo, 3 runs at 80% | Can't Help Falling in Love |
| 3.6 | F | Thumb, then a m i; pinches | `uke-tami`, then preset `uke-hallelujah` | Preset at its tempo, 3 runs at 80% | Hallelujah |
| 3.7 | F | A minor melody with the thumb | preset `uke-scarborough-fair` | 3 runs at 80% | Scarborough Fair |
| 3.8 | C | Gm and Bb | `chords?mode=build` Gm, Bb; **NEW** curated Bb (S); `chords?mode=changes` F-Bb, Bb-C7, Dm-Gm | 20 changes a minute each | Edelweiss variants, Mad World |
| 3.9 | M | A natural minor, A minor pentatonic | `scales`, ukulele, first position, 60 to 80 | 3 runs at 95% at 80 | Greensleeves |
| 3.10 | M | A tune from a score | Song Studio: import a shelf melody (Greensleeves or Scarborough Fair), wait mode, then performance | Wait mode 90% notes, then performance 80% | Greensleeves |
| 3.11 | M | Read in 3/4 and 6/8 | `reading` sight-reading; **NEW** if missing: a meter setting (3/4, 6/8) for the generator (S) | Reading level 3 | |
| 3.12 | E | Hear three versus four | rhythm by ear in 6/8 (TASKS lists 6/8 for rhythm by ear); `ear/chord-qualities?qualities=major,minor` with inversions off | 20 answers at 85% | |

**Song shelf, level 3**

| # | Song (artist) | Kind | Teaches | Key, tempo, chords or technique | Diff | MuseScore | Fallback |
|---|---|---|---|---|---|---|---|
| 1 | Can't Help Falling in Love (Elvis) | pick | 6/8 picking, E7 and A7 | C, preset tempo, C Em Am F G E7 A7 Dm G7 | 2 | [RoyBrown, solo ukulele](https://musescore.com/user/35093617/scores/6506276) (opened); [Arr. Yuri Noronha, beginner, official](https://musescore.com/user/97106398/scores/19443253) | app preset |
| 2 | Hallelujah (Leonard Cohen) | pick | Slow 6/8 roll, pinches | C, preset tempo, C Am F G E7 | 2 | [debr0316, solo ukulele, 4.8](https://musescore.com/user/27686314/scores/5959807) (opened) | app preset |
| 3 | House of the Rising Sun (trad., Animals) | pick | p-i-m-a in 6/8, E major in A minor | Am, preset tempo, Am C D F E | 2 | [easy ukulele with tab, beginner, official](https://musescore.com/user/39593079/scores/15936460) (card) | [UkuleleGo lesson](https://ukulelego.com/lessons/house-of-the-rising-sun-ukulele-lesson/) |
| 4 | Edelweiss (Rodgers and Hammerstein) | strum, pick | Waltz strum, then the melody | C, about 100, C G7 F Dm | 1 | [karissabee, instrumental, solo ukulele](https://musescore.com/user/10633211/scores/6621255) (opened) | |
| 5 | Scarborough Fair (trad. English) | pick | Dorian melody in 3/4 | Dm or Am, about 100 | 2 | [Jose Manuel Acuna, solo ukulele](https://musescore.com/user/30013820/scores/6066764) (opened) | app preset |
| 6 | Greensleeves (trad. English) | pick | A minor melody in 6/8, reading | Am, about 60 (dotted quarter) | 2 | [balpen, solo ukulele, 4.8 from 53 ratings](https://musescore.com/user/83091/scores/3378551) (opened) | |
| 7 | Mad World (Tears for Fears, Gary Jules) | pick, strum | Minor arpeggios | Em, about 88, Em G D A | 2 | [Arr. Uke of Carl, beginner, official](https://musescore.com/user/97106398/scores/18176743) (card) | [UkuTabs](https://ukutabs.com/g/gary-jules/mad-world/) |
| 8 | Perfect (Ed Sheeran) | strum | 6/8 strum ballad | G, about 63, G Em C D | 2 | [easy ukulele with tab, official](https://musescore.com/user/39593079/scores/15931543) (card) | |
| 9 | Amazing Grace (John Newton) | pick | 3/4 melody, pickup notes | C, about 80 | 1 | [Nancy Corgiat Ford, solo ukulele with chords](https://musescore.com/user/28001497/scores/8856255) (opened) | app phrase `ukulele.amazing-grace` |

**Boss.** One 6/8 fingerpicked song at the preset tempo; one strummed song in 3/4 or 6/8 at tempo; Greensleeves or Scarborough Fair at 80% in Song Studio performance mode.

---

## Level 4. Swing, the Hawaiian vamp and Travis picking (about 7 weeks)

Goal: the old-time and Hawaiian sound, and an independent thumb. Adds swing strum, calypso strum; the ragtime circle of sevenths (E7 A7 D7 G7, B7); Cmaj7, Fmaj7, Am7, C6, dim; alternating thumb, Travis, the fancy eight; melody over a moving thumb; keys of G and F.

| # | Strand | Step | Drill and setup | Done means | Feeds |
|---|---|---|---|---|---|
| 4.1 | C | Swing strum | `rhythm`, `swing-eighths`; **NEW** `ukulele-swing` D DU DU swung (S) | 5 runs at 80% at 120 | Five Foot Two, Fly Me to the Moon |
| 4.2 | C | The ragtime circle | `chords?mode=changes` E7-A7, A7-D7, D7-G7, G7-C; **NEW** curated B7 (S) | 30 a minute each | Five Foot Two, Ain't She Sweet |
| 4.3 | C | The Hawaiian vamp in three keys | `phrases`, `ukulele.hawaiian-vamp`; **NEW** the same vamp in F and G (S) | 3 runs at 85% in each key | Tiny Bubbles, Pearly Shells |
| 4.4 | C | Calypso strum | **NEW** `ukulele-calypso` D D U U D U (S) | 5 runs at 80% at 100 | Jambalaya, Pearly Shells |
| 4.5 | C | Major sevenths and sixths | `chords?mode=build` Cmaj7 Fmaj7 Am7 C6 C#dim; **NEW** curated shapes (S) | 5 clean builds each | Fly Me to the Moon, Blue Hawaii |
| 4.6 | F | Alternating thumb on 3 and 4 | `uke-alternating`, 70 to 100 | 3 runs at 85% at 100 | Freight Train |
| 4.7 | F | Travis | `uke-travis` over C E7 F G7 | 3 runs at 85% at 90 | Freight Train, Dust in the Wind |
| 4.8 | F | Fancy eight (3 3 2) | `uke-fancy-eight` over C Am F G | 3 runs at 80% at 80 | Dust in the Wind |
| 4.9 | F | Melody over the thumb | **NEW** fingerpick preset Freight Train (Travis, S); then the shelf score in Song Studio | Preset 3 runs at 80%; Song Studio performance 80% | Freight Train |
| 4.10 | M | Keys of G and F | `scales`, ukulele, G major and F major, first position | 3 runs at 95% at 90 | Freight Train in G |
| 4.11 | M | Dotted and swung reading | `rhythm`, `dotted-quarters`; `reading` sight-reading level 3 to 4 | Rhythm 5 runs at 80%; reading level 4 | |
| 4.12 | E | Dominant seventh by ear | `ear/chord-qualities?qualities=major,minor,dominant-7`; Circle of fifths path: keys of G and F | 20 answers at 80% | |

**Song shelf, level 4**

| # | Song (artist) | Kind | Teaches | Key, tempo, chords or technique | Diff | MuseScore | Fallback |
|---|---|---|---|---|---|---|---|
| 1 | Five Foot Two, Eyes of Blue (Henderson, 1925) | strum | Swing, the ragtime circle | C, about 150 (feel in 2), C E7 A7 D7 G7 | 2 | [Hal Leonard, official](https://musescore.com/user/39593079/scores/15566116) (card) | [LiveUkulele solo arrangement](https://liveukulele.com/tabs/five-foot-two-eyes-of-blue/) |
| 2 | Ain't She Sweet (Ager, 1927) | strum | Swing, diminished passing chord | C, about 130, C C#dim G7 E7 A7 D7 | 2 | [Nancy Corgiat Ford, ukulele and piano](https://musescore.com/user/28001497/scores/8360028) (opened) | |
| 3 | Tiny Bubbles (Don Ho) | strum | The Hawaiian vamp | C, about 100, C G7 F | 1 | [Nancy Corgiat Ford, lead sheet with ukulele chords](https://musescore.com/user/28001497/scores/13499833) (opened); [solo ukulele, official](https://musescore.com/user/39593079/scores/15610603) | [UkuTabs](https://ukutabs.com/d/don-ho/tiny-bubbles/) |
| 4 | Pearly Shells (Pober, Edwards) | strum | Calypso feel, vamp | C, about 110, C F G7 D7 | 1 | [Hal Leonard, solo ukulele, official](https://musescore.com/user/39593079/scores/15610963) (card) | |
| 5 | Blue Hawaii (Robin, Rainger) | strum | Slow Hawaiian ballad, 6 and maj7 | C, about 80, C Cmaj7 F Fm G7 | 2 | [Nancy Corgiat Ford, ukulele and piano](https://musescore.com/user/28001497/scores/13501438) (opened) | |
| 6 | Jambalaya (Hank Williams) | strum | Two-chord country boom-chuck | C, about 120, C G7 | 1 | [The Daily Ukulele, official](https://musescore.com/user/39593079/scores/15787171) (card) | [UkuTabs](https://ukutabs.com/h/hank-williams/jambalaya-on-the-bayou/) |
| 7 | Freight Train (Elizabeth Cotten) | pick | Travis with the melody on top | G, about 100, G D7 B7 C | 3 | [etbridges, "in G for uke", solo ukulele](https://musescore.com/user/11097446/scores/2946806) (opened); [Arr. Jim Schustedt, official](https://musescore.com/user/39593079/scores/24592543) | |
| 8 | Dust in the Wind (Kansas) | pick | Travis-style pattern with moving chords | C, about 100, C Cmaj7 Cadd9 Am Asus2 G | 3 | [Johanne Ramirez, ukulele duet, 4.9](https://musescore.com/user/29528599/scores/7049680) (opened); [The Daily Ukulele, official](https://musescore.com/user/39593079/scores/21213778) | |
| 9 | Fly Me to the Moon (Bart Howard) | strum | First jazz progression, swing | C, about 120, Am7 Dm7 G7 Cmaj7 F E7 | 3 | [svarah05, solo ukulele, 4.8 from 53 ratings](https://musescore.com/user/33842534/scores/7027647) (opened) | [UkuTabs](https://ukutabs.com/f/frank-sinatra/fly-me-to-the-moon/) |

**Boss.** A swing song with the ragtime circle at 120; Freight Train or Dust in the Wind at 80% in Song Studio performance; the Hawaiian vamp in C, F and G.

---

## Level 5. Closed shapes, the blues and the first solos (about 8 weeks)

Goal: play in any common key and start improvising. Adds barre and closed shapes (Bb, Cm, D barre, Bm, movable 7th); triplet strum; the 12-bar shuffle; A minor pentatonic box 1, first licks and a first solo; backward rolls; notes to fret 7.

| # | Strand | Step | Drill and setup | Done means | Feeds |
|---|---|---|---|---|---|
| 5.1 | C | Barre and closed shapes | `chords?mode=pick` (arpeggio check) Bb, Cm, D (barre 2), Bm; **NEW** curated Cm and Bm (S) | 5 of 5 clean arpeggios each | Wonderwall, Viva la Vida |
| 5.2 | C | Barre changes | `chords?mode=changes` F-Bb, Bb-C7, D-Bm, Bm-G | 20 a minute each | shelf |
| 5.3 | C | Triplet strum (i p i) | `rhythm`, `triplets`; **NEW** `ukulele-triplet` (S) | 5 runs at 80% at 90 (eighth-note triplets) | Hit the Road Jack fills |
| 5.4 | C | 12-bar shuffle in A and C | `strum` with Jam's `blues` progression; **NEW** blues preset with a shuffle strum (S) | 3 choruses at 90, 80% timing and chords | Sweet Home Chicago |
| 5.5 | S | A minor pentatonic, box 1 | `scales`, ukulele, A minor pentatonic; **NEW** ukulele scale positions (round-1 rec 7, M) | 3 runs at 95% at 80 | Blues for Ukulele |
| 5.6 | S | Three blues licks | **NEW** ukulele blues phrases: turnaround in A, a pentatonic lick, a double-stop lick (S) | Each 3 runs at 85% at the phrase tempo | first solo |
| 5.7 | S | First solo | `jam`, blues in A, ukulele, minor pentatonic lit | 3 choruses where the chorus report shows 80% scale tones and phrases ending on chord tones | boss |
| 5.8 | F | Backward roll | `uke-backward-roll` over C G Am Em F C F G | 3 runs at 85% at 80 | Canon in C |
| 5.9 | F | A fingerstyle pop arrangement | Song Studio: Perfect (fingerstyle) or Canon in C, wait then performance | Performance 80% at 90% of tempo | Perfect, Canon |
| 5.10 | F | A fingerpicked blues | Song Studio: Blues for Ukulele #2 or Lillebjorn's blues | Performance 80% | blues pieces |
| 5.11 | M | Notes to fret 7 | `fretboard?mode=find`, ukulele, frets 0 to 7; **NEW** `technique.ukulele.interval-recall` skill (S) | 30 notes at 90%, under 3 s | reading |
| 5.12 | E | The blues form by ear | `ear/progressions` with I7 IV7 V7; `ear/scales?scales=major-pentatonic,minor-pentatonic,blues` | 20 answers at 80% | |

**Song shelf, level 5**

| # | Song (artist) | Kind | Teaches | Key, tempo, chords or technique | Diff | MuseScore | Fallback |
|---|---|---|---|---|---|---|---|
| 1 | Hit the Road Jack (Percy Mayfield, Ray Charles) | strum | Descending minor line, riff | Am, about 172 (86 in half time), Am G F E7 | 2 | [Hal Leonard, solo ukulele, official](https://musescore.com/user/39593079/scores/15746761) (card) | [UkuTabs](https://ukutabs.com/r/ray-charles/hit-the-road-jack/), [Ukulele Hunt tabs](https://ukulelehunt.com/2025/02/25/ray-charles-hit-the-road-jack-tabs/) |
| 2 | Wonderwall (Oasis) | strum | 16th strum, sus chords | Em, about 87, Em7 G Dsus4 A7sus4 C | 2 | [Arr. Cristian Hernandez Castellvi, beginner, official](https://musescore.com/user/97106398/scores/18079276) (card) | [UkuTabs](https://ukutabs.com/o/oasis/wonderwall/) |
| 3 | Viva la Vida (Coldplay) | strum, pick | Driving eighths; a fingerstyle version | C, about 138, C D G Em | 2 | [Sthub, fingerstyle arrangement, 4.7](https://musescore.com/user/30325176/scores/6151196) (opened) | [UkuTabs (strum)](https://ukutabs.com/c/coldplay/viva-la-vida/) |
| 4 | Sweet Home Chicago (Robert Johnson) | strum | 12-bar shuffle | A or E, about 110 swung, A7 D7 E7 | 2 | [Hal Leonard, ukulele with vocals, official](https://musescore.com/user/39593079/scores/15597874) (card) | Jam `blues` progression |
| 5 | Dream a Little Dream of Me (Andre, Schwandt) | strum | Swing ballad, chromatic sevenths | C, about 75, C B7 Ab7 G7 Am F | 3 | [Arr. Phil Kell, intermediate, official](https://musescore.com/user/97106398/scores/18047500) (card); **LOW-G** [Matt Funamura, 4.9](https://musescore.com/user/1729791/scores/8515712) (opened) | [UkuTabs](https://ukutabs.com/t/the-mamas-and-the-papas/dream-a-little-dream-of-me/) |
| 6 | Blues for Ukulele #2 (Jack Lima) | pick | A picked blues study | A, about 90 | 2 | [Prof. Jack Lima, ukulele tab](https://musescore.com/user/15872026/scores/3482536) (opened) | |
| 7 | Lillebjorn's Ukulele Blues (Lillebjorn Nilsen) | pick, solo | Fingerstyle blues with a thumb bass | C, about 100 | 3 | [posted under the composer's name, 4.8 from 73 ratings](https://musescore.com/user/1950411/scores/6760630) (opened) | |
| 8 | Canon in C (Pachelbel) | pick | Rolls over eight chords | C, about 70, C G Am Em F C F G | 2 | [SilverArrow's Music, 1.9K views, 4.7 from 435 ratings](https://musescore.com/user/29535937/scores/5605059) (opened) | [LiveUkulele (in D)](https://liveukulele.com/tabs/canon-in-d-ukulele-tab/) |
| 9 | Perfect, fingerstyle (Ed Sheeran) | pick, solo | A 6/8 fingerstyle solo | G, about 63 | 3 | [igcsecrashcou, 4.7 from 132 ratings](https://musescore.com/user/36648450/scores/6463879) (opened) | |

**Boss.** 12-bar blues in A: one chorus of shuffle comping, then two improvised choruses over Jam at 90; a barre-chord song at tempo; one fingerstyle piece (Canon in C, Perfect or a blues) at 80% in performance mode.

---

## Level 6. Campanella and the first solo arrangements (about 8 weeks, HIGH-G)

Goal: the ringing re-entrant sound, and solo pieces that carry melody and harmony together. Adds campanella scales and tunes; melody on top with the thumb under; first chord melody; major pentatonic soloing; notes to fret 10; playing from memory.

| # | Strand | Step | Drill and setup | Done means | Feeds |
|---|---|---|---|---|---|
| 6.1 | M | Campanella C major scale | **NEW** campanella fingerings in `scales` (hidden on low-G, ring-over checked as experimental, M) | 3 runs at 95% notes at 70 | all campanella pieces |
| 6.2 | M | Campanella C major pentatonic | same drill | 3 runs at 95% at 90 (RSL Grade 4 to 5 tempo) | Cripple Creek |
| 6.3 | M | Campanella tunes | **NEW** phrases London Bridge and Twinkle in campanella (S) | Each 3 runs at 85% | London Bridge |
| 6.4 | F | Melody on top, thumb under | Song Studio: You Are My Sunshine (fingerstyle, from level 2) at full tempo, then Aloha 'Oe fingerstyle | Performance 85% | Aloha 'Oe |
| 6.5 | F | First chord melody | **NEW** chord-melody phrases: Amazing Grace and Aloha 'Oe, chords under a melody note, graded on the top note (round-1 rec 5, M) | 3 runs at 80% | Amazing Grace |
| 6.6 | F | Pinch the melody, hold the bass | `uke-two-strings`, then The Lion Sleeps Tonight in Song Studio | Performance 80% | Lion Sleeps Tonight |
| 6.7 | M | Read to fret 10 | `reading` flashcards frets 0 to 10; sight-reading level 4 to 5 | 30 notes at 90% under 3 s; reading level 5 | |
| 6.8 | M | A campanella jig | Song Studio: Swallowtail Jig or Cripple Creek, 80 then 100 | Performance 80% at 100 | Swallowtail, Cripple Creek |
| 6.9 | S | Major pentatonic over I IV V | `jam`, a pop or Hawaiian I IV V, C major pentatonic lit | 3 choruses at 80% scale tones | Hawaiian solos |
| 6.10 | E | Play back what you hear | `ear/melody-dictation?answer=play-back&level=major-pentachord` (Ear path) | 10 melodies at 80% | |
| 6.11 | F | Memorise a solo | Practice Lab, one shelf solo from memory | 2 clean takes on two days | boss |

**Song shelf, level 6**

| # | Song (artist) | Kind | Teaches | Key, tempo, chords or technique | Diff | MuseScore | Fallback |
|---|---|---|---|---|---|---|---|
| 1 | London Bridge (trad.) | pick | First campanella tune | C, about 90 | 1 | [fingerstyle, Arr. Yuri Noronha, beginner, official](https://musescore.com/user/97106398/scores/18829489) (card; not campanella) | [UkuleleGo campanella lesson](https://ukulelego.com/lessons/a-campanella-lesson/amp/) |
| 2 | Cripple Creek (trad. bluegrass) | pick | Campanella at speed, high-G | C, 80 to 110 | 2 | [doccoyoti, "campanella style for high G"](https://musescore.com/user/54234609/scores/13352047) (opened) | |
| 3 | Minuet in G (Petzold, once credited to Bach) | pick | Classical reading, two voices | G, about 100, 3/4 | 2 | [UkeTrek, solo ukulele, 4.8](https://musescore.com/user/12852721/scores/7043531) (opened) | |
| 4 | Swallowtail Jig (trad. Irish) | pick | 6/8 jig; try campanella fingerings | Em, 80 to 110 (dotted quarter 60 to 80) | 3 | [dancramp, solo ukulele, 4.8](https://musescore.com/user/2783316/scores/6984205) (opened) | |
| 5 | Aloha 'Oe, fingerstyle | solo | Melody with thumb bass | C or F, about 70 | 2 | [lorenzopaolinelli, ukulele and piano](https://musescore.com/user/31545341/scores/6774305) (opened) | [LiveUkulele solo tab](https://liveukulele.com/tabs/aloha-oe-queen-liliuokalani/) |
| 6 | Amazing Grace, fingerstyle | solo | First chord melody in 3/4 | C, about 80 | 1 | [Le Grave Musicien, 4.6 from 66 ratings](https://musescore.com/user/30473545/scores/5469855) (opened); [chord melody, Arr. Christopher Bell, official](https://musescore.com/user/97106398/scores/17594167) | [UkuleleGo chord melody](https://ukulelego.com/tab/amazing-grace-chord-melody/) |
| 7 | The Lion Sleeps Tonight (Solomon Linda) | solo | Chord melody with pinches | F or C, about 120 | 2 | [Cody Walton, chord melody, 4.8](https://musescore.com/user/4367091/scores/7355297) (opened) | |
| 8 | Mele Kalikimaka (R. Alex Anderson) | strum, solo | Swing strum, then the chord melody | C, about 120 | 2 | [Cody Walton, chord melody, 4.8](https://musescore.com/user/4367091/scores/6455822) (opened) | |
| 9 | Lava, ukulele solo (James Ford Murphy) | solo | A long Hawaiian-pop solo | C, about 90 | 3 | [Fiji Life, solo ukulele, 4.7](https://musescore.com/user/37265061/scores/6782357) (opened) | |
| 10 | Hawaii Aloha (Lorenzo Lyons) | solo | Hawaiian hymn, chord melody | C or F, about 76 | 2 | [RoyBrown, solo ukulele, 4.7](https://musescore.com/user/35093617/scores/6525021) (opened) | |

**Boss.** One solo arrangement from memory at tempo; one campanella piece at 100; the C major pentatonic in campanella style at 90.

---

## Level 7. Jazz chords, comping and chord melody (about 9 weeks)

Goal: play standards two ways, comping and as a chord melody. Adds maj7, m7, 7, m7b5, dim7 and 6 shapes in two inversions; ii-V-I in four keys; swing comping, bossa; guide tones; seventh-chord arpeggios; reading lead sheets.

| # | Strand | Step | Drill and setup | Done means | Feeds |
|---|---|---|---|---|---|
| 7.1 | C | Seventh-chord shapes | `chords?mode=build` (voicing generator) Cmaj7 Dm7 G7 Em7 A7 Fmaj7 Bm7b5 E7 Ebdim7; **NEW** curated movable shapes (S) | 5 clean builds each | all standards |
| 7.2 | C | ii-V-I in C, F, G, Bb | `jam`, `ii-v-i`, ukulele; `chords?mode=changes` Dm7-G7, G7-Cmaj7 | 25 changes a minute; Jam 4 choruses without a dropped change | Autumn Leaves, Satin Doll |
| 7.3 | C | Swing comping | **NEW** `ukulele-swing-comp` (four to the bar, chuck on 2 and 4, S) over Jam's ii-v-i | 5 runs at 80% at 120 | All of Me, Bye Bye Blackbird |
| 7.4 | C | Bossa | **NEW** `ukulele-bossa` (thumb on 1 and 3, fingers syncopated, S) | 5 runs at 80% at 110 | Blue Bossa (level 9), Misty |
| 7.5 | F | Chord melody, 8 bars | **NEW** chord-melody phrases: Fly Me to the Moon and Autumn Leaves, bars 1 to 8 (M) | 3 runs at 80% | Fly Me to the Moon |
| 7.6 | F | A full chord melody | Song Studio: Moon River or La Vie en Rose, wait then performance | Performance 80% at tempo | Moon River |
| 7.7 | M | Read a lead sheet | Song Studio or a printed lead sheet: melody with chord symbols; `reading` sight-reading level 5 | Reading level 5 | All of Me |
| 7.8 | S | Seventh-chord arpeggios | **NEW** ukulele arpeggio fingerings for maj7, m7, 7 in `scales` (S) | 3 runs at 95% at 80 | |
| 7.9 | S | Guide tones over ii-V-I | `licks`, major ii-V-I, ukulele; `chord-scales` for Dorian and Mixolydian | 3 licks at 85% in two keys | soloing |
| 7.10 | E | Seventh chords by ear | `ear/chord-qualities?qualities=major-7,dominant-7,minor-7` | 20 answers at 80% | |
| 7.11 | E | ii-V-I by ear | `ear/progressions` with ii, V, I (Ear path, jazz steps) | 20 answers at 80% | |

**Song shelf, level 7**

| # | Song (artist) | Kind | Teaches | Key, tempo, chords or technique | Diff | MuseScore | Fallback |
|---|---|---|---|---|---|---|---|
| 1 | Fly Me to the Moon (Bart Howard) | solo | Chord melody on a circle progression | C, about 110 | 2 | [Cody Walton, solo ukulele, 4.7](https://musescore.com/user/4367091/scores/6055383) (card) | level 4 score |
| 2 | Moon River (Mancini) | solo | Jazz chord melody in 3/4 | C, about 90 | 2 | [Roy Genge, "for jazz ukulele"](https://musescore.com/user/33445730/scores/6276010) (opened) | |
| 3 | La Vie en Rose (Louiguy) | solo | Chord melody, a French standard | C, about 80 | 2 | [sleepytoddmusic, chord melody](https://musescore.com/user/33403748/scores/6025714) (opened) | |
| 4 | All of Me (Simons, Marks, 1931) | comp, solo | Comping a standard; secondary dominants | C, about 130, C E7 A7 Dm D7 G7 | 1 | [doccoyoti, ukulele lead sheet](https://musescore.com/user/54234609/scores/10068118) (opened); [Nancy Corgiat Ford lesson](https://musescore.com/user/28001497/scores/8856282) (opened) | |
| 5 | Bye Bye Blackbird (Henderson, Dixon) | strum, comp | Swing comping with chucks | F or G, about 130 | 2 | [Arr. Enea Acco, intermediate, official](https://musescore.com/user/97106398/scores/18559909) (card) | |
| 6 | Autumn Leaves (Kosma) | comp, solo | ii-V-I in major and minor | Em or Gm, about 120 | 3 | [Arr. Steve Chauvette, solo ukulele, intermediate, official](https://musescore.com/user/97106398/scores/19514317) (card); [RPMiller trio, ukulele comping part](https://musescore.com/user/18595/scores/48378) (opened) | |
| 7 | Satin Doll (Ellington, Strayhorn) | comp | ii-V chains | C, about 120 | 2 | [Arr. Susan Howell, beginner, official](https://musescore.com/user/97106398/scores/18176902) (card) | |
| 8 | Blue Moon (Rodgers, Hart) | strum, solo | I vi ii V, the doo-wop turn | C, about 100 | 1 | [Arr. Leo Baeza, beginner, official](https://musescore.com/user/97106398/scores/19890214) (card); [Nancy Corgiat Ford, ukulele and piano](https://musescore.com/user/28001497/scores/8100774) (card) | |
| 9 | Misty (Erroll Garner) | solo | Ballad chord melody, maj7 and m7b5 | Eb or C, about 66 | 3 | [Arr. Daniel Morriss, intermediate, official](https://musescore.com/user/97106398/scores/18088429) (card) | |
| 10 | Georgia on My Mind (Hoagy Carmichael) | solo | Ballad, chromatic bass | F, about 66 | 3 | [Arr. Larry Preece, intermediate, official](https://musescore.com/user/97106398/scores/18150721) (card) | |
| 11 | When the Saints, chord melody (trad.) | solo | A known tune as chord melody | C, about 110 | 1 | [Arr. Phil Kell, chord-melody solo, official](https://musescore.com/user/97106398/scores/18047470) (card) | |

**Boss.** One standard as a chord melody from memory (at least 32 bars); comp the same tune in swing for two choruses over Jam; ii-V-I in C, F, G and Bb at 25 changes a minute.

---

## Level 8. The advanced right hand and classical pieces (about 9 weeks)

Goal: the strokes and textures that make a solo ukulele sound full. Adds Formby split stroke, triple stroke, fan strokes (rasgueado); tremolo; p-a-m-i arpeggio studies; slurs and slides; natural harmonics; classical reading in sharp and flat keys; campanella in a minor key.

| # | Strand | Step | Drill and setup | Done means | Feeds |
|---|---|---|---|---|---|
| 8.1 | C | Formby split stroke | **NEW** `ukulele-split-stroke` (accent off beat 2, S) | 5 runs at 80% at 120 | Ain't She Sweet |
| 8.2 | C | Triple stroke | **NEW** `ukulele-triple-stroke` (RSL Grade 5 study, S) | 4 bars at 90, 80% | Malagueña |
| 8.3 | C | Fan strokes (rasgueado) | **NEW** `ukulele-fan` four-finger roll pattern (S) | 5 runs at 80% at 80 | Malagueña, Tico-Tico |
| 8.4 | F | Tremolo | **NEW** tremolo drill: one string, i m or p a m i, graded on note evenness (IOI spread) (M) | Even within the user's baseline at 4 notes a beat, 70 | Sakura, Recuerdos (aspiration) |
| 8.5 | F | p-a-m-i arpeggio triplets | `chords?mode=fingerpick`, `uke-tami` at 3 a click; then Spanish Romance in Song Studio | Preset 3 runs at 85% at 90; piece at 80% | Spanish Romance |
| 8.6 | F | Slurs and slides | `fretboard?mode=legato`, ukulele | 3 runs at 85% | Tico-Tico, Lágrima |
| 8.7 | F | Natural harmonics at frets 12, 7, 5 | **NEW** harmonics check (pitch an octave or more above the open string, S) | 12 harmonics at 90% pitch | Gymnopédie, capstones |
| 8.8 | F | Classical piece one | Song Studio: Lágrima or Spanish Romance, fix-the-spot loops | Performance 85% at tempo | shelf |
| 8.9 | F | Classical piece two | Song Studio: Gymnopédie or Für Elise (LOW-G) | Performance 85% at tempo | shelf |
| 8.10 | M | Classical reading | `reading` sight-reading level 6, keys to two sharps and two flats | Reading level 6 | |
| 8.11 | M | Campanella in minor | campanella D harmonic minor (RSL Grade 6 to 8, HIGH-G) in the 6.1 drill | 3 runs at 95% at 90 | |
| 8.12 | E | Cadences by ear | `ear/progressions` with V-I and IV-I in major and minor | 20 answers at 80% | |

**Song shelf, level 8**

| # | Song (artist) | Kind | Teaches | Key, tempo, chords or technique | Diff | MuseScore | Fallback |
|---|---|---|---|---|---|---|---|
| 1 | Spanish Romance (anon.) | solo | p-a-m-i triplet arpeggios | Am to A, about 90 (triplets) | 2 | [RoyBrown, solo ukulele, 4.6](https://musescore.com/user/35093617/scores/6570289) (opened); [Arr. Antonius Agung Setiawan, intermediate, official](https://musescore.com/user/97106398/scores/17497138) | app phrase (guitar has Spanish Romance) |
| 2 | Lágrima (Tárrega) | solo | Classical tone, slurs, E major to E minor | E or C, about 66 | 3 | [r c oriel, solo ukulele, 4.7](https://musescore.com/user/29441233/scores/6100803) (opened) | |
| 3 | Gymnopédie No. 1 (Satie) | solo | Slow 3/4, voicing a melody, harmonics optional | D or C, about 66 | 2 | [clearmatter, solo ukulele, 4.7](https://musescore.com/user/36704440/scores/6645722) (opened) | |
| 4 | Für Elise (Beethoven) | solo | Fast semiquavers, position shifts | Am, about 60 | 2 | **LOW-G** [flpages.com, 1.4K views, 4.8 from 257 ratings](https://musescore.com/user/35628773/scores/6266819) (opened) | |
| 5 | Malagueña (Lecuona) | strum, solo | Triplet and fan strokes, Phrygian | E or A, about 100 | 3 | [av8rpat, solo ukulele, 4.5](https://musescore.com/user/9481/scores/5202717) (opened); [Arr. Leo Baeza, intermediate, official](https://musescore.com/user/97106398/scores/19581430) | |
| 6 | Tico-Tico no Fubá (Zequinha de Abreu) | solo | Choro speed, slurs | Am, about 120 | 3 | [amiika, solo ukulele, 4.9](https://musescore.com/user/7812211/scores/6253027) (opened); [Prof. Jack Lima, 853 views](https://musescore.com/user/15872026/scores/3462196) (opened) | |
| 7 | The Entertainer (Joplin) | solo | Ragtime syncopation | C, about 80 | 2 | [arr. Fred Sokolow, easy ukulele, official, 4.5](https://musescore.com/user/39593079/scores/15863008) (card); [Jose Manuel Acuna, community](https://musescore.com/user/30013820/scores/6115512) (opened, rated 3.8) | app phrase (Aerophone has The Entertainer) |
| 8 | Sakura Sakura (trad. Japanese) | solo | Tremolo and campanella colour | Am, about 60 | 1 | [Roy Genge, solo ukulele](https://musescore.com/user/33445730/scores/6056795) (opened) | |
| 9 | Ain't She Sweet, split stroke (Ager) | strum | Formby split and triple strokes | C, about 130 | 2 | [Arr. Phil Kell, intermediate, official](https://musescore.com/user/97106398/scores/22712452) (card) | [Bruce Watson PDF](https://www.brucewatsonmusic.com/music/uke/Aint_she_sweet.pdf) (round 1; did not render in the browser) |
| 10 | Danny Boy (trad. Irish) | solo | Expressive chord melody, rubato | C, about 60 | 2 | [Arr. Brent Robitaille, beginner, official](https://musescore.com/user/97106398/scores/16254355) (card); **LOW-G** [Arr. Cindy Blevins, official](https://musescore.com/user/97106398/scores/16402072) | |

**Boss.** Two contrasting solos (one classical, one Latin or ragtime) at tempo at 85% in performance mode; the triple-stroke study at 90; Ain't She Sweet with split strokes at 120.

---

## Level 9. Up the neck and improvising (about 9 weeks)

Goal: solo freely over blues, minor tunes and simple standards. Adds minor pentatonic in five positions, the blues scale and major pentatonic mixed over dominant chords; slides, small bends, double stops; chord-tone soloing; minor ii-V; call and response; transcribing four bars.

| # | Strand | Step | Drill and setup | Done means | Feeds |
|---|---|---|---|---|---|
| 9.1 | S | Minor pentatonic, five positions | **NEW** ukulele positions (M), positions 1 to 5 in A and C | Each position 3 runs at 95% at 90 | blues |
| 9.2 | S | Blues scale and major pentatonic | `scales`, ukulele, A blues, A major pentatonic, two positions | 3 runs at 95% at 90 | St. Louis Blues |
| 9.3 | S | Slides, bends, double stops | `fretboard?mode=legato` and `mode=bends`, ukulele | Bends within 30 cents of a semitone, 8 of 10 | Hula Girl |
| 9.4 | S | Call and response | `ear/melody-dictation?answer=play-back` at blues level; `phrases` ukulele blues phrases (NEW at 5.6) in other keys | 10 phrases at 80% | soloing |
| 9.5 | S | Chord tones over I7 IV7 V7 | `licks` (blues), ukulele; Jam blues with chord tones lit | 3 choruses where the chorus report shows chord tones on beats 1 and 3 at 60% | St. Louis Blues |
| 9.6 | S | Minor ii-V and Dorian | `jam`, `minor-ii-v-i` and `modal`, ukulele | 4 choruses at 80% scale tones | Summertime, Blue Bossa |
| 9.7 | S | Solo over a song's chords | **NEW** Jam progression from a song's chord chart (M) | 2 choruses on Summertime at 80% | Summertime |
| 9.8 | C | Comp and trade | Jam: comp one chorus, solo one chorus, record in Practice Lab | 4 alternating choruses without a stop | all |
| 9.9 | M | Transcribe four bars | Song Studio transcription (one melody line) of a solo from a recording, corrected in the note editor | 4 bars played back at 80% in performance mode | |
| 9.10 | E | Hear the changes in a blues | `ear/progressions` with I7 IV7 V7 and the quick change | 20 answers at 80% | |

**Song shelf, level 9**

| # | Song (artist) | Kind | Teaches | Key, tempo, chords or technique | Diff | MuseScore | Fallback |
|---|---|---|---|---|---|---|---|
| 1 | 12-bar blues in A and C (rock and roll riffs) | comp, solo | Shuffle riff plus your solo | A or C, 90 to 120 | 1 | [drixydrixy, "Ukulele rock 'n' roll riff no. 1"](https://musescore.com/user/73674625/scores/30998378) (card) | Jam `blues` |
| 2 | St. Louis Blues (W. C. Handy, 1914) | strum, solo | Blues with a minor tango section | G, about 110 | 2 | [Arr. Bettina Schipp, intermediate, official](https://musescore.com/user/97106398/scores/19243336) (card) | |
| 3 | Summertime (Gershwin) | solo | Minor blues feel, Dorian | Am, about 80 | 2 | [Arr. Leo Baeza, intermediate, official](https://musescore.com/user/97106398/scores/20582245) (card); [Arr. Castellvi, beginner, official](https://musescore.com/user/97106398/scores/18079240) | Jam `minor-ii-v-i` |
| 4 | Blue Bossa (Kenny Dorham) | comp, solo | Bossa comping, minor ii-V, a key change | Cm, about 130 | 3 | [Arr. Morriss Music, lead sheet plus solo chord melody, official](https://musescore.com/user/97106398/scores/18088444) (card) | |
| 5 | Take Five (Paul Desmond) | comp, solo | 5/4 vamp, Eb minor or A minor | about 170 (5/4) | 3 | [Arr. Winter Sparrow, intermediate, official](https://musescore.com/user/97106398/scores/22603516) (card) | |
| 6 | Minor Swing (Django Reinhardt) | strum, solo | La pompe strum, arpeggio soloing | Am, about 180 | 3 | [felyks24, ukulele, guitar and bass](https://musescore.com/user/11203881/scores/10101985) (opened) | |
| 7 | Hula Girl (Jake Shimabukuro) | solo | Pentatonic rock soloing at speed | A, about 130 | 3 | [Roy Genge, solo ukulele, 4.6](https://musescore.com/user/33445730/scores/6443477) (opened) | |
| 8 | Autumn Leaves, as a solo vehicle | solo | Improvise over major and minor ii-V-I | Gm, about 120 | 2 | level 7 scores | Jam `ii-v-i` and `minor-ii-v-i` |

**Boss.** Three choruses on a 12-bar blues in A and in C at 110 swung, comping one and soloing two; two improvised choruses on Summertime or Blue Bossa; a transcribed four-bar lick at tempo.

---

## Level 10. A concert programme (about 10 weeks)

Goal: finish and perform. Adds programme planning, fix-the-spot work at full length, dynamics, memory, a first arrangement of your own and a recorded performance.

| # | Strand | Step | Drill and setup | Done means | Feeds |
|---|---|---|---|---|---|
| 10.1 | F | Choose a programme | Three shelf pieces (pop, classical, jazz or Hawaiian), 10 to 12 minutes | List saved in the journal | all |
| 10.2 | F | Fix the hard spots | Song Studio fix-the-spot loops on each piece's three hardest bars | 3 clean loops at tempo per spot | all |
| 10.3 | F | Whole pieces at tempo | Song Studio performance mode | Each piece 90% on two days | all |
| 10.4 | F | Dynamics | **NEW** loudness contour on a take: louder or softer where the score says (experimental, S) | Two marked contrasts heard in the take | all |
| 10.5 | F | Memory | Practice Lab, each piece from memory | 2 takes per piece without a stop | boss |
| 10.6 | F | Arrange your own | Chord melody of a song you choose, 16 bars, written in Create or MuseScore and imported | Plays at 80% in Song Studio | Writing path |
| 10.7 | S | Improvise an intro and a tag | Jam on the piece's chords: a 4-bar intro and a 4-bar ending | Recorded with the piece | |
| 10.8 | M | Unprepared reading | `reading` sight-reading level 6, a new piece | One pass at 80% | |
| 10.9 | C | Accompany at sight | `strum` with an unseen chart from Jam (LCM unprepared accompaniment) | 16 bars at 80% first try | |
| 10.10 | F | Perform | Practice Lab: the whole programme in one take | One take, listened back, three notes written in the journal | boss |

**Song shelf, level 10**

| # | Song (artist) | Kind | Teaches | Key, tempo, chords or technique | Diff | MuseScore | Fallback |
|---|---|---|---|---|---|---|---|
| 1 | Over the Rainbow / What a Wonderful World (IZ) | solo | The signature ukulele medley | C, about 81 | 1 | [Lucas Schwyter, IZ transcription, solo ukulele](https://musescore.com/user/27061700/scores/4985026) (opened); [Jose Manuel Acuna, solo ukulele](https://musescore.com/user/30013820/scores/7316969) (opened); [james831music, melody and chord diagrams, 3.2K views](https://musescore.com/user/21066206/scores/5496831) (opened); [Jake Shimabukuro arr., official](https://musescore.com/user/39593079/scores/15793696) | [LiveUkulele](https://liveukulele.com/tabs/somewhere-over-the-rainbow-wonderful-world-iz/) |
| 2 | Hallelujah (Jake Shimabukuro arr.) | solo | Rolls, tremolo, dynamics | C, about 60 | 2 | [Fiji Life, 4.8 from 49 ratings](https://musescore.com/user/37265061/scores/6770149) (opened); [Hal Leonard tab, official](https://musescore.com/user/39593079/scores/15869308) | |
| 3 | While My Guitar Gently Weeps (Jake Shimabukuro) | solo, strum | Chord melody, strummed builds, tremolo | Am, about 116 | 3 | [curtsheller, solo ukulele arrangement](https://musescore.com/user/34514843/scores/6287233) (opened); [Jake Shimabukuro arr., official](https://musescore.com/user/39593079/scores/15586861) | |
| 4 | Blackbird (Beatles) | solo | Pinches, moving tenths, 3/4 and 2/4 bars | G, about 94 | 2 | [lkchemposer, solo ukulele](https://musescore.com/user/37977307/scores/6892239) (opened); [Arr. Michael Butzen, intermediate, official](https://musescore.com/user/97106398/scores/22211296) | |
| 5 | Here Comes the Sun (Beatles) | solo, strum | Riff and strum, odd bars | G or C, about 128 | 2 | [Arr. The Sum of the Parts, intermediate, official](https://musescore.com/user/97106398/scores/18196747) (card); [cmfreeze, ukulele and voice](https://musescore.com/user/14112256/scores/14425543) (opened) | |
| 6 | Cello Suite No. 1, Prelude (Bach) | solo | Arpeggiated classical prelude | G or C, about 72 | 3 | [schrectacular, solo ukulele, 4.8 from 71 ratings](https://musescore.com/user/36974188/scores/6549087) (opened; check the tuning before learning it) | |
| 7 | Canon in D (Pachelbel) | solo | Full variations, both hands | D, about 70 | 2 | [Roy Genge, solo ukulele, 4.8 from 63 ratings](https://musescore.com/user/33445730/scores/6108714) (opened) | [LiveUkulele](https://liveukulele.com/tabs/canon-in-d-ukulele-tab/) |
| 8 | Misty (Jake Shimabukuro arr.) | solo | Jazz ballad, Jake's voicings | Eb, about 60 | 3 | [Hal Leonard tab, official](https://musescore.com/user/39593079/scores/15793798) (card) | level 7 arrangement |
| 9 | Bohemian Rhapsody (Jake Shimabukuro arr.) | solo | Aspiration: every technique in one piece | Bb, varies | 3+ | [Hal Leonard, official](https://musescore.com/user/39593079/scores/15586849) (card) | |
| 10 | Recuerdos de la Alhambra (Tárrega) | solo | Aspiration: sustained tremolo | Am, about 80 | 3+ | [Arr. Juan Carlos Sanz, advanced, official](https://musescore.com/user/97106398/scores/19455433) (card) | |

**Boss (the path's end).** The 10 to 12 minute programme from memory in one recorded take; one standard comped and soloed over Jam for three choruses; 16 bars of unseen accompaniment at 80%.

---

## 2. Strand map (where each strand peaks)

| Level | Chords and strums | Fingerpicking | Melody and reading | Soloing and blues |
|---|---|---|---|---|
| 1 | C Am F G7 G, downs, D DU | thumb, pinch | open strings, frets 0 to 3 | |
| 2 | island, chuck, reggae, sevenths | claw, alternating thumb, outside in | C scale, reading level 2 | |
| 3 | waltz, 6/8, Gm Bb | p-i-m-a, rolls, Ohta-San, pinches | minor melodies, Song Studio | |
| 4 | swing, calypso, ragtime circle, maj7 | alternating thumb, Travis, fancy eight | keys G and F, dotted rhythms | |
| 5 | barre, triplet strum, shuffle | backward roll, fingerstyle pop and blues | notes to fret 7 | A minor pentatonic, licks, first solo |
| 6 | | melody over thumb, first chord melody | campanella (HIGH-G), fret 10 | major pentatonic |
| 7 | jazz shapes, swing comp, bossa | chord melody of standards | lead sheets | arpeggios, guide tones |
| 8 | split, triple, fan strokes | tremolo, p-a-m-i, harmonics, classical | classical reading, minor campanella | |
| 9 | comping while trading | | transcribing | five positions, chord tones, minor ii-V |
| 10 | unseen accompaniment | a full programme, own arrangement | unprepared reading | intros and tags |

## 3. Cross-links to other paths

- **Ear path:** 1.10 (major or minor), 2.13 (I IV V), 3.12 (meter), 4.12 (dominant 7), 5.12 (blues form, pentatonic by ear), 6.10 (melody play-back), 7.10 and 7.11 (seventh chords, ii-V-I), 8.12 (cadences), 9.4 and 9.10 (call and response, blues changes). The Ear path owns these drills; the ukulele steps link to them rather than copy them.
- **Reading path:** the sight-reading level climb runs alongside: level 2 by the end of L2, 4 by L4, 5 by L7, 6 by L8. Phrases and Song Studio wait mode are the reading practice on real pieces.
- **Circle of fifths:** keys of G and F at L4; ii-V-I in C, F, G and Bb at L7; Bb and Eb at L7 and L8.
- **Theory:** dominant function and secondary dominants at L4 (ragtime circle) and L7 (All of Me); chord-scales (Dorian, Mixolydian) at L7 and L9.
- **Guitar path:** ukulele shapes are the guitar's top four strings moved up a fourth; Travis (L4), p-i-m-a (L3) and the pentatonic (L5, L9) transfer. Spanish Romance exists as a guitar phrase. See open question 6.
- **Piano path:** jazz voicings and ii-V-I at L7 line up with the piano's jazz steps; the owner's piano theory makes L7 faster.
- **Writing:** L10.6 (own chord-melody arrangement) feeds any songwriting path.

## 4. New drills and app changes, ranked

| # | What | Why | Size | Steps |
|---|---|---|---|---|
| 1 | **Song Studio as a path step**: a step passes on a Song Studio performance score of an imported song (today "no mastery for songs") | Half the fingerpicking steps from L3 up live in Song Studio | M | 3.10, 4.9, 5.9, 5.10, 6.4, 6.6, 6.8, 7.6, 8.5, 8.8, 8.9, 10.2, 10.3 |
| 2 | **Strum a song**: Strum a progression gains a strum pattern, song presets and a skill (round-1 rec 2) | Every level from 1 to 5 ends in a strummed song | M | 1.11, 2.12, 5.4, 10.9 |
| 3 | **Ukulele strum library** in `rhythm-patterns.json`: D DU, reggae, waltz, 6/8, swing, calypso, triplet, swing comp, bossa, split stroke, triple stroke, fan | One JSON entry each, read-and-tap already works | S each | 1.6, 2.3, 3.1, 3.2, 4.1, 4.4, 5.3, 7.3, 7.4, 8.1 to 8.3 |
| 4 | **Ukulele scale positions**: minor and major pentatonic in five positions, blues scale, G and F major, seventh-chord arpeggios | Removes the "Switch to guitar" dead end; L5 and L9 need it | M | 4.10, 5.5, 7.8, 9.1, 9.2 |
| 5 | **Campanella scales** (C major, C major pentatonic, D harmonic minor), hidden on low-G, ring-over as an experimental check | RSL Grade 4 to 5 and LCM 6 to 8 | M | 6.1, 6.2, 8.11 |
| 6 | **Chord-melody phrases** graded on the top note (Amazing Grace, Aloha 'Oe, Fly Me to the Moon and Autumn Leaves bars 1 to 8) | The target skill; Phrases already grade chords | M | 6.5, 7.5 |
| 7 | **Curated chord shapes**: Em, D7, B7, Bb, Cm, Bm, Cmaj7, Fmaj7, Am7, C6, dim, and movable m7, 7, maj7, m7b5 | Changes only offers pairs between curated shapes | S | 2.4, 3.8, 4.2, 4.5, 5.1, 7.1 |
| 8 | **Fingerpick presets**: You Are My Sunshine (claw), Love Me Tender, Freight Train (Travis), Canon in C (backward roll), Dust in the Wind | Same shape as the 4 existing ukulele presets | S each | 2.9, 4.9, 5.8 |
| 9 | **Jam for soloing**: a pass rule on the chorus report, and a progression from a song's chord chart | L5 to L9 soloing steps need a measurable pass | M | 5.7, 6.9, 9.5 to 9.7 |
| 10 | **High-G or low-G setting**, asked once, used to hide campanella and flag LOW-G scores | Tab means different notes on string 4 | S | 1.1 |
| 11 | **Tremolo evenness** and **harmonics** checks | L8 right-hand steps | S to M | 8.4, 8.7 |
| 12 | **Ukulele blues and Hawaiian phrases** (turnaround, licks, vamp in F and G, campanella London Bridge and Twinkle) | Public-domain or stock vocabulary, fits the phrase policy | S | 4.3, 5.6, 6.3 |
| 13 | **Meter setting** (3/4, 6/8) in sight-reading, if the generator lacks it | L3 and L8 reading | S | 3.11 |
| 14 | **Skills**: `technique.ukulele.strumming`, `.fingerpicking`, `.campanella`, `.chord-melody`, `.interval-recall` | Steps need ukulele-pinned skills | S | many |
| 15 | **Loudness contour** on a take (experimental) | Dynamics in the final programme | S | 10.4 |

## 5. Open questions for the owner

1. **Paid scores.** 35 of the 93 shelf entries point first or only to official Hal Leonard or ArrangeMe scores, which need MuseScore Pro or a purchase. Do you have Pro, or should the shelves prefer free community scores even when they are weaker?
2. **Your ukulele.** High-G or low-G, and soprano, concert or tenor? L6 campanella needs high-G; Für Elise, Dream a Little Dream (Funamura) and the Blevins arrangements need low-G. A tenor with a spare low-G set covers both.
3. **Jazz or classical first?** L7 (jazz chord melody) and L8 (classical right hand) can swap. Which matters more to you?
4. **Singing.** Do you sing while you play? If yes, each strummed shelf song can add a "play and sing" self-check.
5. **Passing a level.** Should a level pass when two shelf songs and the boss are done, even if one strand's steps lag (say, reading), or must every step pass?
6. **Guitar and ukulele together.** Should progress on shared skills (Travis, p-i-m-a, pentatonic shapes) count across both paths?
7. **Your songs.** Any song you want on a shelf? The shelves are suggestions; adding your own at the right level is the fastest way to keep going.

## 6. Sources and how the scores were checked

- Searched MuseScore in my own Orca tab with "<song> ukulele", "<song> ukulele fingerstyle", "<song> ukulele easy", "<song> ukulele chord melody" (about 115 searches). Each search page's title was checked against the query before reading results, after an early batch read another tab's results (those results were discarded and the searches redone).
- **93 shelf entries, all with a MuseScore score URL.** 57 of them link a community score whose page I opened and read (title, arranger, instrument; marked "opened"); the other 36 rest on search-result cards (marked "card"), and 35 of those lead with an official (paid) score. 66 score pages were opened in all.
- **Fallbacks:** about two dozen fallback pages were opened and confirmed (UkuTabs, LiveUkulele, UkuleleGo, Ukulele Hunt). Two round-1 fallbacks failed: the Ukulele Hunt campanella post (404) and the Bruce Watson PDF (did not render; kept with a note). UkuTabs' IZ "Over the Rainbow" URL redirects to the Judy Garland chart, so LiveUkulele is used for IZ instead.
- **Not found on MuseScore and dropped:** The Blarney Pilgrim (not on Ukulele Hunt either; replaced by the Swallowtail Jig), Ukulele Lady (piano lead sheets only), Sweet Georgia Brown (one weak ensemble score), a fingerstyle Yesterday, Avril 14th, White Sandy Beach. Twinkle in campanella and London Bridge in campanella are not on MuseScore; UkuleleGo's lesson covers London Bridge, and recommendation 12 adds both as phrases.
- **Watch for:** "All of Me" by Gaby Lopez on MuseScore is John Legend's song, not the standard (not used). Several Hal Leonard ukulele scores are filed under "Solo Guitar" on MuseScore though they are ukulele arrangements.
- Syllabus facts (LCM and RSL ukulele, James Hill) come from `guitar-ukulele-drills.md` and the round-1 report.
