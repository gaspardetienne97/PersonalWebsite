<script lang="ts" module>
  import type { NextRun } from "../advance.svelte";
  export interface ResultRow {
    label: string;
    /** 0..1 drawn as a bar; null with `notMeasured` reads "Not measured". */
    value?: number | null;
    text?: string;
    notMeasured?: boolean;
  }
  export interface RunSummary {
    /** One plain sentence that says what happened. */
    headline: string;
    metric: string;
    metricLabel: string;
    /** Points vs the last run with the same setup; null when none. */
    delta?: number | null;
    best?: boolean;
    clean?: boolean;
    rows?: ResultRow[];
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
  import { getContext, tick, type Snippet } from "svelte";
  import { NEXT_VERB, SHELL_KEY, type ShellApi } from "./DrillShell.svelte";
  import { btnPrimary } from "./ui";
  import { gradeTone } from "@repo/music-core";
  import { audio } from "../runtime";
  import InputCheck from "./InputCheck.svelte";
  import Star from "@lucide/svelte/icons/star";
  import { practice } from "../practice.svelte";
  import { setupTrend, sparkPoints } from "./trend";

  let { summary, actions }: { summary: RunSummary; actions?: Snippet } = $props();

  // "Since last time": the runs with this setup, read from the saved sessions (this run is the newest).
  const shownAt = Date.now();
  const trend = $derived(summary.recorded === false || summary.heard === false ? [] : setupTrend(practice.sessions, shownAt));
  const delta = $derived(summary.delta !== undefined ? summary.delta : trend.length > 1 ? (trend[trend.length - 1] - trend[trend.length - 2]) * 100 : null);
  const clean = $derived(summary.clean ?? trend[trend.length - 1] === 1);
  const celebrate = $derived(clean || !!summary.best);
  const SPARK = { w: 88, h: 24 };
  const spark = $derived(sparkPoints(trend, SPARK.w, SPARK.h));
  // Fires once, when the card first shows: the run's verdict does not change after.
  let cheered = false;
  $effect(() => {
    if (!celebrate || cheered) return;
    cheered = true;
    audio.celebrate?.(summary.best ? "best" : "clean");
  });

  const shell = getContext<ShellApi | undefined>(SHELL_KEY);
  const moves = $derived(!!summary.advance && summary.advance.kind !== "same" && summary.advance.kind !== "top");
  // Inside a drill the shell's action bar draws the next-run button; on its own the card does.
  $effect(() => {
    shell?.offer(moves && summary.heard !== false ? summary.advance! : null);
    return () => shell?.offer(null);
  });
  async function goNext() {
    summary.advance?.go();
    await tick();
    await shell?.start();
  }

  const toneClass = { success: "bg-success", warn: "bg-warn", error: "bg-destructive" } as const;
</script>

{#if summary.heard === false}
  <article class="rounded-2xl border border-ws-line bg-ws-surface p-5 sm:p-6" data-testid="not-heard">
    <p class="font-display text-xl font-semibold leading-snug sm:text-2xl">{summary.headline}</p>
    <p class="mt-1 text-sm text-ws-soft">Not measured and not recorded: no XP, nothing added to your progress.</p>
    <div class="mt-4"><InputCheck after /></div>
  </article>
{:else}
<article class="relative overflow-hidden rounded-2xl border border-ws-line bg-ws-surface p-5 sm:p-6">
  {#if celebrate}<span class="bloom" aria-hidden="true"></span>{/if}
  <div class="relative flex flex-wrap items-start gap-x-8 gap-y-4">
    <div class="min-w-0 flex-1 basis-72">
      <p class="font-display text-xl font-semibold leading-snug sm:text-2xl">{summary.headline}</p>
      {#if summary.assistance}<p class="mt-1 text-sm text-ws-soft">{summary.assistance}</p>{/if}
      {#if summary.advance && !moves}
        <p class="mt-3 text-sm" data-testid="next-run" data-kind={summary.advance.kind}>
          <span class="text-ws-soft">Next run:</span> <span class="font-semibold">same again</span><span class="text-ws-soft">, {summary.advance.reason}.</span>
        </p>
      {/if}
      {#if summary.next && !summary.advance}
        <p class="mt-3 text-sm">
          <span class="text-ws-soft">Next up:</span>
          <a class="font-semibold text-instr-ink underline-offset-4 hover:underline" href={summary.next.href}>{summary.next.label}</a>
          {#if summary.next.reason}<span class="text-ws-soft">, {summary.next.reason}</span>{/if}
        </p>
      {/if}
    </div>
    <div class="flex flex-col items-end text-right">
      {#if clean}
        <p class="mb-2 flex items-center gap-1 rounded-full bg-success/15 px-2.5 py-0.5 text-xs font-semibold text-success">
          <Star class="size-3.5 fill-current" aria-hidden="true" />Clean run
        </p>
      {/if}
      <p class="relative tnum font-display text-5xl font-bold leading-none sm:text-6xl">
        {summary.metric}
        {#if celebrate}
          <!-- A short burst of stars from the number; left out when motion is reduced. -->
          <span class="burst" aria-hidden="true">{#each Array.from({ length: 8 }, (_, i) => i) as i (i)}<span style:--a="{i * 45}deg" style:--d="{(i % 3) * 40}ms"></span>{/each}</span>
        {/if}
      </p>
      <p class="mt-1 text-sm text-ws-soft">{summary.metricLabel}</p>
      <p class="mt-2 text-sm font-medium">
        {#if summary.best}<span class="text-success">Personal best</span>{:else if delta != null && Math.round(delta) === 0}
          <span class="text-ws-soft">Same as last time</span>
        {:else if delta != null}
          <span class={delta > 0 ? "text-success" : "text-ws-soft"}>
            {delta > 0 ? "+" : ""}{Math.round(delta)} vs last time
          </span>
        {:else if summary.recorded === false}<span class="text-ws-soft">Not recorded</span>{:else}<span class="text-ws-soft">First run with this setup</span>{/if}
        {#if summary.xp}<span class="ml-2 text-ws-soft">+{summary.xp} XP</span>{/if}
      </p>
      {#if trend.length > 1}
        <svg
          class="mt-2 overflow-visible text-instr-ink"
          width={SPARK.w}
          height={SPARK.h}
          viewBox="0 0 {SPARK.w} {SPARK.h}"
          role="img"
          aria-label="Your last {trend.length} runs with this setup: {trend.map((v) => `${Math.round(v * 100)}%`).join(', ')}"
        >
          <line x1="0" x2={SPARK.w} y1={SPARK.h} y2={SPARK.h} class="stroke-ws-line" stroke-width="1" />
          <polyline points={spark.map((p) => p.join(",")).join(" ")} fill="none" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round" stroke-linecap="round" opacity="0.7" />
          {#each spark as [x, y], i (i)}<circle cx={x} cy={y} r={i === spark.length - 1 ? 3.5 : 2} fill={i === spark.length - 1 ? "currentColor" : "var(--ws-surface)"} stroke="currentColor" stroke-width="1.25" />{/each}
        </svg>
      {/if}
    </div>
  </div>

  {#if summary.rows?.length}
    <dl class="relative mt-5 grid gap-x-6 gap-y-3 sm:grid-cols-2">
      {#each summary.rows as row (row.label)}
        <div class="min-w-0">
          <div class="flex items-baseline justify-between gap-3 text-sm">
            <dt class="text-ws-soft">{row.label}</dt>
            <dd class="tnum font-semibold">
              {#if row.notMeasured}<span class="font-normal text-ws-soft">Not measured</span>{:else}{row.text ?? `${Math.round((row.value ?? 0) * 100)}%`}{/if}
            </dd>
          </div>
          {#if row.value != null && !row.notMeasured}
            <div class="mt-1 h-1.5 rounded-full bg-ws-raised">
              <div class="h-full rounded-full {toneClass[gradeTone(row.value)]}" style:width="{Math.max(2, row.value * 100)}%"></div>
            </div>
          {/if}
        </div>
      {/each}
    </dl>
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

  <div class="relative mt-5 flex flex-wrap gap-2">
    {#if moves && summary.advance && !shell}
      {@const a = summary.advance}
      <div class="flex basis-full flex-wrap items-center gap-x-3 gap-y-1" data-testid="next-run" data-kind={a.kind}>
        <button type="button" class={btnPrimary} onclick={goNext}>{NEXT_VERB[a.kind]} {a.label}</button>
        <span class="text-sm text-ws-soft">{a.reason[0].toUpperCase()}{a.reason.slice(1)}.</span>
      </div>
    {/if}
    {#if actions}{@render actions()}{/if}
    {#if summary.routine}
      <a
        href={summary.routine.href}
        class="flex min-h-11 items-center rounded-full bg-instr px-5 text-sm font-semibold text-ws-stage">{summary.routine.label}</a
      >
    {/if}
  </div>
</article>
{/if}

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
    right: 3rem;
    top: 2rem;
    width: 9rem;
    height: 9rem;
    border-radius: 999px;
    background: radial-gradient(circle, color-mix(in oklch, var(--instr) 55%, transparent), transparent 70%);
    animation: ws-bloom 900ms ease-out forwards;
    pointer-events: none;
  }
</style>
