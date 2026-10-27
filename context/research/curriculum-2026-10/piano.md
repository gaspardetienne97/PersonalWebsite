# Piano, jazz and pop piano: intermediate to advanced, fastest (2026-10-27)

Builds on `context/research/piano-drills.md` (syllabi, tempo tables, MIDI metrics, practice evidence). Not repeated here except where it drives a recommendation.

## 1. What the best programs do

**Jazz piano**

- **Mark Levine, The Jazz Piano Book (Sher Music).** The de facto reference. Order: theory and modes, three-note (shell) voicings, sus and phrygian chords, left-hand voicings, tritone substitution, scales and improvising, pentatonics, then a voicing block: So What chords (ch. 12), fourth chords (ch. 13), upper structures (ch. 14), block chords, comping ([Sher Music](https://www.shermusic.com/1883217806.php), [publisher sample](https://www.jazzbooks.com/mm5/samples/D-JP.pdf)). His follow-up, How to Voice Standards at the Piano, applies the "menu" of voicings to real melodies ([Faber Music](https://www.fabermusic.com/shop/how-to-voice-standards-at-the-piano-the-menu-p212434)). What works: every voicing is learned through ii-V-I in all keys, then immediately applied to tunes.
- **Open Studio (Peter Martin, Adam Maness).** A four-level piano pathway. Level 2 ("some piano, starting jazz"): Jazz Piano for Beginners, 5-minute ear training, bebop chords, enclosures, left-hand voicings, finger independence. Level 3 ("know some tunes, can improvise a little, big gaps"): Elements of Jazz Piano, block chords, pentatonics technique, lead sheet breakdown, hearing harmony. Level 4: Jazz Piano Method (weekly lessons, two-handed voicings, block-chord soloing), solo piano ([Open Studio pathway](https://openstudiojazz.com/?p=872355)). The owner sits at Level 2 to 3. What works: tune-centred lessons, short daily ear work, and "lead sheet breakdown" as a skill in itself.
- **Bill Dobbins, The Contemporary Jazz Pianist.** Vol. 1 left-hand seventh-chord voicings, then a left-hand chord line and accompaniment; Vol. 2 two-hand voicings, two-hand chord lines, blues, rhythm changes, song forms, comping; Vol. 3 styles (stride, boogie, gospel, bebop) ([ejazzlines](https://ejazzlines.com/contemporary-jazz-pianist-volume-1-bill-dobbins), [vol. 2](https://www.ejazzlines.com/contemporary-jazz-pianist-volume-2-bill-dobbins)). Same arc as Levine with more emphasis on smooth chord lines (voice leading) before soloing.
- **Hal Leonard Jazz Piano Method (Mark Davis).** Book 2 adds melodic minor, locked hands, drop-2, stride, walking bass, Latin ([Hal Leonard](https://halleonard.com/product/236177)).
- **Oscar Peterson, Jazz Exercises, Minuets, Etudes and Pieces** (HL 00311225): graded blues etudes with fingering, the classic technique-through-style book ([Hal Leonard](https://www.halleonard.com/product/311225)).
- **Dirk Bleese, jazz piano 1 to 5 (Universal Edition):** every piece paired with a finger exercise and an improvisation exercise; vol. 4 builds each piece on a four-part harmonic study ([UE vol. 4](https://universaledition.com/en/Works/jazz-piano-4/P0211746)). The pairing (piece + technique + improv on the same material) is the pattern worth copying.
- **Standards order** across teacher sources converges: a blues first, then Autumn Leaves (major and minor ii-V), Blue Bossa, a rhythm-changes head, and Blue Monk ([LearnJazzStandards](https://www.learnjazzstandards.com/blog/20-easy-jazz-standards/), [JazzAdvice](https://www.jazzadvice.com/jazz-standards/), [Skoove](https://skoove.com/blog/jazz-standards)). Teacher consensus, not evidence.

**Pop piano and general programs**

- **Pianote (Musora) Method:** nine levels, 307 follow-along lessons; level 7 is 12-bar blues, boogie, swing, seventh chords and comping; level 9 is pop accompaniment with sus chords, syncopation and chord charts. Each level ends with a guided playthrough and a final performance ([Musora piano](https://www.musora.com/piano)). No improvisation or ear track is listed. Strength: song-first motivation and a performance at each level end.
- **Piano With Jonny:** pop accompaniment as a pattern library (48 patterns that fit most pop songs; "popstinatos"; left-hand stock rock, rolling, punker) ([course](https://pianowithjonny.com/courses/pop-contemporary-piano-accompaniment-patterns-1)). This is the clearest model for a pattern drill: one pattern at a time over one progression, then any song's chord chart.
- **ABRSM/RCM grades 4 to 8:** technique, pieces, sight-reading and aural together; sight-reading parameters per grade are tabled in the earlier research (hands together from G2, 6/8 and anacrusis at G4, syncopation and four-part chords at G5, triplets, pedal and odd meters at G6). The grade is the one public, calibrated difficulty ladder.
- **Piano Marvel SASR:** adaptive sight-reading, 80% to advance, three strikes, 90 sublevels ([Piano Marvel](https://pianomarvel.com/article/the-ultimate-sight-reading-test)). The app already copies the rule, not the range.
- **Faber Adult Piano Adventures, Russian school (Neuhaus, The Art of Piano Playing):** both put tone and listening ahead of finger drills. I found no curriculum-level source for the Russian progression (search results were low-quality copies), so treat it as background only.
- **Hanon and Czerny:** no controlled evidence; critics cite narrowness and strain ([Pianist](https://www.pianistmagazine.com/blogs/this-is-why-hanon-exercises-are-a-waste-of-time-and-possibly-dangerous/)). For this owner, technique through scales in all keys, voicings in all keys and style etudes (Peterson) does the same job with musical payoff.

**Practice evidence that should shape the app** (sources in the earlier research): error-free repetition and slowing before the trouble spot predict quality (Duke 2009); segments lengthen with skill (Gruson; Williamon and Valentine); interleaving helps a little and learners misjudge it (Carter and Grahn 2016); one new motor passage per session, review next day (Simmons and Duke 2006); external focus on sound beats focus on fingers (Duke 2011). Mental practice is weaker than physical but adds value when combined with short physical practice; studies are small and mostly on pianists ([Bulletproof Musician summary](https://bulletproofmusician.com/how-effective-is-mental-practice-really/)). Aural training had the largest effect on sight-reading in Mishra's meta-analysis. For jazz, the converging expert advice is: learn tunes, transcribe by ear, take vocabulary through all keys.

## 2. What the app has today (seen in Orca and code)

**Piano Path, 14 steps** (`data/learning-paths.json` plus `ADDED_STEPS.piano` in `progress/paths.ts`): five-finger pattern in C, contrary motion, treble/bass flashcards in C position, broken chords in C, triads and inversions, I IV V I closest chords, cadences in 12 keys, C major scale hands together at 80, C arpeggio two octaves, legato pedal, a blues lick over C7 with a Charleston shell, the same over F7 and G7, spot the wrong note, sight-read a four-bar phrase. Thresholds are mostly "three runs at 66%". For an intermediate player, roughly 10 of 14 steps are below their level; only cadences in 12 keys, pedal and the comping steps have any stretch. There is no song, no lead sheet, no improvisation beyond one lick, no pop accompaniment. In the data P-I1 and P-I2 open the same Voicings link (`variant=inversions`), worth checking.

**Jazz Path, 10 steps, 5 graded:** intervals by ear, chord symbols and extensions (reference), chord-scales, shells (reference only), rootless A/B through 12 keys, altered and upper structure, licks over ii-V-I, improvise (Jam, ungraded), repertoire (Jam, ungraded). It follows Levine's order well up to step 7, then stops where Levine and Open Studio start: tunes.

**Drills:**
- **Scales:** strong. ABRSM grade speeds, 1 to 6 notes a click, arpeggios, broken/blocked chords, full fingering for major and three minors in 12 keys. At parity with the syllabi.
- **Voicings:** rootless ii-V-I (A/B), minor ii-V-i, altered, closest chords, guide tones, major and minor cadences. Untimed by design. Missing: a graded shell drill, So What/quartal, drop-2, block chords, two-handed voicings, and any in-time version over a backing.
- **Licks:** 31 (29 piano), all ii-V-I or minor vamps, all authored in C with 12-key transposition, chunk, loop, half speed. Graded on pitch order only; "transposition and timing are not assessed". No blues, turnaround, bebop-blues or rhythm-changes vocabulary.
- **Comping:** three patterns, the same blue-third lick over C7, F7, G7 with a Charleston shell. One rhythm, one chord, no changes.
- **Chord scales:** go-to scale per chord over major and minor ii-V-I, tone roles on the keys. Good.
- **Two hands:** six patterns (pulse + line, role swap, shell + line, Alberti + holds, contrary scale, mirror). Beginner level; no pop, boogie, stride or walking-bass patterns.
- **Jam:** six progressions (ii-V-I-VI, minor ii-V-i, 12-bar blues, modal vamp, I-V-vi-IV, G-D-Em-C) with tone roles and chorus reports. No tunes, no forms longer than 8 bars except the blues, no scoring of what was played against the changes.
- **Sight-reading:** generated single-line phrases, levels Primer to 3 (C, G, F, D, Bb majors, D/A/E minors, syncopation at level 3), SASR climb. Roughly ABRSM grade 1 to 2, one clef at a time. An intermediate pianist needs hands-together grand-staff reading at grades 3 to 6.
- **Phrases (piano):** 15 public-domain or stock items (Für Elise, Minuet in G, Alberti, boogie bass, a C blues lick, I-vi-IV-V, Canon chords, blues shuffle LH). No popular riffs.
- **Songs:** none bundled; Library imports MIDI, MusicXML and MXL, and Song Studio has wait/performance modes and fix-the-spot loops. The pipeline to "play songs I like" exists; the content does not.
- **Repertoire list:** 33 standard titles in `jazz.json` with a feel, no changes, no order, no link to any drill.

**Verdict:** technique and harmony drills match the first half of Levine and Open Studio Level 2. The app has nothing for what turns an intermediate into an advanced player: tunes (lead sheets played with voicings in time), comping over real forms, improvising with feedback, two-hand reading, and songs.

## 3. Recommendations, ranked

1. **Tunes: a lead-sheet player and a standards ladder (L).** Add chord changes and form for 20 standards (list in section 4) as Jam progressions, ordered. Each tune gets a fixed task ladder taken from Open Studio's "lead sheet breakdown" and Levine: (a) roots in LH with the melody in RH, (b) guide tones (3 and 7) through the form, (c) melody plus shells, (d) comp rootless voicings against the backing, (e) solo one chorus, (f) take it to a second key. Steps (b) to (d) reuse Voicings scoring (pitch-class set per chord) and Comping's timing; (e) reuses Jam. Chord progressions can be authored; melodies come from the owner's own imports. Why: every program above converges on tunes as the unit of progress; the 33 titles in `jazz.json` are currently dead data. Fits: `jam.ts` `Progression` gains `form` and `tune` fields; a new Jazz Path section "Tunes" replaces the ungraded repertoire step.

2. **Comping in time over any progression (M).** Generalise Comping from one lick and one chord to: any Jam progression, a rhythm library (Charleston, anticipated and-of-4, two-feel half notes, Red Garland and-of-2/and-of-4, bossa, ballad whole notes, pop eighths), voicing type chosen (shells, rootless A/B, So What). Score per chord: right pitch-class set (as Voicings does), struck together within 40 ms (existing two-hand metric), on the rhythm's slots, and voice-leading distance from the previous chord. Why: Dobbins and Levine treat the comping chord line as the core skill; today Voicings is untimed and Comping has one chord. Fits: `compingScore` plus `voicingTargets`.

3. **Rebase the Piano Path for an intermediate (M).** Add a short placement (scales at ABRSM G5 speed, a G3 sight-reading phrase, cadences in 4 keys) that marks early steps done, and add advanced steps: all-key scales and arpeggios at G5 then G7 speeds; grand-staff sight-reading at G3, G4, G5; three pop accompaniment patterns over a chord chart; a 12-bar blues with a boogie LH and a RH blues-scale chorus; a lead sheet played melody plus shells; a learned song through fix-the-spot to performance mode at full tempo. Raise thresholds above 66% (Duke: quality of trials, not count). Why: 10 of 14 steps are beginner content; the owner would spend weeks proving things they can do.

4. **Grand-staff sight-reading levels 4 to 8 (M to L).** Extend `reading.ts` with two-hand generation following ABRSM's parameter ladder: hands together and ties (G2), two-note chords and sixteenths (G3), 6/8, anacrusis, accidentals (G4), syncopation and four-part chords, more keys (G5), triplets and pedal marks (G6). Keep the SASR climb. Add a chord-chart reading mode (play a pop chart with a named pattern) since that is how pop pianists sight-read. Why: sight-reading has the clearest graded standard and the app stops near grade 2.

5. **Pop accompaniment pattern drill (M).** 12 to 15 patterns from the Piano With Jonny and Pianote model: block chords on 1, root-fifth-octave broken, 1-5-10, ballad arpeggio (1-5-9-10 RH 3-5-8), rock eighth octaves, pop syncopation (3+3+2 as in Clocks), Alberti, stride-lite (bass, chord), gospel 4-5-1 passing chord, sus2/sus4 colour, a "popstinato" RH ostinato. Each over I-V-vi-IV, vi-IV-I-V, I-vi-IV-V in any key, then over an imported song's chords. Score notes, chord identity and timing with the two-hand engine. Why: "play songs I like" is a stated goal and pop songs are mostly a chart plus a pattern. Fits: new pattern ids in `two-hand-patterns.json` and `twoHandPattern`.

6. **Graded improvisation in Jam (M).** Score a chorus on things MIDI can see: share of strong-beat notes that are chord tones, guide-tone landings at chord changes (3rd or 7th within a beat of the change), avoid notes held over a beat, rhythmic variety (onset positions used), phrase length and rests (Open Studio's "leave space"). Add constraint games used by teachers: only 3 notes, only guide tones, start every phrase on the and-of-1, call and response with the backing (two bars listen, two bars answer). Why: improvisation is a goal and Jam currently reports but does not judge; Levine and Open Studio teach improv through exactly these constraints.

7. **Licks: timing, keys and by-ear (S).** Grade timing (the Phrases scorer already does notes and timing); require a lick in at least 3 keys round the cycle for the path step, interleaved (Carter and Grahn); default to hear-first with notation hidden, notation as a hint that is logged. Add categories: blues (Peterson-style turnarounds, blue-third, grace-note slides), bebop enclosures, rhythm-changes A section, a Bill Evans-style ii-V. Why: lick learning by ear in all keys is the standard expert advice; pitch-order-only grading over-credits.

8. **Voicing types the app lacks (M).** A graded shell drill (1-3-7 and 1-7-3 in LH through ii-V-I and a blues), So What/quartal voicings over modal vamps, two-handed rootless (LH 3-7, RH upper tensions), drop-2 and block chords (Red Garland, locked hands) for melody harmonisation, upper structures beyond II. Each in the existing Voicings targets format. Why: Levine ch. 12 to 14, Open Studio Level 3 block chords and Level 4 two-handed voicings.

9. **Bundle songs and riffs (S each).** Use the import pipeline: the owner downloads MusicXML or MIDI from the links in section 4, the app stores them as library songs with a difficulty tag, and Phrases gains the short riffs as authored entries where they are stock or public domain. Why: songs drive return visits (Pianote's whole model).

10. **Style etudes as the technique track (S to M).** Replace any temptation to add Hanon with one style etude per stage: boogie LH (exists in Phrases), stride (oom-pah tenth), Peterson blues patterns, walking bass with RH shells. Why: same motor demands, musical payoff; no evidence for Hanon.

Smaller: let the scheduler cap new material at one new passage per session with next-day review (Simmons and Duke); make Voicings offer an "in time" toggle (half notes at 60) once untimed accuracy passes 90%.

## 4. Content

### Riffs, intros and licks (difficulty is my estimate, ABRSM-style grade)

Community MuseScore uploads usually offer MIDI and MusicXML download with an account (some need Pro); "official" scores are licensed and I did not confirm they export MusicXML. Accuracy of community uploads varies: check against the record.

| # | Item | What it trains | Grade | Source |
|---|---|---|---|---|
| 1 | Let It Be intro and verse | LH octaves, C G Am F voicing | 2 | [MuseScore song page](https://musescore.com/song/let_it_be-1488346) |
| 2 | Imagine | RH syncopated eighths, C to Cmaj7 to F | 2 | [MuseScore](https://musescore.com/song/imagine-1662050) |
| 3 | Hit the Road Jack riff | descending minor bass Am G F E | 2 | [MuseScore](https://musescore.com/song/hit_the_road_jack-1622536) |
| 4 | Comptine d'un autre été | LH broken eighths, RH melody balance | 3 | [MuseScore](https://musescore.com/song/comptine_dun_autre_ete_lapres_midi-1682942) |
| 5 | Clocks intro | 3+3+2 RH arpeggio grouping | 3 | [MuseScore](https://musescore.com/song/clocks-1483885) |
| 6 | Someone Like You | continuous RH broken-chord eighths | 3 to 4 | [MuseScore](https://musescore.com/song/someone_like_you-1787059), [official](https://musescore.com/official_scores/scores/6949884) |
| 7 | Don't Stop Believin' intro | RH eighth broken pattern over moving bass | 4 | [MuseScore](https://musescore.com/song/dont_stop_believin-2252076) |
| 8 | Your Song intro | pop voicings, inner-voice movement | 4 | [MuseScore](https://musescore.com/user/36070839/scores/6471795) |
| 9 | Piano Man intro | 3/4, walking bass line, fills | 4 to 5 | [MuseScore](https://musescore.com/song/piano_man-1657555) |
| 10 | A Thousand Miles riff | fast RH sixteenth hook | 5 | [MuseScore](https://musescore.com/user/36472524/scores/7014983) |
| 11 | Superstition (clav riff on keys) | sixteenth funk, independence | 5 | [MuseScore](https://musescore.com/song/superstition-1687480) |
| 12 | Bohemian Rhapsody ballad section | Bb ballad voicing, LH octaves | 5 to 6 | [MuseScore](https://musescore.com/song/bohemian_rhapsody-1424249), [official](https://musescore.com/official_scores/scores/6958232) |
| 13 | Linus and Lucy | LH ostinato against syncopated RH | 6 | [official](https://musescore.com/official_scores/scores/6951035), [community](https://musescore.com/xman2156/linus-and-lucy-peanuts) |
| 14 | Gymnopédie No. 1 (public domain) | LH leaps, voicing, pedal | 4 | [IMSLP](https://imslp.org/wiki/3_Gymnop%C3%A9dies_(Satie,_Erik)) |
| 15 | Moonlight Sonata mvt 1 (PD) | triplet balance, melody over arpeggio | 6 | [IMSLP](https://imslp.org/wiki/Piano_Sonata_No.14,_Op.27_No.2_(Beethoven,_Ludwig_van)) |
| 16 | Maple Leaf Rag A section (PD) | stride LH, syncopation | 7 | [IMSLP](https://imslp.org/wiki/Maple_Leaf_Rag_(Joplin,_Scott)) |
| 17 | Pinetop's Boogie Woogie (1928, US public domain since 2024) | boogie LH, RH tremolo and riffs | 5 | [MuseScore song](https://musescore.com/song/pine_tops_boogie_woogie-2271085), [take B transcription](https://musescore.com/james_brigham/pinetops_boogie_woogie_c-2726-b) |
| 18 | Take Five vamp | 5/4 Ebm to Bbm7 comp | 4 | [MuseScore](https://musescore.com/song/take_five-6342670) |
| 19 | So What intro and voicings | quartal "So What" chords, modal | 4 | [MuseScore intro](https://musescore.com/user/97407619/scores/20074024), [FreeJazzLessons on the voicing](https://www.freejazzlessons.com/category/jazz-masters/page/2) |
| 20 | Cantaloupe Island vamp | Fm7 / Db7 / Dm7 vamp, Herbie voicings | 4 | [MuseScore](https://musescore.com/song/cantaloupe_island-1653201) |
| 21 | Maiden Voyage | sus chords, comp rhythm | 5 | [MuseScore](https://musescore.com/song/maiden_voyage-2306935) |
| 22 | Moanin' head | call and response, amen cadence | 4 | [MuseScore](https://musescore.com/song/moanin-2246706) |
| 23 | Autumn Leaves lead sheet | major and minor ii-V | 4 | [MuseScore lead sheet](https://musescore.com/ericfontainejazz/autumn-leaves), [jazz piano solo](https://musescore.com/user/3402766/scores/1026276) |
| 24 | Oscar Peterson blues pattern 1 and 2 | blues LH, RH grace-note licks | 5 | [pattern 1](https://musescore.com/user/3607356/scores/4481236), [pattern 2](https://musescore.com/user/3607356/scores/5649452) |
| 25 | C Jam Blues (Peterson) | blues head, Peterson fills | 6 | [MuseScore](https://musescore.com/song/c_jam_blues-4599751) |
| 26 | Blues for Martha (Peterson) | transcribed blues solo | 7 | [MuseScore](https://musescore.com/user/1431431/scores/7525985) |
| 27 | Boogie Blues Etude (Peterson) | virtuoso boogie | 8 | [MuseScore](https://musescore.com/song/boogie_blues_etude-2329299) |
| 28 | Bill Evans ii-V lick (from the 9th) | ii-V line, starting on a tension | 5 | [FreeJazzLessons](https://www.freejazzlessons.com/bill-evans-jazz-lick-lesson/), book: [Mel Bay, Essential Jazz Lines in the style of Bill Evans](https://www.melbay.com/Products/99864BCDEB/essential-jazz-lines-in-the-style-of-bill-evans--piano.aspx) |
| 29 | Peterson etudes book | graded blues etudes with fingering | 5 to 8 | [Hal Leonard HL 00311225](https://www.halleonard.com/product/311225) |
| 30 | Jacob Collier Let It Be intro (transcription) | reharmonisation listening, advanced | 8 | [MuseScore](https://musescore.com/song/let_it_be-3219712) |

Stock vocabulary to author directly in Phrases (style material, no score needed): blues turnaround with chromatic inner line, grace-note slide into the major third (exists as the blue third), gospel IV/I and 4-5-1 passing chord, Red Garland block chords on a ii-V, McCoy Tyner pentatonic fourths over a modal vamp, bebop enclosure into the 3rd, the "Cry Me a River" style ballad tag (I-vi-ii-V turnaround).

### Standards in learning order (changes authored as Jam progressions)

1. **Blue Monk** or **C Jam Blues**: 12-bar blues in Bb/C, shells, blues scale.
2. **Autumn Leaves**: major and minor ii-V in one tune (Levine's and every list's first standard).
3. **Blue Bossa**: minor ii-V-i, one key change, bossa comp.
4. **Summertime**: minor, slow, melody with shells.
5. **So What** or **Impressions**: modal, quartal voicings.
6. **Cantaloupe Island**: modal vamp, comping rhythm.
7. **Satin Doll**: chained ii-V's.
8. **All of Me**: secondary dominants.
9. **Fly Me to the Moon**: cycle of fifths.
10. **There Will Never Be Another You**: standard 32-bar form.
11. **Billie's Bounce**: bebop blues changes.
12. **Take the A Train**: II7 (#11), first upper structure.
13. **Oleo** or **Lester Leaps In**: rhythm changes.
14. **Misty**: ballad, rubato and fills.
15. **Song for My Father**: Latin minor groove.
16. **Maiden Voyage**: sus chords.
17. **Solar**: short form, moving key centres.
18. **Stella by Starlight**: m7b5 heavy.
19. **All the Things You Are**: key centres, a capstone.
20. **Giant Steps** (slow): later, as Open Studio's Level 4 does.

Ten of these are already titles in `jazz.json`, which makes the data change small.

## 5. Open questions for the owner

1. Where are you really? An ABRSM-style grade guess (sight-reading, scales, a piece you can play) decides how much of the Piano Path to skip.
2. Which jazz direction first: swing/bebop standards, modal and Herbie, or gospel/pop/neo-soul voicings?
3. Do you want classical repertoire in the app, or only pop and jazz plus reading?
4. Are you fine downloading MuseScore MIDI/MusicXML yourself for the bundled list (account, sometimes Pro), or should only public-domain and authored material ship in the app?
5. Do you own a Real Book or iReal Pro? Chord charts could be imported from iReal rather than authored.
6. Do you sing? Accompanying yourself changes the pop pattern priorities.
