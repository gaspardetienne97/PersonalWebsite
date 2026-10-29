<script lang="ts">
  // Rhythm: tap the pulse, read a written pattern and tap it, or hear one and
  // tap it back (echo) or write it down (dictation). Every input counts: the
  // big tap button (pointer or Space), MIDI, microphone onsets.
  import { onDestroy } from "svelte";
  import { page } from "$app/state";
  import type { InputEvent } from "@repo/music-core";
  import { clamp } from "@repo/music-core";
  import { EAR_RHYTHM_LEVELS, earGroove, earRhythmPattern, GROOVE_LANES, GROOVE_LEVELS, grooveAsPattern, grooveKeys, type Groove, expandRhythm, pulseTargets, RHYTHM_LIMITS, RHYTHM_PATTERNS, rhythmPattern, rhythmSkills } from "@repo/music-core/content/rhythm";
  import { rng } from "@repo/music-core/content/random";
  import { catalogEntry, rhythmExerciseId } from "@repo/music-core/content/catalog";
  import { gradeOnsets, gradePattern, gradePulse, type PatternResult, type PulseResult } from "@repo/music-core/scoring/rhythm";
  import { timingVerdict } from "@repo/music-core/scoring/timing";
  import { chroma, chromaToPcs } from "@repo/music-core/signal/chroma";
  import { grooveDictationLesson } from "@repo/music-core/lessons/tier1";
  import { rhythmLessons } from "@repo/music-core/lessons/reading";
  import DrillShell, { type DrillMode, type Phase, type RunContext, type SetupClause } from "$lib/music/components/DrillShell.svelte";
  import Choice from "$lib/music/components/Choice.svelte";
  import Stat from "$lib/music/components/Stat.svelte";
  import Results, { type RunSummary } from "$lib/music/components/Results.svelte";
  import { btn, btnPrimary, btnStage } from "$lib/music/components/ui";
  import { DrillSetup } from "$lib/music/setup.svelte";
  import { assistanceFor, assistanceText, capture, pct, runInstrument, runSource, type Capture } from "$lib/music/drill.svelte";
  import { practice } from "$lib/music/practice.svelte";
  import { audio, mic, settings } from "$lib/music/runtime";
  import Pads from "$lib/music/components/Pads.svelte";
  import DictationGrid from "$lib/music/drills/rhythm/DictationGrid.svelte";
  import RhythmGrid, { type GridHit, type GridVerdict } from "$lib/music/drills/rhythm/RhythmGrid.svelte";
  import { demoNotes, readPatterns, RHYTHM_TABS, STROKE_MS, type Hit } from "$lib/music/drills/rhythm/rhythm";
  import { nextRun, tempoAnd } from "$lib/music/advance.svelte";

  const cfg = new DrillSetup("rhythm", { mode: "pulse", pattern: "eighths", beats: 4, mic: false as boolean, earLevel: "quarters-eighths", grooveLevel: "rock" });
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
      assistance: assistanceFor(mode),
      // By ear, each rhythm level adds 0.08, so a path step can ask for a level or harder.
      difficulty: Math.min(0.95, 0.2 + (bpm - 40) / 300 + (pulse ? 0 : 0.15) + (groove ? GROOVE_LEVELS.indexOf(grooveLevel) * 0.1 : byEar ? EAR_RHYTHM_LEVELS.indexOf(earLevel) * 0.08 : 0)),
      params: byEar ? { mode: s.mode, level: groove ? grooveLevel.id : earLevel.id, bpm } : pulse ? { mode: "pulse", beats, bpm } : { mode: "read-and-tap", pattern: def.id, bpm },
    });
    if (byEar) {
      // The call: the pattern on its own sound, from the first downbeat, over the click.
      call = audio.playSequence(callNotes(false), { startPerf: ctx.downbeat });
      if (writes) {
        status = "Listen to the pattern. Then write it down.";
        timers.push(
          setTimeout(() => {
            ctx.stopClock();
            writing = true;
            status = "Mark every note you heard on the grid, then check it.";
          }, Math.max(0, ctx.downbeat + plan.lengthMs - performance.now() + 150)),
        );
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
      if (now > downbeat + endRel) return void finish();
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
  }

  function teardown() {
    cancelAnimationFrame(raf);
    call?.stop();
    call = null;
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
      ? `ahead by ${Math.round(-r.meanErrorMs)} ms`
      : r.direction === "behind"
        ? `behind by ${Math.round(r.meanErrorMs)} ms`
        : `centered (${r.meanErrorMs >= 0 ? "+" : ""}${Math.round(r.meanErrorMs)} ms)`;

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
      await run!.attempt({ promptId: `pulse-${beats}`, correct: r.correct, partialCredit: r.score, metrics: r.metrics, source: src, instrument: instrument ?? null });
      const fin = await run!.finish({ score: r.score, correct: r.correct, headline: `${pct(r.score)}, ${r.direction}` });
      summary = {
        headline: !r.matched
          ? "No taps landed on the beats. Tap the big button, press Space, or play any key."
          : r.direction === "centered"
            ? `Centered: ${r.matched} of ${beats} beats, ${Math.round(r.meanAbsErrorMs)} ms off on average.`
            : r.direction === "ahead"
              ? `You rushed: ${Math.round(-r.meanErrorMs)} ms ahead of the click on average. Let the beat come to you.`
              : `You dragged: ${Math.round(r.meanErrorMs)} ms behind the click on average. Lean in a little.`,
        metric: pct(r.score),
        metricLabel: "timing",
        delta: fin.delta,
        best: fin.best,
        clean: r.correct && mode === "check",
        xp: fin.xp,
        assistance: assistanceText(mode),
        rows: [
          { label: "Beats hit", value: beats ? r.matched / beats : 0, text: `${r.matched} of ${beats}` },
          { label: "Where you sit", text: r.matched ? directionText(r) : "No taps" },
          { label: "Jitter", text: r.matched > 1 ? `${Math.round(r.jitterMs)} ms` : "Needs two taps" },
          { label: "Extra taps", text: String(r.extra) },
        ],
        advance: taken.length ? await advanceAfter(r.score, r.correct) : undefined,
        routine: page.url.searchParams.get("routine") ? { label: "Back to today's plan", href: "/music" } : undefined,
      };
    } else {
      const r = gradePattern(def, taken, { startAt: downbeat, beatMs });
      patternResult = r;
      await run!.attempt({ promptId: def.id, correct: r.correct, partialCredit: r.score, metrics: r.metrics, source: src, instrument: instrument ?? null });
      const fin = await run!.finish({ score: r.score, correct: r.correct, headline: pct(r.score) });
      const total = r.grid.length;
      summary = {
        headline:
          r.correct && !r.restHits
            ? `${def.label}: ${r.matched} of ${total} strokes, ${Math.round(r.meanAbsErrorMs)} ms off on average.`
            : `${r.matched} of ${total} strokes${r.restHits ? `, ${r.restHits} tap${r.restHits > 1 ? "s" : ""} in a rest` : ""}${r.extra ? `, ${r.extra} extra` : ""}.`,
        metric: pct(r.score),
        metricLabel: "score",
        delta: fin.delta,
        best: fin.best,
        clean: r.correct && mode === "check",
        xp: fin.xp,
        assistance: assistanceText(mode),
        rows: [
          { label: "Timing", value: r.timingScore, text: `${pct(r.timingScore)}, ${Math.round(r.meanAbsErrorMs)} ms off` },
          { label: "Missed strokes", text: String(r.missed) },
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
        advance: taken.length ? await advanceAfter(r.score, r.correct) : undefined,
        routine: page.url.searchParams.get("routine") ? { label: "Back to today's plan", href: "/music" } : undefined,
      };
    }
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

  function hearAgain() {
    stopDemo();
    call?.stop();
    call = audio.playSequence(callNotes(true));
  }

  async function checkDictation() {
    if (!run || !writing) return;
    writing = false;
    call?.stop();
    const expected = grooveDef ? grooveKeys(grooveDef.lanes) : heardBeats;
    const answered = grooveDef ? grooveKeys(Object.fromEntries(rows.map((r) => [r.id, markedIn(r.id)]))) : markedIn("notes");
    const r = gradeOnsets(expected, answered);
    dictationResult = r;
    phase = "results";
    await run.attempt({ promptId: def.id, correct: r.correct, partialCredit: r.score, metrics: r.metrics, source: "click", target: expected.join(" "), response: answered.join(" "), instrument: null });
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
      xp: fin.xp,
      assistance: assistanceText(mode),
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
      advance: answered.length ? await advanceAfter(r.score, r.correct) : undefined,
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
  const gridEvents = $derived(hidden ? [] : pulse ? targetsRel.map((_, i) => ({ beat: i, accent: i % 4 === 0 })) : plan.events.map((e) => ({ beat: e.beat, accent: e.accent, stroke: e.stroke, duration: e.durationMs ? e.durationMs / beatMs : undefined })));
  const bars = $derived(pulse ? Math.ceil(beats / 4) : plan.bars);
  const perBar = $derived(pulse ? 4 : def.meter.beats);
  const chordMarks = $derived(pulse ? [] : plan.chords.map((c) => ({ symbol: c.symbol, startBeat: c.startMs / beatMs })));
  const toBeat = (at: number) => (at - downbeat) / beatMs;

  function liveKind(at: number): GridHit["kind"] {
    const rel = at - downbeat;
    const inRest = !pulse && plan.rests.some((r) => rel >= r.startMs && rel < r.endMs);
    let best: number | null = null;
    for (const t of targetsRel) if (Math.abs(rel - t) <= windowMs && (best === null || Math.abs(rel - t) < Math.abs(rel - best))) best = t;
    if (best === null) return inRest ? "rest" : "extra";
    return timingVerdict(rel - best);
  }

  const gridHits = $derived.by((): GridHit[] => {
    if (phase === "results" && patternResult)
      return patternResult.hits.map((h) => {
        const g = patternResult!.grid.find((x) => x.at === h.at);
        return { beat: toBeat(h.at), kind: h.kind === "matched" && g && g.verdict !== "missed" ? g.verdict : h.kind === "rest" ? "rest" : "extra" };
      });
    if (phase === "results" && pulseResult) return hits.map((h) => ({ beat: toBeat(h.at), kind: pulseResult!.metrics.some((m) => m.kind === "timing" && m.actualMs === h.at) ? liveKind(h.at) : "extra" }));
    if (phase === "running" && mode === "practice") return hits.map((h) => ({ beat: toBeat(h.at), kind: liveKind(h.at) }));
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
    if (patternResult) return patternResult.grid.map((g, i) => ({ label: `${i + 1}${g.stroke ? ` ${g.stroke}` : ""}`, error: g.errorMs ?? null }));
    return [];
  });
  const playhead = $derived(demo?.playing && lit !== null ? gridEvents[lit]?.beat ?? null : phase === "running" && mode === "practice" && now >= downbeat ? toBeat(now) : null);

  const summaryLine = $derived<SetupClause[]>([
    byEar ? { text: (groove ? grooveLevel : earLevel).title, focus: "level" } : pulse ? { text: `${beats} beats`, focus: "beats" } : { text: def.label, focus: "pattern" },
    { text: `${plan.bars} bar${plan.bars > 1 ? "s" : ""} at ${bpm} BPM` },
    ...(listens ? [{ text: "microphone on", focus: "mic" }] : []),
  ]);
  // By ear the pattern is never on screen, whichever way the shell's switch is set.
  const modeNotes = $derived(byEar ? { practice: "The pattern is heard, not shown. Practice, not a test.", check: "The pattern is heard, not shown. Counts toward mastery." } : undefined);
</script>

<svelte:head><title>Rhythm | Woodshed</title></svelte:head>
<svelte:window onkeydown={onKey} />

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
  tabs={RHYTHM_TABS}
  {tab}
  ontab={(v) => pick({ mode: v })}
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
    {#if phase === "running" && !writes}
      <Stat label="Taps" value={hits.length} />
      {#if mode === "practice" && hits.length}
        {@const k = liveKind(hits.at(-1)!.at)}
        <Stat label="Last tap" value={k === "pocket" ? "In the pocket" : k === "early" ? "Early" : k === "late" ? "Late" : k === "rest" ? "In a rest" : "Extra"} tone={k === "pocket" ? "success" : k === "rest" || k === "extra" ? "error" : "warn"} />
      {/if}
    {/if}
  {/snippet}

  {#snippet stage()}
    <div class="grid grid-cols-[minmax(0,1fr)] items-center gap-5 md:grid-cols-[minmax(0,1fr)_auto]">
      <!-- By ear, the pattern and its start ride along as data (for tests and tools), never drawn until the end. -->
      <div class="min-w-0" data-onsets={byEar ? def.events.map((e) => e.beat).join(",") : undefined} data-written={byEar ? heardBeats.join(",") : undefined} data-groove={grooveDef ? JSON.stringify(grooveDef.lanes) : undefined} data-downbeat={phase !== "ready" ? Math.round(downbeat) : undefined} data-beat-ms={beatMs}>
        {#if !pulse && def.chords?.length}
          <p class="mb-2 text-sm text-ws-stage-soft">↓ down, ↑ up, ✕ muted stroke (a hit with no pitch). Chords are graded when the mic or MIDI hears pitch.</p>
        {/if}
        {#if groove}
          {#if !(writing || dictationResult)}
            <p class="text-sm text-ws-stage-soft">{plan.bars} bar{plan.bars > 1 ? "s" : ""} of drums over the click. Then write the kick, snare and hats on the grid.</p>
          {/if}
        {:else}
        <RhythmGrid
          {bars}
          {perBar}
          events={gridEvents}
          rests={pulse || hidden ? [] : def.rests}
          chords={chordMarks}
          hits={gridHits}
          verdicts={phase === "results" ? verdicts : []}
          {playhead}
          {lit}
          label={hidden ? `${plan.bars} bar${plan.bars > 1 ? "s" : ""}, the pattern hidden until the end` : pulse ? `${beats} quarter-note beats` : `${def.label}, ${plan.bars} bars, ${plan.events.length} strokes and ${def.rests.length} rests`}
        />
        {/if}
        {#if writes && (writing || dictationResult)}
          <div class="mt-3 space-y-3" role="group" aria-label={groove ? "Your groove" : "Your rhythm"}>
            <DictationGrid
              bars={plan.bars}
              {rows}
              perBeat={grid.perBeat}
              beatsPerBar={grid.beatsPerBar}
              {marks}
              state={(row, i) => (dictationResult ? (marks[row]?.[i] && isHeard(row, i) ? "right" : marks[row]?.[i] ? "extra" : isHeard(row, i) ? "missed" : null) : null)}
              disabled={!writing}
              ontoggle={(row, i) => {
                const r = [...(marks[row] ?? [])];
                r[i] = !r[i];
                marks = { ...marks, [row]: r };
              }}
            />
            {#if writing}
              <div class="flex flex-wrap gap-2 pt-1">
                <button type="button" class={btnPrimary} onclick={checkDictation}>{groove ? "Check my groove" : "Check my rhythm"}</button>
                <button type="button" class={btnStage} onclick={hearAgain}>Hear it again</button>
                <button type="button" class={btnStage} onclick={() => (marks = {})}>Clear</button>
              </div>
            {/if}
          </div>
        {/if}
      </div>
      <div class="flex flex-col items-center gap-2" class:hidden={writes}>
        {#if onPads}
          <div class="w-72 max-w-full"><Pads label="Pads: any pad is a tap" /></div>
          <p class="text-center text-xs text-ws-stage-soft">Any pad counts, on the MPC or here{listens ? ", and the mic" : ""}. Space too.</p>
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
          <span class="text-xs opacity-80">or Space</span>
        </button>
        <p class="text-center text-xs text-ws-stage-soft">MIDI keys and pads count too{listens ? ", and the mic" : ""}.</p>
        {/if}
      </div>
    </div>
  {/snippet}

  {#snippet results()}
    {#if summary}
      <Results {summary}>
        {#snippet actions()}
          <button type="button" class={btn} onclick={() => settings.update({ bpm: clamp(bpm + 8, RHYTHM_LIMITS.bpm[0], RHYTHM_LIMITS.bpm[1]) })}>Faster</button>
          <button type="button" class={btn} onclick={() => settings.update({ bpm: clamp(bpm - 8, RHYTHM_LIMITS.bpm[0], RHYTHM_LIMITS.bpm[1]) })}>Slower</button>
        {/snippet}
      </Results>
        {#if perHit.length}
        <ol class="mt-3 flex flex-wrap gap-1.5" aria-label="Every hit">
          {#each perHit as h, i (i)}
            {@const v = h.error === null ? "missed" : timingVerdict(h.error)}
            <li class="chip tnum" data-v={v}>
              <span class="font-semibold">{h.label}</span>
              {h.error === null ? "missed" : v === "pocket" ? `${Math.round(h.error)} ms` : `${Math.round(Math.abs(h.error))} ms ${v}`}
            </li>
          {/each}
        </ol>
      {/if}
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
    color: var(--ws-stage);
    box-shadow: 0 10px 0 color-mix(in oklch, var(--instr), black 45%), 0 14px 30px rgb(0 0 0 / 0.35);
    transition: transform 60ms ease-out, box-shadow 60ms ease-out;
    touch-action: manipulation;
    user-select: none;
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
    display: inline-flex;
    gap: 0.35rem;
    align-items: baseline;
    border-radius: 0.6rem;
    padding: 0.25rem 0.55rem;
    font-size: 0.8rem;
    background: var(--ws-surface);
    border: 1px solid var(--ws-line);
    border-left: 3px solid var(--warn);
  }
  .chip[data-v="pocket"] {
    border-left-color: var(--success);
  }
  .chip[data-v="missed"] {
    border-left-color: var(--destructive);
  }
</style>
