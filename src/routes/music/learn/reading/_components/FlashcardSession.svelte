<script lang="ts">
  import type { NoteEvent } from "@repo/music-core/domain";
  import type { InputRouter } from "@repo/music-core/engines/input-router";
  import { notationView } from "@repo/music-core/engines/notation";
  import type { ReadingSessionState } from "@repo/music-core/engines/reading-session";
  import type { TuningProfile } from "@repo/music-core/engines/tunings";
  import type { NoteReadingPrompt, ReadingAnswerMode } from "@repo/music-core/exercises/note-reading";
  import { Button } from "@repo/ui/button";
  import * as Card from "@repo/ui/card";

  import HudTile from "../../../_components/HudTile.svelte";
  import SegmentProgress from "../../../_components/SegmentProgress.svelte";
  import FretboardInput from "./FretboardInput.svelte";
  import PianoSurface, { type PianoHighlight } from "../../../_components/piano/PianoSurface.svelte";
  import StaffNotation from "../../../_components/StaffNotation.svelte";

  let {
    state,
    answerMode,
    tuning,
    router,
    sessionXp,
    onChoice,
    onAccepted,
  }: {
    state: ReadingSessionState;
    answerMode: ReadingAnswerMode;
    tuning?: TuningProfile;
    router: InputRouter;
    sessionXp: number;
    onChoice: (choice: string) => void;
    onAccepted: (event: NoteEvent) => void;
  } = $props();

  const prompt = $derived(state.currentPrompt as NoteReadingPrompt | undefined);
  const view = $derived(prompt ? notationView(prompt.score) : undefined);
  const pianoHighlights = $derived.by(() => {
    const highlights: Record<number, PianoHighlight> = {};
    for (const midiNote of prompt?.midiNotes ?? []) highlights[midiNote] = { role: "target" };
    return highlights;
  });
</script>

<div class="grid min-w-0 gap-4">
    <Card.Root class="min-w-0">
      <Card.Header>
        <div class="space-y-1">
          <Card.Description>{prompt?.keySignature ?? "Reading flashcard"}</Card.Description>
          <Card.Title>Read, then {answerMode === "choice" ? "name" : "play"} the notes</Card.Title>
        </div>
      </Card.Header>
      <Card.Content class="grid min-w-0 gap-6">
        {#if view}
          <StaffNotation {view} />
        {/if}

        {#if prompt && answerMode === "choice"}
          <div
            class="grid grid-cols-3 gap-2 sm:grid-cols-4 lg:grid-cols-6"
            aria-label="Answer choices"
          >
            {#each prompt.choices as choice (choice)}
              <Button type="button" variant="outline" class="min-h-11" onclick={() => onChoice(choice)}>
                {choice}
              </Button>
            {/each}
          </div>
        {:else if prompt?.instrument === "piano"}
          <PianoSurface
            label="Piano input"
            notes={prompt.midiNotes}
            highlights={pianoHighlights}
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
  <div class="grid items-center gap-3 sm:grid-cols-[minmax(0,1fr)_auto]">
    <SegmentProgress current={state.currentIndex + 1} total={state.total} label="Set" />
    <HudTile size="sm" label="Session XP" value={sessionXp} />
  </div>
</div>
