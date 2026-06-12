<script lang="ts">
  let {
    value = 0,
    size = 40,
    stroke = 3,
    color = "var(--n-brand-blue)",
  }: { value?: number; size?: number; stroke?: number; color?: string } = $props();

  const r = $derived((size - stroke) / 2);
  const c = $derived(2 * Math.PI * r);
</script>

<svg width={size} height={size} style="transform: rotate(-90deg)" aria-hidden="true">
  <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--n-border-2)" stroke-width={stroke} />
  <circle
    cx={size / 2}
    cy={size / 2}
    r={r}
    fill="none"
    stroke={color}
    stroke-width={stroke}
    stroke-linecap="round"
    stroke-dasharray={c}
    stroke-dashoffset={c * (1 - value)}
    style="transition: stroke-dashoffset 300ms var(--n-ease-out)"
  />
</svg>
