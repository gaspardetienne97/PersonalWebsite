<script lang="ts">
  import type { NoteEvent } from "@repo/music-core/domain";
  import type { EarTrainingSessionState } from "@repo/music-core/engines/ear-training";
  import type { InputRouter } from "@repo/music-core/engines/input-router";
  import { Button } from "@repo/ui/button";
  import * as Card from "@repo/ui/card";

  import OnScreenKeyboard from "../../../_components/OnScreenKeyboard.svelte";

  const CHROMATIC_NOTES = [
    "C4",
    "C#4",
    "D4",
    "D#4",
    "E4",
    "F4",
    "F#4",
    "G4",
    "G#4",
    "A4",
    "A#4",
    "B4",
    "C5",
  ];

  let {
    state,
    router,
    onReplay,
    onAnswer,
    onAccepted,
    onAbandon,
  }: {
    state: EarTrainingSessionState;
    router: InputRouter;
    onReplay: () => void;
    onAnswer: (token: string) => void;
    onAccepted: (event: NoteEvent) => void;
    onAbandon: () => void;
  } = $props();

  const prompt = $derived(state.currentPrompt);
  const drillLabel = $derived(
    prompt?.drill === "chord-quality"
      ? "Chord Quality"
      : prompt?.drill === "scale-degree"
        ? "Scale Degree"
        : "Interval",
  );
</script>

<Card.Root>
  <Card.Header class="gap-4 md:flex-row md:items-start md:justify-between">
    <div class="space-y-1">
      <Card.Description>{drillLabel}</Card.Description>
      <Card.Title>Listen, then answer</Card.Title>
      <Card.Description>
        {state.options.answerMode === "choice"
          ? "Choose the sound you heard."
          : "Play the answer on MIDI or the on-screen keyboard."}
      </Card.Description>
    </div>
    <div class="flex gap-2">
      <Button type="button" variant="outline" onclick={onReplay}>Replay</Button>
      <Button type="button" variant="ghost" onclick={onAbandon}>End session</Button>
    </div>
  </Card.Header>
  <Card.Content class="grid min-h-72 content-center gap-6">
    {#if prompt && state.options.answerMode === "choice"}
      <div class="grid gap-3 sm:grid-cols-2" aria-label="Answer choices">
        {#each prompt.choices as choice}
          <Button type="button" variant="outline" class="h-auto min-h-12" onclick={() => onAnswer(choice.token)}>
            {choice.label}
          </Button>
        {/each}
      </div>
    {:else if prompt}
      <OnScreenKeyboard {router} notes={CHROMATIC_NOTES} onAccepted={onAccepted} />
    {/if}

    {#if state.options.feedbackMode === "practice" && state.feedback[0]}
      <div
        data-testid="feedback"
        class="rounded-md border bg-muted px-4 py-3 text-sm"
        aria-live="polite"
      >
        {state.feedback[0].message}
      </div>
    {/if}
  </Card.Content>
</Card.Root>
