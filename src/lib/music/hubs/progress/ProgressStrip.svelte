<script lang="ts">
  import { m } from "@repo/i18n/messages.js";
  // On What next: the streak as a week calendar, and this week's practice time as seven
  // day bars against a labelled scale, drawn from the first day so it reads as a chart.
  import { computeStreak, dayKey, freezesEarned, practicedDays } from "@repo/music-core/progress/rewards";
  import { practice } from "../../practice.svelte";
  import { settings } from "../../runtime";
  import { weekRollups } from "@repo/music-core/progress/journal";
  import { minutesText, weekMinutes } from "./model";
  import StreakWeek from "./StreakWeek.svelte";
  import { weekdayLetter, weekdayName } from "../dates";

  const today = $derived(dayKey(Date.now()));
  const days = $derived(practicedDays(practice.sessions));
  const streak = $derived(computeStreak(days, settings.value.frozenDays, today));
  const freezes = $derived(freezesEarned(days, settings.value.frozenDays));
  const week = $derived(weekMinutes(practice.sessions, today));
  // Same rounding as the journal rollup, so both pages agree.
  const thisWeek = $derived(weekRollups(practice.sessions, today).thisWeek);
  const todayMin = $derived(week.find((d) => d.today)?.minutes ?? 0);
  const todaySessions = $derived(practice.sessions.filter((s) => dayKey(s.startTime) === today).length);
  const todayText = $derived(todaySessions ? minutesText(todayMin, todaySessions) : m.music_hubs_minutes_short({ minutes: 0 }));
  // The scale's top: the busiest day rounded up to a round number, so the line reads as minutes.
  const scale = $derived.by(() => {
    const max = Math.max(1, ...week.map((d) => d.minutes));
    const step = max <= 10 ? 5 : max <= 30 ? 10 : max <= 60 ? 15 : 30;
    return Math.ceil(max / step) * step;
  });

  const weekday = weekdayName;
  const letter = weekdayLetter;
</script>

<section
  aria-label={m.music_hubs_strip_label()}
  class="grid gap-5 rounded-3xl border border-ws-line bg-ws-surface p-4 sm:grid-cols-2 sm:p-5"
>
  <StreakWeek week={streak.week} current={streak.current} longest={streak.longest} {freezes} since={days.length ? [...days].sort()[0] : undefined} />

  <div class="min-w-0 sm:border-l sm:border-ws-line sm:pl-5">
    <h2 class="font-display text-xl font-semibold">
      {m.music_hubs_strip_this_week()} <span class="tnum">{minutesText(thisWeek.minutes, thisWeek.sessions)}</span>
    </h2>
    <p class="text-sm text-ws-soft">{m.music_hubs_strip_minutes_each_day()} <span class="tnum">{todayText}</span>.</p>
    <div class="mt-3 flex max-w-sm gap-2">
      <!-- The scale: its top and zero, so a bar's height means something. -->
      <div class="tnum flex h-20 shrink-0 flex-col justify-between text-right text-[13px] text-ws-soft" aria-hidden="true">
        <span class="-mt-1.5">{m.music_hubs_minutes_short({ minutes: scale })}</span><span class="-mb-1.5">0</span>
      </div>
      <ol class="relative flex min-w-0 flex-1 gap-1.5">
        <span class="pointer-events-none absolute inset-x-0 top-0 border-t border-dashed border-ws-line" aria-hidden="true"></span>
        {#each week as d (d.day)}
          {@const h = d.minutes ? Math.max(8, (d.minutes / scale) * 100) : 4}
          <li class="flex min-w-0 flex-1 flex-col items-center gap-1">
            <div class="relative h-20 w-full" aria-hidden="true">
              <span
                class="absolute inset-x-0 bottom-0 rounded-md {d.future
                  ? 'border border-dashed border-ws-soft/60'
                  : d.minutes
                    ? 'bg-instr'
                    : 'bg-ws-raised'} {d.today ? 'ring-2 ring-instr-ink ring-offset-1 ring-offset-ws-surface' : ''}"
                style:height="{h}%"
              ></span>
            </div>
            <span class="text-[13px] {d.today ? 'font-semibold text-ws-ink' : 'text-ws-soft'}" aria-hidden="true">{letter(d.day)}</span>
            <span class="tnum text-[13px] {d.today ? 'font-semibold text-ws-ink' : 'text-ws-soft'}" aria-hidden="true">{d.future ? "" : d.minutes}</span>
            <span class="sr-only">{m.music_hubs_pair({ a: d.today ? m.music_hubs_strip_day_today_sr({ day: weekday(d.day) }) : weekday(d.day), b: d.future ? m.music_hubs_strip_still_to_come() : m.music_hubs_strip_minutes({ count: d.minutes }) })}</span>
          </li>
        {/each}
      </ol>
    </div>
  </div>
</section>
