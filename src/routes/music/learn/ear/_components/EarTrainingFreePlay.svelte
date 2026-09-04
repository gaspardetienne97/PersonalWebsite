<script lang="ts">
  import type {
    ScaleDegreeFreePlayChoice,
    ScaleDegreeSetId,
  } from "@repo/music-core/exercises/scale-degree-recognition";
  import { SCALE_DEGREE_SETS } from "@repo/music-core/exercises/scale-degree-recognition";
  import { Button } from "@repo/ui/button";
  import * as Card from "@repo/ui/card";

  let {
    tonicName,
    droneOn,
    scaleDegreeSet,
    choices,
    lastDegree,
    disabled = false,
    onToggleDrone,
    onPlayDegree,
  }: {
    tonicName: string;
    droneOn: boolean;
    scaleDegreeSet: ScaleDegreeSetId;
    choices: ScaleDegreeFreePlayChoice[];
    lastDegree?: ScaleDegreeFreePlayChoice;
    disabled?: boolean;
    onToggleDrone: () => void;
    onPlayDegree: (choice: ScaleDegreeFreePlayChoice) => void;
  } = $props();

  const activeSet = $derived(SCALE_DEGREE_SETS.find((set) => set.id === scaleDegreeSet));
</script>

<Card.Root>
  <Card.Header class="gap-4 md:flex-row md:items-start md:justify-between">
    <div class="space-y-1">
      <Card.Description>Free-play warmup</Card.Description>
      <Card.Title>Explore degrees over the tonic</Card.Title>
      <Card.Description>
        Unscored listening: hold {tonicName} as home, then compare each degree before a
        graded session.
      </Card.Description>
    </div>
    <Button type="button" variant={droneOn ? "secondary" : "outline"} {disabled} onclick={onToggleDrone}>
      {droneOn ? "Stop drone" : "Start drone"}
    </Button>
  </Card.Header>
  <Card.Content class="grid gap-4">
    <div class="grid gap-1 rounded-md border bg-muted/30 p-3 text-sm">
      <span class="font-medium">{tonicName} tonic · {activeSet?.title ?? "Current set"}</span>
      <span class="text-muted-foreground">
        {activeSet?.summary ?? "Listen without scoring, XP, or mastery changes."}
      </span>
    </div>

    <div class="grid grid-cols-2 gap-2 sm:grid-cols-5" aria-label="Free-play scale degrees">
      {#each choices as choice (choice.token)}
        <Button
          type="button"
          variant={lastDegree?.token === choice.token ? "secondary" : "outline"}
          class="h-auto justify-start px-3 py-3 text-left"
          {disabled}
          onclick={() => onPlayDegree(choice)}
        >
          <span class="grid gap-1">
            <span>{choice.label}</span>
            <span class="text-xs font-normal text-muted-foreground">
              {choice.semitones === 0 ? "home" : `${choice.semitones} semitones from home`}
            </span>
          </span>
        </Button>
      {/each}
    </div>

    {#if lastDegree}
      <p class="text-sm text-muted-foreground">
        Last explored: {lastDegree.label}.
      </p>
    {/if}
  </Card.Content>
</Card.Root>
