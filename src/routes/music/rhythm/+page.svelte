<script lang="ts">
  // Rhythm: tap the pulse, read a written pattern and tap it, or hear one and
  // tap it back (echo) or write it down (dictation). Every input counts: the
  // big tap button (pointer or Space), MIDI, microphone onsets.
  import { onDestroy } from "svelte";
  import { MediaQuery } from "svelte/reactivity";
  import { page } from "$app/state";
  import type { InputEvent } from "@repo/music-core";
  import { clamp } from "@repo/music-core";
  import { EAR_RHYTHM_LEVELS, earGroove, earRhythmPattern, GROOVE_LANES, GROOVE_LEVELS, grooveAsPattern, grooveKeys, type Groove, expandRhythm, pulseTargets, RHYTHM_LIMITS, RHYTHM_PATTERNS, rhythmPattern, rhythmSkills } from "@repo/music-core/content/rhythm";
  import { rng } from "@repo/music-core/content/random";
  import { catalogEntry, rhythmExerciseId } from "@repo/music-core/content/catalog";
  import { gradeOnsets, gradePattern, gradePulse, type PatternResult, type PulseResult } from "@repo/music-core/scoring/rhythm";
  import { timingVerdict } from "@repo/music-core/scoring/timing";
  import { timingBreakdown, timingRow } from "@repo/music-core/scoring/evidence";
  import { chroma, chromaToPcs } from "@repo/music-core/signal/chroma";
  import { grooveDictationLesson } from "@repo/music-core/lessons/tier1";
  import { rhythmLessons } from "@repo/music-core/lessons/reading";
  import DrillShell, { type DrillMode, type Phase, type RunContext, type SetupClause } from "$lib/music/components/DrillShell.svelte";
  import Choice from "$lib/music/components/Choice.svelte";
  import Stat from "$lib/music/components/Stat.svelte";
  import Verdict, { type VerdictKind } from "$lib/music/components/Verdict.svelte";
  import Results, { silentRun, type RunSummary } from "$lib/music/components/Results.svelte";
  import { btnPrimary, btnStage } from "$lib/music/components/ui";
  import { DrillSetup } from "$lib/music/setup.svelte";
  import { assistanceFor, capture, pct, runInstrument, runSource, type Capture } from "$lib/music/drill.svelte";
  import { practice } from "$lib/music/practice.svelte";
  import { audio, mic, settings } from "$lib/music/runtime";
  import Pads from "$lib/music/components/Pads.svelte";
  import DictationGrid from "$lib/music/drills/rhythm/DictationGrid.svelte";
  import RhythmGrid, { type GridHit, type GridVerdict } from "$lib/music/drills/rhythm/RhythmGrid.svelte";
  import RhythmNotation from "$lib/music/drills/rhythm/RhythmNotation.svelte";
  import TapKey from "$lib/music/drills/rhythm/TapKey.svelte";
  import DictationCompare from "$lib/music/drills/rhythm/DictationCompare.svelte";
  import type { GroupState } from "$lib/music/notation/NotationFrame.svelte";
  import { cellVerdict, demoNotes, echoTargetShown, lengthText, marksAsPattern, readPatterns, landedText, signedMs, spreadText, STROKE_MS, type Hit } from "$lib/music/drills/rhythm/rhythm";
  import { nextRun, tempoAnd } from "$lib/music/advance.svelte";

  const cfg = new DrillSetup("rhythm", { mode: "pulse", pattern: "eighths", beats: 4, mic: false as boolean, earLevel: "quarters-eighths", grooveLevel: "rock", target: true as boolean });
  const s = $derived(cfg.value);
  // A path step can ask for a tempo (?bpm=72); the practice strip owns tempo, so hand it over.
  {
    const q = Number(page.url.searchParams.get("bpm"));
    if (q) void settings.ready.then(() => settings.update({ bpm: clamp(q, RHYTHM_LIMITS.bpm[0], RHYTHM_LIMITS.bpm[1]) }));
  }
  const bpm = $derived(clamp(settings.value.bpm, RHYTHM_LIMITS.bpm[0], RHYTHM_LIMITS.bpm[1]));
  const beatMs = $derived(60000 / bpm);
  /** Echo and dictation: the pattern is heard, not read. */
  const echo = $derived(s.mode === "echo");
  const dictation = $derived(s.mode === "dictation");
  /** Groove dictation: a drum groove written on kick, snare and hat rows. */
  const groove = $derived(s.mode === "groove");
  /** The modes that end with writing the rhythm down. */
  const writes = $derived(dictation || groove);
  /** With the MPC on the practice strip, the stage is its pads instead of a Tap button. */
  const onPads = $derived(settings.value.activeInstrument === "mpc");
  const byEar = $derived(echo || writes);
  const grooveLevel = $derived(GROOVE_LEVELS.find((l) => l.id === s.grooveLevel) ?? GROOVE_LEVELS[0]);
  let grooveDef = $state.raw<Groove | null>(null);
  const pulse = $derived(s.mode !== "read-and-tap" && !byEar);
  const tab = $derived(byEar ? s.mode : pulse ? "pulse" : "read-and-tap");
  /** The trainer's modes, from the catalog: the title is their picker. */
  const MODES = catalogEntry("rhythm")?.modes ?? [];
  /** The microphone counts onsets only where something is tapped. */
  const listens = $derived(s.mic && !writes);
  const earLevel = $derived(EAR_RHYTHM_LEVELS.find((l) => l.id === s.earLevel) ?? EAR_RHYTHM_LEVELS[0]);
  // A new pattern each run; before the first, an example of the level (for the demo).
  let earDef = $state.raw<ReturnType<typeof earRhythmPattern> | null>(null);
  /** A new mode or level drops the last run's pattern, so the stage shows the level's example again. */
  function pick(patch: Partial<typeof s>) {
    earDef = null;
    grooveDef = null;
    cfg.set(patch);
  }
  const exampleGroove = $derived(earGroove(rng(7), grooveLevel.id));
  const earExample = $derived(groove ? grooveAsPattern(exampleGroove) : earRhythmPattern(rng(7), earLevel.id, { dictation }));
  const def = $derived(byEar ? (earDef ?? earExample) : (rhythmPattern(s.pattern) ?? RHYTHM_PATTERNS[0]));
  const plan = $derived(expandRhythm(def, { bpm }));
  const beats = $derived(clamp(Math.round(s.beats), RHYTHM_LIMITS.beats[0], RHYTHM_LIMITS.beats[1]));
  const entry = catalogEntry("rhythm")!;

  let phase = $state<Phase>("ready");
  let mode = $state<DrillMode>("practice");
  /** Echo in Practice with the target on: the rhythm is drawn faintly as it is heard, and the run counts as hinted. */
  const target = $derived(echoTargetShown(s.mode, s.target, mode));
  let status = $state("");
  let hits = $state.raw<Hit[]>([]);
  let downbeat = $state(0);
  let now = $state(0);
  let pulseResult = $state.raw<PulseResult | null>(null);
  let patternResult = $state.raw<PatternResult | null>(null);
  let summary = $state<RunSummary | null>(null);
  let run: ReturnType<typeof practice.beginRun> | null = null;
  let cap: Capture | null = null;
  let raf = 0;
  let stopClockRef: (() => void) | null = null;
  let timers: ReturnType<typeof setTimeout>[] = [];
  let unsubFrames: (() => void) | null = null;
  let frames: { at: number; wide: Float32Array; sr: number; pitched: boolean }[] = [];
  let pressed = $state(false);

  const targetsRel = $derived(pulse ? pulseTargets(beats, bpm) : plan.events.map((e) => e.atMs));
  const windowMs = $derived(pulse ? beatMs / 2 : plan.matchWindowMs);
  const endRel = $derived(pulse ? (beats - 1) * beatMs + beatMs * 0.75 : plan.lengthMs + plan.matchWindowMs);

  // ---------------------------------------------------------------------------
  // Input

  // Taps count from the count-in on: a first tap on the downbeat (or a hair early)
  // often lands before the shell's beat callback flips the phase to running.
  const live = $derived(phase === "running" || phase === "countin");

  function addHit(h: Hit) {
    if (!live || h.at < downbeat - windowMs) return;
    hits = [...hits, h].sort((a, b) => a.at - b.at);
  }

  function tap(at: number) {
    if (!listens) audio.drum(37, 0.5);
    pressed = true;
    setTimeout(() => (pressed = false), 90);
    addHit({ at, source: "onscreen" });
  }

  function onInput(e: InputEvent) {
    // A tapped on-screen pad (the MPC's surface) is a tap; it sounds its own drum.
    if (e.kind === "noteon" && e.source === "onscreen" && onPads) return addHit({ at: e.at, source: "onscreen" });
    if (e.kind === "noteon" && e.source === "midi") {
      const last = hits.at(-1);
      if (last?.source === "midi" && e.at - last.at <= STROKE_MS) {
        if (e.instrument !== "mpc") last.pcs = [...new Set([...(last.pcs ?? []), ((e.midi % 12) + 12) % 12])];
        return;
      }
      addHit({ at: e.at, source: "midi", pcs: e.instrument === "mpc" ? undefined : [((e.midi % 12) + 12) % 12] });
    } else if (e.kind === "onset" && e.source === "audio") {
      const h: Hit = { at: e.at, source: "audio" };
      addHit(h);
      // Pitch at a strum: chroma of a pitched frame just after the onset. A muted
      // stroke has no pitched frame, so it stays unpitched (and counts as a mute).
      if (def.chords && !pulse)
        timers.push(
          setTimeout(() => {
            const f = frames.find((x) => x.pitched && x.at >= e.at + 10 && x.at <= e.at + 160);
            if (f) h.pcs = chromaToPcs(chroma(f.wide, f.sr), 0.5);
          }, 180),
        );
    }
  }

  function onKey(e: KeyboardEvent) {
    // While writing, Space toggles the focused grid cell; it is not a tap.
    if (writes || !live || e.code !== "Space" || e.repeat) return;
    const t = e.target as HTMLElement | null;
    if (t?.closest("input, select, textarea, [contenteditable]")) return;
    e.preventDefault();
    tap(e.timeStamp || performance.now());
  }

  // ---------------------------------------------------------------------------
  // Run

  async function start(ctx: RunContext) {
    stopDemo();
    summary = null;
    pulseResult = null;
    patternResult = null;
    dictationResult = null;
    hits = [];
    downbeat = ctx.downbeat;
    stopClockRef = ctx.stopClock;
    if (byEar) {
      grooveDef = groove ? earGroove(Math.random, grooveLevel.id) : null;
      earDef = grooveDef ? { ...grooveAsPattern(grooveDef), cells: [] } : earRhythmPattern(Math.random, earLevel.id, { dictation });
      marks = {};
      writing = false;
    }
    // Listen from half a beat before the first downbeat (the response bar in an echo),
    // before the microphone starts, so a first tap is never missed.
    if (byEar && !writes) downbeat = ctx.downbeat + plan.lengthMs;
    // A dictation run never reaches finish(), so drop any listener it left behind.
    cap?.stop();
    cap = capture(downbeat - windowMs, onInput);
    if (listens) {
      const ok = await mic.start();
      if (!ok) {
        ctx.stopClock();
        cap?.stop();
        phase = "ready";
        status = mic.error || "The microphone could not start.";
        return;
      }
      frames = [];
      unsubFrames = mic.subscribeFrames((f) => {
        frames.push({ at: f.at, wide: f.wide, sr: f.sampleRate, pitched: !!f.pitch });
        if (frames.length > 24) frames.shift();
      });
    }
    const earMode = byEar ? entry.modes.find((m) => m.id === s.mode)! : null;
    run = practice.beginRun({
      exerciseId: earMode ? earMode.exerciseId : pulse ? entry.modes.find((m) => m.id === "pulse")!.exerciseId : rhythmExerciseId(def.id),
      setupKey: earMode ? `${s.mode}|${groove ? grooveLevel.id : earLevel.id}|${bpm}` : pulse ? `pulse|${beats}|${bpm}` : `pattern|${def.id}|${bpm}`,
      skillIds: earMode ? earMode.skillIds : rhythmSkills(pulse ? "pulse" : def.id),
      capabilities: ["rhythm"],
      modality: "tapped",
      assistance: assistanceFor(mode, target),
      // By ear, each rhythm level adds 0.08, so a path step can ask for a level or harder.
      difficulty: Math.min(0.95, 0.2 + (bpm - 40) / 300 + (pulse ? 0 : 0.15) + (groove ? GROOVE_LEVELS.indexOf(grooveLevel) * 0.1 : byEar ? EAR_RHYTHM_LEVELS.indexOf(earLevel) * 0.08 : 0)),
      params: byEar ? { mode: s.mode, level: groove ? grooveLevel.id : earLevel.id, bpm } : pulse ? { mode: "pulse", beats, bpm } : { mode: "read-and-tap", pattern: def.id, bpm },
    });
    if (byEar) {
      // The call: the pattern on its own sound, from the first downbeat, over the click.
      call = audio.playSequence(callNotes(false), { startPerf: ctx.downbeat });
      if (writes) {
        status = "Listen to the pattern. Mark the notes as you hear them, or once it ends.";
        timers.push(
          setTimeout(() => {
            ctx.stopClock();
            writing = true;
            status = "Mark every note you heard on the grid, then check it.";
          }, Math.max(0, ctx.downbeat + plan.lengthMs - performance.now() + 150)),
        );
        loop();
        return;
      }
      // Echo: your turn starts the bar after the pattern ends.
      downbeat = ctx.downbeat + plan.lengthMs;
      status = "Listen to the pattern. Tap it back in the next bars.";
      timers.push(setTimeout(() => phase === "running" && (status = "Your turn: tap it back."), Math.max(0, downbeat - performance.now())));
    }
    // Silent bars (gap click): stop the click where the schedule goes quiet.
    const silent = pulse ? undefined : plan.clicks.find((c) => !c.audible);
    if (silent) timers.push(setTimeout(() => ctx.stopClock(), Math.max(0, ctx.downbeat + silent.atMs - performance.now() - 20)));
    if (!echo) status = pulse ? `Tap ${beats} beats with the click.` : `Tap the pattern: ${def.label}.`;
    loop();
  }

  function loop() {
    cancelAnimationFrame(raf);
    const tick = () => {
      if (phase !== "running" && phase !== "countin") return;
      now = performance.now();
      // A dictation is written, not tapped: the clock only moves the playhead while it plays.
      if (writes) {
        if (!writing) raf = requestAnimationFrame(tick);
        return;
      }
      if (now > downbeat + endRel) return void finish();
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
  }

  function teardown() {
    cancelAnimationFrame(raf);
    call?.stop();
    call = null;
    againAt = null;
    timers.forEach(clearTimeout);
    timers = [];
    cap?.stop();
    unsubFrames?.();
    unsubFrames = null;
    stopClockRef?.();
    stopClockRef = null;
    if (mic.state === "on") mic.stop();
  }

  const directionText = (r: PulseResult) =>
    r.direction === "ahead"
      ? `${Math.round(-r.meanErrorMs)} ms early`
      : r.direction === "behind"
        ? `${Math.round(r.meanErrorMs)} ms late`
        : `on the click (${signedMs(r.meanErrorMs)})`;

  async function finish() {
    if (phase !== "running" && phase !== "countin") return;
    const notes = cap?.notes ?? [];
    teardown();
    phase = "results";
    const taken = hits;
    const src = runSource(taken.map((h) => ({ source: h.source })));
    const instrument = taken.some((h) => h.source === "midi") && taken.every((h) => h.source === "midi") ? runInstrument(notes) : undefined;
    if (pulse) {
      const r = gradePulse(
        taken.map((h) => h.at),
        targetsRel.map((t) => downbeat + t),
        beatMs,
      );
      pulseResult = r;
      // The Tap button does not go through the input router, so the taps say whether anything was played.
      await run!.attempt({ promptId: `pulse-${beats}`, correct: r.correct, partialCredit: r.score, metrics: r.metrics, source: src, instrument: instrument ?? null, heard: taken.length > 0 });
      const fin = await run!.finish({ score: r.score, correct: r.correct, headline: `${pct(r.score)}, ${r.direction}` });
      if (!fin.heard) return silent();
      const timing = timingBreakdown(perHit.map((h) => h.error), POCKET_MS);
      summary = {
        // The count comes from the same breakdown the bars draw; the lean is said after it.
        headline: !r.matched
          ? "No taps landed on the beats. Tap the big button, press Space, or play any key."
          : `${landedText(timing, "beats")}${
              r.direction === "ahead"
                ? ` You rushed, ${Math.round(-r.meanErrorMs)} ms ahead of the click on average: let the beat come to you.`
                : r.direction === "behind"
                  ? ` You dragged, ${Math.round(r.meanErrorMs)} ms behind the click on average: lean in a little.`
                  : ` ${Math.round(r.meanAbsErrorMs)} ms off on average.`
            }`,
        metric: pct(r.score),
        metricLabel: "timing",
        timing: r.matched ? timing : undefined,
        delta: fin.delta,
        best: fin.best,
        clean: r.correct && mode === "check",
        cleanMeans: "a timing score of 85% or more",
        xp: fin.xp,
        mode,
        rows: [
          { label: "Beats hit", value: beats ? r.matched / beats : 0, text: `${r.matched} of ${beats}` },
          // The signed lean, apart from the headline's unsigned "ms off": ahead, behind or centred.
          { label: "On average", text: r.matched ? directionText(r) : "No taps" },
          { label: "Varies by", text: r.matched > 1 ? spreadText(r.jitterMs) : "Needs two taps" },
          { label: "Extra taps", text: String(r.extra) },
        ],
        advance: await advanceAfter(r.score, r.correct),
        routine: page.url.searchParams.get("routine") ? { label: "Back to today's plan", href: "/music" } : undefined,
      };
    } else {
      const r = gradePattern(def, taken, { startAt: downbeat, beatMs });
      patternResult = r;
      await run!.attempt({ promptId: def.id, correct: r.correct, partialCredit: r.score, metrics: r.metrics, source: src, instrument: instrument ?? null, heard: taken.length > 0 });
      const fin = await run!.finish({ score: r.score, correct: r.correct, headline: pct(r.score) });
      if (!fin.heard) return silent();
      const total = r.grid.length;
      const errors = r.grid.map((g) => g.errorMs ?? null);
      const timing = timingBreakdown(errors, POCKET_MS);
      const slips = [r.restHits ? `${r.restHits} tap${r.restHits > 1 ? "s" : ""} in a rest` : "", r.extra ? `${r.extra} extra` : ""].filter(Boolean);
      summary = {
        // "8 of 8 notes tapped, 7 on time, 1 late.": the count and the breakdown are one array.
        headline: `${landedText(timing, "notes", "tapped").slice(0, -1)}${slips.length ? `; ${slips.join(", ")}` : ""}.`,
        metric: pct(r.score),
        metricLabel: "score",
        timing: r.matched ? timing : undefined,
        delta: fin.delta,
        best: fin.best,
        clean: r.correct && mode === "check",
        cleanMeans: "a score of 85% or more",
        xp: fin.xp,
        mode,
        hinted: target,
        rows: [
          timingRow(errors.filter((e): e is number => e !== null), total, plan.matchWindowMs, "Timing", POCKET_MS),
          // The timing bars count the missed notes; without them (nothing landed) the row says it.
          ...(r.matched ? [] : [{ label: "Missed notes", text: String(r.missed) }]),
          { label: "Taps in rests", text: String(r.restHits) },
          { label: "Extra taps", text: String(r.extra) },
          ...(def.chords?.length
            ? [
                r.chords
                  ? { label: "Chords", text: r.chords.map((c) => `${c.symbol} ${c.held ? "held" : "missed"}`).join(", ") }
                  : { label: "Chords", text: "Timing only: no pitch was heard" },
              ]
            : []),
        ],
        advance: await advanceAfter(r.score, r.correct),
        routine: page.url.searchParams.get("routine") ? { label: "Back to today's plan", href: "/music" } : undefined,
      };
    }
    status = summary.headline;
  }

  /** Nothing was heard: drop the grade, so the stage stays neutral (an unmeasured run is not a failed one). */
  function silent() {
    pulseResult = null;
    patternResult = null;
    summary = silentRun();
    status = summary.headline;
  }

  /** Tempo climbs to 120, then the next pattern or level: strums move through the strums, other patterns through the rest. */
  function advanceAfter(score: number, correct: boolean) {
    const run = { score, correct };
    const base = { bpm, tempo: { min: RHYTHM_LIMITS.bpm[0], goal: 120, max: RHYTHM_LIMITS.bpm[1] } };
    if (pulse) return nextRun(`rhythm.pulse.${beats}`, base, run);
    if (groove) return nextRun("rhythm.groove", { ...base, steps: GROOVE_LEVELS.map((l) => ({ label: l.title })), step: GROOVE_LEVELS.indexOf(grooveLevel) }, run, tempoAnd((i) => cfg.set({ grooveLevel: GROOVE_LEVELS[i].id })));
    if (byEar) return nextRun(`rhythm.${s.mode}`, { ...base, steps: EAR_RHYTHM_LEVELS.map((l) => ({ label: l.title })), step: EAR_RHYTHM_LEVELS.indexOf(earLevel) }, run, tempoAnd((i) => cfg.set({ earLevel: EAR_RHYTHM_LEVELS[i].id })));
    const strum = !!def.chords?.length;
    // Strums move through this instrument's strums only.
    const list = RHYTHM_PATTERNS.filter((p) => !!p.chords?.length === strum && (!strum || p.id.split("-")[0] === def.id.split("-")[0]));
    return nextRun(`rhythm.${strum ? "strum" : "read"}`, { ...base, steps: list.map((p) => ({ label: p.label })), step: Math.max(0, list.findIndex((p) => p.id === def.id)) }, run, tempoAnd((i) => cfg.set({ pattern: list[i].id })));
  }

  // ---------------------------------------------------------------------------
  // Dictation: mark the onsets on a grid, a box per eighth (or sixteenth).

  let call: { stop(): void } | null = null;
  let writing = $state(false);
  /** Marks per row: one row ("notes") for a rhythm, kick, snare and hat for a groove. */
  let marks = $state<Record<string, boolean[]>>({});
  let dictationResult = $state.raw<ReturnType<typeof gradeOnsets> | null>(null);
  const grid = $derived(groove ? { perBeat: grooveLevel.perBeat, beatsPerBar: 4 } : earLevel);
  const rows = $derived(groove ? GROOVE_LANES.map((l) => ({ id: l.id as string, label: l.label })) : [{ id: "notes", label: "" }]);
  // Where the notes are written (swing is written straight), which is what a dictation marks.
  const heardBeats = $derived(byEar && earDef ? earDef.written : def.events.map((e) => e.beat));
  const heardIn = (row: string) => (grooveDef ? grooveDef.lanes[row as keyof Groove["lanes"]] : heardBeats);
  const isHeard = (row: string, i: number) => heardIn(row).some((b) => Math.abs(b - i / grid.perBeat) < 1e-6);
  const markedIn = (row: string) => (marks[row] ?? []).flatMap((on, i) => (on ? [i / grid.perBeat] : []));

  /** The call: the pattern on its own sound, or the groove on the drums; with clicks for a replay. */
  function callNotes(withClicks: boolean) {
    const clicks = demoNotes(plan).filter((n) => n.voice === "click");
    const g = grooveDef ?? (groove ? exampleGroove : null);
    const sounds = g
      ? GROOVE_LANES.flatMap((l) =>
          g.lanes[l.id].map((b) => ({ midi: l.midi, time: (b * beatMs) / 1000, duration: 0.1, velocity: l.id === "hat" ? 0.5 : 0.9, voice: "drum" as const, event: -1 })),
        )
      : demoNotes(plan).filter((n) => n.voice !== "click");
    return withClicks ? [...clicks, ...sounds] : sounds;
  }

  /** When "Hear it again" started (the performance clock), while it plays; the grid's playhead runs from it. */
  let againAt = $state<number | null>(null);
  function hearAgain() {
    stopDemo();
    call?.stop();
    const h = audio.playSequence(callNotes(true));
    call = h;
    againAt = h.startPerf;
    cancelAnimationFrame(raf);
    const tick = () => {
      now = performance.now();
      if (call !== h || !writing || now - h.startPerf > plan.lengthMs) return void (againAt = null);
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
  }

  async function checkDictation() {
    if (!run || !writing) return;
    const expected = grooveDef ? grooveKeys(grooveDef.lanes) : heardBeats;
    const answered = grooveDef ? grooveKeys(Object.fromEntries(rows.map((r) => [r.id, markedIn(r.id)]))) : markedIn("notes");
    // An empty grid is not an answer: nothing to grade or save yet.
    if (!answered.length) {
      status = "Mark the notes you heard on the grid first.";
      return;
    }
    writing = false;
    call?.stop();
    cap?.stop();
    cap = null;
    const r = gradeOnsets(expected, answered);
    dictationResult = r;
    phase = "results";
    await run.attempt({ promptId: def.id, correct: r.correct, partialCredit: r.score, metrics: r.metrics, source: "click", target: expected.join(" "), response: answered.join(" "), instrument: null, heard: true });
    const fin = await run.finish({ score: r.score, correct: r.correct, headline: pct(r.score) });
    const right = answered.filter((b) => expected.some((h) => Math.abs(h - b) < 1e-6)).length;
    const what = groove ? "hits" : "notes";
    summary = {
      headline: r.correct ? `All ${expected.length} ${what} written right.` : `${right} of ${expected.length} ${what} right${answered.length > right ? `, ${answered.length - right} extra` : ""}.`,
      metric: pct(r.score),
      metricLabel: "score",
      delta: fin.delta,
      best: fin.best,
      clean: r.correct && mode === "check",
      cleanMeans: `every ${groove ? "hit" : "note"} written right, nothing extra`,
      xp: fin.xp,
      mode,
      rows: [
        ...(groove
          ? rows.map((row) => {
              const want = heardIn(row.id);
              const got = markedIn(row.id).filter((b) => want.some((h) => Math.abs(h - b) < 1e-6)).length;
              return { label: row.label, value: want.length ? got / want.length : 1, text: `${got} of ${want.length}` };
            })
          : [{ label: "Notes found", value: expected.length ? right / expected.length : 0, text: `${right} of ${expected.length}` }]),
        { label: "Extra marks", text: String(answered.length - right) },
      ],
      advance: await advanceAfter(r.score, r.correct),
      routine: page.url.searchParams.get("routine") ? { label: "Back to today's plan", href: "/music" } : undefined,
    };
    status = summary.headline;
  }

  function stop() {
    teardown();
    writing = false;
    phase = "ready";
    status = "Stopped. Nothing was recorded.";
  }

  // ---------------------------------------------------------------------------
  // Demo: the pattern (or pulse) with the notation lit as it sounds.

  let demo = $state.raw<{ stop(): void; playing: boolean } | null>(null);
  let lit = $state<number | null>(null);
  async function playDemo() {
    if (demo?.playing) return stopDemo();
    await audio.unlock();
    const notes = pulse
      ? targetsRel.flatMap((t, i) => [
          { midi: 0, time: t / 1000, duration: 0.05, velocity: i % 4 === 0 ? 1 : 0.6, voice: "click" as const, event: -1 },
          { midi: 37, time: t / 1000, duration: 0.1, velocity: 0.7, voice: "drum" as const, event: i },
        ])
      : groove
        ? callNotes(true)
        : demoNotes(plan);
    const h = audio.playSequence(notes, { onNote: (i) => notes[i].event >= 0 && (lit = notes[i].event) });
    demo = h;
    status = "Listen: the pattern lights as it sounds. Not scored.";
    void h.done.then(() => {
      if (demo === h) stopDemo();
    });
  }
  function stopDemo() {
    demo?.stop();
    demo = null;
    lit = null;
  }

  onDestroy(() => {
    teardown();
    stopDemo();
  });

  // ---------------------------------------------------------------------------
  // What the grid draws

  const hidden = $derived(byEar && phase !== "results");
  /** The call's notes that have sounded so far: what the faint target shows while an echo runs. */
  const heardSoFar = $derived(target && phase === "running" ? plan.events.filter((e) => now >= downbeat - plan.lengthMs + e.atMs).length : 0);
  const gridEvents = $derived(hidden ? plan.events.slice(0, heardSoFar).map((e) => ({ beat: e.beat, accent: e.accent })) : pulse ? targetsRel.map((_, i) => ({ beat: i, accent: i % 4 === 0 })) : plan.events.map((e) => ({ beat: e.beat, accent: e.accent, stroke: e.stroke, duration: e.durationMs ? e.durationMs / beatMs : undefined })));
  const bars = $derived(pulse ? Math.ceil(beats / 4) : plan.bars);
  const perBar = $derived(pulse ? 4 : def.meter.beats);
  const chordMarks = $derived(pulse ? [] : plan.chords.map((c) => ({ symbol: c.symbol, startBeat: c.startMs / beatMs })));
  /** On time within this many ms either side: the grader's pocket, the chips' and the bars' line. */
  const POCKET_MS = 15;
  /** The strip plot's reach either side of the click; a tap further off pins to its edge. */
  const STRIP_MS = 100;
  const toBeat = (at: number) => (at - downbeat) / beatMs;

  /** A tap against the nearest target in its window: ms off (+ late, - early), or null when none is near. */
  function offset(at: number): number | null {
    const rel = at - downbeat;
    let best: number | null = null;
    for (const t of targetsRel) if (Math.abs(rel - t) <= windowMs && (best === null || Math.abs(rel - t) < Math.abs(rel - best))) best = t;
    return best === null ? null : rel - best;
  }

  function liveKind(at: number): GridHit["kind"] {
    const e = offset(at);
    if (e !== null) return timingVerdict(e);
    const rel = at - downbeat;
    return !pulse && plan.rests.some((r) => rel >= r.startMs && rel < r.endMs) ? "rest" : "extra";
  }

  /** The last tap as a verdict word, with how far off it was. */
  function lastTap(at: number): { kind: VerdictKind; text: string } {
    const k = liveKind(at);
    const e = offset(at);
    const ms = e === null ? "" : ` ${Math.round(Math.abs(e))} ms`;
    if (k === "pocket") return { kind: "ontime", text: "On time" };
    if (k === "early" || k === "late") return { kind: k, text: `${k === "early" ? "Early" : "Late"}${ms}` };
    return { kind: "wrong", text: k === "rest" ? "In a rest" : "Extra tap" };
  }
  /** Practice marks each tap as it lands; Check stays quiet until the end. */
  const tapVerdict = $derived(phase === "running" && mode === "practice" && !writes && hits.length ? lastTap(hits.at(-1)!.at) : null);

  const gridHits = $derived.by((): GridHit[] => {
    if (phase === "results" && patternResult)
      return [
        ...patternResult.hits.map((h): GridHit => {
          const g = patternResult!.grid.find((x) => x.at === h.at);
          return { beat: toBeat(h.at), kind: h.kind === "matched" && g && g.verdict !== "missed" ? g.verdict : h.kind === "rest" ? "rest" : "extra" };
        }),
        // A note with no tap: a hollow ring where the tap should have been.
        ...patternResult.grid.flatMap((g, i): GridHit[] => (g.verdict === "missed" && plan.events[i] ? [{ beat: plan.events[i].beat, kind: "missed" }] : [])),
      ];
    if (phase === "results" && pulseResult) return hits.map((h) => ({ beat: toBeat(h.at), kind: pulseResult!.metrics.some((m) => m.kind === "timing" && m.actualMs === h.at) ? liveKind(h.at) : "extra" }));
    if (phase === "running" && mode === "practice")
      return [
        ...hits.map((h): GridHit => ({ beat: toBeat(h.at), kind: liveKind(h.at) })),
        // Pulse: a beat whose window has passed with no tap gets the missed ring under it.
        ...(pulse ? targetsRel.flatMap((t, i): GridHit[] => (now - downbeat > t + windowMs && !hits.some((h) => Math.abs(h.at - downbeat - t) <= windowMs) ? [{ beat: i, kind: "missed" }] : [])) : []),
      ];
    return [];
  });
  const verdicts = $derived.by((): (GridVerdict | undefined)[] => {
    if (patternResult) return patternResult.grid.map((g) => g.verdict);
    if (pulseResult)
      return targetsRel.map((t) => {
        const m = pulseResult!.metrics.find((x) => x.kind === "timing" && Math.abs(x.expectedMs - (downbeat + t)) < 1);
        return m && m.kind === "timing" ? timingVerdict(m.errorMs) : "missed";
      });
    return [];
  });
  const perHit = $derived.by(() => {
    if (pulseResult)
      return targetsRel.map((t, i) => {
        const m = pulseResult!.metrics.find((x) => x.kind === "timing" && Math.abs(x.expectedMs - (downbeat + t)) < 1);
        return { label: `Beat ${i + 1}`, error: m && m.kind === "timing" ? m.errorMs : null };
      });
    if (patternResult) return patternResult.grid.map((g, i) => ({ label: `Note ${i + 1}${g.stroke ? `, ${g.stroke}` : ""}`, error: g.errorMs ?? null }));
    return [];
  });
  const anyMissed = $derived(perHit.some((h) => h.error === null));
  /** The marks under the beat line need their key: while Practice marks taps, and after a graded run. */
  const showKey = $derived((phase === "running" && mode === "practice" && !writes) || (phase === "results" && !!(pulseResult || patternResult)));
  /**
   * Read and tap colours each written note: lit as the demo plays it; in
   * Practice green once a tap lands in its window and red once the window
   * passes without one; after a run, every note by the grade. Check shows
   * nothing until the end.
   */
  const noteStates = $derived.by((): Record<number, GroupState> => {
    if (phase === "results" && patternResult) return Object.fromEntries(patternResult.grid.map((g, i) => [i, g.verdict === "missed" ? "wrong" : "correct"]));
    if (demo?.playing && lit !== null) return { [lit]: "active" };
    if (phase !== "running" || mode !== "practice") return {};
    const out: Record<number, GroupState> = {};
    plan.events.forEach((e, i) => {
      if (hits.some((h) => Math.abs(h.at - downbeat - e.atMs) <= windowMs)) out[i] = "correct";
      else if (now - downbeat > e.atMs + windowMs) out[i] = "wrong";
    });
    return out;
  });
  /** The pattern the staff could not engrave falls back to the beat line. */
  let unwritten = $state<string | null>(null);
  const reduceMotion = new MediaQuery("(prefers-reduced-motion: reduce)");
  /**
   * Where the click is on the drawn bars while a run plays. Reading and Pulse show
   * it in Practice only; by ear it is time, not the pattern, so it runs in Check
   * too, over the call and then (an echo) over your turn. With reduced motion it
   * steps a beat at a time instead of sliding.
   */
  const clockBeat = $derived.by(() => {
    if (phase !== "running" || (!byEar && mode !== "practice") || (writes && writing)) return null;
    const from = echo && now < downbeat ? downbeat - plan.lengthMs : downbeat;
    const b = (now - from) / beatMs;
    if (b < 0 || b >= bars * perBar) return null;
    const still = reduceMotion.current || document.documentElement.hasAttribute("data-reduce-motion");
    return still ? Math.floor(b) : b;
  });
  const playhead = $derived(demo?.playing && lit !== null ? (gridEvents[lit]?.beat ?? null) : clockBeat);
  /** The dictation grid's playhead: over the call as it first plays, and again over each "Hear it again". */
  const writePlayhead = $derived.by(() => {
    if (againAt === null) return writes && !writing ? clockBeat : null;
    const b = (now - againAt) / beatMs;
    if (b < 0 || b >= bars * perBar) return null;
    return reduceMotion.current || document.documentElement.hasAttribute("data-reduce-motion") ? Math.floor(b) : b;
  });
  /** A dictation's notation: your marks as notes while you write, what was played once checked. */
  const shownWritten = $derived(dictationResult && earDef ? earDef : marksAsPattern(phase === "ready" ? [] : markedIn("notes"), plan.bars, grid.beatsPerBar));
  let unwrittenMarks = $state<string | null>(null);
  /** What to do now, beside Stop on a phone: the count-in, then where the run is. */
  const cue = $derived.by(() => {
    if (phase === "countin") return "Count-in: play on the next 1";
    if (phase !== "running") return "";
    if (writes) return writing ? `Mark every ${groove ? "hit" : "note"}, then check` : "Listen";
    if (echo) return now >= downbeat ? "Your turn: tap it back" : "Listen";
    // Pulse and reading: the HUD counts the bar and the beat, and the phone keeps its height for the Tap button.
    return "";
  });
  /** Nothing was heard: the stage stays neutral and says so. */
  const unheard = $derived(phase === "results" && summary?.heard === false);

  const summaryLine = $derived<SetupClause[]>([
    byEar ? { text: (groove ? grooveLevel : earLevel).title, focus: "level" } : pulse ? { text: lengthText(beats, 4), focus: "beats" } : { text: def.label, focus: "pattern" },
    ...(pulse ? [] : [{ text: `${plan.bars} bar${plan.bars > 1 ? "s" : ""}` }]),
    ...(listens ? [{ text: "microphone on", focus: "mic" }] : []),
    ...(target ? [{ text: "faint target", focus: "target" }] : []),
  ]);
  /**
   * Practice and Check in the shared two lines. By ear the pattern is never on screen until the end in
   * either mode, so Practice names its one hint instead of "Hints shown".
   */
  const CHECK_NOTE = "No hints. Counts in your skill scores.";
  const modeNotes = $derived(
    echo
      ? { practice: s.target ? "The rhythm shows faintly as you hear it: a hint. Turn it off in Setup." : "Taps marked as you play. Clean runs move you on.", check: CHECK_NOTE }
      : writes
        ? { practice: "Hear it again any time. Clean runs move you on.", check: CHECK_NOTE }
        : undefined,
  );
</script>

<svelte:head><title>Rhythm | Woodshed</title></svelte:head>
<svelte:window onkeydown={onKey} />

<!-- The run drawn: the score marked note by note, every beat's offset, a dictation's comparison. -->
{#snippet runFigure()}
  <div class="grid gap-3">
    {#if patternResult && !byEar && unwritten !== def.id}
      <!-- The written rhythm again, each note marked by its grade (on the stage panel, as it was read). -->
      <figure class="stage rounded-2xl p-3">
        <RhythmNotation pattern={def} cursorBeat={null} states={noteStates} hits={gridHits} label={`${def.label}, each note marked: green on time or close, red missed`} />
      </figure>
    {:else if patternResult && echo}
      <!-- The rhythm you echoed, drawn at last, with your taps marked under it. -->
      <figure class="stage rounded-2xl p-3 sm:p-4">
        <figcaption class="mb-2 text-sm font-semibold text-ws-stage-soft">The rhythm you heard, and your taps</figcaption>
        <RhythmGrid {bars} {perBar} events={gridEvents} rests={def.rests} hits={gridHits} {verdicts} label={`${def.label}, ${plan.events.length} notes, each tap marked under it`} />
        <TapKey missed={anyMissed} />
      </figure>
    {/if}
    {#if perHit.length && summary?.heard !== false && pulse}
      <!-- Every beat's offset on one strip: up is late, down is early, the band is on time. Off ones are named under it. -->
      {@const off = perHit.flatMap((h, i) => (h.error === null || timingVerdict(h.error) !== "pocket" ? [{ ...h, i }] : []))}
      <section class="rounded-2xl border border-ws-line bg-ws-surface p-4" aria-labelledby="every-hit">
        <h3 id="every-hit" class="font-display text-base font-semibold">Every beat, in ms from the click</h3>
        <div class="mt-3 flex gap-2">
          <div class="flex h-20 flex-col justify-between text-sm text-ws-soft" aria-hidden="true"><span>Late</span><span>Early</span></div>
          <ol class="strip min-w-0 flex-1" style:--n={perHit.length} aria-label="Every hit">
            {#each perHit as h, i (i)}
              {@const v = h.error === null ? "missed" : timingVerdict(h.error)}
              {@const y = h.error === null ? 0 : Math.max(-1, Math.min(1, h.error / STRIP_MS))}
              <li class="col" data-v={v}>
                <span class="sr-only">{h.label}: {h.error === null ? "missed" : `${signedMs(h.error)}, ${v === "early" ? "early" : v === "late" ? "late" : "on time"}`}</span>
                <span class="track" aria-hidden="true">
                  {#if h.error !== null && v !== "pocket"}<span class="bar" style:height="{Math.abs(y) * 50}%" style:top={y < 0 ? "50%" : undefined} style:bottom={y > 0 ? "50%" : undefined}></span>{/if}
                  <svg viewBox="-6 -6 12 12" class="glyph" style:top="{50 - y * 50}%">
                    {#if v === "early"}<path class="chev" d="M1 -5 L-4 0 L1 5 M5 -5 L0 0 L5 5" />{:else if v === "late"}<path class="chev" d="M-1 -5 L4 0 L-1 5 M-5 -5 L0 0 L-5 5" />{:else if v === "pocket"}<path class="tick" d="M-4.5 0 L-1.5 3.5 L4.5 -4" />{:else}<circle r="4.5" class="hollow" />{/if}
                  </svg>
                </span>
                <!-- On a phone 16 numbers do not fit: every bar's first beat and every off beat keep theirs. -->
                <span class="num tnum {v === 'pocket' && i % 4 !== 0 ? 'max-sm:invisible' : ''}" aria-hidden="true">{i + 1}</span>
              </li>
            {/each}
          </ol>
        </div>
        <p class="mt-2 text-sm text-ws-soft">
          {#if off.length}
            {off.map((h) => `${h.label} ${h.error === null ? "missed" : `${h.error > 0 ? "late" : "early"} by ${Math.round(Math.abs(h.error))} ms`}`).join(", ")}. The band is on time, within {POCKET_MS} ms.
          {:else}
            Every beat within {POCKET_MS} ms of the click.
          {/if}
        </p>
      </section>
    {:else if perHit.length && summary?.heard !== false}
      <!-- Every note and how far its tap sat from the click: + late, − early. Off ones stand out. -->
      <section class="rounded-2xl border border-ws-line bg-ws-surface p-4" aria-labelledby="every-hit">
        <h3 id="every-hit" class="font-display text-base font-semibold">Every note, in ms from the click</h3>
        <p class="text-sm text-ws-soft">+ is late, − is early. Within {POCKET_MS} ms counts as on time.</p>
        <ol class="mt-3 grid grid-cols-2 gap-1.5 sm:grid-cols-4 lg:grid-cols-8" aria-label="Every hit">
          {#each perHit as h, i (i)}
            {@const v = h.error === null ? "missed" : timingVerdict(h.error)}
            <li class="chip tnum" data-v={v}>
              <span class="text-sm text-ws-soft">{h.label}</span>
              <span class="flex items-center gap-1.5 whitespace-nowrap font-semibold">
                <svg viewBox="-6 -6 12 12" class="glyph" aria-hidden="true">
                  {#if v === "early"}<path class="chev" d="M1 -5 L-4 0 L1 5 M5 -5 L0 0 L5 5" />{:else if v === "late"}<path class="chev" d="M-1 -5 L4 0 L-1 5 M-5 -5 L0 0 L-5 5" />{:else if v === "pocket"}<path class="tick" d="M-4.5 0 L-1.5 3.5 L4.5 -4" />{:else}<circle r="4.5" class="hollow" />{/if}
                </svg>
                {h.error === null ? "Missed" : `${signedMs(h.error).replace(" ms", "")}, ${v === "early" ? "early" : v === "late" ? "late" : "on time"}`}
              </span>
            </li>
          {/each}
        </ol>
      </section>
    {/if}
    {#if dictationResult && summary?.heard !== false}
      <DictationCompare bars={plan.bars} {rows} perBeat={grid.perBeat} beatsPerBar={grid.beatsPerBar} heard={isHeard} marked={(row, i) => !!marks[row]?.[i]} />
    {/if}
  </div>
{/snippet}

<DrillShell
  lesson={groove ? { lessons: [grooveDictationLesson()] } : echo || dictation ? { lessons: rhythmLessons(echo ? "echo" : "dictation", earLevel.id) } : null}
  title="Rhythm"
  hue="rhythm"
  blurb={echo
    ? "Hear a rhythm over the click, then tap it back in the bars after it."
    : groove
      ? "Hear a drum groove over the click, then put its kick, snare and hats on the grid."
      : dictation
      ? "Hear a rhythm over the click, then mark where every note fell."
      : pulse
        ? "Tap the beat with the click. You'll see whether you sit ahead, behind or in the middle."
        : "Read the rhythm and tap it. Rests are part of the music: a tap in one costs points."}
  summary={summaryLine}
  trainer={{ options: MODES, value: tab, onpick: (v) => pick({ mode: v }) }}
  {modeNotes}
  bind:phase
  bind:mode
  bind:status
  progress={phase === "running" ? clamp((now - downbeat) / endRel, 0, 1) : 0}
  clock={{ bpm, beatsPerBar: pulse ? 4 : def.meter.beats }}
  ondemo={playDemo}
  demoPlaying={!!demo?.playing}
  onstart={start}
  onstop={stop}
  listens={!writes}
  instrumentFree={writes}
  {cue}
  step={writes && (writing || phase === "running") ? { label: groove ? "Check my groove" : "Check my rhythm", run: checkDictation, disabled: !writing } : null}
>
  {#snippet setup()}
    <div class="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {#if groove}
        <Choice label="Grooves" setupKey="level" options={GROOVE_LEVELS.map((l) => ({ value: l.id, label: l.title, detail: `${l.bars} bar${l.bars > 1 ? "s" : ""}` }))} value={grooveLevel.id} onchange={(v) => pick({ grooveLevel: v })} />
      {:else if byEar}
        <Choice
          label="Rhythms"
          setupKey="level"
          options={EAR_RHYTHM_LEVELS.map((l, i) => ({
            value: l.id,
            label: l.title,
            detail: `Level ${i + 1}`,
            hint: dictation && l.perBeat !== 3 && l.cells.includes("triplet") ? "In dictation the triplets stay out: the grid has no place for them." : undefined,
          }))}
          value={earLevel.id}
          onchange={(v) => pick({ earLevel: v })}
        />
      {:else if pulse}
        <Choice label="Length" setupKey="beats" options={[4, 8, 16].map((n) => ({ value: n, label: `${n} beats` }))} value={beats} onchange={(v) => cfg.set({ beats: v })} />
      {:else}
        <Choice label="Pattern" setupKey="pattern" select options={readPatterns(settings.value.activeInstrument)} value={def.id} onchange={(v) => cfg.set({ pattern: v })} />
      {/if}
      {#if echo}
        <Choice
          label="Target"
          setupKey="target"
          options={[
            { value: "on", label: "Faint", hint: "In Practice the rhythm is drawn faintly as you hear it. The run counts as hinted." },
            { value: "off", label: "Off", hint: "Nothing is drawn until the end." },
          ]}
          value={s.target ? "on" : "off"}
          onchange={(v) => cfg.set({ target: v === "on" })}
        />
      {/if}
      {#if !writes}
        <Choice
          label="Microphone"
          setupKey="mic"
          options={[
            { value: "off", label: "Off", hint: "Taps, MIDI keys and pads count." },
            { value: "on", label: "On", hint: "Onsets heard by the microphone count too." },
          ]}
          value={s.mic ? "on" : "off"}
          onchange={(v) => cfg.set({ mic: v === "on" })}
        />
      {/if}
    </div>
    <p class="mt-3 text-sm text-ws-soft">
      Tempo comes from the practice strip ({RHYTHM_LIMITS.bpm[0]} to {RHYTHM_LIMITS.bpm[1]} BPM).{#if listens} Use headphones: the click in the speakers would count as a tap.{/if}
    </p>
  {/snippet}

  {#snippet hud()}
    {#if phase === "running" && writes}
      <!-- Listen, write, check: the step this run is on. -->
      <Stat label="Step" value={writing ? "2 of 3: Write it down" : "1 of 3: Listen"} />
    {:else if phase === "running" && echo}
      <!-- Call and response: say which half of the run this is. -->
      <Stat label="Now" value={now >= downbeat ? "Your turn" : "Listen"} />
    {:else if phase === "running"}
      <!-- Which bar; the beat inside it is the shell's beat readout beside it. -->
      <Stat label="Bar" value="{clamp(Math.floor((now - downbeat) / beatMs / perBar) + 1, 1, bars)} of {bars}" />
    {/if}
    {#if phase === "running" && !writes}<Stat label="Taps" value={hits.length} />{/if}
  {/snippet}

  {#snippet stage()}
    <!-- One column on a phone, the Tap button docked at the bottom; beside the music from md up. A dictation keeps one column. -->
    <div class="flex min-w-0 flex-1 flex-col gap-5 {writes ? '' : 'md:flex-row md:items-center'}">
      <!-- By ear, the pattern and its start ride along as data (for tests and tools), never drawn until the end. -->
      <div class="min-w-0 {writes ? '' : 'md:flex-1'}" data-onsets={byEar ? def.events.map((e) => e.beat).join(",") : undefined} data-written={byEar ? heardBeats.join(",") : undefined} data-groove={grooveDef ? JSON.stringify(grooveDef.lanes) : undefined} data-downbeat={phase !== "ready" ? Math.round(downbeat) : undefined} data-beat-ms={beatMs}>
        {#if !pulse && def.chords?.length}
          <p class="mb-2 text-sm text-ws-stage-soft">↓ down, ↑ up, ✕ muted stroke (a hit with no pitch). Chords are graded when the mic or MIDI hears pitch.</p>
        {/if}
        {#if writes && phase === "ready"}
          <p class="mb-2 text-sm text-ws-stage-soft">
            {plan.bars} bar{plan.bars > 1 ? "s" : ""}{groove ? " of drums" : ""} over the click. {groove ? "Then tap the kick, snare and hat cells where each drum hit." : "Then tap a cell for every note you heard."}
          </p>
        {/if}
        {#if unheard}
          <p class="mb-2 text-sm text-ws-stage-soft">Nothing was heard, so no taps are marked.</p>
        {/if}
        {#if echo && phase === "running"}
          <!-- Which half of the echo this is, big, over the bar it plays in; the beat inside the bar as dots. -->
          {@const turn = now >= downbeat}
          {@const b = Math.floor((now - (turn ? downbeat : downbeat - plan.lengthMs)) / beatMs)}
          <div class="mb-3 flex flex-wrap items-center gap-x-5 gap-y-2" aria-hidden="true" data-testid="echo-turn">
            <p class="rounded-xl px-3 py-1 font-display text-3xl font-bold sm:text-4xl {turn ? 'bg-instr-strong text-on-instr' : 'text-ws-stage-ink'}">{turn ? "Your turn" : "Listen"}</p>
            <span class="flex items-center gap-2.5">
              {#each Array.from({ length: perBar }, (_, i) => i) as i (i)}
                <span class="size-4 rounded-full {b >= 0 && b % perBar === i ? 'scale-125 bg-instr-strong' : 'bg-ws-stage-ink/45'}"></span>
              {/each}
            </span>
          </div>
        {/if}
        {#if !pulse && !byEar && unwritten !== def.id}
          <!-- On results the marked score is drawn once, in the results figure (the stage is hidden then). -->
          {#if phase !== "results"}
            <RhythmNotation
              pattern={def}
              cursorBeat={playhead}
              states={noteStates}
              hits={gridHits}
              label={`${def.label} in rhythm notation, ${plan.bars} bar${plan.bars > 1 ? "s" : ""}, ${plan.events.length} notes and ${def.rests.length} rests`}
              onfallback={() => (unwritten = def.id)}
            />
          {/if}
        {:else if !writes}
          <!-- A dictation is drawn on its own grid below, greyed out until Start. -->
          <RhythmGrid
            {bars}
            {perBar}
            offbeats={!pulse}
            events={gridEvents}
            rests={pulse || hidden ? [] : def.rests}
            chords={chordMarks}
            hits={gridHits}
            verdicts={phase === "results" ? verdicts : []}
            {playhead}
            {lit}
            ghost={hidden}
            label={hidden && target ? `${plan.bars} bar${plan.bars > 1 ? "s" : ""}, the rhythm drawn faintly as it is heard` : hidden ? `${plan.bars} bar${plan.bars > 1 ? "s" : ""}, the pattern hidden until the end` : pulse ? `${beats} quarter-note beats` : `${def.label}, ${plan.bars} bars, ${plan.events.length} notes and ${def.rests.length} rests`}
          />
        {/if}
        {#if showKey}<TapKey missed={(phase === "results" && anyMissed) || (phase === "running" && pulse)} />{/if}
        {#if writes}
          {#if dictation && unwrittenMarks !== shownWritten.id}
            <!-- Your marks, written as notes as you go; after the check, what was played. -->
            <p class="mb-1.5 text-sm font-semibold text-ws-stage-soft">{dictationResult ? "What was played, written" : phase === "ready" ? "Your marks show here as notes" : "Your marks, as notes (not the answer)"}</p>
            <RhythmNotation
              pattern={shownWritten}
              compound={grid.perBeat === 3}
              cursorBeat={dictationResult ? null : writePlayhead}
              label={dictationResult ? `What was played, in rhythm notation: ${heardBeats.length} notes` : `Your rhythm in notation: ${markedIn("notes").length} notes marked`}
              onfallback={() => (unwrittenMarks = shownWritten.id)}
            />
          {/if}
          {#if writing || phase === "running"}
            <!-- The helpers sit above the grid they act on; Check stays alone below it. -->
            <div class="mt-3 flex flex-wrap items-center gap-2">
              <button type="button" class={btnStage} disabled={!writing} aria-pressed={againAt !== null} onclick={hearAgain}>Hear it again</button>
              <button type="button" class={btnStage} disabled={!Object.values(marks).some((r) => r.some(Boolean))} onclick={() => (marks = {})}>Clear</button>
              <span class="text-sm text-ws-stage-soft">{writing ? `Tap a cell for every ${groove ? "hit" : "note"} you heard.` : "Listen first: the grid opens when it ends."}</span>
            </div>
          {/if}
          <div class="mt-3" class:opacity-60={phase === "ready"} role="group" aria-label={groove ? "Your groove" : "Your rhythm"} data-dock={phase === "ready" ? undefined : "music"}>
            <DictationGrid
              bars={plan.bars}
              {rows}
              perBeat={grid.perBeat}
              beatsPerBar={grid.beatsPerBar}
              marks={phase === "ready" ? {} : marks}
              playhead={writePlayhead}
              state={(row, i) => (dictationResult ? cellVerdict(isHeard(row, i), !!marks[row]?.[i]) : null)}
              disabled={!(writing || phase === "running")}
              ontoggle={(row, i) => {
                const r = [...(marks[row] ?? [])];
                r[i] = !r[i];
                marks = { ...marks, [row]: r };
              }}
            />
          </div>
        {/if}
      </div>
      {#if writes && (writing || phase === "running")}
        <!-- Under the grid it checks; on a phone it is the dock's step instead. -->
        <div class="flex max-sm:hidden" data-dock="answers">
          <button type="button" class="{btnPrimary} min-h-12 w-full sm:w-auto sm:min-w-56" disabled={!writing} onclick={checkDictation}>{groove ? "Check my groove" : "Check my rhythm"}</button>
        </div>
      {/if}
      {#if !writes}
      <!-- On a phone before Start the Tap button waits (it opens on the count-in), so the music fits above Start. -->
      <div class="flex flex-col items-center gap-2 {phase === 'ready' ? 'max-sm:hidden' : ''}" data-dock="answers">
        <!-- The word for each tap as it lands, over the button it came from. -->
        <Verdict kind={tapVerdict?.kind} text={tapVerdict?.text} key={hits.length} class="flex h-8 items-center" />
        {#if onPads}
          <div class="w-72 max-w-full"><Pads label="Pads: any pad is a tap" /></div>
          <p class="text-center text-sm text-ws-stage-soft">Any pad counts, on the MPC or here{listens ? ", and the mic" : ""}. Space too.</p>
        {:else}
        <button
          type="button"
          class="tap"
          class:pressed
          aria-label="Tap"
          aria-keyshortcuts="Space"
          disabled={!live}
          onpointerdown={(e) => {
            if (e.button > 0) return;
            e.preventDefault();
            tap(e.timeStamp || performance.now());
          }}
          onkeydown={(e) => {
            if (e.key === "Enter" && !e.repeat) {
              e.preventDefault();
              tap(e.timeStamp || performance.now());
            }
          }}
        >
          <span class="font-display text-2xl font-bold">Tap</span>
          <span class="text-sm font-medium pointer-coarse:hidden">or Space</span>
        </button>
        <p class="max-w-56 text-center text-sm text-ws-stage-soft">{live ? "" : "Starts after the count-in. "}MIDI keys and pads count too{listens ? ", and the mic" : ""}.</p>
        {/if}
      </div>
      {/if}
    </div>
  {/snippet}

  {#snippet results()}
    {#if summary}
      <Results {summary} figure={summary.heard !== false && (perHit.length || dictationResult || patternResult) ? runFigure : undefined} />
    {/if}
  {/snippet}
</DrillShell>

<style>
  .tap {
    display: grid;
    place-content: center;
    width: 9.5rem;
    height: 9.5rem;
    border-radius: 999px;
    background: radial-gradient(circle at 35% 30%, color-mix(in oklch, var(--instr), white 25%), var(--instr) 60%, color-mix(in oklch, var(--instr), black 25%));
    color: var(--on-instr, var(--ws-stage));
    box-shadow: 0 10px 0 color-mix(in oklch, var(--instr), black 45%), 0 14px 30px rgb(0 0 0 / 0.35);
    transition: transform 60ms ease-out, box-shadow 60ms ease-out;
    touch-action: manipulation;
    user-select: none;
  }
  @media (max-width: 39.999rem) {
    .tap {
      width: 8rem;
      height: 8rem;
    }
  }
  .tap:disabled {
    opacity: 0.55;
  }
  .tap.pressed,
  .tap:not(:disabled):active {
    transform: translateY(8px);
    box-shadow: 0 2px 0 color-mix(in oklch, var(--instr), black 45%), 0 4px 12px rgb(0 0 0 / 0.35);
  }
  .tap:focus-visible {
    outline: 3px solid var(--ws-stage-ink);
    outline-offset: 4px;
  }
  .chip {
    display: flex;
    flex-direction: column;
    gap: 0.1rem;
    border-radius: 0.6rem;
    padding: 0.35rem 0.55rem;
    font-size: 0.875rem;
    background: var(--ws-bg);
    border: 1px solid var(--ws-line);
  }
  /* On-time beats sit back; the early, late and missed ones are the ones to read. */
  /* Early and late each have their own colour and chevrons (pointing back, pointing on), never one amber. */
  :is(.chip, .col)[data-v="early"] {
    --v: var(--early, var(--warn));
  }
  :is(.chip, .col)[data-v="late"] {
    --v: var(--late, var(--warn));
  }
  :is(.chip, .col)[data-v="missed"] {
    --v: var(--destructive);
  }
  /* The per-beat strip: one column a beat, the click at the middle line, the on-time band shaded around it. */
  .strip {
    display: grid;
    grid-template-columns: repeat(var(--n), minmax(0, 1fr));
    gap: 2px;
  }
  .col {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 0.25rem;
    min-width: 0;
  }
  .track {
    position: relative;
    width: 100%;
    height: 5rem;
    border-radius: 0.375rem;
    background: color-mix(in oklch, var(--ws-ink) 4%, transparent);
  }
  /* On time: within 15 of the strip's 100 ms either side. */
  .track::before {
    content: "";
    position: absolute;
    inset-inline: 0;
    top: 42.5%;
    height: 15%;
    background: color-mix(in oklch, var(--success) 22%, transparent);
  }
  .track::after {
    content: "";
    position: absolute;
    inset-inline: 0;
    top: 50%;
    border-top: 1px solid color-mix(in oklch, var(--ws-ink) 45%, transparent);
  }
  .track .bar {
    position: absolute;
    left: 50%;
    width: 4px;
    margin-left: -2px;
    border-radius: 2px;
    background: var(--v);
  }
  .track .glyph {
    position: absolute;
    width: min(1rem, 100%);
    height: auto;
    aspect-ratio: 1;
    left: 50%;
    z-index: 1;
    transform: translate(-50%, -50%);
  }
  .col .chev {
    fill: none;
    stroke: var(--v);
    stroke-width: 2;
    stroke-linecap: round;
    stroke-linejoin: round;
  }
  .num {
    font-size: 0.8125rem;
    line-height: 1;
    color: var(--ws-soft);
  }
  .col:not([data-v="pocket"]) .num {
    color: var(--ws-ink);
    font-weight: 700;
  }
  .chip[data-v="early"],
  .chip[data-v="late"] {
    border: 2px solid var(--v);
    background: color-mix(in oklch, var(--v) 12%, var(--ws-surface));
  }
  .chip .chev {
    fill: none;
    stroke: var(--v);
    stroke-width: 2;
    stroke-linecap: round;
    stroke-linejoin: round;
  }
  .chip[data-v="missed"] {
    border: 2px dashed var(--destructive);
  }
  .glyph {
    width: 16px;
    height: 16px;
    overflow: visible;
    flex-shrink: 0;
    fill: var(--warn);
  }
  .chip[data-v="pocket"] .glyph {
    fill: var(--success);
  }
  .glyph .tick {
    fill: none;
    stroke: var(--success);
    stroke-width: 2.5;
    stroke-linecap: round;
    stroke-linejoin: round;
  }
  .glyph .hollow {
    fill: none;
    stroke: var(--destructive);
    stroke-width: 2;
  }
</style>
