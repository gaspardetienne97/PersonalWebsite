<script lang="ts">
  // Pinned above every Progress view: the streak as a week calendar and this
  // week's minutes as seven day bars.
  import Check from "lucide-svelte/icons/check";
  import { computeStreak, dayKey, freezesEarned, practicedDays } from "@repo/music-core/progress/rewards";
  import { practice } from "../../practice.svelte";
  import { settings } from "../../runtime";
  import { weekRollups } from "@repo/music-core/progress/journal";
  import { weekMinutes } from "./model";

  const today = $derived(dayKey(Date.now()));
  const days = $derived(practicedDays(practice.sessions));
  const streak = $derived(computeStreak(days, settings.value.frozenDays, today));
  const freezes = $derived(freezesEarned(days, settings.value.frozenDays));
  const week = $derived(weekMinutes(practice.sessions, today));
  // Same rounding as the journal rollup, so both pages agree.
  const total = $derived(weekRollups(practice.sessions, today).thisWeek.minutes);
  const scale = $derived(Math.max(10, ...week.map((d) => d.minutes)));

  const LETTER = ["M", "T", "W", "T", "F", "S", "S"];
  const weekday = (d: string) =>
    new Date(`${d}T00:00:00Z`).toLocaleDateString(undefined, { weekday: "long", timeZone: "UTC" });
  const letter = (d: string) => LETTER[(new Date(`${d}T00:00:00Z`).getUTCDay() + 6) % 7];
  const dotLabel = { practised: "practised", frozen: "covered by a freeze", missed: "no practice", today: "today, not yet" };
</script>

<section
  aria-label="Streak and this week"
  class="grid gap-5 rounded-3xl border border-ws-line bg-ws-surface p-4 sm:grid-cols-2 sm:p-5"
>
  <div class="min-w-0">
    <h2 class="font-display text-xl font-semibold">
      {streak.current ? `${streak.current}-day streak` : "Start a streak today"}
    </h2>
    <p class="text-sm text-ws-soft">
      Longest {streak.longest}. {freezes} freeze{freezes === 1 ? "" : "s"} held.
    </p>
    <ol class="mt-3 grid max-w-xs grid-cols-7 gap-1 text-center text-xs text-ws-soft">
      {#each streak.week as d (d.day)}
        <li class="flex flex-col items-center gap-1">
          <span
            class="grid size-8 place-items-center rounded-full {d.state === 'practised'
              ? 'bg-instr text-ws-stage'
              : d.state === 'frozen'
                ? 'border-2 border-dashed border-info text-info'
                : d.state === 'today'
                  ? 'border-2 border-instr-ink'
                  : 'bg-ws-raised'}"
            title="{weekday(d.day)}: {dotLabel[d.state]}"
            aria-hidden="true"
          >
            {#if d.state === "practised"}<Check class="size-4" />{:else if d.state === "frozen"}❄{/if}
          </span>
          <span aria-hidden="true">{letter(d.day)}</span>
          <span class="sr-only">{weekday(d.day)}: {dotLabel[d.state]}</span>
        </li>
      {/each}
    </ol>
  </div>

  <div class="min-w-0 sm:border-l sm:border-ws-line sm:pl-5">
    <h2 class="font-display text-xl font-semibold">
      This week, <span class="tnum">{total}</span> min
    </h2>
    <p class="text-sm text-ws-soft">Minutes of saved practice, Monday to Sunday.</p>
    <ol class="mt-3 flex max-w-xs gap-1.5">
      {#each week as d (d.day)}
        {@const h = d.minutes ? Math.max(8, (d.minutes / scale) * 80) : 6}
        <li class="flex min-w-0 flex-1 flex-col items-center gap-1">
          <div class="relative h-20 w-full" aria-hidden="true">
            {#if d.minutes}
              <span class="tnum absolute inset-x-0 text-center text-xs text-ws-soft" style:bottom="calc({h}% + 2px)"
                >{d.minutes}</span
              >
            {/if}
            <span
              class="absolute inset-x-0 bottom-0 rounded-md {d.future
                ? 'border border-dashed border-ws-line'
                : d.minutes
                  ? 'bg-instr'
                  : 'bg-ws-raised'} {d.today ? 'ring-2 ring-instr-ink ring-offset-1 ring-offset-ws-surface' : ''}"
              style:height="{h}%"
            ></span>
          </div>
          <span class="text-xs {d.today ? 'font-semibold text-ws-ink' : 'text-ws-soft'}" aria-hidden="true"
            >{letter(d.day)}</span
          >
          <span class="sr-only"
            >{weekday(d.day)}{d.today ? " (today)" : ""}: {d.future ? "still to come" : `${d.minutes} minutes`}</span
          >
        </li>
      {/each}
    </ol>
  </div>
</section>
