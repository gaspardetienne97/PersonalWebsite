<script lang="ts">
  import type { ReadingSummary as Summary } from "@repo/music-core/engines/reading-session";
  import { writtenPitchName } from "@repo/music-core/engines/notation";
  import type { NoteReadingPrompt } from "@repo/music-core/exercises/note-reading";
  import type { SightReadingPrompt } from "@repo/music-core/exercises/sight-reading";
  import { Button } from "@repo/ui/button";
  import * as Card from "@repo/ui/card";

  import AdaptiveRetryBar from "../../../_components/AdaptiveRetryBar.svelte";

  let {
    summary,
    bpm,
    onRepeat,
    onTempo,
    onMissedGroups,
  }: {
    summary: Summary;
    bpm: number;
    onRepeat: () => void;
    onTempo: (bpm: number) => void;
    onMissedGroups?: () => void;
  } = $props();

  function label(prompt: NoteReadingPrompt | SightReadingPrompt): string {
    if ("writtenPitches" in prompt) {
      return prompt.writtenPitches.map((pitch) => writtenPitchName(pitch, true)).join(" ");
    }
    return `${prompt.options.instrument} sight reading · ${prompt.groups.length} groups`;
  }

  function hasSightReading(summary: Summary): boolean {
    return summary.results.some(({ prompt }) => "groups" in prompt);
  }

  function hasMissedSightReadingGroups(summary: Summary): boolean {
    return summary.results.some(({ prompt, result }) => {
      if (!("groups" in prompt)) return false;
      const answer = result.answer;
      return (
        answer !== undefined &&
        typeof answer === "object" &&
        Array.isArray((answer as { missedGroups?: unknown }).missedGroups) &&
        (answer as { missedGroups: unknown[] }).missedGroups.length > 0
      );
    });
  }
</script>

<section class="grid gap-6">
  <header class="space-y-2">
    <p class="text-sm font-medium uppercase tracking-wide text-muted-foreground">Session complete</p>
    <h2 class="text-3xl font-bold tracking-tight">{summary.correct} of {summary.total} correct</h2>
    <p class="text-muted-foreground">
      {Math.round(summary.accuracy * 100)}% accuracy · {summary.xp} XP earned
    </p>
  </header>

  <Card.Root>
    <Card.Header>
      <Card.Title>Recent results</Card.Title>
      <Card.Description>The latest written notes from this session.</Card.Description>
    </Card.Header>
    <Card.Content>
      <ol class="grid gap-2 text-sm">
        {#each summary.results.slice(-5).reverse() as item}
          <li class="flex items-center justify-between gap-3 rounded-md border px-3 py-2">
            <span>{label(item.prompt)}</span>
            <span class={item.result.correct ? "text-foreground" : "text-muted-foreground"}>
              {item.result.correct ? "Correct" : "Review"}
            </span>
          </li>
        {/each}
      </ol>
    </Card.Content>
  </Card.Root>

  <div class="flex flex-wrap items-center gap-2">
    {#if hasSightReading(summary)}
      <Button type="button" disabled={bpm >= 200} onclick={() => onTempo(Math.min(200, bpm + 10))}>
        Increase to {Math.min(200, bpm + 10)} BPM
      </Button>
      <Button type="button" variant="outline" onclick={() => onTempo(bpm)}>
        Repeat at {bpm} BPM
      </Button>
      <Button type="button" variant="outline" disabled={bpm <= 40} onclick={() => onTempo(Math.max(40, bpm - 10))}>
        Slow to {Math.max(40, bpm - 10)} BPM
      </Button>
      {#if hasMissedSightReadingGroups(summary)}
        <Button type="button" variant="outline" onclick={onMissedGroups}>
          Practice missed groups
        </Button>
      {/if}
    {:else}
      <AdaptiveRetryBar onRetry={onRepeat} retryLabel="Repeat session" />
    {/if}
    <Button href="/music" variant="ghost">Return to Practice</Button>
  </div>
</section>
