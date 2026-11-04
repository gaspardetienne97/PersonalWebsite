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
  // Every other column is labelled by the date its week starts (Monday), "Oct 12", over two columns.
  const pairs = $derived(
    Array.from({ length: Math.ceil(weeks / 2) }, (_, k) => {
      const day = cells[k * 14].day;
      return {
        span: Math.min(2, weeks - k * 2),
        label: new Date(`${day}T00:00:00Z`).toLocaleDateString(undefined, { month: "short", day: "numeric", timeZone: "UTC" }),
      };
    }),
  );
  // Five shades spread evenly from empty to the full hue, so neighbouring bands read apart.
  const SHADE = [0, 25, 50, 75, 100];
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
        <td class="pr-1 text-left text-[13px] text-ws-soft">Week of</td>
        {#each pairs as c, k (k)}
          <td colspan={c.span} class="tnum whitespace-nowrap p-0 text-left text-[13px] text-ws-soft">{c.label}</td>
        {/each}
      </tr>
    </thead>
    <tbody>
      {#each ROWS as name, r (name)}
        <tr>
          <th scope="row" class="pr-1 text-left text-[13px] font-normal text-ws-soft">{name}</th>
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
                  class="block size-6 rounded-md {c.future ? 'border border-dashed border-ws-soft/60' : ''}"
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
<!-- The shades as one strip from none to most, its ends named; each band's minutes on hover and for screen readers. -->
<div class="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[13px] text-ws-soft">
  <span class="flex items-center gap-2">
    <span aria-hidden="true">{BANDS[0]}</span>
    <ul class="flex overflow-hidden rounded-md" aria-label="Time a day">
      {#each BANDS as band, level (level)}
        <li class="h-4 w-7" style:background={fill(level)} title={band}><span class="sr-only">{band}</span></li>
      {/each}
    </ul>
    <span aria-hidden="true">{BANDS.at(-1)}</span>
  </span>
  <span class="flex items-center gap-1.5"><span class="size-3.5 rounded-[4px] border border-dashed border-ws-soft/60" aria-hidden="true"></span>Still to come</span>
</div>
