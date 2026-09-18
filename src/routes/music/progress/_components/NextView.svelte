<script lang="ts">
  import type { DashboardRoutineItem, SkillDriftView } from "@repo/music-core/engines/dashboard";
  import { Button } from "@repo/ui/button";
  import * as Card from "@repo/ui/card";

  import PracticeStage from "../../_components/PracticeStage.svelte";
  import SectionHeading from "../../_components/SectionHeading.svelte";
  import SegmentedControl from "../../_components/SegmentedControl.svelte";

  // "What next": one paragraph of reasoning, the time budget, the routine as a
  // numbered list, and the three verdict lists. Nothing here is a grade of the
  // player; the wording under five unaided attempts is an invitation only.
  let {
    drift,
    routine,
    instrumentLabel,
    startHref,
    budgetMinutes,
    onBudget,
  }: {
    drift: SkillDriftView;
    routine: DashboardRoutineItem[];
    instrumentLabel: string;
    startHref: string;
    budgetMinutes: number;
    onBudget: (minutes: number) => void;
  } = $props();

  const BUDGETS = [10, 20, 30];
  const LIST_LIMIT = 5;
</script>

<section class="grid gap-4" aria-label="What to practise next">
  <PracticeStage class="grid items-center gap-4 p-5 sm:grid-cols-[minmax(0,1fr)_auto]">
    <div class="min-w-0">
      <p class="eyebrow text-stage-muted">Practise next · {instrumentLabel}</p>
      <h2 class="font-display text-2xl font-semibold tracking-tight">{drift.headline}</h2>
      <p class="mt-1 max-w-[60ch] text-sm text-stage-muted">{drift.reason}</p>
    </div>
    <Button href={startHref} class="min-h-11 w-full sm:w-auto">Start this plan</Button>
  </PracticeStage>

  <div class="flex flex-wrap items-center gap-x-3 gap-y-2">
    <span class="eyebrow">Time today</span>
    <SegmentedControl
      ariaLabel="Minutes available"
      options={BUDGETS.map((minutes) => ({ value: String(minutes), label: String(minutes) }))}
      value={String(budgetMinutes)}
      onChange={(value) => onBudget(Number(value))}
    />
    <span class="text-xs text-muted-foreground">Estimates. The plan may end early.</span>
  </div>

  {#if routine.length > 0}
    <ol class="grid gap-2" aria-label="Today's routine">
      {#each routine as step, index (step.href)}
        <li
          class="grid grid-cols-[2.5rem_minmax(0,1fr)] items-center gap-x-3 gap-y-2 rounded-xl border bg-card p-3 sm:grid-cols-[2.5rem_minmax(0,1fr)_auto]"
        >
          <span
            class="grid size-10 place-items-center rounded-full bg-muted font-display font-bold tabular-nums"
            aria-hidden="true">{index + 1}</span
          >
          <div class="min-w-0">
            <p class="font-semibold">{step.label}</p>
            <p class="text-xs text-muted-foreground">{step.description}</p>
          </div>
          <div class="col-span-2 flex items-center justify-between gap-3 sm:col-span-1 sm:justify-end">
            <span class="font-mono text-sm text-muted-foreground">~{step.minutes} min</span>
            <Button href={step.href} variant="outline" class="min-h-11">Open</Button>
          </div>
        </li>
      {/each}
    </ol>
  {/if}

  <div class="grid gap-3 md:grid-cols-3">
    <Card.Root class="grid content-start gap-3 p-4">
      <SectionHeading title="Falling" level={3} />
      {#if drift.falling.length === 0}
        <p class="text-sm text-muted-foreground">Nothing has dropped ten points.</p>
      {:else}
        <ul class="grid gap-1.5 text-sm">
          {#each drift.falling.slice(0, LIST_LIMIT) as row (row.skillId)}
            <li class="flex items-baseline justify-between gap-3">
              <a class="min-w-0 truncate underline-offset-4 hover:underline" href={row.href}>
                {row.name}
              </a>
              <span class="shrink-0 font-mono text-xs text-muted-foreground">
                −{row.dropPercent} points
              </span>
            </li>
          {/each}
        </ul>
        {#if drift.falling.length > LIST_LIMIT}
          <p class="text-xs text-muted-foreground">
            {drift.falling.length - LIST_LIMIT} more are falling.
          </p>
        {/if}
      {/if}
    </Card.Root>

    <Card.Root class="grid content-start gap-3 p-4">
      <SectionHeading title="Holding" level={3} />
      {#if drift.holding.length === 0}
        <p class="text-sm text-muted-foreground">No skill has five unaided attempts yet.</p>
      {:else}
        <ul class="grid gap-1.5 text-sm">
          {#each drift.holding.slice(0, LIST_LIMIT) as row (row.skillId)}
            <li class="flex items-baseline justify-between gap-3">
              <a class="min-w-0 truncate underline-offset-4 hover:underline" href={row.href}>
                {row.name}
              </a>
              <span class="shrink-0 font-mono text-xs text-muted-foreground">
                {row.estimatePercent}%, stable
              </span>
            </li>
          {/each}
        </ul>
        {#if drift.holding.length > LIST_LIMIT}
          <p class="text-xs text-muted-foreground">
            {drift.holding.length - LIST_LIMIT} more are holding.
          </p>
        {/if}
      {/if}
    </Card.Root>

    <Card.Root class="grid content-start gap-3 p-4">
      <SectionHeading title="Not measured yet" level={3} />
      <ul class="grid gap-1.5 text-sm">
        {#each drift.unmeasured.slice(0, LIST_LIMIT) as row (row.skillId)}
          <li class="flex items-baseline justify-between gap-3">
            <a class="min-w-0 truncate underline-offset-4 hover:underline" href={row.href}>
              {row.name}
            </a>
            <span class="shrink-0 font-mono text-xs text-muted-foreground">
              {row.attempts} attempt{row.attempts === 1 ? "" : "s"}
            </span>
          </li>
        {/each}
      </ul>
      {#if drift.unmeasured.length > LIST_LIMIT}
        <p class="text-xs text-muted-foreground">
          {drift.unmeasured.length - LIST_LIMIT} more have not been measured.
        </p>
      {/if}
      <p class="text-xs text-muted-foreground">
        Fewer than five unaided attempts: no verdict, only an invitation.
      </p>
    </Card.Root>
  </div>
</section>
