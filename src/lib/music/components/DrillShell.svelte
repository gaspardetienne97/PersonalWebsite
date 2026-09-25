<script lang="ts" module>
  export type Phase = "ready" | "countin" | "running" | "results";
  export type DrillMode = "practice" | "check";

  export interface RunContext {
    mode: DrillMode;
    /** performance.now() of beat 1 after any count-in (or now). */
    downbeat: number;
    beatMs: number;
    bpm: number;
    stopClock(): void;
  }
</script>

<script lang="ts">
  // The three-phase frame every drill uses. Setup collapses to one line; the
  // stage shows the target before Start; a run owns the screen; results lead
  // with the metric. One route-owned status line (role=status) per page.
  import type { Snippet } from "svelte";
  import { onDestroy, tick } from "svelte";
  import Play from "lucide-svelte/icons/play";
  import Square from "lucide-svelte/icons/square";
  import Headphones from "lucide-svelte/icons/headphones";
  import Settings2 from "lucide-svelte/icons/sliders-horizontal";
  import { bench, type Hue } from "../bench.svelte";
  import { audio, input, settings } from "../runtime";
  import { page } from "$app/state";
  import { CATALOG } from "@repo/music-core/content/catalog";

  interface Props {
    title: string;
    hue: Hue;
    blurb?: string;
    /** One line describing the current setup, shown when setup is collapsed. */
    summary: string;
    phase?: Phase;
    mode?: DrillMode;
    /** Drills with no hidden-target variant (free play) set this false. */
    checkable?: boolean;
    status?: string;
    /** 0..1; omit for open-ended runs (no bar is drawn). */
    progress?: number | null;
    /** Run a metronome clock with the bench count-in; omit for untimed drills. */
    clock?: { bpm: number; beatsPerBar: number } | null;
    setup?: Snippet;
    stage: Snippet<[Phase]>;
    hud?: Snippet;
    results?: Snippet;
    actions?: Snippet;
    ondemo?: () => void | Promise<void>;
    demoPlaying?: boolean;
    onstart: (ctx: RunContext) => void | Promise<void>;
    onstop?: () => void;
    startLabel?: string;
    /** What Practice and Check mean for this drill, shown beside the setup line. */
    modeNotes?: { practice: string; check: string };
    /** Disable Start with a reason (e.g. microphone needed). */
    blocked?: string | null;
  }

  let {
    title,
    hue,
    blurb,
    summary,
    phase = $bindable("ready"),
    mode = $bindable("practice"),
    checkable = true,
    status = $bindable(""),
    progress = null,
    clock = null,
    setup,
    stage,
    hud,
    results,
    actions,
    ondemo,
    demoPlaying = false,
    onstart,
    onstop,
    startLabel = "Start",
    blocked = null,
    modeNotes = { practice: "Targets shown. Practice, not a test.", check: "Targets hidden. Counts toward mastery." },
  }: Props = $props();

  let setupOpen = $state(false);
  let clockHandle: { stop(): void } | null = null;
  let heading: HTMLElement | undefined = $state();
  let resultsHeading: HTMLElement | undefined = $state();

  // A drill for one family of instruments switches the practice strip to it, so
  // the strip, the stage and the recorded instrument agree (Pads shows MPC).
  $effect(() => {
    const entry = CATALOG.find((e) => page.url.pathname === e.route.split("?")[0]);
    const ok = entry?.instruments;
    void settings.ready.then(() => {
      if (ok?.length && !bench.locked && !ok.includes(settings.value.activeInstrument))
        void settings.update({ activeInstrument: ok[0] });
    });
  });

  $effect(() => {
    bench.hue = hue;
    return () => {
      if (bench.hue === hue) bench.hue = null;
    };
  });

  $effect(() => {
    const live = phase === "running" || phase === "countin";
    bench.running = live;
    bench.countingIn = phase === "countin";
    bench.setFocus(live);
  });

  $effect(() => {
    if (phase === "results") void tick().then(() => resultsHeading?.focus());
  });

  onDestroy(() => {
    clockHandle?.stop();
    bench.running = false;
    bench.countingIn = false;
    bench.beat = 0;
    bench.setFocus(false);
  });

  function stopClock() {
    clockHandle?.stop();
    clockHandle = null;
    bench.beat = 0;
  }

  async function start() {
    if (blocked || phase === "running" || phase === "countin") return;
    await audio.unlock();
    setupOpen = false;
    const bars = settings.value.countInBars;
    if (!clock) {
      phase = "running";
      await tick();
      heading?.focus();
      await onstart({ mode, downbeat: performance.now(), beatMs: 0, bpm: 0, stopClock });
      return;
    }
    const beatMs = 60000 / clock.bpm;
    bench.beatsPerBar = clock.beatsPerBar;
    phase = bars > 0 ? "countin" : "running";
    if (bars > 0) status = `Count-in: ${bars} bar${bars > 1 ? "s" : ""}.`;
    const handle = audio.metronome.start({
      bpm: clock.bpm,
      beatsPerBar: clock.beatsPerBar,
      countInBars: bars,
      audible: bench.clickDuringRun,
      onBeat: (beat: number, _bar: number, _at: number, isCountIn: boolean) => {
        bench.beat = beat + 1;
        if (!isCountIn && phase === "countin") {
          phase = "running";
          status = "Go.";
        }
      },
    });
    clockHandle = handle;
    await tick();
    heading?.focus();
    await onstart({ mode, downbeat: handle.downbeatPerf, beatMs, bpm: clock.bpm, stopClock });
  }

  function stop() {
    stopClock();
    input.router.releaseAll();
    onstop?.();
  }

  function onKey(e: KeyboardEvent) {
    const t = e.target as HTMLElement | null;
    const onControl = t?.closest("button, a, input, select, textarea, [contenteditable], [role=slider]");
    if (e.code === "Space" && !onControl && !e.repeat) {
      if (phase === "ready" || phase === "results") {
        e.preventDefault();
        void start();
      }
    } else if (e.key === "Escape" && (phase === "running" || phase === "countin")) {
      e.preventDefault();
      stop();
    }
  }

  const live = $derived(phase === "running" || phase === "countin");
</script>

<svelte:window onkeydown={onKey} />

<section class="mx-auto flex w-full max-w-6xl flex-col gap-4" aria-labelledby="drill-title">
  {#if !live}
    <header class="flex flex-wrap items-end justify-between gap-3">
      <div class="min-w-0">
        <h1 id="drill-title" bind:this={heading} tabindex="-1" class="font-display text-3xl font-semibold tracking-tight sm:text-4xl">
          {title}
        </h1>
        {#if blurb}<p class="mt-1 max-w-prose text-ws-soft">{blurb}</p>{/if}
      </div>
      <div class="flex flex-wrap items-center gap-2">
        {#if checkable}
          <div class="flex rounded-full border border-ws-line bg-ws-surface p-1" role="group" aria-label="Mode">
            {#each [["practice", "Practice"], ["check", "Check"]] as const as [id, label] (id)}
              <button
                type="button"
                class="min-h-10 rounded-full px-4 text-sm font-medium {mode === id ? 'bg-instr text-ws-stage' : 'text-ws-soft hover:text-ws-ink'}"
                aria-pressed={mode === id}
                onclick={() => (mode = id)}>{label}</button
              >
            {/each}
          </div>
        {/if}
        {#if ondemo && mode !== "check"}
          <button
            type="button"
            class="flex min-h-11 items-center gap-2 rounded-full border border-ws-line bg-ws-surface px-4 text-sm font-medium hover:bg-ws-raised"
            aria-pressed={demoPlaying}
            onclick={ondemo}
          >
            <Headphones class="size-4" aria-hidden="true" />{demoPlaying ? "Stop demo" : "Hear it first"}
          </button>
        {/if}
      </div>
    </header>

    <div class="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-xl border border-ws-line bg-ws-surface px-4 py-2">
      <p class="min-w-0 flex-1 basis-full text-sm sm:basis-0"><span class="text-ws-soft">Setup:</span> <span class="font-medium">{summary}</span></p>
      {#if checkable}
        <p class="text-sm text-ws-soft">
          {mode === "check" ? modeNotes.check : modeNotes.practice}
        </p>
      {/if}
      {#if setup}
        <button
          type="button"
          class="flex min-h-11 items-center gap-2 rounded-lg px-3 text-sm font-medium text-instr-ink hover:bg-instr-wash"
          aria-expanded={setupOpen}
          aria-controls="drill-setup"
          onclick={() => (setupOpen = !setupOpen)}
        >
          <Settings2 class="size-4" aria-hidden="true" />{setupOpen ? "Done" : "Change setup"}
        </button>
      {/if}
    </div>
    {#if setup && setupOpen}
      <div id="drill-setup" class="rounded-xl border border-ws-line bg-ws-surface p-4">
        {@render setup()}
      </div>
    {/if}
  {:else}
    <h1 bind:this={heading} tabindex="-1" class="sr-only">{title}, running</h1>
  {/if}

  {#if phase === "results" && results}
    <div class="results-enter">
      <h2 bind:this={resultsHeading} tabindex="-1" class="sr-only">Results</h2>
      {@render results()}
    </div>
  {/if}

  <div class="stage relative overflow-hidden rounded-2xl p-3 sm:p-5" class:dim={phase === "results"} class:demo={demoPlaying}>
    {#if live}
      <div class="mb-3 flex items-center gap-3">
        <button
          type="button"
          class="flex min-h-11 items-center gap-2 rounded-full bg-ws-stage-ink/10 px-4 text-sm font-semibold hover:bg-ws-stage-ink/20"
          onclick={stop}
        >
          <Square class="size-4" aria-hidden="true" />Stop <kbd class="text-xs opacity-60">Esc</kbd>
        </button>
        <p class="min-w-0 flex-1 truncate font-display text-lg font-semibold">{title}</p>
        {#if checkable}<span class="rounded-full border border-ws-stage-ink/20 px-3 py-1 text-xs">{mode === "check" ? "Check" : "Practice"}</span>{/if}
      </div>
      {#if progress !== null}<div class="mb-3 h-1.5 overflow-hidden rounded-full bg-ws-stage-ink/10" role="progressbar" aria-label="Run progress" aria-valuemin="0" aria-valuemax="100" aria-valuenow={Math.round(progress * 100)}>
        <div class="h-full rounded-full bg-instr transition-[width]" style:width="{progress * 100}%"></div>
      </div>{/if}
    {/if}
    {#if demoPlaying}<p class="mb-2 text-sm text-ws-stage-soft">Listening, not scored.</p>{/if}
    {#if hud}<div class="mb-3 flex flex-wrap gap-2">{@render hud()}</div>{/if}
    {@render stage(phase)}
  </div>

  <div class="flex flex-wrap items-center gap-3">
    {#if !live}
      <button
        type="button"
        class="flex min-h-12 items-center gap-2 rounded-full bg-instr px-6 font-display text-base font-semibold text-ws-stage shadow-sm hover:brightness-105 disabled:opacity-50"
        disabled={!!blocked}
        onclick={start}
      >
        <Play class="size-5" aria-hidden="true" />{phase === "results" ? "Again" : startLabel}
      </button>
      <span class="text-sm text-ws-soft">{blocked ?? "Space starts, Esc stops."}</span>
    {/if}
    {#if actions}{@render actions()}{/if}
  </div>

  <p role="status" class="min-h-6 text-sm font-medium">{status}</p>
</section>

<style>
  .stage.dim {
    opacity: 0.55;
  }
  .stage.demo {
    outline: 2px dashed color-mix(in oklch, var(--instr) 70%, transparent);
    outline-offset: -6px;
  }
  .results-enter {
    animation: ws-rise 220ms ease-out;
  }
</style>
