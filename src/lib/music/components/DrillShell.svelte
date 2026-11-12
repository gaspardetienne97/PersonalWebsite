<script lang="ts" module>
  import type { NextRun } from "../advance.svelte";
  /** The next-run button's verb, by the kind of move. */
  export const NEXT_VERB: Record<string, string> = { faster: "Speed up to", slower: "Slow to", harder: "Move on:", easier: "Step back:" };
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

  /** A setup clause that names an input caveat and is its own fix (contract K2): "left hand on MIDI"
   *  opening Connect. Drawn after the setup clauses on the ready screen. */
  export interface Requirement {
    text: string;
    action: { label: string; run: () => void };
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
  // The frame every drill uses. The ready screen is the instrument and one Start:
  // title, exercise tabs, one action bar (the setup sentence, Practice or Check,
  // Hear it, Start), then the stage. From the first lesson step or Start until
  // the player leaves the results, the drill is a session that owns the screen
  // (contract K1): no navs, no strip, a HUD on top (Stop or Close, the title,
  // the mode, two counters, the beat and the click), the stage filling the
  // height, and a dock at the bottom (Stop on a phone; Again and the next run on
  // results). Esc, Stop, Close and Done always lead out. One route-owned status
  // line (role=status) per page.
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
  import InputCheck, { inputFor } from "./InputCheck.svelte";
  import { lessonsAuto } from "../lessons.svelte";
  import { pendingLessons, type LessonRef } from "@repo/music-core/lessons/types";
  import Settings2 from "lucide-svelte/icons/sliders-horizontal";
  import Eye from "lucide-svelte/icons/eye";
  import EyeOff from "lucide-svelte/icons/eye-off";
  import X from "lucide-svelte/icons/x";
  import ChevronRight from "lucide-svelte/icons/chevron-right";
  import ChevronDown from "lucide-svelte/icons/chevron-down";
  import ChevronLeft from "lucide-svelte/icons/chevron-left";
  import Timer from "lucide-svelte/icons/timer";
  import TimerOff from "lucide-svelte/icons/timer-off";
  import Alert from "lucide-svelte/icons/circle-alert";
  import { bench, INSTRUMENT_LABEL, type Hue } from "../bench.svelte";
  import { audio, input, midi, mic, settings } from "../runtime";
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
    /** The demo button's name ("Hear an example" where the drill plays an example, not this run). */
    demoLabel?: string;
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
    /** Setup clauses that fix an input caveat (contract K2), e.g. "left hand on MIDI" opening Connect. */
    requires?: readonly Requirement[];
    /** What to do right now, shown in the phone dock when there is no `step` ("Play G4, finger 2", "Your turn").
     *  Never the verdict: `status` stays the live region. */
    cue?: string;
    /** The drill's one go-on action while live (Continue, See results, Next card, Check my rhythm). On a phone the
     *  dock draws it as a full-width primary; the drill hides its in-card copy with max-sm:hidden. */
    step?: { label: string; run: () => void; disabled?: boolean } | null;
    /** The stage after a run is the marked music (a staff or neck with marks): it stays under the results.
     *  Without it the stage is hidden on results; with it the drill hides its ready-only controls itself. */
    review?: boolean;
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
    demoLabel = "Hear it",
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
    requires = [],
    cue = "",
    step = null,
    review = false,
    modeNotes = { practice: "Hints shown. Clean runs move you on.", check: "No hints. Counts in your skill scores." },
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
  /** The instrument's input is off: the setup sentence gets a clause that turns it on (InputCheck inline). */
  const needsInput = $derived(
    played && !unblocking && (inputFor(settings.value.activeInstrument) === "mic" ? mic.state !== "on" : !midi.supported || !midi.enabled),
  );
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
  const ghost = "flex min-h-11 shrink-0 items-center justify-center gap-2 rounded-full border border-ws-line bg-ws-surface px-4 text-sm font-medium hover:bg-ws-raised";
  // K5: the primary fill and its text, per hue (a deep fill with light text for the pale hues in light theme).
  const fill = "bg-instr-strong text-on-instr";
  const secondary =
    "flex min-h-12 items-center justify-center gap-2 rounded-full border border-ws-line bg-ws-surface px-6 font-display text-base font-semibold hover:bg-ws-raised disabled:opacity-50";
  const primary = `flex min-h-12 items-center justify-center gap-2 rounded-full ${fill} px-6 font-display text-base font-semibold shadow-sm hover:brightness-105 disabled:opacity-50`;
  /** The session's own quiet buttons: chrome, in the page theme (contract S1). */
  const quiet =
    "flex min-h-12 items-center justify-center gap-2 rounded-full bg-ws-raised px-5 font-display text-base font-semibold hover:bg-ws-line disabled:opacity-50";
  let setupOpen = $state(false);
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
  /** The lessons closed (not skipped) on this visit: they stay unseen, so they come back next time. */
  let closedFor = $state<string | null>(null);
  const pending = $derived(pendingLessons(lesson, settings.value.lessonsSeen));
  /** What the lesson view plays: the pending ones, or all of them when asked for again. */
  const shownLessons = $derived(revisit ? (lesson?.lessons ?? []) : pending);
  // Between runs (ready or results), never during one.
  const showing = $derived(
    !live &&
      shownLessons.length > 0 &&
      (revisit || (ready && closedFor !== lessonIds && lessonsAuto() && (lesson?.trigger === "check" ? mode === "check" : true))),
  );
  /** The session view (K1): a lesson, a run or its results own the screen. */
  const session = $derived(live || showing || phase === "results");
  $effect(() => {
    bench.session = session;
  });
  /** After a run, with its results on screen: the header keeps only the title and mode, the setup moves below the results. */
  const afterRun = $derived(phase === "results" && !showing);
  /** Start is drawn twice (the action bar on a laptop, the dock on a phone); CSS shows one. */
  const visibleStart = () => [...document.querySelectorAll<HTMLButtonElement>("[data-start]")].find((b) => b.getClientRects().length);
  /** Back on the ready screen from a lesson or results: the top of the page, focus on Start (or the title). */
  async function toReady(onStart = true) {
    await tick();
    scrollTo({ top: 0 });
    const startButton = onStart ? visibleStart() : undefined;
    // A lesson that ends over results stays in the session: focus its title there.
    (startButton && !startButton.disabled ? startButton : heading?.isConnected ? heading : hudHeading)?.focus();
  }
  async function endLesson() {
    const seen = settings.value.lessonsSeen ?? [];
    const ids = shownLessons.map((l) => l.id).filter((id) => !seen.includes(id));
    revisitFor = null;
    if (ids.length) void settings.update({ lessonsSeen: [...seen, ...ids] });
    if (lesson?.trigger !== "check") mode = "practice";
    // The lesson's buttons are gone: focus moves on to Start (or the title when Start is blocked).
    await toReady();
  }
  /** Close: out of a lesson (unseen, so it comes back next visit) or the results, to the ready screen. */
  function close() {
    if (showing) {
      revisitFor = null;
      closedFor = lessonIds;
    } else if (phase === "results") {
      phase = "ready";
      silent = false;
    } else return;
    void toReady(false);
  }
  /** Start docks at the bottom of a phone screen on the ready screen; the section pads for it. */
  const docked = $derived(!session && phase === "ready");
  let clockHandle: { stop(): void } | null = null;
  let goTimer: ReturnType<typeof setTimeout> | undefined;
  /** Count-in clicks so far, and how many bars it lasts (for the count-in panel). */
  let countBeats = $state(0);
  let countBars = $state(0);
  /** The count-in on screen: until the downbeat itself, though input is live half a beat before it. */
  let counting = $state(false);
  let heading: HTMLElement | undefined = $state();
  /** The session HUD's title (a separate element from the ready screen's). */
  let hudHeading: HTMLElement | undefined = $state();
  let resultsHeading: HTMLElement | undefined = $state();

  /** Set by Results: nothing was heard, so the stage is left out (its targets were never played). */
  let silent = $state(false);

  // A long exercise row scrolls sideways on a phone: fade the edge that has more, and keep the open one in view.
  let tabRow: HTMLElement | undefined = $state();
  let fadeL = $state(false);
  let fadeR = $state(false);
  function edges() {
    fadeL = !!tabRow && tabRow.scrollLeft > 6;
    if (!tabRow) return;
    fadeR = tabRow.scrollLeft + tabRow.clientWidth < tabRow.scrollWidth - 6;
  }
  $effect(() => {
    void tab;
    void shownTabs.length;
    if (!tabRow) return;
    const open = tabRow.querySelector<HTMLElement>('[aria-pressed="true"]');
    // The open exercise in view with the one before it whole at the left edge, so no tab is ever cut on the left
    // (the right edge fades under the scroll chevron). The row scrolls, never the page.
    const prev = open?.previousElementSibling as HTMLElement | null;
    if (open && tabRow.scrollWidth > tabRow.clientWidth) tabRow.scrollTo({ left: Math.max(0, (prev ?? open).offsetLeft - 4) });
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

  // The strip shows Metronome, Tempo and Count-in only when this drill's runs use the click.
  $effect(() => {
    bench.clocked = !!clock;
    return () => {
      bench.clocked = null;
    };
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

  // The results lead the screen: from the top, focus on their heading.
  $effect(() => {
    if (phase !== "results") return;
    void tick().then(() => {
      resultsHeading?.focus({ preventScroll: true });
      scrollTo({ top: 0 });
    });
  });
  // A lesson opens at its top too (the ready screen above it is gone).
  $effect(() => {
    if (showing) void tick().then(() => scrollTo({ top: 0 }));
  });

  onDestroy(() => {
    bench.session = false;
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

  /** The session opens at the top: the HUD, then the stage under it. */
  function toStage() {
    hudHeading?.focus({ preventScroll: true });
    scrollTo({ top: 0 });
  }

  async function start() {
    if (blocked || showing || live) return;
    // Start during a demo: the demo stops, then the run starts.
    if (demoPlaying) await ondemo?.();
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

  // "More below" (sessions): while the end of the content sits under the dock or below the screen, a button in
  // the bottom bar says so (never over the content: it lives in the bar, beside the go-on action).
  let endMark: HTMLElement | undefined = $state();
  let dockH = $state(0);
  let more = $state(false);
  $effect(() => {
    if (!session || !endMark) return void (more = false);
    const io = new IntersectionObserver(([e]) => (more = !e.isIntersecting && e.boundingClientRect.top > 0), {
      // The lesson's own dock sits in the flow just above the end mark, so only the session dock is subtracted.
      rootMargin: `0px 0px -${Math.round(dockH)}px 0px`,
    });
    io.observe(endMark);
    return () => io.disconnect();
  });
  function scrollMore() {
    const still = document.documentElement.hasAttribute("data-reduce-motion") || matchMedia("(prefers-reduced-motion: reduce)").matches;
    scrollBy({ top: innerHeight * 0.7, behavior: still ? "instant" : "smooth" });
  }

  function onKey(e: KeyboardEvent) {
    const t = e.target as HTMLElement | null;
    const onControl = t?.closest("button, a, input, select, textarea, [contenteditable], [role=slider]");
    if (e.key === "Escape") {
      // A pop-up, menu or dialog takes its own Esc first.
      if (e.defaultPrevented || t?.closest("[role=dialog], [role=menu], [role=listbox], [data-popover-content]")) return;
      if (live) {
        e.preventDefault();
        stop();
      } else if (session) {
        e.preventDefault();
        close();
      }
      return;
    }
    if (showing) return;
    if (e.code === "Space" && !onControl && !e.repeat && (phase === "ready" || phase === "results")) {
      e.preventDefault();
      void start();
    }
  }

</script>

<svelte:window onkeydown={onKey} onresize={edges} />

<!-- One section in both views, so the stage below stays mounted from the ready screen into the run. -->
<section
  class={session ? "session relative flex min-h-dvh w-full flex-col bg-ws-bg text-ws-ink" : `mx-auto flex w-full max-w-6xl flex-col gap-3 ${docked ? "max-lg:pb-[calc(var(--ws-dock-h)+5.5rem)]" : ""}`}
  aria-labelledby="drill-title"
  data-session={session ? "" : undefined}
>
  {#if session}
    {@render hudBar()}
  {:else}
    {@render readyHeader()}
  {/if}

  <div class={session ? "mx-auto flex w-full max-w-6xl flex-1 flex-col gap-4 px-4 pb-4 pt-3 sm:px-6 lg:px-8" : "contents"}>
    {#if afterRun && results}
      <!-- The results own the screen; a silent run's card sits at the top of it. -->
      <div class="results-enter">
        <h2 bind:this={resultsHeading} tabindex="-1" class="sr-only">Results</h2>
        {@render results()}
      </div>
    {/if}

    <!-- A silent run leaves the stage out: its targets were never played, so nothing on it is a result. -->
    <div
      class="stage-box relative {phase === 'results' && (silent || !review) && !showing ? 'hidden' : showing ? 'flex flex-1 flex-col' : session ? 'stage flex flex-col p-3 sm:p-5' : 'stage overflow-hidden rounded-2xl p-3 sm:p-5'}"
      class:demo={demoPlaying}
      data-live={live ? "" : undefined}
    >
      {#if demoPlaying}<p class="mb-2 text-sm text-ws-stage-soft">Demo playing, not scored.</p>{/if}
      <!-- Before a run a drill's counters (if any) sit on the stage; in a session they are in the HUD. -->
      {#if hud && !session}<div class="mb-3 flex flex-wrap gap-x-4 gap-y-1 empty:hidden">{@render hud()}</div>{/if}
      {#if showing}
        {#key shownLessons.map((l) => l.id).join()}
          <LessonView lessons={shownLessons} onfinish={endLesson} onskip={endLesson} beforeNext={moreButton} />
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

    {#if actions && !showing}<div class="flex flex-wrap items-center gap-3">{@render actions()}</div>{/if}
    {#if session}<div bind:this={endMark} data-end class="h-px"></div>{/if}
  </div>

  {#if session}
    <!-- The dock, when there is one ("More below" sits inside it, never over the content). -->
    <div class="sticky bottom-0 z-30" bind:clientHeight={dockH}>
      {@render dock()}
    </div>
  {:else if docked}
    <!-- On a phone (and up to lg) Start docks above the tab bar: chrome, like the tab bar, never over the stage
         (the section's bottom padding lets the stage scroll clear of it). -->
    <div class="ws-bar ws-bar-bottom fixed inset-x-0 bottom-[var(--ws-dock-h,3.5rem)] z-30 border-t px-4 py-2 lg:hidden" data-testid="drill-bar">
      <div class="mx-auto flex max-w-2xl flex-col gap-1">
        <div class="flex items-center gap-2">
          {@render demoButton()}
          {@render startButton("min-w-0 flex-1")}
        </div>
        {#if blocked && !unblocking}<span class="text-center text-sm text-ws-soft">{blocked}</span>{/if}
      </div>
    </div>
  {/if}

  <!-- Announced, not shown: the stage and the results already say it on screen. -->
  <p role="status" class="sr-only">{status}</p>
</section>

<!-- Ready screen, row 1: back, the title and the Lesson; then one line of blurb (the lesson has the rest). -->
{#snippet readyHeader()}
  <header class="flex flex-col gap-1">
    <div class="flex items-center gap-1 sm:gap-2">
      <a class="-ml-2.5 grid size-11 shrink-0 place-items-center rounded-full text-instr-ink hover:bg-instr-wash" href={back.href} title="Back to {back.label}">
        <ArrowLeft class="size-5" aria-hidden="true" /><span class="sr-only">Back to {back.label}</span>
      </a>
      <h1 id="drill-title" bind:this={heading} tabindex="-1" class="ws-title min-w-0 flex-1 font-display font-semibold tracking-tight">
        {title}
      </h1>
      {#if lesson?.lessons.length}
        <button type="button" class={ghost} onclick={() => (revisitFor = lessonIds)}>
          <BookOpen class="size-4" aria-hidden="true" />Lesson
        </button>
      {/if}
    </div>
    {#if blurb}<p id="drill-blurb" class="max-w-prose text-sm text-ws-soft line-clamp-2 sm:text-base" title={blurb}>{blurb}</p>{/if}
  </header>
  {@render exercises()}
  {@render actionBar()}
{/snippet}

<!-- Row 2: the exercises as underline tabs (navigation, not more choices). -->
{#snippet exercises()}
  {#if tabs && tabs.length > 1}
    <div class="relative">
    <div
      id="drill-exercises"
      bind:this={tabRow}
      onscroll={edges}
      class="relative -mx-1 flex max-w-[calc(100%+0.5rem)] snap-x scroll-px-1 overflow-x-auto border-b border-ws-line px-1 [scrollbar-width:none] sm:flex-wrap sm:overflow-visible"
      style:mask-image={fadeL || fadeR ? `linear-gradient(to right, ${fadeL ? "transparent 0.5rem, black 3rem" : "black"}, ${fadeR ? "black calc(100% - 3rem), transparent calc(100% - 0.5rem)" : "black"})` : undefined}
      role="group"
      aria-label="Exercise"
    >
      {#each shownTabs as x (x.id)}
        <button
          type="button"
          data-tab={x.id}
          class="tab relative -mb-px min-h-11 shrink-0 snap-start whitespace-nowrap px-3 text-sm sm:text-base {tab === x.id ? 'font-semibold text-ws-ink' : 'font-medium text-ws-soft hover:text-ws-ink'}"
          aria-pressed={tab === x.id}
          onclick={() => ontab?.(x.id)}>{x.label}</button
        >
      {/each}
      {#if hiddenTabs}
        <button
          type="button"
          class="flex min-h-11 shrink-0 snap-start items-center gap-1.5 whitespace-nowrap px-3 text-sm font-medium text-instr-ink hover:underline"
          aria-expanded={allTabs}
          aria-controls="drill-exercises"
          onclick={toggleTabs}
          >{allTabs ? "Fewer exercises" : "More exercises"}{#if !allTabs}<span class="tnum text-[13px] text-ws-soft" aria-hidden="true">+{hiddenTabs}</span>{/if}</button
        >
      {/if}
    </div>
    {#if fadeL}
      <!-- More exercises to the left: the fade sits under this chevron, and one tap scrolls back a page. -->
      <button type="button" class="absolute left-0 top-0 grid size-11 place-items-center rounded-full bg-ws-bg text-ws-soft shadow-sm hover:text-ws-ink sm:hidden" aria-label="Scroll exercises back" onclick={() => tabRow?.scrollBy({ left: -tabRow.clientWidth * 0.8, behavior: "smooth" })}>
        <ChevronLeft class="size-5" aria-hidden="true" />
      </button>
    {/if}
    {#if fadeR}
      <!-- A phone row that runs on: one tap scrolls it a page. -->
      <button type="button" class="absolute right-0 top-0 grid size-11 place-items-center rounded-full bg-ws-bg text-ws-soft shadow-sm hover:text-ws-ink sm:hidden" aria-label="Scroll exercises" onclick={() => tabRow?.scrollBy({ left: tabRow.clientWidth * 0.8, behavior: "smooth" })}>
        <ChevronRight class="size-5" aria-hidden="true" />
      </button>
    {/if}
    </div>
  {/if}
{/snippet}

<!-- Row 3, the action bar: the setup sentence (its caveats as clauses that fix themselves), then Practice or
     Check, Hear it and Start. On a laptop one bar; below lg the setup line is its own card and Start docks. -->
{#snippet actionBar()}
  <!-- One card. Laptop, one row: the setup sentence, Setup, Practice or Check, Hear it, Start. Below lg: the
       sentence, then Practice or Check (left) and Setup (right), the mode's note on one line under them; Hear it
       and Start dock at the bottom. On a phone the whole card opens the setup (the toggle sits above that). -->
  <div class="relative flex flex-wrap items-center gap-x-3 gap-y-1 rounded-xl border border-ws-line bg-ws-surface py-1.5 pl-4 pr-1.5 lg:flex-nowrap lg:rounded-2xl">
    <!-- A clause with a control is a chip that opens it (from sm up); the rest is plain text that never breaks
         mid-phrase. A phone shows two lines; the Setup button, the whole card there, holds the rest. -->
    <div class="min-w-0 basis-full py-1 text-sm lg:flex-1 lg:basis-auto" data-testid="setup-line">
      <p class="leading-8 max-sm:max-h-16 max-sm:overflow-hidden" data-truncate-ok>
        <span class="mr-1 text-ws-soft">Setup:</span>
        {#each clauses as c, i (i)}{@const more = i < clauses.length - 1 || requires.length || needsInput}{#if setup && c.focus}<button type="button" class="clause max-sm:pointer-events-none" onclick={() => openAt(c.focus)}>{c.text}<ChevronDown class="size-3.5 shrink-0 text-ws-soft" aria-hidden="true" /></button>{#if more}<span class="sr-only">,</span>{/if}{:else}<span class="inline-block max-w-full font-medium">{c.text}{#if more}<span class="text-ws-soft">,</span>{/if}</span>{/if}{" "}{/each}
      </p>
      {#if requires.length || needsInput}
        <!-- Input caveats, each its own fix, on their own line so a clamp never hides them. -->
        <p class="flex flex-wrap items-center gap-x-1">
          {#each requires as r, i (r.text)}<button type="button" class="relative z-10 inline-flex min-h-11 items-center gap-1.5 whitespace-nowrap rounded-md px-1.5 text-left font-medium text-instr-ink hover:bg-instr-wash sm:min-h-8" title="{r.text}: {r.action.label}" aria-label="{r.text}: {r.action.label}" onclick={r.action.run}><Alert class="size-4 shrink-0" aria-hidden="true" />{r.text}</button>{#if i < requires.length - 1 || needsInput}<span class="sr-only">,</span>{/if}{/each}
          {#if needsInput}<span class="relative z-10"><InputCheck inline required={!!blocked} /></span>{/if}
        </p>
      {/if}
    </div>
    {#if setup}
      <button
        type="button"
        class="flex min-h-11 shrink-0 items-center gap-2 rounded-lg px-2.5 text-sm font-medium text-instr-ink hover:bg-instr-wash max-lg:order-1 max-lg:ml-auto max-sm:after:absolute max-sm:after:inset-0 max-sm:after:rounded-xl"
        aria-expanded={setupOpen}
        aria-controls="drill-setup"
        onclick={() => (setupOpen = !setupOpen)}
      >
        <Settings2 class="size-4" aria-hidden="true" />{setupOpen ? "Hide setup" : "Setup"}
      </button>
    {/if}
    {#if checkable}
      <!-- One two-state switch, the current mode's effect on one line under it. The names stay "Practice" and
           "Check"; a demo holds the mode until it stops (full contrast, with a reason). -->
      <div class="max-lg:contents lg:flex lg:shrink-0 lg:flex-col lg:items-center lg:gap-0.5 lg:border-l lg:border-ws-line lg:pl-3">
        <div class="relative z-10 flex shrink-0 rounded-full border border-ws-line bg-ws-surface p-0.5" role="group" aria-label="Mode" aria-describedby="mode-note" title={demoPlaying ? "Stop the demo to change mode" : undefined}>
          {#each [["practice", "Practice"], ["check", "Check"]] as const as [id, label] (id)}
            <button
              type="button"
              class="flex min-h-10 items-center justify-center rounded-full px-3.5 text-sm {mode === id ? `${fill} font-semibold` : 'text-ws-soft hover:text-ws-ink'}"
              aria-pressed={mode === id}
              aria-disabled={demoPlaying || undefined}
              onclick={() => {
                if (!demoPlaying) mode = id;
              }}
            >{label}</button>
          {/each}
        </div>
        <p id="mode-note" class="text-sm leading-snug text-ws-soft max-lg:order-2 max-lg:basis-full lg:whitespace-nowrap lg:text-center">{mode === "check" ? modeNotes.check : modeNotes.practice}</p>
      </div>
    {/if}
    {#if phase === "ready"}
      <div class="flex shrink-0 items-center gap-2 max-lg:hidden">
        {@render demoButton()}
        {#if blocked && !unblocking}<span class="max-w-48 text-right text-sm text-ws-soft">{blocked}</span>{/if}
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

<!-- Hear it (a quiet button); during the demo it leaves, and Stop demo takes Start's place as the one filled button. -->
{#snippet demoButton()}
  {#if ondemo && mode !== "check" && !demoPlaying}
    <button type="button" class={ghost} onclick={ondemo}><Headphones class="size-4" aria-hidden="true" />{demoLabel}</button>
  {/if}
{/snippet}

{#snippet startButton(cls: string)}
  {#if demoPlaying && ondemo}
    <button type="button" class="{primary} {cls}" aria-pressed="true" onclick={ondemo}><Square class="size-4 fill-current" aria-hidden="true" />Stop demo</button>
  {:else if unblocking && unblock}
    <!-- What Start waits for, one tap away; Start comes back here once it is done. -->
    <button type="button" data-start data-unblock class="{primary} {cls}" disabled={unblockBusy} aria-busy={unblockBusy} onclick={runUnblock}>
      {unblock.label}
    </button>
  {:else}
    <button type="button" data-start class="{primary} {cls}" disabled={!!blocked} onclick={start} title="Start (Space)" aria-keyshortcuts="Space">
      <Play class="size-5 fill-current" aria-hidden="true" />{startLabel}
    </button>
  {/if}
{/snippet}

<!-- The session HUD: the way out, the drill, the mode, then the live counters, the beat and the click.
     A thin run-progress bar runs under the whole HUD. -->
{#snippet hudBar()}
  <header class="ws-bar sticky top-0 z-30 border-b">
    <!-- A phone has two rows: the exit, the title, the mode (as its icon) and the click; then the counters and
         the beat. The title wraps between words before it ever runs into the mode. -->
    <div class="mx-auto flex min-h-14 max-w-6xl flex-wrap items-center gap-x-2 gap-y-0.5 px-4 pt-1.5 pb-2.5 sm:flex-nowrap sm:gap-x-3 sm:pb-1.5 sm:px-6 lg:px-8">
      {#if live}
        <!-- One exit, top left, at every width (Close takes this place on results and lessons). -->
        <button type="button" class="-ml-1 flex min-h-11 shrink-0 items-center gap-2 rounded-full bg-ws-raised px-4 text-sm font-semibold hover:bg-ws-line" onclick={stop} title="Stop (Esc)" aria-keyshortcuts="Escape">
          <Square class="size-3.5 fill-current" aria-hidden="true" />Stop
        </button>
      {:else}
        <button type="button" class="-ml-2 grid size-11 shrink-0 place-items-center rounded-full bg-ws-raised hover:bg-ws-line" aria-label="Close and back to setup" title="Close and back to setup (Esc)" aria-keyshortcuts="Escape" onclick={close}>
          <X class="size-5" aria-hidden="true" />
        </button>
      {/if}
      <h1 id="drill-title" bind:this={hudHeading} tabindex="-1" class="ws-hud font-display font-semibold leading-tight sm:flex-none">{title}</h1>
      {#if checkable && !showing}
        {@const modeText = mode === "check" ? "Check: from memory" : "Practice: hints on"}
        <span class="flex shrink-0 items-center gap-1.5 text-sm text-ws-soft sm:order-last" title={modeText}>
          {#if mode === "check"}<EyeOff class="size-4" aria-hidden="true" />{:else}<Eye class="size-4" aria-hidden="true" />{/if}<span class="max-sm:sr-only">{modeText}</span>
        </span>
      {/if}
      {#if live && clock}
        <button
          type="button"
          class="grid size-11 shrink-0 place-items-center rounded-full hover:bg-ws-raised max-sm:-mr-2 max-sm:ml-auto sm:order-last {bench.clickDuringRun ? '' : 'text-ws-soft'}"
          aria-pressed={bench.clickDuringRun}
          aria-label="Metronome click in runs"
          title={bench.clickDuringRun ? "The click is on. Tap to mute it." : "The click is off. Tap to hear it."}
          onclick={() => settings.update({ metronomeEnabled: !bench.clickDuringRun })}
        >
          {#if bench.clickDuringRun}<Timer class="size-5" aria-hidden="true" />{:else}<TimerOff class="size-5" aria-hidden="true" />{/if}
        </button>
      {/if}
      <!-- At most two counters from the drill, then the beat. A second line on a phone; it wraps rather than cut a value. -->
      <div class="flex min-w-0 flex-1 flex-wrap items-center gap-x-4 gap-y-0.5 max-sm:basis-full sm:justify-end empty:hidden">
        {#if hud}{@render hud()}{/if}
        {#if live && clock}{@render beatReadout()}{/if}
      </div>
    </div>
    {#if live && progress !== null}
      <div class="absolute inset-x-0 bottom-0 h-1 bg-ws-line" role="progressbar" aria-label="Run progress" aria-valuemin="0" aria-valuemax="100" aria-valuenow={Math.round(progress * 100)}>
        <div class="h-full bg-instr transition-[width]" style:width="{progress * 100}%"></div>
      </div>
    {/if}
  </header>
{/snippet}

<!-- The beat in words ("Beat 2 of 4"), then one dot a beat: idle 12 px, the current one 24 px and numbered. -->
{#snippet beatReadout()}
  <span class="flex shrink-0 items-center gap-1.5" role="img" aria-label="{bench.countingIn ? 'Count-in, beat' : 'Beat'} {bench.beat || 1} of {bench.beatsPerBar}">
    <span class="ws-hud whitespace-nowrap text-ws-soft tnum" aria-hidden="true">{bench.countingIn ? "Count-in" : "Beat"} <span class="font-semibold text-ws-ink">{bench.beat || 1}</span> of {bench.beatsPerBar}</span>
    {#each Array.from({ length: bench.beatsPerBar }, (_, i) => i + 1) as b (b)}
      <span class="grid size-6 place-items-center" aria-hidden="true">
        {#if bench.beat === b}
          <span class="ws-pulse grid size-6 place-items-center rounded-full text-[13px] font-bold leading-none tnum {bench.countingIn ? 'bg-warn text-ws-stage' : 'bg-instr-strong text-on-instr'}" data-beat={b}>{b}</span>
        {:else}
          <span class="size-3 rounded-full bg-ws-soft"></span>
        {/if}
      </span>
    {/each}
  </span>
{/snippet}

<!-- The session dock, at the bottom of the screen. Running (phone): Stop and the latest verdict. Results:
     Again and the next run by the shared rule (or Done when the rule says same again). -->
{#snippet dock()}
  {#if live}
    {#if step || cue || more}
      <!-- Phone: the drill's one go-on action, else what to do now. Never the verdict (stage and live region).
           From sm up the bar shows only while there is more below. -->
      <div class="ws-bar ws-bar-bottom relative border-t px-4 pt-2 pb-[max(0.5rem,env(safe-area-inset-bottom))] sm:px-6 lg:px-8 {more ? '' : 'sm:hidden'}">
        <div class="mx-auto flex max-w-6xl items-center gap-2">
          {#if step}
            <button type="button" class="{primary} min-w-0 flex-1 sm:hidden" disabled={step.disabled} onclick={step.run} data-step>{step.label}</button>
          {:else if cue}
            <p class="flex min-h-12 min-w-0 flex-1 items-center text-base font-medium sm:hidden" data-cue>{cue}</p>
          {/if}
          {@render moreButton(!step && !cue, "sm:ml-auto")}
        </div>
      </div>
    {/if}
  {:else if afterRun}
    {@const next = silent ? null : offered}
    <!-- The same order after every run. Laptop, one row: Done, Again (when something else leads), the from-memory
         run, then the primary at the right (the next run, else Again; after a silent run, Again: the not-heard card
         holds the input fix). Phone, two rows: the primary alone, full width; then the others as equal quiet buttons. -->
    {@const againLeads = !next && !unblocking}
    {@const small = "max-sm:min-h-11 max-sm:flex-auto max-sm:whitespace-nowrap max-sm:px-3 max-sm:text-sm"}
    {@const lead = `max-sm:order-first ${more ? "max-sm:basis-[calc(100%-3.5rem)]" : "max-sm:basis-full"}`}
    <div class="ws-bar ws-bar-bottom relative border-t px-4 pt-2 pb-[max(0.5rem,env(safe-area-inset-bottom))] sm:px-6 lg:px-8" data-testid="drill-bar">
      <div class="mx-auto flex max-w-6xl flex-wrap items-center gap-2 sm:gap-3">
        {#if blocked && !unblocking}<span class="basis-full text-sm text-ws-soft sm:order-last sm:basis-auto">{blocked}</span>{/if}
        <button type="button" class="{quiet} {small}" onclick={close}>Done</button>
        {#if !againLeads}
          <button type="button" class="{quiet} {small}" disabled={!!blocked} onclick={start} title="Again (Space)" aria-keyshortcuts="Space"><Play class="size-5 max-sm:hidden" aria-hidden="true" />Again</button>
        {/if}
        {#if checkable && checkRun && mode === "practice" && !silent}
          <button type="button" class="{quiet} {small}" disabled={!!blocked} onclick={runInCheck}><EyeOff class="size-5 max-sm:hidden" aria-hidden="true" />Check run, from memory</button>
        {/if}
        <span class="flex-1 max-sm:hidden"></span>
        <!-- Phone, row 1: "More below" (when there is more), then the primary filling the rest of the row. -->
        {@render moreButton(false, "max-sm:order-first")}
        {#if unblocking && unblock}
          <button type="button" class="{primary} {lead}" disabled={unblockBusy} aria-busy={unblockBusy} onclick={runUnblock}>{unblock.label}</button>
        {:else if next}
          <button type="button" class="{primary} min-w-0 whitespace-nowrap {lead}" disabled={!!blocked} onclick={goNext}><span class="truncate">{NEXT_VERB[next.kind]} {next.label}</span></button>
        {:else}
          <button type="button" class="{primary} {lead}" disabled={!!blocked} onclick={start} title="Again (Space)" aria-keyshortcuts="Space"><Play class="size-5" aria-hidden="true" />Again</button>
        {/if}
      </div>
    </div>
  {/if}
{/snippet}

<!-- "More below", in a bottom bar just before its go-on action (or at its right end). A phone shows the chevron
     alone beside an action, the words when it stands alone; from sm up always the words. -->
{#snippet moreButton(words = false, cls = "")}
  {#if more}
    <button
      type="button"
      class="{quiet} shrink-0 whitespace-nowrap max-sm:min-h-12 {words ? 'ml-auto' : 'max-sm:size-12 max-sm:px-0'} {cls}"
      aria-label="More below"
      title="More below: scroll down"
      onclick={scrollMore}
      data-more><ChevronDown class="size-5" aria-hidden="true" /><span class={words ? "" : "max-sm:hidden"}>More below</span></button
    >
  {/if}
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
  /* The current exercise: an underline in the hue, so the row reads as navigation. */
  .tab[aria-pressed="true"]::after {
    content: "";
    position: absolute;
    inset-inline: 0.5rem;
    bottom: 0;
    height: 3px;
    border-radius: 9999px;
    background: var(--instr);
  }
  /* A clause with a control is a chip, an atomic inline with a chevron: it moves to the next line whole rather
     than break mid-phrase. From sm up it opens its control (on a phone the card is one button). */
  .clause {
    display: inline-flex;
    align-items: center;
    gap: 0.25rem;
    max-width: 100%;
    margin-block: 0.125rem;
    border-radius: 0.375rem;
    padding: 0 0.5rem;
    background: var(--ws-raised);
    font-weight: 500;
    line-height: 1.75rem;
    text-align: left;
  }
  button.clause:hover {
    color: var(--instr-ink);
    background: var(--instr-wash);
  }
  .stage-box.demo {
    outline: 2px dashed color-mix(in oklch, var(--instr) 70%, transparent);
    outline-offset: -6px;
  }
  .results-enter {
    animation: ws-rise 220ms ease-out;
  }
  /* The live layout (contract S3): the stage hugs its content, top aligned under the HUD. It takes the free
     height only when it holds a region marked data-grow (a lane, a highway, a plot, the pads); then every wrapper
     between the stage and that region becomes a growing column, unless it already lays out as a row or a grid.
     From lg up a wrapper that changes layout at a breakpoint keeps it; a grid that holds a growing region grows and
     stretches its row. Normal flow, never fixed, so long stages scroll. */
  .stage-box[data-live]:has(:global([data-grow])) {
    flex: 1 1 auto;
  }
  @media (max-width: 63.999rem) {
    .stage-box[data-live] :global(:is(:not(.flex, .inline-flex, .grid, .contents, .hidden), .flex-col):not([class*=":hidden"]):has([data-grow])) {
      display: flex;
      flex-direction: column;
      flex: 1 1 auto;
      min-height: 0;
    }
  }
  @media (min-width: 64rem) {
    .stage-box[data-live]
      :global(
        :is(:not(.flex, .inline-flex, .grid, .contents, .hidden), .flex-col):not(
            [class*=":grid"],
            [class*=":flex"],
            [class*=":block"],
            [class*=":hidden"],
            [class*=":contents"]
          ):has([data-grow])
      ) {
      display: flex;
      flex-direction: column;
      flex: 1 1 auto;
      min-height: 0;
    }
    .stage-box[data-live] :global(:is(.grid, [class*="lg:grid"]):has([data-grow])) {
      flex: 1 1 auto;
      align-items: stretch;
    }
    /* Beside the music in a grid, the answers stay at the top of their column. */
    .stage-box[data-live] :global(:is(.grid, [class*="lg:grid"]) > :is([data-dock="answers"], [data-dock="instrument"])) {
      align-self: start;
    }
  }
  .stage-box[data-live] :global([data-grow]) {
    flex: 1 1 auto;
    min-height: 0;
  }
</style>
