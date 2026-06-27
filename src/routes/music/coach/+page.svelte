<script lang="ts">
  import { browser } from "$app/environment";

  import { AnalyticsEngine } from "@repo/music-core/engines/analytics";
  import { buildPracticeCoachView, type PracticeCoachView } from "@repo/music-core/engines/coach";
  import { ProgressEngine } from "@repo/music-core/engines/progress";
  import { PracticeSessionStore } from "@repo/music-core/engines/sessions";
  import { seedCoreSkills, SkillGraphStore } from "@repo/music-core/engines/skills";
  import { PracticeStore } from "@repo/music-core/engines/store";
  import { Button } from "@repo/ui/button";
  import * as Card from "@repo/ui/card";
  import Sparkles from "lucide-svelte/icons/sparkles";

  import PracticeScreen from "../_components/PracticeScreen.svelte";
  import PracticeScreenHeader from "../_components/PracticeScreenHeader.svelte";

  const store = browser ? new PracticeStore() : undefined;
  const skills = new SkillGraphStore(store);
  const analytics = new AnalyticsEngine(store);
  const progress = new ProgressEngine(store);
  const sessions = new PracticeSessionStore(store);

  let status = $state("Building coach plan.");
  let coach = $state<PracticeCoachView | undefined>();

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
      status = "Coach ready.";
    } catch (error) {
      status = error instanceof Error ? error.message : "Coach could not be prepared.";
    }
  }
</script>

<svelte:head>
  <title>Practice Coach | Musicianship OS</title>
  <meta
    name="description"
    content="A local practice coach that turns your skill graph, analytics, and practice history into a focused routine."
  />
</svelte:head>

<PracticeScreen>
  <PracticeScreenHeader
    title="Practice Coach"
    subtitle="Local recommendations from your skill graph, weak spots, streaks, and practice history."
  />

  {#if !coach}
    <Card.Root>
      <Card.Content class="py-6 text-sm text-muted-foreground">{status}</Card.Content>
    </Card.Root>
  {:else}
    <Card.Root class="overflow-hidden">
      <Card.Header>
        <Card.Description class="flex items-center gap-2">
          <Sparkles class="size-4" aria-hidden="true" />
          Adaptive plan
        </Card.Description>
        <Card.Title class="text-2xl">{coach.headline}</Card.Title>
        <Card.Description>{coach.summary}</Card.Description>
      </Card.Header>
      <Card.Content class="grid gap-4 lg:grid-cols-[minmax(0,1fr)_18rem]">
        <section class="grid gap-3" aria-label="Coach routine">
          {#each coach.routine as step, index (step.id)}
            <div class="flex gap-3 rounded-md border p-4">
              <span class="grid size-8 shrink-0 place-items-center rounded-full bg-muted text-sm font-bold">
                {index + 1}
              </span>
              <div class="min-w-0 flex-1">
                <h2 class="font-semibold">{step.label}</h2>
                <p class="text-sm text-muted-foreground">{step.description}</p>
              </div>
              <Button href={step.href} variant="outline" size="sm">Open</Button>
            </div>
          {/each}
        </section>

        <aside class="grid content-start gap-3">
          <Card.Root>
            <Card.Header>
              <Card.Description>Why this plan</Card.Description>
              <Card.Title class="text-base">Signals</Card.Title>
            </Card.Header>
            <Card.Content class="grid gap-2 text-sm text-muted-foreground">
              {#each coach.insights as insight}
                <p>{insight}</p>
              {/each}
            </Card.Content>
          </Card.Root>
          <Button href={coach.primaryAction.href}>{coach.primaryAction.label}</Button>
          <Button href="/music/routine" variant="outline">Start daily routine</Button>
        </aside>
      </Card.Content>
    </Card.Root>
  {/if}
</PracticeScreen>
