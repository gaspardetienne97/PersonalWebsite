# Jazz Decomposition — Plan & Trail

Follow-on to the Music redesign. Goal: dissolve the monolithic **Jazz Piano Guide** (`/music/learn/jazz`, a 5-tab reference page mis-filed under Practice ▸ Paths) into the right homes — the tracked **Jazz Path** for curriculum, **Library ▸ Reference** for theory, and **jazz-tagged drills** for the practice material — so "jazz" is a cross-cutting tag, not a separate place.

User decision (2026-06-29): **Full scope** — also build the new jazz drills, not just tag/recategorize.

## Why
`buildJazzLessonPath()` is literally `JAZZ_CURRICULUM` + mastery, so the Guide's "Learning path" tab is a strict subset of the standalone Jazz Path (it even links out to "the tracked path"). The other tabs are practice material (voicings already a drill; licks/scales/progressions could be drills) or reference (chords & scales, standards).

## Milestones (one verified commit each)
| ID | Work | Cost |
|---|---|---|
| J1 | **IA cleanup (Option 2):** delete the Guide's dup "Learning path" tab; recategorize the Guide out of `PATHS` → Library ▸ Reference; keep the standalone Jazz Path canonical. Fix catalog + links. | S |
| J2 | **`jazz` tag + Drills filter:** add `tags?: string[]` to `DrillItem`; "Jazz" filter chip in Practice ▸ Drills; tag voicings `jazz`. | S |
| J3 | **Jam over jazz changes:** wire `/jam` to `JAZZ_BACKING_TRACKS`; tag `jazz`. | M |
| J4 | **Jazz Licks drill:** new graded play-along drill from `JAZZ_LICKS` (29 licks). New scored drill. | L |
| J5 | **Jazz scales variant:** jazz/bebop scales mode on `/play/scales`. Engine + route. | M |
| J6 | **Chord-scale drill:** graded ii-V-I chord-scale variant. Scoring + route. | M |

## Conventions
Same as the redesign: never commit to `main`; gates `vp run @repo/web#check` / `vp test --run` / `vp run @repo/web#build`; browser-verify; one logical commit per milestone; update this trail after each.

## Progress
- **J1** `94fc776` — removed the Guide's dup "Learning path" tab (banner → tracked Jazz Path); moved the Guide from `PATHS` → `LIBRARY_ITEMS` (Reference); linked it from Library ▸ Reference. Verified, 869 tests.
- **J2** `112d0c8` — `DrillItem.tags`; voicings tagged `jazz`; Practice ▸ Drills style filter (derived from tags) + Empty state on no-match. Verified.
- **J3** `3b2cd04` — Jam/Improv tagged `jazz` (already ii-V-I/swing in the engine; just needed surfacing). Jazz filter now lists 2 drills. Verified.
- **J4** `e9ffd5f` — graded **Jazz Licks drill**. Engine: `gradeLickSequence()` (pure, positional pitch-class match, octave-lenient; unit-tested). Route `/music/play/licks` (pick category+lick → Hear it → Play it back → auto-grade at phrase length → XP/journal tagged jazz). Catalog "Jazz Licks" (skill Play, jazz). 3 jazz drills now. Verified, 875 tests.
- **J5** `7d2dd7a` — **scale-type selector** on the existing Scales drill (was major-only). `scale-pattern` engine extended to 12 scales (`SCALE_INTERVALS`, `scaleSemitones`, `JAZZ_SCALE_KINDS`); grouped selector (Modes / Jazz-modal); jazz scales tag the journal. Reframed from "new jazz-scales drill" → a *variation* (no duplication). Verified, 879 tests.
- **J6** `ebd11bb` — **chord-scale drill** (`/play/chord-scales`), built *instead of* the planned ii-V-I progression drill (which would have duplicated Voicings). As a ii-V-I moves, play the go-to scale per chord (Dm7→Dorian, G7→Mixolydian, Cmaj7→Ionian; minor: Locrian/Altered/Dorian), graded via the reused `gradeLickSequence` + `scaleSemitones` (no new engine). Verified, 881 tests.

## ✅ Jazz decomposition complete
J1–J6 shipped on `feat/music-redesign` (`94fc776`…`ebd11bb`). The Jazz Piano Guide is dissolved: the curriculum lives once in the tracked **Jazz Path**; theory/voicings/licks/standards live in **Library ▸ Reference**; and the practice material is **jazz-tagged drills** surfaced by the Drills style filter. **5 drills under the Jazz tag:** Voicings, Jam/Improv, Licks (new), Scales (jazz modes), Chord-Scale (new). Two redundant ideas were caught and avoided (a 2nd jazz-scales drill → folded into Scales; a ii-V-I progression drill → replaced by the non-redundant chord-scale drill).
