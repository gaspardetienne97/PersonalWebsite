<script lang="ts">
  // The same chord at other places up the neck (position 0 is the curated shape).
  import type { ChordPosition } from "@repo/music-core/data/index";
  import { btnStage } from "$lib/music/components/ui";

  let { positions, index, onchange, disabled = false }: { positions: ChordPosition[]; index: number; onchange: (i: number) => void; disabled?: boolean } = $props();
  const at = $derived(Math.min(index, Math.max(0, positions.length - 1)));
</script>

{#if positions.length > 1}
  <div class="flex flex-wrap items-center gap-2" role="group" aria-label="Neck position">
    <button type="button" class={btnStage} disabled={disabled || at === 0} onclick={() => onchange(at - 1)}>Lower</button>
    <p class="min-w-40 text-center text-sm">
      <span class="font-semibold">{positions[at].positionLabel}</span><span class="text-ws-stage-soft">, position {at + 1} of {positions.length}</span>
    </p>
    <button type="button" class={btnStage} disabled={disabled || at === positions.length - 1} onclick={() => onchange(at + 1)}>Higher</button>
  </div>
{/if}
