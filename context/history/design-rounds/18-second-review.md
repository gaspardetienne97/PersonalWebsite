# 18 · Second review: audit of the external review

5 September 2026. Source under review: `6c12c511` (working tree clean). Reviewed documents: [16-external-review.md](16-external-review.md) and [17-review-backlog.md](17-review-backlog.md). No application code was changed and nothing was committed.

## Evidence key

- **Reproduced**: observed in Chromium (Playwright) against the dev server at `localhost:5199` running `6c12c511`.
- **Source**: confirmed by reading the code at `6c12c511`, with file and line.
- **Inference**: a conclusion from source plus observation, not directly exercised.
- **Judgment**: design opinion.
- **Untested**: hypothesis awaiting a test or hardware.

Environment notes. The reviewer's production preview was built at 22:44 EDT on 4 September (`.svelte-kit/output/client/_app/version.json` = 1788576240545), which is the state of `b6cc14a9`; it differs from `6c12c511` only by two e2e spec files. So "old build" is not a material caveat for any finding here. The dev-server crash the reviewer hit is real and reproducible: a client-side navigation from Guide to Practice on the dev server throws `Cannot read properties of undefined (reading 'call')` (stack through `svelte/src/internal/client/dev/hmr.js` and `card-description.svelte`) and leaves the previous page on screen. It also appeared during the round-5 survey and once in a Vitest run after a Vite dependency re-optimisation. It is a dev-mode (Vite 8 beta plus vite-plugin-svelte HMR) issue; the built app passes the route-apps e2e that performs the same navigation.

## A. Verdict

The review is trustworthy on facts and weak on two things: effort estimates and a few root causes. Of thirty tickets, 25 are confirmed as described, four need revision of evidence or scope, one should be dropped, and none is a false positive. Research citations are accurately characterised (Carter and Grahn, Melodics, Simply Piano, Sonofield, Roland all say what the review says they say). Its biggest gap is that XP is awarded for wrong answers, which it neither noted nor decided on; whether that is a defect or intended participation credit is an owner decision (R31). It also discussed sparse coach evidence in prose (R10, sections 4 and 7) without the code trace that shows weak spots can be picked from a single attempt (R32). Its most valuable catch is R04: the hub tabs on Library and Create do not switch content when clicked. That is a real regression from round 5 (`d891621d`), reproduced on the current build, with a one-line root cause.

## B. Disposition table

| ID | Disposition | Evidence | Why |
|---|---|---|---|
| R01 | Keep | Source: `TodayPlan.svelte:124` links `/music/progress?tab=journal`; Progress reads no `tab`. | Correct, S. |
| R02 | Revise | Source: `piano-fingering.ts:12-14`; the clamp is pinned by `piano-fingering.test.ts:7-16`. Callers are Two-Hand (`two-hand/+page.svelte:128-131`) and sight-reading (`SightReadingSession.svelte:94-98`), not Scales. | Correct finding; fix the caller list and drop the Scales mention in §3. Smallest fix: omit numbers when no authored map exists. |
| R03 | Keep | Reproduced (screenshot `06-rhythm-result.png`); Source: `rhythm/+page.svelte:462-481`, no condition on `runSummary.accuracy`. | Correct, S: swap the primary variant on accuracy. |
| R04 | Keep, revise | Reproduced on `6c12c511`: Library Reference and Import, Create Recorder and Piano roll change the URL and leave the old panel; Tuner works. Source root cause below. | Effort is S, not M. Root cause is known. |
| R05 | Keep | Reproduced: three answers advanced the set counter with no feedback text and no live-region change. Source: engine builds "Expected X." (`note-reading.ts:226-231`) and stores `answer`, the route never renders either; `ReadingSummary.svelte:31-48` shows targets only. | Correct. Effort S for showing the stored answer, M for retry-mistakes. |
| R06 | Keep | Source: `FretboardInput.svelte:276-310`, buttons inside `sr-only`; no focus state feeds `fretState()`. | Correct, M. |
| R07 | Keep, split | a. Source: `input-router/index.ts:94-99` velocity 1; `mpc-single-stroke.ts:364-370` constant → 1.0; `mpc/+page.svelte:399` shows it and `:268` weights it 0.15. b. Source: `chord-perfect/+page.svelte:1325,1348` "rang clean"; per-string metrics exist (`chord-perfect.ts:397-402`) and are never rendered. c. Source: lenient is documented deliberate (`voicing-drill.ts:43-46`); `extraPitchClasses` computed at `:184`, unused. d. Source: `EarTrainingDrillRoute.svelte:766-770` binary MIDI/On-screen ternary; the same ternary is copy-pasted in about ten routes. | All four sub-claims hold. Split into four S tickets; d becomes one shared helper. |
| R08 | Keep | Source: `ear-training/index.ts:445-461` swaps the prompt and sets feedback in one notify; view renders feedback after the answer block (`EarTrainingSessionView.svelte:297-301`); choice copy "or play it on your instrument" at `:172-173` while cadences accept `click` only (`cadence-recognition.ts:84`). | Correct. |
| R09 | Keep, revise | Source: `jazz/index.ts` steps 4, 6, 7, 8 all `harmony.ii-v-i` (`:1254,1275,1287,1299`); writers: `voicing-drill.ts:65`, `licks/+page.svelte:57`, `chord-scales/+page.svelte:56`. `ScoringEvent` has `modality` but no assistance or source field (`domain/scoring.ts:63-89`). | Mechanism confirmed. The 92% observation has no screenshot (`hub-learn-jazz.png` is the reference page, not the path). Child skill ids are an M-sized first step (the prerequisite relation at `skills/index.ts:612`; component relations are built separately above it); provenance, assistance and the printed modality and session criteria stay scoped to R33 and a later step, not solved by ids. |
| R10 | Revise | Source: `buildDailyRoutinePlan(recommendations)` has no instrument or budget (`daily-routine/index.ts:124-126`); "~5 min" is literal markup (`TodayPlan.svelte:200`); coach passes no instrument (`coach/index.ts:47`). | Correct; keep scope to an options bag and a `minutes` field. Absorb R12. |
| R11 | Keep | Source: `EarTrainingSummary.svelte:65-70` prints raw tokens; label maps exist unexported (`interval-recognition.ts:33-44`, `chord-quality-recognition.ts:27-84`, `scale-degree-recognition.ts:69-80`); bare pitch classes from `melody-dictation.ts:159-166`. | Correct, S. |
| R12 | Merge into R10 | Source: `track/+page.svelte:40-45` static list; a third copy exists at `dashboard/index.ts:123-138` (`todaysRoutine`). | Three copies, not two. One projection should feed all. |
| R13 | Keep, reword | Reproduced: direct visit to `/music/play/mpc` shows "Practice instrument: Piano (pinned)". Source: hydration writes `activeInstrument` unconditionally in `attachStorage` (`_runtime.svelte.ts:267-281`), never through `#reconcileInstrument` (`:767-775`). There is no `initializeSettings`. | Symptom is real. The ordering diagnosis is untested; the fix (reconcile inside `attachStorage`) is right either way. The reviewer's "Guitar (pinned)" on Two-Hand (which pins piano, `two-hand/+page.svelte:216`) is consistent with the same hazard, since guitar was the saved instrument in that context; not independently reproduced. |
| R14 | Keep | Source: `learning-path/index.ts:118-124,111,112-114`. `improv` and `repertoire` have no `kind`, so they stay `next` forever. | Correct, S. |
| R15 | Keep | Source: `EarTrainingSessionView.svelte:263-279` shows `answerLabel` with the self-mark buttons. | Correct. Keep an unscored passive option, as Sonofield's Pocket mode is deliberately passive. |
| R16 | Keep | Source: `FlashcardSession.svelte:37-41,71-72,79`; `notes={prompt.midiNotes}` also narrows the keyboard to the answer. No hint flag anywhere. | Correct, and stronger than stated: the keyboard itself gives the answer. |
| R17 | Revise | Source: union range 35..72 → 828 px (`piano-geometry.ts:94-95,166-167`); a Left/Right hand mode already exists in setup (`two-hand/+page.svelte:506`, `two-hand-independence.ts:70-77`). | Width confirmed; "no workable layout" overstated. Smallest fix: recommend hand mode below `sm` and add a view window using existing `lowMidi`/`highMidi` props. |
| R18 | Keep | Judgment; `gradeLickSequence` scores note order only. Duke, Simmons and Cash (2009) support error-targeted repetition of short segments. | Reasonable. Reuse `technique-ladder` for tempo. |
| R19 | Keep | Source: `skills/index.ts:69-71` no decay on read; `pipeline.ts:113` decay on ingest; `repertoire.ts:194` decay on ranking. | Correct, M. |
| R20 | Keep | Source: `sessions/index.ts:243-259` tags plus timestamp only; `scales:458` tags `["scales"]`; empty copy `LastRunDelta.svelte:50`. | Correct. Fix by adding the existing `variantKey` as a tag and showing which dimensions it covers; keep the before-visit baseline; never fabricate metadata for old runs. |
| R21 | Revise | Judgment. | Cut to one optional "Next time" line on the session; no goal form yet. |
| R22 | Keep | Judgment; guitar is priority 1; reuses `fretboard-note-finder.ts` and `FretboardInput`. | Distinct gap. |
| R23 | Keep | Judgment; piano priority 2; Voicings variant. | Distinct gap; depends on R09 loosely. |
| R24 | Keep | Judgment; MPC priority 3; accent grading needs hardware velocity. | Distinct gap. |
| R25 | Revise, split | Source: export is sessions only (`settings/+page.svelte:56-72`); ten Dexie tables (`store/index.ts:78-107`); binaries live outside them (`putBinary`, `store/index.ts:217`, and the media library). | Data-only export and restore of the ten tables is M via `DexieRepository.all()` and `bulkPut`. A full backup (binaries, OPFS media, schema validation, partial-failure recovery) stays L. Only the second may be called a full backup. |
| R26 | Keep | Source: breath CC 2 literal at `aerophone/+page.svelte:492,508,527,544`; `AEROPHONE_PROFILE.breathController` exists (`midi/index.ts:95-102`) and is unread; `pitchCents` quantised (`aerophone-traces.ts:12-17`); `pitchBend` normalised (`midi/index.ts:179-182`) and never consumed. Waiting graphic: needle dimmed but centred, label "0 cents (in-tune)" (`CentsMeter.svelte:31,38-42`). | Correct; the graphic claim is partly right. |
| R27 | Drop for now | Judgment alone; depends on hardware; secondary instrument. | Fold into R26 as a follow-up after calibration on the owner's AE. |
| R28 | Keep | Source: `MpcPadGrid.svelte:103-115` `size-5` overlay; grid rendered only in the playing stage (`PadRudimentStage.svelte:58`). | Correct, S, low impact. |
| R29 | Revise | Source: `Header.svelte:19-39` `overflow-x-auto` strip, no breakpoint. Also visible in `docs/screenshots/ui-pass/after/24-hubs/settings--375-dark.png`. | Links scroll, they are not clipped. Still worth collapsing below `sm`. |
| R30 | Keep | Source: `notationDuration` (`notation/index.ts:186-203`) throws; route surfaces the raw message (`songs/[id]/+page.svelte:690-699,937`); Waterfall independent (`:880-882`). | Correct. Small change: explain the staff limit and link Waterfall beside the error. A nearest-duration snap is not safe as a quick fix: it would distort rhythm and measure totals; quantisation stays optional, bounded and preview-only. |

**R04 root cause (Source).** `writeRouteTab` calls SvelteKit's `replaceState`. In `@sveltejs/kit` 2.61.1 that function stores the old `page.url.href` under `PAGE_URL_KEY`, calls `history.replaceState`, sets `page.state`, and re-emits the page store without changing `page.url` (`src/runtime/client/client.js`, `export function replaceState`). Library and Create each have an `$effect` that reads `$page.url` and writes the tab back; the store emission re-runs it with the stale URL and resets the tab to the previous value. Tuner has no such effect and works. The Library unit test passed because `$page.url` is undefined under Vitest and the effect is guarded. Fix: read `window.location.search` inside the effect (keep `$page` as the dependency so back/forward still fire), or use `afterNavigate` plus a popstate listener. Acceptance: a Playwright test that clicks each tab and asserts both the URL and the visible panel, then Back and reload.

## C. Ten changes that matter most, re-ranked

1. **Fix the hub tabs (R04).** Reproduced on the current build; two hubs' second and third tabs are unreachable by click. One-line fix, plus the missing Playwright click test.
2. **Decide what XP means (new, R31).** `progress/index.ts:44-46`: `10 + partialCredit*30 + difficulty*20 + improvement*25`. A wrong Reading answer earns about 18 XP (base plus difficulty); the reviewer's 27% routine earned 597 XP. XP is the app's headline progress number and today it measures participation. This is an owner decision, not a quick fix: either scale the whole award by correctness so XP tracks demonstrated work, or keep it and rename the number "practice points" so it stops reading as progress.
3. **Make mastery evidence specific (R09 + R14 + modality).** Child skill ids for chord-scales, rootless, altered and licks; filter Ear Path steps by `ScoringEvent.modality`; exclude skill-less steps from the denominator.
4. **Give Reading a correction and a retry (R05 + R16).** Render the engine's existing "Expected X." feedback and the stored answer, hold the staff until Continue, add retry-mistakes for flashcards, and stop lighting the target before the answer in play-back.
5. **Label what the input can measure (R07 a to d).** "Not measured" for pointer velocity, "target notes matched" for on-screen chord builds, "Notes collected" for lenient voicings, and one source-badge helper used by every route.
6. **Fix the coach's sample size and instrument (R32, extending R10).** `weakestSkills` has no minimum attempts and no instrument filter (`analytics/index.ts:60-71`, `dashboard/index.ts:144-193`); a single missed piano rep becomes the guitar user's focus. The review raised sparse evidence in prose; the code trace is new. "0% across 1 attempt" is accurate, the framing as a diagnosis is the problem. Require a minimum sample (five attempts is a tunable heuristic) and filter by the active instrument.
7. **One routine, instrument and time aware (R10 absorbing R12).** Options bag `{ instrument, budgetMinutes }`, a `minutes` field, and one projection feeding TodayPlan, the journal card and the dashboard's `todaysRoutine`.
8. **Correct the ear flow (R08 + R15 + R11).** Feedback above the answer block until Continue, reveal-then-rate in listen mode, and musical names in confusion summaries.
9. **Recommend tempo from performance and reuse the ladder (R03 + R18).** Primary button follows accuracy; `technique-ladder` (used only by Scales today) drives Spider, Licks, Two-Hand and MPC next-tempo suggestions.
10. **Visible fretboard focus (R06).** Enter input works (the reviewer completed a Spider run with it); the focus location is invisible, which is the defect.

Fingering (R02) drops just below the ten only because the smallest fix is to remove misleading numbers, which belongs in the quick-corrections slice anyway.

## D. What the first review missed

- **XP for wrong answers (R31, Source + Reproduced, decision needed).** See C2. Also inflates "Session XP" during a run, as seen in the Reading probe (+18 per click). Observed behaviour, not yet a confirmed defect: the reviewer's R07 deliberately preserved practice XP.
- **No minimum sample size in weak-spot selection, no instrument filter (R32, Source; extends R10 and report sections 4 and 7).** `weakestSkills(8)` sorts every tracked skill by accuracy. The coach's insight prints "0% accuracy across 1 attempt" without hedging (`coach/index.ts:69-74`).
- **Three hardcoded routine copies (R12 extended, Source).** `daily-routine` DEFAULT_STEPS, `track/+page.svelte:40-45`, `dashboard/index.ts:123-138`.
- **Tempo progression exists only in Scales (R34, Source).** `engines/projection/technique-ladder.ts` has one consumer. Every other timed drill ends with a static Again.
- **Practice versus assessment is not represented in the data (R33, Source).** `ScoringEvent` carries `modality` but no `assistance` or `source`. Every honesty fix in R07, R09, R16 needs the same two fields; add them once, then a short unaided "check" run that reuses each drill's test mode is the transfer measure the app lacks. Dunlosky et al. (2013) rate practice testing as high utility; this is the app's version of it.
- **Guitar chord changes as a benchmark (R35, Untested).** Chord-Perfect has a `changes` mode with a one-minute-changes format (`chord-perfect.ts:45,57`). The review did not run it. Justin Guitar's One-Minute Changes is the standard transfer metric for chord transitions: changes per minute per chord pair, tracked over weeks. Verify what the mode records and make that count the headline number with a per-pair history.
- **Process gap (Judgment).** The round-5 proposal listed "keyboard walk on Library tabs, Tuner modes and Settings rows" as a gate. It was not done; the tab regression shipped. Hub tabs need a Playwright click test because unit tests run without `$page.url`.
- **Dev-server navigation crash (R36, Reproduced).** Guide to Practice on `vp dev` throws in HMR code and strands the page. Dev-only, but it blocks browser-based review on the dev server; worth a pinned reproduction and an upstream issue against vite-plugin-svelte on Vite 8 beta.

No further new drills. R22, R23 and R24 cover the three focus instruments; R35 is an extension of an existing mode.

## E. Implementation sequence

**Decision first.** R31 XP semantics (owner decides; see C2).

**Slice A, quick corrections (all S, one commit each, no engine model changes).** R04 fix with the Playwright tab test · R01 href · R03 primary button · R11 labels · R14 denominator and `next` guard · R12 one routine projection · R07a "Not measured" · R07d source helper · R28 `editable` prop · R13 reconcile in `attachStorage` with a runtime test · R02 omit numbers without an authored map. Acceptance: each has a unit or Playwright assertion; Playwright stays 59 plus the new tab test.

**Slice B, honest measurement (M).** R33 fields on `ScoringEvent` (`assistance`, `source`) written by every route · R16 no pre-answer highlight, hint recorded · R07b per-string detail and wording · R07c lenient label with extras · R09 child skills and modality filter (first step; provenance and printed criteria follow R33) · R19 decayed read projection · R20 variant tags with their dimensions shown · R32 minimum attempts and instrument filter. Depends on A. Acceptance: a clean major-only voicing run (re-run, since no screenshot of the 92% state exists) cannot complete Altered; a hinted Reading answer shows as hinted in the journal; a stale strong skill rises in review priority without history changing.

**Slice C, the learning loop (M).** R05 correction and retry-mistakes · R08 feedback placement and copy · R15 reveal-then-rate · R18 chunking with `technique-ladder` · R34 ladder reuse in Spider, Two-Hand, MPC · R10 instrument and budget · R17 hand recommendation and view window · R06 focus mirror. Acceptance: wrong Reading choice keeps the staff with expected and chosen note until Continue; retry runs only missed prompts; 375 px Two-Hand shows all required targets in the chosen hand.

**Later.** R22, R23, R24 new drills (each after its slice B dependency) · R35 changes-per-minute history · R25 data-only export and restore (M), then full backup with binaries (L) · R21 one-line reflection · R30 staff fallback beside the error, quantisation only as a bounded preview · R26 Aerophone calibration after a hardware session · R29 header collapse · R27 only after R26 on the owner's instrument.

## F. Corrections to the two review documents

Apply to `16-external-review.md`:

- §1, sentence 2. Replace "failed when navigating to Practice: an uncaught Svelte DOM error … The development failure is an environment limitation, not a confirmed production defect." with: "On the dev server, a client-side navigation from Guide to Practice throws `Cannot read properties of undefined (reading 'call')` inside Svelte's HMR code and leaves the previous page on screen. This reproduces on `6c12c511` and is a dev-mode issue (Vite 8 beta with vite-plugin-svelte); the built app passes the e2e that performs the same navigation. The production preview used was built from `b6cc14a9` at 22:44 on 4 September and differs from `6c12c511` only by two e2e spec files."
- §2 item 2 (R04). Append: "Root cause: SvelteKit's `replaceState` re-emits the page store without updating `page.url`; the `$effect` on `$page.url` in Library and Create then writes the stale tab back. Tuner has no such effect. Effort S."
- §2 item 4 and §3 Scales. Remove "Alfred's scale method supports…" as support for Scales; Scales does not call `suggestedFingerings`. The callers are Two-Hand and the sight-reading stage.
- §3 Aerophone. Replace "exposes an 'in-tune' zero-cent graphic without an observed pitch" with "parks a dimmed needle at zero and labels it '0 cents (in-tune)' before any pitch is observed".
- §6. Replace "Site navigation visibly clips 'Home' and 'Narrator' even though document overflow is suppressed" with "The site navigation becomes a horizontal scroll strip at 375 px; 'Home' and 'Narrator' are off-screen but reachable by scrolling the strip."
- §7. Add: "Stambaugh (2011), with 41 beginning clarinetists, found no acquisition differences between blocked and random schedules; Dunlosky et al. (2013) rate interleaving as moderate utility and practice testing and spacing as high. Duke, Simmons and Cash (2009) found that pianists who located and fixed errors, and varied tempo on problem segments, retained more regardless of practice time." Cite: https://journals.sagepub.com/doi/10.1177/0022429410385945, https://journals.sagepub.com/doi/abs/10.1177/1529100612453266, https://journals.sagepub.com/doi/10.1177/0022429408328851.
- §9. "explicitly supports AE-20/AE-30" → "lists Aerophone Pro (AE-30) and AE-20; AE-10 is not listed".

Apply to `17-review-backlog.md`:

- R04 Effort: M → S. Evidence: add the root cause above and "Reproduced on `6c12c511` dev build, 5 September".
- R05 Evidence: add "The engine already produces 'Expected X.' feedback (`note-reading.ts:226-231`) and stores `result.answer`; the route renders neither." Effort: M → S for the summary and correction, M for retry-mistakes.
- R09 Evidence: add "No screenshot of the Jazz Path at 92% exists in the capture set; the mechanism is source-confirmed." Effort: L → M.
- R12: mark "Merged into R10" and add the third copy `dashboard/index.ts:123-138`.
- R13 Area/Evidence: replace `initializeSettings` with `attachStorage` (`_runtime.svelte.ts:267-281`); add "Reproduced: direct visit to `/music/play/mpc` shows 'Practice instrument: Piano (pinned)'"; mark the ordering diagnosis as a hypothesis.
- R17 Evidence: add "A Left/Right hand mode already exists in setup (`two-hand/+page.svelte:506`); it changes grading as well as display." Proposal: recommend it below `sm` and add a view window; drop "two stacked bounded hand regions".
- R26 Evidence: qualify the graphic claim as above.
- R27: keep the four-value Type; express deferral in Proposal and "Depends on: R26 plus a physical session on the owner's AE".
- R29 Evidence: replace "clip" with "scroll strip"; Impact stays low.
- R30 Evidence: the function is `notationDuration` (`notation/index.ts:186`). Proposal: keep the contextual fallback (explain the limit, link Waterfall beside the error) as the small change; quantisation stays optional, bounded and canonical-timing preserving. No global snap.
- R25 Proposal: split into data-only export and restore (M) and full backup with binaries and media (L); only the latter is a "whole collection".
- R09 Effort: L → M for the child-skill step only; keep provenance, assistance and printed criteria as scoped follow-ups.
- Add R31 (XP semantics, decision needed), R32 (coach sample floor and instrument filter, extending R10), R33 (assistance and source fields on `ScoringEvent`), R34 (tempo ladder reuse), R35 (one-minute changes as the chord-change metric, needs verification), R36 (dev-server navigation crash, environment).

## G. Remaining uncertainties and the smallest tests

- **R13 ordering.** Add a runtime test that attaches storage with a saved `guitar` while a context pinning `mpc` registers first, and assert the reconciled instrument. Ten minutes.
- **Two-Hand "Guitar (pinned)".** Not independently reproduced; consistent with R13 (guitar saved, piano pinned). Re-check after the R13 fix with a saved non-piano instrument.
- **Physical MIDI.** Plug in the piano and the MPC once: (1) Two-Hand with both hands, confirm simultaneous notes are attributed to the right hand labels; (2) MPC Rudiments, confirm velocity varies and the tile moves; (3) Reading play-back over MIDI, confirm no highlight leak once R16 lands. Fifteen minutes.
- **Aerophone.** One capture of breath CC, note on/off and pitch bend from the owner's AE, then decide whether R26 needs a bend range setting. Ten minutes with the Connect diagnostic.
- **XP intent.** Confirm with the owner that XP should reflect correct work, not attempts; if attempts were meant to count, keep the base but label the number "practice points".
- **R35.** Run Chord-Perfect changes mode once to see what it records; if it already counts changes per minute, the ticket is only a history view.
- **Dev crash.** Reproduce on a clean `vp dev` with no HMR (fresh start, one navigation) to separate an HMR bug from a dev SSR mismatch before filing upstream.

## Peer discussion (5 September, session bridge)

The external reviewer's session (Codex, bridge peer `bmypok`) read this document and replied. Accepted from that reply and folded in above: R13 function name (`attachStorage`), R29 as a scroll strip, Scales removed from the fingering callers, R07 split, R12 merged, R27 deferred via Proposal and Depends on. Disagreements it raised and I accepted: R31 is a decision about XP semantics rather than an automatic bug fix (gating only the base still pays the difficulty term); R32 extends R10 and the report's prose rather than being wholly missed; R09 child ids are a first step, not the whole ticket; R25 splits into data-only (M) and full backup with binaries (L); R30's nearest-duration snap is withdrawn in favour of the contextual fallback; R20 must show the matched dimensions; R06 describes invisible focus with working Enter input. It confirmed there is no Jazz Path screenshot (the 92% figure is its live observation; the mechanism is source-confirmed) and that "Guitar (pinned)" on Two-Hand came from a context where guitar was the saved instrument, which matches R13. Neither session is implementing anything; the backlog remains a proposal.
