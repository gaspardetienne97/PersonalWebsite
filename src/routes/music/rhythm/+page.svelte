<script lang="ts">
  // Rhythm: tap the pulse, read a written pattern and tap it, or hear one and
  // tap it back (echo) or write it down (dictation). Every input counts: the
  // big tap button (pointer or Space), MIDI, microphone onsets.
  import { onDestroy } from "svelte";
  import { page } from "$app/state";
  import type { InputEvent } from "@repo/music-core";
  import { clamp } from "@repo/music-core";
  import { EAR_RHYTHM_LEVELS, earRhythmPattern, expandRhythm, pulseTargets, RHYTHM_LIMITS, RHYTHM_PATTERNS, rhythmPattern, rhythmSkills } from "@repo/music-core/content/rhythm";
  import type { RhythmPatternDef } from "@repo/music-core/data/index";
  import { rng } from "@repo/music-core/content/random";
  import { catalogEntry, rhythmExerciseId } from "@repo/music-core/content/catalog";
  import { gradeOnsets, gradePattern, gradePulse, type PatternResult, type PulseResult } from "@repo/music-core/scoring/rhythm";
  import { timingVerdict } from "@repo/music-core/scoring/timing";
  import { chroma, chromaToPcs } from "@repo/music-core/signal/chroma";
  import DrillShell, { type DrillMode, type Phase, type RunContext } from "$lib/music/components/DrillShell.svelte";
  import Choice from "$lib/music/components/Choice.svelte";
  import Stat from "$lib/music/components/Stat.svelte";
  import Results, { type RunSummary } from "$lib/music/components/Results.svelte";
  import { btn, btnPrimary } from "$lib/music/components/ui";
  import { DrillSetup } from "$lib/music/setup.svelte";
  import { assistanceFor, assistanceText, capture, pct, runInstrument, runSource, type Capture } from "$lib/music/drill.svelte";
  import { practice } from "$lib/music/practice.svelte";
  import { audio, mic, settings } from "$lib/music/runtime";
  import RhythmGrid, { type GridHit, type GridVerdict } from "$lib/music/drills/rhythm/RhythmGrid.svelte";
  import { demoNotes, STROKE_MS, type Hit } from "$lib/music/drills/rhythm/rhythm";

  const cfg = new DrillSetup("rhythm", { mode: "pulse", pattern: "quarter-pulse", beats: 4, mic: false as boolean, earLevel: "quarters-eighths" });
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
  const byEar = $derived(echo || dictation);
  const pulse = $derived(s.mode !== "read-and-tap" && !byEar);
  const earLevel = $derived(EAR_RHYTHM_LEVELS.find((l) => l.id === s.earLevel) ?? EAR_RHYTHM_LEVELS[0]);
  // A new pattern each run; before the first, an example of the level (for the demo).
  let earDef = $state.raw<RhythmPatternDef | null>(null);
  const earExample = $derived(earRhythmPattern(rng(7), earLevel.id, { dictation }));
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

  function addHit(h: Hit) {
    if (phase !== "running" || h.at < downbeat - windowMs) return;
    hits = [...hits, h].sort((a, b) => a.at - b.at);
  }

  function tap(at: number) {
    if (!s.mic) audio.drum(37, 0.5);
    pressed = true;
    setTimeout(() => (pressed = false), 90);
    addHit({ at, source: "onscreen" });
  }

  function onInput(e: InputEvent) {
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
    if (phase !== "running" || e.code !== "Space" || e.repeat) return;
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
      earDef = earRhythmPattern(Math.random, earLevel.id, { dictation });
      marks = [];
      writing = false;
    }
    if (s.mic) {
      const ok = await mic.start();
      if (!ok) {
        ctx.stopClock();
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
      setupKey: earMode ? `${s.mode}|${earLevel.id}|${bpm}` : pulse ? `pulse|${beats}|${bpm}` : `pattern|${def.id}|${bpm}`,
      skillIds: earMode ? earMode.skillIds : rhythmSkills(pulse ? "pulse" : def.id),
      capabilities: ["rhythm"],
      modality: "tapped",
      assistance: assistanceFor(mode),
      difficulty: Math.min(0.9, 0.2 + (bpm - 40) / 300 + (pulse ? 0 : 0.15)),
      params: byEar ? { mode: s.mode, level: earLevel.id, bpm } : pulse ? { mode: "pulse", beats, bpm } : { mode: "read-and-tap", pattern: def.id, bpm },
    });
    if (byEar) {
      // The call: the pattern on its own sound, from the first downbeat, over the click.
      call = audio.playSequence(
        demoNotes(plan).filter((n) => n.voice !== "click"),
        { startPerf: ctx.downbeat },
      );
      if (dictation) {
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
    cap = capture(downbeat - windowMs, onInput);
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
        routine: page.url.searchParams.get("routine") ? { label: "Back to today's plan", href: "/music" } : undefined,
      };
    }
    status = summary.headline;
  }

  // ---------------------------------------------------------------------------
  // Dictation: mark the onsets on a grid, a box per eighth (or sixteenth).

  let call: { stop(): void } | null = null;
  let writing = $state(false);
  let marks = $state<boolean[]>([]);
  let dictationResult = $state.raw<ReturnType<typeof gradeOnsets> | null>(null);
  const cellsPerBar = $derived(4 * earLevel.perBeat);
  const COUNTS = { 2: ["", "&"], 4: ["", "e", "&", "a"] } as const;
  const cellLabel = (i: number) => {
    const sub = i % earLevel.perBeat;
    return sub ? COUNTS[earLevel.perBeat][sub] : String(Math.floor(i / earLevel.perBeat) % 4 + 1);
  };
  const heardBeats = $derived(def.events.map((e) => e.beat));
  const isHeard = (i: number) => heardBeats.some((b) => Math.abs(b - i / earLevel.perBeat) < 1e-6);

  function hearAgain() {
    stopDemo();
    call?.stop();
    call = audio.playSequence(demoNotes(plan));
  }

  async function checkDictation() {
    if (!run || !writing) return;
    writing = false;
    call?.stop();
    const answered = marks.flatMap((on, i) => (on ? [i / earLevel.perBeat] : []));
    const r = gradeOnsets(heardBeats, answered);
    dictationResult = r;
    phase = "results";
    await run.attempt({ promptId: def.id, correct: r.correct, partialCredit: r.score, metrics: r.metrics, source: "click", target: heardBeats.join(" "), response: answered.join(" "), instrument: null });
    const fin = await run.finish({ score: r.score, correct: r.correct, headline: pct(r.score) });
    const right = answered.filter((b) => heardBeats.some((h) => Math.abs(h - b) < 1e-6)).length;
    summary = {
      headline: r.correct ? `All ${heardBeats.length} notes written right.` : `${right} of ${heardBeats.length} notes right${answered.length > right ? `, ${answered.length - right} extra` : ""}.`,
      metric: pct(r.score),
      metricLabel: "score",
      delta: fin.delta,
      best: fin.best,
      clean: r.correct && mode === "check",
      xp: fin.xp,
      assistance: assistanceText(mode),
      rows: [
        { label: "Notes found", value: heardBeats.length ? right / heardBeats.length : 0, text: `${right} of ${heardBeats.length}` },
        { label: "Extra marks", text: String(answered.length - right) },
      ],
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

  const summaryLine = $derived(byEar ? `${echo ? "Echo" : "Dictation"}, ${earLevel.title.toLowerCase()}, ${plan.bars} bar${plan.bars > 1 ? "s" : ""} at ${bpm} BPM` : pulse ? `Pulse, ${beats} beats at ${bpm} BPM${s.mic ? ", microphone on" : ""}` : `${def.label}, ${plan.bars} bar${plan.bars > 1 ? "s" : ""} at ${bpm} BPM${s.mic ? ", microphone on" : ""}`);
</script>

<svelte:head><title>Rhythm | Woodshed</title></svelte:head>
<svelte:window onkeydown={onKey} />

<DrillShell
  title="Rhythm"
  hue="rhythm"
  blurb={echo
    ? "Hear a rhythm over the click, then tap it back in the bars after it."
    : dictation
      ? "Hear a rhythm over the click, then mark where every note fell."
      : pulse
        ? "Tap the beat with the click. You'll see whether you sit ahead, behind or in the middle."
        : "Read the rhythm and tap it. Rests are part of the music: a tap in one costs points."}
  summary={summaryLine}
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
      <Choice
        label="Mode"
        options={[
          { value: "pulse", label: "Pulse" },
          { value: "read-and-tap", label: "Read and tap" },
          { value: "echo", label: "Echo" },
          { value: "dictation", label: "Dictation" },
        ]}
        value={byEar ? s.mode : pulse ? "pulse" : "read-and-tap"}
        onchange={(v) => cfg.set({ mode: v })}
      />
      {#if byEar}
        <Choice label="Rhythms" select options={EAR_RHYTHM_LEVELS.map((l) => ({ value: l.id, label: l.title }))} value={earLevel.id} onchange={(v) => cfg.set({ earLevel: v })} />
      {:else if pulse}
        <Choice label="Beats" select options={Array.from({ length: 15 }, (_, i) => ({ value: i + 2, label: `${i + 2} beats` }))} value={beats} onchange={(v) => cfg.set({ beats: v })} />
      {:else}
        <Choice label="Pattern" select options={RHYTHM_PATTERNS.map((p) => ({ value: p.id, label: p.label }))} value={def.id} onchange={(v) => cfg.set({ pattern: v })} />
      {/if}
      <Choice
        label="Also listen to"
        options={[
          { value: "off", label: "Tap and MIDI only" },
          { value: "on", label: "Microphone onsets" },
        ]}
        value={s.mic ? "on" : "off"}
        onchange={(v) => cfg.set({ mic: v === "on" })}
      />
    </div>
    <p class="mt-3 text-sm text-ws-soft">
      Tempo comes from the practice strip (40 to 220 BPM).{#if s.mic} Use headphones: the click in the speakers would count as a tap.{/if}
    </p>
  {/snippet}

  {#snippet hud()}
    {#if phase === "running" && !dictation}
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
      <div class="min-w-0" data-onsets={byEar ? heardBeats.join(",") : undefined} data-downbeat={byEar ? Math.round(downbeat) : undefined} data-beat-ms={beatMs}>
        {#if !pulse && def.chords?.length}
          <p class="mb-2 text-sm text-ws-stage-soft">↓ down, ↑ up, ✕ muted stroke (a hit with no pitch). Chords are graded when the mic or MIDI hears pitch.</p>
        {/if}
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
        {#if dictation && (writing || dictationResult)}
          <div class="mt-3 space-y-2" role="group" aria-label="Your rhythm">
            {#each Array.from({ length: plan.bars }, (_, b) => b) as bar (bar)}
              <div class="grid gap-1" style:grid-template-columns="repeat({cellsPerBar}, minmax(0, 1fr))">
                {#each Array.from({ length: cellsPerBar }, (_, k) => bar * cellsPerBar + k) as i (i)}
                  {@const on = !!marks[i]}
                  <button
                    type="button"
                    class="cell"
                    class:beat={i % earLevel.perBeat === 0}
                    data-state={dictationResult ? (on && isHeard(i) ? "right" : on ? "extra" : isHeard(i) ? "missed" : null) : null}
                    aria-pressed={on}
                    aria-label="Bar {bar + 1}, {cellLabel(i) || 'beat'} {Math.floor((i % cellsPerBar) / earLevel.perBeat) + 1}"
                    disabled={!writing}
                    onclick={() => (marks[i] = !on)}
                  >{cellLabel(i)}</button>
                {/each}
              </div>
            {/each}
            {#if writing}
              <div class="flex flex-wrap gap-2 pt-1">
                <button type="button" class={btnPrimary} onclick={checkDictation}>Check my rhythm</button>
                <button type="button" class={btn} onclick={hearAgain}>Hear it again</button>
                <button type="button" class={btn} onclick={() => (marks = [])}>Clear</button>
              </div>
            {/if}
          </div>
        {/if}
      </div>
      <div class="flex flex-col items-center gap-2" class:hidden={dictation}>
        <button
          type="button"
          class="tap"
          class:pressed
          aria-label="Tap"
          aria-keyshortcuts="Space"
          disabled={phase !== "running"}
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
        <p class="text-center text-xs text-ws-stage-soft">MIDI keys and pads count too{s.mic ? ", and the mic" : ""}.</p>
      </div>
    </div>
  {/snippet}

  {#snippet results()}
    {#if summary}
      <Results {summary}>
        {#snippet actions()}
          <button type="button" class={btn} onclick={() => settings.update({ bpm: clamp(bpm + 8, 40, 220) })}>Faster</button>
          <button type="button" class={btn} onclick={() => settings.update({ bpm: clamp(bpm - 8, 40, 220) })}>Slower</button>
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
  .cell {
    min-height: 2.6rem;
    border-radius: 0.5rem;
    font-size: 0.75rem;
    background: color-mix(in oklch, var(--ws-stage-ink) 8%, transparent);
    border: 2px solid transparent;
  }
  .cell.beat {
    background: color-mix(in oklch, var(--ws-stage-ink) 14%, transparent);
    font-weight: 700;
  }
  .cell[aria-pressed="true"] {
    background: var(--instr);
    color: var(--ws-stage);
  }
  .cell[data-state="right"] {
    border-color: var(--success);
  }
  .cell[data-state="extra"] {
    border-color: var(--destructive);
  }
  .cell[data-state="missed"] {
    border-color: var(--destructive);
    border-style: dashed;
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
