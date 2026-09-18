<script lang="ts">
  import { INSTRUMENT_LABELS, type InstrumentId } from "@repo/music-core/domain";
  import type { ChallengeBoard } from "@repo/music-core/engines/challenges";
  import type { PracticeJournalView } from "@repo/music-core/engines/dashboard";
  import * as Card from "@repo/ui/card";
  import { Progress } from "@repo/ui/progress";

  import HudTile from "../../_components/HudTile.svelte";
  import SectionHeading from "../../_components/SectionHeading.svelte";
  import StreakCalendar from "../../_components/StreakCalendar.svelte";
  import WeekBars from "../../_components/WeekBars.svelte";

  // "Sessions": the honest record. What was practised, with how much
  // assistance, and whether the same recorded setup improved.
  let {
    journal,
    practisedDays,
    practicePoints,
    level,
    challenges,
    achievements,
  }: {
    journal: PracticeJournalView;
    practisedDays: ReadonlySet<string>;
    practicePoints: number;
    level: number;
    challenges: ChallengeBoard;
    achievements: string[];
  } = $props();

  function challengePercent(progressValue: number, target: number): number {
    if (target <= 0) return 100;
    return Math.min(100, Math.round((progressValue / target) * 100));
  }

  const DAY_LABELS = ["M", "T", "W", "T", "F", "S", "S"];

  const week = $derived(
    journal.week.map((day, index) => ({
      label: DAY_LABELS[(new Date(day.at).getDay() + 6) % 7]!,
      value: day.minutes,
      today: index === journal.week.length - 1,
    })),
  );
  const weekMinutes = $derived(journal.week.reduce((sum, day) => sum + day.minutes, 0));
  // The chart covers seven days; the journal below it covers a fortnight, so the
  // two totals never share a heading.
  const fortnight = $derived(
    journal.totalMinutes >= 60
      ? `${Math.floor(journal.totalMinutes / 60)} h ${String(journal.totalMinutes % 60).padStart(2, "0")}`
      : `${journal.totalMinutes} min`,
  );

  function dayLabel(at: number): string {
    const days = Math.round(
      (startOfDay(Date.now()) - startOfDay(at)) / 86_400_000,
    );
    if (days === 0) return "Today";
    if (days === 1) return "Yesterday";
    return new Date(at).toLocaleDateString("en", { weekday: "long" });
  }

  function dayDate(at: number): string {
    return new Date(at).toLocaleDateString("en", { day: "numeric", month: "short" });
  }

  function startOfDay(at: number): number {
    const date = new Date(at);
    return new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
  }

  function instrumentLabel(instrument?: InstrumentId): string {
    return instrument ? INSTRUMENT_LABELS[instrument] : "Unknown instrument";
  }
</script>

<section class="grid gap-6 lg:grid-cols-[minmax(0,1fr)_20rem]" aria-label="Practice sessions">
  <div class="grid content-start gap-4">
    <Card.Root class="grid gap-3 p-4">
      <SectionHeading title="This week" eyebrow="{weekMinutes} minutes practised" />
      <WeekBars days={week} unit="minutes" />
    </Card.Root>

    <Card.Root class="grid gap-4 p-4">
      <SectionHeading
        title="Journal"
        eyebrow="Last 14 days · {journal.sessionCount} session{journal.sessionCount === 1
          ? ''
          : 's'} · {fortnight}"
      />
      {#if journal.days.length === 0}
        <p class="text-sm text-muted-foreground">
          No sessions in the last fortnight. A saved run lands here with its setup.
        </p>
      {:else}
        <div class="grid gap-4">
          {#each journal.days as day (day.day)}
            <div class="grid gap-2 sm:grid-cols-[6rem_minmax(0,1fr)] sm:gap-4">
              <p class="text-sm font-semibold">
                {dayLabel(day.at)}
                <span class="block text-xs font-medium text-muted-foreground">
                  {dayDate(day.at)} · {day.minutes} min
                </span>
              </p>
              <ul class="grid gap-2">
                {#each day.runs as run (run.id)}
                  <li class="grid grid-cols-[minmax(0,1fr)_auto] gap-x-3 gap-y-1 rounded-xl border bg-card p-3">
                    <p class="min-w-0 truncate text-sm font-semibold">{run.title}</p>
                    <p class="text-right font-mono text-sm tabular-nums">
                      {#if run.deltaPercent === undefined}
                        <span class="text-muted-foreground">—</span>
                      {:else if run.deltaPercent > 0}
                        <span class="text-success">▲ +{run.deltaPercent}%</span>
                      {:else if run.deltaPercent < 0}
                        <span class="text-warn">▼ {run.deltaPercent}%</span>
                      {:else}
                        <span class="text-muted-foreground">Even</span>
                      {/if}
                    </p>
                    <p class="col-span-2 text-xs text-muted-foreground">
                      {instrumentLabel(run.instrument)} · {run.minutes} min ·
                      <span class="font-mono text-foreground">{run.accuracyPercent}%</span>
                      over {run.attempts} attempt{run.attempts === 1 ? "" : "s"}
                    </p>
                    {#if run.assistance.length > 0}
                      <div class="col-span-2 flex flex-wrap gap-1.5">
                        {#each run.assistance as tag (tag)}
                          <span
                            class={[
                              "rounded-full border px-2 py-0.5 text-xs font-semibold",
                              tag === "unaided"
                                ? "border-success/60 text-success"
                                : "border-warn/60 text-warn",
                            ]}
                          >
                            {tag}
                          </span>
                        {/each}
                      </div>
                    {/if}
                    {#if run.note}
                      <p class="col-span-2 text-xs text-muted-foreground">{run.note}</p>
                    {/if}
                  </li>
                {/each}
              </ul>
            </div>
          {/each}
        </div>
      {/if}
    </Card.Root>

    <div class="grid gap-3">
      <SectionHeading
        title="Daily challenges"
        eyebrow="Personal practice goals · this week {challenges.weeklySummary.xp} XP · {challenges
          .weeklySummary.sessions} sessions · {challenges.weeklySummary
          .completedChallenges} challenges today"
        level={3}
      />
      <div class="grid gap-2 md:grid-cols-2">
        {#each challenges.daily as challenge (challenge.id)}
          <a class="grid gap-2 rounded-xl border bg-card p-3 hover:bg-accent/40" href={challenge.href}>
            <div class="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p class="text-sm font-medium">{challenge.title}</p>
                <p class="text-xs text-muted-foreground">{challenge.description}</p>
              </div>
              <span
                class={[
                  "rounded-full border px-2 py-0.5 text-xs",
                  challenge.complete
                    ? "border-success bg-success text-success-foreground"
                    : "text-muted-foreground",
                ]}
              >
                {challenge.complete ? "done" : "open"}
              </span>
            </div>
            <Progress value={challengePercent(challenge.progress, challenge.target)} max={100} />
            <div
              class="flex flex-wrap items-center justify-between gap-2 font-mono text-[11px] text-muted-foreground"
            >
              <span>{challenge.progress}/{challenge.target}</span>
              <span>{challenge.reason}</span>
            </div>
          </a>
        {/each}
      </div>
    </div>
  </div>

  <aside class="grid content-start gap-4">
    <HudTile label="Practice points" value={practicePoints} unit="XP" />
    <p class="-mt-2 text-xs text-muted-foreground">
      Level {level}. Points measure participation, not mastery.
    </p>

    <Card.Root class="p-4">
      <SectionHeading title="Streak calendar" level={3} class="mb-3" />
      <StreakCalendar practised={practisedDays} />
    </Card.Root>

    <Card.Root class="grid gap-2 p-4">
      <SectionHeading title="Same setup, later visit" level={3} />
      <p class="text-sm text-muted-foreground">
        A delta appears only when a later run matches the earlier one on variant, tempo, input and
        assistance. Anything else is left blank rather than compared.
      </p>
    </Card.Root>

    <Card.Root class="p-4">
      <SectionHeading title="Achievements" eyebrow="{achievements.length} unlocked" level={3} class="mb-3" />
      {#if achievements.length === 0}
        <p class="text-sm text-muted-foreground">No achievements unlocked yet.</p>
      {:else}
        <ul class="grid gap-2 text-sm">
          {#each achievements as achievement (achievement)}
            <li class="flex items-center gap-2">
              <span class="text-success" aria-hidden="true">✓</span>{achievement}
            </li>
          {/each}
        </ul>
      {/if}
    </Card.Root>

    {#if journal.nextTime}
      <div class="grid gap-1 rounded-xl bg-muted p-3 text-sm">
        <span class="font-semibold">Next time (from {dayLabel(journal.nextTime.at)})</span>
        <span class="text-muted-foreground">{journal.nextTime.text}</span>
      </div>
    {/if}
  </aside>
</section>
