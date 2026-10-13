<script lang="ts">
  // A chord box as chord charts draw it: strings upright (lowest on the left),
  // frets across, the nut as a thick bar (or the starting fret's number), x and
  // o above muted and open strings, finger numbers in the dots, and a barre as
  // one bar across the strings it holds down.
  interface Props {
    /** Per string, string 1 (highest) first; null = muted. */
    frets: (number | null)[];
    fingers?: (number | null)[];
    barre?: { fret: number; fromString: number; toString: number };
    label: string;
  }
  let { frets, fingers = [], barre, label }: Props = $props();

  const n = $derived(frets.length);
  const fretted = $derived(frets.filter((f): f is number => f !== null && f > 0));
  // Five frets shown; from the nut when the shape fits, else from its lowest fret.
  const first = $derived(fretted.length && Math.max(...fretted) > 5 ? Math.min(...fretted) : 1);
  const ROWS = 5;
  const W = 120;
  const H = 150;
  const L = 22;
  const T = 30;
  const gap = $derived((W - L - 12) / Math.max(1, n - 1));
  const rowH = (H - T - 10) / ROWS;
  /** x of string s (1 = highest, drawn on the right). */
  const xOf = (s: number) => L + (n - s) * gap;
  const yOf = (f: number) => T + (f - first + 0.5) * rowH;
</script>

<svg viewBox="0 0 {W} {H}" class="h-auto w-full" role="img" aria-label={label}>
  {#if first === 1}
    <rect x={L - 2} y={T - 5} width={(n - 1) * gap + 4} height="6" rx="1.5" class="nut" />
  {:else}
    <text x={L - 8} y={T + rowH * 0.62} class="fretno" text-anchor="end">{first}</text>
  {/if}
  {#each Array.from({ length: ROWS + 1 }, (_, i) => i) as i (i)}
    <line x1={L} x2={L + (n - 1) * gap} y1={T + i * rowH} y2={T + i * rowH} class="fret" />
  {/each}
  {#each Array.from({ length: n }, (_, i) => i + 1) as s (s)}
    <line x1={xOf(s)} x2={xOf(s)} y1={T} y2={T + ROWS * rowH} class="string" />
    {#if frets[s - 1] === null}
      <text x={xOf(s)} y={T - 10} class="mark" text-anchor="middle">×</text>
    {:else if frets[s - 1] === 0}
      <circle cx={xOf(s)} cy={T - 13} r="4" class="open" />
    {/if}
  {/each}
  {#if barre}
    <rect x={xOf(barre.toString) - 7} y={yOf(barre.fret) - 7} width={xOf(barre.fromString) - xOf(barre.toString) + 14} height="14" rx="7" class="dot" />
  {/if}
  {#each frets as f, i (i)}
    {#if f !== null && f > 0 && !(barre && f === barre.fret && i + 1 >= barre.fromString && i + 1 <= barre.toString)}
      <circle cx={xOf(i + 1)} cy={yOf(f)} r="7" class="dot" />
      {#if fingers[i]}<text x={xOf(i + 1)} y={yOf(f) + 3.5} class="finger" text-anchor="middle">{fingers[i]}</text>{/if}
    {/if}
  {/each}
  {#if barre}
    <text x={(xOf(barre.toString) + xOf(barre.fromString)) / 2} y={yOf(barre.fret) + 3.5} class="finger" text-anchor="middle">1</text>
  {/if}
</svg>

<style>
  .nut {
    fill: var(--ws-ink);
  }
  .fret,
  .string {
    stroke: color-mix(in oklch, var(--ws-ink) 55%, transparent);
    stroke-width: 1.2;
  }
  .string {
    stroke-width: 1.4;
  }
  .dot {
    fill: var(--instr-ink, var(--ws-ink));
  }
  .finger {
    fill: var(--ws-surface, white);
    font-size: 9px;
    font-weight: 700;
  }
  .open {
    fill: none;
    stroke: var(--ws-ink);
    stroke-width: 1.4;
  }
  .mark,
  .fretno {
    fill: var(--ws-ink);
    font-size: 11px;
    font-weight: 600;
  }
</style>
