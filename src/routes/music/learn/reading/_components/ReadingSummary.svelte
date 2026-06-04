<script lang="ts">
  import type { ReadingSummary as Summary } from "@repo/music-core/engines/reading-session";
  import { writtenPitchName } from "@repo/music-core/engines/notation";
  import type { NoteReadingPrompt } from "@repo/music-core/exercises/note-reading";
  import type { SightReadingPrompt } from "@repo/music-core/exercises/sight-reading";
  import { Button } from "@repo/ui/button";
  import * as Card from "@repo/ui/card";

  let { summary, onRepeat }: { summary: Summary; onRepeat: () => void } = $props();

  function label(prompt: NoteReadingPrompt | SightReadingPrompt): string {
    if ("writtenPitches" in prompt) {
      return prompt.writtenPitches.map((pitch) => writtenPitchName(pitch, true)).join(" ");
    }
    return `${prompt.options.instrument} sight reading · ${prompt.groups.length} groups`;
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

  <div class="flex flex-wrap gap-2">
    <Button type="button" onclick={onRepeat}>Repeat session</Button>
    <Button href="/music/learn" variant="ghost">Return to Learn</Button>
  </div>
</section>
