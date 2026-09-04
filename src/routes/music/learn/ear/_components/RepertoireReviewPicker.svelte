<script lang="ts">
  import type {
    RepertoireEarTransfer,
    RepertoireReviewItem,
    RepertoireReviewPlan,
  } from "@repo/music-core/engines/ear-training";
  import { Button } from "@repo/ui/button";
  import * as Card from "@repo/ui/card";

  // The repertoire-transfer drill's ready-stage content: the ranked review
  // queue from saved songs and the sequenced review plan. Start on the stage
  // runs the plan; each phrase also has its own Practice button.
  let {
    ready,
    pending,
    reviewQueue,
    reviewPlan,
    onPlayRepertoireTransfer,
    onStartRepertoireTransfer,
    onStartRepertoireReviewPlan,
  }: {
    ready: boolean;
    pending: boolean;
    reviewQueue: RepertoireReviewItem[];
    reviewPlan?: RepertoireReviewPlan;
    onPlayRepertoireTransfer: (transfer: RepertoireEarTransfer) => void;
    onStartRepertoireTransfer: (transfer: RepertoireEarTransfer) => void;
    onStartRepertoireReviewPlan: () => void;
  } = $props();
</script>

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
{:else}
  <Card.Root>
    <Card.Header>
      <Card.Description>Repertoire transfer</Card.Description>
      <Card.Title>No saved songs yet</Card.Title>
      <Card.Description>
        Save a song in the Library and its melody phrases appear here as scale-degree prompts.
      </Card.Description>
    </Card.Header>
    <Card.Content>
      <Button href="/music/library?tab=songs" variant="outline">Open the Library</Button>
    </Card.Content>
  </Card.Root>
{/if}
