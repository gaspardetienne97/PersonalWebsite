<script lang="ts">
  // Chord-Perfect Build and Pick. Build: fret the shape and sound each string low
  // to high, untimed. Pick: the same strings one per click after the count-in.
  // Graded per string on pitch (gradeChordStrings): it measures which notes were
  // sounded, not which string they came from or how clean they rang.
  import { onDestroy } from "svelte";
  import type { NoteEvent } from "@repo/music-core";
  import { noteName } from "@repo/music-core";
  import { catalogEntry } from "@repo/music-core/content/catalog";
  import { chordPerfectTargets } from "@repo/music-core/content/technique";
  import { chordPositions, chordShapeById } from "@repo/music-core/theory/fretboard";
  import { gradeChordStrings, gradeLine } from "@repo/music-core/scoring/technique";
  import DrillShell, { type DrillMode, type Phase, type RunContext } from "$lib/music/components/DrillShell.svelte";
  import Choice from "$lib/music/components/Choice.svelte";
  import Stat from "$lib/music/components/Stat.svelte";
  import Results, { type RunSummary } from "$lib/music/components/Results.svelte";
  import { Flashes } from "$lib/music/components/feedback.svelte";
  import { btn, btnStage } from "$lib/music/components/ui";
  import { DrillSetup } from "$lib/music/setup.svelte";
  import { assistanceFor, assistanceText, capture, pct, runInstrument, runSource, type Capture } from "$lib/music/drill.svelte";
  import { practice } from "$lib/music/practice.svelte";
  import { audio, mic, settings } from "$lib/music/runtime";
  import { exerciseFor, skillsFor } from "./fretted";
  import { fretted } from "./instrument.svelte";
  import { chordSymbol, shapesFor } from "./chords";
  import MicPanel from "./MicPanel.svelte";
  import ModeTabs from "./ModeTabs.svelte";
  import PositionStepper from "./PositionStepper.svelte";
  import ShapeBoard from "./ShapeBoard.svelte";
  import { CHORD_MODES } from "./modes";

  let { kind }: { kind: "build" | "pick" } = $props();
  // svelte-ignore state_referenced_locally
  const isPick = kind === "pick";
  const IDLE_MS = 20_000;

  const cfg = new DrillSetup(isPick ? "chords-pick" : "chords-build", { shape: "guitar.c-major", position: 0 });
  const s = $derived(cfg.value);
  const entry = catalogEntry("chords")!.modes.find((m) => m.id === kind)!;
  const instr = $derived(fretted());
  const onInstrument = <T extends { instrument: string }>(x: T | undefined) => (x && x.instrument === instr ? x : undefined);
  const shapes = $derived(shapesFor(instr));
  // A curated shape, or any chord from the chord finder ("gen.guitar.0.maj"), on this instrument.
  const base = $derived(shapes.find((x) => x.id === s.shape) ?? onInstrument(chordShapeById(s.shape)) ?? shapes[0]);
  const choices = $derived(shapes.some((x) => x.id === base.id) ? shapes : [...shapes, base]);
  const positions = $derived(chordPositions(base.id));
  const posIndex = $derived(Math.min(s.position, Math.max(0, positions.length - 1)));
  const shape = $derived(positions[posIndex] ?? base);
  const symbol = $derived(chordSymbol(shape));
  const targets = $derived(chordPerfectTargets(shape));
  const key = $derived(`${kind}:${shape.id}`);
  const bpm = () => Math.min(160, Math.max(40, settings.value.bpm));

  let phase = $state<Phase>("ready");
  let mode = $state<DrillMode>("practice");
  let status = $state("");
  let matched = $state<boolean[]>([]);
  let heard = $state<number | null>(null);
  let beat = $state(-1);
  let demoMidi = $state<number | null>(null);
  let demo: { stop(): void; playing: boolean } | null = $state(null);
  let summary = $state<RunSummary | null>(null);
  let missedStrings = $state<string[]>([]);
  const flashes = new Flashes();
  let cap: Capture | null = null;
  let run: ReturnType<typeof practice.beginRun> | null = null;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let beatTimer: ReturnType<typeof setInterval> | undefined;
  let stopClockRef: (() => void) | null = null;

  const cursor = $derived(isPick ? beat : matched.findIndex((m) => !m));
  const live = $derived(phase === "running" || phase === "countin");

  function stopDemo() {
    demo?.stop();
    demo = null;
    demoMidi = null;
  }

  async function playDemo() {
    if (demo?.playing) return stopDemo();
    await audio.unlock();
    const gap = isPick ? 60 / bpm() : 0.45;
    const notes = targets.map((t, i) => ({ midi: t.midi, time: i * gap, duration: 1.4 }));
    const strum = targets.map((t, i) => ({ midi: t.midi, time: targets.length * gap + 0.3 + i * 0.02, duration: 1.6 }));
    const handle = audio.playSequence([...notes, ...strum], {
      onNote: (i: number) => (demoMidi = i < targets.length ? targets[i].midi : null),
    });
    demo = handle;
    status = `Listen: ${symbol}, string by string low to high, then strummed.`;
    void handle.done.then(() => {
      if (demo === handle) stopDemo();
    });
  }

  function idle() {
    clearTimeout(timer);
    timer = setTimeout(() => void finish(), IDLE_MS);
  }

  function onNote(e: NoteEvent) {
    if (e.kind !== "noteon" || phase !== "running") return;
    heard = e.midi;
    // Pitch only: the first unmatched string with this note, the next one in order first.
    const order = [...targets.keys()].sort((a, b) => Math.abs(a - Math.max(0, cursor)) - Math.abs(b - Math.max(0, cursor)));
    const k = order.find((i) => !matched[i] && targets[i].midi === e.midi);
    if (k !== undefined) {
      matched[k] = true;
      if (mode === "practice") flashes.add(targets[k].string * 100 + targets[k].fret, "correct");
      if (matched.every(Boolean)) return void setTimeout(() => void finish(), 250);
    } else if (mode === "practice" && e.string !== undefined && e.fret !== undefined) {
      flashes.add(e.string * 100 + e.fret, "wrong");
    }
    if (!isPick) idle();
  }

  async function start(ctx: RunContext) {
    stopDemo();
    summary = null;
    missedStrings = [];
    heard = null;
    matched = targets.map(() => false);
    flashes.clear();
    run = practice.beginRun({
      exerciseId: exerciseFor(entry.exerciseId, instr),
      setupKey: key,
      skillIds: skillsFor(entry.skillIds, instr),
      capabilities: ["technique"],
      modality: "played",
      assistance: assistanceFor(mode),
      difficulty: Math.min(1, shape.difficulty / 5 + (posIndex > 0 ? 0.1 : 0) + (isPick ? 0.1 : 0)),
      instrument: instr,
      params: { shape: shape.id, position: posIndex, ...(isPick ? { bpm: ctx.bpm } : {}) },
    });
    if (isPick) {
      cap = capture(ctx.downbeat - ctx.beatMs / 2, (e) => e.kind === "noteon" && onNote(e));
      const tickBeat = () => (beat = Math.min(targets.length, Math.floor((performance.now() - ctx.downbeat) / ctx.beatMs + 0.5)));
      beatTimer = setInterval(tickBeat, 40);
      timer = setTimeout(() => void finish(), Math.max(0, ctx.downbeat - performance.now()) + (targets.length + 2) * ctx.beatMs);
      stopClockRef = ctx.stopClock;
    } else {
      beat = -1;
      cap = capture(ctx.downbeat, (e) => e.kind === "noteon" && onNote(e));
      status = `Play ${symbol}: fret the shape, then sound string ${targets[0].string} first.`;
      idle();
    }
  }

  function halt() {
    clearTimeout(timer);
    clearInterval(beatTimer);
    stopClockRef?.();
    cap?.stop();
    mic.stop();
    beat = -1;
  }

  async function finish() {
    if (phase !== "running" && phase !== "countin") return;
    halt();
    const notes = cap?.notes ?? [];
    const ons = notes.filter((n) => n.kind === "noteon");
    const r = gradeChordStrings(
      targets.map((t) => t.midi),
      ons.map((n) => n.midi),
    );
    const line = isPick ? gradeLine({ beats: targets.map((t) => [{ midi: t.midi }]), beatMs: 60000 / bpm(), notes }) : null;
    phase = "results";
    await run!.attempt({
      promptId: shape.id,
      correct: r.correct,
      partialCredit: r.score,
      metrics: [...r.metrics, ...(line ? line.metrics.filter((m) => m.kind === "timing") : [])],
      source: runSource(notes),
      instrument: runInstrument(notes, instr) ?? null,
      target: targets.map((t) => t.midi),
      response: ons.map((n) => n.midi),
    });
    const fin = await run!.finish({ score: r.score, correct: r.correct, headline: `${symbol}: ${r.matched} of ${r.total} target notes` });
    missedStrings = targets.filter((t) => !r.strings.some((x) => x.midi === t.midi && x.matched)).map((t) => `string ${t.string} (${noteName(t.midi)})`);
    summary = {
      headline: !ons.length
        ? "Nothing was heard during the run. Tap the strings, play into the microphone, or connect MIDI, then try again."
        : r.correct
          ? `All ${r.total} target notes of ${symbol} matched${mode === "check" ? " from memory" : ""}.${mode === "practice" ? " Try it in Check with the shape hidden." : ""}`
          : `${r.matched} of ${r.total} target notes matched. Missed ${missedStrings.join(", ")}.`,
      metric: `${r.matched}/${r.total}`,
      metricLabel: "target notes matched",
      delta: fin.delta,
      best: fin.best,
      clean: r.correct && mode === "check",
      xp: fin.xp,
      assistance: assistanceText(mode),
      rows: [
        { label: "Target notes matched", value: r.score, text: `${r.matched} of ${r.total}` },
        { label: "Other notes sounded", text: r.extra.length ? r.extra.map((m) => noteName(m)).join(", ") : "None" },
        ...(line
          ? [
              { label: "Evenness", value: line.evenness, text: `${pct(line.evenness)}, ${Math.round(line.evennessErrorMs)} ms off` },
              { label: "Timing error", text: `${Math.round(line.meanTimingErrorMs)} ms mean` },
            ]
          : []),
        { label: "Which string each note came from", notMeasured: true },
        { label: "Tone cleanliness", notMeasured: true },
      ],
    };
    status = summary.headline;
  }

  function stop() {
    halt();
    phase = "ready";
    status = "Stopped. Nothing was recorded.";
  }

  onDestroy(() => {
    halt();
    stopDemo();
  });

  const summaryLine = $derived(`${symbol} (${base.name}), ${shape.positionLabel ?? "Open position"}${isPick ? `, one string per click at ${bpm()} BPM` : ", untimed"}`);
  const showShape = $derived(mode === "practice" || phase === "results");
</script>

<DrillShell
  title={isPick ? "Pick it clean" : "Build the chord"}
  hue={instr}
  blurb={isPick
    ? "Hold the shape and pick one string per click, low to high, so every note speaks."
    : "Fret the shape, then sound each string from low to high. Each target note ticks off as it is heard."}
  summary={summaryLine}
  bind:phase
  bind:mode
  bind:status
  progress={targets.length ? matched.filter(Boolean).length / targets.length : 0}
  clock={isPick ? { bpm: bpm(), beatsPerBar: 4 } : null}
  ondemo={playDemo}
  demoPlaying={!!demo?.playing}
  onstart={start}
  onstop={stop}
>
  {#snippet setup()}
    <div class="grid gap-4 sm:grid-cols-2">
      <Choice label="Chord" select options={choices.map((x) => ({ value: x.id, label: x.id.startsWith("gen.") ? x.name : `${chordSymbol(x)}, ${x.name}` }))} value={base.id} onchange={(v) => cfg.set({ shape: v, position: 0 })} />
      <a class="self-end text-sm font-medium text-instr-ink underline underline-offset-4" href="/music/library?tab=reference&section=fretted-chords">Any chord in any position: the chord finder</a>
      <p class="self-end text-sm text-ws-soft">
        Shapes are written for {instr === "guitar" ? "standard tuning" : "high-G tuning"}. {isPick ? "Tempo comes from the practice strip." : ""}
      </p>
    </div>
  {/snippet}

  {#snippet hud()}
    {#if phase === "running"}
      <Stat label="Chord" value={symbol} />
      <Stat label="Target notes" value="{matched.filter(Boolean).length} of {targets.length}" />
      {#if heard !== null}<Stat label="Heard" value={noteName(heard)} />{/if}
    {/if}
  {/snippet}

  {#snippet stage()}
    {#if !live}<ModeTabs tabs={CHORD_MODES} label="Chord drills" />{/if}
    <div class="mb-3 flex flex-wrap items-end justify-between gap-3">
      <p class="font-display text-5xl font-bold leading-none">{symbol}</p>
      {#if !live && phase !== "results"}
        <PositionStepper {positions} index={posIndex} onchange={(i) => cfg.set({ position: i })} />
      {/if}
    </div>
    <ShapeBoard {shape} show={showShape} demo={demoMidi} {flashes} label="{symbol} on the {instr} neck" />
    <ol class="mt-3 flex flex-wrap gap-1.5" aria-label="Strings, low to high">
      {#each targets as t, i (t.string)}
        {@const done = matched[i]}
        <li
          class="tnum flex min-h-9 items-center gap-1.5 rounded-full border px-3 text-sm {done
            ? 'border-transparent bg-success/90 font-semibold text-white'
            : live && i === cursor
              ? 'border-instr text-ws-stage-ink ring-2 ring-instr'
              : 'border-ws-stage-ink/25 text-ws-stage-soft'}"
        >
          <span>String {t.string}</span>
          <span class="font-semibold">{showShape || done ? noteName(t.midi) : "?"}</span>
          {#if done}<span aria-hidden="true">✓</span><span class="sr-only">matched</span>{:else if live && i === cursor}<span class="sr-only">next</span>{/if}
        </li>
      {/each}
    </ol>
    {#if phase === "running" && !isPick}
      <div class="mt-3"><button type="button" class={btnStage} onclick={() => void finish()}>Finish now</button></div>
    {/if}
    <p class="mt-3 max-w-prose text-sm text-ws-stage-soft">
      Pitch matching checks which notes you sounded, not which string they came from or how clean they rang.
      {mode === "check" && phase !== "results" ? " Check hides the shape: play it from memory." : ""}
    </p>
          <div class="mt-3"><MicPanel disabled={live} hint="Optional: pluck your {instr} into the microphone, one string at a time, or tap the strings here." /></div>
  {/snippet}

  {#snippet results()}
    {#if summary}
      <Results {summary}>
        {#snippet actions()}
          {#if isPick}
            <button type="button" class={btn} onclick={() => { settings.update({ bpm: bpm() + 10 }); phase = "ready"; summary = null; }}>Faster, {bpm() + 10} BPM</button>
          {/if}
          {#if posIndex < positions.length - 1}
            <button type="button" class={btn} onclick={() => { cfg.set({ position: posIndex + 1 }); phase = "ready"; summary = null; }}>Same chord, higher up</button>
          {/if}
        {/snippet}
      </Results>
    {/if}
  {/snippet}
</DrillShell>
