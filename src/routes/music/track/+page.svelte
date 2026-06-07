<script lang="ts">
  import { browser } from "$app/environment";

  import { unixMs, type InstrumentId, type PracticeSession } from "@repo/music-core/domain";
  import {
    buildJournalHeatmap,
    summarizeFocusAreas,
    type FocusArea,
    type HeatmapCell,
  } from "@repo/music-core/engines/projection";
  import {
    PracticeSessionStore,
    type WeekComparison,
  } from "@repo/music-core/engines/sessions";
  import { PracticeStore } from "@repo/music-core/engines/store";
  import { Button } from "@repo/ui/button";
  import * as Card from "@repo/ui/card";
  import { Input } from "@repo/ui/input";
  import { Label } from "@repo/ui/label";

  import PracticeScreen from "../_components/PracticeScreen.svelte";
  import PracticeScreenHeader from "../_components/PracticeScreenHeader.svelte";

  const store = browser ? new PracticeStore() : undefined;
  const journal = new PracticeSessionStore(store);

  let ready = $state(false);
  let pending = $state(false);
  let status = $state("Loading practice journal.");
  let sessions = $state<PracticeSession[]>([]);
  let comparison = $state<WeekComparison>(journal.compareWeeks(unixMs(Date.now())));
  let heatmap = $state<HeatmapCell[][]>([]);
  let focusAreas = $state<FocusArea[]>([]);
  let note = $state("");

  const routineSteps = [
    { label: "Warm-up · long tones", meta: "Technique", href: "/music/play/scales" },
    { label: "Ear training", meta: "Listening", href: "/music/learn/ear" },
    { label: "Rhythm lock", meta: "Timing", href: "/music/learn/rhythm" },
    { label: "Jazz voicings", meta: "Harmony", href: "/music/learn/theory" },
  ];
  const weeklySessionGoal = 5;
  let tagText = $state("journal");
  let filterSkill = $state("");
  let filterInstrument = $state("");
  let filterStart = $state("");
  let filterEnd = $state("");

  const filteredSessions = $derived(
    sessions.filter((session) =>
      matchesFilters(session, {
        ...(filterSkill.trim() ? { skillId: filterSkill.trim() } : {}),
        ...(filterInstrument.trim() ? { instrument: filterInstrument.trim() as InstrumentId } : {}),
        ...(filterStart ? { start: unixMs(Date.parse(`${filterStart}T00:00:00.000Z`)) } : {}),
        ...(filterEnd ? { end: unixMs(Date.parse(`${filterEnd}T23:59:59.999Z`)) } : {}),
      }),
    ),
  );

  void initialize();

  async function initialize(): Promise<void> {
    try {
      await journal.load();
      refresh();
      ready = true;
      status = sessions.length === 0 ? "No practice sessions recorded yet." : "Journal loaded.";
    } catch (error) {
      status = message(error, "Practice journal could not be loaded.");
    }
  }

  async function saveJournalEntry(): Promise<void> {
    if (!ready || pending || note.trim().length === 0) return;
    pending = true;
    status = "";

    try {
      const now = unixMs(Date.now());
      const session = journal.start({
        id: `journal-${now}`,
        source: "free-practice",
        startedAt: now,
        tags: tags(),
      });
      journal.finish(session.id, now, 0, note.trim());
      await journal.flush();
      note = "";
      refresh();
      status = "Journal entry saved.";
    } catch (error) {
      status = message(error, "Journal entry could not be saved.");
    } finally {
      pending = false;
    }
  }

  function refresh(): void {
    sessions = journal.all().sort((a, b) => b.startTime - a.startTime);
    comparison = journal.compareWeeks(unixMs(Date.now()));
    heatmap = buildJournalHeatmap(journal.all(), new Date());
    focusAreas = summarizeFocusAreas(journal.all());
  }

  const HEATMAP_INTENSITY = [
    "bg-muted",
    "bg-primary/25",
    "bg-primary/50",
    "bg-primary/75",
    "bg-primary",
  ] as const;

  function tags(): string[] {
    return tagText
      .split(",")
      .map((tag) => tag.trim())
      .filter(Boolean);
  }

  function formatDate(value: number): string {
    return new Date(value).toLocaleDateString(undefined, {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  }

  function message(error: unknown, fallback: string): string {
    return error instanceof Error ? error.message : fallback;
  }

  function matchesFilters(
    session: PracticeSession,
    options: {
      skillId?: string;
      instrument?: InstrumentId;
      start?: number;
      end?: number;
    },
  ): boolean {
    if (
      options.skillId &&
      !session.scoringEvents.some((event) => event.skillIds.includes(options.skillId!)) &&
      !session.runs.some((run) => run.targetSkillIds.includes(options.skillId!))
    ) {
      return false;
    }
    if (options.instrument && session.instrument !== options.instrument) return false;
    if (options.start !== undefined && session.startTime < options.start) return false;
    if (options.end !== undefined && session.startTime > options.end) return false;
    return true;
  }
</script>

<svelte:head>
  <title>Practice Journal | Musicianship OS</title>
  <meta
    name="description"
    content="Review practice sessions, journal notes, weekly progress, and session history."
  />
</svelte:head>

<PracticeScreen>
  <PracticeScreenHeader
    title="Practice Journal"
    subtitle="What you practiced, what you're learning, and tomorrow's routine — in one place."
  />

  <section class="grid gap-4 md:grid-cols-3" aria-label="Practice rollups">
    <Card.Root>
      <Card.Header>
        <Card.Description>This week</Card.Description>
        <Card.Title>{comparison.thisWeek.xp} XP</Card.Title>
      </Card.Header>
      <Card.Content class="text-sm text-muted-foreground">
        {comparison.thisWeek.sessionCount} sessions · {comparison.thisWeek.attempts} attempts
      </Card.Content>
    </Card.Root>
    <Card.Root>
      <Card.Header>
        <Card.Description>Last week</Card.Description>
        <Card.Title>{comparison.lastWeek.xp} XP</Card.Title>
      </Card.Header>
      <Card.Content class="text-sm text-muted-foreground">
        {comparison.lastWeek.sessionCount} sessions · {comparison.lastWeek.attempts} attempts
      </Card.Content>
    </Card.Root>
    <Card.Root>
      <Card.Header>
        <Card.Description>Week delta</Card.Description>
        <Card.Title>{comparison.delta.xp >= 0 ? "+" : ""}{comparison.delta.xp} XP</Card.Title>
      </Card.Header>
      <Card.Content class="text-sm text-muted-foreground">
        {comparison.delta.attempts >= 0 ? "+" : ""}{comparison.delta.attempts} attempts
      </Card.Content>
    </Card.Root>
  </section>

  <Card.Root aria-label="Practice heatmap">
    <Card.Header>
      <Card.Description>Last 12 weeks</Card.Description>
      <Card.Title>Practice heatmap</Card.Title>
    </Card.Header>
    <Card.Content>
      <div class="flex gap-1 overflow-x-auto pb-1">
        {#each heatmap as week, weekIndex}
          <div class="flex flex-col gap-1" data-week={weekIndex}>
            {#each week as cell}
              <div
                class="size-3.5 rounded-sm {HEATMAP_INTENSITY[cell.intensity]}"
                data-intensity={cell.intensity}
                title="{cell.date}: {cell.minutes} min"
              ></div>
            {/each}
          </div>
        {/each}
      </div>
      <div class="mt-3 flex items-center gap-2 text-xs text-muted-foreground">
        <span>Less</span>
        {#each HEATMAP_INTENSITY as cls}
          <span class="size-3 rounded-sm {cls}"></span>
        {/each}
        <span>More</span>
      </div>
    </Card.Content>
  </Card.Root>

  <section class="grid gap-6 lg:grid-cols-[minmax(0,22rem)_1fr]">
    <Card.Root>
      <Card.Header>
        <Card.Description>Journal note</Card.Description>
        <Card.Title>Record practice</Card.Title>
      </Card.Header>
      <Card.Content class="grid gap-4">
        <div class="grid gap-2">
          <Label for="journal-note">Journal note</Label>
          <textarea
            id="journal-note"
            aria-label="Journal note"
            class="min-h-28 rounded-md border border-input bg-background px-3 py-2 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50"
            bind:value={note}
            placeholder="What did you practice? What needs attention next time?"
          ></textarea>
        </div>
        <div class="grid gap-2">
          <Label for="journal-tags">Tags</Label>
          <Input id="journal-tags" aria-label="Tags" bind:value={tagText} />
        </div>
      </Card.Content>
      <Card.Footer class="grid gap-3">
        <Button type="button" disabled={!ready || pending || note.trim().length === 0} onclick={saveJournalEntry}>
          {pending ? "Saving..." : "Save journal entry"}
        </Button>
        <p class="text-sm text-muted-foreground" aria-live="polite">{status}</p>
      </Card.Footer>
    </Card.Root>

    <div class="grid gap-4">
      <Card.Root>
        <Card.Header>
          <Card.Description>Query views</Card.Description>
          <Card.Title>Filter sessions</Card.Title>
        </Card.Header>
        <Card.Content class="grid gap-4 md:grid-cols-4">
          <div class="grid gap-2">
            <Label for="filter-skill">Skill</Label>
            <Input id="filter-skill" aria-label="Skill filter" bind:value={filterSkill} />
          </div>
          <div class="grid gap-2">
            <Label for="filter-instrument">Instrument</Label>
            <Input
              id="filter-instrument"
              aria-label="Instrument filter"
              bind:value={filterInstrument}
            />
          </div>
          <div class="grid gap-2">
            <Label for="filter-start">Start date</Label>
            <Input id="filter-start" aria-label="Start date" type="date" bind:value={filterStart} />
          </div>
          <div class="grid gap-2">
            <Label for="filter-end">End date</Label>
            <Input id="filter-end" aria-label="End date" type="date" bind:value={filterEnd} />
          </div>
        </Card.Content>
      </Card.Root>

      <section class="grid gap-3" aria-label="Session history">
        <div class="flex items-center justify-between gap-3">
          <h2 class="text-2xl font-semibold tracking-tight">Sessions</h2>
          <p class="text-sm text-muted-foreground">{filteredSessions.length} shown</p>
        </div>

        {#if filteredSessions.length === 0}
          <Card.Root>
            <Card.Content class="py-6 text-sm text-muted-foreground">
              No sessions match the current filters.
            </Card.Content>
          </Card.Root>
        {:else}
          {#each filteredSessions as session (session.id)}
            <Card.Root>
              <Card.Header>
                <Card.Description>
                  {formatDate(session.startTime)} · {session.source}
                </Card.Description>
                <Card.Title>{session.xpEarned} XP · {session.scoringEvents.length} attempts</Card.Title>
              </Card.Header>
              <Card.Content class="grid gap-2 text-sm text-muted-foreground">
                {#if session.notes}
                  <p>{session.notes}</p>
                {/if}
                {#if session.tags.length > 0}
                  <p>Tags: {session.tags.join(", ")}</p>
                {/if}
                {#if session.instrument}
                  <p>Instrument: {session.instrument}</p>
                {/if}
              </Card.Content>
            </Card.Root>
          {/each}
        {/if}
      </section>
    </div>
  </section>

  <section class="grid gap-6 lg:grid-cols-3" aria-label="Routine, focus, and goals">
    <!-- Today's routine -->
    <Card.Root>
      <Card.Header class="flex-row items-center justify-between gap-2">
        <Card.Description>Today's routine</Card.Description>
        <span class="rounded-full bg-primary/10 px-2.5 py-0.5 text-xs font-semibold text-primary">
          {routineSteps.length} steps
        </span>
      </Card.Header>
      <Card.Content class="grid gap-2">
        {#each routineSteps as step, index}
          <a
            href={step.href}
            class="flex items-center gap-3 rounded-xl border p-3 transition-colors hover:bg-muted"
          >
            <span class="grid size-7 shrink-0 place-items-center rounded-full bg-muted text-xs font-bold tabular-nums">
              {index + 1}
            </span>
            <span class="min-w-0 flex-1">
              <span class="block truncate text-sm font-semibold">{step.label}</span>
              <span class="text-xs text-muted-foreground">{step.meta}</span>
            </span>
          </a>
        {/each}
      </Card.Content>
    </Card.Root>

    <!-- Focus areas (real, from session tags) -->
    <Card.Root>
      <Card.Header>
        <Card.Description>Focus areas</Card.Description>
        <Card.Title>What you're working on</Card.Title>
      </Card.Header>
      <Card.Content class="grid gap-3">
        {#if focusAreas.length === 0}
          <p class="text-sm text-muted-foreground">
            Tag your sessions to build up focus areas here.
          </p>
        {:else}
          {#each focusAreas as area}
            <div class="grid gap-1">
              <div class="flex items-center justify-between gap-3 text-sm">
                <span class="truncate font-medium">{area.tag}</span>
                <span class="text-xs text-muted-foreground">
                  {area.sessionCount} session{area.sessionCount === 1 ? "" : "s"}
                </span>
              </div>
              <div class="h-1.5 overflow-hidden rounded-full bg-muted">
                <div
                  class="h-full rounded-full bg-primary"
                  style="width:{Math.min(100, area.sessionCount * 20)}%"
                ></div>
              </div>
            </div>
          {/each}
        {/if}
      </Card.Content>
    </Card.Root>

    <!-- Goals (real, from week comparison + streak) -->
    <Card.Root>
      <Card.Header>
        <Card.Description>Goals</Card.Description>
        <Card.Title>Weekly targets</Card.Title>
      </Card.Header>
      <Card.Content class="grid gap-4">
        <div class="grid gap-1">
          <div class="flex items-center justify-between gap-3 text-sm">
            <span class="font-medium">Practice {weeklySessionGoal}× / week</span>
            <span class="font-semibold tabular-nums text-primary">
              {Math.min(comparison.thisWeek.sessionCount, weeklySessionGoal)}/{weeklySessionGoal}
            </span>
          </div>
          <div class="h-1.5 overflow-hidden rounded-full bg-muted">
            <div
              class="h-full rounded-full bg-primary"
              style="width:{Math.min(100, (comparison.thisWeek.sessionCount / weeklySessionGoal) * 100)}%"
            ></div>
          </div>
        </div>
        <div class="grid gap-1">
          <div class="flex items-center justify-between gap-3 text-sm">
            <span class="font-medium">XP this week</span>
            <span class="font-semibold tabular-nums">{comparison.thisWeek.xp}</span>
          </div>
          <p class="text-xs text-muted-foreground">
            {comparison.delta.xp >= 0 ? "+" : ""}{comparison.delta.xp} vs last week
          </p>
        </div>
      </Card.Content>
    </Card.Root>
  </section>
</PracticeScreen>
