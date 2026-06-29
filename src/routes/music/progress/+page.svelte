<script lang="ts">
  import { browser } from "$app/environment";

  import { AnalyticsEngine } from "@repo/music-core/engines/analytics";
  import {
    buildChallengeBoard,
    type ChallengeBoard,
  } from "@repo/music-core/engines/challenges";
  import {
    buildDashboardView,
    buildSkillTreeView,
    type DashboardView,
    type SkillTreeView,
  } from "@repo/music-core/engines/dashboard";
  import { ProgressEngine } from "@repo/music-core/engines/progress";
  import { PracticeSessionStore } from "@repo/music-core/engines/sessions";
  import { seedCoreSkills, SkillGraphStore } from "@repo/music-core/engines/skills";
  import { PracticeStore } from "@repo/music-core/engines/store";
  import { Button } from "@repo/ui/button";
  import * as Card from "@repo/ui/card";
  import { Progress } from "@repo/ui/progress";

  import PracticeScreen from "../_components/PracticeScreen.svelte";
  import PracticeScreenHeader from "../_components/PracticeScreenHeader.svelte";
  import ProgressRing from "../_components/ProgressRing.svelte";
  import SkillRing from "../_components/SkillRing.svelte";
  import SkillTreeGraph from "../_components/SkillTreeGraph.svelte";
  import WeekDots from "../_components/WeekDots.svelte";

  const store = browser ? new PracticeStore() : undefined;
  const skills = new SkillGraphStore(store);
  const analytics = new AnalyticsEngine(store);
  const progress = new ProgressEngine(store);
  const sessions = new PracticeSessionStore(store);

  let ready = $state(false);
  let status = $state("Loading progress.");
  let dashboard = $state<DashboardView | undefined>();
  let skillTree = $state<SkillTreeView | undefined>();
  let challenges = $state<ChallengeBoard | undefined>();

  const weekDots = $derived.by(() => {
    const last7 = (dashboard?.streakCalendar ?? []).slice(-7);
    return {
      completedDays: last7.flatMap((day, index) => (day.practiced ? [index] : [])),
      todayIndex: last7.length - 1,
    };
  });
  const capabilityNodes = $derived(
    Object.entries(skillTree?.capabilitySummary ?? {}).map(([capability, summary]) => ({
      label: capability,
      percent: summary.averageMastery,
    })),
  );
  const capabilityRoot = $derived({
    label: "Musicality",
    percent:
      capabilityNodes.length > 0
        ? Math.round(
            capabilityNodes.reduce((total, node) => total + node.percent, 0) /
              capabilityNodes.length,
          )
        : 0,
  });

  void initialize();

  async function initialize(): Promise<void> {
    try {
      await Promise.all([
        skills.seed(seedCoreSkills()),
        analytics.load(),
        progress.load(),
        sessions.load(),
      ]);
      refresh();
      ready = true;
      status = "Progress loaded.";
    } catch (error) {
      status = error instanceof Error ? error.message : "Progress could not be loaded.";
    }
  }

  function refresh(): void {
    dashboard = buildDashboardView({
      progressState: progress.state,
      sessions: sessions.all(),
      skills,
      analytics,
    });
    skillTree = buildSkillTreeView({ skills, analytics });
    challenges = buildChallengeBoard({
      progressState: progress.state,
      sessions: sessions.all(),
      skills,
      analytics,
    });
  }

  function challengePercent(progressValue: number, target: number): number {
    if (target <= 0) return 100;
    return Math.min(100, Math.round((progressValue / target) * 100));
  }
</script>

<svelte:head>
  <title>Dashboard & Skill Tree | Musicianship OS</title>
  <meta
    name="description"
    content="Review practice dashboard, skill mastery, weak spots, achievements, and streak history."
  />
</svelte:head>

<PracticeScreen>
  <PracticeScreenHeader
    title="Dashboard & Skill Tree"
    subtitle="Daily XP, streaks, skill mastery, weak spots, and practice-next picks from your real practice history."
  />


  {#if !dashboard || !skillTree || !challenges}
    <Card.Root>
      <Card.Content class="py-6 text-sm text-muted-foreground">{status}</Card.Content>
    </Card.Root>
  {:else}
    <section class="grid gap-4 md:grid-cols-4" aria-label="Dashboard">
      <Card.Root class="flex flex-col items-center gap-3 p-5">
        <span class="w-full eyebrow"
          >Today's XP</span
        >
        <ProgressRing value={dashboard.todayXp} total={dashboard.todayGoalXp} label="Today's XP" size={132} gradient />
        <span class="text-xs text-muted-foreground">Daily goal</span>
      </Card.Root>
      <Card.Root class="flex flex-col items-center gap-2 p-5">
        <span class="w-full eyebrow"
          >Streak</span
        >
        <div class="text-3xl" aria-hidden="true">🔥</div>
        <span class="text-3xl font-bold leading-none tabular-nums">{dashboard.streakDays}</span>
        <span class="eyebrow">days</span>
        <WeekDots completedDays={weekDots.completedDays} todayIndex={weekDots.todayIndex} />
      </Card.Root>
      <Card.Root class="flex flex-col justify-center gap-1 p-5">
        <span class="eyebrow">Level</span>
        <span class="text-4xl font-bold tabular-nums">{dashboard.level}</span>
        <span class="text-xs text-muted-foreground">Across all instruments</span>
      </Card.Root>
      <Card.Root class="flex flex-col gap-2 p-5">
        <span class="eyebrow"
          >Practice next</span
        >
        <span class="text-lg font-bold leading-tight">{dashboard.dailyChallenge.skillName}</span>
        <Button class="mt-auto" href={dashboard.continuePractice.href} variant="outline">
          {dashboard.continuePractice.label}
        </Button>
      </Card.Root>
    </section>

    {#if capabilityNodes.length > 0}
      <Card.Root>
        <Card.Header>
          <Card.Description>Skill tree</Card.Description>
          <Card.Title>Capability overview</Card.Title>
        </Card.Header>
        <Card.Content>
          <SkillTreeGraph root={capabilityRoot} nodes={capabilityNodes} height={240} />
        </Card.Content>
      </Card.Root>
    {/if}

    <section class="grid gap-6 lg:grid-cols-[minmax(0,1fr)_22rem]">
      <div class="grid gap-6">
        <Card.Root>
          <Card.Header>
            <Card.Description>Daily challenge</Card.Description>
            <Card.Title>{dashboard.dailyChallenge.label}</Card.Title>
          </Card.Header>
          <Card.Content class="text-sm text-muted-foreground">
            {dashboard.dailyChallenge.reason === "weak-spot"
              ? "Chosen from your weakest analytics signal."
              : "Chosen from currently unlocked skills."}
          </Card.Content>
          <Card.Footer>
            <Button href={dashboard.dailyChallenge.href}>Start challenge</Button>
          </Card.Footer>
        </Card.Root>

        <Card.Root>
          <Card.Header>
            <Card.Description>Personal practice goals</Card.Description>
            <Card.Title>Daily challenges</Card.Title>
          </Card.Header>
          <Card.Content class="grid gap-3 md:grid-cols-2">
            {#each challenges.daily as challenge (challenge.id)}
              <a class="grid gap-3 rounded-md border p-3 hover:bg-accent/50" href={challenge.href}>
                <div class="flex items-start justify-between gap-3">
                  <div>
                    <p class="text-sm font-medium">{challenge.title}</p>
                    <p class="text-xs text-muted-foreground">{challenge.description}</p>
                  </div>
                  <span
                    class={[
                      "rounded-full border px-2 py-0.5 text-xs",
                      challenge.complete
                        ? "border-primary bg-primary text-primary-foreground"
                        : "text-muted-foreground",
                    ]}
                  >
                    {challenge.complete ? "done" : "open"}
                  </span>
                </div>
                <Progress value={challengePercent(challenge.progress, challenge.target)} max={100} />
                <div class="flex items-center justify-between gap-2 text-xs text-muted-foreground">
                  <span>{challenge.progress}/{challenge.target}</span>
                  <span>{challenge.reason}</span>
                </div>
              </a>
            {/each}
          </Card.Content>
          <Card.Footer class="flex flex-wrap gap-3 text-sm text-muted-foreground">
            <span class="font-medium text-foreground">This week</span>
            <span>{challenges.weeklySummary.xp} XP</span>
            <span>{challenges.weeklySummary.sessions} sessions</span>
            <span>{challenges.weeklySummary.completedChallenges} challenges today</span>
          </Card.Footer>
        </Card.Root>

        <Card.Root>
          <Card.Header>
            <Card.Description>Skill Tree</Card.Description>
            <Card.Title>Mastery rings</Card.Title>
          </Card.Header>
          <Card.Content class="grid gap-4">
            <div class="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
              {#each skillTree.nodes as node (node.id)}
                <div class="grid gap-2 rounded-md border p-3">
                  <div class="flex items-start justify-between gap-3">
                    <div>
                      <p class="text-sm font-medium">{node.name}</p>
                      <p class="text-xs text-muted-foreground">{node.capability}</p>
                    </div>
                    <span
                      class="rounded-full border px-2 py-0.5 text-xs"
                      class:text-muted-foreground={!node.unlocked}
                    >
                      {node.unlocked ? "unlocked" : "locked"}
                    </span>
                  </div>
                  <Progress value={node.masteryPercent} max={100} />
                  <div class="flex items-center justify-between gap-2 text-xs text-muted-foreground">
                    <span>{node.masteryPercent}% mastery</span>
                    <span>{node.confidencePercent}% confidence</span>
                  </div>
                  {#if node.weakSpot}
                    <a class="text-sm font-medium text-foreground underline-offset-4 hover:underline" href={node.practiceHref}>
                      Practice weak spot
                    </a>
                  {/if}
                </div>
              {/each}
            </div>
          </Card.Content>
        </Card.Root>
      </div>

      <aside class="grid content-start gap-4">
        <Card.Root>
          <Card.Header>
            <Card.Description>Weak spots</Card.Description>
            <Card.Title>Practice next</Card.Title>
          </Card.Header>
          <Card.Content class="grid gap-3">
            {#if skillTree.practiceNext.length === 0}
              <p class="text-sm text-muted-foreground">
                No weak spots yet. Complete a few exercises to populate analytics.
              </p>
            {:else}
              {#each skillTree.practiceNext.slice(0, 5) as pick}
                <a class="grid gap-1 rounded-md border p-3 hover:bg-accent/50" href={pick.href}>
                  <span class="text-sm font-medium">{pick.skillName}</span>
                  <span class="text-xs text-muted-foreground">
                    {Math.round(pick.accuracy * 100)}% accuracy · {pick.attempts} attempts
                  </span>
                </a>
              {/each}
            {/if}
          </Card.Content>
        </Card.Root>

        <Card.Root>
          <Card.Header>
            <Card.Description>Capability summary</Card.Description>
            <Card.Title>Coverage</Card.Title>
          </Card.Header>
          <Card.Content class="flex flex-wrap justify-center gap-4">
            {#each Object.entries(skillTree.capabilitySummary) as [capability, summary]}
              <SkillRing percent={summary.averageMastery} label={capability} />
            {/each}
          </Card.Content>
        </Card.Root>

        <Card.Root>
          <Card.Header>
            <Card.Description>Achievements</Card.Description>
            <Card.Title>{dashboard.achievements.length}</Card.Title>
          </Card.Header>
          <Card.Content>
            {#if dashboard.achievements.length === 0}
              <p class="text-sm text-muted-foreground">No achievements unlocked yet.</p>
            {:else}
              <ul class="grid gap-2 text-sm text-muted-foreground">
                {#each dashboard.achievements as achievement}
                  <li>{achievement}</li>
                {/each}
              </ul>
            {/if}
          </Card.Content>
        </Card.Root>

        <Card.Root>
          <Card.Header>
            <Card.Description>Streak calendar</Card.Description>
            <Card.Title>Last 14 days</Card.Title>
          </Card.Header>
          <Card.Content class="grid grid-cols-7 gap-2">
            {#each dashboard.streakCalendar as day}
              <span
                class="grid aspect-square place-items-center rounded-md border text-[0.65rem]"
                class:bg-primary={day.practiced}
                class:text-primary-foreground={day.practiced}
                class:bg-muted={day.frozen && !day.practiced}
                title={day.day}
              >
                {day.day.slice(8)}
              </span>
            {/each}
          </Card.Content>
        </Card.Root>

        <Card.Root>
          <Card.Header>
            <Card.Description>Recent instruments</Card.Description>
            <Card.Title>{dashboard.recentInstruments.length}</Card.Title>
          </Card.Header>
          <Card.Content class="text-sm text-muted-foreground">
            {dashboard.recentInstruments.length > 0
              ? dashboard.recentInstruments.join(", ")
              : "No instrument history yet."}
          </Card.Content>
        </Card.Root>
      </aside>
    </section>
  {/if}
</PracticeScreen>
