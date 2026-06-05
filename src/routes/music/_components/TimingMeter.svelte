<script lang="ts">
  let {
    offsetMs = 0,
    rangeMs = 100,
    class: cls = "",
  }: {
    offsetMs: number;
    rangeMs?: number;
    class?: string;
  } = $props();

  const pct = $derived(Math.min(Math.max((offsetMs / rangeMs + 1) / 2, 0), 1));
  const pctLeft = $derived(Math.round(pct * 100));
  const inPocket = $derived(Math.abs(offsetMs) <= 15);
</script>

<div class="relative h-10 overflow-hidden rounded-full border bg-card {cls}" aria-label="Timing offset: {offsetMs}ms">
  <div class="absolute inset-y-0 w-[20%] border-x border-green-500/20 bg-green-500/10" style="left:40%"></div>
  <div class="absolute inset-y-0 w-px bg-green-500/60" style="left:50%"></div>
  <div
    class="absolute inset-y-1 w-1 -translate-x-1/2 rounded-full transition-[left] duration-150 {inPocket
      ? 'bg-green-500'
      : 'bg-primary'}"
    style="left:{pctLeft}%"
  ></div>
  <span class="absolute left-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">Behind</span>
  <span
    class="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 text-xs font-semibold text-green-600 dark:text-green-400"
    >On beat</span
  >
  <span class="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">Ahead</span>
</div>
