# Practice OS UI pass: proposal

Date: 2026-09-04. Inputs: [ux-research.md](ux-research.md), [audit.md](audit.md). Mockups: the "Practice OS Drill Shell" design canvas at https://claude.ai/code/artifact/3824a2b8-b5c1-49d5-ad7c-788a4865da42 (artboards Ready, Playing, Results, Phone Ready, Phone Playing, plus one low-fi alternate layout).

One sentence: make every drill a three-state screen (Ready, Playing, Results) built from one shell that shows the instrument first and the settings second, on the tokens the app already has.

## 1. Design system to apply

Chrome stays on the site theme; nothing below adds a font or a colour outside `src/app.css`.

**Type scale** (system-ui stack, unchanged). Five steps only: `text-2xl/semibold` route title on drill pages (down from 3xl), `text-xl/semibold` stage heading (the thing to play now), `text-base` body, `text-sm` controls and labels, `eyebrow` for section labels. The one exception is the Results number at `text-6xl` tabular. No `text-[10px]`, `text-[11px]` or `text-7xl` in route code.

**Spacing rhythm.** 4 px base, three gaps in practice screens: 8 (inside a control group), 16 (between groups inside a surface), 24 (between surfaces). `PracticeScreen` keeps `gap-6 py-6`; drill pages drop the subtitle line so content starts 40 px higher.

**Surface hierarchy.** Three levels, no more: page (`background`), card (`card` + `border`), stage (`stage` inset with `stage-line`). Everything that is "the instrument" lives on the stage; stats and actions live on cards or directly on the page; nothing nests a card inside the stage. Stat tiles are one component (`HudTile`) with two sizes; `DrillProgressRail` rows become that component's compact variant.

**Colour roles** (existing tokens, tightened):

| Role | Token | Use |
|---|---|---|
| Play or hear this now | `practice-accent` | target keys, current chord, current beat, staff highlight, Start button on the stage |
| Judgement | `success`, `warn`, `destructive` | correct/late/wrong keys, meters, deltas |
| Hint that never grades | `info` | microphone-heard keys, upcoming notes |
| Chrome action | `primary` | buttons outside the stage, selected tabs (the music scope already tints this the same violet as the accent, so targets are told apart by form: ring plus fill on keys, never a plain fill) |
| Identity | `instr-*`, `skill-*` | drill cards, instrument switcher, never on the stage |
| Hands | new `--hand-left`, `--hand-right` | theme-stable, plus a form marker (outline vs fill, L/R glyph) |

The two hand tokens are the only token change. They land in their own commit with light and dark values and replace `chart-4`/`chart-2` in `PianoSurface`, the waterfall, and the two route legends.

**Motion.** Existing `reveal-up` on phase change only, 200 ms key-state transitions, and one count-in pulse on the beat dots. All under the existing global reduced-motion rule; the Ear orb's continuous `animate-ping` is replaced by a state colour.

## 2. How the drill shell behaves

`PracticeDrillShell` stays presentation-only and route-driven, but it gains the anatomy that ten routes currently hand-roll.

**Ready** (was "setup"). One row: title, mode chips, source pill. Under it a single summary line of the remembered setup ("D Dorian · 100 BPM · one octave · both hands") with an Edit toggle that expands the controls in place; the stage renders in ready state beneath (target visible, keyboard live so you can noodle), and one Start button sits on the stage with the Space hint. Tempo and count-in show as read-only chips on the summary line that open the floating capsule's popovers when clicked, so it is clear where tempo lives.

**Playing** (was "stage"). The shell mounts `DrillFocusScope` itself, so chrome always yields. The stage is full width; the HUD is a strip inside the stage (progress, the one number that matters for this drill, tempo); the reference/rail content moves under the stage on all widths rather than beside it. One keyboard: targets, hands, tone roles, heard notes and held notes all on the input `PianoSurface`; `InstrumentView` is only used when the instrument is not the piano. A "Holding: D4 F4 A4 · Clear" chip appears whenever notes are latched. Stop is the only action beside the heading.

**Results** (was "summary"). `DrillSummaryCard` renders, in this order: the drill's primary number large with the delta against the last run beside it, a per-item strip (per chord, per note group, per hand, per hit), then one action row: Again, Slower (when supported), Change setup, and the next-up card. XP is one muted line. Routes stop rendering their own headers, action rows or XP badges inside the card; Reading and Ear lose their nested frames.

**Copy.** Buttons: Start, Stop, Again, Slower, Change setup, Next up. Source pill: "Input · MIDI · Piano" / "Input · On-screen" / "Input · Aerophone". Status lines are state sentences in sentence case, no template, no em dashes; one live region per route. Mode names are the setup names everywhere (Learn/Assess, Pocket, From memory).

**Mobile.** Same three states; the stage is edge to edge with 8 px page padding; `PianoSurface` gets a `fit` mode that lets keys shrink below the 36 px floor when the surface is not interactive, and shows fade edges plus auto-scroll to the target when it is. `SegmentedControl` wraps.

## 3. Decisions overturned

Short form; audit.md section 5 has the full rationale for each.

| # | Current | New | Status |
|---|---|---|---|
| 1 | Setup card expanded, Start in footer | Collapsed summary line, stage ready, Start on stage | ✅ shell (7c75ab63); applied to Voicings, Reading, Two-hand; other drills in round 2 |
| 2 | h1 + subtitle + source pill; top bar on every route | Compact drill header; top bar hidden on drill routes below `lg` and during runs; streak/XP on Practice home and Progress only | ✅ top bar (9a1fdfcd); compact header on the three drills, others in round 2 |
| 3 | Pointer press-and-hold; latch only via Enter/Space; Voicings latches silently | Auto-latch for multi-note wait groups with a visible Holding chip; re-strike rule kept and explained on the stage | ✅ 2fafcfed |
| 4 | Hands on `chart-4`/`chart-2` | `--hand-left`/`--hand-right` tokens plus form marker and component-owned legend | ✅ 33b04db3 |
| 5 | XP in heading, badge, status, rail | Primary metric + delta lead; XP one muted line | ✅ card slot (7c75ab63); applied to the three drills, others in round 2 |
| 6 | Free-text status and 2 to 5 live regions | One live region, state-to-sentence map, unified labels | ✅ labels unified on every drill (round 2); one route-owned live region per drill (`755ed88e`) |
| 7 | Start routine sets state on Today | Start routine navigates to the first step | ✅ `d03ef4ed` |
| 8 | Focus mode opted in per route | Shell mounts `DrillFocusScope` for the Playing state | ✅ 9a1fdfcd |
| 9 | Chord-Scale, Voicings, Jam show a tone strip plus an input keyboard | One keyboard carrying targets and tone roles | ✅ Voicings (b4d15572), Chord-Scale (40301e56), Chord Progression (7d1b5b5b), Jam (fcb94bc5) |
| 10 | Drill catalogue | No deletions; Chord Progression gains MIDI/on-screen input | ✅ approved 2026-09-04, built in 5c948a25 |

Not overturned: four hubs and URLs, wait-mode ownership and re-strike rules, microphone hint-only gate, native selects for long lists, engines and persisted data.

## 4. Sequenced slices

Each slice is one commit with tests and all gates green, screenshots at 1280 and 375 in both themes, and a CHANGELOG entry. Shared shell first, then three drills, then stop for review.

**Round 1 (this round)**

1. ✅ `33b04db3` **Tokens: hands.** Add `--hand-left`/`--hand-right` (light and dark) to `app.css`, register in `@theme inline`, use them in `PianoSurface` and the waterfall, add the L/R form marker and a component-owned legend. Update `PianoSurface.svelte.test.ts` and `piano-timeline` tests for the new classes. Own commit.
2. ✅ `ab3f078d` **Shell: wrapping controls and overflow.** `SegmentedControl` gains `flex-wrap`; `AerophoneFingering` SVG gets `max-width: 100%; height: auto`; Jam and Chord Progression asides get `min-w-0`. Fixes all six 375 px overflows. Restyle only.
3. ✅ `9a1fdfcd` (behaviour) + `7c75ab63` (restyle) **Shell: three-state drill shell.** `PracticeDrillShell` gains `summary`/`readyStage` slots and owns `DrillFocusScope`; `DrillSummaryCard` gains a `metric` slot with delta placement and standard action labels; `HudTile` gets a compact variant and replaces the rail rows; `PracticeScreenHeader` gets a `compact` variant. `MusicTopBar` hides on drill routes below `lg` and during runs. Behaviour parts (focus ownership, top bar) in one commit, restyle in another.
4. ✅ `2fafcfed` **Behaviour: wait-mode auto-latch and Holding chip** in `PianoSurface` and `piano-input.ts`, with the re-strike explanation. Tests updated deliberately.
5. ✅ `b4d15572` **Drill: Voicings.** Adopt the shell states, one keyboard with targets, summary with per-chord strip and delta. Copy unified.
6. ✅ `006cc33e` **Drill: Sight-reading (Reading).** Note: the pre-start phrase state was kept (it carries preview, waterfall and retiming); its copy was fixed instead of removing the second Start. Remove the nested shell, single Start, mic hint beside the keyboard, hands legend from the component, results with per-group strip. Flashcards follow the same shell.
7. ✅ `da8ddcef` **Drill: Two-hand.** Full-width ready stage (no clipped keyboard), hand tokens, results with the per-hand strip.
8. ✅ `d03ef4ed` (behaviour) + `0b35075f` (restyle) **Home.** Start routine navigates, tab in the URL, compact drill rows on the phone.

Stopped here for review on 2026-09-04 (shared shell plus three drills, per the brief). Slice 8 rolls into round 2.

**Round 2 decisions (2026-09-04):** Chord Progression gains a MIDI/on-screen input path (decision 10, yes); Jam's chart follows the backing transport with a per-chorus tone report (behaviour, own commit); drill order Ear, Scales, Licks, Chord-Scale, then Rhythm, Aerophone, MPC, Spider, Chord Progression, Jam, and slice 8 (Practice home).

**Round 2 progress:**

9. ✅ `0415c52b` **Drill: Ear.** Collapsed setup, Start on the stage, orb and combo removed, results body-only inside the shared card.
10. ✅ `fe5fe2a4` **Drill: Scales.** Three-state shell, live ready keyboard, metric-first results with the next-target line.
11. ✅ `4d6bfb81` **Drill: Licks.** Three-state shell, lick picker on the ready stage, next-note cue during the run, Start / Stop / Again.
12. ✅ `40301e56` **Drill: Chord-Scale.** One keyboard carrying tone roles and the next-note target (decision 9); compact chord strip in the route; Start / Stop / Again; metric-first results with the per-chord strip. `ProgressionChartStage` stays for Chord Progression and Jam until their slices.
13. ✅ `7be70926` **Drill: Rhythm.** Collapsed setup, Start on the ready stage, TimingMeter mid-run, compact tiles, Stop, metric-first results; MIDI and microphone status lines drop their live regions.
14. ✅ `fc5e5ce1` **Drill: Aerophone.** PracticeStage, collapsed per-mode setup, trainer picker on the ready stage, one meter style, chart cells fixed, Start / Stop / Again, metric-first results. Real pitch and breath traces need the technique session to expose them (not in this slice).
15. ✅ `19401a45` **Drill: MPC.** Collapsed setup, pattern picker on the ready stage, visible stage heading, pad grid and sequence lane fit phones, Start / Stop / Again, metric-first results.
16. ✅ `22c224e1` **Drill: Spider.** Collapsed setup, exercise and instrument pickers on the ready stage, visible stage heading, Start / Stop / Again, metric-first results.
17. ✅ `5c948a25` (behaviour) + `7d1b5b5b` (restyle) **Drill: Chord Progression.** MIDI and on-screen keys input path (decision 10); one keyboard with tone roles and targets (decision 9); collapsed setup; Start / Stop / Again; metric-first results with the graded chart.
18. ✅ `6884eda9` (behaviour) + `fcb94bc5` (restyle) **Jam.** Chart follows the backing transport with a per-chorus tone report; one keyboard with tone roles (decision 9 complete); collapsed setup.
19. ✅ `600bf45e` **Fix: chord symbol case** in Chord-Scale and Chord Progression stage labels.
20. ✅ `755ed88e` **Decision 6.** One route-owned live region per drill; four shared components stop announcing.

**Round 3 (opened 2026-09-04 on "go ahead"):** 09f2d629 ProgressionChartStage deleted · f7e5f7da Aerophone sentence · `15c3a981` Chord-Perfect on the shell · `3a266f8b` Library / Progress / Connect / Settings pass. · `2656454a` Aerophone live pitch and breath traces (engine change approved). **Round 3 closed 2026-09-04.** Nothing from the proposal or the audit's drill-depth notes for Aerophone is left open; native selects stay native by the proposal's own call. Native selects stay native with the shared input styling (the proposal's own call, section 6); Aerophone traces landed once engine changes were approved.

**Round 2 closed 2026-09-04.** Every drill in the catalogue is on the three-state shell with unified copy; decisions 1 to 10 are built. Left for a round 3, if wanted: `ProgressionChartStage` deletion (unused), Aerophone pitch and breath traces (needs the technique session to expose curves), native selects to `@repo/ui/select` (audit item 6), the engine feedback sentence with an em dash in Aerophone, Chord-Perfect (not in the round-2 list, still on the old anatomy), and a full-page pass on Library, Progress and Connect.

**Round 2 (after review)**: Scales, Licks, Chord-Scale (one keyboard, transposition), Rhythm (mid-run timing meter), Ear (collapsed setup, Start at top, orb removed), Aerophone (PracticeStage, real pitch/breath traces, chart fixes), MPC and Spider (restyle only), Chord Progression (MIDI input, needs your yes), Jam (transport-driven chart).

## 5. What I need from you (answered 2026-09-04: Stack layout, decisions 2, 5 and 7 approved; decision 10 still open)

- Yes or no on overturned decisions 2, 5 and 7 (chrome, XP placement, Start routine navigation). Everything else is reversible restyling or fixes the brief already asked for.
- Yes or no on giving Chord Progression a MIDI/on-screen input path in round 2.
- Whether the mockups' direction (instrument first, settings collapsed, one keyboard) is the one to build. The canvas has one low-fi alternate ("Rail") beside it for comparison.
