<script lang="ts" module>
  import type { NextRun } from "../advance.svelte";
  export interface ResultRow {
    label: string;
    /** 0..1 drawn as a bar; null with `notMeasured` reads "Not measured". */
    value?: number | null;
    text?: string;
    notMeasured?: boolean;
  }
  /** How the run's notes landed against the beat, as counts. Only from input that measured timing. */
  export interface RunTiming {
    onTime: number;
    early: number;
    late: number;
    missed: number;
  }
  export interface RunSummary {
    /** One plain sentence that says what happened. */
    headline: string;
    metric: string;
    metricLabel: string;
    /** The run's score (0..1) when `metric` does not state it ("85%" and "3/4" do): fills the score ring. */
    score?: number;
    /** Points vs the last run with the same setup; null when none. */
    delta?: number | null;
    best?: boolean;
    clean?: boolean;
    rows?: ResultRow[];
    /** On time, early, late and missed counts; leave out when the input cannot measure timing. */
    timing?: RunTiming;
    xp?: number;
    ladder?: { bpm: number; state: "unlocked" | "next" | "locked" }[];
    /** A hand-picked next drill; shown only when there is no `advance`, so one "next" line is drawn. */
    next?: { label: string; href: string; reason?: string };
    routine?: { label: string; href: string };
    assistance?: string;
    /** The next run by the shared rule (progress/advance). */
    advance?: NextRun;
    /** False for runs that write nothing (listen-along, unrecorded strums). */
    recorded?: boolean;
    /** False when nothing was heard: the card says so and offers to turn the input on. */
    heard?: boolean;
  }

  export const NOT_HEARD = "Nothing was heard, so this run was not scored.";
  /** The results of a run where nothing was heard (`FinishResult.heard` false): nothing scored or saved. */
  export const silentRun = (): RunSummary => ({ headline: NOT_HEARD, metric: "Not measured", metricLabel: "nothing was heard", heard: false, recorded: false });
</script>

<script lang="ts">
  import { getContext, onMount, tick, type Snippet } from "svelte";
  import { NEXT_VERB, SHELL_KEY, type ShellApi } from "./DrillShell.svelte";
  import { ADVANCE } from "@repo/music-core/progress/advance";
  import { gradeTone } from "@repo/music-core";
  import { audio } from "../runtime";
  import InputCheck from "./InputCheck.svelte";
  import Star from "lucide-svelte/icons/star";
  import Trophy from "lucide-svelte/icons/trophy";
  import Check from "lucide-svelte/icons/check";
  import X from "lucide-svelte/icons/x";
  import ChevronsLeft from "lucide-svelte/icons/chevrons-left";
  import ChevronsRight from "lucide-svelte/icons/chevrons-right";
  import { practice } from "../practice.svelte";
  import { deltaText, metricScore, notMeasuredText, setupTrend, sparkPoints } from "./trend";

  let { summary, actions }: { summary: RunSummary; actions?: Snippet } = $props();

  // "Since last time": the runs with this setup, read from the saved sessions (this run is the newest).
  const shownAt = Date.now();
  const trend = $derived(summary.recorded === false || summary.heard === false ? [] : setupTrend(practice.sessions, shownAt));
  /** The score the ring fills to: only a real one, stated by the drill or by its metric. */
  const score = $derived(summary.score ?? metricScore(summary.metric));
  const deltaLine = $derived.by(() => {
    if (summary.delta === null) return null;
    if (summary.delta !== undefined) {
      const d = summary.delta / 100;
      return { text: score !== undefined ? deltaText(score - d, score) : deltaText(0, d, false), up: Math.round(summary.delta) > 0 };
    }
    if (trend.length < 2) return null;
    const [a, b] = trend.slice(-2);
    return { text: deltaText(a, b, score !== undefined), up: Math.round(b * 100) > Math.round(a * 100) };
  });
  const clean = $derived(summary.clean ?? trend[trend.length - 1] === 1);
  /** The shared advance rule counted this run as a pass (a clean run at 85% or better). */
  const passed = $derived(!!summary.advance && summary.advance.passes > 0);
  const celebrate = $derived(clean || passed || !!summary.best);
  const SPARK = { w: 104, h: 28 };
  const spark = $derived(sparkPoints(trend, SPARK.w, SPARK.h));
  // Fires once, when the card first shows: the run's verdict does not change after.
  let cheered = false;
  $effect(() => {
    if (!celebrate || cheered) return;
    cheered = true;
    audio.celebrate?.(summary.best ? "best" : "clean");
  });
  // The ring and bars are drawn empty first, then fill to the real values (instant when motion is reduced).
  let filled = $state(false);
  onMount(() => {
    const id = requestAnimationFrame(() => requestAnimationFrame(() => (filled = true)));
    return () => cancelAnimationFrame(id);
  });

  const shell = getContext<ShellApi | undefined>(SHELL_KEY);
  const moves = $derived(!!summary.advance && summary.advance.kind !== "same" && summary.advance.kind !== "top");
  // The shell steps Again back to a secondary button while this card offers the next run.
  $effect(() => {
    shell?.offer(moves && summary.heard !== false ? summary.advance! : null);
    return () => shell?.offer(null);
  });
  // Nothing heard: the shell leaves the stage out and steps Again back, so the input fix leads.
  $effect(() => {
    shell?.silent(summary.heard === false);
    return () => shell?.silent(false);
  });
  const measured = $derived(summary.rows?.filter((r) => !r.notMeasured) ?? []);
  const unmeasured = $derived(summary.rows?.filter((r) => r.notMeasured).map((r) => r.label) ?? []);
  async function goNext() {
    summary.advance?.go();
    await tick();
    await shell?.start();
  }

  const bigPrimary =
    "flex min-h-12 items-center justify-center gap-2 rounded-full bg-instr px-6 font-display text-base font-semibold text-ws-stage shadow-sm hover:brightness-105";
  const toneClass = { success: "bg-success", warn: "bg-warn", error: "bg-destructive" } as const;
  /** The ring's tone by the advance rule's own lines: a pass, close, or under the line where the tempo steps back. */
  const ringTone = $derived(score === undefined ? null : score >= ADVANCE.pass ? "success" : score >= ADVANCE.fail ? "warn" : "error");
  const ringStroke = { success: "var(--success)", warn: "var(--warn)", error: "var(--destructive)" } as const;
  const ringText = { success: "text-success", warn: "text-warn", error: "text-destructive" } as const;
  const passPct = Math.round(ADVANCE.pass * 100);
  /** The pips' caption: the count toward moving on, or what the full count earned. */
  const pipsText = $derived.by(() => {
    const a = summary.advance;
    if (!a) return "";
    // The full count moved the run on: the rule's own reason ("2 clean runs at 80 BPM"), then what it earned.
    if (a.passes >= a.need && (a.kind === "faster" || a.kind === "harder"))
      return `${a.reason[0].toUpperCase()}${a.reason.slice(1)}: ${a.kind === "faster" ? "speeding up next" : "moving on next"}`;
    return `Clean runs at ${passPct}%: ${a.passes} of ${a.need}`;
  });
  const total = $derived(summary.timing ? summary.timing.onTime + summary.timing.early + summary.timing.late + summary.timing.missed : 0);
  const timingRows = $derived(
    summary.timing
      ? ([
          { label: "On time", n: summary.timing.onTime, icon: Check, tone: "success" },
          { label: "Early", n: summary.timing.early, icon: ChevronsLeft, tone: "warn" },
          { label: "Late", n: summary.timing.late, icon: ChevronsRight, tone: "warn" },
          { label: "Missed", n: summary.timing.missed, icon: X, tone: "error" },
        ] as const)
      : [],
  );
</script>

{#if summary.heard === false}
  <article class="rounded-2xl border border-ws-line bg-ws-surface p-5 sm:p-6" data-testid="not-heard">
    <p class="font-display text-xl font-semibold leading-snug sm:text-2xl">{summary.headline}</p>
    <p class="mt-1 text-sm text-ws-soft">Not measured and not recorded: no XP, nothing added to your progress.</p>
    <div class="mt-4"><InputCheck after /></div>
  </article>
{:else}
<!-- A clean run, a pass by the advance rule or a personal best keeps a success edge and badge after the burst has gone. -->
<article class="relative overflow-hidden rounded-2xl border bg-ws-surface p-5 sm:p-6 {celebrate ? 'border-success/60 ring-1 ring-success/30' : 'border-ws-line'}" data-testid="results">
  {#if celebrate}<span class="bloom" aria-hidden="true"></span>{/if}
  <!-- On a phone the ring and its badges share the first row and the rest runs full width under them;
       from sm up everything stacks in one column beside the ring. -->
  <div class="relative grid grid-cols-[auto_minmax(0,1fr)] items-center gap-x-5 gap-y-1 sm:gap-x-8">
    <!-- The score: a ring that fills to it, with a glyph for its tone so colour is never the only cue. -->
    <div class="flex shrink-0 flex-col items-center gap-1 self-start text-center sm:row-span-4">
      {#if score !== undefined && ringTone}
        <div class="relative grid size-28 place-items-center sm:size-36">
          <svg viewBox="0 0 36 36" class="absolute inset-0 -rotate-90" aria-hidden="true">
            <circle cx="18" cy="18" r="16" fill="none" stroke-width="3" class="stroke-ws-raised" />
            <circle
              class="ws-fill"
              cx="18"
              cy="18"
              r="16"
              fill="none"
              stroke-width="3.25"
              stroke={ringStroke[ringTone]}
              stroke-linecap="round"
              pathLength="100"
              stroke-dasharray="100 100"
              stroke-dashoffset={filled ? 100 - Math.max(1, score * 100) : 100}
            />
          </svg>
          <div class="relative flex flex-col items-center">
            {#if ringTone === "success"}<Check class="size-5 text-success" strokeWidth={3} aria-hidden="true" />
            {:else if ringTone === "warn"}<span class="grid size-5 place-items-center" aria-hidden="true"><span class="size-2.5 rounded-full bg-warn"></span></span>
            {:else}<X class="size-5 text-destructive" strokeWidth={3} aria-hidden="true" />{/if}
            <p class="tnum font-display font-bold leading-none {summary.metric.length > 5 ? 'text-xl sm:text-3xl' : summary.metric.length > 3 ? 'text-2xl sm:text-4xl' : 'text-3xl sm:text-4xl'}">{summary.metric}</p>
          </div>
          {#if celebrate}{@render burst()}{/if}
        </div>
      {:else}
        <p class="relative tnum font-display text-5xl font-bold leading-none sm:text-6xl">
          {summary.metric}
          {#if celebrate}{@render burst()}{/if}
        </p>
      {/if}
      <p class="max-w-36 text-sm text-ws-soft">{summary.metricLabel}</p>
    </div>

    <div class="flex min-w-0 flex-col items-start gap-2 self-center sm:self-end">
      {#if celebrate}
        <p class="flex flex-wrap gap-1.5">
          {#if clean}<span class="flex items-center gap-1.5 rounded-full bg-success/15 px-3 py-1 text-sm font-semibold text-success"><Star class="size-4 fill-current" aria-hidden="true" />Clean run</span>
          {:else if passed}<span class="flex items-center gap-1.5 rounded-full bg-success/15 px-3 py-1 text-sm font-semibold text-success"><Check class="size-4" strokeWidth={3} aria-hidden="true" />Counts toward moving on</span>{/if}
          {#if summary.best}<span class="flex items-center gap-1.5 rounded-full bg-success/15 px-3 py-1 text-sm font-semibold text-success"><Trophy class="size-4" aria-hidden="true" />Personal best</span>{/if}
        </p>
      {/if}
      <p class="text-sm font-medium">
        {#if deltaLine}
          <span class={deltaLine.up ? "text-success" : "text-ws-soft"}>{deltaLine.text}</span>
        {:else if summary.recorded === false}<span class="text-ws-soft">Not recorded</span>{:else if !summary.best}<span class="text-ws-soft">First run with this setup</span>{/if}
      </p>
      {#if trend.length > 1}
        <figure class="flex flex-col items-start gap-0.5">
          <svg
            class="overflow-visible text-instr-ink"
            width={SPARK.w}
            height={SPARK.h}
            viewBox="0 0 {SPARK.w} {SPARK.h}"
            role="img"
            aria-label="Your last {trend.length} runs with this setup: {trend.map((v) => `${Math.round(v * 100)}%`).join(', ')}"
          >
            <line x1="0" x2={SPARK.w} y1={SPARK.h} y2={SPARK.h} class="stroke-ws-line" stroke-width="1" />
            <polyline points={spark.map((p) => p.join(",")).join(" ")} fill="none" stroke="currentColor" stroke-width="1.75" stroke-linejoin="round" stroke-linecap="round" opacity="0.75" />
            {#each spark as [x, y], i (i)}<circle cx={x} cy={y} r={i === spark.length - 1 ? 4 : 2.25} fill={i === spark.length - 1 ? "currentColor" : "var(--ws-surface)"} stroke="currentColor" stroke-width="1.25" />{/each}
          </svg>
          <figcaption class="text-xs text-ws-soft" aria-hidden="true">Last {trend.length} runs</figcaption>
        </figure>
      {/if}
      {#if summary.xp && !summary.advance}<p class="text-xs text-ws-soft">+{summary.xp} XP</p>{/if}
    </div>
    <div class="col-span-2 mt-3 min-w-0 sm:col-span-1 sm:col-start-2 sm:mt-1">
      <p class="font-display text-lg font-semibold leading-snug sm:text-xl">{summary.headline}</p>
      {#if summary.assistance}<p class="mt-1 text-sm text-ws-soft">{summary.assistance}</p>{/if}
    </div>

  {#if summary.advance}
    {@const a = summary.advance}
    <!-- The count toward moving on, then the next run: one button when the rule moves, a sentence when it holds. -->
    <div class="col-span-2 mt-3 flex min-w-0 flex-col gap-2 sm:col-span-1 sm:col-start-2" data-testid="next-run" data-kind={a.kind}>
      <div class="flex flex-wrap items-center gap-x-3 gap-y-1">
        <span class="flex items-center gap-1.5" role="img" aria-label={pipsText}>
          {#each Array.from({ length: a.need }, (_, i) => i) as i (i)}
            {#if i < a.passes}
              <span class="grid size-7 place-items-center rounded-full bg-success text-success-foreground {passed && i === Math.min(a.passes, a.need) - 1 ? 'ws-pop' : ''}"><Check class="size-4" strokeWidth={3} aria-hidden="true" /></span>
            {:else}
              <span class="size-7 rounded-full border-2 border-dashed border-ws-soft/50"></span>
            {/if}
          {/each}
        </span>
        <span class="text-sm text-ws-soft" aria-hidden="true">{pipsText}</span>
        {#if summary.xp}<span class="text-xs text-ws-soft">+{summary.xp} XP</span>{/if}
      </div>
      {#if moves}
        <div class="flex flex-wrap items-center gap-x-3 gap-y-1">
          <button type="button" class="{bigPrimary} max-sm:w-full" onclick={goNext}>{NEXT_VERB[a.kind]} {a.label}</button>
          {#if a.passes < a.need}<span class="text-sm text-ws-soft">{a.reason[0].toUpperCase()}{a.reason.slice(1)}.</span>{/if}
        </div>
      {:else}
        <p class="text-sm"><span class="text-ws-soft">Next run:</span> <span class="font-semibold">same again</span><span class="text-ws-soft">, {a.reason}.</span></p>
      {/if}
    </div>
  {/if}
  {#if summary.next && !summary.advance}
    <p class="col-span-2 mt-2 text-sm sm:col-span-1 sm:col-start-2">
      <span class="text-ws-soft">Next up:</span>
      <a class="font-semibold text-instr-ink underline-offset-4 hover:underline" href={summary.next.href}>{summary.next.label}</a>
      {#if summary.next.reason}<span class="text-ws-soft">, {summary.next.reason}</span>{/if}
    </p>
  {/if}
  </div>

  {#if timingRows.length}
    <!-- Where the notes landed against the beat: a word and a glyph on every row, so colour is never the only cue. -->
    <dl class="relative mt-5 grid gap-2" aria-label="Timing">
      {#each timingRows as r (r.label)}
        <div class="grid grid-cols-[auto_5rem_1fr_2.5rem] items-center gap-2 text-sm">
          <r.icon class="size-4 {ringText[r.tone]}" strokeWidth={3} aria-hidden="true" />
          <dt class="text-ws-soft">{r.label}</dt>
          <div class="h-2 rounded-full bg-ws-raised" aria-hidden="true">
            <div class="ws-fill h-full rounded-full {toneClass[r.tone]}" style:width="{filled && total ? (r.n / total) * 100 : 0}%"></div>
          </div>
          <dd class="tnum text-right font-semibold">{r.n}</dd>
        </div>
      {/each}
    </dl>
  {/if}

  {#if measured.length}
    <dl class="relative mt-5 grid gap-x-6 gap-y-3 sm:grid-cols-2">
      {#each measured as row (row.label)}
        <div class="min-w-0">
          <div class="flex items-baseline justify-between gap-3 text-sm">
            <dt class="text-ws-soft">{row.label}</dt>
            <dd class="tnum font-semibold">{row.text ?? `${Math.round((row.value ?? 0) * 100)}%`}</dd>
          </div>
          {#if row.value != null}
            <div class="mt-1 h-1.5 rounded-full bg-ws-raised">
              <div class="ws-fill h-full rounded-full {toneClass[gradeTone(row.value)]}" style:width="{filled ? Math.max(2, row.value * 100) : 0}%"></div>
            </div>
          {/if}
        </div>
      {/each}
    </dl>
  {/if}
  {#if unmeasured.length}
    <!-- What the input could not hear, said once and kept in view (never scored as a zero). -->
    <p class="relative mt-3 text-sm text-ws-soft">{notMeasuredText(unmeasured)}</p>
  {/if}

  {#if summary.ladder?.length}
    <div class="relative mt-5">
      <p class="text-sm font-medium">Tempo ladder</p>
      <ol class="mt-2 flex flex-wrap gap-1.5">
        {#each summary.ladder as rung (rung.bpm)}
          <li
            class="tnum flex min-h-9 items-center gap-1 rounded-full border px-3 text-sm {rung.state === 'unlocked'
              ? 'border-transparent bg-instr text-ws-stage font-semibold'
              : rung.state === 'next'
                ? 'border-dashed border-instr-ink text-instr-ink'
                : 'border-ws-line text-ws-soft'}"
          >
            {rung.bpm}
            <span class="sr-only">BPM, {rung.state === "next" ? "next rung" : rung.state}</span>
            {#if rung.state === "unlocked"}<span aria-hidden="true">✓</span>{/if}
          </li>
        {/each}
      </ol>
    </div>
  {/if}

  {#if actions || summary.routine}
    <div class="relative mt-5 flex flex-wrap gap-2">
      {#if actions}{@render actions()}{/if}
      {#if summary.routine}
        <a
          href={summary.routine.href}
          class="flex min-h-11 items-center rounded-full bg-instr px-5 text-sm font-semibold text-ws-stage">{summary.routine.label}</a
        >
      {/if}
    </div>
  {/if}
</article>
{/if}

<!-- A short burst of stars from the score; left out when motion is reduced. -->
{#snippet burst()}
  <span class="burst" aria-hidden="true">{#each Array.from({ length: 8 }, (_, i) => i) as i (i)}<span style:--a="{i * 45}deg" style:--d="{(i % 3) * 40}ms"></span>{/each}</span>
{/snippet}

<style>
  .burst {
    position: absolute;
    left: 50%;
    top: 50%;
    pointer-events: none;
  }
  .burst span {
    position: absolute;
    width: 0.7rem;
    height: 0.7rem;
    margin: -0.35rem;
    background: var(--instr);
    clip-path: polygon(50% 0%, 61% 35%, 98% 35%, 68% 57%, 79% 91%, 50% 70%, 21% 91%, 32% 57%, 2% 35%, 39% 35%);
    opacity: 0;
    animation: star-burst 900ms ease-out var(--d) both;
  }
  @keyframes star-burst {
    0% {
      transform: rotate(var(--a)) translateY(0) scale(0.4);
      opacity: 1;
    }
    100% {
      transform: rotate(var(--a)) translateY(-4.5rem) scale(1);
      opacity: 0;
    }
  }
  @media (prefers-reduced-motion: reduce) {
    .burst,
    .bloom {
      display: none;
    }
  }
  .bloom {
    position: absolute;
    left: 0.5rem;
    top: 0.5rem;
    width: 9rem;
    height: 9rem;
    border-radius: 999px;
    background: radial-gradient(circle, color-mix(in oklch, var(--instr) 55%, transparent), transparent 70%);
    animation: ws-bloom 900ms ease-out forwards;
    pointer-events: none;
  }
</style>
