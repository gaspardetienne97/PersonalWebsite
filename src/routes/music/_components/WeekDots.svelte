<script lang="ts">
  const DAY_LABELS = ["M", "T", "W", "T", "F", "S", "S"];

  let {
    completedDays = [],
    todayIndex = -1,
    class: cls = "",
  }: {
    completedDays?: number[];
    todayIndex?: number;
    class?: string;
  } = $props();
</script>

<div class="flex gap-1.5 {cls}">
  {#each DAY_LABELS as day, i}
    {@const done = completedDays.includes(i)}
    {@const isToday = i === todayIndex}
    <div class="flex flex-col items-center gap-1">
      <div
        data-dot={done ? "done" : isToday ? "today" : "upcoming"}
        class="grid size-6 place-items-center rounded-full text-xs
          {done ? 'bg-green-500/15 text-green-600 dark:text-green-400' : ''}
          {isToday ? 'bg-muted outline outline-2 outline-offset-1 outline-primary' : ''}
          {!done && !isToday ? 'bg-muted text-muted-foreground' : ''}"
      >
        {#if done}✓{/if}
      </div>
      <span class="text-[10px] font-semibold text-muted-foreground">{day}</span>
    </div>
  {/each}
</div>
