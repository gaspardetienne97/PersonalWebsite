<script lang="ts">
  import type { ScorePracticeSummary } from "@repo/music-core/engines/score-practice";
  import * as Card from "@repo/ui/card";

  let { summary }: { summary: ScorePracticeSummary } = $props();
</script>

<Card.Root>
  <Card.Header>
    <Card.Description>Session feedback</Card.Description>
    <Card.Title>Practice complete</Card.Title>
  </Card.Header>
  <Card.Content class="grid gap-5">
    <div class="grid grid-cols-2 gap-3 sm:grid-cols-4">
      <div class="rounded-md border p-3">
        <p class="text-xs text-muted-foreground">Score</p>
        <strong class="text-xl">{Math.round(summary.aggregateScore * 100)}%</strong>
      </div>
      <div class="rounded-md border p-3">
        <p class="text-xs text-muted-foreground">Pitch</p>
        <strong class="text-xl">{Math.round(summary.pitchCompletion * 100)}%</strong>
      </div>
      <div class="rounded-md border p-3">
        <p class="text-xs text-muted-foreground">Timing</p>
        <strong class="text-xl">
          {summary.meanAbsoluteTimingErrorMs === undefined
            ? "—"
            : `${Math.round(summary.meanAbsoluteTimingErrorMs)}ms`}
        </strong>
      </div>
      <div class="rounded-md border p-3">
        <p class="text-xs text-muted-foreground">Best take</p>
        <strong class="text-xl">{summary.bestTake ?? "—"}</strong>
      </div>
    </div>

    <div class="grid gap-2 text-sm">
      {#each summary.takes as take (take.take)}
        <div class="flex items-center justify-between gap-3 rounded-md border px-3 py-2">
          <span>Take {take.take}</span>
          <strong>{Math.round(take.score * 100)}%</strong>
        </div>
      {/each}
    </div>

    <p class="text-sm text-muted-foreground">
      {summary.onTimeNotes} on time · {summary.earlyNotes} early · {summary.lateNotes}
      late · {summary.missedNotes} missed · {summary.extraNotes} extra
    </p>
  </Card.Content>
</Card.Root>
