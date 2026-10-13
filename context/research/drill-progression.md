# How a drill moves to the next run

The question: after each run, should the next run be faster, a harder variation, or the same? The rule lives in `packages/music-core/src/progress/advance.ts`.

## What the evidence says

**Tempo steps**
- Yousician's auto speed and Guitar Pro 5's speed trainer both step 5% at a time.
  - [Yousician](https://support.yousician.com/hc/en-us/articles/204796991-Practice-and-Play-modes-in-piano)
  - [Guitar Pro forum](https://forum.troygrady.com/t/speed-training-in-guitar-pro/5682)
- Soundslice's example steps 10%, with 4 plays per speed. [Soundslice](https://www.soundslice.com/help/en/player/basic/286/speed-training/)
- Teachers use 2 to 5 BPM: Drumeo uses 5 BPM, Strum Machine 1 to 2 BPM every 4 reps.
  - [Drumeo](https://www.drumeo.com/beat/rudiment-game/)
  - [Strum Machine](https://strummachine.com/help/speedup)
- A percent step scales across tempos. 5 BPM is 8% at 60 BPM but under 3% at 180.

**Runs before raising**
- Practitioners say 3 to 6 clean runs in a row.
- Melodics' Auto BPM raises the tempo on every pass. [Melodics](https://melodics.com/blog/pro-tips-9-steps-to-mastering-a-melodics-lessons)
- Rocksmith lets the player choose the number of clean runs.

**After failure**
- Duke, Simmons and Cash (2009, JRME 56:310) studied pianists.
  - The best ones slowed down sharply to fix errors.
  - More incorrect trials predicted worse retention.
  - A higher share of correct trials predicted better retention.
- Repeating at a tempo you keep failing is the harmful case.

**Untimed drills**
- Levitt (1971) staircases: n correct in a row to step up tracks 0.5^(1/n) success.
  - 2 in a row tracks 70.7%, 3 tracks 79.4%, 4 tracks 84.1%.
- Wilson et al. (2019) give the "85% rule". [PMC6831579](https://pmc.ncbi.nlm.nih.gov/articles/PMC6831579)
- Math Garden's Elo system targets 75% success. That approach only pays with a large item bank.

**Variation and reset tempo**
- Interleaved practice helped clarinet speed at retention, not during practice. [Stambaugh 2011](https://www.ncbi.nlm.nih.gov/pmc/articles/PMC4989027/)
- Performance during practice misleads as a measure of learning (Soderstrom and Bjork 2015).
- Learning tempos sit at 50 to 70% of the target.

**Frustration**
- Difficulty that swings back and forth (rubber-banding) frustrates players (Hunicke 2005).
- Show what the next run is before it starts, and let the player override it.
- Hysteresis costs success rate at the edge, so demote the visible achievement (the variation) slowly and the tempo quickly.

## The rule chosen

- **A pass** is the drill's own `correct` with a score of 85% or better.
  - Sources: Duke for correct trials, Wilson's 85%.
- **Two passes in a row** raise the tempo 5%, at least 2 BPM.
  - Sources: Yousician, Guitar Pro. Two in a row tracks about 71% success, which keeps progress at roughly 12 runs per variation.
  - Three in a row tracks 79% but means 24 or more runs per variation, which felt too slow.
- **Two passes at the variation's goal** move to the next variation, starting at its own start tempo or 75% of its goal.
  - That is the top of the learning range, for material the player already owns.
- **A run under 70%** steps the tempo back once (Duke).
  - The variation never drops on one bad run.
  - Two fails at the floor tempo, or two in a row on an untimed drill, offer the easier variation (hysteresis).
- **Untimed drills** move through their variations only, with the same two-in-a-row rule.
- **The offer is a button.** "Speed up to 116 BPM" or "Move on: Two notes a click at 69 BPM" applies the change and starts the run. Again repeats the run unchanged.
- **Drills that already had a better-fitted rule keep it.**
  - Sight reading's level climb.
  - Song Studio's trouble-spot loop.
  - The ear drills' item unlocking and the fine-pitch staircase.
