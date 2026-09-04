<script lang="ts">
  import type { EarTrainingSessionState } from "@repo/music-core/engines/ear-training";

  import HudTile from "../../../_components/HudTile.svelte";

  let { state, streak }: { state: EarTrainingSessionState; streak: number } = $props();
  const promptNumber = $derived(Math.min(state.currentIndex + 1, state.queue.length));
</script>

<div class="grid gap-3">
  <div class="grid grid-cols-3 gap-3">
    <HudTile size="sm" label="Prompt" value={`${promptNumber} / ${state.queue.length}`} />
    <HudTile size="sm" label="Session XP" value={state.sessionXp} />
    <HudTile size="sm" label="Streak" value={streak} unit="days" />
  </div>
  <div class="grid gap-2 rounded-lg border bg-card px-4 py-3 text-sm">
    <p class="eyebrow">Recent answers</p>
    {#if state.results.length > 0}
      <ol class="grid gap-1">
        {#each state.results.slice(-4).reverse() as item, index (index)}
          <li class="flex items-center justify-between gap-3">
            <span class="truncate capitalize">{item.drill.replace("-", " ")}</span>
            <span class={item.result.correct ? "font-medium text-success" : "font-medium text-warn"}>
              {item.result.correct ? "Correct" : "Review"}
            </span>
          </li>
        {/each}
      </ol>
    {:else}
      <p class="text-muted-foreground">No answers yet.</p>
    {/if}
  </div>
</div>
