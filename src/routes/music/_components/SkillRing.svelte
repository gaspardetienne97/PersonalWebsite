<script lang="ts">
  import { masteryTone } from "@repo/music-core/engines/semantic-color";

  import { toneTextClass } from "./semantic-color";

  let {
    percent,
    label,
    size = 64,
    strokeWidth = 5,
    locked = false,
    class: cls = "",
  }: {
    percent: number;
    label?: string;
    size?: number;
    strokeWidth?: number;
    locked?: boolean;
    class?: string;
  } = $props();

  const clamped = $derived(Math.min(Math.max(percent, 0), 100));
  const r = $derived(size / 2 - strokeWidth);
  const circumference = $derived(2 * Math.PI * r);
  const dashoffset = $derived(circumference * (1 - clamped / 100));
  const center = $derived(size / 2);
  // Mastery encodes meaning: low → error, mid → warn, high → success.
  const toneClass = $derived(toneTextClass[masteryTone(clamped)]);
</script>

<div class="inline-flex flex-col items-center gap-1.5 {cls}">
  <div class="relative grid place-items-center" style="width:{size}px;height:{size}px;">
    <svg width={size} height={size} style="transform:rotate(-90deg)" aria-hidden="true">
      <circle cx={center} cy={center} {r} fill="none" stroke="currentColor" stroke-width={strokeWidth} class="text-muted/20" />
      <circle
        cx={center}
        cy={center}
        {r}
        fill="none"
        stroke="currentColor"
        stroke-width={strokeWidth}
        stroke-linecap="round"
        stroke-dasharray={circumference}
        stroke-dashoffset={dashoffset}
        class="{locked ? 'text-muted-foreground/40' : toneClass} transition-[stroke-dashoffset] duration-700 ease-out"
      />
    </svg>
    <span
      class="absolute text-xs font-bold tabular-nums {locked ? 'text-muted-foreground' : ''}"
      aria-label="{label ? `${label}: ` : ''}{clamped}% mastery"
    >
      {clamped}%
    </span>
  </div>
  {#if label}
    <span class="max-w-20 text-center text-[10px] font-semibold leading-tight text-muted-foreground">{label}</span>
  {/if}
</div>
