<script lang="ts">
  // The streak as this week's seven days: a glyph per state so colour is never the only cue
  // (check practised, dash missed, snowflake frozen, ring today, dotted outline still to come),
  // a one-line key, and the freeze rules behind an info button.
  import Check from "lucide-svelte/icons/check";
  import Minus from "lucide-svelte/icons/minus";
  import Snowflake from "lucide-svelte/icons/snowflake";
  import Info from "lucide-svelte/icons/info";
  import Flame from "lucide-svelte/icons/flame";
  import type { DotState } from "@repo/music-core/progress/rewards";
  let {
    week,
    current,
    longest,
    freezes,
  }: {
    week: { day: string; state: DotState }[];
    current: number;
    longest?: number;
    freezes: number;
  } = $props();

  let rules = $state(false);
  const id = $props.id();
  const LETTER = ["M", "T", "W", "T", "F", "S", "S"];
  const date = (d: string) => new Date(`${d}T00:00:00Z`);
  const letter = (d: string) => LETTER[(date(d).getUTCDay() + 6) % 7];
  const weekday = (d: string) => date(d).toLocaleDateString(undefined, { weekday: "long", timeZone: "UTC" });
  const WORD: Record<DotState, string> = {
    practised: "practised",
    frozen: "covered by a streak freeze",
    missed: "missed",
    today: "today, not practised yet",
    upcoming: "still to come",
  };
  const frozenShown = $derived(week.some((d) => d.state === "frozen"));
</script>

<div class="min-w-0">
  <div class="flex items-center gap-3">
    <span
      class="grid size-11 shrink-0 place-items-center rounded-full {current ? 'bg-instr text-ws-stage' : 'bg-ws-raised text-ws-soft'}"
      aria-hidden="true"><Flame class="size-5" /></span
    >
    <div class="min-w-0 flex-1">
      <h2 id="{id}-title" class="font-display text-xl font-semibold">
        {current ? `${current}-day streak` : "Start a streak today"}
      </h2>
      <p class="text-sm text-ws-soft">
        {#if longest}Best streak: {longest} day{longest === 1 ? "" : "s"}.{" "}{/if}{freezes} streak freeze{freezes === 1 ? "" : "s"} saved.
      </p>
    </div>
    <button
      type="button"
      class="grid size-11 shrink-0 place-items-center rounded-full text-ws-soft hover:bg-ws-raised hover:text-ws-ink"
      aria-label="How streak freezes work"
      aria-expanded={rules}
      aria-controls="{id}-rules"
      onclick={() => (rules = !rules)}><Info class="size-5" aria-hidden="true" /></button
    >
  </div>
  {#if rules}
    <p id="{id}-rules" class="mt-2 rounded-xl bg-ws-raised px-3 py-2 text-sm">
      You earn one streak freeze for each week you practise. If you miss a day, a saved freeze covers it so the streak
      carries on.
    </p>
  {/if}

  <ol class="mt-3 grid max-w-xs grid-cols-7 gap-1 text-center text-xs text-ws-soft" aria-label="This week">
    {#each week as d (d.day)}
      <li class="flex flex-col items-center gap-1" title="{weekday(d.day)}: {WORD[d.state]}">
        <span
          class="grid size-8 place-items-center rounded-full {d.state === 'practised'
            ? 'bg-instr text-ws-stage'
            : d.state === 'frozen'
              ? 'border-2 border-dashed border-info text-info'
              : d.state === 'today'
                ? 'border-2 border-instr-ink'
                : d.state === 'upcoming'
                  ? 'border border-dashed border-ws-line'
                  : 'bg-ws-raised text-ws-soft'}"
          aria-hidden="true"
        >
          {#if d.state === "practised"}<Check class="size-4" />{:else if d.state === "frozen"}<Snowflake
              class="size-4"
            />{:else if d.state === "missed"}<Minus class="size-4" />{/if}
        </span>
        <span aria-hidden="true" class={d.state === "today" ? "font-semibold text-ws-ink" : ""}>{letter(d.day)}</span>
        <span class="sr-only">{weekday(d.day)}: {WORD[d.state]}</span>
      </li>
    {/each}
  </ol>
  <p class="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-ws-soft" aria-hidden="true">
    <span class="inline-flex items-center gap-1"><Check class="size-3.5" />Practised</span>
    <span class="inline-flex items-center gap-1"><Minus class="size-3.5" />Missed</span>
    {#if frozenShown}<span class="inline-flex items-center gap-1"><Snowflake class="size-3.5" />Freeze used</span>{/if}
    <span class="inline-flex items-center gap-1"><span class="size-3 rounded-full border-2 border-instr-ink"></span>Today</span>
  </p>
</div>
