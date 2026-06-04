<script lang="ts">
  import type { NoteEvent } from "@repo/music-core/domain";
  import type { InputRouter } from "@repo/music-core/engines/input-router";
  import { notationView } from "@repo/music-core/engines/notation";
  import type { ReadingSessionState } from "@repo/music-core/engines/reading-session";
  import type { TuningProfile } from "@repo/music-core/engines/tunings";
  import type { NoteReadingPrompt, ReadingAnswerMode } from "@repo/music-core/exercises/note-reading";
  import { Button } from "@repo/ui/button";
  import * as Card from "@repo/ui/card";
  import { Progress } from "@repo/ui/progress";

  import FretboardInput from "./FretboardInput.svelte";
  import PianoInput from "./PianoInput.svelte";
  import StaffNotation from "./StaffNotation.svelte";

  let {
    state,
    answerMode,
    tuning,
    router,
    sessionXp,
    onChoice,
    onAccepted,
    onAbandon,
  }: {
    state: ReadingSessionState;
    answerMode: ReadingAnswerMode;
    tuning?: TuningProfile;
    router: InputRouter;
    sessionXp: number;
    onChoice: (choice: string) => void;
    onAccepted: (event: NoteEvent) => void;
    onAbandon: () => void;
  } = $props();

  const prompt = $derived(state.currentPrompt as NoteReadingPrompt | undefined);
  const view = $derived(prompt ? notationView(prompt.score) : undefined);
  const pianoNotes = $derived(
    prompt
      ? Array.from(
          {
            length:
              Math.min(96, Math.max(...prompt.midiNotes) + 12) -
              Math.max(24, Math.min(...prompt.midiNotes) - 12) +
              1,
          },
          (_, index) => Math.max(24, Math.min(...prompt.midiNotes) - 12) + index,
        )
      : [],
  );
</script>

<section class="grid min-w-0 gap-6 lg:grid-cols-[minmax(0,1fr)_16rem]">
  <Card.Root class="min-w-0">
    <Card.Header class="gap-4 md:flex-row md:items-start md:justify-between">
      <div class="space-y-1">
        <Card.Description>{prompt?.keySignature ?? "Reading flashcard"}</Card.Description>
        <Card.Title>Read, then {answerMode === "choice" ? "name" : "play"} the notes</Card.Title>
      </div>
      <Button type="button" variant="ghost" onclick={onAbandon}>End session</Button>
    </Card.Header>
    <Card.Content class="grid min-w-0 gap-6">
      {#if view}
        <StaffNotation {view} />
      {/if}

      {#if prompt && answerMode === "choice"}
        <div class="grid grid-cols-3 gap-2 sm:grid-cols-4 lg:grid-cols-6" aria-label="Answer choices">
          {#each prompt.choices as choice}
            <Button
              type="button"
              variant="outline"
              class="min-h-11"
              onclick={() => onChoice(choice)}
            >
              {choice}
            </Button>
          {/each}
        </div>
      {:else if prompt?.instrument === "piano"}
        <PianoInput
          midiNotes={pianoNotes}
          targetMidiNotes={prompt.midiNotes}
          {router}
          {onAccepted}
        />
      {:else if prompt && tuning}
        <FretboardInput
          {tuning}
          targetMidiNotes={prompt.midiNotes}
          {router}
          visibleFrets={tuning.fretCount}
          {onAccepted}
        />
      {/if}

      {#if state.error}
        <p class="rounded-md border border-destructive px-4 py-3 text-sm text-destructive">
          {state.error}
        </p>
      {/if}
    </Card.Content>
  </Card.Root>

  <aside class="grid content-start gap-4">
    <Card.Root>
      <Card.Header>
        <Card.Description>Progress</Card.Description>
        <Card.Title>{state.currentIndex + 1} / {state.total}</Card.Title>
      </Card.Header>
      <Card.Content>
        <Progress value={state.currentIndex} max={state.total} />
      </Card.Content>
    </Card.Root>
    <Card.Root>
      <Card.Header>
        <Card.Description>Session XP</Card.Description>
        <Card.Title>{sessionXp}</Card.Title>
      </Card.Header>
    </Card.Root>
  </aside>
</section>
