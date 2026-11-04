<script lang="ts" module>
  import type { NextRun } from "../advance.svelte";
  import type { DrillMode } from "./DrillShell.svelte";
  import type { ResultRow, RunTiming } from "@repo/music-core/scoring/evidence";
  export type { ResultRow, RunTiming };
  export interface RunSummary {
    /** One plain sentence that says what happened (not what the run counts as: Results says that from `mode`). */
    headline: string;
    metric: string;
    metricLabel: string;
    /** The run's score (0..1) when `metric` does not state it ("85%" and "3/4" do): fills the score ring. */
    score?: number;
    /** Points vs the last run with the same setup; null when none. */
    delta?: number | null;
    best?: boolean;
    clean?: boolean;
    /** Built with the evidence helpers (timingRow, evennessRow): a row from too little evidence is Not measured. */
    rows?: ResultRow[];
    /** On time, early, late and missed counts (timingBreakdown); leave out when the input cannot measure timing. */
    timing?: RunTiming;
    xp?: number;
    /** @deprecated The advance rule is the one next-run rule; no longer drawn. */
    ladder?: { bpm: number; state: "unlocked" | "next" | "locked" }[];
    /** A hand-picked next drill; shown only when there is no `advance`, so one "next" line is drawn. */
    next?: { label: string; href: string; reason?: string };
    routine?: { label: string; href: string };
    /** The mode the run was played in: Results words what it counts toward. */
    mode?: DrillMode;
    /** A hint was used: the run is practice whatever the mode. */
    hinted?: boolean;
    /** @deprecated Pass `mode` (and `hinted`). Shown only when `mode` is missing. */
    assistance?: string;
    /** The one fix the headline points at, as a button ("Loop bar 4", "Practise my confusions"). */
    coach?: { label: string; run: () => void };
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

  // Static confetti for a pass: drawn at rest so a still frame (and reduced motion) shows it; motion
  // only adds a short fall. Two bands, above and below the verdict, spread by the golden ratio.
  const CONFETTI = Array.from({ length: 24 }, (_, i) => {
    const top = i % 3 !== 0;
    return {
      x: ((i * 0.618034) % 1) * 100,
      y: top ? 3 + ((i * 2.618034) % 1) * 22 : 78 + ((i * 1.618034) % 1) * 16,
      r: (i * 47) % 180,
      c: ["var(--success)", "var(--warn)", "var(--instr)", "var(--early)", "var(--late)"][i % 5],
      dot: i % 4 === 0,
      d: (i % 6) * 35,
    };
  });
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
  import { modeText } from "../drill.svelte";
  import { btn, btnPrimary } from "./ui";
  import { deltaLine, metricScore, pipsText, priorBest, setupTrend, sparkPoints, starsFor, starsLabel, VERDICT_WORDS } from "./trend";

  let { summary, actions }: { summary: RunSummary; actions?: Snippet } = $props();

  // "Since last time": the runs with this setup, read from the saved sessions (this run is the newest).
  const shownAt = Date.now();
  const scored = $derived(summary.recorded !== false && summary.heard !== false);
  const trend = $derived(scored ? setupTrend(practice.sessions, shownAt) : []);
  /** The score the ring fills to: only a real one, stated by the drill or by its metric. */
  const score = $derived(summary.score ?? metricScore(summary.metric));
  const delta = $derived(deltaLine({ trend, best: summary.best, priorBest: scored ? priorBest(practice.sessions, shownAt) : undefined, delta: summary.delta, score }));
  /** A pass by the shared advance rule (85% and the drill's own `correct`); without a rule, 85% and not marked unclean. */
  const pass = $derived(summary.advance ? summary.advance.passes > 0 : score !== undefined && score >= ADVANCE.pass && summary.clean !== false);
  /** Stars on the rule's lines; none on a run that was not recorded. */
  const stars = $derived(scored ? starsFor(score, pass) : null);
  const confetti = $derived(stars !== null && stars >= 2);
  // Fires once, when the card first shows: the run's verdict does not change after.
  let cheered = false;
  $effect(() => {
    if (!confetti || cheered) return;
    cheered = true;
    audio.celebrate?.(delta?.best ? "best" : "clean");
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
  // A coach fix starts its run like the next-run button does (the shell skips a drill that already started one).
  async function coachRun() {
    summary.coach?.run();
    await tick();
    await shell?.start();
  }
  async function goNext() {
    summary.advance?.go();
    await tick();
    await shell?.start();
  }

  const bigPrimary =
    "flex min-h-12 items-center justify-center gap-2 rounded-full bg-instr-strong px-6 font-display text-base font-semibold text-on-instr shadow-sm hover:brightness-105";
  const toneClass = { success: "bg-success", warn: "bg-warn", error: "bg-destructive" } as const;
  /** The ring's tone by the advance rule's own lines: a pass, close, or under the line where the tempo steps back. */
  const ringTone = $derived(score === undefined ? null : score >= ADVANCE.pass ? "success" : score >= ADVANCE.fail ? "warn" : "error");
  const ringStroke = { success: "var(--success)", warn: "var(--warn)", error: "var(--destructive)" } as const;
  /** The hero band's wash and the verdict word's colour, by stars. */
  const band = $derived(stars === null ? "" : stars >= 2 ? "bg-success/12" : stars === 1 ? "bg-warn/12" : "bg-ws-raised/70");
  const verdictInk = $derived(stars === null ? "" : stars >= 2 ? "text-success" : stars === 1 ? "text-warn" : "text-ws-ink");

  /** What the run counts toward, said once, from the mode. */
  const status = $derived(
    summary.mode
      ? modeText(summary.mode, { hinted: summary.hinted, moves: summary.advance ? (summary.advance.bpm !== undefined ? "tempo" : "steps") : null })
      : summary.assistance,
  );
  /** XP is earned on every run, but only shown from 70% (Progress keeps the total). */
  const showXp = $derived(!!summary.xp && (score === undefined || score >= ADVANCE.fail));
  const SPARK = { w: 160, h: 40 };
  const spark = $derived(sparkPoints(trend, SPARK.w, SPARK.h));
  const pctOf = (v: number) => `${Math.round(v * 100)}%`;

  const total = $derived(summary.timing ? summary.timing.onTime + summary.timing.early + summary.timing.late + summary.timing.missed : 0);
  const timingRows = $derived(
    summary.timing
      ? ([
          { label: "On time", n: summary.timing.onTime, icon: Check, ink: "text-success", fill: "bg-success", pill: "bg-success text-success-foreground" },
          { label: "Early", n: summary.timing.early, icon: ChevronsLeft, ink: "text-early", fill: "bg-early", pill: "bg-early" },
          { label: "Late", n: summary.timing.late, icon: ChevronsRight, ink: "text-late", fill: "bg-late", pill: "bg-late" },
          { label: "Missed", n: summary.timing.missed, icon: X, ink: "text-destructive", fill: "bg-destructive", pill: "bg-destructive text-[color:var(--on-destructive)]" },
        ] as const)
      : [],
  );
  const rows = $derived(summary.rows ?? []);
  const breakdown = $derived(timingRows.length > 0 || rows.length > 0);
</script>

{#if summary.heard === false}
  <article class="rounded-2xl border border-ws-line bg-ws-surface p-5 sm:p-6" data-testid="not-heard">
    <p class="font-display text-xl font-semibold leading-snug sm:text-2xl">{summary.headline}</p>
    <p class="mt-1 text-sm text-ws-soft">Not measured and not recorded: no XP, nothing added to your progress.</p>
    <div class="mt-4"><InputCheck after /></div>
  </article>
{:else}
<article class="overflow-hidden rounded-2xl border bg-ws-surface {confetti ? 'border-success/60' : 'border-ws-line'}" data-testid="results" data-stars={stars ?? undefined}>
  <!-- 1. The hero: the score ring, stars on the advance rule's lines, the verdict word, and the change since last time. -->
  <div class="relative overflow-hidden px-5 py-5 sm:px-6 {band}">
    {#if confetti}
      <div class="pointer-events-none absolute inset-0" aria-hidden="true">
        {#each CONFETTI as m, i (i)}
          <span class="confetti {m.dot ? 'size-2 rounded-full' : 'h-2.5 w-1.5 rounded-[2px]'}" style:left="{m.x}%" style:top="{m.y}%" style:background={m.c} style:--r="{m.r}deg" style:animation-delay="{m.d}ms"></span>
        {/each}
      </div>
    {/if}
    <div class="relative flex items-center gap-4 sm:gap-6">
      <div class="flex shrink-0 flex-col items-center gap-1 text-center">
        {#if score !== undefined && ringTone}
          <!-- The score: a ring that fills to it, with a glyph for its tone so colour is never the only cue. -->
          <div class="relative grid size-24 place-items-center sm:size-32">
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
              {#if ringTone === "success"}<Check class="size-4 text-success" strokeWidth={3} aria-hidden="true" />
              {:else if ringTone === "warn"}<span class="grid size-4 place-items-center" aria-hidden="true"><span class="size-2 rounded-full bg-warn"></span></span>
              {:else}<X class="size-4 text-destructive" strokeWidth={3} aria-hidden="true" />{/if}
              <p class="tnum font-display font-bold leading-none {summary.metric.length > 5 ? 'text-lg sm:text-2xl' : summary.metric.length > 3 ? 'text-2xl sm:text-3xl' : 'text-3xl sm:text-4xl'}">{summary.metric}</p>
            </div>
          </div>
        {:else}
          <p class="tnum font-display text-5xl font-bold leading-none sm:text-6xl">{summary.metric}</p>
        {/if}
        <p class="max-w-32 text-sm leading-tight text-ws-soft">{summary.metricLabel}</p>
      </div>

      <div class="flex min-w-0 flex-1 flex-col items-start gap-1.5">
        {#if stars !== null}
          <p class="flex gap-1" role="img" aria-label={starsLabel(stars)}>
            {#each [0, 1, 2] as i (i)}
              {#if i < stars}
                <Star class="ws-pop size-7 fill-warn text-warn sm:size-8" style="animation-delay: {i * 110}ms" aria-hidden="true" />
              {:else}
                <Star class="size-7 text-ws-soft/60 sm:size-8" strokeWidth={1.75} aria-hidden="true" />
              {/if}
            {/each}
          </p>
          <p class="ws-hero font-display font-bold {verdictInk}">{VERDICT_WORDS[stars]}</p>
        {/if}
        {#if delta?.best}
          <span class="flex items-center gap-1.5 rounded-full bg-success px-3 py-1 text-sm font-semibold text-success-foreground"><Trophy class="size-4" aria-hidden="true" />{delta.text}</span>
        {:else if delta}
          <p class="text-sm font-medium {delta.up ? 'text-success' : 'text-ws-soft'}">{delta.text}</p>
        {:else}
          <p class="text-sm text-ws-soft">{summary.recorded === false ? "Not recorded" : "First run with this setup"}</p>
        {/if}
      </div>
    </div>
  </div>

  <div class="grid gap-5 p-5 sm:p-6 {breakdown ? 'lg:grid-cols-2 lg:items-start lg:gap-x-10' : ''}">
    <!-- 2. One coach line, and its fix when the drill offers one. -->
    <div class="flex min-w-0 flex-col items-start gap-3">
      <p class="font-display text-lg font-semibold leading-snug sm:text-xl">{summary.headline}</p>
      {#if summary.coach}<button type="button" class={btn} onclick={coachRun}>{summary.coach.label}</button>{/if}
    </div>

    {#if summary.advance}
      {@const a = summary.advance}
      <!-- The count toward moving on, then the next run: one button when the rule moves, a sentence when it holds. -->
      <div class="flex min-w-0 flex-col gap-2" data-testid="next-run" data-kind={a.kind}>
        <div class="flex flex-wrap items-center gap-x-3 gap-y-1">
          <span class="flex items-center gap-1.5" role="img" aria-label={pipsText(a)}>
            {#each Array.from({ length: a.need }, (_, i) => i) as i (i)}
              {#if i < a.passes}
                <span class="grid size-7 place-items-center rounded-full bg-success text-success-foreground {pass && i === Math.min(a.passes, a.need) - 1 ? 'ws-pop' : ''}"><Check class="size-4" strokeWidth={3} aria-hidden="true" /></span>
              {:else}
                <span class="size-7 rounded-full border-2 border-dashed border-ws-soft/60"></span>
              {/if}
            {/each}
          </span>
          <span class="text-sm text-ws-soft" aria-hidden="true">{pipsText(a)}</span>
        </div>
        {#if moves}
          <!-- The shell docks the next run as its primary button (in the thumb zone); outside a shell it sits here. -->
          <div class="flex flex-wrap items-center gap-x-3 gap-y-1">
            {#if shell}
              <p class="text-sm"><span class="text-ws-soft">Next run:</span> <span class="font-semibold">{a.label}</span>{#if a.passes < a.need}<span class="text-ws-soft">, {a.reason}</span>{/if}<span class="text-ws-soft">.</span></p>
            {:else}
              <button type="button" class="{bigPrimary} max-sm:w-full" onclick={goNext}>{NEXT_VERB[a.kind]} {a.label}</button>
              {#if a.passes < a.need}<span class="text-sm text-ws-soft">{a.reason[0].toUpperCase()}{a.reason.slice(1)}.</span>{/if}
            {/if}
          </div>
        {:else}
          <!-- After a pass the reason says how many more; after a miss the pips already say it. -->
          <p class="text-sm"><span class="text-ws-soft">Next run:</span> <span class="font-semibold">same again</span>{#if pass || a.kind === "top"}<span class="text-ws-soft">, {a.reason}</span>{/if}<span class="text-ws-soft">.</span></p>
        {/if}
      </div>
    {:else if summary.next}
      <p class="text-sm">
        <span class="text-ws-soft">Next up:</span>
        <a class="font-semibold text-instr-ink underline-offset-4 hover:underline" href={summary.next.href}>{summary.next.label}</a>
        {#if summary.next.reason}<span class="text-ws-soft">, {summary.next.reason}</span>{/if}
      </p>
    {/if}

    {#if breakdown}
      <!-- 4. The breakdown: where the notes landed, then the drill's rows. A word and a glyph on every
           line, so colour is never the only cue; a row from too little evidence says Not measured and why. -->
      <div class="flex min-w-0 flex-col gap-5 lg:col-start-2 lg:row-span-4 lg:row-start-1">
        {#if timingRows.length}
          <dl class="grid gap-2" aria-label="Timing">
            {#each timingRows as r (r.label)}
              <div class="grid grid-cols-[1.25rem_4.5rem_1fr_2.75rem] items-center gap-2 text-sm">
                <r.icon class="size-4 {r.ink}" strokeWidth={3} aria-hidden="true" />
                <dt class="font-medium">{r.label}</dt>
                <div class="h-2.5 rounded-full bg-ws-raised" aria-hidden="true">
                  <div class="ws-fill h-full rounded-full {r.fill}" style:width="{filled && total ? (r.n / total) * 100 : 0}%"></div>
                </div>
                <dd class="tnum rounded-full py-0.5 text-center font-semibold {r.n ? r.pill : 'bg-ws-raised text-ws-soft'}">{r.n}</dd>
              </div>
            {/each}
          </dl>
        {/if}
        {#if rows.length}
          <dl class="grid gap-x-6 gap-y-3 {timingRows.length ? '' : 'sm:grid-cols-2'}">
            {#each rows as row (row.label)}
              <div class="min-w-0">
                <div class="flex items-baseline justify-between gap-3 text-sm">
                  <dt class="text-ws-soft">{row.label}</dt>
                  {#if row.notMeasured}
                    <dd class="text-right font-medium">Not measured{row.text ? `: ${row.text}` : ""}</dd>
                  {:else}
                    <dd class="tnum text-right font-semibold">{row.text ?? `${Math.round((row.value ?? 0) * 100)}%`}</dd>
                  {/if}
                </div>
                {#if row.notMeasured}
                  <div class="mt-1 h-1.5 rounded-full border border-dashed border-ws-soft/50"></div>
                {:else if row.value != null}
                  <div class="mt-1 h-1.5 rounded-full bg-ws-raised">
                    <div class="ws-fill h-full rounded-full {toneClass[gradeTone(row.value)]}" style:width="{filled ? Math.max(2, row.value * 100) : 0}%"></div>
                  </div>
                {/if}
              </div>
            {/each}
          </dl>
        {/if}
      </div>
    {/if}

    <!-- 5. One status line: what the run counts toward, XP from 70%, and the trend from three runs. -->
    {#if status || showXp || trend.length >= 3}
      <div class="flex min-w-0 flex-wrap items-end justify-between gap-x-6 gap-y-3 border-t border-ws-line pt-4">
        <p class="max-w-prose text-sm text-ws-soft">
          {#if status}{status}{/if}{#if showXp}<span class="ml-1 whitespace-nowrap font-semibold text-ws-ink">+{summary.xp} XP</span>{/if}
        </p>
        {#if trend.length >= 3}
          <figure class="flex flex-col gap-1">
            <div class="flex items-center gap-2 text-sm">
              <span class="tnum text-ws-soft" aria-hidden="true">{pctOf(trend[0])}</span>
              <svg
                class="overflow-visible text-instr-ink"
                width={SPARK.w}
                height={SPARK.h}
                viewBox="0 0 {SPARK.w} {SPARK.h}"
                role="img"
                aria-label="Your last {trend.length} runs with this setup: {trend.map(pctOf).join(', ')}"
              >
                <line x1="0" x2={SPARK.w} y1={SPARK.h} y2={SPARK.h} class="stroke-ws-line" stroke-width="1" />
                <polyline points={spark.map((p) => p.join(",")).join(" ")} fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round" stroke-linecap="round" opacity="0.8" />
                {#each spark as [x, y], i (i)}<circle cx={x} cy={y} r={i === spark.length - 1 ? 4.5 : 2.5} fill={i === spark.length - 1 ? "currentColor" : "var(--ws-surface)"} stroke="currentColor" stroke-width="1.5" />{/each}
              </svg>
              <span class="tnum font-semibold" aria-hidden="true">{pctOf(trend[trend.length - 1])}</span>
            </div>
            <figcaption class="text-sm text-ws-soft" aria-hidden="true">Last {trend.length} runs with this setup</figcaption>
          </figure>
        {/if}
      </div>
    {/if}

    {#if actions || summary.routine}
      <div class="flex flex-wrap gap-2 lg:col-span-2">
        {#if actions}{@render actions()}{/if}
        {#if summary.routine}<a href={summary.routine.href} class={btnPrimary}>{summary.routine.label}</a>{/if}
      </div>
    {/if}
  </div>
</article>
{/if}

<style>
  .confetti {
    position: absolute;
    opacity: 0.9;
    transform: rotate(var(--r));
    animation: confetti-fall 700ms cubic-bezier(0.22, 1, 0.36, 1) both;
  }
  @keyframes confetti-fall {
    from {
      transform: translateY(-1.75rem) rotate(calc(var(--r) - 120deg));
      opacity: 0;
    }
  }
  @media (prefers-reduced-motion: reduce) {
    .confetti {
      animation: none;
    }
  }
</style>
