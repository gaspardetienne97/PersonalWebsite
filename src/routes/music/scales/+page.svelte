<script lang="ts">
  import { onDestroy } from "svelte";
  import type { NoteEvent } from "@repo/music-core";
  import { noteName } from "@repo/music-core";
  import { SCALE_GROUPS, SCALE_TONICS, type ScaleKind } from "@repo/music-core/theory/scales";
  import {
    HANDS_TOGETHER_PRESET,
    SCALE_TEMPO,
    scaleDrillTargets,
    scaleSetupKey,
    scaleSkills,
  } from "@repo/music-core/content/technique";
  import {
    gradeLine,
    ladderAfterRun,
    ladderProjection,
    mergeLadders,
    type LadderState,
    type LineResult,
  } from "@repo/music-core/scoring/technique";
  import DrillShell, { type DrillMode, type Phase, type RunContext } from "$lib/music/components/DrillShell.svelte";
  import Piano from "$lib/music/components/Piano.svelte";
  import Choice from "$lib/music/components/Choice.svelte";
  import Stat from "$lib/music/components/Stat.svelte";
  import Results, { type RunSummary } from "$lib/music/components/Results.svelte";
  import { Flashes, type CellMarks } from "$lib/music/components/feedback.svelte";
  import { btn } from "$lib/music/components/ui";
  import { DrillSetup } from "$lib/music/setup.svelte";
  import { assistanceFor, assistanceText, capture, pct, readKeyed, runInstrument, runSource, writeKeyed, type Capture } from "$lib/music/drill.svelte";
  import { practice } from "$lib/music/practice.svelte";
  import { audio, settings } from "$lib/music/runtime";

  const LADDER_KEY = "technique.tempo-ladder.v1";
  const setup = new DrillSetup("scales", {
    kind: "major" as string,
    tonic: 60,
    span: "one-octave" as string,
    motion: "up-down" as string,
    hands: "right" as string,
    preset: false,
  });
  const s = $derived(setup.value);
  const scaleSetup = $derived({
    kind: s.kind as ScaleKind,
    tonic: s.tonic,
    span: s.span as "pentascale" | "one-octave" | "two-octave",
    motion: s.motion as "up" | "down" | "up-down",
    hands: s.hands as "right" | "left" | "both",
    bpm: bpm(),
    minEvenness: s.preset ? HANDS_TOGETHER_PRESET.minEvenness : undefined,
  });
  const steps = $derived(scaleDrillTargets(scaleSetup));
  const key = $derived(scaleSetupKey(scaleSetup));

  function bpm() {
    return Math.min(SCALE_TEMPO.max, Math.max(SCALE_TEMPO.min, settings.value.bpm));
  }

  // Keyboard spans the line, snapped out to whole octaves from C.
  const all = $derived(steps.flatMap((st) => st.notes.map((n) => n.midi)));
  const low = $derived(Math.floor((Math.min(...all) - 2) / 12) * 12);
  const high = $derived(Math.ceil((Math.max(...all) + 2) / 12) * 12);

  let phase = $state<Phase>("ready");
  let mode = $state<DrillMode>("practice");
  let status = $state("");
  let stepIndex = $state(0);
  let demoStep = $state<number | null>(null);
  let demo: { stop(): void; playing: boolean } | null = $state(null);
  let summary = $state<RunSummary | null>(null);
  let result = $state<LineResult | null>(null);
  let ladders = $state<Record<string, LadderState>>({});
  const flashes = new Flashes();
  let cap: Capture | null = null;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let run: ReturnType<typeof practice.beginRun> | null = null;

  void readKeyed<LadderState>(LADDER_KEY).then((l) => (ladders = l));

  const marks = $derived.by(() => {
    const out: Record<number, CellMarks> = {};
    const show = demoStep ?? (mode === "practice" && phase !== "results" ? stepIndex : null);
    if (show === null || !steps[show]) return out;
    for (const n of steps[show].notes)
      out[n.midi] = demoStep !== null ? { demo: true } : { target: true, label: s.hands === "both" ? (n.hand === "left" ? "L" : "R") : undefined, role: s.hands === "both" ? n.hand : undefined };
    return out;
  });

  const scaleLabel = (k: string) => k.replace(/-/g, " ").replace(/^./, (c) => c.toUpperCase());
  const summaryLine = $derived(
    `${noteName(s.tonic)} ${scaleLabel(s.kind).toLowerCase()}, ${s.span.replace("-", " ")}, ${s.motion === "up-down" ? "up and down" : s.motion}, ${s.hands === "both" ? "hands together" : `${s.hands} hand`}, ${bpm()} BPM`,
  );

  function stopDemo() {
    demo?.stop();
    demo = null;
    demoStep = null;
  }

  async function playDemo() {
    if (demo?.playing) return stopDemo();
    await audio.unlock();
    const beatS = 60 / bpm();
    const notes = steps.flatMap((st, i) => st.notes.map((n) => ({ midi: n.midi, time: i * beatS, duration: beatS * 0.9 })));
    const handle = audio.playSequence(notes, {
      onNote: (i: number) => {
        const idx = Math.floor(notes[i].time / beatS + 1e-6);
        demoStep = idx;
      },
    });
    demo = handle;
    status = "Listen: the whole line at tempo, lit as it sounds.";
    void handle.done.then(() => {
      if (demo === handle) stopDemo();
    });
  }

  function onNote(e: NoteEvent) {
    if (e.kind !== "noteon" || phase !== "running") return;
    const step = steps[stepIndex];
    if (!step) return;
    const expected = step.notes.map((n) => n.midi);
    if (expected.includes(e.midi)) {
      if (mode === "practice") flashes.add(e.midi, "correct");
      const hit = new Set(cap!.notes.filter((n) => n.kind === "noteon" && n.at >= stepStart).map((n) => n.midi));
      if (expected.every((m) => hit.has(m))) {
        stepIndex += 1;
        stepStart = e.at - 60;
        if (stepIndex >= steps.length) void finish();
      }
    } else if (mode === "practice") {
      flashes.add(e.midi, "wrong");
    }
  }
  let stepStart = 0;

  async function start(ctx: RunContext) {
    stopDemo();
    summary = null;
    result = null;
    stepIndex = 0;
    flashes.clear();
    const beatMs = ctx.beatMs;
    stepStart = ctx.downbeat - beatMs / 2;
    run = practice.beginRun({
      exerciseId: "technique.scale",
      setupKey: key,
      skillIds: scaleSkills(scaleSetup.kind),
      capabilities: ["technique"],
      modality: "played",
      assistance: assistanceFor(mode),
      difficulty: s.span === "two-octave" ? 0.6 : s.hands === "both" ? 0.5 : 0.35,
      instrument: settings.value.activeInstrument,
      params: { bpm: ctx.bpm, kind: s.kind, tonic: s.tonic, span: s.span, motion: s.motion, hands: s.hands },
    });
    // Input is scored only after the count-in, so speakers can't bleed into the take.
    cap = capture(ctx.downbeat - beatMs / 2, (e) => e.kind === "noteon" && onNote(e));
    timer = setTimeout(() => void finish(), Math.max(0, ctx.downbeat - performance.now()) + (steps.length + 4) * beatMs);
    stopClockRef = ctx.stopClock;
  }
  let stopClockRef: (() => void) | null = null;

  async function finish() {
    if (phase !== "running" && phase !== "countin") return;
    clearTimeout(timer);
    stopClockRef?.();
    cap?.stop();
    const notes = cap?.notes ?? [];
    const r = gradeLine({
      beats: steps.map((st) => st.notes),
      beatMs: 60000 / bpm(),
      notes,
      handsTogether: s.hands === "both",
      minEvenness: scaleSetup.minEvenness,
    });
    result = r;
    phase = "results";
    const instrument = runInstrument(notes);
    await run!.attempt({
      promptId: key,
      correct: r.correct,
      partialCredit: r.score,
      metrics: r.metrics,
      source: runSource(notes),
      instrument: instrument ?? null,
      target: steps.flatMap((st) => st.notes.map((n) => n.midi)),
      response: notes.filter((n) => n.kind === "noteon").map((n) => n.midi),
    });
    const fin = await run!.finish({ score: r.score, correct: r.correct, headline: `${pct(r.score)} at ${bpm()} BPM` });
    const before = ladders[key];
    const after = ladderAfterRun(before, { bpm: bpm(), correct: r.correct && mode === "check" });
    ladders = await writeKeyed(LADDER_KEY, key, after, (a, b) => mergeLadders({ k: a }, { k: b }).k);
    const proj = ladderProjection(after, bpm());
    const promoted = after.unlockedBpm > (before?.unlockedBpm ?? 100);
    summary = {
      headline: r.correct
        ? promoted
          ? `Clean and even. ${after.unlockedBpm} BPM is unlocked.`
          : mode === "check"
            ? bpm() < after.unlockedBpm
              ? `Clean and even at ${bpm()} BPM. The ladder counts checks at ${after.unlockedBpm} BPM or faster.`
              : `Clean and even at ${bpm()} BPM. One more clean check here unlocks ${Math.min(180, after.unlockedBpm + 10)}.`
            : `Clean at ${bpm()} BPM. Try it in Check to count it.`
        : r.pitch < 0.9
          ? `${r.clean} of ${r.total} notes right. Slow down and let the pitch settle first.`
          : `Every note right, but the spacing wandered by ${Math.round(r.evennessErrorMs)} ms. Keep it even.`,
      metric: pct(r.score),
      metricLabel: "score",
      delta: fin.delta,
      best: fin.best,
      clean: r.correct && mode === "check",
      xp: fin.xp,
      assistance: assistanceText(mode),
      rows: [
        { label: "Notes right", value: r.pitch, text: `${r.clean} of ${r.total}` },
        { label: "Evenness", value: r.evenness, text: `${pct(r.evenness)}, ${Math.round(r.evennessErrorMs)} ms off` },
        ...(s.hands === "both"
          ? [
              r.together
                ? { label: "Hands together (40 ms)", value: r.together.beats ? r.together.count / r.together.beats : 0, text: `${r.together.count} of ${r.together.beats} beats` }
                : { label: "Hands together", notMeasured: true },
            ]
          : []),
      ],
      ladder: proj.rungs.map((rg) => ({ bpm: rg.bpm, state: rg.status === "next" ? ("next" as const) : rg.status })),
    };
    status = summary.headline;
  }

  function stop() {
    clearTimeout(timer);
    cap?.stop();
    phase = "ready";
    status = "Stopped. Nothing was recorded.";
  }

  function retempo(delta: number) {
    settings.update({ bpm: Math.min(SCALE_TEMPO.max, Math.max(SCALE_TEMPO.min, bpm() + delta)) });
    phase = "ready";
    summary = null;
  }

  onDestroy(() => {
    clearTimeout(timer);
    cap?.stop();
    stopDemo();
  });

  const scaleOptions = [...SCALE_GROUPS.modes, ...SCALE_GROUPS.jazz].map((k) => ({ value: k, label: scaleLabel(k) + (SCALE_GROUPS.jazz.includes(k) ? " (jazz)" : "") }));
</script>

<svelte:head><title>Scales · Woodshed</title></svelte:head>

<DrillShell
  title="Scales"
  hue="piano"
  blurb="Play the scale evenly at the click. Clean checks climb the tempo ladder."
  summary={summaryLine}
  bind:phase
  bind:mode
  bind:status
  progress={steps.length ? stepIndex / steps.length : 0}
  clock={{ bpm: bpm(), beatsPerBar: 4 }}
  ondemo={playDemo}
  demoPlaying={!!demo?.playing}
  onstart={start}
  onstop={stop}
>
  {#snippet setup()}
    <div class="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      <Choice label="Scale" select options={scaleOptions} value={s.kind} onchange={(v) => setup.set({ kind: v, preset: false })} />
      <Choice label="Tonic" select options={SCALE_TONICS.map((t) => ({ value: t.midi, label: t.name }))} value={s.tonic} onchange={(v) => setup.set({ tonic: v })} />
      <Choice
        label="Span"
        options={[
          { value: "pentascale", label: "Five notes" },
          { value: "one-octave", label: "One octave" },
          { value: "two-octave", label: "Two octaves" },
        ]}
        value={s.span}
        onchange={(v) => setup.set({ span: v, preset: false })}
      />
      <Choice
        label="Direction"
        options={[
          { value: "up", label: "Up" },
          { value: "down", label: "Down" },
          { value: "up-down", label: "Up and down" },
        ]}
        value={s.motion}
        onchange={(v) => setup.set({ motion: v, preset: false })}
      />
      <Choice
        label="Hands"
        options={[
          { value: "right", label: "Right" },
          { value: "left", label: "Left" },
          { value: "both", label: "Both" },
        ]}
        value={s.hands}
        onchange={(v) => setup.set({ hands: v, preset: false })}
      />
      <div class="flex flex-col justify-end gap-1 text-sm">
        <button
          type="button"
          class={btn}
          aria-pressed={s.preset}
          onclick={() => {
            setup.set({ span: HANDS_TOGETHER_PRESET.span, motion: HANDS_TOGETHER_PRESET.motion, hands: HANDS_TOGETHER_PRESET.hands, preset: true });
            settings.update({ bpm: HANDS_TOGETHER_PRESET.bpm });
          }}>{HANDS_TOGETHER_PRESET.label}</button
        >
        <span class="text-ws-soft">Tempo comes from the practice strip (60 to 180).</span>
      </div>
    </div>
  {/snippet}

  {#snippet hud()}
    {#if phase === "running"}
      <Stat label="Step" value="{Math.min(stepIndex + 1, steps.length)} of {steps.length}" />
      {#if mode === "practice" && steps[stepIndex]}<Stat label="Next note" value={steps[stepIndex].notes.map((n) => noteName(n.midi)).join(" + ")} />{/if}
    {:else if result}
      <Stat label="Notes right" value="{result.clean}/{result.total}" tone={result.pitch >= 0.9 ? "success" : "warn"} />
      <Stat label="Evenness" value={pct(result.evenness)} />
    {/if}
  {/snippet}

  {#snippet stage()}
    <Piano {low} {high} {marks} {flashes} label="Piano keyboard, {noteName(low)} to {noteName(high)}" />
    {#if mode === "check" && phase !== "results"}
      <p class="mt-3 text-sm text-ws-stage-soft">Check mode: no targets. Held keys still light.</p>
    {/if}
  {/snippet}

  {#snippet results()}
    {#if summary}
      <Results {summary}>
        {#snippet actions()}
          <button type="button" class={btn} onclick={() => retempo(10)}>Practice next tempo</button>
          <button type="button" class={btn} onclick={() => retempo(-10)}>Slower</button>
        {/snippet}
      </Results>
    {/if}
  {/snippet}
</DrillShell>
