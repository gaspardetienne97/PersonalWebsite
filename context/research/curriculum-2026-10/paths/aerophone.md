# Aerophone AE-20 path: a saxophone curriculum to about grade 5 (round 2, 2026-10-27)

Builds on `context/research/curriculum-2026-10/aerophone.md` (round 1: methods, what transfers, the 20-step outline, riff list) and `context/research/aerophone.md` (hardware, MIDI, transpose). Not repeated here. MuseScore was searched in the Orca browser on 2026-10-27 (about 110 searches). Every primary shelf score and most community fallbacks (108 links) were opened and their title, part and arranger checked on the score page; 56 further fallback links (mostly Official alternatives) were read from the search listings, which show the title, part and arranger, without opening each page.

## 1. Target, scope and time

**Done means:** the owner can play, from a downloaded alto part, a pop sax hit with the palm-key top (Baker Street, Careless Whisper), a jazz head with swing articulation and two improvised blues choruses over a backing, and a Ferling slow study with planned breaths, dynamics and vibrato; plus all 12 major and the common minor scales over the full written range Bb3 to F#6 at grade 5 speed (crotchet 66, four notes a click).

**Benchmarks:** about ABRSM or Trinity Grade 5 saxophone (a lyrical piece, a technical piece, a jazz option, scales, sight-reading); the end of Rubank Intermediate (Voxman) and Essential Elements Book 2; Niehaus Basic Jazz Conception Vol. 1 played through; Aebersold Vol. 1 blues and ii-V tracks. Teal's vibrato target: four even pulses a beat at 80.

**Scope:** Sax mode, alto scene. No embouchure, reed, overtone, subtone or intonation work (none of it exists on the AE-20, see round 1, section 1). Altissimo is out of scope. Breath work is reframed as dynamic control, which the app can score.

**How long at 30 minutes a day:** 18 to 24 months. The owner already reads treble clef from piano, so Levels 1 to 2 move faster than a school band beginner (3 to 4 weeks each instead of a term). Levels 9 to 11 are the slow part: all-key technique and improvising take most learners a year on their own. At 60 to 90 minutes a day, about 12 to 15 months.

| Level | Title | Weeks at 30 min | Range (written, alto) |
|---|---|---|---|
| 1 | First notes, left hand | 3 to 4 | G4 to C5, then E4 to C5 |
| 2 | Down to low C, first carols | 4 | C4 to C5, F#4, Bb4 |
| 3 | The octave key and the break | 6 | C4 to C6 |
| 4 | Full low register, first riffs | 6 to 8 | Bb3 to C6 |
| 5 | The blues | 8 | Bb3 to C6 |
| 6 | Minor keys and swing | 8 to 10 | Bb3 to C#6 |
| 7 | Palm keys and the top, sax pop hits | 8 | Bb3 to F#6 |
| 8 | Breath, dynamics and vibrato (Teal) | 8 to 10 | full |
| 9 | Technique in all keys (Klosé, Universal Method) | 10 to 12 | full |
| 10 | Jazz heads and blues improvisation (Aebersold, Omnibook) | 12 to 16 | full |
| 11 | Grade 5 capstone: Ferling and a recital | 8 to 12 | full |

### The transposition rule (read before Level 1)

- The app grades **written** pitch, and Song Studio's MusicXML import ignores the `<transpose>` tag (`packages/music-core/src/io/musicxml.ts`), so an imported alto part arrives at written pitch. The AE-20 sends **concert** notes over USB once transpose is set (round 1, section 2). So until the transposition setting ships (section 4, item 1): **keep the alto scene's sound but set Transpose to C while practising in the app.** You finger exactly what the score shows, and the app hears the same notes. You will sound a major sixth higher than a real alto; switch back to Eb only to play along with recordings or other people.
- **Alto parts** (most of the shelves): finger as written.
- **Tenor parts** (marked "tenor"): on the AE-20, select a tenor scene (Bb) for recordings, or keep Transpose C in the app; finger as written either way. This is a real advantage of the AE-20: any sax part works without rewriting.
- **Concert parts** (Real Book, lead sheets, marked "concert"): either finger them as written with Transpose C (simplest, and the app agrees), or use MuseScore's Transpose button or MuseScore Studio to make an Eb part. Import MusicXML (.mxl), not MIDI: MIDI exports are concert pitch.
- **Jam backings** are concert. Until the setting ships, set Jam's `transpose` so the backing is in the alto key you are fingering (alto D blues: backing in D), which is the same music a sixth away.

### Score types
"(C)" is a free community score. "(O)" is an Official score (ArrangeMe or Hal Leonard), shown on MuseScore but paid per score or through a Pro+ subscription. Community scores are preferred where a good one exists; Official ones are listed where the community has nothing solo for alto at the right level. FabioAltoSax scores are his own versions ("RMX"), close to the record but with his ornaments; they come with paid backing tracks.

## 2. The path

Drill names refer to the app's routes: `aerophone?mode=...` (ten modes; the skill modes take `scale`, `key` as pitch class 0 to 11, `perBeat`, `tongue`, `pair`, `trill`, `vib`), `phrases?phrase=aerophone.<id>`, `jam?progression=blues|minor-ii-v-i|modal|ii-v-i&transpose=n`, `licks?lick=n&key=X`, `reading`, `rhythm`, `ear/<drill>`, Song Studio (import from MuseScore, wait and performance modes, loop a spot). "Check" means the mode with no fingering shown; step thresholds count Check runs only unless the step says Practice.

---

### Level 1. First notes, left hand (3 to 4 weeks)

**Goal:** five left-hand notes, steady air, a tongued start on every note, eight first tunes. Rubank and the Roland Lesson app start the same way (B A G, then C, then the right hand).

| # | Step | Drill and setup | Done means | Feeds |
|---|---|---|---|---|
| 1.1 | Set up the AE-20 | NEW calibration (section 4, item 4): Sax mode, alto scene, Transpose C, breath floor and ceiling, key check | Written G4 shows as G4 in the app; breath trace reaches f without clipping | everything |
| 1.2 | G A B | `aerophone?mode=fingering&lesson=g-a-b`, Practice then Check | 3 clean Check runs, on 2 days | Hot Cross Buns, Mary |
| 1.3 | First long tones | `aerophone?mode=long-tone&level=mf&seconds=3`, then `seconds=5` | 3 runs at 80% in band, on 2 days | all |
| 1.4 | Tongue every note | `aerophone?mode=articulation&style=staccato`, 70 BPM | 80% on 2 runs | all |
| 1.5 | First tunes from the app | `phrases?phrase=aerophone.hot-cross-buns`, then `aerophone.au-clair`, `aerophone.lightly-row` | 80% at the phrase tempo, each | shelf 1 to 4 |
| 1.6 | Add C5 | `aerophone?mode=fingering&lesson=g-to-c` | 3 clean Check runs | Lightly Row, Twinkle |
| 1.7 | Right hand: E F G | `aerophone?mode=fingering&lesson=e-f-g` | 3 clean Check runs | Ode to Joy, Frère Jacques |
| 1.8 | Note names on the staff | `reading` flashcards, treble G4 to C5 then E4 to C5 (fast for a pianist) | 20 in a row under 2 s each | reading |
| 1.9 | Quarter, half, whole notes and rests | `rhythm?mode=pulse&pattern=quarters` | 90% on 2 runs | all |
| 1.10 | First Song Studio import | Import one shelf song (.mxl), wait mode, then performance | 85% in performance mode at the score tempo | shelf |

**Song shelf, Level 1** (pick any 3)

| Song | Teaches | Key, tempo, technique | Diff | MuseScore score | Fallback |
|---|---|---|---|---|---|
| Hot Cross Buns (trad.) | B A G, steady quarters | about 90 | 1 | [alto, Kevin Busse (O)](https://musescore.com/user/97106398/scores/16638700) | app phrase `aerophone.hot-cross-buns`; [8notes alto sax](https://www.8notes.com/alto_saxophone/) |
| Mary Had a Little Lamb (trad.) | B A G plus D, repeated notes | about 100 | 1 | [alto, Wesley S. Silva (O)](https://musescore.com/user/97106398/scores/21104887) | 8notes alto sax |
| Au clair de la lune (trad.) | G A B C, half notes | about 90 | 1 | [alto duet, NaomiAeba (C)](https://musescore.com/user/1042611/scores/566491), play part 1 | app phrase `aerophone.au-clair` |
| Lightly Row (trad.) | five notes, leaps of a third | about 100 | 1 | [alto, kyriceb57 (C)](https://musescore.com/user/81181573/scores/32204462) | app phrase `aerophone.lightly-row`; Essential Elements Book 1 |
| Twinkle Twinkle Little Star (trad.) | leap of a fifth, steady air | about 90 | 2 | [alto duet, NaomiAeba (C), 4.9 stars](https://musescore.com/user/1042611/scores/588346) | 8notes alto sax |
| Ode to Joy (Beethoven) | stepwise, dotted rhythm at the end | about 100 | 2 | [alto easy, Wesley S. Silva (O)](https://musescore.com/user/97106398/scores/18820885) | app phrase `aerophone.ode-to-joy`; IMSLP |
| Frère Jacques (trad.) | right hand E F G, eighth notes | about 100 | 2 | [alto in C with chords, MissoRB (O)](https://musescore.com/user/97106398/scores/25362073) | 8notes alto sax |
| Go Tell Aunt Rhody (trad.) | five notes, ties | about 100 | 2 | [alto with fingering chart, Martin Freres (O)](https://musescore.com/user/97106398/scores/36084296) | Rubank Elementary |

**Boss:** two shelf songs at their tempo, 85% in Song Studio performance mode, plus a 5 s mf long tone at 80% in band.

---

### Level 2. Down to low C, first carols (4 weeks)

**Goal:** the low octave C4 to C5 with F#4 and Bb4, 3/4 time, ties and dotted quarters, slurring two notes.

| # | Step | Drill and setup | Done means | Feeds |
|---|---|---|---|---|
| 2.1 | Low C D E | `aerophone?mode=fingering&lesson=c-d-e` | 3 clean Check runs, 2 days | Amazing Grace, Silent Night |
| 2.2 | C to G | `aerophone?mode=fingering&lesson=c-to-g` | 3 clean Check runs | Saints, Jingle Bells |
| 2.3 | C major, low octave | `aerophone?mode=fingering&lesson=c-major` | 3 clean Check runs at 80 BPM | Joy to the World |
| 2.4 | F# and Bb | NEW: fingering mode with a chosen note set (S; section 4, item 12). Meanwhile Practice runs of `lesson=g-major` and `lesson=f-major` stopping at C5 | 20 correct F#4 and Bb4 in a row | Simple Gifts, Scarborough Fair |
| 2.5 | Low long tones, soft | `aerophone?mode=long-tone&level=p&target=60&seconds=5` | 3 runs at 75% in band | all ballads |
| 2.6 | Slur two, tongue two | `aerophone?mode=tonguing&tongue=slur2-tongue2`, 70 BPM | 80%, 2 runs | carols |
| 2.7 | 3/4, ties and dotted quarters | `rhythm` reading level with dotted quarters | 90%, 2 runs | Amazing Grace, Silent Night |
| 2.8 | A tune from memory | `phrases?phrase=aerophone.ode-to-joy`, notes hidden | 90% at phrase tempo | Ode to Joy |
| 2.9 | Two shelf songs in Song Studio | wait mode, then performance | 85% at score tempo | shelf |

**Song shelf, Level 2** (pick any 3)

| Song | Teaches | Key, tempo, technique | Diff | MuseScore score | Fallback |
|---|---|---|---|---|---|
| When the Saints Go Marching In (trad.) | pickups, ties, C to G | about 110 | 1 | [alto with chords, Billie Feynman (O)](https://musescore.com/user/97106398/scores/26019544) | 8notes alto sax; Essential Elements Book 1 |
| Jingle Bells (Pierpont) | repeated notes, C to G | about 120 | 1 | [alto solo, Fabio Britto (O)](https://musescore.com/user/97106398/scores/17003542) | 8notes alto sax |
| Amazing Grace (Newton) | 3/4, low C, ties, slurs | about 80 | 1 | [alto, easy key of C, Kevin Busse (O)](https://musescore.com/user/97106398/scores/16642099) | 8notes alto sax |
| Silent Night (Gruber) | 6/8 or 3/4, dotted rhythm, soft air | about 70 | 2 | [alto, easy key of C, Kevin Busse (O)](https://musescore.com/user/97106398/scores/16655461) | IMSLP; 8notes |
| Joy to the World (Handel) | a descending C major scale | about 100 | 2 | [alto, Kevin Busse (O)](https://musescore.com/user/97106398/scores/16637050) | 8notes alto sax |
| Deck the Halls (Welsh trad.) | eighth-note runs, fa-la-la slurs | about 110 | 2 | [alto, Benzaiten Editions (O)](https://musescore.com/user/97106398/scores/19184014) | 8notes alto sax |
| Happy Birthday (Hill) | 3/4, leap of an octave at the top | about 100 | 2 | [alto, axelhasnoacc1 (C)](https://musescore.com/user/81346087/scores/22388977) | any fake book |
| Simple Gifts (Shaker tune) | F#, stepwise phrasing | about 90 | 2 | [alto and piano, James Smith (O)](https://musescore.com/user/97106398/scores/30921464) | 8notes; Copland's Appalachian Spring theme |
| Scarborough Fair (English trad.) | Dorian, 3/4, long phrases | about 90 | 3 | [alto, Glauco Fernandes (O)](https://musescore.com/user/97106398/scores/18726889) | [alto and harp, josdo (C)](https://musescore.com/user/35613/scores/1535346) |

**Boss:** one carol and one folk tune from the shelf at tempo, 85% in performance mode; C major low octave clean in Check at 80.

---

### Level 3. The octave key and the break (6 weeks)

**Goal:** D5 to C6 with the octave key; C, G and F major over a full octave; long tones at four dynamic levels; first pop and film melodies.

| # | Step | Drill and setup | Done means | Feeds |
|---|---|---|---|---|
| 3.1 | The octave key | `aerophone?mode=fingering&lesson=octave` | 3 clean Check runs | all |
| 3.2 | Across the break | `aerophone?mode=register&pair=cs5-d5`, 60 then 80 BPM | 0 glitches at 80 on 2 runs | all |
| 3.3 | More crossings | `pair=c5-d5`, `pair=d4-d5`, `pair=g4-g5` | 0 glitches at 80, each | Danny Boy, Hallelujah |
| 3.4 | G and F major | `lesson=g-major`, `lesson=f-major` | 3 clean Check runs each | shelf |
| 3.5 | Scales on the click | `aerophone?mode=scales&scale=major&key=0&perBeat=1` at 100 (grade 1), then `key=7`, `key=5` | 90% each key, 2 days | shelf |
| 3.6 | First arpeggios | `scale=major-arpeggio`, keys 0, 7, 5 | 90% at 100 | Stand by Me |
| 3.7 | Four dynamic levels | `mode=long-tone&level=pp`, `p`, `mf`, `f`, 5 s | 3 runs at 80% per level | ballads |
| 3.8 | First swell | `mode=swell&swellSeconds=6` | 3 runs at 75% | Danny Boy |
| 3.9 | Morning Mood | `phrases?phrase=aerophone.morning-mood` (6/8) | 85% at phrase tempo | Morning Mood |
| 3.10 | Echo by ear | `ear/` melodic dictation, levels `anchor` then `major-pentachord`, answered on the AE-20 | 80% on 2 runs | ear (cross-link) |

**Song shelf, Level 3** (pick any 3)

| Song | Teaches | Key, tempo, technique | Diff | MuseScore score | Fallback |
|---|---|---|---|---|---|
| Tequila (The Champs) | three-note riff, the shout, rests | fast, about 170 | 1 | [alto, FabioAltoSax (C), 41 ratings](https://musescore.com/user/28815610/scores/5106814) | [alto, Kevin Busse beginner (O)](https://musescore.com/user/97106398/scores/16643410) |
| Stand by Me (Ben E. King) | bass-line melody, syncopation | about 118 | 1 | [alto solo, josiphel (C), 70 ratings](https://musescore.com/user/13897826/scores/3042666) | Hal Leonard alto play-along (O) |
| Auld Lang Syne (Scottish trad.) | 4/4 dotted rhythm, octave leaps | about 80 | 1 | [alto, Cadenza Editions (O)](https://musescore.com/user/97106398/scores/18721303) | 8notes alto sax |
| O Come All Ye Faithful (Wade) | crossing the break in a hymn | about 90 | 1 | [alto, ruthsax (C)](https://musescore.com/user/35051857/scores/8979665) | 8notes alto sax |
| Greensleeves (English trad.) | minor feel, 3/4, high E | about 100 | 2 | [alto, jimirock98 (C)](https://musescore.com/user/62652/scores/80804) | IMSLP; 8notes |
| Can't Help Falling in Love (Elvis) | long notes, 12/8 feel | slow | 2 | [alto beginner, Lkmusic (O)](https://musescore.com/user/97106398/scores/23583481) | [sax quartet, Max Gray (C)](https://musescore.com/user/14924086/scores/5587610), play the alto part |
| Hallelujah (Leonard Cohen) | 6/8, phrase shape, soft dynamics | about 56 dotted quarter | 2 | [alto, cobbchristian (C)](https://musescore.com/user/33000781/scores/5739676) | [alto, Hal Leonard (O)](https://musescore.com/user/39593079/scores/15538558) |
| Danny Boy (Londonderry Air) | the octave leap to the top, swells | slow | 2 | [solo alto, K Kobayashi (C)](https://musescore.com/user/32009255/scores/24703942) | [alto, Kevin Busse (O)](https://musescore.com/user/97106398/scores/16639966) |
| Morning Mood (Grieg) | 6/8, crossing the break in thirds | about 60 dotted quarter | 2 | [alto level 1 with chords, Rodrigo Faleiros (O)](https://musescore.com/user/97106398/scores/19386856) | app phrase `aerophone.morning-mood`; IMSLP |
| He's a Pirate (Pirates of the Caribbean) | fast 6/8, tonguing | fast 6/8 | 3 | [alto beginner, Benzaiten Editions (O)](https://musescore.com/user/97106398/scores/17478460) | Hal Leonard movie themes for alto |

**Boss:** two shelf songs at tempo (one pop, one folk or film) at 85%; C, G, F major at grade 1 speed in Check, 90%; cs5 to d5 crossing with 0 glitches at 80.

---

### Level 4. Full low register, first riffs (6 to 8 weeks)

**Goal:** down to low Bb3 with the left pinky table and the right pinky Eb, Bb and D major, eighth notes at real tempos, staccato versus legato, the first sax riffs people know.

| # | Step | Drill and setup | Done means | Feeds |
|---|---|---|---|---|
| 4.1 | Bb and D major | `lesson=bb-major`, `lesson=d-major` | 3 clean Check runs each | Night Train, Peter Gunn |
| 4.2 | The pinky table | NEW: slide pairs C#4 to B3, B3 to Bb3, Eb4 to C4 in the register drill (S; section 4, item 12) | 0 glitches at 70 | Peter Gunn |
| 4.3 | Five major keys on the click | `mode=scales&scale=major`, keys 0, 7, 5, 10, 2 at 100 | 90% each | shelf |
| 4.4 | Eighths: grade 3 speed | same five keys, `perBeat=2` at 72 | 90% on 3 keys | Epic Sax Guy |
| 4.5 | Staccato and legato | `mode=articulation&style=staccato`, then `legato`, 90 then 110 BPM | 80% each at 110 | riffs |
| 4.6 | Tonguing eighths | `mode=tonguing&tongue=all-tongued`, then `tongue2-slur2`, 90 BPM | 85% each | riffs |
| 4.7 | First trills | `mode=trills&trill=g4-a4`, `a4-b4`, `f4-g4` | 4 a second, evenness 0.7 | finger speed |
| 4.8 | Chromatic, low octave | `mode=scales&scale=chromatic&key=0` at 80, `perBeat=1` | 90% | Pink Panther (L6) |
| 4.9 | First riffs from the app | `phrases?phrase=aerophone.honk-riff` | 90% at tempo | Night Train |
| 4.10 | Riff loops in Song Studio | Epic Sax Guy riff looped at 70%, 85%, 100% tempo | 3 clean loops at 100% | shelf |
| 4.11 | Read eighths at sight | `reading` sight-reading, Aerophone, level with eighths | 80% first try on 3 lines | reading |

**Song shelf, Level 4** (pick any 3)

| Song | Teaches | Key, tempo, technique | Diff | MuseScore score | Fallback |
|---|---|---|---|---|---|
| Epic Sax Guy (Run Away, SunStroke Project) | one repeated riff, tonguing at speed | about 130 | 1 | [alto, TheTrollexis (C), 100 ratings](https://musescore.com/user/126631/scores/860651) | YouTube lesson; midishow MIDI |
| Peter Gunn (Mancini) | low-register riff, steady eighths, low C and D | about 120 | 1 | [alto, Hal Leonard (O)](https://musescore.com/user/39593079/scores/15830665) | [bari sax solo, cale (C)](https://musescore.com/user/19476471/scores/5048757), read as alto (both Eb) |
| Jingle Bell Rock (Bobby Helms) | swing-ish eighths, chromatic slides | about 120 | 1 | [Eb alto, WhimBlaster (C)](https://musescore.com/user/32941964/scores/10304893) | [alto, Hal Leonard (O)](https://musescore.com/user/39593079/scores/15738349) |
| La Bamba (Ritchie Valens) | riff on I IV V, offbeat tonguing | about 150 | 1 | [alto, dabokoh (C)](https://musescore.com/user/27793893/scores/5014137) | [alto, Hal Leonard (O)](https://musescore.com/user/39593079/scores/15738376) |
| What a Wonderful World (Armstrong) | long phrases, low register warmth | about 70 | 2 | [alto, FabioAltoSax (C), 82 ratings](https://musescore.com/user/28815610/scores/10478014) | [alto, Kevin Busse (O)](https://musescore.com/user/97106398/scores/16647565) |
| Hey Jude (Beatles) | singing line, the na-na coda | about 74 | 2 | [alto beginner, Leo Silva (O)](https://musescore.com/user/97106398/scores/16366093) | Hal Leonard Beatles for alto |
| Game of Thrones theme (Djawadi) | 3/4, minor, dotted rhythm | about 160 in 3/4 | 2 | [alto beginner, Kevin Busse (O)](https://musescore.com/user/97106398/scores/16646563) | [sax quartet, Andrea Mancuso (C)](https://musescore.com/user/1947571/scores/3253871), alto part |
| Night Train (Jimmy Forrest) | blues riff, shuffle feel, low Bb | about 120 shuffle | 2 | [alto, Hal Leonard (O)](https://musescore.com/user/39593079/scores/15831262) | Aebersold blues tracks; app `aerophone.honk-riff` |
| Who Can It Be Now? (Men at Work) | the hook and short solo | about 128 | 3 | [tenor melody and solo, PlonkerOfScotland (C), 149 ratings](https://musescore.com/user/27862653/scores/5469991) (tenor scene) | [alto, Jorge Juárez (O)](https://musescore.com/user/97106398/scores/17231629) |
| Dancing in the Dark, outro solo (Springsteen, Clemons) | long notes, simple pentatonic solo | about 149 | 3 | [tenor sax solo transcription, seancmix (C)](https://musescore.com/user/11800821/scores/8452115) (tenor scene) | midishow MIDI |

**Boss:** two riffs at full record tempo, 85% in performance mode (one with low C or below); five major keys at grade 3 speed; staccato and legato at 110 at 80%.

---

### Level 5. The blues (8 weeks)

**Goal:** hear and count the 12-bar form, play the blues scale and minor pentatonic in the two jazz blues keys (alto D and G, which are concert F and Bb), learn four blues heads by memory, and improvise from week one, as Aebersold Vol. 1 does.

| # | Step | Drill and setup | Done means | Feeds |
|---|---|---|---|---|
| 5.1 | Hear the form | `jam?progression=blues` listening, count bars aloud; `ear/progressions` | name the IV bar and the turnaround on 5 of 5 tracks | all |
| 5.2 | Roots on 1, 4, 5 | `ear/follow-the-bass` (roots-primary) | 80% on 2 runs | improvising |
| 5.3 | Blues scale, from the app | `phrases?phrase=aerophone.c-blues-scale`, then `aerophone.g-blues-lick` | 90% at tempo | heads |
| 5.4 | Blues and pentatonic in alto D and G | NEW: `blues` and `minor-pentatonic` in the Aerophone scale list (S; section 4, item 7) | 90% at 100, two octaves where the range allows | improvising |
| 5.5 | Minor pentatonic phrase | `phrases?phrase=aerophone.e-minor-pentatonic` | 90% at tempo | Cantaloupe Island |
| 5.6 | Two heads by memory | Song Studio, notes hidden after 3 runs | 85% from memory, 2 days | Sonnymoon, Blue Monk |
| 5.7 | Call and response | NEW blues call and response (M; section 4, item 6): app plays 2 bars, you echo | 80% echoes on 2 choruses | improvising |
| 5.8 | First choruses | `jam?progression=blues&transpose=` to alto D, 100 BPM, 3 choruses: stay in the scale, land on the root at bars 1, 5, 9 | recorded take, self-check: no lost bars, 3 choruses (NEW grader, section 4, item 6) | boss |
| 5.9 | Register work for blues | `mode=register&pair=b4-e5`, `pair=a4-d5` | 0 glitches at 90 | heads |
| 5.10 | Listen to swing | Aebersold Vol. 1 track or a Rollins record, tap the off-beats with `rhythm` | swing 8ths heard, not scored | Level 6 |

**Song shelf, Level 5** (pick any 3; at least two blues)

| Song | Teaches | Key (concert, alto), tempo | Diff | MuseScore score | Fallback |
|---|---|---|---|---|---|
| C Jam Blues (Ellington) | a two-note head, space | C, alto A; about 130 swing | 1 | [alto beginner, Katrin Scherer (O)](https://musescore.com/user/97106398/scores/18088783) | [Real Book, concert (O)](https://musescore.com/user/39593079/scores/15958057); Real Book Eb edition |
| Sonnymoon for Two (Rollins) | blues riff head, blue notes | Bb, alto G; 100 to 160 swing | 1 | [alto, theeggest (C), 4.9 stars](https://musescore.com/user/34952750/scores/6378598) | Aebersold Vol. 8 (Sonny Rollins) |
| Blue Monk (Monk) | chromatic approach, half steps | Bb, alto G; about 110 | 1 | [alto 1, mdgarrett (C), 29 ratings](https://musescore.com/user/16157716/scores/5957798) | [alto, Katrin Scherer (O)](https://musescore.com/user/97106398/scores/18088825) |
| Bags' Groove (Milt Jackson) | blues riff with turn, swing | F, alto D; about 140 | 2 | [tenor solo part, leomask (C)](https://musescore.com/user/27574/scores/51276) (tenor scene) | [Real Book, concert (O)](https://musescore.com/user/39593079/scores/16029604) |
| Tenor Madness (Rollins) | a blues head in two-bar cells | Bb, alto G; play at 120 | 2 | [Real Book, concert (O)](https://musescore.com/user/39593079/scores/15956131) | Aebersold Vol. 8; Real Book Eb |
| Watermelon Man (Hancock) | 16-bar blues, straight-8 funk | F, alto D; about 130 | 2 | [alto, Tunescribers (O)](https://musescore.com/user/97106398/scores/19293271) | Real Book Eb |
| Cantaloupe Island (Hancock) | modal minor, pentatonic | F minor, alto D minor; about 112 | 2 | [alto, FabioAltoSax RMX (C), 35 ratings](https://musescore.com/user/28815610/scores/8357799) | [alto and piano, Ivan Marini (O)](https://musescore.com/user/97106398/scores/18583312) |
| Hit the Road Jack (Percy Mayfield, Ray Charles) | minor descending riff, call and response | A minor; about 170, start at 120 | 2 | [alto and piano, GlebSechin (C), 50 ratings](https://musescore.com/user/28941838/scores/5155740) | [alto, Nathan Kersey-Wilson (O)](https://musescore.com/user/97106398/scores/18958327) |
| Mercy, Mercy, Mercy (Zawinul) | gospel backbeat, long tones | Bb, alto G; about 72 | 3 | [alto and piano, Sidnei Borgani (O)](https://musescore.com/user/97106398/scores/19530787) | Real Book Eb |

**Boss:** two blues heads by memory at 120, then 3 improvised choruses over `jam?progression=blues` at 100 with no lost bars; blues scale in alto D and G at 90%.

---

### Level 6. Minor keys and swing (8 to 10 weeks)

**Goal:** natural and harmonic minor in A, E, D, G and B (written); Dorian; swing eighths in the Niehaus way (off-beats tongued and slurred into the beat, accents on the off-beat, ghosted notes); syncopation; first standards and bossas.

| # | Step | Drill and setup | Done means | Feeds |
|---|---|---|---|---|
| 6.1 | Natural minor | `mode=scales&scale=natural-minor`, keys 9, 4, 2, 7, 11 at 72, `perBeat=2` | 90% each | Autumn Leaves |
| 6.2 | Harmonic minor | `scale=harmonic-minor`, same keys | 90% each | Moanin', Bésame Mucho |
| 6.3 | Minor arpeggios | `scale=minor-arpeggio`, same keys | 90% at 100 | heads |
| 6.4 | Swing articulation | NEW swing articulation drill (S to M; section 4, item 5): "doo-DAH", off-beat tongued, slur into the beat, swing ratio scored | 80% at 120 on 2 days | all |
| 6.5 | Niehaus on scales | same drill on G, C, F major scales and the blues scale | 80% at 140 | heads |
| 6.6 | Syncopation reading | `rhythm` reading levels with ties across the beat | 90% on 2 runs | St. Thomas, Ipanema |
| 6.7 | Dorian over a vamp | `jam?progression=modal`, 2 minutes, D Dorian written | recorded take, no lost bars | So What (L10) |
| 6.8 | Major or minor by ear | `ear/scales-and-modes` | 85% | ear (cross-link) |
| 6.9 | ii-V in minor | `jam?progression=minor-ii-v-i`, play the arpeggios, then `phrases?phrase=aerophone.ii-v-i` | 85% on the phrase | Autumn Leaves, Blue Bossa |
| 6.10 | Two heads with swing | Song Studio performance mode on a swing head | 85% at 140 | boss |

**Song shelf, Level 6** (pick any 3; one swing, one bossa or Latin)

| Song | Teaches | Key (concert, alto), tempo | Diff | MuseScore score | Fallback |
|---|---|---|---|---|---|
| Autumn Leaves (Kosma) | ii-V in major and minor, swing quarters | G minor, alto E minor; about 120 | 1 | [alto, Nino Veleno (C)](https://musescore.com/user/34918629/scores/6122797) | [alto, Hal Leonard (O)](https://musescore.com/user/39593079/scores/15692698); Real Book Eb |
| Summertime (Gershwin) | minor blues feel, long notes, bends | slow swing | 1 | [alto, Neotaxi (C), 352 ratings](https://musescore.com/user/2616406/scores/949971) | [alto, Kevin Busse (O)](https://musescore.com/user/97106398/scores/16643785) |
| Fly Me to the Moon (Bart Howard) | circle-of-fifths melody, swing | C, alto A; about 120 | 1 | [alto, H3R0 (C), 33 ratings](https://musescore.com/user/28018509/scores/10368853) | [alto beginner, Heisenberg (O)](https://musescore.com/user/97106398/scores/19076134) |
| Doxy (Rollins) | first standard changes, swing | Bb, alto G; about 130 | 1 | [Real Book, concert (O)](https://musescore.com/user/39593079/scores/15957379) | Aebersold Vol. 8 |
| The Pink Panther (Mancini) | chromatic lines, swing, accents | minor; about 116 | 2 | [alto, Noah Mattoon (C), 116 ratings](https://musescore.com/user/26790789/scores/5519902) | [alto beginner, Kevin Busse (O)](https://musescore.com/user/97106398/scores/16634830) |
| The Girl from Ipanema (Jobim) | bossa, straight eighths, the bridge | F, alto D; about 130 | 2 | [alto, krazyness (C)](https://musescore.com/user/35984033/scores/12318415) | [alto beginner, Leo Silva (O)](https://musescore.com/user/97106398/scores/16214410) |
| Bésame Mucho (Velázquez) | harmonic minor, bolero, long phrases | minor; about 80 | 2 | [alto, Jarell Majestuoso (C), 259 ratings](https://musescore.com/user/17602056/scores/5967716) | [alto beginner, Lkmusic (O)](https://musescore.com/user/97106398/scores/19379245) |
| St. Thomas (Rollins) | calypso, tongued syncopation | C, alto A; 190 on record, play at 120 | 2 | [alto, eavs pierson (C)](https://musescore.com/user/12891191/scores/3681616) | [alto and piano, Nick Lacanski (O)](https://musescore.com/user/97106398/scores/16832752); Aebersold Vol. 8 |
| Moanin' (Bobby Timmons) | call and response, minor, blue notes | F minor, alto D minor; about 125 | 3 | [Eb alto part, rogerrafaelro (C), 30 ratings](https://musescore.com/user/33848897/scores/6307530) | Real Book Eb |
| Blue Bossa (Kenny Dorham) | minor ii-V and a key shift | C minor, alto A minor; about 140 bossa | 3 | [lead sheet, concert, Dick Schmitt (C), 76 ratings](https://musescore.com/user/498481/scores/7467650) | [Bb lead sheet, rjmcdonald27 (C)](https://musescore.com/user/42390803/scores/15193117) (tenor scene); Aebersold Vol. 54 |

**Boss:** one swing head at 140 and one bossa or Latin head at tempo, both 85% in performance mode; swing articulation drill 80% at 140; A, E, D minor harmonic at 90%.

---

### Level 7. Palm keys and the top, sax pop hits (8 weeks)

**Goal:** D6, Eb6, E6, F6 and F#6 (palm keys and front F); Eb, A, Ab and E major; two-octave scales where the horn allows; 16th notes at a moderate tempo; the famous sax solos.

| # | Step | Drill and setup | Done means | Feeds |
|---|---|---|---|---|
| 7.1 | The palm keys | NEW: chart D6 to F#6 (S; section 4, item 3), then `mode=fingering` lesson for D6 Eb6 E6 F6 | 3 clean Check runs | Baker Street |
| 7.2 | Into and out of the palm keys | NEW register pairs C#6 to D6, B5 to D6, D6 to F6 (S) | 0 glitches at 80 | Careless Whisper |
| 7.3 | Soft high notes | `mode=long-tone&level=p&target=86` (D6) and 89 (F6) | 75% in band | ballads |
| 7.4 | Eb major | `lesson=eb-major` | 3 clean Check runs | shelf |
| 7.5 | Four new keys | `mode=scales&scale=major`, keys 3, 9, 8, 4 at 72, `perBeat=2` | 90% each | shelf |
| 7.6 | Two octaves | NEW range option for `scales` (S; section 4, item 8): Bb3 to F6, keys C, D, Eb, F | 90% at 72 | shelf |
| 7.7 | Two-octave arpeggios | same option, `scale=major-arpeggio` | 90% at 80 | Just the Two of Us |
| 7.8 | 16ths, first steps | `scale=major`, keys 0, 7, 5, `perBeat=4` at 50, then 60 | 90% at 60 | Careless Whisper run |
| 7.9 | Trills across the break | `mode=trills&trill=c5-d5`, `b4-c5` | 4 a second, evenness 0.7 | ornaments |
| 7.10 | A famous riff at tempo | Song Studio loop of the Baker Street riff, 70% to 100% | 3 clean loops at 100% | Baker Street |

**Song shelf, Level 7** (pick any 3; at least one that reaches F6)

| Song | Teaches | Key, tempo, technique | Diff | MuseScore score | Fallback |
|---|---|---|---|---|---|
| Mr. Saxobeat (Alexandra Stan) | one riff, palm D and E | about 127 | 1 | [alto, FabioAltoSax (C), 68 ratings](https://musescore.com/user/28815610/scores/8314034) | [alto beginner, Ivan Marini (O)](https://musescore.com/user/97106398/scores/19518283) |
| Gonna Fly Now (Rocky, Bill Conti) | fanfare, high register, accents | about 96 | 1 | [alto, curveoftheearth (C)](https://musescore.com/user/2723/scores/26298) | [alto beginner, Ivan Marini (O)](https://musescore.com/user/97106398/scores/17370109) |
| Skyfall (Adele) | minor ballad, top of the staff | C minor; about 76 | 1 | [alto with rhythm section, smithjfay (C), 42 ratings](https://musescore.com/user/27359852/scores/5380381) | [alto beginner, Kevin Busse (O)](https://musescore.com/user/97106398/scores/16659244) |
| Uptown Funk (Mark Ronson, Bruno Mars) | funk 16ths, short notes | about 115 | 2 | [alto, FabioAltoSax RMX (C)](https://musescore.com/user/28815610/scores/8593781) | [alto beginner, Kevin Busse (O)](https://musescore.com/user/97106398/scores/16651720) |
| Baker Street (Gerry Rafferty) | the riff to F6, legato over the break | about 115 | 2 | [alto, Hein Huijskes (C), 670 ratings](https://musescore.com/user/15680076/scores/5399962), "almost exactly like the original" | [alto, Hal Leonard (O)](https://musescore.com/user/39593079/scores/15513901) |
| Smooth Operator (Sade) | smooth phrasing, ghost notes | about 120 | 2 | [alto, FabioAltoSax RMX (C), 68 ratings](https://musescore.com/user/28815610/scores/6607681) | [alto, Martin Stolz (O)](https://musescore.com/user/97106398/scores/22532701) |
| Just the Two of Us (Grover Washington Jr.) | smooth jazz, the Db-C-Fm chain | F minor feel; about 96 | 2 | [alto, FabioAltoSax (C), 237 ratings](https://musescore.com/user/28815610/scores/6614898) | [alto, Hal Leonard (O)](https://musescore.com/user/39593079/scores/15830656) |
| Careless Whisper (George Michael, Steve Gregory) | the 16th run, long notes, palm keys | D minor, alto B minor; about 77 | 3 | [alto, Hal Leonard (O), 216 ratings](https://musescore.com/user/39593079/scores/15738802); no good free alto score found | [midishow MIDI](https://www.midishow.com/en/midi/40781.html), import the lead track |
| Your Latest Trick (Dire Straits) | sax intro, wide range, 4 sharps | slow; about 74 | 3 | [alto and soprano, sharer.wayne (C), 33 ratings](https://musescore.com/user/37939148/scores/8317514) | [alto, FabioAltoSax RMX (C), in B major](https://musescore.com/user/28815610/scores/7095661) |

**Boss:** Baker Street riff and one other shelf song at record tempo, 85% in performance mode; Eb, A and E major at 72 two a click; D6 to F6 crossings with 0 glitches at 80.

---

### Level 8. Breath, dynamics and vibrato, after Teal (8 to 10 weeks)

**Goal:** control the dynamic in every register, shape phrases with planned breaths, and a Teal-method vibrato (pulses timed to a click) used on long notes of ballads. This is where the Aerophone can beat a sax teacher: breath and pulse rate are measured.

| # | Step | Drill and setup | Done means | Feeds |
|---|---|---|---|---|
| 8.1 | Messa di voce | `mode=swell&swellSeconds=8` on low, middle and palm notes | 3 runs at 75% in each register | ballads |
| 8.2 | Long-tone scale | NEW long-tone scale (S; section 4, item 11): each note of a scale held 4 beats at one level | p and f, 80% in band, two keys | Ferling |
| 8.3 | Dynamic terraces | `mode=long-tone`, pp then p then mf then f on one note, 5 s each | 80% each | Harlem Nocturne |
| 8.4 | Vibrato, two a beat | `mode=vibrato&vib=2-at-60` | rate within ±15%, evenness 0.6, 3 runs | ballads |
| 8.5 | Three, then four a beat | `vib=3-at-60`, then `vib=4-at-60` | same, 3 runs each | ballads |
| 8.6 | The going rate | `vib=4-at-80` (Teal's target) | same, on 2 days | all |
| 8.7 | Vibrato in music | NEW: Song Studio scores held notes over a beat for 4 to 5 pulses a second (S; section 4, item 10) | 80% of held notes on one ballad | shelf |
| 8.8 | Breath marks and dynamics in a phrase | NEW phrase dynamics and breath marks (M; section 4, item 9). Meanwhile `mode=tonguing&tongue=phrase` | 80% | Ferling |
| 8.9 | Legato leaps | `mode=interval-landing`, fourths, fifths, octave over the drone | 85% landings | ballads |
| 8.10 | Intervals by ear | `ear/interval-size`, then `ear/interval-names` | 85% | ear (cross-link) |

**Song shelf, Level 8** (pick any 3)

| Song | Teaches | Key, tempo, technique | Diff | MuseScore score | Fallback |
|---|---|---|---|---|---|
| Moon River (Mancini) | 3/4, long arching lines | slow waltz | 1 | [alto and piano, Ponciano Hernandez (C), 104 ratings](https://musescore.com/user/28676984/scores/5089302) | [alto, Kevin Busse (O)](https://musescore.com/user/97106398/scores/16644151) |
| La vie en rose (Piaf) | dynamics, rubato | about 70 | 1 | [alto and piano, ashleybai0716 (C), 33 ratings](https://musescore.com/user/35067400/scores/10066654) | [alto, Hal Leonard (O)](https://musescore.com/user/39593079/scores/16047484) |
| Gabriel's Oboe (Morricone) | messa di voce, soft high notes | about 60 | 2 | [alto with piano, Michal Komb (C), 69 ratings](https://musescore.com/user/33906730/scores/6392807) | [alto, Hal Leonard (O)](https://musescore.com/user/39593079/scores/15947413) |
| Nuovo Cinema Paradiso (Morricone) | long phrases, breath planning | slow | 2 | [alto and piano, filipporomani (C), 144 ratings](https://musescore.com/user/34982192/scores/6240600) | [alto, Francisco Benitez (O)](https://musescore.com/user/97106398/scores/18229357) |
| Ave Maria (Bach and Gounod) | sustained line over arpeggios | slow | 2 | [alto and keyboard, Aquarius 2.02 (C), 136 ratings](https://musescore.com/user/8108371/scores/4029851) | IMSLP; [Schubert's Ave Maria, alto (O)](https://musescore.com/user/39593079/scores/15744091) |
| Georgia on My Mind (Carmichael) | blues ballad, vibrato on long notes | F; about 60 | 2 | [alto, FabioAltoSax (C)](https://musescore.com/user/28815610/scores/10484209) | [alto, Hal Leonard (O)](https://musescore.com/user/39593079/scores/15739018) |
| Harlem Nocturne (Earle Hagen) | the classic vibrato and slide study | minor; about 70 | 2 | [alto, bruno.werneck (C), 33 ratings](https://musescore.com/user/37217653/scores/19906483) | [lead sheet, alto and tenor, jakpott29 (C)](https://musescore.com/user/32294240/scores/10435651) |
| My Funny Valentine (Rodgers) | minor ballad, line cliché | C minor; slow | 2 | [alto, FabioAltoSax (C)](https://musescore.com/user/28815610/scores/10490029) | [alto, Katrin Scherer (O)](https://musescore.com/user/97106398/scores/18089125) |
| Europa (Santana) | long high notes, bends, vibrato | slow | 3 | [alto, FabioAltoSax (C), 91 ratings](https://musescore.com/user/28815610/scores/6607684) | [alto, Hal Leonard (O)](https://musescore.com/user/39593079/scores/16074427) |
| Misty (Erroll Garner) | ballad, chromatic chords, Eb | Eb; about 60 | 3 | [alto with solo transcription, FabioAltoSax (C), 318 ratings](https://musescore.com/user/28815610/scores/6620547) | [alto, Hal Leonard (O)](https://musescore.com/user/39593079/scores/15695092) |

**Boss:** one ballad from the shelf with vibrato on every note of a beat or longer, 85% in performance mode, plus messa di voce 8 s at 75% on a palm note; vibrato four a beat at 80 on 2 days.

---

### Level 9. Technique in all keys, after Klosé and the Universal Method (10 to 12 weeks)

**Goal:** every major key and the minors in all three forms over the full range, scales in thirds and broken chords, chromatic in 16ths, the tonguing patterns at speed; the busy sax tunes.

| # | Step | Drill and setup | Done means | Feeds |
|---|---|---|---|---|
| 9.1 | 12 major keys, full range | `mode=scales&scale=major`, keys 0 to 11 with the two-octave option, 72 two a click | 90% each, over a week | all |
| 9.2 | Melodic minor | NEW `melodic-minor` in the Aerophone scale list (S; section 4, item 7) | 90% in 6 keys | Ferling |
| 9.3 | All minor forms, 12 keys | natural, harmonic, melodic, 72 two a click | 90% in 12 keys | grade 5 |
| 9.4 | Scales in thirds | NEW interval patterns (S; section 4, item 7): thirds, then 1-2-3-1, then broken triads | 90% in 4 keys, then 12 | Klosé |
| 9.5 | Arpeggios, 12 keys | `scale=major-arpeggio`, `minor-arpeggio` | 90% each at 80 | Entertainer |
| 9.6 | Chromatic 16ths | `scale=chromatic`, full range, `perBeat=4` at 60 | 90% | Yakety Sax |
| 9.7 | Tonguing at speed | `mode=tonguing`, all five groupings, 16ths at 80 | 85% each | Pick Up the Pieces |
| 9.8 | Finger speed | `mode=trills`, all six pairs | 5 a second, evenness 0.7 | all |
| 9.9 | Grade 5 speed | `scale=major`, 12 keys, `perBeat=4` at 66 | 90% in 12 keys | boss |
| 9.10 | Keys around the circle | `circle` path drills for key signatures (cross-link), then 9.4 patterns in circle order | 12 keys in one sitting at 90% | Klosé |
| 9.11 | Sight-reading | `reading` sight-reading on the Aerophone, keys to 4 sharps and flats | 80% first try on 5 lines | grade 5 |

**Song shelf, Level 9** (pick any 3)

| Song | Teaches | Key, tempo, technique | Diff | MuseScore score | Fallback |
|---|---|---|---|---|---|
| Mission: Impossible (Lalo Schifrin) | 5/4, chromatic | about 165 in 5/4 | 1 | [alto, bradley4 (C)](https://musescore.com/user/292666/scores/270496) | [alto, Hal Leonard (O)](https://musescore.com/user/39593079/scores/15685999) |
| The Entertainer (Joplin) | ragtime syncopation, chromatic neighbours | about 80, 2/4 | 1 | [alto, rosariopedicini (C), 113 ratings](https://musescore.com/user/27881039/scores/4978434) | app phrase `aerophone.entertainer`; IMSLP |
| Superstition (Stevie Wonder) | 16th funk riff, ghost notes | about 100 | 1 | [alto, Anderson Quevedo (O)](https://musescore.com/user/97106398/scores/17762026) | [alto and trumpet duet, Matthew Jarrell (C)](https://musescore.com/user/92226244/scores/24474676) |
| In the Mood (Glenn Miller) | swing arpeggio riff at speed | about 170 swing | 2 | [alto solo, Lankydog (C), 495 ratings](https://musescore.com/user/4990341/scores/5302471) | [alto, SaxExpress (O)](https://musescore.com/user/97106398/scores/19621312) |
| Chameleon (Herbie Hancock) | funk line, syncopated 16ths | about 95 | 2 | [alto, Goresbrook Creative Arts (C)](https://musescore.com/user/9353001/scores/6423863) | [tenor, Anderson Quevedo (O)](https://musescore.com/user/97106398/scores/17762437) |
| Sir Duke (Stevie Wonder) | the unison horn line, A major | about 105 | 2 | [alto, Alex Hodge (C), 115 ratings](https://musescore.com/user/1798166/scores/732336) | [alto, The Sheet Music Library (O)](https://musescore.com/user/97106398/scores/17762050) |
| Money, sax solo (Pink Floyd, Dick Parry) | blues solo in 7/4, bends | about 120 | 3 | [alto transcription, Didacus.Calixto (C)](https://musescore.com/user/35102076/scores/13678996) | [alto, Kevin Busse (O)](https://musescore.com/user/97106398/scores/16634644) |
| Pick Up the Pieces (Average White Band) | tight 16th horn riff | about 112 | 3 | [alto, FabioAltoSax (C)](https://musescore.com/user/28815610/scores/12896167) | [alto, Mark Peotter (O)](https://musescore.com/user/97106398/scores/19595797) |
| Yakety Sax (Boots Randolph) | fast tonguing and chromatic runs | very fast; play at 70% first | 3 | [alto, Mierwit (C), 79 ratings](https://musescore.com/user/1195216/scores/1881561) | [tenor, Jeebbus (C), 225 ratings](https://musescore.com/user/1049301/scores/1858401) (tenor scene) |

**Boss:** 12 major keys at grade 5 speed (66, four a click) on 2 days; scales in thirds in 6 keys at 72; two shelf songs at tempo, 85% in performance mode.

---

### Level 10. Jazz heads and blues improvisation, after Aebersold and the Omnibook (12 to 16 weeks)

**Goal:** a repertoire of 6 heads by memory; improvise on a blues with chord tones, guide tones and two or three borrowed bebop phrases; minor and modal tunes; transcribe four bars by ear (the Bob Reynolds habit).

| # | Step | Drill and setup | Done means | Feeds |
|---|---|---|---|---|
| 10.1 | Two bebop blues heads | Song Studio, Now's the Time and Billie's Bounce | 85% at 140, then from memory | boss |
| 10.2 | Chord tones on the blues | `chord-scales?changes=` blues in alto D (cross-link to Jazz path) | 85% tone roles | improvising |
| 10.3 | Guide tones | NEW guide-tone line on Jam (S; section 4, item 13): the 3rd and 7th of each chord, one per bar | 85% correct guide tones over 2 choruses | improvising |
| 10.4 | ii-V vocabulary in 12 keys | `licks?category=` ii-V, `licks?lick=n&key=X` with 12-key transposition | 3 licks in 6 keys at 120 | improvising |
| 10.5 | The bebop enclosure | `phrases?phrase=aerophone.bebop-enclosure` in 4 keys | 90% at tempo | Parker heads |
| 10.6 | Blues improvisation, two keys | `jam?progression=blues`, alto D and G, 120 swing, 3 choruses | recorded take with no lost bars, a lick in each chorus (NEW grader) | boss |
| 10.7 | Modal and minor | `jam?progression=modal` for So What and Mr. P.C. | 3 choruses, no lost bars | So What |
| 10.8 | Trading fours | NEW trading fours on Jam (M; section 4, item 14) | 8 trades in time | improvising |
| 10.9 | Transcribe four bars | Song Studio loop at 70% of a record, play back, then write it down | 4 bars matched note for note, on 2 tunes | ear (cross-link) |
| 10.10 | Memorise | Heads from memory, notes hidden | 6 heads at 85% | boss |

**Song shelf, Level 10** (pick any 4)

| Song | Teaches | Key (concert, alto), tempo | Diff | MuseScore score | Fallback |
|---|---|---|---|---|---|
| Now's the Time (Parker) | riff blues, the Parker sound | F, alto D; 200 on record, 140 here | 1 | [Eb alto from the Omnibook, tbeaudelain (C)](https://musescore.com/user/59221054/scores/12590899) | [Real Book, concert (O)](https://musescore.com/user/39593079/scores/16001902); Omnibook Eb; Aebersold Vol. 6 |
| Straight, No Chaser (Monk) | one motif displaced across the bar | F, alto D; about 160 | 1 | [alto, Hal Leonard (O)](https://musescore.com/user/39593079/scores/15739699) | [tenor, The Sheet Music Library (O)](https://musescore.com/user/97106398/scores/18579718); Real Book Eb |
| So What (Miles Davis) | modal, call and response, Dorian | D Dorian, alto B Dorian; about 136 | 1 | [alto transposition of Miles's solo, Tikeuz (C), 73 ratings](https://musescore.com/user/30742208/scores/5377158) | [alto beginner, Katrin Scherer (O)](https://musescore.com/user/97106398/scores/18088813) |
| Song for My Father (Horace Silver) | minor bossa, syncopated head | F minor, alto D minor; about 120 | 1 | [lead sheet, concert, mikehaojiang (C)](https://musescore.com/user/36051240/scores/29488421) | [lead sheet, Katrin Scherer (O)](https://musescore.com/user/97106398/scores/18886204); Real Book Eb |
| Billie's Bounce (Parker) | bebop blues head | F, alto D; 190 on record, 140 here | 2 | [alto, jpetersen628 (C), 45 ratings](https://musescore.com/user/34703655/scores/7073653) | [Real Book, concert (O)](https://musescore.com/user/39593079/scores/16001917); Aebersold Vol. 6 |
| Au Privave (Parker) | bebop blues, chromatic approach | F, alto D; about 200, 140 here | 2 | [alto, maxninja98 (C), 54 ratings](https://musescore.com/user/27304832/scores/5588741) | [Real Book, concert (O)](https://musescore.com/user/39593079/scores/16001878); Omnibook Eb |
| Mr. P.C. (Coltrane) | minor blues, fast | C minor, alto A minor; play at 140 | 2 | [alto, lericketts (C), 49 ratings](https://musescore.com/user/54809/scores/81040) | [Real Book, concert (O)](https://musescore.com/user/39593079/scores/16029988) |
| Footprints (Wayne Shorter) | minor blues in 6/4, altered turnaround | C minor, alto A minor; about 120 | 2 | [Real Book, concert (O)](https://musescore.com/user/39593079/scores/16084282) | Real Book Eb; [lead sheet with bass, frankicebass (C)](https://musescore.com/user/34812601/scores/6271174) |
| Take Five (Desmond) | 5/4, the alto line, Eb minor | Eb minor, alto C minor; about 172 | 3 | [alto, maxtor1963 (C), 1,402 ratings](https://musescore.com/user/85652/scores/430481) | [alto, Leo Silva (O)](https://musescore.com/user/97106398/scores/16701601) |
| Blue Bossa or Autumn Leaves with a written solo | first full chorus of your own | as Level 6 | 3 | your own MuseScore file, written from a recorded take | Aebersold Vol. 54 |

**Boss:** three heads by memory at 140 (one bebop blues, one minor or modal, one other) at 85%; 3 improvised choruses over a concert F blues (alto D) at 120 with no lost bars, guide tones on bars 1, 5, 9 and one quoted lick; one 4-bar transcription.

---

### Level 11. Grade 5 capstone: Ferling and a recital (8 to 12 weeks)

**Goal:** the classical half of the grade (a Ferling slow study with breaths, dynamics and vibrato planned), the full scale requirement, sight-reading, and a three-piece recital recorded in one take each.

| # | Step | Drill and setup | Done means | Feeds |
|---|---|---|---|---|
| 11.1 | Pick and import the Ferling | an odd-numbered (slow) study from IMSLP or the shelf; MuseScore PDF import or MuseScore Studio entry, then Song Studio | score imported and checked against the PDF | Ferling |
| 11.2 | Plan breaths and dynamics | mark breaths and hairpins (NEW item 9) | a marked copy | Ferling |
| 11.3 | Ferling in chunks | Song Studio loop of each 4-bar phrase, wait then performance | each phrase 90% | Ferling |
| 11.4 | Ferling whole | performance mode at the marked tempo, dynamics scored when item 9 ships | 85% notes, 80% dynamics in band | boss |
| 11.5 | Scales, the full set | majors, three minor forms, chromatic, arpeggios, thirds, 12 keys, grade 5 speed | 90% each, all in one week | boss |
| 11.6 | Sight-reading | `reading` sight-reading, grade 4 to 5 lines | 80% first try on 5 new lines | boss |
| 11.7 | A solo transcription | Parker's Billie's Bounce first chorus or Stitt on Au Privave, learnt from the score and the record | 85% at 70% tempo | jazz |
| 11.8 | Record the recital | `record`: Ferling, one jazz head with 2 choruses, one pop hit with vibrato, one take each | three takes kept in the journal | boss |

**Song shelf, Level 11** (pick the Ferling plus any 2)

| Piece | Teaches | Key, tempo, technique | Diff | MuseScore score | Fallback |
|---|---|---|---|---|---|
| Ferling, slow study No. 23 (Op. 31) | breath planning, dynamics, a slow line | slow; Andraud edition | 1 | [alto, Andraud edition, Hal Leonard (O)](https://musescore.com/user/39593079/scores/21252574) | [IMSLP, all 48 studies](https://imslp.org/wiki/48_Studies_for_Oboe,_Op.31_(Ferling,_Franz_Wilhelm)) (public domain; sax players read the oboe edition as written) |
| Ferling, Selected Studies E minor etude | minor, lyrical | as marked | 1 | [alto, george.willson (C)](https://musescore.com/user/1299081/scores/8143407) | IMSLP Op. 31 |
| Ferling No. 10 (alto part) | the fast partner study, finger evenness | fast | 2 | [alto, DrWho9000 (C), 4.8 stars](https://musescore.com/user/36384394/scores/7119475) | IMSLP Op. 31 |
| Ferling Etude 12 over Bird blues changes | a bridge from classical to bebop | as marked | 2 | [alto, .Aidan (C), 44 ratings](https://musescore.com/user/1752166/scores/6881117) | IMSLP Op. 31 for the original |
| L'Arlésienne Suite No. 1, alto sax solo (Bizet) | the classic orchestral sax solo | Prélude, slow | 2 | [alto, tomasribeirin (C), unrated: check it is the Prélude solo](https://musescore.com/user/61806442/scores/11633908) | app phrase `aerophone.arlesienne-prelude`; IMSLP orchestral parts |
| The Way You Look Tonight (Kern) | standard changes at a medium swing | Eb concert sound; about 160 | 2 | [alto, FabioAltoSax (C)](https://musescore.com/user/28815610/scores/19849906) | [alto, Hal Leonard (O)](https://musescore.com/user/39593079/scores/15811900) |
| Confirmation (Parker) | the bebop standard head | F, alto D; about 200, 120 here | 3 | [alto, mt3115 (C)](https://musescore.com/user/65760829/scores/22106920) | [alto, Jireh J. (O)](https://musescore.com/user/97106398/scores/18870868); Omnibook Eb |
| Billie's Bounce, Parker's solo | a full bebop solo chorus | F, alto D | 3 | [alto, Provoloooone (C), 106 ratings](https://musescore.com/user/33630425/scores/6096076) | [alto, gillybean (C)](https://musescore.com/user/1067306/scores/5696218); Omnibook Eb |
| Au Privave, Sonny Stitt's solo | fast bebop lines on a blues | F, alto D | 3 | [alto, Richard Aubert (C), 31 ratings](https://musescore.com/user/30685038/scores/6107700) | Omnibook Eb for Parker's own solo |

**Boss (mock grade 5):** the Ferling slow study at 85% notes and 80% dynamics; one jazz head with 2 improvised choruses; one pop hit with vibrato; the full scale set at grade 5 speed; 5 new sight-reading lines at 80%. Record all of it in one session.

## 3. Cross-links to other paths

| When | Link | Why |
|---|---|---|
| Level 1 | Reading path: treble flashcards | Fast for a pianist; only the hand position is new |
| Level 2 to 3 | Ear path: melodic dictation `anchor`, `major-pentachord`, answered on the AE-20 | Playing by ear starts on the horn, not only at the piano |
| Level 4 | Reading path: sight-reading with eighths, Aerophone | Keeps reading ahead of the songs |
| Level 5 | Ear path: `progressions`, `follow-the-bass` | Hearing I, IV, V in the blues |
| Level 6 | Ear path: `scales-and-modes`; Rhythm path: syncopation and swing | Minor, Dorian and swing |
| Level 6 to 10 | Jazz path: ii-V, chord-scales, licks | Same harmony the piano path teaches; play it on the horn |
| Level 8 | Ear path: `interval-size`, `interval-names` | Legato leaps by ear |
| Level 9 | Circle path: key signatures, circle order | All-key technique in circle order |
| Level 10 | Ear path: echo and transcription; Piano path: comp the blues yourself and record a backing | Bob Reynolds transcription habit; owner's piano helps |
| Level 11 | Theory path: form and phrase | Breath plans follow phrase structure |

## 4. New drills and app changes, ranked

| # | Change | Size | Why |
|---|---|---|---|
| 1 | Transposition setting (C, Bb, Eb) on incoming notes, and read MusicXML `<transpose>` on import ("this part is for Eb alto, Bb tenor, concert") | S to M | Without it the owner must practise at Transpose C; every recording play-along needs Eb |
| 2 | Aerophone path in `progress/paths.ts` with these 11 levels (start from round 1's 20 steps) | L | The sequence is the missing piece |
| 3 | Fingering chart and drills to F#6 (palm keys D6, Eb6, E6, F6, front F, F#6) | S, verify on unit | Level 7 onward; Baker Street, Careless Whisper |
| 4 | Calibration and key check (breath floor and ceiling, CC check, transpose check) | S to M | Every breath-scored step depends on it |
| 5 | Swing articulation drill (off-beat tongued, slurred into the beat, swing ratio scored) | S to M | Level 6, Niehaus |
| 6 | Blues call and response, then a free-chorus grader on Jam (time, staying in the scale, landing tones) | M | Levels 5 and 10; Aebersold |
| 7 | Scale list additions: blues, minor pentatonic, melodic minor; interval patterns (thirds, 1-2-3-1, broken triads) | S | Levels 5, 9 |
| 8 | Two-octave and full-range option for scales and arpeggios | S | Levels 7, 9, 11 |
| 9 | Phrase dynamics and breath marks in Song Studio, scored with the in-band share | M | Levels 8, 11 (Ferling) |
| 10 | Vibrato on held notes in Song Studio | S | Level 8 |
| 11 | Long-tone scale mode | S | Level 8 |
| 12 | Fingering mode with a chosen note set; extra register pairs (pinky table, palm keys) | S | Levels 2, 4, 7 |
| 13 | Guide-tone line on Jam (3rd or 7th per bar) | S | Level 10 |
| 14 | Trading fours on Jam | M | Level 10 |
| 15 | Song Studio: fit an imported line to the AE-20 range by octaves | S | Concert lead sheets often sit low or high |

## 5. Open questions for the owner

**Answered by the owner (2026-10-27):** MuseScore Pro, yes; Official scores export MusicXML, so Official picks stay as listed. Guitar: acoustic and electric, no classical strand. Ukulele: high-G tenor. Aerophone: alto and tenor scenes both, bite sends pitch bend. Pads: performing and beat making interleaved by difficulty; the MPC sends aftertouch. Piano: the full curriculum, known skills as review. Jazz: a Real Book PDF for chord charts.


1. Which scene and transpose do you use now: alto Eb with transpose on, or C? The path assumes alto sound with Transpose C inside the app until item 1 ships. **Answered: both, alto and tenor scenes are configurable on the AE-20, so a shelf song can use whichever part MuseScore has; the transposition setting must offer both.**
2. Official MuseScore scores (marked O) cost money or need Pro+. Do you have Pro+, or should every shelf pick a free community score first, even when the arrangement is less exact?
3. Some shelves use tenor parts (Who Can It Be Now, Dancing in the Dark, Bags' Groove, Yakety Sax fallback). Are you happy to switch to a tenor scene for those, or should they be replaced with alto-only picks?
4. Is the bite set to send pitch bend? Level 8's vibrato steps assume it. **Answered: yes, the bite sends pitch bend.**
5. Pop and jazz first, or classical first? Levels 7 (pop) and 8 (Teal) can swap, and the Ferling can move earlier for a classical lean.
6. Do you want a real exam (ABRSM or Trinity Grade 5 saxophone) as the finish line, or is the app's mock grade enough?
7. Should Levels 1 and 2 accept Practice runs (fingering shown), as a beginner's warm-up, or only Check?
