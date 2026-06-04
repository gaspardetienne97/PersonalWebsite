<script lang="ts">
  import type { EarTrainingSessionState } from "@repo/music-core/engines/ear-training";
  import * as Card from "@repo/ui/card";
  import { Progress } from "@repo/ui/progress";

  let { state, streak }: { state: EarTrainingSessionState; streak: number } = $props();
  const promptNumber = $derived(Math.min(state.currentIndex + 1, state.queue.length));
</script>

<Card.Root>
  <Card.Header class="gap-3">
    <div class="flex items-center justify-between gap-3">
      <Card.Description>Session</Card.Description>
      <span class="text-sm font-semibold">{promptNumber} / {state.queue.length}</span>
    </div>
    <Progress value={state.currentIndex} max={state.queue.length} />
  </Card.Header>
  <Card.Content class="grid gap-4">
    <div class="grid grid-cols-2 gap-3 text-sm">
      <div class="rounded-md border p-3">
        <span class="block text-xl font-semibold">{state.sessionXp}</span>
        <span class="text-muted-foreground">Session XP</span>
      </div>
      <div class="rounded-md border p-3">
        <span class="block text-xl font-semibold">{streak}</span>
        <span class="text-muted-foreground">Streak</span>
      </div>
    </div>

    <div class="space-y-2">
      <p class="text-sm font-medium">Recent answers</p>
      {#if state.results.length > 0}
        <ol class="grid gap-2">
          {#each state.results.slice(-4).reverse() as item}
            <li class="flex items-center justify-between gap-3 rounded-md border px-3 py-2 text-sm">
              <span class="truncate capitalize">{item.drill.replace("-", " ")}</span>
              <span class={item.result.correct ? "text-foreground" : "text-muted-foreground"}>
                {item.result.correct ? "Correct" : "Review"}
              </span>
            </li>
          {/each}
        </ol>
      {:else}
        <p class="text-sm text-muted-foreground">No answers yet.</p>
      {/if}
    </div>
  </Card.Content>
</Card.Root>
