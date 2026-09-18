<script lang="ts">
  import type { EarTrainingConfusion, EarTrainingSummary as Summary } from "@repo/music-core/engines/ear-training";
  import { scaleDegreeFreePlayChoices } from "@repo/music-core/exercises/scale-degree-recognition";
  import { intensityStep } from "@repo/music-core/engines/semantic-color";
  import * as Card from "@repo/ui/card";

  import HudTile from "../../../_components/HudTile.svelte";
  import PhraseResultFeedback from "./PhraseResultFeedback.svelte";

  // Results body only: the frame, metric, delta and actions belong to the
  // route's DrillSummaryCard.
  let { summary }: { summary: Summary } = $props();

  const degreeChoices = scaleDegreeFreePlayChoices({ tonicMidi: 60, scaleDegreeSet: "full-current" });
  function answerLabel(drill: EarTrainingConfusion["drill"], token: string): string {
    const choice = summary.recentResults
      .filter((item) => item.drill === drill)
      .flatMap((item) => item.prompt.choices)
      .find((choice) => choice.token === token);
    if (choice) return choice.label;
    if (drill === "scale-degree" || drill === "melody-dictation" || drill === "repertoire-transfer") {
      return degreeChoices.find((choice) => choice.token === token)?.label ?? token;
    }
    return token;
  }

  // Confusion intensity → a sequential heatmap over the error token.
  const maxConfusion = $derived(
    summary.confusions.reduce((max, c) => Math.max(max, c.count), 0),
  );
  const HEAT_BG = ["", "bg-destructive/10", "bg-destructive/20", "bg-destructive/35", "bg-destructive/50"];
</script>

<section class="grid gap-6">
  <div class="grid grid-cols-2 gap-3 sm:grid-cols-4" aria-label="Accuracy by drill">
    {#each Object.entries(summary.byDrill) as [drill, result] (drill)}
      <HudTile
        size="sm"
        label={drill.replace("-", " ")}
        value={Math.round(result.accuracy * 100)}
        unit="%"
        tone={result.accuracy >= 0.9 ? "good" : "default"}
      />
    {/each}
  </div>

  <Card.Root>
    <Card.Header>
      <Card.Title class="text-base">Recent results</Card.Title>
      <Card.Description>Your latest prompts from this session.</Card.Description>
    </Card.Header>
    <Card.Content>
      <ol class="grid gap-2 text-sm">
        {#each summary.recentResults.slice(-5).reverse() as item, i (i)}
          <li class="grid gap-3 rounded-md border px-3 py-2">
            <div class="flex items-center justify-between gap-3">
              <span class="truncate">{item.prompt.answerLabel}</span>
              <span class={item.result.correct ? "font-medium text-success" : "font-medium text-warn"}>
                {item.result.correct ? "Correct" : "Review"}
              </span>
            </div>
            {#if item.drill === "melody-dictation" || item.drill === "repertoire-transfer"}
              <PhraseResultFeedback result={item} />
            {/if}
          </li>
        {/each}
      </ol>
    </Card.Content>
  </Card.Root>

  {#if summary.confusions.length > 0}
    <Card.Root>
      <Card.Header>
        <Card.Title class="text-base">Review next</Card.Title>
        <Card.Description>Sounds that were substituted during this session.</Card.Description>
      </Card.Header>
      <Card.Content>
        <ul class="grid gap-2 text-sm">
          {#each summary.confusions as confusion (`${confusion.drill}:${confusion.expected}:${confusion.actual}`)}
            {@const heat = HEAT_BG[intensityStep(confusion.count, maxConfusion, 4)]}
            <li class="flex items-center justify-between rounded-md border px-3 py-2 {heat}">
              <span>{answerLabel(confusion.drill, confusion.expected)} → {answerLabel(confusion.drill, confusion.actual)}</span>
              <span class="font-semibold tabular-nums">{confusion.count}×</span>
            </li>
          {/each}
        </ul>
      </Card.Content>
    </Card.Root>
  {/if}
  <p class="text-xs text-muted-foreground">{summary.total} prompts · +{summary.xp} XP · Ear</p>
</section>
