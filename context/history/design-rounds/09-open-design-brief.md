# Design brief: Practice OS — drill redesign & color system

Paste this whole document into the design tool. It is self-contained.

## What this app is

**Practice OS** is a web app for practicing music across six instruments: piano, guitar, ukulele, Aerophone (digital wind instrument), MPC pads (finger drumming), and voice. The core loop is **drills**: short, graded exercises. You configure a drill (key, tempo, pattern…), start it, play into it (MIDI instrument, microphone, or on-screen keyboard/fretboard/pads), and get a score with feedback. An adaptive engine tracks skills and suggests what to practice next.

The app works well functionally. This project is a **visual and interaction redesign of the drill experience** — keep every capability, change how it looks and feels.

## The two problems to solve

1. **Drills feel clunky and unpolished.** Every drill page shows a wall of configuration controls up front, a row of identical gray stat tiles, a gray card where the exercise happens, and a plain text line as the result. Everything has the same visual weight; nothing feels like playing an instrument.
2. **The color system is one-dimensional.** The whole app is a single near-navy/slate hue (a default shadcn palette). Cards, buttons, nav, stats — all the same gray-blue. I want **variety with meaning**, not rainbow noise.

## Assets already in the system (underused — build on these)

The app has a token vocabulary that the redesign should exploit rather than replace:

- **Chrome palette**: `background / foreground / card / popover / primary / secondary / muted / accent / border / input / ring` (currently all one slate hue — this is what needs enriching).
- **Meaning colors** (used only for outcomes, keep that discipline): `success` (green, "clean/correct"), `warn` (amber, "needs work"), `info` (blue), `destructive` (red, errors).
- **The stage**: a distinct surface family for the instrument panel where the exercise happens — `stage` (soft neutral inset in light mode, charcoal in dark), `stage-2` (raised), `stage-line` (gridlines/frets), `stage-muted`, and a single `practice-accent` (indigo/violet) for the focus/target/progress highlight on the stage.
- **Instrument identity hues — the biggest untapped asset**: `instr-piano` (indigo), `instr-guitar` (amber), `instr-ukulele` (teal), `instr-aerophone` (violet), `instr-mpc` (red), `instr-voice` (green). These exist as tokens and are barely used anywhere. A piano page could *feel* different from a guitar page. Rule: identity hues mark identity (page accents, chips, borders, progress rings, active nav) — never data or outcomes.
- Radius 10px base, system-ui type stack, dark + light themes (both required), a `reveal-up` staggered entrance animation, and an "eyebrow" overline label style (10px bold uppercase tracked).

## Anatomy of a drill page today (what feels clunky)

Every drill page currently stacks, top to bottom:

1. **Header** — title, subtitle, input-source readout ("MIDI · guitar" / "On-screen keys").
2. **Setup controls** — 3–6 segmented controls and dropdowns, all visible at once, disabled (dimmed) while the drill runs.
3. **HUD tiles** — 3–4 boxes with a big number and tiny label (Notes 0/24, LH 0%, Tempo 80 BPM). Identical gray boxes, mostly showing zeros before you start.
4. **Stage card** — a gray-bordered box holding the exercise surface (on-screen piano keys, a fretboard, pad grid, a rhythm lane) plus a progress bar and a status sentence.
5. **Summary** — after finishing: a one-line result ("LH 100% · RH 88% · 34ms evenness"), an XP chip, a comparison to your last run (▲ up 4%), and Repeat / Slow down buttons.
6. A right rail (22rem) on wide screens with the instrument input card.

Specific clunkiness to fix:

- **Setup dominates.** The config wall is the first thing you see every time, even though the app already remembers your last setup and Space starts the drill. Setup should collapse to a summary line ("Dorian · 100 BPM · 2 strings · Crossing") with an expand affordance; the primary visual should be the stage and a big Start.
- **Three states, one look.** Setup → playing → results are the same layout with things grayed in/out. They deserve three distinct visual modes: calm setup, immersive playing (the app already hides all nav chrome during a run — "focus mode" — but the drill page itself doesn't change), celebratory results.
- **The stage doesn't feel like an instrument.** It's a bordered gray div. It should feel like hardware/stage: darker inset surface, glow on the practice accent, satisfying hit feedback.
- **Results are an afterthought.** A drill you just completed deserves a moment: score presented big, delta vs last run prominent, what-to-do-next as a card, not a text line.
- **Stat tiles are dead weight before/after a run.** Before: zeros. During: useful. They should appear/transform with the run.

## The drills (functional contracts — keep all of this)

Each drill keeps its controls, states, and outputs; restyle and re-arrange freely.

| Drill | Setup controls | Live state | Result |
|---|---|---|---|
| **Rhythm** | pattern (quarters, eighths, sixteenths, rests, triplets, gap-click, off-beats, dotted, swing), mode (from memory / read & tap), BPM, bars | count-in clicks, tap target lane with accent cues, progress | timing score, mean error ms, missed/extra taps |
| **Chord-Perfect** (guitar/uke) | mode (build shape / pick cleanly / strum & identify / change trainer), chord, to-chord, format (reps ×N / one-minute timed), instrument | fretboard with target dots, strings progress, countdown clock in timed format | strings clean %, clean changes, changes-per-minute |
| **Two-hand** (piano) | pattern (pulse+line, role swap, shell+line, Alberti, contrary scale), hands (both/L/R), key, tempo, dynamics (even / melody louder) | two on-screen keyboards (LH low, RH high), notes progress | LH % / RH %, evenness ms, melody-louder contrast % |
| **Spider** (guitar/uke) | pattern (1234 permutations), string, span (1–all), order (by string / crossing), fret, tempo | fretboard highlighting next position | notes clean %, timing error |
| **Scales** | scale (major, modes, pentatonics, blues, bebop…), tonic, instrument, span, motion, BPM | highlighted scale positions, tempo ladder (clean run unlocks +10 BPM) | accuracy, unlocked BPM |
| **Ear training** | drill (intervals, chords, scale degrees w/ solfege, cadences, melodies), direction, labels | plays audio; answer via choice chips or by playing the note | correct/wrong with confusion tracking, retry queue |
| **Aerophone** | mode (long tone / swell / articulation / interval landing), target note, duration, style, interval+direction | live breath-pressure curve while holding | steadiness %, landing accuracy |
| **MPC pads** | rudiment (singles, doubles, paradiddle, moving accent), pads, hits, BPM | 4×4 pad grid, L/R hand cues, accent/tap velocity cues | hit accuracy, velocity control |
| **Jazz set** (licks, voicings, chord-scales, progressions) | category/lick, changes (major/minor ii-V-I), voicing set | chord chart with current/next cell, play-along | per-chord clean %, XP |

## Interaction contract (must survive the redesign)

- **Space** starts a drill; **R** repeats; **−** retries slower. Hints for these are shown subtly.
- The app remembers each drill's last setup (also shareable via URL).
- During a run, global nav/header hide (focus mode) — the drill owns the screen.
- After a run: score + **comparison to last run** (▲/▼) + **"Next up" suggestion** (one recommended next drill, deep-linked).
- Input can be MIDI, mic, or the on-screen surfaces; a readout shows which is live. QWERTY typing plays the on-screen keyboard (A–L white keys, W–P sharps).
- Every stat shown is real (no decorative numbers); success/warn colors carry meaning only.
- Accessibility: WCAG AA contrast in both themes, visible focus rings, reduced-motion honored, status lines are screen-reader live regions.

## What to explore (in priority order)

1. **A three-mode drill page.** Design Setup / Playing / Results as visually distinct states of one page for two contrasting drills — say Two-hand piano (dual keyboards, most complex) and Rhythm (simplest, tap-only). Collapsed setup with summary line; immersive stage while playing; a results moment with the delta and next-up.
2. **A richer color system with discipline.** Keep the neutral chrome, but: warm the neutrals slightly, introduce the per-instrument hue as the page accent (borders, active controls, progress, nav marker), keep the practice-accent for the stage focus, reserve green/amber strictly for outcomes. Show the same drill page in piano-indigo and guitar-amber to prove the system.
3. **Stage as hardware.** Make the exercise surface feel physical: inset/charcoal panel, subtle texture or depth, glowing target highlights, hit feedback (key press flash, pad ripple), progress integrated into the stage instead of a bar above it.
4. **HUD that earns its place.** Stats that appear when the run starts (or animate from the Start button), live-update with emphasis on the one that matters for this drill, then compose into the results view.
5. **Dark and light** versions of everything; dark is the primary practice environment.

Deliver as clickable/composable screens I can compare side by side; component-level details (buttons, segmented controls, selects, chips) should be consistent across drills so the winning direction generalizes to the other seven drill pages.
