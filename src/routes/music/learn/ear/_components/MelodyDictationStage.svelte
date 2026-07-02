<script lang="ts">
  import type { InstrumentId, NoteEvent } from "@repo/music-core/domain";
  import type { InputSurfaceId } from "@repo/music-core/engines/device-profiles";
  import type { InputRouter } from "@repo/music-core/engines/input-router";
  import { midiToNote } from "@repo/music-core/engines/theory";
  import type { EarTrainingPromptBase } from "@repo/music-core/exercises/ear-training";

  import { Button } from "@repo/ui/button";

  import InputSurface from "../../../_components/InputSurface.svelte";

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

  type MelodySlotPrompt = EarTrainingPromptBase & {
    targetMidiNotes: number[];
    degrees?: string[];
    tonicMidi?: number;
    sourceTitle?: string;
  };

  let {
    prompt,
    router,
    instrument = "piano",
    surface = "keyboard",
    onReplay,
    onPlayTonic,
    onAccepted,
  }: {
    prompt: MelodySlotPrompt;
    router: InputRouter;
    instrument?: InstrumentId;
    surface?: InputSurfaceId;
    onReplay: () => void;
    onPlayTonic?: (midiNote: number) => void;
    onAccepted: (event: NoteEvent) => void;
  } = $props();

  let playedNotes = $state<number[]>([]);

  const slotCount = $derived(prompt.targetMidiNotes.length || prompt.requiredPlayedNotes);
  const slots = $derived(
    Array.from({ length: slotCount }, (_, index) => ({
      index,
      playedMidi: playedNotes[index],
    })),
  );
  const sourceLabel = $derived(
    prompt.drill === "repertoire-transfer" && prompt.sourceTitle
      ? `From ${prompt.sourceTitle}`
      : "Listen first, then rebuild the phrase.",
  );

  function handleAccepted(event: NoteEvent): void {
    if (event.type === "noteOn") {
      playedNotes = [...playedNotes, event.midiNote].slice(0, slotCount);
    }
    onAccepted(event);
  }
</script>

<div class="grid gap-4 rounded-2xl border bg-card p-5" data-testid="melody-slot-stage">
  <div class="flex flex-wrap items-start justify-between gap-3">
    <div class="min-w-0">
      <p class="text-sm font-semibold">Phrase memory</p>
      <p class="text-sm text-muted-foreground">
        {slotCount} notes · {sourceLabel}
      </p>
    </div>
    <div class="flex flex-wrap gap-2">
      {#if prompt.tonicMidi !== undefined}
        <Button type="button" variant="outline" onclick={() => onPlayTonic?.(prompt.tonicMidi!)}>
          Hear tonic again
        </Button>
      {/if}
      <Button type="button" variant="ghost" onclick={onReplay}>Replay phrase</Button>
    </div>
  </div>

  <div class="grid grid-cols-3 gap-2 sm:grid-cols-4" aria-label="Melody phrase slots">
    {#each slots as slot (slot.index)}
      <div
        class="grid min-h-16 place-items-center rounded-md border bg-background px-3 py-2 text-center"
        data-testid="melody-slot"
        data-state={slot.playedMidi === undefined ? "empty" : "filled"}
      >
        {#if slot.playedMidi === undefined}
          <span class="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Note {slot.index + 1}
          </span>
        {:else}
          <span class="text-lg font-bold tabular-nums">{midiToNote(slot.playedMidi)}</span>
        {/if}
      </div>
    {/each}
  </div>

  <InputSurface {router} {surface} {instrument} notes={CHROMATIC_NOTES} onAccepted={handleAccepted} />
</div>
