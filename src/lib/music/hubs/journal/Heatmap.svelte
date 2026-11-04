<script lang="ts">
  // Twelve weeks of practice, one row per weekday (Monday first), one column per week.
  // A practised day is a button: it filters the session list to that day.
  import type { HeatCell } from "@repo/music-core/progress/journal";
  import { plural } from "../progress/model";

  let {
    cells,
    selected,
    onpick,
  }: { cells: HeatCell[]; selected?: string; onpick?: (day: string) => void } = $props();

  const weeks = $derived(cells.length / 7);
  const ROWS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
  // A month's name over the first week column that holds its 1st (and over the first column).
  const months = $derived(
    Array.from({ length: weeks }, (_, w) => {
      const days = cells.slice(w * 7, w * 7 + 7).map((c) => c.day);
      const first = days.find((d) => d.endsWith("-01"));
      const day = first ?? (w === 0 ? days[0] : undefined);
      return day
        ? new Date(`${day}T00:00:00Z`).toLocaleDateString(undefined, { month: "short", timeZone: "UTC" })
        : "";
    }),
  );
  const SHADE = [0, 30, 55, 80, 100];
  const fill = (level: number) =>
    level === 0 ? "var(--ws-raised)" : `color-mix(in oklab, var(--instr) ${SHADE[level]}%, var(--ws-raised))`;
  const long = (day: string) =>
    new Date(`${day}T00:00:00Z`).toLocaleDateString(undefined, {
      weekday: "long",
      day: "numeric",
      month: "long",
      timeZone: "UTC",
    });
  const label = (c: HeatCell) =>
    c.future
      ? `${long(c.day)}: still to come`
      : c.sessions
        ? `${long(c.day)}: ${c.minutes} minutes, ${plural(c.sessions, "session")}, ${c.xp} XP`
        : `${long(c.day)}: no practice`;
</script>

<!-- svelte-ignore a11y_no_noninteractive_tabindex -->
<div class="relative overflow-x-auto" role="region" aria-label="Practice heatmap" tabindex="0">
  <table class="border-separate border-spacing-0.5">
    <caption class="sr-only">Practice over the last {weeks} weeks, one row per weekday</caption>
    <thead aria-hidden="true">
      <tr>
        <td></td>
        {#each months as m, w (w)}
          <td class="relative h-4 p-0"><span class="absolute bottom-0 left-0 whitespace-nowrap text-xs text-ws-soft">{m}</span></td>
        {/each}
      </tr>
    </thead>
    <tbody>
      {#each ROWS as name, r (name)}
        <tr>
          <th scope="row" class="pr-1 text-left text-xs font-normal text-ws-soft">{name}</th>
          {#each Array.from({ length: weeks }, (_, w) => cells[w * 7 + r]) as c (c.day)}
            <td class="p-0">
              {#if c.sessions && onpick}
                <button
                  type="button"
                  class="block size-6 rounded-[5px] hover:ring-2 hover:ring-instr-ink/40 {selected === c.day ? 'ring-2 ring-instr-ink ring-offset-1 ring-offset-ws-bg' : ''}"
                  style:background={fill(c.level)}
                  title={label(c)}
                  aria-pressed={selected === c.day}
                  onclick={() => onpick(c.day)}
                ><span class="sr-only">{label(c)}</span></button>
              {:else}
                <span
                  class="block size-6 rounded-[5px] {c.future ? 'border border-dashed border-ws-line' : ''}"
                  style:background={c.future ? "transparent" : fill(c.level)}
                  title={label(c)}
                ><span class="sr-only">{label(c)}</span></span>
              {/if}
            </td>
          {/each}
        </tr>
      {/each}
    </tbody>
  </table>
</div>
<div class="mt-2 flex flex-wrap items-center gap-x-1.5 gap-y-1 text-xs text-ws-soft" aria-hidden="true">
  <span class="mr-1">Minutes played per day:</span>
  none
  {#each SHADE as _, level (level)}
    <span class="size-3.5 rounded-[4px]" style:background={fill(level)}></span>
  {/each}
  most
  <span class="ml-2 inline-flex items-center gap-1.5"><span class="size-3.5 rounded-[4px] border border-dashed border-ws-line"></span>still to come</span>
</div>
