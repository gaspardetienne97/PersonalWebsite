<script lang="ts">
  // On What next: the streak as a week calendar, and this week's practice time as seven
  // day bars against a labelled scale, drawn from the first day so it reads as a chart.
  import { computeStreak, dayKey, freezesEarned, practicedDays } from "@repo/music-core/progress/rewards";
  import { practice } from "../../practice.svelte";
  import { settings } from "../../runtime";
  import { weekRollups } from "@repo/music-core/progress/journal";
  import { minutesText, weekMinutes } from "./model";
  import StreakWeek from "./StreakWeek.svelte";

  const today = $derived(dayKey(Date.now()));
  const days = $derived(practicedDays(practice.sessions));
  const streak = $derived(computeStreak(days, settings.value.frozenDays, today));
  const freezes = $derived(freezesEarned(days, settings.value.frozenDays));
  const week = $derived(weekMinutes(practice.sessions, today));
  // Same rounding as the journal rollup, so both pages agree.
  const thisWeek = $derived(weekRollups(practice.sessions, today).thisWeek);
  // The scale's top: the busiest day rounded up to a round number, so the line reads as minutes.
  const scale = $derived.by(() => {
    const max = Math.max(1, ...week.map((d) => d.minutes));
    const step = max <= 10 ? 5 : max <= 30 ? 10 : max <= 60 ? 15 : 30;
    return Math.ceil(max / step) * step;
  });

  const LETTER = ["M", "T", "W", "T", "F", "S", "S"];
  const weekday = (d: string) =>
    new Date(`${d}T00:00:00Z`).toLocaleDateString(undefined, { weekday: "long", timeZone: "UTC" });
  const letter = (d: string) => LETTER[(new Date(`${d}T00:00:00Z`).getUTCDay() + 6) % 7];
</script>

<section
  aria-label="Streak and this week"
  class="grid gap-5 rounded-3xl border border-ws-line bg-ws-surface p-4 sm:grid-cols-2 sm:p-5"
>
  <StreakWeek week={streak.week} current={streak.current} longest={streak.longest} {freezes} />

  <div class="min-w-0 sm:border-l sm:border-ws-line sm:pl-5">
    <h2 class="font-display text-xl font-semibold">
      This week: <span class="tnum">{minutesText(thisWeek.minutes, thisWeek.sessions)}</span>
    </h2>
    <p class="text-sm text-ws-soft">Minutes practised each day, Monday to Sunday.</p>
    <div class="mt-3 flex max-w-sm gap-2">
      <!-- The scale: its top and zero, so a bar's height means something. -->
      <div class="tnum flex h-20 shrink-0 flex-col justify-between text-right text-xs text-ws-soft" aria-hidden="true">
        <span class="-mt-1.5">{scale} min</span><span class="-mb-1.5">0</span>
      </div>
      <ol class="relative flex min-w-0 flex-1 gap-1.5">
        <span class="pointer-events-none absolute inset-x-0 top-0 border-t border-dashed border-ws-line" aria-hidden="true"></span>
        {#each week as d (d.day)}
          {@const h = d.minutes ? Math.max(8, (d.minutes / scale) * 100) : 4}
          <li class="flex min-w-0 flex-1 flex-col items-center gap-1">
            <div class="relative h-20 w-full" aria-hidden="true">
              <span
                class="absolute inset-x-0 bottom-0 rounded-md {d.future
                  ? 'border border-dashed border-ws-line'
                  : d.minutes
                    ? 'bg-instr'
                    : 'bg-ws-raised'} {d.today ? 'ring-2 ring-instr-ink ring-offset-1 ring-offset-ws-surface' : ''}"
                style:height="{h}%"
              ></span>
            </div>
            <span class="text-xs {d.today ? 'font-semibold text-ws-ink' : 'text-ws-soft'}" aria-hidden="true">{letter(d.day)}</span>
            <span class="tnum text-xs {d.today ? 'font-semibold text-ws-ink' : 'text-ws-soft'}" aria-hidden="true">{d.future ? "" : d.minutes}</span>
            <span class="sr-only">{weekday(d.day)}{d.today ? " (today)" : ""}: {d.future ? "still to come" : `${d.minutes} minutes`}</span>
          </li>
        {/each}
      </ol>
    </div>
  </div>
</section>
