<script lang="ts">
  // Seven bars of XP, the best day marked. The label row carries the days and
  // the values sit on the bars, so the picture is never the only carrier.
  let {
    days,
    class: cls = "",
  }: {
    days: { label: string; xp: number; today?: boolean }[];
    class?: string;
  } = $props();

  const max = $derived(Math.max(1, ...days.map((day) => day.xp)));
  const total = $derived(days.reduce((sum, day) => sum + day.xp, 0));
  const summary = $derived(
    `${total} XP this week: ${days.map((day) => `${day.label} ${day.xp}`).join(", ")}`,
  );
</script>

<div class={cls} role="img" aria-label={summary} data-testid="week-bars">
  <div class="grid h-28 grid-cols-7 items-end gap-2" aria-hidden="true">
    {#each days as day, i (i)}
      {@const best = day.xp > 0 && day.xp === max}
      <div class="flex h-full flex-col items-center justify-end gap-1">
        <span class="font-mono text-[10px] text-muted-foreground">{day.xp || ""}</span>
        <span
          data-best={best ? "true" : undefined}
          class="w-full rounded-t-md rounded-b-sm {best
            ? 'bg-practice-accent'
            : day.xp
              ? 'bg-primary'
              : 'bg-muted'}"
          style={`height: ${Math.max(4, (day.xp / max) * 80)}px`}
        ></span>
        <span class="text-[11px] font-semibold {day.today ? 'text-foreground' : 'text-muted-foreground'}">
          {day.label}
        </span>
      </div>
    {/each}
  </div>
</div>
