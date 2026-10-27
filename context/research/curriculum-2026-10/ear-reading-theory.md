# Ear training, reading, rhythm and theory (2026-10-27)

Scope: what works best and fastest for an owner who wants to play songs by ear, read, improvise and write; how Woodshed compares; what to change. Builds on `context/research/ear-drills-sequencing.md` and `circle-of-fifths.md` (not repeated here).

## 1. What works, and why

### Evidence that should steer the design

- **Playing by ear is a foundation skill, and real recordings train it.** Woody and Lehmann (2010, JRME 58(2) 101-115): musicians with vernacular (by-ear) experience needed fewer listen-and-play cycles to reproduce melodies than formally trained ones, and singing back took fewer attempts than playing back ([record](https://bvbvf1.bib-bvb.de/vufind/PrimoRecord/cdi_proquest_journals_603218323)). Lucy Green's informal learning (How Popular Musicians Learn, 2002) is built on copying recordings. McPherson treats playing by ear, improvising and sight-reading as separate, linked skills that each need practice ([1997](https://journals.sagepub.com/doi/10.2307/3345469)).
- **Isolated interval drills transfer poorly.** Interval identification correlates with dictation (28.9% of variance, [Nichols and Springer 2021](https://pure.psu.edu/en/publications/interval-identification-predicts-success-in-melodic-dictation/)), but that is correlational; reviews note students often fail to apply isolated interval or degree recognition inside melodies ([JMTP review](https://journals.ou.edu/jmtp/article/download/778/1619/1609)). Tonal context helps interval perception, mostly by priming expectations ([Frontiers 2017](https://public-pages-files-2025.frontiersin.org/journals/psychology/articles/10.3389/fpsyg.2017.01753/text)). Conclusion shared by Karpinski, Functional Ear Trainer and Gordon: learn pitch as function in a key, use intervals as vocabulary later.
- **Working memory is the bottleneck in dictation and playing by ear.** Chenette ([JMTP 32, 2018](https://journals-upgrade.shareok.org/jmtp/article/view/543); [MTO 2021](https://mtosmt.org/ojs/index.php/mto/article/view/613/149)): chunking (hearing a whole idiomatic figure as one unit) is what grows, and it grows from a vocabulary of familiar patterns. Gordon's Music Learning Theory agrees: build a vocabulary of tonal and rhythm patterns by ear and voice before symbols ([overview](https://en.wikipedia.org/wiki/Gordon_music_learning_theory)).
- **Sight-reading improves most from aural training and singing.** Mishra's meta-analysis of 92 studies (Psychology of Music 42(2), 2014, [doi](https://journals.sagepub.com/doi/10.1177/0305735612463770)): the overall effect of sight-reading interventions is small (about d = 0.18), and only treatment type moderates it; aural training, controlled reading, creative activities and singing or solfège were the effective kinds. Kopiez and Lee ([2006](https://edisciplinas.usp.br/pluginfile.php/5556036/mod_resource/content/0/Artigo-KopiezLee-DynamicModelSightReading-2006.pdf)): inner hearing, processing speed and accumulated sight-reading experience predict skill, with psychomotor speed dominating at high difficulty. Zhukov's hybrid course for pianists ([2014](https://journals.sagepub.com/doi/10.1177/0305735614550229)) combined rhythm training, duet or accompanying practice and pieces in several styles, and beat each single strategy.

### Programs and methods, and the part worth copying

| Program or method | What makes it work | Copy into Woodshed |
|---|---|---|
| Functional Ear Trainer (Benbassat) | I-IV-V-I cadence before each question, one note, then the note **resolves stepwise to the tonic** after the answer; a granularity ladder (lower tetrachord, upper, octave, random keys) ([summary](https://en.wikipedia.org/wiki/Ear_training)) | Cadence and resolution; hold the key across a block |
| EarMaster | Graded course plus custom drills; sing-back and clap-back with mic grading; rhythm imitation before dictation; jazz and song-based modules | Already copied for order; add real-song modules |
| Toned Ear, Teoria, musictheory.net / Tenuto, Perfect Ear | Fast customisable single-skill drills, timed challenges | Woodshed already matches or exceeds these |
| Kodály | Sound before symbol, movable do, singing first, a song repertoire as the curriculum, pentatonic before diatonic | A song-first loop: sing, play, then read the same tune |
| Gordon MLT | Audiation; tonal and rhythm patterns in context; discrimination then inference; du/du-de/du-da-di syllables by beat function | Pattern vocabulary from real tunes; syllables optional |
| Berklee ear training and harmony | Solfège over chord progressions, harmony taught as function (tonic, subdominant, dominant), chord-scale theory for improvisers (Nettles and Graf, Chord-Scale Theory and Jazz Harmony) | A harmony path tied to ear drills |
| Hooktheory (books, TheoryTab, Trends) | Songs written as scale degrees and Roman numerals; chord-transition probabilities from a database of tens of thousands of songs; API for "songs containing this progression" ([API docs](https://hooktheory.com/api/trends/docs)) | Progression items and song lists by frequency |
| Transcribe!, Anytune, Moises | Loop a passage, slow it without changing pitch, find the key, write what you hear | The missing drill (see R2) |
| Piano Marvel (SASR), Sight Reading Factory | Endless generated graded reading, rhythm-only reading as its own track, a level test by strikes | Already copied the climb; content is the gap |
| Open Music Theory ([v2](https://viva.pressbooks.pub/openmusictheory/)) | Free, modular, pop and jazz chapters beside classical | Source for the harmony path's order |

## 2. What Woodshed has today

Seen in the app (Paths, Drills, the drill pages) and in `packages/music-core/src/content/ear.ts`, `reading.ts`, `rhythm.ts`, `progress/paths.ts`.

**Ear Training Path, 17 steps (16 graded plus the unscored tonic anchor):** tonic, diatonic degrees, sing or play them, echo a rhythm, wrong note, short melodies, rhythm dictation, chromatic colour, interval size, names, singing, scales and modes, mixed review, chords in a key, bass, inversions, progressions. Criteria are sensible (66% with 4+ choices, 80% with 2 or 3, 75% for dictation and singing), and instrument paths link ear drills at the right moments.

**Ear drills (15)** with choice, play-back, voice, pocket recall and listen-along answers; item sets, weaker items asked more, the wrong answer replayed beside the right one. A strong base whose order already follows Karpinski and EarMaster.

**Reading:** flashcards (diatonic notes or triads) and generated sight-reading in four levels (Primer to Level 3), wait and keep-time, tab for fretted instruments, practise-the-missed, and a Piano Marvel style climb.

**Rhythm:** pulse, read and tap (14 authored patterns), echo and dictation (8 generated levels from quarters to swing), groove dictation on a 3-lane grid.

**Theory:** Circle of Fifths Path (7 steps, follows the circle research, timed drill) and Library reference (chord vocabulary, chord-scale map, 12-key cycle, improv techniques). Studio Ears Path is sound and outside this report.

### Where it falls short

1. **The degree drill has almost no key context.** `scaleDegreePrompt` plays one tonic note for 0.55 s then the target, and `earRoot` picks a **new random key for every prompt**. No cadence, no resolution to the tonic after the answer. Melody dictation and wrong-note do the same. Chords in a key does play I-IV-V-I. This undercuts the functional approach the path is built on.
2. **Melodies are tiny and rhythm-free.** Melody dictation is 3 or 4 notes at a fixed 0.55 s spacing, always starting on the target degree. Songs are 4 to 8 bar phrases with rhythm. Pitch and rhythm are never heard together, so chunking (Chenette) never gets trained.
3. **Nothing uses real recordings.** Every prompt is a synthesized piano. Repertoire transfer uses the owner's saved songs, but as synthesized MIDI. There is no loop-and-slow player, no "find the key of this track", no progression or bass line heard in a real mix. For "play by ear" this is the biggest gap. Library's automatic transcription (Basic Pitch) exists, which could serve as an answer key but today replaces the ear work.
4. **Progressions are drill progressions, not song progressions.** 3 or 4 block chords from I. Pop and rock loop four chords with bass and drums, and lean on bVII, bVI, iv and the vi-IV-I-V family; none of the borrowed chords are items.
5. **Sight-reading content is thin and stops early.** Pitches are a random walk (max step 1 to 3 scale steps), both piano hands are independent random walks with no harmonic relation, there are no rests, ties, accidentals, chords, dynamics or 3/4, and the top level is Level 3 in two flats. An intermediate pianist will outgrow it in a week. Random walks also never present the idiomatic figures (scale runs, arpeggios, cadence formulas, accompaniment patterns) that reading research says experts chunk.
6. **No reading for guitar, ukulele or Aerophone in any path.** The Guitar Path has 10 steps and none reads notation; there is no Ukulele or Aerophone path at all.
7. **Read and tap uses 14 fixed patterns**, while echo and dictation have a generator with 8 levels.
8. **No call and response or improvising by ear in the ear area.** Pads have play-it-back; Jam exists; nothing asks "answer this phrase".
9. **Path order delays what pays off fastest for songs.** Chords in a key comes at step 14, after interval naming, singing intervals, scales and modes. For someone who wants to play songs, hearing I, IV, V and vi and following the bass pays off sooner than naming a minor sixth.
10. **One timbre.** All prompts use the default piano sound. Hearing degrees on guitar, sax-like and bass timbres matters for transfer to recordings.

## 3. Recommendations, ranked

**R1. Put the key back into the degree, melody and wrong-note drills (S).** Play a short I-IV-V-I (or i-iv-V-i) at the start of a block, keep that key for 5 to 10 questions (FET's ladder: same key first, random keys as a later setting), then after each answer play the stepwise resolution to the tonic (6-7-8, 4-3-2-1). Optional drone stays. Reuse `functionPlayback` from chords-in-a-key. Source: Functional Ear Trainer, Frontiers 2017 on context.

**R2. A "learn it by ear" player for real recordings (M to L).** Drop an audio file (the owner's own music; nothing bundled), loop A-B, slow to 50-100% with pitch preserved (Tone.js `GrainPlayer` or a SoundTouch worklet), transpose by semitones, a drone and "find home" button to name the tonic, then write what you hear as degrees or notes on the existing note editor. **Compare with Basic Pitch afterwards**, not before: the automatic transcription becomes the answer key and the diff is the score. Modes: melody, bass line, chords (degree slots per bar). Fits Library > Transcribe and Song Studio (a transcribed song lands in the library and can then be read and played). Sources: Woody and Lehmann 2010, Green 2002, practitioner consensus (Transcribe!, Anytune).

**R3. Song progressions by ear (M).** New items in the progressions drill: named loops played as a groove with bass and drums through the Jam backing (I-V-vi-IV, I-vi-IV-V, vi-IV-I-V, I-IV-V-IV, I-bVII-IV, i-bVII-bVI-bVII, i-bVII-bVI-V, ii-V-I, 12-bar blues). Answer by picking the loop or filling degree slots per bar. Then a "real recording" level: a time-stamped chord annotation plus the owner's audio file. The McGill Billboard set is CC0 (740 songs, [project page](https://ddmal.music.mcgill.ca/research/The_McGill_Billboard_Project_(Chord_Analysis_Dataset))); Isophonics has 179 Beatles songs ([annotations](https://c4dm.github.io/isophonics.net/content/reference-annotations-beatles.html), licence unclear, fine for a private app); Hooktheory's API lists songs that contain a progression ([docs](https://hooktheory.com/api/trends/docs)). Add bVII, bVI and iv as chord-in-a-key items.

**R4. Melodies with rhythm, longer, from real tunes (M).** Melody dictation and play-back on 1, 2 then 4 bar phrases with rhythm, taken from the Phrases list, the owner's songs and a public-domain folk corpus (Nottingham dataset with chords, [ABC](https://abc.sourceforge.net/NMD/); [The Session](https://thesession.org)). Order: sing it back, then play it back, then write it. Grading reuses `score-follower` for pitch and timing. Sources: Chenette (chunking), Woody and Lehmann (singing first), Kodály.

**R5. Reshape the Ear Training Path around songs (S, it is data).** Proposed 18 steps:
1 Anchor the tonic (with cadence) · 2 Degrees 1, 3, 5 then all seven · 3 Sing or play them back · 4 Echo a rhythm · 5 **Hear I, IV and V in a key** (moved up) · 6 Spot the wrong note · 7 Short melodies with rhythm (R4) · 8 Write a rhythm down · 9 Follow the bass, roots · 10 **Song loops by ear** (R3, add vi) · 11 **Find the key of a real song** (R2) · 12 Chromatic colour and borrowed chords (bVII, bVI, iv) · 13 Intervals: size, names, singing (one step with links, as vocabulary) · 14 Scales and modes · 15 Inversions and sevenths, progressions with sevenths · 16 **Transcribe a melody from a recording** (R2, 8 bars) · 17 **Transcribe a bass line or progression** (R2) · 18 **Call and response over a groove** (R7).
Replace the single "mixed review" step with the scheduler surfacing due ear items in Today (it already spaces declarative items).

**R6. Real reading content and per-instrument reading (M to L).**
- Sight-reading levels 4 to 6: rests, ties, 3/4, accidentals, keys to four sharps and flats, then hands-together with a left hand drawn from accompaniment patterns (block, broken, Alberti, root-fifth) under a chord progression, so the hands agree harmonically. Use the existing two-hand and comping generators. Sources: Zhukov (accompanying, rhythm, style), Kopiez and Lee.
- Corpus phrases beside the random walk: folk tunes for melody (Nottingham, The Session), hymns and Bach chorales for four-part piano reading ([Mutopia](https://www.mutopiaproject.org)). Real tunes carry the patterns readers chunk.
- Reading steps in the Guitar Path (first position notes on strings 1 to 3, then all six; read a folk tune in first position; then fifth position), the same for ukulele, and a short Aerophone reading track (the Roland lesson order already in `aero-skills.ts`, then folk tunes). Flashcards gain accidentals and ledger lines.
- Before each sight-reading phrase, an optional "hear it in your head" pause, then sing or hum the first bar (Mishra: aural and singing treatments work).

**R7. Call and response over a groove (M).** The app plays a 1 or 2 bar phrase over a Jam backing; the owner plays it back (graded like Phrases), then later **answers** with their own phrase (graded only on landing on a chord tone and staying in time; the take is kept). This joins ear, improvising and writing. Pads already have the playback half; reuse it on all instruments.

**R8. Read and tap from the generator (S).** Feed `earRhythmPattern` levels into read and tap, so rhythm reading has the same 8 levels as echo and dictation, plus a rhythm-only sight-reading climb (Sight Reading Factory does this). Show counts with "e and a" and triplet syllables; Gordon or Takadimi syllables as a setting only.

**R9. A Harmony for Songs path (M).** Theory that an improviser uses, each step paired with an ear drill and an instrument action: diatonic chords and their functions; I-IV-V and the 12-bar blues; vi and the four pop loops; V7 and ii-V-I; secondary dominants (V/V, V/vi); borrowed chords (bVII, bVI, iv); minor keys and the Andalusian cadence; song form (verse, chorus, AABA, 12 and 16 bar blues); chord tones and guide tones over changes (link to Jam and Chord scales). Order from Open Music Theory and Hooktheory I and II; jazz steps defer to the Jazz Path.

**R10. Interleave ear and reading with instrument work (S).** In Today's routine, a 3 to 5 minute ear slot and a 3 to 5 minute reading slot on most days, scaled with the time budget (10 min: one of them; 30+: both). Use one song across modalities: hear it, sing it, find it by ear on the instrument, then read its score, then play it in Song Studio (Kodály's sound before symbol). Ear steps already link from instrument paths; add the reverse (each ear step names an instrument step to try it on).

**R11. Timbres (S).** Play prompts on piano, nylon or steel guitar, electric bass for bass lines, and a sax-like patch; random by default after a level is passed.

## 4. Content: songs for ear training

Sources for notes and chords: [Hooktheory TheoryTab](https://www.hooktheory.com/theorytab) (melody and chords as degrees; Hookpad exports MIDI and MusicXML), [Songsterr](https://www.songsterr.com) (tab, Guitar Pro), [MuseScore](https://musescore.com) (MusicXML), [Weimar Jazz Database](https://jazzomat.hfm-weimar.de/dbformat/dboverview.html) (456 transcribed jazz solos with chords, MIDI per solo), [McGill Billboard](https://ddmal.music.mcgill.ca/research/The_McGill_Billboard_Project_(Chord_Analysis_Dataset)) (time-stamped chords, CC0). Difficulty: 1 easy, 3 hard.

**Progressions (hear the loop, name the degrees)**

| Song | Progression | Key | Diff |
|---|---|---|---|
| La Bamba (Valens); Twist and Shout | I-IV-V | C; D | 1 |
| Wild Thing (Troggs) | I-IV-V-IV | A | 1 |
| Let It Be (Beatles); No Woman No Cry (Marley) | I-V-vi-IV | C | 1 |
| With or Without You (U2) | I-V-vi-IV | D | 1 |
| Stand by Me (Ben E. King) | I-vi-IV-V | A | 1 |
| Knockin' on Heaven's Door (Dylan) | I-V-ii, I-V-IV | G | 1 |
| Sweet Home Alabama (Skynyrd) | I-bVII-IV | D | 2 |
| All Along the Watchtower (Hendrix) | i-bVII-bVI-bVII | C#m | 2 |
| Hit the Road Jack (Charles) | i-bVII-bVI-V | Am | 2 |
| Oye Como Va (Santana) | i7-IV9 (Dorian) | Am | 2 |
| Hey Joe (Hendrix) | C-G-D-A-E, chain of fifths | E | 2 |
| Johnny B. Goode; Pride and Joy (SRV) | 12-bar blues | Bb; E | 2 |
| The Thrill Is Gone (B.B. King) | minor blues | Bm | 2 |
| Fly Me to the Moon; Autumn Leaves | ii-V-I chains round the circle | C/Am; Gm | 3 |
| Blue Bossa (Dorham) | minor and major ii-V | Cm | 3 |

**Bass lines and riffs (play back on bass strings, piano left hand or Aerophone)**

| Song | What it trains | Diff |
|---|---|---|
| Seven Nation Army (White Stripes) | 1-b3-1-b7-b6-5 in E, one string | 1 |
| Another One Bites the Dust (Queen) | repeated root, b3, 4 | 1 |
| Smoke on the Water (Deep Purple) | parallel fourths, 1-b3-4 | 1 |
| Stand by Me | I-vi-IV-V arpeggiated bass | 1 |
| Sunshine of Your Love (Cream) | blues-scale riff | 2 |
| Come Together; Billie Jean | syncopated minor lines | 2 |
| My Girl (Temptations); Under Pressure (Queen) | repeated figures, pedal | 2 |
| Money (Pink Floyd) | Bm riff in 7/4 | 3 |

**Melodies (sing first, then play; public domain marked PD)**

| Song | What it trains | Diff |
|---|---|---|
| Ode to Joy (PD) | steps on 1 to 5 | 1 |
| Twinkle Twinkle; When the Saints (PD) | 1, 5, 6 leaps; major triad | 1 |
| Amazing Grace; Auld Lang Syne (PD) | major pentatonic, 3/4 and 4/4 | 1 |
| Happy Birthday | 3/4, octave leap | 1 |
| Scarborough Fair (PD) | Dorian, raised 6 | 2 |
| Greensleeves (PD) | minor, raised 6 and 7, 6/8 | 2 |
| Let It Be; Imagine; Hallelujah (Cohen) | pop phrasing, repeated notes | 2 |
| Over the Rainbow | octave and sixth leaps | 2 |
| C Jam Blues (Ellington) | two notes over a blues | 1 |
| Sonnymoon for Two; Tenor Madness; Bags' Groove | blues heads | 2 |
| St. Thomas (Rollins); Watermelon Man; Cantaloupe Island | jazz heads, good on the Aerophone | 2 |

**Solos to transcribe (check WJazzD's list first; many are in it):** Miles Davis, So What and Freddie Freeloader (Kind of Blue); Paul Desmond, Take Five; Sonny Rollins, St. Thomas; Cannonball Adderley, Autumn Leaves (Somethin' Else); B.B. King, The Thrill Is Gone; Freddie King, Hide Away. Slow lines and blues first, bebop last.

**Reading corpus (free):** Nottingham folk tunes with chords (ABC), The Session (ABC), Mutopia (Bach chorales, easy classical, MusicXML/LilyPond), Essen folksong collection (single-line melodies for sight-singing).

## 5. Open questions for the owner

1. **Singing:** will you sing (or hum) answers? The evidence favours it for ear and reading; if not, play-back becomes the default answer mode.
2. **Your own recordings:** may the app read audio files you own for the learn-by-ear player and the real-song progression levels? Which songs or artists should seed the list?
3. **Aerophone reading:** concert pitch, or transposed for a saxophone (which one: alto in Eb, tenor in Bb)?
4. **Guitar reading:** standard notation as a goal, or tab plus chord charts only?
5. **Labels:** degree numbers, movable do (with "do-based" minor, as now) or both? And rhythm counts as numbers only, or a syllable system?
6. **Path order:** accept moving chords in a key and song loops ahead of interval naming, as in R5?
