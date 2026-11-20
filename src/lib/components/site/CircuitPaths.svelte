<!--
  Draws a grown circuit board. With `grow`, each chain draws on in order of its
  distance from the roots, so the board spreads outward the way it was grown.
-->
<script lang="ts">
  import { toPathData, type Board } from "#lib/circuit/router.ts";

  let {
    board,
    grow = false,
    stepMs = 26,
    class: className = "",
  }: { board: Board; grow?: boolean; stepMs?: number; class?: string } = $props();

  const timing = (start: number, steps: number) =>
    `--delay:${start * stepMs}ms;--dur:${Math.max(1, steps) * stepMs}ms`;
</script>

<svg
  class="circuit {className}"
  class:grow
  viewBox="0 0 {board.width || 1} {board.height || 1}"
  preserveAspectRatio="xMidYMid slice"
  aria-hidden="true"
>
  {#each board.chains as chain, i (i)}
    {@const end = chain.points[chain.points.length - 1]}
    {@const head = chain.points[0]}
    <g style="--ink:{chain.color ?? 'currentColor'};{timing(chain.start, chain.steps)}">
      <path d={toPathData(chain.points)} pathLength="1" />
      {#if chain.branch}<circle class="junction" cx={head.x} cy={head.y} r="2.6" />{/if}
      <circle class="via" cx={end.x} cy={end.y} r="3.4" />
    </g>
  {/each}
</svg>

<style>
  .circuit {
    display: block;
    width: 100%;
    height: 100%;
  }
  path {
    fill: none;
    stroke: var(--ink);
    stroke-width: 2.25;
    stroke-linecap: round;
    stroke-linejoin: round;
  }
  .via {
    fill: var(--background);
    stroke: var(--ink);
    stroke-width: 1.8;
  }
  .junction {
    fill: var(--ink);
  }

  .grow path {
    stroke-dasharray: 1;
    stroke-dashoffset: 1;
    animation: draw var(--dur) var(--delay) linear forwards;
  }
  .grow circle {
    opacity: 0;
    animation: show 0.2s forwards;
  }
  .grow .junction {
    animation-delay: var(--delay);
  }
  .grow .via {
    animation-delay: calc(var(--delay) + var(--dur));
  }
  @keyframes draw {
    to {
      stroke-dashoffset: 0;
    }
  }
  @keyframes show {
    to {
      opacity: 1;
    }
  }
  @media (prefers-reduced-motion: reduce) {
    .grow path,
    .grow circle {
      animation: none;
      stroke-dashoffset: 0;
      opacity: 1;
    }
  }
</style>
