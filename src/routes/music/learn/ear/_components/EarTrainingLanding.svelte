<script lang="ts">
  import type {
    EarTrainingAnswerMode,
    EarTrainingDrill,
    EarTrainingFeedbackMode,
  } from "@repo/music-core/exercises/ear-training";
  import { Button } from "@repo/ui/button";
  import * as Card from "@repo/ui/card";

  let {
    ready,
    pending,
    answerMode,
    feedbackMode,
    midiEnabled,
    midiStatus,
    onAnswerMode,
    onFeedbackMode,
    onEnableMidi,
    onStart,
  }: {
    ready: boolean;
    pending: boolean;
    answerMode: EarTrainingAnswerMode;
    feedbackMode: EarTrainingFeedbackMode;
    midiEnabled: boolean;
    midiStatus: string;
    onAnswerMode: (mode: EarTrainingAnswerMode) => void;
    onFeedbackMode: (mode: EarTrainingFeedbackMode) => void;
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
        <div class="grid grid-cols-2 rounded-md border p-1" aria-label="Answer mode">
          {#each ["choice", "play-back"] as mode}
            <Button
              type="button"
              size="sm"
              variant={answerMode === mode ? "secondary" : "ghost"}
              aria-pressed={answerMode === mode}
              onclick={() => onAnswerMode(mode as EarTrainingAnswerMode)}
            >
              {mode === "choice" ? "Choice" : "Play-back"}
            </Button>
          {/each}
        </div>
      </div>
      <p class="text-sm text-muted-foreground sm:col-span-2" aria-live="polite">{midiStatus}</p>
    </Card.Content>
  </Card.Root>

  <Card.Root class="border-primary/40">
    <Card.Header>
      <Card.Description>Recommended</Card.Description>
      <Card.Title>Mixed Session</Card.Title>
      <Card.Description>
        Ten prompts across intervals, chord qualities, and functional scale degrees.
      </Card.Description>
    </Card.Header>
    <Card.Footer>
      <Button
        type="button"
        class="w-full sm:w-auto"
        disabled={!ready || pending}
        onclick={() => onStart("mixed")}
      >
        {pending ? "Starting session" : "Start Mixed Session"}
      </Button>
    </Card.Footer>
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
            disabled={!ready || pending}
            onclick={() => onStart(item.drill as EarTrainingDrill)}
          >
            Start {item.title}
          </Button>
        </Card.Footer>
      </Card.Root>
    {/each}
  </section>
</section>
