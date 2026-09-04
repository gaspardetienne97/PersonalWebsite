<script lang="ts">
  import type { EarTrainingDrill } from "@repo/music-core/exercises/ear-training";
  import type {
    ScaleDegreeFreePlayChoice,
    ScaleDegreeSetId,
  } from "@repo/music-core/exercises/scale-degree-recognition";
  import {
    EAR_TRAINING_LEARNING_PATH,
    type RepertoireEarTransfer,
    type RepertoireReviewItem,
    type RepertoireReviewPlan,
  } from "@repo/music-core/engines/ear-training";
  import { Button } from "@repo/ui/button";
  import * as Card from "@repo/ui/card";

  import EarTrainingFreePlay from "./EarTrainingFreePlay.svelte";

  // Warmup, repertoire review and the learning path: content under the ready
  // stage. Session controls live in EarTrainingSetup; Start on the route's stage.
  let {
    ready,
    pending,
    scaleDegreeSet,
    tonicName,
    droneOn,
    freePlayChoices,
    lastFreePlayDegree,
    reviewQueue,
    reviewPlan,
    onToggleDrone,
    onPlayFreePlayDegree,
    onPlayRepertoireTransfer,
    onStartRepertoireTransfer,
    onStartRepertoireReviewPlan,
    onStart,
  }: {
    ready: boolean;
    pending: boolean;
    scaleDegreeSet: ScaleDegreeSetId;
    tonicName: string;
    droneOn: boolean;
    freePlayChoices: ScaleDegreeFreePlayChoice[];
    lastFreePlayDegree?: ScaleDegreeFreePlayChoice;
    reviewQueue: RepertoireReviewItem[];
    reviewPlan?: RepertoireReviewPlan;
    onToggleDrone: () => void;
    onPlayFreePlayDegree: (choice: ScaleDegreeFreePlayChoice) => void;
    onPlayRepertoireTransfer: (transfer: RepertoireEarTransfer) => void;
    onStartRepertoireTransfer: (transfer: RepertoireEarTransfer) => void;
    onStartRepertoireReviewPlan: () => void;
    onStart: (drill: EarTrainingDrill | "mixed") => void;
  } = $props();
</script>

<section class="grid gap-6">
  <EarTrainingFreePlay
    {tonicName}
    {droneOn}
    {scaleDegreeSet}
    choices={freePlayChoices}
    lastDegree={lastFreePlayDegree}
    disabled={!ready || pending}
    onToggleDrone={onToggleDrone}
    onPlayDegree={onPlayFreePlayDegree}
  />

  {#if reviewQueue.length}
    <Card.Root>
      <Card.Header>
        <Card.Description>Repertoire transfer</Card.Description>
        <Card.Title>Review phrases from your saved songs</Card.Title>
        <Card.Description>
          Ranked by what has gone stale: new and weak phrases float to the top. Hear a real
          phrase, then map it back to scale-degree motion.
        </Card.Description>
      </Card.Header>
      <Card.Content class="grid gap-3">
        {#if reviewPlan?.sections.length}
          <section class="grid gap-2 rounded-md border bg-muted/30 p-3">
            <div>
              <p class="text-sm font-semibold">Repertoire review plan</p>
              <p class="text-xs text-muted-foreground">
                {reviewPlan.totalItems} phrase{reviewPlan.totalItems === 1 ? "" : "s"} sequenced
                from warmup to stretch.
              </p>
            </div>
            <Button
              type="button"
              variant="outline"
              class="w-full sm:w-auto"
              disabled={!ready || pending || reviewPlan.totalItems === 0}
              onclick={onStartRepertoireReviewPlan}
            >
              Practice review plan
            </Button>
            <div class="grid gap-2 md:grid-cols-4">
              {#each reviewPlan.sections as section (section.id)}
                <div class="rounded-md border bg-background p-2">
                  <p class="text-xs font-semibold">{section.title}</p>
                  <p class="text-[11px] text-muted-foreground">{section.items.length} phrase{section.items.length === 1 ? "" : "s"}</p>
                </div>
              {/each}
            </div>
          </section>
        {/if}
        {#each reviewQueue as item (item.transfer.id)}
          {@const transfer = item.transfer}
          <div class="flex flex-wrap items-center justify-between gap-3 rounded-md border p-3">
            <div class="min-w-0 space-y-0.5">
              <p class="flex flex-wrap items-center gap-2 text-sm font-medium">
                <span class="truncate">{transfer.title}</span>
                <span
                  class="rounded-full border px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-muted-foreground"
                >
                  {item.status === "new"
                    ? "New"
                    : item.status === "due"
                      ? "Review due"
                      : "Strong"}
                </span>
              </p>
              <p class="text-xs text-muted-foreground">
                {transfer.answerLabel}
                {transfer.unsupportedDegrees.length
                  ? ` · outside current level: ${transfer.unsupportedDegrees.join(", ")}`
                  : ""}
              </p>
            </div>
            <div class="flex flex-wrap gap-2">
              <Button type="button" variant="outline" onclick={() => onPlayRepertoireTransfer(transfer)}>
                Preview transfer
              </Button>
              <Button
                type="button"
                disabled={!ready || pending}
                onclick={() => onStartRepertoireTransfer(transfer)}
              >
                Practice transfer
              </Button>
            </div>
          </div>
        {/each}
      </Card.Content>
    </Card.Root>
  {/if}

  <Card.Root>
    <Card.Header>
      <Card.Description>Learning path</Card.Description>
      <Card.Title class="text-base">Tonic first, labels second</Card.Title>
      <Card.Description>
        Establish home, recognize degrees, produce them, then add intervals and chord qualities
        as vocabulary.
      </Card.Description>
    </Card.Header>
    <Card.Content class="grid gap-3">
      {#each EAR_TRAINING_LEARNING_PATH.slice(0, 4) as stage (stage.id)}
        <div class="grid gap-2 rounded-md border p-3 sm:grid-cols-[2.5rem_minmax(0,1fr)_auto] sm:items-center">
          <div class="text-sm font-semibold text-muted-foreground">{stage.order}</div>
          <div class="space-y-1">
            <p class="font-medium">{stage.title}</p>
            <p class="text-sm text-muted-foreground">{stage.goal}</p>
          </div>
          {#if stage.recommendedDrill}
            <Button
              type="button"
              size="sm"
              variant={stage.currentSupport === "planned" ? "ghost" : "outline"}
              disabled={!ready || pending || stage.currentSupport === "planned"}
              onclick={() => onStart(stage.recommendedDrill)}
            >
              {stage.currentSupport === "planned" ? "Planned" : "Practice"}
            </Button>
          {/if}
        </div>
      {/each}
    </Card.Content>
  </Card.Root>

</section>
