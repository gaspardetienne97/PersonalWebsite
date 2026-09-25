# Practice OS — next design, usability and curriculum review

Prepared for Fable 5.1, 17 September 2026. Paste the text below into a session with repository, browser and web-search access. The owner's full review is included; no separate attachment is needed.

---

You are leading the next product review of **Practice OS**, an existing personal music-practice app. Bring the judgment of a senior interaction designer, a working music teacher, and a frontend/audio engineer. Review the actual application and recent implementation critically. Produce an evidence-backed, implementation-ready proposal that makes it more beautiful, easier to practise with, more reliable with real instruments, and richer in musically useful content.

Use **Anthropic's frontend-design skill**: discover and read the installed skill, usually named `frontend-design` or `frontend-design:frontend-design`, before designing. **You, Fable, must invoke and use the skill yourself—not merely recommend it in your report.** On the owner's current machine, its entry point is `/Users/gaspard/.codex/plugins/cache/claude-plugins-official/frontend-design/local/skills/frontend-design/SKILL.md`. If your session exposes a skill tool, invoke the installed frontend-design skill through that tool; otherwise read and apply that file directly. If the path differs in your environment, discover the equivalent installed skill. Follow its plan → build → screenshot → critique process. If it is unavailable, say so; do not claim you invoked it. Its generic suggestions do not override the repository's product and design constraints. Use other relevant available skills deliberately, without turning the review into a tool inventory.

This is a **review and design phase**. Deliver concrete visual prototypes, validated proposals and original practice content. Do not edit production source/tests/configuration, install dependencies, change git state, commit, push, or modify the owner's saved collection. Write only the review artifacts and isolated prototypes described below. Do not stop at a list of ideas or ask for permission between ordinary research/design steps.

## Product, priorities and current state

Repo: `/Users/gaspard/orca/workspaces/PersonalWebsite/main`.

The app lives at `/music` inside one SvelteKit 2/Svelte 5 deployment. Shared UI uses Tailwind 4, bits-ui and `@repo/ui`; music domain/engines/exercises live in `packages/music-core`. Local practice data lives in IndexedDB and media in OPFS. Preserve offline use, existing saved scores/takes/history, and the boundaries between Music, the personal site and the PDF app.

The owner prioritizes **guitar, piano and MPC One+**, with ukulele supported. The owner has completed a personal hardware/usability review and supplied the findings below. Do not reinterpret that as a clean hardware pass. **Aerophone calibration and new Aerophone work are deliberately deferred; do not request another capture or let that block this review.**

The goal is short, focused sessions that improve real playing: understand the task, hear/see a useful demonstration, practise with appropriate assistance, receive actionable feedback, and know what to practise next. Keep the tool playable when both hands are occupied. No social ranking, hearts, gems, engagement pressure or feature accumulation for its own sake.

Ten implementation batches were completed before this review. The recorded baseline is 1,838 passing unit/component tests, 79 passing production browser workflows, and passing workspace checks/build. This is historical evidence, not proof the owner-reported bugs are absent. Inspect the current dirty working tree; do not rely on HEAD, older screenshots or previous completion claims. Preserve all existing edits and local-only planning files.

## Establish the truth before proposing changes

Read in this order:

1. Root `AGENTS.md`, `CLAUDE.md` if present, and `src/routes/music/AGENTS.md`.
2. `docs/music-redesign/19-implementation-status.md` for the latest completed work and known limits.
3. `18-second-review.md`, `17-review-backlog.md`, and relevant parts of `16-external-review.md`. Distinguish historical findings from current behavior.
4. `03-design-system.md`, `11-drill-patterns.md`, `14-hub-patterns.md`, and other design/research records only as needed. Current screenshots are also under `docs/screenshots/review/implementation-*`; verify against the live app.
5. Relevant implementation and tests in `src/routes/music`, shared visual components, and `packages/music-core/src`. For recent change rationale, consult `.superpowers/sdd/18-second-review/progress.md` and the corresponding reports.
6. Existing musical catalogs, curriculum and exercise definitions, including `docs/music-ear-training-curriculum-research.md`. Inventory what already exists before proposing more.

Discover the running app and installed commands; reuse the existing server or start an isolated development/preview server. Do not reinstall the project or start PostgreSQL for this client-local Music review. Use disposable browser profiles/data for destructive scenarios, imports and restore checks. State your browser, commit/dirty-tree scope, test environment and hardware access. If browser or research access is missing, deliver the useful remaining work and identify exactly which conclusions are unverified.

## Where to find additional context

All paths below are relative to the repository root unless absolute. Start with the live entry point and follow its imports; these are navigation aids, not permission to assume a file still implements the behavior described in an older report. Some prototype/planning files are deliberately ignored by git. If an expected local file is absent from `rg --files`, inspect its specific directory (or use a narrowly scoped `rg --files --hidden --no-ignore <directory>`); do not scan dependencies or treat ignored work as disposable.

| Question | Starting points |
| --- | --- |
| Product intent and historical decisions | `IMPLEMENTATION_PLAN.md`, `music-practice-app-plan.md`, `docs/music-redesign/README.md`, `proposal.md`, `CHANGELOG.md`, numbered design/research documents; treat older backlog status as historical. |
| What was recently implemented and why | `docs/music-redesign/19-implementation-status.md`; `.superpowers/sdd/18-second-review/progress.md`, task briefs, reports and review files. Full backup has `r25-full-brief.md`, `r25-full-core-report.md`, `r25-full-report.md`, `r25-full-review.md`; other task reports live beside them. |
| Visual references and before/after evidence | `docs/music-redesign/references/`, `docs/screenshots/ui-pass/before/`, `docs/screenshots/ui-pass/after/`, `docs/screenshots/review/`. These support comparison; capture the current app yourself. |
| App shell, sidebar and shared practice flow | `src/routes/music/+layout.svelte`, `_components/MusicNavigation.svelte`, `FloatingPracticeControls.svelte`, `PracticeDrillShell.svelte`, `PracticeStage.svelte`, `PracticeScreen.svelte`; `src/lib/components/site/Header.svelte`. |
| Tokens, contrast, fonts and reusable controls | `src/app.css`, `src/app-tokens.contrast.test.ts`, `packages/ui/src/`, `docs/music-redesign/03-design-system.md`, and the Music `AGENTS.md`. |
| Shared keyboard, live input and Waterfall | `src/routes/music/_components/piano/` (including `PianoSurface.svelte` and `piano-timeline`), `_components/InstrumentView.svelte`, and the consuming Reading/Two-Hand/Scales/Song routes. Trace the current imports rather than looking only for an old `OnScreenKeyboard` filename. |
| Fretboard and instrument representations | `src/routes/music/learn/reading/_components/FretboardInput.svelte`, `_components/InstrumentView.svelte`, `packages/music-core/src/engines/tunings/`, `engines/library/`, `exercises/chord-positions.ts`. |
| MIDI connection, held notes and MPC mapping | `src/routes/music/connect/+page.svelte`, `connect/_components/MpcHardwareDiagnostic.svelte`, `_components/MpcPadGrid.svelte`, `_runtime.svelte.ts`; `packages/music-core/src/engines/midi/`, `input-router/`, `device-profiles/`; `src/routes/music/play/mpc/+page.svelte`, `packages/music-core/src/exercises/mpc-*.ts`. |
| Timing, playback and offset settings | `src/routes/music/settings/+page.svelte`, `_runtime.svelte.ts`; `packages/music-core/src/engines/settings/`, `transport/`, `sound/`, and exercise/session timing callers. |
| Library, staff, tablature and range selection | `src/routes/music/library/+page.svelte`, `songs/[id]/+page.svelte`, `_components/MusicXmlScore.svelte`, `StaffNotation.svelte`, `TabNotation.svelte`, `ScoreFollowerStage.svelte`, `notation-selection.ts`; `packages/music-core/src/domain/score.ts`, `engines/score-import/`, `score-practice/`, `score-follower/`, `song-library/`, `notation/`. |
| Recorder, audio takes, MIDI takes and kit authoring | `src/routes/music/create/+page.svelte`, `create/_components/RecorderPanel.svelte`, `PianoRollPanel.svelte`, `StudioPanel.svelte`; `src/routes/music/studio/_components/SampleKitPanel.svelte`, `play/+page.svelte`, `_components/AudioTakePanel.svelte`; `packages/music-core/src/engines/recording/`, `audio-recording/`, `media-library/`, `sample-kit/`, `sequencer/`. |
| Tuner and microphone detection | `src/routes/music/tuner/+page.svelte`; `packages/music-core/src/engines/audio-in/`, especially `tuner.ts`, `pitch-detect.ts`, `pitch-worklet.js`; shared microphone gates and their callers. |
| Current musical content and progression | `packages/music-core/src/exercises/`, `engines/library/`, `jazz/`, `ear-training/curriculum.ts`, `learning-path/`, `skills/`, `coach/`, `daily-routine/`, `projection/`; `src/routes/music/learn/` and `play/`; `docs/music-ear-training-curriculum-research.md`. |
| Progress, journal and honest assessment | `src/routes/music/progress/+page.svelte`, `track/+page.svelte`; `packages/music-core/src/domain/`, `engines/analytics/`, `sessions/`, `skills/`, `projection/`. Read provenance, assistance and scoring rules before proposing new metrics. |
| Storage compatibility and restore safety | `packages/music-core/src/engines/store/` (including `data-backup.ts`, `full-backup.ts`), `media-library/`, `sample-kit/store.ts` and matching tests. |
| Commands and reproducible verification | Root and package `package.json`, `pnpm-workspace.yaml`, `vite.config.ts`, `playwright.config.ts`, colocated `.test.ts`/`.svelte.test.ts` files and `e2e/music-*.spec.ts`. Use current installed tooling; older prompts may contain obsolete setup commands. |

The owner's September 17 findings are reproduced in full as actionable items below. Earlier chat is not required. If an important preference, recording, screenshot or hardware detail is missing, name the precise evidence needed and proceed with independent work; do not invent it. Aerophone remains deferred even if older documents list it as the next task.

## The owner's review: account for every item

These are firsthand observations and desired outcomes. Root causes are hypotheses until reproduced or traced. Give each item a disposition: reproduced defect, source-supported issue, design request, needs more evidence, or deferred. Never silently omit an item.

| ID | Observation or requested outcome |
| --- | --- |
| O01 | Settings needs a better MIDI/audio offset calibration experience than manually guessing offsets. |
| O02 | Pressing a white piano key between black keys causes its highlight to cover part of the black keys. |
| O03 | On the ukulele surface, restrict the fretboard background treatment to the fretboard itself, rather than recoloring the entire surrounding view. |
| O04 | MPC computer-key presses leave pad highlights stuck after release. Multiple simultaneous keys do not all highlight. Press/release and polyphony should work correctly; investigate whether piano keys share the problem. |
| O05 | Make the Music sidebar collapsible to give drills more room. It should fill the app's available height, with Connect, Tuner, Settings and Guide anchored at the bottom. Consider desktop and phone separately. |
| O06 | Add useful audible and synchronized visual demonstrations where appropriate: scales, chords, Two-Hand Independence, contrary motion, pulse lines and other exercises. Show which notes happen together and in what order so the learner understands the task. |
| O07 | Mark middle C for orientation. Physical MIDI playing, including simultaneous notes during Two-Hand exercises, should highlight on-screen while notes are held. |
| O08 | The Waterfall keyboard looks different from the other on-screen keyboard. Unify appearance and interaction while preserving each view's purpose. |
| O09 | Reading should retain the input keyboard and live played-note feedback but hide expected answers by default. Offer an explicit expandable hint. Put wrong-note feedback on the staff; accumulated red keyboard notes currently obscure ongoing playing feedback. |
| O10 | A song-library preview starts audibly, then sound cuts out while the UI still reports playback continuing. |
| O11 | Dark-mode contrast against a purple background is poor. The exact element was not named; locate affected states with inspection rather than guessing. |
| O12 | Long scores force whole-page scrolling, and preview/start actions are at the bottom. Keep transport and practice actions reachable while reading/playing, potentially with a contained score viewport and controls above it. |
| O13 | The library's Tab view does not actually show guitar or ukulele tablature. |
| O14 | Replace the unattractive score cursor with a clean vertical line spanning the relevant staff/system. Define behavior across systems and polyphonic passages. |
| O15 | Range selection should allow choosing a start and end on the score, instead of selecting individual notes. Show start/end boundaries and the selected region. The owner suggests green for start/red for end; pair any color with explicit labels and accessible cues. |
| O16 | Create needs a clearer representation of captured MIDI notes. Distinguish MIDI takes from microphone/audio takes; give audio a useful waveform or envelope rather than an undifferentiated card. |
| O17 | In sample-kit creation, pad assignment dropdowns do not open or offer assignments. Repair that workflow and propose a better kit-building interface. |
| O18 | Keep the useful Progress information, but design genuinely different UI alternatives so the owner can compare representations. |
| O19 | MPC MIDI messages appeared in Connect, but Rudiments advanced from an unexpected physical pad. The owner expected notes 36/38 to correspond to pads 1/3; pad 6 advanced instead and others did not. Verify actual device assignments rather than assuming physical pad numbers equal MIDI note numbers. |
| O20 | Groove copy-back registered none of the owner's MPC hits; every target was reported missed. |
| O21 | Treat MPC connection, routing, mappings, feedback and exercises as one high-priority reliability investigation, not disconnected cosmetic fixes. |
| O22 | Microphone recordings save but play back very quietly. |
| O23 | Takes cannot be played directly from their cards. Add a clear playback affordance and consider editable names/descriptions. |
| O24 | Redesign the recorder experience and evaluate giving it its own navigation destination outside Create; the owner sees recording as a distinct job. |
| O25 | Tuner detection works reasonably with piano but sometimes identifies low guitar notes incorrectly, despite another tuner reporting them in tune. Ambient sound is a suspected cause, not an established diagnosis. |

## Investigate the high-impact failures first

Trace actual paths and every affected caller. Separate a shared defect from a route-specific issue; prefer fixing an existing shared component or engine over adding parallel implementations.

- **MPC:** trace device/port/channel and raw note-on/off/velocity → device profile and routing → mapped note → exercise acceptance → visuals/result. Distinguish physical pad index, bank/program assignment, MIDI note number and computer-key mapping. Examine string/number mismatches, instrument filters, count-in/response windows and timestamps as hypotheses, not conclusions. Produce an observable mapping/learn-flow proposal and a reproducible diagnostic recipe. Do not assume General MIDI mappings fit the owner's program or send device-reprogramming commands.
- **Held notes/pads:** test pointer, computer keyboard and MIDI; simultaneous presses, repeat events, release order, note-on velocity zero, blur, pointer cancellation, route exit and disconnect. Keep played notes, expected targets, assistance and correctness as distinct states with clear lifetimes.
- **Preview and recording:** trace audio activation, transport and sound lifecycles, long previews, pauses/seeks, route transitions and actual sound completion. For quiet takes, distinguish capture level, selected input, stored sample amplitude and playback gain. Evaluate meters, headroom and optional nondestructive gain without silently changing original recordings.
- **Calibration:** distinguish input timing, output latency, MIDI timing and human tapping error. Specify what can actually be measured in a browser, what is an estimate, sign conventions, repeatability, device-specific persistence, a before/after check and a reset. Never present a tap test as a precise hardware round-trip measurement.
- **Low guitar pitches:** inspect detection, sample/window size, noise/confidence handling and octave errors against realistic recordings and known-pitch fixtures. Compare clean and noisy cases, note/register accuracy, acquisition time and stability. Do not add a gate/smoothing setting that hides wrong estimates or excludes the low range. Mark real-device validation still needed when unavailable.

For every failure, give reproduction steps, expected/actual behavior, evidence, likely owning files/functions, confidence, smallest plausible fix and acceptance test. If not reproduced, preserve the owner's report and specify the missing observation; do not call it solved because synthetic tests pass.

## Design the entire Music experience

Inventory every current route and important state. Walk through first use, returning practice, device setup, a successful and unsuccessful drill, retry, interruption, results, library/score practice, recording/kit building, progress and data management. Check the connections between them, not just individual screenshots.

Invoke the design skill to define a coherent visual direction specific to musicians practising with instruments. Make a useful, intentional practice workspace with strong hierarchy, readable notation, clear action placement and calm secondary information. A promotional hero, another grid of identical cards, or a palette swap is not a redesign.

Honor existing theme tokens, shared primitives and the system/Outfit/Fira Mono font roles. Keep instrument colors, degree colors and correctness semantics distinct. If you recommend changing an established rule, explicitly identify it, show the benefit and cost, and present it as a proposed decision rather than silently rewriting it. Address O11 with measured contrast in actual states.

Compare two compact app-wide layout directions, recommend one, then build **three high-fidelity interactive prototypes** under an isolated review folder:

1. A responsive practice workspace showing the collapsible navigation, a piano exercise in demo/practice/assessment states, live polyphonic feedback, optional hints and a long-score viewport with reachable transport/range selection.
2. A recording/sample-kit workflow showing distinct MIDI/audio take cards, inline playback, naming, basic waveform/piano-roll representation and working pad assignment interaction. Evaluate the standalone Recorder destination against keeping it in Create.
3. **Three meaningfully different Progress alternatives** using the same realistic data: for example skill-centered, session/history-centered and next-practice-centered. Explain what question each answers best; do not merely rearrange cards or change colors.

Use real musical content and honest example data. Label prototypes as simulated where appropriate; do not simulate measurements and claim hardware verification. Test keyboard interaction, focus order, at least 44px primary touch targets, reduced motion, screen-reader labels/status ownership, dark/light states, and layouts at 375px and 1280px (check 320px where controls are tight). Verify no page overflow or controls covered by fixed chrome. Capture screenshots, critique the first pass against concrete weaknesses, and revise it once. Include loading, empty, error and recovery states—not only the ideal screen.

## Expand the curriculum, not just the item count

Inventory existing chords, voicings, scales, licks, rhythms, grooves, repertoire tools and progression rules first. Propose additions that fill a learning gap and can be expressed through existing engines where practical.

Build a coherent beginner → intermediate → advanced progression for each primary instrument:

- **Guitar:** useful chord families and changes, rhythmic strumming/comping, fretboard knowledge, scales and phrasing, short melodic pieces/licks, connected musical application.
- **Piano:** reading, coordination, scales/arpeggios, chord inversions and voice leading, comping, short phrases/licks and repertoire transfer.
- **MPC/finger drums:** reliable pad vocabulary, pulse/subdivision, rudiments and accents, kick/snare/hat coordination, grooves, fills and short multi-bar drum pieces.

Sequence difficulty across relevant dimensions: rhythmic density, tempo, coordination, register/span, harmonic vocabulary, syncopation, length and memory demand. Do not increase every dimension at once or equate faster with better. Include prerequisites, an audible/visual model, slow chunk practice, guided performance, an independent check, spaced review and transfer to a fresh musical context. Demonstrations must not silently reveal answers during assessment or award independent mastery.

Deliver a prioritized content catalog plus **nine fully specified original exercises: three per primary instrument, at increasing difficulty**. At least one must be a melodic lick/phrase and one a multi-bar drum piece. Provide actual notes/pitches or drum voices, octave/register, beat-relative onsets and durations, meter, key/chord context, tempo range and justified fingering/sticking where appropriate. Include learning objective, prerequisite, prompt/copy, demonstration, accepted answers, supported input, grading tolerances, hint behavior, success/repeat/advance rule, variation and next step. Map each to an existing data format/engine or name the smallest needed extension.

Manually or programmatically check bar totals, pitch spelling, playable ranges, simultaneous-note expectations, guitar/ukulele string/fret feasibility and tuning, and drum mappings. Do not invent fingering certainty or infer physical technique from note-only input. Explain what MIDI, microphone and on-screen input can and cannot establish. Use original musical material or verified public-domain/licensed material; do not reproduce proprietary lesson libraries or transcriptions from commercial recordings.

## Validate with current market and learning research

Browse current primary sources. Choose 5–7 relevant products based on the questions being investigated, not a popularity list: Melodics for pads, Soundslice for notation/ranges, Piano Marvel or Simply Piano for piano learning, Yousician or JustinGuitar for guitar progression, Modacity for practice organization, and an established tuner such as TonalEnergy are starting candidates. Verify current capabilities; these names are leads, not evidence.

Study actual workflows through official documentation, tutorials, demos or accessible interfaces. Record direct URLs, access date, the observed pattern, its tradeoffs, relevance to this single-user offline app, and whether evidence is hands-on or documentation-only. Attribute competitor screenshots; borrow useful principles, not proprietary visual assets or lesson content. Marketing claims are not evidence of learning outcomes.

For learning/progression claims, use appropriate research papers and authoritative teaching/method sources. Distinguish research-supported principles, established teaching practice, competitor conventions and your own design judgment. If evidence contradicts a proposal, revise or drop it. A source must support the particular claim, not merely mention music or learning. Cite important proposals near their evidence; do not pad a bibliography.

For the top recommendations, triangulate owner observation + app evidence + external evidence where available. No fabricated citations, usability participants, timing measurements, audio observations or hardware success. Describe an expert walkthrough as such. Define measurable validation tasks and proposed targets as targets, not results.

## Deliverables and decision quality

Write a linked review package under `docs/music-redesign/review-21/` (check for existing work before writing):

- `README.md`: concise executive review, ten highest-impact changes, what to retain, capability/evidence limits and links to artifacts.
- `findings.md`: every O01–O25 disposition, additional discovered issues, reproducible evidence and exact source pointers. Distinguish bugs, usability issues, visual choices and content gaps; consolidate shared causes.
- `design.md` plus `prototypes/` and `screenshots/`: selected direction, layouts, interaction/state behavior, three Progress alternatives, before/after comparison, prototype instructions and your first-pass critique/revision.
- `curriculum.md`: existing-content inventory, three progressive paths, prioritized expansion catalog and nine complete musical examples.
- `research.md`: compact comparison matrix and claim-level sources/limitations.
- `implementation-plan.md`: ordered, bounded tickets with user outcome, owning routes/components/engines, dependencies, effort, confidence, data compatibility implications and concrete acceptance checks. Tie each ticket back to findings and owner IDs. Separate required reliability fixes, worthwhile improvements and optional experiments.

Prioritize trustworthy MIDI/audio and unobstructed practice before visual polish or catalog breadth, while still producing concrete polished designs. Recommend the smallest coherent first implementation slice that materially improves the daily practice loop. Include which existing abstractions to reuse, what to remove/simplify, what not to build, and any product decision the owner must make.

Validation must cover the owner-reported failures, representative full practice flows, accessible narrow layouts and realistic musical correctness. Specify focused component/domain/E2E tests for later implementation using the repository's existing tools, and identify physical checks separately. Preserve the current backup/restore safety and honest scoring/assistance semantics.

End with a short recommendation the owner can act on: the first slice, the visual direction, the strongest content additions, and the evidence still missing. Deliver the files and prototypes, not just a promise to do them. Be candid about weak existing work and weak ideas—including your own. The standard is a musician returning tomorrow because the app makes practice clearer and more productive.
