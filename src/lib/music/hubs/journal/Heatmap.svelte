<script lang="ts">
  import { m } from "@repo/i18n/messages.js";
  // Twelve weeks of practice, one row per weekday (Monday first), one column per week.
  // A practised day is a button: it filters the session list to that day.
  import { HEAT_BANDS, type HeatCell } from "@repo/music-core/progress/journal";
  import { minutesText } from "../progress/model";
  import { longDay, monthDay } from "../dates";

  let {
    cells,
    selected,
    onpick,
  }: { cells: HeatCell[]; selected?: string; onpick?: (day: string) => void } = $props();

  const weeks = $derived(cells.length / 7);
  const ROWS = m.music_hubs_weekday_short().split(" ");
  // Up to six weeks the cells are wide enough for every column to carry its week's date (Monday, "Oct 12");
  // past that every other column is labelled, over two columns.
  const roomy = $derived(weeks <= 6);
  const pairs = $derived(
    Array.from({ length: roomy ? weeks : Math.ceil(weeks / 2) }, (_, k) => {
      const day = cells[k * (roomy ? 7 : 14)].day;
      return {
        span: roomy ? 1 : Math.min(2, weeks - k * 2),
        label: monthDay(new Date(`${day}T00:00:00Z`), true),
      };
    }),
  );
  // Five shades spread evenly from empty to the full hue, so neighbouring bands read apart.
  const SHADE = [0, 25, 50, 75, 100];
  // The legend names each shade's minute band (HEAT_BANDS), so a shade means the same every week.
  const BANDS = [
    m.music_hubs_heat_none(),
    m.music_hubs_heat_under({ minutes: HEAT_BANDS[0] }),
    ...HEAT_BANDS.map((minutes) => m.music_hubs_heat_or_more({ minutes })),
  ];
  const fill = (level: number) =>
    level === 0 ? "var(--ws-raised)" : `color-mix(in oklab, var(--instr) ${SHADE[level]}%, var(--ws-raised))`;
  const long = longDay;
  const label = (c: HeatCell) =>
    c.future
      ? m.music_hubs_heat_day_future({ day: long(c.day) })
      : c.sessions
        ? m.music_hubs_heat_day({ day: long(c.day), time: minutesText(c.minutes, c.sessions), count: c.sessions, xp: c.xp })
        : m.music_hubs_heat_day_none({ day: long(c.day) });
</script>

<!-- svelte-ignore a11y_no_noninteractive_tabindex -->
<div class="relative overflow-x-auto" role="region" aria-label={m.music_hubs_heat_label()} tabindex="0">
  <table class="border-separate border-spacing-0.5">
    <caption class="sr-only">{m.music_hubs_heat_caption({ weeks })}</caption>
    <thead aria-hidden="true">
      <tr>
        <td class="pr-1 text-left text-[13px] text-ws-soft">{m.music_hubs_heat_week_of()}</td>
        {#each pairs as c, k (k)}
          <td colspan={c.span} class="tnum whitespace-nowrap p-0 text-[13px] text-ws-soft {roomy ? 'text-center' : 'text-left'}">{c.label}</td>
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
                  class="block rounded-md {roomy ? 'h-9 w-12' : 'size-6'} hover:ring-2 focus-visible:ring-2 hover:ring-instr-ink/40 {selected === c.day ? 'ring-2 ring-instr-ink ring-offset-1 ring-offset-ws-bg' : ''}"
                  style:background={fill(c.level)}
                  title={label(c)}
                  aria-pressed={selected === c.day}
                  onclick={() => onpick(c.day)}
                ><span class="sr-only">{label(c)}</span></button>
              {:else}
                <span
                  class="block rounded-md {roomy ? 'h-9 w-12' : 'size-6'} {c.future ? 'border border-dashed border-ws-soft/60' : ''}"
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
    <ul class="flex overflow-hidden rounded-md" aria-label={m.music_hubs_heat_time_a_day()}>
      {#each BANDS as band, level (level)}
        <li class="h-4 w-7" style:background={fill(level)} title={band}><span class="sr-only">{band}</span></li>
      {/each}
    </ul>
    <span aria-hidden="true">{BANDS.at(-1)}</span>
  </span>
  <span class="flex items-center gap-1.5"><span class="size-3.5 rounded-[4px] border border-dashed border-ws-soft/60" aria-hidden="true"></span>{m.music_hubs_heat_still_to_come()}</span>
</div>
