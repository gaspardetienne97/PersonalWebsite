<script lang="ts">
  import { m } from "@repo/i18n/messages.js";
  // The streak as this week's seven days: a glyph per state so colour is never the only cue
  // (check practised, dash missed, snowflake frozen, ring today, dotted outline still to come),
  // a one-line key, and the freeze rules behind an info button.
  import Check from "@lucide/svelte/icons/check";
  import Minus from "@lucide/svelte/icons/minus";
  import Snowflake from "@lucide/svelte/icons/snowflake";
  import Info from "@lucide/svelte/icons/info";
  import Flame from "@lucide/svelte/icons/flame";
  import type { DotState } from "@repo/music-core/progress/rewards";
  import { weekdayLetter, weekdayName } from "../dates";
  let {
    week,
    current,
    longest,
    freezes,
    pop,
    since,
  }: {
    week: { day: string; state: DotState }[];
    current: number;
    longest?: number;
    freezes: number;
    /** A day just practised: its cell pops in with its check (Today, the first time the set is done). */
    pop?: string;
    /** The first day ever practised: a day before it is blank, never "missed". */
    since?: string;
  } = $props();
  /** A missed day before the first session is no miss at all. */
  const stateOf = (d: { day: string; state: DotState }): DotState | "before" =>
    d.state === "missed" && (!since || d.day < since) ? "before" : d.state;

  let rules = $state(false);
  const id = $props.id();
  const letter = weekdayLetter;
  const weekday = weekdayName;
  const WORD: Record<DotState | "before", string> = {
    before: m.music_hubs_streak_word_before(),
    practised: m.music_hubs_streak_word_practised(),
    frozen: m.music_hubs_streak_word_frozen(),
    missed: m.music_hubs_streak_word_missed(),
    today: m.music_hubs_streak_word_today(),
    upcoming: m.music_hubs_strip_still_to_come(),
  };
  const practisedDays = $derived(week.filter((d) => d.state === "practised").length);
  const frozenShown = $derived(week.some((d) => d.state === "frozen"));
  const missedShown = $derived(week.some((d) => stateOf(d) === "missed"));
</script>

<div class="min-w-0">
  <div class="flex items-center gap-3">
    <span
      class="grid size-11 shrink-0 place-items-center rounded-full {current ? 'bg-instr text-ws-stage' : 'bg-ws-raised text-ws-soft'}"
      aria-hidden="true"><Flame class="size-5" /></span
    >
    <div class="min-w-0 flex-1">
      <h2 id="{id}-title" class="font-display text-xl font-semibold">
        {current === 1 ? m.music_hubs_streak_day1() : current ? m.music_hubs_streak_days({ count: current }) : m.music_hubs_streak_start()}
      </h2>
      <!-- Best and freezes only when they add something: a best equal to today's streak, or no freezes, says nothing. -->
      {#if (longest ?? 0) > current || freezes}
        <p class="text-sm text-ws-soft">
          {#if (longest ?? 0) > current}{m.music_hubs_streak_best({ count: longest ?? 0 })}{" "}{/if}{#if freezes}{m.music_hubs_streak_freezes({ count: freezes })}{/if}
        </p>
      {/if}
    </div>
    <button
      type="button"
      class="grid size-11 shrink-0 place-items-center rounded-full text-ws-soft hover:bg-ws-raised hover:text-ws-ink"
      aria-label={m.music_hubs_streak_rules_label()}
      aria-expanded={rules}
      aria-controls="{id}-rules"
      onclick={() => (rules = !rules)}><Info class="size-5" aria-hidden="true" /></button
    >
  </div>
  {#if rules}
    <p id="{id}-rules" class="mt-2 rounded-xl bg-ws-raised px-3 py-2 text-sm">
      {m.music_hubs_streak_rules()}
    </p>
  {/if}

  <ol class="mt-3 grid max-w-sm grid-cols-7 gap-1 text-center text-[13px] text-ws-soft" aria-label={m.music_hubs_this_week()}>
    {#each week as d (d.day)}
      {@const st = stateOf(d)}
      <li class="flex flex-col items-center gap-1" title={m.music_hubs_pair({ a: weekday(d.day), b: WORD[st] })}>
        <span
          class="grid size-9 place-items-center rounded-full {pop === d.day && d.state === 'practised' ? 'ws-pop [animation-delay:600ms]' : ''} {d.state === 'practised'
            ? 'bg-instr text-ws-stage'
            : d.state === 'frozen'
              ? 'border-2 border-dashed border-info text-info'
              : d.state === 'today'
                ? 'border-2 border-instr-ink'
                : d.state === 'upcoming' || st === 'before'
                  ? 'border-2 border-dashed border-ws-soft/70'
                  : 'bg-ws-raised text-ws-soft'}"
          aria-hidden="true"
        >
          {#if d.state === "practised"}<Check class="size-4" />{:else if d.state === "frozen"}<Snowflake
              class="size-4"
            />{:else if st === "missed"}<Minus class="size-4" />{/if}
        </span>
        <span aria-hidden="true" class={d.state === "today" ? "font-semibold text-ws-ink" : ""}>{letter(d.day)}</span>
        <span class="sr-only">{m.music_hubs_pair({ a: weekday(d.day), b: WORD[st] })}</span>
      </li>
    {/each}
  </ol>
  <p class="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[13px] text-ws-soft" aria-hidden="true">
    <span class="tnum font-semibold text-ws-ink">{m.music_hubs_streak_days_of_7({ count: practisedDays })}</span>
    <span class="inline-flex items-center gap-1"><Check class="size-3.5" />{m.music_hubs_streak_key_practised()}</span>
    {#if missedShown}<span class="inline-flex items-center gap-1"><Minus class="size-3.5" />{m.music_hubs_streak_key_missed()}</span>{/if}
    {#if frozenShown}<span class="inline-flex items-center gap-1"><Snowflake class="size-3.5" />{m.music_hubs_streak_key_freeze()}</span>{/if}
    <span class="inline-flex items-center gap-1"><span class="size-3 rounded-full border-2 border-instr-ink"></span>{m.music_hubs_streak_key_today()}</span>
  </p>
</div>
