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

  import InstrumentBadge from "../_components/InstrumentBadge.svelte";
  import PracticeScreen from "../_components/PracticeScreen.svelte";
  import PracticeScreenHeader from "../_components/PracticeScreenHeader.svelte";
  import PracticeStage from "../_components/PracticeStage.svelte";
  import ProgressRing from "../_components/ProgressRing.svelte";
  import SectionHeading from "../_components/SectionHeading.svelte";
  import SkillTreeGraph from "../_components/SkillTreeGraph.svelte";
  import StreakCalendar from "../_components/StreakCalendar.svelte";
  import WeekBars from "../_components/WeekBars.svelte";
  import WeekDots from "../_components/WeekDots.svelte";

  let showAllNodes = $state(false);

  const store = browser ? new PracticeStore() : undefined;
  const skills = new SkillGraphStore(store);
  const analytics = new AnalyticsEngine(store);
  const progress = new ProgressEngine(store);
  const sessions = new PracticeSessionStore(store);

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
  // XP per day for the last seven days and the days practised, from the journal.
  const DAY_LABELS = ["M", "T", "W", "T", "F", "S", "S"];
  const isoDay = (at: number) => {
    const date = new Date(at);
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
  };
  const weekBars = $derived.by(() => {
    void dashboard;
    const today = new Date();
    return Array.from({ length: 7 }, (_, offset) => {
      const date = new Date(today);
      date.setDate(today.getDate() - (6 - offset));
      const day = isoDay(date.getTime());
      const xp = sessions
        .all()
        .filter((session) => isoDay(session.endTime ?? session.startTime) === day)
        .reduce((sum, session) => sum + session.xpEarned, 0);
      return { label: DAY_LABELS[(date.getDay() + 6) % 7]!, xp, today: offset === 6 };
    });
  });
  const practisedDays = $derived.by(() => {
    void dashboard;
    return new Set(sessions.all().map((session) => isoDay(session.endTime ?? session.startTime)));
  });
  // Weak spots and the daily challenge as one list of actions.
  const practiseNext = $derived.by(() => {
    const picks = (skillTree?.practiceNext ?? []).slice(0, 5).map((pick) => ({
      id: pick.skillId,
      title: pick.skillName,
      detail: `${Math.round(pick.accuracy * 100)}% accuracy · ${pick.attempts} attempts`,
      href: pick.href,
      kind: "weak" as const,
    }));
    const challenge = dashboard?.dailyChallenge;
    return challenge
      ? [
          {
            id: `challenge-${challenge.skillId}`,
            title: challenge.label,
            detail:
              challenge.reason === "weak-spot"
                ? "Today's challenge · from your weakest signal"
                : "Today's challenge · from unlocked skills",
            href: challenge.href,
            kind: "challenge" as const,
          },
          ...picks.filter((pick) => pick.id !== challenge.skillId),
        ]
      : picks;
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
  <title>Progress | Practice OS</title>
  <meta
    name="description"
    content="Today, this week and the skills behind them: XP, streak, weak spots and mastery from your real practice."
  />
</svelte:head>

<PracticeScreen>
  <PracticeScreenHeader
    title="Progress"
    subtitle="Today, this week, and the skills behind them, from your real practice."
  >
    {#snippet controls()}
      {#if dashboard}
        <Button href={dashboard.continuePractice.href}>
          Practise next: {dashboard.dailyChallenge.skillName}
        </Button>
      {/if}
    {/snippet}
  </PracticeScreenHeader>

  {#if !dashboard || !skillTree || !challenges}
    <Card.Root>
      <Card.Content class="py-6 text-sm text-muted-foreground">{status}</Card.Content>
    </Card.Root>
  {:else}
    <!-- Hero: today's ring, the streak, the week. -->
    <section class="grid gap-4 md:grid-cols-3" aria-label="Today and this week">
      <Card.Root class="flex items-center gap-4 p-5">
        <ProgressRing value={dashboard.todayXp} total={dashboard.todayGoalXp} label="Today's XP" size={108} gradient />
        <div class="grid gap-1">
          <span class="eyebrow">Today's XP</span>
          <span class="font-display text-xl font-semibold">Daily goal</span>
          <span class="text-xs text-muted-foreground">
            Level {dashboard.level} · {dashboard.todayXp} of {dashboard.todayGoalXp} XP
          </span>
        </div>
      </Card.Root>
      <Card.Root class="grid content-start gap-2 p-5">
        <span class="eyebrow">Streak</span>
        <div class="flex items-baseline gap-2">
          <span class="font-display text-4xl font-semibold leading-none tabular-nums">{dashboard.streakDays}</span>
          <span class="text-sm text-muted-foreground">day{dashboard.streakDays === 1 ? "" : "s"} in a row</span>
        </div>
        <WeekDots completedDays={weekDots.completedDays} todayIndex={weekDots.todayIndex} />
      </Card.Root>
      <Card.Root class="grid content-start gap-2 p-5">
        <span class="eyebrow">This week · {weekBars.reduce((sum, day) => sum + day.xp, 0)} XP</span>
        <WeekBars days={weekBars} />
      </Card.Root>
    </section>

    <section class="grid gap-6 lg:grid-cols-[minmax(0,1fr)_22rem]">
      <div class="grid gap-6">
        {#if capabilityNodes.length > 0}
          <PracticeStage class="p-4 sm:p-5">
            <p class="mb-2 eyebrow text-stage-muted">Skill map · capability coverage</p>
            <SkillTreeGraph root={capabilityRoot} nodes={capabilityNodes} height={240} />
          </PracticeStage>
        {/if}

        <div class="grid gap-3">
          <SectionHeading title="Practise next" eyebrow="Weak spots and today's challenge" />
          {#if practiseNext.length === 0}
            <p class="text-sm text-muted-foreground">
              No weak spots yet. Complete a few exercises to populate analytics.
            </p>
          {:else}
            <ul class="grid gap-2" aria-label="Practise next">
              {#each practiseNext as item (item.id)}
                <li>
                  <a
                    class="grid grid-cols-[0.375rem_minmax(0,1fr)_auto] items-center gap-3 rounded-xl border bg-card p-3 transition-colors hover:bg-accent/40"
                    href={item.href}
                  >
                    <span class="h-8 w-1.5 rounded-full {item.kind === 'challenge' ? 'bg-primary' : 'bg-warn'}" aria-hidden="true"></span>
                    <span class="grid min-w-0">
                      <span class="truncate text-sm font-semibold">{item.title}</span>
                      <span class="font-mono text-[11px] text-muted-foreground">{item.detail}</span>
                    </span>
                    <span class="text-sm font-medium text-primary">Practise</span>
                  </a>
                </li>
              {/each}
            </ul>
          {/if}
        </div>

        <div class="grid gap-3">
          <SectionHeading
            title="Daily challenges"
            eyebrow={`Personal practice goals · this week ${challenges.weeklySummary.xp} XP · ${challenges.weeklySummary.sessions} sessions · ${challenges.weeklySummary.completedChallenges} challenges today`}
          />
          <div class="grid gap-2 md:grid-cols-2">
            {#each challenges.daily as challenge (challenge.id)}
              <a class="grid gap-2 rounded-xl border bg-card p-3 hover:bg-accent/40" href={challenge.href}>
                <div class="flex items-start justify-between gap-3">
                  <div>
                    <p class="text-sm font-medium">{challenge.title}</p>
                    <p class="text-xs text-muted-foreground">{challenge.description}</p>
                  </div>
                  <span
                    class={[
                      "rounded-full border px-2 py-0.5 text-xs",
                      challenge.complete ? "border-success bg-success text-success-foreground" : "text-muted-foreground",
                    ]}
                  >
                    {challenge.complete ? "done" : "open"}
                  </span>
                </div>
                <Progress value={challengePercent(challenge.progress, challenge.target)} max={100} />
                <div class="flex items-center justify-between gap-2 font-mono text-[11px] text-muted-foreground">
                  <span>{challenge.progress}/{challenge.target}</span>
                  <span>{challenge.reason}</span>
                </div>
              </a>
            {/each}
          </div>
        </div>

        <div class="grid gap-3">
          <SectionHeading title="Mastery" eyebrow={`Skill tree · ${skillTree.nodes.length} skills`}>
            {#snippet action()}
              {#if skillTree && skillTree.nodes.length > 8}
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  aria-expanded={showAllNodes}
                  onclick={() => (showAllNodes = !showAllNodes)}
                >
                  {showAllNodes ? "Show fewer" : `Show all ${skillTree.nodes.length} skills`}
                </Button>
              {/if}
            {/snippet}
          </SectionHeading>
          <!-- Compact two-up on the phone, with the long tail behind Show all. -->
          <div class="grid grid-cols-2 gap-2 md:grid-cols-3 md:gap-3 xl:grid-cols-4">
            {#each showAllNodes ? skillTree.nodes : skillTree.nodes.slice(0, 8) as node (node.id)}
              <div class="grid gap-2 rounded-xl border bg-card p-2.5 sm:p-3">
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
                <div class="flex items-center justify-between gap-2 font-mono text-[11px] text-muted-foreground">
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
        </div>
      </div>

      <aside class="grid content-start gap-4">
        <Card.Root class="p-4">
          <SectionHeading title="Streak calendar" level={3} class="mb-3" />
          <StreakCalendar practised={practisedDays} />
        </Card.Root>

        <Card.Root class="p-4">
          <SectionHeading title="Recent instruments" level={3} class="mb-3" />
          {#if dashboard.recentInstruments.length === 0}
            <p class="text-sm text-muted-foreground">No instrument history yet.</p>
          {:else}
            <div class="flex flex-wrap gap-2">
              {#each dashboard.recentInstruments as instrument (instrument)}
                <InstrumentBadge {instrument} />
              {/each}
            </div>
          {/if}
        </Card.Root>

        <Card.Root class="p-4">
          <SectionHeading title="Achievements" eyebrow={`${dashboard.achievements.length} unlocked`} level={3} class="mb-3" />
          {#if dashboard.achievements.length === 0}
            <p class="text-sm text-muted-foreground">No achievements unlocked yet.</p>
          {:else}
            <ul class="grid gap-2 text-sm">
              {#each dashboard.achievements as achievement}
                <li class="flex items-center gap-2"><span class="text-success" aria-hidden="true">✓</span>{achievement}</li>
              {/each}
            </ul>
          {/if}
        </Card.Root>
      </aside>
    </section>
  {/if}
</PracticeScreen>
