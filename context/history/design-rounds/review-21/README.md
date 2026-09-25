# Review 21: Practice OS design, usability and curriculum review

17 September 2026. Reviewed the dirty working tree of `feat/practice-ui-pass` (HEAD `6c12c511` plus ten uncommitted implementation batches) in the Orca worktree, in Chromium through the Playwright MCP against the worktree's dev server, with a disposable browser profile. No hardware: no MIDI device, microphone or audio output existed in the session. Nothing was committed, pushed or restored into the owner's collection. Mid-review the owner allowed changes, so the confirmed defects with small fixes and the piano, fretboard and MPC surfaces were changed in the tree; every change is listed below with its test.

## Files in this package

- `findings.md`: every O01 to O25 disposition with file and line evidence, the browser reproductions, ten additional issues, what the browser could not establish, and the five-minute MPC recipe.
- `design.md`: the direction, two layout directions with a recommendation, state behaviour (Demo / Practice / Check, live polyphony, viewport and range, loading/empty/error), the three prototypes, the first-pass critique and revision, before/after screenshots, and four rule changes for the owner to accept or revert.
- `prototypes/`: `01-practice-workspace.html`, `02-recorder-kit.html`, `03-progress-alternatives.html`, `tokens.css`. Open from disk; the theme button switches light and dark; simulated data.
- `screenshots/`: `current/` (the app before changes, plus `repro-*` captures), `after/` (the app after changes), `prototypes/` (first pass and `rev-*` revision at 1280, 375 and 320).
- `curriculum.md`: inventory of existing content, gaps, three progressions, a prioritised catalog, and nine fully specified original exercises with bar totals and feasibility checks.
- `research.md`: comparison matrix across seven products (documentation-only), and eleven claim-level learning sources with their limits.
- `implementation-plan.md`: ordered tickets tied to owner IDs, gate status, physical checks, what to reuse and what not to build, and the first slice.

## Executive review

The app's engines are honest and well tested, and the last ten batches made scoring, assistance and backups trustworthy. What failed the owner at the instrument was the last centimetre: the on-screen pads kept one "last hit" and never released it, MIDI pads never lit at all, the exercise assumed Akai's pad numbering, a mouse-focused white key jumped over the black keys, the dark theme's violet failed as text and hid the engraved score, the recorder gave no level and no way to hear a take from its card, and long scores pushed the transport off screen. Most of these were small, shared-component defects rather than design problems, and they were fixable in a day. The design work that remains is about the practice loop itself: a demonstration before practice, hints that are recorded, a check that hides everything, one keyboard look across views, honest range selection, and a Progress page that answers "what now".

## Ten highest-impact changes (state at hand-off)

1. **Pad map per device with a learn flow** (O19, O20, O21). Done in tree: presets (Chromatic 36, Akai Classic, Chromatic 37), Learn pads on Connect, one rewrite at the runtime's MIDI boundary, `ignored` finally persisted, channel display fixed. Needs the owner's five-minute recipe on the MPC.
2. **Held-pad and held-key state that releases** (O04, O07, O02). Done: holders map with key-up, blur, pointer cancel, note-off and MIDI lighting on the pads; router-held highlight, middle-C mark and blur release on the piano; inset focus so white keys never cover black keys.
3. **Contrast that passes in real states** (O11). Done: dark primary with dark ink, progress track on `bg-muted`, OSMD glyphs in `currentColor`, contrast test extended (`primary` on `card` and `background`).
4. **Score viewport with reachable transport** (O12) and a **single cursor line** (O14). Done, with an explicit "Tab unavailable" branch (O13).
5. **Preview scheduler with a one-second look-ahead** and a truthful Playing flag (O10). Done as robustness; the cut-out itself is not reproduced (no audio device). Owner check: Warm Synth versus Sampled Piano.
6. **Demo / Practice / Check stage modes with a "together" metric** (O06, O09). Prototyped; tickets P1-06, P0-05, P1-04.
7. **Record as its own destination, take cards with a picture and a Play button** (O16, O22, O23, O24). Play on cards done; the rest prototyped (meter, nondestructive gain, mini roll, waveform, rename).
8. **Range selection as Start and End handles, bar-snapped** (O15). Prototyped; ticket P1-11.
9. **Low-string tuner robustness** (O25). Harness-tested proposal: clarity 0.85, 40 Hz high-pass, 4096-sample second pass, stale timeout; real recordings listed.
10. **Curriculum**: three progressions and nine specified exercises, with the engine extensions each needs (subdivision and click anchor for rudiments, multi-bar grooves with accents, chord changes on a clock, strum patterns with mutes, inversions, contrary motion, licks with positions).

## What to retain

The token discipline and the contrast test; `PracticeDrillShell`'s three phases; `PianoSurface` as the only keyboard; the `assistance` and `source` provenance fields; the backup formats and their guards; the range model already being start/end beats; `rhythm-pattern`, `score-follower` and `technique-ladder` as the timing and tempo engines every new exercise can reuse; the seven-hub shell.

## Code changes made in this session (uncommitted, in the worktree)

| Area | Files | Test |
|---|---|---|
| Piano surface | `_components/piano/PianoSurface.svelte`, `piano-input.ts`, `PianoSurface.svelte.test.ts` (middle C asserted as an `aria-description`) | 23 + 21 pass |
| MPC pads | `_components/MpcPadGrid.svelte` (rewritten), `PadRudimentStage.svelte`, `play/mpc/+page.svelte` (target pad, voice labels) | 3 pass; acceptance additions in P0-02 |
| MPC controller link (18 Sep) | `_runtime.svelte.ts` (init + heartbeat kept alive app-wide from `DeviceProfile.controllerLink`), `connect/_components/MpcHardwareDiagnostic.svelte` (Keep linked / Unlink), `connect/+page.svelte`, `MidiStatus.svelte` | runtime + diagnostic + profile tests pass |
| MIDI status and device selection (18 Sep) | `_components/MidiStatus.svelte` (new, replaces six per-drill Enable MIDI blocks), `connect/+page.svelte` (Remove × per device, Rescan restores), `_runtime.svelte.ts` (`applyDeviceProfile`, `lastMidi` trace, `midiListening`), `engines/device-profiles/index.ts` (+3 tests) | runtime, Connect and drill suites pass; check clean |
| Pad map and Connect | `engines/device-profiles/index.ts` (+ tests), `_runtime.svelte.ts` (pad rewrite; 18 Sep: MIDI re-enabled on fresh load when previously enabled and granted), `connect/+page.svelte` | 12 + 2 pass; runtime and Connect suites 72 pass |
| Navigation | `_components/MusicNavigation.svelte` | 4 pass |
| Tokens and kit | `src/app.css` (ambient, dark primary, `fretboard-wood`), `packages/ui/src/progress/progress.svelte`, `src/app-tokens.contrast.test.ts` | pass both themes |
| Sound | `engines/sound/index.ts` (+ look-ahead test) | 35 pass |
| Library and songs | `library/_components/SongsView.svelte` (+ test mock returns an epoch), `songs/[id]/+page.svelte` (actions above, viewport, Tab branch) | 57 pass across library, songs, notation |
| Notation | `_components/StaffNotation.svelte` (single cursor line), `MusicXmlScore.svelte` (`currentColor` ink, accent cursor) | pass |
| Fretboard | `learn/reading/_components/FretboardInput.svelte` (wood, string gauge, inlays) | pass |
| Takes and kit | `_components/AudioTakePanel.svelte`, `MidiTakeReviewPanel.svelte`, `studio/_components/SampleKitPanel.svelte` | pass |
| Page tests | `play/licks/page.svelte.test.ts`, `play/chord-scales/page.svelte.test.ts`: harness dispatches to every router subscriber (the piano surface now listens too) | see gate status |

Gate status at hand-off: type check clean; full unit suite 1,834 of 1,846 on the first run with the 12 failures traced to two page-test harnesses that captured only the last router subscriber, both fixed and re-run green (32 of 32); `vp check` still reports three pre-existing `graft/.cache` formatting notices that are not part of this work. Playwright was not run; the specs likely affected are named in `implementation-plan.md`.

## Capability and evidence limits

- No audio device: O10 and O22 are not reproduced; the fixes for them are robustness and design, and the owner's confirming observations are written down.
- No MIDI device: the pad-map mechanism matches the owner's "pad 6" report exactly and Akai's documented Classic map, but only the recipe on the real MPC closes O19 to O21.
- Pitch (O25): synthetic fixtures only; the report lists the eight recordings to take.
- Product research is documentation-only (help centres, manuals, release notes); no competitor demo was operated.
- The dev server had the known HMR navigation crash risk; every capture used a full page load.

## Recommendation

**First slice.** On top of this tree: run the gates and Playwright, then P0-01 hardware validation with the recipe, P0-02 tests, P0-05 (wrong-note lifetime), P1-04 (sight-reading hint gate), P1-06 (Demo mode and the together metric). Two to three days. It fixes what the owner hit at the instrument and gives every drill the model → practise → check loop.

**Visual direction.** The bench (design.md §1 and §2): the instrument surfaces as material carry the identity, chrome stays the site's; the collapsible rail is the layout; the dark primary and the neutral canvas wash are the two token decisions to confirm.

**Strongest content additions.** Guitar strum patterns with mutes and chord changes on a clock; MPC rudiments at sixteenths on the click and two- to four-bar grooves with accents; piano inversions with voice leading and a contrary-motion hands-together pattern. The nine exercises in curriculum.md are ready to author once the small engine extensions land.

**Evidence still missing.** The MPC's actual pad notes (recipe), the preview cut-out on Sampled Piano versus a synth, one quiet microphone take with the meter, the eight low-string recordings against the owner's trusted tuner, and the owner's decisions on XP semantics, Record as a destination, and the dark primary.
