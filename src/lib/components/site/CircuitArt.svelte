<!--
  Cover art for projects and posts: a few chips on a board with traces grown out
  of their pins (fanning out, then branching across the free space). The seed (usually the slug) fixes the drawing, so it renders
  the same on the server and in the browser. An optional icon sits on the main chip.
-->
<script lang="ts">
  import type Piano from "@lucide/svelte/icons/piano";
  import { growCircuit, hashString, mulberry32, toPathData } from "#lib/circuit/router.ts";

  let {
    seed,
    colors,
    icon: Icon,
    width = 640,
    height = 400,
    class: className = "",
  }: {
    seed: string;
    colors: string[];
    /** Any lucide icon, drawn on the main chip. */
    icon?: typeof Piano;
    width?: number;
    height?: number;
    class?: string;
  } = $props();

  const PITCH = 16;

  type Chip = { x: number; y: number; w: number; h: number };

  const art = $derived.by(() => {
    const rand = mulberry32(hashString(seed));
    const snap = (n: number) => Math.round(n / PITCH) * PITCH;

    // The main chip sits near the middle, two satellites somewhere around it.
    const main: Chip = {
      w: snap(width * 0.26),
      h: snap(height * 0.34),
      x: snap(width * (0.34 + rand() * 0.16)),
      y: snap(height * (0.26 + rand() * 0.16)),
    };
    const chips: Chip[] = [main];
    for (let tries = 0; chips.length < 3 && tries < 40; tries++) {
      const w = snap(width * (0.1 + rand() * 0.06));
      const h = snap(height * (0.1 + rand() * 0.08));
      const c = {
        w,
        h,
        x: snap(PITCH * 2 + rand() * (width - w - PITCH * 4)),
        y: snap(PITCH * 2 + rand() * (height - h - PITCH * 4)),
      };
      const clear = chips.every(
        (o) =>
          c.x > o.x + o.w + PITCH * 3 ||
          c.x + c.w + PITCH * 3 < o.x ||
          c.y > o.y + o.h + PITCH * 3 ||
          c.y + c.h + PITCH * 3 < o.y,
      );
      if (clear) chips.push(c);
    }

    // Pins every other node along each edge, heading straight out.
    const starts = chips.flatMap((c, ci) => {
      const pins: { x: number; y: number; dir: number; color: string }[] = [];
      const pick = () => colors[Math.floor(rand() * colors.length)];
      const step = ci === 0 ? PITCH : PITCH * 2;
      for (let x = c.x + PITCH / 2; x < c.x + c.w; x += step) {
        if (rand() < 0.6) pins.push({ x, y: c.y - 1, dir: 6, color: pick() });
        if (rand() < 0.6) pins.push({ x, y: c.y + c.h + 1, dir: 2, color: pick() });
      }
      for (let y = c.y + PITCH / 2; y < c.y + c.h; y += step) {
        if (rand() < 0.6) pins.push({ x: c.x - 1, y, dir: 4, color: pick() });
        if (rand() < 0.6) pins.push({ x: c.x + c.w + 1, y, dir: 0, color: pick() });
      }
      return pins;
    });

    const board = growCircuit({
      width,
      height,
      pitch: PITCH,
      roots: starts,
      seed: hashString(seed + ":traces"),
      blocked: (x, y) =>
        chips.some((c) => x > c.x - 4 && x < c.x + c.w + 4 && y > c.y - 4 && y < c.y + c.h + 4),
      density: 0.16,
      reach: 6,
      fanOut: [1, 3],
      margin: 0,
    });
    return { chips, board, main };
  });
</script>

<div class="art {className}" style="aspect-ratio: {width} / {height}; background-size: {(PITCH / width) * 100}% {(PITCH / height) * 100}%">
  <svg viewBox="0 0 {width} {height}" aria-hidden="true">
    {#each art.board.chains as chain, i (i)}
      {@const end = chain.points[chain.points.length - 1]}
      <path d={toPathData(chain.points)} stroke={chain.color} class="trace" />
      {#if chain.branch}
        <circle cx={chain.points[0].x} cy={chain.points[0].y} r="2.6" fill={chain.color} />
      {/if}
      <circle cx={end.x} cy={end.y} r="3.4" stroke={chain.color} class="via" />
    {/each}
    {#each art.chips as chip, i (i)}
      <rect x={chip.x} y={chip.y} width={chip.w} height={chip.h} rx={i === 0 ? 10 : 6} class="chip" />
      <circle cx={chip.x + 9} cy={chip.y + 9} r="2.6" class="dot" />
    {/each}
  </svg>
  {#if Icon}
    <span
      class="icon"
      style="left: {((art.main.x + art.main.w / 2) / width) * 100}%; top: {((art.main.y +
        art.main.h / 2) /
        height) *
        100}%"
    >
      <Icon size={36} strokeWidth={1.75} />
    </span>
  {/if}
</div>

<style>
  .art {
    position: relative;
    width: 100%;
    background-image: radial-gradient(circle, var(--gm-dot) 0.9px, transparent 1.4px);
  }
  svg {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
  }
  .trace {
    fill: none;
    stroke-width: 2.25;
    stroke-linecap: round;
    stroke-linejoin: round;
  }
  .via {
    fill: var(--muted);
    stroke-width: 2;
  }
  .chip {
    fill: var(--muted);
    stroke: var(--foreground);
    stroke-width: 2;
  }
  .dot {
    fill: var(--foreground);
  }
  .icon {
    position: absolute;
    translate: -50% -50%;
    color: var(--foreground);
    display: grid;
  }
</style>
