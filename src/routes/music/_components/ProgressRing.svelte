<script module lang="ts">
  let ringCounter = 0;
</script>

<script lang="ts">
  let {
    value,
    total,
    label,
    size = 140,
    strokeWidth = 11,
    gradient = false,
    class: cls = "",
  }: {
    value: number;
    total: number;
    label?: string;
    size?: number;
    strokeWidth?: number;
    gradient?: boolean;
    class?: string;
  } = $props();

  const gradientId = `progress-ring-${ringCounter++}`;
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
  <svg width={size} height={size} style="transform:rotate(-90deg)" class="text-primary" aria-hidden="true">
    {#if gradient}
      <defs>
        <linearGradient id={gradientId} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stop-color="currentColor" stop-opacity="1" />
          <stop offset="1" stop-color="currentColor" stop-opacity="0.45" />
        </linearGradient>
      </defs>
    {/if}
    <circle {cx} cy={cx} {r} fill="none" stroke="currentColor" stroke-width={strokeWidth} class="text-muted/20" />
    <circle
      {cx}
      cy={cx}
      {r}
      fill="none"
      stroke={gradient ? `url(#${gradientId})` : "currentColor"}
      stroke-width={strokeWidth}
      stroke-linecap="round"
      stroke-dasharray={circumference}
      stroke-dashoffset={dashoffset}
      class="transition-[stroke-dashoffset] duration-700 ease-out"
    />
  </svg>
  <div class="absolute inset-0 flex flex-col items-center justify-center text-center">
    <span class="text-2xl font-bold leading-none tabular-nums">{value.toLocaleString()}</span>
    <span class="mt-1 text-xs text-muted-foreground">/ {total.toLocaleString()}</span>
    <span class="mt-1.5 text-sm font-bold text-primary">{Math.round(pct * 100)}%</span>
  </div>
</div>
