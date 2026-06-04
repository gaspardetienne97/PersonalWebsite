<script lang="ts">
  import type { EarTrainingSummary as Summary } from "@repo/music-core/engines/ear-training";
  import { Button } from "@repo/ui/button";
  import * as Card from "@repo/ui/card";

  let {
    summary,
    onRepeat,
    onRetry,
  }: { summary: Summary; onRepeat: () => void; onRetry: () => void } = $props();
</script>

<section class="grid gap-6">
  <header class="space-y-2">
    <p class="text-sm font-medium uppercase tracking-wide text-muted-foreground">Session complete</p>
    <h2 class="text-3xl font-bold tracking-tight">
      {summary.correct} of {summary.total} correct
    </h2>
    <p class="text-muted-foreground">
      {Math.round(summary.accuracy * 100)}% accuracy · {summary.xp} XP earned
    </p>
  </header>

  <section class="grid gap-4 sm:grid-cols-3" aria-label="Accuracy by drill">
    {#each Object.entries(summary.byDrill) as [drill, result]}
      <Card.Root>
        <Card.Header>
          <Card.Description class="capitalize">{drill.replace("-", " ")}</Card.Description>
          <Card.Title>{Math.round(result.accuracy * 100)}%</Card.Title>
        </Card.Header>
      </Card.Root>
    {/each}
  </section>

  <Card.Root>
    <Card.Header>
      <Card.Title>Recent results</Card.Title>
      <Card.Description>Your latest prompts from this session.</Card.Description>
    </Card.Header>
    <Card.Content>
      <ol class="grid gap-2 text-sm">
        {#each summary.recentResults.slice(-5).reverse() as item}
          <li class="flex items-center justify-between gap-3 rounded-md border px-3 py-2">
            <span class="truncate">{item.prompt.answerLabel}</span>
            <span class={item.result.correct ? "text-foreground" : "text-muted-foreground"}>
              {item.result.correct ? "Correct" : "Review"}
            </span>
          </li>
        {/each}
      </ol>
    </Card.Content>
  </Card.Root>

  {#if summary.confusions.length > 0}
    <Card.Root>
      <Card.Header>
        <Card.Title>Review next</Card.Title>
        <Card.Description>Sounds that were substituted during this session.</Card.Description>
      </Card.Header>
      <Card.Content>
        <ul class="grid gap-2 text-sm">
          {#each summary.confusions as confusion}
            <li class="rounded-md border px-3 py-2">
              {confusion.expected} → {confusion.actual} · {confusion.count}x
            </li>
          {/each}
        </ul>
      </Card.Content>
    </Card.Root>
  {/if}

  <div class="flex flex-wrap gap-2">
    {#if summary.confusions.length > 0}
      <Button type="button" onclick={onRetry}>Retry mistakes</Button>
    {/if}
    <Button type="button" variant="outline" onclick={onRepeat}>Repeat session</Button>
    <Button href="/music/learn" variant="ghost">Return to Learn</Button>
  </div>
</section>
