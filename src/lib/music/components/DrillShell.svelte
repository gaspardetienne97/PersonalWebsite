<script lang="ts" module>
  import type { NextRun } from "../advance.svelte";
  /** The next-run button's verb, by the kind of move. */
  export const NEXT_VERB: Record<string, string> = { faster: "Speed up to", slower: "Slow down to", harder: "Move on:", easier: "Step back:" };
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

  /** Lets Results hand the next run to the shell's action bar without a prop through every drill. */
  export const SHELL_KEY = Symbol("drill-shell");
  export interface ShellApi {
    start(): Promise<void>;
    /** The next run by the shared rule, drawn as the bar's primary button (Again steps back); null for none. */
    offer(next: NextRun | null): void;
    /** A run where nothing was heard: the stage (its unplayed targets) leaves the screen and Again steps back. */
    silent(on: boolean): void;
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
    /** How many tabs stay in view; the rest wait behind "More exercises". Rows over 8 keep 4 by default. */
    firstTabs?: number;
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
    /** What `blocked` waits for, as one tap ("Turn on the microphone", "Import a recording"): it takes Start's
     *  place as the primary, and the input warning is left out. Start comes back when `blocked` clears. */
    unblock?: { label: string; run: () => void | Promise<void> } | null;
    /** False when a Practice run's setup has no checked version (sight-reading's Wait for me): no "Run it in Check". */
    checkRun?: boolean;
    /** The drill does not use the strip's instrument (answer buttons, rhythm writing), so the strip says
     *  "Any instrument". Heard and recognised drills from the catalogue by default; drills whose answer mode
     *  plays the instrument pass false. */
    instrumentFree?: boolean;
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
    firstTabs,
    tab,
    ontab,
    lesson = null,
    listens,
    unblock = null,
    checkRun = true,
    instrumentFree,
    modeNotes = { practice: "Targets shown. Practice, not a test.", check: "Targets hidden. Counts toward mastery." },
  }: Props = $props();

  // Back to where the drill was opened from (Today, Drills, Paths...).
  const back = $derived(backFor(page.url.pathname));
  const entry = $derived(CATALOG.find((e) => page.url.pathname === e.route.split("?")[0]));
  const played = $derived(listens ?? (!!entry && ["played", "tapped", "sung"].includes(entry.modality)));
  // Opt in only: most heard drills still draw their answer on the strip's instrument (BRIEF), so they keep the picker.
  const free = $derived(instrumentFree ?? false);
  // Read by the practice strip (contract with BenchStrip): set here, cleared when the drill closes.
  $effect(() => {
    bench.instrumentFree = free;
    return () => {
      bench.instrumentFree = false;
    };
  });
  /** Blocked by something one tap fixes: that tap is the primary, in Start's place. */
  const unblocking = $derived(!!blocked && !!unblock);
  let unblockBusy = $state(false);
  async function runUnblock() {
    if (!unblock || unblockBusy) return;
    unblockBusy = true;
    try {
      await unblock.run();
    } catch (e) {
      status = e instanceof Error && e.message ? e.message : "That did not work. Try again.";
    } finally {
      unblockBusy = false;
    }
    // Start takes the same place: focus follows it.
    await tick();
    const b = visibleStart();
    if (b && !b.disabled) b.focus();
  }
  const ghost = "flex min-h-11 items-center justify-center gap-2 rounded-full border border-ws-line bg-ws-surface px-4 text-sm font-medium hover:bg-ws-raised";
  const secondary =
    "flex min-h-12 items-center justify-center gap-2 rounded-full border border-ws-line bg-ws-surface px-6 font-display text-base font-semibold hover:bg-ws-raised disabled:opacity-50";
  const primary =
    "flex min-h-12 items-center justify-center gap-2 rounded-full bg-instr px-6 font-display text-base font-semibold text-ws-stage shadow-sm hover:brightness-105 disabled:opacity-50";
  let setupOpen = $state(false);
  let blurbOpen = $state(false);
  // Long exercise rows: the first few, plus the open one, until "More exercises".
  let allTabs = $state(false);
  const keep = $derived(firstTabs ?? ((tabs?.length ?? 0) > 8 ? 4 : Infinity));
  const hiddenTabs = $derived(Math.max(0, (tabs?.length ?? 0) - keep));
  const shownTabs = $derived(allTabs || !hiddenTabs ? (tabs ?? []) : (tabs ?? []).filter((x, i) => i < keep || x.id === tab));
  async function toggleTabs() {
    allTabs = !allTabs;
    if (!allTabs) return;
    // Keyboard focus moves to the first exercise the button showed.
    await tick();
    document.querySelectorAll<HTMLButtonElement>("#drill-exercises [data-tab]")[keep]?.focus();
  }
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
  /** After a run, with its results on screen: the header keeps only the title and mode, the setup moves below the results. */
  const afterRun = $derived(phase === "results" && !showing);
  /** Start is drawn twice (the setup row on a laptop, the dock on a phone); CSS shows one. */
  const visibleStart = () => [...document.querySelectorAll<HTMLButtonElement>("[data-start]")].find((b) => b.getClientRects().length);
  async function endLesson() {
    const seen = settings.value.lessonsSeen ?? [];
    const ids = shownLessons.map((l) => l.id).filter((id) => !seen.includes(id));
    revisitFor = null;
    if (ids.length) void settings.update({ lessonsSeen: [...seen, ...ids] });
    if (lesson?.trigger !== "check") mode = "practice";
    // The lesson's buttons are gone: focus moves on to Start (or the title when Start is blocked).
    await tick();
    const startButton = visibleStart();
    (startButton && !startButton.disabled ? startButton : heading)?.focus();
  }
  /** Start, or a lesson's Next, docks at the bottom of a phone screen; the section pads for it. */
  const docked = $derived(!live && (showing || phase === "ready"));
  let clockHandle: { stop(): void } | null = null;
  let goTimer: ReturnType<typeof setTimeout> | undefined;
  /** Count-in clicks so far, and how many bars it lasts (for the count-in panel). */
  let countBeats = $state(0);
  let countBars = $state(0);
  /** The count-in on screen: until the downbeat itself, though input is live half a beat before it. */
  let counting = $state(false);
  let heading: HTMLElement | undefined = $state();
  let resultsHeading: HTMLElement | undefined = $state();
  let resultsBox: HTMLElement | undefined = $state();
  let stageBox: HTMLElement | undefined = $state();
  /** Set by Results: nothing was heard, so the stage is left out (its targets were never played). */
  let silent = $state(false);

  // A long exercise row scrolls sideways on a phone: fade the edge that has more, and keep the open one in view.
  let tabRow: HTMLElement | undefined = $state();
  let fadeL = $state(false);
  let fadeR = $state(false);
  function edges() {
    if (!tabRow) return;
    fadeL = tabRow.scrollLeft > 6;
    fadeR = tabRow.scrollLeft + tabRow.clientWidth < tabRow.scrollWidth - 6;
  }
  $effect(() => {
    void tab;
    void shownTabs.length;
    if (!tabRow) return;
    tabRow.querySelector<HTMLElement>('[aria-pressed="true"]')?.scrollIntoView({ inline: "nearest", block: "nearest" });
    edges();
  });

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

  // The results lead the screen: scrolled to the top (under the strip), focus on their heading.
  $effect(() => {
    if (phase !== "results") return;
    void tick().then(() => {
      resultsHeading?.focus({ preventScroll: true });
      pin(resultsBox);
    });
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

  /** The setup header collapses on Start: bring the stage's top into view (it was left scrolled). */
  function toStage() {
    heading?.focus({ preventScroll: true });
    pin(stageBox);
  }
  /** Scroll `el` to the top of the view (under the strip, by its scroll margin). The page can still be
   *  growing (a stage drawn after its data), so it pins again twice, unless the player has scrolled. */
  function pin(el?: HTMLElement) {
    if (!el) return;
    el.scrollIntoView({ block: "start" });
    let y = scrollY;
    for (const ms of [120, 400])
      setTimeout(() => {
        if (Math.abs(scrollY - y) > 2 || !el.isConnected) return;
        el.scrollIntoView({ block: "start" });
        y = scrollY;
      }, ms);
  }

  async function start() {
    if (blocked || showing || live) return;
    await audio.unlock();
    setupOpen = false;
    silent = false;
    const bars = settings.value.countInBars;
    if (!clock) {
      phase = "running";
      await tick();
      toStage();
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
    toStage();
    await onstart({ mode, downbeat: handle.downbeatPerf, beatMs, bpm: clock.bpm, stopClock });
  }

  let offered = $state.raw<NextRun | null>(null);
  setContext<ShellApi>(SHELL_KEY, { start, offer: (next) => (offered = next), silent: (on) => (silent = on) });
  async function goNext() {
    offered?.go();
    await tick();
    await start();
  }
  /** After a Practice run: the same setup again with the targets hidden (the mode changes before the run). */
  async function runInCheck() {
    mode = "check";
    await tick();
    await start();
  }

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

<svelte:window onkeydown={onKey} onresize={edges} />

<section class="mx-auto flex w-full max-w-6xl flex-col gap-4 {docked ? 'max-lg:pb-20' : ''}" aria-labelledby="drill-title">
  {#if !live}
    <header class="flex flex-col gap-3">
      <div class="min-w-0">
        <a class="-ml-2 inline-flex min-h-11 items-center gap-1.5 rounded-lg px-2 text-sm font-semibold text-instr-ink hover:bg-instr-wash" href={back.href}>
          <ArrowLeft class="size-4" aria-hidden="true" />Back to {back.label}
        </a>
        <div class="flex flex-wrap items-center gap-x-3 gap-y-1">
          <h1 id="drill-title" bind:this={heading} tabindex="-1" class="font-display font-semibold tracking-tight {afterRun ? 'text-2xl sm:text-3xl' : 'text-3xl sm:text-4xl'}">
            {title}
          </h1>
          {#if afterRun && checkable}<span class="rounded-full border border-ws-line px-3 py-1 text-xs font-medium text-ws-soft">{mode === "check" ? "Check" : "Practice"}</span>{/if}
        </div>
        {#if blurb && !afterRun}
          <!-- Two lines on a phone, so Start stays near; a long one opens with "more". -->
          <div class="mt-1 flex items-start gap-1">
            <p id="drill-blurb" class="min-w-0 max-w-prose flex-1 text-ws-soft {blurbOpen ? '' : 'max-sm:line-clamp-2'}">{blurb}</p>
            {#if blurb.length > 90}
              <button type="button" class="-my-2.5 min-h-11 shrink-0 self-end rounded-lg px-2 text-sm font-medium text-instr-ink sm:hidden" aria-expanded={blurbOpen} aria-controls="drill-blurb" onclick={() => (blurbOpen = !blurbOpen)}>
                {blurbOpen ? "less" : "more"}
              </button>
            {/if}
          </div>
        {/if}
      </div>
      {#if !afterRun}{@render controls()}{/if}
    </header>
    {#if !afterRun}{@render exercises()}{/if}
  {:else}
    <h1 bind:this={heading} tabindex="-1" class="sr-only">{title}, running</h1>
  {/if}

  {#if phase === "ready" && played && !showing && !unblocking}<InputCheck required={!!blocked} />{/if}

  {#if afterRun && results}
    <div class="results-enter scroll-mt-[calc(var(--ws-strip-h,3.75rem)+1rem)]" bind:this={resultsBox}>
      <h2 bind:this={resultsHeading} tabindex="-1" class="sr-only">Results</h2>
      {@render results()}
    </div>
    <!-- After a run the next action comes straight after the results, before the stage, in the page's flow.
         The setup (mode, exercise, settings) follows, for a change before the next run. -->
    {@render bar()}
  {/if}
  {#if afterRun}
    <div class="flex flex-col gap-3">
      {@render controls()}
      {@render exercises()}
    </div>
  {/if}

  <!-- A silent run leaves the stage out: its targets were never played, so nothing on it is a result. -->
  <div
    bind:this={stageBox}
    class="stage relative scroll-mt-[calc(var(--ws-strip-h,3.75rem)+0.5rem)] overflow-hidden rounded-2xl p-3 sm:p-5"
    class:hidden={phase === "results" && silent && !showing}
    class:demo={demoPlaying}
    data-live={live ? "" : undefined}
  >
    {#if live}
      <!-- The run's own header: Stop, the drill, the mode. Stop stays here on every width, so the
           bottom of a phone screen is the instrument's. -->
      <div class="mb-3 flex items-center gap-2 sm:gap-3">
        <button
          type="button"
          class="flex min-h-11 shrink-0 items-center gap-2 rounded-full bg-ws-stage-ink/12 px-3.5 text-sm font-semibold hover:bg-ws-stage-ink/20 sm:px-4"
          onclick={stop}
        >
          <Square class="size-3.5 fill-current" aria-hidden="true" />Stop <kbd class="text-xs font-normal opacity-60 max-sm:hidden pointer-coarse:hidden">Esc</kbd>
        </button>
        <p class="min-w-0 flex-1 font-display text-base font-semibold leading-tight sm:truncate sm:text-lg">{title}</p>
        {#if checkable}<span class="shrink-0 rounded-full border border-ws-stage-ink/20 px-3 py-1 text-xs">{mode === "check" ? "Check" : "Practice"}</span>{/if}
      </div>
      {#if progress !== null}<div class="mb-3 h-1.5 shrink-0 overflow-hidden rounded-full bg-ws-stage-ink/10" role="progressbar" aria-label="Run progress" aria-valuemin="0" aria-valuemax="100" aria-valuenow={Math.round(progress * 100)}>
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

  {#if phase === "ready" && !showing}
    <!-- On a phone (and up to lg) Start docks above the tab bar: chrome, like the tab bar, never over the stage
         (the section's bottom padding lets the stage scroll clear of it). -->
    <div class="fixed inset-x-0 bottom-[var(--ws-dock-h,3.5rem)] z-30 border-t border-ws-line bg-ws-surface px-4 py-2 lg:hidden" data-testid="drill-bar">
      <div class="mx-auto flex max-w-2xl flex-col gap-1">
        {@render startButton("w-full")}
        {#if blocked && !unblocking}<span class="text-center text-xs text-ws-soft">{blocked}</span>{/if}
      </div>
    </div>
  {/if}
  {#if actions}<div class="flex flex-wrap items-center gap-3">{@render actions()}</div>{/if}

  <!-- Announced, not shown: the stage and the results already say it on screen. -->
  <p role="status" class="sr-only">{status}</p>
</section>

<!-- The same controls in the same order and the same place on every drill and in every phase:
     Practice, Check, Lesson, Hear it, then what the mode means. -->
{#snippet controls()}
  <div class="flex flex-wrap items-center gap-x-4 gap-y-1.5">
    <div class="flex items-center gap-2">
      {#if checkable}
        <div class="flex rounded-full border border-ws-line bg-ws-surface p-0.5" role="group" aria-label="Mode" aria-describedby="mode-note">
          {#each [["practice", "Practice"], ["check", "Check"]] as const as [id, label] (id)}
            <button
              type="button"
              class="min-h-11 rounded-full px-3.5 text-sm font-medium sm:px-4 {mode === id ? 'bg-instr font-semibold text-ws-stage' : 'text-ws-soft hover:text-ws-ink'}"
              aria-pressed={mode === id}
              onclick={() => (mode = id)}>{label}</button
            >
          {/each}
        </div>
      {/if}
      {#if lesson?.lessons.length}
        <button type="button" class="{ghost} max-sm:w-11 max-sm:px-0" title="Lesson" onclick={() => (revisitFor = lessonIds)}>
          <BookOpen class="size-4" aria-hidden="true" /><span class="max-sm:sr-only">Lesson</span>
        </button>
      {/if}
      {#if ondemo && (mode !== "check" || demoPlaying)}
        <button type="button" class="{ghost} aria-pressed:bg-instr-wash" aria-pressed={demoPlaying} onclick={ondemo}>
          <Headphones class="size-4" aria-hidden="true" />{demoPlaying ? "Stop demo" : "Hear it"}
        </button>
      {/if}
    </div>
    {#if checkable}<p id="mode-note" class="min-w-0 text-sm text-ws-soft">{mode === "check" ? modeNotes.check : modeNotes.practice}</p>{/if}
  </div>
{/snippet}

<!-- The exercise row, then the setup as one line. -->
{#snippet exercises()}
  {#if tabs && tabs.length > 1}
    <!-- Hidden on a phone while a lesson shows, so the lesson starts near the top; Skip brings it back. -->
    <div
      id="drill-exercises"
      bind:this={tabRow}
      onscroll={edges}
      class="-mx-1 flex snap-x scroll-px-1 gap-1.5 overflow-x-auto px-1 pb-1 [scrollbar-width:none] sm:flex-wrap sm:overflow-visible {showing ? 'max-lg:hidden' : ''}"
      style:mask-image={fadeL || fadeR ? `linear-gradient(to right, ${fadeL ? "transparent" : "black"}, black 2.5rem, black calc(100% - 2.5rem), ${fadeR ? "transparent" : "black"})` : undefined}
      role="group"
      aria-label="Exercise"
    >
      {#each shownTabs as x (x.id)}
        <button
          type="button"
          data-tab={x.id}
          class="min-h-11 shrink-0 snap-start whitespace-nowrap rounded-full border px-4 text-sm font-medium {tab === x.id ? 'border-transparent bg-instr font-semibold text-ws-stage' : 'border-ws-line bg-ws-surface hover:bg-ws-raised'}"
          aria-pressed={tab === x.id}
          onclick={() => ontab?.(x.id)}>{x.label}</button
        >
      {/each}
      {#if hiddenTabs}
        <button
          type="button"
          class="flex min-h-11 shrink-0 snap-start items-center gap-1.5 whitespace-nowrap rounded-full border border-dashed border-ws-line px-4 text-sm font-medium text-instr-ink hover:bg-instr-wash"
          aria-expanded={allTabs}
          aria-controls="drill-exercises"
          onclick={toggleTabs}
          >{allTabs ? "Fewer exercises" : "More exercises"}{#if !allTabs}<span class="tnum text-xs text-ws-soft" aria-hidden="true">+{hiddenTabs}</span>{/if}</button
        >
      {/if}
    </div>
  {/if}

  <!-- The setup as one line. On a phone the whole card is the Setup button; from sm up each
       clause opens its own control. On a laptop Start sits at the row's end, above the stage. -->
  <div class="relative flex items-center gap-x-3 gap-y-2 rounded-xl border border-ws-line bg-ws-surface py-1.5 pl-4 pr-1.5 {showing ? 'max-lg:hidden' : ''}">
    <p class="min-w-0 flex-1 py-1 text-sm leading-6" data-testid="setup-line">
      <span class="text-ws-soft">Setup:</span>
      {#each clauses as c, i (i)}<span class="whitespace-nowrap">{#if setup && c.focus}<button type="button" class="clause whitespace-normal text-left font-medium max-sm:contents" onclick={() => openAt(c.focus)}>{c.text}</button>{:else}<span class="whitespace-normal font-medium">{c.text}</span>{/if}{#if i < clauses.length - 1}<span class="text-ws-soft">,</span>{/if}</span>{" "}{/each}
    </p>
    {#if setup}
      <button
        type="button"
        class="flex min-h-11 shrink-0 items-center gap-2 rounded-lg px-3 text-sm font-medium text-instr-ink hover:bg-instr-wash max-sm:after:absolute max-sm:after:inset-0 max-sm:after:rounded-xl"
        aria-expanded={setupOpen}
        aria-controls="drill-setup"
        onclick={() => (setupOpen = !setupOpen)}
      >
        <Settings2 class="size-4" aria-hidden="true" />{setupOpen ? "Hide setup" : "Setup"}
      </button>
    {/if}
    {#if phase === "ready" && !showing}
      <div class="flex shrink-0 items-center gap-3 border-l border-ws-line pl-3 max-lg:hidden">
        {#if !unblocking}<span class="max-w-48 text-right text-xs text-ws-soft">{blocked ?? "Space starts, Esc stops."}</span>{/if}
        {@render startButton("")}
      </div>
    {/if}
  </div>
  {#if setup && setupOpen}
    <div id="drill-setup" class="rounded-xl border border-ws-line bg-ws-surface p-4">
      {@render setup()}
    </div>
  {/if}
{/snippet}

{#snippet startButton(cls: string)}
  {#if unblocking && unblock}
    <!-- What Start waits for, one tap away; Start comes back here once it is done. -->
    <button type="button" data-start data-unblock class="{primary} {cls}" disabled={unblockBusy} aria-busy={unblockBusy} onclick={runUnblock}>
      {unblock.label}
    </button>
  {:else}
    <button type="button" data-start class="{primary} {cls}" disabled={!!blocked} onclick={start}>
      <Play class="size-5 fill-current" aria-hidden="true" />{startLabel}
    </button>
  {/if}
{/snippet}

<!-- After a run: Again, and Run it in Check after a Practice run. The next run by the shared rule is the
     results card's own button (under the score, in the first screen on a phone); Again steps back for it. -->
{#snippet bar()}
  {@const next = silent ? null : offered}
  <div class="flex flex-wrap items-center gap-x-3 gap-y-2" data-testid="drill-bar">
    {#if unblocking && unblock}
      <button type="button" class="{primary} max-sm:flex-1" disabled={unblockBusy} aria-busy={unblockBusy} onclick={runUnblock}>{unblock.label}</button>
    {/if}
    <button type="button" class="{next || silent || unblocking ? secondary : primary} max-sm:flex-1" disabled={!!blocked} onclick={start}>
      <Play class="size-5" aria-hidden="true" />Again
    </button>
    {#if checkable && checkRun && mode === "practice" && !silent}
      <button type="button" class="{secondary} max-sm:flex-1" disabled={!!blocked} onclick={runInCheck}>Run it in Check</button>
    {/if}
    {#if blocked && !unblocking}<span class="text-sm text-ws-soft max-sm:basis-full">{blocked}</span>{:else if !blocked}<span class="text-sm text-ws-soft max-lg:hidden">Space for Again.</span>{/if}
  </div>
{/snippet}

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
  /* From sm up each clause is a small tappable chip; on a phone the card is one button and clauses read as text. */
  @media (min-width: 40rem) {
    .clause {
      border-radius: 0.375rem;
      padding: 0.0625rem 0.375rem;
      background: var(--ws-raised);
    }
    .clause:hover {
      color: var(--instr-ink);
      background: var(--instr-wash);
    }
  }
  .stage.demo {
    outline: 2px dashed color-mix(in oklch, var(--instr) 70%, transparent);
    outline-offset: -6px;
  }
  .results-enter {
    animation: ws-rise 220ms ease-out;
  }
  /* The dock contract (drills mark their own markup): while a run is live below lg the stage fills the
     screen under the strip, the element marked data-dock="answers" (answer buttons, tap pads) sits at its
     bottom where a thumb is, and data-dock="instrument" grows into the free height. Every wrapper between
     the stage and a marked element becomes a growing column; wrappers that are already a flex row or a
     grid keep their layout. Outside a live phone run the markers do nothing. Normal flow, never fixed,
     so results and long stages still scroll. */
  @media (max-width: 63.999rem) {
    .stage[data-live] {
      display: flex;
      flex-direction: column;
      min-height: calc(100dvh - var(--ws-strip-h, 3.75rem) - 1rem);
    }
    .stage[data-live] :global(:is(:not(.flex, .inline-flex, .grid, .contents), .flex-col):has([data-dock])) {
      display: flex;
      flex-direction: column;
      flex: 1 1 auto;
    }
    .stage[data-live] :global([data-dock="answers"]) {
      margin-top: auto;
    }
    .stage[data-live] :global([data-dock="instrument"]) {
      flex: 1 0 auto;
    }
  }
</style>
