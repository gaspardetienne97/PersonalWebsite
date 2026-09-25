# 12 · Round 4 proposal: coherence, individual drills organised by paths, a music-app look

Status: **approved 2026-09-04** with decisions: display face B (Outfit), palette B (today's cool neutrals kept; only the stage-as-hardware, type and musical colour changes apply), the fixed 12-colour degree set adopted, mixed drill named "Ear training review". Companion documents: [10-visual-references.md](10-visual-references.md) (reference board), [11-drill-patterns.md](11-drill-patterns.md) (per-drill patterns), the design canvas (link in section 6). Implementation starts only after this proposal is approved.

## 1. What changes, in one screen

- **Every drill is one drill.** Ear training becomes seven routes under `/music/learn/ear/<slug>` (Intervals, Chord qualities, Cadences, Scale degrees, Melody dictation, Repertoire transfer, Ear review). `/music/learn/ear` becomes the Ear Training Path page. The Jazz Path gains the licks and chord-scale drills and links every reference step to the drill that practises it.
- **One path model.** A `learning-path` engine in music-core projects a path definition (ordered steps with an href carrying the drill's setup, skill ids, applicability) into steps with mastery, status and a "continue here" pointer. The Ear Training Path and the Jazz Path both render through one `LearningPathScreen`.
- **Fretted drills make sense.** Spider plays inside a fret window (the four frets in play plus one of context, absolute fret numbers, a neck-overview strip). Chord-Perfect shows one chord position at a time with a stepper through engine-generated positions (open, barre, closed), finger numbers on the dots, and a fingering guide for that position only.
- **A music-app look.** Warm neutrals instead of cool slate, one violet stage light, a display typeface for titles and result numbers, Fira Mono for live readouts, the stage drawn as hardware (inset, grain, glow, hit bloom), the keyboard and fretboard drawn as instruments, musical colour for degrees and tone roles, per-instrument identity accents, generated hue plates on cards instead of the WebP covers, a small mark next to "Practice OS".

## 2. Individual drills and paths

### 2.1 Ear drills

| Slug | Title | Session drill | Answer modes | Setup |
|---|---|---|---|---|
| `intervals` | Intervals | interval | choice, play-back, listen | feedback |
| `chord-qualities` | Chord qualities | chord-quality | choice, play-back, listen | feedback |
| `cadences` | Cadences | cadence | choice, listen | feedback |
| `scale-degrees` | Scale degrees | scale-degree | choice, play-back, voice, listen | level, labels, feedback |
| `melody-dictation` | Melody dictation | melody-dictation | play-back | level, labels, feedback |
| `repertoire-transfer` | Repertoire transfer | repertoire-transfer | play-back | level, labels |
| `mixed` | Ear training review | mixed | choice, play-back, listen | level, labels, feedback |

Guarantees: exercise ids, skill ids and the session engine are untouched; journal tags stay `["ear", <drill>]` so the daily routine still completes its ear step and per-drill history already exists; each route remembers its own setup (storage is keyed by pathname); old links `/music/learn/ear?drill=cadence&answer=listen` redirect to `/music/learn/ear/cadences?answer=listen`; `?routine=1` alone lands on Ear review.

### 2.2 Paths

`LearningPathDefinition { id, title, subtitle, href, steps[] }`, step `{ id, order, title, summary, detail?, kind: drill | review | reference, href?, links?, skillIds?, applies? }`, projected by `buildLearningPath(definition, { mastery, instrument })` into `{ steps (mastery, status todo / in-progress / done at 0.66, instrumentNote), done, total, next }`.

Ear Training Path steps (from the curriculum research): 1 Anchor the tonic (Scale degrees, listen, anchor set) · 2 Diatonic degrees (Scale degrees, choice) · 3 Sing or play it back (Scale degrees, play-back; link Voice) · 4 Transfer into melodies (Melody dictation; link Repertoire transfer) · 5 Chromatic colour (Scale degrees, chromatic set) · 6 Harmony and interval labels (Ear review; links Intervals, Chord qualities, Cadences). Each card says which degrees the step adds and what "done" means.

Jazz Path: intervals links `/music/learn/ear/intervals`; chord symbols and extensions stay reference steps with a "Hear the qualities" link; chord-scales links the Chord-Scale drill (major, minor); shell voicings links Voicings; new step Licks; improv and repertoire follow. Reference pages keep their place as `kind: reference`.

### 2.3 URL map

| Before | After |
|---|---|
| `/music/learn/ear` (drill) | `/music/learn/ear` (Ear Training Path) |
| `/music/learn/ear?drill=X&…` | `/music/learn/ear/<slug>?…` (client redirect) |
| daily routine ear step `/music/learn/ear` | `/music/learn/ear/mixed` |
| `hrefForSkill` catch-all to `/music/learn/ear` | the matching drill (`intervals`, `chord-qualities`, `scale-degrees`, `cadences`, else `mixed`) |
| Jazz Path `/music/learn/path` | unchanged, rendered by the shared screen |

## 3. Visual system: "Warm Studio"

Palette (music scope only; `/` and `/pdf` unchanged). Light: paper `oklch(0.985 0.005 80)`, ink `0.18 0.02 60`, muted text `0.50 0.02 65`, border `0.90 0.012 80`, primary `0.46 0.17 280`, stage `0.93 0.010 75`, stage-2 `0.89 0.012 75`, stage-line `0.83 0.014 75`, practice accent `0.50 0.21 282`. Dark: walnut charcoal `0.165 0.012 60`, card `0.21 0.014 60`, muted text `0.70 0.02 75`, primary `0.72 0.14 285` with dark-ink text, stage `0.19 0.012 60`, stage-2 `0.24 0.014 60`, stage-line `0.31 0.016 60`, practice accent `0.66 0.19 290`. Unchanged: instrument hues, skill hues, hand tokens, piano keys, success / warn / info / destructive. New: `--stage-shadow`, `--stage-grain`, a `--fretboard` pair for the wood (light `0.64 0.07 62`, dark `0.38 0.05 55`) with `--fretboard-fret` for the wires, and a small **musical colour set** for scale degrees (12) and tone roles (chord, scale, avoid), fixed across themes and contrast-checked. Every pair is asserted at AA in both themes by a new token contrast test.

Type: `@fontsource-variable/bricolage-grotesque` as `--font-display` for route titles, stage headings, result numbers and card titles; Fira Mono wired to `--font-mono` for live readouts; system sans for body. Alternate face if the canvas reads too playful: Outfit.

Stage as hardware: inset panel with grain and a top rail in the instrument hue, stronger accent glow, hit bloom (200 ms ring) on keys, pads, fret dots and the timing needle. Keyboard keys get depth (gradient, bottom lip); the fretboard gets wood, nut, inlays, thicker low strings, fret numbers in mono. Cards: a 5:2 hue plate with a generated pattern per skill or instrument replaces the WebP covers; path cards add a steps-done bar. Chrome: a three-bar VU mark next to "Practice OS", an active-instrument marker on the nav and a hue underline on titles. Motion: 120 / 200 / 320 ms, nothing continuous, reduced motion honoured.

## 4. Fretted drills

Fret window: `FretboardInput` gains `fretWindow {start, end}` (absolute, inclusive); our own offset (not fretboard.js `crop`, whose offset follows the dots and whose click handler ignores it); fret-number labels rewritten after render; the screen-reader button grid keeps absolute labels so every existing test and both e2e specs keep working; a neck-overview strip shows where the window sits. `fretWindowAround(frets, fretCount, {context 1, minWidth 5})` in music-core. Spider: window from the prompt positions (start fret 5 gives frets 4 to 9); note-finder keeps the full neck.

Chord positions: `chord-positions.ts` in music-core generates 2 to 5 positions per curated chord from its pitch classes and the tuning (max stretch 3 frets, max 4 fingers with a barre counting once, root in the bass, no inner mutes), position 0 being today's open shape object so persisted ids do not change; anchors pinned in tests (guitar C barre at 3 and 8, G at 3, D at 5, Em at 7, Am at 5, ukulele C at 3). `ChordPerfectDrillConfig` gains `position` and `toPosition`. The UI shows one position on its fret window with finger numbers on the dots, a `PositionStepper` under the chord select, a fingering guide for that position, and the change trainer uses the chosen positions.

## 5. Slices and order (after approval) · status

Strand 1, drills and paths (behaviour first), **done** (bc76fe17 … a5f8deec): (1) learning-path engine and jazz wrapper · (2) ear drill definitions, deep-link helpers, curriculum hrefs · (3) move the ear page body into `EarTrainingDrillRoute` · (4) seven ear routes with per-route tests · (5) Ear Training Path page with the legacy redirect · (6) catalog, `hrefForSkill`, routine hrefs, track links, e2e · (7) Jazz Path on the shared screen · (8) path and ear-drill restyle.

Strand 2, fretted drills, **done** (d321b9d5 … 25fe88b8): (9) `fretWindowAround` · (10) chord positions generator · (11) `FretboardInput` window and dot labels · (12) Spider window · (13) Chord-Perfect stepper.

Strand 3, visual refresh, **done** (53c95ac0 … e3a5147f; the cover-image tests were deleted deliberately with the covers): (14) tokens, musical colour set, display type (own commit for tokens) · (15) stage as hardware, keyboard and fretboard drawing · (16) chrome identity: mark, nav marker, cards, hubs · (17) docs: AGENTS.md theming rule, CHANGELOG, screenshots.

Gates per commit: check, unit, build, Playwright; screenshots at 1280 and 375 in both themes; keyboard walk on every changed drill route; CHANGELOG entry per commit.

## 6. Mockups

Design canvas: https://claude.ai/code/artifact/d2ff71d0-8ccc-4a65-8655-4157ff749ebf (static mockups, not a clickable prototype). Artboards: visual system (type, palette, surfaces, instrument accents), Practice home, Ear Training Path, drill card, Intervals, Scale degrees (degree wheel), Melody dictation, Spider (fret window), Chord-Perfect (one position, stepper), Jazz Path, phone versions. Two directions for type pairing and palette warmth.

## 7. Decisions still needed from you

1. Type: Bricolage Grotesque (characterful) or Outfit (quieter) for the display face; the canvas shows both.
2. Palette warmth: the warm paper and walnut direction as specified, or the cooler alternate on the canvas.
3. Degree colours: adopt a fixed 12-colour degree set (Sonofield-like) on the scale-degree wheel and keyboard, or keep degrees monochrome and colour only tone roles.
4. Ear review card: listed in Practice ▸ Drills (as decided) and shown as the path's last step; confirm the name "Ear review".
