<script lang="ts">
  let {
    value,
    total,
    label,
    size = 140,
    strokeWidth = 11,
    class: cls = "",
  }: {
    value: number;
    total: number;
    label?: string;
    size?: number;
    strokeWidth?: number;
    class?: string;
  } = $props();

  const r = $derived(size / 2 - strokeWidth);
  const circumference = $derived(2 * Math.PI * r);
  const pct = $derived(total > 0 ? Math.min(value / total, 1) : 0);
  const dashoffset = $derived(circumference * (1 - pct));
  const cx = $derived(size / 2);
</script>

<div
  class="relative inline-grid place-items-center {cls}"
  style="width:{size}px;height:{size}px;"
  aria-label="{label}: {value} of {total}"
>
  <svg width={size} height={size} style="transform:rotate(-90deg)" aria-hidden="true">
    <circle {cx} cy={cx} {r} fill="none" stroke="currentColor" stroke-width={strokeWidth} class="text-muted/20" />
    <circle
      {cx}
      cy={cx}
      {r}
      fill="none"
      stroke="currentColor"
      stroke-width={strokeWidth}
      stroke-linecap="round"
      stroke-dasharray={circumference}
      stroke-dashoffset={dashoffset}
      class="text-primary transition-[stroke-dashoffset] duration-700 ease-out"
    />
  </svg>
  <div class="absolute inset-0 flex flex-col items-center justify-center text-center">
    <span class="text-2xl font-bold leading-none tabular-nums">{value.toLocaleString()}</span>
    <span class="mt-1 text-xs text-muted-foreground">/ {total.toLocaleString()}</span>
    <span class="mt-1.5 text-sm font-bold text-primary">{Math.round(pct * 100)}%</span>
  </div>
</div>
