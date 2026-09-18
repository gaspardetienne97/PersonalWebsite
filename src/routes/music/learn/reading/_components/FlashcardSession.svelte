<script lang="ts">
  import type { NoteEvent } from "@repo/music-core/domain";
  import type { InputRouter } from "@repo/music-core/engines/input-router";
  import { midiToNote } from "@repo/music-core/engines/theory";
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
    state: sessionState,
    answerMode,
    tuning,
    router,
    sessionXp,
    onChoice,
    onAccepted,
    onContinue,
    onHint,
    range,
  }: {
    state: ReadingSessionState;
    answerMode: ReadingAnswerMode;
    tuning?: TuningProfile;
    router: InputRouter;
    sessionXp: number;
    onChoice: (choice: string) => void;
    onAccepted: (event: NoteEvent) => void;
    onContinue: () => void;
    onHint: () => void;
    range: { lowestMidi: number; highestMidi: number };
  } = $props();

  const prompt = $derived(sessionState.currentPrompt as NoteReadingPrompt | undefined);
  const feedback = $derived(sessionState.feedback);
  const awaitingContinue = $derived(sessionState.awaitingContinue === true);
  const view = $derived(prompt ? notationView(prompt.score) : undefined);
  const hintRevealed = $derived(
    prompt !== undefined && (sessionState.hintUsed || awaitingContinue),
  );
  const pianoHighlights = $derived.by(() => {
    const highlights: Record<number, PianoHighlight> = {};
    if (hintRevealed) {
      for (const midiNote of prompt?.midiNotes ?? []) highlights[midiNote] = { role: "target" };
    }
    return highlights;
  });

  const expectedChoice = $derived(
    typeof feedback?.result.target?.choice === "string" ? feedback.result.target.choice : undefined,
  );

  const chosenChoice = $derived(
    typeof feedback?.result.answer === "string" ? feedback.result.answer : undefined,
  );
  const playedNotes = $derived(
    Array.isArray(feedback?.result.answer)
      ? feedback.result.answer.filter((note): note is number => typeof note === "number").map((note) => midiToNote(note)).join(" ")
      : undefined,
  );
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
              <Button type="button" variant="outline" class="min-h-11" disabled={awaitingContinue} onclick={() => onChoice(choice)}>
                {choice}
              </Button>
            {/each}
          </div>
        {:else if prompt?.instrument === "piano"}
          <div inert={awaitingContinue || undefined}>
            <PianoSurface
              label="Piano input"
              lowMidi={range.lowestMidi}
              highMidi={range.highestMidi}
              highlights={pianoHighlights}
              {router}
              {onAccepted}
            />
          </div>
        {:else if prompt && tuning}
          <div inert={awaitingContinue || undefined}>
            <FretboardInput
              {tuning}
              targetMidiNotes={hintRevealed ? prompt.midiNotes : []}
              {router}
              visibleFrets={tuning.fretCount}
              {onAccepted}
            />
          </div>
        {/if}

        {#if prompt && answerMode === "play" && !hintRevealed}
          <Button type="button" variant="outline" onclick={onHint}>
            Help
          </Button>
        {/if}
        {#if sessionState.hintUsed}<p class="text-xs text-muted-foreground">Hint used for this answer.</p>{/if}

        {#if awaitingContinue && feedback}
          <div class="grid gap-3 rounded-md border border-warn/40 bg-warn/10 p-4">
            <p class="font-semibold">Expected {answerMode === "choice" ? expectedChoice : feedback.result.target?.label}</p>
            {#if chosenChoice}
              <p class="text-sm text-muted-foreground">You chose {chosenChoice}</p>
            {:else if playedNotes}
              <p class="text-sm text-muted-foreground">You played {playedNotes}</p>
            {/if}
            <Button type="button" onclick={onContinue}>Continue</Button>
          </div>
        {/if}

        {#if sessionState.error}
          <p class="rounded-md border border-destructive px-4 py-3 text-sm text-destructive">
            {sessionState.error}
          </p>
        {/if}
      </Card.Content>
    </Card.Root>
  <div class="grid items-center gap-3 sm:grid-cols-[minmax(0,1fr)_auto]">
    <SegmentProgress current={sessionState.currentIndex + 1} total={sessionState.total} label="Set" />
    <HudTile size="sm" label="Session XP" value={sessionXp} />
  </div>
</div>
