# Lessons learned across the Practice OS rounds

What went wrong, what worked, and what kept coming back. Drawn from `docs/music-redesign/` (audit, rounds 1 to 5 changelog, external review 16, second review 18, implementation status 19, review 21) and the root planning files. Facts and observations only; nothing here is a rule.

---

## 1. Findings that kept coming back

These appeared in two or more independent review passes, which is the clearest signal in the whole record.

### Setup dominated the screen, over and over

The owner's own design brief opened with it: "Setup dominates. The config wall is the first thing you see every time, even though the app already remembers your last setup and Space starts the drill." (`09-open-design-brief.md`). The audit independently ranked it #1: only 2 of 14 drills collapsed setup behind a summary line, even though `initialDrillSearch` already restored the last setup on all of them (`audit.md` §3.1). It had already been deferred once: `08-usability-plan.md` lists "collapsed setup cards + presets" in the backlog with the reasoning "post-U1 the marginal value is lower, configs are remembered and Space starts". It took round 1's three-state shell to actually fix.

### Chrome crowding the practice surface

Four bands (site header, music top bar, floating capsule, page header with subtitle) took 160 to 190 px on desktop and about 40% of a 375 px phone (`audit.md` §1.1). Focus mode existed but was opted into per route, so the sweep found only Licks entering it among the drills that started (`audit.md` §3.2). Later the owner asked again, from a different angle: "Make the Music sidebar collapsible to give drills more room" (O05).

### Two keyboards where one instrument belonged

Called out in round 0's audit (§3.2, "Two keyboards, one target"), fixed route by route in round 2, then raised again in a new form by the owner in review 21: "The Waterfall keyboard looks different from the other on-screen keyboard" (O08). The finding in `review-21/findings.md` is instructive: it *was* the same component. It looked different because the songs page passed no router, added a lane and legend, sat in a Card instead of a stage, used the whole-score range and no note names.

### Mastery claimed more than the evidence supported

The single most repeated substantive finding. External review item 1: after a major-voicing run, four Jazz Path lessons showed 92% mastery including altered voicings never practised, because the curriculum, Licks and Chord-Scales all wrote to the same `harmony.ii-v-i` skill (`16-external-review.md`). The second review confirmed the mechanism at source and added that `ScoringEvent` had a `modality` field but no `assistance` or `source`, so "every honesty fix in R07, R09, R16 needs the same two fields" (`18-second-review.md` §D, R33). Review 21's curriculum then built the whole model-chunk-guided-check loop around exactly that distinction.

### Results that flattered the input

Mouse taps earned "Velocity 100%" (the router emits constant velocity 1); pointer chord builds were told "strings rang clean"; lenient mode gave 100% for wrong extra notes followed by the targets (`16-external-review.md` item 6, split into four sub-tickets in `18-second-review.md` R07a to R07d). The per-string metrics needed to say something honest already existed in `chord-perfect.ts` and were never rendered.

### Live regions and focus

The audit counted five competing live regions on Reading and Rhythm, four on Scales and Ear (`audit.md` §4). One commit (`755ed88e`) reduced shared components to silence and left one route-owned announcer. It came back as a rule in two AGENTS files and had to be re-applied in round 4 (`PositionStepper` dropped its `aria-live`) and round 5 (the MPC diagnostic and pad LED hint). Similarly, MPC and Spider focused an `sr-only` stage heading, so sighted keyboard users watched focus vanish; the fretboard's real buttons lived in an `sr-only` grid, so Enter input worked but focus was invisible (R06).

### 375 px overflow

Five routes overflowed at 375 and Jam also at 1280. Both root causes were single shared components: `SegmentedControl` was `inline-flex` with no wrap, and `AerophoneFingering` rendered a fixed-width SVG (`audit.md` §2). Fixing the two components fixed every route. Overflow kept recurring in new work anyway: the Create piano roll at 746 px (round 5), the Jazz Path cards at 391 px (round 4), the Connect routing table at 482 px (round 5). Each was caught by the same measurement (`document.documentElement.scrollWidth` versus viewport) in the screenshot sweep.

### The coach's judgement outran its evidence

`weakestSkills` had no minimum sample and no instrument filter, so "a single missed piano rep becomes the guitar user's focus", and the coach printed "0% accuracy across 1 attempt" without hedging. The second review's comment is the useful part: "'0% across 1 attempt' is accurate, the framing as a diagnosis is the problem." (`18-second-review.md` C6, R32)

### The daily routine existed three times

`daily-routine` DEFAULT_STEPS, a static list in `track/+page.svelte:40-45`, and `dashboard/index.ts:123-138`. The external review found two copies; the second review found the third (`18-second-review.md` R12). The journal showed a hardcoded "Today's routine" that did not match the routine just completed.

---

## 2. The bugs that cost the most

### The MPC heartbeat lived on one page

The largest single cost in the record, and it took three rounds of owner reports to find.

The MPC One+ in Controller Mode sends pad notes only while a host keeps a captured handshake alive: init frames once, then a heartbeat frame about every second. That handshake lived in `MpcHardwareDiagnostic.svelte` as a `setInterval` started by a button on the Connect page and cleared in `onDestroy`. Leave Connect and the MPC dropped out of the link, so every drill saw silence (`review-21/findings.md`, third follow-up).

What it cost:
- The owner's original report (O19) looked like a pad-mapping bug, and a pad-map fix was built and shipped for it: `DeviceProfile.padNotes`, three presets, a Learn pads flow, a canonical rewrite at the runtime MIDI boundary.
- His second report ("the learned map never stuck") triggered a fake-Web-MIDI simulation that proved the map *did* stick and client-side navigation graded correctly, and surfaced a different real bug: a fresh page load started with MIDI off.
- His third report ("Ignore set on every port but the private one, Rudiments still did not respond") triggered a five-port simulation that again proved the software correct, and produced `MidiStatus` (a shared line on every drill saying what arrived and why it was or was not used) because "what was missing was any way to see, from the drill, what a hardware note became".
- Only his fourth report, naming the "Connect (init + heartbeat)" button, exposed the real cause.

Three correct, useful fixes were built before the actual defect was located, because every simulation reproduced the software path and none reproduced the hardware's requirement.

### MIDI was never enabled on load

MIDI was only ever turned on by a button press (Connect, or a per-drill "Enable MIDI" button that was collapsed once a drill was ready). After any full page load the runtime started with MIDI off and nothing re-requested it, although the browser had already granted permission. As `review-21/findings.md` puts it: "That is the 'channel dropped' experience: on the dev server the known Guide to Practice HMR crash forces exactly such a reload, and so does opening a bookmarked drill." The fix remembered the first successful enable in local state and re-enabled at startup when permission was granted.

### Wrong-note red that never cleared

In wait mode the score follower's `wrong` set only grew (`score-follower/index.ts:118,157`) and `liveState` returned it every tick; `wrong` outranked `active` in `keyState`. A single mis-hit key stayed red for the entire phrase. The owner's report (O09) describes the consequence precisely: "accumulated red keyboard notes currently obscure ongoing playing feedback". The cost is that the feature intended to teach was actively hiding the live information the player needed.

### Preview cut-out

A song preview started audibly then went silent while the UI kept reporting playback (O10). It was never reproduced: the Playwright Chromium reports `AudioContext.currentTime = 0`. The source trace found `playPattern` scheduled the whole score up front on a `Tone.Sampler`, and that any re-trigger of a pitch mid-preview (a played note through the same sampler, a metronome voice change, `loadSampler` finishing) stops every queued source of that pitch. Two things shipped as robustness (a one-second look-ahead scheduler, and a "Playing" flag tied to an actual epoch rather than a wall-clock timer) with the honest note that the mechanism is unconfirmed and the owner's check is Warm Synth versus Sampled Piano.

### Held state with no release

`MpcPadGrid` kept a single `lastHit` number, set on trigger and never cleared. It listened to keydown only: no keyup, no repeat guard, no router subscription. Two keys down lit one pad, and it stayed lit indefinitely; hardware MIDI hits never lit anything at all (O04). The piano side was nearly correct (pointer, QWERTY, latch, release order, route exit) with one gap: window blur left a key held after Cmd-Tab. The pattern that fixed both was a holders map keyed by source with release on key-up, blur, pointer cancel and note-off.

### The learned pad map that looked like it had not stuck

The map persisted correctly in IndexedDB. The display defect was that a learned map matching no preset rendered its "Learned from this device" `<option>` *after* the select's value was set, so the select fell back to the first entry. A correct value looked wrong (`review-21/findings.md`, first follow-up).

### structuredClone of reactive state

Found by the Playwright pass at the end of the review-21 implementation, not by 2,209 unit tests: `MusicRuntime.writeLocalState` handed Svelte `$state` proxies to Dexie's `structuredClone`, so MIDI takes never persisted. The changelog records it as "a defect found by the e2e pass and fixed at the choke point" (`CHANGELOG.md`, 2026-09-18 commit entry). The same class of bug appears again in the R21/R25 review notes as "Svelte proxy cloning at restore" (`19-implementation-status.md`).

### Smaller ones with an outsized effect

- **Hub tabs did not switch content.** Clicking Reference on Library changed the URL to `?tab=reference` and left Song Library on screen; Create's Recorder did the same. Root cause: SvelteKit's `replaceState` re-emits the page store without updating `page.url`, and the `$effect` reading `$page.url` wrote the stale tab back. Tuner had no such effect and worked. One-line fix, and it shipped as a regression from round 5 because the Library unit test passed: `$page.url` is undefined under Vitest and the effect was guarded (`18-second-review.md` §B, R04 root cause).
- **`sanitizeProfile` dropped `ignored`**, so "ignore this input" never survived a reload and a second MPC port could double-count hits (`review-21/findings.md` A2).
- **A completion action that led nowhere.** "Open journal" pointed at `/music/progress?tab=journal`; Progress has no such tab; the entry was at `/music/track` (R01).
- **Note-off was never recorded**, so every MIDI take note was 0.5 beat and any roll or export of a take was rhythmically wrong (`review-21/findings.md` A7).
- **`focus-visible:z-20` on white keys.** Chrome makes a mouse-focused button match `:focus-visible` once any key is typed, so the focused white key rose above the z-10 black keys and covered them (O02). A one-property cause for a defect the owner noticed while playing.
- **`timingZone` labelled positive error "ahead"** while every scorer defines positive as late (`review-21/findings.md` A3).
- **`hsl(var(--practice-accent))` in a shadow** when the token is OKLCH, so the shadow resolved to nothing (`audit.md` §1.9).

---

## 3. What made the UI feel dull or templated, per the reviews

### The owner's diagnosis

"The color system is one-dimensional. The whole app is a single near-navy/slate hue (a default shadcn palette). Cards, buttons, nav, stats, all the same gray-blue." And: "Everything has the same visual weight; nothing feels like playing an instrument." (`09-open-design-brief.md` §2)

### What the audit found underneath that impression

- **Token drift, not a missing palette.** `primary`, `practice-accent`, `success` and `chart-*` were used interchangeably for "selected", "target", "done" and "hand". Worse, the music scope re-tinted `--primary` to the same violet as `--practice-accent`, so inside `/music` a target key, a selected tab, a Start button and a done step all read as "violet thing" (`audit.md` §1.2). The recorded conclusion: "The fix is role discipline plus form (ring vs fill), not a new hue."
- **Instrument hues existed and were unused.** Six `--instr-*` tokens shipped in Phase 0 and were "barely used anywhere. A piano page could *feel* different from a guitar page." (`09-open-design-brief.md`)
- **Three stat-tile styles, four callout styles for "what next", three section-heading styles across the hubs, card titles at four sizes, ad hoc `text-[10px]` and `text-[11px]` outside the eyebrow utility.** (`audit.md` §1.4, §1.10, §1.11; `14-hub-patterns.md`)
- **Dead tiles before a run**: Accuracy 0%, XP 0, Streak 0 days, Strings 0/-. The design brief had already called this out once and it was not fixed (`audit.md` §1.5).
- **Cover art made drill cards about 300 px tall**, so a 16-card grid became a long single column on the phone, and Paths cards were forced to one hue regardless of content (`audit.md` §1.12).

### What the visual reference board concluded was missing

`10-visual-references.md` §2 compared 48 App Store screenshots against the app and named the gap in one line: "Colour carries musical meaning first... Our token discipline already separates identity and judgement; the gap is that nothing in our app gives musical objects a colour of their own." Plus: "The instrument is drawn as material... Our stage is a bordered card with a grid; the keyboard is flat." And on paths: "Ours are cards with badges and mastery bars but no 'what you will hear or play' line."

### The self-critique inside the design work

`review-21/design.md` §1 records a first draft being cut back: "the stage carried both a gradient wash and a grain layer plus a coloured rail, three decorations for one panel; the prototypes keep the wash and the rail and drop the grain. The results tiles were a four-card row of identical shapes; the 'Next' tile is now hollow (dashed) because it is a suggestion, not a measurement." §5 lists weaknesses the author would still not ship: "the results tiles still read as a card row (one hollow tile helps, a single sentence would help more)".

### The honest framing of what a redesign is not

From the brief for the last review: "A promotional hero, another grid of identical cards, or a palette swap is not a redesign." (`20-next-review-prompt.md`)

---

## 4. What the owner liked

- **The engines.** "The app's engines are honest and well tested, and the last ten batches made scoring, assistance and backups trustworthy. What failed the owner at the instrument was the last centimetre." (`review-21/README.md`)
- **The material instruments.** The direction he approved is "the bench": "The instrument surfaces drawn as material: ivory and ebony with a front lip and lacquer, a rosewood neck with nickel fret wire and position dots and strings that thicken toward the bass side, rubber pads on a dark panel with an LED under each. This is the one bold element. The chrome around it stays quiet." (`review-21/design.md` §1)
- **Keeping the chrome on the site theme.** Decided at the start and never overturned: "Chrome stays on the site theme, neutral slate, light/dark, existing `@repo/ui` tokens. Same fonts." (`README.md`, resolved decisions)
- **Explicit scope decisions when asked.** He said "Full scope" to the jazz decomposition, "go ahead" to open round 3, and "you can change the engine" for the Aerophone traces. Rounds were merged to local `main` at his request each time, and never pushed by design.
- **Focused fixes at the instrument over more features.** O21 asks for the MPC chain to be treated as "one high-priority reliability investigation, not disconnected cosmetic fixes."
- **Comparison over prescription for Progress.** O18: "Keep the useful Progress information, but design genuinely different UI alternatives so the owner can compare representations." Three were built on identical data and the recommendation was "what next" as the default, because "the daily question is 'what now'" (`review-21/design.md` §4).
- **Things reviewers told him to keep** and he did not contest: the four hubs, the local-only architecture, native selects, the tonic-first ear path, the fret window, authored chord positions, and the Wait versus Performance distinction (`16-external-review.md` §10).

---

## 5. Testing approaches, and what each actually caught

### Caught real bugs

**A fake Web MIDI device driven through the real app in Chromium.** The highest-value technique in the record. Two ports named "MPC One+ Public/Private" with Akai Classic notes on channel 10, then the same sequence the owner ran. It proved the pad map persisted, proved client-side navigation graded correctly, and found the real defect (MIDI off after a full page load). A later five-port version with four ignored ports again separated software correctness from what the owner was seeing. (`review-21/findings.md`, first and second follow-ups)

**Playwright against a production build.** Found what 2,209 unit tests missed: the `$state`-proxy-into-`structuredClone` bug that stopped MIDI takes ever persisting. Also caught the hub-tab regression that unit tests could not, because `$page.url` is undefined under Vitest and the guarded effect never ran (`18-second-review.md` §D, "Process gap"). The second review's acceptance criterion for R04 is the lesson in one line: "a Playwright test that clicks each tab and asserts both the URL and the visible panel, then Back and reload."

**Browser component tests (Vitest browser mode).** Carried most of the drill work: 23 PianoSurface cases, `MpcPadGrid` polyphony and release, `device-profiles` pad rewriting, `StaffNotation` single cursor. Notably `piano-fingering.test.ts:7-16` had *pinned* the wrong behaviour (clamping an ascending pitch index to five), so the invented fingerings were protected by a passing test.

**Screenshot sweeps with numeric reports.** Every round captured routes at 1280 and 375 in both themes and wrote `report.json` with per-route `scrollWidth`, `innerWidth`, button counts, live-region counts and console errors. This is what turned "feels cramped" into "Jam is 1521 px at 1280, caused by a non-wrapping segmented control in an aside without `min-w-0`".

**A contrast test over token pairs.** `src/app-tokens.contrast.test.ts` computed 60 pairs from the OKLCH values in both themes and "found six pre-existing near-misses" on its first run, all fixed as token changes (`CHANGELOG.md` slice 32). Later extended to cover `primary` on `card` and `background` after the owner's O11.

**A synthetic pitch harness.** Eight fixtures, two sample rates, 5,360 frames. It did not just confirm a suspicion, it changed the diagnosis: the failure mode is not octave errors but sub-multiple flips (60 Hz hum flipping A2 to A1 in 14 of 35 frames), and sub-50 Hz rumble rejecting half the frames and biasing the rest 2.5 to 6 cents sharp, which matches "app says sharp, other tuner says in tune" (`review-21/findings.md` O25).

**Source-level tracing with file and line.** The second review re-derived every one of thirty tickets from the code, confirmed 25 as described, revised four, dropped one, and found zero false positives. It also corrected root causes the first review had guessed at (R13's `attachStorage`, not a fictional `initializeSettings`) and found three things the first review missed entirely.

**Peer review between two agent sessions.** The external reviewer (a Codex session) and the auditing session exchanged findings over a session bridge and each accepted corrections from the other, recorded at the end of `18-second-review.md`.

### Did not catch things

- **Unit tests for hub tabs.** They passed while the feature was broken, for a structural reason: no `$page.url` in the test environment.
- **The pinned fingering test.** It locked in the defect.
- **Every synthetic MIDI test for the MPC.** They all passed against a device that was not in the state the real one was in. `review-21/findings.md` states the limit directly: "The pad-map mechanism matches the owner's 'pad 6' report exactly and Akai's documented Classic map, but only the recipe on the real MPC closes O19 to O21."
- **Any audio assertion in headless Chromium.** `AudioContext.currentTime` stays 0, so O10 and O22 were unreproducible by construction. Both fixes shipped as robustness with the confirming observation written down for the owner.
- **A layout assertion in Vitest browser mode.** Dropped deliberately during slice 2: "vitest browser mode runs without the app stylesheet, so a layout assertion on `SegmentedControl` was not meaningful and was not kept; the end-to-end checks cover it."
- **Flaky full-suite runs.** Repeatedly, specs failed under parallel load and passed in isolation (a 10 s tuning-button wait, the Aerophone count-in, the Progress deep-skill pin, a narrow-menu focus assertion). Each one cost a re-run and an investigation. One was traced to a real cause worth recording: the Groove test resized the viewport during a closed popover's exit animation.
- **Dev server versus production.** A client-side navigation from Guide to Practice threw `Cannot read properties of undefined (reading 'call')` inside Svelte HMR code on Vite 8 beta and stranded the page. It blocked browser-based review on the dev server for two review rounds, was never a production defect, and every review capture had to use a full page load because of it (`18-second-review.md` §A and R36).

### The verification discipline that held

Every slice ran the same gates before the commit was claimed: `vp run -r check`, `vp test --run`, `vp run -r build`, plus Playwright and a browser pass for anything visible. The changelog records the counts each time (1,496 tests at slice 1, 1,624 at the end of round 5, 2,209 after the review-21 implementation) and records the failures honestly, including which spec failed, whether it passed in isolation, and what was changed. It also records deliberate non-changes with reasons, which is why three years of decisions are re-readable.

---

## 6. The process observation: agents were too cautious with existing code and UI

This is stated in the record from several directions.

- **A gate was listed and skipped, and the regression shipped.** "The round-5 proposal listed 'keyboard walk on Library tabs, Tuner modes and Settings rows' as a gate. It was not done; the tab regression shipped." (`18-second-review.md` §D, Process gap)
- **Deferrals accumulated with good individual reasons.** P2.8 deferred native `<select>` to bits-ui Select ("high-churn, low-value") and `SegmentedControl` to ToggleGroup ("adds indirection and risks its `aria-pressed` a11y contract for a consistency-only gain"); `08-usability-plan.md` deferred collapsed setup cards; `07-review-fixes.md` deferred a list of drill variations. Each defensible. Together they left the audit ranking "starting a drill takes too long and looks like a settings page" as finding #1 a round later.
- **Known problems were re-documented instead of fixed.** The audit notes of the dead stat tiles: "The 09 design brief already called this out; it was not fixed." (`audit.md` §1.5)
- **Restyle rounds avoided touching behaviour, which left behaviour broken.** Rounds 1 to 5 were explicitly "restyle" slices with "Behaviour: none" on most entries. The defects the owner hit at the instrument (stuck pads, red that never clears, MIDI off after reload, quiet takes, the heartbeat) were all behaviour, and none of them were found by five rounds of visual work. `review-21/README.md` names this exactly: "Most of these were small, shared-component defects rather than design problems, and they were fixable in a day."
- **Permission was asked for before changing engines,** and the reviews were run as read-only by default. Review 21 records "Mid-review the owner allowed changes, so the confirmed defects with small fixes... were changed in the tree", and that single permission change is what let a day of real fixes land inside a review.
- **The last review brief pushes back on the caution explicitly**: "Do not stop at a list of ideas or ask for permission between ordinary research/design steps" and "Be candid about weak existing work and weak ideas, including your own." (`20-next-review-prompt.md`)
- **The counter-example worth noting.** Round 4's Spider slice deleted the step-chip list outright on a direct request, and round 3 deleted `ProgressionChartStage` once it had no consumer. Both were clean, and both were prompted by someone saying so rather than by an agent proposing it. The jazz decomposition is the one case where an agent caught its own redundancy mid-plan: a second jazz-scales drill was folded into the existing Scales drill and a planned ii-V-I progression drill was replaced by the non-redundant chord-scale drill, "two redundant ideas were caught and avoided" (`05-jazz-decomposition.md`).

### Related: distance from the hardware shaped everything

The record is consistent about where confidence ran out. Reviews were run without a MIDI device, without a microphone and without audio output; three of the owner's highest-priority items could only be closed by him, at the instrument, in five minutes. `review-21/findings.md` ends each hardware item with the exact capture needed rather than a claim, and the five-minute MPC recipe written for him is what finally closed O19 to O21 at 02:05 on 18 September.
