<script lang="ts">
  // Breath (CC 2, 0..1) as a lit line. Rolling mode draws the last 64 samples;
  // swell mode plots samples by hold progress over the target envelope.
  interface Props {
    /** Rolling samples, oldest first. */
    values?: number[];
    /** Samples placed by progress 0..1 (swell). */
    points?: { p: number; v: number }[];
    /** Target curve over the whole width (swell envelope). */
    target?: number[];
    measured: boolean;
    label: string;
  }
  let { values = [], points, target, measured, label }: Props = $props();
  const W = 320;
  const H = 96;
  const y = (v: number) => H - 6 - v * (H - 12);
  const line = (pts: [number, number][]) => pts.map(([x, v], i) => `${i ? "L" : "M"}${x.toFixed(1)},${y(v).toFixed(1)}`).join(" ");
  const path = $derived(
    points ? line(points.map((q) => [q.p * W, q.v])) : line(values.map((v, i) => [W - (values.length - 1 - i) * (W / 63), v])),
  );
  const targetPath = $derived(target ? line(target.map((v, i) => [(i / (target.length - 1)) * W, v])) : "");
  const last = $derived(points ? points[points.length - 1]?.v : values[values.length - 1]);
</script>

<figure class="rounded-xl bg-ws-stage-ink/6 p-3">
  <figcaption class="mb-1 flex items-baseline justify-between text-xs text-ws-stage-soft">
    <span>Breath sensor</span>
    <span class="tnum font-semibold text-ws-stage-ink">{measured && last !== undefined ? `${Math.round(last * 100)}%` : "Blow to test the breath sensor"}</span>
  </figcaption>
  <svg viewBox="0 0 {W} {H}" class="h-24 w-full" preserveAspectRatio="none" role="img" aria-label={label}>
    {#each [0.25, 0.5, 0.75] as g (g)}<line x1="0" x2={W} y1={y(g)} y2={y(g)} class="grid" />{/each}
    {#if targetPath}<path d={targetPath} class="target" />{/if}
    {#if measured && path}<path d={path} class="breath" />{/if}
  </svg>
  {#if !measured}<p class="text-xs text-ws-stage-soft">No breath data: the chart and computer keys cannot blow. Play the Aerophone to see it.</p>{/if}
</figure>

<style>
  .grid {
    stroke: color-mix(in oklch, var(--ws-stage-ink) 10%, transparent);
    stroke-width: 1;
    vector-effect: non-scaling-stroke;
  }
  .target {
    fill: none;
    stroke: var(--ws-stage-soft);
    stroke-width: 1.5;
    stroke-dasharray: 5 4;
    vector-effect: non-scaling-stroke;
  }
  .breath {
    fill: none;
    stroke: var(--instr);
    stroke-width: 2.5;
    stroke-linejoin: round;
    vector-effect: non-scaling-stroke;
    filter: drop-shadow(0 0 4px color-mix(in oklch, var(--instr) 60%, transparent));
  }
</style>
