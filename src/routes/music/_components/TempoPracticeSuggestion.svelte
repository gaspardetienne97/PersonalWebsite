<script lang="ts">
  import { tempoPracticePlan, type TempoLadderOptions } from "@repo/music-core/engines/projection";
  import AdaptiveRetryBar from "./AdaptiveRetryBar.svelte";

  let { bpm, clean, basis, onPractice, options = { startBpm: 60, stepBpm: 20, rungs: 4 } }: {
    bpm: number;
    clean: boolean;
    basis: string;
    onPractice: (bpm: number) => void;
    options?: TempoLadderOptions;
  } = $props();
  const plan = $derived(tempoPracticePlan(bpm, clean, options));
</script>

<div class="grid w-full min-w-0 gap-2" role="group" aria-label="Tempo ladder">
  <p class="eyebrow">Next practice tempo · {plan.nextBpm} BPM</p>
  <p class="text-xs text-muted-foreground">{basis} Suggested tempos are practice options, not earned milestones.</p>
  <div class="flex flex-wrap gap-2">
    {#each plan.rungs.filter((rung) => Math.abs(rung.bpm - bpm) <= options.stepBpm * 2) as rung (rung.bpm)}
      <span class="rounded-md border px-2 py-1 text-xs tabular-nums" class:font-semibold={rung.status === "target"}>
        {rung.bpm} BPM · {rung.status === "target" ? "Suggested" : rung.status === "unlocked" ? "Available" : "Later"}
      </span>
    {/each}
  </div>
  <AdaptiveRetryBar
    retryLabel="Again" onRetry={() => onPractice(bpm)}
    onSlower={plan.slowerBpm < bpm ? () => onPractice(plan.slowerBpm) : undefined}
    onContinue={plan.nextBpm > bpm ? () => onPractice(plan.nextBpm) : undefined}
    continueLabel={`Try ${plan.nextBpm} BPM`}
  />
</div>
