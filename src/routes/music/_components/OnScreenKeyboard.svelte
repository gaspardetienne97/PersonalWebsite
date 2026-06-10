<script lang="ts">
  import { monotonicMs, type InstrumentId, type NoteEvent } from "@repo/music-core/domain";
  import type { InputRouter } from "@repo/music-core/engines/input-router";
  import { noteToMidi } from "@repo/music-core/engines/theory";
  import { Button } from "@repo/ui/button";

  const DEFAULT_NOTES = ["C4", "D4", "E4", "F4", "G4", "A4", "B4", "C5"];

  let {
    router,
    instrument = "piano",
    notes = DEFAULT_NOTES,
    onAccepted,
  }: {
    router: InputRouter;
    instrument?: InstrumentId;
    notes?: string[];
    onAccepted?: (event: NoteEvent) => void;
  } = $props();

  function play(note: string): void {
    const event: NoteEvent = {
      type: "noteOn",
      midiNote: noteToMidi(note),
      velocity: 1,
      source: "onscreen",
      timestamp: monotonicMs(performance.now()),
      clock: "performance",
      instrument,
    };

    if (router.push(event)) onAccepted?.(event);
  }
</script>

<div class="flex flex-wrap gap-2" role="group" aria-label="On-screen keyboard">
  {#each notes as note (note)}
    <Button type="button" variant="outline" onclick={() => play(note)}>
      {note}
    </Button>
  {/each}
</div>
