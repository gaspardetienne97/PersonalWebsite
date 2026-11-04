<script lang="ts">
  // The same chord at other places up the neck as a row of chord boxes, so the
  // shapes are seen before one is picked (position 0 is the open or curated shape).
  import type { ChordPosition } from "@repo/music-core/data/index";
  import ChordDiagram from "$lib/music/components/ChordDiagram.svelte";
  import { shortPosition } from "./chords";

  let { positions, index, onchange, symbol, disabled = false }: { positions: ChordPosition[]; index: number; onchange: (i: number) => void; symbol: string; disabled?: boolean } = $props();
  const at = $derived(Math.min(index, Math.max(0, positions.length - 1)));
</script>

{#if positions.length > 1}
  <div class="-mx-1 flex snap-x gap-2 overflow-x-auto px-1 pb-1 [scrollbar-width:thin]" role="group" aria-label="Neck position">
    {#each positions as p, i (p.id)}
      <button
        type="button"
        class="flex w-24 shrink-0 sm:w-28 snap-start flex-col items-center gap-0.5 rounded-xl bg-ws-surface p-1.5 text-ws-ink {i === at ? 'ring-3 ring-instr' : 'opacity-80 hover:opacity-100'}"
        aria-pressed={i === at}
        aria-label="{symbol}, {p.positionLabel}"
        {disabled}
        onclick={() => onchange(i)}
      >
        <ChordDiagram frets={p.frets} fingers={p.fingers} barre={p.barre} label="" numbers={i === at} />
        <span class="text-sm font-semibold leading-tight">{shortPosition(p.positionLabel)}</span>
      </button>
    {/each}
  </div>
{/if}
