<script lang="ts">
  // Every chord of a cycle as a diagram on the stage, the one to play now ringed.
  import type { ChordPosition } from "@repo/music-core/data/index";
  import ChordDiagram from "#lib/music/components/ChordDiagram.svelte";
  import { shortPosition } from "./chords";

  let { shapes, names, current = null }: { shapes: ChordPosition[]; names: string[]; current?: number | null } = $props();
  // One chord in several places (its CAGED forms): each says where it sits.
  const repeated = (name: string) => names.filter((n) => n === name).length > 1;
</script>

<ol class="-mx-1 mb-3 flex gap-2 overflow-x-auto px-1 pb-1 [scrollbar-width:thin]" aria-label="The chords in order">
  {#each shapes as sh, i (i)}
    <li class="flex w-20 shrink-0 flex-col items-center gap-0.5 rounded-xl bg-ws-surface p-1.5 text-ws-ink {current === i ? 'ring-3 ring-instr' : ''}" aria-current={current === i ? "step" : undefined}>
      <ChordDiagram frets={sh.frets} fingers={sh.fingers} barre={sh.barre} label="{names[i]}, {sh.positionLabel}" />
      <span class="text-sm font-semibold">{names[i]}</span>
      {#if repeated(names[i])}<span class="text-[13px] text-ws-soft">{shortPosition(sh.positionLabel)}</span>{/if}
    </li>
  {/each}
</ol>
