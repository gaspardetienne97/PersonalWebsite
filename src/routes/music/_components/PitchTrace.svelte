<script lang="ts">
  let {
    trace = [],
    rangeCents = 50,
    toleranceCents = 10,
    class: cls = "",
  }: {
    trace?: number[];
    rangeCents?: number;
    toleranceCents?: number;
    class?: string;
  } = $props();

  const W = 600;
  const H = 80;
  const MID = H / 2;

  function y(cents: number): number {
    const scale = (H / 2 - 4) / rangeCents; // cents → px, leaving a 4px margin
    return MID - Math.max(-rangeCents, Math.min(rangeCents, cents)) * scale;
  }

  const bandTop = $derived(y(toleranceCents));
  const bandHeight = $derived(y(-toleranceCents) - y(toleranceCents));

  const points = $derived(
    trace.length < 2
      ? ""
      : trace
          .map((c, i) => `${((i / (trace.length - 1)) * W).toFixed(1)},${y(c).toFixed(1)}`)
          .join(" "),
  );
</script>

<svg viewBox="0 0 {W} {H}" preserveAspectRatio="none" class="h-20 w-full {cls}" aria-hidden="true">
  <rect x="0" y={bandTop} width={W} height={bandHeight} class="fill-success" opacity="0.08" />
  <line x1="0" y1={MID} x2={W} y2={MID} class="stroke-success" stroke-width="1.5" stroke-dasharray="4 4" opacity="0.5" />
  {#if points}
    <polyline {points} fill="none" class="stroke-primary" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" />
  {/if}
</svg>
