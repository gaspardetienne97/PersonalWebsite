# 11 · Drill patterns: how each drill should look and work

Round 4, 2026-09-04. For every drill: what reference apps do, the pattern to adopt, and the concrete change to our screen. Decisions already taken in [06-drill-ux-research-plan.md](06-drill-ux-research-plan.md) and [07-drill-depth-expansion-plan.md](07-drill-depth-expansion-plan.md) are not re-opened; where this document differs it says so. Every drill keeps the three-state shell from rounds 1 to 3 (collapsed setup line, ready stage with the drill's own picker and Start, focus-mode playing, metric-first results).

## Cross-cutting

- **The stage is the screen during a run.** Chrome collapses to a thin progress bar, the Stop button and the status line. Reference: Perfect Ear, Sonofield.
- **One answer surface per drill, filling the stage.** Not a card inside a card.
- **Musical colour.** Scale degrees, tone roles (chord / scale / avoid) and hands each get a fixed colour that is the same in both themes; correctness is always a second channel (bloom, ring, glyph, live text). Reference: Sonofield degrees, Fretonomy interval dots.
- **Results breakdown.** Metric, then per-band or per-item bars, then last-run delta and personal best, then Again / Change setup / Next up. Reference: Melodics.
- **Individual drills, paths organise them.** Every card in Practice ▸ Drills is one drill with one Start; the Ear Training Path and the Jazz Path order them.

## Ear training (splits into seven drills under `/music/learn/ear/<slug>`)

| Drill | References | Pattern | Our screen |
|---|---|---|---|
| **Intervals** `intervals` | Perfect Ear (staff plus keyboard, two big answer buttons), EarMaster | Cadence or tonic context, prompt, large labelled answer buttons, resolve-to-tonic after the answer | Answer grid of big round targets (interval names), keyboard shows the two notes after the answer, optional play-back on the keyboard; Test mode hides the keyboard |
| **Chord qualities** `chord-qualities` | EarMaster, ToneGym chord games | Same as intervals with quality names | Quality buttons (major, minor, dim, aug, sevenths as configured); after answering, the keyboard lights the voicing |
| **Cadences** `cadences` | EarMaster cadence drill | Choice only, tonal context stated | Four large buttons (I, IV, V, vi cadences as configured); key stated in the eyebrow; Listen mode |
| **Scale degrees** `scale-degrees` | Sonofield (degree wheel over a drone), Functional Ear Trainer | Drone always audible, tonic stated, answer on a wheel where degree distance is spatial, resolution played back | New `DegreeWheel` answer surface (12 positions on a circle, degrees coloured, chromatic degrees on the inner ring, disabled degrees dimmed), drone toggle and key in the eyebrow, answer modes choice / play-back / voice / listen in setup; free play under Start on the ready stage |
| **Melody dictation** `melody-dictation` | Sonofield Melodies (sequence of degree slots filled as you answer), ToneGym Melody Hunter | Memory plus reconstruction: slot strip, replay phrase and hear tonic separately, ordered feedback | Slot strip with degree chips above the keyboard; Replay and Hear tonic buttons; per-slot correct / wrong / missing marks (existing `MelodyDictationStage` restyled) |
| **Repertoire transfer** `repertoire-transfer` | Soundslice practice lists | Phrases from real songs ranked by staleness | Ready stage lists the review queue and plan (moved from the landing); Start runs the plan; same slot strip |
| **Ear review** `mixed` | ToneGym daily workout, Sonofield Challenges | Short adaptive mix of everything unlocked | Adaptive queue as today; ready stage shows what the mix will draw from and links to the sibling drills; the routine's ear step and Retry mistakes land here |

Ear Training Path (`/music/learn/ear`): six steps from the curriculum research (anchor the tonic, diatonic degrees, sing or play back, melody transfer, chromatic colour, harmony and interval labels), each with the degrees it adds, the drill it opens with the right setup, and a mastery bar. Reference: Sonofield's Path of the Sun.

## Reading

| Drill | References | Pattern | Our screen |
|---|---|---|---|
| **Note reading** `/music/learn/reading` (flashcards and sight reading) | Soundslice (cursor lights each note, loop by bar, slow-down), Sight Reading Factory, Perfect Ear staff plus keyboard | Notation above, instrument below, moving cursor, wait mode | Keep the shell from round 1; restyle the staff card onto the stage surface, keyboard gets depth; fretboard view for guitar and ukulele uses the fret window around the phrase |

## Rhythm

| Drill | References | Pattern | Our screen |
|---|---|---|---|
| **Rhythm trainer** `/music/learn/rhythm` | Perfect Ear (one round tap target, notation above), Melodics (timing bands) | Single large tap target, beat dots, timing meter live, results by band | Tap target becomes a large round button on the stage (already full width on the phone); results add Good / Early / Late / Missed bars from the existing HUD projection |

## Technique

| Drill | References | Pattern | Our screen |
|---|---|---|---|
| **Scales and technique** `/music/play/scales` | Fretonomy scale calculator (coloured tone roles), Synthesia | Highlight the pattern, light the next note, tempo ladder | Keep; keyboard depth and the target bloom; tone roles coloured by scale degree |
| **Spider** `/music/play/spider` | Fretonomy game (fret window 0 to 8 with markers), Rocksmith riff repeater | Show only the frets in play with one fret of context, absolute fret numbers, position markers, next fret glowing | **Fret window** (`fretWindowAround` positions, min five frets), neck-overview strip, next position blooms, completed positions filled; ready stage states "Frets 4 to 9" |
| **Two-hand** `/music/play/two-hand` | flowkey and Yousician per-hand colour | Hands as colour plus form | Keep hand tokens; keyboard depth |
| **MPC rudiments** `/music/play/mpc` | Melodics pads | Pad grid on the stage, hit bloom | Pads on `stage-2` with a bloom on the last hit; sequence lane chips unchanged |
| **Aerophone** `/music/learn/aerophone` | TonalEnergy (big target, in-tune history), Roland Aerophone Lesson (note name plus fingering) | One big target, live cents needle, breath envelope | Round-3 traces stay; the fingering diagram gets tone-hole colour; the cents meter grows into the stage's main gauge |

## Harmony (fretted)

| Drill | References | Pattern | Our screen |
|---|---|---|---|
| **Chord-Perfect** `/music/play/chord-perfect` | ChordBank (one position at a time, positions grouped by fret, finger and note on the dot), Justin Guitar One Minute Changes, Uberchord alternate voicings | Show **one** chord position on a fret window, step through positions, fingers on the dots, muted and open strings marked at the nut | Engine-generated positions per chord (open, barre, closed); `PositionStepper` "Position 2 of 4 · Barre at fret 3 · frets 2 to 6"; fretboard window with finger numbers on target dots; fingering guide for that position only; change trainer uses the chosen positions and a union window |
| **Chord progression** `/music/play/chord-progression` | iReal Pro chart, Soundslice loop | Chart as the canvas, current and next chord, one instrument surface | Keep round-2 layout; chart cells get the tone-role colours; keyboard depth |
| **Voicings** `/music/play/voicings` | Piano voicing apps, ChordBank Drop 2 sets | One voicing, its tones coloured by role | Keep; keyboard depth |
| **Chord-scale** `/music/play/chord-scales` | Fretonomy scale colours | Tone roles on the keyboard | Keep; the tone legend uses the fixed role colours |

## Play

| Drill | References | Pattern | Our screen |
|---|---|---|---|
| **Licks** `/music/play/licks` | Soundslice loop, Yousician call and response | Hear it, play it back, next note lit | Keep round-2; keyboard depth and bloom |
| **Jam** `/music/jam` | iReal Pro (moving bar highlight, mixer), Moises sections | Chart follows the transport, per-chorus report | Keep round-2; chart cells coloured by tone role of the current chord |
| **Free play** `/music/play` | Practice Lab | Capture anything | Restyle only: cards onto the new plates |

## Fretboard drawing (shared by Spider, Chord-Perfect, Reading, Jam on strings)

Adopt from ChordBank and Fretonomy: the board is drawn as material (walnut `stage-2` body, lighter fret wires from `stage-line`, a bone nut when the window starts at 0, otherwise a thin fret-coloured left edge), inlay dots at 3, 5, 7, 9, 15, 17, 19, 21 and a double at 12, string thickness increasing toward the low strings, fret numbers below the board in Fira Mono, and dots that carry a finger number or note name in a readable size. All of it through tokens; the `FretboardInput` theme colours already read CSS variables.

## Keyboard drawing (PianoSurface)

Keys get a subtle top-to-bottom gradient and a bottom lip so they read as keys, not rectangles; black keys get a highlight edge; the target ring stays the practice accent; the hit bloom is a 200 ms ring in success or destructive colour; tone roles and degree colours fill the key face at low alpha with the role glyph unchanged.
