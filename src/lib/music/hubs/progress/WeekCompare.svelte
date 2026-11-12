<script lang="ts">
  // This week against last, one pair of bars per measure (each pair on its own scale), with the
  // numbers and the change written out so the bars are never the only cue.
  import type { Rollup } from "@repo/music-core/progress/journal";
  import { minutesText, signed } from "./model";

  let { weeks }: { weeks: { thisWeek: Rollup; lastWeek: Rollup; delta: Rollup } } = $props();
  const ROWS = [
    { key: "minutes", label: "Time" },
    { key: "sessions", label: "Sessions" },
    { key: "attempts", label: "Attempts" },
    { key: "xp", label: "XP" },
  ] as const;
  type Key = (typeof ROWS)[number]["key"];
  // Minutes read as time ("under 2 min" over a few short sessions, never a bare "1").
  const shown = (week: Rollup, key: Key) => (key === "minutes" ? minutesText(week.minutes, week.sessions) : week[key]);
</script>

{#if ROWS.every((r) => weeks.lastWeek[r.key] === 0)}
  <!-- Nothing last week: this week's figures alone, no bars against an empty week. -->
  <dl class="tnum mt-3 grid grid-cols-2 gap-3 text-sm">
    {#each ROWS as row (row.key)}
      <div class="rounded-xl bg-ws-raised/60 px-3 py-2">
        <dt class="text-ws-soft">{row.label}</dt>
        <dd class="font-display text-xl font-semibold">{shown(weeks.thisWeek, row.key)}</dd>
      </div>
    {/each}
  </dl>
  <p class="mt-2 text-[13px] text-ws-soft">This week so far. An attempt is one answer or take; XP is earned on every run. Next week shows the change against this one.</p>
{:else}
<dl class="mt-3 flex flex-col gap-3 text-sm">
  {#each ROWS as row (row.key)}
    {@const now = weeks.thisWeek[row.key]}
    {@const then = weeks.lastWeek[row.key]}
    {@const top = Math.max(1, now, then)}
    <div class="min-w-0">
      <div class="flex items-baseline justify-between gap-2">
        <dt class="font-medium">{row.label}</dt>
        <dd class="tnum text-ws-soft">
          <span class="font-semibold text-ws-ink">{shown(weeks.thisWeek, row.key)}</span> this week, {shown(weeks.lastWeek, row.key)} last
          <span class="sr-only">, change</span><span class="ml-1 {weeks.delta[row.key] > 0 ? 'text-success' : ''}">({signed(weeks.delta[row.key])})</span>
        </dd>
      </div>
      <div class="mt-1 flex flex-col gap-0.5" aria-hidden="true">
        <span class="h-2 rounded-full bg-instr" style:width="{Math.max(now ? 3 : 0, (now / top) * 100)}%"></span>
        <span class="h-2 rounded-full bg-ws-soft/35" style:width="{Math.max(then ? 3 : 0, (then / top) * 100)}%"></span>
      </div>
    </div>
  {/each}
</dl>
<p class="mt-2 flex gap-4 text-[13px] text-ws-soft" aria-hidden="true">
  <span class="inline-flex items-center gap-1.5"><span class="h-2 w-5 rounded-full bg-instr"></span>This week</span>
  <span class="inline-flex items-center gap-1.5"><span class="h-2 w-5 rounded-full bg-ws-soft/35"></span>Last week</span>
</p>
{/if}
