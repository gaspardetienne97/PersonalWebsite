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

  /** One clause of the setup sentence; `focus` names the control (its setupKey) a click opens. */
  export interface SetupClause {
    text: string;
    focus?: string;
  }

  /** Lets Results start the next run (the "Next run" button) without a prop through every drill. */
  export const SHELL_KEY = Symbol("drill-shell");
  export interface ShellApi {
    start(): Promise<void>;
    /** Results shows a next-run button, so Again steps back to a secondary action. */
    offer(on: boolean): void;
  }
</script>

<script lang="ts">
  // The three-phase frame every drill uses. Setup collapses to one line; the
  // stage shows the target before Start; a run owns the screen; results lead
  // with the metric. One route-owned status line (role=status) per page.
  import type { Snippet } from "svelte";
  import { onDestroy, setContext, tick } from "svelte";
  import { fade } from "svelte/transition";
  import ArrowLeft from "lucide-svelte/icons/arrow-left";
  import { backFor } from "$lib/music/came-from.svelte";
  import Play from "lucide-svelte/icons/play";
  import Square from "lucide-svelte/icons/square";
  import Headphones from "lucide-svelte/icons/headphones";
  import BookOpen from "lucide-svelte/icons/book-open";
  import LessonView from "./LessonView.svelte";
  import InputCheck from "./InputCheck.svelte";
  import { lessonsAuto } from "../lessons.svelte";
  import { pendingLessons, type LessonRef } from "@repo/music-core/lessons/types";
  import Settings2 from "lucide-svelte/icons/sliders-horizontal";
  import { bench, INSTRUMENT_LABEL, type Hue } from "../bench.svelte";
  import { audio, input, settings } from "../runtime";
  import { page } from "$app/state";
  import { CATALOG } from "@repo/music-core/content/catalog";

  interface Props {
    title: string;
    hue: Hue;
    blurb?: string;
    /** The current setup as one line, or as clauses that each open their own control. */
    summary: string | readonly SetupClause[];
    /** The drill's exercises as a tab row under the title (one place for "which exercise"). */
    tabs?: readonly { id: string; label: string }[];
    tab?: string;
    ontab?: (id: string) => void;
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
    /** Intro lessons for the current setup; unseen ones show in place of the stage. */
    lesson?: LessonRef | null;
    /** Whether the drill listens to the instrument (warns when its input is off); the catalog's modality otherwise. */
    listens?: boolean;
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
    tabs,
    tab,
    ontab,
    lesson = null,
    listens,
    modeNotes = { practice: "Targets shown. Practice, not a test.", check: "Targets hidden. Counts toward mastery." },
  }: Props = $props();

  // Back to where the drill was opened from (Today, Drills, Paths...).
  const back = $derived(backFor(page.url.pathname));
  const entry = $derived(CATALOG.find((e) => page.url.pathname === e.route.split("?")[0]));
  const played = $derived(listens ?? (!!entry && ["played", "tapped", "sung"].includes(entry.modality)));
  let setupOpen = $state(false);
  const clauses = $derived<readonly SetupClause[]>(typeof summary === "string" ? [{ text: summary }] : summary);
  /** Open the panel on one control: the clause's setupKey. */
  async function openAt(focus?: string) {
    setupOpen = true;
    if (!focus) return;
    await tick();
    const el = document.querySelector<HTMLElement>(`#drill-setup [data-setup="${focus}"]`);
    el?.scrollIntoView({ block: "nearest" });
    el?.querySelector<HTMLElement>("button, input, select, [tabindex]")?.focus();
  }
  // Intro lessons: decided only after the stored settings arrive (no flash for a returning player).
  let ready = $state(false);
  void settings.ready.then(() => (ready = true));
  const live = $derived(phase === "running" || phase === "countin");
  /** The current setup's lessons, as one key. */
  const lessonIds = $derived(lesson?.lessons.map((l) => l.id).join() ?? "");
  /** The lessons the Lesson button was pressed for; a setup with other lessons is not a revisit. */
  let revisitFor = $state<string | null>(null);
  const revisit = $derived(revisitFor === lessonIds);
  const pending = $derived(pendingLessons(lesson, settings.value.lessonsSeen));
  /** What the lesson view plays: the pending ones, or all of them when asked for again. */
  const shownLessons = $derived(revisit ? (lesson?.lessons ?? []) : pending);
  // Between runs (ready or results), never during one.
  const showing = $derived(
    !live && shownLessons.length > 0 && (revisit || (ready && lessonsAuto() && (lesson?.trigger === "check" ? mode === "check" : true))),
  );
  let startButton: HTMLButtonElement | undefined = $state();
  async function endLesson() {
    const seen = settings.value.lessonsSeen ?? [];
    const ids = shownLessons.map((l) => l.id).filter((id) => !seen.includes(id));
    revisitFor = null;
    if (ids.length) void settings.update({ lessonsSeen: [...seen, ...ids] });
    if (lesson?.trigger !== "check") mode = "practice";
    // The lesson's buttons are gone: focus moves on to Start (or the title when Start is blocked).
    await tick();
    (startButton && !startButton.disabled ? startButton : heading)?.focus();
  }
  let clockHandle: { stop(): void } | null = null;
  let goTimer: ReturnType<typeof setTimeout> | undefined;
  /** Count-in clicks so far, and how many bars it lasts (for the count-in panel). */
  let countBeats = $state(0);
  let countBars = $state(0);
  /** The count-in on screen: until the downbeat itself, though input is live half a beat before it. */
  let counting = $state(false);
  let heading: HTMLElement | undefined = $state();
  let resultsHeading: HTMLElement | undefined = $state();

  // A drill for one family of instruments switches the practice strip to it, so
  // the strip, the stage and the recorded instrument agree (Pads shows MPC).
  // It runs again when the strip changes, and says so when it switches.
  $effect(() => {
    const ok = entry?.instruments;
    void settings.value.activeInstrument;
    void settings.ready.then(() => {
      if (ok?.length && !bench.locked && !ok.includes(settings.value.activeInstrument)) {
        void settings.update({ activeInstrument: ok[0] });
        if (phase === "ready") status = `${title} is for ${ok.map((i) => INSTRUMENT_LABEL[i]).join(", ")}: switched to ${INSTRUMENT_LABEL[ok[0]]}.`;
      }
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
    bench.countingIn = live && counting;
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

  /** Input is live from here (half a beat before the downbeat); the screen still counts in until the beat. */
  function go() {
    clearTimeout(goTimer);
    if (phase === "countin") phase = "running";
  }

  function stopClock() {
    clockHandle?.stop();
    clockHandle = null;
    bench.beat = 0;
  }

  async function start() {
    if (blocked || showing || live) return;
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
    countBeats = 0;
    countBars = bars;
    counting = bars > 0;
    if (bars > 0) status = `Count-in: ${bars} bar${bars > 1 ? "s" : ""}.`;
    const handle = audio.metronome.start({
      bpm: clock.bpm,
      beatsPerBar: clock.beatsPerBar,
      countInBars: bars,
      audible: bench.clickDuringRun,
      onBeat: (beat: number, _bar: number, _at: number, isCountIn: boolean) => {
        bench.beat = beat + 1;
        if (isCountIn) countBeats++;
        else if (counting) {
          // The downbeat: the count-in leaves the screen and says go, on the beat.
          counting = false;
          go();
          status = "Go.";
        }
      },
    });
    clockHandle = handle;
    // Running from half a beat before the downbeat, the window drills listen from: the
    // beat callback fires at or after the beat, so a first note on it (or a hair early)
    // would land while the phase still said count-in and be dropped.
    clearTimeout(goTimer);
    if (bars > 0) goTimer = setTimeout(go, Math.max(0, handle.downbeatPerf - beatMs / 2 - performance.now()));
    await tick();
    heading?.focus();
    await onstart({ mode, downbeat: handle.downbeatPerf, beatMs, bpm: clock.bpm, stopClock });
  }

  let offered = $state(false);
  setContext<ShellApi>(SHELL_KEY, { start, offer: (on) => (offered = on) });

  function stop() {
    clearTimeout(goTimer);
    counting = false;
    stopClock();
    input.router.releaseAll();
    onstop?.();
  }

  function onKey(e: KeyboardEvent) {
    const t = e.target as HTMLElement | null;
    const onControl = t?.closest("button, a, input, select, textarea, [contenteditable], [role=slider]");
    if (showing) return;
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

</script>

<svelte:window onkeydown={onKey} />

<section class="mx-auto flex w-full max-w-6xl flex-col gap-4" aria-labelledby="drill-title">
  {#if !live}
    <header class="flex flex-wrap items-end justify-between gap-3">
      <div class="min-w-0">
        <a class="-ml-2 inline-flex min-h-11 items-center gap-1.5 rounded-lg px-2 text-sm font-semibold text-instr-ink hover:bg-instr-wash" href={back.href}>
          <ArrowLeft class="size-4" aria-hidden="true" />Back to {back.label}
        </a>
        <h1 id="drill-title" bind:this={heading} tabindex="-1" class="font-display text-3xl font-semibold tracking-tight sm:text-4xl">
          {title}
        </h1>
        {#if blurb}<p class="mt-1 max-w-prose text-ws-soft">{blurb}</p>{/if}
      </div>
      <div class="flex flex-col items-start gap-1 sm:items-end">
        <div class="flex flex-wrap items-center gap-2">
          {#if checkable}
            <div class="flex rounded-full border border-ws-line bg-ws-surface p-1" role="group" aria-label="Mode" aria-describedby="mode-note">
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
          {#if lesson?.lessons.length}
            <button
              type="button"
              class="flex min-h-11 items-center gap-2 rounded-full border border-ws-line bg-ws-surface px-4 text-sm font-medium hover:bg-ws-raised"
              onclick={() => (revisitFor = lessonIds)}
            >
              <BookOpen class="size-4" aria-hidden="true" />Lesson
            </button>
          {/if}
          {#if ondemo && (mode !== "check" || demoPlaying)}
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
        {#if checkable}<p id="mode-note" class="max-w-80 text-xs text-ws-soft sm:text-right">{mode === "check" ? modeNotes.check : modeNotes.practice}</p>{/if}
      </div>
    </header>

    {#if tabs && tabs.length > 1}
      <div class="-mx-1 flex snap-x gap-1.5 overflow-x-auto px-1 pb-1 [scrollbar-width:thin] sm:flex-wrap sm:overflow-visible" role="group" aria-label="Exercise">
        {#each tabs as x (x.id)}
          <button
            type="button"
            class="min-h-10 shrink-0 snap-start whitespace-nowrap rounded-full border px-4 text-sm font-medium {tab === x.id ? 'border-transparent bg-instr font-semibold text-ws-stage' : 'border-ws-line bg-ws-surface hover:bg-ws-raised'}"
            aria-pressed={tab === x.id}
            onclick={() => ontab?.(x.id)}>{x.label}</button
          >
        {/each}
      </div>
    {/if}

    <div class="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-xl border border-ws-line bg-ws-surface px-4 py-2">
      <p class="min-w-0 flex-1 basis-full text-sm sm:basis-0" data-testid="setup-line">
        <span class="text-ws-soft">Setup:</span>
        {#each clauses as c, i (i)}{#if setup && c.focus}<button type="button" class="clause font-medium" onclick={() => openAt(c.focus)}>{c.text}</button>{:else}<span class="font-medium">{c.text}</span>{/if}{#if i < clauses.length - 1}<span class="text-ws-soft">{", "}</span>{/if}{/each}
      </p>
      {#if setup}
        <button
          type="button"
          class="flex min-h-11 items-center gap-2 rounded-lg px-3 text-sm font-medium text-instr-ink hover:bg-instr-wash"
          aria-expanded={setupOpen}
          aria-controls="drill-setup"
          onclick={() => (setupOpen = !setupOpen)}
        >
          <Settings2 class="size-4" aria-hidden="true" />{setupOpen ? "Hide setup" : "Setup"}
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

  {#if phase === "ready" && played && !showing}<InputCheck required={!!blocked} />{/if}

  {#if phase === "results" && results && !showing}
    <div class="results-enter">
      <h2 bind:this={resultsHeading} tabindex="-1" class="sr-only">Results</h2>
      {@render results()}
    </div>
  {/if}

  <div class="stage relative overflow-hidden rounded-2xl p-3 sm:p-5" class:dim={phase === "results" && !showing} class:demo={demoPlaying}>
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
    {#if showing}
      {#key shownLessons.map((l) => l.id).join()}
        <LessonView lessons={shownLessons} onfinish={endLesson} onskip={endLesson} />
      {/key}
    {:else}
      {@render stage(phase)}
    {/if}
    {#if counting && (phase === "countin" || phase === "running")}
      <!-- The count-in over the stage (nothing shifts when it goes), counted as a player would:
           the beat in big type, the bar's clicks as dots. Taps pass through to the stage. -->
      <div class="countin pointer-events-none absolute inset-0 z-20 grid place-items-center" aria-hidden="true" out:fade={{ duration: 150 }}>
        <div class="flex flex-col items-center gap-3 text-center">
          <span class="text-sm font-semibold tracking-wide text-ws-stage-ink/80">Count-in{countBars > 1 && countBeats ? `, bar ${Math.min(countBars, Math.ceil(countBeats / bench.beatsPerBar))} of ${countBars}` : ""}</span>
          {#key countBeats}<span class="count font-display text-8xl font-bold leading-none tnum">{bench.beat || ""}</span>{/key}
          <span class="flex items-center gap-2.5">
            {#each Array.from({ length: bench.beatsPerBar }, (_, i) => i + 1) as b (b)}
              <span class="size-4 rounded-full {bench.beat >= b && countBeats ? 'bg-warn' : 'bg-ws-stage-ink/25'}"></span>
            {/each}
          </span>
          <span class="text-sm text-ws-stage-ink/80">Play on the next 1.</span>
        </div>
      </div>
    {/if}
  </div>

  <div class="flex flex-wrap items-center gap-3">
    {#if !live && !showing}
      <button
        bind:this={startButton}
        type="button"
        class="flex min-h-12 items-center gap-2 rounded-full px-6 font-display text-base font-semibold disabled:opacity-50 {offered && phase === 'results' ? 'border border-ws-line bg-ws-surface hover:bg-ws-raised' : 'bg-instr text-ws-stage shadow-sm hover:brightness-105'}"
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
  .countin {
    background: color-mix(in oklch, var(--ws-stage) 62%, transparent);
    backdrop-filter: blur(1.5px);
    color: var(--ws-stage-ink);
    /* Legible over a white staff too. */
    text-shadow:
      0 0 12px var(--ws-stage),
      0 1px 3px var(--ws-stage);
  }
  .count {
    animation: count-pop 0.25s ease-out;
  }
  @keyframes count-pop {
    from {
      transform: scale(1.35);
      opacity: 0.6;
    }
  }
  @media (prefers-reduced-motion: reduce) {
    .count {
      animation: none;
    }
  }
  .clause {
    border-radius: 0.25rem;
    text-decoration: underline dotted;
    text-underline-offset: 3px;
    text-decoration-color: color-mix(in oklch, currentColor 45%, transparent);
  }
  .clause:hover {
    color: var(--instr-ink);
    text-decoration-style: solid;
  }
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
