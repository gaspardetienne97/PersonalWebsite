<script lang="ts">
  import type { IntonationZone } from "@repo/music-core/engines/audio-in";

  // An arc of cents with the neighbouring notes at the ends and a needle. The
  // in-tune band is the success token; the needle turns success when inside it.
  // Colour is never alone: the caller prints the cents and the direction word.
  let {
    cents = 0,
    zone = "in-tune",
    toleranceCents = 5,
    rangeCents = 50,
    active = true,
    flatNeighbor,
    sharpNeighbor,
    class: cls = "",
  }: {
    cents?: number;
    zone?: IntonationZone;
    toleranceCents?: number;
    rangeCents?: number;
    active?: boolean;
    /** Note names shown at the flat and sharp ends of the arc. */
    flatNeighbor?: string;
    sharpNeighbor?: string;
    class?: string;
  } = $props();

  const W = 520;
  const H = 300;
  const CX = W / 2;
  const CY = H * 0.92;
  const R = W * 0.44;
  const A0 = 200;
  const A1 = 340;
  const point = (deg: number, radius = R) => {
    const rad = (deg * Math.PI) / 180;
    return [CX + radius * Math.cos(rad), CY + radius * Math.sin(rad)] as const;
  };
  const angleFor = (value: number) => {
    const clamped = Math.max(-rangeCents, Math.min(rangeCents, value));
    return A0 + ((clamped + rangeCents) / (2 * rangeCents)) * (A1 - A0);
  };
  const arc = (from: number, to: number, radius = R) =>
    `M ${point(from, radius).join(" ")} A ${radius} ${radius} 0 0 1 ${point(to, radius).join(" ")}`;
  const ticks = $derived(
    [-rangeCents, -rangeCents / 2, 0, rangeCents / 2, rangeCents].map((value) => ({
      value,
      angle: angleFor(value),
    })),
  );
  const needle = $derived(angleFor(active ? cents : 0));
  const needleTip = $derived(point(needle, R - 6));
  const needleBase = $derived(point(needle, R * 0.35));
  const needleClass = $derived(
    !active ? "stroke-stage-muted" : zone === "in-tune" ? "stroke-success" : "stroke-practice-accent",
  );
</script>

<svg
  viewBox="0 0 {W} {H}"
  class="block h-auto w-full max-w-[32rem] {cls}"
  role="img"
  aria-label={active ? `${Math.round(cents)} cents, ${zone === "in-tune" ? "in tune" : zone}` : "No pitch yet"}
  data-testid="arc-gauge"
>
  <path d={arc(A0, A1)} fill="none" class="stroke-stage-line" stroke-width="18" stroke-linecap="round" />
  <path
    d={arc(angleFor(-toleranceCents), angleFor(toleranceCents))}
    fill="none"
    class="stroke-success"
    stroke-width="18"
    opacity="0.9"
  />
  {#each ticks as tick (tick.value)}
    {@const [x1, y1] = point(tick.angle, R + 16)}
    {@const [x2, y2] = point(tick.angle, R + 28)}
    {@const [tx, ty] = point(tick.angle, R + 46)}
    <line {x1} {y1} {x2} {y2} class="stroke-stage-muted" stroke-width="2" />
    <text x={tx} y={ty + 4} text-anchor="middle" class="fill-stage-muted font-mono text-[12px]">
      {tick.value > 0 ? `+${tick.value}` : tick.value}
    </text>
  {/each}
  {#if flatNeighbor}
    {@const [x, y] = point(A0 - 6, R - 40)}
    <text {x} {y} text-anchor="middle" class="fill-stage-muted font-display text-[22px]">{flatNeighbor}</text>
  {/if}
  {#if sharpNeighbor}
    {@const [x, y] = point(A1 + 6, R - 40)}
    <text {x} {y} text-anchor="middle" class="fill-stage-muted font-display text-[22px]">{sharpNeighbor}</text>
  {/if}
  <line
    x1={needleBase[0]}
    y1={needleBase[1]}
    x2={needleTip[0]}
    y2={needleTip[1]}
    class={needleClass}
    stroke-width="5"
    stroke-linecap="round"
  />
  <circle cx={CX} cy={CY} r="10" class="fill-stage-foreground" />
</svg>
