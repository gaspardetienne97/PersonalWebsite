<script lang="ts">
  import { browser } from "$app/environment";

  import { AnalyticsEngine } from "@repo/music-core/engines/analytics";
  import { buildSkillTreeView } from "@repo/music-core/engines/dashboard";
  import {
    buildDailyRoutinePlan,
    type DailyRoutineStep,
  } from "@repo/music-core/engines/daily-routine";
  import { seedCoreSkills, SkillGraphStore } from "@repo/music-core/engines/skills";
  import { PracticeStore } from "@repo/music-core/engines/store";
  import { Badge } from "@repo/ui/badge";
  import { Button } from "@repo/ui/button";
  import * as Card from "@repo/ui/card";
  import Check from "lucide-svelte/icons/check";
  import Circle from "lucide-svelte/icons/circle";
  import Clock3 from "lucide-svelte/icons/clock-3";
  import Play from "lucide-svelte/icons/play";

  import PracticeScreen from "../_components/PracticeScreen.svelte";
  import PracticeScreenHeader from "../_components/PracticeScreenHeader.svelte";
  import ProgressRing from "../_components/ProgressRing.svelte";
  import SegmentProgress from "../_components/SegmentProgress.svelte";
  import { useMusicRuntime } from "../_runtime.svelte";

  const runtime = useMusicRuntime();
  const store = browser ? new PracticeStore() : undefined;
  const skills = new SkillGraphStore(store);
  const analytics = new AnalyticsEngine(store);

  let ready = $state(false);
  let status = $state("Building today's routine.");
  let plan = $state<DailyRoutineStep[]>(buildDailyRoutinePlan([]));
  const routine = $derived(runtime.dailyRoutine);
  const completedCount = $derived(
    routine?.steps.filter((step) => step.status === "completed").length ?? 0,
  );

  void initialize();

  async function initialize(): Promise<void> {
    try {
      await Promise.all([skills.seed(seedCoreSkills()), analytics.load()]);
      const recommendations = buildSkillTreeView({ skills, analytics }).practiceNext;
      plan = buildDailyRoutinePlan(recommendations);
      ready = true;
      status = "Routine ready.";
    } catch (error) {
      status = error instanceof Error ? error.message : "The routine could not be prepared.";
    }
  }

  function startRoutine(): void {
    runtime.startDailyRoutine(plan);
  }

  function restartRoutine(): void {
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

<svelte:head>
  <title>Daily Routine | Musicianship OS</title>
  <meta
    name="description"
    content="Run a focused daily practice routine built from your current musicianship priorities."
  />
</svelte:head>

<PracticeScreen>
  <PracticeScreenHeader
    title="Daily Routine"
    subtitle="One focused pass through ear training, reading, rhythm, and technique."
  />

  {#if routine?.status === "summary" && routine.summary}
    <Card.Root class="overflow-hidden">
      <Card.Header class="items-center text-center">
        <Badge variant="secondary">Routine complete</Badge>
        <Card.Title class="text-2xl">Today's work is logged</Card.Title>
        <Card.Description>
          All four drills were combined into one daily-routine journal entry.
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
        <Button href="/music/track" variant="outline">Open journal</Button>
      </Card.Footer>
    </Card.Root>
  {:else}
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
          <Card.Description>About 20 minutes</Card.Description>
          <Card.Title>A balanced session, ordered for today</Card.Title>
        </Card.Header>
        <Card.Content class="flex items-center gap-2 text-sm text-muted-foreground">
          <Clock3 class="size-4" aria-hidden="true" />
          Results are logged only after the full routine is complete.
        </Card.Content>
        <Card.Footer>
          <Button disabled={!ready} onclick={startRoutine}>
            <Play class="size-4" aria-hidden="true" />
            Start routine
          </Button>
          <span class="text-sm text-muted-foreground" role="status">{status}</span>
        </Card.Footer>
      </Card.Root>
    {/if}

    <section class="grid gap-3" aria-label="Routine steps">
      {#each routine?.steps ?? plan as step, index (step.id)}
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
  {/if}
</PracticeScreen>
