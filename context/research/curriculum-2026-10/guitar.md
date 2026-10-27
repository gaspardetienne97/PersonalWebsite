# Guitar: what gets beginners good fastest, and what Woodshed should change (2026-10-27)

Builds on `context/research/guitar-ukulele-drills.md` (mic measurability, syllabi tempos, OMC numbers, scoring proposals). That doc is not repeated here; this one covers programs, the app's guitar side as it stands, ranked changes and content.

## 1. The programs and what makes them work

| Program | Sequence | What makes it work | Source |
|---|---|---|---|
| **JustinGuitar** (Beginner Grades 1 to 3, Intermediate 4 to 6) | 3 grades, 23 modules, 204 lessons, 350+ songs. Grade 1: eight open chords (A D E, then Am Em Dm, then C G) plus strumming and songs. Grade 2: F, 7ths, power chords, rock and blues rhythm, lead basics, fingerpicking. Grade 3: rhythm refinement, melodies, playing by ear. Grade 4: E-shape barre, Major Scale Maestro, blues rhythm and lead, blues licks. Minor pentatonic patterns 3 to 5 sit in Grade 6 | Tiny chord sets, each with **One Minute Changes** (first tries 6 to 9 a minute, 30 is a common move-on point, 60 the goal), anchor fingers, a per-module practice routine repeated for a week or more, and songs from the first module. Later: "pick your five hardest changes, a minute each" | [Beginner course](https://admin.justinguitar.com/beginner), [Grade 4](https://justinguitar.com/classes/intermediate-guitar-course-grade-four), [Grade 6](https://justinguitar.com/classes/intermediate-guitar-course-grade-six), [grade system](https://justinguitar.com/guitar-lessons/what-s-the-justinguitar-grade-system-all-about-nws-9) |
| **Fender Play** | Path > Level > Course > Lesson; 7 guitar levels. Skills courses interleaved with song courses, songs abridged or transposed to fit the skill; level 1 has about 7 beginner chords, quarter to eighth rhythms, easy strumming, palm muting | "Hear it, learn it, play it"; every skill applied straight away to a riff or song | [Fender LAUSD help](https://lausd-instructor.fender.com/hc/en-us/articles/360043858892), [difficulty guide](https://lausd-instructor.fender.com/hc/en-us/articles/360043858912-Song-Difficulty-Level-Guide) |
| **Guitar Tricks Core Learning System** | Fundamentals 1 (holding, tuning, first chords, easy songs), Fundamentals 2 (minor and barre chords, scales, reading, riffs, fingerpicking), then style tracks (blues, rock, country, acoustic) | Linear, one teacher voice, songs woven in, then a style choice | [Guitar Tricks](https://img2.guitartricks.com/core-learning-system), [review](https://americansongwriter.com/guitar-tricks-review) |
| **Andy Guitar, Marty Music** | Andy: 10-day courses, a song a day; the electric one riff-first (day 1 Smoke on the Water). Marty: song tutorials plus style courses (B.B. box) | A finished song or riff every session | [Andy 10-day electric](https://www.andyguitar.co.uk/courses/10-day-beginner-electric-guitar), [Marty](https://www.martymusic.com/inspired-by-bb-king) |
| **TrueFire** | Assessment, then a learning path. Lessons: concept in small chunks, demonstrated over a jam track, play along with the teacher, then alone with the track | The backing track is the practice environment from lesson one | [Learning Paths](https://help.truefire.com/hc/en-us/articles/227260068-What-are-Learning-Paths), [beginner method](https://learn.truefire.com/beginner-guitar-method?hsLang=en) |
| **Berklee, Leavitt "A Modern Method for Guitar"** | Reading-first: scales, melodic studies, chord and arpeggio studies, position playing, moveable chord forms with voice leading | Standard notation and positions from the start; the route for jazz and reading | [Publisher synopsis](https://blackwells.co.uk/bookshop/product/A-Modern-Method-for-Guitar-Volume-1-by-William-Leavitt/9780876390139) |
| **CAGED** | The five open shapes as moveable positions in C-A-G-E-D order, each tied to a scale box | One map links chords, arpeggios and scales across the neck | see existing doc, section 2 |
| **Ted Greene, Chord Chemistry** | Fingerboard and string relationships, triads, then moving voices and systematic voice leading | Chords as voice-led families; a fit for a pianist who already thinks in inversions | [Contents summary](https://www.goodreads.com/book/show/53356070) |
| **Troy Grady, Cracking the Code** | Picking motion is chosen by "escape": the pick path that clears the strings when changing string | Diagnose the motion by filming it, then short fast bursts; a mic cannot see pick direction | [Understanding escape motion](https://troygrady.com/primer/understanding-escape-motion/) |
| **Rockschool, RGT (LCM)** | Graded technical work with click tempos (existing doc table), performance pieces, ear tests. RGT: Step to Grade 8, lead improvisation, chords and rhythm, no notation needed. Step: E blues, C major scales, D, Em, B7 chords; Grade 1: E natural minor, G major and A minor pentatonic, Amaj7 | Clear yardsticks; improvisation tested from the first grade | [RGT electric](https://rgt.org/exams/electric-guitar.php), [LCM technical sheet](https://lcme.uwl.ac.uk/media/bcledr1w/technical-requirements-and-spoken-test-questions-electric-guitar.pdf) |

**Evidence on what works** (no controlled guitar study of chord changes exists; see existing doc):
- **Songs keep people playing.** Fender 2018: 61% of players want to learn songs to play alone or with others; time and the slow build of skill are the main barriers ([Fender](https://www.fender.com/articles/play/new-research-shows-mental-physical-and-emotional-benefits-of-playing-music)). "90% quit in year one" is a CEO interview figure, thin ([MusicRadar](https://www.musicradar.com/news/90-of-beginner-guitar-players-give-up-within-a-year-says-fender)). Every program above has a song in week one.
- **Scaffold the song too.** Rocksmith: with dynamic difficulty off "most new players couldn't play at all" (existing doc); Songsterr and Fender ship simplified riffs.
- **How, not how long.** Proportion of correct trials predicts retention (Duke 2009); accuracy gains need a 24-hour gap (Simmons 2012); hearing the model first helps (Cash 2014); see `context/02-research-digest.md`. So: short daily blocks, slow enough to stay correct, one new riff or pair a session, model first.

## 2. What Woodshed has today (seen in the app via Orca and in code)

**Guitar Path, 10 steps** (`data/learning-paths.json` plus `G-E1` in `progress/paths.ts`): build E/A/D/G/C clean; downstrokes at 72; changes D-A at 40 a minute; echo a strum rhythm; island strum at 84; "fretboard notes, strings 1 to 3"; minor pentatonic box 1 at 90; a box-1 lick at 96; barre F and Bm at 30 a minute; the same lick in A minor.

Problems found:
- **Titles and links disagree.** Step "Fretboard notes, strings 1 to 3" opens Interval recall (perfect fifth, frets 0 to 4), not the Note finder. "Build E, A, D, G and C" opens E major only. "Barre F and Bm" opens F to C; Bm is never asked. "Change on the bar: D to A, E to A and G to C" opens D to A only.
- **No songs anywhere in the path or the daily routine.** The guitar routine (`data/daily-routine.json`) is spider, ear, chord work, rhythm. Every program above is song-led by week one.
- **No minor chords, no 7ths, no power chords, no fingerpicking, no riffs, no 12-bar blues** in the path, although the drills for most of them exist.
- **Gates are steep and early.** 40 changes a minute at step 3, when JustinGuitar's beginners start at 6 to 9 and move on near 30.
- **Lead stops at one lick.** Guitar licks: two entries, the same box-1 lick in two keys. Guitar phrases: 14 (folk melodies, Travis C-Am, pentatonic run, an A blues lick, boogie bass, the G run, Spanish Romance, boom-chuck, boogie shuffle, blues turnaround, double-stop intro). No riffs from records.

Drills (mic-graded, Practice and Check):
- **Chords**: Build, Pick, Strum and identify, Changes (cycles up to eight chords, 60-second clock, per-set history), Fingerpicking (15 patterns, 9 song presets). 19 authored shapes (open, 7ths, three barres, four power chords) plus a voicing generator. On par with JustinGuitar's app or better.
- **Strum a progression**: 6 progressions, tempo ladder, chroma chord following; no mastery until verified on a real guitar; no song presets.
- **Rhythm**: four-on-the-floor, Old Faithful, island strum; rhythm echo.
- **Fretboard**: Spider (24 orders), Positions (5 pentatonic boxes, 5 CAGED chord shapes as arpeggios; no major scale or blues boxes), Note finder, Interval recall, legato (3 patterns, no slides), bends and vibrato in cents.
- **Jam**: backing progressions with chord, scale and avoid tones, so the TrueFire jam-track idea exists already.

**Verdict.** Technique substance is good and better measured than any commercial app (bends in cents, legato check, tuning named). What is missing is the thing the best programs build around: songs and riffs, in a stage order that applies each chord set straight away, with gentle early gates.

## 3. Ranked recommendations

| # | What | Why (source) | Size | Fits |
|---|---|---|---|---|
| 1 | **Fix the four step/link mismatches** (step 6 to Note finder strings 6 and 5 naturals; step 1 cycles all five shapes; step 9 includes Bm; step 3 links all three pairs) | A path that says one thing and opens another erodes trust in "done" | S | `learning-paths.json` hrefs |
| 2 | **Song presets for Strum a progression**, like `FINGERPICK_SONGS`: chords, bars per chord, strum pattern, tempo, lesson source. Start with the 20 in section 4b. Then verify the follower on the owner's guitar so it can write mastery | Fender 61% want songs; Fender Play and JustinGuitar apply every skill in a song; progressions are facts, so no copyright question | M | `content/jam.ts` PROGRESSIONS gain `song`, `pattern`, `source`; Strum page gets a "Start from a song" group as Fingerpicking has |
| 3 | **Rebuild the Guitar Path in five stages, each ending in a song** (below). Gates: 30 changes a minute per pair, not 40 | JustinGuitar module order and OMC bands; Rocksmith lenient start | M | Mostly JSON; reuses existing drills |
| 4 | **Riffs**: a Riffs group in Phrases (or a "Riff" category in Licks), 30 riffs from section 4a, each with a simplified and a full level, loop a bar, tempo ladder to record tempo | Andy Guitar and Fender riff-first; Rocksmith Riff Repeater and dynamic difficulty; Guitar Pro progressive speed | M (engine exists; data entry is the cost: about 10 minutes a riff from a Songsterr page) | `phrases.ts` format already carries string and fret per note and chord steps; needs an owner-only store (open question 1) |
| 5 | **Changes: the 25 common pairs, scheduled.** Changes keeps per-pair history already. Add a "Hardest five" setup that picks the five slowest pairs from history, a minute each; show bands at 30 and 60 | JustinGuitar BC-154 "five hardest changes"; Duke 2009 (work the error spot) | S | Changes setup plus `chordChangePairs` |
| 6 | **Strum pattern set** to cover the songs: straight eighths D-U, 16th "Wonderwall" pattern, swing/shuffle eighths, 6/8 (House of the Rising Sun, Perfect), reggae off-beat, palm-muted power-chord eighths, accents on 2 and 4 | Fender level 1 has palm muting; RSL G1/G2 power chords; existing doc rec 3 and 12 | S | `rhythm-patterns.json` entries; the tempo ladder exists |
| 7 | **Blues lead track**: 12-bar shuffle rhythm in A and E (the boogie shuffle phrase exists), box 1, then 8 to 10 stock licks (B.B. box, Chuck Berry double stops, turnaround, Albert King bend), bends to pitch, then **call and response** over Jam's 12-bar: the app plays a one-bar lick, you answer with your own bar from box 1, graded on staying in the scale and in time | JustinGuitar Grade 2 and 4 blues modules; RGT tests improvisation from Step; TrueFire play-along then alone | M (call and response is new; licks are data) | Licks category `guitar-blues`; Jam tone roles give "in the scale" for free |
| 8 | **Staff to fret**: Note finder with the prompt on a treble staff (guitar sounds an octave lower than written), first position, strings 1 to 3 first (Leavitt order), then all six | The owner reads treble from piano: guitar reading is mostly mapping, not new reading | S to M | Note finder plus the Reading drill's staff |
| 9 | **Guitar routine gets a song slot**, and the plan flexes: 10 min = Changes (hardest pair) plus one song; 30 min adds a riff and 5 min Note finder; 60 to 90 min adds lead (box, licks, jam) and fingerpicking. Spider moves to a warm-up option, not the first block | JustinGuitar routines always include songs; Levitin via Fender: short daily sessions on favourite songs; Grady and Guitar World criticise chromatic drills as core | S | `daily-routine.json` and `progress/routine.ts` |
| 10 | **Triads on string sets** (strings 1-3 and 2-4, three inversions) and a CAGED link view (each chord shape over its pentatonic box) | Ted Greene; JustinGuitar Intermediate triads; owner knows inversions from piano | S (data in `fretboard-patterns.json`) | Positions mode |
| 11 | **Slides** in the legato drill (glide detected as continuous pitch) and a "speed burst" setup (4 to 6 notes looped, tempo ladder on evenness) | RSL legato and slide studies; Grady bursts | S | Fretboard legato patterns |

**The Guitar Path, rebuilt** (existing step ids kept where the drill is the same):
1. Stage 1, A D E: build A, D, E clean (G-B1); downstrokes (G-B2); changes A-D, D-E, A-E at 30 a minute (G-B3); **song**: Three Little Birds or Wild Thing (strum preset).
2. Stage 2, minors: build Am, Em; Old Faithful at 80 (existing pattern); echo a strum rhythm (G-E1); changes Em-D, Am-E; **song**: Horse With No Name, Bad Moon Rising.
3. Stage 3, Dm C G: build; the 25-pair "hardest five" at 30; Note finder strings 6 and 5; **first riffs**: Seven Nation Army, Smoke on the Water; **song**: Knockin' on Heaven's Door, Stand by Me.
4. Stage 4, Grade 2 material: power chords with palm-muted eighths, then Iron Man or Teen Spirit; 12-bar shuffle in A; Travis thumb then House of the Rising Sun (preset exists); mini F then F (barre) changing with C; island strum (G-I1) moves here.
5. Stage 5, lead: box 1 (G-I3); box-1 lick in time (G-I4); bends to pitch and vibrato; two blues licks; call and response over the 12-bar; same lick in a new key (G-A2); E- and A-shape barre with Bm (G-A1).

## 4. Content

### 4a. Riffs and licks worth bundling (difficulty 1 easiest to 5)

Songsterr "s" numbers identify the song; `tN` a track. All links found via search on 2026-10-27. Most guitar tabs are in standard tuning unless noted.

| # | Riff | Technique | Diff | Source |
|---|---|---|---|---|
| 1 | Seven Nation Army (White Stripes) | single notes, one string | 1 | [Songsterr, standard E](https://www.songsterr.com/a/wsa/white-stripes-seven-nation-army-in-standard-e-tuning-tab-s91317) |
| 2 | Smoke on the Water (Deep Purple) | fourths or single notes | 1 | [Songsterr](https://www.songsterr.com/a/wsa/deep-purple-smoke-on-the-water-solo-tab-s329) |
| 3 | Satisfaction (Rolling Stones) | single-string riff | 1 | [Songsterr](https://www.songsterr.com/a/wsa/rolling-stones-i-cant-get-no-satisfaction-tab-s16453) |
| 4 | Iron Man (Black Sabbath) | power chords, slides | 2 | [Songsterr](https://www.songsterr.com/a/wsa/black-sabbath-iron-man-tab-s8t1), [easy](https://www.songsterr.com/a/wsa/black-sabbath-iron-man-easy-tab-s1920972) |
| 5 | Sunshine of Your Love (Cream) | box-shape riff | 2 | [Songsterr](https://www.songsterr.com/a/wsa/cream-sunshine-of-your-love-solo-tab-s256t1) |
| 6 | Smells Like Teen Spirit (Nirvana) | power chords, muted strums | 2 | [Songsterr](https://www.songsterr.com/a/wsa/nirvana-smells-like-teen-spirit-tab-s269t4) |
| 7 | Come As You Are (Nirvana) | single notes, open strings | 2 | [Songsterr, standard tuning](https://www.songsterr.com/a/wsa/nirvana-come-as-you-are-standard-tunings-tab-s531236) |
| 8 | Oh, Pretty Woman (Roy Orbison) | low single-note riff | 2 | [Songsterr](https://www.songsterr.com/a/wsa/roy-orbison-oh-pretty-woman-tab-s15568) |
| 9 | Brown Eyed Girl intro (Van Morrison) | thirds, two strings | 2 | [Songsterr](https://www.songsterr.com/a/wsa/van-morrison-brown-eyed-girl-intro-tab-s5557392) |
| 10 | Day Tripper (Beatles) | pentatonic riff | 2 / 3 | [simplified](https://www.songsterr.com/a/wsa/beatles-day-tripper-simplified-tab-s4131658), [full](https://www.songsterr.com/a/wsa/beatles-day-tripper-solo-tab-s354t3) |
| 11 | Back in Black (AC/DC) | open chords and fills | 3 | [Songsterr, rhythm](https://www.songsterr.com/a/wsa/ac-dc-back-in-black-tab-s1024t4) |
| 12 | Enter Sandman (Metallica) | palm mutes, open E | 3 | [Songsterr](https://www.songsterr.com/a/wsa/metallica-enter-sandman-tab-s19t4) |
| 13 | Crazy Train main riff (Ozzy Osbourne) | fast single notes, palm mute | 3 | [Songsterr riff](https://www.songsterr.com/a/wsa/ozzy-osbourne-crazy-train-main-riff-tab-s2256728) |
| 14 | Purple Haze intro and riff (Hendrix) | tritone, minor pentatonic, bends | 3 | [Songsterr](https://www.songsterr.com/a/wsa/jimi-hendrix-experience-purple-haze-tab-s310) |
| 15 | Hey Joe fills (Hendrix) | bass-note runs between chords | 3 | [Songsterr](https://www.songsterr.com/a/wsa/jimi-hendrix-experience-hey-joe-tab-s22556) |
| 16 | Layla riff (Derek and the Dominos) | minor pentatonic, bends | 3 | [Songsterr](https://www.songsterr.com/a/wsa/derek-and-the-dominos-layla-tab-s290t3) |
| 17 | Message in a Bottle (Police) | add9 stretch arpeggios | 3 | [Songsterr](https://www.songsterr.com/a/wsa/police-message-in-a-bottle-tab-s3706t4) |
| 18 | Wish You Were Here intro (Pink Floyd) | open-chord fills, hammer-ons | 3 | [Songsterr](https://www.songsterr.com/a/wsa/pink-floyd-wish-you-were-here-tab-s153t3) |
| 19 | The Thrill Is Gone licks (B.B. King) | B.B. box, vibrato, bends | 3 | [Songsterr album solo](https://www.songsterr.com/a/wsa/bb-king-the-thrill-is-gone-album-tab-s5258799) |
| 20 | Hide Away (Freddie King, Clapton) | hammer-ons, slides, 12-bar | 3 | [JustinGuitar lesson thread](https://community.justinguitar.com/t/hide-away-1-3-by-freddie-king-lesson/3432), [Rock Class 101](https://rockclass101.com/?p=2094) |
| 21 | Sweet Child O' Mine intro (Guns N' Roses) | string skipping, alternate picking | 4 | [Songsterr, standard tuning](https://www.songsterr.com/a/wsa/guns-n-roses-sweet-child-o-mine-standard-tuning-tab-s769751) |
| 22 | Johnny B. Goode intro (Chuck Berry) | double stops, bends | 4 | [Songsterr](https://www.songsterr.com/a/wsa/chuck-berry-johnny-b-goode-tab-s10) |
| 23 | Pride and Joy (Stevie Ray Vaughan) | Texas shuffle, rakes | 4 | [Songsterr](https://www.songsterr.com/a/wsa/stevie-ray-vaughan-double-trouble-pride-and-joy-tab-s240) |
| 24 | Under the Bridge intro (RHCP) | chord embellishment, thumb | 4 | [Songsterr](https://www.songsterr.com/a/wsa/red-hot-chili-peppers-under-the-bridge-tab-s99t2) |
| 25 | Stairway to Heaven intro (Led Zeppelin) | fingerstyle, descending bass | 4 | [Songsterr fingerstyle](https://www.songsterr.com/a/wsa/led-zeppelin-stairway-to-heaven-fingerstyle-tab-s542361) |
| 26 | Blackbird (Beatles) | fingerstyle, tenths | 4 | [Songsterr search](https://www.songsterr.com/?pattern=Blackbird++The+Beatles) |
| 27 | B.B. King box licks | B.B. box on strings 1-3, major sixth | 3 | [Guitar World](https://guitarworld.com/lessons/bb-king-lesson-soloing-movable-bb-box), [Premier Guitar](https://www.premierguitar.com/articles/21479-deep-blues-the-bb-king-box) |
| 28 | B.B. King-style licks (10) | vocal bends, vibrato | 3 | [Guitar Chalk](https://www.guitarchalk.com/bb-king-style-guitar-licks/) |
| 29 | B.B. King root, b7, 5 lick ("Niji Baby") | three-note phrase | 2 | [Guitar World 101 licks #52](https://guitarworld.com/lessons/101-amazing-licks-lick-52) |
| 30 | Stock blues vocabulary (Chuck Berry double stops, Albert King unison bend, quick-change turnaround) | already partly in Phrases | 2 to 3 | write as authored phrases, no copyright issue |

Formats: Songsterr pages are reference tabs with the original audio; I did not find free MusicXML or MIDI for these songs, and did not verify that Songsterr allows export. The lightest route is to type each riff (2 to 4 bars) into the existing phrase format from the tab, with a simplified level where Songsterr has one.

### 4b. Beginner songs, ranked, matched to the stage that teaches their chords

Progressions are facts; source links can be the Songsterr chord pages above or a lesson page per song (the fingerpicking presets already follow that pattern).

| Rank | Song | Chords | Strum | Stage |
|---|---|---|---|---|
| 1 | Horse With No Name (America) | Em, D6/9 (or D) | Old Faithful | 2 |
| 2 | Three Little Birds (Bob Marley) | A, D, E | reggae off-beat or Old Faithful | 1 |
| 3 | Wild Thing (Troggs) | A, D, E | downstrokes and eighths | 1 |
| 4 | Bad Moon Rising (CCR) | D, A, G | eighths | 3 (G) |
| 5 | Knockin' on Heaven's Door (Dylan) | G, D, Am, C | Old Faithful | 3 |
| 6 | Stand by Me (Ben E. King, capo 2) | G, Em, C, D | Old Faithful | 3 |
| 7 | Love Me Do (Beatles) | G, C, D | downstrokes | 3 |
| 8 | Leaving on a Jet Plane (John Denver) | G, C, D | Old Faithful | 3 |
| 9 | Brown Eyed Girl (Van Morrison) | G, C, D, Em | island strum | 3 |
| 10 | Twist and Shout (Beatles) | D, G, A | eighths | 3 |
| 11 | Zombie (Cranberries) | Em, C, G, D | eighths, then palm mute | 3 |
| 12 | Riptide (Vance Joy) | Am, G, C (F) | 16th variation | 3, F in 4 |
| 13 | Good Riddance (Green Day) | G, C, D, Em | fast eighths and picking | 3 |
| 14 | Wonderwall (Oasis) | Em7, G, Dsus4, A7sus4, Cadd9 | 16th pattern, anchor fingers 3 and 4 | 3 to 4 |
| 15 | Sweet Home Alabama (Lynyrd Skynyrd) | D, Cadd9, G | fills, eighths | 4 |
| 16 | Wish You Were Here (Pink Floyd) | C, D, Am, G, Em | 16th strum plus intro riff | 4 |
| 17 | Let It Be (Beatles) | C, G, Am, F | eighths | 4 (F) |
| 18 | House of the Rising Sun (Animals) | Am, C, D, F, E | 6/8 arpeggio (preset exists) | 4 |
| 19 | Perfect (Ed Sheeran, capo 1) | G, Em, C, D | 6/8 | 4 |
| 20 | Hallelujah (Cohen/Buckley) | C, Am, F, G, E7 | 6/8 or fingerpicked (preset exists) | 4 |

## 5. Open questions for the owner

1. **Where do copyrighted riffs live?** `06-lessons-learned.md` records "copyrighted songs as facts only" (chords, pattern, tempo, a source link). Your brief now allows bundling for the logged-in owner. Options: a git-excluded data folder loaded only behind auth, or a per-user library entry (Song Studio already imports MusicXML). Which?
2. **Acoustic or electric (or both)?** It decides how much of Stage 4 and 5 is power-chord riffs and bends versus strummed songs and fingerpicking.
3. **Your ten songs.** A song-first path works best with your songs; which ones do you most want to play in three months?
4. **Standard notation on guitar, or tab only?** You read treble from piano; a staff-to-fret drill is cheap, but only worth it if reading on guitar is a goal for you (jazz says yes).
5. **Verify Strum on your guitar.** The chord follower writes no mastery until checked on a real instrument. A 10-minute session with three progressions would let song presets count toward the path.
6. **Gates.** Are 30 changes a minute per pair and "clean at 80 BPM" the right bar, or do you want faster movement with lower gates while you are busy?
