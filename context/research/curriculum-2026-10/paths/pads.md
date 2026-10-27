# MPC One+ finger drumming: the full path (round 2, 2026-10-27)

Builds on round 1 (`../pads.md`) and `context/research/finger-drumming.md`. Drill names are the app's: `pads?mode=rudiment|groove|steady|dynamics|fills|echo|ostinato|orchestrate|improvise` with the groove and pattern ids from `content/pads-repertoire.ts`, `data/mpc-rudiments.json` and `content/pad-skills.ts`. "NEW" marks a drill the app lacks; section 4 ranks them.

## 1. Target and scope

**Done means:** the owner sits at the MPC One+ with a backing track, a loop or nothing at all, and:
- plays 30 to 40 famous grooves from memory across rock, pop, funk, hip hop, house, trap, drum and bass, Latin, afrobeat and shuffle, each at record tempo;
- plays whole songs along with the record (intro, verses, fills, crashes, endings), not only the 2-bar loop;
- holds time without a click for 32 bars within 2 BPM, ghosts under 40% of the accent velocity, rolls at 1/32 and 1/16T at 140;
- chops a sampled loop onto 16 pads and plays a new beat from it, builds a beat live (overdub, note repeat, swing) and improvises 32 bars with fills over a loop.

**External benchmark:** Melodics Stage 10 of 15 for pads (Stages are gated tests, not lessons; Melodics does not publish what each Stage contains, so the match is by the skills its Stage 9 to 11 lessons use: sixteenth ghosting, 1/32 and triplet rolls, swing, breaks at tempo, two-hand independence). For vocabulary, this is roughly Drumeo Method level 5 (groupings, independence, shuffles) and Rockschool Drums Grade 4 to 5 grooves, played on fingers.

**Time at 30 minutes a day:** about 20 to 24 months. Levels 1 to 4 take 6 to 8 weeks each, levels 5 to 11 take 8 to 10 weeks each. On 10-minute days play one rudiment and the current groove only; on 60 to 90 minute days add a shelf song, a chop session and an improvisation. Shuffle and odd-meter levels (8 and 11) assume the triplet and meter grid ships; until then their straight items still work and the rest waits.

**Tiers:** the app's timing windows tighten by level: beginner (35/70 ms perfect/good) for levels 1 to 3, intermediate (25/50) for 4 to 7, advanced (15/35) for 8 to 11. "Pass" below means 90% good and 70% perfect unless a step says otherwise. "Two days" means the criterion met on two separate days, so the skill is retained, not warmed up.

**How the shelves work.** Every level has a song shelf of 8 to 11 choices; pick any 2 or 3 to pass. Each was searched on MuseScore ("<song> drums", "drum", "drum set") and the score page opened in the Orca browser. "Solo drum" means the score is a drum part alone, which is what Song Studio will import. "Official" means a paid Hal Leonard or ArrangeMe score (a MuseScore PRO or purchase); community scores are free but vary, and the view count and rating are given as a quality hint. Where MuseScore had nothing usable (Led Zeppelin's catalogue, most hip hop and dance tracks), the fallback is a Songsterr drum tab, the app's own groove, or a transcription book. "Grid" says what the app's groove grid needs: **16** (works today), **T** (needs the planned triplet grid), **M** (needs the planned meter support).

**Layout and setup, once.** Full Level off. The app's layout (kick bottom left, snare beside it, closed hat above the snare, open hat beside it, toms and cymbals on the top row). Split hands for grooves: right hand on hats and cymbals, left on kick and snare; switch to "one hand holds, the other fills" from level 6.

## 2. The path

### Level 1. First beats (Melodics Stage 1 to 2)
**Goal:** a backbeat in time with both hands, eighth hats, crash on one, four-bar phrases. **Adds:** split hands, counting "1 & 2 &", kick on 1 and 3, snare on 2 and 4, Wait mode, play-along.

| # | Step | Drill and setup | Done means | Feeds |
|---|---|---|---|---|
| 1 | Set up the pads | `pads?mode=dynamics` (calibrate, then "even") | Calibration saved; 16 even hits with 80% inside one velocity band | all |
| 2 | First beat, no clock | `pads?mode=groove&groove=basic-rock&wait=1` | 4 bars, no wrong pad, two days | Billie Jean, Back in Black |
| 3 | First beat in time | `groove=basic-rock`, 70 then 90 BPM | Pass at 90, 3 runs, two days | all rock and pop |
| 4 | Two pads on the click | `mode=rudiment&pattern=single-strokes&sub=2`, 60 to 90 | Mean error 50 ms or less at 90 | hats in every song |
| 5 | Stomp, stomp, clap | `groove=stomp-clap`, 81 | Pass, 3 runs | We Will Rock You |
| 6 | Kick on every beat | `groove=four-on-floor`, 100 to 110 | Pass at 110 | Another One Bites the Dust, Seven Nation Army |
| 7 | Echo kick and snare | `mode=echo` level "Kick and snare" | 5 unaided echoes averaging 75% | ear for grooves |
| 8 | Hold the tempo | `mode=steady&steady=basic-rock`, 80 | Within 3 BPM after the click drops, two days | play-along |
| 9 | Crash on one, first fill | `groove=shave-tag`, then `groove=one-beat-fill` | Pass at 80, the landing crash inside the good window | every song ending |
| 10 | First whole song | Song Studio, drum import (NEW: drum MIDI or MusicXML onto the pads, see section 4) in wait mode, then performance mode at 80% speed | One shelf song end to end at 80% speed, 85% of notes good | the shelf |

**Song shelf (pick 2 or 3).**

| Song, artist | Teaches | Tempo, feel | Diff | MuseScore score | Fallback | Grid |
|---|---|---|---|---|---|---|
| Billie Jean, Michael Jackson | Steady eighths, kick 1 and 3, the most famous pop loop | about 117, straight | 1 | [ken014, solo drum, 867 views](https://musescore.com/user/8442431/scores/2079686); alt [Xander Glavas, solo](https://musescore.com/user/22201376/scores/4203676) | official [Hal Leonard drum chart](https://musescore.com/user/39593079/scores/15851464) | 16 |
| We Will Rock You, Queen | Stomp-clap, then a full beat at the solo | about 81 | 1 | [Midi Drum Scores, solo](https://musescore.com/user/11785381/scores/5251338) | app `stomp-clap` | 16 |
| Seven Nation Army, The White Stripes | Four on the floor kick, floor tom build, crashes | about 124 | 1 | [Lizzy Plays Drums, drums only, 908 views, 4.8](https://musescore.com/user/33429795/scores/5837603) | | 16 |
| Back in Black, AC/DC | Rock beat with space, crash accents, stops | about 92 | 1 | [tobias.nienhaus, solo, 4.8 (184)](https://musescore.com/user/27077701/scores/6681779) | alt [rumstrommel, solo](https://musescore.com/user/5667586/scores/2882026) | 16 |
| Another One Bites the Dust, Queen | Kick on every beat, open space, handclaps | about 110 | 1 | [jirkadrum, "grade 1" drum part, 362 views](https://musescore.com/user/36838959/scores/7967498) | alt [Midi Drum Scores, solo](https://musescore.com/user/11785381/scores/5251488) | 16 |
| Stand by Me, Ben E. King | Light backbeat, rim click, dynamics low | about 118 | 1 | [musica_ciedi, drum set](https://musescore.com/user/44468687/scores/13332562) | | 16 |
| Highway to Hell, AC/DC | Rock beat with stops and crashes | about 116 | 2 | [Swoog, drum sheet, 1.8K views, 4.7 (211)](https://musescore.com/user/28184976/scores/5016007) | | 16 |
| Be My Baby, The Ronettes | THE pop intro: kick 1, kick-snare on 2-and | about 130 | 2 | [tplinkvstplin, solo drum](https://musescore.com/user/82001287/scores/23530525) (few views, check it against the record) | app groove NEW "be-my-baby" (rec. 6 of round 1) | 16 |
| Smoke on the Water, Deep Purple | Hats-only intro, then a plain rock beat | about 112 | 2 | [Çukurova Müzik Akademi, drum](https://musescore.com/user/4637911/scores/11303932) | official [Hal Leonard transcription](https://musescore.com/user/39593079/scores/15708376) | 16 |

**Boss:** two shelf songs end to end in Song Studio performance mode at record tempo (85% good), plus `steady=basic-rock` at 90 within 3 BPM.

### Level 2. Moving the kick, open hats and first fills (Stage 2 to 3)
**Goal:** pop and rock beats with syncopated kicks, open-hat lifts, eighth-note fills and choruses louder than verses. **Adds:** kick on the & of 3, open hat, doubles, eighth fills, crash and ride, writing a groove down.

| # | Step | Drill and setup | Done means | Feeds |
|---|---|---|---|---|
| 1 | Push the kick | `groove=syncopated`, 80 to 100 | Pass at 100, two days | Rolling in the Deep, Livin' on a Prayer |
| 2 | Kick variations under one hat | `groove=independence`, 75 to 90 | Pass at 90 | all |
| 3 | Doubles on one pad | `pattern=double-strokes&sub=2`, 70 to 100 | Mean error 45 ms or less at 100 | fills, open hats |
| 4 | Soft and loud | `mode=dynamics` "ladder" | 3 runs with 4 levels separated | verse vs chorus |
| 5 | Eighth fill on the snare | `mode=fills` "Snare eighths on 3 and 4" | 5 fills landed (no rush, landing in window) | every shelf song |
| 6 | Down the toms | `mode=fills` "Sixteenths down the toms on 3 and 4" at 70, then 90 | 5 fills landed at 90 | Eye of the Tiger, Livin' on a Prayer |
| 7 | Echo with hats | `mode=echo` level "With hats" | 5 echoes averaging 75% | ear |
| 8 | Write a groove down | `/music/learn/rhythm?mode=groove&grooveLevel=rock` | 5 unaided dictations averaging 75% | reading drum charts |
| 9 | Open hat on the & of 4 | NEW groove `rock-open-hat` (basic rock with an open hat on step 15, closed by the next hat) | Pass at 100 | Mr. Brightside, Sweet Home Alabama |
| 10 | Four bars with a fill | `groove=turnaround-fill`, 80 to 100 | 2 omissions at most, fill in time, from memory | song form |
| 11 | Ride for the chorus | `mode=orchestrate` "Ride and snare" | Pass at 80 | Rolling in the Deep, Beat It |

**Song shelf.**

| Song, artist | Teaches | Tempo, feel | Diff | MuseScore score | Fallback | Grid |
|---|---|---|---|---|---|---|
| Smoke on the Water, Deep Purple (whole song) | Section changes, simple fills | about 112 | 1 | [Çukurova, drum](https://musescore.com/user/4637911/scores/11303932) | | 16 |
| I Love Rock 'n' Roll, Joan Jett | Stomping half-time feel, claps, stops | about 94 | 1 | [JonathanAhrens, solo, 4.8 (36)](https://musescore.com/user/27013952/scores/6539650) | official [HL drum chart](https://musescore.com/user/39593079/scores/15851512) | 16 |
| Eye of the Tiger, Survivor | Hits with the band, tom fills | about 109 | 2 | [Ferran Alemany, drum tablature, 722 views](https://musescore.com/user/29622868/scores/5223049) | alt [Xender_, solo, 4.8 (55)](https://musescore.com/user/32790468/scores/6230115) | 16 |
| Rolling in the Deep, Adele | Four-on-floor verse to ride chorus, pushes | about 105 | 2 | [Gabor Varga 2, solo, 4.9 (28)](https://musescore.com/user/33506251/scores/5853936) | official [HL chart](https://musescore.com/user/39593079/scores/15733771) | 16 |
| Sweet Home Alabama, Lynyrd Skynyrd | Laid-back eighths, open hats, count-in | about 98 | 2 | [MANU TAM TAM, solo](https://musescore.com/user/28199588/scores/6600146) | | 16 |
| Livin' on a Prayer, Bon Jovi | Pushed kicks, the key-change fill | about 123 | 2 | [tobias.nienhaus, solo, 4.7 (49)](https://musescore.com/user/27077701/scores/8095872) | | 16 |
| Beat It, Michael Jackson | Sixteenth-feel pop beat, crashes on pushes | about 139 | 3 | official only: [HL drum chart](https://musescore.com/user/39593079/scores/15733831) | Songsterr search | 16 |
| Blinding Lights, The Weeknd | Fast synth-pop backbeat, open hats | about 171 | 3 | [Drum Sheets, solo, 4.7 (22)](https://musescore.com/user/35273741/scores/11796661) | | 16 |
| Mr. Brightside, The Killers | Fast eighths with open hats, endurance | about 148 | 3 | [calemari, solo, 4.8 (17)](https://musescore.com/user/55224798/scores/21847102) | | 16 |

**Boss:** two shelf songs at record tempo (85% good) with every fill landed, plus `turnaround-fill` at 100 from memory.

### Level 3. Boom bap, swing and the first breaks (Stage 3 to 4)
**Goal:** two-bar hip hop beats with a moving kick and a little MPC swing, the first sampled breaks, and playing over a loop. **Adds:** two-bar memory, swing 54 to 58, sixteenth singles, playing over a sampled loop, the first chop.

| # | Step | Drill and setup | Done means | Feeds |
|---|---|---|---|---|
| 1 | Boom bap, first steps | `groove=boom-bap-a`, 80 to 92 | Pass at 92, two days | Gangsta's Paradise, In Da Club |
| 2 | Two-bar boom bap | `groove=boom-bap-2bar`, 80 to 92 | 1 omission at most, accents right on 6 of 8 snares | Hypnotize |
| 3 | Boom bap | `groove=boom-bap-b` | Pass at 92 | all hip hop |
| 4 | Sixteenth singles | `pattern=single-16ths&sub=4`, 70 to 90 | 45 ms or less at 90 | hats, fills |
| 5 | Swing by hand | `groove=swing-56`, 80 to 92 | Pass; results show 54 to 58% | every boom bap beat |
| 6 | Impeach the President | `groove=impeach`, 80 to 95 | Pass at 95 | Impeach shelf item |
| 7 | When the Levee Breaks | `groove=levee`, 62 to 72 | Pass at 72, heavy and even velocity | Levee |
| 8 | Echo sixteenths | generic echo `sixteenths` (path step M-E2) | 5 echoes averaging 75% | ear for breaks |
| 9 | Play over a loop | NEW "Backing: a loop" in Grooves (round 1 rec. 3): a 2-bar break from Library, BPM typed, downbeat nudged | 16 bars of `boom-bap-b` over the loop, pass, drift under 2 BPM | real-world practice |
| 10 | First chop: slices in order | NEW chop drill (round 1 rec. 4): a 1-bar loop on A01 to A16, replay in order to the click | Pass at the loop's tempo | sample-based beats |
| 11 | Grooves from memory | Check mode (notes hidden) on `boom-bap-b`, `impeach` | Pass with notes hidden | boss |

**Song shelf.**

| Song, artist | Teaches | Tempo, feel | Diff | MuseScore score | Fallback | Grid |
|---|---|---|---|---|---|---|
| Gangsta's Paradise, Coolio | Slow boom bap, space, claps | about 80 | 1 | [Jeffrey31, solo drum, 4.6 (13)](https://musescore.com/user/16986681/scores/6727285) | official beginner [ArrangeMe](https://musescore.com/user/97106398/scores/19449796) | 16 |
| In Da Club, 50 Cent | Sparse hip hop with claps on 2 and 4 | about 90 | 1 | official beginner only: [ArrangeMe drums](https://musescore.com/user/97106398/scores/37782929) | Songsterr search | 16 |
| Walk This Way, Run-DMC and Aerosmith | The break that opened rap to rock, kick-snare intro | about 108 | 2 | official only: [HL drum chart](https://musescore.com/user/39593079/scores/15733759) | Breakbeat Bible | 16 |
| Impeach the President, The Honey Drippers | The sampled break: kick pushes, open hat | about 95 | 2 | [autoenglish, "Impeach drum break tab", solo](https://musescore.com/user/27413747/scores/23330809) | app `impeach` | 16 |
| Hypnotize, The Notorious B.I.G. | Pop rap beat, sixteenth hats | about 96 | 2 | [Nicholas Bahamon, solo drum](https://musescore.com/user/83120983/scores/28830227) (new, unrated) | [Songsterr](https://www.songsterr.com/a/wsa/notorious-big-hypnotize-tab-s513329) | 16 |
| Feel Good Inc., Gorillaz | Hip hop beat at a brisk tempo, ghosted hats | about 139 | 2 | [trommly, drumscore, 4.8 (82)](https://musescore.com/user/28284369/scores/7128742) | official beginner [ArrangeMe](https://musescore.com/user/97106398/scores/19270438) | 16 |
| The Real Slim Shady, Eminem | Bouncy pop rap, kick patterns | about 105 | 2 | [eduardoguedesdrums, solo](https://musescore.com/user/49012224/scores/13886890) | official beginner [ArrangeMe](https://musescore.com/user/97106398/scores/19327972) | 16 |
| Still D.R.E., Dr. Dre | G-funk beat, sixteenth hats, sparse kick | about 93 | 2 | [נוה כהן, drum group only, 32 views](https://musescore.com/user/30724014/scores/8346212) (short, check it) | Songsterr search | 16 |
| When the Levee Breaks, Led Zeppelin | Huge slow break, the most sampled rock beat | about 72 | 2 | none (MuseScore shows no community scores for Led Zeppelin) | app `levee`; [Songsterr](https://www.songsterr.com/a/wsa/led-zeppelin-when-the-levee-breaks-tab-s11512) | 16 |
| Juicy, The Notorious B.I.G. | Soft boom bap over a sample (Mtume) | about 96 | 1 | none | [Songsterr](https://www.songsterr.com/a/wsa/notorious-big-juicy-tab-s7460264); NEW app groove | 16 |

**Boss:** two shelf songs at tempo, `impeach` or `levee` from memory over the loop (NEW backing), and a 1-bar chop replayed in order.

### Level 4. Sixteenths and ghost notes: funk and R&B (Stage 4 to 5)
**Goal:** sixteenth hats and soft ghost snares between loud backbeats; the James Brown and Stevie Wonder grooves. **Adds:** accents and ghosts, moving accents, paradiddles, one-hand vs two-hand sixteenths, Stick Control permutations.

| # | Step | Drill and setup | Done means | Feeds |
|---|---|---|---|---|
| 1 | Accents and ghosts | `pattern=accents-ghosts`, 80 | Ghosts under 40% of accent velocity, 3 runs | Funky Drummer, Superstition |
| 2 | Moving accent | `pattern=moving-accent&sub=4`, 70 to 90 | Accent on the right note 14 of 16, two days | ghost grooves |
| 3 | Crescendo | `mode=dynamics` "crescendo" | Rising band order, 3 runs | builds |
| 4 | Paradiddle | `pattern=paradiddle&sub=4`, 80 to 100 | 40 ms or less at 100 | hats, fills |
| 5 | Paradiddle split | `groove=paradiddle-split` | Pass at 90 | Treasure, funk hats |
| 6 | Ghosts in boom bap | `groove=ghost-boom-bap`, 80 to 92 | Pass and ghosts under 40% | Kiss |
| 7 | Funk sixteenths | `groove=funk-sixteenths`, 80 to 96 | Pass at 96 | Superstition, Uptown Funk |
| 8 | Funky Drummer | `groove=funky-drummer`, 80 to 100 | Pass at 100, two days | Funky Drummer |
| 9 | Think | `groove=think`, 95 to 113 | Pass at 113 | Think |
| 10 | Stick Control, page one | NEW permutation drill (round 1 rec. 7): 4-note R/L stickings on two pads, 20 reps each | All 16 stickings at 90, 90% right pad | fills, linear |
| 11 | Write the groove down | `rhythm?mode=groove&grooveLevel=sixteenths` | 5 dictations averaging 75% | reading charts |
| 12 | Play it back: sixteenths and ghosts | `mode=echo` level "Sixteenths and ghosts" | 5 echoes averaging 75% | ear |

**Song shelf.**

| Song, artist | Teaches | Tempo, feel | Diff | MuseScore score | Fallback | Grid |
|---|---|---|---|---|---|---|
| Superstition, Stevie Wonder | Sixteenth hats with ghosts, the clavinet groove | about 100 | 2 | [jricardocarri, solo, 673 views, 4.7 (109)](https://musescore.com/user/33758879/scores/6001335) | official [HL chart](https://musescore.com/user/39593079/scores/15903097) | 16 |
| Funky Drummer, James Brown | The most sampled break: ghosts, open hat | about 100 | 3 | [autoenglish, break drum tab, 4.9 (11)](https://musescore.com/user/27413747/scores/23031694) | alt [musicfilesLTE, solo](https://musescore.com/user/32783/scores/6767174); app `funky-drummer` | 16 |
| Think (About It), Lyn Collins | "Yeah! Woo!" break, ghosts, tambourine sixteenths | about 113 | 3 | none found | app `think`; [Ethan Hein's transcription](https://www.ethanhein.com/wp/2026/it-takes-two/) | 16 |
| Uptown Funk, Mark Ronson and Bruno Mars | Modern funk with stops and hits | about 115 | 2 | [carsonharrop1, drum cover, solo](https://musescore.com/user/51517142/scores/8683977) (few views) | official [HL chart](https://musescore.com/user/39593079/scores/15791431) | 16 |
| Kiss, Prince | Sparse LinnDrum funk, space as groove | about 112 | 2 | official only: [HL chart](https://musescore.com/user/39593079/scores/15899356) | Songsterr search | 16 |
| September, Earth, Wind and Fire | Disco-funk sixteenths, open hats | about 126 | 2 | official only: [HL chart](https://musescore.com/user/39593079/scores/15898255) | Songsterr search | 16 |
| Treasure, Bruno Mars | Disco-funk, sixteenth hats, claps | about 116 | 2 | [faydeereyes, solo](https://musescore.com/user/43450223/scores/24634696) (few views) | | 16 |
| Rock with You, Michael Jackson | Smooth sixteenth hats, light ghosts | about 114 | 2 | [davidmacatang, drum group, 4.8 (48)](https://musescore.com/user/48280362/scores/11379340) | | 16 |
| Crazy in Love, Beyoncé | Horn-hit funk beat, syncopated kick | about 99 | 3 | official only: [HL chart](https://musescore.com/user/39593079/scores/16088536) | Songsterr search | 16 |
| Use Me, Bill Withers | Bill Withers' hi-hat funk, ghosted snare | about 76 | 3 | only band arrangements | [Songsterr](https://www.songsterr.com/a/wsa/bill-withers-use-me-tab-s843207) | 16 |

**Boss:** Funky Drummer at 100 and one shelf song with ghosts under 40% of the accents, plus the moving accent at 90.

### Level 5. Four on the floor: disco, house, electro; loops and chops (Stage 5 to 6)
**Goal:** dance grooves at 110 to 128 with open hats, claps and builds; play over loops and arrange a chop. **Adds:** endurance at tempo, the build and drop, note repeat, reordering chops, 16 to 32 bar forms.

| # | Step | Drill and setup | Done means | Feeds |
|---|---|---|---|---|
| 1 | Four on the floor with open hats | `groove=four-on-floor`, then `groove=house`, 110 to 124 | Pass at 124, two days | all dance |
| 2 | Disco hats | NEW groove `disco` (sixteenth hats with open hat on each &, snare 2 and 4) | Pass at 120 | Le Freak, Stayin' Alive |
| 3 | Endurance | `mode=steady&steady=house`, 124 | 12 bars within 2 BPM | DJ-length songs |
| 4 | Snare build to the drop | `groove=snare-build` | Pass, crash on the drop in window | Titanium |
| 5 | Note repeat | NEW app Note Repeat (round 1 rec. 5): hold a pad, rate 1/8, 1/16 | 4-bar build with rising velocity | builds, trap |
| 6 | Over a loop, house | NEW loop backing, a 4-bar house loop | 32 bars, drift under 2 BPM | real practice |
| 7 | Chop and reorder | NEW chop drill, exercise 2 (play a written reorder) | Pass at 110 | sample flips |
| 8 | Song form | NEW song-form piece (round 1 rec. 9): intro, groove, build, drop, outro, 32 bars | Every section passed in one take | boss |
| 9 | Hear the kit | listening drills on drums (`/music/listening?exercise=level&material=drums`, then `compression`) | 8 of 10 right | mixing ears |

**Song shelf.**

| Song, artist | Teaches | Tempo, feel | Diff | MuseScore score | Fallback | Grid |
|---|---|---|---|---|---|---|
| Stayin' Alive, Bee Gees | The disco beat, sixteenth hats | about 104 | 1 | [cigatomas, solo, 4.8 (9)](https://musescore.com/user/64989379/scores/12022000) | official [HL chart](https://musescore.com/user/39593079/scores/16088575) | 16 |
| Le Freak, Chic | Disco open hats, breakdown | about 120 | 2 | [225210, solo](https://musescore.com/user/116028644/scores/37745813) | official beginner [ArrangeMe](https://musescore.com/user/97106398/scores/35177135) | 16 |
| Good Times, Chic | The groove under Rapper's Delight | about 110 | 2 | [eunhyeok0325, solo](https://musescore.com/user/77568700/scores/33523772) | official [HL chart](https://musescore.com/user/39593079/scores/15899089) | 16 |
| Get Lucky, Daft Punk | Disco-house, light hats | about 116 | 2 | official only: [HL chart](https://musescore.com/user/39593079/scores/15903091) | alt [jaimeagustinv, percussion part](https://musescore.com/user/38646979/scores/7106098) | 16 |
| One More Time, Daft Punk | Filter-house four on the floor, the breakdown | about 123 | 2 | [mapextoto, solo](https://musescore.com/user/9140556/scores/2023016) | | 16 |
| Levitating, Dua Lipa | Nu-disco, open hats, claps | about 103 | 2 | [Obedire, solo](https://musescore.com/user/80114596/scores/15163561) | official beginner [ArrangeMe](https://musescore.com/user/97106398/scores/18796054) | 16 |
| Titanium, David Guetta and Sia | EDM build, snare roll, drop | about 126 | 3 | [Costas1965, solo, 1K views](https://musescore.com/user/1095166/scores/3181386) | official [ArrangeMe](https://musescore.com/user/97106398/scores/19247689) | 16 |
| Gypsy Woman, Crystal Waters | The house classic: kick, clap, shaker | about 120 | 2 | [dudebub, drums and piano duet, 4.7 (275)](https://musescore.com/user/30198370/scores/5464605) (read the drum staff) | | 16 |
| Blue Monday, New Order | Sixteenth kick intro, drum machine | about 130 | 3 | none (band arrangements only) | [Songsterr](https://www.songsterr.com/a/wsa/new-order-blue-monday-tab-s48464t3) | 16 |

**Boss:** a 32-bar song-form piece over a loop in one take, plus two shelf songs at tempo.

### Level 6. Fills, dynamics and song form (Stage 6 to 7)
**Goal:** play whole rock songs with fills that land, verse and chorus dynamics, and rudiments spread over the kit. **Adds:** one hand holds while the other fills, six-stroke roll, double paradiddle, orchestrations, reading a line over an ostinato.

| # | Step | Drill and setup | Done means | Feeds |
|---|---|---|---|---|
| 1 | Whole-bar fills | `mode=fills` "A bar of sixteenths around the kit", 70 to 100 | 5 landed at 100 | all shelf songs |
| 2 | Paradiddle around the kit | `mode=orchestrate` "Toms lead", then "Hats and snare" | Pass at 90 | Come Together, Wipe Out |
| 3 | Six-stroke roll | `pattern=six-stroke`, 70 to 100 | 40 ms or less at 100 | fills |
| 4 | Double paradiddle and paradiddle-diddle | `pattern=double-paradiddle`, `pattern=paradiddle-diddle` | 40 ms or less at 90 | fills in sixes |
| 5 | Flams | `pattern=flam` | Flam gap under 30 ms, 3 runs | fills, Wipe Out |
| 6 | Ostinato and a line | `mode=ostinato` all 4 lines | Hats held while the snare reads each line, pass | reading charts |
| 7 | Reading interpretations | NEW Syncopation-style generator (round 1 rec. 8) | 8 lines read in 2 interpretations | sight-reading charts |
| 8 | Three-finger and triple strokes | `pattern=triple-strokes` | 40 ms or less at 90 | rolls |
| 9 | Dynamics in a song | NEW song-form piece with verse at "soft" band and chorus at "loud" | Bands right in 4 of 4 sections | every song |
| 10 | Two-beat fill, any fill | `mode=improvise` with "fill every 4th bar" (NEW option) | 8 fills over 32 bars, all landed | boss |

**Song shelf.**

| Song, artist | Teaches | Tempo, feel | Diff | MuseScore score | Fallback | Grid |
|---|---|---|---|---|---|---|
| In the Air Tonight, Phil Collins | The fill, and holding back for 3 minutes | about 96 | 1 | [Costas1965, full score, 1.7K views, 4.8 (120)](https://musescore.com/user/1095166/scores/4758156) | alt [Midi Drum Scores](https://musescore.com/user/11785381/scores/5250644) | 16 |
| Come Together, The Beatles | Ringo's tom groove, hats lifted | about 82 | 2 | official [HL drum chart](https://musescore.com/user/39593079/scores/15733867) | community [Gary Clark Jr. version](https://musescore.com/user/38235231/scores/4881394) | 16 |
| Smells Like Teen Spirit, Nirvana | Loud/soft, the snare fill intro | about 117 | 2 | [Alldrummer, solo, 2.5K views, 4.7 (453)](https://musescore.com/user/9111646/scores/5151823) | | 16 |
| Sunshine of Your Love, Cream | Ginger Baker's tom backbeat | about 116 | 2 | [IMONMICH, solo](https://musescore.com/user/59066206/scores/22200220) | official [School of Rock](https://musescore.com/user/39593079/scores/15854317) | 16 |
| Wipe Out, The Surfaris | The tom solo: singles and accents | about 160 | 3 | [Midi Drum Scores, solo, 4.7 (26)](https://musescore.com/user/11785381/scores/5251543) | alt [MusicArteMx](https://musescore.com/user/33601797/scores/6906752) | 16 |
| Everlong, Foo Fighters | Fast, dense eighths, big fills | about 158 | 3 | [Lawrence Buter, solo, 649 views, 4.6 (156)](https://musescore.com/user/33260248/scores/5852217) | simplified [franciscocida](https://musescore.com/user/39228629/scores/12376852) | 16 |
| Basket Case, Green Day | Punk speed, fills between lines | about 170 (cut time) | 3 | official only: [HL chart](https://musescore.com/user/39593079/scores/15897715) | Songsterr search | 16 |
| Rock and Roll, Led Zeppelin | Bonham's intro and fill-heavy ending | about 170 | 3 | official only: [HL chart](https://musescore.com/user/39593079/scores/15898096) | Songsterr search | 16 |
| Dear Maria, Count Me In, All Time Low | Pop punk: snare-heavy fills | about 182 | 3 | [Raypuff, drum score, 4.6 (17)](https://musescore.com/user/20889476/scores/4024551) | | 16 |

**Boss:** two shelf songs end to end with every fill landed, plus 32 bars of improvised fills from step 10.

### Level 7. Trap, modern hip hop, note repeat and live beats (Stage 7 to 8)
**Goal:** half-time trap with 1/32 and triplet hat rolls, Dilla feel, and building a beat live on the pads. **Adds:** 1/32 rolls, triplet rolls, note repeat with velocity, live loop recording with overdub, swing 62 and Dilla feel, chopping a melody.

| # | Step | Drill and setup | Done means | Feeds |
|---|---|---|---|---|
| 1 | Two-finger roll | `pattern=finger-roll`, 90 to 120 | 40 ms or less at 120 | all rolls |
| 2 | 1/32 roll | `pattern=roll-32`, 70 to 100 | 35 ms or less at 100 | trap hats |
| 3 | Triplet roll | `pattern=roll-16t`, 80 to 120 | 35 ms or less at 120 | trap hats (rudiment works today; inside a groove it needs **T**) |
| 4 | Trap with a 1/32 roll | `groove=trap-32`, 120 to 140 | Pass at 140, two days | all trap |
| 5 | Trap with a triplet roll | `groove=trap-triplet` | Pass at 140 | Sicko Mode, Lucid Dreams |
| 6 | Swing 62 and Dilla | `groove=swing-62`, `groove=dilla`, 78 to 88 | Swing read within 3 points; Dilla snare early | neo-soul, lo-fi |
| 7 | Note repeat rolls | NEW Note Repeat at 1/16, 1/32, 1/16T | 4 written roll bars, pass | trap |
| 8 | Live beat, 2 bars | NEW live loop recording in Create (rec. 5): kick pass, snare pass, hats pass | A 2-bar loop at 140 with no undo after the third pass | the capstone |
| 9 | Chop a melody | NEW chop drill exercise 3: free chop, recorded | A 4-bar chop pattern repeated twice, in time | sample beats |
| 10 | Snare and 808 placement | `/music/learn/rhythm?mode=groove` dictation on trap grooves (NEW level "trap") | 5 dictations averaging 75% | ear |

**Song shelf.**

| Song, artist | Teaches | Tempo, feel | Diff | MuseScore score | Fallback | Grid |
|---|---|---|---|---|---|---|
| HUMBLE., Kendrick Lamar | Sparse trap, hard snare on 3 | about 76 (half time) | 1 | [lunahowell45, solo, 385 views](https://musescore.com/user/192648/scores/1167771) | | 16 |
| Old Town Road, Lil Nas X | Country trap, hat rolls | about 68 (half time) | 1 | [Lu Cuong, solo, 4.8](https://musescore.com/user/21617691/scores/6139524) | | 16 |
| Bad Guy, Billie Eilish | Minimal pop trap, finger snaps, the switch-up | about 135 | 1 | official beginner only: [ArrangeMe](https://musescore.com/user/97106398/scores/19246276) | | 16 |
| Sunflower, Post Malone and Swae Lee | Light trap-pop, rolls | about 90 | 2 | [MelinBlack, solo, 4.7 (14)](https://musescore.com/user/33928508/scores/6030514) | alt [Edgars Raila, drum set](https://musescore.com/user/11829921/scores/22702909) | 16 |
| God's Plan, Drake | Soft trap, rolls and space | about 77 | 2 | official only: [ArrangeMe](https://musescore.com/user/97106398/scores/18774259) | | 16 |
| rockstar, Post Malone | Dark trap, rolls and 808 | about 80 | 2 | [GaBz_, solo](https://musescore.com/user/70358935/scores/21398761) | | 16 |
| Lucid Dreams, Juice WRLD | Triplet hat rolls | about 84 | 3 | official only: [ArrangeMe](https://musescore.com/user/97106398/scores/22395901) | | T |
| SICKO MODE, Travis Scott | Beat switches, triplet hats | about 155 then 78 | 3 | [calin_marcu, solo](https://musescore.com/user/111768338/scores/29508872) | | T |
| Mask Off, Future | Flute-loop trap, rolls | about 75 | 2 | only band arrangements | [Songsterr](https://www.songsterr.com/a/wsa/future-mask-off-tab-s435835) | 16 |

**Boss:** two shelf songs at tempo, `trap-32` at 140 with the roll velocity rising, and a live 2-bar beat built from silence in under 5 minutes.

### Level 8. Shuffles, triplets and swing (Stage 8) (needs the triplet grid)
**Goal:** the shuffle family: blues shuffle, rock and roll swing, the 12/8 slow blues, the half-time shuffle. **Adds:** triplet subdivision, swung eighths, ghosted triplet partials, MPC swing 66 as the bridge from straight to triplet.

| # | Step | Drill and setup | Done means | Feeds |
|---|---|---|---|---|
| 1 | Triplet singles | `pattern=single-strokes&sub=3`, 60 to 100 (works today) | 40 ms or less at 100 | all shuffles |
| 2 | Swing 66 as a bridge | `groove=swing-62` at swing 66 (NEW option to set 66 on any groove) | Swing read 64 to 68% | rock and roll |
| 3 | Blues shuffle | NEW groove `blues-shuffle` (**T**): hats on 1 and 3 of each triplet, kick 1 and 3, snare 2 and 4 | Pass at 120 | Pride and Joy, Tush |
| 4 | Swing ride | NEW groove `swing-ride` (**T**) | Pass at 140 | In the Mood, Sing Sing Sing |
| 5 | 12/8 slow blues | NEW grid `12/8` (**M**, **T**) | Pass at 60 | Red House, Everybody Wants to Rule the World |
| 6 | Shuffle with a ghost | NEW `shuffle-ghosts` (**T**): snare ghost on the third triplet partial | Ghosts under 40%, pass at 100 | Purdie, Rosanna |
| 7 | Purdie shuffle | NEW `purdie` (**T**) | Pass at 92 | Home at Last |
| 8 | Rosanna shuffle | NEW `rosanna` (**T**) | Pass at 86 | Rosanna |
| 9 | Fool in the Rain | NEW `fool-in-the-rain` (**T**) | Pass at 130 | Fool in the Rain |
| 10 | Triplet fills | NEW fills in triplets (**T**) | 5 landed at 100 | all shuffles |
| 11 | Hear straight vs swung | ear: rhythm "feel" drill (NEW item: straight, swung, shuffle, 12/8) | 8 of 10 right | ear path |

**Song shelf** (every item is **T**; check each against the record).

| Song, artist | Teaches | Tempo, feel | Diff | MuseScore score | Fallback | Grid |
|---|---|---|---|---|---|---|
| Rock Around the Clock, Bill Haley | Swung eighths, snare on 2 and 4 | about 182 | 1 | official only: [HL chart](https://musescore.com/user/39593079/scores/15899128) | Songsterr search | T |
| Pride and Joy, Stevie Ray Vaughan | Texas blues shuffle | about 120 | 1 | [impiastro, solo, 4.6 (12)](https://musescore.com/user/35422780/scores/7705289) | official [HL transcription](https://musescore.com/user/39593079/scores/15690379) | T |
| Tush, ZZ Top | Rock shuffle, crash accents | about 140 | 2 | [Leprechaun74, drum sheet, 4.6 (14)](https://musescore.com/user/27068250/scores/6926994) | | T |
| La Grange, ZZ Top | Boogie shuffle on the toms then hats | about 160 | 2 | [laski89, solo, 4.7 (13)](https://musescore.com/user/25923556/scores/4713881) | official [HL chart](https://musescore.com/user/39593079/scores/15733879) | T |
| Everybody Wants to Rule the World, Tears for Fears | 12/8 pop shuffle | about 112 | 2 | [bhurst76, drums, 441 views, 4.7 (77)](https://musescore.com/user/28844088/scores/7446251) | | T, M |
| Hold the Line, Toto | Porcaro's piano-driving shuffle | about 96 | 2 | [Leprechaun74, drum sheet, 426 views, 4.7 (66)](https://musescore.com/user/27068250/scores/6996902) | | T |
| Sing, Sing, Sing, Benny Goodman | Krupa's swing tom beat | about 210 | 2 | [vikavoronova1, drums, 4.8 (86)](https://musescore.com/user/32604178/scores/5635517) | official [HL transcription](https://musescore.com/user/39593079/scores/15827167) | T |
| Red House, Jimi Hendrix | Slow 12/8 blues | about 60 (12/8) | 2 | official only: [School of Rock](https://musescore.com/user/39593079/scores/15857410) | | T, M |
| Rosanna, Toto | The half-time shuffle | about 86 | 3 | [nathanjenning1, solo, 434 views, 4.8 (60)](https://musescore.com/user/31688293/scores/5810607) | study: [Rosanna shuffle, RobbertHendriks](https://musescore.com/user/30983462/scores/6052991); [Wikipedia](https://en.wikipedia.org/wiki/Rosanna_shuffle) | T |
| Home at Last, Steely Dan | The Purdie shuffle | about 92 | 3 | study: [Purdie half time shuffle, jdmagby, 4.7 (31)](https://musescore.com/user/34034864/scores/6725463) (the song itself is only in band arrangements) | [Songsterr](https://www.songsterr.com/a/wsa/steely-dan-home-at-last-tab-s1441329); [Soundbrenner](https://www.soundbrenner.com/blogs/articles/rhythm-library-purdie-shuffle) | T |
| Fool in the Rain, Led Zeppelin | Bonham's half-time shuffle and the samba break | about 130 | 3 | none (no Led Zeppelin on MuseScore) | [Songsterr drum practice](https://www.songsterr.com/a/wsa/led-zeppelin-fool-in-the-raindrum-practice-tab-s1789443) | T |

Warm-up study for the whole level: [Blues Shuffle drums, bf 23, 4.8 (59)](https://musescore.com/user/28309738/scores/5899293).

**Boss:** Pride and Joy or Tush at tempo, Rosanna or Home at Last at 80% of tempo with ghosts under 40%, plus triplet singles at 100.

### Level 9. Latin, Caribbean, Brazilian and Afro grooves (Stage 8 to 9)
**Goal:** play the clave-based and dance-hall families with the right hand on cowbell, rim or shaker and the left keeping the bass pattern. **Adds:** clave as an ostinato, 3+3+2, cross-stick, one drop half time, samba surdo, afrobeat kicks in double strokes.

| # | Step | Drill and setup | Done means | Feeds |
|---|---|---|---|---|
| 1 | Son clave and rumba clave | `groove=son-clave`, `groove=rumba-clave` | Pass at 100, then clapped while the app plays kick | all Latin |
| 2 | Tresillo under a backbeat | `groove=tresillo-backbeat` | Pass at 100 | dembow, afrobeats |
| 3 | Dembow and reggaeton | `groove=dembow`, `groove=reggaeton`, 85 to 100 | Pass at 95 | Despacito, Gasolina |
| 4 | One drop and steppers | `groove=one-drop`, `groove=steppers` | Pass at 75 and 120 | Bob Marley |
| 5 | Dancehall and soca | `groove=dancehall`, `groove=soca` | Pass at their targets | soca, dancehall |
| 6 | Cumbia | `groove=cumbia` | Pass at 95 | cumbia |
| 7 | Bossa nova | `groove=bossa-nova`, 110 to 130 | Pass at 130 | Girl from Ipanema |
| 8 | Samba | `groove=samba` | Pass at the target | Mas que Nada |
| 9 | Tony Allen afrobeat | `groove=tony-allen`, 85 to 110 | Pass at 110, two days | Zombie, Water No Get Enemy |
| 10 | Brazilian funk | `groove=tamborzao`, `groove=funk-150` | Pass at 130 and 150 | baile funk |
| 11 | Clave over a groove | `mode=ostinato` with the clave as the line (NEW line) | Clave held while the kick moves | Oye Como Va |
| 12 | Songo | NEW groove `songo` | Pass at 100 | Latin jazz |

**Song shelf.**

| Song, artist | Teaches | Tempo, feel | Diff | MuseScore score | Fallback | Grid |
|---|---|---|---|---|---|---|
| Despacito, Luis Fonsi | Pop reggaeton dembow | about 89 | 1 | [Çukurova, solo, 4.3 (7)](https://musescore.com/user/4637911/scores/15466594) | official beginner [ArrangeMe](https://musescore.com/user/97106398/scores/19390291) | 16 |
| Gasolina, Daddy Yankee | Classic reggaeton | about 96 | 1 | none (drumline arrangements only) | [Songsterr drum tab](https://www.songsterr.com/a/wsa/daddy-yankee-gasolina-drum-tab-s2912676); app `reggaeton` | 16 |
| Could You Be Loved, Bob Marley | Reggae rockers groove | about 103 | 2 | official only: [HL transcription](https://musescore.com/user/39593079/scores/15720010) | community study: [Reggae drum exercise, lafogneul](https://musescore.com/user/55518374/scores/11845969) | 16 |
| Roots, Rock, Reggae, Bob Marley | One drop | about 75 | 2 | official beginner only: [ArrangeMe](https://musescore.com/user/97106398/scores/19461106) | app `one-drop` | 16 |
| Oye Como Va, Santana | Cha-cha with cowbell and timbales feel | about 120 | 2 | official only: [HL drums](https://musescore.com/user/39593079/scores/15743404) | Songsterr search | 16 |
| Smooth, Santana and Rob Thomas | Latin rock: cowbell, clave pushes | about 116 | 2 | official only: [HL chart](https://musescore.com/user/39593079/scores/16088554) | | 16 |
| Livin' la Vida Loca, Ricky Martin | Latin pop at speed, tom accents | about 178 | 2 | official only: [HL chart](https://musescore.com/user/39593079/scores/16087744) | | 16 |
| Mas que Nada, Jorge Ben Jor | Samba on the kit | about 110 | 3 | [musica_ciedi, drum set](https://musescore.com/user/44468687/scores/10167391) | app `samba` | 16 |
| The Girl from Ipanema, Jobim | Bossa nova cross-stick and brushes feel | about 130 | 2 | [noahjosephfer, drum part, 4.9 (7)](https://musescore.com/user/36373264/scores/12882355) | study: [Bossa Nova Drum Practice, DaveTMusic, 1.8K views, 4.7 (161)](https://musescore.com/user/29424620/scores/5214444) | 16 |
| Calm Down, Rema | Afrobeats: shaker sixteenths, 3-3-2 rim | about 107 | 2 | [TheDrumLibrary, drum cover, solo](https://musescore.com/user/74179057/scores/13124695) | | 16 |
| Zombie, Fela Kuti | Tony Allen's afrobeat | about 130 | 3 | band arrangement only: [kica67, 4.8 (23)](https://musescore.com/user/79422388/scores/12340369) | study: [Afrobeat Drumming, 30 patterns, Nicolas Dewey, 4.8 (42)](https://musescore.com/user/5983971/scores/7660412); [Songsterr](https://www.songsterr.com/a/wsa/fela-kuti-africa-70-zombie-tab-s5464728) | 16 |

Extra studies on MuseScore: [Exercise: songo, cumbia, Latin, African (Musico_Mx, 4.9)](https://musescore.com/user/35830598/scores/6289032); [Soca Beat 1 (chazonstylez)](https://musescore.com/user/72427750/scores/14802487).

**Boss:** one reggaeton or reggae song and one Brazilian or afrobeat item at tempo, plus son clave held on the rim for 16 bars while the other hand plays `tony-allen` kicks (NEW combination).

### Level 10. Breaks at tempo, linear funk, drum and bass (Stage 9 to 10)
**Goal:** the canonical breaks at record tempo, linear grooves, and drum and bass at 170 to 175 with chopped breaks. **Adds:** speed (sixteenths at 138), linear sticking, three-over-four, cutting the Amen into slices and resequencing it.

| # | Step | Drill and setup | Done means | Feeds |
|---|---|---|---|---|
| 1 | Linear three over four | `groove=linear-3-over-4` | Pass at 90 | linear funk |
| 2 | Linear grooves | NEW linear grooves from Stick Control stickings orchestrated (no two voices together) | 4 grooves at 90 | Cissy Strut, 50 Ways |
| 3 | Drum and bass two-step | `groove=dnb`, 140 to 172 | Pass at 172, two days | DnB |
| 4 | Amen, bar by bar | `groove=amen`, 110 to 138 (sections) | Each bar passed, then all four at 138 | Amen |
| 5 | Apache | `groove=apache`, 95 to 112 | Pass at 112 | Apache |
| 6 | Cold Sweat | NEW groove `cold-sweat` | Pass at 112 | Cold Sweat |
| 7 | Chop the Amen | NEW chop drill: Amen on 16 slices, play a written jungle edit at 170 | Pass at 160 | jungle, DnB |
| 8 | Hold the tempo at speed | `mode=steady&steady=dnb`, 172 | 12 bars within 2 BPM | capstone |
| 9 | Echo a break | `mode=echo` level "Sixteenths and ghosts" at 110 | 5 echoes averaging 80% | ear |
| 10 | Tempo ladder | Auto +5 BPM after each clean pass on `funky-drummer`, `amen` | Record tempo plus 10% | boss |

**Song shelf.**

| Song, artist | Teaches | Tempo, feel | Diff | MuseScore score | Fallback | Grid |
|---|---|---|---|---|---|---|
| Amen, Brother, The Winstons | The Amen break, four bars | about 136 | 2 | [urmel79, solo, 4.6 (9)](https://musescore.com/user/78782002/scores/14636917) | alt [Amen Break, donjezza, 421 views, 4.6 (42)](https://musescore.com/user/928886/scores/530296); app `amen` | 16 |
| Apache, Incredible Bongo Band | The Apache break with bongos | about 118 | 2 | [autoenglish, break drum tab, drums and bongo](https://musescore.com/user/27413747/scores/22956508) | app `apache` | 16 |
| Cold Sweat, James Brown | Clyde Stubblefield's ghosted funk | about 112 | 2 | [Dave Previ, solo, 4.7 (7)](https://musescore.com/user/26793214/scores/5022160) | official [HL transcription](https://musescore.com/user/39593079/scores/15709375) | 16 |
| Pick Up the Pieces, Average White Band | Sixteenth funk with open hats | about 108 | 2 | official only: [HL transcription](https://musescore.com/user/39593079/scores/15709366) | Songsterr search | 16 |
| Get Up (Sex Machine), James Brown | Jabo Starks' hat-led funk | about 108 | 2 | official only: [HL transcription](https://musescore.com/user/39593079/scores/15709000) (the search card says Sex Machine but the page title reads "Get Up Offa That Thing"; check before buying) | Songsterr search | 16 |
| Cissy Strut, The Meters | Zigaboo's linear funk | about 88 | 3 | official only: [HL chart](https://musescore.com/user/39593079/scores/15733885) | [Drummer Cafe lesson (free)](https://drummercafe.com/education/lessons/zigaboo-modeliste-cissy-strut-linear-drum-groove) | 16 |
| 50 Ways to Leave Your Lover, Paul Simon | Gadd's linear march | about 100 | 3 | [Ward De Moor, solo, 768 views, 4.6 (44)](https://musescore.com/user/127942/scores/3213891) | [Drummer Cafe (Gadd's sticking)](https://drummercafe.com/education/lessons/steve-gadd-50-ways-drum-groove) | 16 |
| Self vs Self, Pendulum ft. In Flames | Drum and bass at 174 with metal fills | about 174 | 3 | official only: [ArrangeMe](https://musescore.com/user/97106398/scores/37318631) | | 16 |
| Tarantula, Pendulum | Drum and bass two-step | about 174 | 3 | none | [Songsterr](https://www.songsterr.com/a/wsa/pendulum-tarantula-tab-s4909703); app `dnb` | 16 |

**Boss:** the Amen at 138 from memory, one linear funk item at tempo, a jungle edit from Amen chops at 160, and `dnb` held for 12 bars at 172.

### Level 11. Odd meters, live sets and improvising (Stage 10, capstone) (needs meter support)
**Goal:** play in 5 and 7, build a beat live and perform a 3 to 5 minute set with improvisation. **Adds:** counting groups of 2 and 3, metric modulation awareness, a set structure, soloing over a loop.

| # | Step | Drill and setup | Done means | Feeds |
|---|---|---|---|---|
| 1 | Count in 5 and 7 | NEW meter in rudiments: singles accented 3+2 and 2+2+3 | Accents right 14 of 16 at 100 | all odd meter |
| 2 | 5/4 groove | NEW groove `five-four` (**M**) | Pass at 172 | Take Five, Mission Impossible |
| 3 | 7/4 groove | NEW groove `seven-four` (**M**) | Pass at 120 | Money, Spoonman |
| 4 | 7/8 groove | NEW groove `seven-eight` (**M**) | Pass at 120 | Tom Sawyer bridge, Schism |
| 5 | Improvise 16 bars | `mode=improvise` over the funk vamp, results played back raw | 16 bars, drift under 2 BPM, at least 3 different fills | the set |
| 6 | Improvise over a loop | NEW loop backing in Improvise | 32 bars over a chosen loop, raw and half-quantised playback reviewed | the set |
| 7 | Live beat, 4 bars | NEW live loop recording, 4 bars with swing 56 and note repeat | Built in under 5 minutes, then 16 bars of fills over it | the set |
| 8 | Faded feedback | NEW faded mode (round 1 rec. 10) on 5 known grooves | Pass with summary-only feedback | performance |
| 9 | The set | NEW song-form piece the owner writes: intro, 3 grooves from 3 levels, a chop section, a solo, an ending | One take, 3 to 5 minutes, recorded | capstone |

**Song shelf.**

| Song, artist | Teaches | Tempo, feel | Diff | MuseScore score | Fallback | Grid |
|---|---|---|---|---|---|---|
| All You Need Is Love, The Beatles | 7/4 bars inside 4/4 | about 103 | 1 | [evanchambersm, solo](https://musescore.com/user/109889524/scores/28540921) | official beginner [ArrangeMe](https://musescore.com/user/97106398/scores/30451940) | M |
| Mission: Impossible theme, Lalo Schifrin | 5/4 groove | about 170 | 1 | [bradley5, drumset, 493 views](https://musescore.com/user/292676/scores/270546) | | M |
| Take Five, Dave Brubeck | 5/4 jazz, ride and cross-stick | about 172 | 2 | [ahache, take five drums, 616 views, 4.7 (97)](https://musescore.com/user/33864696/scores/5944488) | official [HL drums](https://musescore.com/user/39593079/scores/15743515) | M, T (swing) |
| Money, Pink Floyd | 7/4 rock, then 4/4 solo | about 120 | 2 | [impiastro, solo, 4.7 (23)](https://musescore.com/user/35422780/scores/12712912) | official [HL transcription](https://musescore.com/user/39593079/scores/15719614) | M, T (shuffle feel) |
| Seven Days, Sting | 5/4 pop groove (Vinnie Colaiuta) | about 120 | 2 | [oscarj08, solo, 552 views, 4.9 (108)](https://musescore.com/user/6831511/scores/4151876) | | M |
| Spoonman, Soundgarden | 7/4 riff groove | about 110 | 3 | [o.shaykina, solo, 4.5 (8)](https://musescore.com/user/79422514/scores/11863915) | official advanced [ArrangeMe](https://musescore.com/user/97106398/scores/21367003) | M |
| Tom Sawyer, Rush | Peart's 4/4 with 7/8 bridge and tom fills | about 88 | 3 | [xenophanes13, drums, 957 views, 4.7 (104)](https://musescore.com/user/7398726/scores/2013226) | official [HL transcription](https://musescore.com/user/39593079/scores/16109053) | M |
| 15 Step, Radiohead | 5/4 electronic beat with claps | about 189 | 3 | none | [Songsterr drums](https://www.songsterr.com/a/wsa/radiohead-15-step-drums-tab-s641174) | M |
| Schism, Tool | Shifting odd meters (the stretch goal) | about 108 | 4 | [oscarj08, solo, 1K views, 4.8 (158)](https://musescore.com/user/6831511/scores/4151846) | official advanced [ArrangeMe](https://musescore.com/user/97106398/scores/36973370) | M |

**Boss (path exit):** the recorded set from step 9, two shelf songs (one odd meter) at tempo, and three grooves drawn at random from levels 3 to 10 played from memory at record tempo with faded feedback.

## 3. Cross-links to other paths

| When | Link | Why |
|---|---|---|
| Level 1, step 7 | Ear path: rhythm echo, then pad echo | Hearing a groove before playing it |
| Level 2, step 8; level 4, step 11 | Reading path: rhythm dictation (`rhythm?mode=groove`), then drum staff reading (NEW, section 4) | MuseScore drum scores use the percussion staff; the owner must read it to use the shelves |
| Level 3, step 5; level 7, step 6 | Theory path: swing ratio and the MPC swing table | Swing as a number, not a vibe |
| Level 5, step 9 | Ear path, studio drills on drums | Hearing kick and snare in a mix, compression |
| Level 6, step 7 | Reading path: Syncopation-style lines | Reading under an ostinato |
| Level 8 | Ear path: straight vs swung vs shuffle (NEW item); piano path's jazz comping (swing eighths) | Same triplet feel, other instruments |
| Level 9 | Theory: clave, tresillo, 3+3+2; Aerophone and piano Latin tunes over `jam` | Playing the same groove from the band's side |
| Level 10, step 7 | Studio path: sampling, chopping, export kit to the MPC (`io/mpc-kit.ts`) | Beats from chops |
| Level 11 | Theory: meters, grouping; ear: identify 5/4 and 7/8 | Odd meters by ear before by hand |
| Every level | Jam (`/music/jam`) with the owner's guitar, piano or Aerophone recorded as the loop | Drum for his own playing |

## 4. New drills and app changes, ranked

| Rank | Change | Size | Why |
|---|---|---|---|
| 1 | **Song Studio drum import.** Read the drum part of a MuseScore MusicXML (unpitched notes with display step and instrument id) or MIDI (channel 10, General MIDI notes) and map it to the pad kit (the kit already uses GM: kick 36, snare 38, hats 42/46, toms 41/45/48, crash 49, ride 51). Then wait mode, performance mode and fix-the-spot loops grade it with the groove grader. | M to L | Every shelf depends on it. `io/midi-file.ts` already recognises channel 10; `io/musicxml.ts` has no unpitched support yet. |
| 2 | **Triplet and meter grid** (round 1 rec. 2): 12 and 24 steps a bar, 5/4, 7/4, 7/8, 6/8 and 12/8, eighth-note swing | M | Levels 8 and 11 and about a fifth of all shelf items |
| 3 | **Rebuild the MPC path** around these 11 levels, chained with `requires` (round 1 rec. 1) | M | The current 19 steps skip most pad skills and gate inconsistently |
| 4 | **Play over a loop** (round 1 rec. 3) in Grooves and Improvise | S to M | Levels 3, 5, 11 |
| 5 | **Live beat making and Note Repeat** in Create (round 1 rec. 5) | M | Levels 5, 7, 11 |
| 6 | **Chop drill** (round 1 rec. 4): in order, written reorder, free | M | Levels 3, 5, 7, 10 |
| 7 | **Drum staff reading**: flashcards for the percussion staff (which line is which pad), then sight-reading one-bar grooves | S to M | Needed to read every MuseScore score |
| 8 | **Song-form pieces** (round 1 rec. 9), plus a "fill every Nth bar" option in Improvise | M | Levels 5, 6, 11 |
| 9 | **New named grooves** (S each): rock-open-hat, disco, be-my-baby, cold-sweat, songo, linear set; with the grid: blues-shuffle, swing-ride, shuffle-ghosts, purdie, rosanna, fool-in-the-rain, five-four, seven-four, seven-eight | S each | Shelf songs the app can grade without an import |
| 10 | **Stick Control permutations** (round 1 rec. 7) | S | Levels 4, 10 |
| 11 | **Syncopation-style reading generator** (round 1 rec. 8) | S to M | Level 6 |
| 12 | **Faded feedback** (round 1 rec. 10) | S | Level 11 and retention |
| 13 | Ear items: straight, swung, shuffle, 12/8; identify 5/4 and 7/8; trap groove dictation level | S | Levels 7, 8, 11 |
| 14 | Swing setting on any groove (50 to 75, including 66) | S | Level 8 bridge |

## 5. Open questions for the owner

1. **Performer or beat maker first?** If beat making matters more, live beat making and chops (levels 5, 7) move ahead of the breaks and odd meters.
2. **Official scores.** Many shelf items are official Hal Leonard or ArrangeMe scores. Does his MuseScore plan include them, and can official scores be exported as MusicXML or MIDI for Song Studio? If not, community scores and Songsterr are the defaults.
3. **Songsterr as the second source.** Songsterr has most of the songs MuseScore lacks (Led Zeppelin, hip hop). Is a Songsterr account acceptable, given its export is limited?
4. **Genres.** Which of these does he actually want to play: trap and modern hip hop, Latin and afrobeat, drum and bass, shuffles, odd meters? Any can shrink to 4 items if he does not care.
5. **His own loops.** Can he keep loops sampled from records he owns in the private Library for levels 3, 5, 7 and 10?
6. **Layout.** Does the app's pad layout match the program he uses on the MPC? MuseScore imports map by GM note, so a different MPC program needs a remap.
7. **Aftertouch.** Does his MPC One+ send aftertouch in Controller Mode, so Note Repeat can follow pressure?
8. **Breakbeat Bible.** Buy one copy (about $25) to check the breaks that MuseScore lacks (Think, Big Beat, Synthetic Substitution, Skull Snaps)?
