# Piano drills research: technique, reading, keyboard harmony, practice strategies, levels (2026-10-13)

Research for the piano practice app (MIDI input: pitch, onset, velocity, note-off, CC 64). Local reference only. Every claim carries a source; "thin" marks a weak source (blog, forum, marketing, single small study). Scoring rules in section 6 are my proposals unless a source is named.

## 0. Evidence anchors (what the research says about practice in general)

- **Quality beats quantity.** Duke, Simmons & Cash 2009 (JRME 56(4):310-321): 17 piano majors learned a 3-bar Shostakovich concerto passage, tested next day (15 run-throughs). Practice time, total repetitions and number of correct trials did not predict rank; more incorrect trials predicted lower rank, a higher proportion of correct trials predicted higher rank ([Music Mark summary](https://www.musicmark.org.uk/news/8-things-top-practicers-do-differently/), [Structural Learning briefing](https://www.structural-learning.com/research-briefings/practise-the-hard-bit)). Correlational, n=17, one session.
- **What the top three did** (same sources): hands together early; with musical inflection early; thoughtful pauses; errors pre-empted by stopping before them; errors addressed immediately; precise location and source of each error identified and fixed; tempo varied systematically between trials (slower for tricky spots); target passage repeated until the error was gone and the passage stabilized. The summary singles out slowing down *before* a previous error spot as the strongest move.
- **Longer segments as skill grows.** Gruson 1988 (pianists from first grade to concert level): with skill, more repetition of units longer than a bar, more hands-separate work, fewer errors, fewer single-note repetitions, fewer long pauses; tempo rose across sessions at every level ([Hallam 2001 review](https://discovery-pp.ucl.ac.uk/id/eprint/1507372/1/Hallam2001development7.pdf)). Williamon & Valentine 2000 (22 pianists): practice quantity did not predict quality; pianists who used longer practice segments by the middle stage gave better performances ([RCM repository](https://researchonline.rcm.ac.uk/id/eprint/2174)).
- **Deliberate practice matters, but less than once claimed.** Deliberate practice explained 21% of performance variance in music ([Macnamara, Hambrick & Oswald 2014](https://www.ncbi.nlm.nih.gov/pmc/articles/PMC4101876/)); Platz et al. found r = 0.61 after correction across 13 music studies ([Frontiers 2014](https://dx.doi.org/10.3389/fpsyg.2014.00751)).
- **Interleaving.** Advanced clarinettists rated better on pieces practised interleaved (3-minute alternations) than blocked (12 minutes each), when raters differed at all ([Carter & Grahn 2016](https://www.ncbi.nlm.nih.gov/pmc/articles/PMC4989027/)). A pianist honours thesis (n=21) found no significant difference, slightly favouring interleaved, and learners' self-judgments did not match results ([Wong 2022](https://ir.lib.uwo.ca/psychd_uht/42)). Learners also overrate fixed-order practice (Abushanab & Bishara 2013, Memory & Cognition, "Illusory advantages of fixed- over random-order practice"; title only, not opened). Modest, small-n evidence.
- **Sleep and interference.** Overnight gains after learning one keyboard melody in the evening; learning a second melody in the same session blocked those gains ([UT Center for Music Learning](https://cml.music.utexas.edu/research/skill-learning-and-procedural-memory); [Simmons & Duke 2006 summary](https://www.nkoda.com/blog/Sleep)). Implies: one new passage per session, review next day.
- **Attention focus.** 16 music majors played a keyboard passage most accurately when focused on the sound/hammers rather than their fingers ([Duke, Cash & Allen 2011, JRME 59(1)](https://journals.sagepub.com/doi/10.1177/0022429410396093)). Supports listening cues over finger cues in UI prompts.
- **Mental practice.** Expert pianists improved after mental practice, less than after physical practice; auditory imagery linked to more anticipation ([Bernardi et al. 2013](https://www.ncbi.nlm.nih.gov/pmc/articles/PMC3747442/)).
- **Feedback frequency.** Motor-learning "guidance hypothesis": feedback on every trial can create dependence; reduced or bandwidth feedback may help retention, but evidence is mixed and none of it is music-specific ([2024 review/study](https://www.ncbi.nlm.nih.gov/pmc/articles/PMC10933749/)). Thin for music.

## 1. Technique drills

### What the syllabi require (2025-26 ABRSM, 2022 RCM)

ABRSM rules for all scales and arpeggios: from memory, even notes, legato unless staccato specified, no pedal, any successful fingering, hands one octave apart for hands-together ([ABRSM Piano 2025 & 2026 spec, pp. 13-14](https://caswells-strings.co.uk/wp-content/uploads/2025/07/ABRSM-Piano-syllabus-2025-2026.pdf); copy hosted by a retailer, identical ABRSM document). Marking criteria for scales: Distinction "highly accurate notes, fluent and rhythmic, musically shaped"; Merit "largely accurate, mostly regular flow, mainly even tone"; Pass "generally correct despite errors, continuity generally maintained, generally reliable tone" (same doc, p. 60). Examiners name key, hand and articulation on the spot (p. 13). 2021 changes: broken chords dropped, all keys expected by Grade 5, no dynamics required on scales ([PianoDao review](https://pianodao.com/2020/07/12/abrsm-piano-scales-2021/)).

RCM: speeds are a minimum guideline; examiner samples items; from memory ([RCM Piano Syllabus 2022, p. 7](https://teacherportal.rcmusic.com/getattachment/57f3734d-97e5-4777-b67e-4b1111ee31a3/piano-syllabus-2022-edition.pdf)).

### Drill-by-drill: MIDI measurability and how teachers judge it

| Drill | Pedagogy source | MIDI can measure | Teacher criterion |
|---|---|---|---|
| Scales, similar motion HS/HT, 1 to 4 octaves | ABRSM, RCM above | pitch sequence, IOI evenness, tempo vs target, hand sync (onset gap between hands on paired notes), legato overlap | accuracy, even notes, continuity, tempo (ABRSM p. 60) |
| Contrary motion, chromatic, whole-tone, formula pattern | ABRSM G1+, RCM L1+ | same | same |
| Scales a 3rd/6th apart, in double 3rds/6ths | ABRSM G7-8, RCM L10 | chord-onset spread within each dyad, plus above | same; legato vs staccato as asked |
| Staccato vs legato scales | ABRSM G5+ | note duration / IOI ratio; key overlap time | articulation as asked |
| Arpeggios root + inversions, dom7, dim7 | ABRSM, RCM | as scales; larger shifts so watch IOI at thumb crossings | same |
| Broken/blocked triads with inversions, cadence endings | RCM Prep A to L10 (ends with I-IV-V-I and later I-VI-IV-V6/4-V7-I) | chord identity, onset spread of blocked chords | (RCM charts) |
| Five-finger (penta) patterns legato + staccato | RCM Prep A/B; ABRSM Initial ("a 5th") | everything | |
| Octaves (blocked staccato scale in octaves) | RCM L9-10 | dyad sync, staccato duration | |
| Hanon-type finger exercises | no controlled evidence found; critics: narrow, endurance/injury risk, scales and repertoire do the job ([Pianist mag](https://www.pianistmagazine.com/blogs/this-is-why-hanon-exercises-are-a-waste-of-time-and-possibly-dangerous/), [Chang](https://mail.pianofundamentals.com/book/en/1.III.7.8), [Wikipedia](https://en.wikipedia.org/wiki/The_Virtuoso_Pianist_in_60_Exercises)) | everything | teacher opinion only (thin) |
| Trills, repeated notes | none of the graded syllabi above lists them as tests; trilling speed was a predictor of sight-reading skill ([Kopiez & Lee 2006](https://edisciplinas.usp.br/pluginfile.php/5556036/mod_resource/content/0/Artigo-KopiezLee-DynamicModelSightReading-2006.pdf)) | notes/second, IOI SD, velocity SD | thin |
| Voicing (melody over accompaniment) | Goebl 2001: melody played louder; ~30 ms "melody lead" at hammer level mostly an artifact of higher velocity ([PDF](https://iwk.mdw.ac.at/goebl/papers/Goebl_JASA2001_melodyLead.pdf)) | velocity difference melody vs other notes in same chord; onset asynchrony | ABRSM "tone/shape" |
| Pedaling (syncopated/legato) | play first, then pedal up-down while fingers hold; early change gives a gap, late gives blur ([Yamaha pedagogy](https://hub.yamaha.com/music-educators/instruments/piano/piano-pedagogy-pedaling), [Baylor open text](https://openbooks.library.baylor.edu/pianobasics/?p=434)) | CC 64 up/down times vs new chord onset | clean harmony, no gap |
| Dynamics control | ABRSM sight-reading adds f/p at Initial, mf/mp + hairpins at G1, pp at G2, ff at G5 (spec p. 16) | velocity per note; hairpin = monotonic velocity trend | |

### Evenness metrics with research behind them

- **Timing evenness = SD of inter-onset intervals in a scale run.** MIDI scale analysis (Jabusch, Vauth & Altenmüller 2004, Movement Disorders 19:171-180) is reported reliable and valid for pianists' fine motor control; protocol in follow-ups: two-octave scales at 120 bpm, four notes per beat (8 notes/s), unevenness = SD of IOIs per run averaged per direction ([van Vugt et al. 2012](https://www.frontiersin.org/journals/psychology/articles/10.3389/fpsyg.2012.00495/full)). Coefficient of variation of IOIs is also used ([PMC3865372](https://www.ncbi.nlm.nih.gov/pmc/articles/PMC3865372/)). Reliability/validity of the method is restated in [Frontiers 2014](https://www.frontiersin.org/journals/psychology/articles/10.3389/fpsyg.2014.01012/full).
- **Expect structure in the unevenness.** Timing is least consistent at octave boundaries (motor chunking), and the last interval tends to lengthen; deviation profiles are an individual "fingerprint" stable over 20 months ([van Vugt 2012](https://www.ncbi.nlm.nih.gov/pmc/articles/PMC3499913/), [2013](https://pmc.ncbi.nlm.nih.gov/articles/PMC3604639/)). So: fit a straight line to onsets (allow tempo drift) and score residuals; show per-position deviations to locate the weak crossing.
- **No published norm in ms found** for "good" IOI SD by level. Use the user's own baseline and trend.
- **Loudness evenness = SD of key velocity across trials/notes.** Prize-winning pianists' loudness inconsistency was tied to striking-finger kinematics and was uncorrelated with their rhythm inconsistency ([Tominaga et al. 2016](https://ideas.repec.org/a/plo/pone00/0161324.html)), so score timing and velocity evenness separately.
- **Velocity caveat.** MIDI does not define velocity-to-loudness; keyboards and synths differ in curve and dynamic range ([Dannenberg 2006 via Modartt forum](https://forum.modartt.com/viewtopic.php?id=7515), [Modartt curves](https://forum.modartt.com/viewtopic.php?id=1964)). Score velocity relative to the user's own range (calibrate pp and ff once), never absolute.
- **Legato = key overlap.** Pianists hold the previous key briefly into the next; relative overlap shrinks as IOI grows ([KTH, Bresin](https://www.speech.kth.se/music/publications/thesisrb/), [Jacobs & Bullock](https://open.bu.edu/items/ee3547df-d786-4b26-a531-e93edb2bf945)). MIDI gives this directly: prev note-off minus next note-on. Staccato = note duration well under IOI.

## 2. Reading

- **ABRSM sight-reading progression** (spec p. 16, cumulative): Initial 4 bars, 4/4, C major/D minor, hands separately in 5-finger position, half/quarter/eighth values, f/p; G1 6 bars, 2/4 and 3/4, G/F major, A minor; G2 D major, E/G minors, hands together, dotted quarter-eighth, ties; G3 up to 8 bars, 3/8, A, Bb, Eb majors, B minor, outside 5-finger position, 2-note chords, simple sixteenths; G4 c. 8 bars, 6/8, anacrusis, chromatic notes; G5 8-12 bars, E, Ab majors, F#, C minors, 4-part chords, syncopation; G6 12-16 bars, 9/8, 5/8, 5/4, triplets, clef changes, right pedal; G7 16-20 bars, 7/8, 7/4, tempo changes, 8va, una corda; G8 about a page, 12/8, B, Db majors, spread chords, ornaments. Preparation: 30 seconds to look and try out (p. 15). Criteria: fluent, rhythmically accurate, correct notes/key, continuity (p. 60).
- **Trinity**: sight reading optional to G5, compulsory from G6; test set roughly two grades below the exam grade ([Trinity supporting tests](https://www.trinitycollege.com/site/?id=3173)).
- **Piano Marvel SASR**: choose start level; 20 s preview, count-in, play; score of 80%+ raises difficulty, below 80% is a strike; 3 strikes end the test; 90 sublevels (1a to 18e); score up to 1900, each 100 = one level ([Piano Marvel](https://pianomarvel.com/article/the-ultimate-sight-reading-test), [get your score](https://pianomarvel.com/en/info/get-your-score)). Excerpt difficulty was calibrated from a team of sight readers' scores ([Piano Marvel](https://pianomarvel.com/sight-reading)). Measures note and rhythm accuracy (Piano Marvel's Play mode does not assess dynamics or articulation, [Play Mode](https://pianomarvel.com/feature/play-mode)).
- **Reading ahead (eye-hand span).** Professionals looked about 4 notes ahead vs about 2 for amateurs, but both about 1 s ahead in time; professionals were less variable ([Furneaux & Land 1999](https://pmc.ncbi.nlm.nih.gov/articles/PMC1690464); [2019 follow-up](https://www.ncbi.nlm.nih.gov/pmc/articles/PMC6884463/) argues span is a strategy rather than an indicator). App lever: a "look-ahead mask" that hides notes already passed or upcoming beyond N beats.
- **Predictors and interventions.** Sight-reading correlates with accompanying experience; differences come from domain practice rather than talent ([Lehmann & Ericsson 1996](https://sonicfield.org/library/performance-without-preparation-structure-and-acquisition-of-expert-sight-readin)). Psychomotor speed (trill speed), mental speed, early expertise and auditory imagery predicted performance ([Kopiez & Lee 2008](https://eldorado.tu-dortmund.de/server/api/core/bitstreams/731f46c7-9397-4e48-b4af-78c608553d99/content)). Mishra's 2014 meta-analysis of 92 intervention studies: aural-skills training had the largest effect ([UMSL record](https://profiles.umsl.edu/en/publications/improving-sightreading-accuracy-a-meta-analysis/), [MTNA 2023 review](https://certification.mtna.org/MTNA/Stay_Informed/MTNA_e-Journal/MTNA_e-Journal_Archives/April_2023.aspx)); a 2015 pair of meta-analyses found small effects for targeted rhythmic/melodic training (same MTNA review). Zhukov's curriculum combines rhythm training, style-varied repertoire and duet/accompanying; trials reported significant gains (self-reported by the program) ([Zhukov](https://dbpia.nl.go.kr/edited-volume/42624/chapter/357715310)). Thin-to-moderate.
- **Flashcards vs continuous reading.** Faber teaches guide/landmark notes plus intervallic reading by step and skip ([Faber I Can Read Music](https://www.hickeys.com/music/piano_and_organ/piano_methods/faber/method_complete/products/sku014491-faberfaber-piano-adventuresi-can-read-music-v1.php)). No study found comparing note-name flashcards against continuous reading. Kopiez & Lee's speed findings suggest timed recognition is relevant, while the eye-hand-span work says fluent reading needs continuous material with look-ahead. Treat flashcards (ledger lines, key signatures) as a warm-up, with graded continuous excerpts as the main drill.

## 3. Musicianship and harmony at the keyboard

- **Functional skills that universities test** (class piano proficiency): scales/arpeggios, cadences I-IV-I-V7-I or I-IV6/4-I-V6/5-I in all major and minor keys, sight reading, transposing a folk song up or down a step, harmonizing a melody from chord symbols ([Idaho State](https://anthro.isu.edu/media/libraries/music/Functional-Piano-Proficiency-2019.pdf)); harmonization, transposition, improvisation, score reading ([Oral Roberts](https://syllabi.oru.edu/?id=31306)); prepared harmonization with primary triads ([UGA](https://musi.franklin.uga.edu/sites/default/files/Class%20Piano%20Examption%20Information%20201408.pdf)).
- **RCM chord endings**: tonic triads with inversions ending I-V-I (L5-6), I-IV-V-I (L7), I-IV-V6/4-5/3-I (L8), I-VI-IV-V6/4-V7-I (L9-10) ([RCM charts](https://colorinmypiano.com/wp-content/files/RCM_2022_Technical_Requirements_Charts_Prep-10.pdf)).
- **Jazz/pop comping**: shells = root-3-7 (no 5th); rootless A form 3-5-7-9 and B form 7-9-3-5, alternated through ii-V-I; build shells, then rootless, then all keys round the cycle of fourths ([ledutu shells](https://ledutu.com/en/learn/jazz/shell-voicings/), [rootless](https://ledutu.com/en/learn/jazz/rootless-voicings/), [Earl MacDonald](https://www.earlmacdonald.com/jazz-piano-lessons/left-hand-shells/)). Thin (teacher sites; Levine's Jazz Piano Book is the usual canonical reference, not fetched).
- **Improvisation**: Trinity offers improvisation on stylistic, motivic or harmonic stimulus as a supporting test ([Trinity](https://www.trinitycollege.com/news/viewarticle/changes-to-supporting-tests-for-music-grade-exams)). Improvisation and ear training correlate with sight-reading (Mishra, via MTNA 2023 review above).
- **Accompaniment patterns** (Alberti, stride, broken chords): no research found; ABRSM dropped broken chords in 2021 ([PianoDao](https://pianodao.com/2020/07/12/abrsm-piano-scales-2021/)). Teacher consensus only.
- MIDI measurability: chord identity per beat (pitch-class set vs target), voice leading distance (total semitone movement between voicings), bass note, timing on the beat. Harmonizing/improvising can be scored for "chord tones on strong beats" and rhythm; musical quality is not measurable.

## 4. Repertoire practice strategies

- **Hands separate vs together.** Top Duke 2009 performers went hands together early; Gruson found hands-separate use rose with skill (sources in section 0). Evidence conflicts; offer HS as a tool when HT errors cluster in one hand, not as a mandatory stage.
- **Chunking / sectional loops.** Experts use the music's formal structure to pick practice units and as memory retrieval cues ([Chaffin & Imreh 2002](https://musiclab.uconn.edu/wp-content/uploads/sites/290/2013/10/Practicing-Perfection-Chaffin-2002.pdf)). Units lengthen with skill and over the course of learning (Gruson; Williamon & Valentine). App: loop boundaries snap to phrase/bar boundaries; auto-suggest growing the loop.
- **Slow practice and tempo ladders.** Supported indirectly: systematic tempo variation, slowing before trouble spots (Duke 2009); tempo rising across sessions (Gruson). No controlled study of a fixed ladder found. Yousician offers auto tempo adjust from 25% to 125% in 5% steps ([Yousician help](https://support.yousician.com/hc/en-us/articles/204796991-Practice-and-Play-modes-in-piano)).
- **Backward chaining.** Teacher technique (start at the end, prepend) with no music-specific controlled study; the only controlled comparison found (non-musical sequences, 1965) favoured forward chaining ([summary](https://practicing-guitar.readthedocs.io/en/stable/part-3-techniques/chaining.html)). Thin. Offer it, do not default to it.
- **Wait mode vs play-along.** Every major app has both: Piano Marvel Prepare (waits for correct notes, shows would-be score) vs Assess (runs at tempo, 0-100% from notes and rhythm) ([Prepare](https://pianomarvel.com/feature/prepare-mode), [Medium review](https://medium.com/@markplayspiano/to-kick-off-my-series-of-piano-app-reviews-im-going-to-begin-by-taking-a-look-at-piano-marvel-a2eb47a8bd4a)); Synthesia Melody Practice waits for the note, hands separately or together ([App Store](https://apps.apple.com/us/app/synthesia/id579518445)); flowkey Wait, Slow Motion, Loop, hand select ([Yamaha flowkey page](https://au.yamaha.com/en/products/contents/pianos/flowkey/)); Yousician Practice (loop, tempo slider, auto-adjust, metronome, one-hand) vs Play (link above); Simply Piano: slow down songs, waits on wrong notes (thin: [App Store](https://apple.co/2NZzmqk), student blog). Skoove, Pianote, Playground Sessions: no usable official documentation found; Playground gives green/red per note and a 0-100 accuracy score ([Springwise](https://springwise.com/uncategorized/gamified-digital-keyboard-lessons-offer-performance-feedback-real-time), thin). Research angle: wait mode trains notes without time pressure; Duke 2009 suggests error-free trials matter, so wait mode is good for first contact and play-along at a reduced tempo for consolidation. No study compares the two directly.
- **Error correction: stop-and-fix vs keep going.** Practice: locate and fix the exact error, repeat until stable (Duke 2009). Performance/exam: continuity is graded and "prompt recovery from slips" is a Pass criterion (ABRSM spec p. 59). Train both: fix mode in practice, a no-stop run-through mode that scores recovery.
- **Memorization.** Fast memorizers used holistic and additive strategies, slow memorizers segmented and serial ([Mishra 2002 via Bulletproof Musician](https://bulletproofmusician.com/the-two-most-efficient-and-two-least-efficient-memorization-strat&)); performance cues (structural, expressive, interpretive, basic) give restart points ([Chaffin](https://musiclab.uconn.edu/wp-content/uploads/sites/290/2013/10/Practicing-Perfection-Chaffin-2002.pdf)); review chapter: [Ginsborg 2024](https://books.openbookpublishers.com/10.11647/obp.0389/ch11.xhtml). App: fade notation progressively, then "start from any cue point" recall test.
- **Melodics scoring as a reference design**: per-note perfect/early/late/missed; perfect adds a lot, early/late a little, missed/wrong subtract; score out of 100; stars at thresholds; streak after 4 perfect notes ([Melodics](https://www.melodics.com/support-articles/support-scoring), [lesson scoring](https://support.melodics.com/en/articles/15092017-lesson-scoring)). Timing windows not published.

## 5. Progression: tempo tables

### ABRSM 2025-26 piano scales/arpeggios (spec p. 14, "a general guide")

Speeds relate to quaver (eighth-note) groupings, so crotchet marks = 2 notes per beat and minim marks = 4 notes per beat. The glyph in the PDF is a beamed-quaver figure; Elissa Milne's guidance on [Piano World](https://forum.pianoworld.com/ubbthreads.php/topics/1475374/ABRSM_minimum_speeds_for_scale.html) agrees. Notes/s is my arithmetic.

| Grade | Scales (incl. contrary, chromatic, whole-tone) | notes/s | Arpeggios (incl. dom7, dim7) | notes/s |
|---|---|---|---|---|
| Initial | q = 54 | 1.8 | q = 52 | 1.7 |
| 1 | q = 60 | 2.0 | q = 58 | 1.9 |
| 2 | q = 66 | 2.2 | q = 63 | 2.1 |
| 3 | q = 80 | 2.7 | q = 72 | 2.4 |
| 4 | q = 100 | 3.3 | q = 80 | 2.7 |
| 5 | h = 60 | 4.0 | h = 44 | 2.9 |
| 6 | h = 72 | 4.8 | h = 50 | 3.3 |
| 7 | h = 80 | 5.3 | h = 56 | 3.7 |
| 8 | h = 88 | 5.9 | h = 66 | 4.4 |

G7-8 extras: scales a 3rd/6th apart h = 60; legato 3rds h = 46 (G7), 52 (G8); staccato 3rds/6ths h = 54.

Content per grade (spec pp. 20-44, abridged): Initial C major, D minor 1 octave HS, C major contrary a 5th, C/Dm arpeggio a 5th HS. G1 C major 1 oct HT; G, F, A, D minors 2 oct HS; contrary C; G/Am arpeggios 1 oct HS. G2 adds HT in G, F, Am, Dm; chromatic from D. G3 HT in D, A, Em, Gm; Bb, Eb, Bm, Cm HS; E major contrary; chromatic contrary; HT arpeggios. G4 chromatic HT from F#; Bb, Eb, Bm, Cm HT. G5 A, E, B, F#, Db majors and F#, C#, G#, Eb, Bb minors HT; staccato Ab/Fm HS; chromatic contrary a major 3rd apart; dim7 from B. G6 4 octaves HT, legato or staccato at examiner's choice; dom7 and dim7. G7 scales a third apart, G major legato and staccato in 3rds HS, first-inversion arpeggios. G8 scales a sixth apart, Eb legato 3rds, C staccato 6ths, chromatic a major 6th apart, whole-tone, second-inversion arpeggios.

Pre-2021 ABRSM speeds for comparison (forum, thin): G1 q=60, G2 66, G3 80, G4 h=52, G5 63, G6 76, G7 80, G8 88 ([Piano World](https://forum.pianoworld.com/ubbthreads.php/topics/1475374/ABRSM_minimum_speeds_for_scale.html)).

### RCM 2022 (minimum tempos)

From Joy Morin's charts, proofread against the 2022 syllabus but self-flagged as possibly containing errors ([ColorInMyPiano](https://colorinmypiano.com/wp-content/files/RCM_2022_Technical_Requirements_Charts_Prep-10.pdf)); Level 1 cross-checked against the [official syllabus](https://teacherportal.rcmusic.com/getattachment/57f3734d-97e5-4777-b67e-4b1111ee31a3/piano-syllabus-2022-edition.pdf) (2 octaves HS, q = 69). Eighths through L5, sixteenths from L6.

| Level | Scales | notes/s | Arpeggios | notes/s | Other |
|---|---|---|---|---|---|
| Prep A | pentascales q = 100 (quarters), HS | 1.7 | | | broken triads triplets q = 60 |
| Prep B | penta + 1 oct, eighths q = 60, HS; contrary HT | 2.0 | | | |
| 1 | 2 oct HS, contrary HT, eighths q = 69 | 2.3 | | | broken triads q = 50 triplets, blocked q = 100 |
| 2 | 2 oct HS, formula HT, q = 80 | 2.7 | | | |
| 3 | 2 oct HT, q = 80 | 2.7 | | | |
| 4 | HT q = 92; chromatic HS q = 104 | 3.1 | HS 2 oct q = 72 | 2.4 | triads HT |
| 5 | HT q = 104 | 3.5 | HS q = 80 | 2.7 | dom7 HS |
| 6 | HT sixteenths q = 60 | 4.0 | HS eighths q = 92 | 3.1 | dim7 |
| 7 | q = 76 | 5.1 | HT sixteenths q = 60 | 4.0 | four-note chords |
| 8 | 4 oct q = 88 | 5.9 | 4 oct q = 69 | 4.6 | |
| 9 | 4 oct q = 104; octaves blocked staccato q = 60 | 6.9 | q = 84 | 5.6 | |
| 10 | 4 oct q = 120; 3rds/6ths apart q = 104; octaves q = 80 | 8.0 | q = 92 any inversion | 6.1 | alternate-note pattern |

Keys per level in the chart: L1 C, G, F, Am, Em, Dm; L2 adds Bb, Gm; L3 D, F, Bb, Bm, Dm, Gm; L4 D, A, Bb, Eb, Bm, Gm, Cm; L5 A, E, F, Ab, Am, Em, Fm; L6 G, E, B, Db, Gm, Em, Bm, C#m; up to 12 keys per level at L8-10.

Takeaway: ABRSM G8 and RCM L8 both land at about 5.9 notes/s for scales; RCM L10 asks 8 notes/s, the same rate as the research protocol (120 bpm sixteenths).

Trinity: tempo tables not found online (books only). Not covered.

## 6. Ranked recommendation (top 12)

Ranking = strength of evidence or breadth of syllabus consensus. Scoring rules are proposals.

1. **Error-targeted passage loop ("fix the spot")**. Evidence: Duke 2009 (strongest practice-strategy finding). Measure: per-note pitch and onset errors over repeated attempts at a bar-snapped loop; auto-slow the tempo just before the previous error location. Score: pass when N consecutive attempts are error-free (Duke: "until stabilized"; N = 3 is my default), then auto-extend the loop by one phrase.
2. **Tempo ladder on any passage or technique item**. Evidence: Duke 2009 tempo variation, Gruson tempo growth, all apps have it. Measure: accuracy and IOI deviation per tempo step. Score: step up (for example +5%, Yousician's increment) after a clean pass, step down after a failed one; record the highest clean tempo as the item's level.
3. **Scales all keys, graded to ABRSM/RCM speeds**. Evidence: universal syllabus consensus; validated MIDI metric. Measure: correct pitch sequence, tempo vs target, IOI SD/CV after linear fit, hand sync for HT, legato overlap or staccato duration. Score: gate on 100% pitch accuracy, then report tempo as % of grade target and IOI CV against the user's own baseline (no published norms).
4. **Arpeggios and broken/blocked chords with inversions**. Same as 3 plus chord-onset spread for blocked chords (score spread in ms; lower is better) and the IOI deviation at thumb crossings.
5. **Graded sight-reading with adaptive difficulty (SASR-style)**. Evidence: syllabus consensus, Lehmann & Ericsson. Measure: note and rhythm accuracy on unseen excerpts that follow ABRSM's parameter ladder. Score: Piano Marvel rule (80% to advance, 3 strikes ends), with no stopping allowed and a 20 to 30 s preview.
6. **Rhythm reading/tapping on one key**. Evidence: Mishra (rhythm/aural training effects; small), ABRSM rhythm ladder. Measure: onset error vs grid, ignoring pitch. Score: Melodics-style perfect/early/late/missed tiers, with windows set as a fraction of the beat (window size is a proposal: no published values found).
7. **Wait mode then play-along at tempo (per piece)**. Evidence: universal app design, Duke on error-free trials. Measure: wrong notes in wait mode; notes, rhythm and continuity in play mode. Score: Prepare/Assess split; promote to play-along when wait-mode accuracy is near 100%.
8. **Cadences and progressions in all keys (I-IV-V-I, I-IV6/4-I-V6/5-I, ii-V-I)**. Evidence: university proficiency exams, RCM chord endings. Measure: pitch-class set per chord, bass note, inversion, voice-leading distance, timing. Score: correct chord + correct inversion per beat, plus total semitone movement (lower = smoother).
9. **No-stop performance run with recovery scoring**. Evidence: ABRSM continuity and recovery criteria; Williamon & Valentine longer segments. Measure: gaps (IOI much larger than expected), restarts, notes skipped. Score: continuity % and time-to-recover after each error, separate from accuracy.
10. **Voicing balance drill (melody over accompaniment)**. Evidence: Goebl 2001 (melody louder, lead follows from velocity). Measure: velocity of the marked melody note minus the mean of the other notes in its chord, plus onset asynchrony. Score: target margin relative to the user's calibrated velocity range; flag melody-lead over about 30 ms as a cue to check velocity, not timing.
11. **Syncopated pedal drill**. Evidence: teacher consensus (Yamaha, Baylor). Measure: CC 64 release and re-press times relative to the new chord's note-on. Score: release must come after the new onset (else a gap), and re-press soon after (else blur). Exact ms windows are not published; tune on real keyboards since pedal sensors and CC 64 thresholds vary.
12. **Dynamics and articulation control (velocity targets, hairpins, legato vs staccato)**. Evidence: ABRSM sight-reading dynamics ladder, Tominaga (loudness consistency is its own skill), legato overlap research. Measure: velocity per note vs target band, monotonic trend for hairpins, overlap and duration. Score: % of notes inside the target band (calibrated per keyboard), velocity SD for "even tone".

Lower priority: Hanon-style exercises (no evidence, injury criticism), backward chaining (teacher-only), note-name flashcards as a main drill (no evidence vs continuous reading; keep as warm-up), trills/repeated notes (not syllabus tests; trill speed only appears as a sight-reading predictor).

## Gaps and cautions

- No published timing windows (ms) from any app; no published IOI-SD norms by level; no published pedal-timing windows.
- Duke 2009 is n=17 and correlational; interleaving evidence is small-n; feedback-frequency findings are not from music.
- The ABRSM PDF read here is a retailer-hosted copy of ABRSM's official 2025-26 specification. RCM tempos beyond Level 1 come from a teacher's chart, not the official PDF text (note values in the official PDF are images).
- Velocity is device-dependent: always calibrate.
