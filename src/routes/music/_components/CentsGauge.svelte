<script lang="ts">
  import type { IntonationZone } from "@repo/music-core/engines/audio-in";

  let {
    cents = 0,
    zone = "in-tune",
    toleranceCents = 10,
    rangeCents = 50,
    active = true,
    class: cls = "",
  }: {
    cents?: number;
    zone?: IntonationZone;
    toleranceCents?: number;
    rangeCents?: number;
    active?: boolean;
    class?: string;
  } = $props();

  // Geometry: a 180° arc, pivot at bottom-centre, top = 0¢, left = flat, right = sharp.
  const CX = 140;
  const CY = 140;
  const R = 116; // arc radius
  const NEEDLE = 104;

  /** Point on the arc at `deg` from vertical (negative = left/flat). */
  function pt(deg: number, radius = R): { x: number; y: number } {
    const rad = (deg * Math.PI) / 180;
    return { x: CX + radius * Math.sin(rad), y: CY - radius * Math.cos(rad) };
  }

  const clamped = $derived(Math.max(-rangeCents, Math.min(rangeCents, cents)));
  const needleDeg = $derived((clamped / rangeCents) * 90);
  const tolDeg = $derived(Math.min(90, (toleranceCents / rangeCents) * 90));

  const left = pt(-90);
  const right = pt(90);
  const zoneStart = $derived(pt(-tolDeg));
  const zoneEnd = $derived(pt(tolDeg));

  const needleClass = $derived(
    !active ? "stroke-muted-foreground" : zone === "in-tune" ? "stroke-success" : "stroke-primary",
  );
  const pivotClass = $derived(
    !active ? "fill-muted-foreground" : zone === "in-tune" ? "fill-success" : "fill-primary",
  );

  // Five evenly spaced ticks across the arc.
  const ticks = [-90, -45, 0, 45, 90];
</script>

<div class={cls}>
  <svg viewBox="0 0 280 168" width="100%" role="img" aria-label="Intonation gauge: {Math.round(cents)} cents ({zone})">
    <!-- arc track -->
    <path
      d="M{left.x} {left.y} A {R} {R} 0 0 1 {right.x} {right.y}"
      fill="none"
      class="stroke-border"
      stroke-width="12"
      stroke-linecap="round"
    />
    <!-- in-tune zone -->
    <path
      d="M{zoneStart.x} {zoneStart.y} A {R} {R} 0 0 1 {zoneEnd.x} {zoneEnd.y}"
      fill="none"
      class="stroke-success"
      stroke-width="12"
      stroke-linecap="round"
      opacity="0.9"
    />
    <!-- ticks -->
    <g class="stroke-muted-foreground" stroke-width="2" opacity="0.5">
      {#each ticks as deg (deg)}
        <line x1={pt(deg, R - 14).x} y1={pt(deg, R - 14).y} x2={pt(deg, R + 2).x} y2={pt(deg, R + 2).y} />
      {/each}
    </g>
    <!-- needle -->
    <g transform="rotate({needleDeg} {CX} {CY})" style="transition: transform 100ms ease-out">
      <line x1={CX} y1={CY} x2={CX} y2={CY - NEEDLE} class={needleClass} stroke-width="4" stroke-linecap="round" />
    </g>
    <circle cx={CX} cy={CY} r="8" class={pivotClass} />
  </svg>
  <div class="mt-1 flex justify-between px-1 text-[10px] font-semibold text-muted-foreground tabular-nums">
    <span>-{rangeCents}</span>
    <span>-{Math.round(rangeCents / 2)}</span>
    <span class="text-success">0</span>
    <span>+{Math.round(rangeCents / 2)}</span>
    <span>+{rangeCents}</span>
  </div>
</div>
