<script lang="ts">
  import { browser } from "$app/environment";
  import { page } from "$app/stores";

  import { INSTRUMENT_LABELS, type InstrumentId } from "@repo/music-core/domain";
  import { AnalyticsEngine } from "@repo/music-core/engines/analytics";
  import {
    buildChallengeBoard,
    type ChallengeBoard,
  } from "@repo/music-core/engines/challenges";
  import {
    buildDashboardView,
    buildPracticeJournal,
    buildSkillDriftView,
    buildSkillTreeView,
    type DashboardView,
    type PracticeJournalView,
    type SkillDriftView,
    type SkillTreeView,
  } from "@repo/music-core/engines/dashboard";
  import { ProgressEngine } from "@repo/music-core/engines/progress";
  import { PracticeSessionStore } from "@repo/music-core/engines/sessions";
  import { seedCoreSkills, SkillGraphStore } from "@repo/music-core/engines/skills";
  import { PracticeStore } from "@repo/music-core/engines/store";
  import * as Card from "@repo/ui/card";

  import PracticeScreen from "../_components/PracticeScreen.svelte";
  import PracticeScreenHeader from "../_components/PracticeScreenHeader.svelte";
  import { readRouteTab, writeRouteTab } from "../_components/route-state";
  import SegmentedControl from "../_components/SegmentedControl.svelte";
  import WeekBars from "../_components/WeekBars.svelte";
  import WeekDots from "../_components/WeekDots.svelte";
  import NextView from "./_components/NextView.svelte";
  import SessionsView from "./_components/SessionsView.svelte";
  import SkillsView from "./_components/SkillsView.svelte";
  import { useMusicRuntime } from "../_runtime.svelte";

  const runtime = useMusicRuntime();
  let ready = $state(false);

  const store = browser ? new PracticeStore() : undefined;
  const skills = new SkillGraphStore(store);
  const analytics = new AnalyticsEngine(store);
  const progress = new ProgressEngine(store);
  const sessions = new PracticeSessionStore(store);

  let status = $state("Loading progress.");
  let dashboard = $state<DashboardView | undefined>();
  let skillTree = $state<SkillTreeView | undefined>();
  let drift = $state<SkillDriftView | undefined>();
  let journal = $state<PracticeJournalView | undefined>();
  let challenges = $state<ChallengeBoard | undefined>();

  // Progress answers three questions; the one on screen lives in the URL, so a
  // bookmark, a share and a back gesture all land on the same view.
  type ProgressView = "next" | "skills" | "sessions";
  const PROGRESS_VIEWS: ProgressView[] = ["next", "skills", "sessions"];
  const VIEW_OPTIONS = [
    { value: "next", label: "What next" },
    { value: "skills", label: "Skills" },
    { value: "sessions", label: "Sessions" },
  ];
  const SUBTITLES: Record<ProgressView, string> = {
    next: "What to play in the next few minutes, and why.",
    skills: "What is solid and what is stale, one row per skill.",
    sessions: "What you actually did, and whether the same setup improved.",
  };

  const initialSearch = typeof window === "undefined" ? "" : window.location.search;
  let view = $state<ProgressView>(readRouteTab(initialSearch, "view", PROGRESS_VIEWS, "next"));

  $effect(() => {
    // Shallow replaceState emits $page without changing its URL. Keep the
    // navigation dependency, but read the address bar's current query.
    const pageUrl = $page.url;
    const params = typeof window === "undefined" ? (pageUrl?.search ?? "") : window.location.search;
    view = readRouteTab(params, "view", PROGRESS_VIEWS, "next");
    // A view nobody can render should not be the link that gets shared on.
    const raw = new URLSearchParams(params).get("view");
    if (raw !== null && raw !== view) writeRouteTab("view", view);
  });

  function selectView(value: string): void {
    view = readRouteTab(new URLSearchParams({ view: value }), "view", PROGRESS_VIEWS, "next");
    writeRouteTab("view", view);
  }

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
      return { label: DAY_LABELS[(date.getDay() + 6) % 7]!, value: xp, today: offset === 6 };
    });
  });
  const practisedDays = $derived.by(() => {
    void dashboard;
    return new Set(sessions.all().map((session) => isoDay(session.endTime ?? session.startTime)));
  });
  // Skills reads every row, ordered by capability then name, like the tree.
  const skillRows = $derived(
    [...(drift?.falling ?? []), ...(drift?.holding ?? []), ...(drift?.unmeasured ?? [])].sort(
      (a, b) =>
        String(a.capability).localeCompare(String(b.capability)) || a.name.localeCompare(b.name),
    ),
  );
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
      ready = true;
      status = "Progress loaded.";
    } catch (error) {
      status = error instanceof Error ? error.message : "Progress could not be loaded.";
    }
  }

  function refresh(): void {
    const instrument = runtime.activeInstrument;
    const budgetMinutes = runtime.routineBudgetMinutes;
    dashboard = buildDashboardView({
      progressState: progress.state,
      sessions: sessions.all(),
      skills,
      analytics,
      instrument,
      budgetMinutes,
    });
    skillTree = buildSkillTreeView({ skills, analytics, instrument });
    drift = buildSkillDriftView({ skills, analytics, instrument, budgetMinutes });
    journal = buildPracticeJournal({ sessions: sessions.all(), instrument });
    challenges = buildChallengeBoard({
      progressState: progress.state,
      sessions: sessions.all(),
      skills,
      analytics,
      instrument,
    });
  }

  $effect(() => {
    if (ready) refresh();
  });
</script>

<svelte:head>
  <title>Progress | Practice OS</title>
  <meta
    name="description"
    content="What to practise next, how solid each skill is, and what you actually did: three views on your real practice."
  />
</svelte:head>

<PracticeScreen>
  <PracticeScreenHeader title="Progress" subtitle={SUBTITLES[view]}>
    {#snippet controls()}
      <SegmentedControl
        options={VIEW_OPTIONS}
        value={view}
        onChange={selectView}
        ariaLabel="Progress view"
      />
    {/snippet}
  </PracticeScreenHeader>

  <!-- The one live region for this route. -->
  <p class="sr-only" aria-live="polite">{status}</p>

  {#if !dashboard || !skillTree || !drift || !journal || !challenges}
    <Card.Root>
      <Card.Content class="py-6 text-sm text-muted-foreground">{status}</Card.Content>
    </Card.Root>
  {:else}
    <!-- The streak and the week stay put whichever view is open. -->
    <section class="grid gap-4 sm:grid-cols-2" aria-label="Streak and this week">
      <Card.Root class="grid content-start gap-2 p-5">
        <span class="eyebrow">Streak</span>
        <div class="flex items-baseline gap-2">
          <span class="font-display text-4xl font-semibold leading-none tabular-nums">
            {dashboard.streakDays}
          </span>
          <span class="text-sm text-muted-foreground">
            day{dashboard.streakDays === 1 ? "" : "s"} in a row
          </span>
        </div>
        <WeekDots completedDays={weekDots.completedDays} todayIndex={weekDots.todayIndex} />
      </Card.Root>
      <Card.Root class="grid content-start gap-2 p-5">
        <span class="eyebrow">This week · {weekBars.reduce((sum, day) => sum + day.value, 0)} XP</span>
        <WeekBars days={weekBars} />
      </Card.Root>
    </section>

    {#if view === "next"}
      <NextView
        {drift}
        routine={dashboard.todaysRoutine}
        instrumentLabel={INSTRUMENT_LABELS[runtime.activeInstrument]}
        startHref={dashboard.continuePractice.href}
        budgetMinutes={runtime.routineBudgetMinutes}
        onBudget={(minutes) => (runtime.routineBudgetMinutes = minutes)}
      />
    {:else if view === "skills"}
      <SkillsView
        rows={skillRows}
        instrument={runtime.activeInstrument}
        onInstrument={(instrument: InstrumentId) => runtime.setActiveInstrument(instrument)}
        {capabilityRoot}
        {capabilityNodes}
      />
    {:else}
      <SessionsView
        {journal}
        {practisedDays}
        practicePoints={progress.state.xp}
        level={dashboard.level}
        {challenges}
        achievements={dashboard.achievements}
      />
    {/if}
  {/if}
</PracticeScreen>
