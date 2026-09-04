<script lang="ts">
  import type { Hue } from "./musicCatalog";

  // Decorative pattern for a card's hue plate: one motif per skill or
  // instrument family, drawn in the current text colour so it tints with the
  // plate. Always aria-hidden; the card's text carries the meaning.
  let { hue, class: cls = "" }: { hue: Hue; class?: string } = $props();
</script>

<svg
  viewBox="0 0 200 100"
  preserveAspectRatio="xMidYMid slice"
  class={cls}
  aria-hidden="true"
  focusable="false"
>
  {#if hue === "ear"}
    <g fill="none" stroke="currentColor" stroke-width="2" opacity="0.35">
      {#each [16, 30, 44, 58] as r (r)}<circle cx="150" cy="60" {r} />{/each}
    </g>
  {:else if hue === "rhythm"}
    <g fill="currentColor" opacity="0.35">
      {#each Array.from({ length: 12 }, (_, i) => i) as i (i)}
        <rect x={20 + i * 14} y={45 - (i % 3) * 10} width="7" height={18 + (i % 3) * 10} rx="2" />
      {/each}
    </g>
  {:else if hue === "harmony"}
    <g fill="currentColor" opacity="0.35">
      {#each [0, 1, 2, 3] as i (i)}<circle cx={130 + i * 12} cy={86 - i * 18} r="9" />{/each}
    </g>
  {:else if hue === "reading"}
    <g stroke="currentColor" stroke-width="1.5" opacity="0.4">
      {#each [0, 1, 2, 3, 4] as i (i)}<line x1="10" x2="190" y1={38 + i * 9} y2={38 + i * 9} />{/each}
    </g>
    <g fill="currentColor" opacity="0.5">
      <ellipse cx="70" cy="56" rx="7" ry="5" /><ellipse cx="120" cy="47" rx="7" ry="5" />
    </g>
  {:else if hue === "technique"}
    <g fill="currentColor" opacity="0.4">
      {#each Array.from({ length: 10 }, (_, i) => i) as i (i)}
        <rect x={12 + i * 18} y={70 - i * 4} width="10" height={20 + i * 4} rx="2" />
      {/each}
    </g>
  {:else if hue === "piano"}
    <g fill="currentColor" opacity="0.35">
      {#each Array.from({ length: 7 }, (_, i) => i) as i (i)}
        <rect x={10 + i * 26} y="30" width="22" height="60" rx="3" />
      {/each}
    </g>
  {:else if hue === "guitar" || hue === "ukulele"}
    <g stroke="currentColor" opacity="0.45">
      {#each Array.from({ length: hue === "guitar" ? 6 : 4 }, (_, i) => i) as i (i)}
        <line x1="0" x2="200" y1={25 + i * 12} y2={25 + i * 12} stroke-width={1 + i * 0.4} />
      {/each}
      {#each [40, 80, 120, 160] as x (x)}<line x1={x} x2={x} y1="20" y2="90" stroke-width="2" />{/each}
    </g>
  {:else if hue === "mpc"}
    <g fill="currentColor" opacity="0.35">
      {#each Array.from({ length: 16 }, (_, i) => i) as i (i)}
        <rect x={120 + (i % 4) * 18} y={22 + Math.floor(i / 4) * 18} width="14" height="14" rx="3" />
      {/each}
    </g>
  {:else if hue === "aerophone"}
    <g fill="currentColor" opacity="0.4">
      {#each [0, 1, 2, 3, 4, 5] as i (i)}<circle cx={30 + i * 28} cy="60" r={i % 2 ? 6 : 9} />{/each}
    </g>
  {:else}
    <path
      d="M0 60 C 25 20, 50 100, 75 60 S 125 20, 150 60 S 200 100, 225 60"
      fill="none"
      stroke="currentColor"
      stroke-width="3"
      opacity="0.45"
    />
  {/if}
</svg>
