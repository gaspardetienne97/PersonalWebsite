<script lang="ts">
  // Twelve weeks of practice, one row per weekday (Monday first), one column per week.
  // A practised day is a button: it filters the session list to that day.
  import { HEAT_BANDS, type HeatCell } from "@repo/music-core/progress/journal";
  import { minutesText, plural } from "../progress/model";

  let {
    cells,
    selected,
    onpick,
  }: { cells: HeatCell[]; selected?: string; onpick?: (day: string) => void } = $props();

  const weeks = $derived(cells.length / 7);
  const ROWS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
  // Each column is labelled by the date its week starts (Monday), with the month over the
  // first column and wherever a new month begins.
  const columns = $derived(
    Array.from({ length: weeks }, (_, w) => {
      const day = cells[w * 7].day;
      const prev = w ? cells[(w - 1) * 7].day : undefined;
      const month =
        !prev || prev.slice(5, 7) !== day.slice(5, 7)
          ? new Date(`${day}T00:00:00Z`).toLocaleDateString(undefined, { month: "short", timeZone: "UTC" })
          : "";
      return { month, date: String(Number(day.slice(8))) };
    }),
  );
  const SHADE = [0, 40, 60, 80, 100];
  // The legend names each shade's minute band (HEAT_BANDS), so a shade means the same every week.
  const BANDS = ["None", `Under ${HEAT_BANDS[0]} min`, ...HEAT_BANDS.map((m) => `${m} min or more`)];
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
        ? `${long(c.day)}: ${minutesText(c.minutes, c.sessions)}, ${plural(c.sessions, "session")}, ${c.xp} XP`
        : `${long(c.day)}: no practice`;
</script>

<!-- svelte-ignore a11y_no_noninteractive_tabindex -->
<div class="relative overflow-x-auto" role="region" aria-label="Practice heatmap" tabindex="0">
  <table class="border-separate border-spacing-0.5">
    <caption class="sr-only">Practice over the last {weeks} weeks, one row per weekday</caption>
    <thead aria-hidden="true">
      <tr>
        <td></td>
        {#each columns as c, w (w)}
          <td class="relative h-4 p-0"><span class="absolute bottom-0 left-0 whitespace-nowrap text-xs font-medium text-ws-soft">{c.month}</span></td>
        {/each}
      </tr>
      <tr>
        <td class="pr-1 text-left text-xs text-ws-soft">Week of</td>
        {#each columns as c, w (w)}
          <td class="tnum p-0 text-center text-xs text-ws-soft">{c.date}</td>
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
                  class="block size-6 rounded-md hover:ring-2 focus-visible:ring-2 hover:ring-instr-ink/40 {selected === c.day ? 'ring-2 ring-instr-ink ring-offset-1 ring-offset-ws-bg' : ''}"
                  style:background={fill(c.level)}
                  title={label(c)}
                  aria-pressed={selected === c.day}
                  onclick={() => onpick(c.day)}
                ><span class="sr-only">{label(c)}</span></button>
              {:else}
                <span
                  class="block size-6 rounded-md {c.future ? 'border border-dashed border-ws-line' : ''}"
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
<ul class="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-ws-soft" aria-label="Time a day">
  {#each BANDS as band, level (level)}
    <li class="flex items-center gap-1.5"><span class="size-3.5 rounded-[4px]" style:background={fill(level)} aria-hidden="true"></span>{band}</li>
  {/each}
  <li class="flex items-center gap-1.5"><span class="size-3.5 rounded-[4px] border border-dashed border-ws-line" aria-hidden="true"></span>Still to come</li>
</ul>
