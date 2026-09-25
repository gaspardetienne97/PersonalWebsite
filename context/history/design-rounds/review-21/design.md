# Design: direction, layouts, states and the three prototypes

17 September 2026. Built with the installed `frontend-design` skill (plan → review against the brief → build → screenshot → critique → revise once). Prototypes are static HTML under `prototypes/`, open them from disk; they use the app's tokens copied into `prototypes/tokens.css`, the same three type roles, and simulated data labelled as such. Screenshots are under `screenshots/prototypes/` (first pass without the `rev-` prefix, revision with it) and `screenshots/after/` for the real app after this session's code changes.

## 1. Direction: the bench

**Subject.** A musician's practice bench, not a learning product's landing page. The things a player looks at while both hands are busy are the instrument surface and one line of status; everything else waits at the edges.

**What carries the identity.** The instrument surfaces drawn as material: ivory and ebony with a front lip and lacquer, a rosewood neck with nickel fret wire and position dots and strings that thicken toward the bass side, rubber pads on a dark panel with an LED under each. This is the one bold element. The chrome around it stays quiet: the site's tokens, cards with one radius, no decoration. Instrument hue is identity only (badge, nav marker, stage rail); correctness is the semantic tokens plus a glyph or a sentence; degrees and tone roles keep their fixed colours. None of that changes. Two established rules are proposed for change below, explicitly.

**Type.** Outfit for titles and big numbers, the system sans for everything read, Fira Mono for anything that ticks (BPM, cents, notes, timers). Unchanged, deliberately: the app already has a distinct display face and one more would be noise.

**Palette.** Unchanged tokens with two measured corrections (dark `--primary` and the progress track, see findings O11). The canvas wash now takes the practice accent instead of the instrument hue (O03).

**Plan review against the brief and against the generic defaults.** No cream and terracotta, no hairline broadsheet, no acid-green on black. The app's own convention of uppercase tracked eyebrows is a documented rule of this repo, so it stays, sparingly (one per section, never above a heading that already says the same thing). Numbered markers appear only where content is a sequence (the routine steps, the fill bar). Meta strings joined with middle dots are an existing app convention in setup lines; kept there and nowhere else new. What changed from my first draft after this check: the stage carried both a gradient wash and a grain layer plus a coloured rail, three decorations for one panel; the prototypes keep the wash and the rail and drop the grain. The results tiles were a four-card row of identical shapes; the "Next" tile is now hollow (dashed) because it is a suggestion, not a measurement.

## 2. Two app-wide layout directions, one recommendation

**A. Bench (recommended).** Left rail navigation that collapses to a 56 px icon rail and persists; the practice capsule sticky at the top; the stage first in the content column with a one-line setup above and results below; on the phone a bottom tab bar, the capsule scrolls sideways if it must, the stage is full width. Hub pages keep their current shell. Cost: the rail is a permanent 56 px even when collapsed; the phone gets no extra width from it. Benefit: one navigation model, a drill gains 184 px on demand, hubs are one click away, the current Music shell already works this way so the change is small (done in the tree, see O05).

**B. Split.** No rail; a top strip of four hubs with the utilities behind a menu; the stage on the left and a fixed 20 rem right column for setup, feedback and next step (Song Studio's shape today). Cost: a second navigation model against the site header, utilities two taps away, and the right column collapses under the stage below 1024 px so the phone layout diverges. Benefit: the stage gets full width at once, feedback sits at eye level.

Recommendation: A, with B's right column adopted only inside Song Studio (already the case) and in the Record page prototype where the selected take's details belong beside the list. Both prototypes were built at 1280 and 375 and checked at 320.

## 3. Interaction and state behaviour

### Stage modes: Demo, Practice, Check

- **Demo**: audible model plus synchronised visuals. The stage takes a dashed frame and the eyebrow reads "listening, not scored". Both hands (or all voices) light together as they sound; a beat lane above the surface shows what lands on each beat (left hand top row outlined, right hand bottom row filled) so "which notes happen together and in what order" is visible before the first attempt (O06). Nothing the player plays is graded and nothing is written to history.
- **Practice**: targets shown, the beat lane fills with on-time/late/missed marks per hand, live held keys light in the practice accent, and a hint is available under an explicit disclosure ("Show a hint (recorded as assisted)"). Hints write `assistance: "hinted"`.
- **Check**: no targets, no hand markers, no hint, live held keys still light. A clean check is the only thing that counts as independent mastery. Demonstrations are unavailable inside Check by construction (the disclosure is removed, not disabled).

This maps to the existing `assistance` and `source` fields on `ScoringEvent`; no new provenance concept is needed.

### Live polyphonic feedback

Held notes from any accepted source light while held (done in the tree for MIDI, see O07). Played, expected, hint, correct, wrong and demo remain distinct states with distinct lifetimes: held = while down; target = the current group; wrong = 200 ms flash on the key plus a mark on the staff or lane for the group (never a growing red set, see O09); correct = 200 ms flash; demo = while the model sounds.

### Score viewport, transport and range

Transport and practice actions sit above the score; the score scrolls in its own viewport (62 dvh, capped) so Play and Start never leave the screen (done in the tree, O12). Range selection is bar-snapped by default: a green **Start** handle and a red **End** handle, each labelled with the word and a bar number; a readout above says "Start · bar 3, End · bar 6, 4 bars, 10 s at 96 BPM". Tap a bar then another bar to set a range (the first tap draws the Start handle immediately), or drag a handle. Colour is paired with the label text and the position, so the two ends are told apart without colour (O15). The follower cursor is one 2 px line spanning all staves of the system (done, O14); for polyphonic groups the line stands at the group's onset and every note of the group takes the active ink.

### Navigation

Rail collapse persists per browser (`localStorage`), announced by the toggle's label; in the collapsed rail every item keeps its accessible name and a `title`. Phone: bottom tab bar for the four hubs; utilities from the Practice hub's header menu. Height fills the viewport below the site header, utilities anchored to the bottom (done, O05).

### Loading, empty, error, recovery

Prototype 1 has a state switcher: **No device** (input pill turns neutral, a banner offers the on-screen keys and "Connect a device"); **Audio blocked** (banner with the one action the browser needs, "Enable sound"); **Loading** (a stage skeleton with a plain sentence, no spinner alone); **Score error** (the viewport explains which construct the staff renderer cannot draw and offers Waterfall and a way to report the file). Prototype 2 shows the empty take list ("Press Record, play, and the take lands here with its picture"), an unsupported-format import error beside the drop zone, and a kit with empty pads that explain themselves.

### Accessibility checks performed on the prototypes

Keyboard: tab order runs rail → capsule → setup → stage modes → keys → hint → actions → score; Enter and Space work on every control including bars in the range selector; Space starts and stops the run when focus is not on a control. Focus: 2 px practice-accent outline, inset on piano keys so a white key never rises above the black keys. Targets: after the revision every control except piano keys and pads is at least 44 px tall (nav, capsule, modes, filters, take actions, sample previews were 36 to 40 px in the first pass). Piano keys are 36 px wide minimum (the app's `MIN_WHITE_KEY_PX`) with horizontal scroll at 375; black keys are narrow by nature and have the same accessible name and state as the app's. Reduced motion: transitions collapse to 1 ms, the beat lane still updates per beat. Screen readers: one `role="status"` line per page owns announcements; the beat lane and pads carry names; the hint disclosure says it is recorded. Widths: 1280, 375 and 320 have no horizontal page overflow (scroll width equals client width in every capture). Dark and light both captured.

## 4. The three prototypes

### 01 · Practice workspace (`prototypes/01-practice-workspace.html`)

Two-Hand Independence, "Pulse + line" in C at 72 BPM, eight beats: left hand alternates C3 and G2, right hand plays C4 D4 E4 G4 E4 D4 C4 E4. Demo / Practice / Check as above; QWERTY (A to L, W to P) and pointer play the keys; the beat lane marks each hand's hit as on time, late or missed; the results row shows left, right, "together" (both hands within 40 ms) and a hollow "Next" tile. Below it, Song Studio for a 32-bar study with transport above the score, bar-snapped Start/End handles and the single cursor line. The rail collapses; the phone shows the tab bar.

### 02 · Record and kits (`prototypes/02-recorder-kit.html`)

A standalone **Record** destination: source toggle (MIDI notes / Microphone), a timer, a Record button, and for the microphone a level meter with green/amber/red bands, a peak hold and a plain sentence about headroom. Take cards distinguish MIDI (piano-roll thumbnail, hand colours, middle-C guide, note count, range, BPM) from audio (peak envelope, peak level, a "+12 dB on playback" tag when boosted). Each card has a 48 px Play/Pause on the left, an inline editable name, Details, Download, Delete. The side column shows the selected take and, for audio, a nondestructive playback gain slider that reports the resulting peak and warns before clipping. The kit builder places sixteen pads bottom-left first with their canonical note, a working menu on every pad (native select over the pad, so it opens even in a scroll container) and drag-and-drop from the sample list; each sample row says which pad it is on. The unsupported-format error appears beside the drop zone.

**Recorder placement.** Recommend the standalone destination: recording is a distinct job done with an instrument in hand, wanted from any drill's summary, and today it exists twice (Create and Practice Lab) with separate take lists. Cost: one more utility item and a redirect from Create's Recorder tab. Keep Beat grid and Piano roll in Create.

### 03 · Progress alternatives (`prototypes/03-progress-alternatives.html`)

Same simulated fortnight of guitar practice in all three (9 sessions, 2 h 05, 31 attempts of which 24 unaided, 8 skills).

- **A · Skills** answers "what is solid and what is stale": one row per skill, an estimate bar with a review-due hatch when it has dropped ten points, a dashed "last measured" tick, hollow bars under five attempts, and a sentence explaining the estimate. Weak at time spent and at "what happened Tuesday".
- **B · Sessions** answers "what did I do and did the same setup improve": seven-day minutes, a journal grouped by day with unaided/hinted tags, a paired comparison of identical setups (31 → 38 → 42 changes per minute), the "next time" reflection. Weak at the shape of a skill over weeks.
- **C · What next** answers "what do I play in the next twenty minutes, and why": one paragraph of reasoning, a time budget (10/20/30), a numbered list with a reason per item, and three short columns: falling, holding, not measured yet. Weak because it invites trust in a heuristic; it therefore links to A and B and never hides their evidence.

**Recommendation.** C as the default Progress landing with A and B as tabs in the URL (`?view=`), because the daily question is "what now". Keep the streak and the weekly minutes; retire the XP ring from the hero (it measures participation, see the open R31 decision) or rename it practice points and move it to B.

## 5. First-pass critique and the revision

Weaknesses found in the first captures and what changed:

1. **Touch targets.** Nav rows 40 px, capsule buttons 38, mode buttons 40, hint disclosure 28, "Edit setup" 22, filters 36, take actions 40. All raised to 44; "Edit setup" became a real button.
2. **Phone capsule** clipped "Piano" at 375 because the row was centred with `justify-content` and could not overflow. It now scrolls sideways when wider than the viewport and centres when it fits.
3. **Range labels** at the top of the first system were cut off by the viewport edge. Labels moved inside the bar.
4. **Ready state showed no targets**, so the first thing the player saw was a bare keyboard. Practice mode now shows beat one's targets before Start; Check still shows none.
5. **Piano keys at 375** were 28 px wide. Minimum 36 px with a horizontal scroll, matching the app.
6. **Floating theme toggle** covered the keyboard on the phone. Moved into the page header.
7. **Progress variants** did not switch on hash navigation; fixed so `#b` and `#c` deep-link.

Remaining weaknesses I would not ship as is: the results tiles still read as a card row (one hollow tile helps, a single sentence would help more); the score viewport's fake notation is a placeholder for VexFlow output and says nothing about engraving density; the pad grid in prototype 2 has no keyboard path for drag (the menu is the accessible path, which is fine, but the sample rows should also expose "Assign to pad…" as a button).

## 6. Before and after in the real app

| Item | Before (`screenshots/current/`) | After (`screenshots/after/`) |
|---|---|---|
| White key over black keys | `repro-O02-focus-visible-white-key.png` | `repro-O02-after-focus-visible.png` |
| MPC pads held / stuck | `repro-O04-mpc-after-release.png` (one pad, still lit) | `mpc-stage-two-pads-down--1280-dark.png`, `mpc-stage--1280-dark.png` |
| Piano polyphony and middle C | `two-hand--1280-dark.png` | `piano-scales-held--1280-dark.png` |
| Sidebar height and collapse | `home--1280-dark.png` | `home--1280-dark.png`, `home-sidebar-collapsed--1280-dark.png` |
| Long score, actions, dark ink | `song-studio--1280-dark.png`, `song-studio-preview-cursor--1280-dark.png` | `song-studio--1280-dark.png`, `song-studio-preview--1280-dark.png`, `song-studio--375-dark.png` |
| Fretboard material | `chord-perfect--1280-dark.png` | `fretboard-chord-perfect--1280-dark.png` |

## 7. Proposed changes to established rules (decisions for the owner)

1. **Instrument hue in the canvas wash.** The round-4 rule tinted the whole music canvas with `--instr`. Changed to the practice accent because the owner read the ukulele wash as "recolouring the entire view". Benefit: the neck is the only thing that says ukulele, which is what a player expects. Cost: the page loses one cue of the active instrument; the badge, rail and capsule still carry it. Applied in the tree; easy to revert in one token.
2. **Dark `--primary` with dark ink.** The Neon Arcade primary was tuned for white text at the AA floor and failed as text on cards. Now `oklch(0.68 0.19 290)` with dark ink, like the practice accent. Benefit: every `text-primary` link and value passes; cost: primary buttons in dark mode read as violet with dark text rather than white text, closer to the stage's accent. Applied, with the contrast test extended.
3. **Progress track colour** in the shared kit moved from `bg-primary/20` to `bg-muted`. This touches the site kit, not only Music. Applied; trivially reversible.
4. **XP as the Progress hero.** Not changed; proposal 3C moves it. This is the open R31 decision.
