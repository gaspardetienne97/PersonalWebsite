<script lang="ts">
  let {
    total,
    current,
    label = "Session",
    class: cls = "",
  }: {
    total: number;
    current: number;
    label?: string;
    class?: string;
  } = $props();

  const segments = $derived(
    Array.from({ length: total }, (_, i) => {
      if (i < current) return "done";
      if (i === current) return "current";
      return "upcoming";
    }),
  );
</script>

<div class="flex items-center gap-2 {cls}">
  <span class="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">{label}</span>
  <div
    class="flex flex-1 gap-1"
    role="progressbar"
    aria-valuenow={current}
    aria-valuemax={total}
    aria-label="{label} {current} of {total}"
  >
    {#each segments as seg}
      <i
        data-segment={seg}
        class="block h-1.5 flex-1 rounded-full transition-colors {seg === 'done'
          ? 'bg-primary'
          : seg === 'current'
            ? 'bg-primary/50'
            : 'bg-muted'}"
      ></i>
    {/each}
  </div>
  <span class="text-sm font-bold tabular-nums">{current} / {total}</span>
</div>
