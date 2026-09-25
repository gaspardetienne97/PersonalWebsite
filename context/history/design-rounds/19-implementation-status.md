# Implementation status — 15 September 2026

Ten implementation batches against `18-second-review.md`, on `feat/practice-ui-pass`.
Changes are local and uncommitted. The full review backlog is not complete.

## Implemented and verified

| Tickets | Result |
| --- | --- |
| R01 | Completed routines open the existing journal at `/music/track`. |
| R02 | Piano finger numbers require an authored map; pitch-rank guesses are removed. |
| R03 | Poor Rhythm runs recommend Repeat; strong runs may recommend a tempo increase. |
| R04 | Library/Create tab panels follow shallow URL changes, reload and browser Back. |
| R05 | Wrong Reading answers retain the staff and show the expected and chosen/played notes until Continue. Retry mistakes runs only missed cards. |
| R06 | Keyboard focus has a visible exact string/fret cue; native Tab, Enter and Space are covered. |
| R11 | Ear confusion summaries show musical labels; melody errors use scale-degree tokens instead of semitone offsets. |
| R13 | Storage hydration preserves the active route's instrument pin and the saved preference. |
| R14 | Steps without measured skills do not inflate path completion totals or become the next measured step. |
| R16 | Reading input stays neutral until Help; hinted attempts are recorded and the flag resets per card. Explicit note ranges also survive setup normalization. |
| R17 | Selected-hand piano bounds fit at 375px for all four keys, five patterns and both hands. Mobile setup recommends Left/Right. |
| R28 | MPC keyboard remapping lives in setup, carries into the run and has no remapping controls during performance. |
| R30 | Unsupported staff notation offers Waterfall beside the explanation, including custom-range mode, without altering score timing. |
| R07 | Shared input labels distinguish microphone, MIDI, on-screen, answer buttons and unknown input. Pointer MPC velocity is Not measured and excluded from the displayed score; chord builds show intended-string pitch results; lenient voicings report Notes collected and extra pitches. |
| R09 | Jazz milestones require specific child skills and independent attempts; Ear milestones filter modality and session evidence. Parent-only history cannot complete unrelated milestones. Reference warmups remain accessible without counting as assessed progress. |
| R10/R12/R32 | One routine projection supplies the dashboard, TodayPlan and journal, using instrument and time budget. Weak-spot coaching requires five independent attempts for the active instrument. |
| R33 | Attempts record assistance, observed input source and instrument. Journal evidence exposes those fields. Voicings, Chord Scales and Licks have Check modes that hide cues from server rendering through performance. |
| R08 | Practice retains the answered prompt, chosen/played answer, correct answer and replay until Continue. Final answers remain reviewable before summary. Test withholds immediate judgments. Instructions match the supported answer mode. |
| R15 | Pocket hides answers until Reveal, then offers explicit self-rating. Reveal focuses the answer; automatic Listen along preserves focus and remains unscored. Missed self-ratings do not invent wrong-choice confusions. The tonic warmup opens Listen along. |

| R18/R34 | Selectable lick ranges, half-speed replay, bounded three-response loops, missed-chunk retry and full-line return. Chunk records cannot complete full-line milestones. Shared tempo suggestions in Spider, Two-Hand, MPC and Licks use the completed attempt; Licks remains note-only. |
| R19 | Current estimates and review priorities reuse time decay without changing stored history or earned progress. Last-practised dates, review-due labels and heuristic wording are visible. |
| R20 | Later-visit comparisons match captured variant, tempo, input and assistance, plus recorded extra settings. Legacy/different setups get explanatory text; routine aggregates are excluded. Reserved metadata survives journal edits and stays out of topics. |
| R22 | Guitar interval recall hides note names, measures observed fret positions separately from hardware pitch, and offers region progression from independent position evidence. Shared fretboards stay readable on mobile, scroll long necks locally and keep keyboard focus visible. Ukulele entry reconciles to guitar. |
| R23 | Piano guide tones connects two ii-V-I transitions with exact-two/register membership and minimum voice movement graded separately. Equivalent minima and actual source-pair continuity are accepted. Manual Check stays unaided from SSR, with dedicated skill attribution, key persistence and safe deferred cancellation. |
| R24 | MPC groove copy-back uses one reference bar, one count-in and one bounded response bar. Voice-aware scoring separates matched timing from omissions/extras; targets appear only afterward. Shared clock, synthesized percussion, custom mappings, independent evidence, Again and cancellation are covered. Physical input and listening checks remain last. |
| R35 | One-minute chord results persist exact ordered shapes/positions, pitches, tuning and duration. Dated per-pair history survives reload, keeps source/assistance visible and excludes legacy records without the metric. Pitch matching is explicitly distinct from physical string cleanliness. |
| R36 | Guide-to-Practice client navigation has a pinned regression, passing on fresh dev and production. The historical HMR crash did not recur; no application workaround or upstream report was invented. |
| R21 | Existing journal edits offer an optional Next time reflection. Save/reload/clear and Cancel work; rejected writes retain the draft without changing committed state. |
| R25 data-only | Versioned ten-table JSON export and reviewed atomic replacement. Nested validation, rollback, current-media preservation and exact binary-collision guards protect restore. Successful replacement reloads even after route navigation. Audio/sample binaries are explicitly excluded from this JSON option. |
| R25 full backup | Versioned ZIP includes all referenced backing tracks, audio takes and kit samples, with SHA-256 validation and a 250 MiB ceiling. Restore rejects differing existing files and cleans new files after caught failures, then reloads after atomic data replacement. Real score/take and WAV round trips pass. Practice Lab now shows saved media on cold navigation; its first-import controls open before any backing exists. |
| R29 | The narrow header uses one labelled Site menu with six keyboard/pointer destinations and 44px rows. Desktop links, theme switching and Music bottom navigation retain their roles. |

Historical records are not relabeled and XP calculations are unchanged. New assessment/coaching projections exclude unknown or assisted evidence. The existing mastery pipeline keeps legacy unknown evidence compatible while excluding newly recorded assisted attempts.

Routine minutes are estimates and the budget is a maximum; available steps may underfill it. Budget selection is session-only. Five attempts is a tunable coaching threshold, not a statistical confidence guarantee. Pitch matching does not establish fingering, string cleanliness, breath control or physical velocity response.

## Verification

- `vp run -r check`: passed.
- `vp test --run`: 1,838 tests passed across 218 files (161.30s), including final full-backup and cold-load media source. The earlier R24 batch also corrected the Two-Hand fixture. Repeated full-suite readiness timeouts were traced to36 layout cases leaving async database initialization unsettled; each now waits before teardown. The advice test also explicitly uses 375px.
- Full Playwright suite: all 79 tests passed against the current production preview on 15 September (1.1m). Latest full-backup coverage creates a MIDI take/score and imports two WAV assets, rejects corruption, restores into a fresh browser and re-exports exact bytes. Both restore tests await the expected document load before checking its new time origin. Earlier coverage adds a real data-backup roundtrip of an on-screen take, score, journal reflection and preference, invalid-file preservation, atomic replacement after leaving Settings, journal save/reload/clear, and narrow-menu keyboard/pointer navigation in both themes. The initial repeated 77/78 results were traced to the Groove test resizing during the closed count-in popover's exit animation; it now waits for that portal to unmount before the unchanged overflow assertion. No application layout workaround was added.
- Final journal/comparison/progress browser follow-up: 3 passed after the metadata preservation fix. A temporary longer preview-start allowance was needed; repository test configuration is unchanged.
- `vp run -r build`: passed 15 September, including validation of eight precached piano samples (1,407,646 bytes).
- `tsx packages/music-core/src/domain/validate.ts`: passed.
- `tsx packages/music-core/src/domain/pipeline-trace.ts`: passed.
- `git diff --check`: passed.
- Independent foundational, quick-corrections, measurement/coaching and assessment reviews: zero findings. Final SSR Check and routing follow-up also found zero issues. Recorded in `.superpowers/sdd/18-second-review/`.
- Desktop and 375px mobile browser inspection: no page overflow, Check cues hidden, shared theme switches correctly. Original dark theme and Piano selection restored.
- Ear correction/Pocket browser inspection: answered prompt retained, Continue advances, answer hidden before Reveal and focused afterward, 375px layout fits. Two review findings (self-rating wording and passive focus stealing) were fixed; root verified closure because the reviewer's follow-up hit a provider usage limit.

The R18/R34 and R22/R23 connected browser was unavailable. Production Playwright screenshots were inspected at 375px and 1280px; controls fit, recall cues stayed hidden and the shared theme switched. R22/R23 screenshots are preserved in `docs/screenshots/review/implementation-r22-r23/`. The final scoped review found zero remaining issues after fixing attribution, deferred Check disposal and mobile fretboard/focus behavior. Live in-app inspection remains unverified for these batches.

R24 connected Chrome inspection passed on a temporary dev server: hidden stage, automatic empty response completion, mobile light results with zero page overflow and desktop dark layout. Production screenshots are preserved in `docs/screenshots/review/implementation-r24/`. R24 independent review and the test-fixture follow-up found zero remaining issues. No physical velocity, speaker timbre or audible cancellation claim is based on these software checks. The review tab was closed, viewport restored and temporary dev server stopped.

R35 connected Chrome inspection verified an actual empty timed run, honest Not observed provenance, persisted reload, narrow light and desktop dark history with zero page overflow and no captured browser console errors. The real on-screen production run saved 1 changes/min and passed within the full 76-test suite. Screenshots are preserved in `docs/screenshots/review/implementation-r35/`; independent review found zero issues. Owned tab/server were closed and viewport restored.

R21/R25/R29 independent reviews report zero remaining findings. Review corrections cover rejected journal state, Svelte proxy cloning at restore, postcommit reload after navigation, shared custom-tuning validation and required media disclosures. Production light/dark screenshots are inspected and preserved in `docs/screenshots/review/implementation-r21/`, `implementation-r25/` and `implementation-r29/`. All menu rows pass pointer-target checks at 375/320. R21 connected Chrome also confirmed save/reload and Cancel at narrow/desktop widths; the browser later became unavailable, so final R25/R29 evidence comes from production Playwright. Owned dev4175 was stopped. No real user collection was restored or erased.

R25 full-backup, cold-load media and reload-test reviews report zero remaining findings. Final required check passes 510 formatted and 766 lint-clean files plus package types. Both backup formats pass isolated production restore workflows; full backup re-exports backing/sample WAV bytes exactly and reopens the saved take/score and kit. Mobile/light and desktop/dark review screenshots are preserved under `implementation-r25/full-restore-*.png`. No user collection was changed. The 250 MiB in-memory archive ceiling and close-other-tabs requirement are explicit; OPFS and IndexedDB cannot form a crash-atomic transaction.

Standalone `svelte-check` previously ran: 264 existing errors and 2 warnings across 63 files remain (including Vite config types, snippet props and test fixtures). It is not included in the clean required workspace check. Details: `.superpowers/sdd/18-second-review/decay-comparison-review.md`.

Expected existing build notices remain: Vite/Svelte beta compatibility, the chord-progression initial runtime-reference warning, large chunks and Spotify's browser-externalized crypto import.

## Remaining

The full binary backup (R25), data-only restore, optional Next time reflection and narrow site menu are complete. No further hardware-independent items remain in the accepted backlog. R36's pinned check remains available if the historical dev HMR crash returns.

Physical checks remain last: piano and MPC input/velocity, microphone behavior and Aerophone breath/bend calibration (R26). R27 stays deferred until those captures. Synthetic tests do not establish physical device behavior.

The detailed execution ledger is `.superpowers/sdd/18-second-review/progress.md`.
