# Reading path: piano, guitar, ukulele, Aerophone and rhythm (round 2, 2026-10-27)

One reading path with five parallel tracks. Each track has its own levels, steps, a reading shelf per level and a level test. Round-1 sources: `ear-reading-theory.md` (R6 and R8 here become concrete), `../piano-drills.md` (ABRSM sight-reading ladder), `guitar.md`, `ukulele.md`, `aerophone.md`. App code read for this plan: `packages/music-core/src/content/reading.ts`, `data/reading-levels.json`, `content/rhythm.ts`, `data/rhythm-patterns.json`, `src/lib/music/drills/reading/*`.

## 1. Target and scope

### What "done" means

| Track | Done means | External benchmark |
|---|---|---|
| Piano | Sight-read an unseen 12 to 16 bar grand-staff piece at ABRSM Grade 6 standard after a 30 second look, at 80% or better on the app's scorer, two days running. Read a pop chord chart and a jazz lead sheet at sight in time (melody plus shells, or chords in a named pattern). | ABRSM sight-reading parameters G2 to G6 (`piano-drills.md` section 2); Piano Marvel SASR climb as the scoring model |
| Guitar | Read tab with rhythm fluently; read standard notation in first and fifth position at sight (single line, keys to 3 sharps and 2 flats, eighths, dotted rhythms, ties, syncopation); learn a two-voice classical study from the staff; comp from a chord chart with slash rhythm. | Leavitt, A Modern Method for Guitar Vol. 1 (position reading); ABRSM or Trinity classical guitar sight-reading about Grade 3 to 4; RGT reading at about Grade 5 for the chart work |
| Ukulele | Read tab and staff in first position and up the neck (to fret 7 on the A string), melody plus chord symbols, and learn chord-melody solos from staff with tab. | James Hill Ukulele Initiative Books 1 and 2 (reading, melody picking, chromatic and secondary dominants) |
| Aerophone | Read treble clef transposed for Eb alto at sight: keys to 3 sharps and 4 flats (written), full range low Bb to high F, straight and swing eighths, syncopation; read Eb lead sheets. | ABRSM saxophone sight-reading about Grade 5; Ferling 48 Etudes (easier ones) as the reading reference |
| Rhythm | Read and tap at sight any rhythm in the ABRSM G6 vocabulary plus swing, 6/8 with sixteenths, ties over the beat and odd meters; read Syncopation-style 8-bar lines at quarter = 120. | Ted Reed, Progressive Steps to Syncopation for the Modern Drummer (the reading lines); Bona, Rhythmical Articulation (PD) |

### How long at about 30 minutes a day

- Reading is a slot, not a separate instrument. If the whole 30 minutes goes to reading, rotating tracks (piano 3 days, guitar 2, Aerophone or ukulele 1, rhythm 5 to 10 minutes most days), the five tracks take about **18 to 24 months**.
- If reading only gets the Today reading slot (5 to 10 minutes) and the owner learns shelf pieces inside instrument time, plan on **2.5 to 3 years**. Shelf pieces learned by reading count for both the reading path and the instrument path, which is how the estimate stays near two years for a learner who practises more on some days.
- Per track, at its share of the time: piano G2 to G6 sight-reading in 12 to 18 months (one ABRSM grade every 3 to 4 months is typical for adults reading daily; the owner already reads both clefs), guitar 12 to 18 months (tab is fast; staff in position is the slow part), ukulele 6 to 9 months (it reuses guitar and piano reading), Aerophone 12 to 18 months (limited by the instrument skill, not the reading), rhythm 6 to 12 months.

### Rules that hold on every level

| Rule | What it means | Source |
|---|---|---|
| Sight-read means one pass | 30 second look (ABRSM), count-in, performance follower, no stopping. Scored at 80% to pass, 90% for clean. Wait mode is for first contact with a new feature only. | ABRSM spec p. 15; Piano Marvel SASR |
| Learn by reading means no recording first | Import the MuseScore MusicXML into Song Studio, read it in wait mode to a first full pass, then performance mode at the target tempo, 90% or better on two days. Listen afterwards. | Kodály order reversed on purpose: this path trains the eye; the ear path trains the reverse |
| Hear it before you play it | During the 30 second look, hum or sing the first bar silently. | Mishra 2014: aural and singing treatments had the largest effect |
| Volume over difficulty | Most shelf reading is one to two levels below the generator level: lots of easy pieces read once beats one hard piece read ten times. | Lehmann and Ericsson 1996; Zhukov 2014 |
| Accompany and play duets | Every piano level has at least one duet or accompaniment on its shelf. | Zhukov 2014 (accompanying beat single strategies) |
| Two days | "Done" always means on two different days, so sleep consolidation is part of the criterion. | Simmons and Duke 2006 |

### Running the tracks together

Rhythm runs one level ahead because every other track leans on it. A track level is not started before the rhythm level it names in its steps.

| Months (30 min a day) | Piano | Guitar | Ukulele | Aerophone | Rhythm |
|---|---|---|---|---|---|
| 1 to 3 | 1 | 1, 2 | 1 | 1 | 1, 2 |
| 4 to 6 | 2 | 3 | 2 | 2 | 3, 4 |
| 7 to 9 | 3, 4 | 4 | 3 | 3 | 5 |
| 10 to 12 | 4 | 5 | 4 | 4 | 6 |
| 13 to 16 | 5 | 6 | 5 | 5 | 7 |
| 17 to 20 | 6 | 7 | 6 | 6 | 8 |
| 21 to 24 | 7 | 8 | review shelves | 7 | review with Reed lines |

### How shelves were checked

Every MuseScore link below came from MuseScore's own search results, fetched inside the Orca browser on 2026-10-27, reading the score's title, uploader, instrument list, favourites and rating count from the search data (306 searches plus 46 retries; score pages were not opened one by one, so the listing is the confirmation). "Official" marks a paid publisher score (Hal Leonard, ArrangeMe) that needs a MuseScore Pro subscription or a purchase; community scores are free to download with the owner's account. Arrangements were picked by instrument and by how well the title and difficulty fit the level; a few community scores may differ from the title on detail, so the first read of any piece is also a check. Keys and meters in the shelf tables are the usual ones for each tune; a given arrangement may be in another key, which the first look settles. Fallbacks point to IMSLP, Mutopia, The Session or a book where MuseScore had nothing suitable.

## 2. The generator levels the path needs

The app has four sight-reading levels today (`reading-levels.json`): Primer, Level 1, Level 2, Level 3. All are one random-walk line per clef, 4/4 or 6/8, no rests, ties, accidentals, chords, dynamics, 3/4 or anacrusis, keys to two flats, roughly ABRSM Initial to Grade 2. The path uses them as they are for the treble instruments' early levels and adds the levels below. Each row is one entry in `reading-levels.json` plus cell sets in `reading.ts`.

### Piano grand-staff levels (hands together)

| New id | ABRSM | Keys (add to earlier) | Meters | Rhythm cells added | Texture and range | Other features |
|---|---|---|---|---|---|---|
| `piano-4` | G2 | C, G, F, D majors; A, D, E, G minors | 2/4, 3/4, 4/4 | dotted quarter-eighth, ties, quarter and half rests | RH melody C4 to G5 in a five-finger position with one shift; LH whole and half-note roots and fifths of I, IV, V under it (the hands agree harmonically) | f, p, mf, mp; 4 to 6 bars |
| `piano-5` | G3 | A, Bb, Eb majors; B, C minors | add 3/8 | eighth plus two sixteenths, two sixteenths plus eighth | RH leaves five-finger position (steps up to a fourth, one leap to a sixth); LH two-note chords (thirds, fifths, sixths) and simple broken patterns | staccato and slur marks; 8 bars |
| `piano-6` | G4 | same keys plus chromatic passing and neighbour notes | add 6/8 grand staff | 6/8 cells from `COMPOUND_CELLS` level 3, anacrusis | LH accompaniment from a progression: broken chord, Alberti, waltz bass (oom-pah-pah) | accidentals inside the bar, hairpins; 8 bars |
| `piano-7` | G5 | E, Ab majors; F#, C minors | 4/4, 3/4, 6/8, 2/2 | syncopation tied over the beat, dotted eighth-sixteenth | four-part chorale texture from a progression with voice-leading rules (or corpus chorales, see 4.8); RH melody over LH chords | 8 to 12 bars |
| `piano-8` | G6 | all keys to 4 sharps and 4 flats | add 9/8, 5/4, 5/8 | triplets, mixed duplets and triplets | LH clef change bass to treble; RH octaves and three-note chords | pedal marks, rit. and a tempo; 12 to 16 bars |
| `chart-1` to `chart-3` | n/a | C, G, F, D, Bb, A, Eb | 4/4, 3/4, 6/8 | slash rhythm per beat, then rhythm hits | a chord chart (no melody): 8 to 16 bars of symbols with a named pattern to play (block, broken, ballad arpeggio, pop eighths, push on the and of 4) | graded by pitch-class set per beat plus timing |
| `lead-1` to `lead-2` | n/a | jazz keys F, Bb, Eb, C, G | 4/4 swing | swing eighths written straight, anticipations | melody (RH) plus chord symbols; LH plays shells (root-3-7) then rootless | graded on melody notes plus LH pitch classes per chord |

### Single-line levels (guitar, ukulele, Aerophone, piano one hand)

| New id | Roughly | Keys (written) | Meters | Rhythm added | Melodic shape |
|---|---|---|---|---|---|
| `line-4` | ABRSM G2 to G3 | to 2 sharps and 2 flats, relative minors | 2/4, 3/4, 4/4 | rests, ties, dotted quarter-eighth | steps and leaps to a fifth, scale and arpeggio fragments (not only random walk) |
| `line-5` | G3 to G4 | to 3 sharps and 3 flats | add 6/8 with eighth-quarter mix | sixteenths, anacrusis, accidentals | leaps to an octave, sequences |
| `line-6` | G4 to G5 | to 4 sharps and 4 flats | add 2/2 and 3/8 | syncopation over the beat, triplets, dotted eighth-sixteenth | chromatic neighbours and passing notes |
| `line-jazz` | jazz heads | written C, F, Bb, Eb, G, D | 4/4 swing | swing eighths written straight, anticipations of beat 1 and 3 | blues scale and chord-tone lines with chromatic approach notes |

### Per-instrument ranges and settings the generator needs

| Instrument | Setting | Written range |
|---|---|---|
| Guitar | `position=open-123` (strings 1 to 3, frets 0 to 3, Mel Bay order) | G4 to G5 |
| Guitar | `position=open` (all six strings, frets 0 to 4) | E3 to A5 |
| Guitar | `position=2` (Leavitt starts position reading here) | F#3 to B5 |
| Guitar | `position=5` (frets 4 to 9, one finger per fret plus stretches) | A3 to C6 |
| Guitar | `tab=hidden` by default on every staff step (exists as Show tab); tab assignment must respect the chosen position (today `assignTab` picks any fret) | |
| Ukulele (GCEA, high G) | `position=open` (frets 0 to 3) | C4 to C5 |
| Ukulele | `position=up` (frets 0 to 7 on the A string, campanella allowed) | C4 to E5 |
| Aerophone | `transpose=Eb` (alto: written is a major sixth above concert, +9 semitones); the AE-20's own transpose then matches | first Bb4 to G4 (left hand), then D4 to D5, then Bb3 to F6 |
| Rhythm | read-and-tap from the generator (R8 in round 1) | n/a |

### Rhythm levels for read-and-tap

The 8 ear-rhythm levels in `rhythm.ts` (quarters-eighths, rests-halves, dotted, compound, sixteenths, syncopation, dotted-sixteenths, swing) become read-and-tap levels as they are (R8). The rhythm track adds:

| New id | Adds |
|---|---|
| `ties` | ties over the beat and over the bar line (eighth tied to quarter, Reed's syncopation figures) |
| `three-four` | 3/4 and 2/4 with all cells so far; 2/2 cut time read as two beats |
| `sixteenth-sync` | sixteenth syncopation (e-and-a gaps, sixteenth-eighth-sixteenth), sixteenth rests |
| `compound-16` | 6/8, 9/8 and 12/8 with sixteenths and dotted-eighth figures |
| `triplet-2` | quarter-note triplets over two beats, mixed eighths and triplets |
| `odd` | 5/4, 7/4, 5/8, 7/8 with grouping marks (2+3, 2+2+3) |
| `reed-lines` | 8-bar single-line pages in Reed's style (eighths, quarters, dotted quarters, ties) read at 80 to 140, optionally with a fixed foot pulse (kick quarters) in a second lane |

## 3. Piano track (grand staff, chord charts, lead sheets)

Starting point: the owner is intermediate and reads both clefs, so the track starts at ABRSM G2 sight-reading with a placement climb, not at Primer. Drill hrefs below use the reading setup keys (`activity`, `clefs`, `key`, `level`, `follower`, `meter`, `measures`, `climb`), which `DrillSetup` already reads from the URL.

Short names used in the tables: **SR** = `/music/learn/reading?activity=sight-reading&instrument=piano&clefs=treble,bass`; **FC** = `/music/learn/reading?activity=flashcards&instrument=piano&clefs=treble,bass&answer=play`; **Studio** = Song Studio with the MuseScore MusicXML imported. "First pass" means the sight-read rules in section 1.

### Piano level 1: hands together at ABRSM Grade 2

Goal: place the owner, then read both hands together in time. Adds: grand staff in one view, D major and E, G minors, 3/4, ties and rests, the habit of a 30 second look.

| # | Step | Drill and setup | Done means | Feeds |
|---|---|---|---|---|
| 1 | Placement climb | SR `&level=level-2&climb=true` (existing climb, Piano Marvel rules) | Pass every level-3 rung (top rung D minor) with at most 2 strikes, on two days. If the climb ends in level 2, do steps 2 and 3 first and repeat. | all |
| 2 | Landmarks and ledger lines | FC `&key=C%20major&low=43&high=84` | 95% of 40 cards, two days | Türk, Gurlitt |
| 3 | New keys | FC `&key=D%20major`, then `E%20minor`, `G%20minor`; SR `&level=level-3&key=D%20major&follower=performance` | 95% of cards per key; 80% on 5 of 6 phrases | Kabalevsky, Scarborough Fair |
| 4 | Hands together, first contact | NEW `piano-4`, `follower=wait&measures=4` | 5 phrases at 90% in wait mode | Diabelli |
| 5 | Hands together in time | `piano-4`, `follower=performance`, 60 then 72 bpm | 80% on 5 of 6 phrases at 72, two days | all |
| 6 | 3/4, ties and rests | NEW `piano-4&meter=3/4` | 80% on 5 of 6 phrases at 72 | Amazing Grace, Morning Has Broken |
| 7 | Look, hear, play | NEW optional 30 second look with a "hum bar 1" prompt before each `piano-4` phrase | 10 phrases with the pause, mean score no lower than without it | all |
| 8 | Follow a line by ear | Ear: `/music/learn/ear/wrong-note?level=major-diatonic` | 80% over 20 items | |
| 9 | Sight-read the shelf | Studio, NEW sight-read flag (one scored pass at 70% of the marked tempo) | 3 different shelf pieces at 80% or better on the first pass | shelf |
| 10 | Read a duet part | Studio: Diabelli Op. 149, mute your part and play along with the other (NEW duet partner; until then, play with a recording) | Through to the end without stopping, 80% | Diabelli |
| 11 | Learn one by reading | Studio wait mode, then performance at the marked tempo | One shelf piece at 90% on two days | shelf |

| # | Piece | Read for | Key, meter, notes | Diff | MuseScore score | Fallback |
|---|---|---|---|---|---|---|
| 1 | Türk, Elf Handstücke (from 120 Handstücke) | short two-hand pieces, five-finger positions | C, G, F majors; 2/4 and 3/4 | 1 | [community](https://musescore.com/user/40131163/scores/7096120) | [IMSLP](https://imslp.org/wiki/120_Handstücke_für_angehende_Klavierspieler_%28Türk,_Daniel_Gottlob%29) |
| 2 | Gurlitt, The First Lessons Op. 117 No. 1 | hands together, steps | C major | 1 | [community](https://musescore.com/user/29739402/scores/14455060) | [IMSLP](https://imslp.org/wiki/Anfangs-Stunden,_Op.117_%28Gurlitt,_Cornelius%29) |
| 3 | Gurlitt, The Hunt Op. 117 No. 15 | staccato, hand position shifts | 2 to 3 bar phrases | 2 | [community](https://musescore.com/user/47469701/scores/9156552) | [IMSLP](https://imslp.org/wiki/Anfangs-Stunden,_Op.117_%28Gurlitt,_Cornelius%29) |
| 4 | Bartók, For Children Vol. 1 No. 1, Children at Play | folk tune split between hands | modal, 2/4 | 1 | [community](https://musescore.com/user/4887176/scores/5905061) | [IMSLP](https://imslp.org/wiki/For_Children,_Sz.42_%28Bartók,_Béla%29) |
| 5 | Diabelli, Melodious Pieces Op. 149 No. 1 (duet) | duet: read either part, keep going | 4/4 | 2 | [community](https://musescore.com/user/19932/scores/34078) | [IMSLP](https://imslp.org/wiki/28_Melodische_Übungsstücke,_Op.149_%28Diabelli,_Anton%29) |
| 6 | Kabalevsky, Waltz Op. 39 No. 13 | waltz LH, D minor | 3/4 | 2 | [community](https://musescore.com/user/40334220/scores/7053272) | in copyright; the book "24 Pieces for Children, Op. 39" |
| 7 | Amazing Grace (easy piano) | pickup bar, ties, 3/4 | F or G major | 1 | [community](https://musescore.com/user/2018/scores/1937) |  |
| 8 | Scarborough Fair (Alfred's version) | Dorian colour, 3/4 | Dorian | 2 | [community](https://musescore.com/user/35760639/scores/6392186) |  |
| 9 | Morning Has Broken | 3/4, LH broken chords | C major | 1 | [community](https://musescore.com/user/248516/scores/615806) |  |
| 10 | Let It Be (Big Note Piano) | pop melody, RH over LH roots | C major | 1 | [official](https://musescore.com/user/39593079/scores/15509809) |  |

**Level test:** all `piano-4` rungs with at most 2 strikes; one unseen shelf piece at 80% on the first pass; one learned piece at the marked tempo at 90%.

### Piano level 2: ABRSM Grade 3

Goal: read outside five-finger positions in keys to three sharps and flats. Adds: A, Bb, Eb majors and B, C minors, 3/8, two-note chords, simple sixteenths, staccato and slurs, a look-ahead habit.

| # | Step | Drill and setup | Done means | Feeds |
|---|---|---|---|---|
| 1 | Key signatures to three | FC per key (`A%20major`, `Bb%20major`, `Eb%20major`, `B%20minor`, `C%20minor`); Circle of Fifths path steps 1 to 4 | 95% of 40 cards per key; circle steps passed | all |
| 2 | Triads at sight | FC `&kind=chord` in each key | 90% of 30 cards | Minuets, Soldiers' March |
| 3 | Scales of the new keys | Scales, piano, hands together, one octave at q = 80 (ABRSM G3 speed) | Clean run in each key on two days | finger patterns for the shelf |
| 4 | Leaving the position, first contact | NEW `piano-5`, wait | 5 phrases at 90% | |
| 5 | In time | `piano-5`, performance at 66 then 80 | 80% on 5 of 6 phrases at 80, two days | all |
| 6 | 3/8 and sixteenths | NEW `piano-5&meter=3/8`; rhythm track level 4 first | 80% on 5 of 6 phrases | Musette, Clementi |
| 7 | Look ahead | NEW look-ahead mask: played notes hide, 2 beats ahead visible | 80% on 5 of 6 `piano-5` phrases with the mask | |
| 8 | Sight-read the shelf | Studio, sight-read flag | 4 different shelf pieces at 80% first pass | shelf |
| 9 | Duet secondo | Studio: Diabelli Allegro alla Turca, secondo part | Through without stopping, 80% | Diabelli |
| 10 | Learn one by reading | Studio | One piece at tempo, 90%, two days | shelf |

| # | Piece | Read for | Key, meter, notes | Diff | MuseScore score | Fallback |
|---|---|---|---|---|---|---|
| 1 | Petzold, Minuet in G major (BWV Anh. 114) | two-voice reading, LH moves | G major, 3/4 | 1 | [community](https://musescore.com/user/9292486/scores/2086106) |  |
| 2 | Petzold, Minuet in G minor (BWV Anh. 115) | same in minor, accidentals | G minor, 3/4 | 1 | [community](https://musescore.com/user/9292486/scores/2086136) |  |
| 3 | Musette in D (BWV Anh. 126) | LH octave leaps, 2/4 | D major | 2 | [community](https://musescore.com/user/9292486/scores/2086211) |  |
| 4 | Schumann, Melody Op. 68 No. 1 | legato melody over LH eighths | C major | 1 | [community](https://musescore.com/user/37378841/scores/7054053) | [IMSLP](https://imslp.org/wiki/Album_für_die_Jugend,_Op.68_%28Schumann,_Robert%29) |
| 5 | Schumann, Soldiers' March Op. 68 No. 2 | dotted rhythms, chords in both hands | G major | 2 | [community](https://musescore.com/user/9292486/scores/2965566) | [IMSLP](https://imslp.org/wiki/Album_für_die_Jugend,_Op.68_%28Schumann,_Robert%29) |
| 6 | Tchaikovsky, Old French Song Op. 39 No. 16 | phrasing, G minor | G minor | 1 | [community](https://musescore.com/user/58480/scores/1170281) | [IMSLP](https://imslp.org/wiki/Children's_Album,_Op.39_%28Tchaikovsky,_Pyotr%29) |
| 7 | Clementi, Sonatina Op. 36 No. 1, first movement | Alberti bass, scale runs | C major | 3 | [community](https://musescore.com/user/35002320/scores/6128005) | [IMSLP](https://imslp.org/wiki/Sonatinas,_Op.36_%28Clementi,_Muzio%29) |
| 8 | Diabelli, Allegro alla Turca Op. 149 No. 26 (duet) | four hands, read the secondo | 2/4 | 2 | [community](https://musescore.com/user/30830113/scores/7598222) | [IMSLP](https://imslp.org/wiki/28_Melodische_Übungsstücke,_Op.149_%28Diabelli,_Anton%29) |
| 9 | Someone Like You (easy piano) | pop broken-chord LH | A major | 2 | [community](https://musescore.com/user/28416909/scores/6060915) |  |
| 10 | River Flow in You (easy) | arpeggios, repeated figures | A major | 2 | [community](https://musescore.com/user/28029113/scores/10998589) |  |

**Level test:** all `piano-5` rungs with at most 2 strikes; one unseen shelf piece (or a Gurlitt Op. 101 piece from IMSLP) at 80% first pass; one learned piece at tempo, 90%.

### Piano level 3: chord charts and pop lead sheets

Goal: read a pop chart at sight and play it in a named pattern, then add the melody from a lead sheet. Adds: chord symbols (triads, sus, add9, slash bass), slash rhythm and hits, 6/8 and 12/8 ballads. This is how pop pianists sight-read.

| # | Step | Drill and setup | Done means | Feeds |
|---|---|---|---|---|
| 1 | Symbol to chord | Voicings `/music/voicings?variant=inversions` | Any major or minor triad in any inversion within 2 s, 90% of 40 | all |
| 2 | Closest-position loops | Voicings or Comping: I-V-vi-IV, I-vi-IV-V, vi-IV-I-V in C, G, F, D | Each loop 4 times at 80 bpm with no wrong chord, two days | Let It Be, Stand By Me |
| 3 | Named patterns | Comping (`comping-patterns.json`): block quarters, broken 1-5-8-10, ballad arpeggio, pop eighths, push on the and of 4 | Each pattern over a 4-chord loop at 80 bpm, 90%, two days | all |
| 4 | Generated chart, one chord a bar | NEW `chart-1` | 80% first pass on 5 of 6 charts | |
| 5 | Two chords a bar and hits | NEW `chart-2` | 80% first pass on 5 of 6 | Piano Man, Your Song |
| 6 | Sus, add9, slash bass, 6/8 | NEW `chart-3` | 80% first pass on 5 of 6 | Hallelujah, Perfect |
| 7 | Hear the loop | Ear path step 5 (I, IV, V in a key) and step 10 (song loops); Harmony for Songs steps 1 to 4 | Ear steps passed | |
| 8 | Lead sheet: melody RH, roots LH | Studio, lead sheet imported, RH melody graded | Two shelf songs at 90% at tempo | shelf |
| 9 | Lead sheet: melody plus chord in RH, bass LH | Studio | One shelf song at tempo, 90%, two days | shelf |

| # | Piece | Read for | Key, meter, notes | Diff | MuseScore score | Fallback |
|---|---|---|---|---|---|---|
| 1 | Let It Be (Easy Lead Sheet) | I-V-vi-IV, ballad pattern | C major, 4/4 | 1 | [official](https://musescore.com/user/39593079/scores/15757582) |  |
| 2 | Stand By Me (lead sheet) | I-vi-IV-V, bass riff under the chart | 4/4 | 1 | [community](https://musescore.com/user/28057894/scores/6220414) |  |
| 3 | Imagine (lead sheet with lyrics) | Cmaj7 to F, ballad arpeggio | C major | 1 | [community](https://musescore.com/user/498481/scores/6527127) |  |
| 4 | Lean on Me (lead sheet with lyrics) | diatonic walk-ups, gospel feel | C major | 1 | [community](https://musescore.com/user/498481/scores/6282453) |  |
| 5 | Hallelujah (lead sheet in C) | 12/8 feel, vi and IV | C major | 2 | [community](https://musescore.com/user/28899113/scores/6263153) |  |
| 6 | Someone Like You (lead sheet in A) | I-V-vi-IV in A, broken eighths | A major | 2 | [community](https://musescore.com/user/28899113/scores/6274709) |  |
| 7 | Perfect (lead sheet in G) | 12/8 ballad | G major | 2 | [community](https://musescore.com/user/28899113/scores/6271372) |  |
| 8 | Fallin' (lead sheet with lyrics) | minor 12/8, i-v loop | E minor | 2 | [community](https://musescore.com/user/498481/scores/13561453) |  |
| 9 | Piano Man (lead sheet with lyrics) | 3/4, slash bass walk-down | C major | 3 | [community](https://musescore.com/user/498481/scores/7774370) |  |
| 10 | Your Song (lead sheet in Eb) | slash chords, moving bass | Eb major | 3 | [community](https://musescore.com/user/32454112/scores/29400032) |  |

**Level test:** two shelf charts at sight in a named pattern at 80% first pass; one lead sheet (melody plus chords) at tempo, 90%; one `chart-3` chart at 80% first pass.

### Piano level 4: ABRSM Grade 4

Goal: read 6/8, pickups and chromatic notes over real accompaniment patterns. Adds: compound time on the grand staff, anacrusis, accidentals in the bar, Alberti, waltz and broken-chord left hands, hairpins.

| # | Step | Drill and setup | Done means | Feeds |
|---|---|---|---|---|
| 1 | Feel 6/8 first | Rhythm track level 3 (read-and-tap, `compound`) | Rhythm level 3 passed | Wild Horseman, Pastorale |
| 2 | Accidentals and ledger lines | NEW flashcards with accidentals (sharps, flats, naturals in a key) | 95% of 40 cards | Sweet Dreams |
| 3 | Left-hand patterns | Two-hand drill: Alberti, waltz bass, broken chord over I-IV-V-I in 4 keys | Each pattern at 80 bpm, 90%, two days | Clementi, Beethoven |
| 4 | Grade 4 phrases, first contact | NEW `piano-6`, wait | 5 phrases at 90% | |
| 5 | In time | `piano-6`, performance; 6/8 at dotted quarter = 52 to 60 | 80% on 5 of 6, two days | all |
| 6 | Pickups and phrase ends | `piano-6` with anacrusis forced on | 80% on 5 of 6 | Greensleeves |
| 7 | Sight-read the shelf | Studio, sight-read flag | 4 pieces at 80% first pass | shelf |
| 8 | Accompany | Studio: read the piano part of The Happy Farmer for violin and piano (https://musescore.com/user/30892962/scores/5843892) with the violin playing | Through without stopping, 80% | |
| 9 | Learn one by reading | Studio | One Burgmüller study at tempo, 90%, two days | shelf |

| # | Piece | Read for | Key, meter, notes | Diff | MuseScore score | Fallback |
|---|---|---|---|---|---|---|
| 1 | Schumann, The Wild Horseman Op. 68 No. 8 | 6/8, melody passes between hands, staccato | A minor | 1 | [community](https://musescore.com/user/9292486/scores/2965526) | [IMSLP](https://imslp.org/wiki/Album_für_die_Jugend,_Op.68_%28Schumann,_Robert%29) |
| 2 | Schumann, The Happy Farmer Op. 68 No. 10 | melody in the LH under RH chords | F major | 2 | [community](https://musescore.com/user/1121756/scores/948631) | [IMSLP](https://imslp.org/wiki/Album_für_die_Jugend,_Op.68_%28Schumann,_Robert%29) |
| 3 | Burgmüller, La Candeur Op. 100 No. 1 | legato melody over LH broken chords | C major | 1 | [community](https://musescore.com/user/8772111/scores/5015180) | [IMSLP](https://imslp.org/wiki/25_Études_faciles_et_progressives,_Op.100_%28Burgmüller,_Friedrich%29) |
| 4 | Burgmüller, Arabesque Op. 100 No. 2 | sixteenth runs, LH staccato chords | A minor | 2 | [community](https://musescore.com/user/9292486/scores/5849868) | [IMSLP](https://imslp.org/wiki/25_Études_faciles_et_progressives,_Op.100_%28Burgmüller,_Friedrich%29) |
| 5 | Burgmüller, Pastorale Op. 100 No. 3 | 6/8, grace notes | G major | 2 | [community](https://musescore.com/user/3377/scores/23740) | [IMSLP](https://imslp.org/wiki/25_Études_faciles_et_progressives,_Op.100_%28Burgmüller,_Friedrich%29) |
| 6 | Tchaikovsky, Morning Prayer Op. 39 No. 1 | four-voice texture (a step towards chorales) | G major | 2 | [community](https://musescore.com/user/3990006/scores/1457186) | [IMSLP](https://imslp.org/wiki/Children's_Album,_Op.39_%28Tchaikovsky,_Pyotr%29) |
| 7 | Tchaikovsky, Sweet Dreams Op. 39 No. 21 | chromatic inner voices | C major | 3 | [community](https://musescore.com/user/27021897/scores/6453073) | [IMSLP](https://imslp.org/wiki/Children's_Album,_Op.39_%28Tchaikovsky,_Pyotr%29) |
| 8 | Beethoven, Sonatina in G (Anh. 5 No. 1) | classical phrasing, broken LH | G major | 2 | [community](https://musescore.com/user/5979946/scores/1451611) |  |
| 9 | Greensleeves (for solo piano) | minor with raised 6 and 7, pickup | minor, 3/4 or 6/8 | 2 | [community](https://musescore.com/user/30344780/scores/5673446) |  |
| 10 | Hallelujah (Leonard Cohen, piano) | 12/8 pop arrangement, full texture | C major | 3 | [community](https://musescore.com/user/27379520/scores/5164814) |  |

**Level test:** all `piano-6` rungs with at most 2 strikes; an unseen Burgmüller Op. 100 study (IMSLP) at 80% first pass; one learned shelf piece at tempo, 90%.

### Piano level 5: ABRSM Grade 5, chorales and hymns

Goal: read four-part harmony and syncopation in more keys. Adds: E, Ab majors, F#, C minors, four-note chords, syncopation over the beat, 8 to 12 bar tests. Hymns and chorales are the best four-part reading material there is: short, graded by nature, and free.

| # | Step | Drill and setup | Done means | Feeds |
|---|---|---|---|---|
| 1 | Four new keys | FC per key (`E%20major`, `Ab%20major`, `F%23%20minor`, `C%20minor`) | 95% of 40 cards per key | all |
| 2 | Four-note chords | NEW flashcards of four-note chords (SATB spacing on the grand staff) | 90% of 30 cards | chorales |
| 3 | Hear the function | Ear path step 15 (inversions and sevenths) | Step passed | chorales |
| 4 | Grade 5 phrases, first contact | NEW `piano-7`, wait | 5 phrases at 90% | |
| 5 | In time | `piano-7`, performance at 60 to 72 | 80% on 5 of 6, two days | all |
| 6 | Syncopation | Rhythm track level 5, then `piano-7` with syncopation weighted up | Rhythm level 5 passed; 80% on 5 of 6 | The Entertainer |
| 7 | A hymn a day | Studio, sight-read flag: one new hymn or chorale each practice day | 10 hymns or chorales at 80% first pass over 2 weeks | shelf |
| 8 | Accompany a melody | Studio: piano part of Be Thou My Vision for violin and piano, violin playing | Through without stopping, 80% | |
| 9 | Learn one by reading | Studio | The Entertainer or a Clementi movement at tempo, 90%, two days | shelf |

| # | Piece | Read for | Key, meter, notes | Diff | MuseScore score | Fallback |
|---|---|---|---|---|---|---|
| 1 | Bach, 371 Four-Part Chorales, Nos. 1 to 5 (piano score) | SATB on two staves, cadences | various keys | 2 | [community](https://musescore.com/user/1234691/scores/2427736) | [IMSLP](https://imslp.org/wiki/371_Vierstimmige_Choralgesänge_%28Bach,_Johann_Sebastian%29) |
| 2 | Bach's chorale harmonisations 1 to 120 (Breitkopf order) | a chorale a day for months | all keys to four accidentals | 2 to 3 | [community](https://musescore.com/user/11015626/scores/3117011) | [IMSLP](https://imslp.org/wiki/371_Vierstimmige_Choralgesänge_%28Bach,_Johann_Sebastian%29) |
| 3 | Bach, O Haupt voll Blut und Wunden (St Matthew Passion) | SATB, suspensions | 4/4 | 2 | [community](https://musescore.com/user/1630246/scores/4275891) |  |
| 4 | Hymn 136, Old Hundredth | four parts in half notes, the easiest start | 4/4 | 1 | [community](https://musescore.com/user/1461451/scores/1022231) |  |
| 5 | Hymn 14, Abide with Me | four parts, chromatic alto | 4/4 | 1 | [community](https://musescore.com/user/1461451/scores/1018241) |  |
| 6 | Hymn 135, Holy, Holy, Holy (Nicaea) | four parts, repeated chords | 4/4 | 1 | [community](https://musescore.com/user/1461451/scores/1025396) |  |
| 7 | Be Thou My Vision (violin and piano) | accompanying | 3/4 | 1 | [community](https://musescore.com/user/11081081/scores/11470078) |  |
| 8 | Joplin, The Entertainer | syncopation, LH stride | C major, 2/4 | 3 | [community](https://musescore.com/user/58480/scores/529126) | [IMSLP](https://imslp.org/wiki/The_Entertainer_%28Joplin,_Scott%29) |
| 9 | Burgmüller, Ballade Op. 100 No. 15 | C minor, LH staccato chords, RH melody in the LH | C minor | 2 | [community](https://musescore.com/user/9292486/scores/5849871) | [IMSLP](https://imslp.org/wiki/25_Études_faciles_et_progressives,_Op.100_%28Burgmüller,_Friedrich%29) |
| 10 | Clementi, Sonatina Op. 36 No. 3 | scales and broken octaves | C major | 3 | [community](https://musescore.com/user/9292486/scores/2052136) | [IMSLP](https://imslp.org/wiki/Sonatinas,_Op.36_%28Clementi,_Muzio%29) |

**Level test:** all `piano-7` rungs with at most 2 strikes; an unseen Bach chorale at 80% first pass; one learned shelf piece at tempo, 90%.

### Piano level 6: jazz lead sheets

Goal: play a jazz standard from a lead sheet at sight: melody in the right hand, shells then rootless voicings in the left, swung. Adds: seventh-chord symbols, ii-V-I in all keys, swing reading.

| # | Step | Drill and setup | Done means | Feeds |
|---|---|---|---|---|
| 1 | Shells | Voicings or Comping: root-3-7 for maj7, m7, 7 in 12 keys | Any symbol to shell within 2 s, 90% of 40 | all |
| 2 | ii-V-I shells round the circle | Comping, ii-V-I, 12 keys | All 12 at 100 bpm, 90%, two days | Autumn Leaves, Satin Doll |
| 3 | Swing reading | Rhythm track level 7; NEW swing playback in reading | Rhythm level 7 passed | all |
| 4 | Generated lead sheet with roots | NEW `lead-1` (melody RH, roots LH) | 80% first pass on 5 of 6 | |
| 5 | Generated lead sheet with shells | `lead-1`, LH shells | 80% first pass on 5 of 6 | |
| 6 | Rootless left hand | `lead-2` (A and B rootless forms) | 80% first pass on 5 of 6 | Misty, Georgia |
| 7 | Standards at sight | Studio, sight-read flag, shelf lead sheets at 100 bpm | 4 shelf tunes at 80% first pass | shelf |
| 8 | Learn one by reading, then improvise | Studio to 90%, then Jam with the tune's changes | One tune at tempo, 90%, plus one chorus over Jam kept | shelf |

| # | Piece | Read for | Key, meter, notes | Diff | MuseScore score | Fallback |
|---|---|---|---|---|---|---|
| 1 | Autumn Leaves (Real Book version, lyrics) | ii-V in major and relative minor | G minor, swing | 1 | [community](https://musescore.com/user/498481/scores/11144275) |  |
| 2 | Fly Me to the Moon (lead sheet with lyrics) | cycle of fifths | A minor / C major | 1 | [community](https://musescore.com/user/498481/scores/6326152) |  |
| 3 | Blue Bossa (lead sheet) | minor and major ii-V, bossa | C minor | 1 | [community](https://musescore.com/user/498481/scores/7467650) |  |
| 4 | Sonnymoon for Two (lead sheet) | 12-bar blues head | Bb, swing | 1 | [community](https://musescore.com/user/498481/scores/6554123) |  |
| 5 | Satin Doll (lead sheet in C) | ii-V chains | C major | 2 | [community](https://musescore.com/user/32454112/scores/25608463) |  |
| 6 | Take the "A" Train (lead sheet in C) | II7 with b5, chromatic melody | C major | 2 | [community](https://musescore.com/user/32454112/scores/20287948) |  |
| 7 | There Will Never Be Another You (lead sheet) | ii-V into IV, long form | Eb major | 2 | [community](https://musescore.com/user/498481/scores/6729024) |  |
| 8 | Summertime (Easy Lead Sheet) | minor blues-like form | A minor | 1 | [official](https://musescore.com/user/39593079/scores/15866803) |  |
| 9 | Misty (lead sheet with lyrics) | ballad, triplets, Ab bridge | Eb major | 3 | [community](https://musescore.com/user/498481/scores/6849482) |  |
| 10 | Georgia on My Mind (lead sheet in F) | secondary dominants, ballad | F major | 3 | [community](https://musescore.com/user/32454112/scores/14220202) |  |

**Level test:** two unseen shelf standards at 100 bpm with shells, 80% first pass; one learned standard with rootless voicings at tempo, 90%, and one improvised chorus over it.

### Piano level 7: ABRSM Grade 6

Goal: sight-read at ABRSM Grade 6, the path's piano target. Adds: triplets against duplets, 9/8, 5/4 and 5/8, clef changes, pedal marks, 12 to 16 bars, all keys to four sharps and four flats.

| # | Step | Drill and setup | Done means | Feeds |
|---|---|---|---|---|
| 1 | Triplets and mixed groups | Rhythm track level 6 (`triplet-2`) | Level passed | Moonlight, Debussy |
| 2 | Odd meters | Rhythm track level 8 (`odd`) | Level passed | Take Five |
| 3 | Left hand in the treble clef | NEW flashcards: LH notes on the treble clef and RH on the bass clef | 95% of 40 cards | Arietta, Gymnopédie |
| 4 | Pedal reading | Pedal drill (`/music/pedal`), legato pedal from marks | 90% clean changes over 16 chords | Gymnopédie, Chopin |
| 5 | Grade 6 phrases, first contact | NEW `piano-8`, wait | 5 phrases at 90% | |
| 6 | In time, longer | `piano-8`, performance, 12 to 16 bars | 80% on 5 of 6, two days | all |
| 7 | Further ahead | Look-ahead mask, 4 beats ahead visible | 80% on 5 of 6 with the mask | |
| 8 | A page a day | Studio, sight-read flag, one shelf piece or one IMSLP piece of the same grade daily | 15 pieces at 80% first pass over 3 weeks | shelf |
| 9 | Learn one by reading | Studio | One Chopin prelude or Grieg piece at tempo, 90%, two days | shelf |

| # | Piece | Read for | Key, meter, notes | Diff | MuseScore score | Fallback |
|---|---|---|---|---|---|---|
| 1 | Chopin, Prelude Op. 28 No. 4 | LH repeated chords that change one note at a time | E minor | 1 | [community](https://musescore.com/user/58480/scores/1156331) | [IMSLP](https://imslp.org/wiki/Preludes,_Op.28_%28Chopin,_Frédéric%29) |
| 2 | Chopin, Prelude Op. 28 No. 7 | 3/4, chords in both hands, short | A major | 1 | [community](https://musescore.com/user/19710/scores/60121) | [IMSLP](https://imslp.org/wiki/Preludes,_Op.28_%28Chopin,_Frédéric%29) |
| 3 | Chopin, Prelude Op. 28 No. 20 | four-note chords, dynamics | C minor | 2 | [community](https://musescore.com/user/19710/scores/75311) | [IMSLP](https://imslp.org/wiki/Preludes,_Op.28_%28Chopin,_Frédéric%29) |
| 4 | Satie, Gymnopédie No. 1 | pedal, wide LH, 3/4 | D major / modal | 1 | [community](https://musescore.com/user/19710/scores/4766391) | [IMSLP](https://imslp.org/wiki/3_Gymnopédies_%28Satie,_Erik%29) |
| 5 | Grieg, Waltz Op. 12 No. 2 | staccato, A minor | 3/4 | 2 | [community](https://musescore.com/user/9292486/scores/5260816) | [IMSLP](https://imslp.org/wiki/Lyric_Pieces,_Op.12_%28Grieg,_Edvard%29) |
| 6 | Grieg, Arietta Op. 12 No. 1 | melody over sixteenth arpeggios in the same hand | Eb major | 3 | [community](https://musescore.com/user/32334741/scores/5595942) | [IMSLP](https://imslp.org/wiki/Lyric_Pieces,_Op.12_%28Grieg,_Edvard%29) |
| 7 | Schumann, Träumerei Op. 15 No. 7 | inner voices, pedal | F major | 3 | [community](https://musescore.com/user/33397673/scores/5902660) | [IMSLP](https://imslp.org/wiki/Kinderszenen,_Op.15_%28Schumann,_Robert%29) |
| 8 | Beethoven, Moonlight Sonata, first movement | triplets, C# minor, pedal | C# minor, 2/2 | 3 | [community](https://musescore.com/user/19710/scores/55352) | [IMSLP](https://imslp.org/wiki/Piano_Sonata_No.14,_Op.27_No.2_%28Beethoven,_Ludwig_van%29) |
| 9 | Debussy, The Little Shepherd | free rhythm, triplets, rests | rubato, changing groupings | 3 | [community](https://musescore.com/user/5/scores/29517) | [IMSLP](https://imslp.org/wiki/Children's_Corner_%28Debussy,_Claude%29) |
| 10 | Take Five (Dave Brubeck, piano) | 5/4, vamp plus melody | Eb minor | 3 | [community](https://musescore.com/user/159276/scores/3164576) |  |

**Level test (the path's piano finish):** all `piano-8` rungs with at most 2 strikes on two days; an unseen Grade 6 standard piece (an ABRSM specimen sight-reading test or an IMSLP piece of that grade) at 80% first pass after a 30 second look; one learned shelf piece at tempo, 90%.

## 4. Guitar track (tab first, then standard notation in first and fifth position)

Order: tab with rhythm (riffs, then fingerstyle tab), then staff on strings 1 to 3 in open position, all six strings, sharps and flats with fiddle tunes, then position playing (Leavitt starts position reading in second position and builds positions by fingering type; this track aims at fifth position, the one the owner will use for jazz heads and the guitar path's pentatonic box 1 at fret 5), then chord charts and lead sheets, then two-voice classical reading. The owner reads treble from piano, so guitar staff reading is mostly mapping notes to frets: written pitch is an octave above sounding, which the app already handles (`notationTransposition`).

The reading page reads on the active instrument from the top bar, so every step below assumes guitar is active. **SR** = `/music/learn/reading?activity=sight-reading&clefs=treble`; **FC** = `/music/learn/reading?activity=flashcards&clefs=treble&answer=play`. Tab stays hidden on staff steps (the existing "Show tab" button stays off).

### Guitar level 1: tab with rhythm (riffs)

Goal: read single-note tab with rhythm stems in time. Adds: string and fret numbers, rhythm under tab, rests, palm mute and slide marks.

| # | Step | Drill and setup | Done means | Feeds |
|---|---|---|---|---|
| 1 | Tab on, first contact | SR `&level=primer&follower=wait`, Show tab on | 5 phrases at 90% | |
| 2 | Tab in time | SR `&level=level-1&follower=performance`, tab on, 80 bpm | 80% on 5 of 6, two days | all |
| 3 | Riff rhythms | Rhythm track levels 1 and 2 | Both passed | all |
| 4 | Riff a day | Studio, sight-read flag at 70% of the tempo | 6 shelf riffs at 80% first pass | shelf |
| 5 | Riffs at tempo | Studio, performance mode | Two riffs at the original tempo, 90%, two days | shelf |
| 6 | Read the marks | Studio on riffs with P.M., slides, hammer-ons (no new drill: the score shows them, grading ignores them) | Played as marked in two riffs (self-check against the recording afterwards) | Come As You Are, Enter Sandman |

| # | Piece | Read for | Key, meter, notes | Diff | MuseScore score | Fallback |
|---|---|---|---|---|---|---|
| 1 | Seven Nation Army (tab) | one string, quarter and eighth rhythm | E minor | 1 | [community](https://musescore.com/user/28217487/scores/5049198) |  |
| 2 | Iron Man (beginner tab) | slides, half and quarter notes | B minor | 1 | [community](https://musescore.com/user/31545341/scores/6355477) |  |
| 3 | Ode to Joy for Guitar (easy) | melody on strings 1 to 3 | C or G major | 1 | [community](https://musescore.com/user/31759757/scores/5529384) |  |
| 4 | Happy Birthday (easy tab) | 3/4, pickup | C major | 1 | [community](https://musescore.com/user/38350638/scores/7809068) |  |
| 5 | Smoke on the Water (Easy Guitar with TAB) | rests, syncopated riff | G minor | 1 | [official](https://musescore.com/user/39593079/scores/15265129) |  |
| 6 | Come As You Are (tab) | eighth-note riff, open strings | E minor | 2 | [community](https://musescore.com/user/33677850/scores/8261681) |  |
| 7 | Sunshine of Your Love (Easy Guitar with TAB) | blues-scale riff, dotted rhythm | D | 2 | [official](https://musescore.com/user/39593079/scores/15492442) |  |
| 8 | Enter Sandman (tab) | palm-mute riff, intro arpeggio | E minor | 3 | [community](https://musescore.com/user/36856471/scores/6588419) |  |
| 9 | Day Tripper (Easy Guitar with TAB) | sixteenth-note riff | E | 3 | [official](https://musescore.com/user/39593079/scores/15567487) |  |

**Level test:** two shelf riffs at the original tempo, 90%; one unseen riff at 80% first pass; SR `level-1` with tab at 90 bpm, 80%.

### Guitar level 2: fingerstyle tab

Goal: read fingerstyle tab with bass and melody voices. Adds: stems up and down in tab, arpeggio patterns, 3/4 and 6/8, let-ring, tremolo.

| # | Step | Drill and setup | Done means | Feeds |
|---|---|---|---|---|
| 1 | Patterns first | Chords `?mode=fingerpick`: Travis, p-i-m-a, 6/8 patterns | 3 patterns at 80 bpm, 90%, two days | all |
| 2 | Arpeggio tab | Studio: House of the Rising Sun, wait mode | First full pass | House of the Rising Sun |
| 3 | Two voices in tab | Studio: Amazing Grace fingerstyle, bass on beats, melody on top | 90% at 70 bpm | Amazing Grace |
| 4 | Triplet arpeggios in 3/4 | Studio: Spanish Romance part A | 90% at the marked tempo, two days | Spanish Romance |
| 5 | Sight-read the shelf | Studio, sight-read flag | 4 shelf pieces at 80% first pass at 70% tempo | shelf |
| 6 | Learn two by reading | Studio | Two shelf pieces at tempo, 90%, two days | shelf |

| # | Piece | Read for | Key, meter, notes | Diff | MuseScore score | Fallback |
|---|---|---|---|---|---|---|
| 1 | House of the Rising Sun (fingerstyle) | 6/8 arpeggios over Am-C-D-F | A minor | 1 | [official](https://musescore.com/user/97106398/scores/17746375) |  |
| 2 | Amazing Grace (fingerstyle guitar) | thumb bass with melody | G or C major, 3/4 | 1 | [community](https://musescore.com/user/63454372/scores/20106532) |  |
| 3 | What Child Is This? (Greensleeves, easy fingerstyle) | melody plus bass, 3/4 | E or A minor | 1 | [community](https://musescore.com/user/29150560/scores/13422814) |  |
| 4 | Tárrega, Etude in E minor | p-i-m-a arpeggios, melody in the bass | E minor | 2 | [community](https://musescore.com/user/1439191/scores/4899848) | [IMSLP](https://imslp.org/wiki/Category:Tárrega,_Francisco) |
| 5 | Spanish Romance (Romance anónimo) | triplet arpeggios, melody on string 1 | E minor, 3/4 | 2 | [community](https://musescore.com/user/1185841/scores/5254985) |  |
| 6 | Scarborough Fair (fingerstyle guitar tab) | Dorian melody with bass | 3/4 | 2 | [official](https://musescore.com/user/97106398/scores/17399749) |  |
| 7 | Easy Malagueña | thumb melody, flamenco feel | E Phrygian | 2 | [community](https://musescore.com/user/36936004/scores/10824946) |  |
| 8 | Pachelbel, Canon in D (solo guitar) | sequences, bass line | D major | 2 | [official](https://musescore.com/user/97106398/scores/17745235) |  |
| 9 | Blackbird (guitar tab) | pinch pattern, moving tenths | G major | 3 | [official](https://musescore.com/user/39593079/scores/15263302) |  |

**Level test:** two learned shelf pieces at tempo, 90%; one unseen shelf piece at 80% first pass.

### Guitar level 3: staff, strings 1 to 3 in open position

Goal: read the treble staff on the top three strings (written G4 to G5) without tab. The owner already reads treble: this level maps notes to frets. Adds: Mel Bay order (string 1, then 2, then 3), quarters to eighths, guitar sounding an octave below the staff.

| # | Step | Drill and setup | Done means | Feeds |
|---|---|---|---|---|
| 1 | Staff to fret, strings 1 to 3 | FC `&key=C%20major&low=67&high=79` (G4 to G5 written); NEW staff prompt in the note finder (guitar.md R8) | 95% of 40 cards, two days | all |
| 2 | First contact | SR `&level=primer&follower=wait`, NEW `position=open-123`, tab hidden | 5 phrases at 90% | |
| 3 | In time | SR `primer`, then `level-1`, `position=open-123`, performance at 72 | 80% on 5 of 6, two days | all |
| 4 | Follow by ear | Ear `wrong-note?level=major-diatonic` | 80% | |
| 5 | Sight-read the shelf | Studio, sight-read flag, tab hidden | 5 shelf melodies at 80% first pass | shelf |
| 6 | Play a duet part | Studio: Marques Easy Duet No. 6, one part with the app on the other | Through, 80% | Marques |

| # | Piece | Read for | Key, meter, notes | Diff | MuseScore score | Fallback |
|---|---|---|---|---|---|---|
| 1 | Ode to Joy for Guitar (easy) | steps on strings 1 and 2 | C major | 1 | [community](https://musescore.com/user/31759757/scores/5529384) |  |
| 2 | Lightly Row (guitar) | steps and thirds, half notes | C or G major | 1 | [community](https://musescore.com/user/34381655/scores/6023108) |  |
| 3 | Twinkle Twinkle Little Star | leaps of a fifth, repeated notes | C major | 1 | [community](https://musescore.com/user/26329/scores/45923) |  |
| 4 | Aura Lee / Love Me Tender | long notes, ties | 4/4 | 1 | [community](https://musescore.com/user/216766/scores/6764710) |  |
| 5 | Jingle Bells (easy guitar) | repeated notes, eighths | C or G major | 1 | [community](https://musescore.com/user/3443396/scores/13225582) |  |
| 6 | Jingle Bells (classical guitar) | same tune, melody plus open bass | C or G major | 2 | [community](https://musescore.com/user/25796096/scores/7275426) |  |
| 7 | First Position Melodies for Guitar | a page of graded first-position tunes | C, G, A minor | 2 | [community](https://musescore.com/user/28357962/scores/8488664) |  |
| 8 | Brahms, Lullaby (Easy Guitar with TAB) | 3/4, ties, read the staff line | 3/4 | 2 | [official](https://musescore.com/user/39593079/scores/15672847) |  |
| 9 | J. O. Marques, Six Easy Duets No. 6 | duet reading | C major | 2 | [community](https://musescore.com/user/29577314/scores/5624874) |  |

**Level test:** SR `level-1`, `open-123`, 80% on all three keys of the level; two unseen shelf melodies at 80% first pass, tab hidden.

### Guitar level 4: staff, all six strings in open position

Goal: read the whole first position (written E3 to A5) including bass notes under a melody. Adds: strings 4 to 6, ledger lines below the staff, keys G, D, A minor, E minor, simple two-voice writing.

| # | Step | Drill and setup | Done means | Feeds |
|---|---|---|---|---|
| 1 | Staff to fret, strings 4 to 6 | FC `&low=52&high=67` (E3 to G4 written), then the full range 52 to 81 | 95% of 40 cards per range | all |
| 2 | Line reading, full range | SR `level-2`, `position=open`, wait then performance at 72 | 80% on 5 of 6, two days | all |
| 3 | Keys G, D, A minor, E minor | SR `level-2&key=...`; Scales, guitar, open position | Each key 80% on 5 of 6; scales clean at 80 | Carcassi, Sor |
| 4 | Bass and melody | Studio: Sagreras First Lessons 1 to 16, one a day | 10 lessons at 80% first pass | Sagreras |
| 5 | Sight-read the shelf | Studio, sight-read flag | 5 shelf pieces at 80% first pass | shelf |
| 6 | Learn one by reading | Studio | One study at tempo, 90%, two days | shelf |

| # | Piece | Read for | Key, meter, notes | Diff | MuseScore score | Fallback |
|---|---|---|---|---|---|---|
| 1 | Sagreras, First Lessons Book 1 (Nos. 1 to 16) | graded open-position lessons, bass plus melody | C, A minor, G | 1 | [community](https://musescore.com/user/385716/scores/5958994) | [IMSLP](https://imslp.org/wiki/Category:Sagreras,_Julio_Salvador) |
| 2 | Sor, Op. 60 No. 1 | melody plus open bass | C major | 1 | [community](https://musescore.com/user/17866706/scores/23199733) | [IMSLP](https://imslp.org/wiki/Introduction_à_l'étude_de_la_guitare,_Op.60_%28Sor,_Fernando%29) |
| 3 | Carulli, Andantino | melody in thirds, bass on the beat | C major | 2 | [community](https://musescore.com/user/1185841/scores/5349333) | [IMSLP](https://imslp.org/wiki/École_de_guitare,_Op.241_%28Carulli,_Ferdinando%29) |
| 4 | Carulli, Andantino Op. 241 No. 5 | two voices in G | G major | 2 | [community](https://musescore.com/user/40069752/scores/7185591) | [IMSLP](https://imslp.org/wiki/École_de_guitare,_Op.241_%28Carulli,_Ferdinando%29) |
| 5 | Carcassi, Allegretto (Op. 59) | arpeggio study with melody | C or A minor | 2 | [community](https://musescore.com/user/385716/scores/5168238) | [IMSLP](https://imslp.org/wiki/Méthode_complète_pour_la_guitare,_Op.59_%28Carcassi,_Matteo%29) |
| 6 | Carcassi, Waltz in A minor (Op. 59) | 3/4 bass-chord-chord | A minor | 2 | [community](https://musescore.com/user/34318809/scores/6709113) | [IMSLP](https://imslp.org/wiki/Méthode_complète_pour_la_guitare,_Op.59_%28Carcassi,_Matteo%29) |
| 7 | Küffner, Melodic Etude | single line with bass, open position | C major | 2 | [community](https://musescore.com/user/1185841/scores/5819227) | [IMSLP](https://imslp.org/wiki/60_Lessons_for_2_Guitars,_Op.168_%28Küffner,_Joseph%29) |
| 8 | Scarborough Fair (English folk song, guitar) | Dorian melody with bass | 3/4 | 2 | [community](https://musescore.com/user/39305463/scores/6867369) |  |
| 9 | Greensleeves with variations (solo guitar) | melody, bass, variation figures | A or E minor | 3 | [community](https://musescore.com/user/31497124/scores/6660731) |  |
| 10 | Petzold, Minuet in G (classical guitar) | two-voice Baroque | G major, 3/4 | 3 | [community](https://musescore.com/user/31105776/scores/5422442) |  |

**Level test:** SR `level-2`, `position=open`, all keys of the level at 80%; one unseen Sagreras lesson at 80% first pass; one learned study at tempo, 90%.

### Guitar level 5: sharps, flats and fiddle tunes

Goal: read busy eighth-note lines with accidentals in G, D, A and F, and 6/8 jigs. Adds: F# and C# fingerings, Bb and F, dotted rhythms, ties, pickups, flatpicking reading.

| # | Step | Drill and setup | Done means | Feeds |
|---|---|---|---|---|
| 1 | Accidentals on the neck | NEW flashcards with accidentals, guitar range | 95% of 40 cards | all |
| 2 | Line reading with ties and rests | NEW `line-4`, `position=open`, keys G, D, F | 80% on 5 of 6 per key, two days | all |
| 3 | 6/8 lines | Rhythm track level 3, then NEW `line-5&meter=compound` | 80% on 5 of 6 | jigs |
| 4 | Alternate picking in tune rhythm | Fretboard `?mode=positions` scales in G and D, alternate picking at 100 | Clean at 100, two days | reels |
| 5 | A tune a day | Studio, sight-read flag at 70% tempo | 8 shelf tunes at 80% first pass | shelf |
| 6 | Learn two at session tempo | Studio | Two tunes at 90% at 100 to 110 (reels) or dotted quarter = 90 (jigs), two days | shelf |

| # | Piece | Read for | Key, meter, notes | Diff | MuseScore score | Fallback |
|---|---|---|---|---|---|---|
| 1 | Red River Valley (G, with tab) | warm-up: long notes, ties | G major | 1 | [community](https://musescore.com/user/11562121/scores/5545284) |  |
| 2 | Star of the County Down | 3/4, Dorian/minor | E minor | 1 | [community](https://musescore.com/user/29129215/scores/6220973) | [The Session](https://thesession.org/tunes/search?q=star+of+the+county+down) |
| 3 | Turkey in the Straw | eighth-note fiddle line | G major | 1 | [community](https://musescore.com/user/14689216/scores/5047545) | [The Session](https://thesession.org/tunes/search?q=turkey+in+the+straw) |
| 4 | Soldier's Joy | reel, D major, string crossing | D major | 2 | [community](https://musescore.com/user/34876540/scores/6418197) | [The Session](https://thesession.org/tunes/search?q=soldiers+joy) |
| 5 | Arkansas Traveler | reel with accidentals | D major | 2 | [community](https://musescore.com/user/385716/scores/6458788) | [The Session](https://thesession.org/tunes/search?q=arkansas+traveler) |
| 6 | Whiskey Before Breakfast (two guitars) | reel, duet reading | D major | 2 | [community](https://musescore.com/user/31005854/scores/6453568) | [The Session](https://thesession.org/tunes/search?q=whiskey+before+breakfast) |
| 7 | Irish Washerwoman | 6/8 jig | G major | 2 | [community](https://musescore.com/user/114629/scores/530111) | [The Session](https://thesession.org/tunes/search?q=irish+washerwoman) |
| 8 | Swallowtail Jig (with tabs) | 6/8 jig in E minor | E minor | 2 | [community](https://musescore.com/user/30091220/scores/7767446) | [The Session](https://thesession.org/tunes/search?q=swallowtail+jig) |
| 9 | Wildwood Flower (Maybelle Carter) | thumb melody with brush strums | C major | 2 | [community](https://musescore.com/user/28357962/scores/6369045) |  |
| 10 | Salt Creek | bluegrass reel, A major | A major | 3 | [community](https://musescore.com/user/36989/scores/2056161) | [The Session](https://thesession.org/tunes/search?q=salt+creek) |

**Level test:** `line-4` and `line-5` at 80% first pass; two unseen fiddle tunes from The Session at 80% first pass at 80 bpm; two learned tunes at session tempo, 90%.

### Guitar level 6: position reading (second, then fifth position)

Goal: read in fifth position (written A3 to C6) without looking for open strings. Leavitt's order: position reading starts in second position and builds positions by fingering pattern; this level does second position for a week, then fifth position for the rest. Adds: one finger per fret, shifting only between phrases, reading violin and flute parts.

| # | Step | Drill and setup | Done means | Feeds |
|---|---|---|---|---|
| 1 | Scales in position | Fretboard `?mode=positions`, major scale fingerings at fret 2 and fret 5 | Clean at 90 bpm in C, G, F, two days | all |
| 2 | Note finder in position | Fretboard `?mode=find`, frets 4 to 9 only (NEW fret window) | 95% of 40 | all |
| 3 | Second position lines | NEW `line-4&position=2` | 80% on 5 of 6 | |
| 4 | Fifth position lines | NEW `line-4&position=5`, then `line-5&position=5` | 80% on 5 of 6 each, two days | all |
| 5 | Violin and flute parts | Studio: shelf violin and flute parts read in fifth position (they sound an octave lower on guitar, which is fine) | 5 pieces at 80% first pass | shelf |
| 6 | Jazz heads in position | Studio: Autumn Leaves and Blue Bossa melodies in fifth position | Both at 90% at 120 bpm | Autumn Leaves, Blue Bossa |
| 7 | Learn one by reading | Studio | One violin piece at tempo, 90%, two days | shelf |

| # | Piece | Read for | Key, meter, notes | Diff | MuseScore score | Fallback |
|---|---|---|---|---|---|---|
| 1 | Bach, Minuet in G (violin) | position reading, 3/4 | G major | 1 | [community](https://musescore.com/user/37890/scores/3401256) |  |
| 2 | Long, Long Ago (violin) | slow line, dotted rhythm | D or G major | 1 | [community](https://musescore.com/user/117206/scores/128316) |  |
| 3 | Gossec, Gavotte (violin) | staccato eighths, grace notes | D or G major | 2 | [community](https://musescore.com/user/26850820/scores/5769244) |  |
| 4 | Danny Boy (flute) | wide range, long phrases | 4/4 | 2 | [community](https://musescore.com/user/43099/scores/61472) |  |
| 5 | Ashokan Farewell (violin and piano) | 3/4, double stops optional | D major | 2 | [community](https://musescore.com/user/31552497/scores/6841351) |  |
| 6 | Autumn Leaves (easy guitar melody with jam track) | jazz head in position | E minor or G minor | 2 | [community](https://musescore.com/user/19417841/scores/6755021) |  |
| 7 | Blue Bossa | minor jazz head | C minor | 2 | [community](https://musescore.com/user/175333/scores/523301) |  |
| 8 | Dvořák, Humoresque (violin and cello duet, read the violin) | dotted rhythms, chromatic | Gb or G major | 3 | [community](https://musescore.com/user/28857272/scores/5513326) |  |
| 9 | Leavitt, A Modern Method for Guitar Vol. 1 (position studies) | the method's own reading studies | C, G, F in position | 2 to 3 | none suitable | book (Berklee Press), no score on MuseScore |

**Level test:** `line-5&position=5` at 80% first pass on 5 of 6; one unseen violin or flute piece in fifth position at 80% first pass; Autumn Leaves head at 120 bpm, 90%.

### Guitar level 7: chord charts, slash rhythm and lead sheets

Goal: comp from a chart at sight and read a lead sheet melody. Adds: slash notation, rhythm hits, repeat signs and codas, jazz chord symbols, comping notation.

| # | Step | Drill and setup | Done means | Feeds |
|---|---|---|---|---|
| 1 | Symbols to shapes | Chords `?mode=pick` and `?mode=changes` with the guitar path's shapes, sevenths included | 90% of 40, changes at 80 bpm | all |
| 2 | Strum from a chart | Strum `/music/strum` over a progression with a named pattern | 90% at 90 bpm, two days | Stand By Me, Wonderwall |
| 3 | Generated charts | NEW `chart-1` and `chart-2` on guitar | 80% first pass on 5 of 6 | |
| 4 | Hear the loop | Ear path steps 5 and 10 | Passed | |
| 5 | Navigation | Studio: a shelf chart with repeats, first and second endings, D.S. al Coda | Through without getting lost, 80% | Hotel California, Sunny Side |
| 6 | Jazz comping from a lead sheet | Comping drill shells on guitar (3-note shells), then Studio on Blue Bossa and Autumn Leaves | 90% at 100 bpm | Autumn Leaves, Blue Bossa |
| 7 | Sight-read the shelf | Studio, sight-read flag: chords only, then melody | 4 charts at 80% first pass | shelf |

| # | Piece | Read for | Key, meter, notes | Diff | MuseScore score | Fallback |
|---|---|---|---|---|---|---|
| 1 | Stand By Me (lead sheet) | I-vi-IV-V chart, riff in the bass | 4/4 | 1 | [community](https://musescore.com/user/28057894/scores/6220414) |  |
| 2 | Wonderwall (Oasis) | strum chart, syncopated sixteenths | F# minor (capo) | 2 | [community](https://musescore.com/user/6375061/scores/5416226) |  |
| 3 | Hotel California (Guitar Tab Play-Along) | chart plus arpeggio parts, long form | B minor | 3 | [official](https://musescore.com/user/39593079/scores/15609961) |  |
| 4 | On the Sunny Side of the Street (lead sheet) | swing chart, ii-V | C major | 2 | [community](https://musescore.com/user/4919816/scores/2589416) |  |
| 5 | Autumn Leaves (Real Book, guitar) | jazz chart, ii-V | G minor | 2 | [community](https://musescore.com/user/96361/scores/5197081) |  |
| 6 | Blue Bossa (lead sheet) | bossa comping, minor ii-V | C minor | 2 | [community](https://musescore.com/user/498481/scores/7467650) |  |
| 7 | Corcovado (lead sheet with lyrics) | bossa, chromatic chords | C major | 3 | [community](https://musescore.com/user/498481/scores/6436734) |  |
| 8 | Wave (lead sheet with lyrics) | bossa, slash chords | D major | 3 | [community](https://musescore.com/user/498481/scores/6478474) |  |
| 9 | Jazz blues, two choruses with walking bass and comping | written comping rhythms | F or Bb | 2 | [community](https://musescore.com/user/36384395/scores/7131117) |  |
| 10 | Wes Montgomery's comping on The End of a Love Affair | transcribed comping, chord notation | 4/4 swing | 3 | [community](https://musescore.com/user/32774702/scores/6860207) |  |

**Level test:** two unseen shelf charts at sight with the right form and rhythm, 80%; one lead sheet melody plus comping (record both) at 100 bpm, 90%.

### Guitar level 8: two-voice classical reading

Goal: learn a two-voice classical study from the staff alone, with fingerings and positions. Adds: stems up and down, ties inside voices, position markings (Roman numerals), barre marks, B minor and E major.

| # | Step | Drill and setup | Done means | Feeds |
|---|---|---|---|---|
| 1 | Two voices on one staff | Studio wait mode on Carulli Andante, voices coloured | First full pass | Carulli |
| 2 | Position marks and barres | Studio: Sor Op. 35 No. 22, read the Roman numerals before playing | 90% at 60 bpm | Sor |
| 3 | Arpeggio with melody on top | Studio: Carcassi Op. 60 No. 1 | 90% at 72 | Carcassi |
| 4 | Sight-read the shelf | Studio, sight-read flag, 60% tempo | 4 shelf studies at 80% first pass | shelf |
| 5 | Learn two by reading | Studio | Two pieces at tempo, 90%, two days | shelf |
| 6 | Two voices, one at a time | Studio: mute the bass voice, then the melody, on the shelf piece being learned | Each voice alone at 90%, then both together at 80% | Bourrée, Lágrima |

| # | Piece | Read for | Key, meter, notes | Diff | MuseScore score | Fallback |
|---|---|---|---|---|---|---|
| 1 | Aguado, Waltz | bass and melody | 3/4 | 1 | [community](https://musescore.com/user/33668138/scores/14751475) | [IMSLP](https://imslp.org/wiki/Category:Aguado,_Dionisio) |
| 2 | Carulli, Andante Op. 241 No. 18 | two voices, slow | 4/4 | 1 | [community](https://musescore.com/user/385716/scores/4836241) | [IMSLP](https://imslp.org/wiki/École_de_guitare,_Op.241_%28Carulli,_Ferdinando%29) |
| 3 | Sor, Etude No. 15 Op. 44 | progressive two-voice piece | various | 1 | [community](https://musescore.com/user/385716/scores/1573236) | [IMSLP](https://imslp.org/wiki/Category:Sor,_Fernando) |
| 4 | Sor, Etude Op. 35 No. 22 | B minor, positions, melody in the top voice | B minor | 2 | [community](https://musescore.com/user/385716/scores/1842261) | [IMSLP](https://imslp.org/wiki/Category:Sor,_Fernando) |
| 5 | Giuliani, Le Papillon Op. 50 | short progressive pieces | C, G, A minor | 2 | [community](https://musescore.com/user/385716/scores/4242401) | [IMSLP](https://imslp.org/wiki/Le_papillon,_Op.50_%28Giuliani,_Mauro%29) |
| 6 | Tárrega, Lágrima | E major to E minor, positions | E major | 2 | [community](https://musescore.com/user/6267726/scores/5015975) | [IMSLP](https://imslp.org/wiki/Lágrima_%28Tárrega,_Francisco%29) |
| 7 | Carcassi, Etude Op. 60 No. 1 | scale runs in positions | C major | 3 | [community](https://musescore.com/user/385716/scores/5541987) | [IMSLP](https://imslp.org/wiki/Etudes,_Op.60_%28Carcassi,_Matteo%29) |
| 8 | Tárrega, Adelita (tab version) | mazurka, slurs, positions | E minor | 3 | [community](https://musescore.com/user/8399951/scores/6026241) | [IMSLP](https://imslp.org/wiki/Category:Tárrega,_Francisco) |
| 9 | Romance de Amor (Tabei version) | full piece, barre at VII | E minor and E major | 3 | [community](https://musescore.com/user/29755265/scores/5575060) |  |
| 10 | Bach, Bourrée in E minor (BWV 996) | true two-part counterpoint | E minor | 3 | [community](https://musescore.com/user/3546/scores/4041) | [IMSLP](https://imslp.org/wiki/Suite_in_E_minor,_BWV_996_%28Bach,_Johann_Sebastian%29) |

**Level test (the path's guitar finish):** one unseen Sagreras or Carulli piece at 80% first pass; `line-5&position=5` at 80% first pass; one learned two-voice piece (Lágrima, Sor Op. 35 No. 22 or the Bourrée) at tempo, 90%, on two days.

## 5. Ukulele track (tab and staff, James Hill style)

JHUI teaches reading beside strumming and melody picking from the first lesson; Book 1 uses open-string melodies and the C scale, Book 2 adds chromatic notes and secondary dominants. Ukulele here is GCEA high G (re-entrant), read at pitch in treble clef. Because the owner reads treble already, the track moves quickly to melody plus chords and chord-melody solos, where staff plus tab is the normal format.

Ukulele must be the active instrument. **SR** and **FC** as in the guitar track.

### Ukulele level 1: tab with rhythm

Goal: read ukulele tab with rhythm, including the re-entrant G string. Adds: four-line tab, open-string melodies, 3/4.

| # | Step | Drill and setup | Done means | Feeds |
|---|---|---|---|---|
| 1 | Tab on, first contact | SR `&level=primer&follower=wait`, Show tab on | 5 phrases at 90% | |
| 2 | Tab in time | SR `level-1`, performance, tab on, 80 bpm | 80% on 5 of 6, two days | all |
| 3 | Rhythm under tab | Rhythm track levels 1 and 2 (shared with the other tracks) | Passed | all |
| 4 | Sight-read the shelf | Studio, sight-read flag | 5 shelf pieces at 80% first pass | shelf |
| 5 | Learn two by reading | Studio | Two pieces at tempo, 90%, two days | shelf |
| 6 | Strum a chart beside the tab | Strum `/music/strum`, ukulele island strum (`ukulele-island-strum`) over a four-chord loop | 90% at 90 bpm, two days | Riptide, Can't Help Falling in Love |

| # | Piece | Read for | Key, meter, notes | Diff | MuseScore score | Fallback |
|---|---|---|---|---|---|---|
| 1 | Ode to Joy (ukulele tab) | steps, open strings | C major | 1 | [community](https://musescore.com/user/37578363/scores/6648635) |  |
| 2 | Twinkle Twinkle Little Star (Ah! vous dirai-je, maman) | leaps of a fifth, C string | C major | 1 | [community](https://musescore.com/user/30473545/scores/5469840) |  |
| 3 | Jingle Bells (ukulele) | repeated notes, eighths | C major | 1 | [community](https://musescore.com/user/17718736/scores/5182175) |  |
| 4 | Happy Birthday (ukulele tab) | 3/4 with pickup | C major | 1 | [community](https://musescore.com/user/28223429/scores/8356017) |  |
| 5 | Seven Nation Army (ukulele) | one-string riff | 4/4 | 1 | [community](https://musescore.com/user/1088806/scores/2033696) |  |
| 6 | Can't Help Falling in Love (ukulele) | 3/4 (12/8 feel), melody plus chords | C major | 2 | [community](https://musescore.com/user/35093617/scores/6506276) |  |
| 7 | Riptide (Vance Joy, ukulele) | strum chart plus tab intro | 4/4 | 2 | [official](https://musescore.com/user/39593079/scores/15647179) |  |
| 8 | Over the Rainbow (Jake Shimabukuro arrangement, tab) | full solo in tab, harder | C major | 3 | [official](https://musescore.com/user/39593079/scores/15793696) |  |

**Level test:** two shelf pieces at tempo, 90%; SR `level-1` with tab at 90 bpm, 80% first pass.

### Ukulele level 2: staff in first position

Goal: read the staff on all four strings in first position (C4 to C5) without tab. JHUI Book 1 order: open strings, then the C scale, then melodies. Adds: C, F and G scales, quarter to eighth rhythms, dotted half notes.

| # | Step | Drill and setup | Done means | Feeds |
|---|---|---|---|---|
| 1 | Staff to fret | FC `&key=C%20major&low=60&high=72` | 95% of 40 cards | all |
| 2 | First contact | SR `primer`, NEW `position=open`, tab hidden, wait | 5 phrases at 90% | |
| 3 | In time | SR `level-1`, `position=open`, performance at 72 | 80% on 5 of 6, two days | all |
| 4 | Scales in C, F, G | Scales, ukulele, first position | Clean at 80 in each key | Oh Susanna, Kumbaya |
| 5 | Follow by ear | Ear `wrong-note?level=major-diatonic` | 80% | |
| 6 | Sight-read the shelf | Studio, sight-read flag, tab hidden | 5 shelf melodies at 80% first pass | shelf |

| # | Piece | Read for | Key, meter, notes | Diff | MuseScore score | Fallback |
|---|---|---|---|---|---|---|
| 1 | Mary Had a Little Lamb | three notes, then five | C major | 1 | [community](https://musescore.com/user/25292606/scores/4582611) |  |
| 2 | Aura Lee | half notes and ties | 4/4 | 1 | [community](https://musescore.com/user/1916456/scores/5000271) |  |
| 3 | Frère Jacques (ukulele) | a round: play it against the app | 4/4 | 1 | [community](https://musescore.com/user/30013820/scores/7850087) |  |
| 4 | Kumbaya (ukulele) | dotted half notes, repeated phrases | 3/4 or 4/4 | 1 | [official](https://musescore.com/user/97106398/scores/19316764) |  |
| 5 | Amazing Grace (Lesson 1 song, for ukulele) | 3/4, pickup, ties | C major | 1 | [community](https://musescore.com/user/28001497/scores/8856255) |  |
| 6 | When the Saints (ukulele, picked) | pickup notes, long ties | C major | 1 | [community](https://musescore.com/user/30013820/scores/6077813) |  |
| 7 | Oh Susanna (ukulele) | eighth notes, syncopated tie | C or F major | 2 | [community](https://musescore.com/user/31545341/scores/6797286) |  |
| 8 | Amazing Grace (ukulele TAB, fingerstyle) | melody plus open strings | C major | 2 | [community](https://musescore.com/user/30473545/scores/5469855) |  |

**Level test:** SR `level-1`, `position=open`, 80% first pass in C, F and G; two unseen shelf melodies at 80% first pass, tab hidden.

### Ukulele level 3: melody plus chord symbols, 3/4 and 6/8

Goal: read a melody and strum or pinch its chords from symbols, the core of JHUI's "melody picking beside strumming". Adds: chord symbols over the staff, 3/4 and 6/8, minor keys.

| # | Step | Drill and setup | Done means | Feeds |
|---|---|---|---|---|
| 1 | Symbols to shapes | Chords `?mode=pick` and `?mode=changes` (ukulele) | 90% of 40; changes at 80 bpm | all |
| 2 | 6/8 lines | Rhythm track level 3; NEW `line-4&meter=compound`, `position=open` | 80% on 5 of 6 | Greensleeves, Danny Boy |
| 3 | Hear the chords | Ear path step 5 (I, IV, V) | Passed | all |
| 4 | Melody then chords | Studio: read a shelf tune's melody, then strum its chords, then pinch chord plus melody note on the beat | One tune all three ways at 90% | shelf |
| 5 | Sight-read the shelf | Studio, sight-read flag | 5 shelf tunes at 80% first pass | shelf |
| 6 | Learn two by reading | Studio | Two tunes at tempo, 90%, two days | shelf |

| # | Piece | Read for | Key, meter, notes | Diff | MuseScore score | Fallback |
|---|---|---|---|---|---|---|
| 1 | Aloha 'Oe | 4/4, Hawaiian standard | C or F major | 1 | [community](https://musescore.com/user/1630156/scores/1755726) |  |
| 2 | Edelweiss (ukulele instrumental) | 3/4 melody with chords | C major | 1 | [community](https://musescore.com/user/10633211/scores/6621255) |  |
| 3 | Home on the Range (Easy Ukulele with Tab) | 3/4, long notes | 3/4 | 1 | [official](https://musescore.com/user/39593079/scores/15920431) |  |
| 4 | Red River Valley (from The Daily Ukulele) | chords over melody | 4/4 | 1 | [official](https://musescore.com/user/39593079/scores/15786244) |  |
| 5 | Scarborough Fair | Dorian, 3/4 | A minor (Dorian) | 2 | [community](https://musescore.com/user/30013820/scores/6066764) |  |
| 6 | Greensleeves for Ukulele | 6/8 or 3/4 minor, raised 6 and 7 | A minor | 2 | [community](https://musescore.com/user/4243351/scores/1290326) |  |
| 7 | Danny Boy (UkeTab) | wide melody, long phrases | C major | 2 | [community](https://musescore.com/user/35414904/scores/6206352) |  |
| 8 | Shenandoah (ukulele arrangement) | slow, wide leaps | 4/4 | 2 | [community](https://musescore.com/user/26270971/scores/4717406) |  |

**Level test:** one unseen tune at 80% first pass as melody, then as chords; one learned tune with melody and chords at tempo, 90%.

### Ukulele level 4: up the neck, Celtic and classical lines

Goal: read in higher positions (to fret 7 on the A string) and fast tune rhythms. Adds: E5 and above, sixteenths, jigs in 6/8, campanella fingerings (notes ringing across strings).

| # | Step | Drill and setup | Done means | Feeds |
|---|---|---|---|---|
| 1 | Notes up the neck | Fretboard `?mode=find` on ukulele, frets 5 to 10 | 95% of 40 | all |
| 2 | Higher lines | NEW `line-5&position=up` | 80% on 5 of 6, two days | all |
| 3 | Campanella | Studio: Cripple Creek (campanella style), wait mode, follow the given strings | 90% at 80 bpm | Cripple Creek, Canon |
| 4 | Sight-read the shelf | Studio, sight-read flag, 70% tempo | 5 shelf pieces at 80% first pass | shelf |
| 5 | Learn two by reading | Studio | Two pieces at tempo, 90%, two days | shelf |
| 6 | Fiddle-tune rhythm | Rhythm track levels 3 (6/8) and 4 (sixteenths) | Both passed | jigs, reels |

| # | Piece | Read for | Key, meter, notes | Diff | MuseScore score | Fallback |
|---|---|---|---|---|---|---|
| 1 | Für Elise (ukulele) | A section up the neck, accidentals | A minor | 2 | [community](https://musescore.com/user/35628773/scores/6266819) |  |
| 2 | Petzold, Minuet in G (ukulele) | Baroque line, 3/4 | G major | 2 | [community](https://musescore.com/user/38278560/scores/12110551) |  |
| 3 | Canon in C (ukulele) | sequences, campanella runs | C major | 2 | [community](https://musescore.com/user/29535937/scores/5605059) |  |
| 4 | Spanish Romance (ukulele) | triplet arpeggios | A minor | 3 | [community](https://musescore.com/user/35093617/scores/6570289) |  |
| 5 | Swallowtail Jig (ukulele) | 6/8 jig | E minor | 3 | [community](https://musescore.com/user/2783316/scores/6984205) | [The Session](https://thesession.org/tunes/search?q=swallowtail+jig) |
| 6 | Arkansas Traveler (ukulele) | reel, campanella | D major | 3 | [official](https://musescore.com/user/97106398/scores/18037828) | [The Session](https://thesession.org/tunes/search?q=arkansas+traveler) |
| 7 | Soldier's Joy (ukulele) | reel | D major | 3 | [official](https://musescore.com/user/97106398/scores/18037876) | [The Session](https://thesession.org/tunes/search?q=soldiers+joy) |
| 8 | Cripple Creek (campanella style, high G) | bluegrass in campanella fingering | A or G major | 3 | [community](https://musescore.com/user/54234609/scores/11747773) |  |

**Level test:** `line-5&position=up` at 80% first pass; one unseen fiddle tune at 80% first pass at 80 bpm; one learned campanella piece at tempo, 90%.

### Ukulele level 5: chord-melody solos from staff and tab

Goal: learn a chord-melody solo by reading staff plus tab, the ukulele "pretty well" target. Adds: melody on top of chord shapes, partial chords, rhythm inside a solo arrangement.

| # | Step | Drill and setup | Done means | Feeds |
|---|---|---|---|---|
| 1 | Melody note on top | Chords `?mode=build` (ukulele): voice a chord with a named top note | 90% of 30 | all |
| 2 | Pinch patterns | Chords `?mode=fingerpick`, ukulele pinch and 3/4 patterns | 90% at 80 bpm | Can't Help Falling, Hallelujah |
| 3 | Read a solo slowly | Studio wait mode on one shelf solo, staff and tab both | First full pass | shelf |
| 4 | Sight-read the shelf | Studio, sight-read flag at 60% tempo | 4 shelf solos at 80% first pass | shelf |
| 5 | Learn two by reading | Studio | Two solos at tempo, 90%, two days | shelf |
| 6 | Fade the tab | Studio with Show tab off on a learned solo | 90% with the tab hidden | shelf |

| # | Piece | Read for | Key, meter, notes | Diff | MuseScore score | Fallback |
|---|---|---|---|---|---|---|
| 1 | Can't Help Falling in Love (ukulele and piano) | melody plus chords, 3/4 | C major | 1 | [community](https://musescore.com/user/28001497/scores/8173992) |  |
| 2 | Yesterday (Easy Ukulele with Tab) | melody with chord stabs | F major | 1 | [official](https://musescore.com/user/39593079/scores/15936490) |  |
| 3 | Hallelujah (ukulele, picked) | 12/8 chord melody | C major | 2 | [community](https://musescore.com/user/30013820/scores/7663133) |  |
| 4 | Somewhere over the Rainbow (ukulele transcription) | Iz-style solo | C major | 2 | [community](https://musescore.com/user/27061700/scores/4985026) |  |
| 5 | La Vie en Rose (chord melody) | swing chord melody | C major | 2 | [community](https://musescore.com/user/33403748/scores/6025714) |  |
| 6 | Blackbird (for ukulele) | moving thirds and tenths | G major | 2 | [community](https://musescore.com/user/37977307/scores/6892239) |  |
| 7 | Hallelujah (Jake Shimabukuro) | full solo, harder | C major | 3 | [community](https://musescore.com/user/37265061/scores/6770149) |  |
| 8 | Moon River for Jazz Ukulele | 3/4, jazz chord melody | C major | 3 | [community](https://musescore.com/user/33445730/scores/6276010) |  |

**Level test:** two learned chord-melody solos at tempo, 90%, on two days; one unseen solo at 80% first pass at 60% tempo.

### Ukulele level 6: chromatic and jazz reading (JHUI Book 2 territory)

Goal: read chromatic melodies with secondary dominants and swing, and longer campanella pieces. Adds: accidentals in tunes, swing eighths, dominant sevenths, Bach on ukulele.

| # | Step | Drill and setup | Done means | Feeds |
|---|---|---|---|---|
| 1 | Accidentals on the ukulele | NEW flashcards with accidentals, ukulele range | 95% of 40 | all |
| 2 | Swing reading | Rhythm track level 7 | Passed | Ain't She Sweet, Five Foot Two |
| 3 | Chromatic lines | NEW `line-6&position=up` | 80% on 5 of 6 | all |
| 4 | Sight-read the shelf | Studio, sight-read flag | 5 shelf pieces at 80% first pass | shelf |
| 5 | Learn two by reading | Studio | Two pieces at tempo, 90%, two days | shelf |
| 6 | Hear the secondary dominants | Ear path step 12 (chromatic colour and borrowed chords) | Passed | Five Foot Two, Ain't She Sweet |

| # | Piece | Read for | Key, meter, notes | Diff | MuseScore score | Fallback |
|---|---|---|---|---|---|---|
| 1 | Ain't She Sweet (ukulele and piano) | swing, chromatic melody | C major | 1 | [community](https://musescore.com/user/28001497/scores/8360028) |  |
| 2 | Blue Moon (ukulele and piano) | I-vi-ii-V, swing ballad | C major | 1 | [community](https://musescore.com/user/28001497/scores/8100774) |  |
| 3 | Five Foot Two (from The Daily Ukulele) | secondary dominants (E7, A7, D7, G7) | C major | 1 | [official](https://musescore.com/user/39593079/scores/15787303) |  |
| 4 | Sakura Sakura | pentatonic (in-scale), 4/4 | A minor | 1 | [community](https://musescore.com/user/33445730/scores/6056795) |  |
| 5 | Pink Panther (melody and chords) | chromatic approach notes, swing | E minor | 2 | [community](https://musescore.com/user/713161/scores/6839110) |  |
| 6 | Blue Bossa (lead sheet and chord melody) | minor ii-V | C minor | 2 | [official](https://musescore.com/user/97106398/scores/18088444) |  |
| 7 | Autumn Leaves (ukulele) | jazz standard | G minor or E minor | 2 | [official](https://musescore.com/user/97106398/scores/19514317) |  |
| 8 | Lágrima (ukulele) | E major to minor, positions | 3/4 | 2 | [community](https://musescore.com/user/29441233/scores/6100803) |  |
| 9 | Bach, Cello Suite No. 1 Prelude (ukulele) | continuous sixteenths, campanella | G or C major | 3 | [community](https://musescore.com/user/33445730/scores/6985857) |  |

**Level test (the path's ukulele finish):** `line-6` at 80% first pass; one unseen swing tune at 80% first pass; one learned piece from this shelf at tempo, 90%, two days.

## 6. Aerophone track (treble clef, transposed for Eb alto)

Prerequisite: the transposition setting (section 9, item 3). Everything on this track is written for Eb alto saxophone: set the AE-20 to an alto sax scene with transpose Eb so the fingering, the written note and the sound agree. Order follows the usual sax method sequence (Essential Elements, Rubank Elementary, Standard of Excellence): left-hand B, A, G first, then down to low D and C, up with the octave key, then the full range, then swing and jazz heads, then Ferling-style etudes.

Aerophone must be the active instrument with NEW `transpose=Eb`. All keys and note names below are written (alto) pitch: written C sounds Eb. **SR** = `/music/learn/reading?activity=sight-reading&clefs=treble`, **FC** = `/music/learn/reading?activity=flashcards&clefs=treble&answer=play`. Pair each level with the matching Aerophone path steps (fingering, long tones, register crossings): reading cannot run ahead of the fingers.

### Aerophone level 1: left-hand notes and the first five

Goal: read written B, A, G, then C and D in the middle register, in time. Adds: whole, half and quarter notes, rests, 4/4, the 30 second look.

| # | Step | Drill and setup | Done means | Feeds |
|---|---|---|---|---|
| 1 | Notes to fingers | Aerophone `?mode=fingering` (Roland lessons 1 to 4) beside FC `&low=67&high=74` (written G4 to D5) | 95% of 40 cards, fingering lessons passed | all |
| 2 | First contact | SR `&level=primer&follower=wait`, written range G4 to D5 | 5 phrases at 90% | |
| 3 | In time | SR `primer`, performance at 72 | 80% on 5 of 6, two days | all |
| 4 | Follow by ear | Ear `wrong-note?level=major-diatonic` | 80% | |
| 5 | Sight-read the shelf | Studio, sight-read flag | 5 shelf tunes at 80% first pass | shelf |
| 6 | Play a duet part | Studio: Au Clair de la Lune duet, one part with the app on the other | Through, 80% | Au Clair de la Lune |

| # | Piece | Read for | Key, meter, notes | Diff | MuseScore score | Fallback |
|---|---|---|---|---|---|---|
| 1 | Hot Cross Buns (alto sax solo) | B, A, G only | G major | 1 | [official](https://musescore.com/user/97106398/scores/16638700) | Essential Elements for Band, Alto Sax Book 1 |
| 2 | Mary Had a Little Lamb (alto sax) | three notes, then five | G major | 1 | [official](https://musescore.com/user/97106398/scores/21104887) |  |
| 3 | Lightly Row (alto sax) | steps and thirds | G or C major | 1 | [community](https://musescore.com/user/81181573/scores/32204462) |  |
| 4 | Au Clair de la Lune (duet for alto sax) | duet reading | G major | 1 | [community](https://musescore.com/user/1042611/scores/566491) |  |
| 5 | Twinkle Twinkle Little Star (alto sax) | leaps of a fifth | C or G major | 1 | [official](https://musescore.com/user/97106398/scores/19595545) |  |
| 6 | Ode to Joy (melody, alto or bari sax) | steps, dotted quarter in bar 4 | G or D major | 1 | [community](https://musescore.com/user/27631239/scores/6472365) |  |
| 7 | Jingle Bells (sax duet) | repeated notes, eighths | 4/4 | 2 | [community](https://musescore.com/user/1488461/scores/2804271) |  |

**Level test:** SR `primer` at 80% first pass on two days; two unseen shelf tunes at 80% first pass.

### Aerophone level 2: low register, eighths and 3/4

Goal: read down to low D and C and use the whole lower octave. Adds: written D4 to D5, eighths, 3/4, ties, written C, G and F majors.

| # | Step | Drill and setup | Done means | Feeds |
|---|---|---|---|---|
| 1 | Low notes | Aerophone fingering lessons for the right hand; FC `&low=62&high=74` | 95% of 40 | all |
| 2 | Long tones on low notes | Aerophone `?mode=long-tone` low D and C | Inside the band 80% of the time | Amazing Grace, Shenandoah |
| 3 | Line reading | SR `level-1`, written D4 to D5, keys C, G, F | 80% on 5 of 6 per key, two days | all |
| 4 | 3/4 and ties | NEW `line-4&meter=3/4`, same range | 80% on 5 of 6 | Amazing Grace, Happy Birthday |
| 5 | Sight-read the shelf | Studio, sight-read flag | 5 shelf tunes at 80% first pass | shelf |
| 6 | Learn two by reading | Studio | Two tunes at tempo, 90%, two days | shelf |

| # | Piece | Read for | Key, meter, notes | Diff | MuseScore score | Fallback |
|---|---|---|---|---|---|---|
| 1 | Amazing Grace (alto sax) | 3/4, pickup, ties | 3/4 | 1 | [community](https://musescore.com/user/28815610/scores/6614840) |  |
| 2 | Happy Birthday (traditional) | 3/4, octave leap | 3/4 | 1 | [community](https://musescore.com/user/36262051/scores/12060778) |  |
| 3 | Oh When the Saints (piano, alto sax and guitar) | pickups, long notes | 4/4 | 1 | [community](https://musescore.com/user/193274/scores/5714631) |  |
| 4 | Auld Lang Syne (alto sax solo) | dotted rhythm, pentatonic | 4/4 | 1 | [official](https://musescore.com/user/39593079/scores/15672202) |  |
| 5 | Shenandoah (sax) | slow, wide range | 4/4 | 2 | [community](https://musescore.com/user/16668291/scores/3423961) |  |
| 6 | Scarborough Fair (alto sax and Celtic harp) | Dorian, 3/4, duet with harp | 3/4 | 2 | [community](https://musescore.com/user/35613/scores/1535346) |  |
| 7 | Danny Boy (solo sax) | long phrases, octave reach | 4/4 | 2 | [community](https://musescore.com/user/32009255/scores/24703942) |  |
| 8 | Simple Gifts (alto sax and piano) | syncopated folk rhythm | 2/4 | 2 | [official](https://musescore.com/user/97106398/scores/16766953) |  |

**Level test:** SR `level-1` and `line-4` (3/4) at 80% first pass; one learned tune at tempo, 90%; one unseen shelf tune at 80% first pass.

### Aerophone level 3: octave key, upper register, dotted rhythms

Goal: read across the break into the upper octave (written to D6) with dotted rhythms and ties. Adds: octave key notes, D and Bb majors, dotted quarter and dotted eighth figures.

| # | Step | Drill and setup | Done means | Feeds |
|---|---|---|---|---|
| 1 | Crossing the break | Aerophone `?mode=register` crossings (6 pairs) | Glitch-free 9 of 10 per pair | all |
| 2 | Upper notes | FC `&low=72&high=86` (written C5 to D6) | 95% of 40 | all |
| 3 | Line reading, full octave and a half | NEW `line-4`, written D4 to D6, keys G, D, F, Bb | 80% on 5 of 6, two days | all |
| 4 | Sight-read the shelf | Studio, sight-read flag | 5 shelf pieces at 80% first pass | shelf |
| 5 | Learn two by reading | Studio | Two pieces at tempo, 90%, two days | shelf |
| 6 | Key signatures to two | FC `&key=D%20major`, then `Bb%20major`, written D4 to D6 | 95% of 40 per key | all |

| # | Piece | Read for | Key, meter, notes | Diff | MuseScore score | Fallback |
|---|---|---|---|---|---|---|
| 1 | Can't Help Falling in Love (alto sax) | slow melody, ties | 4/4 | 1 | [official](https://musescore.com/user/97106398/scores/23583481) |  |
| 2 | Hallelujah (alto sax) | 12/8 feel, repeated notes | 12/8 | 1 | [community](https://musescore.com/user/17349061/scores/5672319) |  |
| 3 | Greensleeves (alto sax) | 3/4 minor, raised 6 and 7 | minor | 2 | [community](https://musescore.com/user/62652/scores/80804) |  |
| 4 | Over the Rainbow (alto sax) | octave leap, upper register | 4/4 | 2 | [community](https://musescore.com/user/26502801/scores/5606765) |  |
| 5 | My Heart Will Go On | upper register, long notes | 4/4 | 2 | [community](https://musescore.com/user/30127060/scores/5861170) |  |
| 6 | La Vie en Rose (piano and alto sax) | dotted rhythms, chromatic notes | 4/4 | 2 | [community](https://musescore.com/user/35067400/scores/10066654) |  |
| 7 | Star Wars, main theme (alto sax solo) | triplets, leaps of a fifth and octave | 4/4 | 3 | [official](https://musescore.com/user/39593079/scores/16072096) |  |
| 8 | Pirates of the Caribbean (alto sax and flute duet) | 6/8, fast eighths, duet | 6/8 | 3 | [community](https://musescore.com/user/32407497/scores/8936349) |  |

**Level test:** `line-4` over the full range at 80% first pass; one learned upper-register piece at tempo, 90%.

### Aerophone level 4: syncopation and pop sax lines

Goal: read syncopated pop lines with sixteenths, as in the sax solos people know. Adds: ties over the beat, sixteenth figures, accents, written keys to three sharps and flats.

| # | Step | Drill and setup | Done means | Feeds |
|---|---|---|---|---|
| 1 | Syncopation | Rhythm track levels 4 and 5 | Passed | all |
| 2 | Articulation marks | Aerophone `?mode=articulation` and `?mode=tonguing` | Each at the drill's pass mark | Tequila, Pink Panther |
| 3 | Syncopated lines | NEW `line-6`, written D4 to D6 | 80% on 5 of 6, two days | all |
| 4 | Sight-read the shelf | Studio, sight-read flag at 70% tempo | 5 shelf solos at 80% first pass | shelf |
| 5 | Learn two by reading | Studio, then play along with the record | Two solos at tempo, 90%, two days | shelf |
| 6 | Play with the record | Studio performance mode to 90%, then the same solo along with the original recording (outside the app) | Two clean play-alongs on two days, self-checked | shelf |

| # | Piece | Read for | Key, meter, notes | Diff | MuseScore score | Fallback |
|---|---|---|---|---|---|---|
| 1 | Tequila (alto sax) | short syncopated riff | 4/4 | 1 | [community](https://musescore.com/user/28815610/scores/5106814) |  |
| 2 | The Pink Panther (alto sax) | chromatic, swing-ish eighths | E minor | 2 | [community](https://musescore.com/user/26790789/scores/5519902) |  |
| 3 | Just the Two of Us (alto sax) | sixteenth syncopation | 4/4 | 2 | [community](https://musescore.com/user/28815610/scores/6614898) |  |
| 4 | Careless Whisper (alto sax solo) | the famous riff, sixteenths | 4/4 | 2 | [official](https://musescore.com/user/39593079/scores/15738802) |  |
| 5 | Take On Me (alto sax solo) | fast eighths, syncopated synth line | 4/4 | 2 | [official](https://musescore.com/user/39593079/scores/15738568) |  |
| 6 | Baker Street (alto sax) | the solo, sixteenths and bends | 4/4 | 3 | [community](https://musescore.com/user/15680076/scores/5399962) |  |
| 7 | Sir Duke (alto sax) | unison horn line, sixteenths | 4/4 | 3 | [community](https://musescore.com/user/1798166/scores/732336) |  |
| 8 | Superstition (alto sax) | horn line, sixteenth syncopation | 4/4 | 3 | [community](https://musescore.com/user/28815610/scores/7108087) |  |

**Level test:** `line-6` at 80% first pass; two learned solos at tempo, 90%, on two days.

### Aerophone level 5: swing and blues heads

Goal: read jazz heads written in straight eighths and play them swung. Adds: swing feel, blues scale and blue notes in notation, 12-bar form, anticipations.

| # | Step | Drill and setup | Done means | Feeds |
|---|---|---|---|---|
| 1 | Swing reading | Rhythm track level 7; NEW swing playback in reading | Passed | all |
| 2 | Jazz lines | NEW `line-jazz`, written keys F, C, G, Bb | 80% on 5 of 6, two days | all |
| 3 | Blues form | Jam: 12-bar blues backing, play a shelf head twice through | Form kept without getting lost, 90% | shelf |
| 4 | Transcribe one | Ear path step 16 on one shelf head's recording, then compare with the score | Transcription matches the score at 80% | shelf |
| 5 | Sight-read the shelf | Studio, sight-read flag | 5 heads at 80% first pass | shelf |
| 6 | Learn three by reading | Studio, then over Jam | Three heads at tempo, 90%, two days | shelf |

| # | Piece | Read for | Key, meter, notes | Diff | MuseScore score | Fallback |
|---|---|---|---|---|---|---|
| 1 | C Jam Blues (alto sax solo) | two notes, swing | C blues (concert) | 1 | [official](https://musescore.com/user/97106398/scores/18088783) |  |
| 2 | Sonnymoon for Two (alto) | blues head, riff | Bb blues (concert) | 1 | [community](https://musescore.com/user/34952750/scores/6378598) |  |
| 3 | Blue Monk (alto sax) | chromatic blues head | Bb blues (concert) | 1 | [community](https://musescore.com/user/38263968/scores/6723123) |  |
| 4 | Bag's Groove (clarinet and sax) | riff blues | F blues (concert) | 2 | [community](https://musescore.com/user/3578461/scores/1048246) |  |
| 5 | Now's the Time (alto) | bebop blues head | F blues (concert) | 2 | [community](https://musescore.com/user/59221054/scores/12590899) |  |
| 6 | Watermelon Man (alto sax) | 16-bar funk-jazz head | F (concert) | 2 | [official](https://musescore.com/user/97106398/scores/19293271) |  |
| 7 | Cantaloupe Island (alto sax) | modal head, long notes | F minor (concert) | 2 | [community](https://musescore.com/user/28815610/scores/8357799) |  |
| 8 | St. Thomas (alto and tenor) | calypso syncopation | C (concert) | 2 | [community](https://musescore.com/user/17597471/scores/5840069) |  |
| 9 | Blues for Alice (alto) | bebop line over Bird changes | F (concert) | 3 | [community](https://musescore.com/user/2975/scores/6318183) |  |

**Level test:** two unseen blues heads at 80% first pass, swung; three learned heads at tempo over Jam, 90%.

### Aerophone level 6: Eb lead sheets and standards

Goal: read an Eb lead sheet at sight and play the head of a standard. Adds: chord symbols in Eb, long forms (AABA), ballads with triplets, bossa.

| # | Step | Drill and setup | Done means | Feeds |
|---|---|---|---|---|
| 1 | Chord tones from symbols | Chord-scales (`/music/chord-scales`) on the Aerophone, arpeggios of m7, 7, maj7 | 90% at 100 bpm | all |
| 2 | Form reading | Studio: AABA standard with repeats and endings | Through without getting lost, 90% | shelf |
| 3 | Sight-read the shelf | Studio, sight-read flag | 4 standards at 80% first pass | shelf |
| 4 | Learn three by reading | Studio, then over Jam | Three heads at tempo, 90%, two days | shelf |
| 5 | Improvise on one | Jam with the tune's changes; Jazz path guide tones | One chorus kept, chord tones on beats 1 and 3 at 60% | shelf |
| 6 | Read a concert-pitch lead sheet | Studio: a C lead sheet from the piano level 6 shelf, read a minor third down (written = concert + 9) | One tune at 80% first pass | Autumn Leaves, Blue Bossa |

| # | Piece | Read for | Key, meter, notes | Diff | MuseScore score | Fallback |
|---|---|---|---|---|---|---|
| 1 | Summertime (alto sax) | minor, slow, long notes | minor | 1 | [community](https://musescore.com/user/2616406/scores/949971) |  |
| 2 | Autumn Leaves (trombone, trumpet and alto sax) | ii-V, read the alto line | minor | 1 | [community](https://musescore.com/user/28387236/scores/5474034) |  |
| 3 | Fly Me to the Moon (alto sax) | cycle of fifths melody | 4/4 | 1 | [official](https://musescore.com/user/97106398/scores/19076134) |  |
| 4 | Misty (Eb lead sheet) | ballad, triplets, Eb symbols | Eb lead sheet | 2 | [community](https://musescore.com/user/27754147/scores/5665078) |  |
| 5 | The Girl from Ipanema (alto sax) | bossa, chromatic bridge | 4/4 | 2 | [official](https://musescore.com/user/97106398/scores/16214410) |  |
| 6 | Take Five (sax) | 5/4, Desmond's melody | 5/4 | 3 | [community](https://musescore.com/user/85652/scores/430481) |  |
| 7 | Misty (alto sax with solo transcription) | head plus a written solo to read | 4/4 | 3 | [community](https://musescore.com/user/28815610/scores/6620547) |  |

**Level test:** one unseen Eb lead sheet at 80% first pass; three learned standards at tempo, 90%; one improvised chorus kept.

### Aerophone level 7: etudes and classical pieces (about Grade 5)

Goal: read Grade 5 saxophone material: etudes and lyrical pieces with dynamics and articulation. Adds: palm keys to written F6, all keys to four sharps and flats, ornaments, tempo changes.

| # | Step | Drill and setup | Done means | Feeds |
|---|---|---|---|---|
| 1 | Palm keys | Aerophone fingering and register drills, written D6 to F6 | Glitch-free 9 of 10 | Ferling, Badinerie |
| 2 | Scales in all reading keys | Aerophone `?mode=scales`, the NZMEB grade speeds already in the app | Grade 5 speed in 8 keys | all |
| 3 | Grade 5 lines | NEW `line-6`, written Bb3 to F6 | 80% on 5 of 6, two days | all |
| 4 | An etude a week | Studio: a Ferling or Klosé study, wait then performance | 4 studies at tempo, 90% | Ferling, Klosé |
| 5 | Sight-read the shelf | Studio, sight-read flag | 4 pieces at 80% first pass | shelf |
| 6 | Learn one lyrical piece | Studio | One piece at tempo with dynamics, 90%, two days | shelf |

| # | Piece | Read for | Key, meter, notes | Diff | MuseScore score | Fallback |
|---|---|---|---|---|---|---|
| 1 | Saint-Saëns, The Swan (alto sax) | long phrases, 6/4 | 6/4 | 1 | [community](https://musescore.com/user/28815610/scores/10490185) |  |
| 2 | Schubert, Ave Maria (alto sax solo) | triplets against duplets | 4/4 | 1 | [official](https://musescore.com/user/39593079/scores/15744091) |  |
| 3 | Gossec, Gavotte | staccato, grace notes | 2/2 | 2 | [community](https://musescore.com/user/27523200/scores/14406241) |  |
| 4 | Fauré, Sicilienne (alto sax solo) | 6/8 lyrical line | 6/8 | 2 | [official](https://musescore.com/user/97106398/scores/35365166) |  |
| 5 | Klosé, 25 Daily Exercises | technique studies, all registers | various | 2 | [community](https://musescore.com/user/80345677/scores/23626432) | Klosé, 25 Daily Exercises for Saxophone (Leduc) |
| 6 | Ferling, Etude No. 12 (alto) | slow-fast pair, articulation | various | 2 | [community](https://musescore.com/user/1752166/scores/6881117) | [IMSLP](https://imslp.org/wiki/48_Studies_for_Oboe,_Op.31_%28Ferling,_Franz_Wilhelm%29) |
| 7 | Ferling, Etude No. 40 (alto sax, Andraud edition) | technical study | various | 3 | [official](https://musescore.com/user/39593079/scores/21252559) | [IMSLP](https://imslp.org/wiki/48_Studies_for_Oboe,_Op.31_%28Ferling,_Franz_Wilhelm%29) |
| 8 | Massenet, Méditation from Thaïs (alto sax) | rubato, upper register | 4/4 | 3 | [community](https://musescore.com/user/51985/scores/30187043) |  |
| 9 | Bach, Badinerie (alto sax solo) | fast sixteenths, palm keys | 2/4 | 3 | [official](https://musescore.com/user/97106398/scores/19876462) |  |

**Level test (the path's Aerophone finish):** `line-6` across the full range at 80% first pass on two days; one unseen Ferling study (from the IMSLP edition) at 80% first pass at a slow tempo; one learned lyrical piece at tempo with dynamics, 90%.

## 7. Rhythm track (counting, syncopation, swing, 6/8, Syncopation-style lines)

Read-and-tap is the drill throughout (tap on a key, pad or the space bar, graded on onsets). Count aloud in numbers ("1 e and a", "1 trip let") by default. Shelf pieces on this track are read for their rhythm only: tap the melody's rhythm from the score at sight, then play it on any instrument. Snare and rhythm-book material sits beside songs, since songs carry the rhythms the owner wants to read.

**RT** = `/music/learn/rhythm?mode=read-and-tap`; **Echo** = `/music/learn/rhythm?mode=echo&earLevel=<id>`; **Dict** = `/music/learn/rhythm?mode=dictation&earLevel=<id>`. Generated read-and-tap (`RT&earLevel=<id>`) is NEW (section 9, item 6); until it ships, use the authored pattern named in the step.

### Rhythm level 1: pulse, quarters, eighths and rests

Goal: count and tap quarters, eighths and rests at sight, counting aloud "1 and 2 and". Adds: the beat as the reference, rests as silent counts.

| # | Step | Drill and setup | Done means | Feeds |
|---|---|---|---|---|
| 1 | Steady pulse | `/music/learn/rhythm?mode=pulse`, then the gap click (`RT&pattern=gap-click-1-on-1-off`) | Pulse within the drill's window for 32 beats, two days | all |
| 2 | Authored patterns | RT `&pattern=quarter-pulse`, `eighths`, `eighth-rests` | 90% each at 80 bpm | |
| 3 | Generated, quarters and eighths | NEW RT `&earLevel=quarters-eighths` | 90% on 8 of 10 at 80, two days | all |
| 4 | Add rests and halves | NEW RT `&earLevel=rests-halves` | 90% on 8 of 10 | all |
| 5 | Hear it, then write it | Echo and Dict at `quarters-eighths` and `rests-halves` | 75% (the ear path's threshold) | |
| 6 | Read a real line | Studio or on paper: tap the rhythm of shelf pieces at sight, then play them on any instrument | 5 shelf pieces at 80% first pass | shelf |

| # | Piece | Read for | Key, meter, notes | Diff | MuseScore score | Fallback |
|---|---|---|---|---|---|---|
| 1 | Snare Drum Beginner Exercises | quarters, eighths, rests on one line | 4/4 | 1 | [community](https://musescore.com/user/28865218/scores/5323659) |  |
| 2 | Rhythm sight-reading exercises (drums) | graded single-line rhythm | 4/4 | 1 | [community](https://musescore.com/user/34386952/scores/7322597) |  |
| 3 | Rhythm Reading Exercises (bass) | rhythm on one pitch | 4/4 | 1 | [community](https://musescore.com/user/11883566/scores/2571341) |  |
| 4 | Rhythm Exercise (ta, ti-ti, ti-ka-ti-ka, rest) | Kodály-style counting | 4/4 | 1 | [official](https://musescore.com/user/97106398/scores/18711370) |  |
| 5 | We Will Rock You | stomp-stomp-clap, rests | 4/4 | 1 | [community](https://musescore.com/user/36054063/scores/7673342) |  |
| 6 | Yankee Doodle | eighths and quarters | 2/4 or 4/4 | 1 | [community](https://musescore.com/user/27413747/scores/5208037) |  |
| 7 | Hot Cross Buns (lead sheet) | quarters, then eighths | 4/4 | 1 | [community](https://musescore.com/user/498481/scores/6418657) |  |
| 8 | Cup Song rhythm | hands and cup, rests | 4/4 | 2 | [community](https://musescore.com/user/24296/scores/955891) |  |
| 9 | Back in Black (drums) | eighth-note hats, rests in the groove | 4/4 | 2 | [community](https://musescore.com/user/27077701/scores/6681779) |  |

**Level test:** RT `rests-halves` at 90% on 8 of 10 at 100 bpm; one unseen shelf line at 80% first pass.

### Rhythm level 2: dotted quarters, ties, 3/4 and 2/4

Goal: read the long-short figures every folk tune uses. Adds: dotted quarter-eighth, ties within the bar, 3/4 and 2/4.

| # | Step | Drill and setup | Done means | Feeds |
|---|---|---|---|---|
| 1 | Dotted quarters | RT `&pattern=dotted-quarters`; NEW RT `&earLevel=dotted` | 90% on 8 of 10, two days | all |
| 2 | Ties | NEW RT `&earLevel=ties` (first half: ties inside the bar) | 90% on 8 of 10 | Ode to Joy |
| 3 | 3/4 and 2/4 | NEW RT `&earLevel=three-four` | 90% on 8 of 10 | Blue Danube, Morning Has Broken |
| 4 | Ear | Echo and Dict at `dotted` | 75% | |
| 5 | Read real lines | Tap the shelf rhythms at sight | 5 pieces at 80% first pass | shelf |
| 6 | Sing it on one pitch | Bona lessons 1 to 10 sung on "ta" with the click, then tapped in RT | 10 lessons tapped at 80% first pass | Bona |

| # | Piece | Read for | Key, meter, notes | Diff | MuseScore score | Fallback |
|---|---|---|---|---|---|---|
| 1 | Ode to Joy (easy) | the dotted quarter in bar 4 | 4/4 | 1 | [community](https://musescore.com/user/2179186/scores/893026) |  |
| 2 | Auld Lang Syne | dotted quarter-eighth, pickup | 4/4 | 1 | [community](https://musescore.com/user/5/scores/4512) |  |
| 3 | Happy Birthday (easy) | 3/4, dotted eighth-sixteenth pickup | 3/4 | 1 | [community](https://musescore.com/user/34731933/scores/7035707) |  |
| 4 | Morning Has Broken | 3/4, long notes and ties | 3/4 | 1 | [community](https://musescore.com/user/248516/scores/615806) |  |
| 5 | The Blue Danube (very easy) | 3/4, ties over the bar | 3/4 | 1 | [community](https://musescore.com/user/58480/scores/82663) |  |
| 6 | Pozzoli, Solfeggio No. 1 (sung) | classic graded rhythm and pitch reading | 4/4 | 1 | [community](https://musescore.com/user/8978516/scores/6160800) |  |
| 7 | Pozzoli, Solfeggio No. 2 (sung) | next step in the same book | 4/4 | 1 | [community](https://musescore.com/user/8978516/scores/6170285) |  |
| 8 | Bona, Rhythmical Articulation, first lessons | the standard rhythm-reading book (sing on one pitch or tap) | 4/4, 3/4, 2/4 | 1 to 2 | none suitable | [IMSLP](https://imslp.org/wiki/Metodo_completo_per_la_divisione_%28Bona,_Pasquale%29) |

**Level test:** NEW RT `three-four` and `ties` at 90% on 8 of 10 at 100 bpm; two unseen Bona or Pozzoli lines at 80% first pass.

### Rhythm level 3: 6/8 and compound time

Goal: feel two dotted-quarter beats in 6/8 and read the common figures. Adds: quarter-eighth, eighth-quarter and three-eighth groups, dotted quarters, 6/8 rests.

| # | Step | Drill and setup | Done means | Feeds |
|---|---|---|---|---|
| 1 | Compound pulse | NEW RT `&earLevel=compound` at dotted quarter = 60 | 90% on 8 of 10, two days | all |
| 2 | Ear | Echo and Dict at `compound` (ear path step 8) | 75% | |
| 3 | Count in two | Same, counting "1 and a 2 and a"; then dotted quarter = 80 | 90% at 80 | jigs |
| 4 | Read real lines | Tap shelf rhythms at sight | 5 pieces at 80% first pass | shelf |
| 5 | Jig rhythm on an instrument | Studio: Irish Washerwoman on any instrument, rhythm graded | 80% at dotted quarter = 80 | Irish Washerwoman |
| 6 | Slow and fast 6/8 | RT `compound` at dotted quarter = 50 and 100 | 90% at both, two days | all |

| # | Piece | Read for | Key, meter, notes | Diff | MuseScore score | Fallback |
|---|---|---|---|---|---|---|
| 1 | Row, Row, Row Your Boat | the basic 6/8 figures | 6/8 | 1 | [community](https://musescore.com/user/42215/scores/127109) |  |
| 2 | Pop Goes the Weasel | quarter-eighth patterns | 6/8 | 1 | [community](https://musescore.com/user/183511/scores/269041) |  |
| 3 | Silent Night (easy left hand) | dotted quarters, quarter-eighth | 6/8 | 1 | [community](https://musescore.com/user/12972/scores/5898928) |  |
| 4 | The Skye Boat Song | slow 6/8 or 3/4 sway | 6/8 | 1 | [community](https://musescore.com/user/7749426/scores/2840956) |  |
| 5 | House of the Rising Sun | 6/8 arpeggio feel | 6/8 | 1 | [community](https://musescore.com/user/29683322/scores/5229922) |  |
| 6 | Irish Washerwoman | running 6/8 eighths | 6/8 | 2 | [community](https://musescore.com/user/114629/scores/530111) | [The Session](https://thesession.org/tunes/search?q=irish+washerwoman) |
| 7 | We Are the Champions | 6/8 ballad with ties | 6/8 | 2 | [community](https://musescore.com/user/135455/scores/1487021) |  |
| 8 | Nothing Else Matters (violin) | 6/8 with sixteenths | 6/8 | 2 | [community](https://musescore.com/user/73453/scores/5084245) |  |
| 9 | Norwegian Wood (sitar part) | 6/8 (or 12/8) melody | 6/8 | 2 | [community](https://musescore.com/user/2985/scores/64556) |  |

**Level test:** RT `compound` at 90% on 8 of 10 at dotted quarter = 80; one unseen jig from The Session tapped at 80% first pass.

### Rhythm level 4: sixteenths

Goal: read sixteenth groupings at sight, counting "1 e and a". Adds: four sixteenths, eighth-two sixteenths, two sixteenths-eighth, sixteenth rests.

| # | Step | Drill and setup | Done means | Feeds |
|---|---|---|---|---|
| 1 | Authored | RT `&pattern=sixteenths` | 90% at 70 | |
| 2 | Generated | NEW RT `&earLevel=sixteenths` | 90% on 8 of 10 at 70, then 90, two days | all |
| 3 | Sticking | Pads or space bar: Stick Control page 1 at 80 | Clean, two days | Stick Control |
| 4 | Ear | Echo and Dict at `sixteenths` | 75% | |
| 5 | Read real lines | Tap shelf rhythms at sight | 5 pieces at 80% first pass | shelf |
| 6 | Sixteenths on the pads | Pads path groove levels with sixteenth hats | As that path sets | Superstition, Billie Jean |

| # | Piece | Read for | Key, meter, notes | Diff | MuseScore score | Fallback |
|---|---|---|---|---|---|---|
| 1 | Stick Control (play-along) | single and double strokes in eighths and sixteenths | 4/4 | 1 | [community](https://musescore.com/user/180772/scores/6645276) | Stone, Stick Control (book) |
| 2 | Beethoven, Turkish March (easy) | eighths and sixteenths, 2/4 | 2/4 | 1 | [community](https://musescore.com/user/14484861/scores/3716956) |  |
| 3 | Mozart, Eine kleine Nachtmusik (easy) | sixteenth runs, rests | 4/4 | 2 | [community](https://musescore.com/user/34602227/scores/6185881) |  |
| 4 | Rossini, William Tell Overture | galloping eighth-two-sixteenths | 2/4 | 2 | [community](https://musescore.com/user/6231181/scores/1501841) |  |
| 5 | Another One Bites the Dust | sixteenth bass riff with rests | 4/4 | 2 | [community](https://musescore.com/user/9395321/scores/2779851) |  |
| 6 | Billie Jean (bass transcription) | steady eighths, sixteenth pickups | 4/4 | 2 | [community](https://musescore.com/user/36422080/scores/7440794) |  |
| 7 | Superstition (bass line) | sixteenth funk line | 4/4 | 3 | [community](https://musescore.com/user/7503936/scores/7924694) |  |
| 8 | Superstition (drums) | sixteenth hats, ghost-note feel on paper | 4/4 | 3 | [community](https://musescore.com/user/33758879/scores/6001335) |  |

**Level test:** NEW RT `sixteenths` at 90% on 8 of 10 at 90 bpm; one unseen shelf line at 80% first pass.

### Rhythm level 5: syncopation, Syncopation-style lines

Goal: read off-beat and tied syncopation fluently, the core of Reed's Progressive Steps to Syncopation. Adds: eighth-quarter-eighth, ties over the beat and the bar line, anticipations, sixteenth syncopation.

| # | Step | Drill and setup | Done means | Feeds |
|---|---|---|---|---|
| 1 | Off-beats | RT `&pattern=off-beats` | 90% at 80 | |
| 2 | Generated syncopation | NEW RT `&earLevel=syncopation` | 90% on 8 of 10 at 80, two days | all |
| 3 | Ties over the bar | NEW RT `&earLevel=ties` (second half) | 90% on 8 of 10 | Reed |
| 4 | Reed-style lines | NEW RT `&earLevel=reed-lines`, 8 bars at 80, then 100, then 120 | 85% at 120, two days | Reed |
| 5 | With a foot | `reed-lines` with the kick-quarters lane on | 85% at 100 | pads path |
| 6 | Sixteenth syncopation | NEW RT `&earLevel=sixteenth-sync` | 90% on 8 of 10 at 80 | Uptown Funk, Africa |
| 7 | Read real lines | Tap shelf rhythms at sight | 5 pieces at 80% first pass | shelf |

| # | Piece | Read for | Key, meter, notes | Diff | MuseScore score | Fallback |
|---|---|---|---|---|---|---|
| 1 | Progressive Steps to Syncopation (exercise transcription) | the Reed reading pages | 4/4 | 2 | [community](https://musescore.com/user/32848121/scores/6796317) | Reed, Progressive Steps to Syncopation for the Modern Drummer (book) |
| 2 | Progressive Steps to Syncopation (snare) | more Reed pages | 4/4 | 2 | [community](https://musescore.com/user/110883467/scores/29050682) | same book |
| 3 | The Entertainer | ragtime syncopation | 2/4 | 2 | [community](https://musescore.com/user/3471/scores/1352881) |  |
| 4 | Oye Como Va (flute and piano) | Latin anticipations | 4/4 | 2 | [community](https://musescore.com/user/45561/scores/3333141) |  |
| 5 | Take On Me (piano) | syncopated synth riff | 4/4 | 2 | [community](https://musescore.com/user/94521/scores/4097211) |  |
| 6 | Africa (Toto, piano) | sixteenth syncopation | 4/4 | 3 | [community](https://musescore.com/user/17803506/scores/3589006) |  |
| 7 | Smooth (Santana, alto sax and guitar) | Latin rock anticipations | 4/4 | 3 | [community](https://musescore.com/user/27302974/scores/6276287) |  |
| 8 | Uptown Funk (easy piano) | funk sixteenths | 4/4 | 3 | [community](https://musescore.com/user/13543696/scores/4836668) |  |

**Level test:** `reed-lines` at 85% at 120 bpm on two days; one unseen Reed-style page at 80% first pass at 100.

### Rhythm level 6: triplets and dotted eighth-sixteenth

Goal: tell triplets from dotted figures at sight and switch between them. Adds: eighth triplets, quarter triplets, dotted eighth-sixteenth, rudimental snare reading.

| # | Step | Drill and setup | Done means | Feeds |
|---|---|---|---|---|
| 1 | Authored triplets | RT `&pattern=triplets` | 90% at 70 | |
| 2 | Dotted eighth-sixteenth | NEW RT `&earLevel=dotted-sixteenths` | 90% on 8 of 10, two days | marches |
| 3 | Quarter-note triplets | NEW RT `&earLevel=triplet-2` | 90% on 8 of 10 | Hedwig, Ave Maria |
| 4 | Ear | Echo and Dict at `syncopation` (triplets) and `dotted-sixteenths` | 75% | |
| 5 | Read real lines | Tap shelf rhythms at sight | 5 pieces at 80% first pass | shelf |
| 6 | Switch figures | NEW RT mixing `triplet` and `dotted-eighth` cells in one bar | 85% on 8 of 10 | Battle Hymn, Imperial March |

| # | Piece | Read for | Key, meter, notes | Diff | MuseScore score | Fallback |
|---|---|---|---|---|---|---|
| 1 | Battle Hymn of the Republic | dotted eighth-sixteenth throughout | 4/4 | 1 | [community](https://musescore.com/user/7597526/scores/6269327) |  |
| 2 | The Marines' Hymn (lead sheet) | dotted rhythms, march | 4/4 | 1 | [community](https://musescore.com/user/498481/scores/6371051) |  |
| 3 | Stars and Stripes Forever (lead sheet) | march dotted figures | 2/4 or 2/2 | 2 | [community](https://musescore.com/user/498481/scores/6239106) |  |
| 4 | The Imperial March (very easy) | triplets and dotted figures | 4/4 | 2 | [official](https://musescore.com/user/39593079/scores/15604549) |  |
| 5 | Moonlight Sonata, first movement (easy) | continuous triplets | 2/2 | 2 | [community](https://musescore.com/user/35492373/scores/6672277) |  |
| 6 | Hedwig's Theme | 3/8, triplet and dotted figures | 3/8 | 3 | [official](https://musescore.com/user/39593079/scores/16093261) |  |
| 7 | Schubert, Ave Maria (easy piano) | triplets against duplets | 4/4 | 3 | [community](https://musescore.com/user/1953051/scores/10581163) |  |
| 8 | Wilcoxon, Solo No. 1 (snare) | rudimental snare reading | 2/4 | 3 | [community](https://musescore.com/user/32220659/scores/6409438) | Wilcoxon, The All-American Drummer (book) |

**Level test:** `triplet-2` and `dotted-sixteenths` at 90% on 8 of 10 at 90 bpm; one unseen march at 80% first pass.

### Rhythm level 7: swing

Goal: read straight-written eighths and play them swung, with anticipations and long-short phrasing. Adds: swing eighths, triplet feel, jazz articulation and shots.

| # | Step | Drill and setup | Done means | Feeds |
|---|---|---|---|---|
| 1 | Swing feel | RT `&pattern=swing-eighths`; NEW RT `&earLevel=swing` | 90% on 8 of 10 at 100, two days | all |
| 2 | Ear | Echo and Dict at `swing` | 75% | |
| 3 | Swing with anticipations | NEW `reed-lines` with swing on (Reed lines are the standard swing reading drill) | 85% at 120 | big band |
| 4 | Pads link | Pads path swing levels | as that path sets | |
| 5 | Read real lines | Tap or play shelf heads, swung | 5 pieces at 80% first pass | shelf |
| 6 | Swing at two tempos | RT `swing` at 80 and 160 | 90% at 80, 85% at 160, two days | all |

| # | Piece | Read for | Key, meter, notes | Diff | MuseScore score | Fallback |
|---|---|---|---|---|---|---|
| 1 | C-Jam Blues | two-note riff, swing | 4/4 swing | 1 | [community](https://musescore.com/user/2850076/scores/3502926) |  |
| 2 | Sonnymoon for Two (lead sheet) | riff blues, anticipations | 4/4 swing | 1 | [community](https://musescore.com/user/498481/scores/6554123) |  |
| 3 | Mack the Knife (lead sheet) | swing with pickups and ties | 4/4 swing | 2 | [community](https://musescore.com/user/498481/scores/6223613) |  |
| 4 | In the Mood (piano) | swing riff, shots | 4/4 swing | 2 | [community](https://musescore.com/user/28386963/scores/5533170) |  |
| 5 | Tuxedo Junction (trombone) | swing riff, rests | 4/4 swing | 2 | [community](https://musescore.com/user/3245056/scores/1151406) |  |
| 6 | Bags' Groove (piano) | blues head, swing | 4/4 swing | 2 | [community](https://musescore.com/user/68823/scores/373986) |  |
| 7 | Wilcoxon, Swing Solo No. 1 (snare) | swing snare reading | 4/4 swing | 2 | [community](https://musescore.com/user/32220659/scores/6418350) | Wilcoxon, Modern Rudimental Swing Solos (book) |
| 8 | Wilcoxon, Swing Solo No. 10 (snare) | harder swing snare page | 4/4 swing | 3 | [community](https://musescore.com/user/32220659/scores/6418341) | same book |
| 9 | Sing, Sing, Sing (big band, 1938, read the sax 1 part) | big band shots and riffs | 4/4 swing | 3 | [community](https://musescore.com/user/3191116/scores/4488746) |  |

**Level test:** `reed-lines` swung at 85% at 120; one unseen big band part (a sax or trombone part from a MuseScore big band chart) at 80% first pass.

### Rhythm level 8: odd and mixed meters

Goal: read 5/4, 7/4, 5/8, 7/8 and 9/8 with their groupings, and switch meters. Adds: grouping marks (2+3, 2+2+3), hemiola, meter changes.

| # | Step | Drill and setup | Done means | Feeds |
|---|---|---|---|---|
| 1 | Groupings | NEW RT `&earLevel=odd` in 5/4 and 5/8 | 90% on 8 of 10, two days | Take Five, Mission Impossible |
| 2 | Sevens | Same in 7/4 and 7/8 | 90% on 8 of 10 | Money, Unsquare Dance, Solsbury Hill |
| 3 | Nine and hemiola | Same in 9/8 (2+2+2+3) and 6/8 to 3/4 switches | 85% on 8 of 10 | Blue Rondo, America |
| 4 | Read real lines | Tap shelf rhythms at sight | 5 pieces at 80% first pass | shelf |
| 5 | Count the groups aloud | RT `odd` at 100, counting "1 2 1 2 3" aloud | 90% on 8 of 10 | all |
| 6 | Meter changes | NEW RT with a meter change every 2 bars (4/4, 3/4, 5/8) | 85% on 8 of 10 | America |

| # | Piece | Read for | Key, meter, notes | Diff | MuseScore score | Fallback |
|---|---|---|---|---|---|---|
| 1 | Take Five (sax) | 5/4 (3+2) | 5/4 | 1 | [community](https://musescore.com/user/85652/scores/430481) |  |
| 2 | Mission: Impossible theme | 5/4 ostinato | 5/4 | 1 | [community](https://musescore.com/user/6176101/scores/891471) |  |
| 3 | Money (Pink Floyd, bass) | 7/4 riff | 7/4 | 2 | [community](https://musescore.com/user/2730566/scores/3529831) |  |
| 4 | Unsquare Dance (piano) | 7/4 claps | 7/4 | 2 | [community](https://musescore.com/user/3386956/scores/6243952) |  |
| 5 | Solsbury Hill (guitar) | 7/4 strum line | 7/4 | 2 | [community](https://musescore.com/user/26842061/scores/5962291) |  |
| 6 | Holst, Mars (orchestra, read the strings' ostinato) | 5/4 ostinato | 5/4 | 2 | [community](https://musescore.com/user/16916841/scores/5190568) |  |
| 7 | America (West Side Story, woodwinds) | 6/8 and 3/4 hemiola | 6/8 + 3/4 | 3 | [community](https://musescore.com/user/1253051/scores/2154926) |  |
| 8 | Blue Rondo à la Turk | 9/8 as 2+2+2+3 | 9/8 | 3 | [community](https://musescore.com/user/12850/scores/286641) |  |

**Level test (the path's rhythm finish):** RT `odd` at 90% on 8 of 10 in three meters on two days; `reed-lines` at 85% at 120; one unseen odd-meter line at 80% first pass.

## 8. Cross-links to the ear and theory paths

| When | Link | Why |
|---|---|---|
| Piano level 1, guitar level 3, ukulele level 2, Aerophone level 1 | Ear path step 6, spot the wrong note (`/music/learn/ear/wrong-note?level=major-diatonic`) | Following a written line by ear is the bridge from ear to eye |
| Every level, before sight-reading | Ear path step 7, short melodies with rhythm, sung back (R4) | Mishra 2014: singing and aural training improve reading most |
| Rhythm level 2 to 4 | Ear path step 8, write a rhythm down (rhythm dictation) at the same level id | Dictation and read-and-tap use the same cells; doing both doubles the vocabulary |
| Piano level 2 | Circle of Fifths path steps 1 to 4 | Key signatures to three and four accidentals |
| Piano level 3, guitar level 7, ukulele level 3 | Ear path step 5 (I, IV, V in a key) and step 10 (song loops), Harmony for Songs path steps 1 to 4 | A chord chart is read faster when the loop is already heard as a function |
| Piano level 5 | Ear path step 15 (inversions and sevenths) | Chorale reading is reading chord functions in four voices |
| Piano level 6, guitar level 7, Aerophone levels 5 and 6 | Jazz path (ii-V-I, shells, swing feel) and the Jam backing | Lead sheets need the vocabulary before they can be read fluently |
| Aerophone level 5 | Ear path step 16, transcribe a melody from a recording | Blues heads are the easiest jazz to transcribe; reading and transcribing the same head trains both directions |
| Rhythm level 7 | Pads path swing and groove levels | Swing reading on pads and on wind instruments is the same skill |

## 9. New drills and app changes, ranked

| # | Change | Size | What it needs | Unblocks |
|---|---|---|---|---|
| 1 | Reading Path in `paths.ts` with five track tabs (steps above as data, levels as path sections) | S | Step data, hrefs with setup keys, `kind: "song"` steps for shelf pieces (learning-engine round 1) | Everything here |
| 2 | Piano grand-staff levels `piano-4` to `piano-8` with harmonically related hands, rests, ties, 2/4, 3/4, 3/8, 9/8, 5/4, accidentals, dynamics, anacrusis | L | `reading.ts` cell sets per meter, a progression under each phrase (reuse the comping and two-hand generators), Score fields for ties, rests, dynamics | Piano levels 1, 2, 4, 5, 7 |
| 3 | Aerophone transposition (C, Bb, Eb) for reading, flashcards and Song Studio import | S to M | One setting applied to incoming MIDI and to the staff; import asks "this part is for Eb alto" (aerophone.md R2) | The whole Aerophone track |
| 4 | Single-line levels `line-4` to `line-6` and `line-jazz` | M | Shares the cell work of item 2; adds scale and arpeggio fragments to the random walk | Guitar, ukulele, Aerophone levels from 3 up |
| 5 | Fretted positions in sight-reading: position and string-set options, tab assignment inside the position | S to M | `readingRange` per position, `assignTab` constrained to a fret window | Guitar levels 3 to 6, ukulele levels 2 and 4 |
| 6 | Read-and-tap from the rhythm generator, plus the new rhythm levels (`ties`, `three-four`, `sixteenth-sync`, `compound-16`, `triplet-2`, `odd`, `reed-lines`) | S to M | `earRhythmPattern` feeding read-and-tap; new cells; a meter field for 3/4, 5/4, 7/8 | The rhythm track |
| 7 | Chord-chart reading mode (`chart-1` to `chart-3`) | M | Generated charts from common progressions; named patterns from `comping-patterns.json`; grading by pitch-class set per beat | Piano level 3, guitar level 7 |
| 8 | Lead-sheet mode (`lead-1`, `lead-2`): melody plus symbols, LH shells | M | Melody from `line-jazz`, chords from jazz progressions, two-part grading | Piano level 6 |
| 9 | Song Studio "sight-read" mode: 30 second look with the playback locked, one scored pass, then the piece opens normally | S | A flag on the existing performance mode | Every shelf |
| 10 | Corpus phrases beside the random walk: folk tunes (The Session, Nottingham), hymns and Bach chorales (Mutopia) cut to 4 to 16 bars | M | An import of PD MusicXML or ABC into Score; level tags by key, meter and rhythm | Every track; real tunes carry the figures readers chunk |
| 11 | Look-ahead mask: hide the notes already played and the notes more than N beats ahead | S | A NotationFrame option | Piano levels 4 to 7 (eye-hand span, Furneaux and Land 1999) |
| 12 | Duet partner: the app plays the secondo or the accompaniment while the owner reads | S to M | Two-voice scores with one voice muted and graded | Piano levels 1, 2 and 4 duets, Zhukov |
| 13 | Swing playback for written straight eighths in reading and Song Studio | S | The `written` field from `RHYTHM_CELLS.swing` applied to playback and timing windows | Aerophone levels 5 and 6, piano level 6, rhythm level 7 |

## 10. Open questions for the owner

**Answered by the owner (2026-10-27):** MuseScore Pro, yes; Official scores export MusicXML, so Official picks stay as listed. Guitar: acoustic and electric, no classical strand. Ukulele: high-G tenor. Aerophone: alto and tenor scenes both, bite sends pitch bend. Pads: performing and beat making interleaved by difficulty; the MPC sends aftertouch. Piano: the full curriculum, known skills as review. Jazz: a Real Book PDF for chord charts.


1. **Aerophone transposition**: this plan assumes Eb alto (written a major sixth above concert) so downloaded alto parts and Eb lead sheets read directly. Tenor (Bb) instead? Or concert pitch only?
2. **Guitar standard notation**: this plan includes it to fifth position (the round-1 question). Keep it, or stop after tab and chord charts (levels 1, 2 and 7) and save about four months?
3. **Official scores**: about a third of the best-fitting MuseScore arrangements are official (paid) ones. Does your MuseScore account have Pro? If not, which shelf rows should switch to the community alternative?
4. **Placement**: should the piano track start with the climb at level 3 as proposed, or do you know your sight-reading grade (for example, you can sight-read Grade 3 pieces comfortably)?
5. **Ukulele tuning**: high G (assumed, JHUI default) or low G? Low G changes the open-position range and some shelf picks.
6. **Classical share**: the piano and guitar shelves lean on public-domain classical and hymns because they are graded and free. Do you want more pop arrangements on those shelves even if they read less cleanly?
7. **Singing**: the "hear it before you play" rule assumes silent or hummed singing during the 30 second look. Fine?
8. **Rhythm counting**: numbers ("1 e and a") as proposed, or a syllable system (Takadimi, Gordon)?
