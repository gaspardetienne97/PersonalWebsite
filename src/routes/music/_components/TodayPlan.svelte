<script lang="ts">
  import { browser } from "$app/environment";

  import { AnalyticsEngine } from "@repo/music-core/engines/analytics";
  import { buildPracticeCoachView, type PracticeCoachView } from "@repo/music-core/engines/coach";
  import type { DailyRoutineStep } from "@repo/music-core/engines/daily-routine";
  import { ProgressEngine } from "@repo/music-core/engines/progress";
  import { PracticeSessionStore } from "@repo/music-core/engines/sessions";
  import { seedCoreSkills, SkillGraphStore } from "@repo/music-core/engines/skills";
  import { PracticeStore } from "@repo/music-core/engines/store";
  import { Badge } from "@repo/ui/badge";
  import { Button } from "@repo/ui/button";
  import * as Card from "@repo/ui/card";
  import Check from "lucide-svelte/icons/check";
  import Circle from "lucide-svelte/icons/circle";
  import Clock3 from "lucide-svelte/icons/clock-3";
  import Play from "lucide-svelte/icons/play";
  import Sparkles from "lucide-svelte/icons/sparkles";

  import { useMusicRuntime } from "../_runtime.svelte";
  import ProgressRing from "./ProgressRing.svelte";
  import SegmentProgress from "./SegmentProgress.svelte";

  const runtime = useMusicRuntime();
  const store = browser ? new PracticeStore() : undefined;
  const skills = new SkillGraphStore(store);
  const analytics = new AnalyticsEngine(store);
  const progress = new ProgressEngine(store);
  const sessions = new PracticeSessionStore(store);

  let ready = $state(false);
  let status = $state("Building today's plan.");
  let coach = $state<PracticeCoachView | undefined>();
  const routine = $derived(runtime.dailyRoutine);
  const plan = $derived(coach?.routine ?? []);
  const visibleSteps = $derived(routine?.steps ?? plan);
  const completedCount = $derived(
    routine?.steps.filter((step) => step.status === "completed").length ?? 0,
  );

  void initialize();

  async function initialize(): Promise<void> {
    try {
      await Promise.all([
        skills.seed(seedCoreSkills()),
        analytics.load(),
        progress.load(),
        sessions.load(),
      ]);
      coach = buildPracticeCoachView({
        skills,
        analytics,
        progressState: progress.state,
        sessions: sessions.all(),
      });
      ready = true;
      status = "Today's plan is ready.";
    } catch (error) {
      status = error instanceof Error ? error.message : "Today's plan could not be prepared.";
    }
  }

  function startRoutine(): void {
    if (plan.length === 0) return;
    runtime.startDailyRoutine(plan);
  }

  function restartRoutine(): void {
    if (plan.length === 0) return;
    runtime.resetDailyRoutine();
    runtime.startDailyRoutine(plan);
  }

  function routineHref(step: DailyRoutineStep): string {
    return `${step.href}?routine=1`;
  }

  function formatDuration(durationMs: number): string {
    const minutes = Math.max(1, Math.round(durationMs / 60_000));
    return `${minutes} min`;
  }
</script>

{#if routine?.status === "summary" && routine.summary}
  <Card.Root class="overflow-hidden">
    <Card.Header class="items-center text-center">
      <Badge variant="secondary">Routine complete</Badge>
      <Card.Title class="text-2xl">Today's work is logged</Card.Title>
      <Card.Description>
        Every drill was combined into one daily-routine journal entry.
      </Card.Description>
    </Card.Header>
    <Card.Content class="grid gap-4 sm:grid-cols-3">
      <div class="grid justify-items-center gap-2 rounded-md border p-4">
        <ProgressRing
          value={Math.round(routine.summary.accuracy * 100)}
          total={100}
          label="Accuracy"
          size={112}
        />
        <span class="text-sm font-medium">Accuracy</span>
      </div>
      <div class="grid place-content-center gap-1 rounded-md border p-4 text-center">
        <span class="text-3xl font-bold tabular-nums">{routine.summary.totalXp}</span>
        <span class="text-sm text-muted-foreground">XP earned</span>
      </div>
      <div class="grid place-content-center gap-1 rounded-md border p-4 text-center">
        <span class="text-3xl font-bold tabular-nums">
          {formatDuration(routine.summary.durationMs)}
        </span>
        <span class="text-sm text-muted-foreground">Practice time</span>
      </div>
    </Card.Content>
    <Card.Footer class="flex flex-wrap justify-center gap-2">
      <Button onclick={restartRoutine}>Repeat routine</Button>
      <Button href="/music/progress?tab=journal" variant="outline">Open journal</Button>
    </Card.Footer>
  </Card.Root>
{:else}
  <section class="grid gap-4 lg:grid-cols-[minmax(0,1fr)_20rem]" aria-label="Today's plan">
    <div class="grid content-start gap-4">
      {#if routine?.status === "active"}
        <Card.Root>
          <Card.Header>
            <SegmentProgress
              total={routine.steps.length}
              current={completedCount}
              label="Daily routine"
            />
          </Card.Header>
          <Card.Content class="grid gap-2">
            <span class="text-xs font-bold uppercase tracking-widest text-muted-foreground">
              {completedCount === 0 ? "Up first" : "Up next"}
            </span>
            <h2 class="text-2xl font-bold">{routine.currentStep?.label}</h2>
            <p class="text-sm text-muted-foreground">{routine.currentStep?.description}</p>
          </Card.Content>
          <Card.Footer>
            {#if routine.currentStep}
              <Button href={routineHref(routine.currentStep)}>
                <Play class="size-4" aria-hidden="true" />
                Start {routine.currentStep.label}
              </Button>
            {/if}
          </Card.Footer>
        </Card.Root>
      {:else}
        <Card.Root>
          <Card.Header>
            <Card.Description class="flex items-center gap-2">
              <Sparkles class="size-4" aria-hidden="true" />
              Adaptive plan
            </Card.Description>
            <Card.Title class="text-2xl">
              {coach?.headline ?? "A balanced session, ordered for today"}
            </Card.Title>
            <Card.Description>
              {coach?.summary ??
                "A focused pass through the drills that target your weakest spots."}
            </Card.Description>
          </Card.Header>
          <Card.Content class="flex items-center gap-2 text-sm text-muted-foreground">
            <Clock3 class="size-4" aria-hidden="true" />
            Results are logged only after the full routine is complete.
          </Card.Content>
          <Card.Footer class="flex flex-wrap items-center gap-3">
            <Button disabled={!ready} onclick={startRoutine}>
              <Play class="size-4" aria-hidden="true" />
              Start routine
            </Button>
            <span class="text-sm text-muted-foreground" role="status">{status}</span>
          </Card.Footer>
        </Card.Root>
      {/if}

      <section class="grid gap-3" aria-label="Routine steps">
        {#each visibleSteps as step, index (step.id)}
          <Card.Root class={step.status === "active" ? "border-primary/50" : ""}>
            <Card.Content class="flex items-start gap-4 py-4">
              <span
                class="grid size-8 shrink-0 place-items-center rounded-full border text-sm font-bold"
                class:bg-primary={step.status === "completed"}
                class:text-primary-foreground={step.status === "completed"}
              >
                {#if step.status === "completed"}
                  <Check class="size-4" aria-hidden="true" />
                {:else if step.status === "active" && routine?.status === "active"}
                  <Play class="size-4" aria-hidden="true" />
                {:else}
                  <Circle class="size-3" aria-hidden="true" />
                {/if}
              </span>
              <div class="min-w-0 flex-1">
                <div class="flex flex-wrap items-center justify-between gap-2">
                  <h2 class="font-semibold">{index + 1}. {step.label}</h2>
                  <span class="text-xs text-muted-foreground">~5 min</span>
                </div>
                <p class="mt-1 text-sm text-muted-foreground">{step.description}</p>
              </div>
            </Card.Content>
          </Card.Root>
        {/each}
      </section>
    </div>

    <aside class="grid content-start gap-3">
      <Card.Root>
        <Card.Header>
          <Card.Description>Why this plan</Card.Description>
          <Card.Title class="text-base">Signals</Card.Title>
        </Card.Header>
        <Card.Content class="grid gap-2 text-sm text-muted-foreground">
          {#if coach}
            {#each coach.insights as insight}
              <p>{insight}</p>
            {/each}
          {:else}
            <p>{status}</p>
          {/if}
        </Card.Content>
      </Card.Root>
      {#if coach?.primaryAction.href && coach.primaryAction.href !== "/music/routine"}
        <Button href={coach.primaryAction.href} variant="outline">{coach.primaryAction.label}</Button>
      {/if}
    </aside>
  </section>
{/if}
