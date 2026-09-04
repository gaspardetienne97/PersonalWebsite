<script lang="ts" module>
  import type { ReadingSummary as Summary } from "@repo/music-core/engines/reading-session";

  export function hasSightReading(summary: Summary): boolean {
    return summary.results.some(({ prompt }) => "groups" in prompt);
  }

  export function hasMissedSightReadingGroups(summary: Summary): boolean {
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

<script lang="ts">
  import { writtenPitchName } from "@repo/music-core/engines/notation";
  import type { NoteReadingPrompt } from "@repo/music-core/exercises/note-reading";
  import type { SightReadingPrompt } from "@repo/music-core/exercises/sight-reading";

  // The results body: one chip per prompt. The frame, metric, delta and
  // actions belong to the route's DrillSummaryCard.
  let { summary }: { summary: Summary } = $props();

  function label(prompt: NoteReadingPrompt | SightReadingPrompt): string {
    if ("writtenPitches" in prompt) {
      return prompt.writtenPitches.map((pitch) => writtenPitchName(pitch, true)).join(" ");
    }
    return `Phrase · ${prompt.groups.length} groups`;
  }
</script>

<div class="grid gap-2">
  <p class="eyebrow">Per prompt</p>
  <ol class="grid grid-cols-2 gap-1 sm:grid-cols-5" aria-label="Prompt results">
    {#each summary.results as item, index (index)}
      <li
        class="rounded-md px-2 py-1.5 text-center text-xs font-semibold {item.result.correct
          ? 'bg-success/15 text-success'
          : 'bg-warn/15 text-warn'}"
      >
        {label(item.prompt)}
        <span class="sr-only">{item.result.correct ? ", correct" : ", review"}</span>
      </li>
    {/each}
  </ol>
</div>
<p class="text-xs text-muted-foreground">
  {summary.total} prompts · +{summary.xp} XP · Reading
</p>
