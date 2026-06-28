<script lang="ts">
  import type {
    EarTrainingAnswerMode,
    EarTrainingDrill,
    EarTrainingFeedbackMode,
  } from "@repo/music-core/exercises/ear-training";
  import {
    SCALE_DEGREE_SETS,
    type ScaleDegreeFreePlayChoice,
    type ScaleDegreeSetId,
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

  let {
    ready,
    pending,
    answerMode,
    feedbackMode,
    scaleDegreeSet,
    tonicName,
    droneOn,
    freePlayChoices,
    lastFreePlayDegree,
    reviewQueue,
    reviewPlan,
    midiEnabled,
    midiStatus,
    audioSupported,
    voiceStatus,
    onAnswerMode,
    onFeedbackMode,
    onScaleDegreeSet,
    onToggleDrone,
    onPlayFreePlayDegree,
    onPlayRepertoireTransfer,
    onStartRepertoireTransfer,
    onStartRepertoireReviewPlan,
    onEnableMidi,
    onStart,
  }: {
    ready: boolean;
    pending: boolean;
    answerMode: EarTrainingAnswerMode;
    feedbackMode: EarTrainingFeedbackMode;
    scaleDegreeSet: ScaleDegreeSetId;
    tonicName: string;
    droneOn: boolean;
    freePlayChoices: ScaleDegreeFreePlayChoice[];
    lastFreePlayDegree?: ScaleDegreeFreePlayChoice;
    reviewQueue: RepertoireReviewItem[];
    reviewPlan?: RepertoireReviewPlan;
    midiEnabled: boolean;
    midiStatus: string;
    audioSupported: boolean;
    voiceStatus: string;
    onAnswerMode: (mode: EarTrainingAnswerMode) => void;
    onFeedbackMode: (mode: EarTrainingFeedbackMode) => void;
    onScaleDegreeSet: (set: ScaleDegreeSetId) => void;
    onToggleDrone: () => void;
    onPlayFreePlayDegree: (choice: ScaleDegreeFreePlayChoice) => void;
    onPlayRepertoireTransfer: (transfer: RepertoireEarTransfer) => void;
    onStartRepertoireTransfer: (transfer: RepertoireEarTransfer) => void;
    onStartRepertoireReviewPlan: () => void;
    onEnableMidi: () => void;
    onStart: (drill: EarTrainingDrill | "mixed") => void;
  } = $props();
</script>

<section class="grid gap-6">
  <Card.Root>
    <Card.Header class="gap-4 md:flex-row md:items-start md:justify-between">
      <div class="space-y-1">
        <Card.Description>Session setup</Card.Description>
        <Card.Title>Choose how you want to answer</Card.Title>
      </div>
      <Button type="button" variant="outline" disabled={midiEnabled} onclick={onEnableMidi}>
        {midiEnabled ? "MIDI enabled" : "Enable MIDI"}
      </Button>
    </Card.Header>
    <Card.Content class="grid gap-5 sm:grid-cols-2">
      <div class="space-y-2">
        <p class="text-sm font-medium">Feedback</p>
        <div class="grid grid-cols-2 rounded-md border p-1" aria-label="Feedback mode">
          {#each ["practice", "test"] as mode}
            <Button
              type="button"
              size="sm"
              variant={feedbackMode === mode ? "secondary" : "ghost"}
              aria-pressed={feedbackMode === mode}
              onclick={() => onFeedbackMode(mode as EarTrainingFeedbackMode)}
            >
              {mode === "practice" ? "Practice" : "Test"}
            </Button>
          {/each}
        </div>
      </div>
      <div class="space-y-2">
        <p class="text-sm font-medium">Answer</p>
        <div class="grid grid-cols-4 rounded-md border p-1" aria-label="Answer mode">
          {#each ["choice", "play-back", "listen", "voice"] as mode}
            <Button
              type="button"
              size="sm"
              variant={answerMode === mode ? "secondary" : "ghost"}
              aria-pressed={answerMode === mode}
              disabled={mode === "voice" && !audioSupported}
              onclick={() => onAnswerMode(mode as EarTrainingAnswerMode)}
            >
              {mode === "choice"
                ? "Choice"
                : mode === "voice"
                  ? "Voice"
                  : mode === "listen"
                    ? "Pocket"
                    : "Play-back"}
            </Button>
          {/each}
        </div>
        <p class="text-xs text-muted-foreground">{voiceStatus}</p>
      </div>
      <div class="space-y-2 sm:col-span-2">
        <p class="text-sm font-medium">Scale-degree level</p>
        <div class="grid gap-2 md:grid-cols-6" aria-label="Scale-degree level">
          {#each SCALE_DEGREE_SETS as set (set.id)}
            <Button
              type="button"
              size="sm"
              variant={scaleDegreeSet === set.id ? "secondary" : "outline"}
              class="h-auto justify-start whitespace-normal px-3 py-2 text-left"
              aria-pressed={scaleDegreeSet === set.id}
              onclick={() => onScaleDegreeSet(set.id)}
            >
              <span class="grid gap-1">
                <span>{set.title}</span>
                <span class="text-xs font-normal text-muted-foreground">
                  {set.degrees.join(" · ")}
                </span>
              </span>
            </Button>
          {/each}
        </div>
        <p class="text-xs text-muted-foreground">
          Scale-degree sessions and mixed review only use the selected degree set.
        </p>
      </div>
      <p class="text-sm text-muted-foreground sm:col-span-2" aria-live="polite">{midiStatus}</p>
    </Card.Content>
  </Card.Root>

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
          Ranked by what's gone stale — new and weak phrases float to the top. Hear a real phrase,
          then map it back to scale-degree motion.
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

  <Card.Root class="border-primary/40">
    <Card.Header>
      <Card.Description>Recommended · Adaptive mix</Card.Description>
      <Card.Title>Mixed Session</Card.Title>
      <Card.Description>
        Ten prompts across intervals, chord qualities, and functional scale degrees,
        prioritizing weak and review skills while rotating drill types.
      </Card.Description>
    </Card.Header>
    <Card.Footer>
      <Button
        type="button"
        class="w-full sm:w-auto"
        disabled={!ready || pending || answerMode === "voice"}
        onclick={() => onStart("mixed")}
      >
        {pending ? "Starting session" : "Start Mixed Session"}
      </Button>
    </Card.Footer>
  </Card.Root>

  <Card.Root>
    <Card.Header>
      <Card.Description>Learning path</Card.Description>
      <Card.Title>Tonic first, labels second</Card.Title>
      <Card.Description>
        The path now treats scale-degree function as the spine: establish home, recognize
        degrees, produce them, then use intervals and chord qualities as vocabulary.
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

  <section class="grid gap-4 md:grid-cols-3" aria-label="Focused ear training">
    {#each [
      {
        drill: "interval",
        title: "Interval",
        description: "Ascending, descending, and harmonic intervals.",
      },
      {
        drill: "chord-quality",
        title: "Chord Quality",
        description: "Triads and seventh-chord qualities.",
      },
      {
        drill: "scale-degree",
        title: "Scale Degree",
        description: "Functional degrees in major and minor contexts.",
      },
      {
        drill: "melody-dictation",
        title: "Melody Dictation",
        description: "Hear a short degree phrase, then play it back in order.",
      },
    ] as item}
      <Card.Root>
        <Card.Header>
          <Card.Title>{item.title}</Card.Title>
          <Card.Description>{item.description}</Card.Description>
        </Card.Header>
        <Card.Footer>
          <Button
            type="button"
            variant="outline"
            class="w-full"
            disabled={!ready ||
              pending ||
              (answerMode === "voice" && item.drill !== "scale-degree") ||
              ((answerMode === "choice" || answerMode === "listen") &&
                item.drill === "melody-dictation")}
            onclick={() => onStart(item.drill as EarTrainingDrill)}
          >
            Start {item.title}
          </Button>
        </Card.Footer>
      </Card.Root>
    {/each}
  </section>
</section>
