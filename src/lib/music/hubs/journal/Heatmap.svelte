<script lang="ts">
  // Twelve weeks of practice, one row per weekday (Monday first), one column per week.
  import type { HeatCell } from "@repo/music-core/progress/journal";
  import { plural } from "../progress/model";

  let { cells }: { cells: HeatCell[] } = $props();

  const weeks = $derived(cells.length / 7);
  const ROWS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
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
  <table class="border-separate border-spacing-1">
    <caption class="sr-only">Practice over the last {weeks} weeks, one row per weekday</caption>
    <tbody>
      {#each ROWS as name, r (name)}
        <tr>
          <th scope="row" class="pr-1 text-left text-xs font-normal text-ws-soft">{r % 2 === 0 ? name : ""}<span class="sr-only">{r % 2 ? name : ""}</span></th>
          {#each Array.from({ length: weeks }, (_, w) => cells[w * 7 + r]) as c (c.day)}
            <td class="p-0">
              <span
                class="block size-5 rounded-[5px] {c.future ? 'border border-dashed border-ws-line' : ''}"
                style:background={c.future ? "transparent" : fill(c.level)}
                title={label(c)}
              ><span class="sr-only">{label(c)}</span></span>
            </td>
          {/each}
        </tr>
      {/each}
    </tbody>
  </table>
</div>
<div class="mt-2 flex items-center gap-1.5 text-xs text-ws-soft" aria-hidden="true">
  Less
  {#each SHADE as _, level (level)}
    <span class="size-3.5 rounded-[4px]" style:background={fill(level)}></span>
  {/each}
  More
</div>
