# Ear training and Harmony for Songs: the full path (round 2, 2026-10-27)

One path with two strands, interleaved level by level: **Ear** (hear it, sing it, find it, write it) and **Harmony for Songs** (what you just heard, named and used). Every level ends on a song shelf: real songs learned by ear from the recording, then checked against a MuseScore score. The Circle of Fifths Path and the Studio Ears Path fold in where they help (marked **Circle T-n** and **Studio S-n**, the app's step ids). The READING path is designed separately; this path links to it.

Sources: round-1 report `context/research/curriculum-2026-10/ear-reading-theory.md` (R1 to R11), `context/research/ear-drills-sequencing.md`, `context/research/circle-of-fifths.md`, the app's ear, rhythm, circle, jam and listening content (`packages/music-core/src/content/*.ts`, `progress/paths.ts`).

## 1. Target and scope

**Done means** the owner can put on a recording they like and, with a loop-and-slow player and their instrument:

- find the key and the tonic in under a minute, and say if it is major, minor or modal;
- write down a 16-bar melody with its rhythm, the bass line and the chords (as numerals and symbols) of a pop, rock, blues or soul song, about 85% right against a published score, in under an hour;
- hear and name the common loops, the blues, borrowed chords (bVII, bVI, iv), secondary dominants, ii-V-I in major and minor, and the form (verse, chorus, bridge, AABA, 12-bar);
- transcribe and play back a short solo (12 to 24 bars, blues, rock or medium-tempo jazz), and reuse its licks;
- answer a phrase with their own (call and response) on any of their instruments, landing on chord tones;
- sing what they hear (a melody, its roots, a guide-tone line) in tune within about 35 cents;
- explain a song's harmony in functions and pick a chord-scale to improvise on it, and reharmonise a simple tune two or three ways.

**External benchmarks.** Ear: Trinity Rock and Pop / RSL Rock and Pop aural tests at about grade 6 to 8 (melodic recall, chord sequence recognition, play-back of a riff), and ABRSM aural tests to about grade 6 (sing back, cadences, chord recognition), with transcription well beyond both. Harmony: Berklee Harmony 1 to 3 (diatonic function, secondary dominants, modal interchange, chord-scales), Hooktheory I and II, and Open Music Theory's pop and jazz chapters. The jazz steps stop where the Jazz Path takes over (rootless and altered voicings, bebop).

**Time.** At about 30 minutes a day (10 ear drills, 15 song-by-ear, 5 theory), each level takes 4 to 10 weeks: about **19 to 22 months** for all 11 levels. With 10-minute days, do the drills and one shelf song a fortnight and expect three years; with 60-90 minute days, about a year. Song-by-ear time counts double for the instrument paths, so it is not extra time on top of them.

**Rules that hold at every level**

- **Sound before symbol.** Every new chord, scale or form is heard and sung before it is named (Kodály, Gordon). Each Harmony step is paired with the ear drill that hears it and a song that uses it.
- **Key context always.** Degree, melody and wrong-note drills start with a cadence and keep the key for a block, then resolve to the tonic after the answer (R1, NEW N1 until built).
- **The shelf loop.** For each song: listen three times without the instrument; sing the hook; find the tonic; sing and then play the melody (or riff, or bass) a phrase at a time; work out the chords per bar as numerals; write it down; only then open the MuseScore score and mark what you got wrong. A song passes when the melody, bass or chords (whatever the shelf row asks for) are about 85% right and you can play it with the record.
- **Scheduler, not "mixed review".** Due ear and theory items surface in Today (R5); a level's drills stay in rotation after it is passed.
- **Done on two days.** Every drill criterion below means met in two separate sessions on two different days, as the app's paths already require (min sessions 2).
- **Pick 2 or 3 shelf songs** to pass a level; the rest are spares for later or for the instrument paths.

**Accuracy thresholds** follow the app: 66% with four or more choices, 80% with two or three, 75% per note for dictation and singing, 80% of rhythm echoes with every onset in the window. Higher targets below are stated where a level needs them.

## 2. The path

Drill shorthand: `ear/<drill>?...` is `/music/learn/ear/<drill>?...`; `rhythm?...` is `/music/learn/rhythm?...`; `circle?...` is `/music/circle?...`; `listening?...` is `/music/listening?...`; `jam`, `chord-scales`, `licks`, `phrases`, `create`, `tuner` are their `/music/` routes. **NEW Nn** points to section 4. **H-n** numbers the Harmony for Songs topics. The ear player for real recordings (N2) and the check against the score (N3) are used from level 1; until they exist, use any player that loops and slows (Transcribe!, Anytune, Moises, YouTube at 0.75x) and compare by eye with the MuseScore score in the app's Song Studio.

### Level overview

| L | Name | Ear adds | Harmony adds | Weeks |
|---|---|---|---|---|
| 1 | Home | tonic, degrees 1 to 5, echo rhythm, riffs | major scale, keys near C (Circle T-1, T-2) | 4 |
| 2 | Three chords | all seven degrees, wrong note, short melodies, I IV V, roots | triads on each degree, function, cadences | 6 |
| 3 | The pop loops | vi, the four loops, roots on 1 2 4 5 6, the bass in the mix | relative minor, rotations of one loop | 6 |
| 4 | The blues | dominant 7, blues scale, blue notes, swing, call and response | 12-bar form, I7 IV7 V7, minor pentatonic | 7 |
| 5 | Minor keys | minor degrees and chords, harmonic minor, interval size | natural, harmonic, melodic minor; i iv V; Andalusian | 7 |
| 6 | Borrowed chords | chromatic degrees, bVII bVI iv, intervals named and sung | modal interchange, Mixolydian rock | 7 |
| 7 | Sevenths and secondary dominants | seventh qualities, ii-V-I, V/x, inversions, moving bass | diatonic sevenths, circle motion, slash chords | 8 |
| 8 | Modes and chord-scales | modes, modal vamps, singing modes | modes by brightness, chord-scale basics | 8 |
| 9 | Form and standards | form on recordings, minor ii-V, guide tones | song form, ii-V chains, turnarounds, backdoor | 10 |
| 10 | Short solos | solos from recordings, licks in keys | analysing a solo against the changes | 10 |
| 11 | Reharmonise and the whole song | tritone subs, diminished passing chords, modulation | substitution, reharmonisation, writing | 10 |

Each level below gives its steps (Ear steps E, Harmony steps H, Song steps S), the song shelf, and a level test.

**About the shelf links.** Every MuseScore link was found in the Orca browser on 2026-10-27 from MuseScore search results (title, instrumentation, level and author read off the result card), and 16 were opened to confirm the page and arrangement. "free" means a community score (free to view, play and usually download); "Official" means a licensed score (paid per score or with MuseScore Pro). Lead sheets (melody, chords, lyrics) were preferred because they check melody and chords at once; Dick Schmitt's free "lead sheet with lyrics" series covers many songs. Lead sheets are often in a different key from the record: transpose before comparing (N3 should do it). Fallbacks were not opened.

---

### Level 1: Home (about 4 weeks)

**Goal:** hear where home is in any song, sing and find degrees 1 to 5, echo simple rhythms, play a first melody and a riff by ear. **Harmony:** the major scale and the keys near C.

| # | Step | Drill and setup | Done means | Feeds |
|---|---|---|---|---|
| 1.1 E | Anchor the tonic | `ear/scale-degrees?answer=listen-along&level=anchor`; NEW N1 adds a I-IV-V-I cadence and keeps the key for 8 questions | Hum the tonic after the cadence, app check 80% over 20 items, two days | every shelf song |
| 1.2 E | Degrees 1 to 5 | `ear/scale-degrees?answer=choice&level=major-pentachord` (N1 resolution after each answer) | 80% over 20 items, two days | Ode to Joy, Saints |
| 1.3 E | Sing or play them back | `ear/scale-degrees?answer=play-back&level=major-pentachord`, then `answer=voice` | 75% of notes, voice within 50 cents | Ode to Joy |
| 1.4 E | Echo a rhythm | `rhythm?mode=echo&earLevel=quarters-eighths` | 80% of patterns with every onset in the window | Seven Nation Army, Smoke |
| 1.5 S | Find home in a real song | NEW N2 "find home" (drone on a chosen note under the track); until then `tuner` drone and hum along | Tonic right first try on 4 of 5 shelf songs | shelf |
| 1.6 H | H1 The major scale | Library reference (scales); `scales` on your instrument: C, G, F, D major | Whole and half step pattern recited; four scales clean at 72 bpm twice | Lean on Me |
| 1.7 H | Circle T-1 and T-2 | `circle?mode=order`, then `circle?mode=count&band=near`, then `band=two` | 95% under 2 s over 20 items, two days | key names on the shelf |
| 1.8 S | First melody by ear | Shelf loop on a melody; check in `phrases` (Ode to Joy is built in) or against the score | Two shelf melodies played through, at most 2 wrong notes each | Ode to Joy, Saints, Jingle Bells |
| 1.9 S | First riff by ear | Shelf loop on a riff, one string or one hand | Riff in time with the record, four times clean | Seven Nation Army, Smoke, One Bites |
| 1.10 E | Sing the tonic of anything | NEW N2 "find home"; any song you hear during the day, hum home, check | 10 songs logged in the journal, 8 right | habit |

**Song shelf, level 1 (melodies and riffs)**

| # | Song, artist | Learn by ear | Key, tempo, harmony | Diff | MuseScore (checked) | Fallback |
|---|---|---|---|---|---|---|
| 1 | Ode to Joy, Beethoven (trad. arr.) | Melody: steps on 1 to 5, one leap to low 5 | C or D, 100 bpm, I and V | 1 | [free lead sheet](https://musescore.com/user/498481/scores/9215769) | Built into `phrases`; public domain |
| 2 | When the Saints Go Marching In, trad. | Melody 1-3-4-5 pickup motif; sing then play | F, 110 bpm (cut time), I IV V | 1 | [free lead sheet](https://musescore.com/user/498481/scores/6492182) | Public domain hymnals |
| 3 | Jingle Bells, Pierpont | Melody: repeated 3s, then 3-5-1-2-3 | G or C, 120 bpm, I IV V7 | 1 | [free lead sheet](https://musescore.com/user/37820377/scores/7159209) | Public domain |
| 4 | Happy Birthday, Hill sisters | Melody in 3/4, the octave leap 5 to high 5 | F or C, 3/4, I V7 IV | 1 | [free lead sheet](https://musescore.com/user/73143/scores/125579) | Public domain since 2016 (US) |
| 5 | Lean on Me, Bill Withers | Melody: stepwise 1-2-3-4 and back; I to IV by ear | C, 76 bpm, I IV I V | 1 | [free lead sheet](https://musescore.com/user/498481/scores/6282453) | Hooktheory TheoryTab |
| 6 | Seven Nation Army, White Stripes | Riff on one string: 1-1-b3-1-b7-b6-5; find home in a minor riff | E minor, 124 bpm, riff only | 1 | [free easy piano](https://musescore.com/user/28416909/scores/6853286) | Songsterr tab |
| 7 | Smoke on the Water, Deep Purple | Riff in parallel fourths: 1-b3-4, 1-b3-b5-4 | G minor, 112 bpm | 1 | [free keyboard transcription](https://musescore.com/user/13100381/scores/3031096) | Songsterr tab |
| 8 | Another One Bites the Dust, Queen | Bass riff with sixteenth pickups; roots and b3 | E minor, 110 bpm | 2 | [Official easy bass tab](https://musescore.com/user/39593079/scores/16096777) | Songsterr bass tab |

**Level test:** sing and then play two shelf melodies from memory (at most 2 slips), play one riff with the recording at full speed, and pass `ear/scale-degrees?level=major-pentachord` at 85% on a fresh day.

---

### Level 2: Three chords (about 6 weeks)

**Goal:** all seven major degrees in context, short melodies with rhythm, hear I, IV and V and follow their roots. **Harmony:** the triads of a key, Roman numerals, function (tonic, subdominant, dominant) and cadences.

| # | Step | Drill and setup | Done means | Feeds |
|---|---|---|---|---|
| 2.1 E | All seven degrees | `ear/scale-degrees?answer=choice&level=major-diatonic` with N1 | 80% over 20 items, two days | every melody |
| 2.2 E | Sing them back | `ear/scale-degrees?answer=voice&level=major-diatonic` | 75% of notes in the window | Amazing Grace |
| 2.3 E | Spot the wrong note | `ear/wrong-note?level=major-pentachord`, then `level=major-diatonic` | 80%, two days | reading path |
| 2.4 E | Short melodies | `ear/melody-dictation?level=major-diatonic`, then `answer=play-back`; NEW N5 for 1 and 2 bar phrases with rhythm | 75% per note, half the items fully right | Auld Lang Syne |
| 2.5 E | Echo and write rhythms | `rhythm?mode=echo&earLevel=rests-halves`, then `rhythm?mode=dictation&earLevel=rests-halves` | Echo 80%; dictation 75% per note | La Bamba, Twist and Shout |
| 2.6 H | H2 Triads on every degree | Library reference; `circle?mode=chords&band=two`; NEW N7 "numeral this chord" | Quality pattern (Maj min min Maj Maj min dim) recited; chords of C G D F A Bb named under 5 s, 95% | all shelf songs |
| 2.7 H | H3 Function and cadences | `ear/cadences` (authentic, plagal, half); Library reference | Cadences 80% over 20 items | Twist and Shout (V at the end of each line) |
| 2.8 E | Major or minor chord | `ear/chord-qualities?answer=choice&qualities=major,minor` | 80% | |
| 2.9 E | Hear I, IV and V in a key | `ear/chord-functions?answer=choice&functions=I,IV,V` | 80% over 20 items | La Bamba, Bad Moon Rising |
| 2.10 E | Follow the bass: roots 1, 4, 5 | `ear/bass-lines?answer=choice&bassLevel=roots-primary` | 75% | Wild Thing |
| 2.11 E | I, IV, V progressions | `ear/progressions?answer=choice&functions=I,IV,V` | 75% | Brown Eyed Girl |
| 2.12 H | Circle T-3, up to four | `circle?mode=count&band=four` | 95% under 2 s | key of each song |
| 2.13 S | Chords of a three-chord song | Shelf loop for chords: hum the bass, test I, IV or V each bar, write numerals | Chords per bar 90% right on two songs | shelf |
| 2.14 S | Melody with its rhythm | Shelf loop for a melody, write 8 bars with rhythm (N3 to check) | 85% of notes and rhythms vs the score | Amazing Grace, Auld Lang Syne, Jet Plane |

**Song shelf, level 2 (three-chord songs and 3/4 melodies)**

| # | Song, artist | Learn by ear | Key, tempo, harmony | Diff | MuseScore (checked) | Fallback |
|---|---|---|---|---|---|---|
| 1 | Amazing Grace, trad. | Melody in 3/4, major pentatonic; then the chords | G or F, 3/4, 72 bpm, I IV V | 1 | [free lead sheet](https://musescore.com/user/498481/scores/7888130) | Public domain hymnals |
| 2 | Auld Lang Syne, trad. | Pentatonic melody with dotted rhythm; I V IV | F, 4/4, 80 bpm | 1 | [free lead sheet](https://musescore.com/user/498481/scores/6518292) | Public domain |
| 3 | La Bamba, Ritchie Valens | The I-IV-V loop and the riff | C, 150 bpm, I IV V loop | 1 | [free lead sheet](https://musescore.com/user/498481/scores/6425783) | Ultimate Guitar chords |
| 4 | Twist and Shout, Beatles | I-IV-V loop; the rising 5-6-7-8 vocal stack on V | D, 126 bpm | 1 | [free lead sheet](https://musescore.com/user/498481/scores/23339383) | Hooktheory TheoryTab |
| 5 | Three Little Birds, Bob Marley | I-IV-I-V; offbeat skank; bass line | A, 74 bpm | 1 | [free bass line](https://musescore.com/user/32634103/scores/6877191) | Official lead sheet: https://musescore.com/user/39593079/scores/16077244 |
| 6 | Bad Moon Rising, CCR | I-V-IV-I verse, IV-I-V-I chorus; melody | D, 180 bpm | 1 | [free lead sheet](https://musescore.com/user/498481/scores/7059093) | Ultimate Guitar chords |
| 7 | Wild Thing, Troggs | I-IV-V-IV, the most famous three-chord riff | A, 105 bpm | 1 | [free lead sheet](https://musescore.com/user/498481/scores/23533453) | Songsterr |
| 8 | Brown Eyed Girl, Van Morrison | I-IV-I-V verse; the guitar intro riff; vi appears in the chorus | G, 150 bpm | 2 | [free lead sheet](https://musescore.com/user/498481/scores/6332909) | Songsterr intro riff |
| 9 | Leaving on a Jet Plane, John Denver | Melody with long held notes; I-IV and V | G (Denver in A), 4/4, 90 bpm | 2 | [Official lead sheet](https://musescore.com/user/39593079/scores/15790000) | Ultimate Guitar chords |

**Level test:** from the recording alone, write the melody (8 bars, with rhythm) and chords of one shelf song at 85% against the score and play both; name I, IV or V for every bar of a second song you have not prepared; `ear/progressions?functions=I,IV,V` at 80% on a fresh day.

---

### Level 3: The pop loops (about 6 weeks)

**Goal:** hear vi, recognise the four-chord loops and their rotations, follow roots on 1, 2, 4, 5, 6, and pick the bass out of a mix. **Harmony:** the relative minor and why the loops are one loop.

| # | Step | Drill and setup | Done means | Feeds |
|---|---|---|---|---|
| 3.1 E | Chords in a key with vi | `ear/chord-functions?answer=choice&functions=I,IV,V,vi` | 75% over 20 items | Let It Be |
| 3.2 E | Song loops by ear | `ear/progressions?answer=choice&functions=I,IV,V,vi`; NEW N4 plays named loops (I-V-vi-IV, I-vi-IV-V, vi-IV-I-V, I-IV-vi-V) as a groove with bass and drums | Loop named first try 80% | every shelf song |
| 3.3 E | Roots on 1, 2, 4, 5, 6 | `ear/bass-lines?answer=choice&bassLevel=roots-diatonic` | 75% | Stand by Me |
| 3.4 H | H4 The relative minor | Circle T-5 `circle?mode=neighbours&band=four`, then `circle?mode=count&band=four&minor=both` | 95% under 2 s | Someone Like You |
| 3.5 H | H5 One loop, four rotations | Library reference; `jam` with `pop-axis` in C, G and D; play the loop starting on each chord | Loop played in three keys along Jam, two choruses each, no lost place | Let It Be, No Woman, Believin' |
| 3.6 E | Hear the low band (Studio S-1, S-2) | `listening?exercise=peak&bands=3&gain=12&material=noise`, then `bands=5` | The Studio path's criterion for S-1 and S-2 | bass lines in a mix |
| 3.7 E | Bands on loops (Studio S-3) | `listening?exercise=peak&bands=9&gain=12&material=drums`, then `material=music` | S-3 criterion | |
| 3.8 E | Two-bar melodies with rhythm | NEW N5 at 2 bars, sing first, then play back | 75% per note and onset | choruses |
| 3.9 E | Dotted rhythms | `rhythm?mode=echo&earLevel=dotted`, then `mode=dictation&earLevel=dotted` | Echo 80%, dictation 75% | Riptide, Perfect |
| 3.10 S | Transcribe a loop and its bass | Shelf loop for chords and bass (N2, N3) | Two songs: loop and bass roots right for every bar | shelf |
| 3.11 S | Transcribe a chorus melody | Shelf loop, 8 to 16 bars, N3 against the score | 85% notes and rhythms | Let It Be, Someone Like You, Hallelujah |
| 3.12 S | Sing roots while you play | Play the loop on your instrument and sing the bass roots (NEW N12 grades the voice) | Two choruses, roots in tune within 50 cents 75% | |
| 3.13 H | Write over a loop | `create` (preset progression in the roll), an 8-bar melody over I-V-vi-IV that ends on 1 | Saved; every strong-beat note a chord tone (self-check, N10 when built) | writing |

**Song shelf, level 3 (the four-chord loops)**

| # | Song, artist | Learn by ear | Key, tempo, harmony | Diff | MuseScore (checked) | Fallback |
|---|---|---|---|---|---|---|
| 1 | Let It Be, Beatles | I-V-vi-IV verse; the IV-I/3 walk-down; chorus melody | C, 72 bpm | 1 | [Official easy lead sheet](https://musescore.com/user/39593079/scores/15757582) | Hooktheory TheoryTab |
| 2 | Stand by Me, Ben E. King | I-vi-IV-V bass riff, sing the roots | A, 118 bpm | 1 | [free lead sheet](https://musescore.com/user/28057894/scores/6220414) | Songsterr bass |
| 3 | No Woman, No Cry, Bob Marley | I-V-vi-IV as one loop; organ fills | C, 80 bpm | 1 | [Official lead sheet](https://musescore.com/user/39593079/scores/15538243) | Hooktheory TheoryTab |
| 4 | With or Without You, U2 | I-V-vi-IV over a pedal-like bass: hear the bass move D-A-B-G | D, 110 bpm | 1 | [Official lead sheet](https://musescore.com/user/39593079/scores/15492718) | Songsterr bass |
| 5 | Someone Like You, Adele | I-V-vi-IV with I/3; chorus melody leaps | A, 67 bpm | 2 | [free lead sheet](https://musescore.com/user/9424386/scores/5348175) | Hooktheory TheoryTab |
| 6 | Perfect, Ed Sheeran | I-vi-IV-V in 6/8 (12/8 feel) | Ab (lead sheet in G or C), 63 bpm | 2 | [free lead sheet in G](https://musescore.com/user/28899113/scores/6271372) | Hooktheory TheoryTab |
| 7 | Take Me Home, Country Roads, John Denver | Verse I-vi-V-IV, chorus I-V-vi-IV: two rotations in one song | A, 82 bpm | 2 | [free lead sheet](https://musescore.com/user/498481/scores/35426672) | Ultimate Guitar chords |
| 8 | Riptide, Vance Joy | vi-V-I loop (Am G C): hear vi as the start | C (uke shapes), 102 bpm | 2 | [Official guitar lead sheet](https://musescore.com/user/39593079/scores/16005685) | Ultimate Guitar ukulele chords |
| 9 | Don't Stop Believin', Journey | I-V-vi-IV piano riff; the chorus arrives late (form) | E, 119 bpm | 2 | [Official lead sheet](https://musescore.com/user/39593079/scores/15853072) | Hooktheory TheoryTab |
| 10 | Hallelujah, Leonard Cohen | 'The fourth, the fifth, the minor fall, the major lift': hear IV, V, vi, IV as the lyric names them | C, 6/8, 56 bpm | 2 | [free lead sheet](https://musescore.com/user/28899113/scores/6263153) | Hooktheory TheoryTab |

**Level test:** name the loop of five shelf or new songs from the recording, first try, 4 of 5; transcribe one chorus (melody, bass roots, chords) at 85% against the score and play it with the record; `ear/chord-functions?functions=I,IV,V,vi` at 80%.

---

### Level 4: The blues (about 7 weeks)

**Goal:** hear the 12-bar form, the dominant 7, the blues scale and blue notes, swing, and start call and response. **Harmony:** I7 IV7 V7, quick change and turnaround, minor pentatonic over a major blues.

| # | Step | Drill and setup | Done means | Feeds |
|---|---|---|---|---|
| 4.1 H | H6 The 12-bar blues | Library reference; `jam` with `blues` in A and E (guitar, uke), C and F (piano), Bb and F concert (Aerophone) | Three choruses along Jam without losing the form | every shelf song |
| 4.2 E | Dominant 7 by ear | `ear/chord-qualities?answer=choice&qualities=major,minor,dominant-7` | 80% | Hound Dog |
| 4.3 E | Pentatonic and blues scales | `ear/scales?answer=choice&scales=major-pentatonic,minor-pentatonic,blues` | 80% | C Jam, Pride and Joy |
| 4.4 E | Blue notes in context | `ear/scale-degrees?level=chromatic-color` with the set narrowed to b3 and b7 (NEW N1 setting: chosen degrees) | 80% | Sunshine of Your Love |
| 4.5 E | Swing and shuffle | `rhythm?mode=echo&earLevel=swing`, `rhythm?mode=echo&earLevel=compound`, then dictation | Echo 80%, dictation 75% | Pride and Joy, Folsom |
| 4.6 S | Count the form | N2 with section markers (NEW N8): mark each chord change of a 12-bar blues on 3 recordings | Every change within a beat; quick change heard or not, right on 3 songs | shelf |
| 4.7 E | Call: echo a blues lick | Today: `phrases` (piano C blues lick, guitar A blues lick), `licks`; NEW N6 plays 1-bar calls over Jam blues | 75% of echoes graded right over 12 calls | improvising |
| 4.8 E | Response: answer the call | NEW N6 answer mode; today Jam tone roles: answer each 2 bars, land on a chord tone | 12 answers kept, 75% end on a chord tone in time | improvising |
| 4.9 H | Circle T-3 and T-4 | `circle?mode=count&band=all`, `circle?mode=signature&band=four&clefs=treble`, then `band=all&clefs=both` | 95% under 2 s (count), under 3 s (staff) | reading path |
| 4.10 S | Transcribe a blues head | Shelf loop; write it with rhythm (N3) | 85% notes and rhythms; play it with the record | C Jam, Tenor Madness |
| 4.11 S | Transcribe a riff or boogie bass | Shelf loop | Riff or bass for a full chorus, played with the record | Sunshine, Johnny B. Goode, Hound Dog |

**Song shelf, level 4 (blues, rock and roll, blues heads)**

| # | Song, artist | Learn by ear | Key, tempo, harmony | Diff | MuseScore (checked) | Fallback |
|---|---|---|---|---|---|---|
| 1 | C Jam Blues, Duke Ellington | Head of two notes over a 12-bar: first blues head by ear | C, swing 140 bpm, 12-bar | 1 | [Official Real Book](https://musescore.com/user/39593079/scores/15958057) | iReal Pro chart; Jazz Path repertoire |
| 2 | Hound Dog, Elvis Presley | 12-bar form, stop-time; melody on 1, b3, 4, 5 | C, 87 bpm (half-time feel) | 1 | [free lead sheet](https://musescore.com/user/498481/scores/6396009) | Ultimate Guitar |
| 3 | Folsom Prison Blues, Johnny Cash | Boom-chuck bass on 1 and 5; 12-bar-like verse | E (F live), 105 bpm | 1 | [Official Real Book](https://musescore.com/user/39593079/scores/16068442) | Songsterr |
| 4 | Johnny B. Goode, Chuck Berry | 12-bar I-IV-V; the double-stop intro (guitar) | Bb, 168 bpm | 2 | [free lead sheet](https://musescore.com/user/498481/scores/26611888) | Songsterr |
| 5 | Sweet Home Chicago, Robert Johnson / Blues Brothers | Shuffle, quick change, turnaround | E or F, shuffle 120 bpm | 2 | [Official lead sheet](https://musescore.com/user/39593079/scores/15542419) | Ultimate Guitar |
| 6 | Tenor Madness, Sonny Rollins | Jazz blues head; I7 IV7 with ii-V turnaround | Bb, 180 bpm swing | 2 | [Official Real Book](https://musescore.com/user/39593079/scores/15956131) | Rollins solo, free: https://musescore.com/user/1752166/scores/6208095 |
| 7 | Sunshine of Your Love, Cream | Blues-scale riff: 1-1-b7-1-5-b5-4-1 | D, 116 bpm | 2 | [free simplified bass tab](https://musescore.com/user/17492/scores/2026731) | Songsterr |
| 8 | Pride and Joy, Stevie Ray Vaughan | Shuffle riff and quick change; the boogie bass | E (Eb tuning), 117 bpm | 3 | [Official Real Book](https://musescore.com/user/39593079/scores/16066507) | Songsterr |

**Level test:** say quick change or not, and where the turnaround is, on three blues recordings; play one transcribed head and one riff with the record; three choruses of call and response over Jam blues with 75% of echoes right and answers kept.

---

### Level 5: Minor keys (about 7 weeks)

**Goal:** hear minor tonality, its degrees and chords, the raised 7 of harmonic minor, and interval size. **Harmony:** natural, harmonic and melodic minor; relative and parallel minor; i iv V, VI VII, the Andalusian cadence.

| # | Step | Drill and setup | Done means | Feeds |
|---|---|---|---|---|
| 5.1 E | Minor degrees | `ear/scale-degrees?answer=choice&level=minor-diatonic` with an i-iv-V-i cadence (N1) | 75% over 20 items | Greensleeves |
| 5.2 E | Major, minor, harmonic minor | `ear/scales?answer=choice&scales=major,natural-minor`, then add `harmonic-minor` | 80% | Bella Ciao |
| 5.3 H | H7 The minor key | Library reference; Circle T-5 minor signatures `circle?mode=count&band=all&minor=both` | Natural, harmonic, melodic forms played in A, E, D minor; 95% on minor keys under 2 s | |
| 5.4 E | Chords in a minor key | `ear/chord-functions?answer=choice&functions=I,IV,V&keyMode=minor`, then add VI and VII | 75% | Ain't No Sunshine |
| 5.5 E | Minor progressions | `ear/progressions?answer=choice&functions=I,IV,V&keyMode=minor`; N4 loops i-bVII-bVI-V (Andalusian), i-iv-v, i-VI-III-VII | 75% | Hit the Road Jack, Zombie |
| 5.6 E | Minor melodies and wrong notes | `ear/melody-dictation?level=minor-diatonic`, `ear/wrong-note?level=minor-diatonic` | 75% per note; 80% | Summertime |
| 5.7 E | Hear interval size | `ear/interval-compare?answer=choice` | 80% | |
| 5.8 E | Sixteenths | `rhythm?mode=echo&earLevel=sixteenths`, then dictation | Echo 80%, dictation 75% | Rolling in the Deep |
| 5.9 S | Transcribe a minor melody | Shelf loop, 16 bars, N3 | 85% | Greensleeves, Bella Ciao, Summertime |
| 5.10 S | Transcribe a minor progression and bass | Shelf loop | Chords and bass right for every bar of a verse | House of the Rising Sun, Hit the Road Jack |
| 5.11 E | Call and response in minor | N6 over a Jam minor vamp (today: Jam with `minor-ii-v-i` or your own track) | 12 answers, 75% end on a chord tone | |

**Song shelf, level 5 (minor keys)**

| # | Song, artist | Learn by ear | Key, tempo, harmony | Diff | MuseScore (checked) | Fallback |
|---|---|---|---|---|---|---|
| 1 | Ain't No Sunshine, Bill Withers | Am-Em-G-Am: i-v-VII; the repeated 'I know' line | A minor, 78 bpm | 1 | [free lead sheet](https://musescore.com/user/498481/scores/25839637) | Hooktheory TheoryTab |
| 2 | Hit the Road Jack, Ray Charles | Andalusian i-VII-VI-V, bass walks down; call and response vocals | A minor, 172 bpm | 1 | [free lead sheet](https://musescore.com/user/498481/scores/6252330) | Hooktheory TheoryTab |
| 3 | Bella Ciao, Italian folk | Minor melody with V7 (harmonic minor); i-iv-V7 | D or A minor, 120 bpm | 1 | [Official lead sheet](https://musescore.com/user/97106398/scores/19071283) | Public domain; The Session |
| 4 | Zombie, The Cranberries | Em-C-G-D: hear it as i-VI-III-VII, not I-V-vi-IV | E minor, 84 bpm | 1 | [Official easy lead sheet](https://musescore.com/user/39593079/scores/15808066) | Hooktheory TheoryTab |
| 5 | Greensleeves, trad. | Minor melody with raised 6 and 7; 3/4 (6/8) | A or E minor, 3/4 | 2 | [free lead sheet](https://musescore.com/user/498481/scores/6310201) | Public domain; `phrases` has it on piano |
| 6 | House of the Rising Sun, The Animals | i-III-IV-VI, i-III-V: the major V and major IV in minor; arpeggio bass | A minor, 6/8, 117 bpm | 2 | [free lead sheet](https://musescore.com/user/498481/scores/6418685) | Songsterr |
| 7 | Summertime, Gershwin | Minor blues-tinged melody, i6-iv6, V7 | A or D minor, slow swing | 2 | [Official easy lead sheet](https://musescore.com/user/39593079/scores/15866803) | Jazz Path repertoire (Jam) |
| 8 | Rolling in the Deep, Adele | i-v-VII then VI-VII-i; sixteenth-note vocal rhythm | C minor, 105 bpm | 2 | [free keyboard lead sheet](https://musescore.com/user/18904256/scores/30263990) | Hooktheory TheoryTab |

**Level test:** say major or minor for 10 recordings (9 right); transcribe one minor melody and one minor progression at 85%; hear the Andalusian cadence in a new song.

---

### Level 6: Borrowed chords and Mixolydian rock (about 7 weeks)

**Goal:** hear the chromatic degrees, the borrowed chords bVII, bVI, iv and bIII, and name intervals as vocabulary. **Harmony:** modal interchange, Mixolydian rock, the minor iv in a major key.

| # | Step | Drill and setup | Done means | Feeds |
|---|---|---|---|---|
| 6.1 E | Chromatic colour | `ear/scale-degrees?answer=choice&level=chromatic-color` | 66% (many choices) | Norwegian Wood |
| 6.2 H | H8 Borrowed chords | Library reference; NEW N7 "spot the borrowed chord" in written progressions | 90% on 20 progressions | all shelf songs |
| 6.3 E | Hear bVII, bVI and iv | NEW N4 items in `ear/chord-functions` (bVII, bVI, iv, bIII beside I IV V vi) | 75% | Hey Jude, Creep |
| 6.4 E | Rock loops by ear | NEW N4 loops I-bVII-IV, I-bVII-IV-I, i-bVII-bVI-bVII, I-III-IV-iv | First try 80% | Sweet Home Alabama, Watchtower |
| 6.5 E | Name intervals, a few at a time | `ear/intervals?answer=choice&intervals=M3,P5,P8`, then `P1,P4,P5,P8`, then `m3,M3,m6,M6` | 66% per set, then all twelve | |
| 6.6 E | Sing intervals back | `ear/intervals?answer=voice&intervals=M3,P5,P8`; warm up `ear/fine-pitch?startCents=50` | 75% in the window | |
| 6.7 E | Major, Lydian, Mixolydian | `ear/scales?answer=choice&scales=major,lydian,mixolydian` | 80% | Norwegian Wood |
| 6.8 E | Syncopation | `rhythm?mode=echo&earLevel=syncopation`, then dictation | 80% / 75% | Here Comes the Sun |
| 6.9 E | Find the cut (Studio S-4, S-5) | `listening?exercise=cut&bands=9&gain=12&material=music`, then `exercise=peak&bands=9&gain=6&material=drums` | Studio criteria | |
| 6.10 S | Transcribe chords with a borrowed chord | Shelf loop, N3 | Every bar right, the borrowed chord named | Creep, Hey Jude, Don't Look Back |
| 6.11 S | Transcribe a melody with chromatic notes | Shelf loop | 85% | Norwegian Wood, Space Oddity |
| 6.12 H | Write with one borrowed chord | `create`: 16 bars, verse and chorus, one bVII or iv | Saved and played; the borrowed chord resolves | writing |

**Song shelf, level 6 (borrowed chords and Mixolydian)**

| # | Song, artist | Learn by ear | Key, tempo, harmony | Diff | MuseScore (checked) | Fallback |
|---|---|---|---|---|---|---|
| 1 | Sweet Home Alabama, Lynyrd Skynyrd | D-C-G: I-bVII-IV Mixolydian loop; the riff | D, 98 bpm | 1 | [free lead sheet](https://musescore.com/user/33364610/scores/5856696) | Songsterr |
| 2 | All Along the Watchtower, Jimi Hendrix | i-bVII-bVI-bVII Aeolian loop | C# minor, 113 bpm | 1 | [Official lead sheet](https://musescore.com/user/39593079/scores/15508291) | Songsterr |
| 3 | Hey Jude, Beatles | Verse I-V7-I-IV; the coda I-bVII-IV-I | F, 74 bpm | 2 | [Official easy lead sheet](https://musescore.com/user/39593079/scores/15757552) | Hooktheory TheoryTab |
| 4 | Creep, Radiohead | G-B-C-Cm: I-III-IV-iv, the major III and minor iv | G, 92 bpm | 2 | [Official easy lead sheet](https://musescore.com/user/39593079/scores/15808090) | Hooktheory TheoryTab |
| 5 | Don't Look Back in Anger, Oasis | I-V-vi-iii-IV-I-ii-V and the iv (Fm) in the pre-chorus | C, 82 bpm | 2 | [free lead sheet](https://musescore.com/user/38864145/scores/26655229) | Ultimate Guitar |
| 6 | Norwegian Wood, Beatles | Mixolydian melody (b7) in 3/4; bridge in parallel minor | E, 3/4, 180 bpm | 2 | [Official lead sheet](https://musescore.com/user/39593079/scores/15721252) | Songsterr |
| 7 | Here Comes the Sun, Beatles | bVII-IV-I in the bridge; uneven bar groupings (11/8, 7/8) | A, 129 bpm | 3 | [free lead sheet](https://musescore.com/user/498481/scores/7628372) | Songsterr |
| 8 | Space Oddity, David Bowie | I-iii, IVmaj7-iii7, bVII and borrowed chords in the bridge | C, 68 bpm | 3 | [free lead sheet](https://musescore.com/user/65179501/scores/22563721) | Ultimate Guitar |

**Level test:** name every chord of two new songs that use bVII or iv; play one shelf song's melody and chords with the record; intervals all twelve ascending at 66%.

---

### Level 7: Sevenths, ii-V-I and secondary dominants (about 8 weeks)

**Goal:** hear seventh qualities, ii-V-I, secondary dominants, inversions and a moving bass. **Harmony:** sevenths on every degree, root motion round the circle, tonicisation, slash chords and line clichés.

| # | Step | Drill and setup | Done means | Feeds |
|---|---|---|---|---|
| 7.1 E | Seventh qualities | `ear/chord-qualities?answer=choice&qualities=major-7,dominant-7,minor-7`, then add half-diminished and diminished 7 | 75% | Just the Two of Us |
| 7.2 H | H9 Diatonic sevenths and the circle | Circle T-6 `circle?mode=chords&band=four`, T-7 `circle?mode=wheel&band=all`, T-8 round the circle on your instrument | T-6 95% under 5 s; blank wheel from memory; T-8 links done | Fly Me to the Moon |
| 7.3 E | ii-V-I by ear | `ear/progressions?answer=choice&functions=I,ii,V&chordSize=sevenths` | 75% | All of Me |
| 7.4 H | H10 Secondary dominants | Library reference; N7 "spot the V of" in progressions (II7, III7, VI7, I7) | 90% on 20 | Yesterday, Isn't She Lovely |
| 7.5 E | Hear secondary dominants | NEW N4 items V/V, V/vi, V/ii, V/IV in `chord-functions` and `progressions` | 66% | Hotel California, Georgia |
| 7.6 E | Inversions | `ear/inversions?answer=choice&inversions=root,first`, then `root,first,second`, then sevenths | 80%, then 66% | |
| 7.7 E | Bass with inversions | `ear/bass-lines?answer=choice&bassLevel=inversions` | 75% | Whiter Shade of Pale |
| 7.8 H | H11 Slash chords and line clichés | Library reference; play the walk-downs of Let It Be and Whiter Shade on your instrument | Both played with the record | Whiter Shade |
| 7.9 E | Dotted sixteenths | `rhythm?mode=echo&earLevel=dotted-sixteenths`, then dictation | 80% / 75% | Isn't She Lovely |
| 7.10 S | Transcribe a stepwise bass line | Shelf loop | Bass for a whole section at 85% | Whiter Shade, Don't Know Why |
| 7.11 S | Transcribe chords with secondary dominants | Shelf loop, symbols and numerals | Every bar right, every V/x labelled | Yesterday, Just the Two of Us, Fly Me |
| 7.12 H | Guide tones | `voicings` (guide-tone voice leading), then Jam `ii-v-i`: play 3rds and 7ths only (NEW N11 grades it) | Two choruses, 90% chord tones on beat 1 | Jazz Path shell voicings |

**Song shelf, level 7 (sevenths and secondary dominants)**

| # | Song, artist | Learn by ear | Key, tempo, harmony | Diff | MuseScore (checked) | Fallback |
|---|---|---|---|---|---|---|
| 1 | Yesterday, Beatles | V/vi (III7) to vi, then IV-V-I; AABA form preview | F, 97 bpm | 2 | [Official easy lead sheet](https://musescore.com/user/39593079/scores/15757534) | Hooktheory TheoryTab |
| 2 | A Whiter Shade of Pale, Procol Harum | Stepwise descending bass under slash chords | C, 76 bpm | 2 | [free lead sheet](https://musescore.com/user/33531210/scores/27790681) | Hooktheory TheoryTab |
| 3 | Isn't She Lovely, Stevie Wonder | vi-II7-V-I loop (C#m7-F#7-B-E): the II7 is V/V | E (lead sheet in Eb), 119 bpm | 2 | [free lead sheet in Eb](https://musescore.com/user/47458415/scores/12094480) | bass line, free: https://musescore.com/user/27687741/scores/5792038 |
| 4 | Just the Two of Us, Grover Washington Jr., Bill Withers | IVmaj7-III7-vi7: III7 as V/vi, then v7-I7 to IV | Ab (Fm), 96 bpm | 2 | [free lead sheet](https://musescore.com/user/28057894/scores/6220448) | Hooktheory TheoryTab |
| 5 | Don't Know Why, Norah Jones | Imaj7-I7-IVmaj7-III7-vi7-II7-V7: secondary dominants in a row | Bb, 88 bpm | 2 | [free lead sheet](https://musescore.com/user/21066206/scores/5903363) | Hooktheory TheoryTab |
| 6 | Fly Me to the Moon, Bart Howard | vi-ii-V-I-IV-vii-III7-vi: the circle of fifths in a song | C/Am, 120 bpm swing | 2 | [free lead sheet](https://musescore.com/user/498481/scores/6326152) | Jazz Path repertoire (Jam) |
| 7 | All of Me, Simons and Marks (standard) | I-III7-VI7-ii: a chain of secondary dominants | C, 120 bpm swing | 2 | [free lead sheet](https://musescore.com/user/498481/scores/6410009) | Jazz Path repertoire (Jam) |
| 8 | Georgia on My Mind, Ray Charles | I-iii7-VI7-ii7, line cliché in the bridge | F, 60 bpm | 3 | [Official Real Book](https://musescore.com/user/39593079/scores/16078576) | Jazz Path repertoire (Jam) |
| 9 | Hotel California, Eagles | Minor-key chain with major V and VI-III: Bm-F#-A-E-G-D-Em-F# | B minor, 74 bpm | 3 | [Official Real Book](https://musescore.com/user/39593079/scores/16040833) | Songsterr |

**Level test:** transcribe the chords of a song with at least two secondary dominants, symbols and numerals, every bar right; sing the guide-tone line of a ii-V-I in three keys; inversions root, first, second at 80%.

---

### Level 8: Modes and chord-scales (about 8 weeks)

**Goal:** hear and name the modes, recognise modal vamps, sing a mode over a drone, and improvise with a chord-scale. **Harmony:** modes by brightness, the characteristic note, chord-scale basics.

| # | Step | Drill and setup | Done means | Feeds |
|---|---|---|---|---|
| 8.1 E | Modes, bright side | `ear/scales?answer=choice&scales=major,lydian,mixolydian` | 80% | The Simpsons, Norwegian Wood |
| 8.2 E | Modes, dark side | `ear/scales?answer=choice&scales=natural-minor,dorian,phrygian,locrian`, then add melodic-minor | 66% | Scarborough Fair, Eleanor Rigby |
| 8.3 H | H12 Modes by brightness | Library reference; Circle (white-note modes F C G D A E B) | Name each mode's characteristic note; play all seven on one tonic | |
| 8.4 E | Modal vamps by ear | NEW N4 vamps: i-IV (Dorian), I-bVII (Mixolydian), I-II (Lydian), i-bII (Phrygian); `jam` `modal` | 75% | Oye Como Va, So What |
| 8.5 E | Sing a mode over a drone | `tuner` drone; NEW N12 grades sung scale steps | Dorian and Mixolydian up and down, 75% within 35 cents | |
| 8.6 H | H13 Chord-scale basics | `chord-scales?changes=major`, then `changes=minor`; Library chord-scale map | Chord-scale drill passed (its own criterion) for both | improvising |
| 8.7 E | Improvise on a modal vamp | `jam` `modal`, chord tones on strong beats (Jam tone roles; N6 answer grading) | Three choruses, 75% strong-beat notes chord or scale tones | |
| 8.8 S | Transcribe a modal melody | Shelf loop, N3 | 85% | Scarborough Fair, Eleanor Rigby |
| 8.9 S | Transcribe a modal bass line | Shelf loop | Bass for a whole section, played with the record | Billie Jean, Get Lucky, Another Brick |
| 8.10 E | Call and response in a mode | N6 over a Dorian vamp | 12 answers, 75% | |

**Song shelf, level 8 (modes and modal vamps)**

| # | Song, artist | Learn by ear | Key, tempo, harmony | Diff | MuseScore (checked) | Fallback |
|---|---|---|---|---|---|---|
| 1 | Scarborough Fair, trad. | Dorian melody: the raised 6 against minor | E or D Dorian, 3/4 | 1 | [free lead sheet](https://musescore.com/user/498481/scores/6476680) | Public domain |
| 2 | Oye Como Va, Tito Puente / Santana | Am7-D9 vamp: i-IV Dorian; the bass montuno | A Dorian, 125 bpm | 1 | [Official Real Book](https://musescore.com/user/39593079/scores/16041862) | Songsterr |
| 3 | Another Brick in the Wall pt. 2, Pink Floyd | Dm-G vamp: i-IV Dorian; the bass line | D Dorian, 104 bpm | 1 | [free band score with bass](https://musescore.com/user/2710216/scores/1943291) | Official easy bass tab: https://musescore.com/user/39593079/scores/15935362 |
| 4 | Eleanor Rigby, Beatles | Em-C alternation, Dorian C# in the melody | E minor (Dorian), 136 bpm | 2 | [Official lead sheet](https://musescore.com/user/39593079/scores/15774784) | Hooktheory TheoryTab |
| 5 | Billie Jean, Michael Jackson | Bass line F#-C#-E-F#-E-C#-B-C#; Dorian vamp | F# minor, 117 bpm | 2 | [free bass transcription](https://musescore.com/user/36422080/scores/7440794) | Songsterr bass |
| 6 | Get Lucky, Daft Punk | Bm-D-F#m-E loop: the same four chords heard in Dorian | F# Dorian (B minor feel), 116 bpm | 2 | [free lead sheet](https://musescore.com/user/30355504/scores/7631570) | Hooktheory TheoryTab |
| 7 | Moondance, Van Morrison | Am7-Bm7 Dorian vamp, walking bass, swing | A minor, 130 bpm swing | 2 | [Official lead sheet](https://musescore.com/user/39593079/scores/15756190) | Hooktheory TheoryTab |
| 8 | So What, Miles Davis | AABA: 16 bars D Dorian, 8 Eb Dorian, 8 D; the bass call and 'so what' answer | D Dorian, 136 bpm | 2 | [free trumpet head and solo (Bb)](https://musescore.com/user/27218966/scores/4889555) | walking bass, free: https://musescore.com/user/36479204/scores/13148005 |
| 9 | The Simpsons Theme, Danny Elfman | Lydian melody (raised 4) at speed | C Lydian, 170 bpm | 3 | [free piano](https://musescore.com/user/476186/scores/754776) | Official easy piano: https://musescore.com/user/39593079/scores/6976469 |

**Level test:** name the mode of six recordings or vamps (5 right); transcribe one modal bass line and one modal melody; improvise three choruses on a Dorian vamp with the strong-beat target.

---

### Level 9: Song form and standards (about 10 weeks)

**Goal:** hear form in any recording, follow ii-V chains in major and minor, play guide-tone lines through a standard. **Harmony:** song forms, ii-V chains, turnarounds, backdoor, rhythm-changes bridge.

| # | Step | Drill and setup | Done means | Feeds |
|---|---|---|---|---|
| 9.1 H | H14 Song form | Library reference: verse, pre-chorus, chorus, bridge; AABA, ABAC; 12 and 16-bar blues; 4 and 8-bar phrases | Form of 4 known songs written from memory | all |
| 9.2 S | Label form on recordings | NEW N8 markers on N2: every section boundary | 4 songs, every boundary within a bar | Satin Doll, Take the A Train |
| 9.3 H | H15 ii-V chains and turnarounds | Library reference; `jam` `ii-v-i` and `minor-ii-v-i` in 4 keys | Two choruses each, no lost place | Autumn Leaves, Blue Bossa |
| 9.4 E | Minor ii-V-i by ear | `ear/progressions?answer=choice&functions=I,ii,V&chordSize=sevenths&keyMode=minor` | 66% | Autumn Leaves |
| 9.5 E | Turnarounds and backdoor | NEW N4 items: I-vi-ii-V, iii-VI-ii-V, iv7-bVII7-I | 66% | Satin Doll |
| 9.6 E | Swing and triplets | `rhythm?mode=dictation&earLevel=swing` | 75% | St. Thomas |
| 9.7 H | Guide tones through a standard | NEW N11 in Jam over Autumn Leaves changes | Two choruses, 90% 3rds and 7ths on beat 1 | Autumn Leaves |
| 9.8 S | Transcribe a jazz head with chords | Shelf loop, lead sheet written, N3 | 85% melody, chords every bar | St. Thomas, Watermelon Man, Blue Bossa, Satin Doll |
| 9.9 S | Transcribe a jazz or Latin bass line | Shelf loop | One chorus of bass, played with the record | Cantaloupe Island, Watermelon Man |
| 9.10 E | Sing a head, then its roots | Voice over the recording (N12) | Head and roots each in tune 75% | |
| 9.11 S | Improvise a chorus on a shelf tune | `jam` with the tune's changes or your own track | Two choruses, 75% strong-beat chord tones | Jazz Path "improv" |
| 9.12 E | Producer ears (Studio S-6, S-7, optional) | `listening?exercise=boost-or-cut&gain=6&material=music`, then `exercise=compression&material=drums` | Studio criteria | |

**Song shelf, level 9 (standards and form)**

| # | Song, artist | Learn by ear | Key, tempo, harmony | Diff | MuseScore (checked) | Fallback |
|---|---|---|---|---|---|---|
| 1 | St. Thomas, Sonny Rollins | 16-bar calypso, I-vi-ii-V; motivic head | C, 200 bpm (half-time feel) | 1 | [Official Real Book](https://musescore.com/user/39593079/scores/15956014) | iReal Pro |
| 2 | Watermelon Man, Herbie Hancock | 16-bar blues variant, funk bass | F, 130 bpm | 1 | [free lead sheet](https://musescore.com/user/14207311/scores/5931451) | Songsterr |
| 3 | Cantaloupe Island, Herbie Hancock | 16 bars modal: Fm7-Db7-Dm7; the piano and bass riff | F minor, 112 bpm | 1 | [Official lead sheet](https://musescore.com/user/39593079/scores/15970843) | iReal Pro |
| 4 | Autumn Leaves, Kosma | AABC, ii-V-I in Bb then ii-V-i in Gm: hear the two homes | G minor / Bb, 140 bpm swing | 2 | [free lead sheet](https://musescore.com/user/498481/scores/11144275) | Jazz Path repertoire (Jam) |
| 5 | Blue Bossa, Kenny Dorham | 16 bars, minor ii-V-i and a ii-V to Db | C minor, 150 bpm bossa | 2 | [free lead sheet](https://musescore.com/user/498481/scores/7467650) | Jazz Path repertoire (Jam) |
| 6 | Satin Doll, Ellington and Strayhorn | AABA, ii-V chains stepping up a tone | C, 120 bpm swing | 2 | [free lead sheet](https://musescore.com/user/32454112/scores/25608463) | Jazz Path repertoire (Jam) |
| 7 | Take the 'A' Train, Strayhorn | AABA, the II7(#11) as V/V, bridge in IV | C, 160 bpm swing | 2 | [free lead sheet](https://musescore.com/user/32454112/scores/20287948) | iReal Pro |
| 8 | Take Five, Dave Brubeck | 5/4 vamp i-v; bridge of descending ii-Vs | Eb minor, 172 bpm | 2 | [Official lead sheet](https://musescore.com/user/39593079/scores/15492706) | iReal Pro |
| 9 | The Girl from Ipanema, Jobim | AABA with a 16-bar bridge that modulates up a half step | F, bossa 130 bpm | 3 | [free lead sheet](https://musescore.com/user/498481/scores/11114695) | Jazz Path repertoire (Jam) |

**Level test:** write the form and chords of a 32-bar standard you have not prepared, by ear, at 80% against the lead sheet; play a transcribed head with the record; guide tones through two choruses.

---

### Level 10: Short solos (about 10 weeks)

**Goal:** transcribe 12 to 24 bars of real solos, play them with the record, analyse them against the changes, and reuse the licks. **Harmony:** chord tones, tensions and approach notes as a soloist uses them.

| # | Step | Drill and setup | Done means | Feeds |
|---|---|---|---|---|
| 10.1 S | Sing the solo first | N2 at 70% speed, then 100% | Sing 8 bars along with the record at full speed | every shelf solo |
| 10.2 S | Transcribe 4, then 8, then 12 bars | N2 loop per phrase; N3 against the score | 85% notes and rhythms per chunk | shelf |
| 10.3 S | Play it with the record | Song Studio with the imported score, then N2 at 100% | Clean at 100% twice | shelf |
| 10.4 H | Analyse the solo | Write each note's role over the chord (chord tone, tension, approach); Jam tone roles to check | Every note labelled; two licks marked | |
| 10.5 E | Licks into keys | `licks` 12-key transposition with your two licks (NEW: user licks in `licks`) | Each lick in 4 keys at the record's tempo | improvising |
| 10.6 E | Use the licks | `jam` over the solo's changes, at least two of your licks per chorus | Three choruses kept | |
| 10.7 E | Intervals, all twelve, sung | `ear/intervals?answer=voice` all twelve; `ear/fine-pitch` to 25 cents (optional) | 75% in the window | |
| 10.8 E | Jazz phrases by ear | NEW N5 at 4 bars with chromatic approach notes | 75% per note | |
| 10.9 E | Dotted sixteenth and syncopated solos | `rhythm?mode=dictation&earLevel=dotted-sixteenths` | 75% | |

**Song shelf, level 10 (solos to transcribe)**

| # | Song, artist | Learn by ear | Key, tempo, harmony | Diff | MuseScore (checked) | Fallback |
|---|---|---|---|---|---|---|
| 1 | Let It Be (single), George Harrison solo | Major pentatonic guitar solo, 8 bars | C, 72 bpm | 1 | none: MuseScore has the song, not the solo (its "Solo Guitar" is a fingerstyle arrangement) | Songsterr "Let It Be" guitar track; the official lead sheet above for the changes |
| 2 | The Thrill Is Gone, B.B. King | Minor pentatonic with bends; short phrases and space | B minor blues, 92 bpm | 2 | [Official guitar tab](https://musescore.com/user/39593079/scores/15263317) | Songsterr |
| 3 | Freddie Freeloader, Miles Davis | Blues solo: few notes, strong rhythm | Bb blues, 126 bpm | 2 | [free trumpet solo (Bb)](https://musescore.com/user/7358771/scores/1964831) | WJazzD (Weimar Jazz Database) |
| 4 | So What, Miles Davis | First chorus of the Dorian solo | D/Eb Dorian, 136 bpm | 2 | [free trumpet solo (Bb)](https://musescore.com/user/27218966/scores/4889555) | C-instrument version, free: https://musescore.com/user/2282536/scores/5238316 |
| 5 | Take Five, Paul Desmond | Melodic alto solo over a 5/4 vamp | Eb minor, 172 bpm | 2 | [Official alto sax transcription (Eb)](https://musescore.com/user/39593079/scores/16099606) | WJazzD; JK Transcriptions piano, free: https://musescore.com/user/41447661/scores/7792001 |
| 6 | Comfortably Numb, David Gilmour | First solo: slow bends and vibrato in B minor | B minor, 63 bpm | 2 | [free solos transcription](https://musescore.com/user/20941876/scores/25050598) | Songsterr |
| 7 | Something, George Harrison | Short lyrical guitar solo over chromatic bass | C, 66 bpm | 2 | none: only bass and fingerstyle arrangements found | Songsterr "Something" lead guitar track |
| 8 | St. Thomas, Sonny Rollins | Motivic tenor solo: one idea developed | C, 200 bpm | 3 | [free tenor solo (Bb)](https://musescore.com/user/56052/scores/6155831) | WJazzD |
| 9 | Autumn Leaves, Cannonball Adderley | Alto solo over ii-V chains (a 1961 live take, not Somethin' Else) | G minor, 130 bpm | 3 | [free alto solo (Eb)](https://musescore.com/user/30970344/scores/7301132) | WJazzD for the 1958 studio take |
| 10 | My Funny Valentine, Chet Baker | Sparse, singable trumpet ballad solo | C minor, ballad | 2 | none suitable | No solo transcription found on MuseScore: Chet Baker transcription books (Hal Leonard), or transcribe it and check with a teacher; lead sheet in Jazz Path repertoire |

**Level test:** one rock or blues solo and one jazz solo transcribed (85% against the score) and played with the record at full speed; a chorus of your own over the same changes using two of its licks.

---

### Level 11: Reharmonise and the whole song (about 10 weeks)

**Goal:** a whole lead sheet by ear, hear substitutions and modulations, reharmonise and write. **Harmony:** diatonic substitution, tritone substitution, passing diminished chords, secondary ii-V, chromatic mediants, key changes.

| # | Step | Drill and setup | Done means | Feeds |
|---|---|---|---|---|
| 11.1 H | H16 Substitution | Library reference: iii and vi for I, ii for IV, tritone sub (bII7), passing #i°7, secondary ii-V, backdoor | Each substitution played under a melody in C | |
| 11.2 E | Tritone sub vs V7 | NEW N4 items bII7-I vs V7-I | 80% | Body and Soul |
| 11.3 E | Diminished passing chords | `ear/chord-qualities` with diminished 7; N4 item I-#i°7-ii | 75% | Misty |
| 11.4 E | Hear a key change | NEW N4 "where does it go": up a step, up a half step, relative, a third away | 75% | Bohemian Rhapsody, Wichita Lineman |
| 11.5 H | Reharmonise a tune three ways | NEW N10 sandbox, today `create` roll: Amazing Grace or Happy Birthday with (a) diatonic subs (b) secondary dominants (c) tritone subs and passing diminished | Three versions saved; melody notes on strong beats are chord tones or tensions | writing |
| 11.6 S | Original vs reharmonised version | Transcribe the chords of two versions of one song | Both chord charts right every bar; the substitutions labelled | Over the Rainbow, My Favorite Things |
| 11.7 S | A whole lead sheet by ear | N2, N3: melody, chords and form of a whole song | 85% melody, 85% chord bars | shelf |
| 11.8 H | Write and reharmonise your own tune | `create` + `record`: 16 or 32 bars, then a reharmonised second chorus | Recorded take kept in Journal | Reading path (write it out) |
| 11.9 E | Fine pitch (optional) | `ear/fine-pitch?startCents=50` staircase | Threshold at or under 25 cents | intonation |

**Song shelf, level 11 (whole songs and reharmonisation)**

| # | Song, artist | Learn by ear | Key, tempo, harmony | Diff | MuseScore (checked) | Fallback |
|---|---|---|---|---|---|---|
| 1 | Moon River, Mancini | 3/4 ballad: I-vi-IV-I with secondary dominants and iv | C, 3/4, 90 bpm | 2 | [free lead sheet](https://musescore.com/user/498481/scores/6212363) | Hooktheory TheoryTab |
| 2 | Over the Rainbow, Arlen (Judy Garland vs Israel Kamakawiwo'ole) | Original I-vi-ii-V with iii-VI7 vs IZ's simple I-iii-IV: two harmonisations of one melody | Eb / C, 4/4 ballad | 2 | [free lead sheet](https://musescore.com/user/498481/scores/6188901) | Ukulele chords for IZ: Ultimate Guitar |
| 3 | My Favorite Things, Rodgers (Julie Andrews vs Coltrane) | Original vs Coltrane's modal vamps on Em and E | E minor / E, 3/4 | 2 | [free lead sheet](https://musescore.com/user/498481/scores/6466459) | iReal Pro |
| 4 | Wichita Lineman, Jimmy Webb / Glen Campbell | Sus chords, borrowed iv, a melody that never resolves | F, 92 bpm | 2 | [free lead sheet](https://musescore.com/user/498481/scores/8795253) | Hooktheory TheoryTab |
| 5 | Misty, Erroll Garner | ii-V to IV, iv7-bVII7 backdoor, passing diminished | Eb, ballad | 3 | [free lead sheet](https://musescore.com/user/498481/scores/6849482) | Jazz Path repertoire (Jam) |
| 6 | Body and Soul, Johnny Green | Tritone subs throughout; bridge a half step up | Db, ballad | 3 | [free lead sheet](https://musescore.com/user/498481/scores/6480402) | iReal Pro |
| 7 | Bohemian Rhapsody, Queen | Whole song by ear: four sections, key changes Bb-Eb-A-Eb | Bb, 72 bpm and up | 3 | [free lead sheet](https://musescore.com/user/498481/scores/9877342) | Songsterr |
| 8 | Giant Steps, Coltrane | Chart only: keys a major third apart (B, G, Eb); hear the tonics move | B, 286 bpm | 3 | [free lead sheet](https://musescore.com/user/498481/scores/6680232) | WJazzD solo (listening only) |

**Level test (path final):** a whole song you have not prepared (from a list the owner picks), melody, chords and form by ear in under two hours, 85% against the score; play it; then a reharmonised chorus of it with at least one secondary dominant, one tritone sub and one borrowed chord.

---

## 3. Cross-links to other paths

| Here | Link to | Why |
|---|---|---|
| L1 1.6, L2 2.6 (major scale, triads) | Piano, guitar, ukulele scale and chord steps in their first levels | Play the scale and triads you just named |
| L1 1.9, L2 2.13 (riffs, three-chord songs) | Guitar and ukulele open chords and first strums; MPC rhythm echo | Same songs on the instrument |
| L2 2.3 (wrong note), 2.4 (short melodies) | READING path: sight-reading Primer to Level 1 | Error detection before reading, then read the tune you sang (Kodály) |
| L2 2.14, L3 3.11 (melody with rhythm) | READING path: rhythm reading with the same levels (R8) | Write it, then read it back |
| L3 3.5 (pop axis), L3 3.12 (sing roots) | Piano left hand roots, guitar/uke chord changes, Aerophone root-note tones | Play the loop you hear |
| L4 4.1 to 4.8 (blues, call and response) | Guitar minor pentatonic box and blues licks; piano blues shuffle; Aerophone blues improvisation; Jazz Path "licks" | Answer the call on your own instrument |
| L4 4.9 (signatures on the staff) | READING path key signatures | Same skill, read in context |
| L5 (minor) | Piano minor scales and cadences (`voicings?variant=cadence`); Aerophone minor tunes | |
| L6 6.5, 6.6 (intervals) | Jazz Path step 1 "Memorize your intervals" | Shared drill |
| L7 7.2 (circle), 7.12 (guide tones) | Circle T-6 to T-8; Jazz Path chord symbols, extensions, shell voicings; piano voicings | Voicings are the guide tones under the hands |
| L8 8.6 (chord-scales) | Jazz Path "Learn the chord-scale relationships"; guitar modes in positions | |
| L9 9.3 to 9.11 (standards) | Jazz Path rootless voicings, licks, improv, Real Book repertoire; Aerophone jazz heads | Standards on the shelf are in Jam's jazz repertoire |
| L10 (solos) | Guitar lead steps (bends, vibrato), Aerophone jazz heads and blues improvisation, piano jazz | Play the solo on the instrument you transcribed it for |
| L11 11.8 (write) | READING path: write out your own lead sheet; Create and Record | |

Instrument paths should link the other way too: each shelf song here that is also on an instrument shelf counts for both (one learning, two passes).

## 4. New drills and app changes, ranked

| # | Change | What it needs | Size |
|---|---|---|---|
| N1 | Key context in degree, melody and wrong-note drills | A I-IV-V-I (or i-iv-V-i) cadence at the start of a block; keep the key for 5 to 10 items; stepwise resolution to the tonic after each answer; a "chosen degrees" set (for b3 and b7). Reuse `functionPlayback` from chords in a key (R1) | S |
| N2 | Ear player for the owner's recordings | Drop an audio file; A-B loop; 50 to 100% speed with pitch kept (Tone.js GrainPlayer or a SoundTouch worklet); transpose; a drone and "find home" (pick the note that sounds like home, then check against chroma); section markers. Jam already loops an MP3 backing; build on it (R2) | M to L |
| N3 | Check my transcription against a score | Write melody, bass or chord symbols per bar in the note editor while N2 plays; import the MuseScore MusicXML; align (transpose to the same key, allow octave), score pitch, rhythm and chord degree per bar; show the diff. Basic Pitch stays an optional second opinion | M |
| N4 | Song loops and chromatic chord items | Named loops played as a groove (Jam backing: bass, drums, chords); items for bVII, bVI, iv, bIII, V/V, V/vi, V/ii, V/IV, bII7, #i°7, backdoor, turnarounds, modal vamps, and key changes; answer by picking the loop or filling numeral slots per bar (R3) | M |
| N5 | Melodies with rhythm from real tunes | 1, 2 and 4-bar phrases with rhythm from the phrases list, the owner's songs and public-domain folk tunes; sing back, then play back, then write; grade with the score follower (R4) | M |
| N6 | Call and response over a groove | The app plays a 1 or 2-bar call over Jam; echo graded like Phrases; then answer mode graded on time and landing on a chord tone; takes kept (R7) | M |
| N7 | Analyse: numerals and spot-the-chord | Show a progression as symbols in a key; answer numerals; "which chord is borrowed / which is V of what"; timed like the circle drill | S |
| N8 | Form markers | On N2, tap section boundaries and name them (verse, chorus, bridge, A, B, chorus of a blues); compare with a saved answer or the imported score's rehearsal marks | S (after N2) |
| N11 | Guide-tone grading in Jam | Jam already knows each note's tone role; add a "3rds and 7ths only" target with a per-chorus score | S |
| N12 | Voice answers for bass lines and sung scales | Add `voice` to `bass-lines` and to a "sing the scale over a drone" mode (the pitch detector and cents window exist) | S |
| N9 | Timbres | Piano, nylon and steel guitar, electric bass for bass lines, a sax-like patch; random after a level is passed (R11) | S |
| N10 | Reharmonisation sandbox | A fixed melody; per bar pick a chord from a palette (diatonic, secondary, borrowed, tritone, diminished); hear it; flag strong-beat melody notes that clash | M |
| N13 | Shelf songs in the app | A per-level song list with the MuseScore link, a "learned by ear" tick per part (melody, bass, chords, solo), and the N3 score; songs count as level evidence | S |
| N14 | User licks in `licks` | Save a transcribed lick from a song and drill it in 12 keys like the built-in ones | S |
| N15 | Path data | Replace the 17-step Ear Path and the Circle path order with these 11 levels (steps as data; Circle and Studio steps referenced, not duplicated) | S |

Build order: N1 and N15 first (small, change every level), then N2 with N3 (they make the shelves real), then N4, N5, N6, then the small ones.

## 5. Open questions for the owner

1. **Singing.** Will you sing or hum answers? The path assumes yes (sing before play at every level). If not, play-back becomes the default and steps 3.12, 8.5 and 9.10 drop.
2. **Your recordings.** May the app read audio files you own (N2)? It is needed from level 1. Any streaming source you would rather use?
3. **MuseScore scores in the app.** Do you have MuseScore Pro? Many good lead sheets are "Official" (paid per score or with Pro); community scores are free but uneven. Should the shelves prefer free community scores even when an official lead sheet is better?
4. **Labels.** Degree numbers, movable do, or both? Roman numerals with lower case for minor (as here), or Nashville numbers?
5. **Jazz depth.** Levels 9 and 10 lean on jazz standards and solos. Keep that weight, or swap half the shelf for soul, funk and rock solos?
6. **Which instrument for transcription answers?** Piano is fastest for checking; guitar and Aerophone help those paths. One default, or choose per song?
7. **Shelf songs you want.** Name 10 songs you would love to play by ear; they can replace spares at the right level.
