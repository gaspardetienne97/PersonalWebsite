<!--
  The logo and the initials share one drawing. The mark is a G and an E laid on
  one ring (the G opens at the top right, the E's bar comes in from the left).
  `spelled` slides them apart and routes an M between them like a trace.

  Glyphs are drawn around their own centre: ring radius 270, stroke 60, so each
  letter is a 600 unit square. The intro puts a frosted veil behind the drawing so
  the circuit traces run on underneath, softened rather than cut out.
-->
<script lang="ts">
  let {
    spelled = false,
    instant = false,
    class: className = "",
  }: { spelled?: boolean; instant?: boolean; class?: string } = $props();

  const uid = $props.id();

  const ring = 270;
  const d = 190.92; // ring * cos(45°)
  const G = [`M ${ring} 0 A ${ring} ${ring} 0 1 1 ${d} ${-d}`, "M 300 0 H 35"];
  const E = [`M ${d} ${d} A ${ring} ${ring} 0 1 1 ${d} ${-d}`, "M -300 0 H -35"];
  const M = "M -240 300 V -240 L 0 0 L 240 -240 V 300";
</script>

{#snippet glyphs()}
  {@const stroke = `url(#${uid}-ring)`}
  <g class="glyph g-left">
    {#each G as path (path)}
      <path d={path} {stroke} />
    {/each}
  </g>
  <g class="glyph g-right">
    {#each E as path (path)}
      <path d={path} {stroke} />
    {/each}
  </g>
  <g class="glyph g-mid">
    <path d={M} class="trace" {stroke} pathLength="1" />
  </g>
{/snippet}

<svg
  class="gme {className}"
  class:spelled
  class:instant
  viewBox="0 0 2100 680"
  role="img"
  aria-label={spelled ? "G M E" : "Gaspard Etienne logo"}
>
  <defs>
    <linearGradient id="{uid}-ring" gradientUnits="userSpaceOnUse" x1="0" y1="-300" x2="0" y2="300">
      <stop offset="0" stop-color="#2bc4ff" />
      <stop offset="0.22" stop-color="#c531f2" />
      <stop offset="0.48" stop-color="#ff1f2a" />
      <stop offset="0.68" stop-color="#ff6fa6" />
      <stop offset="0.85" stop-color="#a98bff" />
      <stop offset="1" stop-color="#1fa2ff" />
    </linearGradient>
  </defs>
  {@render glyphs()}
</svg>

<style>
  .gme {
    display: block;
    overflow: visible;
    --ease: cubic-bezier(0.65, 0, 0.25, 1);
  }
  path {
    fill: none;
    stroke-width: 60;
    stroke-linecap: butt;
    stroke-linejoin: miter;
    stroke-miterlimit: 2;
  }
  .glyph {
    transform-box: view-box;
    transform-origin: 0 0;
    /* Logo: G and E stacked in the middle, drawn larger. */
    transform: translate(1050px, 340px) scale(1.45);
    transition: transform 1s var(--ease);
  }
  .trace {
    stroke-dasharray: 1 1;
    stroke-dashoffset: 1;
    transition: stroke-dashoffset 0.25s linear;
  }

  .spelled .g-left {
    transform: translate(340px, 340px) scale(1);
  }
  .spelled .g-right {
    transform: translate(1760px, 340px) scale(1);
  }
  .spelled .g-mid {
    transform: translate(1050px, 340px) scale(1);
  }
  .spelled .trace {
    stroke-dashoffset: 0;
    transition: stroke-dashoffset 0.9s 0.45s var(--ease);
  }

  .instant .glyph,
  .instant .trace {
    transition: none;
  }

  @media (prefers-reduced-motion: reduce) {
    .glyph,
    .trace {
      transition: none !important;
    }
  }
</style>
