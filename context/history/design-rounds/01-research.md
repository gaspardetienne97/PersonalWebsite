# 01 — Research: How music apps structure their UIs

Two web-research passes: (A) top-level information architecture across 10 leading apps, (B) best-in-class UX per feature. Sources cited inline. Where a claim is from marketing/review pages rather than a hands-on teardown, it's flagged — IAs drift, so treat specifics as "recently documented."

## Decision trace (IA choice → research confidence → local rationale)

| IA decision | Research basis | Confidence | Local rationale |
|---|---|---|---|
| Split by **intent**, drop Learn/Play | Melodics Guided/Explore, EarMaster Course/Custom; Yousician's color-coded split is the documented failure | **High** (multi-source, incl. failure case) | The live nav literally files "Scales" under Learn but routes to `/play/scales` — the anti-pattern in our own code |
| **4 hubs** (Practice/Library/Create/Progress) | "3–5 top-level destinations; no hidden axes" | **High** | Today's ~30 sidebar links (17 in Play alone) is the sprawl the pattern warns against |
| **Practice = adaptive "Today"** as the differentiator | No researched app nails "what to practice next"; most just resume a path | **Medium** (it's a gap, not a proven pattern) | We already compute weak-spots (`analytics`, `buildDailyRoutinePlan`) — low cost to surface |
| **One chord/scale Reference** = the drill's preview | Soundslice "one slice, many containers"; EarMaster exercise-type reuse | **High** | Theory Library + Jazz "Chords & Scales" are two catalogs of the same data |
| **Merge Tuner + Intonation + Drone** | TonalEnergy puts tuner + drone + in-tune-% in one workflow | **High** | Both already mount the same `AudioPitchSource`/`CentsMeter` |
| **One Create editor** (Beat ⇄ Piano-roll) | BandLab dual-surface, shared transport | **High** | Studio + Piano Roll already share `scoreToMidiBlob`/`audio-export`/`scoreToPattern` |
| **Utilities drawer** for tools | "Quarantine tools into one surface OR attach to content — pick one" | **Medium-High** | Avoids Ultimate Guitar's "…"-buried-tools failure |
| **⌘K palette**, desktop-first | No researched app ships one — opportunity, not table stakes | **Low-Medium** (unproven in this space) | Desktop + hardware context (chosen) makes a palette natural; scope kept to jump-to + "Start Today" |
| Web MIDI **just-in-time + mic fallback** | Chrome 124+ prompt-gating; Safari/iOS lack Web MIDI (~78% support) | **High** (primary platform docs) | Client-only SvelteKit app — highest-leverage constraint |

---

## A. Information architecture & the Learn/Play problem

| App | Primary nav | Learn/Play separation | Notable |
|---|---|---|---|
| **Yousician** | Path · Workouts · Songs · Tools | Blurry — the Songs tab itself splits Play-songs vs Learn-songs by **background color** ([Songs tab](https://support.yousician.com/hc/en-us/articles/4419296476177-Songs-tab)) | **The cautionary twin of our problem.** But its **Tools tab** cleanly quarantines tuner/metronome ([Tools tab](https://support.yousician.com/hc/en-us/articles/4419296622993-Tools-tab)) |
| **Melodics** | **Guided · Explore** | **Cleanest split.** Same content, two intents; "Practice" is a *mode you enter on a lesson*, not a place ([Navigating](https://melodics.com/support-articles/support-navigating-learning), [Approach](https://support.melodics.com/en/articles/8051176-the-melodics-approach)) | The verbal frame our app is missing |
| **Soundslice** | Overview · **Practice** · Manager · Courses | **Practice = command center.** Any "slice" drops into a user-built practice list; reference and drill are the *same object* in different containers ([Practice lists](https://www.soundslice.com/blog/214/introducing-practice-lists/)) | Best "Practice tab" model |
| **EarMaster** | Course vs **Customized Exercise** | Same exercise type exists as a graded course step *and* a configurable custom drill — one engine, two framings ([support](https://www.earmaster.com/support/earmaster-cloud-support/earmaster-cloud-student-support.html)) | Reference-vs-drill done right |
| **flowkey** | Songs · Search · Courses | Radically flat; Search is first-class ([review](https://danhon.substack.com/p/flowkey-review)) | Flatness has a ceiling past beginner |
| **Moises** | Home · Library | Tools live **on the track**, not a global menu; AI "Sections" for looping ([pointers](https://help.moises.ai/hc/en-us/articles/8472666994076)) | Contextual tools, few top-level items |
| **TonalEnergy** | Tuner · Sound · Metro · Analysis | Pure tool app — each tab = one capability ([guide](https://www.tonalenergy.com/tet-user-guide-ios)) | Model for laying out tools w/o overlap |
| **Ultimate Guitar** | Explore · My Tabs · Courses · "…" | Tools buried under per-tab "…" overflow ([tour](https://help.ultimate-guitar.com/en/articles/6741319)) | Discoverability failure |
| **Simply Piano** | Course streams + Song Library | Parallel "Soloist/Chords" streams; Practice Mode auto-triggers on mistakes ([review](https://www.pianodreamers.com/simply-piano-review/)) | Practice as a modifier, not a tab |
| **Trala** | Home feed (Lessons tab *removed*) | Deliberately dropped a top-level tab to cut sprawl ([summary](https://www.educationalappstore.com/app/trala-learn-violin)) | Precedent for our merge |

### Distilled IA patterns we adopted
1. **Split by intent verb, not content type.** (Melodics, EarMaster) → kills our Learn/Play overlap. **Adopted.**
2. **One content object, many containers.** (Soundslice slices, EarMaster exercise types) → one chord/scale reference that's also the drill's preview. **Adopted.**
3. **A single Practice surface that's a command center, not a tool dump.** (Soundslice) → our Practice hub. **Adopted.**
4. **Practice is a *mode you enter on a drill*** (loop/slow/wait), not a separate place. (Melodics, Simply Piano) → Wait vs Performance modes already exist; keep.
5. **Quarantine pure tools into one surface OR attach to content — pick one.** → utilities drawer. **Adopted.**
6. **~3–5 top-level destinations; no hidden axes.** Sprawl comes from encoding meaning *inside* tabs. **Adopted (4 hubs).**
7. **Opportunity nobody nails: an adaptive "what should I practice" / ⌘K entry.** → our Today + command palette. **Adopted as the differentiator.**

---

## B. Per-feature UX patterns (best to borrow)

- **Ear training** — cadence → single prompt → big labeled answer buttons → **resolve-to-tonic feedback**, with a per-question progress strip (grey/blue/green/red) and an end % summary. (Functional Ear Trainer, EarMaster) ([FET](https://advancingmusician.com/functional-ear-trainer-app/), [EarMaster guide](https://www.earmaster.com/download/EM_userguide_english.pdf)) — generous hit targets (FET's buttons are too cramped).
- **Sight-reading** — a **moving cursor that lights each note in real time** on a scrolling staff; drag-to-loop that snaps to barlines; slow-down without pitch change; toggleable note-name/beat scaffolds; record → graded accuracy/timing. (Soundslice, Sight Reading Factory) ([Soundslice](https://www.soundslice.com/features/))
- **Tuner + intonation** — a big central target with **affective feedback** (in-tune indicator that grows the longer you hold), cents readout, an **in-tune % history bar**, and a **drone on the same screen** (tuner + drone are one workflow). (TonalEnergy) ([guide](https://www.tonalenergy.com/tet-user-guide-ios)) → validates merging Tuner+Intonation+Drone.
- **Jam / play-along** — chord chart as the central canvas with a moving bar highlight; per-instrument mixer to **mute the part you'll play**; loop-a-section + auto-tempo-increase + auto-transpose; record over the track. (iReal Pro, Moises) ([iReal Pro](https://www.irealpro.com/news/advanced-practicing-techniques), [Moises Sections](https://help.moises.ai/hc/en-us/articles/10138829000988))
- **Sequencer + piano-roll** — **dual-surface**: step-grid for beats, double-click-to-open piano roll for melody, **one persistent transport**, snap-to-grid, export WAV/MP3. (BandLab) ([guide](https://www.audeobox.com/learn/bandlab/)) → validates the one-editor Create surface.
- **Score follower** — **split screen** (notation above, highlighted keyboard below), **Wait Mode** (pauses until correct note), falling-notes with per-hand color, hand selection (L/R/both), slow+loop. (flowkey, Yousician) ([flowkey review](https://dynamicmusicroom.com/flowkey-review/), [Yousician notation](https://support.yousician.com/hc/en-us/articles/208678605))
- **Device/MIDI/mic** — **just-in-time permission** triggered by an explicit "Connect" action (Web MIDI is now prompt-gated, Chrome 124+), with a **mic fallback** because Safari/iOS lack Web MIDI (~78% support); show the connected device name + "play any key to test." ([Chrome](https://developer.chrome.com/blog/web-midi-permission-prompt), [MDN](https://developer.mozilla.org/en-US/docs/Web/API/Web_MIDI_API), [support](https://www.testmuai.com/learning-hub/web-midi-api-browser-support/))
- **Progress / streaks** — an "always one next thing" guided default (no blank dashboard), a **streak with a calendar heatmap** + **streak-freeze** safety valve, and a **forward-looking** overview separate from the trophy case. A **linear path beats a sprawling tree** for engagement. (Melodics, Duolingo) ([Melodics overview](https://support.melodics.com/en/articles/6777055), [streaks](https://support.melodics.com/en/articles/6777043))

### Cross-cutting motifs of the best music apps
1. One big central **"target / now-playing" focus** per screen.
2. **Persistent transport bar** across views.
3. A **moving cursor / live highlight** binding notation to sound.
4. **Loop-a-section + slow-down** as universal primitives.
5. **Immediate, affective feedback** (color, resolve-to-tonic, sharp/flat & early/late arrows).
6. **Wait/forgiving mode vs performance/graded mode.**
7. **Difficulty knobs surfaced up front** (tempo, range, key, enabled tones).
8. **Per-session progress visible at all times** + end-of-session % summary.
9. **"Always a next step" + streaks.**
10. **Just-in-time, low-friction device onboarding** with mic↔MIDI fallback.

> **Highest-leverage constraint for our client-only SvelteKit app:** motif #10 — Web MIDI permission gating + a mandatory mic fallback for Safari/iOS.

### Confidence notes
IAs are sourced from support docs / app-store / reviews, not current-build teardowns; tab counts drift. Several Soundslice/Yousician fetches hit 403s and rely on search summaries of those pages. Trala's "removed Lessons tab" is the lowest-confidence item. A fretboard/keyboard scale-tone overlay tied to the live chord (jam) is desirable but not directly confirmed in fetched sources.
