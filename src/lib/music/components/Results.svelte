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
  import { getContext, onMount, tick, type Snippet } from "svelte";
  import { SHELL_KEY, type ShellApi } from "./DrillShell.svelte";
  import { btnPrimary } from "./ui";
  import { gradeTone } from "@repo/music-core";
  import { audio } from "../runtime";
  import InputCheck from "./InputCheck.svelte";

  let { summary, actions }: { summary: RunSummary; actions?: Snippet } = $props();

  const celebrate = $derived(!!summary.clean || !!summary.best);
  onMount(() => {
    if (celebrate) audio.celebrate?.(summary.best ? "best" : "clean");
  });

  const shell = getContext<ShellApi | undefined>(SHELL_KEY);
  const moves = $derived(!!summary.advance && summary.advance.kind !== "same" && summary.advance.kind !== "top");
  $effect(() => {
    shell?.offer(moves && summary.heard !== false);
    return () => shell?.offer(false);
  });
  const VERB: Record<string, string> = { faster: "Speed up to", slower: "Slow down to", harder: "Move on:", easier: "Step back:" };
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
    <div class="text-right">
      <p class="tnum font-display text-5xl font-bold leading-none sm:text-6xl">{summary.metric}</p>
      <p class="mt-1 text-sm text-ws-soft">{summary.metricLabel}</p>
      <p class="mt-2 text-sm font-medium">
        {#if summary.best}<span class="text-success">Personal best</span>{:else if summary.delta != null && Math.round(summary.delta) === 0}
          <span class="text-ws-soft">Same as last time</span>
        {:else if summary.delta != null}
          <span class={summary.delta > 0 ? "text-success" : "text-ws-soft"}>
            {summary.delta > 0 ? "+" : ""}{Math.round(summary.delta)} vs last time
          </span>
        {:else if summary.recorded === false}<span class="text-ws-soft">Not recorded</span>{:else}<span class="text-ws-soft">First run with this setup</span>{/if}
        {#if summary.xp}<span class="ml-2 text-ws-soft">+{summary.xp} XP</span>{/if}
      </p>
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
    {#if moves && summary.advance}
      {@const a = summary.advance}
      <div class="flex basis-full flex-wrap items-center gap-x-3 gap-y-1" data-testid="next-run" data-kind={a.kind}>
        <button type="button" class={btnPrimary} onclick={goNext}>{VERB[a.kind]} {a.label}</button>
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
