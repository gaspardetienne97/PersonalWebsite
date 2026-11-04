<script lang="ts">
  // A chord box as chord charts draw it: strings upright (lowest on the left),
  // frets across, the nut as a thick bar (or the starting fret's number), x and
  // o above muted and open strings, finger numbers in the dots (in the fingers'
  // colours), and a barre as one bar across the strings it holds down.
  interface Props {
    /** Per string, string 1 (highest) first; null = muted. */
    frets: (number | null)[];
    fingers?: (number | null)[];
    barre?: { fret: number; fromString: number; toString: number };
    /** Empty when a parent (a button) names the chord. */
    label: string;
    /** Finger numbers in the dots; off on a small thumbnail, where only the colours show. */
    numbers?: boolean;
  }
  let { frets, fingers = [], barre, label, numbers = true }: Props = $props();

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
  /** The barre's finger: the shape's own on its strings, else the index. */
  const barreFinger = $derived(barre ? (fingers[barre.fromString - 1] ?? fingers[barre.toString - 1] ?? 1) : 1);
  const fill = (f: number | null | undefined) => (f && f >= 1 && f <= 4 ? `var(--finger-${f})` : undefined);
</script>

<svg viewBox="0 0 {W} {H}" class="h-auto w-full" role={label ? "img" : undefined} aria-label={label || undefined} aria-hidden={label ? undefined : "true"}>
  {#if first === 1}
    <rect x={L - 2} y={T - 5} width={(n - 1) * gap + 4} height="6" rx="1.5" class="nut" />
  {:else}
    <text x={L - 4} y={T + rowH * 0.62} class="fretno" text-anchor="end">{first}</text>
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
    <rect x={xOf(barre.toString) - 8.5} y={yOf(barre.fret) - 8.5} width={xOf(barre.fromString) - xOf(barre.toString) + 17} height="17" rx="8.5" class="dot" style:fill={fill(barreFinger)} />
  {/if}
  {#each frets as f, i (i)}
    {#if f !== null && f > 0 && !(barre && f === barre.fret && i + 1 >= barre.fromString && i + 1 <= barre.toString)}
      <circle cx={xOf(i + 1)} cy={yOf(f)} r="8.5" class="dot" style:fill={fill(fingers[i])} />
      {#if numbers && fingers[i]}<text x={xOf(i + 1)} y={yOf(f) + 4.5} class="finger" class:on-colour={!!fill(fingers[i])} text-anchor="middle">{fingers[i]}</text>{/if}
    {/if}
  {/each}
  {#if barre && numbers}
    <text x={(xOf(barre.toString) + xOf(barre.fromString)) / 2} y={yOf(barre.fret) + 4.5} class="finger" class:on-colour={!!fill(barreFinger)} text-anchor="middle">{barreFinger}</text>
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
    /* Pale finger colours keep an edge on a white chart. */
    stroke: color-mix(in oklch, var(--ws-ink) 45%, transparent);
    stroke-width: 0.8;
  }
  .finger {
    fill: var(--ws-surface, white);
    font-size: 13px;
    font-weight: 700;
  }
  .finger.on-colour {
    fill: #1b120b;
  }
  .open {
    fill: none;
    stroke: var(--ws-ink);
    stroke-width: 1.4;
  }
  .mark,
  .fretno {
    fill: var(--ws-ink);
    font-size: 13px;
    font-weight: 600;
  }
</style>
